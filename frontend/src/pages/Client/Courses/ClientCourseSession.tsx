import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, setDoc, getDoc
} from 'firebase/firestore';
import {
  Container, Typography, Box, CircularProgress, Alert,
  Paper, Card, CardContent, CardMedia, Button,
  FormControl, InputLabel, Select, MenuItem, TextField
} from '@mui/material';

const levelColors: Record<string, string> = {
  jaune: '#FFFF00', vert: '#00FF00', bleu: '#0000FF', violet: '#800080',
  rouge: '#FF0000', noir: '#000000', blanc: '#FFFFFF', rose: '#FFC0CB'
};

interface Exercise {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  instructions?: string;
  image_base64?: string;
  type: 'validation' | 'data';
  dataFields?: { label: string; type: 'number' | 'text' | 'time' }[];
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

const ClientCourseSession: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, {
    success?: boolean;
    attempts?: number;
    data?: Record<string, string | number>;
  }>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !sessionId || loadingAuth) return;

    const fetchSession = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, 'courses', sessionId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          setError("Séance introuvable.");
          return;
        }

        const sessionData = docSnap.data();

        let normalizedDate: string;
        if (sessionData.date && typeof sessionData.date === 'object' && sessionData.date.toDate) {
          normalizedDate = sessionData.date.toDate().toISOString().split('T')[0];
        } else if (typeof sessionData.date === 'string') {
          normalizedDate = new Date(sessionData.date).toISOString().split('T')[0];
        } else {
          normalizedDate = new Date().toISOString().split('T')[0];
        }

        const exercisesIds = sessionData.exercises || [];
        const exercisesPromises = exercisesIds.map(async (exerciseId: string) => {
          const exerciseDoc = await getDoc(doc(db, 'exercises', exerciseId));
          if (exerciseDoc.exists()) {
            const exerciseData = exerciseDoc.data();
            return {
              id: exerciseDoc.id,
              name: exerciseData.name || '',
              description: exerciseData.description || '',
              difficulty: exerciseData.difficulty || '',
              instructions: exerciseData.instructions || '',
              image_base64: exerciseData.image_base64 || '',
              type: exerciseData.type || 'data',
              dataFields: exerciseData.dataFields || []
            };
          }
          return null;
        });

        const exercises = (await Promise.all(exercisesPromises)).filter(Boolean) as Exercise[];

        const session: Session = {
          id: docSnap.id,
          name: sessionData.name || sessionData.title || '',
          date: normalizedDate,
          time: sessionData.time || '00:00',
          moniteurId: sessionData.moniteurId || sessionData.createdBy || '',
          groupId: sessionData.groupId || '',
          isActive: sessionData.isActive || false,
          exercises: exercises
        };
        setSession(session);

        const resultsQuery = query(
          collection(db, 'client_course_results'),
          where('userId', '==', user.uid),
          where('courseId', '==', sessionId)
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        const results: Record<string, any> = {};
        resultsSnapshot.forEach(doc => {
          const data = doc.data();
          results[data.exerciseId] = {
            success: data.success,
            attempts: data.attempts,
            data: data.data || {}
          };
        });
        setValidationResults(results);
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [user, sessionId, loadingAuth]);

  const handleValidateExercise = (
    exerciseId: string,
    field: string,
    value: boolean | number | Record<string, string | number>
  ) => {
    setValidationResults(prev => ({
      ...prev,
      [exerciseId]: {
        ...prev[exerciseId],
        [field]: value
      }
    }));
  };

  const handleSubmitResults = async () => {
    if (!user || !session) return;
    try {
      for (const [exerciseId, result] of Object.entries(validationResults)) {
        const resultId = `${user.uid}_${exerciseId}_${session.id}`;
        const resultData: any = {
          userId: user.uid,
          courseId: session.id,
          exerciseId,
          createdAt: new Date().toISOString()
        };
        if (result.success !== undefined) resultData.success = result.success;
        if (result.attempts !== undefined) resultData.attempts = result.attempts;
        if (result.data !== undefined) resultData.data = result.data;

        await setDoc(doc(db, 'client_course_results', resultId), resultData);
      }
      setSuccess("Résultats enregistrés avec succès !");
      setTimeout(() => {
        setSuccess(null);
        navigate('/client/courses');
      }, 3000);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const now = new Date();
  const sessionDateTime = session ? new Date(session.date + 'T' + session.time) : null;
  const isSessionAccessible = session && sessionDateTime && sessionDateTime <= now;

  if (loadingAuth || loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!user || !session) {
    return (
      <Container maxWidth="lg">
        <Alert severity="error">Séance introuvable ou accès refusé.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>
        Séance: {session.name}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Informations
        </Typography>
        <Typography>Date: {new Date(session.date).toLocaleDateString('fr-FR')}</Typography>
        <Typography>Heure: {session.time}</Typography>
        <Typography>Moniteur: {session.moniteurId}</Typography>
        <Typography>Nombre d'exercices: {session.exercises.length}</Typography>
        <Typography>
          Statut: {isSessionAccessible ? 'Accessible' : 'Non encore accessible'}
        </Typography>
      </Paper>

      <Typography variant="h6" sx={{ mb: 2 }}>Exercices</Typography>
      {/* ✅ Largeur relative au lieu de width fixe : 1 carte par ligne sur mobile,
          plusieurs sur écran large, sans jamais déborder ni être trop étroite */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {session.exercises.map((exercise) => {
          const result = validationResults[exercise.id] || {
            data: exercise.dataFields?.reduce((acc, field) => {
              acc[field.label] = '';
              return acc;
            }, {} as Record<string, string | number>) || {}
          };

          return (
            <Card
              key={exercise.id}
              sx={{
                width: { xs: '100%', sm: 'calc(50% - 8px)', md: 300 },
                mb: 2
              }}
            >
              <CardContent>
                <Typography variant="h6">{exercise.name}</Typography>
                <Typography sx={{ mb: 1 }}>{exercise.description}</Typography>
                <Box sx={{
                  backgroundColor: levelColors[exercise.difficulty] || '#CCCCCC',
                  color: ['noir', 'blanc'].includes(exercise.difficulty) ? 'black' : 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  display: 'inline-block',
                  mb: 1
                }}>
                  Niveau: {exercise.difficulty}
                </Box>
                {exercise.instructions && (
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Consignes:</strong> {exercise.instructions}
                  </Typography>
                )}
                {exercise.image_base64 && (
                  <CardMedia
                    component="img"
                    height="150"
                    image={exercise.image_base64}
                    alt={exercise.name}
                    sx={{ objectFit: 'contain', mb: 1 }}
                  />
                )}

                {isSessionAccessible ? (
                  <>
                    {exercise.type === 'validation' ? (
                      <>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          <Button
                            variant={result.success ? "contained" : "outlined"}
                            color="success"
                            size="small"
                            onClick={() => handleValidateExercise(exercise.id, 'success', true)}
                          >
                            ✅ Réussi
                          </Button>
                          <Button
                            variant={!result.success ? "contained" : "outlined"}
                            color="error"
                            size="small"
                            onClick={() => handleValidateExercise(exercise.id, 'success', false)}
                          >
                            ❌ Échoué
                          </Button>
                        </Box>
                        <FormControl fullWidth sx={{ mb: 1 }}>
                          <InputLabel>Nombre d'essais</InputLabel>
                          <Select
                            value={result.attempts || 1}
                            onChange={(e) => handleValidateExercise(exercise.id, 'attempts', e.target.value as number)}
                            label="Nombre d'essais"
                          >
                            {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
                              <MenuItem key={num} value={num}>
                                {num} essai{num > 1 ? 's' : ''}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </>
                    ) : (
                      <Box sx={{ mt: 1 }}>
                        {exercise.dataFields && exercise.dataFields.length > 0 ? (
                          exercise.dataFields.map((field, index) => (
                            <TextField
                              key={index}
                              label={field.label}
                              type={field.type === 'number' ? 'number' : field.type === 'time' ? 'text' : 'text'}
                              value={result.data?.[field.label] || ''}
                              onChange={(e) => handleValidateExercise(
                                exercise.id,
                                'data',
                                { ...result.data, [field.label]: field.type === 'number' ? Number(e.target.value) : e.target.value }
                              )}
                              fullWidth
                              sx={{ mb: 1 }}
                              slotProps={{ inputLabel: { shrink: true } }}
                            />
                          ))
                        ) : (
                          <Typography variant="body2" color="textSecondary">
                            Aucun champ de données défini pour cet exercice.
                          </Typography>
                        )}
                      </Box>
                    )}
                  </>
                ) : (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="textSecondary">
                      Cette séance sera accessible à partir du {new Date(session.date).toLocaleDateString('fr-FR')} à {session.time}.
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {isSessionAccessible && (
        <Box sx={{ display: 'flex', justifyContent: { xs: 'stretch', sm: 'flex-end' }, mt: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmitResults}
            fullWidth={false}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Enregistrer les résultats
          </Button>
        </Box>
      )}
    </Container>
  );
};

export default ClientCourseSession;