import React, { useState, useEffect, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove
} from 'firebase/firestore';
import {
  Container, Typography, Box, CircularProgress, Alert,
  Paper, Card, CardContent, CardMedia, Button,
  FormControl, InputLabel, Select, MenuItem, TextField, Chip
} from '@mui/material';
import { getSessionStatus, type SessionStatus } from '../../../utils/courseSessionStatus';
import { calculatePoints } from '../../../utils/climbingPoints';
import { getBoulderImageUrl } from '../../../services/imageStorage';

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

interface MiniCompetitionBoulder {
  id: string;
  wall: string;
  number: number | string;
  color?: string;
  image_base64?: string;
  image_public_id?: string;
  is_child_route?: boolean;
}

interface MiniCompetition {
  id: string;
  name: string;
  boulders: MiniCompetitionBoulder[];
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
  exercises: Exercise[];
  miniCompetitionsCount: number;
  miniCompetitions: MiniCompetition[];
}

interface ValidationResult {
  success?: boolean;
  attempts?: number;
  data?: Record<string, string | number>;
}

interface BoulderValidationResult {
  success?: boolean;
  attempts?: number;
}

const statusLabels: Record<SessionStatus, string> = {
  scheduled: 'À venir',
  active: 'Active',
  archived: 'Archivée',
};

