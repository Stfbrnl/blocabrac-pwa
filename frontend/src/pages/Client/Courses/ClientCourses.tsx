import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import {
  Container, Typography, Box, Paper, Button, CircularProgress,
  Alert, Card, CardContent, CardHeader, Chip
} from '@mui/material';

const ClientCourses: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user || loadingAuth) return;
    const fetchCourses = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'courses'),
          where('Participants', 'array-contains', user.uid)
        );
        const snapshot = await getDocs(q);
        setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, [user, loadingAuth]);

  const handleValidateExercise = async (courseId: string, exerciseId: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'client_course_results'), {
        userId: user.uid,
        courseId,
        exerciseId,
        success: true,
        attempts: 1,
        createdAt: new Date().toISOString()
      });
      setSuccess('Exercice validé!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  if (loadingAuth || loading) return <Container maxWidth="lg"><Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box></Container>;
  if (!user) return null;

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>Mes cours</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {courses.length === 0 ? (
        <Typography sx={{ textAlign: 'center', mt: 4 }}>Aucun cours disponible.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {courses.map(course => (
            <Card key={course.id} sx={{ width: { xs: '100%', sm: '45%', md: '30%' } }}>
              <CardHeader title={course.title} subheader={`${course.date} à ${course.time}`} />
              <CardContent>
                <Typography variant="body2">Niveau: {course.level}</Typography>
                <Typography variant="body2">Participants: {course.Participants?.length || 0}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>{course.description}</Typography>
                <Box sx={{ mt: 2 }}>
                  {course.exercises?.map((exerciseId: string) => (
                    <Chip
                      key={exerciseId}
                      label={`Exercice ${exerciseId}`}
                      sx={{ mr: 1, mb: 1 }}
                      onClick={() => handleValidateExercise(course.id, exerciseId)}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Container>
  );
};

export default ClientCourses;