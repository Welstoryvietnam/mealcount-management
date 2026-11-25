import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, X, AlertTriangle, ChevronRight, Filter, Search } from 'lucide-react';
import { apiFetch } from '../api';

const MODES = [
  ['d', 'Ngày'],
  ['w', 'Tuần'],
  ['m', 'Tháng'],
];

const nf = (v) => Math.round(Number(v) || 0).toLocaleString('vi-VN');
const pc = (v) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return (n > 0 ? '+' : '') + n.toFixed(1).replace('.', ',') + '%';
};
const fmtPct = (v) => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;

function fmtDateVN(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
}

function matchScopeClient(loc, scopeKey) {
  if (!scopeKey || scopeKey === 'all') return true;
  if (scopeKey === 'A' || scopeKey === 'B') return (loc.group_ab || '').toUpperCase() === scopeKey;
  return loc.operating_block === scopeKey;
}

function StatusBadge({ v, thr, count, onClick, compact = false }) {
  const isSevere = v <= -10;
  const isWarn = !isSevere && v <= -thr;
  const label = isSevere ? 'Nghiêm trọng' : isWarn ? 'Cảnh báo' : 'Ổn định';
  const colorClass = isSevere
    ? 'bg-red-100 text-red-700 border-red-200'
    : isWarn
    ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-green-100 text-green-700 border-green-200';
  const sizeClass = compact ? 'px-1.5 py-0.5 text-[10.5px]' : 'px-2 py-0.5 text-xs';

  if (onClick && (isSevere || isWarn || count > 0)) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        title="Bấm để xem danh sách bếp trực thuộc đang giảm suất"
        className={`inline-flex items-center gap-0.5 rounded-full font-semibold border cursor-pointer transition hover:brightness-95 whitespace-nowrap ${sizeClass} ${colorClass}`}
      >
        <span>{label}</span>
        {typeof count === 'number' && count > 0 && <span className="font-bold">· {count}</span>}
        <ChevronRight className="w-3 h-3 opacity-75 shrink-0" />
      </button>
    );
  }

  return (
    <span className={`inline-block rounded-full font-semibold whitespace-nowrap ${sizeClass} ${colorClass}`}>
      {label}
    </span>
  );
}

