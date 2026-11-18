import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import Layout from './components/Layout';
import Dashboard1Page from './components/Dashboard1Page';
import DashboardPage from './components/DashboardPage';
import DailyMealsPage from './components/DailyMealsPage';
import StandardsPage from './components/StandardsPage';
import ReportsPage from './components/ReportsPage';
import AlertsPage from './components/AlertsPage';
import OrgPage from './components/OrgPage';
import UsersPage from './components/UsersPage';

function MainApp() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard1');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-sm">
        Đang tải hệ thống...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard1':
        return <Dashboard1Page />;
      case 'dashboard':
        return <DashboardPage />;
      case 'meals':
        return <DailyMealsPage />;
      case 'standards':
        return <StandardsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'alerts':
        return <AlertsPage />;
      case 'org':
        return <OrgPage />;
      case 'users':
        return <UsersPage />;
      default:
        return <Dashboard1Page />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderTab()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
