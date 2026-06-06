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
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';

interface Course {
  id?: string;
  title: string;
  description: string;
  date: Date;
  time: string;
  level: string;
  MaxParticipants: number;
  groupId: string;
  createdBy: string;
  createdAt: Date;
}

const levels = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];

const CourseForm: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { mode, courseId } = useParams<{ mode: string; courseId?: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course>({
    title: '',
    description: '',
    date: new Date(),
    time: '18:00',
    level: 'Débutant',
    MaxParticipants: 10,
    groupId: '',
    createdBy: user?.uid || '',
    createdAt: new Date(),
  });
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchGroups = async () => {
      try {
        const q = query(
          collection(db, 'Groups'), // ✅ Collection "Groups" avec majuscule
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
        if (groupsData.length > 0 && !course.groupId && mode !== 'edit') {
          setCourse({ ...course, groupId: groupsData[0].id });
        }
        setIsLoading(false);
      } catch (err) {
        setError(`Erreur lors du chargement des groupes : ${err}`);
        setIsLoading(false);
      }
    };

    const fetchCourse = async () => {
      if (mode !== 'edit' || !courseId) return;
      try {
        const docRef = doc(db, 'courses', courseId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setCourse({
            id: docSnap.id,
            ...docSnap.data(),
            date: docSnap.data().date?.toDate() || new Date(),
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
          } as Course);
        }
      } catch (err) {
        setError(`Erreur lors du chargement de la séance : ${err}`);
      }
    };

    fetchGroups();
    fetchCourse();
  }, [user, mode, courseId, course.groupId]);

  const handleMaxParticipantsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(1, Number(e.target.value));
    setCourse({ ...course, MaxParticipants: value });
  };

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
      const courseData = {
        title: course.title,
        description: course.description,
        date: course.date,
        time: course.time,
        level: course.level,
        MaxParticipants: course.MaxParticipants,
        groupId: course.groupId,
        createdBy: user.uid,
        createdAt: course.createdAt || new Date(),
        Participants: [],
      };

      if (mode === 'edit' && courseId) {
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

  if (loadingAuth) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, alignItems: 'center' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Chargement des groupes...</Typography>
      </Box>
    );
  }

  if (groups.length === 0) {
    return (
      <Container maxWidth="md">
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" color="error" align="center" gutterBottom>
            Aucun groupe disponible. Veuillez d'abord créer un groupe dans l'onglet "Groupes".
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
          {mode === 'edit' ? 'Modifier la séance' : 'Nouvelle séance'}
        </Typography>

        <form onSubmit={handleSubmit}>
          <FormControl fullWidth margin="normal">
            <FormLabel>Titre *</FormLabel>
            <TextField
              name="title"
              value={course.title}
              onChange={(e) => setCourse({ ...course, title: e.target.value })}
              required
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
                value={course.date.toISOString().split('T')[0]}
                onChange={(e) => setCourse({ ...course, date: new Date(e.target.value) })}
                required
                variant="outlined"
                sx={{ pt: 1 }}
              />
            </FormControl>
            <FormControl fullWidth margin="normal">
              <FormLabel>Heure *</FormLabel>
              <TextField
                type="time"
                value={course.time}
                onChange={(e) => setCourse({ ...course, time: e.target.value })}
                required
                variant="outlined"
                sx={{ pt: 1 }}
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
                required
                variant="outlined"
              >
                {levels.map((level) => (
                  <MenuItem key={level} value={level}>
                    {level}
                  </MenuItem>
                ))}
              </TextField>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <FormLabel>Participants max *</FormLabel>
              <TextField
                type="number"
                value={course.MaxParticipants}
                onChange={handleMaxParticipantsChange}
                required
                variant="outlined"
              />
            </FormControl>
          </Box>

          <FormControl fullWidth margin="normal">
            <FormLabel>Groupe *</FormLabel>
            <TextField
              select
              value={course.groupId}
              onChange={(e) => setCourse({ ...course, groupId: e.target.value })}
              required
              variant="outlined"
              error={!course.groupId}
              helperText={!course.groupId ? 'Veuillez sélectionner un groupe' : ''}
            >
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>
                  {group.name}
                </MenuItem>
              ))}
            </TextField>
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
              disabled={isSubmitting || !course.title || !course.groupId}
            >
              {isSubmitting ? <CircularProgress size={24} /> : mode === 'edit' ? 'Mettre à jour' : 'Créer'}
            </Button>
          </Box>
        </form>
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