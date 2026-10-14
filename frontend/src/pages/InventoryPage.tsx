import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { StockLevel, Product, StockMovement, PaginatedResponse } from '../types';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { StockIndicator } from '../components/ui/stock-indicator';
import { formatCurrency, formatDate } from '../lib/format';
import {
  SlidersHorizontal,
  Search,
  ArrowDownToLine,
  RefreshCw,
  History,
  FileSpreadsheet,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';

export const InventoryPage: React.FC = () => {
  const { selectedWarehouseId } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out'>('all');

  // Modals state
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedStockLevel, setSelectedStockLevel] = useState<StockLevel | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'ledger'>('overview');

  // Forms state
  const [receiveForm, setReceiveForm] = useState({ product_id: '', quantity: 10, reference: '' });
  const [adjustForm, setAdjustForm] = useState({ product_id: '', delta: 0, reason: '' });

  // Query stock levels
  const { data: stockData, isLoading, refetch } = useQuery({
    queryKey: ['stock-inventory', selectedWarehouseId, statusFilter],
    queryFn: () => {
      let q = selectedWarehouseId ? `?warehouse=${selectedWarehouseId}` : '?';
      if (statusFilter === 'low') q += '&status=low';
      if (statusFilter === 'out') q += '&status=out';
      return apiRequest<PaginatedResponse<StockLevel>>(`stock/${q}`);
    },
  });

  // Query products for dropdowns
  const { data: productsData } = useQuery({
    queryKey: ['catalog-products'],
    queryFn: () => apiRequest<PaginatedResponse<Product>>('products/'),
  });

  // Query product ledger when modal is opened on ledger tab
  const { data: productLedgerData, isLoading: isLoadingLedger } = useQuery({
    queryKey: ['product-ledger', selectedStockLevel?.product.id],
    queryFn: () =>
      apiRequest<PaginatedResponse<StockMovement>>(
        `ledger/product/${selectedStockLevel?.product.id}/`
      ),
    enabled: !!selectedStockLevel && detailTab === 'ledger',
  });

  const stocks = stockData?.results || [];
  const products = productsData?.results || [];
  const productMovements = productLedgerData?.results || [];

  // Filtered by local search
  const filteredStocks = stocks.filter(
    (item) =>
      item.product.name.toLowerCase().includes(search.toLowerCase()) ||
      item.product.sku.toLowerCase().includes(search.toLowerCase())
  );

  // Receive stock mutation
  const receiveMutation = useMutation({
    mutationFn: (data: typeof receiveForm) =>
      apiRequest('stock/receive/', {
        method: 'POST',
        body: JSON.stringify({
          product_id: Number(data.product_id),
          quantity: Number(data.quantity),
          reference: data.reference,
          warehouse_id: selectedWarehouseId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
      queryClient.invalidateQueries({ queryKey: ['product-ledger'] });
      toast.success('Stock received and movement logged successfully');
      setIsReceiveOpen(false);
      setReceiveForm({ product_id: '', quantity: 10, reference: '' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to receive stock';
      toast.error(msg);
    },
  });

  // Adjust stock mutation
  const adjustMutation = useMutation({
    mutationFn: (data: typeof adjustForm) =>
      apiRequest('stock/adjust/', {
        method: 'POST',
        body: JSON.stringify({
          product_id: Number(data.product_id),
          delta: Number(data.delta),
          reason: data.reason,
          warehouse_id: selectedWarehouseId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
      queryClient.invalidateQueries({ queryKey: ['product-ledger'] });
      toast.success('Stock adjusted and recorded in ledger');
      setIsAdjustOpen(false);
      setAdjustForm({ product_id: '', delta: 0, reason: '' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to adjust stock';
      toast.error(msg);
    },
  });

  const getMovementBadgeVariant = (type: string) => {
    switch (type) {
      case 'receive':
      case 'purchase':
      case 'transfer_in':
        return 'success';
      case 'sale':
      case 'transfer_out':
        return 'info';
      case 'adjustment':
        return 'warning';
      case 'initial':
      case 'return':
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202521]">Stock &amp; Inventory</h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            Real-time multi-warehouse stock levels, reorder alerts and ledger traceability
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Receive Stock Modal */}
          <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 cursor-pointer">
                <ArrowDownToLine className="w-4 h-4 text-[#173D32]" /> Receive Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Receive Incoming Stock</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  receiveMutation.mutate(receiveForm);
                }}
                className="space-y-4 mt-3"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                    Select Product
                  </label>
                  <select
                    required
                    aria-label="Select product"
                    value={receiveForm.product_id}
                    onChange={(e) => setReceiveForm({ ...receiveForm, product_id: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                  >
                    <option value="">-- Choose Catalog SKU --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Quantity Received"
                  type="number"
                  min="1"
                  required
                  value={receiveForm.quantity}
                  onChange={(e) => setReceiveForm({ ...receiveForm, quantity: Number(e.target.value) })}
                  helperText="Units will be atomically added to this warehouse's stock level."
                />

                <Input
                  label="PO / Invoice Reference"
                  placeholder="e.g. PO-2026-0891"
                  value={receiveForm.reference}
                  onChange={(e) => setReceiveForm({ ...receiveForm, reference: e.target.value })}
                  helperText="Audited in the immutable stock ledger."
                />

                <Button type="submit" className="w-full" isLoading={receiveMutation.isPending}>
                  Confirm &amp; Log Receipt
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Adjust Stock Modal */}
          <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
            <DialogTrigger asChild>
              <Button variant="primary" className="gap-2 cursor-pointer">
                <SlidersHorizontal className="w-4 h-4" /> Adjust Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Adjust Stock Level</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  adjustMutation.mutate(adjustForm);
                }}
                className="space-y-4 mt-3"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                    Select Product
                  </label>
                  <select
                    required
                    aria-label="Select product"
                    value={adjustForm.product_id}
                    onChange={(e) => setAdjustForm({ ...adjustForm, product_id: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                  >
                    <option value="">-- Choose Catalog SKU --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Delta (+ to add, - to deduct)"
                  type="number"
                  required
                  value={adjustForm.delta}
                  onChange={(e) => setAdjustForm({ ...adjustForm, delta: Number(e.target.value) })}
                  helperText="Use negative value for damages or write-offs. Server prevents stock from going below 0."
                />

                <Input
                  label="Reason for Adjustment"
                  required
                  placeholder="e.g. Cycle count variance, damage found"
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                />

                <Button type="submit" className="w-full" isLoading={adjustMutation.isPending}>
                  Apply Atomic Adjustment
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-[#E3E1DA]">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#5E6B63] absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search SKU or product name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs bg-[#F8F8F5] border border-[#E3E1DA] rounded-md text-[#202521] outline-none focus:ring-2 focus:ring-[#173D32]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="inline-flex rounded-md border border-[#E3E1DA] p-0.5 bg-[#F8F8F5]">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-sm transition-all cursor-pointer ${
                statusFilter === 'all' ? 'bg-white shadow-xs text-[#173D32]' : 'text-[#5E6B63]'
              }`}
            >
              All Stock
            </button>
            <button
              onClick={() => setStatusFilter('low')}
              className={`px-3 py-1 text-xs font-semibold rounded-sm transition-all cursor-pointer ${
                statusFilter === 'low' ? 'bg-white shadow-xs text-[#9A5B00]' : 'text-[#5E6B63]'
              }`}
            >
              Low Stock
            </button>
            <button
              onClick={() => setStatusFilter('out')}
              className={`px-3 py-1 text-xs font-semibold rounded-sm transition-all cursor-pointer ${
                statusFilter === 'out' ? 'bg-white shadow-xs text-[#B3261E]' : 'text-[#5E6B63]'
              }`}
            >
              Out of Stock
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="text-[#5E6B63]"
            title="Refresh inventory"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Stock Table */}
      <Card>
        <CardHeader className="py-3 px-5">
          <CardTitle className="text-sm">Warehouse Stock Levels</CardTitle>
          <span className="text-xs text-[#5E6B63] tabular-nums font-medium">
            Showing {filteredStocks.length} records (click any row to view product details &amp; ledger)
          </span>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">Loading stock levels...</div>
          ) : filteredStocks.length === 0 ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">
              No inventory records matching your query.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                  <th className="py-3 px-5 font-semibold">SKU</th>
                  <th className="py-3 px-5 font-semibold">Product Name</th>
                  <th className="py-3 px-5 font-semibold">Warehouse</th>
                  <th className="py-3 px-5 font-semibold">Unit Price</th>
                  <th className="py-3 px-5 font-semibold">Reorder Level</th>
                  <th className="py-3 px-5 font-semibold min-w-[180px]">Stock Indicator</th>
                  <th className="py-3 px-5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1DA]/60">
                {filteredStocks.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => {
                      setSelectedStockLevel(item);
                      setDetailTab('overview');
                    }}
                    className="hover:bg-[#F8F8F5]/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-5 font-mono font-semibold text-[#173D32]">
                      {item.product.sku}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-[#202521]">
                      {item.product.name}
                    </td>
                    <td className="py-3.5 px-5 text-[#5E6B63]">
                      <span className="px-2 py-0.5 rounded bg-[#F1F1EC] text-[#202521] font-semibold text-[11px]">
                        {item.warehouse_code}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-[#202521] tabular-nums">
                      {formatCurrency(item.product.price)}
                    </td>
                    <td className="py-3.5 px-5 text-[#5E6B63] tabular-nums font-medium">
                      {item.reorder_level} units
                    </td>
                    <td className="py-3.5 px-5">
                      <StockIndicator
                        quantity={item.quantity}
                        reorderLevel={item.reorder_level}
                      />
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStockLevel(item);
                          setDetailTab('ledger');
                        }}
                        className="text-xs text-[#173D32] hover:text-[#173D32] gap-1.5"
                      >
                        <History className="w-3.5 h-3.5" /> Ledger
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Product Detail Dialog with Ledger Tab */}
      <Dialog
        open={!!selectedStockLevel}
        onOpenChange={(open) => !open && setSelectedStockLevel(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedStockLevel && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-lg">
                      {selectedStockLevel.product.name}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs text-[#173D32] bg-[#F1F1EC] px-2 py-0.5 rounded">
                        {selectedStockLevel.product.sku}
                      </span>
                      <span className="text-xs text-[#5E6B63]">
                        Warehouse: {selectedStockLevel.warehouse_name} ({selectedStockLevel.warehouse_code})
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Tabs: Overview & Ledger */}
              <div className="flex border-b border-[#E3E1DA] gap-6 text-xs font-semibold">
                <button
                  onClick={() => setDetailTab('overview')}
                  className={`pb-2 transition-colors cursor-pointer ${
                    detailTab === 'overview'
                      ? 'border-b-2 border-[#173D32] text-[#173D32]'
                      : 'text-[#5E6B63] hover:text-[#202521]'
                  }`}
                >
                  Overview &amp; Stock
                </button>
                <button
                  onClick={() => setDetailTab('ledger')}
                  className={`pb-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                    detailTab === 'ledger'
                      ? 'border-b-2 border-[#173D32] text-[#173D32]'
                      : 'text-[#5E6B63] hover:text-[#202521]'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Stock Ledger
                </button>
              </div>

              {/* Tab Contents */}
              {detailTab === 'overview' ? (
                <div className="space-y-4 text-xs py-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#F8F8F5] p-3 rounded-lg border border-[#E3E1DA]">
                      <div className="text-[#5E6B63]">Current Stock</div>
                      <div className="text-xl font-bold text-[#202521] mt-1 tabular-nums">
                        {selectedStockLevel.quantity}
                      </div>
                    </div>
                    <div className="bg-[#F8F8F5] p-3 rounded-lg border border-[#E3E1DA]">
                      <div className="text-[#5E6B63]">Unit Price</div>
                      <div className="text-xl font-bold text-[#202521] mt-1 tabular-nums">
                        {formatCurrency(selectedStockLevel.product.price)}
                      </div>
                    </div>
                    <div className="bg-[#F8F8F5] p-3 rounded-lg border border-[#E3E1DA]">
                      <div className="text-[#5E6B63]">Reorder Level</div>
                      <div className="text-xl font-bold text-[#202521] mt-1 tabular-nums">
                        {selectedStockLevel.reorder_level}
                      </div>
                    </div>
                    <div className="bg-[#F8F8F5] p-3 rounded-lg border border-[#E3E1DA]">
                      <div className="text-[#5E6B63]">Stock Status</div>
                      <div className="mt-2">
                        <StockIndicator
                          quantity={selectedStockLevel.quantity}
                          reorderLevel={selectedStockLevel.reorder_level}
                        />
                      </div>
                    </div>
                  </div>

                  {selectedStockLevel.product.description && (
                    <div className="bg-white p-3 rounded border border-[#E3E1DA]">
                      <div className="font-semibold text-[#5E6B63] mb-1">Description</div>
                      <p className="text-[#202521]">{selectedStockLevel.product.description}</p>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const pid = String(selectedStockLevel.product.id);
                        setSelectedStockLevel(null);
                        setAdjustForm({ product_id: pid, delta: 0, reason: '' });
                        setIsAdjustOpen(true);
                      }}
                    >
                      Adjust This Stock
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        const pid = String(selectedStockLevel.product.id);
                        setSelectedStockLevel(null);
                        setReceiveForm({ product_id: pid, quantity: 10, reference: '' });
                        setIsReceiveOpen(true);
                      }}
                    >
                      Receive Units
                    </Button>
                  </div>
                </div>
              ) : (
                /* Ledger Tab */
                <div className="space-y-3 py-1">
                  <div className="text-xs text-[#5E6B63]">
                    Immutable transaction log for{' '}
                    <span className="font-semibold text-[#202521]">
                      {selectedStockLevel.product.name}
                    </span>{' '}
                    ({productMovements.length} logged events)
                  </div>

                  <div className="border border-[#E3E1DA] rounded-lg overflow-x-auto max-h-72">
                    {isLoadingLedger ? (
                      <div className="p-8 text-center text-xs text-[#5E6B63]">
                        Loading ledger history...
                      </div>
                    ) : productMovements.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#5E6B63]">
                        No stock movement records for this product yet.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                            <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                            <th className="py-2.5 px-3 font-semibold">Warehouse</th>
                            <th className="py-2.5 px-3 font-semibold">Type</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Delta</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Balance After</th>
                            <th className="py-2.5 px-3 font-semibold">User</th>
                            <th className="py-2.5 px-3 font-semibold">Reason</th>
                            <th className="py-2.5 px-3 font-semibold">Reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E1DA]/60">
                          {productMovements.map((m) => (
                            <tr key={m.id} className="hover:bg-[#F8F8F5]/80 transition-colors">
                              <td className="py-2.5 px-3 text-[#5E6B63] whitespace-nowrap">
                                {formatDate(m.created_at)}
                              </td>
                              <td className="py-2.5 px-3 text-[#5E6B63] font-medium">
                                <span className="px-1.5 py-0.5 rounded bg-[#F1F1EC] text-[#202521] text-[10px] font-semibold">
                                  {m.warehouse_code}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <Badge variant={getMovementBadgeVariant(m.movement_type)}>
                                  {m.movement_type}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                                <span
                                  className={`inline-flex items-center gap-0.5 ${
                                    m.delta > 0 ? 'text-[#2F7D4F]' : 'text-[#C85A32]'
                                  }`}
                                >
                                  {m.delta > 0 ? (
                                    <ArrowDownLeft className="w-3 h-3" />
                                  ) : (
                                    <ArrowUpRight className="w-3 h-3" />
                                  )}
                                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-[#202521]">
                                {m.balance_after !== null && m.balance_after !== undefined
                                  ? m.balance_after
                                  : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-[#202521] font-medium">
                                @{m.username}
                              </td>
                              <td className="py-2.5 px-3 text-[#202521] max-w-xs truncate">
                                {m.reason || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-[#5E6B63] font-mono text-[10px] max-w-xs truncate">
                                {m.reference || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
