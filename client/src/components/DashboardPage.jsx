import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, RefreshCw, ChevronDown, ChevronRight, Columns2, Utensils, DollarSign } from 'lucide-react';
import { apiFetch } from '../api';

const DOW_EN_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function fmtNumber(raw, divisor, decimals) {
  const val = (Number(raw) || 0) / divisor;
  if (Math.abs(val) < (decimals > 0 ? 0.05 : 0.5)) {
    return decimals > 0 ? (0).toFixed(decimals) : '0';
  }
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtHeroNumber(raw, divisor) {
  const val = Math.round((Number(raw) || 0) / divisor);
  return val.toLocaleString('en-US');
}

function DiffCell({ raw, divisor, decimals, bold = false, extraClass = '' }) {
  const val = (Number(raw) || 0) / divisor;
  const negThreshold = decimals > 0 ? -0.05 : -0.5;
  const isNeg = val < negThreshold;
  const absStr = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (isNeg) {
    return (
      <td
        className={`px-2 py-1.5 text-right tabular-nums text-[#dc2626] whitespace-nowrap ${
          bold ? 'font-bold' : 'font-semibold'
        } ${extraClass}`}
      >
        ▲{absStr}
      </td>
    );
  }
  const zeroStr = decimals > 0 ? (0).toFixed(decimals) : '0';
  const display = Math.abs(val) < Math.abs(negThreshold) ? zeroStr : absStr;
  return (
    <td
      className={`px-2 py-1.5 text-right tabular-nums text-slate-800 whitespace-nowrap ${
        bold ? 'font-bold' : ''
      } ${extraClass}`}
    >
      {display}
    </td>
  );
}

function MealHeaderIllustration() {
  return (
    <svg viewBox="0 0 88 72" className="w-14 h-12 shrink-0" aria-hidden="true">
      <circle cx="58" cy="28" r="21" fill="#f96332" opacity="0.92" />
      <rect x="46" y="18" width="18" height="4" rx="2" fill="#fff" opacity="0.9" />
      <rect x="46" y="25" width="24" height="4" rx="2" fill="#fff" opacity="0.75" />
      <rect x="46" y="32" width="14" height="4" rx="2" fill="#fff" opacity="0.6" />
      <circle cx="17" cy="20" r="8" fill="#fbbf24" stroke="#334155" strokeWidth="1.6" />
      <path d="M14 28h6M15 31h4" stroke="#334155" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="33" cy="36" r="6" fill="#fff" stroke="#334155" strokeWidth="1.8" />
      <path d="M22 60c0-8 5-13 11-13s11 5 11 13" fill="#cbd5e1" stroke="#334155" strokeWidth="1.8" />
      <line x1="8" y1="60" x2="78" y2="60" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <rect x="52" y="54" width="18" height="6" rx="1.5" fill="#94a3b8" stroke="#334155" strokeWidth="1.4" />
    </svg>
  );
}

function RevenueHeaderIllustration() {
  return (
    <svg viewBox="0 0 88 72" className="w-14 h-12 shrink-0" aria-hidden="true">
      <circle cx="58" cy="28" r="21" fill="#f96332" opacity="0.92" />
      <rect x="47" y="32" width="5" height="10" rx="1.5" fill="#fff" opacity="0.75" />
      <rect x="55" y="26" width="5" height="16" rx="1.5" fill="#fff" opacity="0.88" />
      <rect x="63" y="19" width="5" height="23" rx="1.5" fill="#fff" />
      <circle cx="17" cy="20" r="8" fill="#fbbf24" stroke="#334155" strokeWidth="1.6" />
      <text x="17" y="24" textAnchor="middle" fontSize="10" fontWeight="800" fill="#334155">₫</text>
      <circle cx="33" cy="36" r="6" fill="#fff" stroke="#334155" strokeWidth="1.8" />
      <path d="M22 60c0-8 5-13 11-13s11 5 11 13" fill="#cbd5e1" stroke="#334155" strokeWidth="1.8" />
      <line x1="8" y1="60" x2="78" y2="60" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <rect x="52" y="54" width="18" height="6" rx="1.5" fill="#94a3b8" stroke="#334155" strokeWidth="1.4" />
    </svg>
  );
}

function HeroSummaryCard({
  title,
  unitLabel,
  panelData,
  dateInfo,
  divisor,
  decimals,
  kind = 'meal',
  active = false,
  onSelect,
}) {
  const { summary, totalRow } = panelData;
  const dayDiffScaled = (Number(totalRow.dayDiffPlan) || 0) / divisor;
  const negThr = decimals > 0 ? -0.05 : -0.5;
  const posThr = Math.abs(negThr);
  const diffAbsStr = Math.abs(dayDiffScaled).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const isDayNeg = dayDiffScaled < negThr;
  const isDayPos = dayDiffScaled > posThr;
  const compClamped = Math.max(0, Math.min(100, Number(summary.completionPct) || 0));

  return (
    <div
      onClick={onSelect}
      className={`bg-[#eef5e9] rounded-2xl p-3.5 sm:p-4 flex flex-col gap-2.5 transition cursor-pointer ${
        active
          ? 'border-2 border-blue-500 shadow-md ring-2 ring-blue-100'
          : 'border border-[#d2e3c6] shadow-xs hover:border-blue-300'
      }`}
    >
      {/* Editorial Title */}
      <div className="flex items-center gap-2.5">
        {kind === 'meal' ? <MealHeaderIllustration /> : <RevenueHeaderIllustration />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xl leading-none font-black text-[#f96332] select-none">&ldquo;</span>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              {kind === 'meal' ? 'Báo cáo suất ăn hàng ngày' : 'Báo cáo doanh thu hàng ngày'}
            </span>
          </div>
          <h2 className="text-xs sm:text-sm font-extrabold tracking-tight text-slate-900 uppercase leading-snug truncate">
            {title}
          </h2>
        </div>
      </div>

      {/* Balanced 2-Box Hero */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.18fr] gap-2.5 items-stretch">
        {/* Left Orange Pill */}
        <div className="bg-gradient-to-br from-[#fcb94d] to-[#f4a530] rounded-[20px] px-4 py-3 flex flex-col items-center justify-center gap-1 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
            Thực tế ngày {dateInfo.dNum}/{dateInfo.mNum}
          </span>
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-3xl sm:text-[42px] leading-none font-black text-white tracking-tight tabular-nums drop-shadow-xs">
              {fmtHeroNumber(summary.dayActual, divisor)}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-white/95 whitespace-nowrap">
              {unitLabel}
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums shadow-xs ${
              isDayNeg
                ? 'bg-white/95 text-[#dc2626]'
                : isDayPos
                ? 'bg-white/95 text-emerald-700'
                : 'bg-white/90 text-slate-700'
            }`}
          >
            {isDayNeg ? `▲ ${diffAbsStr} vs KH` : isDayPos ? `+${diffAbsStr} vs KH` : 'Đạt KH ngày'}
          </span>
        </div>

        {/* Right Purple-Bordered Box */}
        <div className="bg-white/85 border-2 border-[#b197fc] rounded-[20px] px-4 py-2.5 flex flex-col justify-center gap-1.5">
          <div className="grid grid-cols-[118px_1fr] items-baseline gap-2">
            <span className="text-xs font-bold text-slate-700">Lũy kế tháng</span>
            <div className="text-right tabular-nums whitespace-nowrap">
              <span className="text-base font-black text-slate-900">
                {fmtHeroNumber(summary.mtdActual, divisor)}
              </span>{' '}
              <span className="text-[11px] font-bold text-slate-600">{unitLabel}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="grid grid-cols-[118px_1fr] items-baseline gap-2">
              <span className="text-xs font-bold text-slate-700">Tỉ lệ hoàn thành</span>
              <span
                className={`text-right text-base font-black tabular-nums ${
                  summary.completionPct >= 100 ? 'text-emerald-600' : 'text-[#dc2626]'
                }`}
              >
                {summary.completionPct.toFixed(1)} %
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  summary.completionPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${compClamped}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-[118px_1fr] items-center gap-2">
            <span className="text-xs font-bold text-slate-700">So với năm ngoái</span>
            <div className="text-right">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black tabular-nums ${
                  summary.yoyPct >= 100
                    ? 'bg-emerald-100/90 text-emerald-700'
                    : 'bg-rose-100/90 text-[#dc2626]'
                }`}
              >
                <span>{summary.yoyPct >= 100 ? '▲' : '▼'}</span>
                <span>{summary.yoyPct.toFixed(1)} %</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UnifiedStatusTable({
  panelData,
  dateInfo,
  unitLabel,
  divisor,
  decimals,
  compact = false,
  openSections,
  onToggleSection,
}) {
  const { totalRow, groupRows, blockRows, industryRows } = panelData;
  const { dNum, mNum, dowLabel, sameDowShortDate } = dateInfo;
  const shortDate = `${dNum}/${mNum}`;

  const sections = [
    { key: 'group', title: `NHÓM A / B (${groupRows.length})`, rows: groupRows, alignLeft: false },
    { key: 'block', title: `KHỐI ĐIỀU HÀNH (${blockRows.length})`, rows: blockRows, alignLeft: false },
    { key: 'industry', title: `NGÀNH NGHỀ (${industryRows.length})`, rows: industryRows, alignLeft: true },
  ];

  const renderDataRow = (r, keyPrefix, isTotal = false, alignLeft = false) => (
    <tr
      key={`${keyPrefix}-${r.label}`}
      className={
        isTotal
          ? 'bg-[#e6ecf5] font-bold border-y-2 border-slate-300'
          : 'border-b border-slate-200/75 hover:bg-amber-50/40 transition-colors'
      }
    >
      <td
        className={`px-2.5 py-1.5 whitespace-nowrap text-slate-900 ${
          isTotal
            ? 'text-left font-extrabold uppercase tracking-tight'
            : alignLeft
            ? 'text-left pl-5 font-medium text-slate-800'
            : 'text-left pl-5 font-semibold text-slate-800'
        }`}
      >
        {isTotal ? 'TỔNG TOÀN CÔNG TY' : r.label}
      </td>
      {/* Hôm nay */}
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-900 font-semibold whitespace-nowrap">
        {fmtNumber(r.dayActual, divisor, decimals)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
        {fmtNumber(r.dayPlan, divisor, decimals)}
      </td>
      <DiffCell raw={r.dayDiffPlan} divisor={divisor} decimals={decimals} bold={isTotal} />
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
        {fmtNumber(r.dayLy, divisor, decimals)}
      </td>
      <DiffCell raw={r.dayDiffLy} divisor={divisor} decimals={decimals} bold={isTotal} />
      {/* Cùng thứ năm trước */}
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-800 whitespace-nowrap bg-[#eff6ff]/70 border-l border-sky-200">
        {fmtNumber(r.dayLySameDow, divisor, decimals)}
      </td>
      <DiffCell
        raw={r.dayDiffLySameDow}
        divisor={divisor}
        decimals={decimals}
        bold={isTotal}
        extraClass="bg-[#eff6ff]/70"
      />
      {/* Lũy kế tháng */}
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-900 font-semibold whitespace-nowrap bg-[#f7f5ff]/70 border-l border-purple-200">
        {fmtNumber(r.mtdActual, divisor, decimals)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 whitespace-nowrap bg-[#f7f5ff]/70">
        {fmtNumber(r.mtdPlan, divisor, decimals)}
      </td>
      <DiffCell raw={r.mtdDiffPlan} divisor={divisor} decimals={decimals} bold={isTotal} extraClass="bg-[#f7f5ff]/70" />
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 whitespace-nowrap bg-[#f7f5ff]/70">
        {fmtNumber(r.mtdLy, divisor, decimals)}
      </td>
      <DiffCell raw={r.mtdDiffLy} divisor={divisor} decimals={decimals} bold={isTotal} extraClass="bg-[#f7f5ff]/70" />
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse leading-snug ${compact ? 'text-[11px]' : 'text-xs sm:text-[12.5px]'}`}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th
              rowSpan={2}
              className="px-3 py-2 text-left font-extrabold text-slate-800 bg-[#edf2ec] border border-slate-300/80 min-w-[165px]"
            >
              Phân loại <span className="font-normal text-[10.5px] text-slate-500">({unitLabel})</span>
            </th>
            <th
              colSpan={7}
              className="px-2 py-1.5 text-center font-extrabold text-slate-900 bg-[#f6c465] border border-amber-400/70"
            >
              Hôm nay ({dowLabel} — {shortDate})
            </th>
            <th
              colSpan={5}
              className="px-2 py-1.5 text-center font-extrabold text-slate-900 bg-[#b9a7f8] border border-purple-400/70"
            >
              Lũy kế tháng (01/{mNum} ~ {shortDate})
            </th>
          </tr>
          <tr className="text-[10.5px] font-bold text-slate-800">
            <th className="px-1.5 py-1.5 text-center bg-[#f9d792] border border-amber-300/80 whitespace-nowrap">
              Năm nay ({shortDate})
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#f9d792] border border-amber-300/80 whitespace-nowrap">
              Kế hoạch
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#f9d792] border border-amber-300/80 whitespace-nowrap">
              So với KH
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#f9d792] border border-amber-300/80 whitespace-nowrap">
              Năm ngoái ({shortDate})
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#f9d792] border border-amber-300/80 whitespace-nowrap">
              So với NT
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#cfe8ff] border border-sky-300/80 whitespace-nowrap">
              Cùng thứ NT ({sameDowShortDate || shortDate})
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#cfe8ff] border border-sky-300/80 whitespace-nowrap">
              So cùng thứ
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#d5c8fb] border border-purple-300/80 whitespace-nowrap">
              Năm nay
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#d5c8fb] border border-purple-300/80 whitespace-nowrap">
              Kế hoạch
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#d5c8fb] border border-purple-300/80 whitespace-nowrap">
              So với KH
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#d5c8fb] border border-purple-300/80 whitespace-nowrap">
              Năm ngoái
            </th>
            <th className="px-1.5 py-1.5 text-center bg-[#d5c8fb] border border-purple-300/80 whitespace-nowrap">
              So với NT
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Single Company Total Row */}
          {renderDataRow(totalRow, 'total', true, false)}

          {/* 3 Collapsible Sections */}
          {sections.map((sec) => {
            const isOpen = openSections[sec.key];
            return (
              <React.Fragment key={sec.key}>
                <tr
                  onClick={() => onToggleSection(sec.key)}
                  className="bg-slate-100/90 hover:bg-slate-200/70 border-y border-slate-200 cursor-pointer select-none"
                >
                  <td colSpan={13} className="px-2.5 py-1.5 text-[11px] font-extrabold text-slate-700 tracking-wide">
                    <span className="inline-flex items-center gap-1.5">
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      {sec.title}
                    </span>
                  </td>
                </tr>
                {isOpen && sec.rows.map((r) => renderDataRow(r, sec.key, false, sec.alignLeft))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const [date, setDate] = useState('');
  const [viewMode, setViewMode] = useState('meals'); // 'meals' | 'revenue' | 'split'
  const [openSections, setOpenSections] = useState({ group: true, block: true, industry: true });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async (targetDate) => {
    setLoading(true);
    setError('');
    try {
      const qs = targetDate ? `?date=${encodeURIComponent(targetDate)}` : '';
      const res = await apiFetch(`/api/dashboard/exec-status${qs}`);
      setData(res);
      if (!targetDate && res.date) {
        setDate(res.date);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(date);
  }, [date, loadData]);

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeDate = data?.date || date;
  const dateInfo = (() => {
    if (!activeDate) return { dNum: 1, mNum: 1, year: 2026, dowLabel: '', sameDowShortDate: '' };
    const [y, m, d] = activeDate.split('-').map(Number);
    const dt = new Date(`${activeDate}T00:00:00`);
    let sameDowShortDate = '';
    if (data?.sameDowLyDate) {
      const [, lm, ld] = data.sameDowLyDate.split('-').map(Number);
      sameDowShortDate = `${ld}/${lm}`;
    }
    return {
      dNum: d,
      mNum: m,
      year: y,
      dowLabel: DOW_EN_VN[dt.getDay()] || '',
      sameDowShortDate,
    };
  })();

  const mealTitle = `THỰC TRẠNG SUẤT ĂN NGÀY ${dateInfo.dNum} THÁNG ${dateInfo.mNum} NĂM ${dateInfo.year}`;
  const revTitle = `THỰC TRẠNG DOANH THU NGÀY ${dateInfo.dNum} THÁNG ${dateInfo.mNum} NĂM ${dateInfo.year}`;

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Dashboard 2: Thực trạng Suất ăn &amp; Doanh thu
          </h1>
          <p className="text-xs text-slate-500">
            Tổng quan song song Suất ăn &amp; Doanh thu · Bảng phân cấp 13 cột theo Nhóm A/B, Khối FS và Ngành nghề
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm bg-transparent text-slate-800 outline-none"
            />
          </div>
          <button
            onClick={() => loadData(date)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Cập nhật
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
          Đang tổng hợp dữ liệu suất ăn &amp; doanh thu...
        </div>
      )}

      {data && (
        <>
          {/* Tầng 1: 2 Khối Hero Tổng quan đặt ngang hàng 50/50 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <HeroSummaryCard
              title={mealTitle}
              unitLabel="Nghìn suất"
              panelData={data.meals}
              dateInfo={dateInfo}
              divisor={1000}
              decimals={1}
              kind="meal"
              active={viewMode === 'meals'}
              onSelect={() => setViewMode('meals')}
            />

            <HeroSummaryCard
              title={revTitle}
              unitLabel="Triệu đồng"
              panelData={data.revenue}
              dateInfo={dateInfo}
              divisor={1e6}
              decimals={0}
              kind="revenue"
              active={viewMode === 'revenue'}
              onSelect={() => setViewMode('revenue')}
            />
          </div>

          {/* Tầng 2: Thanh công cụ chuyển đổi + Bảng phân cấp toàn chiều rộng */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setViewMode('meals')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                    viewMode === 'meals'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5" />
                  Suất ăn (Nghìn suất)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('revenue')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                    viewMode === 'revenue'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Doanh thu (Triệu đồng)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
                    viewMode === 'split'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  Xem 2 cột song song
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Bấm thanh nhóm để thu gọn/mở rộng</span>
                <button
                  type="button"
                  onClick={() => {
                    const allOpen = openSections.group && openSections.block && openSections.industry;
                    setOpenSections({ group: !allOpen, block: !allOpen, industry: !allOpen });
                  }}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {openSections.group && openSections.block && openSections.industry ? 'Thu gọn tất cả' : 'Mở tất cả'}
                </button>
              </div>
            </div>

            {viewMode === 'meals' && (
              <UnifiedStatusTable
                panelData={data.meals}
                dateInfo={dateInfo}
                unitLabel="Nghìn suất"
                divisor={1000}
                decimals={1}
                openSections={openSections}
                onToggleSection={toggleSection}
              />
            )}

            {viewMode === 'revenue' && (
              <UnifiedStatusTable
                panelData={data.revenue}
                dateInfo={dateInfo}
                unitLabel="Triệu đồng"
                divisor={1e6}
                decimals={0}
                openSections={openSections}
                onToggleSection={toggleSection}
              />
            )}

            {viewMode === 'split' && (
              <div className="grid grid-cols-1 2xl:grid-cols-2 divide-y 2xl:divide-y-0 2xl:divide-x divide-slate-200">
                <div>
                  <div className="px-3 py-2 bg-[#eef5e9] border-b border-slate-200 text-xs font-extrabold text-slate-800 uppercase">
                    Suất ăn (Nghìn suất)
                  </div>
                  <UnifiedStatusTable
                    panelData={data.meals}
                    dateInfo={dateInfo}
                    unitLabel="Nghìn suất"
                    divisor={1000}
                    decimals={1}
                    compact
                    openSections={openSections}
                    onToggleSection={toggleSection}
                  />
                </div>
                <div>
                  <div className="px-3 py-2 bg-[#eef5e9] border-b border-slate-200 text-xs font-extrabold text-slate-800 uppercase">
                    Doanh thu (Triệu đồng)
                  </div>
                  <UnifiedStatusTable
                    panelData={data.revenue}
                    dateInfo={dateInfo}
                    unitLabel="Triệu đồng"
                    divisor={1e6}
                    decimals={0}
                    compact
                    openSections={openSections}
                    onToggleSection={toggleSection}
                  />
                </div>
              </div>
            )}

            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
              ※ Chi tiết từng địa điểm xem tại mục Báo cáo Excel &amp; Email hoặc Thực tế D-1. Bấm trực tiếp vào thẻ Tổng quan Suất ăn / Doanh thu phía trên để chuyển bảng nhanh.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
