const DEFAULT_THRESHOLD_PCT = Number(process.env.ALERT_THRESHOLD_PCT ?? -3);

/**
 * Compute daily meal variance, alert flag, and revenue/profit impact.
 */
function computeMealMetrics({
  actualMeals = 0,
  plannedDailyMeals = 0,
  unitPrice = 0,
  profitMarginPct = 0,
  thresholdPct = DEFAULT_THRESHOLD_PCT,
}) {
  const actual = Number(actualMeals) || 0;
  const planned = Number(plannedDailyMeals) || 0;
  const price = Number(unitPrice) || 0;
  const margin = Number(profitMarginPct) || 0;

  const diffMeals = actual - planned;
  const variancePct = planned > 0 ? Number(((diffMeals / planned) * 100).toFixed(2)) : 0;
  const isAlert = planned > 0 && variancePct <= thresholdPct;

  const plannedRevenue = planned * price;
  const actualRevenue = actual * price;
  const revenueImpact = diffMeals * price;

  const plannedProfit = Math.round(plannedRevenue * (margin / 100));
  const profitImpact = Math.round(revenueImpact * (margin / 100));

  return {
    actualMeals: actual,
    plannedDailyMeals: planned,
    diffMeals,
    variancePct,
    isAlert,
    plannedRevenue,
    actualRevenue,
    revenueImpact,
    plannedProfit,
    profitImpact,
  };
}

function formatVND(amount) {
  const num = Math.round(Number(amount) || 0);
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDateISO(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  DEFAULT_THRESHOLD_PCT,
  computeMealMetrics,
  formatVND,
  getTodayISO,
  getYesterdayISO: () => shiftDateISO(getTodayISO(), -1),
  shiftDateISO,
};
