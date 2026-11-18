import React, { useState, useEffect, useCallback } from 'react';
import { FileSpreadsheet, Download, Mail, Copy, Check, Filter } from 'lucide-react';
import { apiFetch, downloadFile, getYesterdayISO } from '../api';

export default function ReportsPage() {
  const [date, setDate] = useState(getYesterdayISO());
  const [block, setBlock] = useState('ALL');
  const [blocks, setBlocks] = useState([]);
  const [emailPreview, setEmailPreview] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const loadPreview = useCallback(async () => {
    setError('');
    try {
      const [stdRes, emailRes] = await Promise.all([
        apiFetch('/api/standards'),
        apiFetch(`/api/reports/email-preview?date=${encodeURIComponent(date)}&block=${encodeURIComponent(block)}`),
      ]);
      setBlocks(stdRes.blocks || []);
      setEmailPreview(emailRes);
    } catch (err) {
      setError(err.message);
    }
  }, [date, block]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleDownloadExcel = async () => {
    try {
      await downloadFile(
        `/api/reports/excel?date=${encodeURIComponent(date)}&block=${encodeURIComponent(block)}`,
        `BaoCao_SuatAn_${date}.xlsx`
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyBody = () => {
    if (!emailPreview) return;
    navigator.clipboard.writeText(`${emailPreview.subject}\n\n${emailPreview.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Báo cáo Excel Theo Mẫu & Email</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Xuất file Excel báo cáo suất ăn hàng ngày (kèm sheet xu hướng 7 ngày) và xem trước nội dung Email gửi Ban Điều Hành
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

          <button
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Báo cáo Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Excel structure info */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 text-emerald-700">
            <FileSpreadsheet className="w-6 h-6" />
            <h2 className="text-base font-bold text-slate-900">Cấu trúc File Excel Xuất ra</h2>
          </div>
          <div className="text-sm text-slate-600 space-y-2.5">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-800">Sheet 1: BaoCao_SuatAn_Ngay</div>
              <p className="text-xs mt-1 text-slate-500">
                Tổng hợp theo từng địa điểm: Code Number, Tên địa điểm, Khối điều hành, KH ngày, Thực tế ngày, % Biến động, Cảnh báo giảm &ge;3% (tô đỏ), Ảnh hưởng Doanh thu &amp; Lợi nhuận KH, Lũy kế tháng.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-800">Sheet 2: XuHuong_7Ngay</div>
              <p className="text-xs mt-1 text-slate-500">
                Bảng đối chiếu số suất ăn thực tế 7 ngày gần nhất so với kế hoạch ngày của từng địa điểm.
              </p>
            </div>
          </div>
        </div>

        {/* Email Preview */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">Xem trước Email Báo cáo Hàng ngày</h2>
            </div>
            <button
              onClick={handleCopyBody}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Đã copy' : 'Copy nội dung'}</span>
            </button>
          </div>

          {emailPreview && (
            <div className="p-5 space-y-3 text-sm">
              <div className="grid grid-cols-[90px_1fr] gap-2 text-xs">
                <span className="font-semibold text-slate-500">Người nhận:</span>
                <span className="text-slate-800 font-medium">{emailPreview.recipients}</span>
                <span className="font-semibold text-slate-500">Tiêu đề:</span>
                <span className="text-slate-900 font-bold">{emailPreview.subject}</span>
                <span className="font-semibold text-slate-500">Đính kèm:</span>
                <span className="text-emerald-700 font-medium">{emailPreview.attachmentName}</span>
              </div>
              <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto">
                {emailPreview.body}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
