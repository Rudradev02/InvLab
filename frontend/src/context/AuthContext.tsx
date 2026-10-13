import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { apiRequest } from '../lib/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  selectedWarehouseId: number | null;
  setSelectedWarehouseId: (id: number | null) => void;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);

  const fetchCurrentUser = async () => {
    try {
      const data = await apiRequest<User>('auth/me/');
      setUser(data);
      if (data.role !== 'Admin' && data.profile?.warehouse) {
        setSelectedWarehouseId(data.profile.warehouse.id);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const login = async (username: string, password: string): Promise<User> => {
    const data = await apiRequest<User>('auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setUser(data);
    if (data.role !== 'Admin' && data.profile?.warehouse) {
      setSelectedWarehouseId(data.profile.warehouse.id);
    }
    return data;
  };

  const logout = async () => {
    try {
      await apiRequest('auth/logout/', { method: 'POST' });
    } finally {
      setUser(null);
      setSelectedWarehouseId(null);
    }
  };

  const refreshUser = async () => {
    await fetchCurrentUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        selectedWarehouseId,
        setSelectedWarehouseId,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
