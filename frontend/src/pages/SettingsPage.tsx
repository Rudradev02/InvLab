import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Receipt,
  MapPin,
  Save,
  AlertCircle,
  RotateCcw,
  Percent,
  Bell,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { BusinessSettings, NotificationSettings } from '../types';

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

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'business' | 'notifications'>('business');

  // Business Settings Query
  const { data: settings, isLoading: isBusinessLoading, isError: isBusinessError } = useQuery<BusinessSettings>({
    queryKey: ['business-settings'],
    queryFn: () => apiRequest<BusinessSettings>('business-settings/'),
  });

  // Notification Settings Query
  const {
    data: notifSettings,
    isLoading: isNotifLoading,
    isError: isNotifError,
  } = useQuery<NotificationSettings>({
    queryKey: ['notification-settings'],
    queryFn: () => apiRequest<NotificationSettings>('notification-settings/'),
  });

  const [form, setForm] = useState({
    name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: 'Maharashtra',
    pincode: '',
    phone: '',
    email: '',
    gstin: '',
    invoice_prefix: '',
    prices_include_tax: false,
  });

  const [notifForm, setNotifForm] = useState({
    enable_low_stock_alerts: true,
    enable_daily_summary: true,
    additional_recipients: '',
  });

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name || '',
        address_line1: settings.address_line1 || '',
        address_line2: settings.address_line2 || '',
        city: settings.city || '',
        state: settings.state || 'Maharashtra',
        pincode: settings.pincode || '',
        phone: settings.phone || '',
        email: settings.email || '',
        gstin: settings.gstin || '',
        invoice_prefix: settings.invoice_prefix || '',
        prices_include_tax: Boolean(settings.prices_include_tax),
      });
    }
  }, [settings]);

  useEffect(() => {
    if (notifSettings) {
      setNotifForm({
        enable_low_stock_alerts: Boolean(notifSettings.enable_low_stock_alerts),
        enable_daily_summary: Boolean(notifSettings.enable_daily_summary),
        additional_recipients: notifSettings.additional_recipients || '',
      });
    }
  }, [notifSettings]);

  const updateMutation = useMutation({
    mutationFn: (updated: typeof form) => {
      return apiRequest<BusinessSettings>('business-settings/', {
        method: 'PUT',
        body: JSON.stringify(updated),
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['business-settings'], data);
      toast.success('Business settings updated successfully!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update settings');
    },
  });

  const updateNotifMutation = useMutation({
    mutationFn: (updated: typeof notifForm) => {
      return apiRequest<NotificationSettings>('notification-settings/', {
        method: 'PUT',
        body: JSON.stringify(updated),
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['notification-settings'], data);
      toast.success('Notification settings updated successfully!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update notification settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(form);
  };

  const handleNotifSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateNotifMutation.mutate(notifForm);
  };

  const handleReset = () => {
    if (settings) {
      setForm({
        name: settings.name || '',
        address_line1: settings.address_line1 || '',
        address_line2: settings.address_line2 || '',
        city: settings.city || '',
        state: settings.state || 'Maharashtra',
        pincode: settings.pincode || '',
        phone: settings.phone || '',
        email: settings.email || '',
        gstin: settings.gstin || '',
        invoice_prefix: settings.invoice_prefix || '',
        prices_include_tax: Boolean(settings.prices_include_tax),
      });
      toast.info('Form reset to saved values');
    }
  };

  const handleNotifReset = () => {
    if (notifSettings) {
      setNotifForm({
        enable_low_stock_alerts: Boolean(notifSettings.enable_low_stock_alerts),
        enable_daily_summary: Boolean(notifSettings.enable_daily_summary),
        additional_recipients: notifSettings.additional_recipients || '',
      });
      toast.info('Notification settings reset to saved values');
    }
  };

  const parsedRecipients = notifForm.additional_recipients
    .split(/[\n,]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);

  if (isBusinessLoading || isNotifLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#173D32]" />
      </div>
    );
  }

  if (isBusinessError || isNotifError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-semibold">Failed to load system settings.</p>
        <p className="text-sm">Please verify your network connection and administrator privileges.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202521] flex items-center gap-2.5">
            {activeTab === 'business' ? (
              <Building2 className="w-6 h-6 text-[#173D32]" />
            ) : (
              <Bell className="w-6 h-6 text-[#173D32]" />
            )}
            System Configuration
          </h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            {activeTab === 'business'
              ? 'Enterprise identity, Indian GST tax rules, invoice numbering, and catalog pricing behavior.'
              : 'Automated threshold email alerts, daily sales & stock summaries, and notification routing.'}
          </p>
        </div>

        {/* Global Save / Reset Header Buttons based on active tab */}
        {activeTab === 'business' ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Discard Changes
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              isLoading={updateMutation.isPending}
              className="flex items-center gap-1.5 cursor-pointer bg-[#173D32] hover:bg-[#123128] text-white"
            >
              <Save className="w-3.5 h-3.5" />
              Save Business Settings
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNotifReset}
              disabled={updateNotifMutation.isPending}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleNotifSubmit}
              isLoading={updateNotifMutation.isPending}
              className="flex items-center gap-1.5 cursor-pointer bg-[#173D32] hover:bg-[#123128] text-white"
            >
              <Save className="w-3.5 h-3.5" />
              Save Notification Settings
            </Button>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#E3E1DA] gap-6 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('business')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'business'
              ? 'border-[#173D32] text-[#173D32]'
              : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Business & GST Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'notifications'
              ? 'border-[#173D32] text-[#173D32]'
              : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
          }`}
        >
          <Bell className="w-4 h-4" />
          Email & Notification Alerts
        </button>
      </div>

      {/* Tab 1: Business Settings */}
      {activeTab === 'business' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Enterprise Profile */}
          <div className="bg-white rounded-xl border border-[#E3E1DA] shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E3E1DA] bg-[#F8F8F5] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#173D32]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#202521]">Enterprise Profile</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Input
                  label="Legal Business Name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. InvLab Enterprise Private Limited"
                  helperText="Printed as the billing entity name on all tax invoices."
                />
              </div>
              <div>
                <Input
                  label="Billing Email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="billing@invlab.local"
                />
              </div>
              <div>
                <Input
                  label="Contact Phone"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Registered Address & Jurisdiction */}
          <div className="bg-white rounded-xl border border-[#E3E1DA] shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E3E1DA] bg-[#F8F8F5] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#173D32]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#202521]">
                Registered Address & State Jurisdiction
              </h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Input
                  label="Address Line 1"
                  required
                  value={form.address_line1}
                  onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                  placeholder="Shop No. 12, Tech Park, Phase 1"
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  label="Address Line 2 (Optional)"
                  value={form.address_line2}
                  onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
                  placeholder="Hinjawadi Main Road"
                />
              </div>
              <div>
                <Input
                  label="City / Town"
                  required
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Pune"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                  State Jurisdiction (Seller State)
                </label>
                <select
                  required
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#5E6B63] mt-1">
                  Sales within this state generate CGST + SGST. Sales to other states generate IGST.
                </p>
              </div>
              <div>
                <Input
                  label="Postal PIN Code"
                  required
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                  placeholder="411057"
                />
              </div>
            </div>
          </div>

          {/* Card 3: GSTIN & Invoice Numbering Rules */}
          <div className="bg-white rounded-xl border border-[#E3E1DA] shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E3E1DA] bg-[#F8F8F5] flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#173D32]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#202521]">
                GST & Invoice Numbering Settings
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Seller GSTIN (15 characters)"
                    required
                    value={form.gstin}
                    onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                    placeholder="27AABCU9603R1ZM"
                    helperText="State code (first 2 digits) must match your state jurisdiction."
                  />
                </div>
                <div>
                  <Input
                    label="Optional Invoice Prefix"
                    value={form.invoice_prefix}
                    onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value.toUpperCase() })}
                    placeholder="e.g. INV or SL (leave empty for default)"
                    helperText="Generates numbers like INV/PUN/2026-27/000001 (locked row sequence per FY)."
                  />
                </div>
              </div>

              {/* Tax Inclusive vs Exclusive Mode Selection */}
              <div className="border border-[#E3E1DA] rounded-lg p-4 bg-[#FBFBFA]">
                <label className="text-sm font-bold text-[#202521] flex items-center gap-1.5 mb-2">
                  <Percent className="w-4 h-4 text-[#173D32]" />
                  Catalog Pricing & Tax Mode
                </label>
                <p className="text-xs text-[#5E6B63] mb-4">
                  Define whether catalog product prices entered in InvLab include or exclude GST.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                      !form.prices_include_tax
                        ? 'border-[#173D32] bg-[#EBF3EF]/40 ring-1 ring-[#173D32]'
                        : 'border-[#E3E1DA] bg-white hover:bg-[#F8F8F5]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tax_mode"
                      checked={!form.prices_include_tax}
                      onChange={() => setForm({ ...form, prices_include_tax: false })}
                      className="mt-1 text-[#173D32] focus:ring-[#173D32]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-[#202521] block">Tax Exclusive (GST on top)</span>
                      <span className="text-xs text-[#5E6B63] block mt-0.5">
                        Catalog price is the base taxable rate. GST is added on top during checkout (e.g., ₹1000 + 18% = ₹1180).
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                      form.prices_include_tax
                        ? 'border-[#173D32] bg-[#EBF3EF]/40 ring-1 ring-[#173D32]'
                        : 'border-[#E3E1DA] bg-white hover:bg-[#F8F8F5]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tax_mode"
                      checked={form.prices_include_tax}
                      onChange={() => setForm({ ...form, prices_include_tax: true })}
                      className="mt-1 text-[#173D32] focus:ring-[#173D32]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-[#202521] block">Tax Inclusive (MRP Style)</span>
                      <span className="text-xs text-[#5E6B63] block mt-0.5">
                        Catalog price already includes GST. The server automatically calculates taxable base and tax breakdown (e.g., ₹1180 = ₹1000 base + ₹180 tax).
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Disclaimer Alert */}
          <div className="bg-[#FFFDF5] border border-[#F5E6B3] rounded-xl p-4 flex items-start gap-3 text-xs text-[#7A5A00]">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-[#9A7400] mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">Regulatory Disclaimer</span>
              InvLab invoice formatting provides compliant tax breakdown, HSN summaries, and sequential numbering in accordance with Indian GST Tax Invoice guidelines. InvLab is not a certified tax filing tool or GSTR upload utility.
            </div>
          </div>

          {/* Form Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={updateMutation.isPending}
              className="cursor-pointer"
            >
              Reset Form
            </Button>
            <Button
              type="submit"
              isLoading={updateMutation.isPending}
              className="cursor-pointer bg-[#173D32] hover:bg-[#123128] text-white px-6"
            >
              Save Business Settings
            </Button>
          </div>
        </form>
      )}

      {/* Tab 2: Notification & Email Alert Settings */}
      {activeTab === 'notifications' && (
        <form onSubmit={handleNotifSubmit} className="space-y-6">
          {/* Card 1: Low-Stock Real-time Alerts */}
          <div className="bg-white rounded-xl border border-[#E3E1DA] shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E3E1DA] bg-[#F8F8F5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#173D32]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#202521]">
                  Low-Stock Real-Time Alerts
                </h2>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  notifForm.enable_low_stock_alerts
                    ? 'bg-[#E6F2EA] text-[#173D32]'
                    : 'bg-[#F1F1EC] text-[#5E6B63]'
                }`}
              >
                {notifForm.enable_low_stock_alerts ? 'Active' : 'Disabled'}
              </span>
            </div>

            <div className="p-6 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifForm.enable_low_stock_alerts}
                  onChange={(e) =>
                    setNotifForm({
                      ...notifForm,
                      enable_low_stock_alerts: e.target.checked,
                    })
                  }
                  className="mt-1 w-4 h-4 text-[#173D32] rounded border-[#E3E1DA] focus:ring-[#173D32]"
                />
                <div>
                  <span className="text-sm font-semibold text-[#202521] block">
                    Dispatch instant email notifications when stock crosses reorder level
                  </span>
                  <span className="text-xs text-[#5E6B63] block mt-1 leading-relaxed">
                    Whenever an inventory receipt, stock adjustment, sales checkout, or inter-warehouse transfer brings a product's available quantity to or below its minimum reorder point, an email alert is automatically scheduled and sent.
                  </span>
                </div>
              </label>

              <div className="bg-[#F8F8F5] rounded-lg p-4 border border-[#E3E1DA] text-xs text-[#5E6B63] space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-[#202521]">
                  <ShieldCheck className="w-4 h-4 text-[#173D32]" />
                  Recipient Routing & Anti-Spam Logic:
                </div>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li>
                    <strong className="text-[#202521]">Warehouse Scoping:</strong> Assigned Warehouse Managers receive alerts only for products in their specific facility. Admins receive alerts across all facilities.
                  </li>
                  <li>
                    <strong className="text-[#202521]">Alert Deduplication:</strong> Exactly one email is dispatched per product/warehouse pair when dipping below reorder level. Repeated transactions will not resend emails until stock is replenished above the reorder point.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Card 2: Daily Executive Summary */}
          <div className="bg-white rounded-xl border border-[#E3E1DA] shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E3E1DA] bg-[#F8F8F5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#173D32]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#202521]">
                  Daily Executive Digest
                </h2>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  notifForm.enable_daily_summary
                    ? 'bg-[#E6F2EA] text-[#173D32]'
                    : 'bg-[#F1F1EC] text-[#5E6B63]'
                }`}
              >
                {notifForm.enable_daily_summary ? 'Active' : 'Disabled'}
              </span>
            </div>

            <div className="p-6 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifForm.enable_daily_summary}
                  onChange={(e) =>
                    setNotifForm({
                      ...notifForm,
                      enable_daily_summary: e.target.checked,
                    })
                  }
                  className="mt-1 w-4 h-4 text-[#173D32] rounded border-[#E3E1DA] focus:ring-[#173D32]"
                />
                <div>
                  <span className="text-sm font-semibold text-[#202521] block">
                    Enable daily automated business & inventory summary emails
                  </span>
                  <span className="text-xs text-[#5E6B63] block mt-1 leading-relaxed">
                    Compiles daily key operating metrics: active low-stock products, day's total sales volume & net revenue, and outstanding customer credit (Udhaar) balances.
                  </span>
                </div>
              </label>

              <div className="bg-[#F8F8F5] rounded-lg p-4 border border-[#E3E1DA] text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-[#202521] mb-1.5">
                  <Terminal className="w-4 h-4 text-[#173D32]" />
                  Automated Scheduling Setup
                </div>
                <p className="text-[#5E6B63] mb-2">
                  InvLab relies on standard OS task scheduling (no background worker daemons required). Execute this Django management command via cron or Windows Task Scheduler:
                </p>
                <code className="block bg-[#202521] text-[#E6F2EA] p-2.5 rounded font-mono text-[11px] overflow-x-auto">
                  python manage.py send_daily_summary
                </code>
              </div>
            </div>
          </div>

          {/* Card 3: Additional Recipients */}
          <div className="bg-white rounded-xl border border-[#E3E1DA] shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E3E1DA] bg-[#F8F8F5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#173D32]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#202521]">
                  Additional Alert Recipients
                </h2>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#F1F1EC] text-[#5E6B63]">
                {parsedRecipients.length} {parsedRecipients.length === 1 ? 'recipient' : 'recipients'}
              </span>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                  External & Global Notification Emails
                </label>
                <textarea
                  rows={3}
                  value={notifForm.additional_recipients}
                  onChange={(e) =>
                    setNotifForm({
                      ...notifForm,
                      additional_recipients: e.target.value,
                    })
                  }
                  placeholder="operations@invlab.local, audit@invlab.local, founder@invlab.local"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                />
                <p className="text-[11px] text-[#5E6B63] mt-1.5">
                  Comma-separated or newline-separated email addresses. These recipients receive copies of all warehouse alerts and executive summaries regardless of warehouse assignment.
                </p>
              </div>

              {parsedRecipients.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {parsedRecipients.map((email, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#E6F2EA] text-[#173D32] text-xs font-medium border border-[#c2e4cd]"
                    >
                      <CheckCircle2 className="w-3 h-3 text-[#173D32]" />
                      {email}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notification Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleNotifReset}
              disabled={updateNotifMutation.isPending}
              className="cursor-pointer"
            >
              Reset Changes
            </Button>
            <Button
              type="submit"
              isLoading={updateNotifMutation.isPending}
              className="cursor-pointer bg-[#173D32] hover:bg-[#123128] text-white px-6"
            >
              Save Notification Settings
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
