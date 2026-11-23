import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, RefreshCw, Utensils, DollarSign } from 'lucide-react';
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

function StatusPanel({
  title,
  unitLabel,
  panelData,
  dateInfo,
  divisor,
  decimals,
  icon: Icon,
}) {
  const { summary, totalRow, groupRows, blockRows, industryRows } = panelData;

  return (
    <div className="bg-[#f8faf7] border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col gap-3">
      {/* Panel Title */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <div className="p-1.5 rounded-full bg-orange-100 text-orange-600">
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 uppercase text-center">
          {title}
        </h2>
      </div>

      {/* Hero Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch px-1">
        {/* Big Orange Pill */}
        <div className="bg-[#f6b850] rounded-2xl px-4 py-3 flex items-baseline justify-center gap-2 shadow-inner">
          <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight tabular-nums drop-shadow-sm">
            {fmtHeroNumber(summary.dayActual, divisor)}
          </span>
          <span className="text-sm sm:text-base font-bold text-white/95">{unitLabel}</span>
        </div>

        {/* Purple-Bordered Summary Box */}
        <div className="bg-white border-2 border-[#a78bfa] rounded-2xl px-4 py-2.5 flex flex-col justify-center gap-1 text-xs sm:text-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700">Lũy kế</span>
            <span className="font-extrabold text-slate-900 tabular-nums">
              {fmtHeroNumber(summary.mtdActual, divisor)}{' '}
              <span className="text-xs font-semibold text-slate-600">{unitLabel}</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700">Tỉ lệ hoàn thành</span>
            <span
              className={`font-extrabold tabular-nums ${
                summary.completionPct >= 100 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {summary.completionPct.toFixed(1)} %
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700">So với năm ngoái</span>
            <span
              className={`font-extrabold tabular-nums ${
                summary.yoyPct >= 100 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {summary.yoyPct.toFixed(1)} %
            </span>
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
            icon={Utensils}
          />

          <StatusPanel
            title={revTitle}
            unitLabel="Triệu đồng"
            panelData={data.revenue}
            dateInfo={dateInfo}
            divisor={1e6}
            decimals={0}
            icon={DollarSign}
          />
        </div>
      )}
    </div>
  );
}
