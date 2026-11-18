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
  const resp = await fetch(csvUrl, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) {
    throw new Error(`Không thể tải Google Sheet (HTTP ${resp.status}). Hãy đảm bảo Sheet đã bật chia sẻ "Bất kỳ ai có đường liên kết đều có thể xem".`);
  }

  const csvText = await resp.text();
  if (csvText.trim().startsWith('<!DOCTYPE html') || csvText.trim().startsWith('<html')) {
    throw new Error('Google Sheet trả về trang đăng nhập HTML. Vui lòng bật quyền "Anyone with the link can view" hoặc Publish to web (CSV).');
  }

  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    throw new Error('File Google Sheet không có dữ liệu (cần ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu).');
  }

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const findCol = (...aliases) => headers.findIndex((h) => aliases.includes(h));

  const idxCode = findCol('code', 'ma_ban', 'mã ban', 'mã khối');
  const idxName = findCol('name', 'ten_khoi_ban_phong', 'tên khối/ban/phòng', 'ten_ban', 'ban', 'operating_block');
  const idxType = findCol('unit_type', 'loai', 'loại');
  const idxLeader = findCol('leader_name', 'nguoi_phu_trach', 'người phụ trách', 'sm', 'sm_name', 'sm quản lý');
  const idxSmUser = findCol('sm_username', 'tai_khoan_sm');
  const idxAmName = findCol('am_name', 'quan_ly_vung', 'quản lý vùng', 'am', 'am quản lý');
  const idxAmUser = findCol('am_username', 'tai_khoan_am');
  const idxLocCode = findCol('code_number', 'ma_bep', 'mã bếp', 'ma_dia_diem');
  const idxLocName = findCol('location_name', 'ten_bep', 'tên bếp', 'ten_dia_diem', 'địa điểm');

  if (idxName === -1) {
    throw new Error('Google Sheet thiếu cột bắt buộc: name (hoặc ten_khoi_ban_phong / operating_block).');
  }

  const users = db.prepare('SELECT id, username, full_name FROM users WHERE is_active = 1').all();
  const userByUsername = new Map(users.map((u) => [u.username.toLowerCase(), u]));

  const upsertOrg = db.prepare(`
    INSERT INTO org_units (code, name, unit_type, sm_user_id, leader_name, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
    ON CONFLICT(name) DO UPDATE SET
      code = excluded.code,
      unit_type = excluded.unit_type,
      sm_user_id = COALESCE(excluded.sm_user_id, org_units.sm_user_id),
      leader_name = CASE WHEN excluded.leader_name != '' THEN excluded.leader_name ELSE org_units.leader_name END,
      is_active = 1,
      updated_at = datetime('now', 'localtime')
  `);

  let unitCount = 0;
  let locUpdated = 0;
  const amLocationsMap = new Map();

  db.exec('BEGIN');
  try {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const name = (r[idxName] || '').trim();
      if (!name) continue;

      const rawCode = idxCode !== -1 ? (r[idxCode] || '').trim() : '';
      const code = rawCode || `UNIT-${i}`;
      const rawType = idxType !== -1 ? (r[idxType] || '').trim() : 'Khối';
      const unitType = ['Khối', 'Ban', 'Phòng'].includes(rawType) ? rawType : 'Khối';

      const smUsername = idxSmUser !== -1 ? (r[idxSmUser] || '').trim().toLowerCase() : '';
      const smUser = smUsername ? userByUsername.get(smUsername) : null;
      const leaderName = idxLeader !== -1 ? (r[idxLeader] || '').trim() : smUser ? smUser.full_name : '';

      upsertOrg.run(code, name, unitType, smUser ? smUser.id : null, leaderName);
      if (smUser) syncUserBlockPermission(smUser.id, name);
      unitCount++;

      const locCode = idxLocCode !== -1 ? (r[idxLocCode] || '').trim() : '';
      if (locCode) {
        const amUsername = idxAmUser !== -1 ? (r[idxAmUser] || '').trim().toLowerCase() : '';
        const amUser = amUsername ? userByUsername.get(amUsername) : null;
        const amName = idxAmName !== -1 ? (r[idxAmName] || '').trim() : amUser ? amUser.full_name : '';
        const locName = idxLocName !== -1 ? (r[idxLocName] || '').trim() : '';

        const existingLoc = db.prepare('SELECT code_number FROM locations WHERE code_number = ?').get(locCode);
        if (existingLoc) {
          db.prepare(`
            UPDATE locations
            SET operating_block = ?,
                am_user_id = ?,
                am_name = ?,
                location_name = CASE WHEN ? != '' THEN ? ELSE location_name END,
                updated_at = datetime('now', 'localtime')
            WHERE code_number = ?
          `).run(name, amUser ? amUser.id : null, amName, locName, locName, locCode);
          locUpdated++;
        }

        if (amUser) {
          if (!amLocationsMap.has(amUser.id)) amLocationsMap.set(amUser.id, []);
          amLocationsMap.get(amUser.id).push(locCode);
        }
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

  const msg = `Đồng bộ thành công ${unitCount} dòng cơ cấu, cập nhật ${locUpdated} bếp/địa điểm.`;
  db.prepare(`
    UPDATE org_sync_config
    SET last_sync_at = datetime('now', 'localtime'),
        last_sync_status = 'success',
        last_sync_message = ?
    WHERE id = 1
  `).run(msg);

  return { unitCount, locUpdated, message: msg };
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
      ? { ...syncConfig, auto_sync_enabled: Boolean(syncConfig.auto_sync_enabled) }
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

    res.json({ message: `Đã lưu đơn vị ${name}.` });
  } catch (err) {
    res.status(400).json({ error: `Lỗi lưu cơ cấu: ${err.message}` });
  }
});

