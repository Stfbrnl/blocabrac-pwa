import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import {
  Button,
  AppBar,
  Typography,
  Box,
  Toolbar
} from '@mui/material';
import { Link } from 'react-router-dom';

type UserRole = 'admin' | 'ouvreur' | 'moniteur' | 'client';

const Navbar: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]); // ✅ Tableau de rôles
  const [loadingRole, setLoadingRole] = useState(true);

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
      setUserRoles([]);
      setLoadingRole(false);
    }
  }, [user]);

  if (loadingAuth || loadingRole) {
    return null;
  }

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          BLOCABRAC
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {!loadingAuth && user && (
            <>
              {/* ✅ Boutons pour chaque rôle de l'utilisateur */}
              {userRoles.includes('admin') && (
                <>
                  <Button color="inherit" component={Link} to="/admin">
                    ADMIN
                  </Button>
                  <Button color="inherit" component={Link} to="/admin/users">
                    GÉRER LES UTILISATEURS
                  </Button>
                  <Button color="inherit" component={Link} to="/admin/competitions/create">
                    CRÉER/GÉRER LES COMPÉTITIONS
                  </Button>
                  <Button color="inherit" component={Link} to="/admin/competitions/list">
                    GÉRER LES INSCRIPTIONS
                  </Button>
                  <Button color="inherit" component={Link} to="/admin/competitions/stats">
                    STATISTIQUES
                  </Button>
                </>
              )}
              {userRoles.includes('ouvreur') && (
                <Button color="inherit" component={Link} to="/ouvreur">
                  OUVREUR
                </Button>
              )}
              {userRoles.includes('moniteur') && (
                <Button color="inherit" component={Link} to="/moniteur">
                  MONITEUR
                </Button>
              )}
              {userRoles.includes('client') && (
                <Button color="inherit" component={Link} to="/client">
                  MON ESPACE
                </Button>
              )}
              <Button color="inherit" onClick={() => auth.signOut()}>
                DÉCONNEXION
              </Button>
            </>
          )}
          {!loadingAuth && !user && (
            <>
              <Button color="inherit" component={Link} to="/login">
                CONNEXION
              </Button>
              <Button color="inherit" component={Link} to="/register">
                INSCRIPTION
              </Button>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;