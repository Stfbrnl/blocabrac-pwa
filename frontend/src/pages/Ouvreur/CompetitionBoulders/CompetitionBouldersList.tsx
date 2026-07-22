import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Paper, Container, Button, Box,
  MenuItem, Select, InputLabel, FormControl, IconButton, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';
import { collection, query, where, getDocs, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';

interface Competition {
  id: string;
  name: string;
  date: string;
  status: string;
  walls: string[];
}

interface Boulder {
  id: string;
  wall: string;
  number: number;
  difficulty: string;
  difficulty_types: string[];
  instructions: string;
  image_base64?: string;
  competition_id: string;
  is_active: boolean;
  difficulty_level?: 'Plus' | 'Égal' | 'Moins';
}

export default function CompetitionBouldersList(): JSX.Element {
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [boulderToDelete, setBoulderToDelete] = useState<string | null>(null);

  useEffect(() => {
    const fetchCompetitions = async (): Promise<void> => {
      const q = query(collection(db, 'competitions'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      setCompetitions(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Competition[]);
    };
    fetchCompetitions();
  }, []);

  useEffect(() => {
    const fetchBoulders = async (): Promise<void> => {
      if (!selectedCompetition) {
        setBoulders([]);
        return;
      }

      try {
        const q = query(
          collection(db, 'boulders'),
          where('competition_id', '==', selectedCompetition),
          where('type', '==', 'competition')
        );
        const snapshot = await getDocs(q);

        const allBoulders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Boulder[];

        const filteredAndSortedBoulders = allBoulders
          .filter(boulder => boulder.is_active === true)
          .sort((a, b) => (a.number || 0) - (b.number || 0));

        setBoulders(filteredAndSortedBoulders);
      } catch (error: unknown) {
        console.error('Erreur lors du chargement des blocs :', error);
        alert('Une erreur est survenue lors du chargement des blocs.');
      }
    };

    fetchBoulders();
  }, [selectedCompetition]);

  const handleOpenDeleteDialog = (boulderId: string): void => {
    setBoulderToDelete(boulderId);
    setOpenDeleteDialog(true);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!boulderToDelete) return;
    await updateDoc(doc(db, 'boulders', boulderToDelete), { is_active: false });
    setBoulders(boulders.filter(b => b.id !== boulderToDelete));
    setOpenDeleteDialog(false);
    setBoulderToDelete(null);
  };

  const handleReorder = async (): Promise<void> => {
    try {
      for (const boulder of boulders) {
        await updateDoc(doc(db, 'boulders', boulder.id), {
          number: boulder.number
        });
      }
      alert('Numéros réorganisés avec succès !');
    } catch (error: unknown) {
      console.error('Erreur lors de la réorganisation :', error);
      alert('Une erreur est survenue lors de la réorganisation.');
    }
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          Gérer les blocs de compétition
        </Typography>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="selectionnez-une-competition-select-label">Sélectionnez une compétition</InputLabel>
          <Select
            labelId="selectionnez-une-competition-select-label" id="selectionnez-une-competition-select"
            value={selectedCompetition}
            onChange={(e: SelectChangeEvent): void => setSelectedCompetition(e.target.value)}
            label="Compétition"
          >
            {competitions.map((comp: Competition) => (
              <MenuItem key={comp.id} value={comp.id}>
                {comp.name} - {new Date(comp.date).toLocaleDateString()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedCompetition && (
          <>
            {/* ✅ flexWrap pour empiler les deux boutons sur mobile au lieu de les compresser */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate(`/ouvreur/competition-boulders/${selectedCompetition}/add`)}
              >
                Ajouter un bloc
              </Button>
              <Button
                variant="outlined"
                onClick={handleReorder}
              >
                Réorganiser les numéros
              </Button>
            </Box>

            {boulders.length > 0 ? (
              // ✅ Scroll horizontal de secours pour ce tableau à 5 colonnes
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>N°</TableCell>
                      <TableCell>Mur</TableCell>
                      <TableCell>Difficulté (interne)</TableCell>
                      <TableCell>Types</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {boulders.map((boulder: Boulder) => (
                      <TableRow key={boulder.id}>
                        <TableCell>
                          <TextField
                            type="number"
                            value={boulder.number}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                              const newBoulders = [...boulders];
                              const index = newBoulders.findIndex(b => b.id === boulder.id);
                              if (index !== -1) {
                                newBoulders[index] = { ...newBoulders[index], number: parseInt(e.target.value) || 0 };
                                setBoulders(newBoulders);
                              }
                            }}
                            size="small"
                            sx={{ width: 70 }}
                          />
                        </TableCell>
                        <TableCell>{boulder.wall}</TableCell>
                        <TableCell>
                          {boulder.difficulty}
                          {boulder.difficulty_level && (
                            <Chip
                              label={boulder.difficulty_level}
                              size="small"
                              color={
                                boulder.difficulty_level === 'Plus' ? 'error' :
                                boulder.difficulty_level === 'Moins' ? 'success' : 'default'
                              }
                              sx={{ ml: 1 }}
                            />
                          )}
                        </TableCell>
                        <TableCell>{boulder.difficulty_types?.join(', ') || 'Aucun'}</TableCell>
                        <TableCell>
                          <IconButton
                            color="primary"
                            onClick={() => navigate(`/ouvreur/competition-boulders/${selectedCompetition}/edit/${boulder.id}`)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            color="error"
                            onClick={() => handleOpenDeleteDialog(boulder.id)}
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
              <Typography>Aucun bloc trouvé pour cette compétition.</Typography>
            )}
          </>
        )}
      </Paper>

      <Dialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Supprimer le bloc</DialogTitle>
        <DialogContent>
          Êtes-vous sûr de vouloir supprimer ce bloc ?
          <br />
          <strong>Il sera marqué comme inactif mais ne sera plus visible.</strong>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" autoFocus>
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}