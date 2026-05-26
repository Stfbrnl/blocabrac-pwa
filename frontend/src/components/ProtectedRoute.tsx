import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { User } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';

// ✅ Type étendu pour inclure le rôle
interface AppUser extends User {
  role?: string;
}

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles = [] }: ProtectedRouteProps): JSX.Element {
  const { currentUser } = useAuth() as { currentUser: AppUser | null };
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // ✅ Vérification du rôle (avec fallback si undefined)
  const userRole = currentUser.role || 'client';
  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}