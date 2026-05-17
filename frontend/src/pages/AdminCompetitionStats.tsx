import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Box, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, Tab,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { db } from '../services/firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useLocation } from 'react-router-dom';

const levelMap: Record<string, number> = {
  'jaune': 3,
  'vert': 4,
  'bleu': 5,
  'violet': 6,
  'rouge': 7,
  'noire': 8,
  'blanc': 9,
  'rose': 10
};

type UserRole = 'admin' | 'ouvreur' | 'moniteur' | 'client';
type CompetitionStatus = 'à venir' | 'en cours' | 'terminée' | 'annulée';
type Level = 'jaune' | 'vert' | 'bleu' | 'violet' | 'rouge' | 'noire' | 'blanc' | 'rose';

interface User {
  uid: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  age?: number;
  gender?: string;
  level?: Level;
  created_at?: string;
}

interface Boulder {
  id: string;
  name: string;
  level: Level;
  type: string;
  competition_id: string;
  created_at: string;
  created_by: string;
}

interface Competition {
  id: string;
  name: string;
  date: string;
  status: CompetitionStatus;
  access_code: string;
  max_participants: number;
  registered_count: number;
}

interface CompetitionParticipant {
  id: string;
  user_id: string | null;
  competition_id: string;
  email: string;
  first_name: string;
  last_name: string;
  age?: number;
  gender?: string;
  level?: Level;
  registered_at: string;
  is_client: boolean;
}

interface CompetitionResult {
  id: string;
  competition_id: string;
  participant_id: string;
  boulder_id: string;
  success: boolean;
  attempts: number;
  rating: number;
  completed_at: string;
}

