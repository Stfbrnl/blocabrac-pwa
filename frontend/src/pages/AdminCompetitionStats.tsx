import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Box, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Chip, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, useTheme, useMediaQuery
} from '@mui/material';
import { collection, query, where, getDocs, doc, addDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

// ✅ Points par couleur (comme demandé)
const basePoints: Record<string, number> = {
  vert: 50,
  bleu: 100,
  violet: 200,
  rouge: 400,
  noir: 600,
  blanc: 800,
  rose: 1000
};

// ✅ Déductions par essai (comme demandé)
const deductions: Record<string, number> = {
  vert: 10,
  bleu: 10,
  violet: 10,
  rouge: 20,
  noir: 20,
  blanc: 50,
  rose: 50
};

interface Competition {
  id: string;
  name: string;
  date: string;
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
}

interface Boulder {
  id: string;
  difficulty: string;
  color?: string; // ✅ Ajout du champ color
  number: number;
  wall: string;
}

interface Participant {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  age?: number;
  gender?: string;
  level?: string;
}

interface User {
  uid: string;
  age?: number;
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

  // ✅ Charger tous les utilisateurs une fois
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const usersData: User[] = snapshot.docs.map(doc => ({
          uid: doc.id,
          age: doc.data().age,
          gender: doc.data().gender,
          first_name: doc.data().first_name,
          last_name: doc.data().last_name,
          email: doc.data().email
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
          proposed_difficulty: doc.data().proposed_difficulty || ''
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
          wall: doc.data().wall || ''
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
            age: user?.age || doc.data().age, // ✅ Prendre age depuis users
            gender: user?.gender || doc.data().gender, // ✅ Prendre gender depuis users
            level: user?.level || doc.data().level
          };
        });
        setParticipants(participantsData);
      } catch (err: any) {
        console.error("Erreur:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCompetition, users]);

  // ✅ Fonction de calcul des points (utilise difficulty OU color)
  const calculatePoints = (boulder: Boulder, attempts: number, success: boolean): number => {
    if (!success) return 0;
    // ✅ Utiliser color si difficulty n'est pas définie
    const difficulty = boulder.color || boulder.difficulty;
    const base = basePoints[difficulty] || 0;
    const deduction = (attempts > 1 ? (attempts - 1) * (deductions[difficulty] || 0) : 0);
    return Math.max(0, base - deduction);
  };

  const getParticipantScores = (): { participant: Participant; score: number; boulders: number }[] => {
    const scores: Record<string, { score: number; boulders: number }> = {};

    results.forEach(result => {
      const participant = participants.find(p => p.user_id === result.user_id);
      if (!participant) return;

      const boulder = boulders.find(b => b.id === result.boulder_id);
      if (!boulder) return;

      const points = calculatePoints(boulder, result.attempts, result.success);
      const key = participant.user_id;

      if (!scores[key]) {
        scores[key] = { score: 0, boulders: 0 };
      }
      scores[key].score += points;
      scores[key].boulders += result.success ? 1 : 0;
    });

    return Object.entries(scores).map(([userId, data]) => {
      const participant = participants.find(p => p.user_id === userId)!;
      return {
        participant,
        score: data.score,
        boulders: data.boulders
      };
    }).sort((a, b) => b.score - a.score);
  };

  const getAgeCategory = (age?: number): string => {
    if (age === undefined || age === null) return 'Inconnu';
    if (age >= 55) return 'Vétérans (55+)';
    if (age >= 45) return '45-54 ans';
    if (age >= 35) return '35-44 ans';
    if (age >= 18) return '18-34 ans';
    if (age >= 14) return '14-17 ans';
    if (age >= 10) return '10-14 ans';
    return 'Moins de 10 ans';
  };

  const getClassementByCategory = (category: 'global' | 'age' | 'gender'): any[] => {
    const scores = getParticipantScores();

    if (category === 'global') {
      return scores;
    } else if (category === 'age') {
      const byAge: Record<string, any[]> = {};
      scores.forEach(score => {
        const ageCategory = getAgeCategory(score.participant.age);
        if (!byAge[ageCategory]) {
          byAge[ageCategory] = [];
        }
        byAge[ageCategory].push(score);
      });
      return Object.entries(byAge).map(([age, scores]) => ({
        category: age,
        participants: scores
      }));
    } else {
      const byGender: Record<string, any[]> = {};
      scores.forEach(score => {
        const gender = score.participant.gender || 'Inconnu';
        if (!byGender[gender]) {
          byGender[gender] = [];
        }
        byGender[gender].push(score);
      });
      return Object.entries(byGender).map(([gender, scores]) => ({
        category: gender,
        participants: scores
      }));
    }
  };

  const handlePublishResults = async () => {
    if (!selectedCompetition || !messageTitle || !messageContent) return;

    try {
      await addDoc(collection(db, 'messages'), {
        title: messageTitle,
        content: messageContent,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
        recipientIds: participants.map(p => p.user_id),
        type: 'competition_results',
        competitionId: selectedCompetition
      });
      setSuccess("Classement publié avec succès !");
      setOpenPublishDialog(false);
      setMessageTitle('');
      setMessageContent('');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("Erreur:", err);
    }
  };

  const generateClassementMessage = () => {
    const globalClassement = getClassementByCategory('global');
    const competition = competitions.find(c => c.id === selectedCompetition);
    let message = `🏆 **Classement Global - ${competition?.name}** 🏆\n\n`;

    globalClassement.forEach((item, index) => {
      message += `${index + 1}. **${item.participant.first_name} ${item.participant.last_name}** - ${item.score} pts (${item.boulders} blocs validés)\n`;
    });

    // ✅ Ajouter les classements par âge et genre
    message += `\n📊 **Classement par âge :**\n`;
    getClassementByCategory('age').forEach(category => {
      message += `\n**${category.category}** :\n`;
      category.participants.forEach((item: any, index: number) => {
        message += `${index + 1}. ${item.participant.first_name} ${item.participant.last_name} - ${item.score} pts\n`;
      });
    });

    message += `\n📊 **Classement par genre :**\n`;
    getClassementByCategory('gender').forEach(gender => {
      message += `\n**${gender.category}** :\n`;
      gender.participants.forEach((item: any, index: number) => {
        message += `${index + 1}. ${item.participant.first_name} ${item.participant.last_name} - ${item.score} pts\n`;
      });
    });

    setMessageTitle(`Classement - ${competition?.name}`);
    setMessageContent(message);
    setOpenPublishDialog(true);
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
          Classement et Statistiques des Compétitions
        </Typography>
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

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

            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="h6">Classement Global</Typography>
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
                        <TableCell>{getAgeCategory(item.participant.age)}</TableCell>
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
                          {category.participants.map((item: any, index: number) => (
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
                          {gender.participants.map((item: any, index: number) => (
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