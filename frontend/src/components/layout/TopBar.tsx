import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Warehouse, PaginatedResponse } from '../../types';
import { LogOut, Warehouse as WarehouseIcon } from 'lucide-react';
import { Button } from '../ui/button';

export const TopBar: React.FC = () => {
  const { user, logout, selectedWarehouseId, setSelectedWarehouseId } = useAuth();

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiRequest<PaginatedResponse<Warehouse>>('warehouses/'),
  });

  const warehouses = warehousesData?.results || [];

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

      {/* Right: User Information & Logout */}
      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <div className="text-sm font-semibold text-[#202521]">
            {user?.first_name ? `${user.first_name} ${user.last_name}` : user?.username}
          </div>
          <div className="text-xs text-[#5E6B63] font-medium">{user?.role}</div>
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
