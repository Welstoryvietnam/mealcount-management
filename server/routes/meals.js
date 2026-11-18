const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole, getScopedLocations, canAccessLocation } = require('../auth');
const { computePeriod } = require('../services/metrics');
const { getTodayISO, getYesterdayISO } = require('../utils/calculations');

const router = express.Router();
router.use(requireAuth);

// Daily entry grid for one date (default D-1): plan, LY and actual per kitchen
router.get('/', (req, res) => {
  const date = req.query.date || getYesterdayISO();
  const locations = getScopedLocations(req.user, req.query.block || '');
  const { items } = computePeriod(locations, date, date);
  const raw = new Map(db.prepare('SELECT * FROM daily_meals WHERE date = ?').all(date).map((m) => [m.code_number, m]));

  res.json({
    date,
    isFutureOrToday: date >= getTodayISO(),
    items: items.map((i) => {
      const e = raw.get(i.code_number);
      return {
        code_number: i.code_number,
        location_name: i.location_name,
        operating_block: i.operating_block,
        am_name: i.am_name,
        unit_price: i.unit_price,
        plan_meals: i.planMealsFull,
        plan_revenue: i.planRevenueFull,
        ly_meals: i.lyMealsFull || null,
        ly_revenue: i.lyRevenueFull || null,
        actual_meals: e ? e.actual_meals : null,
        actual_revenue: e ? e.actual_revenue : null,
        note: e ? e.note : '',
        updated_by: e ? e.updated_by : '',
        updated_at: e ? e.updated_at : '',
      };
    }),
  });
});

router.post('/bulk', requireRole('admin', 'block_manager', 'site_staff'), (req, res) => {
  const { date, entries } = req.body || {};
  const targetDate = date || getYesterdayISO();
  if (targetDate >= getTodayISO()) {
    return res.status(400).json({ error: 'Theo quy tắc D-1, chỉ được nhập số liệu thực tế của ngày hôm qua trở về trước.' });
  }
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'Dữ liệu entries không hợp lệ.' });

  const upsert = db.prepare(`
    INSERT INTO daily_meals (code_number, date, actual_meals, actual_revenue, note, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(code_number, date) DO UPDATE SET
      actual_meals = excluded.actual_meals,
      actual_revenue = excluded.actual_revenue,
      note = excluded.note,
      updated_by = excluded.updated_by,
      updated_at = datetime('now', 'localtime')
  `);
  const getLoc = db.prepare('SELECT * FROM locations WHERE code_number = ? AND is_active = 1');

  let savedCount = 0;
  const skipped = [];
  db.exec('BEGIN');
  try {
    for (const item of entries) {
      const code = String(item.code_number || '').trim();
      if (!code || item.actual_meals === null || item.actual_meals === '' || item.actual_meals === undefined) continue;
      const loc = getLoc.get(code);
      if (!loc || !canAccessLocation(req.user, loc)) {
        skipped.push(code);
        continue;
      }
      const meals = Math.max(0, Math.round(Number(item.actual_meals) || 0));
      const rev =
        item.actual_revenue === null || item.actual_revenue === '' || item.actual_revenue === undefined
          ? null
          : Math.max(0, Number(item.actual_revenue) || 0);
      upsert.run(code, targetDate, meals, rev, String(item.note || '').trim(), req.user.username);
      savedCount++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ message: `Đã lưu thực tế ngày ${targetDate} cho ${savedCount} bếp.`, savedCount, skipped });
});

module.exports = router;
