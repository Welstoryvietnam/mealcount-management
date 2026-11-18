import React, { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Plus,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X,
  Sheet,
  RefreshCw,
  CalendarRange,
  Sliders,
  Filter,
} from 'lucide-react';
import { apiFetch, downloadFile, formatVND, getYesterdayISO } from '../api';
import { useAuth } from '../context/AuthContext';

const EMPTY_FORM = {
  code_number: '',
  location_name: '',
  operating_block: 'FS1',
  unit_price: 35000,
  profit_margin_pct: 15,
  planned_daily_meals: 500,
  planned_monthly_meals: 13000,
};

export default function StandardsPage() {
  const { user } = useAuth();
  const canEdit = user.role === 'admin' || user.role === 'block_manager';
  const isAdmin = user.role === 'admin';

  const [subTab, setSubTab] = useState('plan'); // 'plan' | 'catalog'
  const [month, setMonth] = useState(getYesterdayISO().slice(0, 7));
  const [block, setBlock] = useState('ALL');
  const [blocks, setBlocks] = useState([]);

  // Plan & LY monthly summary
  const [planData, setPlanData] = useState(null);
  const [planSyncCfg, setPlanSyncCfg] = useState({
    sheet_url: '',
    auto_sync_enabled: false,
    sync_interval_minutes: 1440,
    last_sync_at: '',
    last_sync_status: '',
    last_sync_message: '',
  });
  const [syncingPlan, setSyncingPlan] = useState(false);

  // Kitchen catalog
  const [locations, setLocations] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadAll = useCallback(async () => {
    try {
      const [stdRes, sumRes, syncRes] = await Promise.all([
        apiFetch(`/api/standards?block=${encodeURIComponent(block === 'ALL' ? '' : block)}`),
        apiFetch(`/api/plans/summary?month=${encodeURIComponent(month)}&block=${encodeURIComponent(block)}`),
        apiFetch('/api/plans/sync-configs'),
      ]);
      setLocations(stdRes.locations || []);
      setBlocks(stdRes.blocks || []);
      setPlanData(sumRes);
      const pCfg = (syncRes.configs || []).find((c) => c.id === 'plan');
      if (pCfg) setPlanSyncCfg(pCfg);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  }, [month, block]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleDownloadPlanTemplate = async (period) => {
    try {
      const year = month.slice(0, 4);
      const url = `/api/plans/template?period=${period}&month=${encodeURIComponent(month)}&year=${year}&block=${encodeURIComponent(block)}`;
      const fname = period === 'year' ? `Mau_Cot_KeHoach_NamTruoc_${year}.xlsx` : `Mau_Cot_KeHoach_NamTruoc_${month}.xlsx`;
      await downloadFile(url, fname);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleUploadPlanFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('month', month);
      const res = await apiFetch('/api/plans/upload', { method: 'POST', body: fd });
      setFeedback({ type: 'success', text: res.message });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSavePlanSync = async (e) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiFetch('/api/plans/sync-configs/plan', {
        method: 'PUT',
        body: JSON.stringify(planSyncCfg),
      });
      setFeedback({ type: 'success', text: res.message });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleSyncPlanNow = async () => {
    setSyncingPlan(true);
    setFeedback(null);
    try {
      if (isAdmin) {
        await apiFetch('/api/plans/sync-configs/plan', {
          method: 'PUT',
          body: JSON.stringify(planSyncCfg),
        });
      }
      const res = await apiFetch('/api/plans/sync-now/plan', { method: 'POST' });
      setFeedback({ type: 'success', text: res.message });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
      await loadAll();
    } finally {
      setSyncingPlan(false);
    }
  };

  // Catalog handlers
  const handleDownloadCatalogTemplate = async () => {
    try {
      await downloadFile('/api/standards/template', 'Mau_Upload_Tieu_Chuan_Ke_Hoach.xlsx');
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleUploadCatalog = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/api/standards/upload', { method: 'POST', body: fd });
      setFeedback({ type: 'success', text: res.message });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const openEdit = (loc) => {
    setForm({
      code_number: loc.code_number,
      location_name: loc.location_name,
      operating_block: loc.operating_block,
      unit_price: loc.unit_price,
      profit_margin_pct: loc.profit_margin_pct,
      planned_daily_meals: loc.planned_daily_meals,
      planned_monthly_meals: loc.planned_monthly_meals,
    });
    setModalOpen(true);
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiFetch('/api/standards', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setModalOpen(false);
      setFeedback({ type: 'success', text: `Đã lưu tiêu chuẩn bếp ${form.code_number}.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const s = planData?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kế hoạch &amp; Dữ liệu Năm trước (Nhập 1 lần)</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Quản lý Kế hoạch suất ăn / doanh thu theo ngày (tổng theo tháng) và Thực tế cùng ngày năm trước — hỗ trợ Import Excel/CSV &amp; Google Sheet
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1 text-xs font-semibold self-start">
          <button
            type="button"
            onClick={() => setSubTab('plan')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              subTab === 'plan' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CalendarRange className="w-4 h-4" />
            <span>1. Kế hoạch &amp; Năm trước theo ngày</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('catalog')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              subTab === 'catalog' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>2. Đơn giá &amp; Tỷ suất LN Bếp</span>
          </button>
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

      {subTab === 'plan' ? (
        <>
          {/* Filter + Template / Upload actions */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="text-xs font-semibold text-slate-600">Tháng xem tổng hợp:</label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
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

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPlanTemplate('month')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải Mẫu Tháng ({month})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPlanTemplate('year')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải Mẫu Cả Năm ({month.slice(0, 4)})</span>
                </button>

                {canEdit && (
                  <label className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploading ? 'Đang import...' : 'Import Excel/CSV Kế hoạch & Năm trước'}</span>
                    <input
                      type="file"
                      accept=".xlsx,.csv"
                      onChange={handleUploadPlanFile}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <strong>Cấu trúc Biểu mẫu Dạng Cột (Mỗi ngày 1 cột — 1 dòng = 1 Bếp):</strong>{' '}
              Các cột đầu là <code>code_number</code>, <code>location_name</code>, <code>operating_block</code>, <code>Tổng cộng (=SUM)</code>, tiếp theo <strong>mỗi ngày là 1 cột</strong> (VD: <code>2026-11-01</code>, <code>2026-11-02</code>... hoặc <code>1</code>..<code>31</code>). File mẫu có sẵn 4 sheet riêng (<code>1_KH_SuatAn</code>, <code>2_KH_DoanhThu</code>, <code>3_NamTruoc_SuatAn</code>, <code>4_NamTruoc_DoanhThu</code>) và 1 sheet gộp <code>5_Gop_GoogleSheet</code> (có cột <code>metric</code>) để dùng trên Google Sheet.
            </div>
          </div>

          {/* 4 Monthly Summary Cards */}
          {s && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Tổng KH Suất ăn Tháng {month}</div>
                <div className="mt-1.5 text-2xl font-bold text-slate-900">
                  {s.planMealsFull.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">suất</span>
                </div>
                <div className="mt-1.5 text-xs text-blue-700 font-medium">
                  Lũy kế TT (đến D-1): {s.actualMeals.toLocaleString('vi-VN')} suất
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Tổng KH Doanh thu Tháng {month}</div>
                <div className="mt-1.5 text-xl font-bold text-blue-700">{formatVND(s.planRevenueFull)}</div>
                <div className="mt-1.5 text-xs text-slate-600">
                  Lũy kế TT (đến D-1): {formatVND(s.actualRevenue)}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">TT Suất ăn Năm trước (Tháng)</div>
                <div className="mt-1.5 text-2xl font-bold text-slate-800">
                  {s.lyMealsFull.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">suất</span>
                </div>
                <div className="mt-1.5 text-xs text-slate-600">
                  So sánh cùng kỳ MTD:{' '}
                  <strong className={s.mealVsLyPct !== null && s.mealVsLyPct < 0 ? 'text-red-600' : 'text-emerald-600'}>
                    {s.mealVsLyPct !== null ? `${s.mealVsLyPct > 0 ? '+' : ''}${s.mealVsLyPct}%` : '-'}
                  </strong>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">TT Doanh thu Năm trước (Tháng)</div>
                <div className="mt-1.5 text-xl font-bold text-emerald-700">{formatVND(s.lyRevenueFull)}</div>
                <div className="mt-1.5 text-xs text-slate-600">
                  So sánh DT cùng kỳ MTD:{' '}
                  <strong className={s.revenueVsLyPct !== null && s.revenueVsLyPct < 0 ? 'text-red-600' : 'text-emerald-600'}>
                    {s.revenueVsLyPct !== null ? `${s.revenueVsLyPct > 0 ? '+' : ''}${s.revenueVsLyPct}%` : '-'}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Google Sheet Sync for Plan & LY */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
              <Sheet className="w-5 h-5 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">
                Đồng bộ Kế hoạch &amp; Năm trước từ Google Sheet
              </h2>
            </div>
            <form onSubmit={handleSavePlanSync} className="p-5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-3">
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={planSyncCfg.sheet_url}
                    onChange={(e) => setPlanSyncCfg({ ...planSyncCfg, sheet_url: e.target.value })}
                    placeholder="Dán link Google Sheet chứa Kế hoạch & Năm trước (chế độ Anyone with the link can view)..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={planSyncCfg.auto_sync_enabled}
                      onChange={(e) => setPlanSyncCfg({ ...planSyncCfg, auto_sync_enabled: e.target.checked })}
                    />
                    <span>Tự động đồng bộ</span>
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
                        onClick={handleSyncPlanNow}
                        disabled={syncingPlan || !planSyncCfg.sheet_url}
                        className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncingPlan ? 'animate-spin' : ''}`} />
                        <span>Đồng bộ</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
              {planSyncCfg.last_sync_at && (
                <div className="text-xs text-slate-600">
                  Lần đồng bộ gần nhất: <strong>{planSyncCfg.last_sync_at}</strong> ({planSyncCfg.last_sync_status}) — {planSyncCfg.last_sync_message}
                </div>
              )}
            </form>
          </div>

          {/* Monthly Plan & LY Table per Kitchen */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">
                Bảng Tổng hợp Kế hoạch &amp; Năm trước theo Bếp — Tháng {month} ({planData?.rows?.length || 0} bếp)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Mã Bếp</th>
                    <th className="px-4 py-3 font-semibold">Tên Bếp</th>
                    <th className="px-4 py-3 font-semibold">Ban</th>
                    <th className="px-4 py-3 font-semibold text-center">Số ngày KH</th>
                    <th className="px-4 py-3 font-semibold text-right">KH Suất Tháng</th>
                    <th className="px-4 py-3 font-semibold text-right">KH Doanh thu Tháng</th>
                    <th className="px-4 py-3 font-semibold text-right">Năm trước (Suất)</th>
                    <th className="px-4 py-3 font-semibold text-right">Năm trước (Doanh thu)</th>
                    <th className="px-4 py-3 font-semibold text-right">TT Lũy kế (D-1)</th>
                    <th className="px-4 py-3 font-semibold text-right">% vs Năm trước</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(planData?.rows || []).map((r) => (
                    <tr key={r.code_number} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-700">{r.code_number}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{r.location_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.operating_block}</td>
                      <td className="px-4 py-2.5 text-center text-xs">
                        {r.plan_days > 0 ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-semibold">
                            {r.plan_days} ngày
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">Mặc định</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">{r.planMealsMonth.toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-2.5 text-right text-blue-700 font-medium">{formatVND(r.planRevenueMonth)}</td>
                      <td className="px-4 py-2.5 text-right">{r.lyMealsMonth.toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{formatVND(r.lyRevenueMonth)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {r.actualMealsMtd.toLocaleString('vi-VN')}{' '}
                        <span className="text-xs text-slate-400">({r.days_reported}d)</span>
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-bold ${
                          r.vsLyPct === null ? 'text-slate-400' : r.vsLyPct < 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {r.vsLyPct !== null ? `${r.vsLyPct > 0 ? '+' : ''}${r.vsLyPct}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Sub-tab 2: Kitchen Unit Price & Margin Catalog */
        <>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              onClick={handleDownloadCatalogTemplate}
              className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-sm font-medium text-slate-700 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải mẫu Danh mục Bếp</span>
            </button>

            {canEdit && (
              <>
                <label className="flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>{uploading ? 'Đang import...' : 'Upload Danh mục Excel'}</span>
                  <input type="file" accept=".xlsx" onChange={handleUploadCatalog} className="hidden" disabled={uploading} />
                </label>

                <button
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm bếp</span>
                </button>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="px-4 py-3 font-semibold">Tên Bếp</th>
                    <th className="px-4 py-3 font-semibold">Ban</th>
                    <th className="px-4 py-3 font-semibold text-right">Đơn giá mặc định</th>
                    <th className="px-4 py-3 font-semibold text-right">Tỷ suất LN</th>
                    <th className="px-4 py-3 font-semibold text-right">KH Suất/Ngày mặc định</th>
                    {canEdit && <th className="px-4 py-3 text-center">Sửa</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {locations.map((loc) => (
                    <tr key={loc.code_number} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-700">{loc.code_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{loc.location_name}</td>
                      <td className="px-4 py-3 text-slate-600">{loc.operating_block}</td>
                      <td className="px-4 py-3 text-right">{formatVND(loc.unit_price)}</td>
                      <td className="px-4 py-3 text-right">{loc.profit_margin_pct}%</td>
                      <td className="px-4 py-3 text-right font-semibold">{loc.planned_daily_meals.toLocaleString('vi-VN')}</td>
                      {canEdit && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => openEdit(loc)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="Chỉnh sửa"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">Thiết lập Tiêu chuẩn Bếp</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveForm} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Code Number *</label>
                  <input
                    type="text"
                    required
                    value={form.code_number}
                    onChange={(e) => setForm({ ...form, code_number: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ban *</label>
                  <input
                    type="text"
                    required
                    value={form.operating_block}
                    onChange={(e) => setForm({ ...form, operating_block: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tên Bếp *</label>
                <input
                  type="text"
                  required
                  value={form.location_name}
                  onChange={(e) => setForm({ ...form, location_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Đơn giá (VNĐ)</label>
                  <input
                    type="number"
                    required
                    value={form.unit_price}
                    onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tỷ suất LN (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={form.profit_margin_pct}
                    onChange={(e) => setForm({ ...form, profit_margin_pct: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">KH Suất/Ngày mặc định</label>
                  <input
                    type="number"
                    required
                    value={form.planned_daily_meals}
                    onChange={(e) => {
                      const d = Number(e.target.value);
                      setForm({ ...form, planned_daily_meals: d, planned_monthly_meals: d * 26 });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold cursor-pointer"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
