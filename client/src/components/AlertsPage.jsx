import React, { useState, useEffect, useCallback } from 'react';
import { Send, MessageSquare, Settings, CheckCircle2, AlertCircle, Filter, History, Copy, Check } from 'lucide-react';
import { apiFetch, getYesterdayISO } from '../api';
import { useAuth } from '../context/AuthContext';

export default function AlertsPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const canSend = user.role === 'admin' || user.role === 'block_manager';

  const [date, setDate] = useState(getYesterdayISO());
  const [block, setBlock] = useState('ALL');
  const [blocks, setBlocks] = useState([]);
  const [preview, setPreview] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [sending, setSending] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [stdRes, prevRes, cfgRes, logRes] = await Promise.all([
        apiFetch('/api/standards'),
        apiFetch(`/api/alerts/preview?date=${encodeURIComponent(date)}&block=${encodeURIComponent(block)}`),
        apiFetch('/api/alerts/configs'),
        apiFetch('/api/alerts/logs'),
      ]);
      setBlocks(stdRes.blocks || []);
      setPreview(prevRes);
      setConfigs(cfgRes.configs || []);
      setLogs(logRes.logs || []);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  }, [date, block]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleTestSend = async (channel) => {
    setSending(channel);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/alerts/test-send', {
        method: 'POST',
        body: JSON.stringify({ channel, date, block }),
      });
      setFeedback({
        type: res.status === 'failed' ? 'error' : 'success',
        text: `[${channel.toUpperCase()}] ${res.responseDetail}`,
      });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setSending('');
    }
  };

  const handleSaveConfig = async (cfg) => {
    setFeedback(null);
    try {
      await apiFetch(`/api/alerts/configs/${cfg.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          webhook_url: cfg.webhook_url,
          bot_token: cfg.bot_token,
          chat_id: cfg.chat_id,
          is_enabled: cfg.is_enabled,
        }),
      });
      setFeedback({ type: 'success', text: `Đã lưu cấu hình ${cfg.name}.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const updateCfg = (id, field, value) => {
    setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const copyMessage = () => {
    if (!preview) return;
    navigator.clipboard.writeText(preview.messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cảnh báo Zalo Bot & KakaoTalk</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Xem trước nội dung tin nhắn cảnh báo các địa điểm giảm suất &ge;3%, cấu hình Webhook và gửi kiểm thử
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium"
          />

          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              className="text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
            >
              <option value="ALL">Tất cả Khối</option>
              {blocks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 p-3.5 rounded-xl border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Preview Chat Message */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">Xem trước Tin nhắn Cảnh báo</h2>
            </div>
            <button
              onClick={copyMessage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Đã copy' : 'Copy tin nhắn'}</span>
            </button>
          </div>

          <div className="p-5 flex-1 bg-slate-100/70">
            <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                <span className="px-2 py-0.5 text-[11px] font-bold bg-blue-600 text-white rounded">Zalo / Kakao Bot</span>
                <span className="text-xs text-slate-400">{date}</span>
              </div>
              <pre className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                {preview?.messageText || 'Đang tải...'}
              </pre>
            </div>
          </div>

          {canSend && (
            <div className="p-4 border-t border-slate-200 bg-white flex flex-wrap gap-3">
              <button
                onClick={() => handleTestSend('zalo')}
                disabled={Boolean(sending)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{sending === 'zalo' ? 'Đang gửi...' : 'Gửi Test Zalo Bot'}</span>
              </button>
              <button
                onClick={() => handleTestSend('kakaotalk')}
                disabled={Boolean(sending)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-slate-900 rounded-lg text-sm font-semibold cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{sending === 'kakaotalk' ? 'Đang gửi...' : 'Gửi Test KakaoTalk'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Webhook Configurations */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
            <Settings className="w-5 h-5 text-slate-700" />
            <h2 className="text-base font-bold text-slate-900">Cấu hình Webhook Bot (Zalo / KakaoTalk)</h2>
          </div>

          <div className="p-5 space-y-5">
            {configs
              .filter((c) => c.channel !== 'email')
              .map((cfg) => (
                <div key={cfg.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-800">{cfg.name}</span>
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cfg.is_enabled}
                        disabled={!isAdmin}
                        onChange={(e) => updateCfg(cfg.id, 'is_enabled', e.target.checked)}
                      />
                      <span>Kích hoạt</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Webhook URL</label>
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={cfg.webhook_url}
                      onChange={(e) => updateCfg(cfg.id, 'webhook_url', e.target.value)}
                      placeholder="https://... (để trống để chạy chế độ Simulation)"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Bot Token / Secret</label>
                      <input
                        type="password"
                        disabled={!isAdmin}
                        value={cfg.bot_token}
                        onChange={(e) => updateCfg(cfg.id, 'bot_token', e.target.value)}
                        placeholder="Bearer token..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Chat ID / Group ID</label>
                      <input
                        type="text"
                        disabled={!isAdmin}
                        value={cfg.chat_id}
                        onChange={(e) => updateCfg(cfg.id, 'chat_id', e.target.value)}
                        placeholder="ID nhóm nhận cảnh báo..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSaveConfig(cfg)}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Lưu cấu hình
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <History className="w-5 h-5 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">Lịch sử Gửi Cảnh báo gần đây</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Kênh</th>
                <th className="px-4 py-3">Ngày DL</th>
                <th className="px-4 py-3">Phạm vi</th>
                <th className="px-4 py-3 text-center">Số điểm CB</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Chi tiết phản hồi</th>
                <th className="px-4 py-3">Người gửi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-500">{l.created_at}</td>
                  <td className="px-4 py-2.5 font-bold uppercase">{l.channel}</td>
                  <td className="px-4 py-2.5">{l.date}</td>
                  <td className="px-4 py-2.5">{l.operating_block}</td>
                  <td className="px-4 py-2.5 text-center font-semibold">{l.alert_count}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${
                        l.status === 'sent'
                          ? 'bg-emerald-100 text-emerald-700'
                          : l.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate" title={l.response_detail}>
                    {l.response_detail}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{l.triggered_by}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                    Chưa có lịch sử gửi cảnh báo nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
