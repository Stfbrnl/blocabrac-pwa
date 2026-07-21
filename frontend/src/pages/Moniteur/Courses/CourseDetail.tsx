import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  CircularProgress,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Alert,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit as EditIcon, PlayArrow as PlayArrowIcon, Archive as ArchiveIcon } from '@mui/icons-material';
import { getSessionStatus, canActivate, type SessionStatus } from '../../../utils/courseSessionStatus';

interface Course {
  id: string;
  title: string;
  description: string;
  date: Date;
  time: string;
  level: string;
  MaxParticipants: number;
  Participants: string[];
  optedOut: string[];
  groupId: string;
  createdBy: string;
  createdAt: Date;
  activatedAt?: string;
  archivedAt?: string;
}

interface User {
  uid: string;
  name: string;
}

const statusLabels: Record<SessionStatus, { label: string; color: 'default' | 'success' | 'info' }> = {
  scheduled: { label: 'Programmée', color: 'default' },
  active: { label: 'Active', color: 'success' },
  archived: { label: 'Archivée', color: 'info' },
};

const CourseDetail: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [participants, setParticipants] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !courseId) return;

    const fetchCourse = async () => {
      try {
        const docRef = doc(db, 'courses', courseId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setCourse({
            id: docSnap.id,
            ...docSnap.data(),
            date: docSnap.data().date?.toDate() || new Date(),
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
            Participants: docSnap.data().Participants || [],
            optedOut: docSnap.data().optedOut || [],
          } as Course);

          // Charger les participants
          const participantIds = docSnap.data().Participants || [];
          const participantPromises = participantIds.map(async (uid: string) => {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (!userDoc.exists()) return null;
            const data = userDoc.data();
            const name = `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.email || uid;
            return { uid: userDoc.id, name };
          });
          const resolvedParticipants = (await Promise.all(participantPromises)).filter(Boolean) as User[];
          setParticipants(resolvedParticipants);
        }
      } catch (err) {
        setError(`Erreur lors du chargement de la séance : ${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCourse();
  }, [user, courseId]);

  const handleActivate = async () => {
    if (!course) return;
    try {
      await updateDoc(doc(db, 'courses', course.id), { activatedAt: new Date().toISOString() });
      setCourse({ ...course, activatedAt: new Date().toISOString() });
      setSuccess('Séance activée : les clients inscrits peuvent maintenant valider les exercices.');
    } catch (err) {
      setError(`Erreur lors de l'activation : ${err}`);
    }
  };

  const handleArchive = async () => {
    if (!course) return;
    try {
      await updateDoc(doc(db, 'courses', course.id), { archivedAt: new Date().toISOString() });
      setCourse({ ...course, archivedAt: new Date().toISOString() });
      setSuccess('Séance archivée.');
    } catch (err) {
      setError(`Erreur lors de l'archivage : ${err}`);
    }
  };

  const handleCloseSnackbar = () => {
    setError(null);
    setSuccess(null);
  };

  if (loadingAuth || isLoading || !course) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const canEdit = course.createdBy === user?.uid;
  const sessionLike = { date: course.date.toISOString().split('T')[0], activatedAt: course.activatedAt, archivedAt: course.archivedAt };
  const status = getSessionStatus(sessionLike);

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
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
          <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            {course.title}
          </Typography>
          {canEdit && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<EditIcon />}
              onClick={() => navigate(`/moniteur/courses/edit/${course.id}`)}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              Modifier
            </Button>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" color="text.secondary">
            <strong>Date :</strong> {course.date.toLocaleDateString('fr-FR')} à {course.time}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            <strong>Niveau :</strong> {course.level}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            <strong>Participants :</strong> {participants.length}/{course.MaxParticipants}
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" color="text.secondary">
              <strong>Statut :</strong>
            </Typography>
            <Chip label={statusLabels[status].label} color={statusLabels[status].color} size="small" />
          </Box>
        </Box>

        <Typography variant="body1" sx={{ mb: 2 }}>
          {course.description}
        </Typography>

        {canEdit && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            {canActivate(sessionLike) && (
              <Button variant="contained" color="success" startIcon={<PlayArrowIcon />} onClick={handleActivate}>
                Activer (séance du jour)
              </Button>
            )}
            {status === 'active' && (
              <Button variant="outlined" color="info" startIcon={<ArchiveIcon />} onClick={handleArchive}>
                Archiver maintenant
              </Button>
            )}
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" gutterBottom>
          Participants ({participants.length}/{course.MaxParticipants})
        </Typography>
        <List>
          {participants.length === 0 ? (
            <ListItem>
              <ListItemText primary="Aucun participant inscrit." />
            </ListItem>
          ) : (
            participants.map((participant) => (
              <ListItem key={participant.uid}>
                <ListItemText primary={participant.name} />
                {course.optedOut.includes(participant.uid) && (
                  <Chip label="Désisté" size="small" color="warning" />
                )}
              </ListItem>
            ))
          )}
        </List>

        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            onClick={() => navigate('/moniteur/courses')}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Retour à la liste
          </Button>
        </Box>
      </Paper>

      <Snackbar
        open={!!error || !!success}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={error ? 'error' : 'success'}
          sx={{ width: '100%' }}
        >
          {error || success}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default CourseDetail;
