import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Button, TextField, Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, FormControl, InputLabel, Select, MenuItem, Chip,
  useTheme, useMediaQuery
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

type CompetitionStatus = 'à venir' | 'en cours' | 'terminée' | 'annulée';
type Level = 'jaune' | 'vert' | 'bleu' | 'violet' | 'rouge' | 'noir' | 'blanc' | 'rose';

// ✅ Liste des niveaux (pour les sélecteurs)
const levelOptions: Level[] = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];

interface Competition {
  id: string;
  name: string;
  date: string;
  status: CompetitionStatus;
  access_code: string;
  max_participants: number;
  registered_count: number;
  minLevel?: Level; // ✅ Nouveau : Niveau minimum
  maxLevel?: Level; // ✅ Nouveau : Niveau maximum
}

const AdminCompetitionManagement: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [competitionToDelete, setCompetitionToDelete] = useState<string | null>(null);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [createForm, setCreateForm] = useState<Omit<Competition, 'id' | 'registered_count'>>({
    name: '',
    date: new Date().toISOString().split('T')[0],
    status: 'à venir',
    access_code: '',
    max_participants: 50,
    minLevel: undefined, // ✅ Nouveau
    maxLevel: undefined  // ✅ Nouveau
  });
  const [editForm, setEditForm] = useState<Omit<Competition, 'id' | 'registered_count'>>({
    name: '',
    date: '',
    status: 'à venir',
    access_code: '',
    max_participants: 50,
    minLevel: undefined, // ✅ Nouveau
    maxLevel: undefined  // ✅ Nouveau
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
          registered_count: doc.data().registered_count || 0,
          minLevel: doc.data().minLevel, // ✅ Nouveau
          maxLevel: doc.data().maxLevel  // ✅ Nouveau
        }));
        setCompetitions(competitionsData);
      } catch (error: any) {
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
        registered_count: 0,
        minLevel: createForm.minLevel, // ✅ Nouveau
        maxLevel: createForm.maxLevel  // ✅ Nouveau
      });
      const querySnapshot = await getDocs(collection(db, 'competitions'));
      setCompetitions(querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        date: doc.data().date,
        status: doc.data().status,
        access_code: doc.data().access_code,
        max_participants: doc.data().max_participants,
        registered_count: doc.data().registered_count || 0,
        minLevel: doc.data().minLevel, // ✅ Nouveau
        maxLevel: doc.data().maxLevel  // ✅ Nouveau
      })));
      setOpenCreateDialog(false);
      setSnackbarMessage("Compétition créée avec succès !");
      setOpenSnackbar(true);
    } catch (error: any) {
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
      max_participants: competition.max_participants,
      minLevel: competition.minLevel, // ✅ Nouveau
      maxLevel: competition.maxLevel  // ✅ Nouveau
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
        max_participants: editForm.max_participants,
        minLevel: editForm.minLevel, // ✅ Nouveau
        maxLevel: editForm.maxLevel  // ✅ Nouveau
      });
      const querySnapshot = await getDocs(collection(db, 'competitions'));
      setCompetitions(querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        date: doc.data().date,
        status: doc.data().status,
        access_code: doc.data().access_code,
        max_participants: doc.data().max_participants,
        registered_count: doc.data().registered_count || 0,
        minLevel: doc.data().minLevel, // ✅ Nouveau
        maxLevel: doc.data().maxLevel  // ✅ Nouveau
      })));
      setOpenEditDialog(false);
      setSnackbarMessage("Compétition mise à jour avec succès !");
      setOpenSnackbar(true);
    } catch (error: any) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la mise à jour de la compétition.");
      setOpenSnackbar(true);
    }
  };

  const handleDeleteCompetition = async () => {
    if (!competitionToDelete) return;
    try {
      await deleteDoc(doc(db, 'competitions', competitionToDelete));
      setCompetitions(competitions.filter(comp => comp.id !== competitionToDelete));
      setSnackbarMessage("Compétition supprimée avec succès !");
      setOpenSnackbar(true);
    } catch (error: any) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la suppression de la compétition.");
      setOpenSnackbar(true);
    } finally {
      setOpenDeleteDialog(false);
      setCompetitionToDelete(null);
    }
  };

  if (loading) {
    return <Typography>Chargement des compétitions...</Typography>;
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
            mb: 2,
          }}
        >
          <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Gestion des Compétitions
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenCreateDialog(true)}
            sx={{ width: { xs: '100%', sm: 'auto' }, height: '48px' }}
          >
            Créer une compétition
          </Button>
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>Nom</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Code d'accès</TableCell>
                <TableCell>Niveau requis</TableCell> {/* ✅ Nouvelle colonne */}
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
                  {/* ✅ Afficher les restrictions de niveau */}
                  <TableCell>
                    {competition.minLevel && competition.maxLevel ? (
                      <Chip
                        label={`De ${competition.minLevel} à ${competition.maxLevel}`}
                        color="primary"
                        size="small"
                      />
                    ) : competition.minLevel ? (
                      <Chip label={`Min: ${competition.minLevel}`} color="success" size="small" />
                    ) : competition.maxLevel ? (
                      <Chip label={`Max: ${competition.maxLevel}`} color="error" size="small" />
                    ) : (
                      <Chip label="Tous les niveaux" color="default" size="small" />
                    )}
                  </TableCell>
                  <TableCell>{competition.registered_count} / {competition.max_participants}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton
                      color="primary"
                      onClick={() => handleOpenEditDialog(competition)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => {
                        setCompetitionToDelete(competition.id);
                        setOpenDeleteDialog(true);
                      }}
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

        {/* Dialogue de création */}
        <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
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
                <InputLabel id="statut-select-label">Statut</InputLabel>
                <Select
                  labelId="statut-select-label" id="statut-select"
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

              {/* ✅ Sélecteurs de niveau minimum/maximum */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                <FormControl sx={{ flex: '1 1 200px' }}>
                  <InputLabel id="niveau-minimum-optionnel-select-label">Niveau minimum (optionnel)</InputLabel>
                  <Select
                    labelId="niveau-minimum-optionnel-select-label" id="niveau-minimum-optionnel-select"
                    value={createForm.minLevel || ''}
                    onChange={(e) => setCreateForm({...createForm, minLevel: e.target.value as Level || undefined})}
                    label="Niveau minimum"
                  >
                    <MenuItem value="">Aucun</MenuItem>
                    {levelOptions.map(level => (
                      <MenuItem key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl sx={{ flex: '1 1 200px' }}>
                  <InputLabel id="niveau-maximum-optionnel-select-label">Niveau maximum (optionnel)</InputLabel>
                  <Select
                    labelId="niveau-maximum-optionnel-select-label" id="niveau-maximum-optionnel-select"
                    value={createForm.maxLevel || ''}
                    onChange={(e) => setCreateForm({...createForm, maxLevel: e.target.value as Level || undefined})}
                    label="Niveau maximum"
                  >
                    <MenuItem value="">Aucun</MenuItem>
                    {levelOptions.map(level => (
                      <MenuItem key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreateCompetition} color="primary">
              Créer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue d'édition */}
        <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
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
                <InputLabel id="statut-select-label-2">Statut</InputLabel>
                <Select
                  labelId="statut-select-label-2" id="statut-select-2"
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

              {/* ✅ Sélecteurs de niveau minimum/maximum */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                <FormControl sx={{ flex: '1 1 200px' }}>
                  <InputLabel id="niveau-minimum-optionnel-select-label-2">Niveau minimum (optionnel)</InputLabel>
                  <Select
                    labelId="niveau-minimum-optionnel-select-label-2" id="niveau-minimum-optionnel-select-2"
                    value={editForm.minLevel || ''}
                    onChange={(e) => setEditForm({...editForm, minLevel: e.target.value as Level || undefined})}
                    label="Niveau minimum"
                  >
                    <MenuItem value="">Aucun</MenuItem>
                    {levelOptions.map(level => (
                      <MenuItem key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl sx={{ flex: '1 1 200px' }}>
                  <InputLabel id="niveau-maximum-optionnel-select-label-2">Niveau maximum (optionnel)</InputLabel>
                  <Select
                    labelId="niveau-maximum-optionnel-select-label-2" id="niveau-maximum-optionnel-select-2"
                    value={editForm.maxLevel || ''}
                    onChange={(e) => setEditForm({...editForm, maxLevel: e.target.value as Level || undefined})}
                    label="Niveau maximum"
                  >
                    <MenuItem value="">Aucun</MenuItem>
                    {levelOptions.map(level => (
                      <MenuItem key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenEditDialog(false)}>Annuler</Button>
            <Button onClick={handleUpdateCompetition} color="primary">
              Enregistrer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue de confirmation de suppression */}
        <Dialog
          open={openDeleteDialog}
          onClose={() => setOpenDeleteDialog(false)}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Supprimer la compétition</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer cette compétition ?
            <br />
            <strong>Cette action est irréversible.</strong>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button onClick={handleDeleteCompetition} color="error" variant="contained" autoFocus>
              Supprimer
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