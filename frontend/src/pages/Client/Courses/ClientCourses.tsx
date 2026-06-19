import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection, query, where, getDocs, orderBy
} from 'firebase/firestore';
import {
  Container, Typography, Box, CircularProgress, Alert,
  Card, CardContent, Button, Grid
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Mail as MailIcon } from '@mui/icons-material';

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
  time: string;
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

        const allSessions: Session[] = [];
        for (const group of groupsData) {
          const sessionsQuery = query(
            collection(db, 'courses'),
            where('groupId', '==', group.id),
            orderBy('date', 'desc')
          );
          const sessionsSnapshot = await getDocs(sessionsQuery);
          const groupSessions: Session[] = sessionsSnapshot.docs.map(doc => {
            const date = doc.data().date;
            let normalizedDate: string;
            if (date && typeof date === 'object' && date.toDate) {
              normalizedDate = date.toDate().toISOString().split('T')[0];
            } else if (typeof date === 'string') {
              normalizedDate = new Date(date).toISOString().split('T')[0];
            } else {
              normalizedDate = new Date().toISOString().split('T')[0];
            }

            return {
              id: doc.id,
              name: doc.data().name || doc.data().title || '',
              date: normalizedDate,
              time: doc.data().time || '00:00',
              moniteurId: doc.data().moniteurId || doc.data().createdBy || '',
              groupId: doc.data().groupId || '',
              isActive: doc.data().isActive || false,
              exercises: doc.data().exercises || []
            };
          });
          allSessions.push(...groupSessions);
        }

        const now = new Date();
        const accessibleSessions = allSessions.filter(session => {
          const sessionDateTime = new Date(session.date + 'T' + session.time);
          return sessionDateTime <= now;
        });

        const sortedSessions = accessibleSessions.sort((a, b) => {
          const dateA = new Date(a.date + 'T' + a.time);
          const dateB = new Date(b.date + 'T' + b.time);
          return dateB.getTime() - dateA.getTime();
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

  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter(session => session.date === today);
  const archivedSessions = sessions.filter(session => session.date < today);

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

      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Séances du jour</Typography>
      {todaySessions.length > 0 ? (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {todaySessions.map((session) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={session.id}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6">{session.name}</Typography>
                  <Typography>Date: {new Date(session.date).toLocaleDateString('fr-FR')}</Typography>
                  <Typography>Heure: {session.time}</Typography>
                  <Typography>Moniteur: {session.moniteurId}</Typography>
                  <Typography>Groupe: {groups.find(g => g.id === session.groupId)?.name || 'Inconnu'}</Typography>
                  <Typography sx={{ mt: 1 }}>
                    <strong>Exercices:</strong> {session.exercises.length}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => navigate(`/client/courses/session/${session.id}`)}
                    >
                      Valider les exercices
                    </Button>
                    <Button
                      variant="outlined"
                      color="info"
                      startIcon={<MailIcon />}
                      onClick={() => navigate(`/client/messages?moniteurId=${session.moniteurId}`)}
                    >
                      Messages
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Typography sx={{ mb: 3 }}>Aucune séance aujourd'hui.</Typography>
      )}

      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Séances archivées</Typography>
      {archivedSessions.length > 0 ? (
        <Grid container spacing={2}>
          {archivedSessions.map((session) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={session.id}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6">{session.name}</Typography>
                  <Typography>Date: {new Date(session.date).toLocaleDateString('fr-FR')}</Typography>
                  <Typography>Heure: {session.time}</Typography>
                  <Typography>Moniteur: {session.moniteurId}</Typography>
                  <Typography>Groupe: {groups.find(g => g.id === session.groupId)?.name || 'Inconnu'}</Typography>
                  <Typography sx={{ mt: 1 }}>
                    <strong>Exercices:</strong> {session.exercises.length}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                    <Button
                      variant="outlined"
                      onClick={() => navigate(`/client/courses/session/${session.id}`)}
                    >
                      Voir les détails
                    </Button>
                    <Button
                      variant="outlined"
                      color="info"
                      startIcon={<MailIcon />}
                      onClick={() => navigate(`/client/messages?moniteurId=${session.moniteurId}`)}
                    >
                      Messages
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