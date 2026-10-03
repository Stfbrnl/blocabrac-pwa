import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import AccessDenied from './AccessDenied';

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
          // ✅ Fusionne les deux formats possibles plutôt qu'un simple "||" :
          // un "roles" vide ([]), bien que présent, ne doit pas masquer un "role"
          // hérité encore valide sur le même document.
          const rolesArray: string[] = Array.isArray(userData.roles) ? userData.roles : [];
          const legacyRole: string[] = userData.role ? [userData.role] : [];
          setUserRoles(Array.from(new Set([...rolesArray, ...legacyRole])));
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
      // ⚠️ NE JAMAIS remettre `<Navigate to="/" replace />` ici : `/` est `Home`, qui
      // pousse vers `/client/screen`, lui-même protégé par `role="client"` — donc un compte
      // sans ce rôle repartait en boucle de redirection infinie, application inutilisable.
      // Un écran TERMINAL supprime la classe entière, pour toute combinaison de rôles
      // présente ou future. Voir le commentaire de tête d'AccessDenied.tsx.
      return <AccessDenied requiredRoles={requiredRoles} />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;