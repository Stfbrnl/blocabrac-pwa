import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  LinearProgress,
  Alert,
  CircularProgress,
  Divider
} from '@mui/material';
import { db } from '../services/firebaseConfig';
import {
  collection,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../services/firebaseConfig';

// ✅ Types alignés avec AdminCompetitionManagement.tsx
type CompetitionStatus = 'en cours' | 'terminée' | 'à venir' | 'supprimée';

interface Competition {
  id: string;
  name: string;
  date: string;
  status: CompetitionStatus;
  boulders: string[];
  access_code?: string;
}

interface Participant {
  id: string;
  competition_id: string;
  user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  age?: number;
  gender?: string;
  level?: string;
}

interface CompetitionResult {
  id: string;
  competition_id: string;
  participant_id: string;
  boulder_id: string;
  success: boolean;
  attempts: number;
  rating: number;
}

interface Boulder {
  id: string;
  name: string;
  level: string;
}

const AdminCompetitionStats: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('tous');
  const [error, setError] = useState<string | null>(null);

  // Récupérer les compétitions terminées
  const fetchCompetitions = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'competitions'),
        where('status', '==', 'terminée')
      );
      const querySnapshot = await getDocs(q);
      const competitionsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Competition[];
      setCompetitions(competitionsData);
    } catch (err) {
      console.error('Erreur : ', err);
      setError('Erreur lors de la récupération des compétitions.');
    } finally {
      setLoading(false);
    }
  };

  // Récupérer les données pour une compétition
  const fetchCompetitionData = async (competitionId: string) => {
    try {
      setLoading(true);
      // 1. Récupérer les participants
      const participantsQuery = query(
        collection(db, 'competition_participants'),
        where('competition_id', '==', competitionId)
      );
      const participantsSnapshot = await getDocs(participantsQuery);
      const participantsData = participantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Participant[];
      setParticipants(participantsData);

      // 2. Récupérer les résultats
      const resultsQuery = query(
        collection(db, 'competition_results'),
        where('competition_id', '==', competitionId)
      );
      const resultsSnapshot = await getDocs(resultsQuery);
      const resultsData = resultsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as CompetitionResult[];
      setResults(resultsData);

      // 3. Récupérer les blocs de la compétition
      if (selectedCompetition?.boulders && selectedCompetition.boulders.length > 0) {
        const bouldersQuery = query(
          collection(db, 'boulders'),
          where('id', 'in', selectedCompetition.boulders)
        );
        const bouldersSnapshot = await getDocs(bouldersQuery);
        const bouldersData = bouldersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Boulder[];
        setBoulders(bouldersData);
      }
    } catch (err) {
      console.error('Erreur : ', err);
      setError('Erreur lors de la récupération des données.');
    } finally {
      setLoading(false);
    }
  };

  // Calculer le classement général
  const getGeneralRanking = () => {
    const userStats: Record<string, {
      participant_id: string;
      user_id: string | null;
      email: string;
      first_name: string;
      last_name: string;
      totalSuccess: number;
      totalAttempts: number;
      averageRating: number;
      age?: number;
      gender?: string;
      level?: string;
    }> = {};

    results.forEach(result => {
      const participant = participants.find(p => p.id === result.participant_id);
      if (!participant) return;

      if (!userStats[result.participant_id]) {
        userStats[result.participant_id] = {
          participant_id: result.participant_id,
          user_id: participant.user_id,
          email: participant.email,
          first_name: participant.first_name,
          last_name: participant.last_name,
          totalSuccess: 0,
          totalAttempts: 0,
          averageRating: 0,
          age: participant.age,
          gender: participant.gender,
          level: participant.level,
        };
      }
      if (result.success) {
        userStats[result.participant_id].totalSuccess += 1;
        userStats[result.participant_id].totalAttempts += result.attempts;
      }
      userStats[result.participant_id].averageRating += result.rating;
    });

    return Object.values(userStats)
      .map(stat => ({
        ...stat,
        averageAttempts: stat.totalSuccess > 0 ? stat.totalAttempts / stat.totalSuccess : 0,
        averageRating: stat.totalSuccess > 0 ? stat.averageRating / selectedCompetition!.boulders.length : 0,
      }))
      .sort((a, b) => b.totalSuccess - a.totalSuccess || a.averageAttempts - b.averageAttempts);
  };

  // Filtrer le classement par catégorie
  const getFilteredRanking = () => {
    const ranking = getGeneralRanking();
    if (categoryFilter === 'tous') return ranking;

    return ranking.filter(user => {
      if (categoryFilter === 'Homme' || categoryFilter === 'Femme' || categoryFilter === 'Autre') {
        return user.gender === categoryFilter;
      }
      if (categoryFilter === '-18 ans') return (user.age || 0) < 18;
      if (categoryFilter === '18-35 ans') return (user.age || 0) >= 18 && (user.age || 0) <= 35;
      if (categoryFilter === '35-50 ans') return (user.age || 0) > 35 && (user.age || 0) <= 50;
      if (categoryFilter === '50+ ans') return (user.age || 0) > 50;
      if (user.level === categoryFilter) {
        return true;
      }
      return false;
    });
  };

  // Calculer les stats des blocs
  const getBoulderStats = () => {
    const boulderStats: Record<string, {
      boulder_id: string;
      name: string;
      level: string;
      successCount: number;
      totalAttempts: number;
      averageRating: number;
      participants: number;
    }> = {};

    selectedCompetition?.boulders.forEach(boulderId => {
      const boulderResults = results.filter(r => r.boulder_id === boulderId);
      const successCount = boulderResults.filter(r => r.success).length;
      const totalAttempts = boulderResults.reduce((sum, r) => sum + r.attempts, 0);
      const averageRating = boulderResults.length > 0
        ? boulderResults.reduce((sum, r) => sum + r.rating, 0) / boulderResults.length
        : 0;

      const boulder = boulders.find(b => b.id === boulderId);
      boulderStats[boulderId] = {
        boulder_id: boulderId,
        name: boulder?.name || boulderId,
        level: boulder?.level || 'Inconnu',
        successCount,
        totalAttempts,
        averageRating,
        participants: boulderResults.length,
      };
    });

    return Object.values(boulderStats)
      .sort((a, b) => b.averageRating - a.averageRating);
  };

  const handleCompetitionChange = (competition: Competition) => {
    setSelectedCompetition(competition);
    fetchCompetitionData(competition.id);
  };

  // Catégories disponibles
  const ageCategories = ['-18 ans', '18-35 ans', '35-50 ans', '50+ ans'];
  const genderCategories = ['Homme', 'Femme', 'Autre'];
  const levelCategories = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];

  useEffect(() => {
    if (user) {
      fetchCompetitions();
    }
  }, [user]);

  if (loadingAuth || loading) {
    return <LinearProgress />;
  }

  return (
    <Box sx={{ mt: 2, p: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Statistiques des Compétitions</Typography>
      </Box>

      <FormControl sx={{ minWidth: 300, mb: 2 }}>
        <InputLabel>Compétition</InputLabel>
        <Select
          value={selectedCompetition?.id || ''}
          onChange={(e) => {
            const competition = competitions.find(c => c.id === e.target.value);
            if (competition) handleCompetitionChange(competition);
          }}
          label="Compétition"
        >
          <MenuItem value="">-- Sélectionnez une compétition --</MenuItem>
          {competitions.map((competition) => (
            <MenuItem key={competition.id} value={competition.id}>
              {competition.name} ({competition.date})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {selectedCompetition && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1">
              {selectedCompetition.name} - {selectedCompetition.date}
            </Typography>
            <Typography variant="body2">
              Statut: {selectedCompetition.status} | Blocs: {selectedCompetition.boulders.length} |
              Participants: {participants.length}
            </Typography>
          </Paper>

          <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
            <Tab label="Classement général" />
            <Tab label="Classement par catégorie" />
            <Tab label="Stats des blocs" />
          </Tabs>

          {activeTab === 0 && (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Nom</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Blocs réussis</TableCell>
                    <TableCell>Moyenne d'essais</TableCell>
                    <TableCell>Note moyenne</TableCell>
                    <TableCell>Niveau</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getGeneralRanking().length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ textAlign: 'center' }}>
                        Aucun résultat trouvé.
                      </TableCell>
                    </TableRow>
                  ) : (
                    getGeneralRanking().map((ranking, index) => (
                      <TableRow key={ranking.participant_id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{ranking.first_name} {ranking.last_name}</TableCell>
                        <TableCell>{ranking.email}</TableCell>
                        <TableCell>{ranking.totalSuccess}</TableCell>
                        <TableCell>{ranking.averageAttempts.toFixed(2)}</TableCell>
                        <TableCell>
                          <Chip
                            label={ranking.averageRating.toFixed(1)}
                            size="small"
                            color={
                              ranking.averageRating >= 4 ? 'success' :
                              ranking.averageRating >= 3 ? 'primary' : 'default'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={ranking.level || 'Non renseigné'}
                            size="small"
                            color={
                              ranking.level === 'jaune' ? 'warning' :
                              ranking.level === 'vert' ? 'success' :
                              ranking.level === 'bleu' ? 'primary' :
                              ranking.level === 'violet' ? 'secondary' :
                              ranking.level === 'rouge' ? 'error' :
                              ranking.level === 'noir' ? 'default' :
                              ranking.level === 'blanc' ? 'info' : 'default'
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {activeTab === 1 && (
            <Box sx={{ mt: 2 }}>
              <FormControl sx={{ minWidth: 200, mb: 2 }}>
                <InputLabel>Catégorie</InputLabel>
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  label="Catégorie"
                >
                  <MenuItem value="tous">Toutes les catégories</MenuItem>
                  <Divider />
                  <MenuItem disabled>
                    <em>Âge</em>
                  </MenuItem>
                  {ageCategories.map(category => (
                    <MenuItem key={category} value={category}>{category}</MenuItem>
                  ))}
                  <Divider />
                  <MenuItem disabled>
                    <em>Genre</em>
                  </MenuItem>
                  {genderCategories.map(category => (
                    <MenuItem key={category} value={category}>{category}</MenuItem>
                  ))}
                  <Divider />
                  <MenuItem disabled>
                    <em>Niveau</em>
                  </MenuItem>
                  {levelCategories.map(category => (
                    <MenuItem key={category} value={category}>{category}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Nom</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Blocs réussis</TableCell>
                      <TableCell>Moyenne d'essais</TableCell>
                      <TableCell>Niveau</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {getFilteredRanking().length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ textAlign: 'center' }}>
                          Aucun résultat trouvé pour cette catégorie.
                        </TableCell>
                      </TableRow>
                    ) : (
                      getFilteredRanking().map((ranking, index) => (
                        <TableRow key={ranking.participant_id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{ranking.first_name} {ranking.last_name}</TableCell>
                          <TableCell>{ranking.email}</TableCell>
                          <TableCell>{ranking.totalSuccess}</TableCell>
                          <TableCell>{ranking.averageAttempts.toFixed(2)}</TableCell>
                          <TableCell>
                            <Chip
                              label={ranking.level || 'Non renseigné'}
                              size="small"
                              color={
                                ranking.level === 'jaune' ? 'warning' :
                                ranking.level === 'vert' ? 'success' :
                                ranking.level === 'bleu' ? 'primary' :
                                ranking.level === 'violet' ? 'secondary' :
                                ranking.level === 'rouge' ? 'error' :
                                ranking.level === 'noir' ? 'default' :
                                ranking.level === 'blanc' ? 'info' : 'default'
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {activeTab === 2 && (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Bloc</TableCell>
                    <TableCell>Niveau</TableCell>
                    <TableCell>Taux de réussite</TableCell>
                    <TableCell>Moyenne d'essais</TableCell>
                    <TableCell>Note moyenne</TableCell>
                    <TableCell>Participants</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getBoulderStats().length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ textAlign: 'center' }}>
                        Aucun résultat trouvé pour les blocs.
                      </TableCell>
                    </TableRow>
                  ) : (
                    getBoulderStats().map((stat) => (
                      <TableRow key={stat.boulder_id}>
                        <TableCell>{stat.name}</TableCell>
                        <TableCell>
                          <Chip
                            label={stat.level}
                            size="small"
                            color={
                              stat.level === 'jaune' ? 'warning' :
                              stat.level === 'vert' ? 'success' :
                              stat.level === 'bleu' ? 'primary' :
                              stat.level === 'violet' ? 'secondary' :
                              stat.level === 'rouge' ? 'error' :
                              stat.level === 'noir' ? 'default' :
                              stat.level === 'blanc' ? 'info' : 'default'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {stat.participants > 0
                            ? `${((stat.successCount / stat.participants) * 100).toFixed(0)}%`
                            : '0%'}
                        </TableCell>
                        <TableCell>
                          {stat.participants > 0 && stat.successCount > 0
                            ? (stat.totalAttempts / stat.successCount).toFixed(2)
                            : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={stat.averageRating.toFixed(1)}
                            size="small"
                            color={
                              stat.averageRating >= 4 ? 'success' :
                              stat.averageRating >= 3 ? 'primary' : 'default'
                            }
                          />
                        </TableCell>
                        <TableCell>{stat.participants}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
};

export default AdminCompetitionStats;