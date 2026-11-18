const express = require('express');
const { db } = require('../db');
const { getScopedLocations, requireAuth } = require('../auth');
const { computePeriod, summarize, monthBounds } = require('../services/metrics');
const { getYesterdayISO, shiftDateISO, DEFAULT_THRESHOLD_PCT } = require('../utils/calculations');

const router = express.Router();
router.use(requireAuth);

const BLOCK_ORDER = ['FS1', 'FS2', 'FS3', 'FS4', 'FS5', 'Chi nhánh HCM', 'PRODUCT PLANNING'];
function sortBlocks(blocks) {
  return [...blocks].sort((a, b) => {
    const ia = BLOCK_ORDER.indexOf(a);
    const ib = BLOCK_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

function getDefaultReportDate() {
  const yesterday = getYesterdayISO();
  const row = db.prepare('SELECT MAX(date) AS d FROM daily_meals WHERE date <= ?').get(yesterday);
  return (row && row.d) || yesterday;
}

router.get('/', (req, res) => {
  const mode = ['day', 'range', 'month'].includes(req.query.mode) ? req.query.mode : 'day';
  const yesterday = getDefaultReportDate();
  const date = req.query.date || yesterday;
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : date.slice(0, 7);
  const block = req.query.block || 'ALL';

  let kpiStart = date;
  let kpiEnd = date;
  let trendStart = shiftDateISO(date, -6);
  let trendEnd = date;

  if (mode === 'range') {
    kpiStart = req.query.startDate || shiftDateISO(yesterday, -6);
    kpiEnd = req.query.endDate || yesterday;
    if (kpiStart > kpiEnd) [kpiStart, kpiEnd] = [kpiEnd, kpiStart];
    trendStart = kpiStart;
    trendEnd = kpiEnd;
  } else if (mode === 'month') {
    const b = monthBounds(month);
    kpiStart = b.first;
    kpiEnd = b.last;
    trendStart = b.first;
    trendEnd = b.last;
  }

  const blocks = [...new Set(getScopedLocations(req.user).map((l) => l.operating_block))];
  const locations = getScopedLocations(req.user, block);

  const kpi = computePeriod(locations, kpiStart, kpiEnd);
  const trend =
    trendStart === kpiStart && trendEnd === kpiEnd ? kpi : computePeriod(locations, trendStart, trendEnd);

  // Month-to-date vs full-month plan, based on month of kpiEnd
  const mb = monthBounds(kpiEnd.slice(0, 7));
  const monthData = mode === 'month' ? kpi : computePeriod(locations, mb.first, mb.last);
  const monthMap = new Map(monthData.items.map((i) => [i.code_number, i]));

  const items = kpi.items
    .map((i) => {
      const m = monthMap.get(i.code_number);
      return {
        ...i,
        mtdActualMeals: m ? m.actualMeals : 0,
        monthPlanMeals: m ? m.planMealsFull : 0,
        mtdActualRevenue: m ? m.actualRevenue : 0,
        monthPlanRevenue: m ? m.planRevenueFull : 0,
      };
    })
    .sort((a, b) => (a.isAlert !== b.isAlert ? (a.isAlert ? -1 : 1) : a.variancePct - b.variancePct));

  const blockMap = new Map();
  for (const i of items) {
    if (!blockMap.has(i.operating_block)) {
      blockMap.set(i.operating_block, {
        operating_block: i.operating_block,
        location_count: 0,
        alert_count: 0,
        planned_meals: 0,
        actual_meals: 0,
        ly_meals: 0,
        planned_revenue: 0,
        actual_revenue: 0,
        revenue_impact: 0,
        profit_impact: 0,
      });
    }
    const b = blockMap.get(i.operating_block);
    b.location_count++;
    if (i.isAlert) b.alert_count++;
    if (i.has_data) {
      b.planned_meals += i.planMeals;
      b.actual_meals += i.actualMeals;
      b.ly_meals += i.lyMeals;
      b.planned_revenue += i.planRevenue;
      b.actual_revenue += i.actualRevenue;
      b.revenue_impact += i.revenueImpact;
      b.profit_impact += i.profitImpact;
    }
  }

  res.json({
    mode,
    date,
    kpiStart,
    kpiEnd,
    trendStart,
    trendEnd,
    defaultDate: yesterday,
    thresholdPct: DEFAULT_THRESHOLD_PCT,
    blocks,
    summary: summarize(kpi.items),
    weeklyTrend: trend.totalSeries,
    blockTrends: trend.blockSeries,
    blockBreakdown: [...blockMap.values()],
    locations: items,
  });
});

/**
 * Dashboard 1: Executive Korean-Vietnamese Meal Status Report
 * [TÌNH HÌNH SUẤT ĂN NGÀY D THÁNG M (DayOfWeek)]
 */
router.get('/exec-report', (req, res) => {
  const date = req.query.date || getDefaultReportDate();
  const blockFilter = req.query.block || 'ALL';
  const allScoped = getScopedLocations(req.user);
  const blocks = sortBlocks([...new Set(allScoped.map((l) => l.operating_block))]);
  const locations = getScopedLocations(req.user, blockFilter);

  const month = date.slice(0, 7);
  const { first: firstOfMonth, last: lastOfMonth } = monthBounds(month);
  const lastDayNum = Number(lastOfMonth.slice(8, 10));
  const mNum = Number(month.slice(5, 7));

  const dayData = computePeriod(locations, date, date);
  const mtdData = computePeriod(locations, firstOfMonth, date);
  const mtdMap = new Map(mtdData.items.map((i) => [i.code_number, i]));

  // Build per-kitchen rows & aggregate per block
  const blockAggMap = new Map();
  for (const bName of sortBlocks([...new Set(locations.map((l) => l.operating_block))])) {
    blockAggMap.set(bName, {
      operating_block: bName,
      dayActual: 0,
      dayPlan: 0,
      dayLy: 0,
      dayRevenue: 0,
      mtdActual: 0,
      mtdPlan: 0,
      mtdLy: 0,
      mtdRevenue: 0,
    });
  }

  const kitchenRows = dayData.items.map((dItem) => {
    const mItem = mtdMap.get(dItem.code_number) || {};
    const dayActual = dItem.actualMeals || 0;
    const dayPlan = dItem.planMealsFull || 0;
    const dayLy = dItem.lyMealsFull || 0;
    const dayRev = dItem.actualRevenue || 0;

    const mtdActual = mItem.actualMeals || 0;
    const mtdPlan = mItem.planMealsFull || 0;
    const mtdLy = mItem.lyMealsFull || 0;
    const mtdRev = mItem.actualRevenue || 0;

    const bAgg = blockAggMap.get(dItem.operating_block);
    if (bAgg) {
      bAgg.dayActual += dayActual;
      bAgg.dayPlan += dayPlan;
      bAgg.dayLy += dayLy;
      bAgg.dayRevenue += dayRev;
      bAgg.mtdActual += mtdActual;
      bAgg.mtdPlan += mtdPlan;
      bAgg.mtdLy += mtdLy;
      bAgg.mtdRevenue += mtdRev;
    }

    return {
      code_number: dItem.code_number,
      location_name: dItem.location_name,
      operating_block: dItem.operating_block,
      dayActual,
      dayPlan,
      dayDiffPlan: dayActual - dayPlan,
      dayLy,
      dayDiffLy: dayActual - dayLy,
      mtdActual,
      mtdPlan,
      mtdDiffPlan: mtdActual - mtdPlan,
      mtdLy,
      mtdDiffLy: mtdActual - mtdLy,
    };
  });

  const blockRows = [...blockAggMap.values()].map((b) => ({
    ...b,
    dayDiffPlan: b.dayActual - b.dayPlan,
    dayDiffLy: b.dayActual - b.dayLy,
    mtdDiffPlan: b.mtdActual - b.mtdPlan,
    mtdDiffLy: b.mtdActual - b.mtdLy,
  }));

  const totalRow = blockRows.reduce(
    (acc, b) => {
      acc.dayActual += b.dayActual;
      acc.dayPlan += b.dayPlan;
      acc.dayDiffPlan += b.dayDiffPlan;
      acc.dayLy += b.dayLy;
      acc.dayDiffLy += b.dayDiffLy;
      acc.dayRevenue += b.dayRevenue;
      acc.mtdActual += b.mtdActual;
      acc.mtdPlan += b.mtdPlan;
      acc.mtdDiffPlan += b.mtdDiffPlan;
      acc.mtdLy += b.mtdLy;
      acc.mtdDiffLy += b.mtdDiffLy;
      acc.mtdRevenue += b.mtdRevenue;
      return acc;
    },
    {
      operating_block: 'TỔNG',
      dayActual: 0,
      dayPlan: 0,
      dayDiffPlan: 0,
      dayLy: 0,
      dayDiffLy: 0,
      dayRevenue: 0,
      mtdActual: 0,
      mtdPlan: 0,
      mtdDiffPlan: 0,
      mtdLy: 0,
      mtdDiffLy: 0,
      mtdRevenue: 0,
    }
  );

  const completionRatePct =
    totalRow.mtdPlan > 0 ? Number(((totalRow.mtdActual / totalRow.mtdPlan) * 100).toFixed(1)) : 0;
  const growthRatePct =
    totalRow.mtdLy > 0 ? Number(((totalRow.mtdActual / totalRow.mtdLy) * 100).toFixed(1)) : 0;

  // Section 3: Weekly average meals per operating block (4 weeks of the month)
  const pad2 = (n) => String(n).padStart(2, '0');
  const weekDefs = [
    { key: 'w1', label: '1주', rangeLabel: `${mNum}/1~${mNum}/08`, start: `${month}-01`, end: `${month}-08` },
    { key: 'w2', label: '2주', rangeLabel: `${mNum}/9~${mNum}/15`, start: `${month}-09`, end: `${month}-15` },
    { key: 'w3', label: '3주', rangeLabel: `${mNum}/16~${mNum}/22`, start: `${month}-16`, end: `${month}-22` },
    { key: 'w4', label: '4주', rangeLabel: `${mNum}/23~${mNum}/${pad2(lastDayNum)}`, start: `${month}-23`, end: lastOfMonth },
  ];

  const locBlockMap = new Map(locations.map((l) => [l.code_number, l.operating_block]));
  const monthMeals = db
    .prepare('SELECT code_number, date, actual_meals FROM daily_meals WHERE date >= ? AND date <= ?')
    .all(firstOfMonth, date)
    .filter((r) => locBlockMap.has(r.code_number));

  const activeBlockNames = [...blockAggMap.keys()];
  const weeklyTable = activeBlockNames.map((bName) => ({
    operating_block: bName,
    w1: null,
    w2: null,
    w3: null,
    w4: null,
  }));
  const weeklyRowByBlock = new Map(weeklyTable.map((r) => [r.operating_block, r]));
  const weeklyTotals = { w1: null, w2: null, w3: null, w4: null };

  for (const w of weekDefs) {
    if (w.start > date) continue;
    const wEnd = w.end < date ? w.end : date;
    const rowsInWeek = monthMeals.filter((m) => m.date >= w.start && m.date <= wEnd);
    if (rowsInWeek.length === 0) continue;

    let sumBlockAvgs = 0;
    let anyBlock = false;
    for (const bName of activeBlockNames) {
      const bRows = rowsInWeek.filter((m) => locBlockMap.get(m.code_number) === bName);
      const distinctDays = new Set(bRows.map((m) => m.date)).size;
      if (distinctDays > 0) {
        const sumMeals = bRows.reduce((s, m) => s + (m.actual_meals || 0), 0);
        const avgMeals = sumMeals / distinctDays;
        weeklyRowByBlock.get(bName)[w.key] = Math.round(avgMeals);
        sumBlockAvgs += avgMeals;
        anyBlock = true;
      }
    }
    if (anyBlock) {
      weeklyTotals[w.key] = Math.round(sumBlockAvgs);
    }
  }

  const weeklyChartData = weekDefs.map((w) => {
    const pt = { week: w.label, rangeLabel: w.rangeLabel };
    for (const bName of activeBlockNames) {
      const raw = weeklyRowByBlock.get(bName)[w.key];
      pt[bName] = raw !== null ? Number((raw / 1000).toFixed(1)) : null;
    }
    return pt;
  });

  res.json({
    date,
    month,
    blocks,
    companySummary: {
      dayActualMeals: totalRow.dayActual,
      dayActualRevenue: totalRow.dayRevenue,
      mtdActualMeals: totalRow.mtdActual,
      mtdActualRevenue: totalRow.mtdRevenue,
      completionRatePct,
      growthRatePct,
    },
    totalRow,
    blockRows,
    weekDefs,
    weeklyTable,
    weeklyTotals,
    weeklyChartData,
    kitchenRows,
  });
});

module.exports = router;
