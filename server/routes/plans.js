const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { db } = require('../db');
const { requireAuth, requireRole, getScopedLocations } = require('../auth');
const { readWorkbookSheets } = require('../utils/importer');
const { importPlanRecords, importActualRecords, runDataSync } = require('../services/dataImport');
const { computePeriod, summarize, monthBounds, dateList } = require('../services/metrics');
const { getTodayISO, getYesterdayISO, shiftDateISO } = require('../utils/calculations');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
router.use(requireAuth);

function styleHeader(sheet, color) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 28;
  sheet.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];
}

function addGuideSheet(workbook, lines) {
  const g = workbook.addWorksheet('HuongDan');
  g.getColumn(1).width = 115;
  lines.forEach((l, i) => {
    const c = g.getCell(`A${i + 1}`);
    c.value = l;
    if (i === 0) c.font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };
  });
}

function addWideMetricSheet(wb, sheetName, headerColor, locations, dates, getValFn) {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [
    { header: 'code_number', key: 'code_number', width: 15 },
    { header: 'location_name', key: 'location_name', width: 26 },
    { header: 'operating_block', key: 'operating_block', width: 16 },
    { header: 'Tổng cộng', key: 'total', width: 16 },
    ...dates.map((d) => ({ header: d, key: d, width: 13 })),
  ];
  styleHeader(ws, headerColor);

  const firstDateColLetter = ws.getColumn(5).letter;
  const lastDateColLetter = ws.getColumn(4 + dates.length).letter;

  locations.forEach((loc, idx) => {
    const rowNum = idx + 2;
    const rowData = {
      code_number: loc.code_number,
      location_name: loc.location_name,
      operating_block: loc.operating_block,
      total: { formula: `SUM(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum})` },
    };
    for (const d of dates) {
      rowData[d] = getValFn(loc.code_number, d);
    }
    const r = ws.addRow(rowData);
    r.getCell(4).font = { bold: true, color: { argb: 'FF1E3A8A' } };
  });

  for (let c = 4; c <= 4 + dates.length; c++) {
    ws.getColumn(c).numFmt = '#,##0';
  }
}

/* ---------- Monthly summary of plan / LY / actual MTD per kitchen ---------- */
router.get('/summary', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : getTodayISO().slice(0, 7);
  const block = req.query.block || 'ALL';
  const locations = getScopedLocations(req.user, block);
  const { first, last } = monthBounds(month);
  const { items } = computePeriod(locations, first, last);

  const planStats = new Map(
    db
      .prepare(
        `SELECT code_number,
                SUM(CASE WHEN plan_meals IS NOT NULL THEN 1 ELSE 0 END) AS plan_days,
                SUM(CASE WHEN ly_meals IS NOT NULL THEN 1 ELSE 0 END) AS ly_days
         FROM daily_plans WHERE date >= ? AND date <= ? GROUP BY code_number`
      )
      .all(first, last)
      .map((r) => [r.code_number, r])
  );

  const rows = items.map((i) => {
    const st = planStats.get(i.code_number) || { plan_days: 0, ly_days: 0 };
    return {
      code_number: i.code_number,
      location_name: i.location_name,
      operating_block: i.operating_block,
      plan_days: st.plan_days,
      ly_days: st.ly_days,
      plan_source: st.plan_days > 0 ? 'daily_plan' : 'default',
      planMealsMonth: i.planMealsFull,
      planRevenueMonth: i.planRevenueFull,
      lyMealsMonth: i.lyMealsFull,
      lyRevenueMonth: i.lyRevenueFull,
      actualMealsMtd: i.actualMeals,
      actualRevenueMtd: i.actualRevenue,
      planMealsMtd: i.planMeals,
      planRevenueMtd: i.planRevenue,
      days_reported: i.days_reported,
      completionMealsPct: i.planMealsFull > 0 ? Number(((i.actualMeals / i.planMealsFull) * 100).toFixed(1)) : null,
      vsLyPct: i.vsLyPct,
    };
  });

  const latestActual = db.prepare('SELECT MAX(date) AS d FROM daily_meals WHERE date < ?').get(getTodayISO()).d;
  res.json({ month, rows, summary: summarize(items), latestActualDate: latestActual, expectedDate: getYesterdayISO() });
});

