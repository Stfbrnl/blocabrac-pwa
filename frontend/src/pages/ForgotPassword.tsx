import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import {
  TextField,
  Button,
  Box,
  Typography,
  Container,
  Alert
} from '@mui/material';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Veuillez saisir votre adresse email.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('Un email de réinitialisation a été envoyé. Vérifiez votre boîte mail (y compris les spams).');
      setError(null);
      setTimeout(() => {
        navigate('/login');
      }, 5000);
    } catch (err: any) {
      let errorMessage = 'Une erreur est survenue.';
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'Aucun compte trouvé avec cet email.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'L\'email saisi est invalide.';
      }
      setError(errorMessage);
      setSuccess(null);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{
        mt: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <Typography component="h1" variant="h5" sx={{ textAlign: 'center' }}>
          Réinitialiser le mot de passe
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, textAlign: 'center', color: 'text.secondary' }}>
          Saisissez votre adresse email pour recevoir un lien de réinitialisation.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mt: 2, width: '100%' }}>
            {success}
          </Alert>
        )}

        <Box
          component="form"
          onSubmit={handleForgotPassword}
          sx={{ mt: 1, width: '100%' }}
        >
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Adresse Email"
            name="email"
            autoComplete="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            Envoyer le lien de réinitialisation
          </Button>

          <Button
            onClick={() => navigate('/login')}
            sx={{ textTransform: 'none' }}
          >
            Retour à la connexion
          </Button>
        </Box>
      </Box>
    </Container>
  );
}