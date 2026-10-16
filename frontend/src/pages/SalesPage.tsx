import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { Sale, StockLevel, PaginatedResponse, SaleReturn, Customer, DiscountType, PaymentMethod, BusinessSettings, Product } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { InvoiceModal } from '../components/sales/InvoiceModal';
import { formatCurrency, formatDate } from '../lib/format';

const BarcodeScannerModal = React.lazy(
  () => import('../components/sales/BarcodeScannerModal')
);
import {
  ShoppingCart,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  RotateCcw,
  Eye,
  Receipt,
  UserPlus,
  AlertCircle,
  Tag,
  Percent,
  CreditCard,
  Banknote,
  QrCode,
  FileText,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { ProductThumbnail } from '../components/common/ProductThumbnail';

const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

interface CartLine {
  productId: number;
  productName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  availableStock: number;
  gstRate: number;
  hsnCode: string;
}

export const SalesPage: React.FC = () => {
  const { user, selectedWarehouseId } = useAuth();
  const queryClient = useQueryClient();
  const isManagerOrAdmin = user?.role === 'Admin' || user?.role === 'Warehouse Manager';

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [addQuantity, setAddQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  // Customer, Discount & Payment state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValueInput, setDiscountValueInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('');
  const [isQuickAddCustomerOpen, setIsQuickAddCustomerOpen] = useState(false);
  const [quickCustomerForm, setQuickCustomerForm] = useState({
    name: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
  });

  // GST & Invoice state
  const [placeOfSupply, setPlaceOfSupply] = useState<string>('Maharashtra');
  const [customerGstin, setCustomerGstin] = useState<string>('');
  const [invoiceModalSaleId, setInvoiceModalSaleId] = useState<number | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  // Business settings query
  const { data: bizSettings } = useQuery<BusinessSettings>({
    queryKey: ['business-settings'],
    queryFn: () => apiRequest<BusinessSettings>('business-settings/'),
  });

  useEffect(() => {
    if (bizSettings?.state && !selectedCustomerId) {
      setPlaceOfSupply(bizSettings.state);
    }
  }, [bizSettings, selectedCustomerId]);

  // Modals state
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [returnDialogSale, setReturnDialogSale] = useState<Sale | null>(null);
  const [completedReturn, setCompletedReturn] = useState<SaleReturn | null>(null);

  // Return form state
  const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({});
  const [returnReason, setReturnReason] = useState<string>('');
  const [refundMethod, setRefundMethod] = useState<string>('cash');

  // Query customers (active only)
  const { data: customersData } = useQuery({
    queryKey: ['customers-list-active'],
    queryFn: () => apiRequest<PaginatedResponse<Customer>>('customers/?page_size=100&is_active=true'),
  });
  const activeCustomers = customersData?.results || [];

  const handleSelectCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    if (!custId) {
      setCustomerGstin('');
      if (bizSettings?.state) setPlaceOfSupply(bizSettings.state);
    } else {
      const cust = activeCustomers.find((c) => c.id.toString() === custId);
      if (cust) {
        if (cust.gstin) setCustomerGstin(cust.gstin);
      }
    }
  };

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
    queryKey: ['sales', selectedWarehouseId, paymentMethodFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedWarehouseId) params.append('warehouse', selectedWarehouseId.toString());
      if (paymentMethodFilter) params.append('payment_method', paymentMethodFilter);
      const q = params.toString() ? `?${params.toString()}` : '';
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
          gstRate: parseFloat(stockItem.product.gst_rate || '0') || 0,
          hsnCode: stockItem.product.hsn_code || '',
        },
      ]);
    }

    setSelectedProductId('');
    setAddQuantity(1);
  };

  const handleRemoveFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleProductScanned = useCallback(
    (product: Product) => {
      const stockItem = availableStock.find((s) => s.product.id === product.id);
      if (!stockItem || stockItem.quantity <= 0) {
        toast.error(`"${product.name}" (${product.sku}) is out of stock in this warehouse.`);
        return;
      }

      setCart((prev) => {
        const existingIdx = prev.findIndex((l) => l.productId === product.id);
        if (existingIdx > -1) {
          const cur = prev[existingIdx];
          if (cur.quantity + 1 > stockItem.quantity) {
            toast.error(`Only ${stockItem.quantity} units available in stock.`);
            return prev;
          }
          const updated = [...prev];
          updated[existingIdx] = { ...cur, quantity: cur.quantity + 1 };
          return updated;
        }
        return [
          ...prev,
          {
            productId: stockItem.product.id,
            productName: stockItem.product.name,
            sku: stockItem.product.sku,
            unitPrice: parseFloat(stockItem.product.price),
            quantity: 1,
            availableStock: stockItem.quantity,
            gstRate: parseFloat(stockItem.product.gst_rate || '0') || 0,
            hsnCode: stockItem.product.hsn_code || '',
          },
        ];
      });
    },
    [availableStock]
  );

  // Global USB Barcode Scanner hardware listener
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isScannerOpen) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      const now = Date.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 3 && diff < 80) {
          if (isInput) {
            e.preventDefault();
            (target as HTMLElement).blur?.();
          }
          const code = buffer.trim();
          buffer = '';
          apiRequest<Product>(`products/lookup-barcode/?barcode=${encodeURIComponent(code)}`)
            .then((prod) => {
              handleProductScanned(prod);
              toast.success(`Scanned: ${prod.name}`);
            })
            .catch(() => {
              toast.error(`No product found for barcode "${code}".`);
            });
        } else {
          buffer = '';
        }
      } else if (e.key.length === 1) {
        if (diff > 80) {
          buffer = e.key;
        } else {
          buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleProductScanned, isScannerOpen]);

  const subtotal = cart.reduce((acc, line) => acc + line.unitPrice * line.quantity, 0);
  const discountVal = parseFloat(discountValueInput) || 0;

  let calculatedDiscountAmount = 0;
  if (discountType === 'percent') {
    calculatedDiscountAmount = Math.round(subtotal * (discountVal / 100) * 100) / 100;
  } else if (discountType === 'amount') {
    calculatedDiscountAmount = Math.min(subtotal, Math.round(discountVal * 100) / 100);
  }

  // GST Calculation & Breakdown
  const sellerState = (bizSettings?.state || 'Maharashtra').trim().toLowerCase();
  const isInterstate = (placeOfSupply || '').trim().toLowerCase() !== sellerState;
  const pricesIncludeTax = Boolean(bizSettings?.prices_include_tax);

  // Proportional discount allocation
  const allocatedDiscounts = cart.map((line) => {
    if (subtotal <= 0 || calculatedDiscountAmount <= 0) return 0;
    const lineSubtotal = line.unitPrice * line.quantity;
    return Math.min(lineSubtotal, Math.round((lineSubtotal / subtotal) * calculatedDiscountAmount * 100) / 100);
  });
  const discDiff = Math.round((calculatedDiscountAmount - allocatedDiscounts.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (discDiff !== 0 && cart.length > 0) {
    let maxIdx = 0;
    cart.forEach((l, idx) => {
      if (l.unitPrice * l.quantity > cart[maxIdx].unitPrice * cart[maxIdx].quantity) maxIdx = idx;
    });
    allocatedDiscounts[maxIdx] += discDiff;
  }

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalTax = 0;

  cart.forEach((line, idx) => {
    const lineSubtotal = line.unitPrice * line.quantity;
    const lineDisc = allocatedDiscounts[idx] || 0;
    const netLine = Math.max(0, lineSubtotal - lineDisc);
    const rate = line.gstRate || 0;

    let lineTaxable = 0;
    let lineTax = 0;
    if (pricesIncludeTax) {
      if (rate > 0) {
        lineTaxable = Math.round((netLine / (1 + rate / 100)) * 100) / 100;
        lineTax = Math.round((netLine - lineTaxable) * 100) / 100;
      } else {
        lineTaxable = netLine;
        lineTax = 0;
      }
    } else {
      lineTaxable = netLine;
      if (rate > 0) {
        lineTax = Math.round((lineTaxable * (rate / 100)) * 100) / 100;
      } else {
        lineTax = 0;
      }
    }

    if (isInterstate) {
      totalIgst += lineTax;
    } else {
      const cgst = Math.round((lineTax / 2) * 100) / 100;
      const sgst = Math.round((lineTax - cgst) * 100) / 100;
      totalCgst += cgst;
      totalSgst += sgst;
    }
    totalTaxable += lineTaxable;
    totalTax += lineTax;
  });

  totalTaxable = Math.round(totalTaxable * 100) / 100;
  totalCgst = Math.round(totalCgst * 100) / 100;
  totalSgst = Math.round(totalSgst * 100) / 100;
  totalIgst = Math.round(totalIgst * 100) / 100;
  totalTax = Math.round(totalTax * 100) / 100;

  const rawGrandTotal = totalTaxable + totalTax;
  const netTotal = Math.round(rawGrandTotal);
  const roundOff = Math.round((netTotal - rawGrandTotal) * 100) / 100;

  const isStaff = user?.role === 'Staff';
  const isDiscountOverStaffLimit =
    isStaff &&
    ((discountType === 'percent' && discountVal > 10) ||
      (discountType === 'amount' && calculatedDiscountAmount > subtotal * 0.10 + 0.005));

  const isDiscountOverSubtotal = discountType === 'amount' && discountVal > subtotal;
  const isPercentOver100 = discountType === 'percent' && discountVal > 100;

  const effectiveAmountPaid =
    amountPaidInput === ''
      ? paymentMethod === 'credit'
        ? 0
        : netTotal
      : parseFloat(amountPaidInput) || 0;

  const balanceDue = Math.max(0, netTotal - effectiveAmountPaid);
  const isCreditSale = balanceDue > 0.005 || paymentMethod === 'credit';
  const isCustomerMissing = isCreditSale && !selectedCustomerId;

  // Quick Add Customer Mutation
  const quickAddCustomerMutation = useMutation({
    mutationFn: () =>
      apiRequest<Customer>('customers/', {
        method: 'POST',
        body: JSON.stringify(quickCustomerForm),
      }),
    onSuccess: (newCust) => {
      toast.success(`Customer ${newCust.name} added!`);
      queryClient.invalidateQueries({ queryKey: ['customers-list-active'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setSelectedCustomerId(newCust.id.toString());
      setIsQuickAddCustomerOpen(false);
      setQuickCustomerForm({ name: '', phone: '', email: '', gstin: '', address: '' });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create customer.');
    },
  });

  // Create Sale Mutation
  const createSaleMutation = useMutation({
    mutationFn: () => {
      if (isDiscountOverStaffLimit) {
        throw new Error('Staff discount limit is 10%. Higher discounts require Manager or Admin approval.');
      }
      if (isPercentOver100) {
        throw new Error('Discount percentage cannot exceed 100%.');
      }
      if (isDiscountOverSubtotal) {
        throw new Error('Discount amount cannot exceed the subtotal.');
      }
      if (isCustomerMissing) {
        throw new Error('Credit sales (udhaar) require selecting a registered customer.');
      }
      if (effectiveAmountPaid < 0) {
        throw new Error('Amount paid cannot be negative.');
      }
      if (effectiveAmountPaid > netTotal) {
        throw new Error('Amount paid cannot exceed the sale total.');
      }

      const idempotencyKey = crypto.randomUUID();
      return apiRequest<Sale>('sales/', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          warehouse_id: selectedWarehouseId,
          customer_id: selectedCustomerId ? parseInt(selectedCustomerId, 10) : null,
          place_of_supply: placeOfSupply,
          customer_gstin: customerGstin,
          discount_type: discountType,
          discount_value: discountVal.toFixed(2),
          payment_method: paymentMethod,
          amount_paid: effectiveAmountPaid.toFixed(2),
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
      setAmountPaidInput('');
      setSelectedCustomerId('');
      setCustomerGstin('');
      if (bizSettings?.state) setPlaceOfSupply(bizSettings.state);
      setDiscountType('none');
      setDiscountValueInput('');
      setPaymentMethod('cash');
      setCompletedSale(data);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-receivables'] });
      queryClient.invalidateQueries({ queryKey: ['customers-list-active'] });
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

  const getPaymentMethodBadge = (method: string) => {
    switch (method) {
      case 'cash':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Banknote className="w-3 h-3" /> Cash
          </span>
        );
      case 'upi':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            <QrCode className="w-3 h-3" /> UPI
          </span>
        );
      case 'card':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
            <CreditCard className="w-3 h-3" /> Card
          </span>
        );
      case 'credit':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Tag className="w-3 h-3" /> Udhaar
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-50 text-gray-700 border border-gray-200">
            {method || 'Standard'}
          </span>
        );
    }
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
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Select Products for Sale</CardTitle>
                  <span className="text-xs font-normal text-[#5E6B63]">
                    Stock reflects active warehouse • USB scanners active anytime
                  </span>
                </div>
                <Button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-[#173D32] text-[#173D32] hover:bg-[#E6F2EA] font-semibold"
                >
                  <QrCode className="w-4 h-4 text-[#173D32]" />
                  Scan Barcode / QR
                </Button>
              </div>
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

                  {/* Selected Product Visual Preview */}
                  {(() => {
                    const selectedItem = availableStock.find(
                      (s) => String(s.product.id) === selectedProductId
                    );
                    if (!selectedItem) return null;
                    return (
                      <div className="flex items-center gap-2.5 p-2 bg-[#F8F8F5] border border-[#E3E1DA] rounded-md mt-1.5 animate-in fade-in duration-100">
                        <ProductThumbnail
                          src={selectedItem.product.thumbnail || selectedItem.product.image}
                          alt={selectedItem.product.name}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#202521] truncate">
                            {selectedItem.product.name}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-[#5E6B63] mt-0.5">
                            <span className="font-mono text-[#173D32]">{selectedItem.product.sku}</span>
                            <span>•</span>
                            <span className="font-semibold text-[#202521]">
                              {formatCurrency(selectedItem.product.price)}
                            </span>
                            <span>•</span>
                            <span
                              className={
                                selectedItem.quantity <= selectedItem.reorder_level
                                  ? 'text-[#B3261E] font-semibold'
                                  : 'text-[#2F7D4F] font-semibold'
                              }
                            >
                              {selectedItem.quantity} in stock
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
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
                      cart.map((line, idx) => {
                        const stockItem = availableStock.find((s) => s.product.id === line.productId);
                        const thumb = stockItem?.product.thumbnail || stockItem?.product.image;
                        return (
                          <tr key={line.productId} className="hover:bg-[#F8F8F5]/50">
                            <td className="py-2.5 px-3 font-mono font-medium text-[#173D32] whitespace-nowrap">
                              {line.sku}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-[#202521]">
                              <div className="flex items-center gap-2">
                                <ProductThumbnail
                                  src={thumb}
                                  alt={line.productName}
                                  size="xs"
                                />
                                <span className="truncate max-w-[200px] sm:max-w-xs">{line.productName}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums">
                              {formatCurrency(line.unitPrice)}
                            </td>
                            <td className="py-2.5 px-3 text-center font-semibold">
                              {line.quantity}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-[#173D32] tabular-nums">
                              {formatCurrency(line.unitPrice * line.quantity)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveFromCart(idx)}
                                className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
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
              {/* Customer Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#202521] uppercase">
                    Customer
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsQuickAddCustomerOpen(true)}
                    className="text-xs text-[#173D32] hover:underline font-semibold flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    + New Customer
                  </button>
                </div>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-[#E3E1DA] bg-white text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                >
                  <option value="">Walk-in Customer (No Udhaar)</option>
                  {activeCustomers.map((c) => {
                    const bal = parseFloat(c.total_balance_due || '0');
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone}){bal > 0 ? ` [Udhaar: ₹${c.total_balance_due}]` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Place of Supply & GSTIN Card */}
              <div className="space-y-2 p-3 rounded-lg border border-[#E3E1DA] bg-white">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#202521] uppercase flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#173D32]" />
                    Place of Supply (GST)
                  </label>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isInterstate ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isInterstate ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)'}
                  </span>
                </div>
                <select
                  value={placeOfSupply}
                  onChange={(e) => setPlaceOfSupply(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-md border border-[#E3E1DA] bg-white text-xs text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <div>
                  <input
                    type="text"
                    value={customerGstin}
                    onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                    placeholder="Customer GSTIN (Optional B2B)"
                    className="w-full h-8 px-2.5 rounded-md border border-[#E3E1DA] bg-[#FBFBFA] text-xs font-mono text-[#202521] placeholder:text-[#5E6B63] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
                  />
                </div>
              </div>

              {/* Discount Section */}
              <div className="space-y-2 p-3 rounded-lg border border-[#E3E1DA] bg-white">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#202521] uppercase flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-[#173D32]" />
                    Discount
                  </label>
                  {isStaff && (
                    <span className="text-[10px] text-[#5E6B63] font-medium">
                      Staff Limit: 10%
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F1F1EC] rounded-md">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType('none');
                      setDiscountValueInput('');
                    }}
                    className={`py-1 text-xs font-medium rounded transition-colors ${
                      discountType === 'none'
                        ? 'bg-white text-[#173D32] font-semibold shadow-sm'
                        : 'text-[#5E6B63] hover:text-[#202521]'
                    }`}
                  >
                    None
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType('percent');
                      if (!discountValueInput) setDiscountValueInput('5');
                    }}
                    className={`py-1 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1 ${
                      discountType === 'percent'
                        ? 'bg-white text-[#173D32] font-semibold shadow-sm'
                        : 'text-[#5E6B63] hover:text-[#202521]'
                    }`}
                  >
                    <Percent className="w-3 h-3" /> Percent
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType('amount');
                      if (!discountValueInput) setDiscountValueInput('50');
                    }}
                    className={`py-1 text-xs font-medium rounded transition-colors ${
                      discountType === 'amount'
                        ? 'bg-white text-[#173D32] font-semibold shadow-sm'
                        : 'text-[#5E6B63] hover:text-[#202521]'
                    }`}
                  >
                    ₹ Flat
                  </button>
                </div>

                {discountType !== 'none' && (
                  <div className="space-y-1.5 pt-1">
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        step={discountType === 'percent' ? '1' : '0.01'}
                        placeholder={discountType === 'percent' ? 'Discount % (e.g. 5)' : 'Discount ₹ (e.g. 100)'}
                        value={discountValueInput}
                        onChange={(e) => setDiscountValueInput(e.target.value)}
                        className="h-9 pr-12 text-xs font-bold"
                      />
                      <span className="absolute right-3 top-2 text-xs font-semibold text-[#5E6B63] pointer-events-none">
                        {discountType === 'percent' ? '%' : '₹'}
                      </span>
                    </div>

                    {calculatedDiscountAmount > 0 && (
                      <div className="flex justify-between items-center text-[11px] text-[#2F7D4F] font-semibold">
                        <span>Discount applied:</span>
                        <span className="tabular-nums">-{formatCurrency(calculatedDiscountAmount)}</span>
                      </div>
                    )}

                    {isDiscountOverStaffLimit && (
                      <div className="text-[11px] text-[#B3261E] bg-red-50 p-1.5 rounded flex items-start gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Staff discount limit is 10%. Higher discounts require Manager or Admin approval.</span>
                      </div>
                    )}
                    {isPercentOver100 && (
                      <div className="text-[11px] text-[#B3261E] bg-red-50 p-1.5 rounded">
                        Discount percentage cannot exceed 100%.
                      </div>
                    )}
                    {isDiscountOverSubtotal && (
                      <div className="text-[11px] text-[#B3261E] bg-red-50 p-1.5 rounded">
                        Discount amount cannot exceed subtotal ({formatCurrency(subtotal)}).
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2 p-3 rounded-lg border border-[#E3E1DA] bg-white">
                <label className="text-xs font-semibold text-[#202521] uppercase block">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('cash');
                      if (amountPaidInput === '' || paymentMethod === 'credit') {
                        setAmountPaidInput(netTotal.toFixed(2));
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold border transition-all ${
                      paymentMethod === 'cash'
                        ? 'border-[#173D32] bg-[#E6F2EA] text-[#173D32] ring-1 ring-[#173D32]'
                        : 'border-[#E3E1DA] bg-white text-[#5E6B63] hover:border-gray-400'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" /> Cash
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('upi');
                      if (amountPaidInput === '' || paymentMethod === 'credit') {
                        setAmountPaidInput(netTotal.toFixed(2));
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold border transition-all ${
                      paymentMethod === 'upi'
                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-1 ring-blue-600'
                        : 'border-[#E3E1DA] bg-white text-[#5E6B63] hover:border-gray-400'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" /> UPI
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('card');
                      if (amountPaidInput === '' || paymentMethod === 'credit') {
                        setAmountPaidInput(netTotal.toFixed(2));
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold border transition-all ${
                      paymentMethod === 'card'
                        ? 'border-purple-600 bg-purple-50 text-purple-800 ring-1 ring-purple-600'
                        : 'border-[#E3E1DA] bg-white text-[#5E6B63] hover:border-gray-400'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Card
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('credit');
                      setAmountPaidInput('0.00');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold border transition-all ${
                      paymentMethod === 'credit'
                        ? 'border-amber-600 bg-amber-50 text-amber-800 ring-1 ring-amber-600'
                        : 'border-[#E3E1DA] bg-white text-[#5E6B63] hover:border-gray-400'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" /> Credit (Udhaar)
                  </button>
                </div>
              </div>

              {/* Ticket Breakdown */}
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
                <div className="flex justify-between text-xs text-[#5E6B63] pt-1 border-t border-[#E3E1DA]/60">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-[#202521] tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {calculatedDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs text-[#2F7D4F] font-semibold">
                    <span>Discount ({discountType === 'percent' ? `${discountVal}%` : 'Flat'}):</span>
                    <span className="tabular-nums">-{formatCurrency(calculatedDiscountAmount)}</span>
                  </div>
                )}
                {totalTaxable > 0 && (
                  <div className="flex justify-between text-xs text-[#5E6B63]">
                    <span>Taxable Value:</span>
                    <span className="font-medium text-[#202521] tabular-nums">{formatCurrency(totalTaxable)}</span>
                  </div>
                )}
                {totalTax > 0 && (
                  <>
                    {isInterstate ? (
                      <div className="flex justify-between text-xs text-[#5E6B63]">
                        <span>IGST:</span>
                        <span className="font-medium text-[#202521] tabular-nums">{formatCurrency(totalIgst)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-xs text-[#5E6B63]">
                          <span>CGST:</span>
                          <span className="font-medium text-[#202521] tabular-nums">{formatCurrency(totalCgst)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-[#5E6B63]">
                          <span>SGST:</span>
                          <span className="font-medium text-[#202521] tabular-nums">{formatCurrency(totalSgst)}</span>
                        </div>
                      </>
                    )}
                  </>
                )}
                {roundOff !== 0 && (
                  <div className="flex justify-between text-xs text-[#5E6B63]">
                    <span>Round Off:</span>
                    <span className="font-medium text-[#202521] tabular-nums">
                      {roundOff > 0 ? `+${formatCurrency(roundOff)}` : formatCurrency(roundOff)}
                    </span>
                  </div>
                )}
                <div className="border-t border-[#E3E1DA] pt-2 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-[#202521]">Net Total:</span>
                  <span className="text-xl font-extrabold text-[#173D32] tabular-nums">
                    {formatCurrency(netTotal)}
                  </span>
                </div>
              </div>

              {/* Amount Paid Input & Balance Due Preview */}
              <div className="space-y-1.5 p-3 rounded-lg border border-[#E3E1DA] bg-white">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#202521] uppercase">
                    Amount Paid (₹)
                  </label>
                  <button
                    type="button"
                    onClick={() => setAmountPaidInput(netTotal.toFixed(2))}
                    className="text-[11px] text-[#2F7D4F] hover:underline font-medium"
                  >
                    Pay Full (₹{netTotal.toFixed(2)})
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={netTotal}
                  placeholder={netTotal > 0 ? netTotal.toFixed(2) : '0.00'}
                  value={amountPaidInput}
                  onChange={(e) => setAmountPaidInput(e.target.value)}
                  className="font-bold text-sm h-10"
                />

                {/* Balance Due (Udhaar) Preview */}
                <div className="pt-2 border-t border-[#E3E1DA] flex justify-between items-center text-xs">
                  <span className="font-medium text-[#5E6B63]">Balance Due (Udhaar):</span>
                  <span
                    className={`font-bold tabular-nums text-sm ${
                      isCreditSale ? 'text-[#B3261E]' : 'text-[#2F7D4F]'
                    }`}
                  >
                    {formatCurrency(balanceDue)}
                  </span>
                </div>

                {isCreditSale && (
                  <div className="mt-2 p-2 rounded bg-[#FBE9E7] text-[11px] text-[#B3261E] flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      {selectedCustomerId
                        ? `Credit Sale: ₹${balanceDue.toFixed(2)} will be debited to customer's account.`
                        : 'Credit sales require selecting a registered customer. Walk-in customers cannot have udhaar.'}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#202521]">Order Notes / Reference</label>
                <Input
                  placeholder="Optional notes, PO #..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button
                type="button"
                className="w-full h-11 text-sm font-semibold"
                disabled={
                  cart.length === 0 ||
                  isCustomerMissing ||
                  Boolean(isDiscountOverStaffLimit) ||
                  Boolean(isPercentOver100) ||
                  Boolean(isDiscountOverSubtotal)
                }
                isLoading={createSaleMutation.isPending}
                onClick={() => createSaleMutation.mutate()}
              >
                {isCreditSale ? 'Confirm Credit Sale & Deduct Stock' : 'Confirm Sale & Deduct Stock'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sales History Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Recent Sales History</CardTitle>
            <span className="text-xs text-[#5E6B63]">
              {user?.role === 'Staff' ? 'Your counter transactions' : 'All warehouse sales'}
            </span>
          </div>

          {/* Payment Method Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#5E6B63] font-medium hidden sm:inline">Method:</span>
            <select
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
              className="h-8 px-2.5 rounded-md border border-[#E3E1DA] bg-white text-xs font-medium text-[#202521] focus:outline-none focus:ring-1 focus:ring-[#173D32]"
            >
              <option value="">All Methods</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="credit">Credit (Udhaar)</option>
            </select>
          </div>
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
                  <th className="py-2.5 px-4 font-semibold">Customer</th>
                  <th className="py-2.5 px-4 font-semibold">Warehouse</th>
                  <th className="py-2.5 px-4 font-semibold">Cashier</th>
                  <th className="py-2.5 px-4 font-semibold">Method</th>
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
                  const bal = parseFloat(sale.balance_due || '0');
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
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#202521]">
                          {sale.customer_name || 'Walk-in Customer'}
                        </div>
                        {sale.customer_phone && (
                          <div className="text-[11px] text-[#5E6B63]">{sale.customer_phone}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#5E6B63] font-medium">{sale.warehouse_code}</td>
                      <td className="py-3 px-4 text-[#202521] font-medium">{sale.cashier_name}</td>
                      <td className="py-3 px-4">{getPaymentMethodBadge(sale.payment_method)}</td>
                      <td className="py-3 px-4 text-[#5E6B63] tabular-nums">
                        {sale.lines.length} items
                      </td>
                      <td className="py-3 px-4 text-[#5E6B63]">{formatDate(sale.created_at)}</td>
                      <td className="py-3 px-4">{getReturnStatusBadge(sale)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {parseFloat(sale.discount_amount || '0') > 0 ? (
                          <div>
                            <div className="font-bold text-[#173D32]">
                              {formatCurrency(sale.net_total || sale.total_amount)}
                            </div>
                            <div className="text-[10px] text-[#5E6B63] line-through">
                              {formatCurrency(sale.subtotal || sale.total_amount)}
                            </div>
                            <div className="text-[10px] text-[#2F7D4F] font-medium">
                              -{formatCurrency(sale.discount_amount)} disc
                            </div>
                          </div>
                        ) : hasRefund ? (
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
                        {bal > 0 ? (
                          <div className="text-[10px] font-bold text-[#B3261E] bg-[#FBE9E7] px-1.5 py-0.5 rounded inline-block mt-0.5">
                            Udhaar: {formatCurrency(sale.balance_due)}
                          </div>
                        ) : sale.customer ? (
                          <div className="text-[10px] text-[#2F7D4F] font-medium">
                            Paid in full
                          </div>
                        ) : null}
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
                            title="GST Tax Invoice"
                            onClick={() => setInvoiceModalSaleId(sale.id)}
                            className="text-[#173D32] hover:bg-[#E6F2EA] p-1.5 h-8"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Button>

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
                  <p className="text-xs font-semibold text-[#173D32] mt-0.5">
                    Customer: {viewingSale.customer_name || 'Walk-in Customer'}
                    {viewingSale.customer_phone ? ` (${viewingSale.customer_phone})` : ''}
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
                  <span className="text-[#5E6B63]">Subtotal:</span>
                  <span className="font-semibold">{formatCurrency(viewingSale.subtotal || viewingSale.total_amount)}</span>
                </div>
                {parseFloat(viewingSale.discount_amount || '0') > 0 && (
                  <div className="flex justify-between text-[#2F7D4F]">
                    <span>Discount ({viewingSale.discount_type === 'percent' ? `${viewingSale.discount_value}%` : 'Flat'}):</span>
                    <span className="font-semibold">-{formatCurrency(viewingSale.discount_amount)}</span>
                  </div>
                )}
                {parseFloat(viewingSale.total_refunded || '0') > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Total Refunded:</span>
                    <span className="font-semibold">-{formatCurrency(viewingSale.total_refunded || '0')}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm border-t border-[#E3E1DA] pt-1">
                  <span>Net Total:</span>
                  <span className="text-[#173D32]">
                    {formatCurrency(viewingSale.net_total || viewingSale.total_amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-[#E3E1DA]/60">
                  <span className="text-[#5E6B63]">Payment Method:</span>
                  <span>{getPaymentMethodBadge(viewingSale.payment_method)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#5E6B63]">Amount Paid:</span>
                  <span className="font-semibold text-[#2F7D4F]">{formatCurrency(viewingSale.amount_paid)}</span>
                </div>
                {parseFloat(viewingSale.balance_due || '0') > 0 && (
                  <div className="flex justify-between text-xs text-[#B3261E]">
                    <span className="font-bold">Outstanding Udhaar:</span>
                    <span className="font-bold">{formatCurrency(viewingSale.balance_due)}</span>
                  </div>
                )}
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
                    onClick={() => setInvoiceModalSaleId(viewingSale.id)}
                    className="gap-1.5 text-[#173D32] hover:bg-[#E6F2EA]"
                  >
                    <FileText className="w-3.5 h-3.5" /> GST Invoice
                  </Button>

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
                <div className="text-[11px] font-semibold text-[#173D32] mt-0.5">
                  Customer: {completedSale.customer_name || 'Walk-in Customer'}
                  {completedSale.customer_phone ? ` (${completedSale.customer_phone})` : ''}
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

              {/* Totals Breakdown */}
              <div className="space-y-1 text-xs border-b border-[#E3E1DA] pb-3">
                <div className="flex justify-between items-center text-xs text-[#5E6B63]">
                  <span>Subtotal:</span>
                  <span className="tabular-nums">
                    {formatCurrency(completedSale.subtotal || completedSale.total_amount)}
                  </span>
                </div>
                {parseFloat(completedSale.discount_amount || '0') > 0 && (
                  <div className="flex justify-between items-center text-xs text-[#2F7D4F]">
                    <span>Discount ({completedSale.discount_type === 'percent' ? `${completedSale.discount_value}%` : 'Flat'}):</span>
                    <span className="font-semibold tabular-nums">
                      -{formatCurrency(completedSale.discount_amount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm font-bold border-t border-[#E3E1DA] pt-1">
                  <span>Net Total:</span>
                  <span className="text-[#173D32] text-base tabular-nums">
                    {formatCurrency(completedSale.total_amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="text-[#5E6B63]">Payment Method:</span>
                  <span className="font-semibold uppercase text-[#202521]">{completedSale.payment_method}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-[#2F7D4F]">
                  <span>Amount Paid:</span>
                  <span className="font-bold tabular-nums">
                    {formatCurrency(completedSale.amount_paid)}
                  </span>
                </div>
                {parseFloat(completedSale.balance_due || '0') > 0 && (
                  <div className="flex justify-between items-center text-xs text-[#B3261E]">
                    <span className="font-bold">Outstanding Udhaar:</span>
                    <span className="font-bold tabular-nums">
                      {formatCurrency(completedSale.balance_due)}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => setInvoiceModalSaleId(completedSale.id)}
                  className="w-full gap-2 bg-[#173D32] text-white hover:bg-[#122e26]"
                >
                  <FileText className="w-4 h-4" /> View GST Invoice
                </Button>
                <Button
                  onClick={() => window.print()}
                  className="w-full gap-2"
                  variant="outline"
                >
                  <Printer className="w-4 h-4" /> Print Receipt
                </Button>
                <Button onClick={() => setCompletedSale(null)} variant="outline">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick Add Customer Dialog */}
      <Dialog open={isQuickAddCustomerOpen} onOpenChange={setIsQuickAddCustomerOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#173D32]">
              <UserPlus className="w-5 h-5" />
              <span>Quick Add Customer</span>
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!quickCustomerForm.name.trim()) {
                toast.error('Customer name is required.');
                return;
              }
              if (!quickCustomerForm.phone.trim()) {
                toast.error('Phone number is required.');
                return;
              }
              quickAddCustomerMutation.mutate();
            }}
            className="space-y-3.5 pt-2 text-xs"
          >
            <div>
              <label className="block font-semibold text-[#202521] uppercase mb-1">
                Customer Name *
              </label>
              <Input
                placeholder="e.g. Rahul Sharma"
                value={quickCustomerForm.name}
                onChange={(e) =>
                  setQuickCustomerForm({ ...quickCustomerForm, name: e.target.value })
                }
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-[#202521] uppercase mb-1">
                Phone Number *
              </label>
              <Input
                placeholder="e.g. 9876543210"
                value={quickCustomerForm.phone}
                onChange={(e) =>
                  setQuickCustomerForm({ ...quickCustomerForm, phone: e.target.value })
                }
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-[#202521] uppercase mb-1">
                GSTIN (Optional)
              </label>
              <Input
                placeholder="e.g. 29AAAAA0000A1Z5"
                value={quickCustomerForm.gstin}
                onChange={(e) =>
                  setQuickCustomerForm({
                    ...quickCustomerForm,
                    gstin: e.target.value.toUpperCase(),
                  })
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E3E1DA]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsQuickAddCustomerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={quickAddCustomerMutation.isPending}
                className="bg-[#173D32] text-white hover:bg-[#122e26]"
              >
                {quickAddCustomerMutation.isPending ? 'Creating...' : 'Save & Select'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* GST Tax Invoice Modal */}
      <InvoiceModal
        saleId={invoiceModalSaleId}
        isOpen={Boolean(invoiceModalSaleId)}
        onClose={() => setInvoiceModalSaleId(null)}
      />

      {/* Barcode & QR Scanner Modal (Lazy Loaded) */}
      <React.Suspense fallback={null}>
        {isScannerOpen && (
          <BarcodeScannerModal
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onProductScanned={handleProductScanned}
            availableStock={availableStock}
          />
        )}
      </React.Suspense>
    </div>
  );
};

