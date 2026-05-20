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
  const [userRoles, setUserRoles] = useState<UserRole[]>([]); // ✅ Tableau de rôles
  const [loadingRole, setLoadingRole] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (user) {
      const fetchUserRoles = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            // ✅ Récupérer le tableau de rôles (ou convertir l'ancien rôle en tableau)
            const roles = userDoc.data().roles || (userDoc.data().role ? [userDoc.data().role] : []);
            setUserRoles(roles);
          }
        } catch (error) {
          console.error("Erreur :", error);
        } finally {
          setLoadingRole(false);
        }
      };
      fetchUserRoles();
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

  // ✅ Vérifier si le rôle requis est dans le tableau des rôles de l'utilisateur
  if (role && !userRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;