import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import {
  StockTransfer,
  PaginatedResponse,
  Warehouse,
  StockLevel,
  TransferStatus,
} from '../types';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { formatDate } from '../lib/format';
import {
  ArrowLeftRight,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Truck,
  ArrowRight,
  Eye,
  Send,
  Check,
  Ban,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

export const TransfersPage: React.FC = () => {
  const { user, selectedWarehouseId } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'Admin';
  const userWarehouseId = user?.profile?.warehouse?.id;

  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming' | 'all'>('outgoing');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, number>>({});

  // Query Warehouses
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: () => apiRequest<PaginatedResponse<Warehouse>>('warehouses/?page_size=100'),
  });
  const warehouses = (warehousesData?.results || []).filter((w) => w.is_active);

  // Query Transfers
  const { data: transfersData, isLoading } = useQuery({
    queryKey: ['transfers', activeTab, statusFilter, searchQuery, selectedWarehouseId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeTab !== 'all') {
        params.append('direction', activeTab);
      }
      if (statusFilter) {
        params.append('status', statusFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      if (isAdmin && selectedWarehouseId) {
        params.append('warehouse', selectedWarehouseId.toString());
      }
      return apiRequest<PaginatedResponse<StockTransfer>>(`transfers/?${params.toString()}`);
    },
  });

  const transfers = transfersData?.results || [];

  // Metrics
  const inTransitCount = transfers.filter((t) => t.status === 'in_transit' || t.status === 'dispatched').length;
  const receivedCount = transfers.filter((t) => t.status === 'received').length;
  const withVarianceCount = transfers.filter((t) =>
    t.lines?.some((l) => (l.variance || 0) > 0)
  ).length;

  // Actions
  const dispatchMutation = useMutation({
    mutationFn: (transferId: number) =>
      apiRequest<StockTransfer>(`transfers/${transferId}/dispatch/`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Transfer successfully dispatched and stock deducted.');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setSelectedTransfer(null);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to dispatch transfer.');
    },
  });

  const receiveMutation = useMutation({
    mutationFn: ({ transferId, items }: { transferId: number; items: { product_id: number; received_quantity: number }[] }) =>
      apiRequest<StockTransfer>(`transfers/${transferId}/receive/`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
    onSuccess: (data) => {
      toast.success(`Transfer ${data.transfer_number} received into stock!`);
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['incoming-transfers-count'] });
      setIsReceiveOpen(false);
      setSelectedTransfer(null);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to confirm receipt.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (transferId: number) =>
      apiRequest<StockTransfer>(`transfers/${transferId}/cancel/`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Transfer cancelled. Any in-transit stock has been restored.');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setSelectedTransfer(null);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to cancel transfer.');
    },
  });

  const openReceiveModal = (transfer: StockTransfer) => {
    setSelectedTransfer(transfer);
    const initialMap: Record<number, number> = {};
    transfer.lines.forEach((l) => {
      const prodId = l.product?.id || (l as any).product_id;
      if (prodId) {
        initialMap[prodId] = l.dispatched_quantity;
      }
    });
    setReceiveQuantities(initialMap);
    setIsReceiveOpen(true);
  };

  const getStatusBadge = (status: TransferStatus) => {
    switch (status) {
      case 'in_transit':
      case 'dispatched':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Truck className="w-3 h-3 text-amber-600 animate-pulse" /> In Transit
          </span>
        );
      case 'received':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Received
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            <Clock className="w-3 h-3 text-gray-500" /> Draft
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <XCircle className="w-3 h-3 text-red-500" /> Cancelled
          </span>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-[#173D32]" />
            <h1 className="text-2xl font-bold tracking-tight text-[#202521]">Stock Transfers</h1>
          </div>
          <p className="text-sm text-[#5E6B63] mt-1">
            Dispatch inventory between hubs, track in-transit consignments, and reconcile received quantities
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[#173D32] text-white text-sm font-medium hover:bg-[#122e26] transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" /> Transfer Stock
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E3E1DA]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#5E6B63] uppercase tracking-wider">In Transit</p>
              <h3 className="text-2xl font-bold text-amber-700 mt-1">{inTransitCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
              <Truck className="w-5 h-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E3E1DA]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#5E6B63] uppercase tracking-wider">Received</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">{receivedCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E3E1DA]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#5E6B63] uppercase tracking-wider">With Shortfall</p>
              <h3 className="text-2xl font-bold text-red-600 mt-1">{withVarianceCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E3E1DA]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#5E6B63] uppercase tracking-wider">Total Consignments</p>
              <h3 className="text-2xl font-bold text-[#202521] mt-1">{transfers.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#F0EFEA] flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-[#173D32]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Filters */}
      <div className="bg-white border border-[#E3E1DA] rounded-lg shadow-xs overflow-hidden">
        <div className="border-b border-[#E3E1DA] flex flex-wrap items-center justify-between px-4 gap-2">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('outgoing')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'outgoing'
                  ? 'border-[#173D32] text-[#173D32]'
                  : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
              }`}
            >
              Outgoing Transfers
            </button>
            <button
              onClick={() => setActiveTab('incoming')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'incoming'
                  ? 'border-[#173D32] text-[#173D32]'
                  : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
              }`}
            >
              Incoming Transfers
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'all'
                  ? 'border-[#173D32] text-[#173D32]'
                  : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
              }`}
            >
              {isAdmin ? 'All Hub Transfers' : 'All My Transfers'}
            </button>
          </div>

          <div className="flex items-center gap-3 py-2">
            {/* Status Dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-[#5E6B63]">
              <Filter className="w-3.5 h-3.5" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border border-[#E3E1DA] bg-white px-2 text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="in_transit">In Transit</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#5E6B63]" />
              <input
                type="text"
                placeholder="Search transfer #, note, warehouse..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-3 w-56 rounded-md border border-[#E3E1DA] bg-white text-xs text-[#202521] placeholder:text-[#5E6B63] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
              />
            </div>
          </div>
        </div>

        {/* Transfers Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F8F5] text-[#5E6B63] font-semibold border-b border-[#E3E1DA]">
              <tr>
                <th className="py-3 px-4">Transfer #</th>
                <th className="py-3 px-4">Route</th>
                <th className="py-3 px-4">Items Sent</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Variance</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E1DA] text-[#202521]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-[#5E6B63]">
                    Loading stock transfers...
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#5E6B63]">
                    <div className="flex flex-col items-center justify-center">
                      <Truck className="w-8 h-8 text-[#5E6B63] opacity-40 mb-2" />
                      <p className="text-sm font-medium">No stock transfers found</p>
                      <p className="text-xs text-[#5E6B63] mt-0.5">
                        Transfers dispatched between warehouses will appear here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                transfers.map((t) => {
                  const totalSent = t.lines?.reduce((sum, l) => sum + l.dispatched_quantity, 0) || 0;
                  const totalVariance = t.lines?.reduce((sum, l) => sum + (l.variance || 0), 0) || 0;
                  const canReceive =
                    (t.status === 'in_transit' || t.status === 'dispatched') &&
                    (isAdmin || userWarehouseId === t.to_warehouse);
                  const canDispatch =
                    t.status === 'draft' && (isAdmin || userWarehouseId === t.from_warehouse);
                  const canCancel =
                    (t.status === 'draft' || t.status === 'in_transit' || t.status === 'dispatched') &&
                    (isAdmin || userWarehouseId === t.from_warehouse || userWarehouseId === t.to_warehouse);

                  return (
                    <tr key={t.id} className="hover:bg-[#F8F8F5]/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-[#173D32]">
                        <button
                          onClick={() => setSelectedTransfer(t)}
                          className="hover:underline text-left"
                        >
                          {t.transfer_number}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span>{t.from_warehouse_name || `WH #${t.from_warehouse}`}</span>
                          <ArrowRight className="w-3 h-3 text-[#5E6B63]" />
                          <span className="text-[#173D32]">{t.to_warehouse_name || `WH #${t.to_warehouse}`}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold">{totalSent}</span> units across{' '}
                        <span className="text-[#5E6B63]">({t.lines?.length || 0} items)</span>
                      </td>
                      <td className="py-3 px-4 text-[#5E6B63]">
                        {t.dispatched_at ? formatDate(t.dispatched_at) : formatDate(t.created_at)}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(t.status)}</td>
                      <td className="py-3 px-4">
                        {totalVariance > 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">
                            <AlertTriangle className="w-3 h-3 text-red-500" /> -{totalVariance} shortfall
                          </span>
                        ) : t.status === 'received' ? (
                          <span className="text-emerald-700 font-medium">Reconciled</span>
                        ) : (
                          <span className="text-[#5E6B63]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedTransfer(t)}
                            title="View Timeline & Details"
                            className="p-1.5 rounded text-[#5E6B63] hover:text-[#202521] hover:bg-[#F0EFEA] transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {canReceive && (
                            <button
                              onClick={() => openReceiveModal(t)}
                              title="Confirm Receipt"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#173D32] text-white text-xs font-semibold hover:bg-[#122e26] transition-colors shadow-xs"
                            >
                              <Check className="w-3 h-3" /> Receive
                            </button>
                          )}

                          {canDispatch && (
                            <button
                              onClick={() => dispatchMutation.mutate(t.id)}
                              disabled={dispatchMutation.isPending}
                              title="Dispatch Now"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#173D32] text-white text-xs font-semibold hover:bg-[#122e26] transition-colors shadow-xs"
                            >
                              <Send className="w-3 h-3" /> Dispatch
                            </button>
                          )}

                          {canCancel && (
                            <button
                              onClick={() => {
                                if (window.confirm('Are you sure you want to cancel this transfer?')) {
                                  cancelMutation.mutate(t.id);
                                }
                              }}
                              disabled={cancelMutation.isPending}
                              title="Cancel Transfer"
                              className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE TRANSFER DIALOG */}
      {isCreateOpen && (
        <CreateTransferDialog
          warehouses={warehouses}
          isAdmin={isAdmin}
          userWarehouseId={userWarehouseId}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            setIsCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['stock'] });
          }}
        />
      )}

      {/* DETAIL MODAL / TIMELINE */}
      {selectedTransfer && !isReceiveOpen && (
        <TransferDetailModal
          transfer={selectedTransfer}
          isAdmin={isAdmin}
          userWarehouseId={userWarehouseId}
          onClose={() => setSelectedTransfer(null)}
          onReceive={() => openReceiveModal(selectedTransfer)}
          onDispatch={() => dispatchMutation.mutate(selectedTransfer.id)}
          onCancel={() => {
            if (window.confirm('Are you sure you want to cancel this transfer?')) {
              cancelMutation.mutate(selectedTransfer.id);
            }
          }}
        />
      )}

      {/* RECEIVE MODAL */}
      {isReceiveOpen && selectedTransfer && (
        <ReceiveTransferModal
          transfer={selectedTransfer}
          receiveQuantities={receiveQuantities}
          setReceiveQuantities={setReceiveQuantities}
          isLoading={receiveMutation.isPending}
          onClose={() => setIsReceiveOpen(false)}
          onConfirm={() => {
            const items = Object.entries(receiveQuantities).map(([productId, qty]) => ({
              product_id: parseInt(productId, 10),
              received_quantity: qty,
            }));
            receiveMutation.mutate({ transferId: selectedTransfer.id, items });
          }}
        />
      )}
    </div>
  );
};

