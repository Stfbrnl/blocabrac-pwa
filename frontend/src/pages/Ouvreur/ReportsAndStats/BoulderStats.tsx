import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Box, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Chip, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, Grid, TextField
} from '@mui/material';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';

const levelColors: Record<string, string> = {
  jaune: '#FFFF00',
  vert: '#00FF00',
  bleu: '#0000FF',
  violet: '#800080',
  rouge: '#FF0000',
  noir: '#000000',
  blanc: '#FFFFFF',
  rose: '#FFC0CB',
  mystère: '#808080'
};

const walls: string[] = [
  'Caverne des petits', 'Réta d\'initiation', 'Réta Adultes', 'Grande Face',
  'Dalle', 'Dévers 15°', 'Dévers 30°', 'Dévers 40°', 'Grotte Adultes', 'Güllich'
];

interface Boulder {
  id: string;
  number: number;
  wall: string;
  difficulty?: string;
}

interface StatsData {
  boulderId: string;
  boulderNumber: number;
  wall: string;
  averageRating: number;
  ratingCount: number;
  successCount: number;
  totalAttempts: number;
  averageAttempts: number;
  validatedBy: string[];
}

interface MysteryRatingData {
  boulderId: string;
  boulderNumber: number;
  wall: string;
  proposedDifficulty: string;
  count: number;
  users: string[];
}

// ✅ Annuaire UID -> "Prénom Nom"
interface UserInfo {
  id: string;
  firstName: string;
  lastName: string;
}

