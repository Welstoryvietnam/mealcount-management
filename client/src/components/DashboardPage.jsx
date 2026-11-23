import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
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

function DiffCell({ raw, divisor, decimals, bold = false }) {
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
        className={`px-1 py-1 text-right tabular-nums text-[#dc2626] whitespace-nowrap ${
          bold ? 'font-bold' : 'font-semibold'
        }`}
      >
        ▲{absStr}
      </td>
    );
  }
  const zeroStr = decimals > 0 ? (0).toFixed(decimals) : '0';
  const display = Math.abs(val) < Math.abs(negThreshold) ? zeroStr : absStr;
  return (
    <td
      className={`px-1 py-1 text-right tabular-nums text-slate-800 whitespace-nowrap ${
        bold ? 'font-bold' : ''
      }`}
    >
      {display}
    </td>
  );
}

function SectionTable({
  sectionTitle,
  totalRow,
  rows,
  dateInfo,
  divisor,
  decimals,
  alignLeftRows = false,
}) {
  const { dNum, mNum, dowLabel } = dateInfo;
  const shortDate = `${dNum}/${mNum}`;

  const renderRow = (r, isTotal = false) => (
    <tr
      key={`${sectionTitle}-${r.label}`}
      className={
        isTotal
          ? 'bg-[#e9edf5] font-bold border-y border-slate-300'
          : 'border-b border-slate-200/80 hover:bg-amber-50/40'
      }
    >
      <td
        className={`px-1.5 py-1 whitespace-nowrap text-slate-800 ${
          isTotal
            ? 'text-center font-bold'
            : alignLeftRows
            ? 'text-left text-[11px] bg-[#f4f7f2]'
            : 'text-center font-medium bg-[#f4f7f2]'
        }`}
      >
        {r.label}
      </td>
      {/* Hôm nay */}
      <td className="px-1 py-1 text-right tabular-nums text-slate-900 whitespace-nowrap">
        {fmtNumber(r.dayActual, divisor, decimals)}
      </td>
      <td className="px-1 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap">
        {fmtNumber(r.dayPlan, divisor, decimals)}
      </td>
      <DiffCell raw={r.dayDiffPlan} divisor={divisor} decimals={decimals} bold={isTotal} />
      <td className="px-1 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap">
        {fmtNumber(r.dayLy, divisor, decimals)}
      </td>
      <DiffCell raw={r.dayDiffLy} divisor={divisor} decimals={decimals} bold={isTotal} />
      {/* Lũy kế tháng */}
      <td className="px-1 py-1 text-right tabular-nums text-slate-900 whitespace-nowrap bg-[#f7f5ff]/70 border-l border-purple-200">
        {fmtNumber(r.mtdActual, divisor, decimals)}
      </td>
      <td className="px-1 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap bg-[#f7f5ff]/70">
        {fmtNumber(r.mtdPlan, divisor, decimals)}
      </td>
      <DiffCell raw={r.mtdDiffPlan} divisor={divisor} decimals={decimals} bold={isTotal} />
      <td className="px-1 py-1 text-right tabular-nums text-slate-700 whitespace-nowrap bg-[#f7f5ff]/70">
        {fmtNumber(r.mtdLy, divisor, decimals)}
      </td>
      <DiffCell raw={r.mtdDiffLy} divisor={divisor} decimals={decimals} bold={isTotal} />
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11.5px] leading-tight">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="px-2 py-1.5 text-center font-bold text-slate-800 bg-[#edf2ec] border border-slate-300/80 text-xs min-w-[110px]"
            >
              {sectionTitle}
            </th>
            <th
              colSpan={5}
              className="px-1.5 py-1 text-center font-bold text-slate-900 bg-[#f6c465] border border-amber-400/70 text-[11px]"
            >
              Hôm nay ({dowLabel})
            </th>
            <th
              colSpan={5}
              className="px-1.5 py-1 text-center font-bold text-slate-900 bg-[#b9a7f8] border border-purple-400/70 text-[11px]"
            >
              Lũy kế tháng (ngày 1 tháng {mNum} ~ ngày {dNum} tháng {mNum})
            </th>
          </tr>
          <tr className="text-[10px] font-semibold text-slate-800">
            <th className="px-1 py-1 text-center bg-[#f9d792] border border-amber-300/70 whitespace-nowrap">
              Năm nay ({shortDate})
            </th>
            <th className="px-1 py-1 text-center bg-[#f9d792] border border-amber-300/70 whitespace-nowrap">
              Kế hoạch ({shortDate})
            </th>
            <th className="px-1 py-1 text-center bg-[#f9d792] border border-amber-300/70 whitespace-nowrap">
              So với KH
            </th>
            <th className="px-1 py-1 text-center bg-[#f9d792] border border-amber-300/70 whitespace-nowrap">
              Năm ngoái ({shortDate})
            </th>
            <th className="px-1 py-1 text-center bg-[#f9d792] border border-amber-300/70 whitespace-nowrap">
              So với NT
            </th>
            <th className="px-1 py-1 text-center bg-[#d5c8fb] border border-purple-300/70 whitespace-nowrap">
              Năm nay
            </th>
            <th className="px-1 py-1 text-center bg-[#d5c8fb] border border-purple-300/70 whitespace-nowrap">
              Kế hoạch
            </th>
            <th className="px-1 py-1 text-center bg-[#d5c8fb] border border-purple-300/70 whitespace-nowrap">
              So với KH
            </th>
            <th className="px-1 py-1 text-center bg-[#d5c8fb] border border-purple-300/70 whitespace-nowrap">
              Năm ngoái
            </th>
            <th className="px-1 py-1 text-center bg-[#d5c8fb] border border-purple-300/70 whitespace-nowrap">
              So với NT
            </th>
          </tr>
        </thead>
        <tbody>
          {renderRow(totalRow, true)}
          {rows.map((r) => renderRow(r, false))}
        </tbody>
      </table>
    </div>
  );
}

