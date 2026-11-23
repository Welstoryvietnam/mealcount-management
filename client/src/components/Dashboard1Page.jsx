import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
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

function StatusBadge({ v, thr }) {
  if (v <= -10) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
        Nghiêm trọng
      </span>
    );
  }
  if (v <= -thr) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        Cảnh báo
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      Ổn định
    </span>
  );
}

function TrendLineSVG({ series }) {
  if (!series || series.length === 0) {
    return <div className="text-xs text-slate-400 py-8 text-center">Chưa có dữ liệu xu hướng</div>;
  }
  const W = 720;
  const H = 230;
  const pl = 56;
  const pr = 16;
  const pt = 12;
  const pb = 28;

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
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Xu hướng suất ăn">
      {[0, 1, 2, 3, 4].map((g) => {
        const v = mn + ((mx - mn) * g) / 4;
        const y = Y(v);
        return (
          <g key={g}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke="#e3e8ee" />
            <text x={pl - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#6b7785">
              {nf(v)}
            </text>
          </g>
        );
      })}
      {series.map((b, i) =>
        series.length < 10 || i % 2 === series.length % 2 ? (
          <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b7785">
            {b.label}
          </text>
        ) : null
      )}
      <polyline
        points={pts(plans)}
        fill="none"
        stroke="#9aa6b5"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      <polyline points={pts(actuals)} fill="none" stroke="#2563eb" strokeWidth="2.5" />
      {actuals.map((v, i) => (
        <circle key={i} cx={X(i)} cy={Y(v)} r="3.2" fill="#2563eb">
          <title>{`${series[i].label}: ${nf(v)} / KH ${nf(plans[i])}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function MultiLineSVG({ buckets, rows }) {
  if (!buckets || buckets.length === 0 || !rows || rows.length === 0) {
    return <div className="text-xs text-slate-400 py-8 text-center">Chưa có dữ liệu ngành nghề</div>;
  }
  const W = 720;
  const H = 230;
  const pl = 56;
  const pr = 16;
  const pt = 12;
  const pb = 28;

  const allVals = rows.flatMap((r) => r.series);
  const mx = Math.max(...allVals, 1) * 1.08;

  const X = (i) =>
    buckets.length === 1 ? (W + pl - pr) / 2 : pl + (i * (W - pl - pr)) / (buckets.length - 1);
  const Y = (v) => pt + (H - pt - pb) * (1 - v / mx);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Xu hướng theo ngành nghề">
      {[0, 1, 2, 3, 4].map((g) => {
        const v = (mx * g) / 4;
        const y = Y(v);
        return (
          <g key={g}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke="#e3e8ee" />
            <text x={pl - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#6b7785">
              {nf(v)}
            </text>
          </g>
        );
      })}
      {buckets.map((label, i) =>
        buckets.length < 10 || i % 2 === buckets.length % 2 ? (
          <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b7785">
            {label}
          </text>
        ) : null
      )}
      {rows.map((r) => (
        <g key={r.industry}>
          <polyline
            fill="none"
            stroke={r.color}
            strokeWidth="2.1"
            points={r.series.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}
          />
          {r.series.map((v, i) => (
            <circle key={i} cx={X(i)} cy={Y(v)} r="2.5" fill={r.color}>
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
  const w = 90;
  const h = 24;
  const denom = mx - mn || 1;
  const points = series
    .map((v, i) => `${(i * (w - 2)) / (series.length - 1) + 1},${h - 2 - ((h - 4) * (v - mn)) / denom}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block align-middle">
      <polyline fill="none" stroke="#2563eb" strokeWidth="1.8" points={points} />
    </svg>
  );
}

function formatBlockShort(block) {
  if (block === 'Chi nhánh HCM') return 'HCM';
  if (/^FS(\d+)$/i.test(block)) return block.replace(/^FS(\d+)$/i, 'ĐH $1');
  return block;
}

export default function Dashboard1Page() {
  const [mode, setMode] = useState('d');
  const [sel, setSel] = useState(0);
  const [scope, setScope] = useState('all');
  const [thr, setThr] = useState(3);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div className="space-y-3 text-[#1d2733]">
      {/* Header */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-[#1d2733] m-0">Dashboard cảnh báo suất ăn</h1>
          <div className="text-xs text-[#6b7785] mt-0.5">
            {data
              ? `Số liệu đến ${fmtDateVN(data.asOfDate)} · đang xem: ${currentPeriodLabel} · kỳ so sánh: ${pv}`
              : 'Đang tải dữ liệu đồng bộ từ Google Sheet...'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6b7785]">
            Dữ liệu thực tế đồng bộ từ Google Sheet (Năm nay / Kế hoạch / Năm ngoái)
          </span>
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#e3e8ee] bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Mode segmented */}
        <div className="flex bg-white border border-[#e3e8ee] rounded-lg overflow-hidden">
          {MODES.map(([mKey, mLabel]) => (
            <button
              key={mKey}
              onClick={() => handleModeChange(mKey)}
              className={`px-3 py-1.5 text-sm cursor-pointer transition ${
                mode === mKey
                  ? 'bg-[#2563eb] text-white font-medium'
                  : 'bg-white text-[#1d2733] hover:bg-slate-50'
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
          className="text-sm px-2.5 py-1.5 border border-[#e3e8ee] rounded-lg bg-white text-[#1d2733]"
        >
          {(data?.periodOptions || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Scope chips */}
        <div className="flex flex-wrap gap-1.5">
          {(data?.scopes || []).map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`px-3 py-1 rounded-full text-[13px] border cursor-pointer transition ${
                scope === s.key
                  ? 'bg-[#2563eb] text-white border-[#2563eb] font-medium'
                  : 'bg-white text-[#1d2733] border-[#e3e8ee] hover:bg-slate-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Threshold input */}
        <label className="text-xs text-[#6b7785] flex items-center gap-1.5 ml-auto">
          Ngưỡng giảm ≥
          <input
            type="number"
            min={1}
            max={50}
            value={thr}
            onChange={(e) => setThr(Math.max(1, Math.min(50, Number(e.target.value) || 3)))}
            className="w-14 px-2 py-1 text-sm border border-[#e3e8ee] rounded-md bg-white text-[#1d2733] text-center"
          />
          %
        </label>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {data && mk && rk && (
        <>
          {/* KPI Row 1: Suất ăn */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">Thực tế ({lab} đang xem)</div>
              <div className="text-2xl font-bold my-0.5">{nf(mk.actual)}</div>
              <div className={`text-xs font-medium ${mk.deltaPrevPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {pc(mk.deltaPrevPct)} so với {pv}
              </div>
            </div>

            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">Kế hoạch</div>
              <div className="text-2xl font-bold my-0.5">{nf(mk.plan)}</div>
              <div className="text-xs text-[#6b7785]">Chênh lệch {nf(mk.diff)}</div>
            </div>

            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">% đạt kế hoạch</div>
              <div className="text-2xl font-bold my-0.5">{fmtPct(mk.attPct)}</div>
              <div
                className={`text-xs font-medium ${
                  mk.attPct >= 100 ? 'text-[#16a34a]' : mk.attPct >= 97 ? 'text-[#6b7785]' : 'text-[#dc2626]'
                }`}
              >
                {mk.attPct >= 100 ? 'Đạt' : 'Chưa đạt'}
              </div>
            </div>

            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">Địa điểm cảnh báo</div>
              <div className="text-2xl font-bold my-0.5">
                {mk.alertCount} / {data.openCount}
              </div>
              <div className="text-xs text-[#6b7785]">giảm ≥ {thr}% (không tính bếp đóng)</div>
            </div>

            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">So cùng kỳ năm trước (YoY)</div>
              <div
                className={`text-2xl font-bold my-0.5 ${
                  mk.yoyPct === null ? 'text-slate-400' : mk.yoyPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                }`}
              >
                {pc(mk.yoyPct)}
              </div>
              <div className="text-xs text-[#6b7785]">Năm trước: {nf(mk.lyActual)}</div>
            </div>
          </div>

          {/* KPI Row 2: Doanh thu */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">Doanh thu thực tế (triệu đồng)</div>
              <div className="text-2xl font-bold my-0.5">{nf(rk.actual)}</div>
              <div className={`text-xs font-medium ${rk.deltaPrevPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {pc(rk.deltaPrevPct)} so với {pv}
              </div>
            </div>

            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">Doanh thu kế hoạch</div>
              <div className="text-2xl font-bold my-0.5">{nf(rk.plan)}</div>
              <div className="text-xs text-[#6b7785]">Chênh lệch {nf(rk.diff)}</div>
            </div>

            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">% đạt KH doanh thu</div>
              <div className="text-2xl font-bold my-0.5">{fmtPct(rk.attPct)}</div>
              <div
                className={`text-xs font-medium ${
                  rk.attPct >= 100 ? 'text-[#16a34a]' : rk.attPct >= 97 ? 'text-[#6b7785]' : 'text-[#dc2626]'
                }`}
              >
                {rk.attPct >= 100 ? 'Đạt' : 'Chưa đạt'}
              </div>
            </div>

            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">Địa điểm cảnh báo (doanh thu)</div>
              <div className="text-2xl font-bold my-0.5">
                {rk.alertCount} / {data.openCount}
              </div>
              <div className="text-xs text-[#6b7785]">giảm ≥ {thr}% (không tính bếp đóng)</div>
            </div>

            <div className="bg-white border border-[#e3e8ee] rounded-xl p-3.5">
              <div className="text-xs text-[#6b7785]">So cùng kỳ năm trước (YoY)</div>
              <div
                className={`text-2xl font-bold my-0.5 ${
                  rk.yoyPct === null ? 'text-slate-400' : rk.yoyPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                }`}
              >
                {pc(rk.yoyPct)}
              </div>
              <div className="text-xs text-[#6b7785]">Năm trước: {nf(rk.lyActual)}</div>
            </div>
          </div>

          {/* Chart 1: Xu hướng suất ăn vs kế hoạch */}
          <div className="bg-white border border-[#e3e8ee] rounded-xl p-4">
            <h2 className="text-sm font-bold mb-2">
              Xu hướng suất ăn vs kế hoạch · {currentScopeLabel} · theo {lab}
            </h2>
            <div className="flex gap-4 text-xs text-[#6b7785] mb-1">
              <span className="flex items-center gap-1.5">
                <i className="inline-block w-3.5 h-[3px] bg-[#2563eb]" />
                Thực tế
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block w-3.5 h-[3px] bg-[#9aa6b5]" />
                Kế hoạch
              </span>
            </div>
            <TrendLineSVG series={data.trendSeries} />
          </div>

          {/* Section 2: Xu hướng theo nhóm ngành nghề */}
          <div className="bg-white border border-[#e3e8ee] rounded-xl p-4">
            <h2 className="text-sm font-bold mb-2">
              Xu hướng theo nhóm ngành nghề · {currentScopeLabel} · theo {lab}
            </h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b7785] mb-2">
              {(data.industryRows || []).map((r) => (
                <span key={r.industry} className="flex items-center gap-1.5">
                  <i className="inline-block w-3.5 h-[3px]" style={{ background: r.color }} />
                  {r.industry}
                </span>
              ))}
            </div>
            <MultiLineSVG buckets={data.buckets} rows={data.industryRows} />
            <div className="overflow-x-auto mt-3">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#e3e8ee] text-xs text-[#6b7785]">
                    <th className="py-2 px-2 text-left font-semibold">Ngành nghề</th>
                    <th className="py-2 px-2 text-right font-semibold">Xu hướng</th>
                    <th className="py-2 px-2 text-right font-semibold">Thực tế</th>
                    <th className="py-2 px-2 text-right font-semibold">Kế hoạch</th>
                    <th className="py-2 px-2 text-right font-semibold">% đạt KH</th>
                    <th className="py-2 px-2 text-right font-semibold">Δ vs kỳ trước</th>
                    <th className="py-2 px-2 text-right font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.industryRows || []).map((r) => (
                    <tr key={r.industry} className="border-b border-[#e3e8ee] hover:bg-slate-50/70">
                      <td className="py-2 px-2 text-left font-medium">{r.industry}</td>
                      <td className="py-2 px-2 text-right">
                        <Sparkline series={r.series} />
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{nf(r.actual)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{nf(r.plan)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.attPct)}</td>
                      <td
                        className={`py-2 px-2 text-right tabular-nums font-medium ${
                          r.deltaPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                        }`}
                      >
                        {pc(r.deltaPct)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <StatusBadge v={r.deltaPct} thr={thr} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: So sánh theo nhóm / điều hành */}
          <div className="bg-white border border-[#e3e8ee] rounded-xl p-4">
            <h2 className="text-sm font-bold mb-2">So sánh theo nhóm / điều hành (kỳ gần nhất)</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#e3e8ee] text-xs text-[#6b7785]">
                    <th className="py-2 px-2 text-left font-semibold">Nhóm / điều hành</th>
                    <th className="py-2 px-2 text-right font-semibold">Xu hướng</th>
                    <th className="py-2 px-2 text-right font-semibold">Thực tế</th>
                    <th className="py-2 px-2 text-right font-semibold">Kế hoạch</th>
                    <th className="py-2 px-2 text-right font-semibold">% đạt KH</th>
                    <th className="py-2 px-2 text-right font-semibold">Δ vs kỳ trước</th>
                    <th className="py-2 px-2 text-right font-semibold">Trạng thái</th>
                    <th className="py-2 px-2 text-right font-semibold">YoY</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.segmentRows || []).map((r) => (
                    <tr
                      key={r.key}
                      onClick={() => setScope(r.key)}
                      className={`border-b border-[#e3e8ee] cursor-pointer transition ${
                        scope === r.key ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-2 px-2 text-left font-medium">{r.label}</td>
                      <td className="py-2 px-2 text-right">
                        <Sparkline series={r.series} />
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{nf(r.actual)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{nf(r.plan)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.attPct)}</td>
                      <td
                        className={`py-2 px-2 text-right tabular-nums font-medium ${
                          r.deltaPct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                        }`}
                      >
                        {pc(r.deltaPct)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <StatusBadge v={r.deltaPct} thr={thr} />
                      </td>
                      <td
                        className={`py-2 px-2 text-right tabular-nums font-medium ${
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Cảnh báo địa điểm giảm */}
          <div className="bg-white border border-[#e3e8ee] rounded-xl p-4">
            <h2 className="text-sm font-bold mb-1">
              Cảnh báo địa điểm giảm ≥ {thr}% so với {pv}
            </h2>
            <div className="text-xs text-[#6b7785] mb-2">
              {data.closedLocations && data.closedLocations.length > 0
                ? `Đã loại trừ ${data.closedLocations.length} địa điểm đóng bếp: ${data.closedLocations
                    .map((l) => l.location_name)
                    .join(', ')}`
                : 'Không có địa điểm đóng bếp trong phạm vi này'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#e3e8ee] text-xs text-[#6b7785]">
                    <th className="py-2 px-2 text-left font-semibold">Địa điểm</th>
                    <th className="py-2 px-2 text-right font-semibold">Nhóm / ĐH</th>
                    <th className="py-2 px-2 text-right font-semibold">Kỳ này</th>
                    <th className="py-2 px-2 text-right font-semibold">Kỳ trước</th>
                    <th className="py-2 px-2 text-right font-semibold">Δ%</th>
                    <th className="py-2 px-2 text-right font-semibold">% đạt KH</th>
                    <th className="py-2 px-2 text-right font-semibold">Mức độ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.alertRows && data.alertRows.length > 0 ? (
                    data.alertRows.map((x) => (
                      <tr key={x.code_number} className="border-b border-[#e3e8ee] hover:bg-red-50/30">
                        <td className="py-2 px-2 text-left font-medium">
                          <span>{x.location_name}</span>
                          <span className="ml-1.5 text-[11px] text-slate-400 font-normal">
                            ({x.code_number})
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-600">
                          {x.group_ab ? `${x.group_ab} · ` : ''}
                          {formatBlockShort(x.operating_block)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">{nf(x.curActual)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{nf(x.prevActual)}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold text-[#dc2626]">
                          {pc(x.deltaPct)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtPct(x.attPct)}</td>
                        <td className="py-2 px-2 text-right">
                          <StatusBadge v={x.deltaPct} thr={thr} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-4 px-2 text-left text-slate-500">
                        Không có địa điểm nào giảm vượt ngưỡng.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
