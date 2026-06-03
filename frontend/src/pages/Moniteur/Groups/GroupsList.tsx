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
  getDocs,
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
  Group as GroupIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface Group {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: Date;
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
      collection(db, 'groups'),
      where('moniteurId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const groupsData: Group[] = [];
        querySnapshot.forEach((doc) => {
          groupsData.push({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
          } as Group);
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
      const coursesQuery = query(
        collection(db, 'courses'),
        where('groupId', '==', groupId)
      );
      const coursesSnapshot = await getDocs(coursesQuery);

      if (!coursesSnapshot.empty) {
        setError('Impossible de supprimer ce groupe : il contient des séances.');
        setOpenDeleteDialog(false);
        return;
      }

      await deleteDoc(doc(db, 'groups', groupId));
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
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <GroupIcon color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h4">Gestion des groupes</Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('/moniteur/groups/new')}
            sx={{ height: '48px' }}
          >
            Nouveau groupe
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
                <TableCell>Nom</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Élèves</TableCell>
                <TableCell>Créé le</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    Aucun groupe trouvé. Créez-en un !
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => (
                  <TableRow key={group.id} hover>
                    <TableCell>{group.name}</TableCell>
                    <TableCell>{group.description || 'Aucune description'}</TableCell>
                    <TableCell>
                      {group.students?.length || 0}
                      {group.students?.length > 0 && (
                        <Tooltip title={group.students?.join(', ') || ''}>
                          <Chip
                            label="Voir"
                            size="small"
                            sx={{ ml: 1, cursor: 'pointer' }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      {group.createdAt.toLocaleDateString('fr-FR')}
                    </TableCell>
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
        >
          <DialogTitle>Supprimer le groupe</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer ce groupe ?
            <br />
            <strong>Cette action est irréversible.</strong>
            {groupToDelete && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Groupe : {groups.find(g => g.id === groupToDelete)?.name}
                </Typography>
              </Box>
            )}
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