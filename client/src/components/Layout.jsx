import React, { useState } from 'react';
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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../context/AuthContext';

export default function Layout({ activeTab, setActiveTab, children }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const isSingleScreen = activeTab === 'dashboard1';

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
    <div className={`min-h-screen flex bg-slate-50 ${isSingleScreen ? 'lg:h-screen lg:overflow-hidden' : ''}`}>
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-60'
        } bg-slate-900 text-slate-100 flex flex-col shrink-0 transition-all duration-200`}
      >
        <div className="px-3.5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-blue-600 rounded-lg shrink-0">
              <Utensils className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-bold text-sm tracking-tight truncate">Mealcount</div>
                <div className="text-[11px] text-slate-400 truncate">Giám sát suất ăn</div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center ${
                  collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'
                } py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate text-left">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 bg-slate-900/60">
          {!collapsed && (
            <div className="flex items-start gap-2 mb-2.5">
              <div className="p-1.5 bg-slate-800 rounded-lg mt-0.5 shrink-0">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{user.full_name}</div>
                <div className="text-[10px] text-blue-400 font-medium">{ROLE_LABELS[user.role]}</div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5" title={scopeText}>
                  {scopeText}
                </div>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            title="Đăng xuất"
            className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-600/90 text-slate-200 hover:text-white text-xs font-medium transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && <span>Đăng xuất</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 min-w-0 ${
          isSingleScreen ? 'lg:h-screen lg:overflow-hidden overflow-y-auto' : 'overflow-y-auto'
        }`}
      >
        <div
          className={
            isSingleScreen
              ? 'w-full h-full p-2.5 sm:p-3 flex flex-col'
              : 'max-w-[1600px] mx-auto p-5'
          }
        >
          {children}
        </div>
      </main>
    </div>
  );
}
