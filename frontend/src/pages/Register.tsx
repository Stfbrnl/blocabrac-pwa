import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import {
  TextField,
  Button,
  Box,
  Typography,
  Container,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';

// ✅ Tableau de correspondance code-couleur/cotations internationales
const levelOptions = [
  { value: 'jaune', label: 'Jaune (3A-3C) - Débutant' },
  { value: 'vert', label: 'Vert (4A-4B+) - Débutant' },
  { value: 'bleu', label: 'Bleu (4C-5A+) - En formation de grimpeur' },
  { value: 'violet', label: 'Violet (5B-5C+) - En formation de grimpeur' },
  { value: 'rouge', label: 'Rouge (6A-6B) - Grimpeur confirmé' },
  { value: 'noir', label: 'Noire (6B+-6C+) - Grimpeur confirmé' },
  { value: 'blanc', label: 'Blanc (7A-7B) - Grimpeur expert' },
  { value: 'rose', label: 'Rose (7B+-8A) - Grimpeur mutant' }
];

export default function Register() {
  // États pour tous les champs obligatoires
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Validation de tous les champs obligatoires
    if (!firstName || !lastName || !email || !password || !age || !gender || !level) {
      setError('Tous les champs sont obligatoires, y compris le niveau en salle.');
      return;
    }

    try {
      // 1. Créer le compte Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      if (!user) {
        throw new Error("La création de l'utilisateur a échoué.");
      }

      // 2. Créer le document dans Firestore avec TOUS les champs + les nouveaux
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        first_name: firstName,
        last_name: lastName,
        age: age,
        gender: gender,
        level: level,
        // ✅ "roles" est le seul format écrit désormais (comme AdminUsers.tsx) :
        // écrire aussi "role" ici était justement à l'origine de la double
        // convention role/roles qui a causé plusieurs bugs de droits dans l'app.
        roles: ['client'],
        inscritAuxCours: false, // ✅ NOUVEAU CHAMP : Créé automatiquement à false
        inscritAuxCompetitions: false, // ✅ NOUVEAU CHAMP : Créé automatiquement à false
        createdAt: new Date().toISOString()
      });

      setSuccess('Compte créé avec succès ! Vous pouvez maintenant vous connecter.');
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
        <Typography component="h1" variant="h5" sx={{ textAlign: 'center' }}>
          Inscription
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
          {/* Prénom (obligatoire) */}
          <TextField
            margin="normal"
            required
            fullWidth
            id="firstName"
            label="Prénom"
            name="firstName"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoFocus
          />

          {/* Nom (obligatoire) */}
          <TextField
            margin="normal"
            required
            fullWidth
            id="lastName"
            label="Nom"
            name="lastName"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />

          {/* Âge (obligatoire) - ✅ Correction MUI v9 : slotProps au lieu de InputLabelProps */}
          <TextField
            margin="normal"
            required
            fullWidth
            id="age"
            label="Âge"
            name="age"
            type="number"
            slotProps={{ inputLabel: { shrink: true } }}  // ✅ Syntaxe MUI v9
            value={age}
            onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : '')}
          />

          {/* Genre (obligatoire) */}
          <FormControl fullWidth margin="normal" required>
            <InputLabel id="genre-select-label" htmlFor="genre-select">Genre</InputLabel>
            <Select
              labelId="genre-select-label" id="genre-select"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              label="Genre"
            >
              <MenuItem value="Homme">Homme</MenuItem>
              <MenuItem value="Femme">Femme</MenuItem>
              <MenuItem value="Autre">Autre</MenuItem>
            </Select>
          </FormControl>

          {/* Niveau en salle (obligatoire) */}
          <FormControl fullWidth margin="normal" required>
            <InputLabel id="niveau-en-salle-select-label" htmlFor="niveau-en-salle-select">Niveau en salle</InputLabel>
            <Select
              labelId="niveau-en-salle-select-label" id="niveau-en-salle-select"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              label="Niveau en salle"
            >
              {levelOptions.map(option => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Email (obligatoire) */}
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
          />

          {/* Mot de passe (obligatoire) */}
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
            S'inscrire
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