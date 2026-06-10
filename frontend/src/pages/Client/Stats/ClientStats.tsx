import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  DocumentData
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Paper,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel
} from '@mui/material';

// Couleurs des niveaux
const levelColors: Record<string, string> = {
  jaune: '#FFFF00',
  vert: '#00FF00',
  bleu: '#0000FF',
  violet: '#800080',
  rouge: '#FF0000',
  noir: '#000000',
  blanc: '#FFFFFF',
  rose: '#FFC0CB',
};

interface BoulderData extends DocumentData {
  number?: number;
  wall?: string;
  difficulty?: string;
  difficulty_level?: string;
  difficulty_types?: string[];
  created_at?: string;
  color?: string;
}

interface CourseData extends DocumentData {
  title?: string;
  date?: string;
}

const ClientStats: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [boulderStats, setBoulderStats] = useState<any[]>([]);
  const [courseStats, setCourseStats] = useState<any[]>([]);
  const [colorStats, setColorStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openResetDialog, setOpenResetDialog] = useState(false);

  // États pour les statistiques par période
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('week');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchStats = async () => {
      try {
        setLoading(true);

        // Calculer les dates en fonction de la période sélectionnée
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
              endDateFilter.setDate(endDateFilter.getDate() + 1); // Inclure la date de fin
            }
            break;
        }

        // Requête pour client_boulder_results
        const boulderResultsSnapshot = await getDocs(
          query(collection(db, 'client_boulder_results'), where('userId', '==', user.uid))
        );

        const boulderStatsData: any[] = [];
        const colorCounts: Record<string, number> = {};

        for (const resultDoc of boulderResultsSnapshot.docs) {
          const result = resultDoc.data();
          const resultDate = new Date(result.createdAt);

          // Filtrer par période
          if (startDateFilter && resultDate < startDateFilter) continue;
          if (endDateFilter && resultDate >= endDateFilter) continue;

          const boulderDoc = await getDoc(doc(db, 'boulders', result.boulderId));
          if (boulderDoc.exists()) {
            const boulderData = boulderDoc.data() as BoulderData;
            const color = boulderData.color || boulderData.difficulty || 'Inconnu';

            boulderStatsData.push({
              ...result,
              boulderNumber: boulderData.number || result.boulderId,
              wall: boulderData.wall || 'Inconnu',
              difficulty: boulderData.difficulty || boulderData.color || 'Inconnu',
              difficulty_level: boulderData.difficulty_level || 'Inconnu',
              difficulty_type: boulderData.difficulty_types ? boulderData.difficulty_types[0] : 'Inconnu',
              created_at: boulderData.created_at || 'Inconnu',
              color: color
            });

            // Compter les blocs validés par couleur
            if (result.success === true) {
              colorCounts[color] = (colorCounts[color] || 0) + 1;
            }
          }
        }
        setBoulderStats(boulderStatsData);
        setColorStats(colorCounts);

        // Requête pour client_course_results
        const courseResultsSnapshot = await getDocs(
          query(collection(db, 'client_course_results'), where('userId', '==', user.uid))
        );

        const courseStatsData: any[] = [];
        for (const resultDoc of courseResultsSnapshot.docs) {
          const result = resultDoc.data();
          const courseDoc = await getDoc(doc(db, 'courses', result.courseId));
          if (courseDoc.exists()) {
            const courseData = courseDoc.data() as CourseData;
            courseStatsData.push({
              ...result,
              courseTitle: courseData.title || result.courseId,
              courseDate: courseData.date || 'Inconnu'
            });
          }
        }
        setCourseStats(courseStatsData);
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user, loadingAuth, period, startDate, endDate]);

  // Réinitialiser les stats
  const handleResetStats = async () => {
    if (!user) return;
    try {
      setLoading(true);
      // Supprimer tous les résultats de blocs du client
      const boulderResultsSnapshot = await getDocs(
        query(collection(db, 'client_boulder_results'), where('userId', '==', user.uid))
      );
      for (const resultDoc of boulderResultsSnapshot.docs) {
        await deleteDoc(doc(db, 'client_boulder_results', resultDoc.id));
      }

      // Supprimer tous les résultats de cours du client
      const courseResultsSnapshot = await getDocs(
        query(collection(db, 'client_course_results'), where('userId', '==', user.uid))
      );
      for (const resultDoc of courseResultsSnapshot.docs) {
        await deleteDoc(doc(db, 'client_course_results', resultDoc.id));
      }

      setBoulderStats([]);
      setCourseStats([]);
      setColorStats({});
      setSuccess('Statistiques réinitialisées avec succès!');
      setOpenResetDialog(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
      setOpenResetDialog(false);
    } finally {
      setLoading(false);
    }
  };

  if (loadingAuth || loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!user) return null;

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ mt: 4 }}>Mes statistiques</Typography>
        <Button
          variant="outlined"
          color="error"
          onClick={() => setOpenResetDialog(true)}
          disabled={boulderStats.length === 0 && courseStats.length === 0}
        >
          Réinitialiser les stats
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {/* Sélecteur de période */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Filtrer par période:</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>Période</InputLabel>
            <Select
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
              {/* ✅ Correction : slotProps au lieu de InputLabelProps */}
              <TextField
                label="Date de début"
                type="date"
                slotProps={{ inputLabel: { shrink: true } }} // ✅ Syntaxe MUI v9
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                sx={{ minWidth: 150 }}
              />
              {/* ✅ Correction : slotProps au lieu de InputLabelProps */}
              <TextField
                label="Date de fin"
                type="date"
                slotProps={{ inputLabel: { shrink: true } }} // ✅ Syntaxe MUI v9
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                sx={{ minWidth: 150 }}
              />
            </>
          )}
        </Box>
      </Paper>

      {/* Statistiques par couleur */}
      {Object.keys(colorStats).length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Blocs validés par couleur:</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {Object.entries(colorStats).map(([color, count]) => (
              <Box key={color} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 20,
                  height: 20,
                  backgroundColor: levelColors[color] || '#CCCCCC',
                  borderRadius: '4px'
                }} />
                <Typography>{color}: {count}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        {/* Tableau des blocs */}
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="h6">Blocs</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Mur / N°</TableCell>
                  <TableCell>Niveau</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Réussi</TableCell>
                  <TableCell>Note</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {boulderStats.map((stat, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {stat.wall} / {stat.boulderNumber}
                    </TableCell>
                    <TableCell>
                      <Box sx={{
                        backgroundColor: levelColors[stat.difficulty] || '#CCCCCC',
                        color: ['noir', 'blanc'].includes(stat.difficulty) ? 'black' : 'white',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        {stat.difficulty_level}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {stat.difficulty_type && (
                        <Chip
                          label={stat.difficulty_type}
                          size="small"
                          sx={{ backgroundColor: 'rgba(0,0,0,0.1)' }}
                        />
                      )}
                    </TableCell>
                    <TableCell>{stat.success === true ? '✅' : '❌'}</TableCell>
                    <TableCell>{stat.rating || 'Non noté'}</TableCell>
                    <TableCell>{new Date(stat.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Tableau des cours */}
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="h6">Cours</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Cours</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Exercice</TableCell>
                  <TableCell>Réussi</TableCell>
                  <TableCell>Date validation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {courseStats.map((stat, index) => (
                  <TableRow key={index}>
                    <TableCell>{stat.courseTitle}</TableCell>
                    <TableCell>{stat.courseDate}</TableCell>
                    <TableCell>{stat.exerciseId}</TableCell>
                    <TableCell>{stat.success === true ? '✅' : '❌'}</TableCell>
                    <TableCell>{new Date(stat.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* Dialogue de confirmation pour la réinitialisation */}
      <Dialog
        open={openResetDialog}
        onClose={() => setOpenResetDialog(false)}
      >
        <DialogTitle>Réinitialiser les statistiques</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer toutes vos statistiques (blocs et cours) ?
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
    </Container>
  );
};

export default ClientStats;