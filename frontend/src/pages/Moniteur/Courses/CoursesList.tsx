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
  updateDoc,
} from 'firebase/firestore';
import { getSessionStatus, canActivate, type SessionStatus } from '../../../utils/courseSessionStatus';
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
  Visibility as VisibilityIcon,
  PlayArrow as PlayArrowIcon,
  Archive as ArchiveIcon,
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
  activatedAt?: string;
  archivedAt?: string;
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
            activatedAt: doc.data().activatedAt,
            archivedAt: doc.data().archivedAt,
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

  const toDateStr = (date: Date): string => date.toISOString().split('T')[0];

  const handleActivate = async (course: Course) => {
    try {
      await updateDoc(doc(db, 'courses', course.id), { activatedAt: new Date().toISOString() });
    } catch (err) {
      setError(`Erreur lors de l'activation de la séance : ${err}`);
    }
  };

  const handleArchive = async (course: Course) => {
    try {
      await updateDoc(doc(db, 'courses', course.id), { archivedAt: new Date().toISOString() });
    } catch (err) {
      setError(`Erreur lors de l'archivage de la séance : ${err}`);
    }
  };

  const statusLabels: Record<SessionStatus, { label: string; color: 'default' | 'success' | 'info' }> = {
    scheduled: { label: 'Programmée', color: 'default' },
    active: { label: 'Active', color: 'success' },
    archived: { label: 'Archivée', color: 'info' },
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
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
            mb: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CalendarIcon color="primary" sx={{ fontSize: { xs: 32, sm: 40 } }} />
            <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
              Gestion des séances
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('/moniteur/courses/new')}
            sx={{ height: '48px', width: { xs: '100%', sm: 'auto' } }}
          >
            Nouvelle séance
          </Button>
        </Box>

        {error && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'error.main', color: 'white', borderRadius: 1 }}>
            {error}
          </Box>
        )}

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 650 }}>
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
                courses.map((course) => {
                  const sessionLike = { date: toDateStr(course.date), activatedAt: course.activatedAt, archivedAt: course.archivedAt };
                  const status = getSessionStatus(sessionLike);
                  return (
                  <TableRow key={course.id} hover>
                    <TableCell>{course.title}</TableCell>
                    <TableCell>{course.date.toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>
                      {course.time}
                    </TableCell>
                    <TableCell>
                      {course.level}
                    </TableCell>
                    <TableCell>
                      <Chip label={statusLabels[status].label} color={statusLabels[status].color} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {canActivate(sessionLike) && (
                        <Tooltip title="Activer (séance du jour)">
                          <IconButton color="success" onClick={() => handleActivate(course)}>
                            <PlayArrowIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {status === 'active' && (
                        <Tooltip title="Archiver maintenant">
                          <IconButton color="info" onClick={() => handleArchive(course)}>
                            <ArchiveIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Voir les détails">
                        <IconButton
                          color="primary"
                          onClick={() => navigate(`/moniteur/courses/${course.id}`)}
                        >
                          <VisibilityIcon />
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
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog
          open={openDeleteDialog}
          onClose={() => setOpenDeleteDialog(false)}
          fullWidth
          maxWidth="xs"
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