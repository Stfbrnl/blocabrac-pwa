import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Button, Box,
  FormControl, InputLabel, Select, MenuItem, Snackbar, Alert,
  Switch, Chip, Card, CardContent, CardActions, useTheme, useMediaQuery
} from '@mui/material';
import { db } from '../services/firebaseConfig';
import { collection, getDocs, doc, addDoc, deleteDoc, query, where, updateDoc } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import { type Level, canUserRegister } from '../utils/competitionEligibility';
import { getSeasonAge } from '../utils/ageCategory';

type UserRole = 'admin' | 'ouvreur' | 'moniteur' | 'client';
type CompetitionStatus = 'à venir' | 'en cours' | 'terminée' | 'annulée';

interface User {
  uid: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: UserRole[];
  age?: number;
  dateOfBirth?: string;
  gender?: string;
  level?: Level;
  inscritAuxCours?: boolean;
  inscritAuxCompetitions: boolean;
}

interface Competition {
  id: string;
  name: string;
  date: string;
  status: CompetitionStatus;
  access_code: string;
  max_participants: number;
  registered_count: number;
  minLevel?: Level; // ✅ Restrictions de niveau
  maxLevel?: Level;
}

interface CompetitionParticipant {
  id: string;
  user_id: string;
  competition_id: string;
  email: string;
  first_name: string;
  last_name: string;
  age?: number;
  dateOfBirth?: string;
  gender?: string;
  level?: Level;
  registered_at: string;
  is_client: boolean;
}

