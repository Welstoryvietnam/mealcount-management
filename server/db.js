const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const { getTodayISO, shiftDateISO } = require('./utils/calculations');
const { MASTER_ORG_UNITS, MASTER_LOCATIONS } = require('./seed_master');

const bundledDbPath = path.join(__dirname, '..', 'data', 'meal_alerts.db');
let dbPath;
if (process.env.VERCEL) {
  dbPath = '/tmp/meal_alerts.db';
  try {
    if (!fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
      fs.copyFileSync(bundledDbPath, dbPath);
    }
  } catch {}
} else {
  dbPath = path.resolve(process.env.DB_PATH || bundledDbPath);
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  } catch {}
}

const db = new DatabaseSync(dbPath);
try {
  db.exec(process.env.VERCEL ? 'PRAGMA journal_mode = DELETE;' : 'PRAGMA journal_mode = WAL;');
} catch {}
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('admin', 'block_manager', 'site_staff', 'viewer')),
      allowed_blocks TEXT NOT NULL DEFAULT '["*"]',
      allowed_locations TEXT NOT NULL DEFAULT '["*"]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS locations (
      code_number TEXT PRIMARY KEY,
      location_name TEXT NOT NULL,
      operating_block TEXT NOT NULL,
      unit_price REAL NOT NULL DEFAULT 35000,
      profit_margin_pct REAL NOT NULL DEFAULT 15,
      planned_daily_meals INTEGER NOT NULL DEFAULT 0,
      planned_monthly_meals INTEGER NOT NULL DEFAULT 0,
      planned_monthly_revenue REAL NOT NULL DEFAULT 0,
      planned_monthly_profit REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS daily_meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_number TEXT NOT NULL REFERENCES locations(code_number) ON DELETE CASCADE,
      date TEXT NOT NULL,
      actual_meals INTEGER NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(code_number, date)
    );

    CREATE TABLE IF NOT EXISTS webhook_configs (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL CHECK(channel IN ('zalo', 'kakaotalk', 'email')),
      name TEXT NOT NULL,
      webhook_url TEXT DEFAULT '',
      bot_token TEXT DEFAULT '',
      chat_id TEXT DEFAULT '',
      extra_json TEXT DEFAULT '{}',
      is_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS alert_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      channel TEXT NOT NULL,
      operating_block TEXT DEFAULT 'Tất cả',
      alert_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      message_text TEXT NOT NULL,
      response_detail TEXT DEFAULT '',
      triggered_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS org_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      unit_type TEXT NOT NULL DEFAULT 'Ban' CHECK(unit_type IN ('Khối', 'Ban', 'Phòng')),
      sm_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      leader_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS org_sync_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      sheet_url TEXT DEFAULT '',
      sheet_gid TEXT DEFAULT '0',
      auto_sync_enabled INTEGER NOT NULL DEFAULT 0,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 30,
      last_sync_at TEXT DEFAULT '',
      last_sync_status TEXT DEFAULT '',
      last_sync_message TEXT DEFAULT ''
    );

    -- Kế hoạch theo ngày + Thực tế cùng ngày năm trước (nhập 1 lần / năm)
    CREATE TABLE IF NOT EXISTS daily_plans (
      code_number TEXT NOT NULL,
      date TEXT NOT NULL,
      plan_meals REAL,
      plan_revenue REAL,
      ly_meals REAL,
      ly_revenue REAL,
      updated_by TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      PRIMARY KEY (code_number, date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(date);
    CREATE INDEX IF NOT EXISTS idx_daily_meals_date ON daily_meals(date);

    -- Cấu hình đồng bộ Google Sheet cho Kế hoạch / Thực tế D-1
    CREATE TABLE IF NOT EXISTS data_sync_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sheet_url TEXT DEFAULT '',
      auto_sync_enabled INTEGER NOT NULL DEFAULT 0,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
      recent_days INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT DEFAULT '',
      last_sync_status TEXT DEFAULT '',
      last_sync_message TEXT DEFAULT ''
    );
  `);

  // Safe migration: actual revenue per day
  const mealCols = db.prepare('PRAGMA table_info(daily_meals)').all().map((c) => c.name);
  if (!mealCols.includes('actual_revenue')) {
    db.exec('ALTER TABLE daily_meals ADD COLUMN actual_revenue REAL;');
    db.exec(`
      UPDATE daily_meals
      SET actual_revenue = actual_meals * (SELECT unit_price FROM locations l WHERE l.code_number = daily_meals.code_number)
      WHERE actual_revenue IS NULL
    `);
  }

  // Safe migration for locations AM & Org columns
  const locCols = db.prepare('PRAGMA table_info(locations)').all().map((c) => c.name);
  if (!locCols.includes('am_user_id')) {
    db.exec('ALTER TABLE locations ADD COLUMN am_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;');
  }
  if (!locCols.includes('am_name')) {
    db.exec("ALTER TABLE locations ADD COLUMN am_name TEXT DEFAULT '';");
  }
  if (!locCols.includes('industry')) {
    db.exec("ALTER TABLE locations ADD COLUMN industry TEXT DEFAULT '';");
  }
  if (!locCols.includes('group_ab')) {
    db.exec("ALTER TABLE locations ADD COLUMN group_ab TEXT DEFAULT '';");
  }
  if (!locCols.includes('phone')) {
    db.exec("ALTER TABLE locations ADD COLUMN phone TEXT DEFAULT '';");
  }
  if (!locCols.includes('sm_name')) {
    db.exec("ALTER TABLE locations ADD COLUMN sm_name TEXT DEFAULT '';");
  }

  // Safe migration for 2-way Google Sheet sync (push webhook)
  const orgSyncCols = db.prepare('PRAGMA table_info(org_sync_config)').all().map((c) => c.name);
  if (!orgSyncCols.includes('push_webhook_url')) {
    db.exec("ALTER TABLE org_sync_config ADD COLUMN push_webhook_url TEXT DEFAULT '';");
  }
  if (!orgSyncCols.includes('auto_push_enabled')) {
    db.exec('ALTER TABLE org_sync_config ADD COLUMN auto_push_enabled INTEGER NOT NULL DEFAULT 1;');
  }
  if (!orgSyncCols.includes('last_push_at')) {
    db.exec("ALTER TABLE org_sync_config ADD COLUMN last_push_at TEXT DEFAULT '';");
  }
  if (!orgSyncCols.includes('last_push_status')) {
    db.exec("ALTER TABLE org_sync_config ADD COLUMN last_push_status TEXT DEFAULT '';");
  }
  if (!orgSyncCols.includes('last_push_message')) {
    db.exec("ALTER TABLE org_sync_config ADD COLUMN last_push_message TEXT DEFAULT '';");
  }
}

function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
  if (userCount === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, role, allowed_blocks, allowed_locations)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('admin', bcrypt.hashSync('Admin@123', 10), 'Quản trị viên Hệ thống', 'admin@company.vn', 'admin', '["*"]', '["*"]');
    insertUser.run('sm.hcm', bcrypt.hashSync('Manager@123', 10), 'Park kkochseul (SM HCM)', 'park@company.vn', 'block_manager', '["Chi nhánh HCM"]', '["*"]');
    insertUser.run('sm.fs1', bcrypt.hashSync('Manager@123', 10), 'Kim Eun Joo (SM FS1)', 'kimej@company.vn', 'block_manager', '["FS1"]', '["*"]');
    insertUser.run('sm.fs2', bcrypt.hashSync('Manager@123', 10), 'Lee Sung Jin (SM FS2)', 'leesj@company.vn', 'block_manager', '["FS2"]', '["*"]');
    insertUser.run('sm.fs3', bcrypt.hashSync('Manager@123', 10), 'Kim Jae Kyoung (SM FS3)', 'kimjk@company.vn', 'block_manager', '["FS3"]', '["*"]');
    insertUser.run('sm.fs4', bcrypt.hashSync('Manager@123', 10), 'Rhee Woo Jin (SM FS4)', 'rheewj@company.vn', 'block_manager', '["FS4"]', '["*"]');
    insertUser.run('sm.fs5', bcrypt.hashSync('Manager@123', 10), 'Nguyễn Thành Dũng (SM FS5)', 'dung.nt@company.vn', 'block_manager', '["FS5"]', '["*"]');
    insertUser.run('sm.pp', bcrypt.hashSync('Manager@123', 10), 'Kim Jung Taek (SM PP)', 'kimjt@company.vn', 'block_manager', '["PRODUCT PLANNING"]', '["*"]');
    insertUser.run('am.duc', bcrypt.hashSync('Staff@123', 10), 'Phạm Hồng Đức (AM HCM)', 'duc.ph@company.vn', 'site_staff', '["Chi nhánh HCM"]', '["A0248619","A0266654","A0231594","A0163601","A0303142"]');
    insertUser.run('viewer', bcrypt.hashSync('Viewer@123', 10), 'Ban Giám Đốc (Chỉ xem)', 'bgd@company.vn', 'viewer', '["*"]', '["*"]');
  }

  const locCount = db.prepare('SELECT COUNT(*) AS cnt FROM locations').get().cnt;
  if (locCount === 0) {
    const amDuc = db.prepare("SELECT id FROM users WHERE username = 'am.duc'").get();
    const insertLoc = db.prepare(`
      INSERT INTO locations (
        code_number, location_name, operating_block, unit_price, profit_margin_pct,
        planned_daily_meals, planned_monthly_meals, planned_monthly_revenue, planned_monthly_profit, am_user_id, am_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seededLocs = MASTER_LOCATIONS.map(([code, ban, name, amName], idx) => {
      const plannedDaily = 400 + ((idx * 137) % 1200);
      const unitPrice = 30000 + ((idx % 5) * 3000);
      const margin = 14 + (idx % 5);
      const monthlyMeals = plannedDaily * 26;
      const monthlyRev = monthlyMeals * unitPrice;
      const monthlyProfit = Math.round(monthlyRev * (margin / 100));
      const amUserId = amName === 'Phạm Hồng Đức' && amDuc ? amDuc.id : null;
      insertLoc.run(code, name, ban, unitPrice, margin, plannedDaily, monthlyMeals, monthlyRev, monthlyProfit, amUserId, amName);
      return { code_number: code, planned_daily_meals: plannedDaily, unit_price: unitPrice };
    });

    // Seed 14 days of daily actual meals ending YESTERDAY (D-1 logic)
    const today = getTodayISO();
    const insertMeal = db.prepare(`
      INSERT INTO daily_meals (code_number, date, actual_meals, actual_revenue, note, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (let offset = -14; offset <= -1; offset++) {
      const dateStr = shiftDateISO(today, offset);
      seededLocs.forEach((loc, idx) => {
        let factor;
        if (offset === -1) {
          // Make ~15% of kitchens drop >= 3% on D-1 to trigger realistic alerts
          factor = idx % 7 === 0 ? 0.94 : idx % 11 === 0 ? 0.955 : 0.985 + ((idx % 5) * 0.01);
        } else {
          const wave = Math.sin((offset + 15) * (idx + 1) * 0.7);
          factor = 0.985 + wave * 0.032;
        }
        const actual = Math.round(loc.planned_daily_meals * factor);
        const note = offset === -1 && factor <= 0.97 ? 'Giảm ca sản xuất / nghỉ phép nhiều' : '';
        insertMeal.run(loc.code_number, dateStr, actual, actual * loc.unit_price, note, 'system_seed');
      });
    }
  }

  const webhookCount = db.prepare('SELECT COUNT(*) AS cnt FROM webhook_configs').get().cnt;
  if (webhookCount === 0) {
    const insertWh = db.prepare(`
      INSERT INTO webhook_configs (id, channel, name, webhook_url, bot_token, chat_id, extra_json, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertWh.run('zalo-default', 'zalo', 'Zalo Bot Cảnh báo Suất ăn', '', '', '', JSON.stringify({ mode: 'webhook' }), 1);
    insertWh.run('kakao-default', 'kakaotalk', 'KakaoTalk Work / OpenBuilder Bot', '', '', '', JSON.stringify({ mode: 'webhook' }), 0);
    insertWh.run('email-default', 'email', 'Email Báo cáo Tự động (SMTP)', '', '', '', JSON.stringify({ smtp_host: 'smtp.gmail.com', smtp_port: 587, recipients: 'ban-dieu-hanh@company.vn' }), 0);
  }

  const orgCount = db.prepare('SELECT COUNT(*) AS cnt FROM org_units').get().cnt;
  if (orgCount === 0) {
    const insertOrg = db.prepare(`
      INSERT INTO org_units (code, name, unit_type, sm_user_id, leader_name, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const unit of MASTER_ORG_UNITS) {
      const sm = db.prepare('SELECT id FROM users WHERE username = ?').get(unit.sm_username);
      insertOrg.run(unit.code, unit.name, unit.unit_type, sm ? sm.id : null, unit.leader_name, unit.description);
    }
  }

  const defaultOrgSheetUrl = 'https://docs.google.com/spreadsheets/d/1fyWdPUONKfs5yzETBwuop6LmBpgHh2CGWh0Ns9q2bJ4/edit?usp=sharing';
  const syncRow = db.prepare('SELECT COUNT(*) AS cnt FROM org_sync_config').get().cnt;
  if (syncRow === 0) {
    db.prepare(`INSERT INTO org_sync_config (id, sheet_url, sheet_gid, auto_sync_enabled, sync_interval_minutes) VALUES (1, ?, '0', 1, 30)`).run(defaultOrgSheetUrl);
  } else {
    db.prepare("UPDATE org_sync_config SET sheet_url = ? WHERE id = 1 AND (sheet_url IS NULL OR sheet_url = '')").run(defaultOrgSheetUrl);
  }

  const dataSyncInsert = db.prepare(`
    INSERT OR IGNORE INTO data_sync_configs (id, name, sync_interval_minutes, recent_days)
    VALUES (?, ?, ?, ?)
  `);
  dataSyncInsert.run('plan', 'Kế hoạch & Thực tế năm trước (theo ngày)', 1440, 0);
  dataSyncInsert.run('actual', 'Thực tế suất ăn & doanh thu D-1', 60, 7);

  // Demo plan data: previous month + current month, plan = default daily plan, LY = ±7%
  const planCount = db.prepare('SELECT COUNT(*) AS cnt FROM daily_plans').get().cnt;
  if (planCount === 0) {
    const locs = db.prepare('SELECT code_number, planned_daily_meals, unit_price FROM locations WHERE is_active = 1').all();
    const today = getTodayISO();
    const [y, m] = today.split('-').map(Number);
    const prevFirst = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const curLast = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const insertPlan = db.prepare(`
      INSERT INTO daily_plans (code_number, date, plan_meals, plan_revenue, ly_meals, ly_revenue, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, 'system_seed')
    `);
    db.exec('BEGIN');
    try {
      locs.forEach((loc, idx) => {
        let d = prevFirst;
        let dayIdx = 0;
        while (d <= curLast) {
          const planMeals = loc.planned_daily_meals;
          const lyFactor = 0.93 + (((idx * 7 + dayIdx * 3) % 15) / 100);
          const lyMeals = Math.round(planMeals * lyFactor);
          insertPlan.run(
            loc.code_number,
            d,
            planMeals,
            planMeals * loc.unit_price,
            lyMeals,
            Math.round(lyMeals * loc.unit_price * 0.95)
          );
          d = shiftDateISO(d, 1);
          dayIdx++;
        }
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  // Migrate any 2025-MM-DD rows in daily_plans into 2026-MM-DD ly_meals / ly_revenue
  const old2025 = db.prepare("SELECT * FROM daily_plans WHERE date LIKE '2025-%'").all();
  if (old2025.length > 0) {
    const migrateStmt = db.prepare(`
      INSERT INTO daily_plans (code_number, date, ly_meals, ly_revenue, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(code_number, date) DO UPDATE SET
        ly_meals = COALESCE(excluded.ly_meals, daily_plans.ly_meals),
        ly_revenue = COALESCE(excluded.ly_revenue, daily_plans.ly_revenue),
        updated_by = excluded.updated_by,
        updated_at = datetime('now', 'localtime')
    `);
    db.exec('BEGIN');
    try {
      for (const r of old2025) {
        const date2026 = `2026${r.date.slice(4)}`;
        const lyM = r.ly_meals !== null ? r.ly_meals : r.plan_meals;
        const lyR = r.ly_revenue !== null ? r.ly_revenue : r.plan_revenue;
        migrateStmt.run(r.code_number, date2026, lyM, lyR, r.updated_by || 'migrated_2025');
      }
      db.exec("DELETE FROM daily_plans WHERE date LIKE '2025-%'");
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
    }
  }
}

initSchema();
seedData();

module.exports = { db };
