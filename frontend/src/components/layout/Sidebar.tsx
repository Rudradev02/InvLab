import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Warehouse as WarehouseIcon,
  Package,
  ShoppingCart,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  Boxes,
  ArrowLeftRight,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { clsx } from 'clsx';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || 'Staff';

  const navItems = [
    {
      to: '/',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['Admin', 'Warehouse Manager', 'Staff'],
    },
    {
      to: '/inventory',
      label: 'Stock & Inventory',
      icon: Package,
      roles: ['Admin', 'Warehouse Manager', 'Staff'],
    },
    {
      to: '/transfers',
      label: 'Transfers',
      icon: ArrowLeftRight,
      roles: ['Admin', 'Warehouse Manager'],
    },
    {
      to: '/sales',
      label: 'Sales & Billing',
      icon: ShoppingCart,
      roles: ['Admin', 'Warehouse Manager', 'Staff'],
    },
    {
      to: '/customers',
      label: 'Customers & Udhaar',
      icon: Users,
      roles: ['Admin', 'Warehouse Manager', 'Staff'],
    },
    {
      to: '/reports',
      label: 'Reports & Analytics',
      icon: BarChart3,
      roles: ['Admin', 'Warehouse Manager'], // Staff cannot view reports per Prompt 6 & 11
    },
    {
      to: '/warehouses',
      label: 'Warehouses',
      icon: WarehouseIcon,
      roles: ['Admin', 'Warehouse Manager'],
    },
    {
      to: '/ledger',
      label: 'Stock Ledger',
      icon: FileSpreadsheet,
      roles: ['Admin', 'Warehouse Manager'], // Staff cannot view ledger per FRD
    },
    {
      to: '/users',
      label: 'Users & Staff',
      icon: Users,
      roles: ['Admin', 'Warehouse Manager'],
    },
  ];

  const allowedItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="w-64 bg-white border-r border-[#E3E1DA] flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="h-16 border-b border-[#E3E1DA] flex items-center px-6 gap-3">
        <div className="w-9 h-9 rounded-md bg-[#173D32] flex items-center justify-center text-white shadow-xs">
          <Boxes className="w-5 h-5" />
        </div>
        <div>
          <span className="font-bold text-lg text-[#173D32] tracking-tight">InvLab</span>
          <span className="text-[10px] text-[#5E6B63] block -mt-1 font-medium uppercase tracking-wider">
            Multi-Warehouse
          </span>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
        <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#5E6B63]/80">
          Navigation
        </div>
        {allowedItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all group',
                  isActive
                    ? 'bg-[#173D32] text-white shadow-xs'
                    : 'text-[#202521] hover:bg-[#F1F1EC] hover:text-[#173D32]'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={clsx(
                      'w-4 h-4 transition-colors',
                      isActive ? 'text-white' : 'text-[#5E6B63] group-hover:text-[#173D32]'
                    )}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Role / Context Footer */}
      <div className="p-4 border-t border-[#E3E1DA] bg-[#F8F8F5]/80">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#173D32]" />
          <span className="text-xs font-semibold text-[#173D32]">{role}</span>
        </div>
        <p className="text-[11px] text-[#5E6B63] mt-0.5 truncate">
          {user?.first_name ? `${user.first_name} ${user.last_name}` : user?.username}
        </p>
      </div>
    </aside>
  );
};
