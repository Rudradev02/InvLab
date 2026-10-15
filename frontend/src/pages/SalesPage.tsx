import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { Sale, StockLevel, PaginatedResponse } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { formatCurrency, formatDate } from '../lib/format';
import { ShoppingCart, Plus, Trash2, Printer, CheckCircle2 } from 'lucide-react';
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

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [addQuantity, setAddQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

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
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['sales-stock'] });
      toast.success(`Sale ${data.sale_number} confirmed!`);
      setCompletedSale(data);
      setCart([]);
      setNotes('');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to record sale';
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#202521]">Point of Sale &amp; Billing</h1>
        <p className="text-sm text-[#5E6B63] mt-1">
          Record counter sales with atomic stock deduction and official invoice receipts
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Cart & Line Items */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-[#173D32]" /> New Sale Order
              </CardTitle>
              <span className="text-xs text-[#5E6B63]">
                {cart.length} line items added
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Product selector row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-[#F8F8F5] p-3 rounded-lg border border-[#E3E1DA]">
                <div className="sm:col-span-7">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1">
                    Select Product
                  </label>
                  <select
                    aria-label="Select product"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                  >
                    <option value="">-- Choose Item from Available Stock --</option>
                    {availableStock
                      .filter((s) => s.quantity > 0)
                      .map((s) => (
                        <option key={s.product.id} value={s.product.id}>
                          {s.product.name} ({s.product.sku}) — {formatCurrency(s.product.price)} (
                          {s.quantity} in stock)
                        </option>
                      ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={addQuantity}
                    onChange={(e) => setAddQuantity(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none tabular-nums"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={!selectedProductId}
                    className="w-full h-9 text-xs gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
              </div>

              {/* Cart Table */}
              <div className="border border-[#E3E1DA] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                      <th className="py-2.5 px-4 font-semibold">SKU &amp; Product</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Unit Price</th>
                      <th className="py-2.5 px-4 font-semibold text-center">Qty</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Subtotal</th>
                      <th className="py-2.5 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]/60">
                    {cart.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[#5E6B63] text-xs">
                          No items in cart. Select products above to begin billing.
                        </td>
                      </tr>
                    ) : (
                      cart.map((line, idx) => (
                        <tr key={line.productId} className="hover:bg-[#F8F8F5]/60">
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-[#202521]">{line.productName}</div>
                            <div className="text-[11px] text-[#5E6B63] font-mono">{line.sku}</div>
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-[#202521] tabular-nums">
                            {formatCurrency(line.unitPrice)}
                          </td>
                          <td className="py-2.5 px-4 text-center font-bold tabular-nums">
                            {line.quantity}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-[#173D32] tabular-nums">
                            {formatCurrency(line.unitPrice * line.quantity)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(idx)}
                              className="text-[#5E6B63] hover:text-[#B3261E] p-1 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
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

        {/* Right 1 Col: Checkout Summary Card */}
        <div className="space-y-6">
          <Card className="border-t-4 border-t-[#173D32]">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-[#5E6B63]">
                  <span>Items count:</span>
                  <span className="font-semibold text-[#202521] tabular-nums">
                    {cart.reduce((a, c) => a + c.quantity, 0)} units
                  </span>
                </div>
                <div className="flex justify-between text-[#5E6B63]">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-[#202521] tabular-nums">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-[#5E6B63]">
                  <span>Tax (Included):</span>
                  <span className="font-medium text-[#202521]">₹0.00</span>
                </div>
                <div className="pt-2 border-t border-[#E3E1DA] flex justify-between items-center text-sm">
                  <span className="font-bold text-[#202521]">Total Payable:</span>
                  <span className="text-xl font-bold text-[#173D32] tabular-nums">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>
              </div>

              <Input
                label="Customer / Order Notes"
                placeholder="Optional customer reference"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

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
                  <th className="py-2.5 px-4 font-semibold text-right">Total Amount</th>
                  <th className="py-2.5 px-4 text-center">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1DA]/60">
                {salesList.map((sale) => (
                  <tr key={sale.id} className="hover:bg-[#F8F8F5]">
                    <td className="py-3 px-4 font-mono font-bold text-[#173D32]">
                      {sale.sale_number}
                    </td>
                    <td className="py-3 px-4 text-[#5E6B63] font-medium">{sale.warehouse_code}</td>
                    <td className="py-3 px-4 text-[#202521] font-medium">{sale.cashier_name}</td>
                    <td className="py-3 px-4 text-[#5E6B63] tabular-nums">
                      {sale.lines.length} items
                    </td>
                    <td className="py-3 px-4 text-[#5E6B63]">{formatDate(sale.created_at)}</td>
                    <td className="py-3 px-4 text-right font-bold text-[#202521] tabular-nums">
                      {formatCurrency(sale.total_amount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCompletedSale(sale)}
                        className="text-[#173D32] hover:bg-[#E6F2EA]"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Printable Receipt Dialog */}
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
