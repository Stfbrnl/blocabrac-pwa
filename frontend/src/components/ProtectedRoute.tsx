import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  role: string;
}

export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const [user, loadingAuth] = useAuthState(auth);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState<boolean>(true); // ✅ Ajout d'un état de chargement pour le rôle
  const location = useLocation();

  useEffect(() => {
    const fetchUserRole = async () => {
      setLoadingRole(true); // ✅ Début du chargement
      if (!user) {
        setUserRole(null);
        setLoadingRole(false); // ✅ Fin du chargement
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const roleFromFirestore = userDocSnap.data().role;
          console.log('Rôle récupéré dans ProtectedRoute:', roleFromFirestore);
          setUserRole(roleFromFirestore || null);
        } else {
          console.error('Aucun document utilisateur trouvé pour l\'UID:', user.uid);
          setUserRole(null);
        }
      } catch (err: any) {
        console.error('Erreur Firestore dans ProtectedRoute:', err);
        setUserRole(null);
      } finally {
        setLoadingRole(false); // ✅ Fin du chargement (dans tous les cas)
      }
    };

    fetchUserRole();
  }, [user]);

  // ✅ Attendre que le rôle soit chargé avant de vérifier
  if (loadingAuth || loadingRole) {
    return <div>Chargement...</div>;
  }

  if (!user || userRole !== role) {
    console.log('Accès refusé. Rôle attendu:', role, 'Rôle actuel:', userRole);
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}