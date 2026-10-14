import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { Warehouse, WarehouseOverview, WarehouseFullDetail, PaginatedResponse, User } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  Building2,
  User as UserIcon,
  Phone,
  MapPin,
  Plus,
  Mail,
  Search,
  Filter,
  ArrowUpDown,
  Boxes,
  TrendingUp,
  AlertTriangle,
  Clock,
  Edit,
  Power,
  RotateCcw,
  Users as UsersIcon,
  ShoppingBag,
  FileText,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

type DetailTab = 'overview' | 'staff' | 'stock' | 'sales' | 'ledger';

export const WarehousesPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'Admin';

  // Filters & Sorting
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'units_desc' | 'sales_desc'>('name');

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWh, setEditingWh] = useState<WarehouseOverview | null>(null);
  const [deactivatingWh, setDeactivatingWh] = useState<WarehouseOverview | null>(null);
  const [detailWhId, setDetailWhId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    manager_id: '',
  });

  // Query warehouses (overview for Admin, standard list for others)
  const { data: rawData, isLoading } = useQuery({
    queryKey: ['warehouses', isAdmin ? 'overview' : 'list'],
    queryFn: () =>
      isAdmin
        ? apiRequest<WarehouseOverview[]>('warehouses/overview/')
        : apiRequest<PaginatedResponse<Warehouse>>('warehouses/').then((res) => res.results as unknown as WarehouseOverview[]),
  });

  // Query users for manager dropdown (Admin only)
  const { data: usersData } = useQuery({
    queryKey: ['users-managers'],
    queryFn: () => apiRequest<PaginatedResponse<User>>('users/'),
    enabled: isAdmin,
  });

  // Full detail query for selected warehouse
  const { data: detailData, isLoading: isDetailLoading } = useQuery({
    queryKey: ['warehouse-full-detail', detailWhId],
    queryFn: () => apiRequest<WarehouseFullDetail>(`warehouses/${detailWhId}/full-detail/`),
    enabled: !!detailWhId && isAdmin,
  });

  const warehouses: WarehouseOverview[] = useMemo(() => {
    if (!rawData) return [];
    return Array.isArray(rawData) ? rawData : [];
  }, [rawData]);

  const users = usersData?.results || [];

  // Filtered & Sorted warehouses
  const filteredWarehouses = useMemo(() => {
    return warehouses
      .filter((wh) => {
        const matchesSearch =
          wh.name.toLowerCase().includes(search.toLowerCase()) ||
          wh.code.toLowerCase().includes(search.toLowerCase()) ||
          wh.city.toLowerCase().includes(search.toLowerCase()) ||
          (wh.manager?.full_name || '').toLowerCase().includes(search.toLowerCase());

        const matchesStatus =
          statusFilter === 'all'
            ? true
            : statusFilter === 'active'
            ? wh.is_active
            : !wh.is_active;

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'units_desc') return (b.total_units || 0) - (a.total_units || 0);
        if (sortBy === 'sales_desc') {
          return parseFloat(b.sales_today || '0') - parseFloat(a.sales_today || '0');
        }
        return 0;
      });
  }, [warehouses, search, statusFilter, sortBy]);

  // Aggregate metrics across warehouses
  const aggregateMetrics = useMemo(() => {
    const totalUnits = warehouses.reduce((acc, w) => acc + (w.total_units || 0), 0);
    const activeCount = warehouses.filter((w) => w.is_active).length;
    const totalSalesToday = warehouses.reduce((acc, w) => acc + parseFloat(w.sales_today || '0'), 0);
    const totalLowStock = warehouses.reduce((acc, w) => acc + (w.low_stock_count || 0), 0);
    return { totalUnits, activeCount, totalSalesToday, totalLowStock };
  }, [warehouses]);

  // Chart data: units per warehouse
  const chartData = useMemo(() => {
    return warehouses
      .filter((w) => w.is_active)
      .map((w) => ({
        code: w.code,
        name: w.name,
        units: w.total_units || 0,
      }));
  }, [warehouses]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      apiRequest<Warehouse>('warehouses/', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          manager_id: data.manager_id ? Number(data.manager_id) : null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Warehouse created successfully');
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create warehouse');
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof formData> }) =>
      apiRequest<Warehouse>(`warehouses/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...data,
          manager_id: data.manager_id ? Number(data.manager_id) : null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      if (detailWhId) queryClient.invalidateQueries({ queryKey: ['warehouse-full-detail', detailWhId] });
      toast.success('Warehouse updated successfully');
      setEditingWh(null);
      resetForm();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update warehouse');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ message?: string; deactivated?: boolean }>(`warehouses/${id}/`, {
        method: 'DELETE',
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      if (detailWhId) queryClient.invalidateQueries({ queryKey: ['warehouse-full-detail', detailWhId] });
      toast.success(data?.message || 'Warehouse deactivated');
      setDeactivatingWh(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate warehouse');
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ message: string; is_active: boolean }>(`warehouses/${id}/activate/`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      if (detailWhId) queryClient.invalidateQueries({ queryKey: ['warehouse-full-detail', detailWhId] });
      toast.success(data.message || 'Warehouse reactivated');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to activate warehouse');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      email: '',
      manager_id: '',
    });
  };

  const openEdit = (wh: WarehouseOverview) => {
    setEditingWh(wh);
    setFormData({
      name: wh.name,
      code: wh.code,
      address_line1: wh.address_line1,
      address_line2: wh.address_line2 || '',
      city: wh.city,
      state: wh.state,
      pincode: wh.pincode,
      phone: wh.phone,
      email: wh.email || '',
      manager_id: wh.manager ? String(wh.manager.id) : '',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202521] flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#173D32]" /> Warehouses
          </h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            {isAdmin
              ? 'Multi-warehouse network administration, managers, stock analytics, and ledger inspection'
              : 'Assigned facility details and local inventory'}
          </p>
        </div>

        {isAdmin && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  resetForm();
                  setIsCreateOpen(true);
                }}
                className="gap-2 bg-[#173D32] hover:bg-[#123027] text-white"
              >
                <Plus className="w-4 h-4" /> Add Warehouse
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Warehouse</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate(formData);
                }}
                className="space-y-3 mt-2"
              >
                <Input
                  label="Warehouse Name"
                  required
                  placeholder="e.g. Hyderabad Logistics Hub"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <Input
                  label="Unique Code (uppercase)"
                  required
                  placeholder="e.g. HYD"
                  maxLength={10}
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                />
                <Input
                  label="Address Line 1"
                  required
                  placeholder="Street / Industrial Zone"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                />
                <Input
                  label="Address Line 2 (Optional)"
                  placeholder="Suite, building, landmark"
                  value={formData.address_line2}
                  onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="City"
                    required
                    placeholder="City"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                  <Input
                    label="State"
                    required
                    placeholder="State"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Pincode (6 digits)"
                    required
                    maxLength={6}
                    placeholder="411057"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  />
                  <Input
                    label="Phone"
                    required
                    placeholder="+91 98..."
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <Input
                  label="Email"
                  type="email"
                  placeholder="warehouse@invlab.local"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                    Assign Manager
                  </label>
                  <select
                    value={formData.manager_id}
                    onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                  >
                    <option value="">No Manager Assigned</option>
                    {users
                      .filter((u) => u.role === 'Warehouse Manager' || u.role === 'Admin')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.first_name} {u.last_name})
                        </option>
                      ))}
                  </select>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-4 bg-[#173D32] text-white"
                  isLoading={createMutation.isPending}
                >
                  Create Warehouse
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Aggregate KPI Cards & Stock Chart (Admin only) */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 bg-white border-[#E3E1DA]">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#5E6B63]">
                <Building2 className="w-4 h-4 text-[#173D32]" /> Total Facilities
              </div>
              <div className="mt-2 text-2xl font-bold text-[#202521]">
                {warehouses.length}
                <span className="text-xs font-medium text-[#2F7D4F] ml-2">
                  ({aggregateMetrics.activeCount} active)
                </span>
              </div>
            </Card>

            <Card className="p-4 bg-white border-[#E3E1DA]">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#5E6B63]">
                <Boxes className="w-4 h-4 text-[#173D32]" /> Stock Units
              </div>
              <div className="mt-2 text-2xl font-bold text-[#202521] tabular-nums">
                {aggregateMetrics.totalUnits.toLocaleString('en-IN')}
              </div>
            </Card>

            <Card className="p-4 bg-white border-[#E3E1DA]">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#5E6B63]">
                <TrendingUp className="w-4 h-4 text-[#2F7D4F]" /> Sales Today
              </div>
              <div className="mt-2 text-2xl font-bold text-[#202521] tabular-nums">
                ₹{aggregateMetrics.totalSalesToday.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </Card>

            <Card className="p-4 bg-white border-[#E3E1DA]">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#5E6B63]">
                <AlertTriangle className="w-4 h-4 text-[#B3261E]" /> Low Stock Alerts
              </div>
              <div className="mt-2 text-2xl font-bold text-[#B3261E] tabular-nums">
                {aggregateMetrics.totalLowStock}
              </div>
            </Card>

            {/* Recharts Bar Chart */}
            <Card className="col-span-2 sm:col-span-4 p-4 bg-white border-[#E3E1DA]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#5E6B63]">
                  Stock Inventory Across Active Warehouses
                </span>
                <span className="text-xs text-[#5E6B63]">Total Units Distribution</span>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3E1DA" />
                    <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#5E6B63' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5E6B63' }} />
                    <Tooltip
                      formatter={(val: any) => [
                        `${Number(val || 0).toLocaleString('en-IN')} units`,
                        'Stock Level',
                      ]}
                      labelFormatter={(label: unknown) => {
                        const match = chartData.find((d) => d.code === label);
                        return match ? `${match.name} (${match.code})` : String(label);
                      }}
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E3E1DA',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="units" fill="#173D32" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Quick Insights Card */}
          <Card className="p-4 bg-[#F8F8F5] border-[#E3E1DA] flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#173D32] flex items-center gap-1.5">
                <Building2 className="w-4 h-4" /> Multi-Hub Scoping
              </div>
              <p className="text-xs text-[#5E6B63] mt-2 leading-relaxed">
                InvLab isolates counter sales, product stock levels, and ledger audits per facility.
                Admins have company-wide visibility, while Managers and Staff operate within their assigned warehouse.
              </p>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between text-[#202521] border-b border-[#E3E1DA] pb-1.5">
                  <span className="text-[#5E6B63]">Transfer Dispatch:</span>
                  <span className="font-semibold text-[#173D32]">Two-phase handshake</span>
                </div>
                <div className="flex justify-between text-[#202521] border-b border-[#E3E1DA] pb-1.5">
                  <span className="text-[#5E6B63]">Deactivation Guard:</span>
                  <span className="font-semibold text-[#173D32]">Protected if active stock</span>
                </div>
                <div className="flex justify-between text-[#202521]">
                  <span className="text-[#5E6B63]">Ledger Audit:</span>
                  <span className="font-semibold text-[#173D32]">Append-only immutable</span>
                </div>
              </div>
            </div>

            <div className="pt-4 text-[11px] text-[#5E6B63] italic">
              Click &quot;View Full Details&quot; on any warehouse to inspect its real-time staff, stock, sales, and movement ledger.
            </div>
          </Card>
        </div>
      )}

      {/* Search, Filter, Sort Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-lg border border-[#E3E1DA]">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5E6B63]" />
          <input
            type="text"
            placeholder="Search warehouse, code, manager, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8F8F5] border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-[#F1F1EC] p-0.5 rounded-md text-xs">
            <Filter className="w-3.5 h-3.5 text-[#5E6B63] ml-1.5" />
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'all' ? 'bg-white shadow-xs text-[#173D32] font-semibold' : 'text-[#5E6B63]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'active' ? 'bg-white shadow-xs text-[#2F7D4F] font-semibold' : 'text-[#5E6B63]'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'inactive' ? 'bg-white shadow-xs text-[#B3261E] font-semibold' : 'text-[#5E6B63]'
              }`}
            >
              Inactive
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 text-xs text-[#5E6B63]">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'units_desc' | 'sales_desc')}
              className="h-8 px-2 py-1 bg-[#F8F8F5] border border-[#E3E1DA] rounded-md text-xs text-[#202521] outline-none"
            >
              <option value="name">Sort: Name (A-Z)</option>
              <option value="units_desc">Sort: Stock Units (High to Low)</option>
              <option value="sales_desc">Sort: Sales Today (High to Low)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Warehouse Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-sm text-[#5E6B63]">Loading warehouses overview...</div>
      ) : filteredWarehouses.length === 0 ? (
        <div className="p-12 text-center text-sm text-[#5E6B63] bg-white rounded-lg border border-[#E3E1DA]">
          No warehouses found matching criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWarehouses.map((wh) => (
            <Card
              key={wh.id}
              className={`hover:shadow-md transition-shadow border ${
                !wh.is_active ? 'opacity-80 bg-[#FAFAFA]' : 'bg-white'
              }`}
            >
              <CardHeader className="bg-[#F8F8F5]/80 pb-3 border-b border-[#E3E1DA]/60">
                <div className="flex items-start justify-between w-full">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[#173D32]" />
                      <CardTitle className="text-base text-[#202521]">{wh.name}</CardTitle>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#173D32] mt-0.5 inline-block">
                      {wh.code}
                    </span>
                  </div>

                  <Badge variant={wh.is_active ? 'success' : 'error'}>
                    {wh.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3.5 pt-3 text-xs text-[#5E6B63]">
                {/* Location */}
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#5E6B63] shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <div className="text-[#202521] font-medium">{wh.address_line1}</div>
                    {wh.address_line2 && <div>{wh.address_line2}</div>}
                    <div>
                      {wh.city}, {wh.state} — {wh.pincode}
                    </div>
                  </div>
                </div>

                {/* Manager */}
                <div className="flex items-center gap-2 pt-2 border-t border-[#E3E1DA]/60">
                  <UserIcon className="w-4 h-4 text-[#173D32] shrink-0" />
                  <div className="truncate">
                    <div className="font-semibold text-[#202521] truncate">
                      {wh.manager
                        ? `${wh.manager.full_name || wh.manager.first_name + ' ' + wh.manager.last_name} (@${wh.manager.username})`
                        : 'Unassigned Manager'}
                    </div>
                    <div className="text-[11px] text-[#5E6B63] flex items-center gap-2 truncate">
                      {wh.manager?.email && <span>{wh.manager.email}</span>}
                      {wh.manager?.phone && <span>• {wh.manager.phone}</span>}
                    </div>
                  </div>
                </div>

                {/* Contacts & Staff */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E3E1DA]/60 text-[11px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="w-3.5 h-3.5 text-[#5E6B63] shrink-0" />
                    <span className="truncate">{wh.phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-[#5E6B63] shrink-0" />
                    <span className="truncate">{wh.email || '—'}</span>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 bg-[#F8F8F5] p-2.5 rounded border border-[#E3E1DA]/60 text-center">
                  <div>
                    <div className="text-[10px] text-[#5E6B63] uppercase font-semibold">Units</div>
                    <div className="text-sm font-bold text-[#173D32] tabular-nums">
                      {(wh.total_units || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#5E6B63] uppercase font-semibold">Products</div>
                    <div className="text-sm font-bold text-[#202521] tabular-nums">
                      {wh.products_stocked || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#5E6B63] uppercase font-semibold">Low Stock</div>
                    <div className="text-sm font-bold text-[#B3261E] tabular-nums">
                      {wh.low_stock_count || 0}
                    </div>
                  </div>
                </div>

                {/* Sales Metrics */}
                <div className="flex justify-between items-center text-[11px] pt-1 text-[#202521]">
                  <span>Sales Today:</span>
                  <span className="font-semibold tabular-nums text-[#2F7D4F]">
                    ₹{parseFloat(wh.sales_today || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}{' '}
                    <span className="text-[#5E6B63] font-normal">({wh.sales_today_count || 0} txns)</span>
                  </span>
                </div>

                {/* Last Activity */}
                <div className="flex justify-between items-center text-[10px] text-[#5E6B63] pt-1 border-t border-[#E3E1DA]/40">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Last Movement:
                  </span>
                  <span>
                    {wh.last_activity
                      ? new Date(wh.last_activity).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'No activity yet'}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#E3E1DA]">
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDetailWhId(wh.id);
                        setActiveTab('overview');
                      }}
                      className="text-xs h-8 flex-1"
                    >
                      View Full Details
                    </Button>
                  )}

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(wh)}
                        className="h-8 w-8 p-0 text-[#5E6B63] hover:text-[#173D32]"
                        title="Edit warehouse"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>

                      {wh.is_active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeactivatingWh(wh)}
                          className="h-8 w-8 p-0 text-[#B3261E] hover:bg-[#FBE9E7]"
                          title="Deactivate warehouse"
                        >
                          <Power className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => activateMutation.mutate(wh.id)}
                          className="h-8 w-8 p-0 text-[#2F7D4F] hover:bg-[#E6F2EA]"
                          title="Reactivate warehouse"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Warehouse Dialog */}
      <Dialog open={!!editingWh} onOpenChange={(open) => !open && setEditingWh(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Warehouse: {editingWh?.name}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingWh) {
                editMutation.mutate({ id: editingWh.id, data: formData });
              }
            }}
            className="space-y-3 mt-2"
          >
            <Input
              label="Warehouse Name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <Input label="Unique Code" disabled value={formData.code} />
            <Input
              label="Address Line 1"
              required
              value={formData.address_line1}
              onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
            />
            <Input
              label="Address Line 2 (Optional)"
              value={formData.address_line2}
              onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="City"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
              <Input
                label="State"
                required
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Pincode"
                required
                maxLength={6}
                value={formData.pincode}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
              />
              <Input
                label="Phone"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                Assign Manager
              </label>
              <select
                value={formData.manager_id}
                onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
              >
                <option value="">No Manager Assigned</option>
                {users
                  .filter((u) => u.role === 'Warehouse Manager' || u.role === 'Admin')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.first_name} {u.last_name})
                    </option>
                  ))}
              </select>
            </div>

            <Button
              type="submit"
              className="w-full mt-4 bg-[#173D32] text-white"
              isLoading={editMutation.isPending}
            >
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <Dialog open={!!deactivatingWh} onOpenChange={(open) => !open && setDeactivatingWh(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#B3261E]">
              <AlertTriangle className="w-5 h-5" /> Deactivate Warehouse
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs text-[#5E6B63] mt-2">
            <p>
              Are you sure you want to deactivate <strong className="text-[#202521]">{deactivatingWh?.name}</strong> (
              <span className="font-mono">{deactivatingWh?.code}</span>)?
            </p>
            <div className="bg-[#FBE9E7] p-3 rounded text-[#B3261E] border border-[#f8c9c4] leading-relaxed">
              <strong>Safe Guard Notice:</strong> If this warehouse has recorded stock, past sales, or registered staff,
              the server will automatically <em>deactivate</em> the warehouse rather than deleting it to maintain ledger and
              audit integrity.
            </div>
            <p>
              Staff assigned to a deactivated facility will not be able to record new sales or adjustments.
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDeactivatingWh(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              isLoading={deactivateMutation.isPending}
              onClick={() => deactivatingWh && deactivateMutation.mutate(deactivatingWh.id)}
              className="bg-[#B3261E] hover:bg-[#8F1E18] text-white border-transparent"
            >
              Confirm Deactivation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Modal (5 Tabs: Overview, Staff, Stock, Sales, Ledger) */}
      <Dialog open={!!detailWhId} onOpenChange={(open) => !open && setDetailWhId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          {isDetailLoading || !detailData ? (
            <div className="p-16 text-center text-sm text-[#5E6B63]">Loading warehouse details...</div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Modal Header */}
              <div className="p-5 border-b border-[#E3E1DA] bg-[#F8F8F5] flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#173D32]" />
                    <h2 className="text-lg font-bold text-[#202521]">{detailData.warehouse.name}</h2>
                    <span className="font-mono text-xs font-bold text-[#173D32] bg-[#E6F2EA] px-2 py-0.5 rounded">
                      {detailData.warehouse.code}
                    </span>
                  </div>
                  <div className="text-xs text-[#5E6B63] mt-1 flex items-center gap-3">
                    <span>
                      {detailData.warehouse.city}, {detailData.warehouse.state}
                    </span>
                    <span>•</span>
                    <span>Phone: {detailData.warehouse.phone}</span>
                    <span>•</span>
                    <span>Manager: {detailData.warehouse.manager?.full_name || detailData.warehouse.manager?.username || 'None'}</span>
                  </div>
                </div>

                <Badge variant={detailData.warehouse.is_active ? 'success' : 'error'}>
                  {detailData.warehouse.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {/* Tab Navigation */}
              <div className="flex border-b border-[#E3E1DA] bg-white px-5 gap-1">
                {(
                  [
                    { id: 'overview', label: 'Overview', icon: Building2 },
                    { id: 'staff', label: `Staff (${detailData.staff.length})`, icon: UsersIcon },
                    { id: 'stock', label: `Stock Levels (${detailData.stock.length})`, icon: Package },
                    { id: 'sales', label: `Recent Sales (${detailData.sales.length})`, icon: ShoppingBag },
                    { id: 'ledger', label: `Ledger Movements (${detailData.ledger.length})`, icon: FileText },
                  ] as { id: DetailTab; label: string; icon: React.FC<{ className?: string }> }[]
                ).map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
                        isActive
                          ? 'border-[#173D32] text-[#173D32]'
                          : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content Body */}
              <div className="p-5 overflow-y-auto flex-1 bg-white text-xs text-[#202521]">
                {/* 1. Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-[#F8F8F5] rounded-md border border-[#E3E1DA]">
                        <span className="text-[11px] text-[#5E6B63] font-medium">Total Units in Stock</span>
                        <div className="text-xl font-bold text-[#173D32] tabular-nums mt-1">
                          {detailData.summary.total_units.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="p-3 bg-[#F8F8F5] rounded-md border border-[#E3E1DA]">
                        <span className="text-[11px] text-[#5E6B63] font-medium">Distinct Products</span>
                        <div className="text-xl font-bold text-[#202521] tabular-nums mt-1">
                          {detailData.summary.products_stocked}
                        </div>
                      </div>
                      <div className="p-3 bg-[#F8F8F5] rounded-md border border-[#E3E1DA]">
                        <span className="text-[11px] text-[#5E6B63] font-medium">Low Stock Items</span>
                        <div className="text-xl font-bold text-[#B3261E] tabular-nums mt-1">
                          {detailData.summary.low_stock_count}
                        </div>
                      </div>
                      <div className="p-3 bg-[#F8F8F5] rounded-md border border-[#E3E1DA]">
                        <span className="text-[11px] text-[#5E6B63] font-medium">Sales Today</span>
                        <div className="text-xl font-bold text-[#2F7D4F] tabular-nums mt-1">
                          ₹{parseFloat(detailData.summary.sales_today_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Facility Contact */}
                      <Card className="p-4 border-[#E3E1DA]">
                        <div className="font-semibold text-xs text-[#173D32] mb-3 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4" /> Facility Address &amp; Contact
                        </div>
                        <div className="space-y-1.5 text-xs text-[#5E6B63]">
                          <div><strong className="text-[#202521]">Address:</strong> {detailData.warehouse.address_line1} {detailData.warehouse.address_line2}</div>
                          <div><strong className="text-[#202521]">Location:</strong> {detailData.warehouse.city}, {detailData.warehouse.state} — {detailData.warehouse.pincode}</div>
                          <div><strong className="text-[#202521]">Phone:</strong> {detailData.warehouse.phone}</div>
                          <div><strong className="text-[#202521]">Email:</strong> {detailData.warehouse.email || '—'}</div>
                        </div>
                      </Card>

                      {/* Manager Profile */}
                      <Card className="p-4 border-[#E3E1DA]">
                        <div className="font-semibold text-xs text-[#173D32] mb-3 flex items-center gap-1.5">
                          <UserIcon className="w-4 h-4" /> Assigned Warehouse Manager
                        </div>
                        {detailData.warehouse.manager ? (
                          <div className="space-y-1.5 text-xs text-[#5E6B63]">
                            <div>
                              <strong className="text-[#202521]">Name:</strong>{' '}
                              {detailData.warehouse.manager.full_name ||
                                `${detailData.warehouse.manager.first_name} ${detailData.warehouse.manager.last_name}`}
                            </div>
                            <div>
                              <strong className="text-[#202521]">Username:</strong> @{detailData.warehouse.manager.username}
                            </div>
                            <div>
                              <strong className="text-[#202521]">Email:</strong> {detailData.warehouse.manager.email}
                            </div>
                            <div>
                              <strong className="text-[#202521]">Phone:</strong> {detailData.warehouse.manager.phone || '—'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-[#5E6B63] italic">No manager currently assigned to this facility.</div>
                        )}
                      </Card>
                    </div>
                  </div>
                )}

                {/* 2. Staff Tab */}
                {activeTab === 'staff' && (
                  <div>
                    {detailData.staff.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#5E6B63]">No staff accounts registered for this warehouse.</div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#F8F8F5] text-[#5E6B63] border-b border-[#E3E1DA]">
                            <th className="py-2.5 px-3 font-semibold">User</th>
                            <th className="py-2.5 px-3 font-semibold">Role</th>
                            <th className="py-2.5 px-3 font-semibold">Phone</th>
                            <th className="py-2.5 px-3 font-semibold">Email</th>
                            <th className="py-2.5 px-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E1DA]/60">
                          {detailData.staff.map((s) => (
                            <tr key={s.id} className="hover:bg-[#F8F8F5]">
                              <td className="py-2.5 px-3 font-semibold text-[#202521]">
                                {s.full_name} <span className="text-[11px] font-mono text-[#5E6B63]">(@{s.username})</span>
                              </td>
                              <td className="py-2.5 px-3">
                                <Badge variant="neutral">{s.role}</Badge>
                              </td>
                              <td className="py-2.5 px-3 text-[#5E6B63]">{s.phone || '—'}</td>
                              <td className="py-2.5 px-3 text-[#5E6B63]">{s.email || '—'}</td>
                              <td className="py-2.5 px-3">
                                <Badge variant={s.is_active ? 'success' : 'error'}>
                                  {s.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* 3. Stock Levels Tab */}
                {activeTab === 'stock' && (
                  <div>
                    {detailData.stock.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#5E6B63]">No products stocked in this warehouse yet.</div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#F8F8F5] text-[#5E6B63] border-b border-[#E3E1DA]">
                            <th className="py-2.5 px-3 font-semibold">Product</th>
                            <th className="py-2.5 px-3 font-semibold">SKU</th>
                            <th className="py-2.5 px-3 font-semibold">Category</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Quantity</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Reorder Level</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Price</th>
                            <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E1DA]/60">
                          {detailData.stock.map((item) => (
                            <tr key={item.id} className="hover:bg-[#F8F8F5]">
                              <td className="py-2.5 px-3 font-medium text-[#202521]">{item.product_name}</td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-[#5E6B63]">{item.sku}</td>
                              <td className="py-2.5 px-3 text-[#5E6B63]">{item.category}</td>
                              <td className="py-2.5 px-3 text-right font-bold tabular-nums text-[#173D32]">
                                {item.quantity} {item.unit}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-[#5E6B63]">{item.reorder_level}</td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-[#202521]">₹{item.price}</td>
                              <td className="py-2.5 px-3 text-center">
                                <Badge variant={item.is_low_stock ? 'error' : 'success'}>
                                  {item.is_low_stock ? 'Low Stock' : 'Optimal'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* 4. Sales Tab */}
                {activeTab === 'sales' && (
                  <div>
                    {detailData.sales.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#5E6B63]">No sales transactions recorded at this warehouse.</div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#F8F8F5] text-[#5E6B63] border-b border-[#E3E1DA]">
                            <th className="py-2.5 px-3 font-semibold">Invoice #</th>
                            <th className="py-2.5 px-3 font-semibold">Cashier / Staff</th>
                            <th className="py-2.5 px-3 font-semibold text-center">Items</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Total Amount</th>
                            <th className="py-2.5 px-3 font-semibold">Date &amp; Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E1DA]/60">
                          {detailData.sales.map((sale) => (
                            <tr key={sale.id} className="hover:bg-[#F8F8F5]">
                              <td className="py-2.5 px-3 font-mono font-semibold text-[#173D32]">{sale.sale_number}</td>
                              <td className="py-2.5 px-3 text-[#202521]">{sale.user_name}</td>
                              <td className="py-2.5 px-3 text-center tabular-nums text-[#5E6B63]">{sale.items_count}</td>
                              <td className="py-2.5 px-3 text-right font-bold tabular-nums text-[#202521]">
                                ₹{parseFloat(sale.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-[#5E6B63]">
                                {new Date(sale.created_at).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* 5. Ledger Tab */}
                {activeTab === 'ledger' && (
                  <div>
                    {detailData.ledger.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#5E6B63]">No stock movement ledger records found.</div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#F8F8F5] text-[#5E6B63] border-b border-[#E3E1DA]">
                            <th className="py-2.5 px-3 font-semibold">Type</th>
                            <th className="py-2.5 px-3 font-semibold">Product</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Change</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Balance After</th>
                            <th className="py-2.5 px-3 font-semibold">Reason / Reference</th>
                            <th className="py-2.5 px-3 font-semibold">By User</th>
                            <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E1DA]/60">
                          {detailData.ledger.map((entry) => (
                            <tr key={entry.id} className="hover:bg-[#F8F8F5]">
                              <td className="py-2.5 px-3">
                                <Badge variant="neutral">{entry.movement_type}</Badge>
                              </td>
                              <td className="py-2.5 px-3 text-[#202521] font-medium">
                                {entry.product_name}{' '}
                                <span className="text-[11px] font-mono text-[#5E6B63]">({entry.product_sku})</span>
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-bold tabular-nums ${
                                  entry.delta > 0 ? 'text-[#2F7D4F]' : 'text-[#C85A32]'
                                }`}
                              >
                                {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-[#202521] font-semibold">
                                {entry.balance_after ?? '—'}
                              </td>
                              <td className="py-2.5 px-3 text-[#5E6B63]">
                                <div>{entry.reason || '—'}</div>
                                {entry.reference && <div className="text-[10px] font-mono text-[#5E6B63]">{entry.reference}</div>}
                              </td>
                              <td className="py-2.5 px-3 text-[#5E6B63]">@{entry.user}</td>
                              <td className="py-2.5 px-3 text-[#5E6B63]">
                                {new Date(entry.created_at).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
