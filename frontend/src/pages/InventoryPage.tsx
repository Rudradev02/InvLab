import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { StockLevel, Product, Category, StockMovement, PaginatedResponse } from '../types';
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
  Plus,
  Edit,
  PackagePlus,
} from 'lucide-react';
import { toast } from 'sonner';

export const InventoryPage: React.FC = () => {
  const { user, selectedWarehouseId } = useAuth();
  const queryClient = useQueryClient();
  const canManageStock = user?.role === 'Admin' || user?.role === 'Warehouse Manager';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out'>('all');

  // Modals state
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<StockLevel | null>(null);
  const [newReorderLevel, setNewReorderLevel] = useState(5);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedStockLevel, setSelectedStockLevel] = useState<StockLevel | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'ledger'>('overview');

  // Forms state
  const [addProductForm, setAddProductForm] = useState({
    product_id: '',
    reorder_level: 5,
    initial_quantity: 0,
  });
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

  // Query categories for product modal
  const { data: categoriesData } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => apiRequest<PaginatedResponse<Category>>('categories/'),
  });

  const categories = categoriesData?.results || [];

  // Product CRUD modal state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    sku: '',
    name: '',
    category: '',
    price: '',
    cost_price: '',
    default_reorder_level: 5,
    description: '',
  });

  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setProductForm({
      sku: '',
      name: '',
      category: categories.length > 0 ? categories[0].id.toString() : '',
      price: '',
      cost_price: '',
      default_reorder_level: 5,
      description: '',
    });
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProductForm({
      sku: prod.sku,
      name: prod.name,
      category: prod.category.toString(),
      price: prod.price,
      cost_price: prod.cost_price || '0.00',
      default_reorder_level: prod.default_reorder_level || 5,
      description: prod.description || '',
    });
    setIsProductModalOpen(true);
  };

  const productMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        sku: productForm.sku,
        name: productForm.name,
        category: parseInt(productForm.category, 10),
        price: productForm.price,
        cost_price: productForm.cost_price || '0.00',
        default_reorder_level: Number(productForm.default_reorder_level),
        description: productForm.description,
      };
      if (editingProduct) {
        return apiRequest<Product>(`products/${editingProduct.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      return apiRequest<Product>('products/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (p) => {
      toast.success(editingProduct ? `Product ${p.name} updated!` : `Product ${p.name} created!`);
      setIsProductModalOpen(false);
      setEditingProduct(null);
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      queryClient.invalidateQueries({ queryKey: ['stock-inventory'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save product.');
    },
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

  // Query product stock levels across all warehouses
  const { data: productWarehouseStocksData } = useQuery({
    queryKey: ['product-warehouse-stocks', selectedStockLevel?.product.id],
    queryFn: () =>
      apiRequest<PaginatedResponse<StockLevel>>(
        `stock/?product=${selectedStockLevel?.product.id}`
      ),
    enabled: !!selectedStockLevel && detailTab === 'overview',
  });

  const stocks = stockData?.results || [];
  const products = productsData?.results || [];
  const productMovements = productLedgerData?.results || [];
  const warehouseStocks = productWarehouseStocksData?.results || [];

  // Filtered by local search
  const filteredStocks = stocks.filter(
    (item) =>
      item.product.name.toLowerCase().includes(search.toLowerCase()) ||
      item.product.sku.toLowerCase().includes(search.toLowerCase())
  );

  // Receive stock mutation
  const receiveMutation = useMutation({
    mutationFn: (data: typeof receiveForm) => {
      const idempotencyKey = crypto.randomUUID();
      return apiRequest('stock/receive/', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          product_id: Number(data.product_id),
          quantity: Number(data.quantity),
          reference: data.reference,
          warehouse_id: selectedWarehouseId,
        }),
      });
    },
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
    mutationFn: (data: typeof adjustForm) => {
      const idempotencyKey = crypto.randomUUID();
      return apiRequest('stock/adjust/', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          product_id: Number(data.product_id),
          delta: Number(data.delta),
          reason: data.reason,
          warehouse_id: selectedWarehouseId,
        }),
      });
    },
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

  const addStockMutation = useMutation({
    mutationFn: (data: typeof addProductForm) =>
      apiRequest('stock/', {
        method: 'POST',
        body: JSON.stringify({
          product_id: Number(data.product_id),
          reorder_level: Number(data.reorder_level),
          initial_quantity: Number(data.initial_quantity),
          warehouse: selectedWarehouseId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
      toast.success('Product added to warehouse inventory');
      setIsAddProductOpen(false);
      setAddProductForm({ product_id: '', reorder_level: 5, initial_quantity: 0 });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to add product to warehouse';
      toast.error(msg);
    },
  });

  const updateReorderMutation = useMutation({
    mutationFn: ({ id, reorder_level }: { id: number; reorder_level: number }) =>
      apiRequest(`stock/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ reorder_level }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-inventory'] });
      toast.success('Reorder level updated');
      setEditingStock(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to update reorder level';
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
          {canManageStock && (
            <Button
              variant="outline"
              onClick={handleOpenAddProduct}
              className="gap-2 cursor-pointer bg-white border-[#E3E1DA] text-[#202521] hover:bg-[#F8F8F5]"
            >
              <PackagePlus className="w-4 h-4 text-[#173D32]" /> New Catalog SKU
            </Button>
          )}

          {/* Add Product to Warehouse Modal (Admin and Manager) */}
          {canManageStock && (
            <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 cursor-pointer bg-[#173D32] hover:bg-[#122e26] text-white">
                  <Plus className="w-4 h-4" /> Add Product
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Product to Warehouse Stock</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addStockMutation.mutate(addProductForm);
                  }}
                  className="space-y-4 mt-3"
                >
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                      Select Product from Catalog
                    </label>
                    <select
                      required
                      value={addProductForm.product_id}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const match = products.find((p) => p.id === Number(pid));
                        setAddProductForm({
                          ...addProductForm,
                          product_id: pid,
                          reorder_level: match?.default_reorder_level || 5,
                        });
                      }}
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
                    label="Reorder Threshold Level"
                    type="number"
                    min="1"
                    required
                    value={addProductForm.reorder_level}
                    onChange={(e) =>
                      setAddProductForm({
                        ...addProductForm,
                        reorder_level: Number(e.target.value),
                      })
                    }
                    helperText="Alerts when local warehouse inventory reaches or falls below this amount."
                  />

                  <Input
                    label="Initial Stock Quantity (Optional)"
                    type="number"
                    min="0"
                    value={addProductForm.initial_quantity}
                    onChange={(e) =>
                      setAddProductForm({
                        ...addProductForm,
                        initial_quantity: Number(e.target.value),
                      })
                    }
                    helperText="If greater than 0, an initial ledger entry will automatically be logged."
                  />

                  <Button
                    type="submit"
                    className="w-full bg-[#173D32] text-white"
                    isLoading={addStockMutation.isPending}
                  >
                    Add Product to Inventory
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}

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
                    <td className="py-3.5 px-5 tabular-nums">
                      <div className="font-semibold text-[#202521]">
                        {formatCurrency(item.product.price)}
                      </div>
                      {item.product.cost_price && parseFloat(item.product.cost_price) > 0 ? (
                        <div className="mt-0.5">
                          {(() => {
                            const sp = parseFloat(item.product.price);
                            const cp = parseFloat(item.product.cost_price);
                            const m = sp > 0 ? ((sp - cp) / sp) * 100 : 0;
                            return (
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  m >= 20
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : m > 0
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-red-50 text-red-800 border border-red-200'
                                }`}
                              >
                                {m.toFixed(1)}% margin
                              </span>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#5E6B63]">No cost set</span>
                      )}
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
                      <div className="flex items-center justify-end gap-1.5">
                        {canManageStock && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditProduct(item.product);
                              }}
                              className="text-xs text-[#5E6B63] hover:text-[#173D32] h-7 px-1.5 text-[11px] gap-1"
                              title="Edit product pricing & details"
                            >
                              <Edit className="w-3.5 h-3.5" /> SKU
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingStock(item);
                                setNewReorderLevel(item.reorder_level);
                              }}
                              className="text-xs text-[#5E6B63] hover:text-[#173D32] h-7 w-7 p-0"
                              title="Edit warehouse reorder level"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Edit Reorder Level Dialog */}
      <Dialog open={!!editingStock} onOpenChange={(open) => !open && setEditingStock(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Reorder Threshold</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingStock) {
                updateReorderMutation.mutate({
                  id: editingStock.id,
                  reorder_level: Number(newReorderLevel),
                });
              }
            }}
            className="space-y-4 mt-3"
          >
            <div>
              <div className="text-xs text-[#5E6B63]">Product:</div>
              <div className="font-semibold text-sm text-[#202521]">{editingStock?.product.name}</div>
              <div className="text-[11px] font-mono text-[#5E6B63]">{editingStock?.product.sku}</div>
            </div>

            <Input
              label="Reorder Level Threshold"
              type="number"
              min="1"
              required
              value={newReorderLevel}
              onChange={(e) => setNewReorderLevel(Number(e.target.value))}
              helperText="When stock level falls to or below this amount, low-stock warnings will trigger."
            />

            <Button
              type="submit"
              className="w-full bg-[#173D32] text-white"
              isLoading={updateReorderMutation.isPending}
            >
              Update Threshold
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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

                  {/* Stock Breakdown by Warehouse */}
                  <div className="bg-white rounded-lg border border-[#E3E1DA] overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#F1F1EC] border-b border-[#E3E1DA] font-semibold text-xs text-[#202521] flex justify-between items-center">
                      <span>Stock Across Warehouses</span>
                      <span className="text-[11px] text-[#5E6B63] font-normal tabular-nums">
                        Total:{' '}
                        {warehouseStocks.reduce((acc, curr) => acc + curr.quantity, 0)} units
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#E3E1DA] text-[#5E6B63] bg-[#F8F8F5]">
                            <th className="py-2 px-4 font-medium">Warehouse</th>
                            <th className="py-2 px-4 text-right font-medium">Available Quantity</th>
                            <th className="py-2 px-4 text-right font-medium">Reorder Level</th>
                            <th className="py-2 px-4 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E1DA]/50">
                          {warehouseStocks.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-4 text-center text-[#5E6B63]">
                                No warehouse stock records found.
                              </td>
                            </tr>
                          ) : (
                            warehouseStocks.map((ws) => (
                              <tr key={ws.id} className="hover:bg-[#F8F8F5]">
                                <td className="py-2.5 px-4 font-medium text-[#202521]">
                                  {ws.warehouse_name}{' '}
                                  <span className="text-[#5E6B63] font-mono text-[11px]">
                                    ({ws.warehouse_code})
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-right font-bold tabular-nums text-[#202521]">
                                  {ws.quantity}
                                </td>
                                <td className="py-2.5 px-4 text-right text-[#5E6B63] tabular-nums">
                                  {ws.reorder_level}
                                </td>
                                <td className="py-2.5 px-4">
                                  <StockIndicator
                                    quantity={ws.quantity}
                                    reorderLevel={ws.reorder_level}
                                  />
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

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

      {/* Product Create / Edit Modal with Live Margin Preview */}
      <Dialog open={isProductModalOpen} onOpenChange={setIsProductModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? `Edit Product: ${editingProduct.sku}` : 'New Catalog Product'}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              productMutation.mutate();
            }}
            className="space-y-3.5 mt-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="SKU Code *"
                required
                disabled={!!editingProduct}
                value={productForm.sku}
                onChange={(e) => setProductForm({ ...productForm, sku: e.target.value.toUpperCase() })}
                placeholder="e.g. ELEC-001"
              />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                  Category *
                </label>
                <select
                  required
                  value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                  className="w-full h-10 px-3 py-2 text-xs bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                >
                  <option value="">-- Choose Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Input
              label="Item Name *"
              required
              value={productForm.name}
              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              placeholder="e.g. Premium Wireless Mouse"
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Selling Price (₹) *"
                type="number"
                step="0.01"
                min="0"
                required
                value={productForm.price}
                onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                placeholder="1000.00"
              />
              <Input
                label="Cost Price (₹)"
                type="number"
                step="0.01"
                min="0"
                value={productForm.cost_price}
                onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })}
                placeholder="700.00"
                helperText="Cost of goods sold"
              />
            </div>

            {/* Live Gross Margin Preview */}
            {(() => {
              const sp = parseFloat(productForm.price) || 0;
              const cp = parseFloat(productForm.cost_price) || 0;
              const margin = sp > 0 ? ((sp - cp) / sp) * 100 : 0;
              const unitProfit = sp - cp;
              return (
                <div className="p-3 bg-[#F8F9F8] border border-[#E3E1DA] rounded-lg text-xs space-y-1">
                  <div className="flex justify-between items-center font-medium">
                    <span className="text-[#5E6B63]">Gross Margin Preview:</span>
                    <span
                      className={`font-bold ${
                        margin >= 20
                          ? 'text-emerald-700'
                          : margin > 0
                          ? 'text-amber-700'
                          : 'text-red-600'
                      }`}
                    >
                      {margin.toFixed(1)}% ({formatCurrency(unitProfit)} profit/unit)
                    </span>
                  </div>
                  {cp > sp && (
                    <p className="text-[11px] text-red-600 font-medium">
                      Warning: Unit cost exceeds selling price. Selling at a loss.
                    </p>
                  )}
                  {cp <= 0 && (
                    <p className="text-[11px] text-[#5E6B63]">
                      Note: Products without cost are excluded from profit calculations until stock is received with PO.
                    </p>
                  )}
                </div>
              );
            })()}

            <Input
              label="Default Reorder Level"
              type="number"
              min="1"
              value={productForm.default_reorder_level}
              onChange={(e) =>
                setProductForm({
                  ...productForm,
                  default_reorder_level: Number(e.target.value) || 5,
                })
              }
              helperText="Default replenishment trigger threshold."
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E3E1DA]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsProductModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#173D32] text-white hover:bg-[#122e26]"
                isLoading={productMutation.isPending}
              >
                {editingProduct ? 'Save Changes' : 'Create Product'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
