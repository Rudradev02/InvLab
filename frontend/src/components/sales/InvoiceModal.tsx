import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Printer,
  Download,
  Receipt,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { InvoiceDetails } from '../../types';
import { formatCurrency, formatDate } from '../../lib/format';

interface InvoiceModalProps {
  saleId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ saleId, isOpen, onClose }) => {
  const { data: invoice, isLoading, isError } = useQuery<InvoiceDetails>({
    queryKey: ['sale-invoice', saleId],
    queryFn: async () => {
      if (!saleId) throw new Error('No sale id provided');
      return apiRequest<InvoiceDetails>(`sales/${saleId}/invoice/`);
    },
    enabled: Boolean(isOpen && saleId),
  });

  const handleDownloadPdf = async () => {
    if (!saleId || !invoice) return;
    try {
      const response = await fetch(`/api/v1/sales/${saleId}/invoice/pdf/`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to download invoice PDF');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanNum = (invoice.invoice_number || invoice.sale_number).replace(/[/\\]/g, '_');
      link.setAttribute('download', `invoice-${cleanNum}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Tax invoice PDF downloaded successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download invoice PDF');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white p-6 shadow-2xl">
        <DialogHeader className="border-b border-[#E3E1DA] pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#173D32]">
              <Receipt className="w-5 h-5 text-[#173D32]" />
              <DialogTitle className="text-lg font-bold">
                Tax Invoice • {invoice?.invoice_number || 'Loading...'}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={!invoice}
                className="flex items-center gap-1.5 cursor-pointer text-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </Button>
              <Button
                size="sm"
                onClick={handleDownloadPdf}
                disabled={!invoice}
                className="flex items-center gap-1.5 cursor-pointer text-xs bg-[#173D32] hover:bg-[#123128] text-white"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#173D32]" />
            <p className="text-xs text-[#5E6B63]">Loading tax invoice details...</p>
          </div>
        ) : isError || !invoice ? (
          <div className="py-12 text-center text-red-600 space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto" />
            <p className="font-semibold text-sm">Failed to load invoice information.</p>
          </div>
        ) : (
          <div className="space-y-6 pt-4 text-[#202521] text-xs font-sans print:p-0">
            {/* INVOICE HEADER */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl border border-[#E3E1DA] bg-[#F8F8F5]">
              {/* Seller Information */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5E6B63]">Seller Details</span>
                <h3 className="text-base font-bold text-[#173D32]">{invoice.seller.name}</h3>
                <p className="text-[#334155] leading-relaxed">
                  {invoice.seller.address_line1}
                  {invoice.seller.address_line2 ? `, ${invoice.seller.address_line2}` : ''}
                  <br />
                  {invoice.seller.city}, {invoice.seller.state} - {invoice.seller.pincode}
                </p>
                <div className="pt-1 space-y-0.5 text-[#475569]">
                  <p>
                    GSTIN: <strong className="text-[#0F172A] font-mono">{invoice.seller.gstin}</strong>
                  </p>
                  <p>State: <strong>{invoice.seller.state}</strong></p>
                  <p>Warehouse: <strong>{invoice.seller.warehouse_name} ({invoice.seller.warehouse_code})</strong></p>
                  <p>Email: {invoice.seller.email} | Phone: {invoice.seller.phone}</p>
                </div>
              </div>

              {/* Invoice Meta */}
              <div className="md:text-right space-y-1">
                <div className="inline-block bg-[#173D32] text-white text-[11px] font-bold px-2.5 py-1 rounded-sm uppercase tracking-wider mb-2">
                  TAX INVOICE
                </div>
                <div>
                  <span className="text-[#5E6B63]">Invoice No: </span>
                  <span className="font-bold font-mono text-sm text-[#0F172A]">{invoice.invoice_number}</span>
                </div>
                <div>
                  <span className="text-[#5E6B63]">Date &amp; Time: </span>
                  <span className="font-medium text-[#0F172A]">{formatDate(invoice.created_at)}</span>
                </div>
                <div>
                  <span className="text-[#5E6B63]">Sale Reference: </span>
                  <span className="font-mono text-[#0F172A]">{invoice.sale_number}</span>
                </div>
                <div>
                  <span className="text-[#5E6B63]">Place of Supply: </span>
                  <strong className="text-[#0F172A]">{invoice.buyer.place_of_supply}</strong>
                </div>
                <div className="pt-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      invoice.is_interstate
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {invoice.is_interstate ? 'Inter-State (IGST Applicable)' : 'Intra-State (CGST + SGST Applicable)'}
                  </span>
                </div>
              </div>
            </div>

            {/* BUYER INFORMATION */}
            <div className="p-4 rounded-xl border border-[#E3E1DA] bg-white">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5E6B63] block mb-1">
                Bill To (Customer Information)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <span className="text-[#5E6B63] block">Customer Name:</span>
                  <strong className="text-sm text-[#0F172A]">{invoice.buyer.name}</strong>
                  {invoice.buyer.phone && <p className="text-[#475569]">{invoice.buyer.phone}</p>}
                </div>
                <div>
                  <span className="text-[#5E6B63] block">Customer GSTIN:</span>
                  <strong className="font-mono text-[#0F172A]">{invoice.buyer.gstin || 'Unregistered / Consumer'}</strong>
                  {invoice.buyer.email && <p className="text-[#475569]">{invoice.buyer.email}</p>}
                </div>
                <div>
                  <span className="text-[#5E6B63] block">Billing Address:</span>
                  <p className="text-[#475569]">{invoice.buyer.address || 'Retail Walk-in'}</p>
                </div>
              </div>
            </div>

            {/* ITEMIZED PRODUCTS TABLE */}
            <div className="border border-[#E3E1DA] rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#173D32] text-white">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3">HSN/SAC</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Rate</th>
                    <th className="py-2.5 px-3 text-right">Taxable</th>
                    {invoice.is_interstate ? (
                      <>
                        <th className="py-2.5 px-3 text-right">IGST %</th>
                        <th className="py-2.5 px-3 text-right">IGST (₹)</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                        <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                      </>
                    )}
                    <th className="py-2.5 px-3 text-right font-bold">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E1DA]">
                  {invoice.items.map((item, idx) => (
                    <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFA]'}>
                      <td className="py-2 px-3 text-center text-[#5E6B63]">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-[#0F172A]">{item.product_name}</div>
                        <div className="text-[10px] text-[#5E6B63] font-mono">SKU: {item.product_sku}</div>
                      </td>
                      <td className="py-2 px-3 font-mono text-[#475569]">{item.hsn_code || '—'}</td>
                      <td className="py-2 px-3 text-right font-medium">{item.quantity}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(item.unit_price)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(item.taxable_amount)}</td>
                      {invoice.is_interstate ? (
                        <>
                          <td className="py-2 px-3 text-right">{item.gst_rate}%</td>
                          <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(item.igst_amount)}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(item.cgst_amount)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(item.sgst_amount)}</td>
                        </>
                      )}
                      <td className="py-2 px-3 text-right font-bold tabular-nums text-[#173D32]">
                        {formatCurrency(item.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* HSN SUMMARY AND TOTALS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* HSN Summary Table */}
              <div className="border border-[#E3E1DA] rounded-xl overflow-hidden">
                <div className="bg-[#F8F8F5] px-3 py-2 border-b border-[#E3E1DA] font-bold uppercase tracking-wider text-[10px] text-[#5E6B63]">
                  HSN / SAC Tax Breakup
                </div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#FAFAFA] text-[#475569] border-b border-[#E3E1DA]">
                    <tr>
                      <th className="py-1.5 px-2.5">HSN/SAC</th>
                      <th className="py-1.5 px-2.5 text-right">Taxable</th>
                      {invoice.is_interstate ? (
                        <>
                          <th className="py-1.5 px-2.5 text-right">Rate</th>
                          <th className="py-1.5 px-2.5 text-right">IGST</th>
                        </>
                      ) : (
                        <>
                          <th className="py-1.5 px-2.5 text-right">CGST</th>
                          <th className="py-1.5 px-2.5 text-right">SGST</th>
                        </>
                      )}
                      <th className="py-1.5 px-2.5 text-right">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E1DA]">
                    {invoice.hsn_summary.map((h, i) => (
                      <tr key={i} className="text-[11px]">
                        <td className="py-1.5 px-2.5 font-mono font-medium">{h.hsn_code}</td>
                        <td className="py-1.5 px-2.5 text-right tabular-nums">{formatCurrency(h.taxable_amount)}</td>
                        {invoice.is_interstate ? (
                          <>
                            <td className="py-1.5 px-2.5 text-right">{h.gst_rate}%</td>
                            <td className="py-1.5 px-2.5 text-right tabular-nums">{formatCurrency(h.igst_amount)}</td>
                          </>
                        ) : (
                          <>
                            <td className="py-1.5 px-2.5 text-right tabular-nums">{formatCurrency(h.cgst_amount)}</td>
                            <td className="py-1.5 px-2.5 text-right tabular-nums">{formatCurrency(h.sgst_amount)}</td>
                          </>
                        )}
                        <td className="py-1.5 px-2.5 text-right font-semibold tabular-nums">
                          {formatCurrency(h.tax_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Breakdown Table */}
              <div className="border border-[#E3E1DA] rounded-xl p-4 bg-[#F8F8F5] space-y-2">
                <div className="flex justify-between items-center text-xs text-[#475569]">
                  <span>Subtotal (Gross):</span>
                  <span className="font-semibold text-[#0F172A] tabular-nums">
                    {formatCurrency(invoice.financials.subtotal)}
                  </span>
                </div>
                {parseFloat(invoice.financials.discount_amount || '0') > 0 && (
                  <div className="flex justify-between items-center text-xs text-[#2F7D4F]">
                    <span>Discount ({invoice.financials.discount_type === 'percent' ? `${invoice.financials.discount_value}%` : 'Flat'}):</span>
                    <span className="font-semibold tabular-nums">-{formatCurrency(invoice.financials.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs text-[#475569]">
                  <span>Taxable Value:</span>
                  <span className="font-semibold text-[#0F172A] tabular-nums">
                    {formatCurrency(invoice.financials.taxable_amount)}
                  </span>
                </div>
                {invoice.is_interstate ? (
                  <div className="flex justify-between items-center text-xs text-[#475569]">
                    <span>Total IGST:</span>
                    <span className="font-semibold text-[#0F172A] tabular-nums">
                      {formatCurrency(invoice.financials.igst_amount)}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center text-xs text-[#475569]">
                      <span>Total CGST:</span>
                      <span className="font-semibold text-[#0F172A] tabular-nums">
                        {formatCurrency(invoice.financials.cgst_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-[#475569]">
                      <span>Total SGST:</span>
                      <span className="font-semibold text-[#0F172A] tabular-nums">
                        {formatCurrency(invoice.financials.sgst_amount)}
                      </span>
                    </div>
                  </>
                )}
                {parseFloat(invoice.financials.round_off_amount || '0') !== 0 && (
                  <div className="flex justify-between items-center text-xs text-[#5E6B63]">
                    <span>Round Off:</span>
                    <span className="tabular-nums">
                      {parseFloat(invoice.financials.round_off_amount) > 0 ? '+' : ''}
                      {formatCurrency(invoice.financials.round_off_amount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-base font-extrabold border-t border-[#E3E1DA] pt-2 text-[#173D32]">
                  <span>Total Invoice Value:</span>
                  <span className="text-lg tabular-nums">{formatCurrency(invoice.financials.total_amount)}</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-[#E3E1DA]/60">
                  <span className="text-[#5E6B63]">Payment Method:</span>
                  <span className="font-semibold uppercase text-[#0F172A]">{invoice.financials.payment_method}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-[#2F7D4F]">
                  <span>Amount Received:</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(invoice.financials.amount_paid)}</span>
                </div>
                {parseFloat(invoice.financials.balance_due || '0') > 0 && (
                  <div className="flex justify-between items-center text-xs text-[#B3261E]">
                    <span className="font-bold">Balance Due (Udhaar):</span>
                    <span className="font-bold tabular-nums">{formatCurrency(invoice.financials.balance_due)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* AMOUNT IN WORDS */}
            <div className="p-3 rounded-lg border border-[#E3E1DA] bg-[#FAFAF8]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5E6B63] block">
                Total Amount in Words
              </span>
              <p className="font-medium italic text-[#173D32] text-xs mt-0.5">
                {invoice.financials.amount_in_words || '—'}
              </p>
            </div>

            {/* DISCLAIMER FOOTER */}
            <div className="p-3 rounded-lg border border-[#E3E1DA] text-[10px] text-[#64748B] flex items-center justify-between">
              <div>
                Tax Invoice • Computer Generated Document • InvLab invoice formatting is not a certified tax filing tool.
              </div>
              <div>
                Authorized Signatory for <strong>{invoice.seller.name}</strong>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
