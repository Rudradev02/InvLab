import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';
import { hasPermission } from '../../lib/permissions';

interface CanProps {
  role?: Role | Role[];
  perform?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const Can: React.FC<CanProps> = ({ role, perform, children, fallback = null }) => {
  const { user } = useAuth();

  if (!hasPermission(user, role, perform)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

