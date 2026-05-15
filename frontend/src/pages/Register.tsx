import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { supabase } from '../services/supabaseClient';
import {
  TextField,
  Button,
  Box,
  Typography,
  Container,
  Alert
} from '@mui/material';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      if (!user) {
        throw new Error("La création de l'utilisateur a échoué.");
      }

      const { error: supabaseError } = await supabase
        .from('users')
        .insert([{ email: user.email, role: 'client' }]);

      if (supabaseError) {
        throw supabaseError;
      }

      setSuccess('Compte client créé avec succès ! Vous pouvez maintenant vous connecter.');
      setError(null);
      setTimeout(() => {
        navigate('/login');
      }, 2000);

    } catch (err: any) {
      let errorMessage = 'Une erreur est survenue lors de l\'inscription.';

      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'Cet email est déjà utilisé.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Le mot de passe doit contenir au moins 6 caractères.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'L\'email saisi est invalide.';
      } else if (err.message) {
        errorMessage = err.message;
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
        {/* ✅ Correction : Utilisation de sx pour textAlign */}
        <Typography component="h1" variant="h5" sx={{ textAlign: 'center' }}>
          Inscription Client
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
          onSubmit={handleRegister}
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

          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Mot de passe"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            S'inscrire comme Client
          </Button>

          <Typography sx={{ textAlign: 'center' }}>
            Déjà un compte ?
            <Button
              onClick={() => navigate('/login')}
              sx={{ textTransform: 'none' }}
            >
              Se connecter
            </Button>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
}