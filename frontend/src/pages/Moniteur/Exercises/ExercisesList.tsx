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
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FitnessCenter as FitnessCenterIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface Exercise {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  category: string;
  createdBy: string;
  createdAt: Date;
}

const difficulties = ['Facile', 'Moyen', 'Difficile', 'Expert'];
const categories = ['Échauffement', 'Bloc', 'Plyométrie', 'Renforcement', 'Équipement'];

const ExercisesList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    const q = query(
      collection(db, 'exercises'),
      where('createdBy', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const exercisesData: Exercise[] = [];
        querySnapshot.forEach((doc) => {
          exercisesData.push({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
          } as Exercise);
        });
        setExercises(exercisesData);
        setIsLoading(false);
      },
      (err) => {
        setError(`Erreur lors de la récupération des exercices : ${err.message}`);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (exerciseId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'exercises', exerciseId));
      setOpenDeleteDialog(false);
      setExerciseToDelete(null);
    } catch (error) {
      setError(`Erreur lors de la suppression de l'exercice : ${error}`);
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
            <FitnessCenterIcon color="primary" sx={{ fontSize: { xs: 32, sm: 40 } }} />
            <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
              Gestion des exercices
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('/moniteur/exercises/new')}
            sx={{ height: '48px', width: { xs: '100%', sm: 'auto' } }}
          >
            Nouvel exercice
          </Button>
        </Box>

        {error && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'error.main', color: 'white', borderRadius: 1 }}>
            {error}
          </Box>
        )}

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 600 }}>
            <TableHead>
              <TableRow>
                <TableCell>Nom</TableCell>
                <TableCell>Catégorie</TableCell>
                <TableCell>Difficulté</TableCell>
                <TableCell>Créé le</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {exercises.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    Aucun exercice trouvé. Créez-en un !
                  </TableCell>
                </TableRow>
              ) : (
                exercises.map((exercise) => (
                  <TableRow key={exercise.id} hover>
                    <TableCell>{exercise.name}</TableCell>
                    <TableCell>
                      {exercise.category}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={exercise.difficulty}
                        color={
                          exercise.difficulty === 'Facile' ? 'success' :
                          exercise.difficulty === 'Moyen' ? 'primary' :
                          exercise.difficulty === 'Difficile' ? 'warning' : 'error'
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {exercise.createdAt.toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Modifier l'exercice">
                        <IconButton
                          color="primary"
                          onClick={() => navigate(`/moniteur/exercises/edit/${exercise.id}`)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Supprimer l'exercice">
                        <IconButton
                          color="error"
                          onClick={() => {
                            setExerciseToDelete(exercise.id);
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
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Supprimer l'exercice</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer cet exercice ?
            <br />
            <strong>Cette action est irréversible.</strong>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button
              onClick={() => exerciseToDelete && handleDelete(exerciseToDelete)}
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

export default ExercisesList;