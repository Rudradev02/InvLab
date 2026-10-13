import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { StockLevel, Product, PaginatedResponse } from '../types';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { StockIndicator } from '../components/ui/stock-indicator';
import { formatCurrency, formatNumber } from '../lib/format';
import { PackagePlus, SlidersHorizontal, Search, ArrowDownToLine, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export const InventoryPage: React.FC = () => {
  const { user, selectedWarehouseId } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out'>('all');

  // Modals state
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

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

  const stocks = stockData?.results || [];
  const products = productsData?.results || [];

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
      queryClient.invalidateQueries({ queryKey: ['ledger-recent'] });
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
      queryClient.invalidateQueries({ queryKey: ['ledger-recent'] });
      toast.success('Stock adjusted and recorded in ledger');
      setIsAdjustOpen(false);
      setAdjustForm({ product_id: '', delta: 0, reason: '' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Adjustment failed';
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202521]">Stock &amp; Inventory</h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            Real-time multi-warehouse inventory levels with atomic race-free updates
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Receive Stock Modal */}
          <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-[#173D32]">
                <ArrowDownToLine className="w-4 h-4" /> Receive Stock
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Receive Incoming Stock</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  receiveMutation.mutate(receiveForm);
                }}
                className="space-y-4 mt-2"
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
                  label="Quantity to Receive"
                  type="number"
                  min={1}
                  required
                  value={receiveForm.quantity}
                  onChange={(e) => setReceiveForm({ ...receiveForm, quantity: Number(e.target.value) })}
                />

                <Input
                  label="Reference / PO Number / Note"
                  placeholder="e.g. Supplier invoice #892"
                  value={receiveForm.reference}
                  onChange={(e) => setReceiveForm({ ...receiveForm, reference: e.target.value })}
                />

                <Button type="submit" className="w-full" isLoading={receiveMutation.isPending}>
                  Confirm &amp; Write to Ledger
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Adjust Stock Modal */}
          <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <SlidersHorizontal className="w-4 h-4" /> Stock Adjustment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Stock Correction / Audit Adjustment</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  adjustMutation.mutate(adjustForm);
                }}
                className="space-y-4 mt-2"
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
            Showing {filteredStocks.length} records
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
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1DA]/60">
                {filteredStocks.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8F8F5]/80 transition-colors">
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