const AdminCompetitionRegistration: React.FC = () => {
  const theme = useTheme();
  // ✅ En dessous de "md", le tableau à 9 colonnes devient impraticable
  // (défilement horizontal pour atteindre le bouton "Retirer") : on bascule sur des cartes.
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [participants, setParticipants] = useState<CompetitionParticipant[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const competitionId = new URLSearchParams(location.search).get('competitionId');

  // Charger les utilisateurs EN PREMIER
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersData: User[] = usersSnapshot.docs.map(doc => ({
          uid: doc.id,
          email: doc.data().email || '',
          first_name: doc.data().first_name || '',
          last_name: doc.data().last_name || '',
          roles: doc.data().roles || [],
          age: doc.data().age,
        dateOfBirth: doc.data().dateOfBirth,
          gender: doc.data().gender,
          level: doc.data().level,
          inscritAuxCours: doc.data().inscritAuxCours || false,
          inscritAuxCompetitions: doc.data().inscritAuxCompetitions !== undefined ? doc.data().inscritAuxCompetitions : true
        }));
        setAllUsers(usersData);
      } catch (error) {
        console.error("Erreur :", error);
        setSnackbarMessage("Erreur lors du chargement des utilisateurs.");
        setOpenSnackbar(true);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (allUsers.length === 0) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        const competitionsSnapshot = await getDocs(collection(db, 'competitions'));
        const competitionsData: Competition[] = competitionsSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          date: doc.data().date || '',
          status: doc.data().status || 'à venir',
          access_code: doc.data().access_code || '',
          max_participants: doc.data().max_participants || 50,
          registered_count: doc.data().registered_count || 0,
          minLevel: doc.data().minLevel,
          maxLevel: doc.data().maxLevel
        }));
        setCompetitions(competitionsData);

        if (competitionId) {
          const selectedComp = competitionsData.find(c => c.id === competitionId);
          if (selectedComp) {
            setSelectedCompetition(selectedComp);
            await loadParticipants(selectedComp.id);
          }
        } else if (competitionsData.length > 0) {
          setSelectedCompetition(competitionsData[0]);
          await loadParticipants(competitionsData[0].id);
        }
      } catch (error) {
        console.error("Erreur :", error);
        setSnackbarMessage("Erreur lors du chargement des données.");
        setOpenSnackbar(true);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [competitionId, allUsers.length]);

  const loadParticipants = async (competitionId: string) => {
    try {
      setLoading(true);
      const selectedComp = competitions.find(c => c.id === competitionId);
      if (selectedComp) {
        setSelectedCompetition(selectedComp);
        const participantsSnapshot = await getDocs(
          query(collection(db, 'competition_participants'), where('competition_id', '==', competitionId))
        );

        // Fusionner avec les données users
        const participantsData: CompetitionParticipant[] = participantsSnapshot.docs.map(doc => {
          const user = allUsers.find(u => u.uid === doc.data().user_id);
          return {
            id: doc.id,
            user_id: doc.data().user_id || '',
            competition_id: doc.data().competition_id || '',
            email: user?.email || doc.data().email || '',
            first_name: user?.first_name || doc.data().first_name || '',
            last_name: user?.last_name || doc.data().last_name || '',
            age: user?.age,
            dateOfBirth: user?.dateOfBirth,
            gender: user?.gender,
            level: user?.level,
            registered_at: doc.data().registered_at || '',
            is_client: doc.data().is_client || false
          };
        });
        setParticipants(participantsData);
      }
      setLoading(false);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors du chargement des participants.");
      setOpenSnackbar(true);
      setLoading(false);
    }
  };

  const handleToggleCompetitionAccess = async (user: User) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        inscritAuxCompetitions: !user.inscritAuxCompetitions
      });
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData: User[] = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        email: doc.data().email || '',
        first_name: doc.data().first_name || '',
        last_name: doc.data().last_name || '',
        roles: doc.data().roles || [],
        age: doc.data().age,
        dateOfBirth: doc.data().dateOfBirth,
        gender: doc.data().gender,
        level: doc.data().level,
        inscritAuxCours: doc.data().inscritAuxCours || false,
        inscritAuxCompetitions: doc.data().inscritAuxCompetitions !== undefined ? doc.data().inscritAuxCompetitions : true
      }));
      setAllUsers(usersData);
      setSnackbarMessage(`Accès aux compétitions ${!user.inscritAuxCompetitions ? 'activé' : 'désactivé'} pour ${user.first_name} ${user.last_name}.`);
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la mise à jour.");
      setOpenSnackbar(true);
    }
  };

  const handleAddParticipant = async (user: User) => {
    if (!selectedCompetition) return;

    // ✅ Vérifier si l'utilisateur a le droit de s'inscrire (niveau + accès général)
    if (!user.inscritAuxCompetitions) {
      setSnackbarMessage("Cet utilisateur n'est pas autorisé à participer aux compétitions (accès désactivé).");
      setOpenSnackbar(true);
      return;
    }

    if (!canUserRegister(user, selectedCompetition)) {
      setSnackbarMessage(`Cet utilisateur (niveau: ${user.level}) ne correspond pas aux restrictions de niveau de cette compétition (${selectedCompetition.minLevel || 'aucun'} à ${selectedCompetition.maxLevel || 'aucun'}).`);
      setOpenSnackbar(true);
      return;
    }

    try {
      const existingParticipant = participants.find(p => p.user_id === user.uid);
      if (existingParticipant) {
        setSnackbarMessage("Cet utilisateur est déjà inscrit à cette compétition.");
        setOpenSnackbar(true);
        return;
      }

      await addDoc(collection(db, 'competition_participants'), {
        user_id: user.uid,
        competition_id: selectedCompetition.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        age: user.age,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        level: user.level,
        registered_at: new Date().toISOString(),
        is_client: user.roles?.includes('client') ?? true
      });

      await updateDoc(doc(db, 'competitions', selectedCompetition.id), {
        registered_count: selectedCompetition.registered_count + 1
      });

      await loadParticipants(selectedCompetition.id);
      setSnackbarMessage("Participant ajouté avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de l'ajout du participant.");
      setOpenSnackbar(true);
    }
  };

  const handleRemoveParticipant = async (participantId: string) => {
    if (!selectedCompetition) return;
    try {
      await deleteDoc(doc(db, 'competition_participants', participantId));

      await updateDoc(doc(db, 'competitions', selectedCompetition.id), {
        registered_count: selectedCompetition.registered_count - 1
      });

      await loadParticipants(selectedCompetition.id);
      setSnackbarMessage("Participant retiré avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors du retrait du participant.");
      setOpenSnackbar(true);
    }
  };

  if (loading && participants.length === 0) {
    return <Typography>Chargement...</Typography>;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
          Gestion des Inscriptions aux Compétitions
        </Typography>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="selectionnez-une-competition-select-label">Sélectionnez une compétition</InputLabel>
          <Select
            labelId="selectionnez-une-competition-select-label" id="selectionnez-une-competition-select"
            value={selectedCompetition?.id || ''}
            onChange={(e) => loadParticipants(e.target.value)}
            label="Sélectionnez une compétition"
          >
            {competitions.map(comp => (
              <MenuItem key={comp.id} value={comp.id}>
                {comp.name} - {new Date(comp.date).toLocaleDateString()}
                {comp.minLevel || comp.maxLevel ? (
                  <Chip
                    label={comp.minLevel && comp.maxLevel ? `Niveaux: ${comp.minLevel}-${comp.maxLevel}` : comp.minLevel ? `Min: ${comp.minLevel}` : `Max: ${comp.maxLevel}`}
                    size="small"
                    sx={{ ml: 1 }}
                  />
                ) : null}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedCompetition && (
          <>
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'stretch', sm: 'center' },
                gap: 2,
                mb: 2,
              }}
            >
              <Box>
                <Typography variant="h6" gutterBottom>
                  Participants inscrits ({participants.length} / {selectedCompetition.max_participants})
                </Typography>
                {/* ✅ Afficher les restrictions de niveau */}
                {selectedCompetition.minLevel || selectedCompetition.maxLevel ? (
                  <Typography variant="body2" color="text.secondary">
                    Restrictions: {selectedCompetition.minLevel ? `Niveau minimum: ${selectedCompetition.minLevel}` : ''}
                    {selectedCompetition.minLevel && selectedCompetition.maxLevel ? ' / ' : ''}
                    {selectedCompetition.maxLevel ? `Niveau maximum: ${selectedCompetition.maxLevel}` : ''}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Tous les niveaux autorisés
                  </Typography>
                )}
              </Box>
              <Button
                variant="outlined"
                onClick={() => navigate('/admin/competitions/list')}
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                Retour à la liste
              </Button>
            </Box>

            {isCompact ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                {participants.map(participant => {
                  const user = allUsers.find(u => u.uid === participant.user_id);
                  return (
                    <Card key={participant.id} variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                          {participant.first_name || 'N/A'} {participant.last_name || ''}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, wordBreak: 'break-word' }}>
                          {participant.email}
                        </Typography>

                        {participant.level && (
                          <Chip
                            size="small"
                            label={participant.level}
                            sx={{
                              mb: 1,
                              backgroundColor: levelColors[participant.level] || '#CCCCCC',
                              color: participant.level === 'blanc' ? 'black' : 'white'
                            }}
                          />
                        )}

                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Âge : {getSeasonAge(participant.dateOfBirth, participant.age) ?? 'N/A'} · Genre : {participant.gender || 'N/A'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Inscrit le {new Date(participant.registered_at).toLocaleString()}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2">Accès compétitions :</Typography>
                          <Switch
                            checked={user?.inscritAuxCompetitions || false}
                            onChange={() => user && handleToggleCompetitionAccess(user)}
                            color="primary"
                          />
                        </Box>
                      </CardContent>
                      <CardActions sx={{ justifyContent: 'flex-end' }}>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleRemoveParticipant(participant.id)}
                        >
                          Retirer
                        </Button>
                      </CardActions>
                    </Card>
                  );
                })}
              </Box>
            ) : (
              <TableContainer sx={{ mb: 3, overflowX: 'auto' }}>
                <Table sx={{ minWidth: 950 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Email</TableCell>
                      <TableCell>Prénom</TableCell>
                      <TableCell>Nom</TableCell>
                      <TableCell>Niveau</TableCell>
                      <TableCell>Âge</TableCell>
                      <TableCell>Genre</TableCell>
                      <TableCell>Accès compétitions</TableCell>
                      <TableCell>Date d'inscription</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {participants.map(participant => {
                      const user = allUsers.find(u => u.uid === participant.user_id);
                      return (
                        <TableRow key={participant.id}>
                          <TableCell>{participant.email}</TableCell>
                          <TableCell>{participant.first_name || 'N/A'}</TableCell>
                          <TableCell>{participant.last_name || 'N/A'}</TableCell>
                          <TableCell>
                            {participant.level ? (
                              <Chip
                                label={participant.level}
                                sx={{
                                  backgroundColor: levelColors[participant.level] || '#CCCCCC',
                                  color: participant.level === 'blanc' ? 'black' : 'white'
                                }}
                              />
                            ) : 'N/A'}
                          </TableCell>
                          <TableCell>{getSeasonAge(participant.dateOfBirth, participant.age) ?? 'N/A'}</TableCell>
                          <TableCell>{participant.gender || 'N/A'}</TableCell>
                          <TableCell>
                            <Switch
                              checked={user?.inscritAuxCompetitions || false}
                              onChange={() => user && handleToggleCompetitionAccess(user)}
                              color="primary"
                            />
                          </TableCell>
                          <TableCell>{new Date(participant.registered_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              onClick={() => handleRemoveParticipant(participant.id)}
                            >
                              Retirer
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Typography variant="h6" gutterBottom>
              Ajouter un participant
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="utilisateur-select-label">Utilisateur</InputLabel>
              <Select
                labelId="utilisateur-select-label" id="utilisateur-select"
                label="Utilisateur"
                defaultValue=""
              >
                {allUsers
                  .filter(user => {
                    // ✅ Filtrer par niveau ET accès général
                    if (!user.inscritAuxCompetitions) return false;
                    if (!selectedCompetition) return true;
                    return canUserRegister(user, selectedCompetition);
                  })
                  .map(user => (
                    <MenuItem
                      key={user.uid}
                      value={user.uid}
                      onClick={() => handleAddParticipant(user)}
                    >
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                        <span>
                          {user.email} - {user.first_name} {user.last_name} (Niveau: {user.level || 'N/A'})
                        </span>
                        {!user.inscritAuxCompetitions && (
                          <Chip label="Accès désactivé" color="error" size="small" />
                        )}
                      </Box>
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </>
        )}

        <Snackbar
          open={openSnackbar}
          autoHideDuration={6000}
          onClose={() => setOpenSnackbar(false)}
        >
          <Alert
            severity={snackbarMessage.includes("succès") || snackbarMessage.includes("activé") || snackbarMessage.includes("désactivé") ? "success" : "error"}
            onClose={() => setOpenSnackbar(false)}
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
};

// ✅ Couleurs des niveaux (pour les chips)
const levelColors: Record<string, string> = {
  jaune: '#FFFF00', vert: '#00FF00', bleu: '#0000FF', violet: '#800080',
  rouge: '#FF0000', noir: '#000000', blanc: '#FFFFFF', rose: '#FFC0CB'
};

export default AdminCompetitionRegistration;