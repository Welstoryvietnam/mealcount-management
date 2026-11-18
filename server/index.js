require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

require('./db'); // Ensure DB initialized & seeded

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const standardRoutes = require('./routes/standards');
const mealRoutes = require('./routes/meals');
const dashboardRoutes = require('./routes/dashboard');
const reportRoutes = require('./routes/reports');
const alertRoutes = require('./routes/alerts');
const { router: orgRoutes, startOrgAutoSync } = require('./routes/org');
const planRoutes = require('./routes/plans');
const { startDataAutoSync } = require('./services/dataImport');

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : true,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau 15 phút.' },
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/standards', standardRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/plans', planRoutes);

// Serve built React frontend in production / standalone mode
const distDir = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Meal Alert Server listening on http://localhost:${PORT}`);
    startOrgAutoSync();
    startDataAutoSync();
  });
}

module.exports = app;
