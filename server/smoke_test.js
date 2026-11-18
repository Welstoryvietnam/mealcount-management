const { spawn } = require('node:child_process');
const path = require('node:path');

const nodeExe = process.execPath;
const serverPath = path.join(__dirname, 'index.js');
const srv = spawn(nodeExe, [serverPath], {
  env: { ...process.env, PORT: '3099' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

srv.stderr.on('data', (d) => process.stderr.write(d));

async function runTests() {
  const base = 'http://127.0.0.1:3099';
  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  console.log('HEALTH:', health.status);

  const loginAdmin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  }).then((r) => r.json());
  console.log('ADMIN_LOGIN:', Boolean(loginAdmin.token));

  const dashAdmin = await fetch(`${base}/api/dashboard`, {
    headers: { Authorization: `Bearer ${loginAdmin.token}` },
  }).then((r) => r.json());
  console.log('ADMIN_LOCS:', dashAdmin.summary.locationCount, 'ALERTS:', dashAdmin.summary.alertCount, 'BLOCK_TRENDS:', dashAdmin.blockTrends.length);

  const execRep = await fetch(`${base}/api/dashboard/exec-report`, {
    headers: { Authorization: `Bearer ${loginAdmin.token}` },
  }).then((r) => r.json());
  console.log('EXEC_REPORT_BLOCKS:', execRep.blockRows.length, 'KITCHENS:', execRep.kitchenRows.length, 'COMPLETION_PCT:', execRep.companySummary.completionRatePct);

  const dashMonth = await fetch(`${base}/api/dashboard?mode=month&month=2026-11`, {
    headers: { Authorization: `Bearer ${loginAdmin.token}` },
  }).then((r) => r.json());
  console.log('MONTH_TREND_DAYS:', dashMonth.weeklyTrend.length, 'ACTUAL_SUM:', dashMonth.summary.actualMeals, 'PLAN_FULL:', dashMonth.summary.planMealsFull);

  const planSum = await fetch(`${base}/api/plans/summary?month=2026-11`, {
    headers: { Authorization: `Bearer ${loginAdmin.token}` },
  }).then((r) => r.json());
  console.log('PLAN_SUM_ROWS:', planSum.rows.length, 'LY_MEALS_FULL:', planSum.summary.lyMealsFull);

  const planTpl = await fetch(`${base}/api/plans/template?period=month&month=2026-11`, {
    headers: { Authorization: `Bearer ${loginAdmin.token}` },
  });
  const planBuf = Buffer.from(await planTpl.arrayBuffer());
  console.log('PLAN_TEMPLATE_OK:', planTpl.status === 200 && planBuf.subarray(0, 2).toString() === 'PK', 'BYTES:', planBuf.length);

  const { readWorkbookSheets } = require('./utils/importer');
  const sheets = await readWorkbookSheets(planBuf, 'Mau_Cot_KeHoach_NamTruoc_2026-11.xlsx');
  console.log('WIDE_SHEETS_COUNT:', sheets.length, 'KH_FIRST_DATE:', sheets[0]?.headers?.[4], 'LY_FIRST_DATE:', sheets[2]?.headers?.[4]);

  const loginBac = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'sm.fs1', password: 'Manager@123' }),
  }).then((r) => r.json());
  const dashBac = await fetch(`${base}/api/dashboard`, {
    headers: { Authorization: `Bearer ${loginBac.token}` },
  }).then((r) => r.json());
  console.log('FS1_LOCS:', dashBac.summary.locationCount, 'BLOCKS:', JSON.stringify(dashBac.blocks));

  const excelResp = await fetch(`${base}/api/reports/excel`, {
    headers: { Authorization: `Bearer ${loginAdmin.token}` },
  });
  const buf = Buffer.from(await excelResp.arrayBuffer());
  console.log('EXCEL_OK:', excelResp.status === 200 && buf.subarray(0, 2).toString() === 'PK', 'BYTES:', buf.length);

  const alertPrev = await fetch(`${base}/api/alerts/preview`, {
    headers: { Authorization: `Bearer ${loginAdmin.token}` },
  }).then((r) => r.json());
  console.log('ALERT_PREVIEW_COUNT:', alertPrev.alertCount);

  const orgRes = await fetch(`${base}/api/org`, {
    headers: { Authorization: `Bearer ${loginAdmin.token}` },
  }).then((r) => r.json());
  console.log('ORG_UNITS:', orgRes.units.length, 'LOCS:', orgRes.locations.length);

  const nonAdminOrgPost = await fetch(`${base}/api/org/units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginBac.token}` },
    body: JSON.stringify({ code: 'TEST', name: 'Test' }),
  });
  console.log('NON_ADMIN_ORG_FORBIDDEN:', nonAdminOrgPost.status === 403);
}

let started = false;
srv.stdout.on('data', async (chunk) => {
  const msg = chunk.toString();
  process.stdout.write(msg);
  if (!started && msg.includes('listening')) {
    started = true;
    try {
      await runTests();
    } catch (err) {
      console.error('TEST_FAILED:', err);
      process.exitCode = 1;
    } finally {
      srv.kill();
    }
  }
});

setTimeout(() => {
  if (!started) {
    console.error('Server did not start in time');
    srv.kill();
    process.exit(1);
  }
}, 25000);