/* --- CREATE TRANSFER DIALOG --- */
interface CreateTransferDialogProps {
  warehouses: Warehouse[];
  isAdmin: boolean;
  userWarehouseId?: number;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateTransferDialog: React.FC<CreateTransferDialogProps> = ({
  warehouses,
  isAdmin,
  userWarehouseId,
  onClose,
  onSuccess,
}) => {
  const [fromWarehouseId, setFromWarehouseId] = useState<number>(
    userWarehouseId || (warehouses[0]?.id ?? 0)
  );
  const [toWarehouseId, setToWarehouseId] = useState<number>(() => {
    const candidate = warehouses.find((w) => w.id !== (userWarehouseId || warehouses[0]?.id));
    return candidate?.id ?? 0;
  });
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ product_id: number; quantity: number }[]>([
    { product_id: 0, quantity: 1 },
  ]);

  // Query stock levels in the source warehouse to display available quantity
  const { data: sourceStockData } = useQuery({
    queryKey: ['source-stock', fromWarehouseId],
    queryFn: () => apiRequest<PaginatedResponse<StockLevel>>(`stock/?warehouse=${fromWarehouseId}&page_size=200`),
    enabled: !!fromWarehouseId,
  });

  const availableStocks = sourceStockData?.results || [];

  const createMutation = useMutation({
    mutationFn: (isDraft: boolean) => {
      if (!fromWarehouseId || !toWarehouseId) {
        throw new Error('Please select both source and destination warehouses.');
      }
      if (fromWarehouseId === toWarehouseId) {
        throw new Error('Source and destination warehouses cannot be the same.');
      }
      const validLines = lines.filter((l) => l.product_id > 0 && l.quantity > 0);
      if (validLines.length === 0) {
        throw new Error('Please add at least one product with a valid transfer quantity.');
      }

      return apiRequest<StockTransfer>('transfers/', {
        method: 'POST',
        body: JSON.stringify({
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          notes,
          is_draft: isDraft,
          lines: validLines,
        }),
      });
    },
    onSuccess: (data) => {
      toast.success(
        data.status === 'draft'
          ? 'Transfer saved as draft.'
          : `Transfer ${data.transfer_number} dispatched successfully!`
      );
      onSuccess();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create transfer.');
    },
  });

