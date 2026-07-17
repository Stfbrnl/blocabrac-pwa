import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit as EditIcon, Delete as DeleteIcon, GroupAdd as GroupAddIcon } from '@mui/icons-material';

interface Course {
  id: string;
  title: string;
  description: string;
  date: Date;
  time: string;
  level: string;
  MaxParticipants: number;
  Participants: string[];
  groupId: string;
  createdBy: string;
  createdAt: Date;
}

interface User {
  uid: string;
  displayName: string;
}

const CourseDetail: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [participants, setParticipants] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

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
          } as Course);

          // Charger les participants
          const participantIds = docSnap.data().Participants || [];
          const participantPromises = participantIds.map(async (uid: string) => {
            const userDoc = await getDoc(doc(db, 'users', uid));
            return userDoc.exists() ? { uid: userDoc.id, displayName: userDoc.data().displayName || userDoc.data().email || uid } : null;
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

  const handleAddParticipant = async () => {
    if (!user || !course || !courseId) return;
    try {
      await updateDoc(doc(db, 'courses', courseId), {
        Participants: arrayUnion(user.uid),
      });
      setSuccess('Vous avez été ajouté aux participants !');
      setOpenDialog(false);
    } catch (err) {
      setError(`Erreur lors de l'ajout : ${err}`);
    }
  };

  const handleRemoveParticipant = async () => {
    if (!user || !course || !courseId) return;
    try {
      await updateDoc(doc(db, 'courses', courseId), {
        Participants: arrayRemove(user.uid),
      });
      setSuccess('Vous avez été retiré des participants !');
      setOpenDialog(false);
    } catch (err) {
      setError(`Erreur lors du retrait : ${err}`);
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

  const isParticipant = participants.some((p) => p.uid === user?.uid);
  const canEdit = course.createdBy === user?.uid;

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
        </Box>

        <Typography variant="body1" sx={{ mb: 2 }}>
          {course.description}
        </Typography>

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
                <ListItemText primary={participant.displayName} />
              </ListItem>
            ))
          )}
        </List>

        <Box
          sx={{
            mt: 2,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 2,
          }}
        >
          {!isParticipant ? (
            <Button
              variant="contained"
              color="success"
              startIcon={<GroupAddIcon />}
              onClick={() => setOpenDialog(true)}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              Rejoindre la séance
            </Button>
          ) : (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setOpenDialog(true)}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              Quitter la séance
            </Button>
          )}
          <Button
            variant="outlined"
            onClick={() => navigate('/moniteur/courses')}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Retour à la liste
          </Button>
        </Box>

        <Dialog
          open={openDialog}
          onClose={() => setOpenDialog(false)}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>
            {isParticipant ? 'Quitter la séance' : 'Rejoindre la séance'}
          </DialogTitle>
          <DialogContent>
            {isParticipant
              ? 'Êtes-vous sûr de vouloir quitter cette séance ?'
              : 'Souhaitez-vous rejoindre cette séance ?'}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Annuler</Button>
            <Button
              onClick={isParticipant ? handleRemoveParticipant : handleAddParticipant}
              color={isParticipant ? 'error' : 'success'}
              variant="contained"
            >
              {isParticipant ? 'Quitter' : 'Rejoindre'}
            </Button>
          </DialogActions>
        </Dialog>
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