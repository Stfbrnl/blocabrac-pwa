import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Button, TextField, Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

type CompetitionStatus = 'à venir' | 'en cours' | 'terminée' | 'annulée';

interface Competition {
  id: string;
  name: string;
  date: string;
  status: CompetitionStatus;
  access_code: string;
  max_participants: number;
  registered_count: number;
}

const AdminCompetitionManagement: React.FC = () => {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [createForm, setCreateForm] = useState<Omit<Competition, 'id' | 'registered_count'>>({
    name: '',
    date: new Date().toISOString().split('T')[0],
    status: 'à venir',
    access_code: '',
    max_participants: 50
  });
  const [editForm, setEditForm] = useState<Omit<Competition, 'id' | 'registered_count'>>({
    name: '',
    date: '',
    status: 'à venir',
    access_code: '',
    max_participants: 50
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const querySnapshot = await getDocs(collection(db, 'competitions'));
        const competitionsData: Competition[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          date: doc.data().date || '',
          status: doc.data().status || 'à venir',
          access_code: doc.data().access_code || '',
          max_participants: doc.data().max_participants || 50,
          registered_count: doc.data().registered_count || 0
        }));
        setCompetitions(competitionsData);
      } catch (error) {
        console.error("Erreur :", error);
        setSnackbarMessage("Erreur lors du chargement des compétitions.");
        setOpenSnackbar(true);
      } finally {
        setLoading(false);
      }
    };
    fetchCompetitions();
  }, []);

  const handleCreateCompetition = async () => {
    if (!createForm.name || !createForm.access_code) {
      setSnackbarMessage("Le nom et le code d'accès sont obligatoires.");
      setOpenSnackbar(true);
      return;
    }

    try {
      await addDoc(collection(db, 'competitions'), {
        name: createForm.name,
        date: createForm.date,
        status: createForm.status,
        access_code: createForm.access_code,
        max_participants: createForm.max_participants,
        registered_count: 0
      });
      const querySnapshot = await getDocs(collection(db, 'competitions'));
      setCompetitions(querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        date: doc.data().date,
        status: doc.data().status,
        access_code: doc.data().access_code,
        max_participants: doc.data().max_participants,
        registered_count: doc.data().registered_count || 0
      })));
      setOpenCreateDialog(false);
      setSnackbarMessage("Compétition créée avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la création de la compétition.");
      setOpenSnackbar(true);
    }
  };

  const handleOpenEditDialog = (competition: Competition) => {
    setSelectedCompetition(competition);
    setEditForm({
      name: competition.name,
      date: competition.date,
      status: competition.status,
      access_code: competition.access_code,
      max_participants: competition.max_participants
    });
    setOpenEditDialog(true);
  };

  const handleUpdateCompetition = async () => {
    if (!selectedCompetition) return;
    try {
      await updateDoc(doc(db, 'competitions', selectedCompetition.id), {
        name: editForm.name,
        date: editForm.date,
        status: editForm.status,
        access_code: editForm.access_code,
        max_participants: editForm.max_participants
      });
      const querySnapshot = await getDocs(collection(db, 'competitions'));
      setCompetitions(querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        date: doc.data().date,
        status: doc.data().status,
        access_code: doc.data().access_code,
        max_participants: doc.data().max_participants,
        registered_count: doc.data().registered_count || 0
      })));
      setOpenEditDialog(false);
      setSnackbarMessage("Compétition mise à jour avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la mise à jour de la compétition.");
      setOpenSnackbar(true);
    }
  };

  const handleDeleteCompetition = async (competitionId: string) => {
    try {
      await deleteDoc(doc(db, 'competitions', competitionId));
      setCompetitions(competitions.filter(comp => comp.id !== competitionId));
      setSnackbarMessage("Compétition supprimée avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la suppression de la compétition.");
      setOpenSnackbar(true);
    }
  };

  if (loading) {
    return <Typography>Chargement des compétitions...</Typography>;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4" gutterBottom>
            Gestion des Compétitions
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenCreateDialog(true)}
          >
            Créer une compétition
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nom</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Code d'accès</TableCell>
                <TableCell>Participants</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {competitions.map(competition => (
                <TableRow key={competition.id}>
                  <TableCell>{competition.name}</TableCell>
                  <TableCell>{new Date(competition.date).toLocaleDateString()}</TableCell>
                  <TableCell>{competition.status}</TableCell>
                  <TableCell>{competition.access_code}</TableCell>
                  <TableCell>{competition.registered_count} / {competition.max_participants}</TableCell>
                  <TableCell>
                    <IconButton
                      color="primary"
                      onClick={() => handleOpenEditDialog(competition)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => handleDeleteCompetition(competition.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => navigate(`/admin/competitions/register?competitionId=${competition.id}`)}
                    >
                      Gérer les inscriptions
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)}>
          <DialogTitle>Créer une compétition</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Nom de la compétition"
                value={createForm.name}
                onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                fullWidth
              />
              <TextField
                label="Date"
                type="date"
                value={createForm.date}
                onChange={(e) => setCreateForm({...createForm, date: e.target.value})}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label="Code d'accès"
                value={createForm.access_code}
                onChange={(e) => setCreateForm({...createForm, access_code: e.target.value})}
                fullWidth
              />
              <TextField
                label="Nombre maximum de participants"
                type="number"
                value={createForm.max_participants}
                onChange={(e) => setCreateForm({...createForm, max_participants: parseInt(e.target.value) || 0})}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>Statut</InputLabel>
                <Select
                  value={createForm.status}
                  onChange={(e) => setCreateForm({...createForm, status: e.target.value as CompetitionStatus})}
                  label="Statut"
                >
                  <MenuItem value="à venir">À venir</MenuItem>
                  <MenuItem value="en cours">En cours</MenuItem>
                  <MenuItem value="terminée">Terminée</MenuItem>
                  <MenuItem value="annulée">Annulée</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreateCompetition} color="primary">
              Créer
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)}>
          <DialogTitle>Modifier la compétition</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Nom de la compétition"
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                fullWidth
              />
              <TextField
                label="Date"
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label="Code d'accès"
                value={editForm.access_code}
                onChange={(e) => setEditForm({...editForm, access_code: e.target.value})}
                fullWidth
              />
              <TextField
                label="Nombre maximum de participants"
                type="number"
                value={editForm.max_participants}
                onChange={(e) => setEditForm({...editForm, max_participants: parseInt(e.target.value) || 0})}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>Statut</InputLabel>
                <Select
                  value={editForm.status}
                  onChange={(e) => setEditForm({...editForm, status: e.target.value as CompetitionStatus})}
                  label="Statut"
                >
                  <MenuItem value="à venir">À venir</MenuItem>
                  <MenuItem value="en cours">En cours</MenuItem>
                  <MenuItem value="terminée">Terminée</MenuItem>
                  <MenuItem value="annulée">Annulée</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenEditDialog(false)}>Annuler</Button>
            <Button onClick={handleUpdateCompetition} color="primary">
              Enregistrer
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={openSnackbar}
          autoHideDuration={6000}
          onClose={() => setOpenSnackbar(false)}
        >
          <Alert
            severity={snackbarMessage.includes("succès") ? "success" : "error"}
            onClose={() => setOpenSnackbar(false)}
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
};

export default AdminCompetitionManagement;