router.delete('/units/:id', requireRole('admin'), (req, res) => {
  db.prepare('UPDATE org_units SET is_active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ message: 'Đã xóa Khối/Ban/Phòng.' });
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

  res.json({ message: `Đã gán AM "${resolvedName}" quản lý ${codes.length} bếp/địa điểm.` });
});

router.put('/sync-config', requireRole('admin'), (req, res) => {
  const { sheet_url = '', sheet_gid = '0', auto_sync_enabled = false, sync_interval_minutes = 30 } = req.body || {};
  db.prepare(`
    UPDATE org_sync_config
    SET sheet_url = ?, sheet_gid = ?, auto_sync_enabled = ?, sync_interval_minutes = ?
    WHERE id = 1
  `).run(
    String(sheet_url).trim(),
    String(sheet_gid || '0').trim(),
    auto_sync_enabled ? 1 : 0,
    Math.max(5, Number(sync_interval_minutes) || 30)
  );
  const updated = db.prepare('SELECT * FROM org_sync_config WHERE id = 1').get();
  res.json({
    message: 'Đã lưu cấu hình đồng bộ Google Sheet.',
    syncConfig: { ...updated, auto_sync_enabled: Boolean(updated.auto_sync_enabled) },
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

router.get('/gsheet-template', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('CoCau_ToChuc');

  sheet.columns = [
    { header: 'code', key: 'code', width: 14 },
    { header: 'name', key: 'name', width: 24 },
    { header: 'unit_type', key: 'unit_type', width: 12 },
    { header: 'leader_name', key: 'leader_name', width: 26 },
    { header: 'sm_username', key: 'sm_username', width: 16 },
    { header: 'am_name', key: 'am_name', width: 24 },
    { header: 'am_username', key: 'am_username', width: 16 },
    { header: 'code_number', key: 'code_number', width: 16 },
    { header: 'location_name', key: 'location_name', width: 32 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };

  const rows = db
    .prepare(`
      SELECT o.code, o.name, o.unit_type, o.leader_name, sm.username AS sm_username,
             l.am_name, am.username AS am_username, l.code_number, l.location_name
      FROM locations l
      LEFT JOIN org_units o ON l.operating_block = o.name AND o.is_active = 1
      LEFT JOIN users sm ON o.sm_user_id = sm.id
      LEFT JOIN users am ON l.am_user_id = am.id
      WHERE l.is_active = 1
      ORDER BY o.code, l.code_number
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