function TrendLineSVG({ series }) {
  if (!series || series.length === 0) {
    return <div className="text-xs text-slate-400 py-6 text-center">Chưa có dữ liệu xu hướng</div>;
  }
  const W = 620;
  const H = 160;
  const pl = 48;
  const pr = 12;
  const pt = 10;
  const pb = 22;

  const actuals = series.map((s) => s.actual);
  const plans = series.map((s) => s.plan);
  const all = actuals.concat(plans);
  const rawMax = Math.max(...all, 1);
  const rawMin = Math.min(...all, 0);
  const mx = rawMax * 1.08;
  const mn = rawMin > 0 ? rawMin * 0.85 : 0;
  const denom = mx - mn || 1;

  const X = (i) =>
    series.length === 1 ? (W + pl - pr) / 2 : pl + (i * (W - pl - pr)) / (series.length - 1);
  const Y = (v) => pt + (H - pt - pb) * (1 - (v - mn) / denom);

  const pts = (arr) => arr.map((v, i) => `${X(i)},${Y(v)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full max-h-[175px]"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Xu hướng suất ăn"
    >
      {[0, 1, 2, 3].map((g) => {
        const v = mn + ((mx - mn) * g) / 3;
        const y = Y(v);
        return (
          <g key={g}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke="#e3e8ee" />
            <text x={pl - 5} y={y + 3.5} textAnchor="end" fontSize="10" fill="#6b7785">
              {nf(v)}
            </text>
          </g>
        );
      })}
      {series.map((b, i) =>
        series.length < 10 || i % 2 === series.length % 2 ? (
          <text key={i} x={X(i)} y={H - 5} textAnchor="middle" fontSize="10" fill="#6b7785">
            {b.label}
          </text>
        ) : null
      )}
      <polyline points={pts(plans)} fill="none" stroke="#9aa6b5" strokeWidth="1.8" strokeDasharray="5 4" />
      <polyline points={pts(actuals)} fill="none" stroke="#2563eb" strokeWidth="2.3" />
      {actuals.map((v, i) => (
        <circle key={i} cx={X(i)} cy={Y(v)} r="2.8" fill="#2563eb">
          <title>{`${series[i].label}: ${nf(v)} / KH ${nf(plans[i])}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function MultiLineSVG({ buckets, rows }) {
  if (!buckets || buckets.length === 0 || !rows || rows.length === 0) {
    return <div className="text-xs text-slate-400 py-6 text-center">Chưa có dữ liệu ngành nghề</div>;
  }
  const W = 620;
  const H = 160;
  const pl = 48;
  const pr = 12;
  const pt = 10;
  const pb = 22;

  const allVals = rows.flatMap((r) => r.series);
  const mx = Math.max(...allVals, 1) * 1.08;

  const X = (i) =>
    buckets.length === 1 ? (W + pl - pr) / 2 : pl + (i * (W - pl - pr)) / (buckets.length - 1);
  const Y = (v) => pt + (H - pt - pb) * (1 - v / mx);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full max-h-[175px]"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Xu hướng theo ngành nghề"
    >
      {[0, 1, 2, 3].map((g) => {
        const v = (mx * g) / 3;
        const y = Y(v);
        return (
          <g key={g}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke="#e3e8ee" />
            <text x={pl - 5} y={y + 3.5} textAnchor="end" fontSize="10" fill="#6b7785">
              {nf(v)}
            </text>
          </g>
        );
      })}
      {buckets.map((label, i) =>
        buckets.length < 10 || i % 2 === buckets.length % 2 ? (
          <text key={i} x={X(i)} y={H - 5} textAnchor="middle" fontSize="10" fill="#6b7785">
            {label}
          </text>
        ) : null
      )}
      {rows.map((r) => (
        <g key={r.industry}>
          <polyline
            fill="none"
            stroke={r.color}
            strokeWidth="1.9"
            points={r.series.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}
          />
          {r.series.map((v, i) => (
            <circle key={i} cx={X(i)} cy={Y(v)} r="2.2" fill={r.color}>
              <title>{`${r.industry} ${buckets[i]}: ${nf(v)}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

function Sparkline({ series }) {
  if (!series || series.length < 2) return null;
  const mx = Math.max(...series);
  const mn = Math.min(...series);
  const w = 64;
  const h = 18;
  const denom = mx - mn || 1;
  const points = series
    .map((v, i) => `${(i * (w - 2)) / (series.length - 1) + 1},${h - 2 - ((h - 4) * (v - mn)) / denom}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block align-middle">
      <polyline fill="none" stroke="#2563eb" strokeWidth="1.6" points={points} />
    </svg>
  );
}

function formatBlockShort(block) {
  if (block === 'Chi nhánh HCM') return 'HCM';
  if (/^FS(\d+)$/i.test(block)) return block.replace(/^FS(\d+)$/i, 'FS $1');
  return block;
}

export default function Dashboard1Page() {
  const [mode, setMode] = useState('d');
  const [sel, setSel] = useState(0);
  const [scope, setScope] = useState('all');
  const [thr, setThr] = useState(3);
  const [chartTab, setChartTab] = useState('plan'); // 'plan' | 'industry'
  const [alertSearch, setAlertSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drilldown, setDrilldown] = useState(null);
  const [drillOnlyThr, setDrillOnlyThr] = useState(true);

  useEffect(() => {
    if (!drilldown) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDrilldown(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drilldown]);

  const openDrilldown = (info) => {
    setDrillOnlyThr(true);
    setDrilldown(info);
  };

  const drilldownItems = useMemo(() => {
    if (!drilldown || !data?.allDroppingLocations) return { all: [], alerts: [] };
    const base = data.allDroppingLocations.filter((loc) => {
      if (drilldown.type === 'industry') {
        return loc.industry === drilldown.key && matchScopeClient(loc, scope);
      }
      return matchScopeClient(loc, drilldown.key);
    });
    return {
      all: base,
      alerts: base.filter((loc) => loc.isAlert),
    };
  }, [drilldown, data, scope]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        mode,
        sel: String(sel),
        scope,
        thr: String(thr),
      });
      const res = await apiFetch(`/api/dashboard/alert-overview?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, sel, scope, thr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setSel(0);
  };

  const lab = { d: 'ngày', w: 'tuần', m: 'tháng' }[mode];
  const pv = mode === 'd' ? 'cùng thứ tuần trước' : `${lab} trước`;

  const currentPeriodLabel =
    data?.periodOptions?.find((o) => o.value === data.sel)?.label || '';
  const currentScopeLabel =
    data?.scopes?.find((s) => s.key === scope)?.label || 'Cả công ty';

  const mk = data?.mealKpi;
  const rk = data?.revenueKpi;

  const filteredAlerts = useMemo(() => {
    const rows = data?.alertRows || [];
    const q = alertSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (x) =>
        (x.location_name || '').toLowerCase().includes(q) ||
        (x.code_number || '').toLowerCase().includes(q) ||
        (x.am_name || '').toLowerCase().includes(q) ||
        formatBlockShort(x.operating_block).toLowerCase().includes(q)
    );
  }, [data, alertSearch]);

  return (
    <div className="lg:h-full flex flex-col gap-2 text-[#1d2733] lg:overflow-hidden">
      {/* Tầng 1: Thanh điều khiển hợp nhất (gọn 2 dòng siêu mảnh) */}
      <div className="shrink-0 bg-white border border-[#e3e8ee] rounded-xl px-3 py-2 flex flex-col gap-1.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-[#1d2733] whitespace-nowrap">
              Dashboard 1: Cảnh báo suất ăn
            </h1>
            {data && (
              <span className="hidden xl:inline-block text-[11px] text-[#6b7785] truncate">
                · Số liệu đến <strong>{fmtDateVN(data.asOfDate)}</strong> · So với {pv}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Mode segmented */}
            <div className="flex bg-slate-100 border border-[#e3e8ee] rounded-lg overflow-hidden">
              {MODES.map(([mKey, mLabel]) => (
                <button
                  key={mKey}
                  onClick={() => handleModeChange(mKey)}
                  className={`px-2.5 py-1 text-xs cursor-pointer transition ${
                    mode === mKey
                      ? 'bg-[#2563eb] text-white font-semibold'
                      : 'text-[#1d2733] hover:bg-slate-200/70'
                  }`}
                >
                  {mLabel}
                </button>
              ))}
            </div>

            {/* Period select */}
            <select
              value={sel}
              onChange={(e) => setSel(Number(e.target.value))}
              aria-label="Chọn kỳ xem"
              className="text-xs px-2 py-1 border border-[#e3e8ee] rounded-lg bg-white text-[#1d2733] max-w-[235px]"
            >
              {(data?.periodOptions || []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Threshold */}
            <label className="text-xs text-[#6b7785] flex items-center gap-1 pl-1">
              Ngưỡng ≥
              <input
                type="number"
                min={1}
                max={50}
                value={thr}
                onChange={(e) => setThr(Math.max(1, Math.min(50, Number(e.target.value) || 3)))}
                className="w-11 px-1.5 py-0.5 text-xs font-semibold border border-[#e3e8ee] rounded-md bg-white text-[#1d2733] text-center"
              />
              %
            </label>

            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#e3e8ee] bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Scope chips */}
        <div className="flex flex-wrap items-center gap-1">
          {(data?.scopes || []).map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`px-2.5 py-0.5 rounded-full text-[11.5px] border cursor-pointer transition ${
                scope === s.key
                  ? 'bg-[#2563eb] text-white border-[#2563eb] font-semibold'
                  : 'bg-slate-50 text-[#1d2733] border-[#e3e8ee] hover:bg-slate-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="shrink-0 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
        </div>
      )}

      {data && mk && rk && (
        <>
          {/* Tầng 2: 5 Thẻ KPI hợp nhất (Suất ăn trên + Doanh thu triệu đồng dưới) */}
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {/* KPI 1: Thực tế */}
            <div className="bg-white border border-[#e3e8ee] rounded-xl px-3 py-2">
              <div className="text-[11px] text-[#6b7785] truncate">Thực tế ({lab} đang xem)</div>
              <div className="flex items-baseline justify-between gap-1 mt-0.5">
                <span className="text-lg xl:text-xl font-extrabold tabular-nums">{nf(mk.actual)}</span>
                <span
                  className={`text-[11px] font-bold tabular-nums ${
                    mk.deltaPrevPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                  }`}
                >
                  {pc(mk.deltaPrevPct)}
                </span>
              </div>
              <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  DT: <strong className="text-slate-800 tabular-nums">{nf(rk.actual)} tr</strong>
                </span>
                <span
                  className={`font-semibold tabular-nums ${
                    rk.deltaPrevPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                  }`}
                >
                  {pc(rk.deltaPrevPct)}
                </span>
              </div>
            </div>

            {/* KPI 2: Kế hoạch */}
            <div className="bg-white border border-[#e3e8ee] rounded-xl px-3 py-2">
              <div className="text-[11px] text-[#6b7785]">Kế hoạch</div>
              <div className="flex items-baseline justify-between gap-1 mt-0.5">
                <span className="text-lg xl:text-xl font-extrabold tabular-nums">{nf(mk.plan)}</span>
                <span className="text-[11px] text-slate-500 tabular-nums">{nf(mk.diff)}</span>
              </div>
              <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  DT KH: <strong className="text-slate-800 tabular-nums">{nf(rk.plan)} tr</strong>
                </span>
                <span className="text-slate-500 tabular-nums">{nf(rk.diff)} tr</span>
              </div>
            </div>

            {/* KPI 3: % đạt KH */}
            <div className="bg-white border border-[#e3e8ee] rounded-xl px-3 py-2">
              <div className="text-[11px] text-[#6b7785]">% đạt kế hoạch</div>
              <div className="flex items-baseline justify-between gap-1 mt-0.5">
                <span className="text-lg xl:text-xl font-extrabold tabular-nums">{fmtPct(mk.attPct)}</span>
                <span
                  className={`text-[11px] font-semibold ${
                    mk.attPct >= 100 ? 'text-[#16a34a]' : mk.attPct >= 97 ? 'text-amber-600' : 'text-[#dc2626]'
                  }`}
                >
                  {mk.attPct >= 100 ? 'Đạt' : 'Chưa đạt'}
                </span>
              </div>
              <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  DT đạt KH: <strong className="text-slate-800 tabular-nums">{fmtPct(rk.attPct)}</strong>
                </span>
                <span
                  className={`font-semibold ${
                    rk.attPct >= 100 ? 'text-[#16a34a]' : rk.attPct >= 97 ? 'text-amber-600' : 'text-[#dc2626]'
                  }`}
                >
                  {rk.attPct >= 100 ? 'Đạt' : 'Chưa đạt'}
                </span>
              </div>
            </div>

            {/* KPI 4: Địa điểm cảnh báo */}
            <div
              onClick={() =>
                openDrilldown({
                  type: 'segment',
                  key: scope,
                  label: currentScopeLabel,
                  deltaPct: mk.deltaPrevPct,
                })
              }
              title="Bấm để mở danh sách chi tiết các bếp giảm suất"
              className="bg-white border border-red-200/80 hover:border-red-300 rounded-xl px-3 py-2 cursor-pointer transition"
            >
              <div className="text-[11px] text-[#6b7785]">Địa điểm cảnh báo (≥ {thr}%)</div>
              <div className="flex items-baseline justify-between gap-1 mt-0.5">
                <span className="text-lg xl:text-xl font-extrabold text-[#dc2626] tabular-nums">
                  {mk.alertCount} / {data.openCount}
                </span>
                <span className="text-[11px] font-semibold text-red-600">bếp ▸</span>
              </div>
              <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  Cảnh báo DT: <strong className="text-red-600 tabular-nums">{rk.alertCount} / {data.openCount}</strong>
                </span>
                <span className="text-slate-400">
                  {data.closedLocations?.length || 0} đóng
                </span>
              </div>
            </div>

            {/* KPI 5: YoY */}
            <div className="bg-white border border-[#e3e8ee] rounded-xl px-3 py-2">
              <div className="text-[11px] text-[#6b7785]">So cùng kỳ năm trước (YoY)</div>
              <div className="flex items-baseline justify-between gap-1 mt-0.5">
                <span
                  className={`text-lg xl:text-xl font-extrabold tabular-nums ${
                    mk.yoyPct === null ? 'text-slate-400' : mk.yoyPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                  }`}
                >
                  {pc(mk.yoyPct)}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums">NT: {nf(mk.lyActual)}</span>
              </div>
              <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  DT YoY:{' '}
                  <strong
                    className={`tabular-nums ${
                      rk.yoyPct === null ? 'text-slate-400' : rk.yoyPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                    }`}
                  >
                    {pc(rk.yoyPct)}
                  </strong>
                </span>
                <span className="text-slate-500 tabular-nums">{nf(rk.lyActual)} tr</span>
              </div>
            </div>
          </div>

          {/* Tầng 3: Lưới 4 Khối Song Song (Phương án 2 — 100% 1 Màn hình) */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
            {/* CỘT TRÁI (6 cols): Biểu đồ xu hướng + Bảng Nhóm / Điều hành */}
            <div className="lg:col-span-6 flex flex-col gap-2 min-h-0">
              {/* Khối 1: Biểu đồ xu hướng (Top-Left) */}
              <div className="bg-white border border-[#e3e8ee] rounded-xl px-3 py-2 flex flex-col min-h-[195px] lg:flex-[43] lg:min-h-0">
                <div className="shrink-0 flex flex-wrap items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-xs font-bold text-slate-900 truncate">
                      1. Xu hướng · {currentScopeLabel} · theo {lab}
                    </h2>
                    {chartTab === 'plan' && (
                      <div className="hidden sm:flex items-center gap-2.5 text-[10.5px] text-[#6b7785]">
                        <span className="flex items-center gap-1">
                          <i className="inline-block w-2.5 h-[2.5px] bg-[#2563eb]" />
                          Thực tế
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="inline-block w-2.5 h-[2.5px] bg-[#9aa6b5]" />
                          KH
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex bg-slate-100 rounded-md p-0.5 text-[10.5px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setChartTab('plan')}
                      className={`px-2 py-0.5 rounded cursor-pointer transition ${
                        chartTab === 'plan' ? 'bg-[#2563eb] text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Suất ăn vs KH
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartTab('industry')}
                      className={`px-2 py-0.5 rounded cursor-pointer transition ${
                        chartTab === 'industry' ? 'bg-[#2563eb] text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Theo Ngành nghề
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  {chartTab === 'plan' ? (
                    <TrendLineSVG series={data.trendSeries} />
                  ) : (
                    <MultiLineSVG buckets={data.buckets} rows={data.industryRows} />
                  )}
                </div>
              </div>

              {/* Khối 2: So sánh theo Nhóm / Điều hành (Bottom-Left) */}
              <div className="bg-white border border-[#e3e8ee] rounded-xl flex flex-col min-h-[240px] lg:flex-[57] lg:min-h-0 overflow-hidden">
                <div className="shrink-0 px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                  <h2 className="text-xs font-bold text-slate-900">
                    2. So sánh Nhóm / Điều hành (9 dòng)
                  </h2>
                  <span className="text-[10.5px] text-slate-500">Click nhãn cảnh báo xem bếp giảm</span>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <table className="w-full min-w-[500px] border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_#e3e8ee]">
                      <tr className="text-[10.5px] text-[#6b7785]">
                        <th className="py-1.5 px-2 text-left font-semibold">Nhóm / FS</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Xu hướng</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Thực tế</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">% KH</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Δ%</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Trạng thái</th>
                        <th className="py-1.5 px-2 text-right font-semibold">YoY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.segmentRows || []).map((r) => {
                        const isWarnOrSevere = r.deltaPct <= -thr;
                        const triggerSegment = () =>
                          openDrilldown({
                            type: 'segment',
                            key: r.key,
                            label: r.label,
                            deltaPct: r.deltaPct,
                          });
                        return (
                          <tr
                            key={r.key}
                            onClick={() => (isWarnOrSevere ? triggerSegment() : setScope(r.key))}
                            title={
                              isWarnOrSevere
                                ? 'Bấm để xem ngay danh sách bếp đang giảm suất'
                                : 'Bấm để lọc Dashboard theo nhóm/điều hành này'
                            }
                            className={`border-b border-slate-100 cursor-pointer transition ${
                              scope === r.key
                                ? 'bg-blue-50/80'
                                : r.deltaPct <= -10
                                ? 'bg-red-50/40 hover:bg-red-50/80'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-1 px-2 text-left font-semibold whitespace-nowrap">{r.label}</td>
                            <td className="py-1 px-1.5 text-right">
                              <Sparkline series={r.series} />
                            </td>
                            <td className="py-1 px-1.5 text-right tabular-nums">{nf(r.actual)}</td>
                            <td className="py-1 px-1.5 text-right tabular-nums">{fmtPct(r.attPct)}</td>
                            <td
                              className={`py-1 px-1.5 text-right tabular-nums font-semibold ${
                                r.deltaPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                              }`}
                            >
                              {pc(r.deltaPct)}
                            </td>
                            <td className="py-1 px-1.5 text-right">
                              <StatusBadge
                                v={r.deltaPct}
                                thr={thr}
                                count={r.alertCount}
                                onClick={triggerSegment}
                                compact
                              />
                            </td>
                            <td
                              className={`py-1 px-2 text-right tabular-nums font-semibold ${
                                r.yoyPct === null
                                  ? 'text-slate-400'
                                  : r.yoyPct >= 0
                                  ? 'text-[#16a34a]'
                                  : 'text-[#dc2626]'
                              }`}
                            >
                              {pc(r.yoyPct)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* CỘT PHẢI (6 cols): Chi tiết Ngành nghề (Top) + Cảnh báo bếp giảm (Bottom) */}
            <div className="lg:col-span-6 flex flex-col gap-2 min-h-0">
              {/* Khối 3: Chi tiết theo Ngành nghề (Top-Right, cuộn nội bộ) */}
              <div className="bg-white border border-[#e3e8ee] rounded-xl flex flex-col min-h-[210px] lg:flex-[48] lg:min-h-0 overflow-hidden">
                <div className="shrink-0 px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                  <h2 className="text-xs font-bold text-slate-900">
                    3. Chi tiết theo Ngành nghề ({(data.industryRows || []).length} ngành)
                  </h2>
                  <span className="text-[10.5px] text-slate-500">Click dòng xem bếp giảm</span>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <table className="w-full min-w-[480px] border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_#e3e8ee]">
                      <tr className="text-[10.5px] text-[#6b7785]">
                        <th className="py-1.5 px-2 text-left font-semibold">Ngành nghề</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Xu hướng</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Thực tế</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">% KH</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Δ%</th>
                        <th className="py-1.5 px-2 text-right font-semibold">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.industryRows || []).map((r) => {
                        const triggerIndustry = () =>
                          openDrilldown({
                            type: 'industry',
                            key: r.industry,
                            label: `Ngành ${r.industry}`,
                            deltaPct: r.deltaPct,
                          });
                        return (
                          <tr
                            key={r.industry}
                            onClick={triggerIndustry}
                            title="Bấm để xem danh sách bếp giảm suất thuộc ngành này"
                            className={`border-b border-slate-100 cursor-pointer transition ${
                              r.deltaPct <= -10
                                ? 'bg-red-50/40 hover:bg-red-50/80'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-1 px-2 text-left font-medium truncate max-w-[175px]" title={r.industry}>
                              <span
                                className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                                style={{ background: r.color }}
                              />
                              {r.industry}
                            </td>
                            <td className="py-1 px-1.5 text-right">
                              <Sparkline series={r.series} />
                            </td>
                            <td className="py-1 px-1.5 text-right tabular-nums">{nf(r.actual)}</td>
                            <td className="py-1 px-1.5 text-right tabular-nums">{fmtPct(r.attPct)}</td>
                            <td
                              className={`py-1 px-1.5 text-right tabular-nums font-semibold ${
                                r.deltaPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                              }`}
                            >
                              {pc(r.deltaPct)}
                            </td>
                            <td className="py-1 px-2 text-right">
                              <StatusBadge
                                v={r.deltaPct}
                                thr={thr}
                                count={r.alertCount}
                                onClick={triggerIndustry}
                                compact
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Khối 4: Cảnh báo địa điểm giảm (Bottom-Right, cuộn nội bộ + tìm nhanh) */}
              <div className="bg-white border border-red-200/80 rounded-xl flex flex-col min-h-[220px] lg:flex-[52] lg:min-h-0 overflow-hidden">
                <div className="shrink-0 px-3 py-1.5 border-b border-red-100 flex flex-wrap items-center justify-between gap-2 bg-red-50/40">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <h2 className="text-xs font-bold text-slate-900 truncate">
                      4. Cảnh báo giảm ≥ {thr}% ({filteredAlerts.length} bếp)
                    </h2>
                  </div>
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={alertSearch}
                      onChange={(e) => setAlertSearch(e.target.value)}
                      placeholder="Tìm bếp / AM..."
                      className="pl-6 pr-2 py-0.5 text-[11px] border border-slate-200 rounded-md bg-white w-36 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <table className="w-full min-w-[500px] border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_#e3e8ee]">
                      <tr className="text-[10.5px] text-[#6b7785]">
                        <th className="py-1.5 px-2 text-left font-semibold">Địa điểm</th>
                        <th className="py-1.5 px-1.5 text-left font-semibold">FS</th>
                        <th className="py-1.5 px-1.5 text-left font-semibold">AM</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Kỳ này</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Kỳ trước</th>
                        <th className="py-1.5 px-1.5 text-right font-semibold">Δ%</th>
                        <th className="py-1.5 px-2 text-right font-semibold">Mức độ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAlerts.length > 0 ? (
                        filteredAlerts.map((x) => (
                          <tr key={x.code_number} className="border-b border-slate-100 hover:bg-red-50/40">
                            <td className="py-1 px-2 text-left font-semibold text-slate-900 truncate max-w-[140px]" title={`${x.location_name} (${x.code_number})`}>
                              {x.location_name}
                            </td>
                            <td className="py-1 px-1.5 text-left text-slate-600 whitespace-nowrap">
                              {x.group_ab ? `${x.group_ab}·` : ''}
                              {formatBlockShort(x.operating_block)}
                            </td>
                            <td className="py-1 px-1.5 text-left text-teal-800 truncate max-w-[105px]" title={x.am_name}>
                              {x.am_name || '-'}
                            </td>
                            <td className="py-1 px-1.5 text-right tabular-nums">{nf(x.curActual)}</td>
                            <td className="py-1 px-1.5 text-right tabular-nums text-slate-500">{nf(x.prevActual)}</td>
                            <td className="py-1 px-1.5 text-right tabular-nums font-bold text-[#dc2626]">
                              {pc(x.deltaPct)}
                            </td>
                            <td className="py-1 px-2 text-right">
                              <StatusBadge v={x.deltaPct} thr={thr} compact />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-6 px-3 text-center text-slate-400">
                            Không có địa điểm nào giảm vượt ngưỡng.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Drill-down Modal: Danh sách bếp trực thuộc đang giảm suất */}
      {drilldown && (() => {
        const list = drillOnlyThr ? drilldownItems.alerts || [] : drilldownItems.all || [];
        const totalDropMeals = list.reduce((s, item) => s + (item.diffMeals || 0), 0);
        return (
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
            onClick={() => setDrilldown(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-xl mt-0.5 ${
                      drilldown.deltaPct <= -10
                        ? 'bg-red-100 text-red-600'
                        : drilldown.deltaPct <= -thr
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-600'
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        Bếp giảm suất — {drilldown.label}
                      </h3>
                      <StatusBadge v={drilldown.deltaPct} thr={thr} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kỳ đang xem: <strong>{currentPeriodLabel}</strong> · So với {pv} · Tổng giảm trong danh sách:{' '}
                      <strong className="text-red-600">{nf(totalDropMeals)} suất</strong> ({list.length} bếp)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrilldown(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
                  aria-label="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDrillOnlyThr(true)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition ${
                      drillOnlyThr
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Cảnh báo giảm ≥ {thr}% ({(drilldownItems.alerts || []).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrillOnlyThr(false)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition ${
                      !drillOnlyThr
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Tất cả bếp giảm &lt; 0% ({(drilldownItems.all || []).length})
                  </button>
                </div>

                {drilldown.type === 'segment' && drilldown.key !== scope && (
                  <button
                    type="button"
                    onClick={() => {
                      setScope(drilldown.key);
                      setDrilldown(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold cursor-pointer"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    Lọc toàn bộ Dashboard theo {drilldown.label}
                  </button>
                )}
              </div>

              <div className="overflow-auto flex-1 px-5 py-3">
                {list.length > 0 ? (
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2 px-2 text-left font-semibold">Địa điểm (Mã bếp)</th>
                        <th className="py-2 px-2 text-left font-semibold">Nhóm / FS</th>
                        <th className="py-2 px-2 text-left font-semibold">Ngành nghề</th>
                        <th className="py-2 px-2 text-left font-semibold">AM phụ trách</th>
                        <th className="py-2 px-2 text-right font-semibold">Kỳ này</th>
                        <th className="py-2 px-2 text-right font-semibold">Kỳ trước</th>
                        <th className="py-2 px-2 text-right font-semibold">Chênh lệch</th>
                        <th className="py-2 px-2 text-right font-semibold">Δ%</th>
                        <th className="py-2 px-2 text-right font-semibold">% đạt KH</th>
                        <th className="py-2 px-2 text-right font-semibold">Mức độ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((x) => (
                        <tr key={x.code_number} className="border-b border-slate-100 hover:bg-red-50/40">
                          <td className="py-2 px-2 text-left font-medium text-slate-900">
                            <div>{x.location_name}</div>
                            <div className="text-[11px] font-mono text-slate-400">{x.code_number}</div>
                          </td>
                          <td className="py-2 px-2 text-left text-xs text-slate-600 whitespace-nowrap">
                            {x.group_ab ? `${x.group_ab} · ` : ''}
                            {formatBlockShort(x.operating_block)}
                          </td>
                          <td className="py-2 px-2 text-left text-xs text-slate-600">{x.industry}</td>
                          <td className="py-2 px-2 text-left text-xs font-medium text-teal-800">
                            {x.am_name || <span className="text-slate-300">-</span>}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{nf(x.curActual)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-slate-500">{nf(x.prevActual)}</td>
                          <td className="py-2 px-2 text-right tabular-nums font-semibold text-red-600">
                            {nf(x.diffMeals)}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums font-bold text-red-600">
                            {pc(x.deltaPct)}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmtPct(x.attPct)}</td>
                          <td className="py-2 px-2 text-right">
                            <StatusBadge v={x.deltaPct} thr={thr} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-10 text-center text-sm text-slate-500">
                    Không có bếp nào giảm suất theo bộ lọc hiện tại.
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDrilldown(null)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
