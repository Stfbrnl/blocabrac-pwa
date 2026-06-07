import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  CircularProgress,
  FormControl,
  FormLabel,
  MenuItem,
  Snackbar,
  Alert,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';

interface Exercise {
  id?: string;
  name: string;
  description: string;
  difficulty: string;
  category: string;
  equipment?: string;
  block?: string;
  createdBy: string;
  createdAt: Date;
}

const difficulties = ['Facile', 'Moyen', 'Difficile', 'Expert'];
const categories = ['Échauffement', 'Bloc', 'Plyométrie', 'Renforcement musculaire'];

const ExerciseForm: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);

  // ✅ Détection du mode via la présence ou non de exerciseId dans l'URL
  const { exerciseId } = useParams<{ exerciseId?: string }>();
  const isEditMode = !!exerciseId;

  const navigate = useNavigate();

  const [exercise, setExercise] = useState<Exercise>({
    name: '',
    description: '',
    difficulty: 'Facile',
    category: 'Échauffement',
    createdBy: user?.uid || '',
    createdAt: new Date(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchExercise = async () => {
      if (!isEditMode || !exerciseId) {
        setIsLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'exercises', exerciseId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setExercise({
            id: docSnap.id,
            ...docSnap.data(),
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
          } as Exercise);
        }
      } catch (err) {
        setError(`Erreur lors du chargement de l'exercice : ${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchExercise();
  }, [user, isEditMode, exerciseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!exercise.name.trim()) {
      setError('Veuillez renseigner le nom de l\'exercice.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const exerciseData = {
        name: exercise.name.trim(),
        description: exercise.description,
        difficulty: exercise.difficulty,
        category: exercise.category,
        equipment: exercise.equipment || '',
        block: exercise.block || '',
        createdBy: user.uid,
        createdAt: isEditMode ? exercise.createdAt : new Date(),
      };

      if (isEditMode && exerciseId) {
        await updateDoc(doc(db, 'exercises', exerciseId), exerciseData);
        setSuccess('Exercice mis à jour avec succès !');
      } else {
        await addDoc(collection(db, 'exercises'), exerciseData);
        setSuccess('Exercice créé avec succès !');
      }

      setTimeout(() => navigate('/moniteur/exercises'), 1500);
    } catch (err) {
      setError(`Erreur lors de l'enregistrement : ${err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSnackbar = () => {
    setError(null);
    setSuccess(null);
  };

  if (loadingAuth || isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          {isEditMode ? "Modifier l'exercice" : 'Nouvel exercice'}
        </Typography>

        {/* ✅ noValidate désactive la validation HTML native */}
        <Box component="form" onSubmit={handleSubmit} noValidate>

          <FormControl fullWidth margin="normal">
            <FormLabel>Nom *</FormLabel>
            <TextField
              name="name"
              value={exercise.name}
              onChange={(e) => setExercise({ ...exercise, name: e.target.value })}
              variant="outlined"
              placeholder="Ex: Traction à une main"
              error={!exercise.name.trim() && isSubmitting}
              helperText={!exercise.name.trim() && isSubmitting ? 'Ce champ est obligatoire' : ''}
            />
          </FormControl>

          <FormControl fullWidth margin="normal">
            <FormLabel>Description</FormLabel>
            <TextField
              name="description"
              value={exercise.description}
              onChange={(e) => setExercise({ ...exercise, description: e.target.value })}
              variant="outlined"
              multiline
              rows={4}
              placeholder="Description détaillée de l'exercice..."
            />
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth margin="normal">
              <FormLabel>Difficulté *</FormLabel>
              <TextField
                select
                value={exercise.difficulty}
                onChange={(e) => setExercise({ ...exercise, difficulty: e.target.value })}
                variant="outlined"
              >
                {difficulties.map((d) => (
                  <MenuItem key={d} value={d}>{d}</MenuItem>
                ))}
              </TextField>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <FormLabel>Catégorie *</FormLabel>
              <TextField
                select
                value={exercise.category}
                onChange={(e) => setExercise({ ...exercise, category: e.target.value })}
                variant="outlined"
              >
                {categories.map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </TextField>
            </FormControl>
          </Box>

          {/* Champ conditionnel selon la catégorie */}
          {(exercise.category === 'Renforcement musculaire' || exercise.category === 'Plyométrie') && (
            <FormControl fullWidth margin="normal">
              <FormLabel>Équipement</FormLabel>
              <TextField
                value={exercise.equipment || ''}
                onChange={(e) => setExercise({ ...exercise, equipment: e.target.value })}
                variant="outlined"
                placeholder="Ex: Haltères, Élastiques, etc."
              />
            </FormControl>
          )}

          {exercise.category === 'Bloc' && (
            <FormControl fullWidth margin="normal">
              <FormLabel>Description du bloc</FormLabel>
              <TextField
                value={exercise.block || ''}
                onChange={(e) => setExercise({ ...exercise, block: e.target.value })}
                variant="outlined"
                multiline
                rows={3}
                placeholder="Description spécifique pour les blocs..."
              />
            </FormControl>
          )}

          <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
            <Button
              type="button"
              variant="outlined"
              onClick={() => navigate('/moniteur/exercises')}
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
              {isSubmitting
                ? <CircularProgress size={24} />
                : isEditMode ? 'Mettre à jour' : 'Créer'}
            </Button>
          </Box>
        </Box>
      </Paper>

      <Snackbar
        open={!!error || !!success}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={error ? 'error' : 'success'} sx={{ width: '100%' }}>
          {error || success}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ExerciseForm;
