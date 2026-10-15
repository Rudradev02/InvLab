import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { User, Warehouse, PaginatedResponse, Role } from '../types';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  UserPlus,
  Users as UsersIcon,
  Search,
  KeyRound,
  Edit,
  RotateCcw,
  Power,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

export const UsersPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'Admin';

  const [isOpen, setIsOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('InvLab@123');

  // Search & Filter
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

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

  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role_name: 'Staff',
    warehouse_id: '',
    is_active: true,
  });

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => apiRequest<PaginatedResponse<User>>('users/'),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiRequest<PaginatedResponse<Warehouse>>('warehouses/'),
    enabled: isAdmin,
  });

  const usersList = useMemo(() => usersData?.results || [], [usersData]);
  const warehouses = useMemo(() => warehousesData?.results || [], [warehousesData]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const matchesSearch =
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        (u.first_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.last_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.profile?.phone || '').includes(search);

      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? u.is_active
          : !u.is_active;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [usersList, search, roleFilter, statusFilter]);

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
      toast.error(err instanceof Error ? err.message : 'Failed to create user');
    },
  });

  const editUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof editForm }) =>
      apiRequest(`users/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...data,
          warehouse_id: data.warehouse_id ? Number(data.warehouse_id) : null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      toast.success('User updated successfully');
      setEditingUser(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
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
      toast.error(err instanceof Error ? err.message : 'Cannot deactivate user');
    },
  });

  const activateMutation = useMutation({
    mutationFn: (userId: number) =>
      apiRequest<{ message: string; is_active: boolean }>(`users/${userId}/activate/`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      toast.success(data.message || 'User activated');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Cannot activate user');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: number; password?: string }) =>
      apiRequest<{ message: string }>(`users/${userId}/reset-password/`, {
        method: 'POST',
        body: JSON.stringify({ new_password: password || 'InvLab@123' }),
      }),
    onSuccess: (data) => {
      toast.success(data.message || 'Password reset successfully');
      setResettingUser(null);
      setNewPassword('InvLab@123');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password');
    },
  });

  const openEdit = (u: User) => {
    setEditingUser(u);
    setEditForm({
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      email: u.email || '',
      phone: u.profile?.phone || '',
      role_name: u.role || 'Staff',
      warehouse_id: u.profile?.warehouse ? String(u.profile.warehouse.id) : '',
      is_active: u.is_active,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#202521] flex items-center gap-2">
            <UsersIcon className="w-6 h-6 text-[#173D32]" /> Users &amp; Staff Directory
          </h1>
          <p className="text-sm text-[#5E6B63] mt-1">
            {isAdmin
              ? 'Manage user accounts, assign facilities, assign roles, reset credentials, and audit security'
              : 'Manage counter staff accounts for your warehouse'}
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-[#173D32] hover:bg-[#123027] text-white">
              <UserPlus className="w-4 h-4" /> Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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

              {isAdmin && (
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

              <Button
                type="submit"
                className="w-full mt-4 bg-[#173D32] text-white"
                isLoading={createUserMutation.isPending}
              >
                Create Team Account
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-lg border border-[#E3E1DA]">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5E6B63]" />
          <input
            type="text"
            placeholder="Search username, name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8F8F5] border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {/* Role Filter */}
          <div className="flex items-center gap-1.5 text-xs text-[#5E6B63]">
            <span>Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'all' | Role)}
              className="h-8 px-2 py-1 bg-[#F8F8F5] border border-[#E3E1DA] rounded-md text-xs text-[#202521] outline-none"
            >
              <option value="all">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Warehouse Manager">Warehouse Manager</option>
              <option value="Staff">Staff</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs text-[#5E6B63]">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="h-8 px-2 py-1 bg-[#F8F8F5] border border-[#E3E1DA] rounded-md text-xs text-[#202521] outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Deactivated Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="py-3 px-5 flex flex-row items-center justify-between border-b border-[#E3E1DA]">
          <CardTitle className="text-sm">Team Members</CardTitle>
          <span className="text-xs text-[#5E6B63] font-medium">{filteredUsers.length} accounts</span>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-sm text-[#5E6B63]">No team accounts found matching criteria.</div>
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
                {filteredUsers.map((u) => (
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
                        <span className="text-[#5E6B63]">All Warehouses / Central</span>
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
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit Button */}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(u)}
                            className="h-7 w-7 p-0 text-[#5E6B63] hover:text-[#173D32]"
                            title="Edit user"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {/* Reset Password Button */}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setResettingUser(u);
                              setNewPassword('InvLab@123');
                            }}
                            className="h-7 w-7 p-0 text-[#5E6B63] hover:text-[#173D32]"
                            title="Reset password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {/* Deactivate / Reactivate */}
                        {u.id !== user?.id && (
                          <>
                            {u.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (window.confirm(`Deactivate user @${u.username}?`)) {
                                    deactivateMutation.mutate(u.id);
                                  }
                                }}
                                className="h-7 w-7 p-0 text-[#B3261E] hover:bg-[#FBE9E7]"
                                title="Deactivate user"
                              >
                                <Power className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => activateMutation.mutate(u.id)}
                                className="h-7 w-7 p-0 text-[#2F7D4F] hover:bg-[#E6F2EA]"
                                title="Reactivate user"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User: @{editingUser?.username}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingUser) {
                editUserMutation.mutate({ id: editingUser.id, data: editForm });
              }
            }}
            className="space-y-3 mt-2"
          >
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="First Name"
                value={editForm.first_name}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
              />
              <Input
                label="Last Name"
                value={editForm.last_name}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            <Input
              label="Phone"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />

            {isAdmin && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                    Role
                  </label>
                  <select
                    value={editForm.role_name}
                    disabled={editingUser?.id === user?.id}
                    onChange={(e) => setEditForm({ ...editForm, role_name: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none disabled:bg-[#F1F1EC] disabled:text-[#5E6B63]"
                  >
                    <option value="Staff">Staff</option>
                    <option value="Warehouse Manager">Warehouse Manager</option>
                    <option value="Admin">Admin</option>
                  </select>
                  {editingUser?.id === user?.id && (
                    <span className="text-[11px] text-[#5E6B63] mt-1 block">
                      You cannot change your own role.
                    </span>
                  )}
                </div>

                {editForm.role_name !== 'Admin' && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
                      Assigned Warehouse
                    </label>
                    <select
                      value={editForm.warehouse_id}
                      onChange={(e) => setEditForm({ ...editForm, warehouse_id: e.target.value })}
                      className="w-full h-10 px-3 py-2 text-sm bg-white border border-[#E3E1DA] rounded-md text-[#202521] focus:ring-2 focus:ring-[#173D32] outline-none"
                    >
                      <option value="">-- No Assigned Warehouse --</option>
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

            <Button
              type="submit"
              className="w-full mt-4 bg-[#173D32] text-white"
              isLoading={editUserMutation.isPending}
            >
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resettingUser} onOpenChange={(open) => !open && setResettingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#173D32]">
              <KeyRound className="w-5 h-5" /> Reset Password: @{resettingUser?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs text-[#5E6B63] mt-2">
            <p>
              Set a temporary password for <strong className="text-[#202521]">@{resettingUser?.username}</strong>.
              The user will be required to choose a new password upon their next login.
            </p>
            <Input
              label="Temporary Password"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="e.g. InvLab@123"
            />
            <div className="flex items-start gap-2 bg-[#F8F8F5] p-2.5 rounded border border-[#E3E1DA] text-[11px]">
              <ShieldAlert className="w-4 h-4 text-[#173D32] shrink-0 mt-0.5" />
              <span>
                Default temporary password is <strong className="font-mono">InvLab@123</strong>. An audit log
                entry will record this administrative reset.
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setResettingUser(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              isLoading={resetPasswordMutation.isPending}
              onClick={() =>
                resettingUser &&
                resetPasswordMutation.mutate({ userId: resettingUser.id, password: newPassword })
              }
              className="bg-[#173D32] hover:bg-[#123027] text-white border-transparent"
            >
              Reset &amp; Require Change
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
