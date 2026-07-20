import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Box, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Chip, Collapse, IconButton, Tooltip
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon } from '@mui/icons-material';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';

const levelColors: Record<string, string> = {
  jaune: '#FFFF00', vert: '#00FF00', bleu: '#0000FF', violet: '#800080',
  rouge: '#FF0000', noir: '#000000', blanc: '#FFFFFF', rose: '#FFC0CB'
};

interface Competition {
  id: string;
  name: string;
  date: string;
}

interface Boulder {
  id: string;
  number: number;
  wall: string;
  difficulty: string;
  color?: string;
  competition_id?: string;
}

interface CompetitionResult {
  id: string;
  user_id: string;
  boulder_id: string;
  success: boolean;
  attempts: number;
  rating: number;
  user_name?: string;
}

interface User {
  uid: string;
  first_name: string;
  last_name: string;
  email: string;
}

const CompetitionBoulderStats: React.FC = () => {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBoulders, setExpandedBoulders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const usersData: User[] = snapshot.docs.map(doc => ({
          uid: doc.id,
          first_name: doc.data().first_name || '',
          last_name: doc.data().last_name || '',
          email: doc.data().email || ''
        }));
        setUsers(usersData);
      } catch (err: any) {
        console.error("Erreur:", err);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const snapshot = await getDocs(collection(db, 'competitions'));
        const competitionsData: Competition[] = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          date: doc.data().date || ''
        }));
        setCompetitions(competitionsData);
      } catch (err: any) {
        console.error("Erreur:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCompetitions();
  }, []);

  useEffect(() => {
    if (!selectedCompetition) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        const bouldersQuery = query(
          collection(db, 'boulders'),
          where('competition_id', '==', selectedCompetition),
          where('is_active', '==', true)
        );
        const bouldersSnapshot = await getDocs(bouldersQuery);
        const bouldersData: Boulder[] = bouldersSnapshot.docs.map(doc => ({
          id: doc.id,
          number: doc.data().number || 0,
          wall: doc.data().wall || '',
          difficulty: doc.data().difficulty || '',
          color: doc.data().color,
          competition_id: doc.data().competition_id
        }))
        .sort((a, b) => a.number - b.number);
        setBoulders(bouldersData);

        const resultsQuery = query(
          collection(db, 'competition_results'),
          where('competition_id', '==', selectedCompetition)
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        const resultsData: CompetitionResult[] = resultsSnapshot.docs.map(doc => {
          const user = users.find(u => u.uid === doc.data().user_id);
          return {
            id: doc.id,
            user_id: doc.data().user_id || '',
            boulder_id: doc.data().boulder_id || '',
            success: doc.data().success || false,
            attempts: doc.data().attempts || 0,
            rating: doc.data().rating || 0,
            user_name: user ? `${user.first_name} ${user.last_name}` : 'Inconnu'
          };
        });
        setResults(resultsData);
      } catch (err: any) {
        console.error("Erreur:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCompetition, users]);

  const toggleExpand = (boulderId: string) => {
    setExpandedBoulders(prev => ({
      ...prev,
      [boulderId]: !prev[boulderId]
    }));
  };

  const getBoulderStats = (boulderId: string) => {
    const boulderResults = results.filter(r => r.boulder_id === boulderId);
    const successResults = boulderResults.filter(r => r.success);
    const ratings = boulderResults.filter(r => r.success).map(r => r.rating);
    const attempts = boulderResults.filter(r => r.success).map(r => r.attempts);

    return {
      successCount: successResults.length,
      averageRating: ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : '0',
      averageAttempts: attempts.length > 0 ? (attempts.reduce((a, b) => a + b, 0) / attempts.length).toFixed(1) : '0',
      validations: successResults.map(r => ({
        user_name: r.user_name,
        attempts: r.attempts
      }))
    };
  };

  return (
    <Box sx={{ mt: 2 }}>
      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel id="selectionnez-une-competition-select-label" htmlFor="selectionnez-une-competition-select">Sélectionnez une compétition</InputLabel>
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
        <LinearProgress />
      ) : selectedCompetition ? (
        <>
          {boulders.length > 0 ? (
            // ✅ Scroll horizontal de secours pour ce tableau à 6 colonnes
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
              <Table sx={{ minWidth: 650 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Bloc n°</TableCell>
                    <TableCell>Mur</TableCell>
                    <TableCell>Note moyenne</TableCell>
                    <TableCell>Validations</TableCell>
                    <TableCell>Essais moyens</TableCell>
                    <TableCell>Détails</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {boulders.map((boulder) => {
                    const stats = getBoulderStats(boulder.id);
                    return (
                      <React.Fragment key={boulder.id}>
                        <TableRow>
                          <TableCell>Bloc {boulder.number}</TableCell>
                          <TableCell>{boulder.wall}</TableCell>
                          <TableCell>
                            {stats.averageRating !== '0' ? (
                              <Chip
                                label={stats.averageRating}
                                color={
                                  parseFloat(stats.averageRating) >= 4 ? 'success' :
                                  parseFloat(stats.averageRating) >= 3 ? 'primary' : 'error'
                                }
                              />
                            ) : (
                              'Aucune note'
                            )}
                          </TableCell>
                          <TableCell>{stats.successCount}</TableCell>
                          <TableCell>{stats.averageAttempts}</TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => toggleExpand(boulder.id)}
                            >
                              {expandedBoulders[boulder.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={6} style={{ padding: 0 }}>
                            <Collapse in={expandedBoulders[boulder.id] || false} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                                <Typography variant="subtitle2" gutterBottom>
                                  <strong>Validations ({stats.successCount}) :</strong>
                                </Typography>
                                {stats.validations.length > 0 ? (
                                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    {stats.validations.map((validation, index) => (
                                      <Chip
                                        key={index}
                                        label={`${validation.user_name} (${validation.attempts} essai${validation.attempts > 1 ? 's' : ''})`}
                                        size="small"
                                        variant="outlined"
                                      />
                                    ))}
                                  </Box>
                                ) : (
                                  <Typography variant="body2">Aucune validation</Typography>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography>Aucun bloc trouvé pour cette compétition.</Typography>
          )}
        </>
      ) : (
        <Typography>Sélectionnez une compétition pour afficher les statistiques.</Typography>
      )}
    </Box>
  );
};

export default CompetitionBoulderStats;