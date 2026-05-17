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
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

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
      setUserRole(null);
      setLoadingRole(false);
    }
  }, [user]);

  const renderRoleButtons = () => {
    if (loadingAuth || loadingRole) {
      return null;
    }

    switch (userRole) {
      case 'admin':
        return (
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
              STATISTIQUES DES COMPÉTITIONS
            </Button>
          </>
        );
      case 'ouvreur':
        return (
          <Button color="inherit" component={Link} to="/ouvreur">
            OUVREUR
          </Button>
        );
      case 'moniteur':
        return (
          <Button color="inherit" component={Link} to="/moniteur">
            MONITEUR
          </Button>
        );
      case 'client':
        return (
          <Button color="inherit" component={Link} to="/client">
            MON ESPACE
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          BLOCABRAC
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {!loadingAuth && user && renderRoleButtons()}
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
          {!loadingAuth && user && (
            <Button color="inherit" onClick={() => auth.signOut()}>
              DÉCONNEXION
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;