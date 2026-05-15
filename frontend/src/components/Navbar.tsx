import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Button, Box, Alert } from '@mui/material'; // ✅ Correction : Ajout de Alert à l'import
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const logo = '/src/assets/logo-blocabrac.png';

export default function Navbar() {
  const [user, loading] = useAuthState(auth);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
  if (user) {
    console.log("VOTRE UID :", user.uid); // ✅ Affiche votre UID dans la console
  }
}, [user]);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) {
        setUserRole(null);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const role = userDocSnap.data().role;
          console.log('Rôle récupéré :', role);
          setUserRole(role || null);
        } else {
          console.error('Aucun document utilisateur trouvé pour l\'UID:', user.uid);
          setError('Votre compte n\'a pas de rôle défini. Contactez l\'administrateur.');
          setUserRole(null);
        }
      } catch (err: any) {
        console.error('Erreur lors de la récupération du rôle:', err);
        setError(`Erreur: ${err.message}`);
        setUserRole(null);
      }
    };

    fetchUserRole();
  }, [user]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const renderRoleButtons = () => {
    if (!user) return null;

    console.log('Rôle actuel dans renderRoleButtons:', userRole);

    switch (userRole) {
      case 'admin':
        return (
          <>
            <Button color="inherit" onClick={() => navigate('/admin')}>Admin</Button>
            <Button color="inherit" onClick={() => navigate('/admin/users')}>Gérer les Utilisateurs</Button>
            <Button color="inherit" onClick={() => navigate('/admin/home-content')}>Modifier Page Accueil</Button>
          </>
        );
      case 'ouvreur':
        return <Button color="inherit" onClick={() => navigate('/ouvreur')}>Ouvreur</Button>;
      case 'moniteur':
        return <Button color="inherit" onClick={() => navigate('/moniteur')}>Moniteur</Button>;
      case 'client':
        return <Button color="inherit" onClick={() => navigate('/client')}>Client</Button>;
      default:
        console.warn('Rôle non reconnu:', userRole);
        return <Button color="inherit" onClick={() => navigate('/')}>Accueil</Button>;
    }
  };

  if (loading) {
    return <AppBar position="static"><Toolbar>Chargement...</Toolbar></AppBar>;
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
            <img src={logo} alt="Logo BLOCABRAC" style={{ height: '40px' }} />
            <Typography variant="h6" component="div">
              BLOCABRAC
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {renderRoleButtons()}
            {user && (
              <Button color="inherit" onClick={handleLogout}>
                Déconnexion
              </Button>
            )}
            {!user && (
              <>
                <Button color="inherit" onClick={() => navigate('/login')}>Connexion</Button>
                <Button color="inherit" onClick={() => navigate('/register')}>Inscription</Button>
              </>
            )}
          </Box>
        </Toolbar>
      </AppBar>
      {error && (
        <Alert severity="error" sx={{ position: 'fixed', top: 64, width: '100%', zIndex: 1000 }}>
          {error}
        </Alert>
      )}
    </>
  );
}