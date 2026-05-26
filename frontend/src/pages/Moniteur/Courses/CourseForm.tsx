import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Paper, Container, Button, Box,
  TextField, FormControl, InputLabel, Select, MenuItem,
  Checkbox, ListItemText, OutlinedInput, Chip
} from '@mui/material';
import { collection, query, where, getDocs, doc, addDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../context/AuthContext';

interface Exercise {
  id: string;
  name: string;
  description?: string;
}

interface Course {
  id: string;
  name: string;
  moniteur_id: string;
  date: string;
  description?: string;
  group_id?: string;
  exercise_ids?: string[];
  max_participants?: number;
  difficulty?: string;
  is_active: boolean;
}

interface MoniteurGroup {
  id: string;
  name: string;
}

export default function CourseForm(): JSX.Element {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId?: string }>();
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState<MoniteurGroup[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [formData, setFormData] = useState<{
    name: string;
    date: string;
    description: string;
    group_id: string;
    exercise_ids: string[];
    max_participants: number;
    difficulty: string;
  }>({
    name: '',
    date: new Date().toISOString().slice(0, 16),
    description: '',
    group_id: '',
    exercise_ids: [],
    max_participants: 10,
    difficulty: 'Intermédiaire'
  });

  useEffect(() => {
    if (!currentUser?.uid) return;
    const fetchData = async (): Promise<void> => {
      try {
        const groupsQuery = query(
          collection(db, 'moniteur_groups'),
          where('moniteur_id', '==', currentUser.uid)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        setGroups(groupsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as MoniteurGroup[]);

        const exercisesQuery = query(
          collection(db, 'exercises'),
          where('created_by', '==', currentUser.uid)
        );
        const exercisesSnapshot = await getDocs(exercisesQuery);
        setExercises(exercisesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Exercise[]);
      } catch (error: unknown) {
        console.error('Erreur lors du chargement :', error);
      }
    };
    fetchData();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!courseId) return;
    const fetchCourse = async (): Promise<void> => {
      try {
        const docSnap = await getDoc(doc(db, 'courses', courseId));
        if (docSnap.exists()) {
          const data = docSnap.data() as Course;
          setFormData({
            name: data.name,
            date: data.date,
            description: data.description || '',
            group_id: data.group_id || '',
            exercise_ids: data.exercise_ids || [],
            max_participants: data.max_participants || 10,
            difficulty: data.difficulty || 'Intermédiaire'
          });
        }
      } catch (error: unknown) {
        console.error('Erreur lors du chargement du cours :', error);
      }
    };
    fetchCourse();
  }, [courseId]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!formData.name) {
      alert('Veuillez saisir un nom pour le cours.');
      return;
    }
    if (!formData.date) {
      alert('Veuillez sélectionner une date.');
      return;
    }

    try {
      const courseData = {
        name: formData.name,
        moniteur_id: currentUser?.uid,
        date: formData.date,
        description: formData.description,
        group_id: formData.group_id || null,
        exercise_ids: formData.exercise_ids,
        max_participants: formData.max_participants,
        difficulty: formData.difficulty,
        is_active: true,
        created_at: new Date().toISOString()
      };

      if (courseId) {
        await updateDoc(doc(db, 'courses', courseId), courseData);
      } else {
        await addDoc(collection(db, 'courses'), courseData);
      }
      navigate('/moniteur/courses');
    } catch (error: unknown) {
      console.error('Erreur lors de la sauvegarde :', error);
      alert(`Une erreur est survenue : ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          {courseId ? 'Modifier la séance' : 'Créer une nouvelle séance'}
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            label="Nom de la séance"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData({ ...formData, name: e.target.value })}
            fullWidth
            margin="normal"
            required
          />

          {/* ✅ Correction définitive pour MUI 9.0.1 : slotProps pour inputLabel */}
          <TextField
            label="Date et heure"
            type="datetime-local"
            value={formData.date}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData({ ...formData, date: e.target.value })}
            fullWidth
            margin="normal"
            required
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Groupe (optionnel)</InputLabel>
            <Select
              value={formData.group_id}
              onChange={(e) =>
                setFormData({ ...formData, group_id: e.target.value as string })}
              label="Groupe"
            >
              <MenuItem value="">Aucun groupe (séance individuelle)</MenuItem>
              {groups.map((group: MoniteurGroup) => (
                <MenuItem key={group.id} value={group.id}>
                  {group.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth margin="normal">
            <InputLabel>Niveau de difficulté</InputLabel>
            <Select
              value={formData.difficulty}
              onChange={(e) =>
                setFormData({ ...formData, difficulty: e.target.value as string })}
              label="Niveau de difficulté"
            >
              {['Débutant', 'Intermédiaire', 'Avancé', 'Expert'].map((level) => (
                <MenuItem key={level} value={level}>{level}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* ✅ Solution ultime pour MUI 9.0.1 : Utiliser `sx` pour min */}
          <TextField
            label="Nombre maximum de participants"
            type="number"
            value={formData.max_participants}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData({ ...formData, max_participants: parseInt(e.target.value) || 0 })}
            fullWidth
            margin="normal"
            sx={{ '& input[type=number]': { min: 1 } }} // ✅ Solution alternative via CSS
          />

          <TextField
            label="Description"
            multiline
            rows={4}
            value={formData.description}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormData({ ...formData, description: e.target.value })}
            fullWidth
            margin="normal"
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Exercices</InputLabel>
            <Select
              multiple
              value={formData.exercise_ids}
              onChange={(e) =>
                setFormData({ ...formData, exercise_ids: e.target.value as string[] })}
              input={<OutlinedInput label="Exercices" />}
              renderValue={(selected: string[]) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id: string) => {
                    const exercise = exercises.find(e => e.id === id);
                    return exercise ? (
                      <Chip key={id} label={exercise.name} />
                    ) : null;
                  })}
                </Box>
              )}
            >
              {exercises.map((exercise: Exercise) => (
                <MenuItem key={exercise.id} value={exercise.id}>
                  <Checkbox
                    checked={formData.exercise_ids.indexOf(exercise.id) > -1}
                  />
                  <ListItemText primary={exercise.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
            >
              {courseId ? 'Modifier' : 'Créer'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/moniteur/courses')}
            >
              Annuler
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}