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
  Group as GroupIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface Group {
  id: string;
  name: string;
  description: string;
  students: string[];
  moniteurId: string;
}

const GroupsList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    const q = query(
      collection(db, 'Groups'),
      where('moniteurId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const groupsData: Group[] = [];
        querySnapshot.forEach((doc) => {
          groupsData.push({
            id: doc.id,
            name: doc.data().name,
            description: doc.data().description || '',
            students: doc.data().students || [],
            moniteurId: doc.data().moniteurId,
          });
        });
        setGroups(groupsData);
        setIsLoading(false);
      },
      (err) => {
        setError(`Erreur lors de la récupération des groupes : ${err.message}`);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (groupId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'Groups', groupId));
      setOpenDeleteDialog(false);
      setGroupToDelete(null);
    } catch (error) {
      setError(`Erreur lors de la suppression du groupe : ${error}`);
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
            <GroupIcon color="primary" sx={{ fontSize: { xs: 32, sm: 40 } }} />
            <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
              Gestion des groupes
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('/moniteur/groups/new')}
            sx={{ height: '48px', width: { xs: '100%', sm: 'auto' } }}
          >
            Nouveau groupe
          </Button>
        </Box>

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
                <TableCell>Description</TableCell>
                <TableCell>Nombre de clients</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    Aucun groupe trouvé. Créez-en un !
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => (
                  <TableRow key={group.id} hover>
                    <TableCell>{group.name}</TableCell>
                    <TableCell>
                      {group.description}
                    </TableCell>
                    <TableCell>{group.students.length}</TableCell>
                    <TableCell>
                      <Tooltip title="Modifier le groupe">
                        <IconButton
                          color="primary"
                          onClick={() => navigate(`/moniteur/groups/edit/${group.id}`)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Supprimer le groupe">
                        <IconButton
                          color="error"
                          onClick={() => {
                            setGroupToDelete(group.id);
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
          <DialogTitle>Supprimer le groupe</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer ce groupe ?
            <br />
            <strong>Cette action est irréversible.</strong>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button
              onClick={() => groupToDelete && handleDelete(groupToDelete)}
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

export default GroupsList;