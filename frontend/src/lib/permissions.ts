import { Role, User } from '../types';

export function hasPermission(
  user: User | null,
  role?: Role | Role[],
  perform?: string
): boolean {
  if (!user) return false;
  if (user.role === 'Admin') return true;

  if (role) {
    const allowedRoles = Array.isArray(role) ? role : [role];
    if (!allowedRoles.includes(user.role)) {
      return false;
    }
  }

  if (perform) {
    const userPermissions = user.permissions || [];
    if (!userPermissions.includes(perform)) {
      return false;
    }
  }

  return true;
}