function MealHeaderIllustration() {
  return (
    <svg viewBox="0 0 88 72" className="w-16 h-14 shrink-0" aria-hidden="true">
      {/* Orange accent circle */}
      <circle cx="58" cy="28" r="21" fill="#f96332" opacity="0.92" />
      {/* Speech lines inside circle */}
      <rect x="46" y="18" width="18" height="4" rx="2" fill="#fff" opacity="0.9" />
      <rect x="46" y="25" width="24" height="4" rx="2" fill="#fff" opacity="0.75" />
      <rect x="46" y="32" width="14" height="4" rx="2" fill="#fff" opacity="0.6" />
      {/* Lightbulb */}
      <circle cx="17" cy="20" r="8" fill="#fbbf24" stroke="#334155" strokeWidth="1.6" />
      <path d="M14 28h6M15 31h4" stroke="#334155" strokeWidth="1.6" strokeLinecap="round" />
      {/* Minimal desk & person */}
      <circle cx="33" cy="36" r="6" fill="#fff" stroke="#334155" strokeWidth="1.8" />
      <path d="M22 60c0-8 5-13 11-13s11 5 11 13" fill="#cbd5e1" stroke="#334155" strokeWidth="1.8" />
      <line x1="8" y1="60" x2="78" y2="60" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <rect x="52" y="54" width="18" height="6" rx="1.5" fill="#94a3b8" stroke="#334155" strokeWidth="1.4" />
    </svg>
  );
}

function RevenueHeaderIllustration() {
  return (
    <svg viewBox="0 0 88 72" className="w-16 h-14 shrink-0" aria-hidden="true">
      {/* Orange accent circle */}
      <circle cx="58" cy="28" r="21" fill="#f96332" opacity="0.92" />
      {/* Mini rising chart inside circle */}
      <rect x="47" y="32" width="5" height="10" rx="1.5" fill="#fff" opacity="0.75" />
      <rect x="55" y="26" width="5" height="16" rx="1.5" fill="#fff" opacity="0.88" />
      <rect x="63" y="19" width="5" height="23" rx="1.5" fill="#fff" />
      {/* Coin / lightbulb */}
      <circle cx="17" cy="20" r="8" fill="#fbbf24" stroke="#334155" strokeWidth="1.6" />
      <text x="17" y="24" textAnchor="middle" fontSize="10" fontWeight="800" fill="#334155">₫</text>
      {/* Minimal desk & person */}
      <circle cx="33" cy="36" r="6" fill="#fff" stroke="#334155" strokeWidth="1.8" />
      <path d="M22 60c0-8 5-13 11-13s11 5 11 13" fill="#cbd5e1" stroke="#334155" strokeWidth="1.8" />
      <line x1="8" y1="60" x2="78" y2="60" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <rect x="52" y="54" width="18" height="6" rx="1.5" fill="#94a3b8" stroke="#334155" strokeWidth="1.4" />
    </svg>
  );
}

