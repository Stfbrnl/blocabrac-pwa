import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../../services/firebaseConfig';
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Switch,
  FormControlLabel
} from '@mui/material';
import { doc, getDoc, writeBatch } from 'firebase/firestore';

// Tableau de correspondance code-couleur/cotations internationales
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

const ClientProfile: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [userData, setUserData] = useState<{
    first_name: string;
    last_name: string;
    email: string;
    age?: number;
    dateOfBirth?: string;
    gender?: string;
    level?: string;
    classementOptIn?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  // Charger les données utilisateur
  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchUserData = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data() as {
            first_name: string;
            last_name: string;
            email: string;
            age?: number;
            dateOfBirth?: string;
            gender?: string;
            level?: string;
            classementOptIn?: boolean;
          });
        }
      } catch (err) {
        setError(`Erreur lors du chargement de vos informations : ${err}`);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user, loadingAuth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const updates = {
        first_name: userData.first_name,
        last_name: userData.last_name,
        email: userData.email,
        dateOfBirth: userData.dateOfBirth,
        gender: userData.gender,
        level: userData.level,
        classementOptIn: userData.classementOptIn ?? false,
      };

      // ✅ Garde "classement_profiles" (fiche publique lue par ClientClassement.tsx)
      // synchronisée en même temps que "users", sans étape de saisie en plus pour le
      // client — un client ne peut pas lire toute la collection "users" (règles
      // Firestore), d'où cette fiche allégée séparée.
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), updates);
      batch.set(doc(db, 'classement_profiles', user.uid), {
        first_name: userData.first_name,
        last_name: userData.last_name,
        gender: userData.gender,
        dateOfBirth: userData.dateOfBirth,
        classementOptIn: userData.classementOptIn ?? false,
      }, { merge: true });
      await batch.commit();
      setSuccess('Vos informations ont été mises à jour avec succès !');
      setTimeout(() => {
        navigate('/client/screen');
      }, 2000);
    } catch (err) {
      setError(`Erreur lors de la mise à jour : ${err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingAuth || loading || !userData) {
    return (
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Modifier mes informations
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            margin="normal"
            fullWidth
            label="Prénom"
            value={userData.first_name || ''}
            onChange={(e) => setUserData({ ...userData, first_name: e.target.value })}
          />

          <TextField
            margin="normal"
            fullWidth
            label="Nom"
            value={userData.last_name || ''}
            onChange={(e) => setUserData({ ...userData, last_name: e.target.value })}
          />

          <TextField
            margin="normal"
            fullWidth
            label="Email"
            type="email"
            value={userData.email || ''}
            onChange={(e) => setUserData({ ...userData, email: e.target.value })}
          />

          <TextField
            margin="normal"
            fullWidth
            label="Date de naissance"
            type="date"
            value={userData.dateOfBirth || ''}
            onChange={(e) => setUserData({
              ...userData,
              dateOfBirth: e.target.value || undefined
            })}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Genre</InputLabel>
            <Select
              value={userData.gender || ''}
              onChange={(e) => setUserData({ ...userData, gender: e.target.value })}
              label="Genre"
            >
              <MenuItem value="Homme">Homme</MenuItem>
              <MenuItem value="Femme">Femme</MenuItem>
              <MenuItem value="Autre">Autre</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth margin="normal">
            <InputLabel>Niveau en salle</InputLabel>
            <Select
              value={userData.level || ''}
              onChange={(e) => setUserData({ ...userData, level: e.target.value })}
              label="Niveau en salle"
            >
              {levelOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Switch
                checked={userData.classementOptIn ?? false}
                onChange={(e) => setUserData({ ...userData, classementOptIn: e.target.checked })}
              />
            }
            label="Apparaître dans le classement des grimpeurs"
          />

          <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
            <Button
              type="button"
              variant="outlined"
              onClick={() => navigate('/client/screen')}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? <CircularProgress size={24} /> : 'Enregistrer'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default ClientProfile;