import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  DollarSign,
  Filter,
  Search,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { apiFetch, formatVND, getYesterdayISO, shiftISO } from '../api';

function TrendComposedChart({ chartData, heightClass = 'h-72' }) {
  const labels = {
    actual: 'Thực tế',
    planned: 'Kế hoạch',
    ly: 'Năm trước',
  };
  return (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(val, name) => [
              val === null || val === undefined ? 'Chưa nhập' : Number(val).toLocaleString('vi-VN') + ' suất',
              labels[name] || name,
            ]}
          />
          <Legend formatter={(v) => labels[v] || v} />
          <Bar dataKey="actual" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={30} />
          <Line type="monotone" dataKey="planned" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 2.5 }} />
          <Line type="monotone" dataKey="ly" stroke="#64748b" strokeWidth={1.8} strokeDasharray="4 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardPage() {
  const yesterday = getYesterdayISO();
  const [mode, setMode] = useState('day'); // 'day' | 'range' | 'month'
  const [date, setDate] = useState(yesterday);
  const [startDate, setStartDate] = useState(shiftISO(yesterday, -6));
  const [endDate, setEndDate] = useState(yesterday);
  const [month, setMonth] = useState(yesterday.slice(0, 7));

  const [block, setBlock] = useState('ALL');
  const [selectedChartBlocks, setSelectedChartBlocks] = useState(null);
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        mode,
        date,
        startDate,
        endDate,
        month,
        block,
      });
      const res = await apiFetch(`/api/dashboard?${params.toString()}`);
      setData(res);
      setSelectedChartBlocks((prev) => {
        if (prev !== null) return prev;
        const available = (res.blockTrends || []).map((b) => b.operating_block);
        return available.slice(0, 2);
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, date, startDate, endDate, month, block]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredLocations = (data?.locations || []).filter((loc) => {
    if (onlyAlerts && !loc.isAlert) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        loc.code_number.toLowerCase().includes(q) ||
        loc.location_name.toLowerCase().includes(q) ||
        loc.operating_block.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const summary = data?.summary;
  const periodLabel =
    mode === 'day'
      ? `Ngày D-1 (${date})`
      : mode === 'range'
      ? `Từ ${startDate} đến ${endDate}`
      : `Tháng ${month}`;

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Monitoring Suất Ăn (D-1)</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            So sánh Thực tế vs Kế hoạch &amp; Cùng kỳ Năm trước ({periodLabel}) — Cảnh báo giảm từ 3% trở lên
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-semibold">
            {[
              { id: 'day', label: 'Theo ngày (D-1)' },
              { id: 'range', label: 'Từ ngày - Đến ngày' },
              { id: 'month', label: 'Theo tháng' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                  mode === m.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'day' && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700"
            />
          )}

          {mode === 'range' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700"
              />
              <span className="text-slate-400 text-xs">đến</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700"
              />
            </div>
          )}

          {mode === 'month' && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700"
            />
          )}

          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              className="text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
            >
              <option value="ALL">Tất cả Khối / Ban</option>
              {(data?.blocks || []).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadData}
            className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Suất Thực tế / KH</span>
              <UtensilsCrossed className="w-5 h-5 text-blue-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {summary.actualMeals.toLocaleString('vi-VN')}
              </span>
              <span className="text-sm text-slate-500">
                / {summary.planMeals.toLocaleString('vi-VN')}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-medium">
              <span className={summary.mealVariancePct <= -3 ? 'text-red-600 font-bold' : summary.mealVariancePct < 0 ? 'text-amber-600' : 'text-emerald-600'}>
                vs KH: {summary.mealVariancePct > 0 ? '+' : ''}{summary.mealVariancePct}%
              </span>
              <span className="text-slate-500">
                vs Năm trước:{' '}
                <strong className={summary.mealVsLyPct !== null && summary.mealVsLyPct < 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {summary.mealVsLyPct !== null ? `${summary.mealVsLyPct > 0 ? '+' : ''}${summary.mealVsLyPct}%` : '-'}
                </strong>
              </span>
            </div>
          </div>

          <div className={`p-5 rounded-xl border shadow-sm ${summary.alertCount > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wider ${summary.alertCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                Cảnh báo giảm &ge; 3%
              </span>
              {summary.alertCount > 0 ? (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              )}
            </div>
            <div className={`mt-2 text-2xl font-bold ${summary.alertCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {summary.alertCount} / {summary.locationCount} bếp
            </div>
            <div className="mt-2 text-xs text-slate-600">
              Đã có dữ liệu D-1: {summary.reportedCount}/{summary.locationCount} bếp
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ảnh hưởng Doanh thu KH</span>
              <DollarSign className="w-5 h-5 text-amber-600" />
            </div>
            <div className={`mt-2 text-xl font-bold ${summary.revenueImpact < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {summary.revenueImpact > 0 ? '+' : ''}{formatVND(summary.revenueImpact)}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>TT: {formatVND(summary.actualRevenue)}</span>
              <span>
                vs NT:{' '}
                <strong className={summary.revenueVsLyPct !== null && summary.revenueVsLyPct < 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {summary.revenueVsLyPct !== null ? `${summary.revenueVsLyPct > 0 ? '+' : ''}${summary.revenueVsLyPct}%` : '-'}
                </strong>
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ảnh hưởng Lợi nhuận KH</span>
              <TrendingDown className="w-5 h-5 text-rose-600" />
            </div>
            <div className={`mt-2 text-xl font-bold ${summary.profitImpact < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {summary.profitImpact > 0 ? '+' : ''}{formatVND(summary.profitImpact)}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              LN Kế hoạch kỳ: {formatVND(summary.plannedProfit)}
            </div>
          </div>
        </div>
      )}

      {/* Overall Chart + Block Summary */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-base font-bold text-slate-800 mb-4">
              Xu hướng Suất ăn Tổng hợp ({data.trendStart} &rarr; {data.trendEnd})
            </h2>
            <TrendComposedChart chartData={data.weeklyTrend} heightClass="h-72" />
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm max-h-[380px] overflow-y-auto">
            <h2 className="text-base font-bold text-slate-800 mb-4">Tổng hợp theo Khối / Ban</h2>
            <div className="space-y-3">
              {data.blockBreakdown.map((b) => {
                const pct = b.planned_meals > 0 ? (((b.actual_meals - b.planned_meals) / b.planned_meals) * 100).toFixed(2) : '0.00';
                return (
                  <div key={b.operating_block} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-800">{b.operating_block}</span>
                      {b.alert_count > 0 ? (
                        <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full">
                          {b.alert_count} cảnh báo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">
                          Ổn định
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                      <span>Thực tế/KH: {b.actual_meals.toLocaleString('vi-VN')} / {b.planned_meals.toLocaleString('vi-VN')}</span>
                      <span className={Number(pct) <= -3 ? 'text-red-600 font-bold' : 'text-slate-700 font-medium'}>
                        {Number(pct) > 0 ? '+' : ''}{pct}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Ảnh hưởng LN:</span>
                      <span className={b.profit_impact < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                        {b.profit_impact > 0 ? '+' : ''}{formatVND(b.profit_impact)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Per-Operating-Block Trend Charts */}
      {data?.blockTrends && data.blockTrends.length > 0 && (() => {
        const availableBlocks = data.blockTrends.map((bt) => bt.operating_block);
        const activeSet = new Set(selectedChartBlocks || []);
        const visibleTrends = data.blockTrends.filter((bt) => activeSet.has(bt.operating_block));

        const toggleChartBlock = (bName) => {
          setSelectedChartBlocks((prev) => {
            const cur = prev || [];
            return cur.includes(bName) ? cur.filter((x) => x !== bName) : [...cur, bName];
          });
        };

        return (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Biểu đồ Xu hướng Suất ăn theo từng Khối / Ban điều hành
                </h2>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedChartBlocks(availableBlocks)}
                    className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedChartBlocks([])}
                    className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {availableBlocks.map((bName) => {
                  const checked = activeSet.has(bName);
                  return (
                    <label
                      key={bName}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer select-none transition ${
                        checked
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChartBlock(bName)}
                        className="accent-white"
                      />
                      <span>{bName}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {visibleTrends.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-dashed border-slate-300 text-center text-sm text-slate-500">
                Vui lòng tích chọn ít nhất 1 Khối / Ban điều hành ở trên để hiển thị biểu đồ.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {visibleTrends.map((bt) => (
                  <div key={bt.operating_block} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-slate-800">{bt.operating_block}</h3>
                      <span className="text-xs text-slate-400">
                        {data.trendStart} &rarr; {data.trendEnd}
                      </span>
                    </div>
                    <TrendComposedChart chartData={bt.trend} heightClass="h-60" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Detailed Location Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-800">Chi tiết theo Bếp / Địa điểm ({filteredLocations.length})</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã hoặc tên bếp..."
                className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyAlerts}
                onChange={(e) => setOnlyAlerts(e.target.checked)}
                className="rounded text-red-600 focus:ring-red-500"
              />
              <span>Chỉ hiện cảnh báo (&ge;3% giảm)</span>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 font-semibold">Code</th>
                <th className="px-3 py-3 font-semibold">Bếp / Địa điểm</th>
                <th className="px-3 py-3 font-semibold">Ban</th>
                <th className="px-3 py-3 font-semibold text-right">KH Kỳ</th>
                <th className="px-3 py-3 font-semibold text-right">Thực tế</th>
                <th className="px-3 py-3 font-semibold text-right">Năm trước</th>
                <th className="px-3 py-3 font-semibold text-right">% vs KH</th>
                <th className="px-3 py-3 font-semibold text-right">% vs NT</th>
                <th className="px-3 py-3 font-semibold text-center">Trạng thái</th>
                <th className="px-3 py-3 font-semibold text-right">Ảnh hưởng DT KH</th>
                <th className="px-3 py-3 font-semibold text-right">Ảnh hưởng LN KH</th>
                <th className="px-3 py-3 font-semibold text-right">Lũy kế / KH Tháng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLocations.map((loc) => (
                <tr key={loc.code_number} className={loc.isAlert ? 'bg-red-50/70 hover:bg-red-100/60' : 'hover:bg-slate-50'}>
                  <td className="px-3 py-3 font-mono font-semibold text-slate-700">{loc.code_number}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">
                    <div>{loc.location_name}</div>
                    {loc.note && <div className="text-xs text-slate-500 italic">{loc.note}</div>}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{loc.operating_block}</td>
                  <td className="px-3 py-3 text-right">{(loc.has_data ? loc.planMeals : loc.planMealsFull).toLocaleString('vi-VN')}</td>
                  <td className="px-3 py-3 text-right font-semibold">
                    {loc.has_data ? loc.actualMeals.toLocaleString('vi-VN') : <span className="text-slate-400 italic">Chưa nhập</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-500">
                    {(loc.has_data ? loc.lyMeals : loc.lyMealsFull).toLocaleString('vi-VN')}
                  </td>
                  <td className={`px-3 py-3 text-right font-bold ${loc.isAlert ? 'text-red-600' : loc.variancePct < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {loc.has_data ? `${loc.variancePct > 0 ? '+' : ''}${loc.variancePct}%` : '-'}
                  </td>
                  <td className={`px-3 py-3 text-right text-xs font-semibold ${loc.vsLyPct !== null && loc.vsLyPct < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {loc.has_data && loc.vsLyPct !== null ? `${loc.vsLyPct > 0 ? '+' : ''}${loc.vsLyPct}%` : '-'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {!loc.has_data ? (
                      <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded-full">Chưa nhập</span>
                    ) : loc.isAlert ? (
                      <span className="px-2.5 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Giảm &ge;3%
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">
                        Đạt
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-3 text-right font-medium ${loc.revenueImpact < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {loc.has_data ? `${loc.revenueImpact > 0 ? '+' : ''}${formatVND(loc.revenueImpact)}` : '-'}
                  </td>
                  <td className={`px-3 py-3 text-right font-semibold ${loc.profitImpact < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {loc.has_data ? `${loc.profitImpact > 0 ? '+' : ''}${formatVND(loc.profitImpact)}` : '-'}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-slate-600">
                    {loc.mtdActualMeals.toLocaleString('vi-VN')} / {loc.monthPlanMeals.toLocaleString('vi-VN')}
                  </td>
                </tr>
              ))}
              {filteredLocations.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                    Không có dữ liệu phù hợp bộ lọc.
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
