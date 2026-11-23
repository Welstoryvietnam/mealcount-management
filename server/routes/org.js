const express = require('express');
const ExcelJS = require('exceljs');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function normalizeGoogleSheetCsvUrl(rawUrl, gid = '0') {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (url.includes('output=csv') || url.includes('format=csv')) {
    return url;
  }
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    const gidMatch = url.match(/gid=(\d+)/);
    const targetGid = gidMatch ? gidMatch[1] : (gid || '0');
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${targetGid}`;
  }
  return url;
}

function syncUserBlockPermission(userId, blockName) {
  if (!userId || !blockName) return;
  const user = db.prepare('SELECT role, allowed_blocks FROM users WHERE id = ?').get(userId);
  if (!user || user.role === 'admin') return;
  let blocks = [];
  try {
    blocks = JSON.parse(user.allowed_blocks);
  } catch {}
  if (!Array.isArray(blocks)) blocks = [];
  if (!blocks.includes('*') && !blocks.includes(blockName)) {
    blocks.push(blockName);
    db.prepare('UPDATE users SET allowed_blocks = ? WHERE id = ?').run(JSON.stringify(blocks), userId);
  }
}

function syncUserLocationPermissions(userId, locationCodes) {
  if (!userId) return;
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  if (!user || user.role === 'admin') return;
  const codes = locationCodes.length ? locationCodes : ['*'];
  db.prepare('UPDATE users SET allowed_locations = ? WHERE id = ?').run(JSON.stringify(codes), userId);
}

async function performGoogleSheetSync() {
  const cfg = db.prepare('SELECT * FROM org_sync_config WHERE id = 1').get();
  if (!cfg || !cfg.sheet_url) {
    throw new Error('Chưa cấu hình URL Google Sheet.');
  }

  const csvUrl = normalizeGoogleSheetCsvUrl(cfg.sheet_url, cfg.sheet_gid);
  const resp = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) {
    throw new Error(`Không thể tải Google Sheet (HTTP ${resp.status}). Hãy đảm bảo Sheet đã bật chia sẻ "Bất kỳ ai có đường liên kết đều có thể xem".`);
  }

  const csvText = await resp.text();
  if (/^\s*<(!DOCTYPE|html)/i.test(csvText)) {
    throw new Error('Google Sheet trả về trang đăng nhập HTML. Vui lòng bật quyền "Anyone with the link can view" hoặc Publish to web (CSV).');
  }

  const rows = parseCSV(csvText.replace(/^\uFEFF/, ''));
  if (rows.length < 2) {
    throw new Error('File Google Sheet không có dữ liệu (cần ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu).');
  }

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const findCol = (...aliases) => headers.findIndex((h) => aliases.includes(h));

  const idxLocCode = findCol('code_number', 'mã bếp', 'ma_bep', 'ma bep', 'ma_dia_diem');
  const idxBlock = findCol('operating_block', 'ban', 'name', 'tên khối/ban/phòng', 'ten_ban');
  const idxLocName = findCol('location_name', 'địa điểm', 'ten_bep', 'tên bếp', 'ten_dia_diem');
  const idxIndustry = findCol('ngành nghề', 'nganh nghe', 'industry', 'ngành', 'nganh');
  const idxGroup = findCol('group a/b', 'a/b', 'nhóm a/b', 'nhom a/b', 'group', 'group_ab', 'nhóm', 'nhom');
  const idxSm = findCol('sm quản lý', 'sm', 'sm_name', 'leader_name', 'người phụ trách');
  const idxAm = findCol('am quản lý', 'am', 'am_name', 'quản lý vùng');
  const idxPhone = findCol('sdt', 'sđt', 'phone', 'số điện thoại');
  const idxSmUser = findCol('sm_username', 'tai_khoan_sm');
  const idxAmUser = findCol('am_username', 'tai_khoan_am');

  if (idxLocCode === -1 || idxBlock === -1) {
    throw new Error('Google Sheet thiếu cột bắt buộc: code_number (Mã bếp) và operating_block (Ban).');
  }

  const cell = (r, idx) => (idx !== -1 ? String(r[idx] || '').trim() : '');

  const users = db.prepare('SELECT id, username, full_name FROM users WHERE is_active = 1').all();
  const userByUsername = new Map(users.map((u) => [u.username.toLowerCase(), u]));
  const userByName = new Map(users.map((u) => [u.full_name.toLowerCase(), u]));
  const findUser = (username, fullName) =>
    (username && userByUsername.get(username.toLowerCase())) ||
    (fullName && userByName.get(fullName.toLowerCase())) ||
    null;

  const getOrg = db.prepare('SELECT id, code, name FROM org_units WHERE name = ?');
  const insertOrg = db.prepare(`
    INSERT INTO org_units (code, name, unit_type, sm_user_id, leader_name, is_active, updated_at)
    VALUES (?, ?, 'Ban', ?, ?, 1, datetime('now', 'localtime'))
  `);
  const updateOrg = db.prepare(`
    UPDATE org_units
    SET leader_name = CASE WHEN ? != '' THEN ? ELSE leader_name END,
        sm_user_id = COALESCE(?, sm_user_id),
        is_active = 1,
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `);
  const codeTaken = db.prepare('SELECT 1 FROM org_units WHERE code = ?');

  const getLoc = db.prepare('SELECT code_number FROM locations WHERE code_number = ?');
  const insertLoc = db.prepare(`
    INSERT INTO locations (
      code_number, location_name, operating_block, unit_price, profit_margin_pct,
      planned_daily_meals, planned_monthly_meals, planned_monthly_revenue, planned_monthly_profit,
      am_user_id, am_name, sm_name, industry, group_ab, phone, is_active
    ) VALUES (?, ?, ?, 35000, 15, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, 1)
  `);
  const updateLoc = db.prepare(`
    UPDATE locations
    SET location_name = CASE WHEN ? != '' THEN ? ELSE location_name END,
        operating_block = ?,
        am_user_id = CASE WHEN ? = 1 THEN ? ELSE am_user_id END,
        am_name = CASE WHEN ? = 1 THEN ? ELSE am_name END,
        sm_name = CASE WHEN ? = 1 THEN ? ELSE sm_name END,
        industry = CASE WHEN ? = 1 THEN ? ELSE industry END,
        group_ab = CASE WHEN ? = 1 THEN ? ELSE group_ab END,
        phone = CASE WHEN ? = 1 THEN ? ELSE phone END,
        is_active = 1,
        updated_at = datetime('now', 'localtime')
    WHERE code_number = ?
  `);

  const makeOrgCode = (name) => {
    const base =
      name.toUpperCase().replace(/^CHI NHÁNH\s+/i, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'UNIT';
    let code = base;
    let n = 2;
    while (codeTaken.get(code)) code = `${base}-${n++}`;
    return code;
  };

  const seenCodes = new Map();
  const amLocationsMap = new Map();
  const blocksTouched = new Set();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const renamed = [];

  db.exec('BEGIN');
  try {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      let locCode = cell(r, idxLocCode);
      const blockName = cell(r, idxBlock);
      if (!locCode || !blockName) {
        skipped++;
        continue;
      }

      // Mã bếp trùng trong sheet -> giữ cả 2 dòng
      const seen = (seenCodes.get(locCode) || 0) + 1;
      seenCodes.set(locCode, seen);
      if (seen > 1) {
        const newCode = `${locCode}-${seen}`;
        renamed.push(`${locCode} -> ${newCode}`);
        locCode = newCode;
      }

      const smName = cell(r, idxSm);
      const amName = cell(r, idxAm);
      const smUser = findUser(cell(r, idxSmUser), smName);
      const amUser = findUser(cell(r, idxAmUser), amName);

      const org = getOrg.get(blockName);
      if (!org) {
        insertOrg.run(makeOrgCode(blockName), blockName, smUser ? smUser.id : null, smName);
      } else if (!blocksTouched.has(blockName)) {
        updateOrg.run(smName, smName, smUser ? smUser.id : null, org.id);
      }
      blocksTouched.add(blockName);
      if (smUser) syncUserBlockPermission(smUser.id, blockName);

      const locName = cell(r, idxLocName);
      const industry = cell(r, idxIndustry);
      const groupAb = cell(r, idxGroup).toUpperCase();
      const phone = cell(r, idxPhone);
      const amId = amUser ? amUser.id : null;

      if (getLoc.get(locCode)) {
        updateLoc.run(
          locName,
          locName,
          blockName,
          idxAm !== -1 || idxAmUser !== -1 ? 1 : 0,
          amId,
          idxAm !== -1 ? 1 : 0,
          amName,
          idxSm !== -1 ? 1 : 0,
          smName,
          idxIndustry !== -1 ? 1 : 0,
          industry,
          idxGroup !== -1 ? 1 : 0,
          groupAb,
          idxPhone !== -1 ? 1 : 0,
          phone,
          locCode
        );
        updated++;
      } else {
        insertLoc.run(locCode, locName || locCode, blockName, amId, amName, smName, industry, groupAb, phone);
        created++;
      }

      if (amUser) {
        if (!amLocationsMap.has(amUser.id)) amLocationsMap.set(amUser.id, []);
        amLocationsMap.get(amUser.id).push(locCode);
      }
    }

    for (const [amUserId, codes] of amLocationsMap.entries()) {
      syncUserLocationPermissions(amUserId, [...new Set(codes)]);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const extra = [];
  if (renamed.length) extra.push(`mã trùng đã tách: ${renamed.join(', ')}`);
  if (skipped) extra.push(`bỏ qua ${skipped} dòng thiếu mã bếp/ban`);
  const msg =
    `Đồng bộ thành công: ${blocksTouched.size} Ban, thêm mới ${created} bếp, cập nhật ${updated} bếp` +
    `${extra.length ? ` (${extra.join('; ')})` : ''}.`;
  db.prepare(`
    UPDATE org_sync_config
    SET last_sync_at = datetime('now', 'localtime'),
        last_sync_status = 'success',
        last_sync_message = ?
    WHERE id = 1
  `).run(msg);

  return { unitCount: blocksTouched.size, created, updated, locUpdated: created + updated, message: msg };
}

async function pushOrgToGoogleSheet() {
  const cfg = db.prepare('SELECT * FROM org_sync_config WHERE id = 1').get();
  const webhookUrl = String((cfg && cfg.push_webhook_url) || '').trim();
  if (!webhookUrl) {
    throw new Error('Chưa cấu hình URL Google Apps Script Web App để đẩy dữ liệu lên Google Sheet.');
  }

  const headers = [
    'code_number',
    'operating_block',
    'location_name',
    'Ngành nghề',
    'Group A/B',
    'SM quản lý',
    'AM quản lý',
    'SDT',
  ];

  const rows = db
    .prepare(`
      SELECT l.code_number, l.operating_block, l.location_name, l.industry, l.group_ab,
             COALESCE(NULLIF(l.sm_name, ''), o.leader_name, '') AS sm_name,
             l.am_name, l.phone
      FROM locations l
      LEFT JOIN org_units o ON l.operating_block = o.name AND o.is_active = 1
      WHERE l.is_active = 1
      ORDER BY l.operating_block, l.code_number
    `)
    .all()
    .map((r) => [
      r.code_number || '',
      r.operating_block || '',
      r.location_name || '',
      r.industry || '',
      r.group_ab || '',
      r.sm_name || '',
      r.am_name || '',
      r.phone || '',
    ]);

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({ action: 'replace_org', headers, rows }),
    signal: AbortSignal.timeout(25000),
  });

  const respText = await resp.text();
  if (!resp.ok) {
    throw new Error(`Không thể đẩy lên Google Sheet (HTTP ${resp.status}): ${respText.slice(0, 150)}`);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(respText);
  } catch {}
  if (parsed && parsed.ok === false) {
    throw new Error(parsed.error || 'Apps Script báo lỗi khi ghi Google Sheet.');
  }

  const msg = `Đã đẩy thành công ${rows.length} dòng cơ cấu tổ chức lên Google Sheet.`;
  db.prepare(`
    UPDATE org_sync_config
    SET last_push_at = datetime('now', 'localtime'),
        last_push_status = 'success',
        last_push_message = ?
    WHERE id = 1
  `).run(msg);

  return { rowCount: rows.length, message: msg };
}

function triggerAutoPushIfConfigured() {
  const cfg = db.prepare('SELECT auto_push_enabled, push_webhook_url FROM org_sync_config WHERE id = 1').get();
  if (!cfg || !cfg.auto_push_enabled || !String(cfg.push_webhook_url || '').trim()) return;
  pushOrgToGoogleSheet().catch((err) => {
    console.error('[OrgAutoPush] Lỗi đẩy lên Google Sheet:', err.message);
    db.prepare(`
      UPDATE org_sync_config
      SET last_push_at = datetime('now', 'localtime'),
          last_push_status = 'error',
          last_push_message = ?
      WHERE id = 1
    `).run(err.message);
  });
}

router.get('/', (req, res) => {
  const units = db
    .prepare(`
      SELECT o.*, u.username AS sm_username, u.full_name AS sm_full_name
      FROM org_units o
      LEFT JOIN users u ON o.sm_user_id = u.id
      WHERE o.is_active = 1
      ORDER BY o.unit_type, o.code
    `)
    .all();

  const locations = db
    .prepare(`
      SELECT l.code_number, l.location_name, l.operating_block, l.am_user_id, l.am_name,
             l.sm_name, l.industry, l.group_ab, l.phone,
             u.username AS am_username, u.full_name AS am_full_name
      FROM locations l
      LEFT JOIN users u ON l.am_user_id = u.id
      WHERE l.is_active = 1
      ORDER BY l.operating_block, l.code_number
    `)
    .all();

  const users = db
    .prepare('SELECT id, username, full_name, role, is_active FROM users WHERE is_active = 1 ORDER BY id')
    .all();

  const syncConfig = db.prepare('SELECT * FROM org_sync_config WHERE id = 1').get();

  res.json({
    units,
    locations,
    users,
    syncConfig: syncConfig
      ? {
          ...syncConfig,
          auto_sync_enabled: Boolean(syncConfig.auto_sync_enabled),
          auto_push_enabled: Boolean(syncConfig.auto_push_enabled),
        }
      : null,
  });
});

router.post('/units', requireRole('admin'), (req, res) => {
  const { id, code, name, unit_type = 'Ban', sm_user_id, leader_name = '', description = '', sync_permission = true } = req.body || {};
  if (!code || !name) {
    return res.status(400).json({ error: 'Vui lòng nhập Mã và Tên Khối/Ban/Phòng.' });
  }
  if (!['Khối', 'Ban', 'Phòng'].includes(unit_type)) {
    return res.status(400).json({ error: 'Loại đơn vị phải là Khối, Ban hoặc Phòng.' });
  }

  let resolvedLeader = String(leader_name || '').trim();
  const smId = sm_user_id ? Number(sm_user_id) : null;
  if (smId && !resolvedLeader) {
    const smUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(smId);
    if (smUser) resolvedLeader = smUser.full_name;
  }

  try {
    if (id) {
      db.prepare(`
        UPDATE org_units
        SET code = ?, name = ?, unit_type = ?, sm_user_id = ?, leader_name = ?, description = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(String(code).trim(), String(name).trim(), unit_type, smId, resolvedLeader, String(description || '').trim(), Number(id));
    } else {
      db.prepare(`
        INSERT INTO org_units (code, name, unit_type, sm_user_id, leader_name, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(String(code).trim(), String(name).trim(), unit_type, smId, resolvedLeader, String(description || '').trim());
    }

    if (smId && sync_permission) {
      syncUserBlockPermission(smId, String(name).trim());
    }

    triggerAutoPushIfConfigured();
    res.json({ message: `Đã lưu đơn vị ${name}.` });
  } catch (err) {
    res.status(400).json({ error: `Lỗi lưu cơ cấu: ${err.message}` });
  }
});

router.delete('/units/:id', requireRole('admin'), (req, res) => {
  db.prepare('UPDATE org_units SET is_active = 0 WHERE id = ?').run(Number(req.params.id));
  triggerAutoPushIfConfigured();
  res.json({ message: 'Đã xóa Khối/Ban/Phòng.' });
});

router.delete('/locations/:code', requireRole('admin'), (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Thiếu mã bếp.' });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM daily_plans WHERE code_number = ?').run(code);
    db.prepare('DELETE FROM daily_meals WHERE code_number = ?').run(code);
    db.prepare('DELETE FROM locations WHERE code_number = ?').run(code);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }
  triggerAutoPushIfConfigured();
  res.json({ message: `Đã xóa địa điểm ${code} khỏi cơ cấu tổ chức.` });
});

router.put('/am-assign', requireRole('admin'), (req, res) => {
  const { am_user_id, am_name = '', location_codes = [], sync_permission = true } = req.body || {};
  const userId = am_user_id ? Number(am_user_id) : null;
  let resolvedName = String(am_name || '').trim();

  if (userId) {
    const u = db.prepare('SELECT full_name FROM users WHERE id = ?').get(userId);
    if (u && !resolvedName) resolvedName = u.full_name;
  }

  if (!userId && !resolvedName) {
    return res.status(400).json({ error: 'Vui lòng chọn hoặc nhập tên AM (Quản lý vùng).' });
  }

  const codes = Array.isArray(location_codes) ? location_codes.map((c) => String(c).trim()).filter(Boolean) : [];

  db.exec('BEGIN');
  try {
    if (userId) {
      db.prepare("UPDATE locations SET am_user_id = NULL, am_name = '' WHERE am_user_id = ?").run(userId);
    } else {
      db.prepare("UPDATE locations SET am_name = '' WHERE am_name = ?").run(resolvedName);
    }

    const updateLoc = db.prepare('UPDATE locations SET am_user_id = ?, am_name = ? WHERE code_number = ?');
    for (const c of codes) {
      updateLoc.run(userId, resolvedName, c);
    }

    if (userId && sync_permission) {
      syncUserLocationPermissions(userId, codes);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }

  triggerAutoPushIfConfigured();
  res.json({ message: `Đã gán AM "${resolvedName}" quản lý ${codes.length} bếp/địa điểm.` });
});

router.put('/sync-config', requireRole('admin'), (req, res) => {
  const {
    sheet_url = '',
    sheet_gid = '0',
    auto_sync_enabled = false,
    sync_interval_minutes = 30,
    push_webhook_url = '',
    auto_push_enabled = true,
  } = req.body || {};
  db.prepare(`
    UPDATE org_sync_config
    SET sheet_url = ?, sheet_gid = ?, auto_sync_enabled = ?, sync_interval_minutes = ?,
        push_webhook_url = ?, auto_push_enabled = ?
    WHERE id = 1
  `).run(
    String(sheet_url).trim(),
    String(sheet_gid || '0').trim(),
    auto_sync_enabled ? 1 : 0,
    Math.max(5, Number(sync_interval_minutes) || 30),
    String(push_webhook_url || '').trim(),
    auto_push_enabled ? 1 : 0
  );
  const updated = db.prepare('SELECT * FROM org_sync_config WHERE id = 1').get();
  res.json({
    message: 'Đã lưu cấu hình đồng bộ 2 chiều Google Sheet.',
    syncConfig: {
      ...updated,
      auto_sync_enabled: Boolean(updated.auto_sync_enabled),
      auto_push_enabled: Boolean(updated.auto_push_enabled),
    },
  });
});

router.post('/sync-now', requireRole('admin'), async (req, res) => {
  try {
    const result = await performGoogleSheetSync();
    res.json(result);
  } catch (err) {
    db.prepare(`
      UPDATE org_sync_config
      SET last_sync_at = datetime('now', 'localtime'),
          last_sync_status = 'error',
          last_sync_message = ?
      WHERE id = 1
    `).run(err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/push-now', requireRole('admin'), async (req, res) => {
  try {
    const result = await pushOrgToGoogleSheet();
    res.json(result);
  } catch (err) {
    db.prepare(`
      UPDATE org_sync_config
      SET last_push_at = datetime('now', 'localtime'),
          last_push_status = 'error',
          last_push_message = ?
      WHERE id = 1
    `).run(err.message);
    res.status(400).json({ error: err.message });
  }
});

router.get('/gsheet-template', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('CoCau_ToChuc');

  sheet.columns = [
    { header: 'code_number', key: 'code_number', width: 16 },
    { header: 'operating_block', key: 'operating_block', width: 20 },
    { header: 'location_name', key: 'location_name', width: 30 },
    { header: 'Ngành nghề', key: 'industry', width: 30 },
    { header: 'Group A/B', key: 'group_ab', width: 11 },
    { header: 'SM quản lý', key: 'sm_name', width: 22 },
    { header: 'AM quản lý', key: 'am_name', width: 22 },
    { header: 'SDT', key: 'phone', width: 14 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };

  const rows = db
    .prepare(`
      SELECT l.code_number, l.operating_block, l.location_name, l.industry, l.group_ab,
             COALESCE(NULLIF(l.sm_name, ''), o.leader_name, '') AS sm_name, l.am_name, l.phone
      FROM locations l
      LEFT JOIN org_units o ON l.operating_block = o.name AND o.is_active = 1
      WHERE l.is_active = 1
      ORDER BY l.operating_block, l.code_number
    `)
    .all();

  for (const r of rows) {
    sheet.addRow(r);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Mau_Co_Cau_To_Chuc_GoogleSheet.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

function startOrgAutoSync() {
  setInterval(async () => {
    try {
      const cfg = db.prepare('SELECT * FROM org_sync_config WHERE id = 1').get();
      if (!cfg || !cfg.auto_sync_enabled || !cfg.sheet_url) return;

      const intervalMs = Math.max(5, Number(cfg.sync_interval_minutes) || 30) * 60 * 1000;
      const lastSyncMs = cfg.last_sync_at ? new Date(cfg.last_sync_at.replace(' ', 'T')).getTime() : 0;
      if (Date.now() - lastSyncMs >= intervalMs) {
        await performGoogleSheetSync();
        console.log('[OrgAutoSync] Đã tự động đồng bộ cơ cấu tổ chức từ Google Sheet.');
      }
    } catch (err) {
      console.error('[OrgAutoSync] Lỗi đồng bộ:', err.message);
      db.prepare(`
        UPDATE org_sync_config
        SET last_sync_at = datetime('now', 'localtime'),
            last_sync_status = 'error',
            last_sync_message = ?
        WHERE id = 1
      `).run(err.message);
    }
  }, 60 * 1000);
}

module.exports = { router, startOrgAutoSync };
