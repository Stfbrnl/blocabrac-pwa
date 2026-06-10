import React, { useState, useEffect } from 'react';
import { Typography, Container, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../services/firebaseConfig';

// @ts-ignore (pour éviter les erreurs TypeScript sur l'import d'images)
import logo from '../assets/logo-blocabrac.png';

const Home = () => {
  const [user, loading] = useAuthState(auth);
  const navigate = useNavigate();

  // Rediriger vers l'espace correspondant si connecté
  useEffect(() => {
    if (!loading && user) {
      navigate('/client/screen');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <Typography>Chargement...</Typography>;
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{
        mt: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
      }}>
        <img
          src={logo}
          alt="Logo BLOCABRAC"
          style={{
            height: '100px',
            marginBottom: '20px',
            filter: 'drop-shadow(2px 2px 4px rgba(0, 0, 0, 0.5))'
          }}
        />

        <Typography variant="h4" sx={{ mt: 2 }}>
          Bienvenue sur BLOCABRAC
        </Typography>

        <Typography sx={{ mt: 2, maxWidth: '600px' }}>
          Connectez-vous pour accéder à votre espace personnel.
        </Typography>

        <Typography sx={{ mt: 2, maxWidth: '600px' }}>
          Notre salle d'escalade est ouverte tous les jours de la semaine de 12h à 22h et le week-end de 10h à 20h.
          Coordonnées : 43 rue Saint-Just, 42000 Saint-Étienne. Tél : 04 77 21 55 03
        </Typography>
      </Box>
    </Container>
  );
};

export default Home;