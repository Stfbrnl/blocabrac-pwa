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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  EmojiEvents as EmojiEventsIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface MiniCompetition {
  id: string;
  name: string;
  boulderIds: string[];
  createdBy: string;
  createdAt: Date;
}

const MiniCompetitionsList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [miniCompetitions, setMiniCompetitions] = useState<MiniCompetition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [miniCompetitionToDelete, setMiniCompetitionToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const subscribe = () => {
      setIsLoading(true);
      setError(null);

      const q = query(
        collection(db, 'mini_competitions'),
        where('createdBy', '==', user.uid)
      );

      return onSnapshot(
        q,
        (querySnapshot) => {
          const data: MiniCompetition[] = [];
          querySnapshot.forEach((d) => {
            data.push({
              id: d.id,
              name: d.data().name || '',
              boulderIds: d.data().boulderIds || [],
              createdBy: d.data().createdBy || '',
              createdAt: d.data().createdAt?.toDate() || new Date(),
            });
          });
          setMiniCompetitions(data);
          setIsLoading(false);
        },
        (err) => {
          setError(`Erreur lors de la récupération des mini-compétitions : ${err.message}`);
          setIsLoading(false);
        }
      );
    };

    const unsubscribe = subscribe();
    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'mini_competitions', id));
      setOpenDeleteDialog(false);
      setMiniCompetitionToDelete(null);
    } catch (err) {
      setError(`Erreur lors de la suppression : ${err}`);
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
            <EmojiEventsIcon color="primary" sx={{ fontSize: { xs: 32, sm: 40 } }} />
            <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
              Mini-compétitions
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('/moniteur/mini-competitions/new')}
            sx={{ height: '48px', width: { xs: '100%', sm: 'auto' } }}
          >
            Nouvelle mini-compétition
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Un petit défi noté (blocs quotidiens existants, notés comme au quotidien) à inclure dans une séance — distinct des compétitions officielles de la salle.
        </Typography>

        {error && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'error.main', color: 'white', borderRadius: 1 }}>
            {error}
          </Box>
        )}

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 500 }}>
            <TableHead>
              <TableRow>
                <TableCell>Nom</TableCell>
                <TableCell>Blocs</TableCell>
                <TableCell>Créée le</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {miniCompetitions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    Aucune mini-compétition. Créez-en une !
                  </TableCell>
                </TableRow>
              ) : (
                miniCompetitions.map((mc) => (
                  <TableRow key={mc.id} hover>
                    <TableCell>{mc.name}</TableCell>
                    <TableCell>{mc.boulderIds.length}</TableCell>
                    <TableCell>{mc.createdAt.toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>
                      <Tooltip title="Modifier">
                        <IconButton
                          color="primary"
                          onClick={() => navigate(`/moniteur/mini-competitions/edit/${mc.id}`)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Supprimer">
                        <IconButton
                          color="error"
                          onClick={() => {
                            setMiniCompetitionToDelete(mc.id);
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
          <DialogTitle>Supprimer la mini-compétition</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer cette mini-compétition ?
            <br />
            <strong>Si une séance la référence encore, elle n'y apparaîtra plus (le classement déjà enregistré, lui, reste consultable dans les stats).</strong>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button
              onClick={() => miniCompetitionToDelete && handleDelete(miniCompetitionToDelete)}
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

export default MiniCompetitionsList;
