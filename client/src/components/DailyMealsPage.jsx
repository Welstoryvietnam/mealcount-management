import React, { useState, useEffect, useCallback } from 'react';
import {
  Save,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sheet,
  RefreshCw,
  Filter,
  Wand2,
} from 'lucide-react';
import { apiFetch, downloadFile, formatVND, getTodayISO, getYesterdayISO, shiftISO } from '../api';
import { useAuth } from '../context/AuthContext';

export default function DailyMealsPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';

  const yesterday = getYesterdayISO();
  const [date, setDate] = useState(yesterday);
  const [block, setBlock] = useState('ALL');
  const [blocks, setBlocks] = useState([]);
  const [items, setItems] = useState([]);
  const [isFutureOrToday, setIsFutureOrToday] = useState(false);

  const [actualSyncCfg, setActualSyncCfg] = useState({
    sheet_url: '',
    auto_sync_enabled: false,
    sync_interval_minutes: 60,
    recent_days: 7,
    last_sync_at: '',
    last_sync_status: '',
    last_sync_message: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadMeals = useCallback(async () => {
    setLoading(true);
    try {
      const [stdRes, mealRes, syncRes] = await Promise.all([
        apiFetch('/api/standards'),
        apiFetch(`/api/meals?date=${encodeURIComponent(date)}&block=${encodeURIComponent(block === 'ALL' ? '' : block)}`),
        apiFetch('/api/plans/sync-configs'),
      ]);
      setBlocks(stdRes.blocks || []);
      setIsFutureOrToday(Boolean(mealRes.isFutureOrToday));
      setItems(
        (mealRes.items || []).map((item) => ({
          ...item,
          draftMeals: item.actual_meals !== null ? String(item.actual_meals) : '',
          draftRevenue: item.actual_revenue !== null ? String(Math.round(item.actual_revenue)) : '',
          draftNote: item.note || '',
        }))
      );
      const aCfg = (syncRes.configs || []).find((c) => c.id === 'actual');
      if (aCfg) setActualSyncCfg(aCfg);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [date, block]);

  useEffect(() => {
    loadMeals();
  }, [loadMeals]);

  const updateRow = (code, field, value) => {
    setItems((prev) =>
      prev.map((item) => (item.code_number === code ? { ...item, [field]: value } : item))
    );
  };

  const handleAutoCalcRevenue = () => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.draftMeals === '') return item;
        const meals = Number(item.draftMeals) || 0;
        return {
          ...item,
          draftRevenue: String(Math.round(meals * (item.unit_price || 0))),
        };
      })
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const entries = items
        .filter((i) => i.draftMeals !== '')
        .map((i) => ({
          code_number: i.code_number,
          actual_meals: Number(i.draftMeals),
          actual_revenue:
            i.draftRevenue !== '' ? Number(i.draftRevenue) : Math.round(Number(i.draftMeals) * (i.unit_price || 0)),
          note: i.draftNote,
        }));
      const res = await apiFetch('/api/meals/bulk', {
        method: 'POST',
        body: JSON.stringify({ date, entries }),
      });
      setFeedback({ type: 'success', text: res.message });
      await loadMeals();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('date', date);
      const res = await apiFetch('/api/plans/actual-upload', { method: 'POST', body: form });
      setFeedback({ type: 'success', text: res.message });
      await loadMeals();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const m = date.slice(0, 7);
      await downloadFile(
        `/api/plans/actual-template?month=${encodeURIComponent(m)}&block=${encodeURIComponent(block)}`,
        `Mau_Cot_ThucTe_${m}.xlsx`
      );
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleSaveSync = async (e) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiFetch('/api/plans/sync-configs/actual', {
        method: 'PUT',
        body: JSON.stringify(actualSyncCfg),
      });
      setFeedback({ type: 'success', text: res.message });
      await loadMeals();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      if (isAdmin) {
        await apiFetch('/api/plans/sync-configs/actual', {
          method: 'PUT',
          body: JSON.stringify(actualSyncCfg),
        });
      }
      const res = await apiFetch('/api/plans/sync-now/actual', { method: 'POST' });
      setFeedback({ type: 'success', text: res.message });
      await loadMeals();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
      await loadMeals();
    } finally {
      setSyncing(false);
    }
  };

  const reportedCount = items.filter((i) => i.draftMeals !== '').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Cập nhật Thực tế D-1 (Suất ăn &amp; Doanh thu)</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-full">
              Quy tắc D-1
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Hôm nay ({getTodayISO()}) cập nhật số liệu thực tế của ngày hôm trước ({yesterday}) — hỗ trợ nhập tay, Import Excel/CSV hoặc Google Sheet
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDate(yesterday)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              date === yesterday ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'
            }`}
          >
            Hôm qua D-1 ({yesterday})
          </button>
          <button
            type="button"
            onClick={() => setDate(shiftISO(yesterday, -1))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              date === shiftISO(yesterday, -1)
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-300'
            }`}
          >
            D-2 ({shiftISO(yesterday, -1)})
          </button>

          <input
            type="date"
            max={yesterday}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium"
          />

          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              className="text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
            >
              <option value="ALL">Tất cả Khối / Ban</option>
              {blocks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-700">
          Tiến độ nhập ngày <strong>{date}</strong>:{' '}
          <span className="font-bold text-blue-700">
            {reportedCount} / {items.length} bếp
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAutoCalcRevenue}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
            title="Điền nhanh Doanh thu thực tế = Suất ăn thực tế × Đơn giá cho tất cả các dòng"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Tự tính DT = Suất × Đơn giá</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải mẫu Excel Dạng Cột (Tháng)</span>
          </button>

          <label className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Đang upload...' : 'Import Excel/CSV Thực tế'}</span>
            <input type="file" accept=".xlsx,.csv" onChange={handleUploadExcel} className="hidden" disabled={uploading} />
          </label>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving || loading || isFutureOrToday}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Đang lưu...' : `Lưu thực tế (${date})`}</span>
          </button>
        </div>
      </div>

      {isFutureOrToday && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Theo quy tắc <strong>D-1</strong>, chỉ cập nhật dữ liệu thực tế cho ngày hôm qua ({yesterday}) trở về trước.
        </div>
      )}

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

      {/* Google Sheet Sync for Actual D-1 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <Sheet className="w-5 h-5 text-emerald-700" />
          <h2 className="text-sm font-bold text-slate-900">
            Đồng bộ Tự động Thực tế D-1 từ Google Sheet
          </h2>
        </div>
        <form onSubmit={handleSaveSync} className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-3">
              <input
                type="text"
                disabled={!isAdmin}
                value={actualSyncCfg.sheet_url}
                onChange={(e) => setActualSyncCfg({ ...actualSyncCfg, sheet_url: e.target.value })}
                placeholder="Dán link Google Sheet nhập liệu thực tế D-1 (cột: code_number, date, actual_meals, actual_revenue)..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 shrink-0">Lọc ngày gần nhất:</label>
              <select
                disabled={!isAdmin}
                value={actualSyncCfg.recent_days}
                onChange={(e) => setActualSyncCfg({ ...actualSyncCfg, recent_days: Number(e.target.value) })}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
              >
                <option value={3}>3 ngày (D-1..D-3)</option>
                <option value={7}>7 ngày gần nhất</option>
                <option value={31}>31 ngày gần nhất</option>
                <option value={0}>Tất cả ngày</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={actualSyncCfg.auto_sync_enabled}
                  onChange={(e) => setActualSyncCfg({ ...actualSyncCfg, auto_sync_enabled: e.target.checked })}
                />
                <span>Tự động</span>
              </label>
              {isAdmin && (
                <>
                  <button
                    type="submit"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Lưu
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncNow}
                    disabled={syncing || !actualSyncCfg.sheet_url}
                    className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    <span>Đồng bộ</span>
                  </button>
                </>
              )}
            </div>
          </div>
          {actualSyncCfg.last_sync_at && (
            <div className="text-xs text-slate-600">
              Đồng bộ gần nhất: <strong>{actualSyncCfg.last_sync_at}</strong> ({actualSyncCfg.last_sync_status}) — {actualSyncCfg.last_sync_message}
            </div>
          )}
        </form>
      </div>

      {/* Entry table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 font-semibold">Mã Bếp</th>
                <th className="px-3 py-3 font-semibold">Tên Bếp</th>
                <th className="px-3 py-3 font-semibold">Ban</th>
                <th className="px-3 py-3 font-semibold text-right">KH Suất</th>
                <th className="px-3 py-3 font-semibold text-right">Năm trước</th>
                <th className="px-3 py-3 font-semibold text-right">TT Suất (D-1)</th>
                <th className="px-3 py-3 font-semibold text-right">% vs KH</th>
                <th className="px-3 py-3 font-semibold text-right">KH Doanh thu</th>
                <th className="px-3 py-3 font-semibold text-right">TT Doanh thu (VNĐ)</th>
                <th className="px-3 py-3 font-semibold">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((item) => {
                const val = item.draftMeals === '' ? null : Number(item.draftMeals);
                const pct =
                  val !== null && item.plan_meals > 0
                    ? Number((((val - item.plan_meals) / item.plan_meals) * 100).toFixed(2))
                    : null;
                const isAlert = pct !== null && pct <= -3;
                const autoRevPlaceholder =
                  val !== null ? Math.round(val * (item.unit_price || 0)).toLocaleString('vi-VN') : 'Tự tính theo ĐG';

                return (
                  <tr key={item.code_number} className={isAlert ? 'bg-red-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-2.5 font-mono font-semibold text-slate-700">{item.code_number}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{item.location_name}</td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs">{item.operating_block}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{item.plan_meals.toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      {item.ly_meals !== null ? item.ly_meals.toLocaleString('vi-VN') : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        disabled={isFutureOrToday}
                        value={item.draftMeals}
                        onChange={(e) => updateRow(item.code_number, 'draftMeals', e.target.value)}
                        placeholder="Suất..."
                        className={`w-28 px-2.5 py-1.5 text-right border rounded-lg font-semibold outline-none focus:ring-2 ${
                          isAlert
                            ? 'border-red-300 focus:ring-red-500 text-red-700 bg-white'
                            : 'border-slate-300 focus:ring-blue-500'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold">
                      {pct === null ? (
                        <span className="text-slate-400">-</span>
                      ) : isAlert ? (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <AlertTriangle className="w-3.5 h-3.5" /> {pct}%
                        </span>
                      ) : (
                        <span className={pct < 0 ? 'text-amber-600' : 'text-emerald-600'}>
                          {pct > 0 ? '+' : ''}{pct}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-600">{formatVND(item.plan_revenue)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        disabled={isFutureOrToday}
                        value={item.draftRevenue}
                        onChange={(e) => updateRow(item.code_number, 'draftRevenue', e.target.value)}
                        placeholder={autoRevPlaceholder}
                        className="w-36 px-2.5 py-1.5 text-right border border-slate-300 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        disabled={isFutureOrToday}
                        value={item.draftNote}
                        onChange={(e) => updateRow(item.code_number, 'draftNote', e.target.value)}
                        placeholder="Ghi chú..."
                        className="w-full min-w-[130px] px-2 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
