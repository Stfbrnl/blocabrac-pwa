import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  query,
  where,
  getDocs,
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
  Autocomplete,
  Chip,
  Checkbox,
  ListItemText,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';

interface Course {
  id?: string;
  title: string;
  description: string;
  date: Date;
  time: string;
  level: string;
  groupId: string;
  exercises?: string[];
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
}

const levels = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];

const CourseForm: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { courseId } = useParams<{ courseId?: string }>();
  const isEditMode = !!courseId;
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course>({
    title: '',
    description: '',
    date: new Date(),
    time: '18:00',
    level: 'Débutant',
    groupId: '',
    isActive: false,
    createdBy: user?.uid || '',
    createdAt: new Date(),
  });
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [exercises, setExercises] = useState<{ id: string; name: string; type: 'validation' | 'data' }[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<{ id: string; name: string; type: 'validation' | 'data' }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchGroups = async () => {
      try {
        const q = query(
          collection(db, 'Groups'),
          where('moniteurId', '==', user.uid)
        );
        const querySnapshot = await getDocs(q);
        const groupsData: { id: string; name: string }[] = [];
        querySnapshot.forEach((doc) => {
          groupsData.push({
            id: doc.id,
            name: doc.data().name,
          });
        });
        setGroups(groupsData);
        if (groupsData.length > 0 && !course.groupId && !isEditMode) {
          setCourse({ ...course, groupId: groupsData[0].id });
        }
      } catch (err) {
        setError(`Erreur lors du chargement des groupes : ${err}`);
      }
    };

    const fetchExercises = async () => {
      try {
        const q = query(collection(db, 'exercises'));
        const querySnapshot = await getDocs(q);
        const exercisesData: { id: string; name: string; type: 'validation' | 'data' }[] = [];
        querySnapshot.forEach((doc) => {
          exercisesData.push({
            id: doc.id,
            name: doc.data().name,
            type: doc.data().type || 'data',
          });
        });
        setExercises(exercisesData);
      } catch (err) {
        setError(`Erreur lors du chargement des exercices : ${err}`);
      }
    };

    const fetchCourse = async () => {
      if (!isEditMode || !courseId) {
        setIsLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'courses', courseId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCourse({
            id: docSnap.id,
            ...data,
            date: data.date?.toDate() || new Date(),
            createdAt: data.createdAt?.toDate() || new Date(),
            isActive: data.isActive || false,
          } as Course);
          if (data.exercises && data.exercises.length > 0) {
            const selectedExercisesData = exercises.filter(ex => data.exercises.includes(ex.id));
            setSelectedExercises(selectedExercisesData);
          }
        }
      } catch (err) {
        setError(`Erreur lors du chargement de la séance : ${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    Promise.all([fetchGroups(), fetchExercises()]).then(() => {
      fetchCourse();
    });
  }, [user, isEditMode, courseId, course.groupId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!course.groupId) {
      setError('Veuillez sélectionner un groupe.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Calcul automatique de isActive en fonction de la date/heure
      const courseDateTime = new Date(course.date);
      const [hours, minutes] = course.time.split(':').map(Number);
      courseDateTime.setHours(hours, minutes, 0, 0);
      const now = new Date();
      const shouldBeActive = courseDateTime <= now;

      const courseData = {
        title: course.title,
        description: course.description,
        date: course.date,
        time: course.time,
        level: course.level,
        groupId: course.groupId,
        exercises: selectedExercises.map(ex => ex.id),
        createdBy: user.uid,
        createdAt: isEditMode ? course.createdAt : new Date(),
        isActive: shouldBeActive,
        Participants: [],
      };

      if (isEditMode && courseId) {
        await updateDoc(doc(db, 'courses', courseId), courseData);
        setSuccess('Séance mise à jour avec succès !');
      } else {
        await addDoc(collection(db, 'courses'), courseData);
        setSuccess('Séance créée avec succès !');
      }

      setTimeout(() => navigate('/moniteur/courses'), 1500);
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

  if (groups.length === 0) {
    return (
      <Container maxWidth="md">
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" color="error" align="center" gutterBottom>
            Aucun groupe disponible. Veuillez d'abord créer un groupe.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/moniteur/groups')}
            >
              Créer un groupe
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          {isEditMode ? 'Modifier la séance' : 'Nouvelle séance'}
        </Typography>

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <FormControl fullWidth margin="normal">
            <FormLabel>Titre *</FormLabel>
            <TextField
              name="title"
              value={course.title}
              onChange={(e) => setCourse({ ...course, title: e.target.value })}
              variant="outlined"
              placeholder="Ex: Séance débutants - Lundi"
            />
          </FormControl>

          <FormControl fullWidth margin="normal">
            <FormLabel>Description</FormLabel>
            <TextField
              name="description"
              value={course.description}
              onChange={(e) => setCourse({ ...course, description: e.target.value })}
              variant="outlined"
              multiline
              rows={4}
              placeholder="Description de la séance..."
            />
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth margin="normal">
              <FormLabel>Date *</FormLabel>
              <TextField
                type="date"
                value={course.date instanceof Date ? course.date.toISOString().split('T')[0] : ''}
                onChange={(e) => setCourse({ ...course, date: new Date(e.target.value) })}
                variant="outlined"
              />
            </FormControl>
            <FormControl fullWidth margin="normal">
              <FormLabel>Heure *</FormLabel>
              <TextField
                type="time"
                value={course.time}
                onChange={(e) => setCourse({ ...course, time: e.target.value })}
                variant="outlined"
              />
            </FormControl>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth margin="normal">
              <FormLabel>Niveau *</FormLabel>
              <TextField
                select
                value={course.level}
                onChange={(e) => setCourse({ ...course, level: e.target.value })}
                variant="outlined"
              >
                {levels.map((level) => (
                  <MenuItem key={level} value={level}>{level}</MenuItem>
                ))}
              </TextField>
            </FormControl>
          </Box>

          <FormControl fullWidth margin="normal">
            <FormLabel>Groupe *</FormLabel>
            <TextField
              select
              value={course.groupId}
              onChange={(e) => setCourse({ ...course, groupId: e.target.value })}
              variant="outlined"
              error={!course.groupId}
              helperText={!course.groupId ? 'Veuillez sélectionner un groupe' : ''}
            >
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>
              ))}
            </TextField>
          </FormControl>

          <FormControl fullWidth margin="normal">
            <FormLabel>Exercices</FormLabel>
            {exercises.length === 0 ? (
              <Typography color="error" sx={{ mt: 1 }}>
                Aucun exercice disponible. Veuillez d'abord créer des exercices.
              </Typography>
            ) : (
              <Autocomplete
                multiple
                options={exercises}
                getOptionLabel={(option) => `${option.name} (${option.type === 'data' ? 'Données' : 'Validation'})`}
                value={selectedExercises}
                onChange={(_event, newValue) => {
                  setSelectedExercises(newValue);
                }}
                renderOption={(props, option) => (
                  <li {...props}>
                    <Checkbox checked={selectedExercises.some(ex => ex.id === option.id)} />
                    <ListItemText
                      primary={option.name}
                      secondary={`Type: ${option.type === 'data' ? 'Données personnalisées' : 'Validation (réussi/échoué)'}`}
                    />
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="outlined"
                    placeholder="Sélectionnez les exercices pour cette séance"
                  />
                )}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                filterSelectedOptions
                sx={{ width: '100%' }}
              />
            )}
          </FormControl>

          <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
            <Button
              type="button"
              variant="outlined"
              onClick={() => navigate('/moniteur/courses')}
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
              {isSubmitting ? <CircularProgress size={24} /> : isEditMode ? 'Mettre à jour' : 'Créer'}
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

export default CourseForm;