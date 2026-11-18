const express = require('express');
const ExcelJS = require('exceljs');
const { db } = require('../db');
const { requireAuth, getScopedLocations } = require('../auth');
const { computePeriod, monthBounds } = require('../services/metrics');
const { formatVND, getYesterdayISO, shiftDateISO } = require('../utils/calculations');

const router = express.Router();
router.use(requireAuth);

function buildReportData(user, date, block) {
  const locations = getScopedLocations(user, block);
  const startWeek = shiftDateISO(date, -6);
  const mb = monthBounds(date.slice(0, 7));

  const dayData = computePeriod(locations, date, date);
  const mtdData = computePeriod(locations, mb.first, date);
  const fullMonthData = computePeriod(locations, mb.first, mb.last);

  const mtdMap = new Map(mtdData.items.map((i) => [i.code_number, i]));
  const fullMonthMap = new Map(fullMonthData.items.map((i) => [i.code_number, i]));

  const weekRows = db
    .prepare('SELECT code_number, date, actual_meals FROM daily_meals WHERE date >= ? AND date <= ?')
    .all(startWeek, date);

  const rows = dayData.items.map((r) => {
    const mtd = mtdMap.get(r.code_number);
    const fm = fullMonthMap.get(r.code_number);
    return {
      ...r,
      mtdMeals: mtd ? mtd.actualMeals : 0,
      monthPlanMeals: fm ? fm.planMealsFull : 0,
      mtdRevenue: mtd ? mtd.actualRevenue : 0,
      monthPlanRevenue: fm ? fm.planRevenueFull : 0,
    };
  });

  return { rows, weekRows, startWeek };
}

