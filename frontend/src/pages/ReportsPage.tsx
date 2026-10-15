import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { Category, PaginatedResponse, ReportData, ReportMeta, Warehouse } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { formatCurrency } from '../lib/format';
import {
  BarChart3,
  TrendingUp,
  Package,
  AlertTriangle,
  Download,
  Calendar,
  Layers,
  Search,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  CreditCard,
  Banknote,
  QrCode,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';

type DatePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export const ReportsPage: React.FC = () => {
  const { user, selectedWarehouseId } = useAuth();
  const isAdmin = user?.role === 'Admin';

  // Active Report Tab
  const [activeReportId, setActiveReportId] = useState<string>('sales_summary');

  // Filter States
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [filterWarehouseId, setFilterWarehouseId] = useState<string>(
    selectedWarehouseId ? selectedWarehouseId.toString() : ''
  );
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);

  // Compute actual dateFrom and dateTo strings based on preset
  const { dateFrom, dateTo } = useMemo(() => {
    const today = new Date();
    const toStr = today.toISOString().split('T')[0];

    if (datePreset === 'today') {
      return { dateFrom: toStr, dateTo: toStr };
    }
    if (datePreset === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { dateFrom: d.toISOString().split('T')[0], dateTo: toStr };
    }
    if (datePreset === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { dateFrom: d.toISOString().split('T')[0], dateTo: toStr };
    }
    if (datePreset === '90d') {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return { dateFrom: d.toISOString().split('T')[0], dateTo: toStr };
    }
    // Custom
    return {
      dateFrom: customDateFrom || toStr,
      dateTo: customDateTo || toStr,
    };
  }, [datePreset, customDateFrom, customDateTo]);

  // Fetch Report List metadata
  const { data: reportsList } = useQuery<ReportMeta[]>({
    queryKey: ['reports-list'],
    queryFn: () => apiRequest<ReportMeta[]>('reports/'),
  });

  // Fetch Categories for filter
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest<PaginatedResponse<Category>>('categories/?page_size=100'),
  });

  // Fetch Warehouses for Admin filter
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiRequest<Warehouse[]>('warehouses/'),
    enabled: isAdmin,
  });

  const activeReportMeta = reportsList?.find((r) => r.id === activeReportId);

  // Fetch Report Data
  const {
    data: reportData,
    isLoading: reportLoading,
    isFetching: reportFetching,
    refetch: refetchReport,
  } = useQuery<ReportData>({
    queryKey: [
      'report-detail',
      activeReportId,
      datePreset,
      dateFrom,
      dateTo,
      selectedCategoryId,
      filterWarehouseId,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeReportMeta?.supports_date_filter) {
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
      }
      if (activeReportMeta?.supports_warehouse_filter && filterWarehouseId) {
        params.append('warehouse', filterWarehouseId);
      }
      if (activeReportMeta?.supports_category_filter && selectedCategoryId) {
        params.append('category', selectedCategoryId);
      }
      params.append('format', 'json');
      return apiRequest<ReportData>(`reports/${activeReportId}/?${params.toString()}`);
    },
    enabled: !!activeReportId,
  });

  const categories = categoriesData?.results || [];
  const warehouses = warehousesData || [];

  // Filter rows locally by search input
  const filteredRows = (reportData?.rows || []).filter((row) => {
    if (!searchFilter.trim()) return true;
    const query = searchFilter.toLowerCase();
    return Object.values(row).some((val) =>
      val !== null && val !== undefined && String(val).toLowerCase().includes(query)
    );
  });

  // Handle Export Downloads
  const handleExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    try {
      setIsExporting(true);
      setIsExportMenuOpen(false);

      const params = new URLSearchParams();
      if (activeReportMeta?.supports_date_filter) {
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
      }
      if (activeReportMeta?.supports_warehouse_filter && filterWarehouseId) {
        params.append('warehouse', filterWarehouseId);
      }
      if (activeReportMeta?.supports_category_filter && selectedCategoryId) {
        params.append('category', selectedCategoryId);
      }
      params.append('format', format);

      const url = `/api/v1/reports/${activeReportId}/?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || 'Failed to export report');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;

      const disposition = res.headers.get('Content-Disposition');
      let filename = `${activeReportId}_report.${format}`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast.success(`Exported ${activeReportMeta?.name || 'report'} as ${format.toUpperCase()}`);
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const getReportTabIcon = (id: string) => {
    switch (id) {
      case 'sales_summary':
        return <TrendingUp className="w-4 h-4" />;
      case 'sales_by_product':
        return <Layers className="w-4 h-4" />;
      case 'stock_list':
        return <Package className="w-4 h-4" />;
      case 'low_stock':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <BarChart3 className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#173D32]" />
            <h1 className="text-2xl font-bold tracking-tight text-[#202521]">Reports &amp; Analytics</h1>
          </div>
          <p className="text-sm text-[#5E6B63] mt-1">
            Real-time sales performance, category breakdowns, stock valuation, and multi-format exports
          </p>
        </div>

        {/* Export Dropdown Menu */}
        <div className="relative">
          <Button
            type="button"
            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
            isLoading={isExporting}
            className="gap-2 bg-[#173D32] text-white hover:bg-[#122e26]"
          >
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </Button>

          {isExportMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black/5 border border-[#E3E1DA] z-50 py-1">
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="w-full text-left px-4 py-2.5 text-xs text-[#202521] hover:bg-[#F8F9F8] flex items-center gap-2.5 transition-colors"
              >
                <FileText className="w-4 h-4 text-emerald-700" />
                <div>
                  <div className="font-semibold">CSV Document (.csv)</div>
                  <div className="text-[10px] text-[#5E6B63]">Streamed format with formula protection</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleExport('xlsx')}
                className="w-full text-left px-4 py-2.5 text-xs text-[#202521] hover:bg-[#F8F9F8] flex items-center gap-2.5 transition-colors border-t border-[#E3E1DA]/60"
              >
                <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                <div>
                  <div className="font-semibold">Excel Workbook (.xlsx)</div>
                  <div className="text-[10px] text-[#5E6B63]">Styled sheet with column auto-width</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleExport('pdf')}
                className="w-full text-left px-4 py-2.5 text-xs text-[#202521] hover:bg-[#F8F9F8] flex items-center gap-2.5 transition-colors border-t border-[#E3E1DA]/60"
              >
                <Download className="w-4 h-4 text-red-700" />
                <div>
                  <div className="font-semibold">PDF Document (.pdf)</div>
                  <div className="text-[10px] text-[#5E6B63]">Formatted printable executive summary</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="flex border-b border-[#E3E1DA] overflow-x-auto gap-2">
        {(reportsList || [
          { id: 'sales_summary', name: 'Sales Summary' },
          { id: 'sales_by_product', name: 'Sales by Product & Category' },
          { id: 'stock_list', name: 'Stock Valuation' },
          { id: 'low_stock', name: 'Low Stock Alerts' },
        ]).map((rep) => {
          const isActive = activeReportId === rep.id;
          return (
            <button
              key={rep.id}
              onClick={() => {
                setActiveReportId(rep.id);
                setSearchFilter('');
              }}
              className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-[#173D32] text-[#173D32] bg-[#F8F9F8]/60'
                  : 'border-transparent text-[#5E6B63] hover:text-[#202521] hover:border-gray-300'
              }`}
            >
              {getReportTabIcon(rep.id)}
              <span>{rep.name}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* Date Preset Selection (if applicable) */}
            {activeReportMeta?.supports_date_filter && (
              <div className="md:col-span-5 space-y-1.5">
                <label className="text-xs font-semibold text-[#202521] uppercase flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#173D32]" /> Date Range
                </label>
                <div className="flex items-center gap-1 bg-[#F1F1EC] p-1 rounded-md">
                  {(['today', '7d', '30d', '90d', 'custom'] as DatePreset[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDatePreset(p)}
                      className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                        datePreset === p
                          ? 'bg-white text-[#173D32] font-semibold shadow-xs'
                          : 'text-[#5E6B63] hover:text-[#202521]'
                      }`}
                    >
                      {p === 'today'
                        ? 'Today'
                        : p === '7d'
                        ? '7 Days'
                        : p === '30d'
                        ? '30 Days'
                        : p === '90d'
                        ? '90 Days'
                        : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Date Inputs */}
            {activeReportMeta?.supports_date_filter && datePreset === 'custom' && (
              <div className="md:col-span-4 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#5E6B63]">From</label>
                  <Input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => setCustomDateFrom(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#5E6B63]">To</label>
                  <Input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => setCustomDateTo(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Category Filter (if applicable) */}
            {activeReportMeta?.supports_category_filter && (
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-semibold text-[#202521] uppercase flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-[#173D32]" /> Category
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-[#E3E1DA] bg-white text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Warehouse Filter (Admin only) */}
            {isAdmin && activeReportMeta?.supports_warehouse_filter && (
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-semibold text-[#202521] uppercase flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-[#173D32]" /> Warehouse
                </label>
                <select
                  value={filterWarehouseId}
                  onChange={(e) => setFilterWarehouseId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-[#E3E1DA] bg-white text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                >
                  <option value="">All Warehouses</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Refresh Button */}
            <div className="md:col-span-1">
              <Button
                variant="outline"
                size="sm"
                title="Refresh Report Data"
                onClick={() => refetchReport()}
                className="h-9 w-full"
                disabled={reportFetching}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reportFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPI Cards */}
      {reportData?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Object.entries(reportData.summary).map(([key, value]) => {
            const isCurrency =
              typeof value === 'number' &&
              (key.includes('sales') ||
                key.includes('revenue') ||
                key.includes('discounts') ||
                key.includes('refunds') ||
                key.includes('collected') ||
                key.includes('udhaar') ||
                key.includes('valuation') ||
                key.includes('cost') ||
                key.includes('capital'));

            const formattedLabel = key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

            return (
              <Card key={key} className="bg-white">
                <CardContent className="p-3">
                  <div className="text-[11px] font-semibold text-[#5E6B63] truncate">
                    {formattedLabel}
                  </div>
                  <div className="text-base font-extrabold text-[#173D32] mt-1 tabular-nums truncate">
                    {isCurrency ? formatCurrency(value as number) : String(value)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Payment Method Breakdown Bar (if Sales Summary) */}
      {reportData?.payment_methods_breakdown && (
        <Card className="bg-[#F8F9F8] border border-[#E3E1DA]">
          <CardContent className="p-3 flex flex-wrap items-center justify-between gap-4 text-xs">
            <span className="font-bold text-[#202521] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              Payment Inflows:
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-[#5E6B63]">Cash:</span>
                <span className="font-bold text-[#173D32] tabular-nums">
                  {formatCurrency(reportData.payment_methods_breakdown.cash?.amount || 0)}
                </span>
                <span className="text-[10px] text-[#5E6B63]">
                  ({reportData.payment_methods_breakdown.cash?.count || 0})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-blue-700" />
                <span className="text-[#5E6B63]">UPI:</span>
                <span className="font-bold text-blue-800 tabular-nums">
                  {formatCurrency(reportData.payment_methods_breakdown.upi?.amount || 0)}
                </span>
                <span className="text-[10px] text-[#5E6B63]">
                  ({reportData.payment_methods_breakdown.upi?.count || 0})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-purple-700" />
                <span className="text-[#5E6B63]">Card:</span>
                <span className="font-bold text-purple-800 tabular-nums">
                  {formatCurrency(reportData.payment_methods_breakdown.card?.amount || 0)}
                </span>
                <span className="text-[10px] text-[#5E6B63]">
                  ({reportData.payment_methods_breakdown.card?.count || 0})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-amber-700" />
                <span className="text-[#5E6B63]">Udhaar (Credit):</span>
                <span className="font-bold text-amber-800 tabular-nums">
                  {formatCurrency(reportData.payment_methods_breakdown.credit?.amount || 0)}
                </span>
                <span className="text-[10px] text-[#5E6B63]">
                  ({reportData.payment_methods_breakdown.credit?.count || 0})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Results Data Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base">{reportData?.name || 'Report Results'}</CardTitle>
            <div className="text-xs text-[#5E6B63] mt-0.5">
              Showing {filteredRows.length} records
              {reportData?.filters_applied?.date_from && (
                <span>
                  {' '}
                  • Period: {reportData.filters_applied.date_from} to{' '}
                  {reportData.filters_applied.date_to}
                </span>
              )}
            </div>
          </div>

          {/* Quick Table Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#5E6B63] absolute left-3 top-2.5 pointer-events-none" />
            <Input
              placeholder="Search in table..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-8 pl-8 text-xs bg-white"
            />
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          {reportLoading ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">Loading report data...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">
              No records found matching the applied criteria.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                  {(reportData?.columns || []).map((col) => (
                    <th
                      key={col.key}
                      className={`py-2.5 px-3 font-semibold ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1DA]/60">
                {filteredRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#F8F9F8] transition-colors">
                    {(reportData?.columns || []).map((col) => {
                      const val = row[col.key];
                      const isCurr = col.is_currency && typeof val === 'number';

                      return (
                        <td
                          key={col.key}
                          className={`py-2.5 px-3 tabular-nums ${
                            col.align === 'right'
                              ? 'text-right'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          }`}
                        >
                          {col.key === 'status' || col.key === 'urgency' ? (
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                val === 'CRITICAL' || val === 'Low Stock'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : val === 'WARNING'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {val}
                            </span>
                          ) : isCurr ? (
                            <span className="font-medium text-[#202521]">
                              {formatCurrency(val as number)}
                            </span>
                          ) : (
                            String(val !== null && val !== undefined ? val : '-')
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
};
