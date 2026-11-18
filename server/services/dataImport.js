const { db } = require('../db');
const { canAccessLocation } = require('../auth');
const { pick, hasAnyColumn, toISODate, toNumber, fetchGoogleSheetRecords } = require('../utils/importer');
const { getTodayISO, shiftDateISO } = require('../utils/calculations');

const COLS = {
  code: ['code_number', 'mã bếp', 'ma_bep', 'ma bep', 'code', 'mã địa điểm', 'ma_dia_diem'],
  date: ['date', 'ngày', 'ngay'],
  metric: ['metric', 'chỉ tiêu', 'chi_tieu', 'chi tieu', 'loại chỉ tiêu', 'loai_chi_tieu', 'loại', 'loai', 'type'],
  planMeals: ['plan_meals', 'kh suất ăn', 'kh_suat_an', 'kế hoạch suất ăn', 'ke_hoach_suat_an'],
  planRevenue: ['plan_revenue', 'kh doanh thu', 'kh_doanh_thu', 'kế hoạch doanh thu', 'ke_hoach_doanh_thu'],
  lyMeals: ['ly_meals', 'suất ăn năm trước', 'suat_an_nam_truoc', 'tt suất ăn năm trước', 'thực tế suất ăn năm trước'],
  lyRevenue: ['ly_revenue', 'doanh thu năm trước', 'doanh_thu_nam_truoc', 'tt doanh thu năm trước', 'thực tế doanh thu năm trước'],
  actualMeals: ['actual_meals', 'suất ăn thực tế', 'suat_an_thuc_te', 'thực tế suất ăn', 'tt suất ăn'],
  actualRevenue: ['actual_revenue', 'doanh thu thực tế', 'doanh_thu_thuc_te', 'thực tế doanh thu', 'tt doanh thu'],
  note: ['note', 'ghi chú', 'ghi_chu'],
};

const SYSTEM_USER = { username: 'gsheet_sync', role: 'admin', allowed_blocks: ['*'], allowed_locations: ['*'] };

function getLocationLookup() {
  return new Map(db.prepare('SELECT * FROM locations WHERE is_active = 1').all().map((l) => [l.code_number, l]));
}

function resolvePlanMetric(rawMetric, sheetName = '') {
  const s = `${rawMetric || ''} ${sheetName || ''}`.toLowerCase();
  const isLy = /nt_|namtruoc|năm trước|nam_truoc|\bly\b|last_year/.test(s);
  const isRev = /doanhthu|doanh thu|doanh_thu|revenue|\brev\b|\bdt\b/.test(s);
  if (isLy && isRev) return 'lyRevenue';
  if (isLy) return 'lyMeals';
  if (isRev) return 'planRevenue';
  return 'planMeals';
}

function resolveActualMetric(rawMetric, sheetName = '') {
  const s = `${rawMetric || ''} ${sheetName || ''}`.toLowerCase();
  if (/doanhthu|doanh thu|doanh_thu|revenue|\brev\b|\bdt\b/.test(s)) return 'actualRevenue';
  return 'actualMeals';
}

function detectDateColumns(headers, fallbackMonth = '') {
  const dateCols = [];
  for (const h of headers) {
    if (COLS.code.includes(h) || COLS.metric.includes(h) || COLS.date.includes(h)) continue;
    if (/tổng|tong|total|sum|location|tên|ten|ban|block|note|ghi chú/.test(h)) continue;
    const iso = toISODate(h, fallbackMonth);
    if (iso) dateCols.push({ header: h, date: iso });
  }
  return dateCols;
}

/**
 * If importing Last-Year (lyMeals / lyRevenue) with last year's date header (e.g. 2025-11-01),
 * map it to the comparison date in the current/plan year (e.g. 2026-11-01).
 */
function alignLyDate(dateStr, targetPlanYear) {
  const y = Number(dateStr.slice(0, 4));
  if (y === targetPlanYear - 1) {
    const rest = dateStr.slice(4); // -MM-DD
    if (rest === '-02-29') return `${targetPlanYear}-02-28`;
    return `${targetPlanYear}${rest}`;
  }
  return dateStr;
}

/**
 * Normalize one or multiple sheets (Wide matrix OR Long rows) into a Map<"code|date", {planMeals, planRevenue, lyMeals, lyRevenue}>
 */
