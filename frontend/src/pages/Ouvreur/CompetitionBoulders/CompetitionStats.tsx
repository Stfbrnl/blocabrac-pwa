import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Box, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress
} from '@mui/material';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { getSeasonAge, getFfmeCategory, OPEN_CATEGORY } from '../../../utils/ageCategory';
// ✅ Extrait dans competitionClassement.ts (CONCEPTION-ecran-live-competition.md §1) :
// ce calcul existait en double avec AdminCompetitionStats.tsx.
import {
  getClassementByCategory as computeClassementByCategory,
  getOfficialClassementByCategory as computeOfficialClassementByCategory,
  rankOfficialEntries,
  type ScoreEntry,
  type OfficialScoreEntry,
  type CategoryGroup,
  type ScoringMode,
  type CustomScoringTable,
} from '../../../utils/competitionClassement';

interface Competition {
  id: string;
  name: string;
  date: string;
  scoring_mode?: ScoringMode; // ✅ Nouveau
  custom_scoring?: CustomScoringTable; // ✅ Nouveau
}

interface CompetitionResult {
  id: string;
  user_id: string;
  competition_id: string;
  boulder_id: string;
  success: boolean;
  attempts: number;
  rating: number;
  proposed_difficulty: string;
  zone?: boolean; // ✅ Mode "Officiel" uniquement
  attempts_to_zone?: number; // ✅ Mode "Officiel" uniquement
}

interface Boulder {
  id: string;
  difficulty: string;
  color?: string;
  number: number;
  wall: string;
  points_value?: number; // ✅ Mode de comptage "Blocs validés" uniquement
}

interface Participant {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  age?: number;
  dateOfBirth?: string;
  gender?: string;
  level?: string;
}

interface User {
  uid: string;
  age?: number;
  dateOfBirth?: string;
  gender?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  level?: string;
}