export default function BoulderStats(): JSX.Element {
  const [selectedWall, setSelectedWall] = useState<string>('');
  const [stats, setStats] = useState<StatsData[]>([]);
  const [mysteryRatings, setMysteryRatings] = useState<MysteryRatingData[]>([]);
  const [usersById, setUsersById] = useState<Record<string, UserInfo>>({}); // ✅ Annuaire chargé une fois
  const [loading, setLoading] = useState<boolean>(false);
  const [openResetDialog, setOpenResetDialog] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('week');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // ✅ Construit "Prénom Nom" à partir d'un UID, avec fallback sur l'UID lui-même
  const getUserFullName = (uid: string): string => {
    const found = usersById[uid];
    if (!found) return uid;
    const composed = [found.firstName, found.lastName].filter(Boolean).join(' ').trim();
    return composed || uid;
  };

  // ✅ Charger l'annuaire des utilisateurs une seule fois
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const map: Record<string, UserInfo> = {};
        snapshot.docs.forEach((userDoc) => {
          const data = userDoc.data();
          map[userDoc.id] = {
            id: userDoc.id,
            firstName: data.first_name || '',
            lastName: data.last_name || '',
          };
        });
        setUsersById(map);
      } catch (err) {
        console.error('Erreur lors du chargement des utilisateurs:', err);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!selectedWall) return;

    const fetchStats = async (): Promise<void> => {
      setLoading(true);
      try {
        const now = new Date();
        let startDateFilter: Date | null = null;
        let endDateFilter: Date | null = null;

        switch (period) {
          case 'day':
            startDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            break;
          case 'week':
            startDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
            endDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()) + 1);
            break;
          case 'month':
            startDateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
            endDateFilter = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            break;
          case 'year':
            startDateFilter = new Date(now.getFullYear(), 0, 1);
            endDateFilter = new Date(now.getFullYear() + 1, 0, 1);
            break;
          case 'custom':
            if (startDate && endDate) {
              startDateFilter = new Date(startDate);
              endDateFilter = new Date(endDate);
              endDateFilter.setDate(endDateFilter.getDate() + 1);
            }
            break;
        }

        const bouldersQuery = query(
          collection(db, 'boulders'),
          where('wall', '==', selectedWall),
          where('is_active', '==', true)
        );
        const bouldersSnapshot = await getDocs(bouldersQuery);
        const boulders: Boulder[] = bouldersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Boulder[];

        const statsData: StatsData[] = [];
        const mysteryRatingsData: MysteryRatingData[] = [];

        for (const boulder of boulders) {
          const resultsQuery = query(
            collection(db, 'client_boulder_results'),
            where('boulderId', '==', boulder.id)
          );
          const resultsSnapshot = await getDocs(resultsQuery);
          const results = resultsSnapshot.docs.map(doc => doc.data());

          const filteredResults = results.filter((result: any) => {
            const resultDate = new Date(result.createdAt);
            if (startDateFilter && resultDate < startDateFilter) return false;
            if (endDateFilter && resultDate >= endDateFilter) return false;
            return true;
          });

          const ratings: number[] = filteredResults
            .filter((result: any) => result.rating !== undefined)
            .map((result: any) => result.rating);

          const successResults: any[] = filteredResults
            .filter((result: any) => result.success === true);

          const validatedBy: string[] = successResults.map((result: any) => result.userId);

          const allAttempts: number[] = filteredResults
            .filter((result: any) => result.attempts !== undefined)
            .map((result: any) => result.attempts);

          statsData.push({
            boulderId: boulder.id,
            boulderNumber: boulder.number || 0,
            wall: boulder.wall || 'Inconnu',
            averageRating: ratings.length > 0 ? parseFloat((ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length).toFixed(2)) : 0,
            ratingCount: ratings.length,
            successCount: successResults.length,
            totalAttempts: allAttempts.reduce((sum: number, a: number) => sum + a, 0),
            averageAttempts: allAttempts.length > 0 ? parseFloat((allAttempts.reduce((sum: number, a: number) => sum + a, 0) / allAttempts.length).toFixed(1)) : 0,
            validatedBy: validatedBy
          });

          const proposedDifficulties: any[] = filteredResults
            .filter((result: any) => result.proposedDifficulty !== undefined && result.proposedDifficulty !== null);

          if (proposedDifficulties.length > 0) {
            const difficultyGroups: Record<string, { count: number; users: string[] }> = {};
            proposedDifficulties.forEach((result: any) => {
              const difficulty = result.proposedDifficulty;
              if (!difficultyGroups[difficulty]) {
                difficultyGroups[difficulty] = { count: 0, users: [] };
              }
              difficultyGroups[difficulty].count++;
              if (!difficultyGroups[difficulty].users.includes(result.userId)) {
                difficultyGroups[difficulty].users.push(result.userId);
              }
            });

            Object.entries(difficultyGroups).forEach(([difficulty, data]) => {
              mysteryRatingsData.push({
                boulderId: boulder.id,
                boulderNumber: boulder.number || 0,
                wall: boulder.wall || 'Inconnu',
                proposedDifficulty: difficulty,
                count: data.count,
                users: data.users
              });
            });
          }
        }

        setStats(statsData);
        setMysteryRatings(mysteryRatingsData);
      } catch (error: unknown) {
        console.error('Erreur lors du chargement des statistiques :', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedWall, period, startDate, endDate]);

  const handleResetStats = async (): Promise<void> => {
    try {
      setLoading(true);
      const boulderIds = stats.map(s => s.boulderId);
      // ✅ Firestore limite les clauses "in" à 10 valeurs : on découpe par lots de 10
      // pour ne pas planter dès qu'un mur a plus de 10 blocs actifs.
      const chunks: string[][] = [];
      for (let i = 0; i < boulderIds.length; i += 10) {
        chunks.push(boulderIds.slice(i, i + 10));
      }
      for (const chunk of chunks) {
        if (chunk.length === 0) continue;
        const resultsQuery = query(
          collection(db, 'client_boulder_results'),
          where('boulderId', 'in', chunk)
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        for (const resultDoc of resultsSnapshot.docs) {
          await deleteDoc(doc(db, 'client_boulder_results', resultDoc.id));
        }
      }
      setStats([]);
      setMysteryRatings([]);
      setOpenResetDialog(false);
    } catch (error: unknown) {
      console.error('Erreur lors de la réinitialisation :', error);
    } finally {
      setLoading(false);
    }
  };

  const periodSelector = (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Filtrer par période:</Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel id="periode-select-label">Période</InputLabel>
          <Select
            labelId="periode-select-label" id="periode-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'day' | 'week' | 'month' | 'year' | 'custom')}
            label="Période"
          >
            <MenuItem value="day">Aujourd'hui</MenuItem>
            <MenuItem value="week">Cette semaine</MenuItem>
            <MenuItem value="month">Ce mois</MenuItem>
            <MenuItem value="year">Cette année</MenuItem>
            <MenuItem value="custom">Période personnalisée</MenuItem>
          </Select>
        </FormControl>

        {period === 'custom' && (
          <>
            <TextField
              label="Date de début"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              sx={{ minWidth: 150 }}
            />
            <TextField
              label="Date de fin"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              sx={{ minWidth: 150 }}
            />
          </>
        )}
      </Box>
    </Paper>
  );

  const wallAverageRating = stats.length > 0
    ? stats.reduce((sum: number, s: StatsData) => sum + s.averageRating, 0) / stats.length
    : 0;

  const wallAverageAttempts = stats.length > 0
    ? stats.reduce((sum: number, s: StatsData) => sum + s.averageAttempts, 0) / stats.length
    : 0;

  const wallSuccessRate = stats.length > 0
    ? (stats.reduce((sum: number, s: StatsData) => sum + s.successCount, 0) / stats.reduce((sum: number, s: StatsData) => sum + s.ratingCount, 0)) * 100
    : 0;

  return (
    <Box sx={{ mt: 2 }}>
      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel id="selectionnez-un-mur-select-label">Sélectionnez un mur</InputLabel>
        <Select
          labelId="selectionnez-un-mur-select-label" id="selectionnez-un-mur-select"
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
          {stats.length > 0 || mysteryRatings.length > 0 ? (
            <>
              {/* Résumé du mur */}
              <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3, backgroundColor: '#f5f5f5' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="h6">
                      Moyenne du mur: {wallAverageRating.toFixed(2)}/5
                    </Typography>
                    <Typography variant="body2">
                      Taux de réussite: {isNaN(wallSuccessRate) ? '0' : wallSuccessRate.toFixed(1)}%
                    </Typography>
                    <Typography variant="body2">
                      Essais moyens: {wallAverageAttempts.toFixed(1)} par bloc
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => setOpenResetDialog(true)}
                    disabled={stats.length === 0}
                  >
                    Réinitialiser les stats
                  </Button>
                </Box>
              </Paper>

              {periodSelector}

              {/* TABLEAU 1 : Notes des blocs */}
              <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Notes des blocs
                </Typography>
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table sx={{ minWidth: 450 }}>
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
                          <TableCell>Bloc {stat.boulderNumber}</TableCell>
                          <TableCell>
                            {stat.ratingCount > 0 ? stat.averageRating.toFixed(2) : 'Aucune note'}
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
              </Paper>

              {/* TABLEAU 2 : Essais et validations */}
              <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Essais et validations
                </Typography>
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table sx={{ minWidth: 550 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Bloc n°</TableCell>
                        <TableCell>Essais moyens</TableCell>
                        <TableCell>Validations réussies</TableCell>
                        <TableCell>Utilisateurs ayant validé</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {stats.map((stat: StatsData) => (
                        <TableRow key={stat.boulderId}>
                          <TableCell>Bloc {stat.boulderNumber}</TableCell>
                          <TableCell>
                            {stat.averageAttempts > 0 ? stat.averageAttempts.toFixed(1) : 'Aucun essai'}
                          </TableCell>
                          <TableCell>{stat.successCount}</TableCell>
                          <TableCell>
                            {stat.validatedBy.length > 0 ? (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {stat.validatedBy.map((userId: string, index: number) => (
                                  <Chip
                                    key={`${stat.boulderId}_${index}`}
                                    // ✅ Nom complet résolu depuis l'annuaire, au lieu de l'UID brut
                                    label={getUserFullName(userId)}
                                    size="small"
                                    sx={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                  />
                                ))}
                              </Box>
                            ) : (
                              <Chip label="Aucune validation" color="default" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              {/* TABLEAU 3 : Cotations proposées pour les blocs mystère */}
              {mysteryRatings.length > 0 && (
                <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Cotations proposées pour les blocs mystère
                  </Typography>
                  <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table sx={{ minWidth: 550 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Bloc n°</TableCell>
                          <TableCell>Cotation proposée</TableCell>
                          <TableCell>Nombre de propositions</TableCell>
                          <TableCell>Utilisateurs</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {mysteryRatings.map((rating: MysteryRatingData) => (
                          <TableRow key={`${rating.boulderId}_${rating.proposedDifficulty}`}>
                            <TableCell>Bloc {rating.boulderNumber}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Box sx={{
                                  width: 20,
                                  height: 20,
                                  backgroundColor: levelColors[rating.proposedDifficulty],
                                  marginRight: 1,
                                  border: '1px solid #ccc'
                                }} />
                                {rating.proposedDifficulty}
                              </Box>
                            </TableCell>
                            <TableCell>{rating.count}</TableCell>
                            <TableCell>
                              {rating.users.length > 0 ? (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                  {rating.users.map((userId: string, index: number) => (
                                    <Chip
                                      key={`${rating.boulderId}_${rating.proposedDifficulty}_${index}`}
                                      // ✅ Nom complet résolu depuis l'annuaire, au lieu de l'UID brut
                                      label={getUserFullName(userId)}
                                      size="small"
                                      sx={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                    />
                                  ))}
                                </Box>
                              ) : (
                                <Chip label="Aucun utilisateur" color="default" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              )}
            </>
          ) : (
            <Typography>Aucun bloc trouvé pour ce mur.</Typography>
          )}
        </>
      ) : (
        <Typography>Sélectionnez un mur pour afficher les statistiques.</Typography>
      )}

      <Dialog
        open={openResetDialog}
        onClose={() => setOpenResetDialog(false)}
      >
        <DialogTitle>Réinitialiser les statistiques</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer toutes les statistiques pour le mur "{selectedWall}" ?
            Cette action est irréversible.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenResetDialog(false)}>Annuler</Button>
          <Button
            onClick={handleResetStats}
            color="error"
            variant="contained"
          >
            Réinitialiser
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}