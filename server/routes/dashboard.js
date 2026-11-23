const express = require('express');
const { db } = require('../db');
const { getScopedLocations, canAccessLocation, requireAuth } = require('../auth');
const { computePeriod, summarize, monthBounds, dateList } = require('../services/metrics');
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

// ============================================================
// Helper utilities for Dashboard 1 (alert-overview) & Dashboard 2 (exec-status)
// ============================================================
const INDUSTRY_ORDER = [
  'Sản xuất_Bán dẫn',
  'Sản xuất_Đồ dùng sinh hoạt',
  'Sản xuất_Điện thoại',
  'Sản xuất_Thiết bị/xây dựng',
  'Sản xuất_Sản xuất',
  'Sản xuất_Khác',
  'Sản xuất_Điện cơ',
  'Sản xuất_Ô tô',
  'Sản xuất_Thực phẩm/thuốc',
  'Sản xuất_Hóa chất',
  'Sản xuất_Kim loại',
  'Văn phòng_Tài chính',
  'Văn phòng_Nghiên cứu',
  'Nhà hàng',
];

const INDUSTRY_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#0891b2',
  '#dc2626',
  '#db2777',
  '#4f46e5',
  '#0d9488',
  '#ca8a04',
  '#ea580c',
  '#65a30d',
  '#7c3aed',
  '#0284c7',
  '#64748b',
];

const SCOPE_DEFS = [
  { key: 'all', label: 'Cả công ty' },
  { key: 'A', label: 'Nhóm A' },
  { key: 'B', label: 'Nhóm B' },
  { key: 'FS1', label: 'ĐH 1' },
  { key: 'FS2', label: 'ĐH 2' },
  { key: 'FS3', label: 'ĐH 3' },
  { key: 'FS4', label: 'ĐH 4' },
  { key: 'FS5', label: 'ĐH 5' },
  { key: 'Chi nhánh HCM', label: 'HCM' },
];

function matchScope(loc, scope) {
  if (!scope || scope === 'all') return true;
  if (scope === 'A' || scope === 'B') return (loc.group_ab || '').toUpperCase() === scope;
  return loc.operating_block === scope;
}

