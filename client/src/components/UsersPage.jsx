import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Edit3, Shield, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { apiFetch } from '../api';
import { ROLE_LABELS } from '../context/AuthContext';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    role: 'block_manager',
    allowed_blocks: ['*'],
    allowed_locations_text: '*',
    is_active: true,
  });

  const loadData = useCallback(async () => {
    try {
      const [uRes, sRes] = await Promise.all([apiFetch('/api/users'), apiFetch('/api/standards')]);
      setUsers(uRes.users || []);
      setBlocks(sRes.blocks || []);
      setLocations(sRes.locations || []);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      username: '',
      password: '',
      full_name: '',
      email: '',
      role: 'block_manager',
      allowed_blocks: ['*'],
      allowed_locations_text: '*',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditingId(u.id);
    setForm({
      username: u.username,
      password: '',
      full_name: u.full_name,
      email: u.email || '',
      role: u.role,
      allowed_blocks: u.allowed_blocks,
      allowed_locations_text: u.allowed_locations.join(', '),
      is_active: u.is_active,
    });
    setModalOpen(true);
  };

  const toggleBlock = (b) => {
    if (b === '*') {
      setForm({ ...form, allowed_blocks: ['*'] });
      return;
    }
    const current = form.allowed_blocks.filter((x) => x !== '*');
    const next = current.includes(b) ? current.filter((x) => x !== b) : [...current, b];
    setForm({ ...form, allowed_blocks: next.length ? next : ['*'] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);
    const locs = form.allowed_locations_text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      username: form.username,
      full_name: form.full_name,
      email: form.email,
      role: form.role,
      allowed_blocks: form.allowed_blocks,
      allowed_locations: locs.length ? locs : ['*'],
      is_active: form.is_active,
      ...(form.password ? { password: form.password } : {}),
    };

    try {
      if (editingId) {
        await apiFetch(`/api/users/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setFeedback({ type: 'success', text: `Đã cập nhật tài khoản ${form.username}.` });
      } else {
        await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(payload) });
        setFeedback({ type: 'success', text: `Đã tạo tài khoản ${form.username}.` });
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Tài khoản & Phân quyền (RBAC)</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tạo tài khoản và giới hạn quyền xem/chỉnh sửa theo Vai trò, Khối điều hành và Mã địa điểm
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tạo tài khoản mới</span>
        </button>
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Username</th>
                <th className="px-4 py-3 font-semibold">Họ và tên</th>
                <th className="px-4 py-3 font-semibold">Vai trò</th>
                <th className="px-4 py-3 font-semibold">Phạm vi Khối ĐH</th>
                <th className="px-4 py-3 font-semibold">Phạm vi Địa điểm</th>
                <th className="px-4 py-3 font-semibold text-center">Trạng thái</th>
                <th className="px-4 py-3 text-center">Sửa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800">{u.username}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{u.full_name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                      <Shield className="w-3 h-3" /> {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {u.allowed_blocks.includes('*') ? 'Tất cả khối' : u.allowed_blocks.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">
                    {u.allowed_locations.includes('*') ? 'Tất cả địa điểm' : u.allowed_locations.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.is_active ? (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Hoạt động</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-slate-200 text-slate-600 rounded-full">Đã khóa</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">
                {editingId ? `Chỉnh sửa tài khoản: ${form.username}` : 'Tạo tài khoản mới'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingId)}
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {editingId ? 'Mật khẩu mới (bỏ trống nếu giữ nguyên)' : 'Mật khẩu *'}
                  </label>
                  <input
                    type="password"
                    required={!editingId}
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Họ và tên *</label>
                  <input
                    type="text"
                    required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Vai trò (Role)</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="admin">Quản trị viên (Admin - Toàn quyền)</option>
                  <option value="block_manager">Quản lý Khối điều hành (Xem/Sửa theo khối)</option>
                  <option value="site_staff">Nhân sự Địa điểm (Chỉ nhập liệu điểm được gán)</option>
                  <option value="viewer">Chỉ xem (Viewer - Dashboard & Báo cáo)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phạm vi Khối điều hành được truy cập</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleBlock('*')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                      form.allowed_blocks.includes('*') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    Tất cả (*)
                  </button>
                  {blocks.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => toggleBlock(b)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                        form.allowed_blocks.includes(b) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Mã địa điểm được phép (nhập * hoặc danh sách cách nhau dấu phẩy, VD: LOC-001, LOC-002)
                </label>
                <input
                  type="text"
                  value={form.allowed_locations_text}
                  onChange={(e) => setForm({ ...form, allowed_locations_text: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Mã hiện có: {locations.map((l) => l.code_number).join(', ')}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <span>Tài khoản đang hoạt động</span>
              </label>

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
                  {editingId ? 'Lưu thay đổi' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
