import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection, query, where, getDocs, orderBy, doc, updateDoc, arrayUnion, arrayRemove
} from 'firebase/firestore';
import {
  Container, Typography, Box, CircularProgress, Alert,
  Grid, Card, CardContent, Button
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Mail as MailIcon } from '@mui/icons-material';
import { getSessionStatus } from '../../../utils/courseSessionStatus';

interface Group {
  id: string;
  name: string;
  moniteurId: string;
  students: string[];
}

interface Session {
  id: string;
  name: string;
  description: string;
  date: string;
  time: string;
  moniteurId: string;
  groupId: string;
  activatedAt?: string;
  archivedAt?: string;
  Participants: string[];
  optedOut: string[];
  exercisesCount: number;
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
      setLoading(true);
      try {
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
          const groupSessions: Session[] = sessionsSnapshot.docs
            .map(doc => {
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
                description: doc.data().description || '',
                date: normalizedDate,
                time: doc.data().time || '00:00',
                moniteurId: doc.data().moniteurId || doc.data().createdBy || '',
                groupId: doc.data().groupId || '',
                activatedAt: doc.data().activatedAt,
                archivedAt: doc.data().archivedAt,
                Participants: doc.data().Participants || [],
                optedOut: doc.data().optedOut || [],
                exercisesCount: (doc.data().exercises || []).length
              };
            })
            // ✅ Ne montrer que les séances où le client fait partie de l'instantané
            // pris à la création (pas juste "membre actuel du groupe").
            .filter(session => session.Participants.includes(user.uid));
          allSessions.push(...groupSessions);
        }

        setSessions(allSessions);
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, loadingAuth]);

  const handleToggleOptOut = async (session: Session) => {
    if (!user) return;
    const hasOptedOut = session.optedOut.includes(user.uid);
    try {
      await updateDoc(doc(db, 'courses', session.id), {
        optedOut: hasOptedOut ? arrayRemove(user.uid) : arrayUnion(user.uid)
      });
      setSessions(prev => prev.map(s => s.id === session.id
        ? { ...s, optedOut: hasOptedOut ? s.optedOut.filter(uid => uid !== user.uid) : [...s.optedOut, user.uid] }
        : s));
    } catch (err: any) {
      setError(`Erreur lors de la mise à jour de votre inscription : ${err.message}`);
    }
  };

  const upcomingSessions = sessions.filter(s => getSessionStatus(s) === 'scheduled')
    .sort((a, b) => new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime());
  const activeSessions = sessions.filter(s => getSessionStatus(s) === 'active');
  const archivedSessions = sessions.filter(s => getSessionStatus(s) === 'archived')
    .sort((a, b) => new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime());

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ mt: 4 }}>Mes Cours</Typography>
        <Button
          variant="contained"
          color="info"
          startIcon={<MailIcon />}
          onClick={() => navigate('/client/messages')}
        >
          Messages avec mon moniteur
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Séances à venir</Typography>
      {upcomingSessions.length > 0 ? (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {upcomingSessions.map((session) => {
            const hasOptedOut = session.optedOut.includes(user.uid);
            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={session.id}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6">{session.name}</Typography>
                    <Typography>Date: {new Date(session.date).toLocaleDateString('fr-FR')}</Typography>
                    <Typography>Heure: {session.time}</Typography>
                    <Typography>Groupe: {groups.find(g => g.id === session.groupId)?.name || 'Inconnu'}</Typography>
                    {session.description && (
                      <Typography sx={{ mt: 1 }}>
                        <strong>Objectifs :</strong> {session.description}
                      </Typography>
                    )}
                    {hasOptedOut && (
                      <Alert severity="warning" sx={{ mt: 1 }}>Vous vous êtes désisté(e) de cette séance.</Alert>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                      <Button
                        variant={hasOptedOut ? 'contained' : 'outlined'}
                        color={hasOptedOut ? 'success' : 'error'}
                        onClick={() => handleToggleOptOut(session)}
                      >
                        {hasOptedOut ? 'Je viens finalement' : 'Je ne pourrai pas venir'}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <Typography sx={{ mb: 3 }}>Aucune séance à venir.</Typography>
      )}

      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Séances du jour</Typography>
      {activeSessions.length > 0 ? (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {activeSessions.map((session) => {
            const hasOptedOut = session.optedOut.includes(user.uid);
            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={session.id}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6">{session.name}</Typography>
                    <Typography>Date: {new Date(session.date).toLocaleDateString('fr-FR')}</Typography>
                    <Typography>Heure: {session.time}</Typography>
                    <Typography>Groupe: {groups.find(g => g.id === session.groupId)?.name || 'Inconnu'}</Typography>
                    <Typography sx={{ mt: 1 }}>
                      <strong>Exercices:</strong> {session.exercisesCount}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                      {hasOptedOut ? (
                        <Alert severity="info">Vous vous étiez désisté(e) : accès non disponible.</Alert>
                      ) : (
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={() => navigate(`/client/courses/session/${session.id}`)}
                        >
                          Valider les exercices
                        </Button>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <Typography sx={{ mb: 3 }}>Aucune séance active aujourd'hui.</Typography>
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
                  <Typography>Groupe: {groups.find(g => g.id === session.groupId)?.name || 'Inconnu'}</Typography>
                  <Typography sx={{ mt: 1 }}>
                    <strong>Exercices:</strong> {session.exercisesCount}
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
