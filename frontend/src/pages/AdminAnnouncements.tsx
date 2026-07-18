import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Button, TextField, Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, Chip, Switch, Tooltip, useTheme, useMediaQuery
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon, Campaign as CampaignIcon } from '@mui/icons-material';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, orderBy, query } from 'firebase/firestore';

interface Announcement {
  id: string;
  text: string;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

const AdminAnnouncements: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] = useState<string | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const [createForm, setCreateForm] = useState<{ text: string; order: number; active: boolean }>({
    text: '',
    order: 0,
    active: true,
  });
  const [editForm, setEditForm] = useState<{ text: string; order: number; active: boolean }>({
    text: '',
    order: 0,
    active: true,
  });

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'announcements'), orderBy('order', 'asc'));
      const querySnapshot = await getDocs(q);
      const data: Announcement[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        text: docSnap.data().text || '',
        order: docSnap.data().order ?? 0,
        active: docSnap.data().active ?? true,
        createdAt: docSnap.data().createdAt || '',
        updatedAt: docSnap.data().updatedAt,
      }));
      setAnnouncements(data);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors du chargement des informations.");
      setOpenSnackbar(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleCreate = async () => {
    if (!createForm.text.trim()) {
      setSnackbarMessage("Le texte de l'information est obligatoire.");
      setOpenSnackbar(true);
      return;
    }
    try {
      await addDoc(collection(db, 'announcements'), {
        text: createForm.text.trim(),
        order: createForm.order,
        active: createForm.active,
        createdAt: new Date().toISOString(),
      });
      await fetchAnnouncements();
      setOpenCreateDialog(false);
      setCreateForm({ text: '', order: 0, active: true });
      setSnackbarMessage("Information créée avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la création de l'information.");
      setOpenSnackbar(true);
    }
  };

  const handleOpenEditDialog = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setEditForm({
      text: announcement.text,
      order: announcement.order,
      active: announcement.active,
    });
    setOpenEditDialog(true);
  };

  const handleUpdate = async () => {
    if (!selectedAnnouncement) return;
    if (!editForm.text.trim()) {
      setSnackbarMessage("Le texte de l'information est obligatoire.");
      setOpenSnackbar(true);
      return;
    }
    try {
      await updateDoc(doc(db, 'announcements', selectedAnnouncement.id), {
        text: editForm.text.trim(),
        order: editForm.order,
        active: editForm.active,
        updatedAt: new Date().toISOString(),
      });
      await fetchAnnouncements();
      setOpenEditDialog(false);
      setSnackbarMessage("Information mise à jour avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la mise à jour de l'information.");
      setOpenSnackbar(true);
    }
  };

  const handleToggleActive = async (announcement: Announcement) => {
    try {
      await updateDoc(doc(db, 'announcements', announcement.id), {
        active: !announcement.active,
        updatedAt: new Date().toISOString(),
      });
      await fetchAnnouncements();
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la mise à jour du statut.");
      setOpenSnackbar(true);
    }
  };

  const handleDelete = async () => {
    if (!announcementToDelete) return;
    try {
      await deleteDoc(doc(db, 'announcements', announcementToDelete));
      await fetchAnnouncements();
      setSnackbarMessage("Information supprimée avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la suppression de l'information.");
      setOpenSnackbar(true);
    } finally {
      setOpenDeleteDialog(false);
      setAnnouncementToDelete(null);
    }
  };

  if (loading) {
    return <Typography>Chargement des informations...</Typography>;
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CampaignIcon color="primary" sx={{ fontSize: { xs: 32, sm: 40 } }} />
            <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
              Informations pour les clients
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenCreateDialog(true)}
            sx={{ width: { xs: '100%', sm: 'auto' }, height: '48px' }}
          >
            Nouvelle information
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ces messages s'affichent au-dessus du menu de tous les clients, tant qu'ils sont actifs.
          Plusieurs informations peuvent être affichées en même temps ; l'ordre ci-dessous détermine
          leur ordre d'affichage (du plus petit au plus grand).
        </Typography>

        {announcements.length === 0 ? (
          <Typography>Aucune information pour le moment. Créez-en une !</Typography>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Ordre</TableCell>
                  <TableCell>Message</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {announcements.map((announcement) => (
                  <TableRow key={announcement.id} hover>
                    <TableCell>{announcement.order}</TableCell>
                    <TableCell sx={{ maxWidth: 400 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {announcement.text}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Switch
                          checked={announcement.active}
                          onChange={() => handleToggleActive(announcement)}
                          color="primary"
                        />
                        <Chip
                          label={announcement.active ? 'Actif' : 'Inactif'}
                          color={announcement.active ? 'success' : 'default'}
                          size="small"
                        />
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Modifier">
                        <IconButton color="primary" onClick={() => handleOpenEditDialog(announcement)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Supprimer">
                        <IconButton
                          color="error"
                          onClick={() => {
                            setAnnouncementToDelete(announcement.id);
                            setOpenDeleteDialog(true);
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Dialogue de création */}
        <Dialog
          open={openCreateDialog}
          onClose={() => setOpenCreateDialog(false)}
          fullWidth
          maxWidth="sm"
          fullScreen={isMobile}
        >
          <DialogTitle>Nouvelle information</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Message"
                value={createForm.text}
                onChange={(e) => setCreateForm({ ...createForm, text: e.target.value })}
                multiline
                rows={3}
                fullWidth
                placeholder="Ex: La salle sera fermée du 12 au 20 août pour les vacances."
              />
              <TextField
                label="Ordre d'affichage"
                type="number"
                value={createForm.order}
                onChange={(e) => setCreateForm({ ...createForm, order: parseInt(e.target.value, 10) || 0 })}
                fullWidth
                helperText="Les informations sont affichées du plus petit ordre au plus grand."
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  checked={createForm.active}
                  onChange={(e) => setCreateForm({ ...createForm, active: e.target.checked })}
                  color="primary"
                />
                <Typography>Afficher immédiatement aux clients</Typography>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreate} color="primary" variant="contained">
              Créer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue d'édition */}
        <Dialog
          open={openEditDialog}
          onClose={() => setOpenEditDialog(false)}
          fullWidth
          maxWidth="sm"
          fullScreen={isMobile}
        >
          <DialogTitle>Modifier l'information</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Message"
                value={editForm.text}
                onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                multiline
                rows={3}
                fullWidth
              />
              <TextField
                label="Ordre d'affichage"
                type="number"
                value={editForm.order}
                onChange={(e) => setEditForm({ ...editForm, order: parseInt(e.target.value, 10) || 0 })}
                fullWidth
                helperText="Les informations sont affichées du plus petit ordre au plus grand."
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  checked={editForm.active}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                  color="primary"
                />
                <Typography>Visible par les clients</Typography>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenEditDialog(false)}>Annuler</Button>
            <Button onClick={handleUpdate} color="primary" variant="contained">
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
          <DialogTitle>Supprimer l'information</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer cette information ?
            <br />
            <strong>Cette action est irréversible.</strong>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button onClick={handleDelete} color="error" variant="contained" autoFocus>
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

export default AdminAnnouncements;
