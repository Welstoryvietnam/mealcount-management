/**
 * Central metrics engine: Actual vs Plan vs Last-Year (LY), per kitchen and per day.
 *
 * Rules:
 *  - Plan per day comes from `daily_plans`. If a kitchen has NO plan rows in a given month,
 *    fall back to locations.planned_daily_meals (and × unit_price for revenue).
 *    If the kitchen HAS plan rows in that month, missing days are treated as plan = 0 (e.g. day off).
 *  - Plan revenue: daily_plans.plan_revenue, else plan_meals × unit_price.
 *  - Actual revenue: daily_meals.actual_revenue, else actual_meals × unit_price.
 *  - Comparison (variance, alert, revenue/profit impact) only counts days that HAVE actual data
 *    (D-1 logic => days not yet reported never create false alerts).
 *  - Profit impact = revenue impact × profit margin %.
 */
const { db } = require('../db');
const { DEFAULT_THRESHOLD_PCT, shiftDateISO } = require('../utils/calculations');

function dateList(start, end, max = 400) {
  const list = [];
  let cur = start;
  while (cur <= end && list.length < max) {
    list.push(cur);
    cur = shiftDateISO(cur, 1);
  }
  return list;
}

function pct(a, b) {
  return b > 0 ? Number((((a - b) / b) * 100).toFixed(2)) : null;
}

function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { first: `${ym}-01`, last: `${ym}-${String(last).padStart(2, '0')}` };
}

function computePeriod(locations, start, end, { thresholdPct = DEFAULT_THRESHOLD_PCT } = {}) {
  const codes = new Set(locations.map((l) => l.code_number));
  const dates = dateList(start, end);

  const actualRows = db
    .prepare('SELECT code_number, date, actual_meals, actual_revenue, note FROM daily_meals WHERE date >= ? AND date <= ?')
    .all(start, end)
    .filter((r) => codes.has(r.code_number));
  const planRows = db
    .prepare('SELECT code_number, date, plan_meals, plan_revenue, ly_meals, ly_revenue FROM daily_plans WHERE date >= ? AND date <= ?')
    .all(start, end)
    .filter((r) => codes.has(r.code_number));

  const mStart = monthBounds(start.slice(0, 7)).first;
  const mEnd = monthBounds(end.slice(0, 7)).last;
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

  const getDay = (loc, d) => {
    const key = `${loc.code_number}|${d}`;
    const a = actualMap.get(key);
    const p = planMap.get(key);
    const hasPlanMonth = planMonths.has(`${loc.code_number}|${d.slice(0, 7)}`);
    const price = Number(loc.unit_price) || 0;

    const planMeals = p && p.plan_meals != null ? p.plan_meals : hasPlanMonth ? 0 : loc.planned_daily_meals;
    const planRevenue = p && p.plan_revenue != null ? p.plan_revenue : planMeals * price;
    const lyMeals = p && p.ly_meals != null ? p.ly_meals : null;
    const lyRevenue = p && p.ly_revenue != null ? p.ly_revenue : lyMeals != null ? lyMeals * price : null;
    const actualMeals = a ? a.actual_meals : null;
    const actualRevenue = a ? (a.actual_revenue != null ? a.actual_revenue : a.actual_meals * price) : null;
    return { planMeals, planRevenue, lyMeals, lyRevenue, actualMeals, actualRevenue, note: a ? a.note : '' };
  };

  // Series accumulators
  const totalSeries = new Map(dates.map((d) => [d, newBucket(d)]));
  const blockSeries = new Map();

  const items = locations.map((loc) => {
    const s = {
      planMealsFull: 0,
      planRevenueFull: 0,
      lyMealsFull: 0,
      lyRevenueFull: 0,
      planMeals: 0,
      planRevenue: 0,
      actualMeals: 0,
      actualRevenue: 0,
      lyMeals: 0,
      lyRevenue: 0,
      daysReported: 0,
      note: '',
    };
    if (!blockSeries.has(loc.operating_block)) {
      blockSeries.set(loc.operating_block, new Map(dates.map((d) => [d, newBucket(d)])));
    }
    const bSeries = blockSeries.get(loc.operating_block);

    for (const d of dates) {
      const day = getDay(loc, d);
      s.planMealsFull += day.planMeals;
      s.planRevenueFull += day.planRevenue;
      s.lyMealsFull += day.lyMeals || 0;
      s.lyRevenueFull += day.lyRevenue || 0;
      if (day.actualMeals !== null) {
        s.daysReported++;
        s.planMeals += day.planMeals;
        s.planRevenue += day.planRevenue;
        s.actualMeals += day.actualMeals;
        s.actualRevenue += day.actualRevenue;
        s.lyMeals += day.lyMeals || 0;
        s.lyRevenue += day.lyRevenue || 0;
        if (day.note) s.note = day.note;
      }
      addToBucket(totalSeries.get(d), day);
      addToBucket(bSeries.get(d), day);
    }

    const hasData = s.daysReported > 0;
    const margin = (Number(loc.profit_margin_pct) || 0) / 100;
    const variancePct = hasData ? pct(s.actualMeals, s.planMeals) ?? 0 : 0;
    const revenueImpact = hasData ? s.actualRevenue - s.planRevenue : 0;

    return {
      code_number: loc.code_number,
      location_name: loc.location_name,
      operating_block: loc.operating_block,
      am_name: loc.am_name || '',
      unit_price: loc.unit_price,
      profit_margin_pct: loc.profit_margin_pct,
      has_data: hasData,
      days_reported: s.daysReported,
      note: s.note,
      // Compared figures (only days with actual)
      planMeals: Math.round(s.planMeals),
      actualMeals: Math.round(s.actualMeals),
      lyMeals: Math.round(s.lyMeals),
      planRevenue: Math.round(s.planRevenue),
      actualRevenue: Math.round(s.actualRevenue),
      lyRevenue: Math.round(s.lyRevenue),
      diffMeals: hasData ? Math.round(s.actualMeals - s.planMeals) : 0,
      variancePct,
      revenueVariancePct: hasData ? pct(s.actualRevenue, s.planRevenue) ?? 0 : 0,
      vsLyPct: hasData ? pct(s.actualMeals, s.lyMeals) : null,
      vsLyRevenuePct: hasData ? pct(s.actualRevenue, s.lyRevenue) : null,
      revenueImpact: Math.round(revenueImpact),
      plannedProfit: Math.round(s.planRevenue * margin),
      profitImpact: Math.round(revenueImpact * margin),
      isAlert: hasData && s.planMeals > 0 && variancePct <= thresholdPct,
      // Whole period plan (incl. days not reported yet)
      planMealsFull: Math.round(s.planMealsFull),
      planRevenueFull: Math.round(s.planRevenueFull),
      plannedProfitFull: Math.round(s.planRevenueFull * margin),
      lyMealsFull: Math.round(s.lyMealsFull),
      lyRevenueFull: Math.round(s.lyRevenueFull),
    };
  });

  return {
    dates,
    items,
    totalSeries: [...totalSeries.values()].map(finalizeBucket),
    blockSeries: [...blockSeries.entries()].map(([block, m]) => ({
      operating_block: block,
      trend: [...m.values()].map(finalizeBucket),
    })),
  };
}

