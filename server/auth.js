const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-meal-alert-2026';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function parseJsonArray(raw) {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : ['*'];
  } catch {
    return ['*'];
  }
}

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    allowed_blocks: parseJsonArray(row.allowed_blocks),
    allowed_locations: parseJsonArray(row.allowed_locations),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
  };
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const row = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.id);
    if (!row) {
      return res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị khóa.' });
    }
    req.user = sanitizeUser(row);
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
    }
    next();
  };
}

function canAccessLocation(user, loc) {
  if (!user || !loc) return false;
  if (user.role === 'admin') return true;
  const blockOk = user.allowed_blocks.includes('*') || user.allowed_blocks.includes(loc.operating_block);
  const locOk = user.allowed_locations.includes('*') || user.allowed_locations.includes(loc.code_number);
  return blockOk && locOk;
}

function getScopedLocations(user, operatingBlockFilter = '') {
  const all = db.prepare('SELECT * FROM locations WHERE is_active = 1 ORDER BY operating_block, code_number').all();
  return all.filter((loc) => {
    if (!canAccessLocation(user, loc)) return false;
    if (operatingBlockFilter && operatingBlockFilter !== 'ALL' && loc.operating_block !== operatingBlockFilter) {
      return false;
    }
    return true;
  });
}

module.exports = {
  signToken,
  sanitizeUser,
  requireAuth,
  requireRole,
  canAccessLocation,
  getScopedLocations,
};