  const handleAddLine = () => {
    setLines([...lines, { product_id: 0, quantity: 1 }]);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: 'product_id' | 'quantity', value: number) => {
    const updated = [...lines];
    updated[index][field] = value;
    setLines(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E3E1DA] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#202521]">New Stock Transfer</h2>
            <p className="text-xs text-[#5E6B63] mt-0.5">
              Consign inventory from source warehouse to destination hub
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#5E6B63] hover:text-[#202521] text-lg font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Warehouses Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#202521] mb-1">
                Source Warehouse (From)
              </label>
              {isAdmin ? (
                <select
                  value={fromWarehouseId}
                  onChange={(e) => {
                    const newFrom = Number(e.target.value);
                    setFromWarehouseId(newFrom);
                    if (newFrom === toWarehouseId) {
                      const next = warehouses.find((w) => w.id !== newFrom);
                      if (next) setToWarehouseId(next.id);
                    }
                  }}
                  className="w-full h-9 rounded-md border border-[#E3E1DA] bg-white px-3 text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="h-9 px-3 rounded-md border border-[#E3E1DA] bg-[#F8F8F5] flex items-center text-xs font-medium text-[#202521]">
                  {warehouses.find((w) => w.id === fromWarehouseId)?.name || 'Assigned Warehouse'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202521] mb-1">
                Destination Warehouse (To)
              </label>
              <select
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-[#E3E1DA] bg-white px-3 text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
              >
                {warehouses
                  .filter((w) => w.id !== fromWarehouseId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Line Items Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#202521]">Transfer Items</label>
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#173D32] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Add Another Item
              </button>
            </div>

            <div className="space-y-2 border border-[#E3E1DA] rounded-lg p-3 bg-[#F8F8F5]">
              {lines.map((line, idx) => {
                const stockItem = availableStocks.find((s) => s.product.id === line.product_id);
                const availableQty = stockItem ? stockItem.quantity : 0;
                const isOver = line.quantity > availableQty;

                return (
                  <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-white p-2.5 rounded border border-[#E3E1DA]">
                    <div className="flex-1 w-full sm:w-auto">
                      <select
                        value={line.product_id}
                        onChange={(e) => handleLineChange(idx, 'product_id', Number(e.target.value))}
                        className="w-full h-8 rounded border border-[#E3E1DA] bg-white px-2 text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                      >
                        <option value={0}>Select a product...</option>
                        {availableStocks.map((s) => (
                          <option key={s.product.id} value={s.product.id}>
                            {s.product.name} ({s.product.sku}) — Available: {s.quantity}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="w-24">
                        <input
                          type="number"
                          min={1}
                          max={availableQty > 0 ? availableQty : undefined}
                          value={line.quantity}
                          onChange={(e) => handleLineChange(idx, 'quantity', Number(e.target.value))}
                          placeholder="Qty"
                          className={`w-full h-8 px-2 rounded border text-xs font-semibold text-center focus:outline-none focus:ring-1 ${
                            isOver ? 'border-red-500 text-red-600 focus:ring-red-500' : 'border-[#E3E1DA] text-[#202521] focus:ring-[#173D32]'
                          }`}
                        />
                      </div>

                      <div className="text-[11px] text-[#5E6B63] w-28 text-right">
                        Available: <span className="font-semibold text-[#202521]">{availableQty}</span>
                      </div>

                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {isOver && (
                      <p className="text-[11px] text-red-600 font-medium w-full">
                        Requested quantity exceeds available stock ({availableQty} units).
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#202521] mb-1">
              Transfer Notes / Reason (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Stock balancing for Diwali rush, seasonal replenishment..."
              className="w-full rounded-md border border-[#E3E1DA] bg-white p-2 text-xs text-[#202521] placeholder:text-[#5E6B63] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#E3E1DA] bg-[#F8F8F5] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded text-xs font-medium text-[#5E6B63] hover:text-[#202521]"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => createMutation.mutate(true)}
              disabled={createMutation.isPending}
              className="h-8 px-3 rounded border border-[#E3E1DA] bg-white text-xs font-semibold text-[#202521] hover:bg-[#F0EFEA] transition-colors"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate(false)}
              disabled={createMutation.isPending}
              className="h-8 px-4 rounded bg-[#173D32] text-xs font-semibold text-white hover:bg-[#122e26] transition-colors shadow-xs"
            >
              {createMutation.isPending ? 'Processing...' : 'Dispatch Immediately'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* --- DETAIL & TIMELINE MODAL --- */
interface TransferDetailModalProps {
  transfer: StockTransfer;
  isAdmin: boolean;
  userWarehouseId?: number;
  onClose: () => void;
  onReceive: () => void;
  onDispatch: () => void;
  onCancel: () => void;
}

const TransferDetailModal: React.FC<TransferDetailModalProps> = ({
  transfer,
  isAdmin,
  userWarehouseId,
  onClose,
  onReceive,
  onDispatch,
  onCancel,
}) => {
  const canReceive =
    (transfer.status === 'in_transit' || transfer.status === 'dispatched') &&
    (isAdmin || userWarehouseId === transfer.to_warehouse);
  const canDispatch =
    transfer.status === 'draft' && (isAdmin || userWarehouseId === transfer.from_warehouse);
  const canCancel =
    (transfer.status === 'draft' || transfer.status === 'in_transit' || transfer.status === 'dispatched') &&
    (isAdmin || userWarehouseId === transfer.from_warehouse || userWarehouseId === transfer.to_warehouse);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E3E1DA] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-[#173D32] bg-[#E6F2EA] px-2 py-0.5 rounded">
                {transfer.transfer_number}
              </span>
              <Badge variant={transfer.status === 'received' ? 'success' : transfer.status === 'cancelled' ? 'error' : 'warning'}>
                {transfer.status.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-[#5E6B63]">
              <span>{transfer.from_warehouse_name}</span>
              <ArrowRight className="w-3 h-3 text-[#173D32]" />
              <span className="font-semibold text-[#202521]">{transfer.to_warehouse_name}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-[#5E6B63] hover:text-[#202521] text-lg font-bold">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Timeline Visualizer */}
          <div className="bg-[#F8F8F5] p-4 rounded-lg border border-[#E3E1DA]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#5E6B63] mb-4">
              Consignment Status Timeline
            </h4>
            <div className="relative flex items-center justify-between">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 w-full bg-[#E3E1DA] -z-0" />

              {/* Step 1: Draft/Created */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-[#173D32] text-white flex items-center justify-center text-xs font-bold">
                  ✓
                </div>
                <span className="text-[11px] font-semibold text-[#202521] mt-1.5">Created</span>
                <span className="text-[10px] text-[#5E6B63]">{formatDate(transfer.created_at)}</span>
              </div>

              {/* Step 2: Dispatched */}
              <div className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    transfer.dispatched_at
                      ? 'bg-[#173D32] text-white'
                      : 'bg-white border-2 border-[#E3E1DA] text-[#5E6B63]'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-[#202521] mt-1.5">Dispatched</span>
                <span className="text-[10px] text-[#5E6B63]">
                  {transfer.dispatched_at ? formatDate(transfer.dispatched_at) : 'Pending'}
                </span>
              </div>

              {/* Step 3: Received or Cancelled */}
              <div className="relative z-10 flex flex-col items-center">
                {transfer.status === 'cancelled' ? (
                  <>
                    <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold">
                      ✕
                    </div>
                    <span className="text-[11px] font-semibold text-red-600 mt-1.5">Cancelled</span>
                  </>
                ) : (
                  <>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        transfer.received_at
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border-2 border-[#E3E1DA] text-[#5E6B63]'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#202521] mt-1.5">Received</span>
                    <span className="text-[10px] text-[#5E6B63]">
                      {transfer.received_at ? formatDate(transfer.received_at) : 'In Transit'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Line Items Breakdown */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#5E6B63] mb-2">
              Consignment Line Items
            </h4>
            <div className="border border-[#E3E1DA] rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F8F5] text-[#5E6B63] font-semibold border-b border-[#E3E1DA]">
                  <tr>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3 text-right">Dispatched</th>
                    <th className="py-2.5 px-3 text-right">Received</th>
                    <th className="py-2.5 px-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E1DA]">
                  {transfer.lines?.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2.5 px-3 font-medium text-[#202521]">
                        {line.product_name || line.product?.name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#5E6B63]">
                        {line.product_sku || line.product?.sku}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[#202521]">
                        {line.dispatched_quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[#173D32]">
                        {transfer.status === 'received' ? line.received_quantity : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold">
                        {line.variance > 0 ? (
                          <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded text-[11px]">
                            -{line.variance} shortfall
                          </span>
                        ) : transfer.status === 'received' ? (
                          <span className="text-emerald-700">0</span>
                        ) : (
                          <span className="text-[#5E6B63]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Additional details */}
          {transfer.notes && (
            <div className="text-xs bg-[#F8F8F5] p-3 rounded border border-[#E3E1DA]">
              <span className="font-semibold text-[#202521]">Notes: </span>
              <span className="text-[#5E6B63]">{transfer.notes}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 border-t border-[#E3E1DA] bg-[#F8F8F5] flex items-center justify-between">
          <button
            onClick={onClose}
            className="h-8 px-3 rounded text-xs font-medium text-[#5E6B63] hover:text-[#202521]"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {canCancel && (
              <button
                onClick={onCancel}
                className="h-8 px-3 rounded border border-red-200 text-red-600 bg-red-50 text-xs font-semibold hover:bg-red-100 transition-colors"
              >
                Cancel Transfer
              </button>
            )}

            {canDispatch && (
              <button
                onClick={onDispatch}
                className="h-8 px-4 rounded bg-[#173D32] text-xs font-semibold text-white hover:bg-[#122e26] transition-colors shadow-xs"
              >
                Dispatch Draft
              </button>
            )}

            {canReceive && (
              <button
                onClick={onReceive}
                className="h-8 px-4 rounded bg-[#173D32] text-xs font-semibold text-white hover:bg-[#122e26] transition-colors shadow-xs"
              >
                Confirm Receipt
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* --- RECEIVE TRANSFER MODAL --- */
interface ReceiveTransferModalProps {
  transfer: StockTransfer;
  receiveQuantities: Record<number, number>;
  setReceiveQuantities: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ReceiveTransferModal: React.FC<ReceiveTransferModalProps> = ({
  transfer,
  receiveQuantities,
  setReceiveQuantities,
  isLoading,
  onClose,
  onConfirm,
}) => {
  const hasShortfall = transfer.lines.some((l) => {
    const prodId = l.product?.id || (l as any).product_id;
    const rQty = receiveQuantities[prodId] ?? l.dispatched_quantity;
    return rQty < l.dispatched_quantity;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95">
        <div className="px-6 py-4 border-b border-[#E3E1DA] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#202521]">Reconcile & Confirm Stock Receipt</h3>
            <p className="text-xs text-[#5E6B63] mt-0.5">
              Receiving into <strong className="text-[#173D32]">{transfer.to_warehouse_name}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-[#5E6B63] hover:text-[#202521] text-lg font-bold">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-[#5E6B63]">
            Confirm the actual physical count of goods received. Any difference from the sent quantity
            will be recorded as a transit shortfall variance and not added to stock.
          </p>

          <div className="border border-[#E3E1DA] rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F8F5] text-[#5E6B63] font-semibold border-b border-[#E3E1DA]">
                <tr>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3 text-center">Sent</th>
                  <th className="py-2.5 px-3 text-right">Received Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1DA]">
                {transfer.lines.map((l) => {
                  const prodId = l.product?.id || (l as any).product_id;
                  const currentVal = receiveQuantities[prodId] ?? l.dispatched_quantity;
                  const variance = l.dispatched_quantity - currentVal;

                  return (
                    <tr key={l.id}>
                      <td className="py-2.5 px-3 font-medium text-[#202521]">
                        {l.product_name || l.product?.name}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-[#5E6B63]">
                        {l.dispatched_quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            min={0}
                            max={l.dispatched_quantity}
                            value={currentVal}
                            onChange={(e) => {
                              const val = Math.min(
                                l.dispatched_quantity,
                                Math.max(0, parseInt(e.target.value, 10) || 0)
                              );
                              setReceiveQuantities((prev) => ({
                                ...prev,
                                [prodId]: val,
                              }));
                            }}
                            className="w-20 h-8 px-2 text-center rounded border border-[#E3E1DA] text-xs font-bold text-[#173D32] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                          />
                        </div>
                        {variance > 0 && (
                          <span className="text-[10px] text-red-600 font-semibold block mt-0.5">
                            -{variance} shortfall
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasShortfall && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-md text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Shortfall Detected</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  The missing units will be permanently logged in the variance ledger. Only the confirmed
                  physical quantity will be credited to destination stock.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-[#E3E1DA] bg-[#F8F8F5] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded text-xs font-medium text-[#5E6B63] hover:text-[#202521]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="h-8 px-4 rounded bg-[#173D32] text-xs font-semibold text-white hover:bg-[#122e26] transition-colors shadow-xs"
          >
            {isLoading ? 'Reconciling...' : 'Confirm & Add to Stock'}
          </button>
        </div>
      </div>
    </div>
  );
};