function newBucket(d) {
  return { date: d, planned: 0, actual: 0, ly: 0, plannedRevenue: 0, actualRevenue: 0, lyRevenue: 0, hasActual: false, hasLy: false };
}

function addToBucket(b, day) {
  b.planned += day.planMeals;
  b.plannedRevenue += day.planRevenue;
  if (day.lyMeals != null) {
    b.ly += day.lyMeals;
    b.lyRevenue += day.lyRevenue || 0;
    b.hasLy = true;
  }
  if (day.actualMeals !== null) {
    b.actual += day.actualMeals;
    b.actualRevenue += day.actualRevenue;
    b.hasActual = true;
  }
}

function finalizeBucket(b) {
  return {
    date: b.date,
    label: b.date.slice(5).split('-').reverse().join('/'),
    planned: Math.round(b.planned),
    actual: b.hasActual ? Math.round(b.actual) : null,
    ly: b.hasLy ? Math.round(b.ly) : null,
    plannedRevenue: Math.round(b.plannedRevenue),
    actualRevenue: b.hasActual ? Math.round(b.actualRevenue) : null,
    lyRevenue: b.hasLy ? Math.round(b.lyRevenue) : null,
    variancePct: b.hasActual ? pct(b.actual, b.planned) : null,
  };
}

function summarize(items) {
  const sum = (k) => items.reduce((acc, i) => acc + (i[k] || 0), 0);
  const reported = items.filter((i) => i.has_data);
  const rsum = (k) => reported.reduce((acc, i) => acc + (i[k] || 0), 0);
  const planMeals = rsum('planMeals');
  const actualMeals = rsum('actualMeals');
  const lyMeals = rsum('lyMeals');
  const planRevenue = rsum('planRevenue');
  const actualRevenue = rsum('actualRevenue');
  const lyRevenue = rsum('lyRevenue');
  return {
    locationCount: items.length,
    reportedCount: reported.length,
    alertCount: items.filter((i) => i.isAlert).length,
    planMeals,
    actualMeals,
    lyMeals,
    diffMeals: actualMeals - planMeals,
    mealVariancePct: pct(actualMeals, planMeals) ?? 0,
    mealVsLyPct: pct(actualMeals, lyMeals),
    planRevenue,
    actualRevenue,
    lyRevenue,
    revenueImpact: rsum('revenueImpact'),
    revenueVariancePct: pct(actualRevenue, planRevenue) ?? 0,
    revenueVsLyPct: pct(actualRevenue, lyRevenue),
    plannedProfit: rsum('plannedProfit'),
    profitImpact: rsum('profitImpact'),
    planMealsFull: sum('planMealsFull'),
    planRevenueFull: sum('planRevenueFull'),
    plannedProfitFull: sum('plannedProfitFull'),
    lyMealsFull: sum('lyMealsFull'),
    lyRevenueFull: sum('lyRevenueFull'),
  };
}

module.exports = { computePeriod, summarize, monthBounds, dateList, pct };
