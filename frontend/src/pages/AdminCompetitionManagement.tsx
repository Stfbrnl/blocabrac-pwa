import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Autocomplete,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { db, auth } from '../services/firebaseConfig'; // ✅ Ajustez le chemin si nécessaire
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';

// ✅ Type étendu pour inclure 'supprimée'
type CompetitionStatus = 'en cours' | 'terminée' | 'à venir' | 'supprimée';

interface Boulder {
  id: string;
  name: string;
  level: string;
  type: 'classic' | 'competition';
  competition_id?: string | null;
}

interface Competition {
  id?: string;
  name: string;
  date: string;
  status: CompetitionStatus;
  max_participants: number;
  registered_count: number;
  boulders: string[];
  access_code?: string;
}

const AdminCompetitionManagement: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [currentCompetition, setCurrentCompetition] = useState<Competition | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Récupérer les blocs de compétition
  const fetchBoulders = async () => {
    try {
      const q = query(
        collection(db, 'boulders'),
        where('type', '==', 'competition')
      );
      const querySnapshot = await getDocs(q);
      const bouldersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Boulder[];
      setBoulders(bouldersData);
    } catch (err) {
      console.error('Erreur : ', err);
      setError('Erreur lors de la récupération des blocs de compétition.');
    }
  };

  // Récupérer les compétitions
  const fetchCompetitions = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'competitions'));
      const competitionsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Competition[];
      setCompetitions(competitionsData.filter(comp => comp.status !== 'supprimée'));
    } catch (err) {
      console.error('Erreur : ', err);
      setError('Erreur lors de la récupération des compétitions.');
    }
  };

  // Ouvrir la boîte de dialogue pour créer/éditer
  const handleOpenDialog = (competition: Competition | null = null) => {
    setCurrentCompetition(competition || {
      name: '',
      date: new Date().toISOString().split('T')[0],
      status: 'à venir',
      max_participants: 50,
      registered_count: 0,
      boulders: [],
      access_code: generateAccessCode(),
    });
    setOpenDialog(true);
  };

  // Générer un code d'accès aléatoire
  const generateAccessCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Sauvegarder la compétition
  const handleSave = async () => {
    if (!currentCompetition) return;
    if (!currentCompetition.name || !currentCompetition.date || currentCompetition.boulders.length === 0) {
      setError('Veuillez remplir tous les champs obligatoires (nom, date, blocs).');
      return;
    }

    try {
      setLoading(true);
      if (currentCompetition.id) {
        // Mise à jour
        await updateDoc(doc(db, 'competitions', currentCompetition.id), {
          name: currentCompetition.name,
          date: currentCompetition.date,
          status: currentCompetition.status,
          max_participants: currentCompetition.max_participants,
          boulders: currentCompetition.boulders,
          access_code: currentCompetition.access_code,
        });
        setSuccess('Compétition modifiée avec succès !');
      } else {
        // Création
        const docRef = await addDoc(collection(db, 'competitions'), {
          name: currentCompetition.name,
          date: currentCompetition.date,
          status: currentCompetition.status,
          max_participants: currentCompetition.max_participants,
          registered_count: 0,
          boulders: currentCompetition.boulders,
          access_code: currentCompetition.access_code,
        });
        setSuccess(`Compétition créée avec succès ! Code d'accès : ${currentCompetition.access_code}`);
        setCurrentCompetition({ ...currentCompetition, id: docRef.id });
      }
      fetchCompetitions();
      setOpenDialog(false);
    } catch (err: any) {
      setError(`Erreur : ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Supprimer une compétition
  const handleDelete = async (competitionId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette compétition ? Cette action est irréversible.')) return;
    try {
      await updateDoc(doc(db, 'competitions', competitionId), {
        status: 'supprimée',
      });
      setSuccess('Compétition supprimée avec succès !');
      fetchCompetitions();
    } catch (err: any) {
      setError(`Erreur : ${err.message}`);
    }
  };

  // Gestion des changements pour les champs de type TextField
  const handleTextFieldChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCurrentCompetition({
      ...currentCompetition!,
      [name]: value,
    });
  };

  useEffect(() => {
    if (user) {
      fetchBoulders();
      fetchCompetitions();
    }
  }, [user]);

  if (loadingAuth) {
    return <CircularProgress />;
  }

  return (
    <Box sx={{ mt: 2, p: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Gestion des Compétitions</Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => handleOpenDialog()}
          startIcon={<EditIcon />}
        >
          Créer une compétition
        </Button>
      </Box>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Liste des compétitions
        </Typography>
        {competitions.length === 0 ? (
          <Typography>Aucune compétition trouvée. Créez-en une pour commencer.</Typography>
        ) : (
          <Box>
            {competitions.map((competition) => (
              <Paper
                key={competition.id}
                sx={{
                  p: 2,
                  mb: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderLeft: `4px solid ${
                    competition.status === 'terminée' ? '#4caf50' :
                    competition.status === 'en cours' ? '#2196f3' : '#9e9e9e'
                  }`
                }}
              >
                <Box>
                  <Typography variant="subtitle1">{competition.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {competition.date} | Statut: {competition.status} | Inscrits: {competition.registered_count}/{competition.max_participants}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    {competition.boulders.map(boulderId => {
                      const boulder = boulders.find(b => b.id === boulderId);
                      return boulder ? (
                        <Chip
                          key={boulderId}
                          label={`${boulder.name} (${boulder.level})`}
                          sx={{ mr: 0.5, mb: 0.5 }}
                          color={
                            boulder.level === 'jaune' ? 'warning' :
                            boulder.level === 'vert' ? 'success' :
                            boulder.level === 'bleu' ? 'primary' :
                            boulder.level === 'violet' ? 'secondary' :
                            boulder.level === 'rouge' ? 'error' :
                            boulder.level === 'noir' ? 'default' :
                            boulder.level === 'blanc' ? 'info' : 'default'
                          }
                        />
                      ) : (
                        <Chip key={boulderId} label={boulderId} sx={{ mr: 0.5, mb: 0.5 }} />
                      );
                    })}
                  </Box>
                  <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                    Code d'accès: <strong>{competition.access_code}</strong>
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Modifier">
                    <IconButton
                      color="primary"
                      onClick={() => handleOpenDialog(competition)}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Supprimer">
                    <IconButton
                      color="error"
                      onClick={() => handleDelete(competition.id!)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Paper>
            ))}
          </Box>
        )}
      </Paper>

      {/* Dialogue de création/édition */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {currentCompetition?.id ? 'Modifier la compétition' : 'Créer une compétition'}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Nom de la compétition"
            name="name"
            value={currentCompetition?.name || ''}
            onChange={handleTextFieldChange}
            fullWidth
            margin="normal"
            required
            error={!currentCompetition?.name}
            helperText={!currentCompetition?.name ? 'Ce champ est obligatoire' : ''}
          />
          {/* ✅ CORRECTION POUR MUI v9.0.1 : Utilisation de slotProps */}
          <TextField
            label="Date"
            name="date"
            type="date"
            value={currentCompetition?.date || ''}
            onChange={handleTextFieldChange}
            fullWidth
            margin="normal"
            slotProps={{
              inputLabel: { shrink: true } // ✅ Solution officielle pour MUI v9
            }}
            required
            error={!currentCompetition?.date}
            helperText={!currentCompetition?.date ? 'Ce champ est obligatoire' : ''}
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Statut</InputLabel>
            <Select
              name="status"
              value={currentCompetition?.status || 'à venir'}
              onChange={(e) => setCurrentCompetition({
                ...currentCompetition!,
                status: e.target.value as CompetitionStatus
              })}
              label="Statut"
            >
              <MenuItem value="à venir">À venir</MenuItem>
              <MenuItem value="en cours">En cours</MenuItem>
              <MenuItem value="terminée">Terminée</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Nombre maximum de participants"
            name="max_participants"
            type="number"
            value={currentCompetition?.max_participants || 50}
            onChange={handleTextFieldChange}
            fullWidth
            margin="normal"
            required
            error={!currentCompetition?.max_participants}
            helperText={!currentCompetition?.max_participants ? 'Ce champ est obligatoire' : ''}
          />
          <FormControl fullWidth margin="normal">
            <Autocomplete
              multiple
              options={boulders}
              getOptionLabel={(option) => `${option.name} (${option.level})`}
              value={boulders.filter(b => currentCompetition?.boulders.includes(b.id))}
              onChange={(e, newValue) => {
                setCurrentCompetition({
                  ...currentCompetition!,
                  boulders: newValue.map(b => b.id),
                });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Blocs de compétition"
                  name="boulders"
                  placeholder="Sélectionnez les blocs"
                  error={!currentCompetition?.boulders || currentCompetition.boulders.length === 0}
                  helperText={
                    !currentCompetition?.boulders || currentCompetition.boulders.length === 0
                      ? 'Sélectionnez au moins un bloc'
                      : ''
                  }
                />
              )}
              renderOption={(props, option) => (
                <li {...props}>
                  <Checkbox checked={currentCompetition?.boulders.includes(option.id)} />
                  <ListItemText primary={option.name} secondary={`Niveau: ${option.level}`} />
                </li>
              )}
            />
          </FormControl>
          <TextField
            label="Code d'accès"
            name="access_code"
            value={currentCompetition?.access_code || ''}
            onChange={handleTextFieldChange}
            fullWidth
            margin="normal"
            helperText="Code pour les participants non-clients. Laissez vide pour en générer un automatiquement."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Annuler</Button>
          <Button onClick={handleSave} variant="contained" color="primary" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminCompetitionManagement;