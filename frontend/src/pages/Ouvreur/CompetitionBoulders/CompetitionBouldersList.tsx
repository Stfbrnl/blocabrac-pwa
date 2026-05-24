import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Paper, Container, Button, Box,
  MenuItem, Select, InputLabel, FormControl, IconButton, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField
} from '@mui/material';
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
  image_url: string;
  competition_id: string;
  is_active: boolean;
}

export default function CompetitionBouldersList(): JSX.Element {
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [boulders, setBoulders] = useState<Boulder[]>([]);

  // ✅ Charger les compétitions
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

  // ✅ Charger les blocs pour la compétition sélectionnée
  useEffect(() => {
    if (!selectedCompetition) return;
    const fetchBoulders = async (): Promise<void> => {
      const q = query(
        collection(db, 'boulders'),
        where('competition_id', '==', selectedCompetition),
        where('type', '==', 'competition'),
        where('is_active', '==', true),
        orderBy('number')
      );
      const snapshot = await getDocs(q);
      setBoulders(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Boulder[]);
    };
    fetchBoulders();
  }, [selectedCompetition]);

  // ✅ Réorganiser les numéros
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
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          Gérer les blocs de compétition
        </Typography>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Sélectionnez une compétition</InputLabel>
          <Select
            value={selectedCompetition}
            onChange={(e: any): void => setSelectedCompetition(e.target.value as string)}
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
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
              <TableContainer>
                <Table>
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
                            onChange={(e: any): void => {
                              const newBoulders = [...boulders];
                              const index = newBoulders.findIndex(b => b.id === boulder.id);
                              newBoulders[index] = { ...newBoulders[index], number: parseInt(e.target.value) || 0 };
                              setBoulders(newBoulders);
                            }}
                            size="small"
                            sx={{ width: 60 }}
                          />
                        </TableCell>
                        <TableCell>{boulder.wall}</TableCell>
                        <TableCell>{boulder.difficulty || 'Non spécifiée'}</TableCell>
                        <TableCell>{boulder.difficulty_types.join(', ')}</TableCell>
                        <TableCell>
                          <IconButton
                            color="primary"
                            onClick={() => navigate(`/ouvreur/competition-boulders/${selectedCompetition}/edit/${boulder.id}`)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            color="error"
                            onClick={async (): Promise<void> => {
                              if (window.confirm('Supprimer ce bloc ?')) {
                                await updateDoc(doc(db, 'boulders', boulder.id), { is_active: false });
                                setBoulders(boulders.filter(b => b.id !== boulder.id));
                              }
                            }}
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
    </Container>
  );
}