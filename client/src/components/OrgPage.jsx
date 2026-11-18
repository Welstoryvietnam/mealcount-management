import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  UserCheck,
  RefreshCw,
  Plus,
  Edit3,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  Sheet,
  Lock,
} from 'lucide-react';
import { apiFetch, downloadFile } from '../api';
import { useAuth } from '../context/AuthContext';

export default function OrgPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';

  const [units, setUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [syncCfg, setSyncCfg] = useState({
    sheet_url: '',
    sheet_gid: '0',
    auto_sync_enabled: false,
    sync_interval_minutes: 30,
    last_sync_at: '',
    last_sync_status: '',
    last_sync_message: '',
  });

  const [feedback, setFeedback] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Unit Modal
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [unitForm, setUnitForm] = useState({
    id: null,
    code: '',
    name: '',
    unit_type: 'Ban',
    sm_user_id: '',
    leader_name: '',
    description: '',
    sync_permission: true,
  });

  // AM Assignment Modal
  const [amModalOpen, setAmModalOpen] = useState(false);
  const [amForm, setAmForm] = useState({
    am_user_id: '',
    am_name: '',
    location_codes: [],
    sync_permission: true,
  });

  const loadOrg = useCallback(async () => {
    try {
      const res = await apiFetch('/api/org');
      setUnits(res.units || []);
      setLocations(res.locations || []);
      setUsers(res.users || []);
      if (res.syncConfig) setSyncCfg(res.syncConfig);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  }, []);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  const openCreateUnit = () => {
    setUnitForm({
      id: null,
      code: '',
      name: '',
      unit_type: 'Ban',
      sm_user_id: '',
      leader_name: '',
      description: '',
      sync_permission: true,
    });
    setUnitModalOpen(true);
  };

  const openEditUnit = (u) => {
    setUnitForm({
      id: u.id,
      code: u.code,
      name: u.name,
      unit_type: u.unit_type,
      sm_user_id: u.sm_user_id ? String(u.sm_user_id) : '',
      leader_name: u.leader_name || '',
      description: u.description || '',
      sync_permission: true,
    });
    setUnitModalOpen(true);
  };

  const handleSaveUnit = async (e) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiFetch('/api/org/units', {
        method: 'POST',
        body: JSON.stringify(unitForm),
      });
      setFeedback({ type: 'success', text: res.message });
      setUnitModalOpen(false);
      await loadOrg();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleDeleteUnit = async (u) => {
    if (!window.confirm(`Xóa đơn vị "${u.name}"?`)) return;
    try {
      const res = await apiFetch(`/api/org/units/${u.id}`, { method: 'DELETE' });
      setFeedback({ type: 'success', text: res.message });
      await loadOrg();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const openAmModal = (presetUserId = '', presetName = '') => {
    const preselected = locations
      .filter((l) => (presetUserId ? String(l.am_user_id) === String(presetUserId) : presetName && l.am_name === presetName))
      .map((l) => l.code_number);
    setAmForm({
      am_user_id: presetUserId ? String(presetUserId) : '',
      am_name: presetName,
      location_codes: preselected,
      sync_permission: true,
    });
    setAmModalOpen(true);
  };

  const toggleAmLoc = (code) => {
    setAmForm((prev) => {
      const exists = prev.location_codes.includes(code);
      return {
        ...prev,
        location_codes: exists ? prev.location_codes.filter((c) => c !== code) : [...prev.location_codes, code],
      };
    });
  };

  const handleSaveAm = async (e) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiFetch('/api/org/am-assign', {
        method: 'PUT',
        body: JSON.stringify(amForm),
      });
      setFeedback({ type: 'success', text: res.message });
      setAmModalOpen(false);
      await loadOrg();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleSaveSyncConfig = async (e) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiFetch('/api/org/sync-config', {
        method: 'PUT',
        body: JSON.stringify(syncCfg),
      });
      setFeedback({ type: 'success', text: res.message });
      if (res.syncConfig) setSyncCfg(res.syncConfig);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      await apiFetch('/api/org/sync-config', {
        method: 'PUT',
        body: JSON.stringify(syncCfg),
      });
      const res = await apiFetch('/api/org/sync-now', { method: 'POST' });
      setFeedback({ type: 'success', text: res.message });
      await loadOrg();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
      await loadOrg();
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadFile('/api/org/gsheet-template', 'Mau_Co_Cau_To_Chuc_GoogleSheet.xlsx');
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cơ cấu Tổ chức (SM / AM) & Đồng bộ Google Sheet</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Thiết lập Khối/Ban/Phòng, Giám đốc Vùng (SM phụ trách 1 Ban), Quản lý Vùng (AM phụ trách danh sách bếp) và đồng bộ tự động qua Google Sheet
          </p>
        </div>

        {!isAdmin && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium">
            <Lock className="w-3.5 h-3.5" />
            <span>Chỉ Admin mới có quyền chỉnh sửa cơ cấu tổ chức</span>
          </div>
        )}
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

      {/* Section 1: Khối / Ban / Phòng & SM */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-bold text-slate-900">1. Danh sách Khối / Ban / Phòng &amp; Giám đốc Vùng (SM)</h2>
          </div>
          {isAdmin && (
            <button
              onClick={openCreateUnit}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Khối/Ban/Phòng</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Mã đơn vị</th>
                <th className="px-4 py-3 font-semibold">Loại</th>
                <th className="px-4 py-3 font-semibold">Tên Khối / Ban / Phòng</th>
                <th className="px-4 py-3 font-semibold">Người phụ trách (SM - Giám đốc Vùng)</th>
                <th className="px-4 py-3 font-semibold">Tài khoản SM</th>
                <th className="px-4 py-3 font-semibold text-center">Số bếp</th>
                <th className="px-4 py-3 font-semibold">Mô tả</th>
                {isAdmin && <th className="px-4 py-3 text-center">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {units.map((u) => {
                const siteCount = locations.filter((l) => l.operating_block === u.name).length;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-700">{u.code}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-full">
                        {u.unit_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{u.name}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{u.leader_name || u.sm_full_name || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{u.sm_username || '-'}</td>
                    <td className="px-4 py-3 text-center font-semibold">{siteCount}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{u.description || '-'}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditUnit(u)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="Sửa"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUnit(u)}
                            className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Phân công AM (Quản lý vùng) theo Bếp */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">2. Phân công AM (Quản lý Vùng) phụ trách Bếp / Địa điểm</h2>
          </div>
          {isAdmin && (
            <button
              onClick={() => openAmModal('', '')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Phân công AM cho Bếp</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Mã Bếp (Code)</th>
                <th className="px-4 py-3 font-semibold">Tên Bếp / Địa điểm</th>
                <th className="px-4 py-3 font-semibold">Thuộc Khối / Ban</th>
                <th className="px-4 py-3 font-semibold">AM (Quản lý vùng)</th>
                <th className="px-4 py-3 font-semibold">Tài khoản AM</th>
                {isAdmin && <th className="px-4 py-3 text-center">Điều chỉnh AM</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {locations.map((loc) => (
                <tr key={loc.code_number} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-700">{loc.code_number}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{loc.location_name}</td>
                  <td className="px-4 py-3 text-slate-600">{loc.operating_block}</td>
                  <td className="px-4 py-3 font-medium text-teal-800">
                    {loc.am_name || loc.am_full_name || <span className="text-slate-400 italic">Chưa gán AM</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{loc.am_username || '-'}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openAmModal(loc.am_user_id, loc.am_name)}
                        className="px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg cursor-pointer"
                      >
                        Sửa phân công
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Đồng bộ tự động qua Google Sheet */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2">
            <Sheet className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-900">3. Đồng bộ Cơ cấu Tổ chức Tự động qua Google Sheet</h2>
          </div>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải file mẫu Google Sheet (.xlsx)</span>
          </button>
        </div>

        <form onSubmit={handleSaveSyncConfig} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Link Google Sheet (Chia sẻ chế độ &ldquo;Bất kỳ ai có đường liên kết đều có thể xem&rdquo; hoặc Publish CSV)
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={syncCfg.sheet_url}
                onChange={(e) => setSyncCfg({ ...syncCfg, sheet_url: e.target.value })}
                placeholder="https://docs.google.com/spreadsheets/d/1ABC.../edit#gid=0"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Chu kỳ tự động (phút)</label>
              <select
                disabled={!isAdmin}
                value={syncCfg.sync_interval_minutes}
                onChange={(e) => setSyncCfg({ ...syncCfg, sync_interval_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
              >
                <option value={5}>5 phút</option>
                <option value={15}>15 phút</option>
                <option value={30}>30 phút</option>
                <option value={60}>60 phút</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={syncCfg.auto_sync_enabled}
                onChange={(e) => setSyncCfg({ ...syncCfg, auto_sync_enabled: e.target.checked })}
              />
              <span>Bật tự động đồng bộ định kỳ từ Google Sheet</span>
            </label>

            {isAdmin && (
              <div className="flex items-center gap-2.5">
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Lưu cấu hình
                </button>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncing || !syncCfg.sheet_url}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}</span>
                </button>
              </div>
            )}
          </div>

          {syncCfg.last_sync_at && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center gap-3">
              <span className="text-slate-500">Lần đồng bộ gần nhất: <strong>{syncCfg.last_sync_at}</strong></span>
              <span
                className={`px-2 py-0.5 rounded-full font-semibold ${
                  syncCfg.last_sync_status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {syncCfg.last_sync_status}
              </span>
              <span className="text-slate-700">{syncCfg.last_sync_message}</span>
            </div>
          )}
        </form>
      </div>

      {/* Modal Add/Edit Org Unit */}
      {unitModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">
                {unitForm.id ? 'Cập nhật Khối / Ban / Phòng' : 'Thêm Khối / Ban / Phòng'}
              </h3>
              <button onClick={() => setUnitModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveUnit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Loại *</label>
                  <select
                    value={unitForm.unit_type}
                    onChange={(e) => setUnitForm({ ...unitForm, unit_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="Khối">Khối</option>
                    <option value="Ban">Ban</option>
                    <option value="Phòng">Phòng</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mã đơn vị *</label>
                  <input
                    type="text"
                    required
                    value={unitForm.code}
                    onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })}
                    placeholder="VD: BAN-MB"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tên Khối / Ban / Phòng *</label>
                <input
                  type="text"
                  required
                  value={unitForm.name}
                  onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                  placeholder="VD: Khối Miền Bắc"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Chọn tài khoản SM (Giám đốc Vùng)</label>
                  <select
                    value={unitForm.sm_user_id}
                    onChange={(e) => {
                      const uid = e.target.value;
                      const picked = users.find((u) => String(u.id) === uid);
                      setUnitForm({
                        ...unitForm,
                        sm_user_id: uid,
                        leader_name: picked ? picked.full_name : unitForm.leader_name,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">-- Chọn tài khoản --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.username})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tên Người phụ trách</label>
                  <input
                    type="text"
                    value={unitForm.leader_name}
                    onChange={(e) => setUnitForm({ ...unitForm, leader_name: e.target.value })}
                    placeholder="Họ và tên SM..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mô tả</label>
                <input
                  type="text"
                  value={unitForm.description}
                  onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={unitForm.sync_permission}
                  onChange={(e) => setUnitForm({ ...unitForm, sync_permission: e.target.checked })}
                />
                <span>Tự động cấp quyền truy cập Khối/Ban này cho tài khoản SM</span>
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUnitModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold cursor-pointer"
                >
                  Lưu đơn vị
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Assign AM to Locations */}
      {amModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">Phân công AM (Quản lý vùng) phụ trách Bếp</h3>
              <button onClick={() => setAmModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAm} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tài khoản AM</label>
                  <select
                    value={amForm.am_user_id}
                    onChange={(e) => {
                      const uid = e.target.value;
                      const picked = users.find((u) => String(u.id) === uid);
                      const matchedLocs = uid
                        ? locations.filter((l) => String(l.am_user_id) === uid).map((l) => l.code_number)
                        : amForm.location_codes;
                      setAmForm({
                        ...amForm,
                        am_user_id: uid,
                        am_name: picked ? picked.full_name : amForm.am_name,
                        location_codes: matchedLocs,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">-- Chọn tài khoản --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.username})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tên AM (Quản lý vùng)</label>
                  <input
                    type="text"
                    value={amForm.am_name}
                    onChange={(e) => setAmForm({ ...amForm, am_name: e.target.value })}
                    placeholder="Nhập tên AM..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Chọn các Bếp / Địa điểm do AM này quản lý ({amForm.location_codes.length} đã chọn)
                </label>
                <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {locations.map((loc) => {
                    const checked = amForm.location_codes.includes(loc.code_number);
                    return (
                      <label
                        key={loc.code_number}
                        className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 ${
                          checked ? 'bg-teal-50/60' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAmLoc(loc.code_number)}
                          />
                          <span className="font-mono font-semibold text-slate-700">{loc.code_number}</span>
                          <span className="font-medium text-slate-900">{loc.location_name}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">{loc.operating_block}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={amForm.sync_permission}
                  onChange={(e) => setAmForm({ ...amForm, sync_permission: e.target.checked })}
                />
                <span>Tự động đồng bộ danh sách bếp này vào quyền tài khoản AM</span>
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAmModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
                >
                  Lưu phân công AM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
