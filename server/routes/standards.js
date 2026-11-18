const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { db } = require('../db');
const { requireAuth, requireRole, getScopedLocations, canAccessLocation } = require('../auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

router.get('/', (req, res) => {
  const { block = '' } = req.query;
  const locations = getScopedLocations(req.user, block);
  const allBlocks = [...new Set(getScopedLocations(req.user).map((l) => l.operating_block))];
  res.json({ locations, blocks: allBlocks });
});

router.post('/', requireRole('admin', 'block_manager'), (req, res) => {
  const {
    code_number,
    location_name,
    operating_block,
    unit_price,
    profit_margin_pct,
    planned_daily_meals,
    planned_monthly_meals,
    planned_monthly_revenue,
    planned_monthly_profit,
  } = req.body || {};

  if (!code_number || !location_name || !operating_block) {
    return res.status(400).json({ error: 'Thiếu code_number, location_name hoặc operating_block.' });
  }

  const candidate = { code_number: String(code_number).trim(), operating_block: String(operating_block).trim() };
  if (!canAccessLocation(req.user, candidate)) {
    return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa địa điểm thuộc khối này.' });
  }

  const price = Number(unit_price) || 0;
  const margin = Number(profit_margin_pct) || 0;
  const daily = Number(planned_daily_meals) || 0;
  const monthlyMeals = Number(planned_monthly_meals) || daily * 26;
  const monthlyRev = Number(planned_monthly_revenue) || monthlyMeals * price;
  const monthlyProfit = Number(planned_monthly_profit) || Math.round(monthlyRev * (margin / 100));

  db.prepare(`
    INSERT INTO locations (
      code_number, location_name, operating_block, unit_price, profit_margin_pct,
      planned_daily_meals, planned_monthly_meals, planned_monthly_revenue, planned_monthly_profit, is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
    ON CONFLICT(code_number) DO UPDATE SET
      location_name = excluded.location_name,
      operating_block = excluded.operating_block,
      unit_price = excluded.unit_price,
      profit_margin_pct = excluded.profit_margin_pct,
      planned_daily_meals = excluded.planned_daily_meals,
      planned_monthly_meals = excluded.planned_monthly_meals,
      planned_monthly_revenue = excluded.planned_monthly_revenue,
      planned_monthly_profit = excluded.planned_monthly_profit,
      is_active = 1,
      updated_at = datetime('now', 'localtime')
  `).run(
    candidate.code_number,
    String(location_name).trim(),
    candidate.operating_block,
    price,
    margin,
    daily,
    monthlyMeals,
    monthlyRev,
    monthlyProfit
  );

  const saved = db.prepare('SELECT * FROM locations WHERE code_number = ?').get(candidate.code_number);
  res.json({ location: saved });
});

router.delete('/:code', requireRole('admin'), (req, res) => {
  db.prepare('UPDATE locations SET is_active = 0 WHERE code_number = ?').run(req.params.code);
  res.json({ message: 'Đã ngưng kích hoạt địa điểm.' });
});

router.get('/template', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('TieuChuan_KeHoach');

  sheet.columns = [
    { header: 'code_number', key: 'code_number', width: 16 },
    { header: 'location_name', key: 'location_name', width: 34 },
    { header: 'operating_block', key: 'operating_block', width: 20 },
    { header: 'unit_price', key: 'unit_price', width: 16 },
    { header: 'profit_margin_pct', key: 'profit_margin_pct', width: 18 },
    { header: 'planned_daily_meals', key: 'planned_daily_meals', width: 20 },
    { header: 'planned_monthly_meals', key: 'planned_monthly_meals', width: 22 },
    { header: 'planned_monthly_revenue', key: 'planned_monthly_revenue', width: 24 },
    { header: 'planned_monthly_profit', key: 'planned_monthly_profit', width: 24 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

  const current = getScopedLocations(req.user);
  for (const loc of current) {
    sheet.addRow(loc);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Mau_Upload_Tieu_Chuan_Ke_Hoach.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

router.post('/upload', requireRole('admin', 'block_manager'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Vui lòng chọn file Excel (.xlsx).' });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return res.status(400).json({ error: 'File Excel không có sheet dữ liệu.' });
    }

    const headerRow = sheet.getRow(1);
    const colMap = {};
    headerRow.eachCell((cell, colNum) => {
      const key = String(cell.value || '').trim().toLowerCase();
      colMap[key] = colNum;
    });

    if (!colMap.code_number || !colMap.location_name || !colMap.operating_block) {
      return res.status(400).json({
        error: 'File Excel thiếu cột bắt buộc: code_number, location_name, operating_block.',
      });
    }

    const upsert = db.prepare(`
      INSERT INTO locations (
        code_number, location_name, operating_block, unit_price, profit_margin_pct,
        planned_daily_meals, planned_monthly_meals, planned_monthly_revenue, planned_monthly_profit, is_active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
      ON CONFLICT(code_number) DO UPDATE SET
        location_name = excluded.location_name,
        operating_block = excluded.operating_block,
        unit_price = excluded.unit_price,
        profit_margin_pct = excluded.profit_margin_pct,
        planned_daily_meals = excluded.planned_daily_meals,
        planned_monthly_meals = excluded.planned_monthly_meals,
        planned_monthly_revenue = excluded.planned_monthly_revenue,
        planned_monthly_profit = excluded.planned_monthly_profit,
        is_active = 1,
        updated_at = datetime('now', 'localtime')
    `);

    let count = 0;
    const skipped = [];

    db.exec('BEGIN');
    try {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const code = String(row.getCell(colMap.code_number).value || '').trim();
        const name = String(row.getCell(colMap.location_name).value || '').trim();
        const block = String(row.getCell(colMap.operating_block).value || '').trim();
        if (!code || !name || !block) return;

        if (!canAccessLocation(req.user, { code_number: code, operating_block: block })) {
          skipped.push(code);
          return;
        }

        const price = Number(colMap.unit_price ? row.getCell(colMap.unit_price).value : 35000) || 0;
        const margin = Number(colMap.profit_margin_pct ? row.getCell(colMap.profit_margin_pct).value : 15) || 0;
        const daily = Number(colMap.planned_daily_meals ? row.getCell(colMap.planned_daily_meals).value : 0) || 0;
        const monthlyMeals = Number(colMap.planned_monthly_meals ? row.getCell(colMap.planned_monthly_meals).value : 0) || daily * 26;
        const monthlyRev = Number(colMap.planned_monthly_revenue ? row.getCell(colMap.planned_monthly_revenue).value : 0) || monthlyMeals * price;
        const monthlyProfit = Number(colMap.planned_monthly_profit ? row.getCell(colMap.planned_monthly_profit).value : 0) || Math.round(monthlyRev * (margin / 100));

        upsert.run(code, name, block, price, margin, daily, monthlyMeals, monthlyRev, monthlyProfit);
        count++;
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({
      message: `Đã cập nhật ${count} địa điểm tiêu chuẩn.`,
      updatedCount: count,
      skippedUnauthorized: skipped,
    });
  } catch (err) {
    res.status(400).json({ error: `Lỗi đọc file Excel: ${err.message}` });
  }
});

module.exports = router;
