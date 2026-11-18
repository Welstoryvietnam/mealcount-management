import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Search,
  Download,
  Utensils,
  DollarSign,
  Target,
  TrendingUp,
  Calendar,
  Building2,
  BarChart3,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { apiFetch, downloadFile, getYesterdayISO } from '../api';

const DOW_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const LINE_COLORS = [
  '#2563eb',
  '#ea580c',
  '#0d9488',
  '#eab308',
  '#7c3aed',
  '#16a34a',
  '#db2777',
];

const WEEK_LABELS_VN = {
  '1주': 'Tuần 1',
  '2주': 'Tuần 2',
  '3주': 'Tuần 3',
  '4주': 'Tuần 4',
};

function fmtThousand(meals, decimals = 1) {
  const v = (Number(meals) || 0) / 1000;
  return v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtBillionVND(vnd) {
  const b = (Number(vnd) || 0) / 1e9;
  return b.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function displayBlockLabel(b) {
  if (b === 'Chi nhánh HCM') return 'HCM';
  if (/^FS(\d+)$/i.test(b)) return b.replace(/^FS(\d+)$/i, 'FS $1');
  return b;
}

function VariancePill({ diff, unitDivisor = 1000, decimals = 1 }) {
  const val = (Number(diff) || 0) / unitDivisor;
  const threshold = decimals === 0 ? -0.5 : -0.04;
  const isNeg = val < threshold;
  const isPos = val > Math.abs(threshold);
  const absStr = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (isNeg) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200/80">
        △{absStr}
      </span>
    );
  }
  if (isPos) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
        +{absStr}
      </span>
    );
  }
  return <span className="text-xs text-slate-500 font-medium">0.0</span>;
}

