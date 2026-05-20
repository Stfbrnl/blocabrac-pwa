import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth'; // ✅ Utiliser signInWithEmailAndPassword
import { auth } from '../services/firebaseConfig'; // ✅ Importer auth depuis firebaseConfig
import {
  TextField,
  Button,
  Box,
  Typography,
  Container,
  Alert
} from '@mui/material';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // ✅ Utiliser signInWithEmailAndPassword (Firebase Auth)
      await signInWithEmailAndPassword(auth, email, password);

      // Redirection vers la page d'accueil après connexion réussie
      navigate('/');
    } catch (err: any) {
      let errorMessage = 'Email ou mot de passe incorrect.';

      // ✅ Gestion des erreurs spécifiques Firebase Auth
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'Aucun compte trouvé avec cet email.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Mot de passe incorrect.';
      } else if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Email ou mot de passe incorrect.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
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
        <Typography component="h1" variant="h5">
          Connexion
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
            {error}
          </Alert>
        )}

        <Box
          component="form"
          onSubmit={handleLogin}
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
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            Se connecter
          </Button>
        </Box>
      </Box>
    </Container>
  );
}