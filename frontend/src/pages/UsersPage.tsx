import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { User, Warehouse, PaginatedResponse } from '../types';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { UserPlus, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';

export const UsersPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const [form, setForm] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    role_name: 'Staff',
    warehouse_id: '',
    password: '',
  });

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => apiRequest<PaginatedResponse<User>>('users/'),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiRequest<PaginatedResponse<Warehouse>>('warehouses/'),
    enabled: user?.role === 'Admin',
  });

  const usersList = usersData?.results || [];
  const warehouses = warehousesData?.results || [];

  const createUserMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest('users/', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          warehouse_id: data.warehouse_id ? Number(data.warehouse_id) : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      toast.success('User account created successfully');
      setIsOpen(false);
      setForm({
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        phone: '',
        role_name: 'Staff',
        warehouse_id: '',
        password: '',
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create user';
      toast.error(msg);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: number) =>
      apiRequest(`users/${userId}/`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      toast.success('User deactivated');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Cannot deactivate user';
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202521] flex items-center gap-2">
            <UsersIcon className="w-6 h-6 text-[#173D32]" /> Users &amp; Staff Directory
          </h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            {user?.role === 'Admin'
              ? 'Manage accounts and warehouse roles across all locations'
              : 'Manage counter staff accounts for your warehouse'}
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="w-4 h-4" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Team Member</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createUserMutation.mutate(form);
              }}
              className="space-y-3 mt-2"
            >
              <Input
                label="Username"
                required
                placeholder="e.g. rohit.staff"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="First Name"
                  placeholder="First name"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
                <Input
                  label="Last Name"
                  placeholder="Last name"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </div>
              <Input
                label="Email"
                type="email"
                placeholder="rohit@invlab.local"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                label="Phone"
                placeholder="+91 98..."
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />

              {user?.role === 'Admin' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                      Role
                    </label>
                    <select
                      value={form.role_name}
                      onChange={(e) => setForm({ ...form, role_name: e.target.value })}
                      className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                    >
                      <option value="Staff">Staff</option>
                      <option value="Warehouse Manager">Warehouse Manager</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>

                  {form.role_name !== 'Admin' && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                        Assigned Warehouse
                      </label>
                      <select
                        required
                        value={form.warehouse_id}
                        onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                        className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                      >
                        <option value="">-- Choose Warehouse --</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name} ({wh.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <Input
                label="Temporary Password"
                type="password"
                placeholder="Leave blank for InvLab@123"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                helperText="Users will be prompted to change their password at first login."
              />

              <Button type="submit" className="w-full mt-4" isLoading={createUserMutation.isPending}>
                Create User
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="py-3 px-5">
          <CardTitle className="text-sm">Team Members</CardTitle>
          <span className="text-xs text-[#5E6B63] font-medium">{usersList.length} accounts</span>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">Loading users...</div>
          ) : usersList.length === 0 ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">No team accounts found.</div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F1F1EC] text-[#5E6B63] border-b border-[#E3E1DA]">
                  <th className="py-3 px-5 font-semibold">User</th>
                  <th className="py-3 px-5 font-semibold">Role</th>
                  <th className="py-3 px-5 font-semibold">Assigned Warehouse</th>
                  <th className="py-3 px-5 font-semibold">Contact</th>
                  <th className="py-3 px-5 font-semibold">Status</th>
                  <th className="py-3 px-5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1DA]/60">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-[#F8F8F5]/80 transition-colors">
                    <td className="py-3 px-5">
                      <div className="font-semibold text-[#202521]">
                        {u.first_name ? `${u.first_name} ${u.last_name}` : u.username}
                      </div>
                      <div className="text-[11px] text-[#5E6B63] font-mono">@{u.username}</div>
                    </td>
                    <td className="py-3 px-5 font-semibold text-[#173D32]">
                      <Badge variant="neutral">{u.role}</Badge>
                    </td>
                    <td className="py-3 px-5 text-[#202521] font-medium">
                      {u.profile?.warehouse ? (
                        <span>
                          {u.profile.warehouse.name} ({u.profile.warehouse.code})
                        </span>
                      ) : (
                        <span className="text-[#5E6B63]">All Warehouses</span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-[#5E6B63]">
                      <div>{u.email || '—'}</div>
                      <div className="text-[11px]">{u.profile?.phone || '—'}</div>
                    </td>
                    <td className="py-3 px-5">
                      <Badge variant={u.is_active ? 'success' : 'error'}>
                        {u.is_active ? 'Active' : 'Deactivated'}
                      </Badge>
                    </td>
                    <td className="py-3 px-5 text-right">
                      {u.id !== user?.id && u.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Deactivate ${u.username}?`)) {
                              deactivateMutation.mutate(u.id);
                            }
                          }}
                          className="text-[#B3261E] hover:bg-[#FBE9E7] text-xs h-7 px-2"
                        >
                          Deactivate
                        </Button>
                      )}
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