export default function Dashboard1Page() {
  const [date, setDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters for Section 4 (Kitchen table)
  const [fsFilter, setFsFilter] = useState('ALL');
  const [kitchenSearch, setKitchenSearch] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/dashboard/exec-report?date=${encodeURIComponent(date)}`);
      setData(res);
      if (!date && res.date) setDate(res.date);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const effectiveDate = date || data?.date || getYesterdayISO();
  const dtObj = new Date(`${effectiveDate}T00:00:00`);
  const dayNum = dtObj.getDate();
  const monthNum = dtObj.getMonth() + 1;
  const dowVn = DOW_VN[dtObj.getDay()] || '';
  const ddmmVn = `${String(dayNum).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}`;

  const cs = data?.companySummary;
  const allBlockRows = data ? [data.totalRow, ...(data.blockRows || [])] : [];

  const filteredKitchens = (data?.kitchenRows || []).filter((k) => {
    if (fsFilter !== 'ALL' && k.operating_block !== fsFilter) return false;
    if (kitchenSearch.trim()) {
      const q = kitchenSearch.trim().toLowerCase();
      return (
        k.code_number.toLowerCase().includes(q) ||
        k.location_name.toLowerCase().includes(q) ||
        k.operating_block.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const chartDataVn = (data?.weeklyChartData || []).map((pt) => ({
    ...pt,
    weekVn: WEEK_LABELS_VN[pt.week] || pt.week,
  }));

  const handleExportExcel = async () => {
    try {
      await downloadFile(
        `/api/reports/excel?date=${encodeURIComponent(effectiveDate)}&block=ALL`,
        `BaoCao_SuatAn_${effectiveDate}.xlsx`
      );
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 rounded-2xl p-6 text-white shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[11px] font-semibold uppercase tracking-wider mb-2">
              <Calendar className="w-3.5 h-3.5" />
              <span>Báo cáo Điều hành Suất ăn (D-1)</span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
              TÌNH HÌNH SUẤT ĂN NGÀY {dayNum} THÁNG {monthNum} ({dowVn})
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              Tổng hợp toàn công ty, khối điều hành, xu hướng trung bình tuần và chi tiết từng bếp
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-1.5">
              <span className="text-xs text-slate-300 font-medium">Ngày báo cáo:</span>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:invert"
              />
            </div>

            <button
              onClick={loadReport}
              className="p-2.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-white transition cursor-pointer"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Báo cáo Excel</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">{error}</div>
      )}

      {/* SECTION 1: TÌNH HÌNH SUẤT ĂN TOÀN CÔNG TY (4 Hero KPI Cards) */}
      {cs && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
              <Building2 className="w-4 h-4" />
            </div>
            <h2 className="text-sm md:text-base font-bold text-slate-800 uppercase tracking-wide">
              1. Tình hình Suất ăn Toàn Công ty
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Tổng suất ăn */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tổng Suất Ăn</span>
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Utensils className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-xs font-semibold text-slate-400 w-14">Ngày:</span>
                <span className="text-2xl font-extrabold text-slate-900">
                  {Math.round(cs.dayActualMeals / 1000).toLocaleString('en-US')}
                </span>
                <span className="text-xs font-semibold text-blue-600">nghìn suất</span>
              </div>
              <div className="mt-2 pt-2.5 border-t border-slate-100 flex items-baseline gap-2">
                <span className="text-xs font-semibold text-slate-400 w-14">Lũy kế:</span>
                <span className="text-lg font-bold text-slate-800">
                  {Math.round(cs.mtdActualMeals / 1000).toLocaleString('en-US')}
                </span>
                <span className="text-xs text-slate-500">nghìn suất</span>
              </div>
            </div>

            {/* Card 2: Doanh thu */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tổng Doanh Thu</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-xs font-semibold text-slate-400 w-14">Ngày:</span>
                <span className="text-2xl font-extrabold text-slate-900">{fmtBillionVND(cs.dayActualRevenue)}</span>
                <span className="text-xs font-semibold text-amber-600">tỷ đồng</span>
              </div>
              <div className="mt-2 pt-2.5 border-t border-slate-100 flex items-baseline gap-2">
                <span className="text-xs font-semibold text-slate-400 w-14">Lũy kế:</span>
                <span className="text-lg font-bold text-slate-800">{fmtBillionVND(cs.mtdActualRevenue)}</span>
                <span className="text-xs text-slate-500">tỷ đồng</span>
              </div>
            </div>

            {/* Card 3: Tỉ lệ hoàn thành */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tỉ Lệ Hoàn Thành KH</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Target className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className={`text-3xl font-extrabold ${cs.completionRatePct >= 97 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {cs.completionRatePct}%
                </span>
                <span className="text-xs text-slate-400">Lũy kế / Mục tiêu</span>
              </div>
              <div className="mt-3 w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    cs.completionRatePct >= 97 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, cs.completionRatePct))}%` }}
                />
              </div>
            </div>

            {/* Card 4: Tỉ lệ tăng trưởng */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tỉ Lệ Tăng Trưởng</span>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className={`text-3xl font-extrabold ${cs.growthRatePct >= 100 ? 'text-indigo-600' : 'text-rose-600'}`}>
                  {cs.growthRatePct}%
                </span>
                <span className="text-xs text-slate-400">So với Năm ngoái</span>
              </div>
              <div className="mt-3 w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, cs.growthRatePct))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: TÌNH HÌNH SUẤT ĂN THEO ĐIỀU HÀNH */}
      {data && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                <Layers className="w-4 h-4" />
              </div>
              <h2 className="text-sm md:text-base font-bold text-slate-800 uppercase tracking-wide">
                2. Tình hình Suất ăn theo Khối Điều hành
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-200/80 text-slate-700 text-xs font-semibold">
              Đơn vị: nghìn suất
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="border-b border-r border-slate-200 px-3 py-3 text-center font-bold text-slate-800 bg-slate-100 w-36"
                  >
                    ĐIỀU HÀNH
                  </th>
                  <th
                    colSpan={5}
                    className="border-b border-r border-slate-200 px-3 py-2 text-center font-bold text-blue-900 bg-blue-50/90"
                  >
                    NGÀY ({dowVn} — {ddmmVn})
                  </th>
                  <th
                    colSpan={6}
                    className="border-b border-slate-200 px-3 py-2 text-center font-bold text-teal-900 bg-teal-50/90"
                  >
                    LŨY KẾ THÁNG (01/{String(monthNum).padStart(2, '0')} ~ {ddmmVn})
                  </th>
                </tr>
                <tr className="bg-slate-50 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right">Thực tế</th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right">Mục tiêu</th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right bg-slate-100/80">So với MT</th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right">Năm ngoái</th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right bg-slate-100/80">So với NN</th>

                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right">Thực tế</th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right">Mục tiêu</th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right bg-slate-100/80">So với MT</th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right">Năm ngoái</th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2 text-right bg-slate-100/80">So với NN</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-center w-28">% Hoàn thành</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {allBlockRows.map((r, idx) => {
                  const isTotal = r.operating_block === 'TỔNG';
                  const mtdPct = r.mtdPlan > 0 ? Math.round((r.mtdActual / r.mtdPlan) * 100) : 0;
                  const isSelected = fsFilter === r.operating_block;

                  return (
                    <tr
                      key={r.operating_block}
                      onClick={() => setFsFilter(isTotal ? 'ALL' : isSelected ? 'ALL' : r.operating_block)}
                      title="Nhấn để lọc danh sách bếp bên dưới theo khối này"
                      className={`transition cursor-pointer ${
                        isTotal
                          ? 'bg-slate-800 text-white font-bold'
                          : isSelected
                          ? 'bg-blue-50/90 font-semibold'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="border-r border-slate-200/70 px-3 py-2.5 text-center font-bold">
                        <div className="inline-flex items-center gap-2">
                          {!isTotal && (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: LINE_COLORS[(idx - 1) % LINE_COLORS.length] }}
                            />
                          )}
                          <span>{displayBlockLabel(r.operating_block)}</span>
                        </div>
                      </td>

                      {/* Daily */}
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right font-bold">
                        {fmtThousand(r.dayActual)}
                      </td>
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right opacity-85">
                        {fmtThousand(r.dayPlan)}
                      </td>
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right bg-slate-50/40">
                        <VariancePill diff={r.dayDiffPlan} unitDivisor={1000} decimals={1} />
                      </td>
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right opacity-85">
                        {fmtThousand(r.dayLy)}
                      </td>
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right bg-slate-50/40">
                        <VariancePill diff={r.dayDiffLy} unitDivisor={1000} decimals={1} />
                      </td>

                      {/* MTD */}
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right font-bold">
                        {fmtThousand(r.mtdActual)}
                      </td>
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right opacity-85">
                        {fmtThousand(r.mtdPlan)}
                      </td>
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right bg-slate-50/40">
                        <VariancePill diff={r.mtdDiffPlan} unitDivisor={1000} decimals={1} />
                      </td>
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right opacity-85">
                        {fmtThousand(r.mtdLy)}
                      </td>
                      <td className="border-r border-slate-200/60 px-2.5 py-2.5 text-right bg-slate-50/40">
                        <VariancePill diff={r.mtdDiffLy} unitDivisor={1000} decimals={1} />
                      </td>

                      {/* Mini progress */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200/80 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                mtdPct >= 97 ? 'bg-emerald-500' : mtdPct >= 90 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, mtdPct))}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold w-9 text-right">{mtdPct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: TÌNH HÌNH SUẤT ĂN TRUNG BÌNH THEO TUẦN */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left table (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-100 text-teal-700">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  3. Suất ăn Trung bình theo Tuần
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-medium">Đơn vị: nghìn suất</span>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold">
                    <th rowSpan={2} className="border-b border-r border-slate-200 px-3 py-2.5 text-center w-36">
                      ĐIỀU HÀNH
                    </th>
                    {(data.weekDefs || []).map((w) => (
                      <th key={w.key} className="border-b border-r border-slate-200 px-3 py-1.5 text-center">
                        <div className="text-slate-900 font-bold">{WEEK_LABELS_VN[w.label] || w.label}</div>
                        <div className="text-[10px] font-normal text-slate-500">{w.rangeLabel}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(data.weeklyTable || []).map((row, idx) => (
                    <tr key={row.operating_block} className="hover:bg-slate-50">
                      <td className="border-r border-slate-200 px-3 py-2.5 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}
                          />
                          <span>{displayBlockLabel(row.operating_block)}</span>
                        </div>
                      </td>
                      {['w1', 'w2', 'w3', 'w4'].map((wk) => (
                        <td key={wk} className="border-r border-slate-200 px-3 py-2.5 text-right font-semibold text-slate-800">
                          {row[wk] !== null ? (
                            fmtThousand(row[wk])
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-slate-800 text-white font-bold">
                    <td className="border-r border-slate-700 px-3 py-2.5 text-center">TỔNG (Suất)</td>
                    {['w1', 'w2', 'w3', 'w4'].map((wk) => (
                      <td key={wk} className="border-r border-slate-700 px-3 py-2.5 text-right">
                        {data.weeklyTotals?.[wk] !== null && data.weeklyTotals?.[wk] !== undefined
                          ? data.weeklyTotals[wk].toLocaleString('en-US')
                          : '-'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Right chart (5 cols) */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                Biểu đồ Xu hướng Trung bình Tuần
              </h3>
              <span className="text-xs text-slate-400">nghìn suất / ngày</span>
            </div>
            <div className="flex-1 min-h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartDataVn}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="weekVn" tick={{ fontSize: 11, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', borderColor: '#cbd5e1', fontSize: '12px' }}
                    formatter={(val, name) => [
                      val !== null ? `${val} nghìn suất` : '-',
                      displayBlockLabel(name),
                    ]}
                  />
                  <Legend
                    formatter={(v) => displayBlockLabel(v)}
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  />
                  {(data.blockRows || []).map((b, idx) => (
                    <Line
                      key={b.operating_block}
                      type="monotone"
                      dataKey={b.operating_block}
                      stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 4, strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: TÌNH HÌNH SUẤT ĂN THEO TỪNG BẾP */}
      {data && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                <Utensils className="w-4 h-4" />
              </div>
              <h2 className="text-sm md:text-base font-bold text-slate-800 uppercase tracking-wide">
                4. Tình hình Suất ăn theo từng Bếp ({filteredKitchens.length} bếp)
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Quick block filter pills */}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFsFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    fsFilter === 'ALL'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Tất cả ({data.kitchenRows?.length || 0})
                </button>
                {(data.blocks || []).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setFsFilter(b)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      fsFilter === b
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {displayBlockLabel(b)}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                <input
                  type="text"
                  value={kitchenSearch}
                  onChange={(e) => setKitchenSearch(e.target.value)}
                  placeholder="Tìm mã hoặc tên bếp..."
                  className="pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 font-bold shadow-2xs">
                <tr>
                  <th className="border-b border-r border-slate-200 px-3 py-2.5 text-left">Khối/Ban</th>
                  <th className="border-b border-r border-slate-200 px-3 py-2.5 text-left">Mã bếp</th>
                  <th className="border-b border-r border-slate-200 px-3 py-2.5 text-left">Tên bếp</th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2.5 text-right bg-blue-50/60">
                    Thực tế ({ddmmVn})
                  </th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2.5 text-right bg-blue-50/60">
                    Mục tiêu ({ddmmVn})
                  </th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2.5 text-right bg-blue-100/50">
                    So với MT
                  </th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2.5 text-right bg-blue-50/60">
                    Năm ngoái ({ddmmVn})
                  </th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2.5 text-right bg-blue-100/50">
                    So với NN
                  </th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2.5 text-right bg-teal-50/60">
                    Thực tế (Lũy kế)
                  </th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2.5 text-right bg-teal-50/60">
                    Mục tiêu (Lũy kế)
                  </th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2.5 text-right bg-teal-100/50">
                    So với MT
                  </th>
                  <th className="border-b border-r border-slate-200 px-2.5 py-2.5 text-right bg-teal-50/60">
                    Năm ngoái (Lũy kế)
                  </th>
                  <th className="border-b border-slate-200 px-2.5 py-2.5 text-right bg-teal-100/50">
                    So với NN
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredKitchens.map((k) => (
                  <tr key={k.code_number} className="hover:bg-blue-50/40 transition">
                    <td className="border-r border-slate-200/60 px-3 py-2 font-semibold text-slate-700">
                      {displayBlockLabel(k.operating_block)}
                    </td>
                    <td className="border-r border-slate-200/60 px-3 py-2 font-mono font-semibold text-slate-700">
                      {k.code_number}
                    </td>
                    <td className="border-r border-slate-200/60 px-3 py-2 font-medium text-slate-900">
                      {k.location_name}
                    </td>

                    <td className="border-r border-slate-200/60 px-2.5 py-2 text-right font-bold text-slate-900">
                      {k.dayActual.toLocaleString('en-US')}
                    </td>
                    <td className="border-r border-slate-200/60 px-2.5 py-2 text-right text-slate-600">
                      {k.dayPlan.toLocaleString('en-US')}
                    </td>
                    <td className="border-r border-slate-200/60 px-2.5 py-2 text-right">
                      <VariancePill diff={k.dayDiffPlan} unitDivisor={1} decimals={0} />
                    </td>
                    <td className="border-r border-slate-200/60 px-2.5 py-2 text-right text-slate-600">
                      {k.dayLy.toLocaleString('en-US')}
                    </td>
                    <td className="border-r border-slate-200/60 px-2.5 py-2 text-right">
                      <VariancePill diff={k.dayDiffLy} unitDivisor={1} decimals={0} />
                    </td>

                    <td className="border-r border-slate-200/60 px-2.5 py-2 text-right font-bold text-slate-900">
                      {k.mtdActual.toLocaleString('en-US')}
                    </td>
                    <td className="border-r border-slate-200/60 px-2.5 py-2 text-right text-slate-600">
                      {k.mtdPlan.toLocaleString('en-US')}
                    </td>
                    <td className="border-r border-slate-200/60 px-2.5 py-2 text-right">
                      <VariancePill diff={k.mtdDiffPlan} unitDivisor={1} decimals={0} />
                    </td>
                    <td className="border-r border-slate-200/60 px-2.5 py-2 text-right text-slate-600">
                      {k.mtdLy.toLocaleString('en-US')}
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <VariancePill diff={k.mtdDiffLy} unitDivisor={1} decimals={0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