router.get('/excel', async (req, res) => {
  const date = req.query.date || getYesterdayISO();
  const block = req.query.block || 'ALL';
  const { rows, weekRows } = buildReportData(req.user, date, block);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = req.user.full_name;
  workbook.created = new Date();

  const ws = workbook.addWorksheet('BaoCao_SuatAn_Ngay', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  ws.mergeCells('A1:P1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `BÁO CÁO QUẢN LÝ & CẢNH BÁO SUẤT ĂN D-1 (${date})`;
  titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:P2');
  ws.getCell('A2').value = `Khối/Ban: ${block === 'ALL' ? 'Tất cả khối được phân quyền' : block}   |   Người xuất: ${req.user.full_name}   |   Ngưỡng cảnh báo: Giảm từ 3% trở lên`;
  ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF334155' } };
  ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 20;

  ws.getRow(4).values = [
    'STT',
    'Code Number',
    'Tên Bếp / Địa Điểm',
    'Khối / Ban',
    'Ngày (D-1)',
    'KH Suất/Ngày',
    'Thực Tế Suất',
    'Năm Trước (Suất)',
    '% vs KH',
    '% vs Năm Trước',
    'Cảnh Báo (>3%)',
    'KH Doanh Thu',
    'Thực Tế Doanh Thu',
    'Ảnh Hưởng DT KH',
    'Ảnh Hưởng LN KH',
    'Lũy Kế Tháng / KH Tháng',
  ];

  const headerRow = ws.getRow(4);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 28 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 22 },
  ];

  let sumPlanned = 0;
  let sumActual = 0;
  let sumLy = 0;
  let sumPlanRev = 0;
  let sumActualRev = 0;
  let sumRevImpact = 0;
  let sumProfitImpact = 0;

  rows.forEach((r, idx) => {
    sumPlanned += r.planMealsFull;
    sumLy += r.lyMealsFull || 0;
    sumPlanRev += r.planRevenueFull;
    if (r.has_data) {
      sumActual += r.actualMeals;
      sumActualRev += r.actualRevenue;
      sumRevImpact += r.revenueImpact;
      sumProfitImpact += r.profitImpact;
    }

    const row = ws.addRow([
      idx + 1,
      r.code_number,
      r.location_name,
      r.operating_block,
      date,
      r.planMealsFull,
      r.has_data ? r.actualMeals : 0,
      r.lyMealsFull || 0,
      r.has_data ? r.variancePct / 100 : 0,
      r.has_data && r.vsLyPct !== null ? r.vsLyPct / 100 : 0,
      r.isAlert ? 'CẢNH BÁO GIẢM >3%' : r.has_data ? 'Bình thường' : 'Chưa nhập',
      r.planRevenueFull,
      r.has_data ? r.actualRevenue : 0,
      r.has_data ? r.revenueImpact : 0,
      r.has_data ? r.profitImpact : 0,
      `${r.mtdMeals.toLocaleString('vi-VN')} / ${r.monthPlanMeals.toLocaleString('vi-VN')}`,
    ]);

    [6, 7, 8, 12, 13].forEach((c) => (row.getCell(c).numFmt = '#,##0'));
    [14, 15].forEach((c) => (row.getCell(c).numFmt = '+#,##0;-#,##0;0'));
    [9, 10].forEach((c) => (row.getCell(c).numFmt = '+0.00%;-0.00%;0.00%'));

    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
      if (r.isAlert) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        if ([9, 11, 14, 15].includes(colNumber)) {
          cell.font = { bold: true, color: { argb: 'FFB91C1C' } };
        }
      }
    });
  });

  const totalVar = sumPlanned > 0 ? (sumActual - sumPlanned) / sumPlanned : 0;
  const totalLyVar = sumLy > 0 ? (sumActual - sumLy) / sumLy : 0;
  const totalRow = ws.addRow([
    '',
    'TỔNG CỘNG',
    `${rows.length} bếp`,
    '',
    date,
    sumPlanned,
    sumActual,
    sumLy,
    totalVar,
    totalLyVar,
    '',
    sumPlanRev,
    sumActualRev,
    sumRevImpact,
    sumProfitImpact,
    '',
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' } };
  });
  [6, 7, 8, 12, 13].forEach((c) => (totalRow.getCell(c).numFmt = '#,##0'));
  [14, 15].forEach((c) => (totalRow.getCell(c).numFmt = '+#,##0;-#,##0;0'));
  [9, 10].forEach((c) => (totalRow.getCell(c).numFmt = '+0.00%;-0.00%;0.00%'));

  // Sheet 2: 7-day trend
  const ws2 = workbook.addWorksheet('XuHuong_7Ngay');
  const dates = [];
  for (let i = -6; i <= 0; i++) dates.push(shiftDateISO(date, i));

  ws2.addRow(['Code Number', 'Tên Bếp', 'Khối / Ban', 'KH Ngày', ...dates]);
  ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  ws2.columns = [
    { width: 14 },
    { width: 28 },
    { width: 18 },
    { width: 12 },
    ...dates.map(() => ({ width: 13 })),
  ];

  const weekMap = new Map(weekRows.map((w) => [`${w.code_number}|${w.date}`, w.actual_meals]));
  for (const r of rows) {
    ws2.addRow([
      r.code_number,
      r.location_name,
      r.operating_block,
      r.planMealsFull,
      ...dates.map((d) => weekMap.get(`${r.code_number}|${d}`) ?? 0),
    ]);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="BaoCao_SuatAn_${date}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

router.get('/email-preview', (req, res) => {
  const date = req.query.date || getYesterdayISO();
  const block = req.query.block || 'ALL';
  const { rows } = buildReportData(req.user, date, block);

  const alerts = rows.filter((r) => r.isAlert);
  const totalPlanned = rows.reduce((s, r) => s + r.planMealsFull, 0);
  const totalActual = rows.reduce((s, r) => s + (r.has_data ? r.actualMeals : 0), 0);
  const totalRevImpact = rows.reduce((s, r) => s + (r.has_data ? r.revenueImpact : 0), 0);
  const totalProfitImpact = rows.reduce((s, r) => s + (r.has_data ? r.profitImpact : 0), 0);

  const emailConfig = db.prepare("SELECT * FROM webhook_configs WHERE id = 'email-default'").get();
  let extra = {};
  try {
    extra = JSON.parse(emailConfig?.extra_json || '{}');
  } catch {}

  const subject = `[Báo Cáo Suất Ăn D-1] Ngày ${date} - ${alerts.length} bếp cảnh báo giảm >3%`;
  const lines = [
    `Kính gửi Ban Điều Hành,`,
    ``,
    `Hệ thống xin gửi báo cáo tổng hợp suất ăn ngày ${date} (D-1) - Phạm vi: ${block === 'ALL' ? 'Tất cả khối' : block}:`,
    `- Tổng suất kế hoạch: ${totalPlanned.toLocaleString('vi-VN')} suất`,
    `- Tổng suất thực tế: ${totalActual.toLocaleString('vi-VN')} suất`,
    `- Ảnh hưởng Doanh thu KH: ${formatVND(totalRevImpact)}`,
    `- Ảnh hưởng Lợi nhuận KH: ${formatVND(totalProfitImpact)}`,
    `- Số bếp giảm >3% so với kế hoạch: ${alerts.length} bếp`,
    ``,
    ...(alerts.length > 0
      ? [
          `CHI TIẾT BẾP CẢNH BÁO:`,
          ...alerts.map(
            (a) =>
              `• [${a.code_number}] ${a.location_name} (${a.operating_block}): ${a.actualMeals}/${a.planMeals} suất (${a.variancePct}%) | DT: ${formatVND(a.revenueImpact)} | LN: ${formatVND(a.profitImpact)}`
          ),
        ]
      : [`Không có bếp nào giảm quá 3% trong ngày ${date}.`]),
    ``,
    `File đính kèm: BaoCao_SuatAn_${date}.xlsx`,
    `Trân trọng,`,
    `Hệ thống Mealcount Management`,
  ];

  res.json({
    recipients: extra.recipients || 'ban-dieu-hanh@company.vn',
    subject,
    body: lines.join('\n'),
    attachmentName: `BaoCao_SuatAn_${date}.xlsx`,
  });
});

module.exports = router;
