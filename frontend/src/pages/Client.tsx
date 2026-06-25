import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../services/firebaseConfig';
import { Typography, Container } from '@mui/material';

export default function Client() {
  const [user, loading] = useAuthState(auth);
  const navigate = useNavigate();

  // ✅ Hook appelé systématiquement, avant tout retour conditionnel
  useEffect(() => {
    if (!loading && user) {
      navigate('/client/screen');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Typography sx={{ mt: 4, textAlign: 'center' }}>Chargement...</Typography>
      </Container>
    );
  }

  return null;
}