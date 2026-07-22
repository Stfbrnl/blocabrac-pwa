import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection, query, where, getDocs
} from 'firebase/firestore';
import {
  Container, Typography, Paper, Box, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip,
  FormControl, InputLabel, Select, MenuItem, CircularProgress
} from '@mui/material';

const levelColors: Record<string, string> = {
  jaune: '#FFFF00', vert: '#00FF00', bleu: '#0000FF', violet: '#800080',
  rouge: '#FF0000', noir: '#000000', blanc: '#FFFFFF', rose: '#FFC0CB'
};

interface Competition {
  id: string;
  name: string;
  date: string;
}

interface CompetitionResult {
  id: string;
  competition_id: string;
  boulder_id: string;
  success: boolean;
  attempts: number;
  rating: number;
  proposed_difficulty: string;
  createdAt?: string;
}

interface Boulder {
  id: string;
  difficulty: string;
  number?: number;
  wall?: string;
}

const ClientCompetitionStats: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'competition_participants'),
          where('user_id', '==', user.uid)
        );
        const snapshot = await getDocs(q);
        const participantData = snapshot.docs.map(doc => ({
          competition_id: doc.data().competition_id,
          ...doc.data()
        }));

        const competitionIds = participantData.map(p => p.competition_id);
        if (competitionIds.length === 0) {
          setLoading(false);
          return;
        }

        const competitionsSnapshot = await getDocs(
          query(collection(db, 'competitions'), where('__name__', 'in', competitionIds))
        );
        const competitionsData: Competition[] = competitionsSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          date: doc.data().date || ''
        }));
        setCompetitions(competitionsData);
      } catch (err: unknown) {
        console.error("Erreur:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompetitions();
  }, [user, loadingAuth]);

  useEffect(() => {
    if (!selectedCompetition || !user) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const resultsQuery = query(
          collection(db, 'competition_results'),
          where('competition_id', '==', selectedCompetition),
          where('user_id', '==', user.uid)
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        const resultsData: CompetitionResult[] = resultsSnapshot.docs.map(doc => ({
          id: doc.id,
          competition_id: doc.data().competition_id || '',
          boulder_id: doc.data().boulder_id || '',
          success: doc.data().success || false,
          attempts: doc.data().attempts || 0,
          rating: doc.data().rating || 0,
          proposed_difficulty: doc.data().proposed_difficulty || '',
          createdAt: doc.data().createdAt || doc.data().created_at
        }));
        setResults(resultsData);

        const bouldersQuery = query(
          collection(db, 'boulders'),
          where('competition_id', '==', selectedCompetition)
        );
        const bouldersSnapshot = await getDocs(bouldersQuery);
        const bouldersData: Boulder[] = bouldersSnapshot.docs.map(doc => ({
          id: doc.id,
          difficulty: doc.data().difficulty || '',
          number: doc.data().number,
          wall: doc.data().wall
        }));
        setBoulders(bouldersData);
      } catch (err: unknown) {
        console.error("Erreur:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedCompetition, user]);

  const getSuccessRate = (): number => {
    if (results.length === 0) return 0;
    const successCount = results.filter(r => r.success).length;
    return (successCount / results.length) * 100;
  };

  const getAverageRating = (): number => {
    if (results.length === 0) return 0;
    const total = results.reduce((sum, r) => sum + r.rating, 0);
    return total / results.length;
  };

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>Mes statistiques de compétition</Typography>

      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel id="selectionnez-une-competition-select-label">Sélectionnez une compétition</InputLabel>
        <Select
          labelId="selectionnez-une-competition-select-label" id="selectionnez-une-competition-select"
          value={selectedCompetition}
          onChange={(e) => setSelectedCompetition(e.target.value)}
          label="Compétition"
        >
          {competitions.map(comp => (
            <MenuItem key={comp.id} value={comp.id}>
              {comp.name} - {new Date(comp.date).toLocaleDateString()}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : selectedCompetition ? (
        <>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6">Résumé</Typography>
            <Typography>Taux de réussite: {getSuccessRate().toFixed(1)}%</Typography>
            <Typography>Note moyenne: {getAverageRating().toFixed(2)}/5</Typography>
            <Typography>Blocs tentés: {results.length}/{boulders.length}</Typography>
          </Paper>

          {/* ✅ Scroll horizontal de secours pour ce tableau à 5 colonnes sur mobile */}
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: 500 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Bloc n°</TableCell>
                  <TableCell>Réussi</TableCell>
                  <TableCell>Essais</TableCell>
                  <TableCell>Note</TableCell>
                  <TableCell>Cotation proposée</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map(result => {
                  const boulder = boulders.find(b => b.id === result.boulder_id);
                  return (
                    <TableRow key={result.id}>
                      <TableCell>{boulder ? `Bloc n°${boulder.number}` : 'Inconnu'}</TableCell>
                      <TableCell>{result.success ? '✅' : '❌'}</TableCell>
                      <TableCell>{result.attempts}</TableCell>
                      <TableCell>{result.rating}/5</TableCell>
                      <TableCell>
                        <Chip
                          label={result.proposed_difficulty}
                          sx={{
                            backgroundColor: levelColors[result.proposed_difficulty] || '#CCCCCC',
                            color: result.proposed_difficulty === 'blanc' ? 'black' : 'white'
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : (
        <Typography>Sélectionnez une compétition pour voir vos statistiques.</Typography>
      )}
    </Container>
  );
};

export default ClientCompetitionStats;