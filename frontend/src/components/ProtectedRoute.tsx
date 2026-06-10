import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  role?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, role }) => {
  const [user, loading, error] = useAuthState(auth);
  const location = useLocation();
  const [userRoles, setUserRoles] = React.useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    const fetchUserRoles = async () => {
      if (!user) {
        setRolesLoading(false);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRoles(userData.roles || [userData.role].filter(Boolean));
        }
      } catch (err) {
        console.error('Erreur lors de la récupération des rôles :', err);
      } finally {
        setRolesLoading(false);
      }
    };
    fetchUserRoles();
  }, [user]);

  if (loading || rolesLoading) {
    return <div>Chargement...</div>;
  }

  if (error) {
    console.error('Erreur d\'authentification :', error);
    return <div>Erreur d'authentification</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const requiredRoles = role ? [role] : allowedRoles;
  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.some(r => userRoles.includes(r));
    if (!hasRequiredRole) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;