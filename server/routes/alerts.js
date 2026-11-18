const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole, getScopedLocations } = require('../auth');
const { computePeriod } = require('../services/metrics');
const { formatVND, getYesterdayISO } = require('../utils/calculations');

const router = express.Router();
router.use(requireAuth);

function buildAlertPayload(user, date, block) {
  const locations = getScopedLocations(user, block);
  const { items } = computePeriod(locations, date, date);

  const alerts = items
    .filter((i) => i.isAlert)
    .sort((a, b) => a.variancePct - b.variancePct);

  const totalRevImpact = alerts.reduce((s, a) => s + a.revenueImpact, 0);
  const totalProfitImpact = alerts.reduce((s, a) => s + a.profitImpact, 0);

  const header = `🚨 CẢNH BÁO SUẤT ĂN GIẢM >3% (Dữ liệu D-1: ${date})`;
  const scopeLine = `Phạm vi: ${block === 'ALL' ? 'Toàn hệ thống' : block} | Số điểm cảnh báo: ${alerts.length}`;

  let bodyLines = [];
  if (alerts.length === 0) {
    bodyLines = ['✅ Không có địa điểm nào giảm quá 3% so với kế hoạch.'];
  } else {
    bodyLines = alerts.map(
      (a, i) =>
        `${i + 1}. [${a.code_number}] ${a.location_name} (${a.operating_block})\n` +
        `   • Thực tế/KH: ${a.actualMeals.toLocaleString('vi-VN')}/${a.planMeals.toLocaleString('vi-VN')} suất (${a.variancePct}%, thiếu ${Math.abs(a.diffMeals)} suất)` +
        (a.vsLyPct !== null ? ` | vs Năm trước: ${a.vsLyPct > 0 ? '+' : ''}${a.vsLyPct}%` : '') +
        `\n   • Ảnh hưởng DT KH: ${formatVND(a.revenueImpact)} | LN KH: ${formatVND(a.profitImpact)}` +
        (a.note ? `\n   • Ghi chú: ${a.note}` : '')
    );
    bodyLines.push('');
    bodyLines.push(`📉 TỔNG TÁC ĐỘNG NHÓM CẢNH BÁO:`);
    bodyLines.push(`   • Doanh thu KH: ${formatVND(totalRevImpact)}`);
    bodyLines.push(`   • Lợi nhuận KH: ${formatVND(totalProfitImpact)}`);
  }

  const messageText = [header, scopeLine, '----------------------------------------', ...bodyLines].join('\n');

  return {
    date,
    block,
    alertCount: alerts.length,
    totalRevImpact,
    totalProfitImpact,
    alerts,
    messageText,
  };
}

router.get('/preview', (req, res) => {
  const date = req.query.date || getYesterdayISO();
  const block = req.query.block || 'ALL';
  const payload = buildAlertPayload(req.user, date, block);
  res.json(payload);
});

router.get('/configs', (req, res) => {
  const rows = db.prepare('SELECT * FROM webhook_configs ORDER BY channel').all();
  const configs = rows.map((r) => ({
    ...r,
    is_enabled: Boolean(r.is_enabled),
    bot_token: req.user.role === 'admin' ? r.bot_token : r.bot_token ? '••••••••' : '',
  }));
  res.json({ configs });
});

router.put('/configs/:id', requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM webhook_configs WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Không tìm thấy cấu hình kênh.' });
  }

  const { webhook_url, bot_token, chat_id, extra_json, is_enabled } = req.body || {};
  db.prepare(`
    UPDATE webhook_configs
    SET webhook_url = ?, bot_token = ?, chat_id = ?, extra_json = ?, is_enabled = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    webhook_url !== undefined ? String(webhook_url).trim() : existing.webhook_url,
    bot_token !== undefined ? String(bot_token).trim() : existing.bot_token,
    chat_id !== undefined ? String(chat_id).trim() : existing.chat_id,
    extra_json !== undefined ? (typeof extra_json === 'string' ? extra_json : JSON.stringify(extra_json)) : existing.extra_json,
    typeof is_enabled === 'boolean' ? (is_enabled ? 1 : 0) : existing.is_enabled,
    id
  );

  const updated = db.prepare('SELECT * FROM webhook_configs WHERE id = ?').get(id);
  res.json({ config: { ...updated, is_enabled: Boolean(updated.is_enabled) } });
});

router.post('/test-send', requireRole('admin', 'block_manager'), async (req, res) => {
  const { channel = 'zalo', date = getYesterdayISO(), block = 'ALL', customMessage } = req.body || {};
  const payload = buildAlertPayload(req.user, date, block);
  const textToSend = customMessage || payload.messageText;

  const config = db.prepare('SELECT * FROM webhook_configs WHERE channel = ?').get(channel);

  let status = 'preview';
  let responseDetail = 'Chưa cấu hình Webhook URL — đã lưu bản ghi xem trước (Simulation Mode).';

  if (config && config.webhook_url) {
    try {
      const bodyPayload =
        channel === 'kakaotalk'
          ? { text: textToSend, chat_id: config.chat_id || undefined }
          : { text: textToSend, chat_id: config.chat_id || undefined, message: textToSend };

      const headers = { 'Content-Type': 'application/json' };
      if (config.bot_token) {
        headers['Authorization'] = `Bearer ${config.bot_token}`;
      }

      const resp = await fetch(config.webhook_url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(8000),
      });

      const respText = await resp.text();
      if (resp.ok) {
        status = 'sent';
        responseDetail = `HTTP ${resp.status}: ${respText.slice(0, 200)}`;
      } else {
        status = 'failed';
        responseDetail = `HTTP ${resp.status}: ${respText.slice(0, 200)}`;
      }
    } catch (err) {
      status = 'failed';
      responseDetail = `Lỗi kết nối Webhook: ${err.message}`;
    }
  }

  db.prepare(`
    INSERT INTO alert_logs (date, channel, operating_block, alert_count, status, message_text, response_detail, triggered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(date, channel, block, payload.alertCount, status, textToSend, responseDetail, req.user.username);

  res.json({
    status,
    responseDetail,
    alertCount: payload.alertCount,
  });
});

router.get('/logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM alert_logs ORDER BY id DESC LIMIT 30').all();
  res.json({ logs: rows });
});

module.exports = router;
