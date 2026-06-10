import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  Container, Typography, Box, Paper, CircularProgress,
  Alert, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow
} from '@mui/material';

const ClientStats: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [boulderStats, setBoulderStats] = useState<any[]>([]);
  const [courseStats, setCourseStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || loadingAuth) return;
    const fetchStats = async () => {
      try {
        setLoading(true);

        // Statistiques des blocs
        const boulderResultsSnapshot = await getDocs(
          query(collection(db, 'client_boulder_results'), where('userId', '==', user.uid))
        );
        const boulderStatsData = boulderResultsSnapshot.docs.map(doc => doc.data());
        setBoulderStats(boulderStatsData);

        // Statistiques des cours
        const courseResultsSnapshot = await getDocs(
          query(collection(db, 'client_course_results'), where('userId', '==', user.uid))
        );
        const courseStatsData = courseResultsSnapshot.docs.map(doc => doc.data());
        setCourseStats(courseStatsData);
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [user, loadingAuth]);

  if (loadingAuth || loading) return <Container maxWidth="lg"><Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box></Container>;
  if (!user) return null;

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>Mes statistiques</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="h6">Blocs</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Bloc</TableCell>
                  <TableCell>Réussi</TableCell>
                  <TableCell>Note</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {boulderStats.map((stat, index) => (
                  <TableRow key={index}>
                    <TableCell>{stat.boulderId}</TableCell>
                    <TableCell>{stat.success ? '✅' : '❌'}</TableCell>
                    <TableCell>{stat.rating || 'Non noté'}</TableCell>
                    <TableCell>{new Date(stat.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="h6">Cours</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Exercice</TableCell>
                  <TableCell>Réussi</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {courseStats.map((stat, index) => (
                  <TableRow key={index}>
                    <TableCell>{stat.exerciseId}</TableCell>
                    <TableCell>{stat.success ? '✅' : '❌'}</TableCell>
                    <TableCell>{new Date(stat.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Container>
  );
};

export default ClientStats;