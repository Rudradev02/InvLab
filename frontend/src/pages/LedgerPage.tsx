import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { StockMovement, PaginatedResponse } from '../types';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { formatDate } from '../lib/format';
import { FileSpreadsheet, ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react';

export const LedgerPage: React.FC = () => {
  const { selectedWarehouseId } = useAuth();
  const [movementFilter, setMovementFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ['ledger', selectedWarehouseId, movementFilter],
    queryFn: () => {
      let q = selectedWarehouseId ? `?warehouse=${selectedWarehouseId}` : '?';
      if (movementFilter) q += `&movement_type=${movementFilter}`;
      return apiRequest<PaginatedResponse<StockMovement>>(`ledger/${q}`);
    },
  });

  const movements = ledgerData?.results || [];

  const filtered = movements.filter(
    (m) =>
      m.product_name.toLowerCase().includes(search.toLowerCase()) ||
      m.product_sku.toLowerCase().includes(search.toLowerCase()) ||
      (m.reference && m.reference.toLowerCase().includes(search.toLowerCase())) ||
      (m.reason && m.reason.toLowerCase().includes(search.toLowerCase())) ||
      m.username.toLowerCase().includes(search.toLowerCase())
  );

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
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#202521] flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-[#173D32]" /> Stock Movement Ledger
        </h1>
        <p className="text-sm text-[#5E6B63] mt-1">
          Immutable, append-only log of every inventory delta across warehouses
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-[#E3E1DA]">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#5E6B63] absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search SKU, item, user, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs bg-[#F8F8F5] border border-[#E3E1DA] rounded-md text-[#202521] outline-none focus:ring-2 focus:ring-[#173D32]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-[#5E6B63] font-semibold uppercase tracking-wider">
            Type:
          </span>
          <select
            aria-label="Filter by movement type"
            value={movementFilter}
            onChange={(e) => setMovementFilter(e.target.value)}
            className="h-9 px-3 text-xs bg-[#F8F8F5] border border-[#E3E1DA] rounded-md text-[#202521] outline-none cursor-pointer"
          >
            <option value="">All Movement Types</option>
            <option value="initial">Initial</option>
            <option value="receive">Receive</option>
            <option value="purchase">Purchase</option>
            <option value="sale">Sale</option>
            <option value="adjustment">Adjustment</option>
            <option value="transfer_in">Transfer In</option>
            <option value="transfer_out">Transfer Out</option>
            <option value="return">Return</option>
          </select>
        </div>
      </div>

      {/* Main Ledger Table */}
      <Card>
        <CardHeader className="py-3 px-5">
          <CardTitle className="text-sm">Ledger Entries</CardTitle>
          <span className="text-xs text-[#5E6B63] tabular-nums font-medium">
            {filtered.length} audited transactions
          </span>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">Loading ledger movements...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">No ledger movements logged.</div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                  <th className="py-3 px-5 font-semibold">Timestamp</th>
                  <th className="py-3 px-5 font-semibold">Warehouse</th>
                  <th className="py-3 px-5 font-semibold">SKU &amp; Product</th>
                  <th className="py-3 px-5 font-semibold">Type</th>
                  <th className="py-3 px-5 font-semibold text-right">Signed Delta</th>
                  <th className="py-3 px-5 font-semibold text-right">Balance After</th>
                  <th className="py-3 px-5 font-semibold">User</th>
                  <th className="py-3 px-5 font-semibold">Reason</th>
                  <th className="py-3 px-5 font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1DA]/60">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F8F8F5]/80 transition-colors">
                    <td className="py-3 px-5 text-[#5E6B63] whitespace-nowrap">
                      {formatDate(m.created_at)}
                    </td>
                    <td className="py-3 px-5 text-[#5E6B63] font-medium">
                      <span className="px-2 py-0.5 rounded bg-[#F1F1EC] text-[#202521] font-semibold text-[11px]">
                        {m.warehouse_code}
                      </span>
                    </td>
                    <td className="py-3 px-5">
                      <div className="font-semibold text-[#202521]">{m.product_name}</div>
                      <div className="text-[11px] text-[#5E6B63] font-mono">{m.product_sku}</div>
                    </td>
                    <td className="py-3 px-5">
                      <Badge variant={getMovementBadgeVariant(m.movement_type)}>
                        {m.movement_type}
                      </Badge>
                    </td>
                    <td className="py-3 px-5 text-right font-bold tabular-nums">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          m.delta > 0 ? 'text-[#2F7D4F]' : 'text-[#C85A32]'
                        }`}
                      >
                        {m.delta > 0 ? (
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        )}
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right font-semibold tabular-nums text-[#202521]">
                      {m.balance_after !== null && m.balance_after !== undefined
                        ? m.balance_after
                        : '—'}
                    </td>
                    <td className="py-3 px-5 font-medium text-[#202521]">@{m.username}</td>
                    <td className="py-3 px-5 text-[#202521] max-w-xs truncate">
                      {m.reason || '—'}
                    </td>
                    <td className="py-3 px-5 text-[#5E6B63] font-mono text-[11px] truncate max-w-xs">
                      {m.reference || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
};