function importPlanRecords(input, user, { fallbackMonth = '', maxErrors = 20 } = {}) {
  const sheets = Array.isArray(input) ? input : [input];
  const locs = getLocationLookup();
  const targetPlanYear = /^\d{4}/.test(fallbackMonth)
    ? Number(fallbackMonth.slice(0, 4))
    : Number(getTodayISO().slice(0, 4));

  const merged = new Map(); // key: `${code}|${date}` -> { code, date, planMeals, planRevenue, lyMeals, lyRevenue }
  const errors = [];
  const unauthorized = new Set();
  const unknown = new Set();
  const months = new Set();

  const touch = (code, date) => {
    const key = `${code}|${date}`;
    if (!merged.has(key)) {
      merged.set(key, { code, date, planMeals: null, planRevenue: null, lyMeals: null, lyRevenue: null });
    }
    return merged.get(key);
  };

  for (const sheet of sheets) {
    const { sheetName = '', headers = [], records = [] } = sheet || {};
    if (!headers.length || !records.length) continue;
    if (!hasAnyColumn(headers, COLS.code)) continue;

    const dateCols = detectDateColumns(headers, fallbackMonth);

    if (dateCols.length > 0) {
      // Wide matrix format (each day is 1 column)
      for (const r of records) {
        const code = String(pick(r, COLS.code) ?? '').trim();
        if (!code) continue;
        const loc = locs.get(code);
        if (!loc) {
          unknown.add(code);
          continue;
        }
        if (!canAccessLocation(user, loc)) {
          unauthorized.add(code);
          continue;
        }
        const rowMetric = pick(r, COLS.metric);
        const baseField = resolvePlanMetric(rowMetric, sheetName);

        for (const dc of dateCols) {
          const num = toNumber(r[dc.header]);
          if (num === null) continue;
          const isPrevYearCol = Number(dc.date.slice(0, 4)) === targetPlanYear - 1;
          const targetField = isPrevYearCol
            ? baseField === 'planRevenue' || baseField === 'lyRevenue'
              ? 'lyRevenue'
              : 'lyMeals'
            : baseField;
          const isLyField = targetField === 'lyMeals' || targetField === 'lyRevenue';
          const mappedDate = isLyField ? alignLyDate(dc.date, targetPlanYear) : dc.date;
          const entry = touch(code, mappedDate);
          entry[targetField] = num;
          months.add(mappedDate.slice(0, 7));
        }
      }
    } else if (hasAnyColumn(headers, COLS.date)) {
      // Long format (each day is 1 row)
      const valueCols = ['planMeals', 'planRevenue', 'lyMeals', 'lyRevenue'];
      records.forEach((r, i) => {
        const code = String(pick(r, COLS.code) ?? '').trim();
        if (!code) return;
        const date = toISODate(pick(r, COLS.date), fallbackMonth);
        if (!date) {
          if (errors.length < maxErrors) errors.push(`${sheetName} dòng ${i + 2}: ngày không hợp lệ`);
          return;
        }
        const loc = locs.get(code);
        if (!loc) return unknown.add(code);
        if (!canAccessLocation(user, loc)) return unauthorized.add(code);

        const entry = touch(code, date);
        let anyVal = false;
        for (const k of valueCols) {
          const v = toNumber(pick(r, COLS[k]));
          if (v !== null) {
            entry[k] = v;
            anyVal = true;
          }
        }
        if (anyVal) months.add(date.slice(0, 7));
      });
    }
  }

  if (merged.size === 0 && unknown.size === 0 && unauthorized.size === 0) {
    throw new Error(
      'Không tìm thấy dữ liệu hợp lệ. File cần cột Mã bếp (code_number) và các cột Ngày (VD: 2026-11-01, 2026-11-02... hoặc cột date).'
    );
  }

  const upsert = db.prepare(`
    INSERT INTO daily_plans (code_number, date, plan_meals, plan_revenue, ly_meals, ly_revenue, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(code_number, date) DO UPDATE SET
      plan_meals = COALESCE(excluded.plan_meals, daily_plans.plan_meals),
      plan_revenue = COALESCE(excluded.plan_revenue, daily_plans.plan_revenue),
      ly_meals = COALESCE(excluded.ly_meals, daily_plans.ly_meals),
      ly_revenue = COALESCE(excluded.ly_revenue, daily_plans.ly_revenue),
      updated_by = excluded.updated_by,
      updated_at = datetime('now', 'localtime')
  `);

  let count = 0;
  db.exec('BEGIN');
  try {
    for (const item of merged.values()) {
      if (item.planMeals === null && item.planRevenue === null && item.lyMeals === null && item.lyRevenue === null) {
        continue;
      }
      upsert.run(
        item.code,
        item.date,
        item.planMeals,
        item.planRevenue,
        item.lyMeals,
        item.lyRevenue,
        user.username
      );
      count++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return {
    count,
    months: [...months].sort(),
    unknownCodes: [...unknown],
    unauthorizedCodes: [...unauthorized],
    errors,
    message: `Đã cập nhật ${count.toLocaleString('vi-VN')} ô dữ liệu kế hoạch/năm trước (theo ngày)${
      months.size ? ` — tháng: ${[...months].sort().join(', ')}` : ''
    }.`,
  };
}

/**
 * Import actual D-1 records from Wide Matrix (columns = dates) OR Long rows.
 */
function importActualRecords(input, user, { fallbackDate, fallbackMonth = '', recentDays = 0, maxErrors = 20 } = {}) {
  const sheets = Array.isArray(input) ? input : [input];
  const locs = getLocationLookup();
  const targetPlanYear = /^\d{4}/.test(fallbackMonth)
    ? Number(fallbackMonth.slice(0, 4))
    : Number(getTodayISO().slice(0, 4));
  const today = getTodayISO();
  const minDate = recentDays > 0 ? shiftDateISO(today, -recentDays) : '0000-00-00';

  const merged = new Map(); // key `${code}|${date}` -> { code, date, actualMeals, actualRevenue, note }
  let skippedOld = 0;
  let skippedFuture = 0;
  const errors = [];
  const unauthorized = new Set();
  const unknown = new Set();

  const touch = (code, date) => {
    const key = `${code}|${date}`;
    if (!merged.has(key)) {
      merged.set(key, { code, date, actualMeals: null, actualRevenue: null, note: '' });
    }
    return merged.get(key);
  };

  for (const sheet of sheets) {
    const { sheetName = '', headers = [], records = [] } = sheet || {};
    if (!headers.length || !records.length) continue;
    if (!hasAnyColumn(headers, COLS.code)) continue;

    const dateCols = detectDateColumns(headers, fallbackMonth || (fallbackDate ? fallbackDate.slice(0, 7) : ''));

    if (dateCols.length > 0) {
      // Wide matrix format (each day is 1 column)
      for (const r of records) {
        const code = String(pick(r, COLS.code) ?? '').trim();
        if (!code) continue;
        const loc = locs.get(code);
        if (!loc) {
          unknown.add(code);
          continue;
        }
        if (!canAccessLocation(user, loc)) {
          unauthorized.add(code);
          continue;
        }
        const targetField = resolveActualMetric(pick(r, COLS.metric), sheetName);

        for (const dc of dateCols) {
          const num = toNumber(r[dc.header]);
          if (num === null) continue;
          if (dc.date >= today) {
            skippedFuture++;
            continue;
          }
          if (dc.date < minDate) {
            skippedOld++;
            continue;
          }
          const entry = touch(code, dc.date);
          entry[targetField] = num;
        }
      }
    } else if (hasAnyColumn(headers, COLS.actualMeals)) {
      // Long format
      records.forEach((r, i) => {
        const code = String(pick(r, COLS.code) ?? '').trim();
        if (!code) return;
        const rawDate = pick(r, COLS.date);
        const date = rawDate !== undefined ? toISODate(rawDate, fallbackMonth) : fallbackDate;
        if (!date) {
          if (errors.length < maxErrors) errors.push(`Dòng ${i + 2}: ngày không hợp lệ`);
          return;
        }
        if (date >= today) return skippedFuture++;
        if (date < minDate) return skippedOld++;

        const meals = toNumber(pick(r, COLS.actualMeals));
        if (meals === null) return;
        const loc = locs.get(code);
        if (!loc) return unknown.add(code);
        if (!canAccessLocation(user, loc)) return unauthorized.add(code);

        const entry = touch(code, date);
        entry.actualMeals = Math.max(0, Math.round(meals));
        const rev = toNumber(pick(r, COLS.actualRevenue));
        if (rev !== null) entry.actualRevenue = rev;
        const note = String(pick(r, COLS.note) ?? '').trim();
        if (note) entry.note = note;
      });
    }
  }

  if (merged.size === 0 && skippedFuture === 0 && skippedOld === 0 && unknown.size === 0) {
    throw new Error('Không tìm thấy dữ liệu thực tế hợp lệ (cần cột code_number và các cột ngày hoặc cột actual_meals).');
  }

  const upsertMeals = db.prepare(`
    INSERT INTO daily_meals (code_number, date, actual_meals, actual_revenue, note, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(code_number, date) DO UPDATE SET
      actual_meals = COALESCE(excluded.actual_meals, daily_meals.actual_meals),
      actual_revenue = COALESCE(excluded.actual_revenue, daily_meals.actual_revenue),
      note = CASE WHEN excluded.note != '' THEN excluded.note ELSE daily_meals.note END,
      updated_by = excluded.updated_by,
      updated_at = datetime('now', 'localtime')
  `);

  const updateRevOnly = db.prepare(`
    UPDATE daily_meals SET actual_revenue = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
    WHERE code_number = ? AND date = ?
  `);

  let count = 0;
  db.exec('BEGIN');
  try {
    for (const item of merged.values()) {
      if (item.actualMeals !== null) {
        upsertMeals.run(
          item.code,
          item.date,
          Math.max(0, Math.round(item.actualMeals)),
          item.actualRevenue,
          item.note,
          user.username
        );
        count++;
      } else if (item.actualRevenue !== null) {
        updateRevOnly.run(item.actualRevenue, user.username, item.code, item.date);
        count++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const extra = [];
  if (skippedFuture) extra.push(`bỏ qua ${skippedFuture} ô ngày hôm nay/tương lai (D-1)`);
  if (skippedOld) extra.push(`bỏ qua ${skippedOld} ô cũ hơn ${recentDays} ngày`);
  return {
    count,
    unknownCodes: [...unknown],
    unauthorizedCodes: [...unauthorized],
    errors,
    message: `Đã cập nhật ${count.toLocaleString('vi-VN')} bếp×ngày thực tế${extra.length ? ` (${extra.join('; ')})` : ''}.`,
  };
}

function setSyncStatus(id, status, message) {
  db.prepare(`
    UPDATE data_sync_configs
    SET last_sync_at = datetime('now', 'localtime'), last_sync_status = ?, last_sync_message = ?
    WHERE id = ?
  `).run(status, message, id);
}

async function runDataSync(id, user = SYSTEM_USER) {
  const cfg = db.prepare('SELECT * FROM data_sync_configs WHERE id = ?').get(id);
  if (!cfg) throw new Error('Không tìm thấy cấu hình đồng bộ.');
  try {
    const table = await fetchGoogleSheetRecords(cfg.sheet_url);
    const result =
      id === 'plan'
        ? importPlanRecords(table, user)
        : importActualRecords(table, user, { recentDays: Number(cfg.recent_days) || 0 });
    let msg = result.message;
    if (result.unknownCodes.length) msg += ` Mã bếp không tồn tại: ${result.unknownCodes.slice(0, 10).join(', ')}.`;
    setSyncStatus(id, 'success', msg);
    return { ...result, message: msg };
  } catch (err) {
    setSyncStatus(id, 'error', err.message);
    throw err;
  }
}

function startDataAutoSync() {
  setInterval(async () => {
    const cfgs = db.prepare('SELECT * FROM data_sync_configs WHERE auto_sync_enabled = 1 AND sheet_url != ?').all('');
    for (const cfg of cfgs) {
      const intervalMs = Math.max(5, Number(cfg.sync_interval_minutes) || 60) * 60 * 1000;
      const last = cfg.last_sync_at ? new Date(cfg.last_sync_at.replace(' ', 'T')).getTime() : 0;
      if (Date.now() - last < intervalMs) continue;
      try {
        await runDataSync(cfg.id);
        console.log(`[DataAutoSync] ${cfg.id}: OK`);
      } catch (err) {
        console.error(`[DataAutoSync] ${cfg.id}:`, err.message);
      }
    }
  }, 60 * 1000);
}

module.exports = { COLS, importPlanRecords, importActualRecords, runDataSync, startDataAutoSync };
