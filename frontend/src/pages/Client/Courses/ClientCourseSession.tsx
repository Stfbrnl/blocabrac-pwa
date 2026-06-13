import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, setDoc
} from 'firebase/firestore';
import {
  Container, Typography, Box, CircularProgress, Alert,
  Paper, Card, CardContent, CardMedia, Button,
  FormControl, InputLabel, Select, MenuItem, Rating, Chip
} from '@mui/material';

// Couleurs des niveaux
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

const ClientCourseSession: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, {
    success: boolean;
    attempts: number;
    rating: number;
  }>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !sessionId || loadingAuth) return;

    const fetchSession = async () => {
      try {
        setLoading(true);
        const docSnapshot = await getDocs(
          query(collection(db, 'courses'), where('__name__', '==', sessionId))
        );
        if (docSnapshot.empty) {
          setError("Séance introuvable.");
          return;
        }
        const sessionData = docSnapshot.docs[0];
        const session: Session = {
          id: sessionData.id,
          name: sessionData.data().name || '',
          date: sessionData.data().date || '',
          moniteurId: sessionData.data().moniteurId || '',
          groupId: sessionData.data().groupId || '',
          isActive: sessionData.data().isActive || false,
          exercises: sessionData.data().exercises || []
        };
        setSession(session);
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [user, sessionId, loadingAuth]);

  const handleValidateExercise = (exerciseId: string, success: boolean, attempts: number, rating: number) => {
    setValidationResults(prev => ({
      ...prev,
      [exerciseId]: { success, attempts, rating }
    }));
  };

  const handleSubmitResults = async () => {
    if (!user || !session) return;
    try {
      for (const [exerciseId, result] of Object.entries(validationResults)) {
        const resultId = `${user.uid}_${exerciseId}_${session.id}`;
        await setDoc(doc(db, 'client_course_results', resultId), {
          userId: user.uid,
          courseId: session.id,
          exerciseId,
          success: result.success,
          attempts: result.attempts,
          rating: result.rating,
          createdAt: new Date().toISOString()
        });
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

  // Vérifier si la séance est du jour (pour autoriser la validation)
  const today = new Date().toISOString().split('T')[0];
  const isTodaySession = session?.date === today && session?.isActive;

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
        <Typography>Date: {new Date(session.date).toLocaleDateString()}</Typography>
        <Typography>Moniteur: {session.moniteurId}</Typography>
        <Typography>Nombre d'exercices: {session.exercises.length}</Typography>
        <Typography>
          Statut: {isTodaySession ? (
            <Chip label="Séance du jour" color="success" />
          ) : (
            <Chip label="Séance archivée" color="default" />
          )}
        </Typography>
      </Paper>

      <Typography variant="h6" sx={{ mb: 2 }}>Exercices</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {session.exercises.map((exercise) => {
          const result = validationResults[exercise.id] || {
            success: false,
            attempts: 1,
            rating: 0
          };
          return (
            <Card key={exercise.id} sx={{ width: 300, mb: 2 }}>
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

                {/* Validation (uniquement pour les séances du jour) */}
                {isTodaySession ? (
                  <>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <Button
                        variant={result.success ? "contained" : "outlined"}
                        color="success"
                        size="small"
                        onClick={() => handleValidateExercise(
                          exercise.id,
                          true,
                          result.attempts,
                          result.rating
                        )}
                      >
                        ✅ Réussi
                      </Button>
                      <Button
                        variant={!result.success ? "contained" : "outlined"}
                        color="error"
                        size="small"
                        onClick={() => handleValidateExercise(
                          exercise.id,
                          false,
                          result.attempts,
                          result.rating
                        )}
                      >
                        ❌ Échoué
                      </Button>
                    </Box>
                    <FormControl fullWidth sx={{ mb: 1 }}>
                      <InputLabel>Nombre d'essais</InputLabel>
                      <Select
                        value={result.attempts}
                        onChange={(e) => handleValidateExercise(
                          exercise.id,
                          result.success,
                          e.target.value as number,
                          result.rating
                        )}
                        label="Nombre d'essais"
                      >
                        {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
                          <MenuItem key={num} value={num}>
                            {num} essai{num > 1 ? 's' : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography>Note: </Typography>
                      <Rating
                        name={`rating-${exercise.id}`}
                        value={result.rating}
                        onChange={(e, newValue) => handleValidateExercise(
                          exercise.id,
                          result.success,
                          result.attempts,
                          newValue || 0
                        )}
                      />
                    </Box>
                  </>
                ) : (
                  // ✅ Séance archivée : affichage en lecture seule
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Statut:</strong> {result.success ? '✅ Réussi' : '❌ Échoué'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Essais:</strong> {result.attempts}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Note:</strong> {result.rating}/5
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Bouton de soumission (uniquement pour les séances du jour) */}
      {isTodaySession && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmitResults}
          >
            Enregistrer les résultats
          </Button>
        </Box>
      )}
    </Container>
  );
};

export default ClientCourseSession;