import React from 'react';
import {
  LayoutDashboard,
  BarChart3,
  CalendarCheck,
  SlidersHorizontal,
  FileSpreadsheet,
  BellRing,
  Users,
  Network,
  LogOut,
  Utensils,
  Shield,
} from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../context/AuthContext';

export default function Layout({ activeTab, setActiveTab, children }) {
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'dashboard1', label: 'Dashboard 1: Cảnh báo Suất ăn', icon: LayoutDashboard, roles: ['admin', 'block_manager', 'site_staff', 'viewer'] },
    { id: 'dashboard', label: 'Dashboard 2: Thực trạng Suất ăn & DT', icon: BarChart3, roles: ['admin', 'block_manager', 'site_staff', 'viewer'] },
    { id: 'meals', label: 'Thực tế D-1 (Suất & DT)', icon: CalendarCheck, roles: ['admin', 'block_manager', 'site_staff'] },
    { id: 'standards', label: 'Kế hoạch & Năm trước', icon: SlidersHorizontal, roles: ['admin', 'block_manager', 'viewer'] },
    { id: 'reports', label: 'Báo cáo Excel & Email', icon: FileSpreadsheet, roles: ['admin', 'block_manager', 'site_staff', 'viewer'] },
    { id: 'alerts', label: 'Cảnh báo Zalo / Kakao', icon: BellRing, roles: ['admin', 'block_manager', 'viewer'] },
    { id: 'org', label: 'Cơ cấu Tổ chức (SM/AM)', icon: Network, roles: ['admin', 'block_manager', 'site_staff', 'viewer'] },
    { id: 'users', label: 'Tài khoản & Phân quyền', icon: Users, roles: ['admin'] },
  ].filter((item) => item.roles.includes(user.role));

  const scopeText = user.allowed_blocks.includes('*')
    ? 'Toàn bộ khối điều hành'
    : user.allowed_blocks.join(', ');

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Utensils className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight">Mealcount Management</div>
            <div className="text-[11px] text-slate-400">Giám sát suất ăn hàng ngày</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/60">
          <div className="flex items-start gap-2.5 mb-3">
            <div className="p-1.5 bg-slate-800 rounded-lg mt-0.5">
              <Shield className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{user.full_name}</div>
              <div className="text-[11px] text-blue-400 font-medium">{ROLE_LABELS[user.role]}</div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5" title={scopeText}>
                Phạm vi: {scopeText}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-red-600/90 text-slate-200 hover:text-white text-xs font-medium transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto p-5">{children}</div>
      </main>
    </div>
  );
}
