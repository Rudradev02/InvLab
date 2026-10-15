import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { WarehousesPage } from './pages/WarehousesPage';
import { InventoryPage } from './pages/InventoryPage';
import { SalesPage } from './pages/SalesPage';
import { LedgerPage } from './pages/LedgerPage';
import { UsersPage } from './pages/UsersPage';
import { TransfersPage } from './pages/TransfersPage';
import { ForbiddenPage } from './pages/ForbiddenPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/403" element={<ForbiddenPage />} />

            <Route path="/" element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="warehouses" element={<WarehousesPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="transfers" element={<TransfersPage />} />
              <Route path="sales" element={<SalesPage />} />
              <Route path="ledger" element={<LedgerPage />} />
              <Route path="users" element={<UsersPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
