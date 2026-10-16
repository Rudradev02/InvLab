import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Warehouse, PaginatedResponse, LowStockAlertsResponse } from '../../types';
import {
  LogOut,
  Warehouse as WarehouseIcon,
  Bell,
  AlertTriangle,
  ArrowRight,
  Package,
  Settings,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../ui/button';

export const TopBar: React.FC = () => {
  const { user, logout, selectedWarehouseId, setSelectedWarehouseId } = useAuth();
  const navigate = useNavigate();
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiRequest<PaginatedResponse<Warehouse>>('warehouses/'),
  });

  const { data: alertsData } = useQuery<LowStockAlertsResponse>({
    queryKey: ['low-stock-alerts', selectedWarehouseId],
    queryFn: () => {
      const q = selectedWarehouseId ? `?warehouse=${selectedWarehouseId}` : '';
      return apiRequest<LowStockAlertsResponse>(`notifications/low-stock/${q}`);
    },
    refetchInterval: 45000,
  });

  const warehouses = warehousesData?.results || [];
  const alertCount = alertsData?.count || 0;
  const alertItems = alertsData?.results || [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsAlertsOpen(false);
      }
    };
    if (isAlertsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAlertsOpen]);

  return (
    <header className="h-16 bg-white border-b border-[#E3E1DA] px-8 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Active Warehouse Context */}
      <div className="flex items-center gap-3">
        <WarehouseIcon className="w-5 h-5 text-[#5E6B63]" />
        {user?.role === 'Admin' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-[#5E6B63] tracking-wider">
              Warehouse:
            </span>
            <select
              aria-label="Select warehouse"
              value={selectedWarehouseId || ''}
              onChange={(e) =>
                setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)
              }
              className="h-8 px-2.5 py-1 text-xs font-medium bg-[#F1F1EC] border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none cursor-pointer"
            >
              <option value="">All Warehouses (Consolidated)</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} ({wh.code})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-[#5E6B63] tracking-wider">
              Assigned Warehouse:
            </span>
            <span className="text-xs font-semibold text-[#173D32] bg-[#E6F2EA] px-2.5 py-1 rounded-md border border-[#c2e4cd]">
              {user?.profile?.warehouse?.name || 'No Warehouse assigned'}
            </span>
          </div>
        )}
      </div>

      {/* Right: Notifications, User Information & Logout */}
      <div className="flex items-center gap-4">
        {/* Low Stock Alerts Popover */}
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setIsAlertsOpen((prev) => !prev)}
            aria-label="Low stock notifications"
            className={`relative p-2 rounded-lg transition-colors ${
              isAlertsOpen
                ? 'bg-[#E6F2EA] text-[#173D32]'
                : 'text-[#5E6B63] hover:text-[#202521] hover:bg-[#F1F1EC]'
            }`}
          >
            <Bell className="w-5 h-5" />
            {alertCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-bold text-white bg-[#B3261E] rounded-full ring-2 ring-white animate-pulse">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </button>

          {isAlertsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-[#E3E1DA] py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2.5 border-b border-[#E3E1DA] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#B3261E]" />
                  <span className="font-semibold text-sm text-[#202521]">
                    Low Stock Alerts
                  </span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FBE9E7] text-[#B3261E]">
                  {alertCount} {alertCount === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-[#F1F1EC]">
                {alertItems.length === 0 ? (
                  <div className="p-6 text-center text-[#5E6B63]">
                    <CheckCircle2 className="w-8 h-8 text-[#173D32] mx-auto mb-2 opacity-80" />
                    <p className="text-sm font-medium text-[#202521]">Stock levels healthy</p>
                    <p className="text-xs mt-1">No products are currently at or below reorder level.</p>
                  </div>
                ) : (
                  alertItems.map((item) => (
                    <div
                      key={`${item.warehouse_id}-${item.product_id}`}
                      className="p-3 hover:bg-[#F8F8F5] transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-[#5E6B63] shrink-0" />
                          <p className="text-xs font-semibold text-[#202521] truncate">
                            {item.product_name}
                          </p>
                        </div>
                        <p className="text-[11px] text-[#5E6B63] mt-0.5">
                          SKU: <span className="font-mono text-[#202521]">{item.sku}</span> •{' '}
                          <span className="text-[#173D32] font-medium">{item.warehouse_code}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-[#FBE9E7] text-[#B3261E]">
                          {item.quantity} / {item.reorder_level}
                        </span>
                        <p className="text-[10px] text-[#8C938D] mt-0.5">Qty / Reorder</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="px-3 py-2 border-t border-[#E3E1DA] bg-[#F8F8F5] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsAlertsOpen(false);
                    navigate('/inventory');
                  }}
                  className="font-medium text-[#173D32] hover:underline flex items-center gap-1"
                >
                  View in Inventory <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {user?.role === 'Admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAlertsOpen(false);
                      navigate('/settings');
                    }}
                    className="text-[#5E6B63] hover:text-[#202521] flex items-center gap-1"
                  >
                    <Settings className="w-3.5 h-3.5" /> Settings
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="text-right hidden sm:block">
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-semibold text-[#202521]">
              {user?.first_name ? `${user.first_name} ${user.last_name}` : user?.username}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                user?.role === 'Admin'
                  ? 'bg-[#173D32] text-white'
                  : user?.role === 'Warehouse Manager'
                  ? 'bg-[#4B6358] text-white'
                  : 'bg-[#F1F1EC] text-[#5E6B63] border border-[#E3E1DA]'
              }`}
            >
              {user?.role}
            </span>
          </div>
          <div className="text-xs text-[#5E6B63] font-medium">
            {user?.profile?.warehouse?.name || (user?.role === 'Admin' ? 'Global Admin' : 'Unassigned')}
          </div>
        </div>

        <div className="w-8 h-8 rounded-full bg-[#173D32] text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs">
          {user?.username.substring(0, 2)}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => logout()}
          className="text-[#5E6B63] hover:text-[#B3261E] hover:bg-[#FBE9E7] gap-1 px-2.5"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-xs">Sign out</span>
        </Button>
      </div>
    </header>
  );
};