const AdminCompetitionStats: React.FC = () => {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [participantsStats, setParticipantsStats] = useState<any[]>([]);
  const [favoriteBlocs, setFavoriteBlocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const location = useLocation();

  const competitionId = new URLSearchParams(location.search).get('competitionId');

  useEffect(() => {
    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const querySnapshot = await getDocs(collection(db, 'competitions'));
        const competitionsData: Competition[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          date: doc.data().date || '',
          status: doc.data().status || 'à venir',
          access_code: doc.data().access_code || '',
          max_participants: doc.data().max_participants || 50,
          registered_count: doc.data().registered_count || 0
        }));
        setCompetitions(competitionsData);

        if (competitionId) {
          const selectedComp = competitionsData.find(c => c.id === competitionId) || null;
          setSelectedCompetition(selectedComp);
        } else if (competitionsData.length > 0) {
          setSelectedCompetition(competitionsData[0]);
        }
      } catch (error) {
        console.error("Erreur :", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCompetitions();
  }, [competitionId, location.search]);

  useEffect(() => {
    if (!selectedCompetition) return;
    const fetchStats = async () => {
      try {
        setLoading(true);

        const participantsSnapshot = await getDocs(
          query(collection(db, 'competition_participants'), where('competition_id', '==', selectedCompetition.id))
        );
        const participants: CompetitionParticipant[] = participantsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        const resultsSnapshot = await getDocs(
          query(collection(db, 'competition_results'), where('competition_id', '==', selectedCompetition.id))
        );
        const results: CompetitionResult[] = resultsSnapshot.docs.map(doc => ({
          id: doc.id,
          competition_id: doc.data().competition_id || '',
          participant_id: doc.data().participant_id || '',
          boulder_id: doc.data().boulder_id || '',
          success: doc.data().success || false,
          attempts: doc.data().attempts || 0,
          rating: doc.data().rating || 0,
          completed_at: doc.data().completed_at || ''
        }));

        const bouldersSnapshot = await getDocs(
          query(collection(db, 'boulders'), where('competition_id', '==', selectedCompetition.id))
        );
        const boulders: Boulder[] = bouldersSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          level: doc.data().level || '',
          type: doc.data().type || '',
          competition_id: doc.data().competition_id || '',
          created_at: doc.data().created_at || '',
          created_by: doc.data().created_by || ''
        }));

        const statsByParticipant: Record<string, {
          participant: CompetitionParticipant;
          successfulBlocs: number;
          totalLevel: number;
          attemptsOnHardestBloc: number;
          hardestBlocLevel: number;
          blocRatings: number[];
        }> = {};

        results.forEach(result => {
          if (!statsByParticipant[result.participant_id]) {
            const participant = participants.find(p => p.id === result.participant_id);
            if (!participant) return;

            statsByParticipant[result.participant_id] = {
              participant,
              successfulBlocs: 0,
              totalLevel: 0,
              attemptsOnHardestBloc: Infinity,
              hardestBlocLevel: 0,
              blocRatings: []
            };
          }

          const bloc = boulders.find(b => b.id === result.boulder_id);
          if (bloc && result.success) {
            const level = levelMap[bloc.level] || 0;
            statsByParticipant[result.participant_id].successfulBlocs += 1;
            statsByParticipant[result.participant_id].totalLevel += level;
            statsByParticipant[result.participant_id].blocRatings.push(result.rating || 0);

            if (level > statsByParticipant[result.participant_id].hardestBlocLevel) {
              statsByParticipant[result.participant_id].hardestBlocLevel = level;
              statsByParticipant[result.participant_id].attemptsOnHardestBloc = result.attempts;
            } else if (level === statsByParticipant[result.participant_id].hardestBlocLevel) {
              if (result.attempts < statsByParticipant[result.participant_id].attemptsOnHardestBloc) {
                statsByParticipant[result.participant_id].attemptsOnHardestBloc = result.attempts;
              }
            }
          }
        });

        const participantsArray = Object.entries(statsByParticipant).map(([participantId, stats]) => ({
          participantId,
          participant: stats.participant,
          successfulBlocs: stats.successfulBlocs,
          totalLevel: stats.totalLevel,
          attemptsOnHardestBloc: stats.attemptsOnHardestBloc,
          averageRating: stats.blocRatings.length > 0
            ? stats.blocRatings.reduce((a, b) => a + b, 0) / stats.blocRatings.length
            : 0
        }));

        participantsArray.sort((a, b) => {
          if (b.successfulBlocs !== a.successfulBlocs) {
            return b.successfulBlocs - a.successfulBlocs;
          }
          if (b.totalLevel !== a.totalLevel) {
            return b.totalLevel - a.totalLevel;
          }
          return a.attemptsOnHardestBloc - b.attemptsOnHardestBloc;
        });

        setParticipantsStats(participantsArray);

        const blocRatings: Record<string, { total: number; count: number }> = {};
        results.forEach(result => {
          if (result.rating) {
            if (!blocRatings[result.boulder_id]) {
              blocRatings[result.boulder_id] = { total: 0, count: 0 };
            }
            blocRatings[result.boulder_id].total += result.rating;
            blocRatings[result.boulder_id].count += 1;
          }
        });

        const favoriteBlocsArray = Object.entries(blocRatings).map(([boulderId, data]) => {
          const bloc = boulders.find(b => b.id === boulderId);
          return {
            boulderId,
            name: bloc?.name || 'Inconnu',
            level: bloc?.level || 'Inconnu',
            averageRating: data.total / data.count
          };
        }).sort((a, b) => b.averageRating - a.averageRating);

        setFavoriteBlocs(favoriteBlocsArray);
        setLoading(false);
      } catch (error) {
        console.error("Erreur :", error);
        setLoading(false);
      }
    };
    fetchStats();
  }, [selectedCompetition]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  if (loading && !participantsStats.length) {
    return <Typography>Chargement des statistiques...</Typography>;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Statistiques des Compétitions
        </Typography>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Sélectionnez une compétition</InputLabel>
          <Select
            value={selectedCompetition?.id || ''}
            onChange={(e) => {
              const selectedComp = competitions.find(c => c.id === e.target.value);
              setSelectedCompetition(selectedComp || null); // ✅ Correction : || null
            }}
            label="Sélectionnez une compétition"
          >
            {competitions.map(comp => (
              <MenuItem key={comp.id} value={comp.id}>
                {comp.name} - {new Date(comp.date).toLocaleDateString()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedCompetition && (
          <>
            <Tabs value={activeTab} onChange={handleTabChange}>
              <Tab label="Classement des Grimpeurs" />
              <Tab label="Blocs Préférés" />
            </Tabs>

            {activeTab === 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Classement des Grimpeurs
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Nom</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Niveau</TableCell>
                        <TableCell>Blocs Réussis</TableCell>
                        <TableCell>Niveau Total</TableCell>
                        <TableCell>Essais sur Bloc le Plus Dur</TableCell>
                        <TableCell>Note Moyenne</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {participantsStats.map(stat => (
                        <TableRow key={stat.participantId}>
                          <TableCell>
                            {stat.participant.first_name} {stat.participant.last_name}
                          </TableCell>
                          <TableCell>{stat.participant.email}</TableCell>
                          <TableCell>{stat.participant.level || 'N/A'}</TableCell>
                          <TableCell>{stat.successfulBlocs}</TableCell>
                          <TableCell>{stat.totalLevel}</TableCell>
                          <TableCell>
                            {stat.attemptsOnHardestBloc === Infinity ? 'Aucun' : stat.attemptsOnHardestBloc}
                          </TableCell>
                          <TableCell>{stat.averageRating.toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {activeTab === 1 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Blocs Préférés (par note moyenne)
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Nom du Bloc</TableCell>
                        <TableCell>Niveau</TableCell>
                        <TableCell>Note Moyenne</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {favoriteBlocs.map(bloc => (
                        <TableRow key={bloc.boulderId}>
                          <TableCell>{bloc.name}</TableCell>
                          <TableCell>{bloc.level}</TableCell>
                          <TableCell>{bloc.averageRating.toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </>
        )}
      </Paper>
    </Container>
  );
};

export default AdminCompetitionStats;