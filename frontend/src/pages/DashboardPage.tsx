import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import {
  StockLevel,
  Sale,
  StockMovement,
  PaginatedResponse,
  WarehouseFullDetail,
  StockTransfer,
  DashboardData,
} from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { StockIndicator } from '../components/ui/stock-indicator';
import { Badge } from '../components/ui/badge';
import { formatCurrency, formatNumber, formatDate } from '../lib/format';
import {
  AlertTriangle,
  TrendingUp,
  Boxes,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  MapPin,
  Phone,
  Mail,
  Users as UsersIcon,
  Truck,
  ArrowRight,
  IndianRupee,
  BadgePercent,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const { user, selectedWarehouseId } = useAuth();
  const isManager = user?.role === 'Warehouse Manager';

  // Time range & chart metric filter
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [chartMetric, setChartMetric] = useState<'both' | 'revenue' | 'profit'>('both');

  // Unified Dashboard API query
  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['dashboard-metrics', selectedWarehouseId, timeRange],
    queryFn: () => {
      const wh = selectedWarehouseId ? `&warehouse=${selectedWarehouseId}` : '';
      return apiRequest<DashboardData>(`dashboard/?range=${timeRange}${wh}`);
    },
  });

  // Query manager warehouse full details if Warehouse Manager
  const { data: myWarehouseData } = useQuery({
    queryKey: ['my-warehouse-detail'],
    queryFn: () => apiRequest<WarehouseFullDetail>('warehouses/my-warehouse/'),
    enabled: isManager,
  });

  // Query stock levels
  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ['stock', selectedWarehouseId],
    queryFn: () => {
      const q = selectedWarehouseId ? `?warehouse=${selectedWarehouseId}` : '';
      return apiRequest<PaginatedResponse<StockLevel>>(`stock/${q}`);
    },
  });

  // Query sales
  const { data: salesData } = useQuery({
    queryKey: ['sales', selectedWarehouseId],
    queryFn: () => {
      const q = selectedWarehouseId ? `?warehouse=${selectedWarehouseId}` : '';
      return apiRequest<PaginatedResponse<Sale>>(`sales/${q}`);
    },
  });

  // Query recent ledger movements
  const { data: ledgerData } = useQuery({
    queryKey: ['ledger-recent', selectedWarehouseId],
    queryFn: () => {
      const q = selectedWarehouseId ? `?warehouse=${selectedWarehouseId}` : '';
      return apiRequest<PaginatedResponse<StockMovement>>(`ledger/${q}`);
    },
    enabled: user?.role !== 'Staff', // Staff cannot view ledger
  });

  // Query incoming transfers in transit
  const { data: incomingTransfersData } = useQuery({
    queryKey: ['incoming-transfers-count', selectedWarehouseId],
    queryFn: () => {
      const q = selectedWarehouseId ? `&warehouse=${selectedWarehouseId}` : '';
      return apiRequest<PaginatedResponse<StockTransfer>>(`transfers/?direction=incoming&status=in_transit${q}`);
    },
    enabled: user?.role === 'Warehouse Manager' || (user?.role === 'Admin' && !!selectedWarehouseId),
  });

  // Query outstanding receivables
  const { data: receivablesData } = useQuery({
    queryKey: ['receivables-total', selectedWarehouseId],
    queryFn: () => {
      const q = selectedWarehouseId ? `?warehouse=${selectedWarehouseId}` : '';
      return apiRequest<{ total_receivables: string }>(`customers/receivables/${q}`);
    },
    enabled: user?.role === 'Admin' || user?.role === 'Warehouse Manager',
  });

  const stocks = stockData?.results || [];
  const sales = salesData?.results || [];
  const movements = ledgerData?.results || [];
  const incomingTransfersCount = incomingTransfersData?.count ?? incomingTransfersData?.results?.length ?? 0;

  // Derived metrics from unified Dashboard API
  const totalUnits = dashboardData?.kpis
    ? dashboardData.kpis.total_units
    : stocks.reduce((acc, curr) => acc + curr.quantity, 0);

  const lowStockCount = dashboardData?.kpis
    ? dashboardData.kpis.low_stock_count
    : stocks.filter((s) => s.quantity <= s.reorder_level).length;

  const totalSalesAmount = dashboardData?.kpis
    ? parseFloat(dashboardData.kpis.total_revenue)
    : sales.reduce((acc, curr) => acc + parseFloat(curr.net_total || curr.total_amount || '0'), 0);

  const grossProfit = dashboardData?.kpis
    ? parseFloat(dashboardData.kpis.gross_profit)
    : 0;

  const profitMarginPct = dashboardData?.kpis
    ? dashboardData.kpis.profit_margin_pct
    : 0;

  const unknownCostCount = dashboardData?.kpis
    ? dashboardData.kpis.unknown_cost_count
    : 0;

  const receivablesAmount = dashboardData?.kpis
    ? dashboardData.kpis.total_receivables
    : receivablesData?.total_receivables || '0.00';

  const dailyChartData = dashboardData?.daily_chart || [];

  return (
    <div className="space-y-6">
      {/* Page Title & Context */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202521]">
            {user?.role === 'Admin'
              ? 'Multi-Warehouse Overview'
              : `${user?.profile?.warehouse?.name || 'Warehouse'} Dashboard`}
          </h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            Real-time stock indicators, movements, and billing activity
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isManager && (
            <Link
              to="/users"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white border border-[#E3E1DA] text-[#202521] text-xs font-semibold hover:bg-[#F8F8F5] transition-colors"
            >
              <UsersIcon className="w-3.5 h-3.5 text-[#173D32]" /> My Staff
            </Link>
          )}
          <Link
            to="/sales"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[#173D32] text-white text-sm font-medium hover:bg-[#122e26] transition-colors shadow-xs"
          >
            New Sale Entry
          </Link>
        </div>
      </div>

      {/* Read-only Warehouse Contact Card for Warehouse Manager */}
      {isManager && myWarehouseData && (
        <Card className="bg-[#F8F8F5] border-[#E3E1DA]">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#173D32]" />
                <span className="font-bold text-sm text-[#202521]">{myWarehouseData.warehouse.name}</span>
                <span className="font-mono text-xs font-bold text-[#173D32] bg-[#E6F2EA] px-2 py-0.5 rounded">
                  {myWarehouseData.warehouse.code}
                </span>
                <Badge variant={myWarehouseData.warehouse.is_active ? 'success' : 'error'}>
                  {myWarehouseData.warehouse.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5E6B63] pt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#5E6B63]" />
                  {myWarehouseData.warehouse.address_line1}, {myWarehouseData.warehouse.city}, {myWarehouseData.warehouse.state} — {myWarehouseData.warehouse.pincode}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-[#5E6B63]" />
                  {myWarehouseData.warehouse.phone}
                </span>
                {myWarehouseData.warehouse.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-[#5E6B63]" />
                    {myWarehouseData.warehouse.email}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#E3E1DA]/80">
              <div className="text-right text-xs">
                <div className="text-[11px] text-[#5E6B63]">Active Facility Staff</div>
                <div className="font-bold text-[#173D32]">{myWarehouseData.staff.length} team members</div>
              </div>
              <div className="text-right text-xs pl-3 border-l border-[#E3E1DA]">
                <div className="text-[11px] text-[#5E6B63]">Sales Today</div>
                <div className="font-bold text-[#2F7D4F] tabular-nums">
                  ₹{parseFloat(myWarehouseData.summary.sales_today_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Incoming Transfers In Transit Notification */}
      {incomingTransfersCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <Truck className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                {incomingTransfersCount} Incoming Stock Consignment{incomingTransfersCount > 1 ? 's' : ''} In Transit
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Consignments dispatched to your warehouse require receipt verification and reconciliation into local stock.
              </p>
            </div>
          </div>
          <Link
            to="/transfers"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-800 text-white text-xs font-semibold hover:bg-amber-900 transition-colors shrink-0 shadow-xs"
          >
            Review &amp; Receive <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-[#173D32]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5E6B63]">
                Total Stock Units
              </p>
              <h3 className="text-2xl font-bold text-[#202521] mt-1 tabular-nums">
                {formatNumber(totalUnits)}
              </h3>
              <p className="text-xs text-[#5E6B63] mt-0.5">Across {stocks.length} catalog items</p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-[#E6F2EA] flex items-center justify-center text-[#173D32]">
              <Boxes className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#9A5B00]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5E6B63]">
                Low Stock Alerts
              </p>
              <h3 className="text-2xl font-bold text-[#9A5B00] mt-1 tabular-nums">
                {lowStockCount}
              </h3>
              <p className="text-xs text-[#5E6B63] mt-0.5">Requires replenishment</p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-[#FBF0DC] flex items-center justify-center text-[#9A5B00]">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#C77B55]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5E6B63]">
                Net Recorded Revenue
              </p>
              <h3 className="text-2xl font-bold text-[#202521] mt-1 tabular-nums">
                {formatCurrency(totalSalesAmount)}
              </h3>
              <p className="text-xs text-[#5E6B63] mt-0.5">Net of discounts &amp; returns</p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-[#FBE9E7] flex items-center justify-center text-[#C77B55]">
              <TrendingUp className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Profit KPI Card */}
        <Card className="border-l-4 border-l-[#2F7D4F]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#5E6B63]">
                  Gross Profit
                </p>
                {profitMarginPct > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      profitMarginPct >= 20
                        ? 'bg-emerald-100 text-emerald-800'
                        : profitMarginPct > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {profitMarginPct.toFixed(1)}% margin
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-bold mt-1 tabular-nums text-emerald-800">
                {formatCurrency(grossProfit)}
              </h3>
              <p className="text-xs text-[#5E6B63] mt-0.5">
                {unknownCostCount > 0 ? (
                  <span className="text-amber-700 font-medium">
                    {unknownCostCount} sales excluded: cost unknown
                  </span>
                ) : (
                  'All items cost accounted'
                )}
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-[#E6F2EA] flex items-center justify-center text-[#2F7D4F]">
              <BadgePercent className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#B3261E]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5E6B63]">
                Receivables (Udhaar)
              </p>
              <h3 className="text-2xl font-bold text-[#B3261E] mt-1 tabular-nums">
                {formatCurrency(receivablesAmount)}
              </h3>
              <Link to="/customers" className="text-xs text-[#B3261E] hover:underline mt-0.5 block">
                Manage credit &rarr;
              </Link>
            </div>
            <div className="w-11 h-11 rounded-lg bg-[#FBE9E7] flex items-center justify-center text-[#B3261E]">
              <IndianRupee className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue & Profit Analytics Chart */}
      <Card className="bg-white">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#E3E1DA]">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#173D32]" />
              <span>Revenue &amp; Profit Trends</span>
            </CardTitle>
            <p className="text-xs text-[#5E6B63] mt-0.5">
              Historical performance reflecting net sales and cost of goods sold
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Toggle */}
            <div className="inline-flex rounded-md border border-[#E3E1DA] p-0.5 bg-[#F8F8F5] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setChartMetric('both')}
                className={`px-2.5 py-1 rounded-sm transition-all cursor-pointer ${
                  chartMetric === 'both' ? 'bg-white shadow-xs text-[#173D32]' : 'text-[#5E6B63]'
                }`}
              >
                Both
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('revenue')}
                className={`px-2.5 py-1 rounded-sm transition-all cursor-pointer ${
                  chartMetric === 'revenue' ? 'bg-white shadow-xs text-[#173D32]' : 'text-[#5E6B63]'
                }`}
              >
                Revenue
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('profit')}
                className={`px-2.5 py-1 rounded-sm transition-all cursor-pointer ${
                  chartMetric === 'profit' ? 'bg-white shadow-xs text-emerald-800' : 'text-[#5E6B63]'
                }`}
              >
                Profit
              </button>
            </div>

            {/* Time Range Toggle */}
            <div className="inline-flex rounded-md border border-[#E3E1DA] p-0.5 bg-[#F8F8F5] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTimeRange('7d')}
                className={`px-2.5 py-1 rounded-sm transition-all cursor-pointer ${
                  timeRange === '7d' ? 'bg-white shadow-xs text-[#173D32]' : 'text-[#5E6B63]'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('30d')}
                className={`px-2.5 py-1 rounded-sm transition-all cursor-pointer ${
                  timeRange === '30d' ? 'bg-white shadow-xs text-[#173D32]' : 'text-[#5E6B63]'
                }`}
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('90d')}
                className={`px-2.5 py-1 rounded-sm transition-all cursor-pointer ${
                  timeRange === '90d' ? 'bg-white shadow-xs text-[#173D32]' : 'text-[#5E6B63]'
                }`}
              >
                90 Days
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <div className="h-72 w-full">
            {isDashboardLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-[#5E6B63]">
                Loading trend analytics...
              </div>
            ) : dailyChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[#5E6B63]">
                No recorded sales in this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#173D32" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#173D32" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2F7D4F" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2F7D4F" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E1DA" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    stroke="#5E6B63"
                    fontSize={11}
                    tickFormatter={(str) => {
                      const d = new Date(str);
                      return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    stroke="#5E6B63"
                    fontSize={11}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E3E1DA', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value: any, name: any) => [
                      formatCurrency(Number(value) || 0),
                      name === 'revenue' ? 'Net Revenue' : 'Gross Profit',
                    ]}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                  />
                  {(chartMetric === 'both' || chartMetric === 'revenue') && (
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#173D32"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                    />
                  )}
                  {(chartMetric === 'both' || chartMetric === 'profit') && (
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="Gross Profit"
                      stroke="#2F7D4F"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorProfit)"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {unknownCostCount > 0 && (
            <div className="mt-3 pt-3 border-t border-[#E3E1DA]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#5E6B63]">
              <span className="flex items-center gap-1.5 text-amber-800">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  <strong>{unknownCostCount} sales excluded: cost unknown</strong> (items sold without recorded cost price)
                </span>
              </span>
              <Link to="/reports" className="text-xs font-semibold text-[#173D32] hover:underline">
                View Profit &amp; Margin Report &rarr;
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content Grid: Stock Indicators & Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Stock Levels & Signature Indicators */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Catalog Inventory Status</CardTitle>
                <p className="text-xs text-[#5E6B63] mt-0.5">
                  Items monitored with live threshold indicators
                </p>
              </div>
              <Link
                to="/inventory"
                className="text-xs font-semibold text-[#173D32] hover:underline flex items-center gap-1"
              >
                View all inventory <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </CardHeader>
            <div className="overflow-x-auto">
              {stockLoading ? (
                <div className="p-8 text-center text-sm text-[#5E6B63]">Loading inventory...</div>
              ) : stocks.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#5E6B63]">No stock records found.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                      <th className="py-2.5 px-4 font-semibold">SKU &amp; Product</th>
                      <th className="py-2.5 px-4 font-semibold">Warehouse</th>
                      <th className="py-2.5 px-4 font-semibold">Price</th>
                      <th className="py-2.5 px-4 font-semibold min-w-[160px]">Stock Indicator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]/60">
                    {stocks.slice(0, 6).map((item) => (
                      <tr key={item.id} className="hover:bg-[#F8F8F5]/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#202521]">{item.product.name}</div>
                          <div className="text-[11px] text-[#5E6B63] font-mono">{item.product.sku}</div>
                        </td>
                        <td className="py-3 px-4 text-[#5E6B63]">
                          <span className="font-medium">{item.warehouse_code}</span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#202521] tabular-nums">
                          {formatCurrency(item.product.price)}
                        </td>
                        <td className="py-3 px-4">
                          <StockIndicator
                            quantity={item.quantity}
                            reorderLevel={item.reorder_level}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>

        {/* Right 1 Col: Recent Sales or Ledger Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Sales</CardTitle>
              <Link
                to="/sales"
                className="text-xs font-semibold text-[#173D32] hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {sales.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#5E6B63]">No recent sales.</div>
              ) : (
                <div className="divide-y divide-[#E3E1DA]/60">
                  {sales.slice(0, 5).map((sale) => (
                    <div key={sale.id} className="p-3.5 flex items-center justify-between hover:bg-[#F8F8F5] transition-colors">
                      <div>
                        <div className="text-xs font-semibold text-[#202521] font-mono">
                          {sale.sale_number}
                        </div>
                        <div className="text-[11px] text-[#5E6B63]">
                          {sale.cashier_name} • {formatDate(sale.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-[#173D32] tabular-nums">
                          {formatCurrency(sale.total_amount)}
                        </div>
                        <div className="text-[10px] text-[#5E6B63]">
                          {sale.lines.length} items
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {user?.role !== 'Staff' && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Stock Movements</CardTitle>
                <Link
                  to="/ledger"
                  className="text-xs font-semibold text-[#173D32] hover:underline"
                >
                  Ledger
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {movements.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#5E6B63]">No movement logs.</div>
                ) : (
                  <div className="divide-y divide-[#E3E1DA]/60">
                    {movements.slice(0, 4).map((m) => (
                      <div key={m.id} className="p-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                              m.delta > 0
                                ? 'bg-[#E6F2EA] text-[#2F7D4F]'
                                : 'bg-[#FBE9E7] text-[#B3261E]'
                            }`}
                          >
                            {m.delta > 0 ? (
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-[#202521]">{m.product_sku}</div>
                            <div className="text-[10px] text-[#5E6B63]">{m.movement_type}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span
                            className={`font-bold tabular-nums ${
                              m.delta > 0 ? 'text-[#2F7D4F]' : 'text-[#B3261E]'
                            }`}
                          >
                            {m.delta > 0 ? `+${m.delta}` : m.delta}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
