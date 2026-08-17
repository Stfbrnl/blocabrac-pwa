import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Box, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Chip, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, useTheme, useMediaQuery
} from '@mui/material';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { getSeasonAge, getFfmeCategory, OPEN_CATEGORY } from '../utils/ageCategory';
// ✅ Extrait dans competitionClassement.ts (CONCEPTION-ecran-live-competition.md §1) :
// ce calcul existait en double avec Ouvreur/CompetitionBoulders/CompetitionStats.tsx.
import {
  getClassementByCategory as computeClassementByCategory,
  getOfficialClassementByCategory as computeOfficialClassementByCategory,
  rankOfficialEntries,
  type ScoreEntry,
  type OfficialScoreEntry,
  type CategoryGroup,
  type ScoringMode,
  type CustomScoringTable,
} from '../utils/competitionClassement';

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
  color?: string; // ✅ Ajout du champ color
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
  legacyAge?: number;
  dateOfBirth?: string;
  gender?: string;
  level?: string;
}

interface User {
  uid: string;
  legacyAge?: number;
  dateOfBirth?: string;
  gender?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  level?: string;
}

const AdminCompetitionStats: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [users, setUsers] = useState<User[]>([]); // ✅ Nouveau : Stockage des utilisateurs
  const [loading, setLoading] = useState(true);
  const [openPublishDialog, setOpenPublishDialog] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ Charger tous les utilisateurs une fois
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const usersData: User[] = snapshot.docs.map(doc => ({
          uid: doc.id,
          legacyAge: doc.data().age,
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
    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const snapshot = await getDocs(collection(db, 'competitions'));
        const competitionsData: Competition[] = snapshot.docs.map(doc => ({
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
  }, []);

  useEffect(() => {
    if (!selectedCompetition) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Charger les résultats
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

        // Charger les blocs
        const bouldersQuery = query(
          collection(db, 'boulders'),
          where('competition_id', '==', selectedCompetition)
        );
        const bouldersSnapshot = await getDocs(bouldersQuery);
        const bouldersData: Boulder[] = bouldersSnapshot.docs.map(doc => ({
          id: doc.id,
          difficulty: doc.data().difficulty || '',
          color: doc.data().color, // ✅ Charger aussi le champ color
          number: doc.data().number || 0,
          wall: doc.data().wall || '',
          points_value: doc.data().points_value
        }));
        setBoulders(bouldersData);

        // Charger les participants
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
            legacyAge: user?.legacyAge || doc.data().age, // ✅ Prendre age depuis users
            dateOfBirth: user?.dateOfBirth || doc.data().dateOfBirth,
            gender: user?.gender || doc.data().gender, // ✅ Prendre gender depuis users
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
  // ✅ Mode "Officiel FFME/coupe du monde" : pas une somme de points, un classement
  // par tops/zones/essais — écran de rendu entièrement différent plus bas.
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

  const handlePublishResults = async () => {
    if (!selectedCompetition || !messageTitle || !messageContent) return;

    try {
      // ✅ "messages" est un canal 1-à-1 (senderId/receiverId) : un classement, lui,
      // concerne tout le monde. On publie donc sur "announcements" (le même canal que
      // AdminAnnouncements.tsx / AnnouncementBanner.tsx), pas sur "messages".
      await addDoc(collection(db, 'announcements'), {
        text: `${messageTitle}\n\n${messageContent}`,
        order: 0,
        active: true,
        createdAt: new Date().toISOString(),
      });
      setSuccess("Classement publié avec succès !");
      setError(null);
      setOpenPublishDialog(false);
      setMessageTitle('');
      setMessageContent('');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      console.error("Erreur:", err);
      setError("Erreur lors de la publication du classement : " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const generateClassementMessage = () => {
    // ✅ Pas de markdown (**gras**) : ce texte est publié tel quel dans le bandeau
    // d'annonces (AnnouncementBanner.tsx), qui affiche du texte brut, pas du markdown.
    const competition = competitions.find(c => c.id === selectedCompetition);
    let message = `🏆 Classement ${OPEN_CATEGORY} - ${competition?.name} 🏆\n\n`;

    if (isOfficialMode) {
      // ✅ Mode "Officiel" : pas de points, ligne "tops/zones/essais" à la place.
      const officialLine = (item: OfficialScoreEntry<Participant>) =>
        `${item.participant.first_name} ${item.participant.last_name} - ${item.totals.tops} tops, ${item.totals.zones} zones (${item.totals.attemptsToTop} essais top, ${item.totals.attemptsToZone} essais zone)`;
      getOfficialClassementByCategory('global').forEach((item, index) => {
        message += `${index + 1}. ${officialLine(item)}\n`;
      });
      message += `\n📊 Classement par âge :\n`;
      getOfficialClassementByCategory('age').forEach(category => {
        message += `\n${category.category} :\n`;
        category.participants.forEach((item, index) => {
          message += `${index + 1}. ${officialLine(item)}\n`;
        });
      });
      message += `\n📊 Classement par genre :\n`;
      getOfficialClassementByCategory('gender').forEach(gender => {
        message += `\n${gender.category} :\n`;
        gender.participants.forEach((item, index) => {
          message += `${index + 1}. ${officialLine(item)}\n`;
        });
      });
    } else {
      getClassementByCategory('global').forEach((item, index) => {
        message += `${index + 1}. ${item.participant.first_name} ${item.participant.last_name} - ${item.score} pts (${item.boulders} blocs validés)\n`;
      });

      // ✅ Ajouter les classements par âge et genre
      message += `\n📊 Classement par âge :\n`;
      getClassementByCategory('age').forEach(category => {
        message += `\n${category.category} :\n`;
        category.participants.forEach((item: ScoreEntry<Participant>, index: number) => {
          message += `${index + 1}. ${item.participant.first_name} ${item.participant.last_name} - ${item.score} pts\n`;
        });
      });

      message += `\n📊 Classement par genre :\n`;
      getClassementByCategory('gender').forEach(gender => {
        message += `\n${gender.category} :\n`;
        gender.participants.forEach((item: ScoreEntry<Participant>, index: number) => {
          message += `${index + 1}. ${item.participant.first_name} ${item.participant.last_name} - ${item.score} pts\n`;
        });
      });
    }

    setMessageTitle(`Classement - ${competition?.name}`);
    setMessageContent(message);
    setOpenPublishDialog(true);
  };

  // ✅ Rang à égalités (1, 1, 3...) plutôt que 1, 2, 3 séquentiel — même retour de
  // ClaudeNav qu'à l'écran live (§B.4) : à égalité totale (fréquent en début
  // d'épreuve, voir AdminCompetitionLiveDisplay.tsx), un ordre arbitraire suggérerait
  // un départage qui n'existe pas.
  const officialGlobalEntries = isOfficialMode ? getOfficialClassementByCategory('global') : [];
  const officialGlobalRanks = rankOfficialEntries(officialGlobalEntries);

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
          Classement et Statistiques des Compétitions
        </Typography>
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

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
          <LinearProgress />
        ) : selectedCompetition ? (
          <>
            <Box sx={{ display: 'flex', justifyContent: { xs: 'stretch', sm: 'flex-end' }, mb: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={generateClassementMessage}
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                Publier le classement
              </Button>
            </Box>

            {isOfficialMode ? (
              // ✅ Mode "Officiel FFME/coupe du monde" : colonnes tops/zones/essais,
              // triées par compareOfficialTotals (competitionClassement.ts) — jamais de
              // colonne "Score", ce mode n'en produit pas.
              <>
                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
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
                            <TableCell>
                              <strong>{item.participant.first_name} {item.participant.last_name}</strong>
                            </TableCell>
                            <TableCell><Chip label={item.totals.tops} color="primary" /></TableCell>
                            <TableCell>{item.totals.zones}</TableCell>
                            <TableCell>{item.totals.attemptsToTop}</TableCell>
                            <TableCell>{item.totals.attemptsToZone}</TableCell>
                            <TableCell>{getFfmeCategory(getSeasonAge(item.participant.dateOfBirth, item.participant.legacyAge))}</TableCell>
                            <TableCell>{item.participant.gender || 'Inconnu'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                  <Typography variant="h6">Classement par Catégorie d'Âge</Typography>
                  {getOfficialClassementByCategory('age').map((category) => {
                    const ranks = rankOfficialEntries(category.participants);
                    return category.participants.length > 0 && (
                      <Box key={category.category} sx={{ mb: 3 }}>
                        <Typography variant="subtitle1">{category.category}</Typography>
                        <TableContainer sx={{ overflowX: 'auto' }}>
                          <Table size="small" sx={{ minWidth: 550 }}>
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

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="h6">Classement par Genre</Typography>
                  {getOfficialClassementByCategory('gender').map((gender) => {
                    const ranks = rankOfficialEntries(gender.participants);
                    return gender.participants.length > 0 && (
                      <Box key={gender.category} sx={{ mb: 3 }}>
                        <Typography variant="subtitle1">{gender.category}</Typography>
                        <TableContainer sx={{ overflowX: 'auto' }}>
                          <Table size="small" sx={{ minWidth: 550 }}>
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
                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                  <Typography variant="h6">Classement {OPEN_CATEGORY}</Typography>
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
                            <TableCell>
                              <strong>{item.participant.first_name} {item.participant.last_name}</strong>
                            </TableCell>
                            <TableCell>
                              <Chip label={item.score} color="primary" />
                            </TableCell>
                            <TableCell>{item.boulders}</TableCell>
                            <TableCell>{getFfmeCategory(getSeasonAge(item.participant.dateOfBirth, item.participant.legacyAge))}</TableCell>
                            <TableCell>{item.participant.gender || 'Inconnu'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                  <Typography variant="h6">Classement par Catégorie d'Âge</Typography>
                  {getClassementByCategory('age').map((category) => (
                    category.participants.length > 0 && (
                      <Box key={category.category} sx={{ mb: 3 }}>
                        <Typography variant="subtitle1">{category.category}</Typography>
                        <TableContainer sx={{ overflowX: 'auto' }}>
                          <Table size="small" sx={{ minWidth: 450 }}>
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

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="h6">Classement par Genre</Typography>
                  {getClassementByCategory('gender').map((gender) => (
                    gender.participants.length > 0 && (
                      <Box key={gender.category} sx={{ mb: 3 }}>
                        <Typography variant="subtitle1">{gender.category}</Typography>
                        <TableContainer sx={{ overflowX: 'auto' }}>
                          <Table size="small" sx={{ minWidth: 450 }}>
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
          <Typography>Sélectionnez une compétition pour voir les classements.</Typography>
        )}

        <Dialog
          open={openPublishDialog}
          onClose={() => setOpenPublishDialog(false)}
          maxWidth="md"
          fullWidth
          fullScreen={isMobile}
        >
          <DialogTitle>Publier le classement</DialogTitle>
          <DialogContent>
            <TextField
              label="Titre du message"
              value={messageTitle}
              onChange={(e) => setMessageTitle(e.target.value)}
              fullWidth
              sx={{ mb: 2, mt: 1 }}
            />
            <TextField
              label="Contenu du message"
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              multiline
              rows={10}
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenPublishDialog(false)}>Annuler</Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handlePublishResults}
            >
              Publier
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
};

export default AdminCompetitionStats;