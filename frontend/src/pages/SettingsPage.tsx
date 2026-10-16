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
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { BusinessSettings } from '../types';

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

  const { data: settings, isLoading, isError } = useQuery<BusinessSettings>({
    queryKey: ['business-settings'],
    queryFn: () => apiRequest<BusinessSettings>('business-settings/'),
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(form);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#173D32]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-semibold">Failed to load business settings.</p>
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
            <Building2 className="w-6 h-6 text-[#173D32]" />
            Business & Tax Configuration
          </h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            Enterprise identity, Indian GST tax rules, invoice numbering, and catalog pricing behavior.
          </p>
        </div>
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
            Save Configuration
          </Button>
        </div>
      </div>

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
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
};
