import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Button, Box,
  FormControl, InputLabel, Select, MenuItem, Snackbar, Alert
} from '@mui/material';
import { db } from '../services/firebaseConfig';
import { collection, getDocs, doc, addDoc, deleteDoc, query, where, updateDoc } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';

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

const AdminCompetitionRegistration: React.FC = () => {
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

  useEffect(() => {
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
          registered_count: doc.data().registered_count || 0
        }));
        setCompetitions(competitionsData);

        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersData: User[] = usersSnapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        }));
        setAllUsers(usersData);

        if (competitionId) {
          const selectedComp = competitionsData.find(c => c.id === competitionId);
          if (selectedComp) {
            setSelectedCompetition(selectedComp);
            const participantsSnapshot = await getDocs(
              query(collection(db, 'competition_participants'), where('competition_id', '==', competitionId))
            );
            const participantsData: CompetitionParticipant[] = participantsSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            setParticipants(participantsData);
          }
        } else if (competitionsData.length > 0) {
          setSelectedCompetition(competitionsData[0]);
          const participantsSnapshot = await getDocs(
            query(collection(db, 'competition_participants'), where('competition_id', '==', competitionsData[0].id))
          );
          const participantsData: CompetitionParticipant[] = participantsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setParticipants(participantsData);
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
  }, [competitionId, location.search]);

  const loadParticipants = async (competitionId: string) => {
    try {
      setLoading(true);
      const selectedComp = competitions.find(c => c.id === competitionId);
      if (selectedComp) {
        setSelectedCompetition(selectedComp);
        const participantsSnapshot = await getDocs(
          query(collection(db, 'competition_participants'), where('competition_id', '==', competitionId))
        );
        const participantsData: CompetitionParticipant[] = participantsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
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

  const handleAddParticipant = async (user: User) => {
    if (!selectedCompetition) return;
    try {
      const existingParticipant = participants.find(p => p.email === user.email);
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
        gender: user.gender,
        level: user.level,
        registered_at: new Date().toISOString(),
        is_client: user.role === 'client'
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

  if (loading && !participants.length) {
    return <Typography>Chargement...</Typography>;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Gestion des Inscriptions aux Compétitions
        </Typography>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Sélectionnez une compétition</InputLabel>
          <Select
            value={selectedCompetition?.id || ''}
            onChange={(e) => loadParticipants(e.target.value)}
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Participants inscrits ({participants.length} / {selectedCompetition.max_participants})
              </Typography>
              <Button
                variant="outlined"
                onClick={() => navigate('/admin/competitions/list')}
              >
                Retour à la liste
              </Button>
            </Box>

            <TableContainer sx={{ mb: 3 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Prénom</TableCell>
                    <TableCell>Nom</TableCell>
                    <TableCell>Niveau</TableCell>
                    <TableCell>Âge</TableCell>
                    <TableCell>Genre</TableCell>
                    <TableCell>Date d'inscription</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {participants.map(participant => (
                    <TableRow key={participant.id}>
                      <TableCell>{participant.email}</TableCell>
                      <TableCell>{participant.first_name}</TableCell>
                      <TableCell>{participant.last_name}</TableCell>
                      <TableCell>{participant.level || 'N/A'}</TableCell>
                      <TableCell>{participant.age || 'N/A'}</TableCell>
                      <TableCell>{participant.gender || 'N/A'}</TableCell>
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
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="h6" gutterBottom>
              Ajouter un participant
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Utilisateur</InputLabel>
              <Select
                label="Utilisateur"
                defaultValue=""
              >
                {allUsers
                  .filter(user => !participants.some(p => p.email === user.email))
                  .map(user => (
                    <MenuItem
                      key={user.uid}
                      value={user.uid}
                      onClick={() => handleAddParticipant(user)}
                    >
                      {user.email} - {user.first_name} {user.last_name} (Niveau: {user.level || 'N/A'})
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
            severity={snackbarMessage.includes("succès") ? "success" : "error"}
            onClose={() => setOpenSnackbar(false)}
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
};

export default AdminCompetitionRegistration;