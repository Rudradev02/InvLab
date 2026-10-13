import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { StockLevel, Sale, StockMovement, PaginatedResponse } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { StockIndicator } from '../components/ui/stock-indicator';
import { formatCurrency, formatNumber, formatDate } from '../lib/format';
import { Package, AlertTriangle, TrendingUp, Boxes, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const { user, selectedWarehouseId } = useAuth();

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

  const stocks = stockData?.results || [];
  const sales = salesData?.results || [];
  const movements = ledgerData?.results || [];

  // KPIs
  const totalUnits = stocks.reduce((acc, curr) => acc + curr.quantity, 0);
  const lowStockItems = stocks.filter((s) => s.quantity <= s.reorder_level);
  const totalSalesAmount = sales.reduce((acc, curr) => acc + parseFloat(curr.total_amount || '0'), 0);

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
          <Link
            to="/sales"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[#173D32] text-white text-sm font-medium hover:bg-[#122e26] transition-colors shadow-xs"
          >
            New Sale Entry
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                {lowStockItems.length}
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
                Total Recorded Sales
              </p>
              <h3 className="text-2xl font-bold text-[#202521] mt-1 tabular-nums">
                {formatCurrency(totalSalesAmount)}
              </h3>
              <p className="text-xs text-[#5E6B63] mt-0.5">{sales.length} transactions processed</p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-[#FBE9E7] flex items-center justify-center text-[#C77B55]">
              <TrendingUp className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#1F5F8B]">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5E6B63]">
                Catalog Products
              </p>
              <h3 className="text-2xl font-bold text-[#202521] mt-1 tabular-nums">
                {stocks.length}
              </h3>
              <p className="text-xs text-[#5E6B63] mt-0.5">Active SKU items</p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-[#E5EFF6] flex items-center justify-center text-[#1F5F8B]">
              <Package className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

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
