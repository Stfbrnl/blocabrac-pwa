import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

type UserRole = 'admin' | 'ouvreur' | 'moniteur' | 'client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  role?: UserRole;
}

const ProtectedRoute = ({ children, role }: ProtectedRouteProps) => {
  const [user, loadingAuth] = useAuthState(auth);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (user) {
      const fetchUserRole = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserRole(userDoc.data().role);
          }
        } catch (error) {
          console.error("Erreur :", error);
        } finally {
          setLoadingRole(false);
        }
      };
      fetchUserRole();
    } else {
      setLoadingRole(false);
    }
  }, [user]);

  if (loadingAuth || loadingRole) {
    return <div>Chargement...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role && userRole !== role) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;