import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import {
  PaginatedResponse,
  Product,
  PurchaseOrder,
  PurchaseOrderStatus,
  Supplier,
  Warehouse,
} from '../types';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { formatCurrency, formatDate } from '../lib/format';
import {
  Truck,
  Plus,
  Trash2,
  CheckCircle2,
  Eye,
  Building2,
  XCircle,
  ArrowDownToLine,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

interface POLineDraft {
  productId: number;
  productName: string;
  sku: string;
  quantityOrdered: number;
  unitCost: number;
}

export const PurchasingPage: React.FC = () => {
  const { user, selectedWarehouseId } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const queryClient = useQueryClient();

  // Navigation tab: 'orders' or 'suppliers'
  const [activeTab, setActiveTab] = useState<'orders' | 'suppliers'>('orders');

  // Filters for POs
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>(
    selectedWarehouseId ? selectedWarehouseId.toString() : ''
  );
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isCreatePOModalOpen, setIsCreatePOModalOpen] = useState(false);
  const [viewingPO, setViewingPO] = useState<PurchaseOrder | null>(null);
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Receive stock quantities state (lineId -> qtyToReceive)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, number>>({});

  // New PO form state
  const [poSupplierId, setPOSupplierId] = useState<string>('');
  const [poWarehouseId, setPOWarehouseId] = useState<string>(
    selectedWarehouseId ? selectedWarehouseId.toString() : ''
  );
  const [poOrderDate, setPOOrderDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [poExpectedDate, setPOExpectedDate] = useState<string>('');
  const [poNotes, setPONotes] = useState<string>('');
  const [poLines, setPOLines] = useState<POLineDraft[]>([]);

  // Line item selector in modal
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [inputQuantity, setInputQuantity] = useState<number>(1);
  const [inputUnitCost, setInputUnitCost] = useState<string>('');

  // Supplier form state
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
    is_active: true,
  });

  // Queries
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiRequest<PaginatedResponse<Supplier>>('suppliers/?page_size=100'),
  });
  const suppliers = suppliersData?.results || [];

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiRequest<Warehouse[]>('warehouses/'),
    enabled: isAdmin,
  });
  const warehouses = warehousesData || [];

  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => apiRequest<PaginatedResponse<Product>>('products/?page_size=200&is_active=true'),
  });
  const products = productsData?.results || [];

  const { data: poData, isLoading: poLoading } = useQuery({
    queryKey: ['purchase-orders', statusFilter, warehouseFilter, supplierFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (warehouseFilter) params.append('warehouse', warehouseFilter);
      if (supplierFilter) params.append('supplier', supplierFilter);
      const q = params.toString() ? `?${params.toString()}` : '';
      return apiRequest<PaginatedResponse<PurchaseOrder>>(`purchase-orders/${q}`);
    },
  });
  const purchaseOrders = poData?.results || [];

  // Filter purchase orders locally by search query
  const filteredOrders = purchaseOrders.filter((po) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      po.po_number.toLowerCase().includes(q) ||
      po.supplier_name.toLowerCase().includes(q) ||
      po.warehouse_code.toLowerCase().includes(q)
    );
  });

  // Add line to draft PO
  const handleAddPOLine = () => {
    if (!selectedProductId) return;
    const prod = products.find((p) => p.id === Number(selectedProductId));
    if (!prod) return;

    const qty = Math.max(1, inputQuantity);
    const cost = parseFloat(inputUnitCost) || parseFloat(prod.cost_price || prod.price) || 0;

    const existingIndex = poLines.findIndex((l) => l.productId === prod.id);
    if (existingIndex > -1) {
      const updated = [...poLines];
      updated[existingIndex].quantityOrdered += qty;
      updated[existingIndex].unitCost = cost;
      setPOLines(updated);
    } else {
      setPOLines([
        ...poLines,
        {
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          quantityOrdered: qty,
          unitCost: cost,
        },
      ]);
    }

    setSelectedProductId('');
    setInputQuantity(1);
    setInputUnitCost('');
  };

  const handleRemovePOLine = (index: number) => {
    setPOLines(poLines.filter((_, i) => i !== index));
  };

  const poTotalAmount = poLines.reduce((acc, l) => acc + l.quantityOrdered * l.unitCost, 0);

  // Mutations
  const createPOMutation = useMutation({
    mutationFn: (markOrdered: boolean) => {
      if (!poSupplierId) throw new Error('Please select a supplier.');
      const whId = isAdmin ? poWarehouseId : selectedWarehouseId?.toString();
      if (!whId) throw new Error('Please select a destination warehouse.');
      if (poLines.length === 0) throw new Error('Please add at least one line item to the order.');

      return apiRequest<PurchaseOrder>('purchase-orders/', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: parseInt(poSupplierId, 10),
          warehouse_id: parseInt(whId, 10),
          order_date: poOrderDate || null,
          expected_delivery_date: poExpectedDate || null,
          notes: poNotes,
          lines: poLines.map((l) => ({
            product_id: l.productId,
            quantity_ordered: l.quantityOrdered,
            unit_cost: l.unitCost.toFixed(2),
          })),
        }),
      }).then(async (newPo) => {
        if (markOrdered) {
          return apiRequest<PurchaseOrder>(`purchase-orders/${newPo.id}/mark_ordered/`, {
            method: 'POST',
          });
        }
        return newPo;
      });
    },
    onSuccess: (data) => {
      toast.success(`Purchase Order ${data.po_number} created successfully!`);
      setIsCreatePOModalOpen(false);
      setPOLines([]);
      setPONotes('');
      setPOExpectedDate('');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create purchase order.');
    },
  });

  const markOrderedMutation = useMutation({
    mutationFn: (poId: number) =>
      apiRequest<PurchaseOrder>(`purchase-orders/${poId}/mark_ordered/`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      toast.success(`PO ${data.po_number} marked as Ordered!`);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      if (viewingPO?.id === data.id) setViewingPO(data);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update order status.');
    },
  });

  const cancelPOMutation = useMutation({
    mutationFn: (poId: number) =>
      apiRequest<PurchaseOrder>(`purchase-orders/${poId}/cancel_order/`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      toast.success(`PO ${data.po_number} has been cancelled.`);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      if (viewingPO?.id === data.id) setViewingPO(data);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to cancel order.');
    },
  });

  const receiveItemsMutation = useMutation({
    mutationFn: ({ poId, receipts }: { poId: number; receipts: any[] }) =>
      apiRequest<PurchaseOrder>(`purchase-orders/${poId}/receive_items/`, {
        method: 'POST',
        body: JSON.stringify({ receipts }),
      }),
    onSuccess: (data) => {
      toast.success(`Stock received for PO ${data.po_number}! Warehouse inventory & weighted costs updated.`);
      setReceivingPO(null);
      if (viewingPO?.id === data.id) setViewingPO(data);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to process receipt.');
    },
  });

  const supplierMutation = useMutation({
    mutationFn: () => {
      if (editingSupplier) {
        return apiRequest<Supplier>(`suppliers/${editingSupplier.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(supplierForm),
        });
      }
      return apiRequest<Supplier>('suppliers/', {
        method: 'POST',
        body: JSON.stringify(supplierForm),
      });
    },
    onSuccess: () => {
      toast.success(editingSupplier ? 'Supplier updated!' : 'Supplier created!');
      setIsSupplierModalOpen(false);
      setEditingSupplier(null);
      setSupplierForm({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        gstin: '',
        address: '',
        is_active: true,
      });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save supplier.');
    },
  });

  // Open Receive Dialog with quantities prefilled to remaining
  const openReceiveDialog = (po: PurchaseOrder) => {
    setReceivingPO(po);
    const initialMap: Record<number, number> = {};
    po.lines.forEach((l) => {
      initialMap[l.id] = l.quantity_remaining;
    });
    setReceiveQuantities(initialMap);
  };

  const handleConfirmReceive = () => {
    if (!receivingPO) return;
    const receiptsToSubmit = Object.entries(receiveQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, qty]) => ({
        line_id: parseInt(lineId, 10),
        quantity_received: qty,
      }));

    if (receiptsToSubmit.length === 0) {
      toast.error('Please specify a received quantity of at least 1 unit.');
      return;
    }

    receiveItemsMutation.mutate({
      poId: receivingPO.id,
      receipts: receiptsToSubmit,
    });
  };

  const getStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            Draft
          </span>
        );
      case 'ordered':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Ordered
          </span>
        );
      case 'partially_received':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Partially Received
          </span>
        );
      case 'received':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Received
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-[#173D32]" />
            <h1 className="text-2xl font-bold tracking-tight text-[#202521]">
              Procurement &amp; Suppliers
            </h1>
          </div>
          <p className="text-sm text-[#5E6B63] mt-1">
            Create purchase orders, receive supplier shipments, and automatically update weighted average cost prices
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'suppliers' ? (
            <Button
              onClick={() => {
                setEditingSupplier(null);
                setSupplierForm({
                  name: '',
                  contact_person: '',
                  phone: '',
                  email: '',
                  gstin: '',
                  address: '',
                  is_active: true,
                });
                setIsSupplierModalOpen(true);
              }}
              className="gap-1.5 bg-[#173D32] text-white hover:bg-[#122e26]"
            >
              <Plus className="w-4 h-4" /> Add Supplier
            </Button>
          ) : (
            <Button
              onClick={() => setIsCreatePOModalOpen(true)}
              className="gap-1.5 bg-[#173D32] text-white hover:bg-[#122e26]"
            >
              <Plus className="w-4 h-4" /> New Purchase Order
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E3E1DA] gap-2">
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'orders'
              ? 'border-[#173D32] text-[#173D32] bg-[#F8F9F8]/60'
              : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Purchase Orders</span>
          <span className="ml-1 text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.2 rounded-full font-bold">
            {purchaseOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('suppliers')}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'suppliers'
              ? 'border-[#173D32] text-[#173D32] bg-[#F8F9F8]/60'
              : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Suppliers Directory</span>
          <span className="ml-1 text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.2 rounded-full font-bold">
            {suppliers.length}
          </span>
        </button>
      </div>

      {/* TAB 1: PURCHASE ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                {/* Search */}
                <div className="sm:col-span-4 relative">
                  <Search className="w-3.5 h-3.5 text-[#5E6B63] absolute left-3 top-2.5 pointer-events-none" />
                  <Input
                    placeholder="Search PO # or supplier..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs bg-white"
                  />
                </div>

                {/* Status Filter */}
                <div className="sm:col-span-3">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md border border-[#E3E1DA] bg-white text-xs font-medium text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                  >
                    <option value="">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="ordered">Ordered</option>
                    <option value="partially_received">Partially Received</option>
                    <option value="received">Received</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Supplier Filter */}
                <div className="sm:col-span-3">
                  <select
                    value={supplierFilter}
                    onChange={(e) => setSupplierFilter(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md border border-[#E3E1DA] bg-white text-xs font-medium text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                  >
                    <option value="">All Suppliers</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Warehouse Filter (Admin only) */}
                {isAdmin && (
                  <div className="sm:col-span-2">
                    <select
                      value={warehouseFilter}
                      onChange={(e) => setWarehouseFilter(e.target.value)}
                      className="w-full h-8 px-2.5 rounded-md border border-[#E3E1DA] bg-white text-xs font-medium text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                    >
                      <option value="">All Warehouses</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card>
            <div className="overflow-x-auto">
              {poLoading ? (
                <div className="p-8 text-center text-sm text-[#5E6B63]">Loading purchase orders...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#5E6B63]">
                  No purchase orders found matching your filters.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                      <th className="py-2.5 px-4 font-semibold">PO Number</th>
                      <th className="py-2.5 px-4 font-semibold">Supplier</th>
                      <th className="py-2.5 px-4 font-semibold">Warehouse</th>
                      <th className="py-2.5 px-4 font-semibold">Order Date</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Total Amount</th>
                      <th className="py-2.5 px-4 font-semibold text-center">Receipt Progress</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                      <th className="py-2.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]/60">
                    {filteredOrders.map((po) => {
                      const totalOrdered = po.total_ordered_units || 0;
                      const totalReceived = po.total_received_units || 0;
                      const pct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
                      const canReceive =
                        po.status === 'ordered' || po.status === 'partially_received';
                      const canCancel =
                        (po.status === 'draft' || po.status === 'ordered') && totalReceived === 0;

                      return (
                        <tr key={po.id} className="hover:bg-[#F8F9F8] transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-[#173D32]">
                            <button
                              onClick={() => setViewingPO(po)}
                              className="hover:underline text-left"
                            >
                              {po.po_number}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-semibold text-[#202521]">
                            {po.supplier_name}
                          </td>
                          <td className="py-3 px-4 text-[#5E6B63] font-medium">
                            {po.warehouse_code}
                          </td>
                          <td className="py-3 px-4 text-[#5E6B63]">
                            {formatDate(po.order_date)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-[#173D32] tabular-nums">
                            {formatCurrency(po.total_amount)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <span className="font-semibold tabular-nums text-[11px]">
                                {totalReceived} / {totalOrdered}
                              </span>
                              <span className="text-[10px] text-[#5E6B63]">({pct}%)</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">{getStatusBadge(po.status)}</td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="View Details"
                                onClick={() => setViewingPO(po)}
                                className="h-7 text-xs p-1.5 text-[#173D32] hover:bg-[#E6F2EA]"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>

                              {canReceive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Receive Items"
                                  onClick={() => openReceiveDialog(po)}
                                  className="h-7 text-xs p-1.5 text-blue-700 hover:bg-blue-50"
                                >
                                  <ArrowDownToLine className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              {canCancel && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Cancel PO"
                                  onClick={() => {
                                    if (confirm(`Cancel purchase order ${po.po_number}?`)) {
                                      cancelPOMutation.mutate(po.id);
                                    }
                                  }}
                                  className="h-7 text-xs p-1.5 text-red-600 hover:bg-red-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: SUPPLIERS DIRECTORY */}
      {activeTab === 'suppliers' && (
        <Card>
          <div className="overflow-x-auto">
            {suppliers.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#5E6B63]">
                No suppliers registered yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                    <th className="py-2.5 px-4 font-semibold">Supplier Name</th>
                    <th className="py-2.5 px-4 font-semibold">Contact Person</th>
                    <th className="py-2.5 px-4 font-semibold">Phone</th>
                    <th className="py-2.5 px-4 font-semibold">Email</th>
                    <th className="py-2.5 px-4 font-semibold">GSTIN</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Orders</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E1DA]/60">
                  {suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-[#F8F9F8]">
                      <td className="py-3 px-4 font-bold text-[#173D32]">{s.name}</td>
                      <td className="py-3 px-4 text-[#202521] font-medium">
                        {s.contact_person || '-'}
                      </td>
                      <td className="py-3 px-4 text-[#5E6B63]">{s.phone || '-'}</td>
                      <td className="py-3 px-4 text-[#5E6B63]">{s.email || '-'}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#5E6B63]">
                        {s.gstin || '-'}
                      </td>
                      <td className="py-3 px-4 text-center font-bold">{s.po_count}</td>
                      <td className="py-3 px-4">
                        {s.is_active ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingSupplier(s);
                            setSupplierForm({
                              name: s.name,
                              contact_person: s.contact_person,
                              phone: s.phone,
                              email: s.email,
                              gstin: s.gstin,
                              address: s.address,
                              is_active: s.is_active,
                            });
                            setIsSupplierModalOpen(true);
                          }}
                          className="h-7 text-xs px-2"
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {/* CREATE PURCHASE ORDER MODAL */}
      {isCreatePOModalOpen && (
        <Dialog open={isCreatePOModalOpen} onOpenChange={setIsCreatePOModalOpen}>
          <DialogContent className="max-w-3xl bg-white max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#173D32]">
                <Truck className="w-5 h-5" />
                <span>Create Purchase Order</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              {/* Header Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#202521]">Supplier *</label>
                  <select
                    value={poSupplierId}
                    onChange={(e) => setPOSupplierId(e.target.value)}
                    className="w-full h-9 rounded-md border border-[#E3E1DA] bg-white px-2.5 text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                  >
                    <option value="">-- Choose Supplier --</option>
                    {suppliers
                      .filter((s) => s.is_active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>

                {isAdmin ? (
                  <div className="space-y-1">
                    <label className="font-semibold text-[#202521]">Destination Warehouse *</label>
                    <select
                      value={poWarehouseId}
                      onChange={(e) => setPOWarehouseId(e.target.value)}
                      className="w-full h-9 rounded-md border border-[#E3E1DA] bg-white px-2.5 text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                    >
                      <option value="">-- Choose Warehouse --</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="font-semibold text-[#202521]">Destination Warehouse</label>
                    <Input
                      disabled
                      value="Assigned Warehouse (Manager Scoped)"
                      className="h-9 text-xs bg-gray-50"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="font-semibold text-[#202521]">Order Date</label>
                  <Input
                    type="date"
                    value={poOrderDate}
                    onChange={(e) => setPOOrderDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#202521]">Expected Delivery</label>
                  <Input
                    type="date"
                    value={poExpectedDate}
                    onChange={(e) => setPOExpectedDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Add Line Items Section */}
              <div className="border border-[#E3E1DA] p-3 rounded-lg bg-[#F8F9F8] space-y-3">
                <div className="font-semibold text-[#202521] flex items-center justify-between">
                  <span>Order Items</span>
                  <span className="text-[11px] font-normal text-[#5E6B63]">
                    Add products to purchase
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-6 space-y-1">
                    <label className="text-[11px] font-medium text-[#5E6B63]">Product Catalog</label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => {
                        const pId = e.target.value;
                        setSelectedProductId(pId);
                        const p = products.find((prod) => prod.id === Number(pId));
                        if (p) {
                          setInputUnitCost(p.cost_price || p.price || '0.00');
                        }
                      }}
                      className="w-full h-9 rounded-md border border-[#E3E1DA] bg-white px-2 text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                    >
                      <option value="">-- Choose item --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku}) [Cost: ₹{p.cost_price || '0.00'}]
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-medium text-[#5E6B63]">Quantity</label>
                    <Input
                      type="number"
                      min={1}
                      value={inputQuantity}
                      onChange={(e) => setInputQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-9 text-xs text-center"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-medium text-[#5E6B63]">Unit Cost (₹)</label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={inputUnitCost}
                      onChange={(e) => setInputUnitCost(e.target.value)}
                      className="h-9 text-xs font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      onClick={handleAddPOLine}
                      disabled={!selectedProductId}
                      className="w-full h-9 text-xs gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </Button>
                  </div>
                </div>

                {/* Lines Table */}
                <div className="border border-[#E3E1DA] rounded-md overflow-hidden bg-white">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                        <th className="py-2 px-3">SKU</th>
                        <th className="py-2 px-3">Item Name</th>
                        <th className="py-2 px-3 text-center">Qty Ordered</th>
                        <th className="py-2 px-3 text-right">Unit Cost</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                        <th className="py-2 px-3 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E1DA]/60">
                      {poLines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-[#5E6B63]">
                            No items added to this purchase order.
                          </td>
                        </tr>
                      ) : (
                        poLines.map((line, idx) => (
                          <tr key={line.productId}>
                            <td className="py-2 px-3 font-mono font-medium text-[#173D32]">
                              {line.sku}
                            </td>
                            <td className="py-2 px-3 font-semibold text-[#202521]">
                              {line.productName}
                            </td>
                            <td className="py-2 px-3 text-center font-bold">
                              {line.quantityOrdered}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {formatCurrency(line.unitCost)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-[#173D32] tabular-nums">
                              {formatCurrency(line.quantityOrdered * line.unitCost)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemovePOLine(idx)}
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total Preview */}
                <div className="flex justify-between items-center text-xs font-bold pt-1">
                  <span>Estimated Total Order Value:</span>
                  <span className="text-base text-[#173D32] tabular-nums">
                    {formatCurrency(poTotalAmount)}
                  </span>
                </div>
              </div>

              {/* Order Notes */}
              <div className="space-y-1">
                <label className="font-semibold text-[#202521]">Order Notes &amp; Terms</label>
                <Input
                  placeholder="e.g. Payment terms net 30, deliver to gate 2..."
                  value={poNotes}
                  onChange={(e) => setPONotes(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t border-[#E3E1DA]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreatePOModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={poLines.length === 0 || createPOMutation.isPending}
                  onClick={() => createPOMutation.mutate(false)}
                >
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  className="bg-[#173D32] text-white hover:bg-[#122e26]"
                  disabled={poLines.length === 0 || createPOMutation.isPending}
                  onClick={() => createPOMutation.mutate(true)}
                >
                  Create &amp; Mark Ordered
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* VIEW ORDER DETAIL MODAL */}
      {viewingPO && (
        <Dialog open={!!viewingPO} onOpenChange={() => setViewingPO(null)}>
          <DialogContent className="max-w-2xl bg-white max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between border-b border-[#E3E1DA] pb-3">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <span>Purchase Order {viewingPO.po_number}</span>
                    {getStatusBadge(viewingPO.status)}
                  </DialogTitle>
                  <p className="text-xs text-[#5E6B63] mt-0.5">
                    Supplier: <strong>{viewingPO.supplier_name}</strong> • Warehouse:{' '}
                    <strong>{viewingPO.warehouse_name} ({viewingPO.warehouse_code})</strong>
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              {/* Lines Table */}
              <div className="border border-[#E3E1DA] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F8F9F8] text-[#5E6B63] border-b border-[#E3E1DA]">
                    <tr>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3 text-center">Ordered</th>
                      <th className="py-2.5 px-3 text-center">Received</th>
                      <th className="py-2.5 px-3 text-center">Remaining</th>
                      <th className="py-2.5 px-3 text-right">Unit Cost</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]">
                    {viewingPO.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#202521]">{l.product_name}</div>
                          <div className="text-[11px] font-mono text-[#5E6B63]">{l.product_sku}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">{l.quantity_ordered}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                          {l.quantity_received}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-700">
                          {l.quantity_remaining}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {formatCurrency(l.unit_cost)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#173D32] tabular-nums">
                          {formatCurrency(l.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total & Summary */}
              <div className="bg-[#F8F9F8] p-3 rounded-lg border border-[#E3E1DA] flex justify-between items-center text-xs">
                <div>
                  <span className="text-[#5E6B63]">Order Date: </span>
                  <strong>{formatDate(viewingPO.order_date)}</strong>
                  {viewingPO.expected_delivery_date && (
                    <span className="ml-3 text-[#5E6B63]">
                      Expected Delivery: <strong>{formatDate(viewingPO.expected_delivery_date)}</strong>
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-[#5E6B63]">Total Order Amount</div>
                  <div className="text-base font-extrabold text-[#173D32] tabular-nums">
                    {formatCurrency(viewingPO.total_amount)}
                  </div>
                </div>
              </div>

              {viewingPO.notes && (
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded text-[11px] text-[#5E6B63]">
                  <strong>Notes:</strong> {viewingPO.notes}
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex justify-between items-center pt-2 border-t border-[#E3E1DA]">
                <Button variant="outline" onClick={() => setViewingPO(null)}>
                  Close
                </Button>

                <div className="flex items-center gap-2">
                  {viewingPO.status === 'draft' && (
                    <Button
                      onClick={() => markOrderedMutation.mutate(viewingPO.id)}
                      isLoading={markOrderedMutation.isPending}
                      className="bg-blue-700 hover:bg-blue-800 text-white gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Ordered
                    </Button>
                  )}

                  {(viewingPO.status === 'ordered' || viewingPO.status === 'partially_received') && (
                    <Button
                      onClick={() => openReceiveDialog(viewingPO)}
                      className="bg-[#173D32] hover:bg-[#122e26] text-white gap-1.5"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" /> Receive Stock
                    </Button>
                  )}

                  {(viewingPO.status === 'draft' || viewingPO.status === 'ordered') &&
                    viewingPO.total_received_units === 0 && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (confirm(`Cancel purchase order ${viewingPO.po_number}?`)) {
                            cancelPOMutation.mutate(viewingPO.id);
                          }
                        }}
                        className="text-red-600 hover:bg-red-50"
                      >
                        Cancel Order
                      </Button>
                    )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* RECEIVE STOCK DIALOG */}
      {receivingPO && (
        <Dialog open={!!receivingPO} onOpenChange={() => setReceivingPO(null)}>
          <DialogContent className="max-w-xl bg-white max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#173D32]">
                <ArrowDownToLine className="w-5 h-5 text-emerald-700" />
                <span>Receive Stock: {receivingPO.po_number}</span>
              </DialogTitle>
              <p className="text-xs text-[#5E6B63]">
                Adds incoming stock to <strong>{receivingPO.warehouse_name}</strong> and recalculates weighted average unit cost.
              </p>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              <div className="border border-[#E3E1DA] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F8F9F8] text-[#5E6B63] border-b border-[#E3E1DA]">
                    <tr>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3 text-center">Ordered</th>
                      <th className="py-2.5 px-3 text-center">Remaining</th>
                      <th className="py-2.5 px-3 text-center">Receive Now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]">
                    {receivingPO.lines.map((l) => {
                      const remaining = l.quantity_remaining;
                      const currentVal = receiveQuantities[l.id] || 0;

                      return (
                        <tr key={l.id}>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#202521]">{l.product_name}</div>
                            <div className="text-[11px] font-mono text-[#5E6B63]">{l.product_sku}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-medium">
                            {l.quantity_ordered}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-amber-700">
                            {remaining}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min={0}
                              max={remaining}
                              disabled={remaining <= 0}
                              value={currentVal}
                              onChange={(e) => {
                                const val = Math.min(
                                  remaining,
                                  Math.max(0, parseInt(e.target.value, 10) || 0)
                                );
                                setReceiveQuantities((prev) => ({
                                  ...prev,
                                  [l.id]: val,
                                }));
                              }}
                              className="w-20 h-8 text-center rounded border border-[#E3E1DA] text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Total units receiving preview */}
              <div className="bg-[#F8F9F8] p-3 rounded-lg border border-[#E3E1DA] flex justify-between items-center text-xs">
                <span className="font-semibold text-[#202521]">Total Units Receiving in Batch:</span>
                <span className="text-base font-extrabold text-emerald-700 tabular-nums">
                  {Object.values(receiveQuantities).reduce((acc, q) => acc + q, 0)} units
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E3E1DA]">
                <Button variant="outline" onClick={() => setReceivingPO(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmReceive}
                  isLoading={receiveItemsMutation.isPending}
                  className="bg-[#173D32] hover:bg-[#122e26] text-white gap-1.5"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" /> Confirm &amp; Ingest Stock
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* CREATE / EDIT SUPPLIER MODAL */}
      {isSupplierModalOpen && (
        <Dialog open={isSupplierModalOpen} onOpenChange={setIsSupplierModalOpen}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#173D32]">
                <Building2 className="w-5 h-5" />
                <span>{editingSupplier ? 'Edit Supplier' : 'Register New Supplier'}</span>
              </DialogTitle>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!supplierForm.name.trim()) {
                  toast.error('Supplier name is required.');
                  return;
                }
                supplierMutation.mutate();
              }}
              className="space-y-3 pt-2 text-xs"
            >
              <div className="space-y-1">
                <label className="font-semibold text-[#202521]">Supplier Name *</label>
                <Input
                  required
                  placeholder="e.g. Acme Industrial Corp"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-[#202521]">Contact Person</label>
                  <Input
                    placeholder="e.g. John Doe"
                    value={supplierForm.contact_person}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, contact_person: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-[#202521]">Phone Number</label>
                  <Input
                    placeholder="e.g. 9876543210"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-[#202521]">Email Address</label>
                  <Input
                    type="email"
                    placeholder="e.g. orders@acme.com"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-[#202521]">GSTIN</label>
                  <Input
                    placeholder="e.g. 29ABCDE1234F1Z5"
                    value={supplierForm.gstin}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, gstin: e.target.value.toUpperCase() })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#202521]">Address</label>
                <Input
                  placeholder="Factory / Office Address"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="supplier_active"
                  checked={supplierForm.is_active}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, is_active: e.target.checked })
                  }
                  className="rounded border-[#E3E1DA]"
                />
                <label htmlFor="supplier_active" className="font-medium text-[#202521]">
                  Active for new purchase orders
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E3E1DA]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSupplierModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={supplierMutation.isPending}
                  className="bg-[#173D32] text-white hover:bg-[#122e26]"
                >
                  Save Supplier
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
