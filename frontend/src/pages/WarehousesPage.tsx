import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { Warehouse, PaginatedResponse, User } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Building2, User as UserIcon, Phone, MapPin, Plus, CheckCircle, Mail } from 'lucide-react';
import { toast } from 'sonner';

export const WarehousesPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state for creating warehouse
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address_line1: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    manager_id: '',
  });

  // Query warehouses
  const { data: whData, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiRequest<PaginatedResponse<Warehouse>>('warehouses/'),
  });

  // Query eligible users for manager selection (Admin only)
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest<PaginatedResponse<User>>('users/'),
    enabled: user?.role === 'Admin',
  });

  const warehouses = whData?.results || [];
  const users = usersData?.results || [];

  const createWarehouseMutation = useMutation({
    mutationFn: (newWh: typeof formData) =>
      apiRequest<Warehouse>('warehouses/', {
        method: 'POST',
        body: JSON.stringify({
          ...newWh,
          manager_id: newWh.manager_id ? Number(newWh.manager_id) : null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Warehouse created successfully');
      setIsDialogOpen(false);
      setFormData({
        name: '',
        code: '',
        address_line1: '',
        city: '',
        state: '',
        pincode: '',
        phone: '',
        email: '',
        manager_id: '',
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create warehouse';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createWarehouseMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202521]">Warehouses</h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            Manage distribution facilities, assigned managers, and staff
          </p>
        </div>

        {user?.role === 'Admin' && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" /> Add Warehouse
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Warehouse</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3 mt-2">
                <Input
                  label="Warehouse Name"
                  required
                  placeholder="e.g. Hyderabad Logistics Hub"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <Input
                  label="Unique Code (uppercase)"
                  required
                  placeholder="e.g. HYD"
                  maxLength={10}
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                />
                <Input
                  label="Address Line 1"
                  required
                  placeholder="Street / Industrial Zone"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="City"
                    required
                    placeholder="City"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                  <Input
                    label="State"
                    required
                    placeholder="State"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Pincode (6 digits)"
                    required
                    maxLength={6}
                    placeholder="411057"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  />
                  <Input
                    label="Phone"
                    required
                    placeholder="+91 98..."
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <Input
                  label="Email"
                  type="email"
                  placeholder="warehouse@invlab.local"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                    Assign Manager
                  </label>
                  <select
                    value={formData.manager_id}
                    onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                  >
                    <option value="">No Manager Assigned</option>
                    {users
                      .filter((u) => u.role === 'Warehouse Manager' || u.role === 'Admin')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.first_name} {u.last_name})
                        </option>
                      ))}
                  </select>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-4"
                  isLoading={createWarehouseMutation.isPending}
                >
                  Create Warehouse
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-sm text-[#5E6B63]">Loading warehouses...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {warehouses.map((wh) => (
            <Card key={wh.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="bg-[#F8F8F5]/60 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#173D32]" />
                    <CardTitle className="text-base">{wh.name}</CardTitle>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#173D32] mt-0.5 inline-block">
                    {wh.code}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2F7D4F] bg-[#E6F2EA] px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-3 h-3" /> Active
                </span>
              </CardHeader>
              <CardContent className="space-y-4 pt-4 text-xs text-[#5E6B63]">
                {/* Location */}
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#5E6B63] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[#202521] font-medium">{wh.address_line1}</div>
                    <div>
                      {wh.city}, {wh.state} — {wh.pincode}
                    </div>
                  </div>
                </div>

                {/* Manager */}
                <div className="flex items-center gap-2 pt-2 border-t border-[#E3E1DA]/60">
                  <UserIcon className="w-4 h-4 text-[#173D32] shrink-0" />
                  <div>
                    <span className="font-semibold text-[#202521]">
                      {wh.manager
                        ? `${wh.manager.first_name} ${wh.manager.last_name} (@${wh.manager.username})`
                        : 'Unassigned Manager'}
                    </span>
                    <div className="text-[11px]">{wh.manager?.email || 'No manager email'}</div>
                  </div>
                </div>

                {/* Contacts & Staff */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E3E1DA]/60 text-[11px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="w-3.5 h-3.5 text-[#5E6B63]" />
                    <span>{wh.phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-[#5E6B63]" />
                    <span>{wh.email || '—'}</span>
                  </div>
                </div>

                <div className="pt-2 text-[11px] flex justify-between items-center text-[#202521] font-medium bg-[#F1F1EC]/60 p-2 rounded">
                  <span>Active staff employed:</span>
                  <span className="font-bold tabular-nums text-[#173D32]">{wh.staff_count} members</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
