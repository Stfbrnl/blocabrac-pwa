import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CalendarToday as CalendarIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

// ✅ Fonction utilitaire pour convertir les dates Firestore
const convertFirestoreDate = (date: any): Date => {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (date?.toDate) return date.toDate();
  if (typeof date === 'string') return new Date(date);
  return new Date();
};

interface Course {
  id: string;
  title: string;
  description: string;
  date: Date;
  time: string;
  level: string;
  groupId: string;
  createdBy: string;
  createdAt: Date;
  isActive: boolean; // ✅ Ajout de isActive
}

const CoursesList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    const q = query(
      collection(db, 'courses'),
      where('createdBy', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const coursesData: Course[] = [];
        querySnapshot.forEach((doc) => {
          coursesData.push({
            id: doc.id,
            ...doc.data(),
            date: convertFirestoreDate(doc.data().date),
            createdAt: convertFirestoreDate(doc.data().createdAt),
            isActive: doc.data().isActive || false, // ✅ Chargement de isActive
          } as Course);
        });
        setCourses(coursesData);
        setIsLoading(false);
      },
      (err) => {
        setError(`Erreur lors de la récupération des séances : ${err.message}`);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (courseId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'courses', courseId));
      setOpenDeleteDialog(false);
      setCourseToDelete(null);
    } catch (error) {
      setError(`Erreur lors de la suppression de la séance : ${error}`);
      setOpenDeleteDialog(false);
    }
  };

  if (loadingAuth || isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CalendarIcon color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h4">Gestion des séances</Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('/moniteur/courses/new')}
            sx={{ height: '48px' }}
          >
            Nouvelle séance
          </Button>
        </Box>

        {error && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'error.main', color: 'white', borderRadius: 1 }}>
            {error}
          </Box>
        )}

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Titre</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Heure</TableCell>
                <TableCell>Niveau</TableCell>
                <TableCell>Statut</TableCell> {/* ✅ Remplacement de Participants par Statut */}
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {courses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Aucune séance trouvée. Créez-en une !
                  </TableCell>
                </TableRow>
              ) : (
                courses.map((course) => (
                  <TableRow key={course.id} hover>
                    <TableCell>{course.title}</TableCell>
                    <TableCell>{course.date.toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>{course.time}</TableCell>
                    <TableCell>{course.level}</TableCell>
                    <TableCell>
                      <Chip
                        label={course.isActive ? "Active" : "Inactive"}
                        color={course.isActive ? "success" : "default"}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Voir les détails">
                        <IconButton
                          color="primary"
                          onClick={() => navigate(`/moniteur/courses/${course.id}`)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Modifier la séance">
                        <IconButton
                          color="primary"
                          onClick={() => navigate(`/moniteur/courses/edit/${course.id}`)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Supprimer la séance">
                        <IconButton
                          color="error"
                          onClick={() => {
                            setCourseToDelete(course.id);
                            setOpenDeleteDialog(true);
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog
          open={openDeleteDialog}
          onClose={() => setOpenDeleteDialog(false)}
        >
          <DialogTitle>Supprimer la séance</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer cette séance ?
            <br />
            <strong>Cette action est irréversible.</strong>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button
              onClick={() => courseToDelete && handleDelete(courseToDelete)}
              color="error"
              variant="contained"
              autoFocus
            >
              Supprimer
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
};

export default CoursesList;