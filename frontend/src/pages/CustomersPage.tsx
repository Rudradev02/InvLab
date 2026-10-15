import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import {
  Customer,
  CustomerSummary,
  Payment,
  Sale,
  PaginatedResponse,
} from '../types';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { formatCurrency, formatDate } from '../lib/format';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  FileText,
  CreditCard,
  History,
  AlertCircle,
  Eye,
  Edit2,
  CheckCircle2,
  Ban,
  Receipt,
  IndianRupee,
} from 'lucide-react';
import { toast } from 'sonner';

export const CustomersPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterBalance, setFilterBalance] = useState<'all' | 'due' | 'settled'>('all');

  // Modals
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [customerToPay, setCustomerToPay] = useState<Customer | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
  });

  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Active Customer Detail Tab
  const [detailTab, setDetailTab] = useState<'sales' | 'payments'>('sales');

  // Query Customers
  const { data: customersData, isLoading } = useQuery({
    queryKey: ['customers', searchQuery],
    queryFn: () => {
      const q = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
      return apiRequest<PaginatedResponse<Customer>>(`customers/${q}`);
    },
  });

  // Query Receivables KPI
  const { data: receivablesData } = useQuery({
    queryKey: ['customers-receivables'],
    queryFn: () => apiRequest<{ total_receivables: string }>('customers/receivables/'),
  });

  // Query Customer Summary (when viewing detail)
  const { data: customerSummary } = useQuery({
    queryKey: ['customer-summary', selectedCustomerId],
    queryFn: () => apiRequest<CustomerSummary>(`customers/${selectedCustomerId}/summary/`),
    enabled: !!selectedCustomerId,
  });

  // Query Customer Sales
  const { data: customerSales } = useQuery({
    queryKey: ['customer-sales', selectedCustomerId],
    queryFn: () => apiRequest<Sale[]>(`customers/${selectedCustomerId}/sales/`),
    enabled: !!selectedCustomerId,
  });

  // Query Customer Payments
  const { data: customerPayments } = useQuery({
    queryKey: ['customer-payments', selectedCustomerId],
    queryFn: () => apiRequest<Payment[]>(`customers/${selectedCustomerId}/payments/`),
    enabled: !!selectedCustomerId,
  });

  const allCustomers = customersData?.results || [];

  const filteredCustomers = allCustomers.filter((c) => {
    const bal = parseFloat(c.total_balance_due || '0');
    if (filterBalance === 'due') return bal > 0;
    if (filterBalance === 'settled') return bal === 0;
    return true;
  });

  const totalUdhaarAcrossList = allCustomers.reduce(
    (acc, c) => acc + parseFloat(c.total_balance_due || '0'),
    0
  );

  const selectedCustomer = allCustomers.find((c) => c.id === selectedCustomerId) || null;

  // Add / Edit Mutation
  const saveCustomerMutation = useMutation({
    mutationFn: () => {
      if (editingCustomer) {
        return apiRequest<Customer>(`customers/${editingCustomer.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(formData),
        });
      }
      return apiRequest<Customer>('customers/', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
    },
    onSuccess: (data) => {
      toast.success(
        editingCustomer
          ? `Customer ${data.name} updated successfully.`
          : `Customer ${data.name} created successfully.`
      );
      setIsAddEditOpen(false);
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', email: '', gstin: '', address: '' });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-summary'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save customer.');
    },
  });

  // Toggle Active Mutation
  const toggleActiveMutation = useMutation({
    mutationFn: (customer: Customer) =>
      apiRequest<Customer>(`customers/${customer.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !customer.is_active }),
      }),
    onSuccess: (data) => {
      toast.success(
        `Customer ${data.name} is now ${data.is_active ? 'Active' : 'Inactive'}.`
      );
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update customer status.');
    },
  });

  // Record Payment Mutation
  const recordPaymentMutation = useMutation({
    mutationFn: () => {
      if (!customerToPay) throw new Error('No customer selected');
      return apiRequest<Payment>(`customers/${customerToPay.id}/record_payment/`, {
        method: 'POST',
        body: JSON.stringify({
          amount: paymentAmount,
          payment_method: paymentMethod,
          notes: paymentNotes,
        }),
      });
    },
    onSuccess: (data) => {
      toast.success(
        `Payment ${data.payment_number} of ${formatCurrency(data.amount)} recorded! Applied to oldest unpaid sale.`
      );
      setIsRecordPaymentOpen(false);
      setCustomerToPay(null);
      setPaymentAmount('');
      setPaymentNotes('');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-receivables'] });
      queryClient.invalidateQueries({ queryKey: ['customer-summary'] });
      queryClient.invalidateQueries({ queryKey: ['customer-sales'] });
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to record payment.');
    },
  });

  const openCreateDialog = () => {
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', email: '', gstin: '', address: '' });
    setIsAddEditOpen(true);
  };

  const openEditDialog = (cust: Customer) => {
    setEditingCustomer(cust);
    setFormData({
      name: cust.name,
      phone: cust.phone,
      email: cust.email || '',
      gstin: cust.gstin || '',
      address: cust.address || '',
    });
    setIsAddEditOpen(true);
  };

  const openRecordPayment = (cust: Customer) => {
    setCustomerToPay(cust);
    setPaymentAmount(cust.total_balance_due);
    setPaymentMethod('cash');
    setPaymentNotes('');
    setIsRecordPaymentOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202521]">
            Customers & Credit (Udhaar)
          </h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            Track customer purchase history, manage credit balances, and record payments against sales.
          </p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-[#233831] hover:bg-[#1b2b26] text-white flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>New Customer</span>
        </Button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-[#E3E1DA] bg-white">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-[#E6F2EA] flex items-center justify-center text-[#233831]">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase font-medium tracking-wider text-[#5E6B63]">
                Total Customers
              </p>
              <p className="text-2xl font-bold text-[#202521] mt-0.5">
                {allCustomers.length}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E3E1DA] bg-white">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-[#FBE9E7] flex items-center justify-center text-[#B3261E]">
              <IndianRupee className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase font-medium tracking-wider text-[#5E6B63]">
                Total Outstanding Udhaar
              </p>
              <p className="text-2xl font-bold text-[#B3261E] mt-0.5">
                {receivablesData?.total_receivables
                  ? formatCurrency(receivablesData.total_receivables)
                  : formatCurrency(totalUdhaarAcrossList)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E3E1DA] bg-white">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-[#F1F1EC] flex items-center justify-center text-[#5E6B63]">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase font-medium tracking-wider text-[#5E6B63]">
                Customers with Udhaar
              </p>
              <p className="text-2xl font-bold text-[#202521] mt-0.5">
                {allCustomers.filter((c) => parseFloat(c.total_balance_due || '0') > 0).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-[#E3E1DA]">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5E6B63]" />
          <Input
            placeholder="Search by customer name, phone, or GSTIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 border-[#E3E1DA]"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#5E6B63]">Balance:</span>
          <div className="inline-flex rounded-md border border-[#E3E1DA] p-0.5 bg-[#FAF8F5]">
            <button
              onClick={() => setFilterBalance('all')}
              className={`px-3 py-1 text-xs font-medium rounded ${
                filterBalance === 'all'
                  ? 'bg-white shadow-xs text-[#202521]'
                  : 'text-[#5E6B63] hover:text-[#202521]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterBalance('due')}
              className={`px-3 py-1 text-xs font-medium rounded ${
                filterBalance === 'due'
                  ? 'bg-white shadow-xs text-[#B3261E] font-semibold'
                  : 'text-[#5E6B63] hover:text-[#202521]'
              }`}
            >
              Has Balance Due
            </button>
            <button
              onClick={() => setFilterBalance('settled')}
              className={`px-3 py-1 text-xs font-medium rounded ${
                filterBalance === 'settled'
                  ? 'bg-white shadow-xs text-[#2F7D4F]'
                  : 'text-[#5E6B63] hover:text-[#202521]'
              }`}
            >
              Fully Settled
            </button>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <Card className="border-[#E3E1DA] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#FAF8F5] border-b border-[#E3E1DA] text-xs font-semibold text-[#5E6B63] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Phone & Contact</th>
                <th className="px-5 py-3.5 text-right">Balance Due (Udhaar)</th>
                <th className="px-5 py-3.5 text-right">Lifetime Value</th>
                <th className="px-5 py-3.5 text-center">Invoices</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E1DA]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[#5E6B63]">
                    Loading customers...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Users className="h-10 w-10 text-[#5E6B63]/40 mx-auto mb-2" />
                    <p className="text-[#202521] font-medium">No customers found</p>
                    <p className="text-xs text-[#5E6B63] mt-1">
                      {searchQuery
                        ? 'Try modifying your search query.'
                        : 'Click "New Customer" to register a customer.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => {
                  const bal = parseFloat(cust.total_balance_due || '0');
                  const hasUdhaar = bal > 0;
                  return (
                    <tr
                      key={cust.id}
                      className="hover:bg-[#FAF8F5]/60 transition-colors cursor-pointer"
                      onClick={() => setSelectedCustomerId(cust.id)}
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#202521]">{cust.name}</div>
                        {cust.gstin && (
                          <div className="text-xs text-[#5E6B63] mt-0.5">
                            GSTIN: {cust.gstin}
                          </div>
                        )}
                        {cust.address && (
                          <div className="text-xs text-[#5E6B63] truncate max-w-xs mt-0.5">
                            {cust.address}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-medium text-[#202521] flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-[#5E6B63]" />
                          {cust.phone}
                        </div>
                        {cust.email && (
                          <div className="text-xs text-[#5E6B63] flex items-center gap-1.5 mt-0.5">
                            <Mail className="h-3.5 w-3.5" />
                            {cust.email}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {hasUdhaar ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-[#FBE9E7] text-[#B3261E] border border-[#f8c9c4]">
                            {formatCurrency(cust.total_balance_due)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#E6F2EA] text-[#2F7D4F] border border-[#c2e4cd]">
                            ₹0.00
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-medium text-[#202521]">
                        {formatCurrency(cust.lifetime_value)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="text-xs font-semibold text-[#5E6B63] bg-[#F1F1EC] px-2.5 py-1 rounded-full">
                          {cust.sales_count}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Badge variant={cust.is_active ? 'success' : 'neutral'}>
                          {cust.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td
                        className="px-5 py-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {hasUdhaar && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRecordPayment(cust)}
                              className="h-8 px-2.5 text-xs text-[#B3261E] border-[#f8c9c4] hover:bg-[#FBE9E7]"
                              title="Record payment against udhaar"
                            >
                              <CreditCard className="h-3.5 w-3.5 mr-1" />
                              Pay
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedCustomerId(cust.id)}
                            className="h-8 w-8 p-0 text-[#5E6B63] hover:text-[#202521]"
                            title="View history & summary"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(cust)}
                            className="h-8 w-8 p-0 text-[#5E6B63] hover:text-[#202521]"
                            title="Edit customer details"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleActiveMutation.mutate(cust)}
                            className={`h-8 w-8 p-0 ${
                              cust.is_active
                                ? 'text-[#5E6B63] hover:text-[#B3261E]'
                                : 'text-[#2F7D4F] hover:text-[#1e5835]'
                            }`}
                            title={cust.is_active ? 'Deactivate customer' : 'Activate customer'}
                          >
                            {cust.is_active ? (
                              <Ban className="h-4 w-4" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomer && (
        <Dialog open={!!selectedCustomerId} onOpenChange={(open) => !open && setSelectedCustomerId(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b border-[#E3E1DA] pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <DialogTitle className="text-xl font-bold text-[#202521]">
                    {selectedCustomer.name}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-[#5E6B63]">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {selectedCustomer.phone}
                    </span>
                    {selectedCustomer.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" /> {selectedCustomer.email}
                      </span>
                    )}
                    {selectedCustomer.gstin && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" /> GSTIN: {selectedCustomer.gstin}
                      </span>
                    )}
                  </div>
                  {selectedCustomer.address && (
                    <p className="text-xs text-[#5E6B63] flex items-center gap-1 mt-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {selectedCustomer.address}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedCustomer.is_active ? 'success' : 'neutral'}>
                    {selectedCustomer.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {parseFloat(selectedCustomer.total_balance_due) > 0 && (
                    <Button
                      size="sm"
                      onClick={() => openRecordPayment(selectedCustomer)}
                      className="bg-[#B3261E] hover:bg-[#8e1f18] text-white text-xs h-8 flex items-center gap-1"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Record Payment
                    </Button>
                  )}
                </div>
              </div>
            </DialogHeader>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#E3E1DA]">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#5E6B63]">
                  Outstanding Udhaar
                </p>
                <p
                  className={`text-lg font-bold mt-1 ${
                    parseFloat(customerSummary?.total_balance_due || selectedCustomer.total_balance_due) > 0
                      ? 'text-[#B3261E]'
                      : 'text-[#2F7D4F]'
                  }`}
                >
                  {formatCurrency(
                    customerSummary?.total_balance_due || selectedCustomer.total_balance_due
                  )}
                </p>
              </div>

              <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#E3E1DA]">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#5E6B63]">
                  Lifetime Value
                </p>
                <p className="text-lg font-bold text-[#202521] mt-1">
                  {formatCurrency(
                    customerSummary?.lifetime_value || selectedCustomer.lifetime_value
                  )}
                </p>
              </div>

              <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#E3E1DA]">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#5E6B63]">
                  Total Payments
                </p>
                <p className="text-lg font-bold text-[#2F7D4F] mt-1">
                  {formatCurrency(customerSummary?.total_payments || '0.00')}
                </p>
              </div>

              <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#E3E1DA]">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#5E6B63]">
                  Total Invoices
                </p>
                <p className="text-lg font-bold text-[#202521] mt-1">
                  {customerSummary?.sales_count || selectedCustomer.sales_count}
                </p>
              </div>
            </div>

            {/* Tabs for Invoices vs Payments */}
            <div className="flex border-b border-[#E3E1DA] mb-4">
              <button
                onClick={() => setDetailTab('sales')}
                className={`py-2 px-4 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                  detailTab === 'sales'
                    ? 'border-[#233831] text-[#233831]'
                    : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
                }`}
              >
                <Receipt className="h-4 w-4" />
                Sales & Invoices ({customerSales?.length || 0})
              </button>
              <button
                onClick={() => setDetailTab('payments')}
                className={`py-2 px-4 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                  detailTab === 'payments'
                    ? 'border-[#233831] text-[#233831]'
                    : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
                }`}
              >
                <History className="h-4 w-4" />
                Payment History ({customerPayments?.length || 0})
              </button>
            </div>

            {/* Sales Table Tab */}
            {detailTab === 'sales' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF8F5] text-[#5E6B63] uppercase font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Warehouse</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 px-3 text-right">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]">
                    {!customerSales || customerSales.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-[#5E6B63]">
                          No sales recorded for this customer yet.
                        </td>
                      </tr>
                    ) : (
                      customerSales.map((s) => {
                        const bal = parseFloat(s.balance_due || '0');
                        return (
                          <tr key={s.id} className="hover:bg-[#FAF8F5]/50">
                            <td className="py-2.5 px-3 font-semibold text-[#202521]">
                              {s.sale_number}
                            </td>
                            <td className="py-2.5 px-3 text-[#5E6B63]">
                              {formatDate(s.created_at)}
                            </td>
                            <td className="py-2.5 px-3 text-[#5E6B63]">
                              {s.warehouse_name}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-[#202521]">
                              {formatCurrency(s.total_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-[#2F7D4F]">
                              {formatCurrency(s.amount_paid)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {bal > 0 ? (
                                <span className="font-semibold text-[#B3261E]">
                                  {formatCurrency(s.balance_due)}
                                </span>
                              ) : (
                                <span className="text-[#2F7D4F]">Paid</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payments Table Tab */}
            {detailTab === 'payments' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF8F5] text-[#5E6B63] uppercase font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Receipt #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3">Warehouse / Cashier</th>
                      <th className="py-2.5 px-3">Notes</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]">
                    {!customerPayments || customerPayments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-[#5E6B63]">
                          No payments recorded for this customer yet.
                        </td>
                      </tr>
                    ) : (
                      customerPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-[#FAF8F5]/50">
                          <td className="py-2.5 px-3 font-semibold text-[#202521]">
                            {p.payment_number}
                          </td>
                          <td className="py-2.5 px-3 text-[#5E6B63]">
                            {formatDate(p.created_at)}
                          </td>
                          <td className="py-2.5 px-3 uppercase font-medium text-[#202521]">
                            {p.payment_method.replace('_', ' ')}
                          </td>
                          <td className="py-2.5 px-3 text-[#5E6B63]">
                            {p.warehouse_name} ({p.cashier_name})
                          </td>
                          <td className="py-2.5 px-3 text-[#5E6B63] truncate max-w-xs">
                            {p.notes || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#2F7D4F]">
                            +{formatCurrency(p.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Add / Edit Customer Modal */}
      <Dialog open={isAddEditOpen} onOpenChange={setIsAddEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!formData.name.trim()) {
                toast.error('Customer name is required.');
                return;
              }
              if (!formData.phone.trim()) {
                toast.error('Customer phone number is required.');
                return;
              }
              saveCustomerMutation.mutate();
            }}
            className="space-y-4 pt-2"
          >
            <div>
              <label className="block text-xs font-semibold text-[#202521] uppercase mb-1">
                Full Name *
              </label>
              <Input
                placeholder="e.g. Ramesh Kumar"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202521] uppercase mb-1">
                Phone Number *
              </label>
              <Input
                placeholder="e.g. 9876543210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202521] uppercase mb-1">
                Email Address
              </label>
              <Input
                type="email"
                placeholder="e.g. ramesh@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202521] uppercase mb-1">
                GSTIN (Tax ID)
              </label>
              <Input
                placeholder="e.g. 29AAAAA0000A1Z5"
                value={formData.gstin}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202521] uppercase mb-1">
                Address
              </label>
              <textarea
                rows={2}
                placeholder="Customer shop or billing address..."
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full text-sm border border-[#E3E1DA] rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-[#233831]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddEditOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveCustomerMutation.isPending}
                className="bg-[#233831] text-white hover:bg-[#1b2b26]"
              >
                {saveCustomerMutation.isPending
                  ? 'Saving...'
                  : editingCustomer
                  ? 'Update Customer'
                  : 'Create Customer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      {customerToPay && (
        <Dialog open={isRecordPaymentOpen} onOpenChange={setIsRecordPaymentOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#2F7D4F]" />
                Record Payment (Settle Udhaar)
              </DialogTitle>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = parseFloat(paymentAmount);
                const maxBal = parseFloat(customerToPay.total_balance_due);
                if (isNaN(amt) || amt <= 0) {
                  toast.error('Payment amount must be greater than zero.');
                  return;
                }
                if (amt > maxBal) {
                  toast.error(`Payment cannot exceed outstanding balance of ${formatCurrency(maxBal)}.`);
                  return;
                }
                recordPaymentMutation.mutate();
              }}
              className="space-y-4 pt-2"
            >
              <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#E3E1DA] space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#5E6B63]">Customer:</span>
                  <span className="font-semibold text-[#202521]">{customerToPay.name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#5E6B63]">Phone:</span>
                  <span className="font-medium text-[#202521]">{customerToPay.phone}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-[#E3E1DA]">
                  <span className="font-semibold text-[#B3261E]">Total Outstanding Udhaar:</span>
                  <span className="font-bold text-[#B3261E]">
                    {formatCurrency(customerToPay.total_balance_due)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202521] uppercase mb-1">
                  Payment Amount (₹) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={customerToPay.total_balance_due}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  className="font-bold text-lg"
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[11px] text-[#5E6B63]">
                    Remaining Udhaar: {formatCurrency(
                      Math.max(0, parseFloat(customerToPay.total_balance_due) - (parseFloat(paymentAmount) || 0))
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(customerToPay.total_balance_due)}
                    className="text-[11px] text-[#2F7D4F] hover:underline font-medium"
                  >
                    Pay Full Balance
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202521] uppercase mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full text-sm border border-[#E3E1DA] rounded-md p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#233831]"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / QR Code</option>
                  <option value="card">Debit / Credit Card</option>
                  <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202521] uppercase mb-1">
                  Reference / Notes
                </label>
                <Input
                  placeholder="e.g. UPI Ref #, Cheque number, notes..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>

              <div className="p-2.5 bg-[#E6F2EA] rounded-md text-[11px] text-[#2F7D4F] flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Payments automatically apply to the <strong>oldest unpaid credit sales first</strong> (FIFO allocation).
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRecordPaymentOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={recordPaymentMutation.isPending}
                  className="bg-[#233831] text-white hover:bg-[#1b2b26]"
                >
                  {recordPaymentMutation.isPending ? 'Recording...' : 'Confirm Payment'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