function fmtDM(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function dowShortVN(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
}

function shiftMonthYM(ym, deltaMonths) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, m - 1 + deltaMonths, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function daysBetweenISO(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db2 = new Date(`${b}T00:00:00`);
  return Math.round((db2 - da) / 86400000);
}

function monthRangeClipped(asOfDate, k) {
  const ym = shiftMonthYM(asOfDate.slice(0, 7), -k);
  const { first, last } = monthBounds(ym);
  const clippedEnd = last > asOfDate ? asOfDate : last;
  return { ym, start: first, end: clippedEnd, monthNum: Number(ym.slice(5, 7)), year: Number(ym.slice(0, 4)) };
}

/**
 * Dashboard 1: Alert & Trend Overview (Matches user's HTML template with real synced Google Sheet data)
 * GET /api/dashboard/alert-overview?mode=d|w|m&sel=0&scope=all&thr=3
 */
router.get('/alert-overview', (req, res) => {
  const mode = ['d', 'w', 'm'].includes(req.query.mode) ? req.query.mode : 'd';
  const sel = Math.max(0, parseInt(req.query.sel, 10) || 0);
  const scope = req.query.scope || 'all';
  const thr = Math.max(1, Math.min(50, Number(req.query.thr) || 3));

  const asOfDate = getDefaultReportDate();

  // Build period options for dropdown
  const periodOptions = [];
  if (mode === 'd') {
    for (let k = 0; k < 30; k++) {
      const d = shiftDateISO(asOfDate, -k);
      periodOptions.push({
        value: k,
        label: `Ngày ${fmtDM(d)}/${d.slice(0, 4)} (${dowShortVN(d)})${k === 0 ? ' - mới nhất' : ''}`,
      });
    }
  } else if (mode === 'w') {
    for (let k = 0; k < 8; k++) {
      const e = shiftDateISO(asOfDate, -7 * k);
      const s = shiftDateISO(e, -6);
      periodOptions.push({
        value: k,
        label: `Tuần ${fmtDM(s)} - ${fmtDM(e)}${k === 0 ? ' - mới nhất' : ''}`,
      });
    }
  } else {
    for (let k = 0; k < 6; k++) {
      const mr = monthRangeClipped(asOfDate, k);
      periodOptions.push({
        value: k,
        label: `Tháng ${mr.monthNum}/${mr.year}${k === 0 ? ' (MTD) - mới nhất' : ''}`,
      });
    }
  }

  const safeSel = Math.min(sel, Math.max(0, periodOptions.length - 1));

  // Determine curRange, prevRange, and trend buckets
  let curRange;
  let prevRange;
  const buckets = [];

  if (mode === 'd') {
    const e = shiftDateISO(asOfDate, -safeSel);
    curRange = [e, e];
    prevRange = [shiftDateISO(e, -7), shiftDateISO(e, -7)];
    for (let k = 13; k >= 0; k--) {
      const d = shiftDateISO(e, -k);
      buckets.push({ start: d, end: d, label: fmtDM(d) });
    }
  } else if (mode === 'w') {
    const e = shiftDateISO(asOfDate, -7 * safeSel);
    curRange = [shiftDateISO(e, -6), e];
    prevRange = [shiftDateISO(e, -13), shiftDateISO(e, -7)];
    for (let k = 7; k >= 0; k--) {
      const we = shiftDateISO(e, -7 * k);
      buckets.push({ start: shiftDateISO(we, -6), end: we, label: `-${fmtDM(we)}` });
    }
  } else {
    const curM = monthRangeClipped(asOfDate, safeSel);
    const prevM = monthRangeClipped(asOfDate, safeSel + 1);
    const len = Math.max(1, daysBetweenISO(curM.start, curM.end) + 1);
    const prevEndTarget = shiftDateISO(prevM.start, len - 1);
    curRange = [curM.start, curM.end];
    prevRange = [prevM.start, prevEndTarget > prevM.end ? prevM.end : prevEndTarget];
    for (let k = safeSel + 5; k >= safeSel; k--) {
      const mr = monthRangeClipped(asOfDate, k);
      buckets.push({ start: mr.start, end: mr.end, label: `T${mr.monthNum}` });
    }
  }

  // Determine overall min/max date to fetch in one query
  const allStarts = [curRange[0], prevRange[0], ...buckets.map((b) => b.start)];
  const allEnds = [curRange[1], prevRange[1], ...buckets.map((b) => b.end)];
  const minDate = allStarts.reduce((a, b) => (a < b ? a : b));
  const maxDate = allEnds.reduce((a, b) => (a > b ? a : b));

  // Load all user-scoped locations (open + closed)
  const allLocsRaw = db.prepare('SELECT * FROM locations ORDER BY operating_block, code_number').all();
  const userLocs = allLocsRaw.filter((l) => canAccessLocation(req.user, l));
  const openAll = userLocs.filter((l) => l.is_active === 1);
  const closedAll = userLocs.filter((l) => l.is_active === 0);

  const scopedOpen = openAll.filter((l) => matchScope(l, scope));
  const scopedClosed = closedAll.filter((l) => matchScope(l, scope));
  const userCodes = new Set(userLocs.map((l) => l.code_number));

  // Fetch daily_meals & daily_plans once
  const actualRows = db
    .prepare('SELECT code_number, date, actual_meals, actual_revenue FROM daily_meals WHERE date >= ? AND date <= ?')
    .all(minDate, maxDate)
    .filter((r) => userCodes.has(r.code_number));

  const planRows = db
    .prepare('SELECT code_number, date, plan_meals, plan_revenue, ly_meals, ly_revenue FROM daily_plans WHERE date >= ? AND date <= ?')
    .all(minDate, maxDate)
    .filter((r) => userCodes.has(r.code_number));

  const mStart = monthBounds(minDate.slice(0, 7)).first;
  const mEnd = monthBounds(maxDate.slice(0, 7)).last;
  const planMonths = new Set(
    db
      .prepare(
        `SELECT DISTINCT code_number || '|' || substr(date, 1, 7) AS k
         FROM daily_plans WHERE date >= ? AND date <= ? AND plan_meals IS NOT NULL`
      )
      .all(mStart, mEnd)
      .map((r) => r.k)
  );

  const actualMap = new Map(actualRows.map((r) => [`${r.code_number}|${r.date}`, r]));
  const planMap = new Map(planRows.map((r) => [`${r.code_number}|${r.date}`, r]));

  function sumRangeForLocs(locs, range) {
    const dates = dateList(range[0], range[1], 400);
    let a = 0;
    let p = 0;
    let y = 0;
    let ra = 0;
    let rp = 0;
    let ry = 0;
    for (const loc of locs) {
      for (const d of dates) {
        const key = `${loc.code_number}|${d}`;
        const ar = actualMap.get(key);
        const pr = planMap.get(key);
        const hasPlanM = planMonths.has(`${loc.code_number}|${d.slice(0, 7)}`);

        const pm = pr && pr.plan_meals != null ? pr.plan_meals : hasPlanM ? 0 : loc.planned_daily_meals || 0;
        const prevRev = pr && pr.plan_revenue != null ? pr.plan_revenue : 0;
        const ym = pr && pr.ly_meals != null ? pr.ly_meals : 0;
        const yRev = pr && pr.ly_revenue != null ? pr.ly_revenue : 0;

        const am = ar ? ar.actual_meals || 0 : 0;
        const aRev = ar && ar.actual_revenue != null ? ar.actual_revenue : 0;

        a += am;
        p += pm;
        y += ym;
        ra += aRev;
        rp += prevRev;
        ry += yRev;
      }
    }
    return { a, p, y, ra, rp, ry };
  }

  // Compute current, prev, and bucket aggregates for scopedOpen
  const curAgg = sumRangeForLocs(scopedOpen, curRange);
  const prevAgg = sumRangeForLocs(scopedOpen, prevRange);

  // Per-location dropping / alert evaluation across ALL openAll (for instant drill-down)
  const scopedCodeSet = new Set(scopedOpen.map((l) => l.code_number));
  const allDroppingLocations = [];
  const mealAlerts = [];
  let revAlertCount = 0;

  for (const loc of openAll) {
    const c = sumRangeForLocs([loc], curRange);
    const pr = sumRangeForLocs([loc], prevRange);
    const inCurScope = scopedCodeSet.has(loc.code_number);

    if (c.a > 0 && pr.a > 0) {
      const deltaPct = ((c.a / pr.a) - 1) * 100;
      if (deltaPct < 0) {
        const attPct = c.p > 0 ? (c.a / c.p) * 100 : 0;
        const item = {
          code_number: loc.code_number,
          location_name: loc.location_name,
          operating_block: loc.operating_block,
          group_ab: loc.group_ab || '',
          industry: (loc.industry || '').trim() || 'Khác',
          am_name: loc.am_name || '',
          curActual: Math.round(c.a),
          prevActual: Math.round(pr.a),
          diffMeals: Math.round(c.a - pr.a),
          deltaPct: Number(deltaPct.toFixed(1)),
          attPct: Number(attPct.toFixed(1)),
          isAlert: deltaPct <= -thr,
        };
        allDroppingLocations.push(item);
        if (inCurScope && item.isAlert) {
          mealAlerts.push(item);
        }
      }
    }
    if (inCurScope && c.ra > 0 && pr.ra > 0) {
      const rDeltaPct = ((c.ra / pr.ra) - 1) * 100;
      if (rDeltaPct <= -thr) revAlertCount++;
    }
  }
  allDroppingLocations.sort((a, b) => a.deltaPct - b.deltaPct);
  mealAlerts.sort((a, b) => a.deltaPct - b.deltaPct);

  // Main trend chart (Actual vs Plan)
  const trendSeries = buckets.map((b) => {
    const ag = sumRangeForLocs(scopedOpen, [b.start, b.end]);
    return {
      label: b.label,
      actual: Math.round(ag.a),
      plan: Math.round(ag.p),
    };
  });

  // Industry breakdown (only industries present in scopedOpen)
  const indGroups = new Map();
  for (const loc of scopedOpen) {
    const ind = (loc.industry || '').trim() || 'Khác';
    if (!indGroups.has(ind)) indGroups.set(ind, []);
    indGroups.get(ind).push(loc);
  }
  const industryRows = [...indGroups.entries()]
    .map(([ind, locs]) => {
      const c = sumRangeForLocs(locs, curRange);
      const pr = sumRangeForLocs(locs, prevRange);
      const series = buckets.map((b) => Math.round(sumRangeForLocs(locs, [b.start, b.end]).a));
      const deltaPct = pr.a > 0 ? ((c.a / pr.a) - 1) * 100 : 0;
      const attPct = c.p > 0 ? (c.a / c.p) * 100 : 0;
      const alertCount = mealAlerts.filter((m) => m.industry === ind).length;
      return {
        industry: ind,
        actual: Math.round(c.a),
        plan: Math.round(c.p),
        attPct: Number(attPct.toFixed(1)),
        deltaPct: Number(deltaPct.toFixed(1)),
        alertCount,
        series,
      };
    })
    .filter((r) => r.actual > 0 || r.plan > 0)
    .sort((a, b) => b.actual - a.actual)
    .map((r, idx) => ({
      ...r,
      color: INDUSTRY_COLORS[idx % INDUSTRY_COLORS.length],
    }));

  // Segment comparison table (always across openAll)
  const segmentRows = SCOPE_DEFS.map((sd) => {
    const locs = openAll.filter((l) => matchScope(l, sd.key));
    const c = sumRangeForLocs(locs, curRange);
    const pr = sumRangeForLocs(locs, prevRange);
    const series = buckets.map((b) => Math.round(sumRangeForLocs(locs, [b.start, b.end]).a));
    const deltaPct = pr.a > 0 ? ((c.a / pr.a) - 1) * 100 : 0;
    const attPct = c.p > 0 ? (c.a / c.p) * 100 : 0;
    const yoyPct = c.y > 0 ? ((c.a / c.y) - 1) * 100 : null;
    const alertCount = allDroppingLocations.filter((m) => m.isAlert && matchScope(m, sd.key)).length;
    return {
      key: sd.key,
      label: sd.label,
      actual: Math.round(c.a),
      plan: Math.round(c.p),
      attPct: Number(attPct.toFixed(1)),
      deltaPct: Number(deltaPct.toFixed(1)),
      yoyPct: yoyPct !== null ? Number(yoyPct.toFixed(1)) : null,
      alertCount,
      series,
    };
  });

  const mealDeltaPct = prevAgg.a > 0 ? ((curAgg.a / prevAgg.a) - 1) * 100 : 0;
  const mealAttPct = curAgg.p > 0 ? (curAgg.a / curAgg.p) * 100 : 0;
  const mealYoyPct = curAgg.y > 0 ? ((curAgg.a / curAgg.y) - 1) * 100 : null;

  const revDeltaPct = prevAgg.ra > 0 ? ((curAgg.ra / prevAgg.ra) - 1) * 100 : 0;
  const revAttPct = curAgg.rp > 0 ? (curAgg.ra / curAgg.rp) * 100 : 0;
  const revYoyPct = curAgg.ry > 0 ? ((curAgg.ra / curAgg.ry) - 1) * 100 : null;

  res.json({
    asOfDate,
    mode,
    sel: safeSel,
    scope,
    thr,
    scopes: SCOPE_DEFS,
    periodOptions,
    curRange,
    prevRange,
    buckets: buckets.map((b) => b.label),
    openCount: scopedOpen.length,
    closedLocations: scopedClosed.map((l) => ({ code_number: l.code_number, location_name: l.location_name })),
    mealKpi: {
      actual: Math.round(curAgg.a),
      plan: Math.round(curAgg.p),
      diff: Math.round(curAgg.a - curAgg.p),
      attPct: Number(mealAttPct.toFixed(1)),
      prevActual: Math.round(prevAgg.a),
      deltaPrevPct: Number(mealDeltaPct.toFixed(1)),
      lyActual: Math.round(curAgg.y),
      yoyPct: mealYoyPct !== null ? Number(mealYoyPct.toFixed(1)) : null,
      alertCount: mealAlerts.length,
    },
    revenueKpi: {
      actual: Number((curAgg.ra / 1e6).toFixed(1)),
      plan: Number((curAgg.rp / 1e6).toFixed(1)),
      diff: Number(((curAgg.ra - curAgg.rp) / 1e6).toFixed(1)),
      attPct: Number(revAttPct.toFixed(1)),
      prevActual: Number((prevAgg.ra / 1e6).toFixed(1)),
      deltaPrevPct: Number(revDeltaPct.toFixed(1)),
      lyActual: Number((curAgg.ry / 1e6).toFixed(1)),
      yoyPct: revYoyPct !== null ? Number(revYoyPct.toFixed(1)) : null,
      alertCount: revAlertCount,
    },
    trendSeries,
    industryRows,
    segmentRows,
    alertRows: mealAlerts,
    allDroppingLocations,
  });
});

/**
 * Dashboard 2: Executive Side-by-Side Meal & Revenue Status (Matches attached image 2)
 * GET /api/dashboard/exec-status?date=YYYY-MM-DD
 */
router.get('/exec-status', (req, res) => {
  const date = req.query.date || getDefaultReportDate();
  const locations = getScopedLocations(req.user);

  const month = date.slice(0, 7);
  const { first: firstOfMonth } = monthBounds(month);

  const dayData = computePeriod(locations, date, date);
  const mtdData = computePeriod(locations, firstOfMonth, date);
  const mtdMap = new Map(mtdData.items.map((i) => [i.code_number, i]));

  // Same weekday in the same week of last year (-52 weeks = -364 days; if same year, -371 days)
  let sameDowLyDate = shiftDateISO(date, -364);
  if (sameDowLyDate.slice(0, 4) === date.slice(0, 4)) {
    sameDowLyDate = shiftDateISO(date, -371);
  }
  const sameDowMmdd = sameDowLyDate.slice(4) === '-02-29' ? '-02-28' : sameDowLyDate.slice(4);
  const sameDowLookupDate = `${date.slice(0, 4)}${sameDowMmdd}`;
  const sameDowRows = db
    .prepare('SELECT code_number, ly_meals, ly_revenue FROM daily_plans WHERE date = ?')
    .all(sameDowLookupDate);
  const sameDowMap = new Map(sameDowRows.map((r) => [r.code_number, r]));

  const emptyMetric = (label) => ({
    label,
    dayActual: 0,
    dayPlan: 0,
    dayLy: 0,
    dayLySameDow: 0,
    mtdActual: 0,
    mtdPlan: 0,
    mtdLy: 0,
  });

  const addVals = (target, da, dp, dl, dls, ma, mp, ml) => {
    target.dayActual += da;
    target.dayPlan += dp;
    target.dayLy += dl;
    target.dayLySameDow += dls;
    target.mtdActual += ma;
    target.mtdPlan += mp;
    target.mtdLy += ml;
  };

  const finalizeRow = (r) => ({
    ...r,
    dayDiffPlan: r.dayActual - r.dayPlan,
    dayDiffLy: r.dayActual - r.dayLy,
    dayDiffLySameDow: r.dayActual - r.dayLySameDow,
    mtdDiffPlan: r.mtdActual - r.mtdPlan,
    mtdDiffLy: r.mtdActual - r.mtdLy,
  });

  function buildPanel(isRevenue) {
    const groupMap = new Map([
      ['A', emptyMetric('A')],
      ['B', emptyMetric('B')],
    ]);

    const blockOrderDisplay = [
      { key: 'FS1', label: 'FS 1' },
      { key: 'FS2', label: 'FS 2' },
      { key: 'FS3', label: 'FS 3' },
      { key: 'FS4', label: 'FS 4' },
      { key: 'FS5', label: 'FS 5' },
      { key: 'Chi nhánh HCM', label: 'HCM' },
    ];
    const blockMap = new Map(blockOrderDisplay.map((b) => [b.key, emptyMetric(b.label)]));

    const indMap = new Map();
    for (const ind of INDUSTRY_ORDER) {
      indMap.set(ind, emptyMetric(ind));
    }

    const totalAll = emptyMetric('Tổng');

    for (const dItem of dayData.items) {
      const mItem = mtdMap.get(dItem.code_number) || {};
      const sDow = sameDowMap.get(dItem.code_number) || {};
      const da = isRevenue ? dItem.actualRevenue || 0 : dItem.actualMeals || 0;
      const dp = isRevenue ? dItem.planRevenueFull || 0 : dItem.planMealsFull || 0;
      const dl = isRevenue ? dItem.lyRevenueFull || 0 : dItem.lyMealsFull || 0;
      const dls = isRevenue ? (sDow.ly_revenue != null ? sDow.ly_revenue : 0) : (sDow.ly_meals != null ? sDow.ly_meals : 0);

      const ma = isRevenue ? mItem.actualRevenue || 0 : mItem.actualMeals || 0;
      const mp = isRevenue ? mItem.planRevenueFull || 0 : mItem.planMealsFull || 0;
      const ml = isRevenue ? mItem.lyRevenueFull || 0 : mItem.lyMealsFull || 0;

      addVals(totalAll, da, dp, dl, dls, ma, mp, ml);

      // Group A/B
      const gKey = (dItem.group_ab || '').toUpperCase();
      if (gKey === 'A' || gKey === 'B') {
        addVals(groupMap.get(gKey), da, dp, dl, dls, ma, mp, ml);
      } else if (da || dp || dl || dls || ma || mp || ml) {
        if (!groupMap.has('Khác')) groupMap.set('Khác', emptyMetric('Khác'));
        addVals(groupMap.get('Khác'), da, dp, dl, dls, ma, mp, ml);
      }

      // Operating Block
      if (blockMap.has(dItem.operating_block)) {
        addVals(blockMap.get(dItem.operating_block), da, dp, dl, dls, ma, mp, ml);
      } else if (da || dp || dl || dls || ma || mp || ml) {
        if (!blockMap.has(dItem.operating_block)) {
          blockMap.set(dItem.operating_block, emptyMetric(dItem.operating_block));
        }
        addVals(blockMap.get(dItem.operating_block), da, dp, dl, dls, ma, mp, ml);
      }

      // Industry
      const indKey = (dItem.industry || '').trim() || 'Khác';
      if (!indMap.has(indKey)) indMap.set(indKey, emptyMetric(indKey));
      addVals(indMap.get(indKey), da, dp, dl, dls, ma, mp, ml);
    }

    const totalRow = finalizeRow(totalAll);
    const completionPct =
      totalRow.mtdPlan > 0 ? Number(((totalRow.mtdActual / totalRow.mtdPlan) * 100).toFixed(1)) : 0;
    const yoyPct =
      totalRow.mtdLy > 0 ? Number(((totalRow.mtdActual / totalRow.mtdLy) * 100).toFixed(1)) : 0;

    // Keep INDUSTRY_ORDER rows that exist in DB or have data, plus any extra non-zero industries
    const dbIndustries = new Set(locations.map((l) => (l.industry || '').trim()).filter(Boolean));
    const industryRows = [...indMap.entries()]
      .filter(([k, v]) => dbIndustries.has(k) || v.dayActual || v.dayPlan || v.mtdActual || v.mtdPlan)
      .map(([, v]) => finalizeRow(v));

    return {
      summary: {
        dayActual: totalRow.dayActual,
        mtdActual: totalRow.mtdActual,
        mtdPlan: totalRow.mtdPlan,
        mtdLy: totalRow.mtdLy,
        completionPct,
        yoyPct,
      },
      totalRow,
      groupRows: [...groupMap.values()].map(finalizeRow),
      blockRows: [...blockMap.values()].map(finalizeRow),
      industryRows,
    };
  }

  res.json({
    date,
    month,
    sameDowLyDate,
    meals: buildPanel(false),
    revenue: buildPanel(true),
  });
});

module.exports = router;
