import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Box, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Chip
} from '@mui/material';
import { collection, query, where, getDocs, DocumentData } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';

// ✅ Interface pour les blocs (avec champs optionnels)
interface Boulder {
  id: string;
  number?: number;
  wall?: string;
  [key: string]: any; // Pour les autres champs dynamiques
}

const walls: string[] = [
  'Caverne des petits', 'Réta d\'initiation', 'Réta Adultes', 'Grande Face',
  'Dalle', 'Dévers 15°', 'Dévers 30°', 'Dévers 40°', 'Grotte Adultes', 'Güllich'
];

interface StatsData {
  boulderId: string;
  boulderNumber: number;
  wall: string;
  averageRating: number;
  ratingCount: number;
}

export default function BoulderStats(): JSX.Element {
  const [selectedWall, setSelectedWall] = useState<string>('');
  const [stats, setStats] = useState<StatsData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedWall) return;

    const fetchStats = async (): Promise<void> => {
      setLoading(true);
      try {
        // 1. Charger les blocs pour le mur sélectionné
        const bouldersQuery = query(
          collection(db, 'boulders'),
          where('wall', '==', selectedWall),
          where('is_active', '==', true)
        );
        const bouldersSnapshot = await getDocs(bouldersQuery);
        // ✅ Typage explicite des blocs
        const boulders: Boulder[] = bouldersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Boulder[];

        // 2. Pour chaque bloc, calculer la moyenne des notes
        const statsData: StatsData[] = [];
        for (const boulder of boulders) {
          const ratingsQuery = query(
            collection(db, 'boulder_ratings'),
            where('boulder_id', '==', boulder.id)
          );
          const ratingsSnapshot = await getDocs(ratingsQuery);
          const ratings: number[] = ratingsSnapshot.docs.map((doc: DocumentData) => doc.data().rating);

          // ✅ Utilisation de valeurs par défaut pour number et wall
          const boulderNumber: number = boulder.number || 0;
          const boulderWall: string = boulder.wall || 'Inconnu';

          if (ratings.length > 0) {
            const average: number = ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length;
            statsData.push({
              boulderId: boulder.id,
              boulderNumber: boulderNumber,
              wall: boulderWall,
              averageRating: parseFloat(average.toFixed(2)),
              ratingCount: ratings.length
            });
          } else {
            statsData.push({
              boulderId: boulder.id,
              boulderNumber: boulderNumber,
              wall: boulderWall,
              averageRating: 0,
              ratingCount: 0
            });
          }
        }

        setStats(statsData);
      } catch (error: unknown) {
        console.error('Erreur lors du chargement des statistiques :', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedWall]);

  // ✅ Préparer les données pour le graphique
  const chartData = stats.map((s: StatsData) => ({
    name: `Bloc ${s.boulderNumber}`,
    'Note moyenne': s.averageRating,
    'Nombre de notes': s.ratingCount
  }));

  // ✅ Calculer la moyenne générale du mur
  const wallAverage: number = stats.length > 0
    ? stats.reduce((sum: number, s: StatsData) => sum + s.averageRating, 0) / stats.length
    : 0;

  return (
    <Box sx={{ mt: 2 }}>
      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel>Sélectionnez un mur</InputLabel>
        <Select
          value={selectedWall}
          onChange={(e: any): void => setSelectedWall(e.target.value as string)}
          label="Mur"
        >
          {walls.map((wall: string) => (
            <MenuItem key={wall} value={wall}>{wall}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {loading ? (
        <LinearProgress />
      ) : selectedWall ? (
        <>
          {stats.length > 0 ? (
            <>
              <Paper sx={{ p: 2, mb: 3, backgroundColor: '#f5f5f5' }}>
                <Typography variant="h6">
                  Moyenne générale du mur: {wallAverage.toFixed(2)}/5
                </Typography>
                <Chip
                  label={wallAverage >= 4 ? 'Excellent' : wallAverage >= 3 ? 'Bon' : 'À améliorer'}
                  color={wallAverage >= 4 ? 'success' : wallAverage >= 3 ? 'primary' : 'error'}
                  sx={{ mt: 1 }}
                />
              </Paper>

              <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Notes par bloc
                </Typography>
                <Box sx={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 5]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Note moyenne" fill="#8884d8" name="Note moyenne (1-5)" />
                      <Bar dataKey="Nombre de notes" fill="#82ca9d" name="Nombre de notes" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Bloc n°</TableCell>
                      <TableCell>Note moyenne</TableCell>
                      <TableCell>Nombre de notes</TableCell>
                      <TableCell>Appréciation</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stats.map((stat: StatsData) => (
                      <TableRow key={stat.boulderId}>
                        <TableCell>{stat.boulderNumber}</TableCell>
                        <TableCell>
                          {stat.averageRating > 0 ? stat.averageRating.toFixed(2) : 'Aucune note'}
                        </TableCell>
                        <TableCell>{stat.ratingCount}</TableCell>
                        <TableCell>
                          {stat.ratingCount > 0 ? (
                            <Chip
                              label={`${stat.averageRating.toFixed(1)}/5`}
                              color={
                                stat.averageRating >= 4 ? 'success' :
                                stat.averageRating >= 3 ? 'primary' : 'error'
                              }
                            />
                          ) : (
                            <Chip label="Aucune note" color="default" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            <Typography>Aucun bloc trouvé pour ce mur.</Typography>
          )}
        </>
      ) : (
        <Typography>Sélectionnez un mur pour afficher les statistiques.</Typography>
      )}
    </Box>
  );
}