const CompetitionStats: React.FC = () => {
  const [user] = useAuthState(auth);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const usersData: User[] = snapshot.docs.map(doc => ({
          uid: doc.id,
          age: doc.data().age,
          dateOfBirth: doc.data().dateOfBirth,
          gender: doc.data().gender,
          first_name: doc.data().first_name,
          last_name: doc.data().last_name,
          email: doc.data().email
        }));
        setUsers(usersData);
      } catch (err: unknown) {
        console.error("Erreur:", err);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        // ✅ Un ouvreur ne voit ici que les compétitions où il a lui-même créé
        // au moins un bloc — pas toutes les compétitions de la salle.
        const boulderQuery = query(
          collection(db, 'boulders'),
          where('type', '==', 'competition'),
          where('created_by', '==', user.uid)
        );
        const boulderSnapshot = await getDocs(boulderQuery);
        const ownCompetitionIds = new Set(
          boulderSnapshot.docs.map(d => d.data().competition_id).filter(Boolean)
        );

        const snapshot = await getDocs(collection(db, 'competitions'));
        const competitionsData: Competition[] = snapshot.docs
          .filter(doc => ownCompetitionIds.has(doc.id))
          .map(doc => ({
            id: doc.id,
            name: doc.data().name || '',
            date: doc.data().date || '',
            scoring_mode: doc.data().scoring_mode || 'blocabrac',
            custom_scoring: doc.data().custom_scoring
          }));
        setCompetitions(competitionsData);
      } catch (err: unknown) {
        console.error("Erreur:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCompetitions();
  }, [user]);

  useEffect(() => {
    if (!selectedCompetition) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        const resultsQuery = query(
          collection(db, 'competition_results'),
          where('competition_id', '==', selectedCompetition)
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        const resultsData: CompetitionResult[] = resultsSnapshot.docs.map(doc => ({
          id: doc.id,
          user_id: doc.data().user_id || '',
          competition_id: doc.data().competition_id || '',
          boulder_id: doc.data().boulder_id || '',
          success: doc.data().success || false,
          attempts: doc.data().attempts || 0,
          rating: doc.data().rating || 0,
          proposed_difficulty: doc.data().proposed_difficulty || '',
          zone: doc.data().zone,
          attempts_to_zone: doc.data().attempts_to_zone
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
          color: doc.data().color,
          number: doc.data().number || 0,
          wall: doc.data().wall || '',
          points_value: doc.data().points_value
        }));
        setBoulders(bouldersData);

        const participantsQuery = query(
          collection(db, 'competition_participants'),
          where('competition_id', '==', selectedCompetition)
        );
        const participantsSnapshot = await getDocs(participantsQuery);
        const participantsData: Participant[] = participantsSnapshot.docs.map(doc => {
          const user = users.find(u => u.uid === doc.data().user_id);
          return {
            id: doc.id,
            user_id: doc.data().user_id || '',
            first_name: user?.first_name || doc.data().first_name || '',
            last_name: user?.last_name || doc.data().last_name || '',
            email: user?.email || doc.data().email || '',
            age: user?.age || doc.data().age,
            dateOfBirth: user?.dateOfBirth || doc.data().dateOfBirth,
            gender: user?.gender || doc.data().gender,
            level: user?.level || doc.data().level
          };
        });
        setParticipants(participantsData);
      } catch (err: unknown) {
        console.error("Erreur:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCompetition, users]);

  const selectedCompetitionDoc = competitions.find(c => c.id === selectedCompetition);
  const scoringMode = selectedCompetitionDoc?.scoring_mode || 'blocabrac';
  const customScoring = selectedCompetitionDoc?.custom_scoring;
  const isOfficialMode = scoringMode === 'officiel';

  function getClassementByCategory(category: 'global'): ScoreEntry<Participant>[];
  function getClassementByCategory(category: 'age' | 'gender'): CategoryGroup<ScoreEntry<Participant>>[];
  function getClassementByCategory(
    category: 'global' | 'age' | 'gender'
  ): ScoreEntry<Participant>[] | CategoryGroup<ScoreEntry<Participant>>[] {
    if (category === 'global') {
      return computeClassementByCategory(results, participants, boulders, category, scoringMode, customScoring);
    }
    return computeClassementByCategory(results, participants, boulders, category, scoringMode, customScoring);
  }

  function getOfficialClassementByCategory(category: 'global'): OfficialScoreEntry<Participant>[];
  function getOfficialClassementByCategory(category: 'age' | 'gender'): CategoryGroup<OfficialScoreEntry<Participant>>[];
  function getOfficialClassementByCategory(
    category: 'global' | 'age' | 'gender'
  ): OfficialScoreEntry<Participant>[] | CategoryGroup<OfficialScoreEntry<Participant>>[] {
    if (category === 'global') return computeOfficialClassementByCategory(results, participants, category);
    return computeOfficialClassementByCategory(results, participants, category);
  }

  // ✅ Rang à égalités (1, 1, 3...) plutôt que 1, 2, 3 séquentiel — même retour de
  // ClaudeNav qu'à l'écran live (§B.4).
  const officialGlobalEntries = isOfficialMode ? getOfficialClassementByCategory('global') : [];
  const officialGlobalRanks = rankOfficialEntries(officialGlobalEntries);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <Typography variant="h4" gutterBottom>
        Classement des Compétitions
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Seules les compétitions pour lesquelles vous avez créé des blocs apparaissent ici.
      </Typography>

      {!loading && competitions.length === 0 ? (
        <Typography>Vous n'avez créé de blocs pour aucune compétition pour l'instant.</Typography>
      ) : (
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
      )}

      {loading ? (
        <LinearProgress />
      ) : selectedCompetition ? (
        <>
          {isOfficialMode ? (
            // ✅ Mode "Officiel FFME/coupe du monde" : colonnes tops/zones/essais,
            // jamais de colonne "Score" — voir competitionClassement.ts.
            <>
              <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
                <Typography variant="h6">Classement {OPEN_CATEGORY}</Typography>
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table sx={{ minWidth: 700 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Position</TableCell>
                        <TableCell>Participant</TableCell>
                        <TableCell>Tops</TableCell>
                        <TableCell>Zones</TableCell>
                        <TableCell>Essais (top)</TableCell>
                        <TableCell>Essais (zone)</TableCell>
                        <TableCell>Âge</TableCell>
                        <TableCell>Genre</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {officialGlobalEntries.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{officialGlobalRanks[index]}</TableCell>
                          <TableCell>{item.participant.first_name} {item.participant.last_name}</TableCell>
                          <TableCell>{item.totals.tops}</TableCell>
                          <TableCell>{item.totals.zones}</TableCell>
                          <TableCell>{item.totals.attemptsToTop}</TableCell>
                          <TableCell>{item.totals.attemptsToZone}</TableCell>
                          <TableCell>{getFfmeCategory(getSeasonAge(item.participant.dateOfBirth, item.participant.age))}</TableCell>
                          <TableCell>{item.participant.gender || 'Inconnu'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
                <Typography variant="h6">Classement par Catégorie d'Âge</Typography>
                {getOfficialClassementByCategory('age').map((category) => {
                  const ranks = rankOfficialEntries(category.participants);
                  return category.participants.length > 0 && (
                    <Box key={category.category} sx={{ mb: 3 }}>
                      <Typography variant="subtitle1">{category.category}</Typography>
                      <TableContainer sx={{ overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: 500 }}>
                          <TableHead>
                            <TableRow>
                              <TableCell>Position</TableCell>
                              <TableCell>Participant</TableCell>
                              <TableCell>Tops</TableCell>
                              <TableCell>Zones</TableCell>
                              <TableCell>Essais (top)</TableCell>
                              <TableCell>Essais (zone)</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {category.participants.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell>{ranks[index]}</TableCell>
                                <TableCell>{item.participant.first_name} {item.participant.last_name}</TableCell>
                                <TableCell>{item.totals.tops}</TableCell>
                                <TableCell>{item.totals.zones}</TableCell>
                                <TableCell>{item.totals.attemptsToTop}</TableCell>
                                <TableCell>{item.totals.attemptsToZone}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  );
                })}
              </Paper>

              <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6">Classement par Genre</Typography>
                {getOfficialClassementByCategory('gender').map((gender) => {
                  const ranks = rankOfficialEntries(gender.participants);
                  return gender.participants.length > 0 && (
                    <Box key={gender.category} sx={{ mb: 3 }}>
                      <Typography variant="subtitle1">{gender.category}</Typography>
                      <TableContainer sx={{ overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: 500 }}>
                          <TableHead>
                            <TableRow>
                              <TableCell>Position</TableCell>
                              <TableCell>Participant</TableCell>
                              <TableCell>Tops</TableCell>
                              <TableCell>Zones</TableCell>
                              <TableCell>Essais (top)</TableCell>
                              <TableCell>Essais (zone)</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {gender.participants.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell>{ranks[index]}</TableCell>
                                <TableCell>{item.participant.first_name} {item.participant.last_name}</TableCell>
                                <TableCell>{item.totals.tops}</TableCell>
                                <TableCell>{item.totals.zones}</TableCell>
                                <TableCell>{item.totals.attemptsToTop}</TableCell>
                                <TableCell>{item.totals.attemptsToZone}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  );
                })}
              </Paper>
            </>
          ) : (
            <>
              <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
                <Typography variant="h6">Classement {OPEN_CATEGORY}</Typography>
                {/* ✅ Scroll horizontal de secours : 6 colonnes ne tiennent jamais sur mobile */}
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table sx={{ minWidth: 600 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Position</TableCell>
                        <TableCell>Participant</TableCell>
                        <TableCell>Score</TableCell>
                        <TableCell>Blocs validés</TableCell>
                        <TableCell>Âge</TableCell>
                        <TableCell>Genre</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getClassementByCategory('global').map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{item.participant.first_name} {item.participant.last_name}</TableCell>
                          <TableCell>{item.score}</TableCell>
                          <TableCell>{item.boulders}</TableCell>
                          <TableCell>{getFfmeCategory(getSeasonAge(item.participant.dateOfBirth, item.participant.age))}</TableCell>
                          <TableCell>{item.participant.gender || 'Inconnu'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
                <Typography variant="h6">Classement par Catégorie d'Âge</Typography>
                {getClassementByCategory('age').map((category) => (
                  category.participants.length > 0 && (
                    <Box key={category.category} sx={{ mb: 3 }}>
                      <Typography variant="subtitle1">{category.category}</Typography>
                      {/* ✅ Scroll horizontal de secours */}
                      <TableContainer sx={{ overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: 400 }}>
                          <TableHead>
                            <TableRow>
                              <TableCell>Position</TableCell>
                              <TableCell>Participant</TableCell>
                              <TableCell>Score</TableCell>
                              <TableCell>Blocs validés</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {category.participants.map((item: ScoreEntry<Participant>, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{item.participant.first_name} {item.participant.last_name}</TableCell>
                                <TableCell>{item.score}</TableCell>
                                <TableCell>{item.boulders}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )
                ))}
              </Paper>

              <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6">Classement par Genre</Typography>
                {getClassementByCategory('gender').map((gender) => (
                  gender.participants.length > 0 && (
                    <Box key={gender.category} sx={{ mb: 3 }}>
                      <Typography variant="subtitle1">{gender.category}</Typography>
                      <TableContainer sx={{ overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: 400 }}>
                          <TableHead>
                            <TableRow>
                              <TableCell>Position</TableCell>
                              <TableCell>Participant</TableCell>
                              <TableCell>Score</TableCell>
                              <TableCell>Blocs validés</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {gender.participants.map((item: ScoreEntry<Participant>, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{item.participant.first_name} {item.participant.last_name}</TableCell>
                                <TableCell>{item.score}</TableCell>
                                <TableCell>{item.boulders}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )
                ))}
              </Paper>
            </>
          )}
        </>
      ) : (
        <Typography>Sélectionnez une compétition pour voir les statistiques.</Typography>
      )}
    </Box>
  );
};

export default CompetitionStats;