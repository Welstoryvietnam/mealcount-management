const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth, requireRole, sanitizeUser } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
  res.json({ users: rows.map(sanitizeUser) });
});

router.post('/', (req, res) => {
  const { username, password, full_name, email, role, allowed_blocks, allowed_locations } = req.body || {};
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (username, password, full_name, role).' });
  }
  if (!['admin', 'block_manager', 'site_staff', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(String(username).trim());
  if (exists) {
    return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại.' });
  }

  const hash = bcrypt.hashSync(String(password), 10);
  const blocksJson = JSON.stringify(Array.isArray(allowed_blocks) && allowed_blocks.length ? allowed_blocks : ['*']);
  const locsJson = JSON.stringify(Array.isArray(allowed_locations) && allowed_locations.length ? allowed_locations : ['*']);

  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, email, role, allowed_blocks, allowed_locations)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(String(username).trim(), hash, String(full_name).trim(), String(email || '').trim(), role, blocksJson, locsJson);

  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: sanitizeUser(created) });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  }

  const { full_name, email, role, allowed_blocks, allowed_locations, is_active, password } = req.body || {};
  const nextRole = role || existing.role;
  const blocksJson = Array.isArray(allowed_blocks) ? JSON.stringify(allowed_blocks) : existing.allowed_blocks;
  const locsJson = Array.isArray(allowed_locations) ? JSON.stringify(allowed_locations) : existing.allowed_locations;
  const nextActive = typeof is_active === 'boolean' ? (is_active ? 1 : 0) : existing.is_active;

  db.prepare(
    `UPDATE users
     SET full_name = ?, email = ?, role = ?, allowed_blocks = ?, allowed_locations = ?, is_active = ?
     WHERE id = ?`
  ).run(
    full_name !== undefined ? String(full_name).trim() : existing.full_name,
    email !== undefined ? String(email).trim() : existing.email,
    nextRole,
    blocksJson,
    locsJson,
    nextActive,
    id
  );

  if (password && String(password).length >= 6) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(password), 10), id);
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ user: sanitizeUser(updated) });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Không thể tự xóa tài khoản đang đăng nhập.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ message: 'Đã xóa tài khoản.' });
});

module.exports = router;