function StatusPanel({
  title,
  unitLabel,
  panelData,
  dateInfo,
  divisor,
  decimals,
  kind = 'meal',
}) {
  const { summary, totalRow, groupRows, blockRows, industryRows } = panelData;

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
    <div className="bg-[#eef5e9] border border-[#d6e5cc] rounded-2xl shadow-sm p-4 flex flex-col gap-3">
      {/* Editorial Infographic Header (matches Image 2 + Vietnamese) */}
      <div className="w-full max-w-[600px] mx-auto flex items-center gap-3 pt-0.5">
        {kind === 'meal' ? <MealHeaderIllustration /> : <RevenueHeaderIllustration />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="inline-block text-2xl leading-none font-black text-[#f96332] select-none">
              &ldquo;
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {kind === 'meal' ? 'Báo cáo suất ăn hàng ngày' : 'Báo cáo doanh thu hàng ngày'}
            </span>
          </div>
          <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 uppercase leading-snug">
            {title}
          </h2>
        </div>
      </div>

      {/* Compact Executive Hero Summary Banner (never stretched wide) */}
      <div className="w-full max-w-[600px] mx-auto grid grid-cols-1 sm:grid-cols-[1.02fr_1.18fr] gap-3 items-stretch">
        {/* Left Orange Pill — Today Actual + Day vs Plan badge */}
        <div className="bg-gradient-to-br from-[#fcb94d] to-[#f4a530] rounded-[24px] px-5 py-3.5 flex flex-col items-center justify-center gap-1.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
            Thực tế ngày {dateInfo.dNum}/{dateInfo.mNum}
          </span>
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-4xl sm:text-[46px] leading-none font-black text-white tracking-tight tabular-nums drop-shadow-xs">
              {fmtHeroNumber(summary.dayActual, divisor)}
            </span>
            <span className="text-base sm:text-lg font-extrabold text-white/95 whitespace-nowrap">
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

        {/* Right Purple-Bordered Box — Compact 2-column alignment + Mini Progress */}
        <div className="bg-white/80 border-[2.5px] border-[#b197fc] rounded-[24px] px-5 py-3 flex flex-col justify-center gap-2">
          {/* Row 1: Lũy kế */}
          <div className="grid grid-cols-[130px_1fr] items-baseline gap-2">
            <span className="text-xs sm:text-[13px] font-bold text-slate-700">Lũy kế tháng</span>
            <div className="text-right tabular-nums whitespace-nowrap">
              <span className="text-base sm:text-lg font-black text-slate-900">
                {fmtHeroNumber(summary.mtdActual, divisor)}
              </span>{' '}
              <span className="text-xs font-bold text-slate-600">{unitLabel}</span>
            </div>
          </div>

          {/* Row 2: Tỉ lệ hoàn thành + Mini progress bar */}
          <div className="space-y-1">
            <div className="grid grid-cols-[130px_1fr] items-baseline gap-2">
              <span className="text-xs sm:text-[13px] font-bold text-slate-700">Tỉ lệ hoàn thành</span>
              <span
                className={`text-right text-base sm:text-lg font-black tabular-nums ${
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

          {/* Row 3: So với năm ngoái */}
          <div className="grid grid-cols-[130px_1fr] items-center gap-2">
            <span className="text-xs sm:text-[13px] font-bold text-slate-700">So với năm ngoái</span>
            <div className="text-right">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs sm:text-sm font-black tabular-nums ${
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

      {/* Unit right label */}
      <div className="text-right text-[11px] font-semibold text-slate-600 -mb-2 pr-1">
        ({unitLabel})
      </div>

      {/* 3 Stacked Tables: Nhóm A/B, Điều hành, Ngành nghề */}
      <div className="space-y-3">
        <SectionTable
          sectionTitle="Nhóm A/B"
          totalRow={totalRow}
          rows={groupRows}
          dateInfo={dateInfo}
          divisor={divisor}
          decimals={decimals}
        />

        <SectionTable
          sectionTitle="Điều hành"
          totalRow={totalRow}
          rows={blockRows}
          dateInfo={dateInfo}
          divisor={divisor}
          decimals={decimals}
        />

        <SectionTable
          sectionTitle="Ngành nghề"
          totalRow={totalRow}
          rows={industryRows}
          dateInfo={dateInfo}
          divisor={divisor}
          decimals={decimals}
          alignLeftRows
        />
      </div>

      <div className="text-[11px] text-slate-500 pt-1">
        ※ Chi tiết từng địa điểm xem tại mục Báo cáo Excel &amp; Email hoặc Thực tế D-1.
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [date, setDate] = useState('');
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

  const activeDate = data?.date || date;
  const dateInfo = (() => {
    if (!activeDate) return { dNum: 1, mNum: 1, year: 2026, dowLabel: '' };
    const [y, m, d] = activeDate.split('-').map(Number);
    const dt = new Date(`${activeDate}T00:00:00`);
    return {
      dNum: d,
      mNum: m,
      year: y,
      dowLabel: DOW_EN_VN[dt.getDay()] || '',
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
            Báo cáo tổng hợp theo Nhóm A/B, Khối điều hành (FS1–FS5, HCM) và Ngành nghề
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
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 items-start">
          <StatusPanel
            title={mealTitle}
            unitLabel="Nghìn suất"
            panelData={data.meals}
            dateInfo={dateInfo}
            divisor={1000}
            decimals={1}
            kind="meal"
          />

          <StatusPanel
            title={revTitle}
            unitLabel="Triệu đồng"
            panelData={data.revenue}
            dateInfo={dateInfo}
            divisor={1e6}
            decimals={0}
            kind="revenue"
          />
        </div>
      )}
    </div>
  );
}
