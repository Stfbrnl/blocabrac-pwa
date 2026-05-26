import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Paper, Container, Button, Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton,
  // ✅ Ajout des imports manquants
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../context/AuthContext';

interface MoniteurGroup {
  id: string;
  name: string;
  moniteur_id: string;
  client_ids: string[];
  created_at: string;
}

export default function GroupsList(): JSX.Element {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState<MoniteurGroup[]>([]);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const fetchGroups = async (): Promise<void> => {
      try {
        const q = query(
          collection(db, 'moniteur_groups'),
          where('moniteur_id', '==', currentUser.uid)
        );
        const snapshot = await getDocs(q);
        setGroups(snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as MoniteurGroup[]);
      } catch (error: unknown) {
        console.error('Erreur lors du chargement des groupes :', error);
        alert('Une erreur est survenue.');
      }
    };
    fetchGroups();
  }, [currentUser?.uid]);

  const handleDelete = async (groupId: string): Promise<void> => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce groupe ?')) return;
    try {
      await deleteDoc(doc(db, 'moniteur_groups', groupId));
      setGroups(groups.filter(g => g.id !== groupId));
      setOpenDeleteDialog(false);
    } catch (error: unknown) {
      console.error('Erreur lors de la suppression :', error);
      alert('Une erreur est survenue.');
    }
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h5">Mes Groupes de Clients</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/moniteur/groups/add')}
          >
            Ajouter un groupe
          </Button>
        </Box>

        {groups.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nom du groupe</TableCell>
                  <TableCell>Nombre de membres</TableCell>
                  <TableCell>Date de création</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((group: MoniteurGroup) => (
                  <TableRow key={group.id}>
                    <TableCell>{group.name}</TableCell>
                    <TableCell>{group.client_ids.length}</TableCell>
                    <TableCell>{new Date(group.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <IconButton
                        color="primary"
                        onClick={() => navigate(`/moniteur/groups/edit/${group.id}`)}
                        title="Modifier"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        color="error"
                        onClick={() => {
                          setGroupToDelete(group.id);
                          setOpenDeleteDialog(true);
                        }}
                        title="Supprimer"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography>Vous n'avez encore créé aucun groupe.</Typography>
        )}

        {/* ✅ Dialog corrigé avec les imports */}
        <Dialog
          open={openDeleteDialog}
          onClose={() => setOpenDeleteDialog(false)}
        >
          <DialogTitle>Supprimer le groupe</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer ce groupe ? Cette action est irréversible.
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button onClick={() => handleDelete(groupToDelete!)} color="error">
              Supprimer
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
}