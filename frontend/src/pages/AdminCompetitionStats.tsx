import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Box, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Chip
} from '@mui/material';
import { collection, query, where, getDocs, DocumentData } from 'firebase/firestore';

// ✅ Chemin ABSOLU pour éviter les problèmes de résolution de module
// Remplacez par le chemin exact si différent :
import { db } from '/workspaces/blocabrac-pwa/frontend/src/services/firebaseConfig';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// ✅ Interfaces complètes
interface Competition {
  id: string;
  name: string;
  date: string;
  status: string;
  walls: string[];
}

interface CompetitionParticipant {
  id: string;
  user_id: string;
  competition_id: string;
  email: string;
  first_name: string;
  last_name: string;
  category?: string;
  registration_date: string;
}

interface CompetitionResult {
  id: string;
  user_id: string;
  competition_id: string;
  boulder_id: string;
  success: boolean;
  attempts: number;
  rating?: number;
}

interface Boulder {
  id: string;
  name?: string;
  level?: string;
  wall?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#A4DE6C'];

export default function AdminCompetitionStats(): JSX.Element {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [participants, setParticipants] = useState<CompetitionParticipant[]>([]);
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchCompetitions = async (): Promise<void> => {
      try {
        setLoading(true);
        const q = query(collection(db, 'competitions'));
        const snapshot = await getDocs(q);
        const competitionsData: Competition[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Competition[];
        setCompetitions(competitionsData);
      } catch (error: unknown) {
        console.error('Erreur lors du chargement des compétitions :', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCompetitions();
  }, []);

  useEffect(() => {
    if (!selectedCompetition) {
      setParticipants([]);
      setResults([]);
      setBoulders([]);
      return;
    }

    const fetchStats = async (): Promise<void> => {
      try {
        setLoading(true);

        const participantsQuery = query(
          collection(db, 'competition_participants'),
          where('competition_id', '==', selectedCompetition)
        );
        const participantsSnapshot = await getDocs(participantsQuery);
        const participantsData: CompetitionParticipant[] = participantsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CompetitionParticipant[];
        setParticipants(participantsData);

        const resultsQuery = query(
          collection(db, 'competition_results'),
          where('competition_id', '==', selectedCompetition)
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        const resultsData: CompetitionResult[] = resultsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CompetitionResult[];
        setResults(resultsData);

        const bouldersQuery = query(
          collection(db, 'boulders'),
          where('competition_id', '==', selectedCompetition)
        );
        const bouldersSnapshot = await getDocs(bouldersQuery);
        const bouldersData: Boulder[] = bouldersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Boulder[];
        setBoulders(bouldersData);

      } catch (error: unknown) {
        console.error('Erreur lors du chargement des statistiques :', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedCompetition]);

  const getParticipantsByCategory = (): { name: string; value: number }[] => {
    const categoryCounts: Record<string, number> = {};
    participants.forEach((p: CompetitionParticipant) => {
      const category = p.category || 'Non spécifiée';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    return Object.entries(categoryCounts).map(([name, value]) => ({ name, value }));
  };

  const getBoulderSuccessRates = (): { name: string; successRate: number; totalAttempts: number }[] => {
    const boulderStats: Record<string, { success: number; attempts: number }> = {};

    results.forEach((result: CompetitionResult) => {
      const boulderId = result.boulder_id;
      if (!boulderStats[boulderId]) {
        boulderStats[boulderId] = { success: 0, attempts: 0 };
      }
      boulderStats[boulderId].success += result.success ? 1 : 0;
      boulderStats[boulderId].attempts += result.attempts;
    });

    return boulders.map((boulder: Boulder) => {
      const stats = boulderStats[boulder.id] || { success: 0, attempts: 0 };
      const successRate = stats.attempts > 0 ? (stats.success / stats.attempts) * 100 : 0;
      return {
        name: `Bloc ${boulder.level || boulder.name || boulder.id}`,
        successRate: parseFloat(successRate.toFixed(1)),
        totalAttempts: stats.attempts
      };
    });
  };

  const getTopParticipants = (): { name: string; successRate: number; totalBoulders: number }[] => {
    const participantStats: Record<string, { success: number; total: number }> = {};

    results.forEach((result: CompetitionResult) => {
      const participant = participants.find(p => p.user_id === result.user_id);
      if (!participant) return;

      const key = `${participant.first_name} ${participant.last_name}`;
      if (!participantStats[key]) {
        participantStats[key] = { success: 0, total: 0 };
      }
      participantStats[key].success += result.success ? 1 : 0;
      participantStats[key].total += 1;
    });

    return Object.entries(participantStats)
      .map(([name, stats]) => ({
        name,
        successRate: (stats.success / stats.total) * 100,
        totalBoulders: stats.total
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);
  };

  // ✅ Composant Tooltip personnalisé pour contourner les problèmes de typage Recharts
  const CustomTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const value = payload[0].value;
    const numericValue = typeof value === 'number' ? value : 0;
    return (
      <Paper sx={{ p: 1, border: '1px solid #ddd' }}>
        <Typography variant="body2">{`${numericValue.toFixed(1)}%`}</Typography>
        <Typography variant="caption">Taux de réussite</Typography>
      </Paper>
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Statistiques des Compétitions
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

      {loading ? (
        <LinearProgress />
      ) : selectedCompetition ? (
        <>
          {participants.length > 0 ? (
            <>
              <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Répartition des participants par catégorie ({participants.length} participants)
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={getParticipantsByCategory()}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent = 0 }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {getParticipantsByCategory().map((entry: { name: string; value: number }, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

              <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Taux de réussite par bloc
                </Typography>
                <Box sx={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getBoulderSuccessRates()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="successRate" fill="#8884d8" name="Taux de réussite (%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

              <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Top 5 des participants
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Participant</TableCell>
                        <TableCell>Taux de réussite</TableCell>
                        <TableCell>Blocs tentés</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getTopParticipants().map((participant: { name: string; successRate: number; totalBoulders: number }, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{participant.name}</TableCell>
                          <TableCell>
                            <Chip
                              label={`${participant.successRate.toFixed(1)}%`}
                              color={participant.successRate >= 80 ? 'success' : participant.successRate >= 50 ? 'primary' : 'error'}
                            />
                          </TableCell>
                          <TableCell>{participant.totalBoulders}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Liste des participants ({participants.length})
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Nom</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Catégorie</TableCell>
                        <TableCell>Date d'inscription</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {participants.map((participant: CompetitionParticipant) => (
                        <TableRow key={participant.id}>
                          <TableCell>{participant.first_name} {participant.last_name}</TableCell>
                          <TableCell>{participant.email}</TableCell>
                          <TableCell>
                            <Chip
                              label={participant.category || 'Non spécifiée'}
                              color="primary"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>{new Date(participant.registration_date).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </>
          ) : (
            <Typography>Aucune donnée disponible pour cette compétition.</Typography>
          )}
        </>
      ) : (
        <Typography>Sélectionnez une compétition pour afficher les statistiques.</Typography>
      )}
    </Box>
  );
}