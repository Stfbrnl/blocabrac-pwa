import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection, query, where, getDocs, orderBy
} from 'firebase/firestore';
import {
  Container, Typography, Box, CircularProgress, Alert,
  Paper, Grid, Card, CardContent, Button, Chip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

// Couleurs des niveaux (pour les exercices)
const levelColors: Record<string, string> = {
  jaune: '#FFFF00', vert: '#00FF00', bleu: '#0000FF', violet: '#800080',
  rouge: '#FF0000', noir: '#000000', blanc: '#FFFFFF', rose: '#FFC0CB'
};

interface Group {
  id: string;
  name: string;
  moniteurId: string;
  students: string[];
}

interface Exercise {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  instructions?: string;
}

interface Session {
  id: string;
  name: string;
  date: string;
  moniteurId: string;
  groupId: string;
  isActive: boolean;
  exercises: Exercise[];
}

const ClientCourses: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. Charger les groupes de l'utilisateur
        const groupsQuery = query(
          collection(db, 'Groups'),
          where('students', 'array-contains', user.uid)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        const groupsData: Group[] = groupsSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          moniteurId: doc.data().moniteurId || '',
          students: doc.data().students || []
        }));
        setGroups(groupsData);

        // 2. Charger toutes les séances des groupes de l'utilisateur
        const allSessions: Session[] = [];
        for (const group of groupsData) {
          const sessionsQuery = query(
            collection(db, 'courses'),
            where('groupId', '==', group.id),
            orderBy('date', 'desc')
          );
          const sessionsSnapshot = await getDocs(sessionsQuery);
          const groupSessions: Session[] = sessionsSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || '',
            date: doc.data().date || '',
            moniteurId: doc.data().moniteurId || '',
            groupId: doc.data().groupId || '',
            isActive: doc.data().isActive || false,
            exercises: doc.data().exercises || []
          }));
          allSessions.push(...groupSessions);
        }

        // 3. Trier les séances par date (la plus récente en premier)
        const sortedSessions = allSessions.sort((a, b) => {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        setSessions(sortedSessions);
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, loadingAuth]);

  // Séparer les séances en "Aujourd'hui" et "Archivées"
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter(session => session.date === today && session.isActive);
  const archivedSessions = sessions.filter(session => session.date < today || !session.isActive);

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
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>Mes Cours</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Séances du jour */}
      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Séance du jour</Typography>
      {todaySessions.length > 0 ? (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {todaySessions.map((session) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={session.id}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6">{session.name}</Typography>
                  <Typography>Date: {new Date(session.date).toLocaleDateString()}</Typography>
                  <Typography>Moniteur: {session.moniteurId}</Typography>
                  <Typography>Groupe: {groups.find(g => g.id === session.groupId)?.name || 'Inconnu'}</Typography>
                  <Typography sx={{ mt: 1 }}>
                    <strong>Exercices:</strong> {session.exercises.length}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => navigate(`/client/courses/session/${session.id}`)}
                    >
                      Valider les exercices
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Typography sx={{ mb: 3 }}>Aucune séance du jour.</Typography>
      )}

      {/* Séances archivées */}
      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Séances archivées</Typography>
      {archivedSessions.length > 0 ? (
        <Grid container spacing={2}>
          {archivedSessions.map((session) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={session.id}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6">{session.name}</Typography>
                  <Typography>Date: {new Date(session.date).toLocaleDateString()}</Typography>
                  <Typography>Moniteur: {session.moniteurId}</Typography>
                  <Typography>Groupe: {groups.find(g => g.id === session.groupId)?.name || 'Inconnu'}</Typography>
                  <Typography sx={{ mt: 1 }}>
                    <strong>Exercices:</strong> {session.exercises.length}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                    <Button
                      variant="outlined"
                      onClick={() => navigate(`/client/courses/session/${session.id}`)}
                    >
                      Voir les détails
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Typography>Aucune séance archivée.</Typography>
      )}
    </Container>
  );
};

export default ClientCourses;