/* ---------- Excel template: Plan + LY in WIDE MATRIX format (each day is 1 column) ---------- */
router.get('/template', async (req, res) => {
  const period = req.query.period === 'year' ? 'year' : 'month';
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : getTodayISO().slice(0, 7);
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : month.slice(0, 4);
  const start = period === 'year' ? `${year}-01-01` : monthBounds(month).first;
  const end = period === 'year' ? `${year}-12-31` : monthBounds(month).last;

  const locations = getScopedLocations(req.user, req.query.block || 'ALL');
  const existing = new Map(
    db
      .prepare('SELECT * FROM daily_plans WHERE date >= ? AND date <= ?')
      .all(start, end)
      .map((r) => [`${r.code_number}|${r.date}`, r])
  );

  const dates = dateList(start, end, 370);
  const planYear = Number(year);
  const lyYear = planYear - 1;
  const toPlanDateFromLy = (lyDate) => `${planYear}${lyDate.slice(4)}`;
  const lyDates = dates.map((d) => `${lyYear}${d.slice(4)}`);

  const wb = new ExcelJS.Workbook();

  // 4 Wide Matrix Sheets (each row = 1 kitchen, each column = 1 day)
  // Sheets 1 & 2 use Plan Year (e.g. 2026-11-01..30); Sheets 3 & 4 use Last Year (e.g. 2025-11-01..30)
  addWideMetricSheet(wb, '1_KH_SuatAn', 'FF1E40AF', locations, dates, (code, d) => existing.get(`${code}|${d}`)?.plan_meals ?? null);
  addWideMetricSheet(wb, '2_KH_DoanhThu', 'FF1D4ED8', locations, dates, (code, d) => existing.get(`${code}|${d}`)?.plan_revenue ?? null);
  addWideMetricSheet(wb, '3_NamTruoc_SuatAn', 'FF475569', locations, lyDates, (code, lyD) => existing.get(`${code}|${toPlanDateFromLy(lyD)}`)?.ly_meals ?? null);
  addWideMetricSheet(wb, '4_NamTruoc_DoanhThu', 'FF334155', locations, lyDates, (code, lyD) => existing.get(`${code}|${toPlanDateFromLy(lyD)}`)?.ly_revenue ?? null);

  // Sheet 5: Combined wide sheet with `metric` column (ideal for 1-tab Google Sheet sync)
  const wsCombo = wb.addWorksheet('5_Gop_GoogleSheet');
  wsCombo.columns = [
    { header: 'code_number', key: 'code_number', width: 15 },
    { header: 'location_name', key: 'location_name', width: 26 },
    { header: 'operating_block', key: 'operating_block', width: 16 },
    { header: 'metric', key: 'metric', width: 16 },
    ...dates.map((d) => ({ header: d, key: d, width: 13 })),
  ];
  styleHeader(wsCombo, 'FF0F766E');

  const metricDefs = [
    { code: 'KH_SUAT', field: 'plan_meals' },
    { code: 'KH_DOANHTHU', field: 'plan_revenue' },
    { code: 'NT_SUAT', field: 'ly_meals' },
    { code: 'NT_DOANHTHU', field: 'ly_revenue' },
  ];
  for (const mDef of metricDefs) {
    for (const loc of locations) {
      const rowData = {
        code_number: loc.code_number,
        location_name: loc.location_name,
        operating_block: loc.operating_block,
        metric: mDef.code,
      };
      for (const d of dates) {
        rowData[d] = existing.get(`${loc.code_number}|${d}`)?.[mDef.field] ?? null;
      }
      wsCombo.addRow(rowData);
    }
  }
  for (let c = 5; c <= 4 + dates.length; c++) {
    wsCombo.getColumn(c).numFmt = '#,##0';
  }

  addGuideSheet(wb, [
    'HƯỚNG DẪN NHẬP BIỂU MẪU DẠNG CỘT (MỖI NGÀY 1 CỘT)',
    '• Mỗi dòng = 1 Bếp. Các cột từ trái sang phải là từng ngày trong tháng/năm (VD: 2026-11-01, 2026-11-02...).',
    '• Cột "Tổng cộng" tự động cộng tổng tất cả các ngày trong kỳ bằng công thức SUM.',
    '• File có sẵn 4 sheet tách riêng theo 4 chỉ tiêu:',
    '   1. 1_KH_SuatAn: Kế hoạch suất ăn theo ngày',
    '   2. 2_KH_DoanhThu: Kế hoạch doanh thu theo ngày (VNĐ)',
    '   3. 3_NamTruoc_SuatAn: Thực tế suất ăn cùng ngày năm trước',
    '   4. 4_NamTruoc_DoanhThu: Thực tế doanh thu cùng ngày năm trước (VNĐ)',
    '• Ngoài ra Sheet "5_Gop_GoogleSheet" gộp cả 4 chỉ tiêu vào 1 bảng (nhờ cột metric = KH_SUAT / KH_DOANHTHU / NT_SUAT / NT_DOANHTHU) để tiện dán lên 1 tab Google Sheet.',
    '• Khi Import lại file Excel này, hệ thống tự động đọc tất cả các sheet có dữ liệu (ô trống sẽ giữ nguyên dữ liệu cũ).',
  ]);

  const fname = period === 'year' ? `Mau_Cot_KeHoach_NamTruoc_${year}.xlsx` : `Mau_Cot_KeHoach_NamTruoc_${month}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  await wb.xlsx.write(res);
  res.end();
});

/* ---------- Excel template: Actual D-1 in WIDE MATRIX format (each day is 1 column) ---------- */
router.get('/actual-template', async (req, res) => {
  const yesterday = getYesterdayISO();
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : yesterday.slice(0, 7);
  const b = monthBounds(month);
  const start = req.query.startDate || b.first;
  const end = req.query.endDate || b.last;

  const locations = getScopedLocations(req.user, req.query.block || 'ALL');
  const existing = new Map(
    db
      .prepare('SELECT * FROM daily_meals WHERE date >= ? AND date <= ?')
      .all(start, end)
      .map((r) => [`${r.code_number}|${r.date}`, r])
  );

  const dates = dateList(start, end, 62);
  const wb = new ExcelJS.Workbook();

  addWideMetricSheet(wb, '1_TT_SuatAn', 'FF0F766E', locations, dates, (code, d) => existing.get(`${code}|${d}`)?.actual_meals ?? null);
  addWideMetricSheet(wb, '2_TT_DoanhThu', 'FF0D9488', locations, dates, (code, d) => existing.get(`${code}|${d}`)?.actual_revenue ?? null);

  const wsCombo = wb.addWorksheet('3_Gop_GoogleSheet');
  wsCombo.columns = [
    { header: 'code_number', key: 'code_number', width: 15 },
    { header: 'location_name', key: 'location_name', width: 26 },
    { header: 'operating_block', key: 'operating_block', width: 16 },
    { header: 'metric', key: 'metric', width: 16 },
    ...dates.map((d) => ({ header: d, key: d, width: 13 })),
  ];
  styleHeader(wsCombo, 'FF1E40AF');

  for (const mDef of [
    { code: 'TT_SUAT', field: 'actual_meals' },
    { code: 'TT_DOANHTHU', field: 'actual_revenue' },
  ]) {
    for (const loc of locations) {
      const rowData = {
        code_number: loc.code_number,
        location_name: loc.location_name,
        operating_block: loc.operating_block,
        metric: mDef.code,
      };
      for (const d of dates) {
        rowData[d] = existing.get(`${loc.code_number}|${d}`)?.[mDef.field] ?? null;
      }
      wsCombo.addRow(rowData);
    }
  }
  for (let c = 5; c <= 4 + dates.length; c++) {
    wsCombo.getColumn(c).numFmt = '#,##0';
  }

  addGuideSheet(wb, [
    'HƯỚNG DẪN NHẬP THỰC TẾ D-1 DẠNG CỘT (MỖI NGÀY 1 CỘT)',
    '• Mỗi dòng = 1 Bếp. Mỗi cột = 1 ngày trong tháng (VD: 2026-11-01, 2026-11-02...).',
    '• Sheet "1_TT_SuatAn": Nhập số suất ăn thực tế từng ngày.',
    '• Sheet "2_TT_DoanhThu": Nhập doanh thu thực tế từng ngày (nếu bỏ trống hệ thống tự tính = Suất × Đơn giá).',
    '• Sheet "3_Gop_GoogleSheet": Dạng gộp có cột metric (TT_SUAT / TT_DOANHTHU) để dùng trên 1 tab Google Sheet.',
    '• Quy tắc D-1: Các cột ngày >= hôm nay sẽ tự động được bỏ qua khi import.',
  ]);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Mau_Cot_ThucTe_${month}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

/* ---------- Upload ---------- */
router.post('/upload', requireRole('admin', 'block_manager'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Vui lòng chọn file Excel (.xlsx) hoặc CSV.' });
  try {
    const sheets = await readWorkbookSheets(req.file.buffer, req.file.originalname);
    res.json(importPlanRecords(sheets, req.user, { fallbackMonth: req.body.month || '' }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/actual-upload', requireRole('admin', 'block_manager', 'site_staff'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Vui lòng chọn file Excel (.xlsx) hoặc CSV.' });
  try {
    const sheets = await readWorkbookSheets(req.file.buffer, req.file.originalname);
    const fallbackDate = req.body.date || getYesterdayISO();
    res.json(
      importActualRecords(sheets, req.user, {
        fallbackDate,
        fallbackMonth: req.body.month || fallbackDate.slice(0, 7),
      })
    );
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------- Google Sheet sync ---------- */
router.get('/sync-configs', (req, res) => {
  const rows = db.prepare('SELECT * FROM data_sync_configs ORDER BY id DESC').all();
  res.json({ configs: rows.map((r) => ({ ...r, auto_sync_enabled: Boolean(r.auto_sync_enabled) })) });
});

router.put('/sync-configs/:id', requireRole('admin'), (req, res) => {
  const cfg = db.prepare('SELECT * FROM data_sync_configs WHERE id = ?').get(req.params.id);
  if (!cfg) return res.status(404).json({ error: 'Không tìm thấy cấu hình.' });
  const {
    sheet_url = cfg.sheet_url,
    auto_sync_enabled = Boolean(cfg.auto_sync_enabled),
    sync_interval_minutes = cfg.sync_interval_minutes,
    recent_days = cfg.recent_days,
  } = req.body || {};
  db.prepare(`
    UPDATE data_sync_configs SET sheet_url = ?, auto_sync_enabled = ?, sync_interval_minutes = ?, recent_days = ? WHERE id = ?
  `).run(
    String(sheet_url).trim(),
    auto_sync_enabled ? 1 : 0,
    Math.max(5, Number(sync_interval_minutes) || 60),
    Math.max(0, Number(recent_days) || 0),
    cfg.id
  );
  res.json({ message: `Đã lưu cấu hình "${cfg.name}".` });
});

router.post('/sync-now/:id', requireRole('admin'), async (req, res) => {
  try {
    const result = await runDataSync(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------- Data completeness check for D-1 ---------- */
router.get('/d1-status', (req, res) => {
  const date = req.query.date || getYesterdayISO();
  const locations = getScopedLocations(req.user, req.query.block || 'ALL');
  const reported = new Set(
    db.prepare('SELECT code_number FROM daily_meals WHERE date = ?').all(date).map((r) => r.code_number)
  );
  const missing = locations.filter((l) => !reported.has(l.code_number));
  res.json({
    date,
    total: locations.length,
    reported: locations.length - missing.length,
    missing: missing.map((l) => ({
      code_number: l.code_number,
      location_name: l.location_name,
      operating_block: l.operating_block,
      am_name: l.am_name,
    })),
    previousDate: shiftDateISO(date, -1),
  });
});

module.exports = router;
