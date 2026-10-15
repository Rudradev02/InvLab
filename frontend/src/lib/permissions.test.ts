import { describe, it, expect } from 'vitest';
import { hasPermission } from './permissions';
import { User } from '../types';

describe('hasPermission utility', () => {
  const adminUser: User = {
    id: 1,
    username: 'admin',
    email: 'admin@invlab.com',
    first_name: 'Admin',
    last_name: 'User',
    is_active: true,
    must_change_password: false,
    role: 'Admin',
    warehouse: null,
    profile: null,
    permissions: ['all'],
  };

  const managerUser: User = {
    id: 2,
    username: 'manager',
    email: 'mgr@invlab.com',
    first_name: 'Manager',
    last_name: 'User',
    is_active: true,
    must_change_password: false,
    role: 'Warehouse Manager',
    warehouse: { id: 1, name: 'Main', code: 'MAIN', city: 'Pune', state: 'MH', is_active: true },
    profile: null,
    permissions: ['inventory.view', 'inventory.adjust', 'reports.view'],
  };

  const staffUser: User = {
    id: 3,
    username: 'staff',
    email: 'staff@invlab.com',
    first_name: 'Staff',
    last_name: 'User',
    is_active: true,
    must_change_password: false,
    role: 'Staff',
    warehouse: { id: 1, name: 'Main', code: 'MAIN', city: 'Pune', state: 'MH', is_active: true },
    profile: null,
    permissions: ['inventory.view', 'sales.create'],
  };

  it('returns false if user is null', () => {
    expect(hasPermission(null, 'Staff')).toBe(false);
  });

  it('allows Admin universal access regardless of required role or permission', () => {
    expect(hasPermission(adminUser, 'Staff')).toBe(true);
    expect(hasPermission(adminUser, 'Warehouse Manager')).toBe(true);
    expect(hasPermission(adminUser, undefined, 'system.special_op')).toBe(true);
  });

  it('checks role matching correctly for non-admin users', () => {
    expect(hasPermission(managerUser, 'Warehouse Manager')).toBe(true);
    expect(hasPermission(managerUser, ['Warehouse Manager', 'Admin'])).toBe(true);
    expect(hasPermission(managerUser, 'Staff')).toBe(false);

    expect(hasPermission(staffUser, 'Staff')).toBe(true);
    expect(hasPermission(staffUser, ['Warehouse Manager'])).toBe(false);
  });

  it('checks capability permissions correctly', () => {
    expect(hasPermission(managerUser, undefined, 'inventory.adjust')).toBe(true);
    expect(hasPermission(managerUser, undefined, 'sales.create')).toBe(false);

    expect(hasPermission(staffUser, undefined, 'sales.create')).toBe(true);
    expect(hasPermission(staffUser, undefined, 'reports.view')).toBe(false);
  });
});
