import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch, getToken, setToken } from '../api';

const AuthContext = createContext(null);

export const ROLE_LABELS = {
  admin: 'Quản trị viên (Admin)',
  block_manager: 'SM - Giám đốc Vùng / Khối',
  site_staff: 'AM - Quản lý Vùng / Bếp',
  viewer: 'Chỉ xem (Viewer)',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setToken(''))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    setToken('');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
