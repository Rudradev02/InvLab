import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { Sale, StockLevel, PaginatedResponse, SaleReturn } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { formatCurrency, formatDate } from '../lib/format';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  RotateCcw,
  Eye,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';

interface CartLine {
  productId: number;
  productName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  availableStock: number;
}

export const SalesPage: React.FC = () => {
  const { user, selectedWarehouseId } = useAuth();
  const queryClient = useQueryClient();
  const isManagerOrAdmin = user?.role === 'Admin' || user?.role === 'Warehouse Manager';

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [addQuantity, setAddQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  // Modals state
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [returnDialogSale, setReturnDialogSale] = useState<Sale | null>(null);
  const [completedReturn, setCompletedReturn] = useState<SaleReturn | null>(null);

  // Return form state
  const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({});
  const [returnReason, setReturnReason] = useState<string>('');
  const [refundMethod, setRefundMethod] = useState<string>('cash');

  // Query stock in active warehouse
  const { data: stockData } = useQuery({
    queryKey: ['sales-stock', selectedWarehouseId],
    queryFn: () => {
      const q = selectedWarehouseId ? `?warehouse=${selectedWarehouseId}` : '';
      return apiRequest<PaginatedResponse<StockLevel>>(`stock/${q}`);
    },
  });

  // Query recent sales
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['sales', selectedWarehouseId],
    queryFn: () => {
      const q = selectedWarehouseId ? `?warehouse=${selectedWarehouseId}` : '';
      return apiRequest<PaginatedResponse<Sale>>(`sales/${q}`);
    },
  });

  const availableStock = stockData?.results || [];
  const salesList = salesData?.results || [];

  const handleAddToCart = () => {
    if (!selectedProductId) return;
    const stockItem = availableStock.find((s) => s.product.id === Number(selectedProductId));
    if (!stockItem) return;

    if (addQuantity <= 0) {
      toast.error('Quantity must be greater than zero');
      return;
    }

    if (stockItem.quantity < addQuantity) {
      toast.error(`Only ${stockItem.quantity} units available in stock.`);
      return;
    }

    // Check if already in cart
    const existingIndex = cart.findIndex((c) => c.productId === stockItem.product.id);
    if (existingIndex > -1) {
      const updated = [...cart];
      const newQty = updated[existingIndex].quantity + addQuantity;
      if (stockItem.quantity < newQty) {
        toast.error(`Cannot exceed ${stockItem.quantity} units available in stock.`);
        return;
      }
      updated[existingIndex].quantity = newQty;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          productId: stockItem.product.id,
          productName: stockItem.product.name,
          sku: stockItem.product.sku,
          unitPrice: parseFloat(stockItem.product.price),
          quantity: addQuantity,
          availableStock: stockItem.quantity,
        },
      ]);
    }

    setSelectedProductId('');
    setAddQuantity(1);
  };

  const handleRemoveFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const cartTotal = cart.reduce((acc, line) => acc + line.unitPrice * line.quantity, 0);

  // Create Sale Mutation
  const createSaleMutation = useMutation({
    mutationFn: () => {
      const idempotencyKey = crypto.randomUUID();
      return apiRequest<Sale>('sales/', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          warehouse_id: selectedWarehouseId,
          notes,
          lines: cart.map((line) => ({
            product_id: line.productId,
            quantity: line.quantity,
          })),
        }),
      });
    },
    onSuccess: (data) => {
      toast.success(`Sale ${data.sale_number} recorded successfully!`);
      setCart([]);
      setNotes('');
      setCompletedSale(data);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to record sale.');
    },
  });

  // Process Return Mutation
  const processReturnMutation = useMutation({
    mutationFn: ({ saleId, payload }: { saleId: number; payload: any }) =>
      apiRequest<SaleReturn>(`sales/${saleId}/return_items/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      toast.success(`Return voucher ${data.return_number} processed! Stock restored.`);
      setReturnDialogSale(null);
      setViewingSale(null);
      setCompletedReturn(data);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['sales-stock'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to process return.');
    },
  });

  const openReturnDialog = (sale: Sale) => {
    setReturnDialogSale(sale);
    const initialMap: Record<number, number> = {};
    sale.lines.forEach((l) => {
      initialMap[l.id] = 0;
    });
    setReturnQuantities(initialMap);
    setReturnReason('');
    setRefundMethod('cash');
  };

  const handleConfirmReturn = () => {
    if (!returnDialogSale) return;
    const linesToReturn = Object.entries(returnQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, qty]) => ({
        sale_line_id: parseInt(lineId, 10),
        quantity: qty,
      }));

    if (linesToReturn.length === 0) {
      toast.error('Please specify a return quantity of at least 1 unit.');
      return;
    }

    processReturnMutation.mutate({
      saleId: returnDialogSale.id,
      payload: {
        lines: linesToReturn,
        reason: returnReason,
        refund_method: refundMethod,
      },
    });
  };

  const getReturnStatusBadge = (sale: Sale) => {
    if (sale.return_status === 'fully_returned') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
          Returned
        </span>
      );
    }
    if (sale.return_status === 'partially_returned') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          Partially Returned
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        Completed
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-[#173D32]" />
            <h1 className="text-2xl font-bold tracking-tight text-[#202521]">Point of Sale &amp; Billing</h1>
          </div>
          <p className="text-sm text-[#5E6B63] mt-1">
            Dispatch counter sales, print invoices, and process customer returns with automatic ledger reconciliation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Selection & Cart */}
        <div className="lg:col-span-8 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Select Products for Sale</span>
                <span className="text-xs font-normal text-[#5E6B63]">
                  Stock reflects active warehouse
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-8 space-y-1.5">
                  <label className="text-xs font-medium text-[#202521]">Product Catalog</label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-[#E3E1DA] bg-white text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                  >
                    <option value="">-- Choose item to add --</option>
                    {availableStock.map((s) => (
                      <option
                        key={s.product.id}
                        value={s.product.id}
                        disabled={s.quantity <= 0}
                      >
                        {s.product.name} ({s.product.sku}) - {formatCurrency(s.product.price)} [{s.quantity} in stock]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-[#202521]">Quantity</label>
                  <Input
                    type="number"
                    min={1}
                    value={addQuantity}
                    onChange={(e) => setAddQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-10 text-center"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={!selectedProductId}
                    className="w-full h-10 gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </Button>
                </div>
              </div>

              {/* Cart Table */}
              <div className="border border-[#E3E1DA] rounded-lg overflow-hidden mt-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F8F8F5] text-[#5E6B63] border-b border-[#E3E1DA]">
                      <th className="py-2 px-3 font-semibold">SKU</th>
                      <th className="py-2 px-3 font-semibold">Item</th>
                      <th className="py-2 px-3 font-semibold text-right">Price</th>
                      <th className="py-2 px-3 font-semibold text-center">Qty</th>
                      <th className="py-2 px-3 font-semibold text-right">Subtotal</th>
                      <th className="py-2 px-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]/60">
                    {cart.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[#5E6B63]">
                          No items added to current sale ticket.
                        </td>
                      </tr>
                    ) : (
                      cart.map((line, idx) => (
                        <tr key={line.productId} className="hover:bg-[#F8F8F5]/50">
                          <td className="py-2 px-3 font-mono font-medium text-[#173D32]">
                            {line.sku}
                          </td>
                          <td className="py-2 px-3 font-medium text-[#202521]">
                            {line.productName}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {formatCurrency(line.unitPrice)}
                          </td>
                          <td className="py-2 px-3 text-center font-semibold">
                            {line.quantity}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-[#173D32] tabular-nums">
                            {formatCurrency(line.unitPrice * line.quantity)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(idx)}
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
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Checkout & Billing */}
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sale Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-[#F8F8F5] p-4 rounded-lg space-y-2 border border-[#E3E1DA]">
                <div className="flex justify-between text-xs text-[#5E6B63]">
                  <span>Items in Ticket</span>
                  <span className="font-semibold text-[#202521]">{cart.length} distinct items</span>
                </div>
                <div className="flex justify-between text-xs text-[#5E6B63]">
                  <span>Total Units</span>
                  <span className="font-semibold text-[#202521]">
                    {cart.reduce((sum, l) => sum + l.quantity, 0)} units
                  </span>
                </div>
                <div className="border-t border-[#E3E1DA] pt-2 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-[#202521]">Total Due:</span>
                  <span className="text-xl font-extrabold text-[#173D32] tabular-nums">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#202521]">Order Notes / Reference</label>
                <Input
                  placeholder="Optional customer name, PO #..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button
                type="button"
                className="w-full h-11 text-sm font-semibold"
                disabled={cart.length === 0}
                isLoading={createSaleMutation.isPending}
                onClick={() => createSaleMutation.mutate()}
              >
                Confirm Sale &amp; Deduct Stock
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sales History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Sales History</CardTitle>
          <span className="text-xs text-[#5E6B63]">
            {user?.role === 'Staff' ? 'Your counter transactions' : 'All warehouse sales'}
          </span>
        </CardHeader>
        <div className="overflow-x-auto">
          {salesLoading ? (
            <div className="p-8 text-center text-sm text-[#5E6B63]">Loading sales...</div>
          ) : salesList.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#5E6B63]">No past sales recorded.</div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                  <th className="py-2.5 px-4 font-semibold">Sale Number</th>
                  <th className="py-2.5 px-4 font-semibold">Warehouse</th>
                  <th className="py-2.5 px-4 font-semibold">Cashier</th>
                  <th className="py-2.5 px-4 font-semibold">Lines</th>
                  <th className="py-2.5 px-4 font-semibold">Date &amp; Time</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Net / Total</th>
                  <th className="py-2.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1DA]/60">
                {salesList.map((sale) => {
                  const hasRefund = parseFloat(sale.total_refunded || '0') > 0;
                  const canReturn = isManagerOrAdmin && sale.return_status !== 'fully_returned';

                  return (
                    <tr key={sale.id} className="hover:bg-[#F8F8F5]">
                      <td className="py-3 px-4 font-mono font-bold text-[#173D32]">
                        <button
                          onClick={() => setViewingSale(sale)}
                          className="hover:underline text-left"
                        >
                          {sale.sale_number}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-[#5E6B63] font-medium">{sale.warehouse_code}</td>
                      <td className="py-3 px-4 text-[#202521] font-medium">{sale.cashier_name}</td>
                      <td className="py-3 px-4 text-[#5E6B63] tabular-nums">
                        {sale.lines.length} items
                      </td>
                      <td className="py-3 px-4 text-[#5E6B63]">{formatDate(sale.created_at)}</td>
                      <td className="py-3 px-4">{getReturnStatusBadge(sale)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {hasRefund ? (
                          <div>
                            <div className="font-bold text-[#173D32]">
                              {formatCurrency(sale.net_total || sale.total_amount)}
                            </div>
                            <div className="text-[10px] text-[#5E6B63] line-through">
                              {formatCurrency(sale.total_amount)}
                            </div>
                          </div>
                        ) : (
                          <div className="font-bold text-[#202521]">
                            {formatCurrency(sale.total_amount)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="View Detail"
                            onClick={() => setViewingSale(sale)}
                            className="text-[#173D32] hover:bg-[#E6F2EA] p-1.5 h-8"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          {canReturn && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Process Return"
                              onClick={() => openReturnDialog(sale)}
                              className="text-amber-700 hover:bg-amber-50 p-1.5 h-8"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            title="Print Receipt"
                            onClick={() => setCompletedSale(sale)}
                            className="text-[#5E6B63] hover:text-[#202521] hover:bg-[#E3E1DA]/50 p-1.5 h-8"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
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

      {/* SALE DETAIL DIALOG */}
      {viewingSale && (
        <Dialog open={!!viewingSale} onOpenChange={() => setViewingSale(null)}>
          <DialogContent className="max-w-2xl bg-white">
            <DialogHeader>
              <div className="flex items-center justify-between border-b border-[#E3E1DA] pb-3">
                <div>
                  <DialogTitle className="text-base flex items-center gap-2">
                    <span>Sale {viewingSale.sale_number}</span>
                    {getReturnStatusBadge(viewingSale)}
                  </DialogTitle>
                  <p className="text-xs text-[#5E6B63] mt-0.5">
                    {viewingSale.warehouse_name} • Cashier: {viewingSale.cashier_name} • {formatDate(viewingSale.created_at)}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs text-[#202521] max-h-[70vh] overflow-y-auto">
              {/* Lines Table */}
              <div className="border border-[#E3E1DA] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F8F8F5] text-[#5E6B63] border-b border-[#E3E1DA]">
                    <tr>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3 text-center">Sold</th>
                      <th className="py-2.5 px-3 text-center">Returned</th>
                      <th className="py-2.5 px-3 text-center">Returnable</th>
                      <th className="py-2.5 px-3 text-right">Price</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]">
                    {viewingSale.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold">{l.product_name}</div>
                          <div className="text-[11px] font-mono text-[#5E6B63]">{l.product_sku}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-medium">{l.quantity}</td>
                        <td className="py-2.5 px-3 text-center text-red-600 font-semibold">
                          {l.returned_quantity || 0}
                        </td>
                        <td className="py-2.5 px-3 text-center text-[#173D32] font-bold">
                          {l.returnable_quantity ?? l.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(l.unit_price)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums">{formatCurrency(l.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals */}
              <div className="bg-[#F8F8F5] p-3 rounded-lg border border-[#E3E1DA] space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#5E6B63]">Gross Total:</span>
                  <span className="font-semibold">{formatCurrency(viewingSale.total_amount)}</span>
                </div>
                {parseFloat(viewingSale.total_refunded || '0') > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Total Refunded:</span>
                    <span className="font-semibold">-{formatCurrency(viewingSale.total_refunded || '0')}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm border-t border-[#E3E1DA] pt-1">
                  <span>Net Amount:</span>
                  <span className="text-[#173D32]">
                    {formatCurrency(viewingSale.net_total || viewingSale.total_amount)}
                  </span>
                </div>
              </div>

              {/* Return Vouchers History */}
              {viewingSale.returns && viewingSale.returns.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#5E6B63] uppercase tracking-wider">
                    Associated Return Vouchers
                  </h4>
                  <div className="space-y-1.5">
                    {viewingSale.returns.map((ret) => (
                      <div
                        key={ret.id}
                        className="p-2.5 bg-red-50/50 border border-red-200/60 rounded flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-mono font-bold text-[#173D32]">{ret.return_number}</div>
                          <div className="text-[11px] text-[#5E6B63]">
                            {formatDate(ret.created_at)} • Method: {ret.refund_method} {ret.reason && `• "${ret.reason}"`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-red-600">
                            -{formatCurrency(ret.total_refund_amount)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCompletedReturn(ret)}
                            className="h-7 text-xs gap-1"
                          >
                            <Printer className="w-3 h-3" /> Voucher
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-2 flex justify-between gap-2 border-t border-[#E3E1DA]">
                <Button variant="outline" onClick={() => setViewingSale(null)}>
                  Close
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCompletedSale(viewingSale);
                    }}
                    className="gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Sale Receipt
                  </Button>

                  {isManagerOrAdmin && viewingSale.return_status !== 'fully_returned' && (
                    <Button
                      onClick={() => openReturnDialog(viewingSale)}
                      className="gap-1.5 bg-amber-800 hover:bg-amber-900 text-white"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Return Items
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* RETURN ITEMS DIALOG */}
      {returnDialogSale && (
        <Dialog open={!!returnDialogSale} onOpenChange={() => setReturnDialogSale(null)}>
          <DialogContent className="max-w-lg bg-white">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-700" />
                <span>Return Items for Sale {returnDialogSale.sale_number}</span>
              </DialogTitle>
              <p className="text-xs text-[#5E6B63]">
                Restores item stock to {returnDialogSale.warehouse_name} and records refund in ledger
              </p>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              <div className="border border-[#E3E1DA] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F8F8F5] text-[#5E6B63] border-b border-[#E3E1DA]">
                    <tr>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-3 text-center">Max Returnable</th>
                      <th className="py-2 px-3 text-center">Return Qty</th>
                      <th className="py-2 px-3 text-right">Refund</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]">
                    {returnDialogSale.lines.map((l) => {
                      const maxReturnable = l.returnable_quantity ?? (l.quantity - (l.returned_quantity || 0));
                      const qty = returnQuantities[l.id] || 0;
                      const lineRefund = qty * parseFloat(l.unit_price);

                      return (
                        <tr key={l.id}>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#202521]">{l.product_name}</div>
                            <div className="text-[11px] text-[#5E6B63]">{formatCurrency(l.unit_price)} each</div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-[#173D32]">
                            {maxReturnable}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min={0}
                              max={maxReturnable}
                              disabled={maxReturnable <= 0}
                              value={qty}
                              onChange={(e) => {
                                const val = Math.min(
                                  maxReturnable,
                                  Math.max(0, parseInt(e.target.value, 10) || 0)
                                );
                                setReturnQuantities((prev) => ({
                                  ...prev,
                                  [l.id]: val,
                                }));
                              }}
                              className="w-16 h-8 text-center rounded border border-[#E3E1DA] text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-red-600 tabular-nums">
                            {formatCurrency(lineRefund)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Total Refund Preview */}
              <div className="bg-[#F8F8F5] p-3 rounded-lg border border-[#E3E1DA] flex justify-between items-center text-xs">
                <span className="font-semibold text-[#202521]">Calculated Refund Total:</span>
                <span className="font-extrabold text-base text-red-600 tabular-nums">
                  {formatCurrency(
                    returnDialogSale.lines.reduce((sum, l) => {
                      const qty = returnQuantities[l.id] || 0;
                      return sum + qty * parseFloat(l.unit_price);
                    }, 0)
                  )}
                </span>
              </div>

              {/* Refund Method & Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#202521]">Refund Method</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="w-full h-9 rounded border border-[#E3E1DA] bg-white px-2 text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                  >
                    <option value="cash">Cash</option>
                    <option value="original_payment">Original Payment Method</option>
                    <option value="store_credit">Store Credit</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#202521]">Reason for Return</label>
                  <input
                    type="text"
                    placeholder="e.g. Defective, Wrong Size, Buyer Remorse..."
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full h-9 rounded border border-[#E3E1DA] bg-white px-2 text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-between gap-2 border-t border-[#E3E1DA]">
                <Button variant="outline" onClick={() => setReturnDialogSale(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmReturn}
                  isLoading={processReturnMutation.isPending}
                  className="bg-[#173D32] hover:bg-[#122e26] text-white"
                >
                  Confirm &amp; Issue Refund
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* PRINTABLE RETURN RECEIPT */}
      {completedReturn && (
        <Dialog open={!!completedReturn} onOpenChange={() => setCompletedReturn(null)}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <div className="flex items-center gap-2 text-red-600">
                <Receipt className="w-5 h-5" />
                <DialogTitle>Return &amp; Refund Voucher</DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs text-[#202521]">
              <div className="border-b border-[#E3E1DA] pb-3 text-center">
                <div className="font-bold text-base text-[#173D32]">
                  {completedReturn.warehouse_name}
                </div>
                <div className="font-mono text-xs font-semibold text-[#202521] mt-0.5">
                  Voucher: {completedReturn.return_number}
                </div>
                <div className="text-[11px] text-[#5E6B63]">
                  Original Sale: {completedReturn.sale_number}
                </div>
                <div className="text-[11px] text-[#5E6B63]">
                  Date: {formatDate(completedReturn.created_at)}
                </div>
                <div className="text-[11px] text-[#5E6B63]">
                  Processed By: {completedReturn.processed_by_username}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 border-b border-[#E3E1DA] pb-3">
                {completedReturn.lines.map((line) => (
                  <div key={line.id} className="flex justify-between items-center text-xs">
                    <div>
                      <div className="font-semibold">{line.product_name}</div>
                      <div className="text-[11px] text-[#5E6B63]">
                        {line.quantity} units x {formatCurrency(line.unit_price)}
                      </div>
                    </div>
                    <div className="font-semibold text-red-600 tabular-nums">
                      -{formatCurrency(line.refund_amount)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Refunded */}
              <div className="flex justify-between items-center text-sm font-bold pt-1">
                <span>Total Refunded:</span>
                <span className="text-red-600 text-base tabular-nums">
                  -{formatCurrency(completedReturn.total_refund_amount)}
                </span>
              </div>
              <div className="text-[11px] text-[#5E6B63]">
                <span>Refund Method: </span>
                <strong className="text-[#202521] uppercase">{completedReturn.refund_method}</strong>
                {completedReturn.reason && (
                  <div className="mt-0.5">
                    <span>Reason: </span>
                    <span className="italic">{completedReturn.reason}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-2">
                <Button onClick={() => window.print()} className="w-full gap-2" variant="outline">
                  <Printer className="w-4 h-4" /> Print Return Receipt
                </Button>
                <Button onClick={() => setCompletedReturn(null)} className="w-full">
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Printable Sale Receipt Dialog */}
      <Dialog open={!!completedSale} onOpenChange={() => setCompletedSale(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <div className="flex items-center gap-2 text-[#2F7D4F]">
              <CheckCircle2 className="w-5 h-5" />
              <DialogTitle>InvLab Tax Receipt</DialogTitle>
            </div>
          </DialogHeader>

          {completedSale && (
            <div className="space-y-4 pt-2 text-xs text-[#202521]">
              <div className="border-b border-[#E3E1DA] pb-3 text-center">
                <div className="font-bold text-base text-[#173D32]">
                  {completedSale.warehouse_name}
                </div>
                <div className="text-[11px] text-[#5E6B63]">
                  Sale Ref: {completedSale.sale_number}
                </div>
                <div className="text-[11px] text-[#5E6B63]">
                  Date: {formatDate(completedSale.created_at)}
                </div>
                <div className="text-[11px] text-[#5E6B63]">
                  Cashier: {completedSale.cashier_name}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 border-b border-[#E3E1DA] pb-3">
                {completedSale.lines.map((line) => (
                  <div key={line.id} className="flex justify-between items-center text-xs">
                    <div>
                      <div className="font-semibold">{line.product_name}</div>
                      <div className="text-[11px] text-[#5E6B63]">
                        {line.quantity} x {formatCurrency(line.unit_price)}
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums">
                      {formatCurrency(line.subtotal)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex justify-between items-center text-sm font-bold pt-1">
                <span>Total Amount:</span>
                <span className="text-[#173D32] text-base tabular-nums">
                  {formatCurrency(completedSale.total_amount)}
                </span>
              </div>

              <div className="pt-4 flex gap-2">
                <Button
                  onClick={() => window.print()}
                  className="w-full gap-2"
                  variant="outline"
                >
                  <Printer className="w-4 h-4" /> Print Receipt
                </Button>
                <Button onClick={() => setCompletedSale(null)} className="w-full">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