const ClientCourseSession: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({});
  const [boulderResults, setBoulderResults] = useState<Record<string, BoulderValidationResult>>({});
  const navigate = useNavigate();

  // ✅ Écriture au fil de l'eau (même principe que ClientCompetitions.tsx,
  // chantier 1) : sans ça, toute la progression d'une séance restait en state
  // React jusqu'au clic final "Enregistrer les résultats" — un onglet fermé ou
  // un rechargement avant ce clic perdait tout. `debounceEntries` évite une
  // écriture à chaque interaction avec un Select/TextField ; les clics
  // Réussi/Échoué, eux, écrivent toujours immédiatement.
  // ✅ Chantier écritures point 4 : 2500ms (au lieu de 800ms), sûr uniquement
  // parce que les trois conditions du suivi sont tenues : flush à la
  // soumission (handleSubmitResults), flush sur "pagehide" plus bas, et le
  // clic Réussi/Échoué reste immédiat.
  const DEBOUNCE_MS = 2500;
  // Stocke aussi un callback de flush (pas seulement le timer), pour pouvoir
  // écrire immédiatement sans attendre le délai — voir flushPendingResults.
  const debounceEntries = useRef<Record<string, { timer: ReturnType<typeof setTimeout>; flush: () => void }>>({});
  // ✅ Ids déjà persistés (chargés au montage ou écrits cette session) : ne pose
  // createdAt qu'une seule fois par document (lu par ClientStats.tsx comme date
  // de validation).
  const persistedExerciseIds = useRef<Set<string>>(new Set());
  const persistedBoulderResultIds = useRef<Set<string>>(new Set());
  // ✅ Chantier écritures point 3 : dernière valeur réellement PERSISTÉE (pas
  // affichée) par exercice/bloc — persist* compare avant d'écrire.
  const lastPersistedExerciseRef = useRef<Record<string, ValidationResult>>({});
  const lastPersistedBoulderRef = useRef<Record<string, BoulderValidationResult>>({});

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

        const exercisesIds: string[] = sessionData.exercises || [];
        const status = getSessionStatus({
          date: normalizedDate,
          activatedAt: sessionData.activatedAt,
          archivedAt: sessionData.archivedAt,
        });

        // ✅ Tant que la séance n'est pas active/archivée, on ne va même pas chercher
        // le détail des exercices (nom/instructions/image) : seul le nombre est utile
        // pour respecter "objectifs visibles, contenu caché".
        let exercises: Exercise[] = [];
        if (status !== 'scheduled') {
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
          exercises = (await Promise.all(exercisesPromises)).filter(Boolean) as Exercise[];
        }

        // ✅ Même règle de visibilité que les exercices : le détail (et donc les
        // blocs) n'est chargé qu'une fois la séance active/archivée.
        const miniCompetitionIds: string[] = sessionData.miniCompetitions || [];
        let miniCompetitions: MiniCompetition[] = [];
        if (status !== 'scheduled' && miniCompetitionIds.length > 0) {
          const miniCompetitionsPromises = miniCompetitionIds.map(async (miniCompetitionId: string) => {
            const miniCompetitionDoc = await getDoc(doc(db, 'mini_competitions', miniCompetitionId));
            if (!miniCompetitionDoc.exists()) return null;
            const miniCompetitionData = miniCompetitionDoc.data();
            const boulderIds: string[] = miniCompetitionData.boulderIds || [];
            const bouldersPromises = boulderIds.map(async (boulderId: string) => {
              const boulderDoc = await getDoc(doc(db, 'boulders', boulderId));
              if (!boulderDoc.exists()) return null;
              const boulderData = boulderDoc.data();
              return {
                id: boulderDoc.id,
                wall: boulderData.wall || '',
                number: boulderData.number || '?',
                color: boulderData.color,
                image_base64: boulderData.image_base64,
                image_public_id: boulderData.image_public_id,
                is_child_route: boulderData.is_child_route || false,
              } as MiniCompetitionBoulder;
            });
            const boulders = (await Promise.all(bouldersPromises)).filter(Boolean) as MiniCompetitionBoulder[];
            return { id: miniCompetitionDoc.id, name: miniCompetitionData.name || '', boulders } as MiniCompetition;
          });
          miniCompetitions = (await Promise.all(miniCompetitionsPromises)).filter(Boolean) as MiniCompetition[];
        }

        const session: Session = {
          id: docSnap.id,
          name: sessionData.name || sessionData.title || '',
          description: sessionData.description || '',
          date: normalizedDate,
          time: sessionData.time || '00:00',
          moniteurId: sessionData.moniteurId || sessionData.createdBy || '',
          groupId: sessionData.groupId || '',
          activatedAt: sessionData.activatedAt,
          archivedAt: sessionData.archivedAt,
          Participants: sessionData.Participants || [],
          optedOut: sessionData.optedOut || [],
          exercisesCount: exercisesIds.length,
          exercises,
          miniCompetitionsCount: miniCompetitionIds.length,
          miniCompetitions,
        };
        setSession(session);

        const resultsQuery = query(
          collection(db, 'client_course_results'),
          where('userId', '==', user.uid),
          where('courseId', '==', sessionId)
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        const results: Record<string, ValidationResult> = {};
        const boulderResultsData: Record<string, BoulderValidationResult> = {};
        resultsSnapshot.forEach(doc => {
          const data = doc.data();
          if (data.boulderId) {
            boulderResultsData[data.boulderId] = {
              success: data.success,
              attempts: data.attempts,
            };
            persistedBoulderResultIds.current.add(data.boulderId);
            lastPersistedBoulderRef.current[data.boulderId] = boulderResultsData[data.boulderId];
          } else {
            results[data.exerciseId] = {
              success: data.success,
              attempts: data.attempts,
              data: data.data || {}
            };
            persistedExerciseIds.current.add(data.exerciseId);
            lastPersistedExerciseRef.current[data.exerciseId] = results[data.exerciseId];
          }
        });
        setValidationResults(results);
        setBoulderResults(boulderResultsData);
      } catch (err: unknown) {
        setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [user, sessionId, loadingAuth]);

  // ✅ Écrit un exercice dans Firestore (merge: true), en plus de l'état React
  // local qui pilote l'affichage immédiat. Ne pose createdAt que sur la
  // première écriture du document (voir persistedExerciseIds).
  // ✅ Chantier écritures point 3 : rien à écrire si le résultat est identique
  // à la dernière valeur réellement persistée (voir lastPersistedExerciseRef).
  const persistExerciseResult = async (exerciseId: string, result: ValidationResult) => {
    if (!user || !session) return;
    const last = lastPersistedExerciseRef.current[exerciseId];
    if (last &&
        last.success === result.success &&
        last.attempts === result.attempts &&
        JSON.stringify(last.data ?? {}) === JSON.stringify(result.data ?? {})) {
      return;
    }
    const resultId = `${user.uid}_${exerciseId}_${session.id}`;
    const isFirstWrite = !persistedExerciseIds.current.has(exerciseId);
    const resultData: Record<string, unknown> = {
      userId: user.uid,
      courseId: session.id,
      exerciseId,
      ...(isFirstWrite ? { createdAt: new Date().toISOString() } : {}),
      updatedAt: new Date().toISOString()
    };
    if (result.success !== undefined) resultData.success = result.success;
    if (result.attempts !== undefined) resultData.attempts = result.attempts;
    if (result.data !== undefined) resultData.data = result.data;
    try {
      await setDoc(doc(db, 'client_course_results', resultId), resultData, { merge: true });
      persistedExerciseIds.current.add(exerciseId);
      lastPersistedExerciseRef.current[exerciseId] = result;
    } catch (err: unknown) {
      // ✅ Processus "erreurs avalées" (PROCESSUS-erreurs-avalees.md §2 niveau 1, V2.47) :
      // le message utilisateur (setError, déjà présent) ne remplace pas la trace console.
      console.error(`Erreur lors de l'enregistrement du résultat de l'exercice ${exerciseId}:`, err);
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ✅ Blocs des mini-compétitions : la couleur est enregistrée telle qu'au
  // moment de la validation (plutôt que relue en direct sur le bloc), pour que
  // le classement ne bouge pas si le bloc est recoté plus tard.
  // ✅ Chantier écritures point 3 : même comparaison avant écriture que pour
  // les exercices (voir lastPersistedBoulderRef).
  const persistBoulderResult = async (
    boulderId: string, miniCompetitionId: string, boulderColor: string, result: BoulderValidationResult
  ) => {
    if (!user || !session || result.success === undefined) return;
    const last = lastPersistedBoulderRef.current[boulderId];
    if (last && last.success === result.success && last.attempts === result.attempts) {
      return;
    }
    const resultId = `${user.uid}_mini_${boulderId}_${session.id}`;
    const isFirstWrite = !persistedBoulderResultIds.current.has(boulderId);
    try {
      await setDoc(doc(db, 'client_course_results', resultId), {
        userId: user.uid,
        courseId: session.id,
        miniCompetitionId,
        boulderId,
        boulderColor,
        success: result.success,
        attempts: result.attempts || 1,
        ...(isFirstWrite ? { createdAt: new Date().toISOString() } : {}),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      persistedBoulderResultIds.current.add(boulderId);
      lastPersistedBoulderRef.current[boulderId] = result;
    } catch (err: unknown) {
      // ✅ Processus "erreurs avalées" (PROCESSUS-erreurs-avalees.md §2 niveau 1, V2.47).
      console.error(`Erreur lors de l'enregistrement du résultat du bloc ${boulderId} (mini-compétition):`, err);
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ✅ Chantier écritures point 4 : vide immédiatement les écritures en
  // attente de debounce (sans attendre les 2500ms) — appelé à la soumission et
  // sur "pagehide".
  const flushPendingResults = () => {
    Object.values(debounceEntries.current).forEach(({ timer, flush }) => {
      clearTimeout(timer);
      flush();
    });
    debounceEntries.current = {};
  };

  useEffect(() => {
    window.addEventListener('pagehide', flushPendingResults);
    return () => window.removeEventListener('pagehide', flushPendingResults);
  }, []);

  const handleValidateExercise = (
    exerciseId: string,
    field: string,
    value: boolean | number | Record<string, string | number>,
    immediate: boolean = false
  ) => {
    const updated: ValidationResult = { ...validationResults[exerciseId], [field]: value };
    setValidationResults(prev => ({ ...prev, [exerciseId]: updated }));

    const timerKey = `ex_${exerciseId}`;
    if (immediate) {
      // ✅ Réussi/Échoué : écriture immédiate, jamais de debounce — c'est
      // l'information qu'on ne veut jamais perdre.
      if (debounceEntries.current[timerKey]) {
        clearTimeout(debounceEntries.current[timerKey].timer);
        delete debounceEntries.current[timerKey];
      }
      persistExerciseResult(exerciseId, updated);
    } else {
      // ✅ Essais / données saisies : debounce (voir DEBOUNCE_MS) pour éviter
      // une écriture à chaque interaction avec un Select/TextField.
      if (debounceEntries.current[timerKey]) {
        clearTimeout(debounceEntries.current[timerKey].timer);
      }
      const flush = () => persistExerciseResult(exerciseId, updated);
      const timer = setTimeout(() => { flush(); delete debounceEntries.current[timerKey]; }, DEBOUNCE_MS);
      debounceEntries.current[timerKey] = { timer, flush };
    }
  };

  const handleValidateBoulder = (
    boulderId: string,
    miniCompetitionId: string,
    boulderColor: string,
    field: 'success' | 'attempts',
    value: boolean | number,
    immediate: boolean = false
  ) => {
    const updated: BoulderValidationResult = { ...boulderResults[boulderId], [field]: value };
    setBoulderResults(prev => ({ ...prev, [boulderId]: updated }));

    const timerKey = `mini_${boulderId}`;
    if (immediate) {
      if (debounceEntries.current[timerKey]) {
        clearTimeout(debounceEntries.current[timerKey].timer);
        delete debounceEntries.current[timerKey];
      }
      persistBoulderResult(boulderId, miniCompetitionId, boulderColor, updated);
    } else {
      if (debounceEntries.current[timerKey]) {
        clearTimeout(debounceEntries.current[timerKey].timer);
      }
      const flush = () => persistBoulderResult(boulderId, miniCompetitionId, boulderColor, updated);
      const timer = setTimeout(() => { flush(); delete debounceEntries.current[timerKey]; }, DEBOUNCE_MS);
      debounceEntries.current[timerKey] = { timer, flush };
    }
  };

  const handleSubmitResults = async () => {
    if (!user || !session) return;
    try {
      // ✅ Les résultats sont déjà écrits au fil de l'eau (persistExerciseResult
      // / persistBoulderResult, voir plus haut) à chaque validation — "Enregistrer"
      // ne fait plus qu'annuler les debounces en attente et réécrire l'état
      // courant (idempotent, et sans effet grâce au point 3 si rien n'a
      // changé), pour garantir qu'aucune saisie très récente ne soit perdue
      // avant la navigation.
      flushPendingResults();

      await Promise.all([
        ...Object.entries(validationResults).map(([exerciseId, result]) =>
          persistExerciseResult(exerciseId, result)
        ),
        ...session.miniCompetitions.flatMap((miniCompetition) =>
          miniCompetition.boulders
            .filter((boulder) => boulderResults[boulder.id]?.success !== undefined)
            .map((boulder) =>
              persistBoulderResult(boulder.id, miniCompetition.id, boulder.color || '', boulderResults[boulder.id])
            )
        ),
      ]);

      setSuccess("Résultats enregistrés avec succès !");
      setTimeout(() => {
        setSuccess(null);
        navigate('/client/courses');
      }, 3000);
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleToggleOptOut = async () => {
    if (!user || !session) return;
    const hasOptedOut = session.optedOut.includes(user.uid);
    try {
      await updateDoc(doc(db, 'courses', session.id), {
        optedOut: hasOptedOut ? arrayRemove(user.uid) : arrayUnion(user.uid)
      });
      setSession({
        ...session,
        optedOut: hasOptedOut ? session.optedOut.filter(uid => uid !== user.uid) : [...session.optedOut, user.uid]
      });
    } catch (err: unknown) {
      setError(`Erreur lors de la mise à jour de votre inscription : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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

  const status = getSessionStatus(session);
  const isParticipant = session.Participants.includes(user.uid);
  const hasOptedOut = session.optedOut.includes(user.uid);
  // ✅ Une fois active, seuls les clients encore inscrits (pas désistés) peuvent valider.
  const canValidate = status === 'active' && isParticipant && !hasOptedOut;

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
        <Typography>Nombre d'exercices: {session.exercisesCount}</Typography>
        {session.miniCompetitionsCount > 0 && (
          <Typography>Mini-compétitions: {session.miniCompetitionsCount}</Typography>
        )}
        {session.description && (
          <Typography sx={{ mt: 1 }}><strong>Objectifs :</strong> {session.description}</Typography>
        )}
        <Box sx={{ mt: 1 }}>
          <Chip label={statusLabels[status]} color={status === 'active' ? 'success' : status === 'archived' ? 'info' : 'default'} size="small" />
        </Box>

        {status === 'scheduled' && isParticipant && (
          <Box sx={{ mt: 2 }}>
            {hasOptedOut && <Alert severity="warning" sx={{ mb: 1 }}>Vous vous êtes désisté(e) de cette séance.</Alert>}
            <Button
              variant={hasOptedOut ? 'contained' : 'outlined'}
              color={hasOptedOut ? 'success' : 'error'}
              onClick={handleToggleOptOut}
            >
              {hasOptedOut ? 'Je viens finalement' : 'Je ne pourrai pas venir'}
            </Button>
          </Box>
        )}
      </Paper>

      {status === 'scheduled' ? (
        <Alert severity="info">
          Le contenu de cette séance (exercices) sera visible une fois qu'elle sera activée par votre moniteur, le jour même.
        </Alert>
      ) : !isParticipant ? (
        <Alert severity="error">Vous ne faites pas partie des participants inscrits à cette séance.</Alert>
      ) : (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>Exercices</Typography>
          {status === 'active' && !canValidate && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Vous vous êtes désisté(e) de cette séance : accès à la validation non disponible.
            </Alert>
          )}
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

                    {canValidate ? (
                      <>
                        {exercise.type === 'validation' ? (
                          <>
                            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                              <Button
                                variant={result.success ? "contained" : "outlined"}
                                color="success"
                                size="small"
                                onClick={() => handleValidateExercise(exercise.id, 'success', true, true)}
                              >
                                ✅ Réussi
                              </Button>
                              <Button
                                variant={!result.success ? "contained" : "outlined"}
                                color="error"
                                size="small"
                                onClick={() => handleValidateExercise(exercise.id, 'success', false, true)}
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
                      // ✅ Séance archivée (ou accès non autorisé) : résultats en lecture seule.
                      <Box sx={{ mt: 1 }}>
                        {result.success !== undefined ? (
                          <Chip
                            label={result.success ? `Réussi (${result.attempts || 1} essai(s))` : 'Échoué'}
                            color={result.success ? 'success' : 'error'}
                            size="small"
                          />
                        ) : result.data && Object.keys(result.data).length > 0 ? (
                          Object.entries(result.data).map(([label, value]) => (
                            <Typography key={label} variant="body2">{label} : {String(value)}</Typography>
                          ))
                        ) : (
                          <Typography variant="body2" color="textSecondary">Aucun résultat enregistré.</Typography>
                        )}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </Box>

          {session.miniCompetitions.map((miniCompetition) => (
            <Box key={miniCompetition.id} sx={{ mt: 4 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>🏆 Mini-compétition : {miniCompetition.name}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {miniCompetition.boulders.map((boulder) => {
                  const result = boulderResults[boulder.id] || {};
                  return (
                    <Card
                      key={boulder.id}
                      sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 300 }, mb: 2 }}
                    >
                      {(boulder.image_public_id || boulder.image_base64) && (
                        <CardMedia
                          component="img"
                          height="150"
                          image={boulder.image_public_id ? getBoulderImageUrl(boulder.image_public_id, 'thumb') : boulder.image_base64}
                          alt={`Bloc ${boulder.number}`}
                          sx={{ objectFit: 'contain' }}
                        />
                      )}
                      <CardContent>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Bloc n°{boulder.number} - {boulder.wall}
                          {boulder.is_child_route && <Chip label="🐒 Enfant" size="small" color="info" sx={{ ml: 1 }} />}
                        </Typography>
                        <Box sx={{
                          backgroundColor: levelColors[boulder.color || ''] || '#CCCCCC',
                          color: ['noir', 'blanc'].includes(boulder.color || '') ? 'black' : 'white',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          mb: 1
                        }}>
                          {boulder.color || 'Non spécifiée'}
                        </Box>

                        {canValidate ? (
                          <>
                            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                              <Button
                                variant={result.success ? "contained" : "outlined"}
                                color="success"
                                size="small"
                                onClick={() => handleValidateBoulder(boulder.id, miniCompetition.id, boulder.color || '', 'success', true, true)}
                              >
                                ✅ Réussi
                              </Button>
                              <Button
                                variant={result.success === false ? "contained" : "outlined"}
                                color="error"
                                size="small"
                                onClick={() => handleValidateBoulder(boulder.id, miniCompetition.id, boulder.color || '', 'success', false, true)}
                              >
                                ❌ Échoué
                              </Button>
                            </Box>
                            <FormControl fullWidth sx={{ mb: 1 }}>
                              <InputLabel>Nombre d'essais</InputLabel>
                              <Select
                                value={result.attempts || 1}
                                onChange={(e) => handleValidateBoulder(boulder.id, miniCompetition.id, boulder.color || '', 'attempts', e.target.value as number)}
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
                            {result.success !== undefined ? (
                              <Chip
                                label={result.success ? `Réussi (${result.attempts || 1} essai(s)) — ${calculatePoints(boulder.color || '', result.attempts || 1, result.success)} pts` : 'Échoué'}
                                color={result.success ? 'success' : 'error'}
                                size="small"
                              />
                            ) : (
                              <Typography variant="body2" color="textSecondary">Aucun résultat enregistré.</Typography>
                            )}
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </Box>
          ))}

          {canValidate && (
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
        </>
      )}
    </Container>
  );
};

export default ClientCourseSession;
