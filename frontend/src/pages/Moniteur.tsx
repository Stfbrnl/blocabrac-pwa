import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  Typography,
  Container,
  Box,
  Card,
  CardContent,
  CardHeader,
  TextField,
  Button,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  SelectChangeEvent
} from '@mui/material';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { collection, addDoc, getDocs, DocumentData } from 'firebase/firestore';

// Interface pour un cours
interface Course {
  id?: string;
  title: string;
  description: string;
  level: string;
  maxParticipants: number;
  date: string;
  time: string;
  createdBy?: string;
  createdAt?: string;
  participants?: string[];
}

// Type unifié pour les événements de formulaire
type FormEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>;

export default function Moniteur() {
  const [user, loading] = useAuthState(auth);
  const [courses, setCourses] = useState<Course[]>([]);
  const [newCourse, setNewCourse] = useState<Course>({
    title: '',
    description: '',
    level: 'débutant',
    maxParticipants: 10,
    date: '',
    time: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

  const levels = ['débutant', 'intermédiaire', 'avancé', 'expert'];

  useEffect(() => {
    if (!loading && user) {
      fetchCourses();
    }
  }, [user, loading]);

  const fetchCourses = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'courses'));
      const coursesData = querySnapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          title: data.title || '',
          description: data.description || '',
          level: data.level || 'débutant',
          maxParticipants: data.maxParticipants || 10,
          date: data.date || '',
          time: data.time || '',
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          participants: data.participants || []
        } as Course;
      });
      setCourses(coursesData);
    } catch (err: any) {
      setError(`Erreur lors du chargement des cours : ${err.message}`);
      console.error(err);
    }
  };

  const handleInputChange = (e: FormEvent) => {
    const { name, value } = e.target;
    setNewCourse(prev => ({
      ...prev,
      [name]: name === 'maxParticipants' ? Number(value) : value
    }));
  };

  const handleAddCourse = async () => {
    if (!newCourse.title || !newCourse.date || !newCourse.time) {
      setError('Veuillez remplir tous les champs obligatoires (titre, date, heure).');
      return;
    }

    try {
      await addDoc(collection(db, 'courses'), {
        ...newCourse,
        createdBy: user?.uid,
        createdAt: new Date().toISOString(),
        participants: []
      });
      setSuccess('Cours ajouté avec succès !');
      setOpenDialog(false);
      setNewCourse({
        title: '',
        description: '',
        level: 'débutant',
        maxParticipants: 10,
        date: '',
        time: ''
      });
      fetchCourses();
    } catch (err: any) {
      setError(`Erreur lors de l'ajout du cours : ${err.message}`);
      console.error(err);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Typography sx={{ mt: 4, textAlign: 'center' }}>Chargement...</Typography>
      </Container>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ mt: 4 }}>
          Espace Moniteur - BLOCABRAC
        </Typography>
        <Button
          variant="contained"
          onClick={() => setOpenDialog(true)}
          sx={{ mt: 4 }}
        >
          Ajouter un Cours
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Typography variant="h6" sx={{ mb: 2 }}>
        Liste des cours
      </Typography>

      {courses.length === 0 ? (
        <Typography sx={{ textAlign: 'center', mt: 4 }}>
          Aucun cours disponible. Ajoutez-en un !
        </Typography>
      ) : (
        <Box sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          justifyContent: 'center'
        }}>
          {courses.map((course) => (
            <Box key={course.id} sx={{ width: { xs: '100%', sm: '45%', md: '30%' } }}>
              <Card>
                <CardHeader
                  title={course.title}
                  subheader={`${course.date} à ${course.time}`}
                />
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Niveau: {course.level}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Participants max: {course.maxParticipants}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {course.description || 'Aucune description'}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                    Participants inscrits: {course.participants?.length || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      )}

      {/* Dialog pour ajouter un cours */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>Ajouter un nouveau cours</DialogTitle>
        <DialogContent>
          <TextField
            label="Titre du cours"
            name="title"
            value={newCourse.title}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            required
          />

          <TextField
            label="Description"
            name="description"
            value={newCourse.description}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            multiline
            rows={2}
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Niveau</InputLabel>
            <Select
              name="level"
              value={newCourse.level}
              onChange={handleInputChange}
              label="Niveau"
            >
              {levels.map((level) => (
                <MenuItem key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Nombre maximum de participants"
            name="maxParticipants"
            type="number"
            value={newCourse.maxParticipants}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
          />

          {/* ✅ Correction définitive pour les champs date/time : utilisation de slotProps */}
          <TextField
            label="Date"
            name="date"
            type="date"
            value={newCourse.date}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            required
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label="Heure"
            name="time"
            type="time"
            value={newCourse.time}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            required
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Annuler</Button>
          <Button onClick={handleAddCourse} variant="contained" color="primary">
            Ajouter
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}