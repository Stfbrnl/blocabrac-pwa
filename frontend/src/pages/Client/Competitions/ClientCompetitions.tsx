import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc, setDoc
} from 'firebase/firestore';
import {
  Container, Typography, Box, Button, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Paper,
  Grid, Card, CardContent, CardMedia, Rating, TextField,
  FormControl, InputLabel, Select, MenuItem, Chip
} from '@mui/material';

// Couleurs des niveaux
const levelColors: Record<string, string> = {
  jaune: '#FFFF00',
  vert: '#00FF00',
  bleu: '#0000FF',
  violet: '#800080',
  rouge: '#FF0000',
  noir: '#000000',
  blanc: '#FFFFFF',
  rose: '#FFC0CB'
};

// ✅ Ordre des niveaux (pour les comparaisons)
const levelOrder: string[] = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noire', 'blanc', 'rose'];

// Points par couleur
const basePoints: Record<string, number> = {
  vert: 50, bleu: 100, violet: 200, rouge: 400, noir: 600, blanc: 800, rose: 1000
};

// Déductions par essai
const deductions: Record<string, number> = {
  vert: 10, bleu: 10, violet: 10, rouge: 20, noir: 20, blanc: 50, rose: 50
};

interface Competition {
  id: string;
  name: string;
  date: string;
  status: 'à venir' | 'en cours' | 'terminée' | 'annulée';
  access_code: string;
  max_participants: number;
  registered_count: number;
  minLevel?: string; // ✅ Nouveau : Niveau minimum
  maxLevel?: string; // ✅ Nouveau : Niveau maximum
}

interface Boulder {
  id: string;
  number: number;
  wall: string;
  difficulty: string;
  difficulty_level?: string;
  difficulty_types?: string[];
  instructions?: string;
  image_base64?: string;
  competition_id?: string;
  is_active: boolean;
  color?: string;
}

const ClientCompetitions: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modales
  const [openRegisterDialog, setOpenRegisterDialog] = useState(false);
  const [openValidationDialog, setOpenValidationDialog] = useState(false);

  // États pour la validation
  const [validationResults, setValidationResults] = useState<Record<string, {
    success: boolean;
    attempts: number;
    rating: number;
    proposedDifficulty: string;
  }>>({});

  // Tous les utilisateurs (pour vérifier niveau/accès)
  const [allUsers, setAllUsers] = useState<any[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const users = snapshot.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));
        setAllUsers(users);
      } catch (err) {
        console.error('Erreur fetch users', err);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'competitions'),
          where('status', '==', 'en cours')
        );
        const snapshot = await getDocs(q);
        const competitionsData: Competition[] = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          date: doc.data().date || '',
          status: doc.data().status || 'à venir',
          access_code: doc.data().access_code || '',
          max_participants: doc.data().max_participants || 0,
          registered_count: doc.data().registered_count || 0,
          minLevel: doc.data().minLevel, // ✅ Nouveau
          maxLevel: doc.data().maxLevel  // ✅ Nouveau
        }));
        setCompetitions(competitionsData);
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompetitions();
  }, [user, loadingAuth]);

  const loadBoulders = async (competition: Competition) => {
    try {
      setLoading(true);
      setSelectedCompetition(competition);
      const q = query(
        collection(db, 'boulders'),
        where('competition_id', '==', competition.id),
        where('is_active', '==', true),
        where('type', '==', 'competition')
      );
      const snapshot = await getDocs(q);
      const bouldersData: Boulder[] = snapshot.docs.map(doc => ({
        id: doc.id,
        number: doc.data().number || 0,
        wall: doc.data().wall || '',
        difficulty: doc.data().difficulty || '',
        difficulty_level: doc.data().difficulty_level,
        difficulty_types: doc.data().difficulty_types || [],
        instructions: doc.data().instructions || '',
        image_base64: doc.data().image_base64,
        competition_id: doc.data().competition_id,
        is_active: doc.data().is_active || false,
        color: doc.data().color
      }))
      .sort((a, b) => a.number - b.number); // ✅ Tri par numéro
      setBoulders(bouldersData);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Vérifier si un utilisateur peut s'inscrire à une compétition (niveau + accès général)
  const canUserRegister = (user: any, competition: Competition): boolean => {
    // Vérifier l'accès général aux compétitions
    if (!user.inscritAuxCompetitions) {
      return false;
    }

    // Si pas de restrictions de niveau, autoriser
    if (!competition.minLevel && !competition.maxLevel) {
      return true;
    }

    // Vérifier les restrictions de niveau
    const userLevel = user.level;
    if (!userLevel) return true; // Si pas de niveau défini, autoriser

    const userLevelIndex = levelOrder.indexOf(userLevel);
    const minLevelIndex = competition.minLevel ? levelOrder.indexOf(competition.minLevel) : -1;
    const maxLevelIndex = competition.maxLevel ? levelOrder.indexOf(competition.maxLevel) : levelOrder.length;

    return (
      (minLevelIndex === -1 || userLevelIndex >= minLevelIndex) &&
      (maxLevelIndex === levelOrder.length || userLevelIndex <= maxLevelIndex)
    );
  };

  const handleRegister = async (competition: Competition) => {
    if (!user) return;
    try {
      // ✅ Vérifier si l'utilisateur a le droit de s'inscrire (accès général + niveau)
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        setError("Utilisateur introuvable.");
        return;
      }

      const userData = userDoc.data();
      if (!userData.inscritAuxCompetitions) {
        setError("Vous n'êtes pas autorisé à participer aux compétitions. Contactez l'administrateur pour activer votre accès.");
        return;
      }

      // ✅ Vérifier les restrictions de niveau
      if (userData.level && (competition.minLevel || competition.maxLevel)) {
        const userLevelIndex = levelOrder.indexOf(userData.level);
        const minLevelIndex = competition.minLevel ? levelOrder.indexOf(competition.minLevel) : -1;
        const maxLevelIndex = competition.maxLevel ? levelOrder.indexOf(competition.maxLevel) : levelOrder.length;

        if (userLevelIndex < minLevelIndex || userLevelIndex > maxLevelIndex) {
          const minLevelLabel = competition.minLevel ? `niveau minimum ${competition.minLevel}` : 'aucun niveau minimum';
          const maxLevelLabel = competition.maxLevel ? `niveau maximum ${competition.maxLevel}` : 'aucun niveau maximum';
          setError(`Votre niveau (${userData.level}) ne correspond pas aux restrictions de cette compétition (${minLevelLabel} à ${maxLevelLabel}).`);
          return;
        }
      }

      // Vérifier si déjà inscrit
      const q = query(
        collection(db, 'competition_participants'),
        where('competition_id', '==', competition.id),
        where('user_id', '==', user.uid)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setError("Vous êtes déjà inscrit à cette compétition.");
        return;
      }

      // S'inscrire
      await addDoc(collection(db, 'competition_participants'), {
        user_id: user.uid,
        competition_id: competition.id,
        email: user.email || '',
        first_name: user.displayName?.split(' ')[0] || '',
        last_name: user.displayName?.split(' ')[1] || '',
        registered_at: new Date().toISOString(),
        is_client: true
      });

      // Mettre à jour le compteur
      await updateDoc(doc(db, 'competitions', competition.id), {
        registered_count: (competition.registered_count || 0) + 1
      });

      setSuccess("Inscription réussie !");
      setOpenRegisterDialog(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const handleValidateBoulder = (boulderId: string, success: boolean, attempts: number, rating: number, proposedDifficulty: string) => {
    setValidationResults(prev => ({
      ...prev,
      [boulderId]: { success, attempts, rating, proposedDifficulty }
    }));
  };

  const handleSubmitResults = async () => {
    if (!user || !selectedCompetition) return;
    try {
      for (const [boulderId, result] of Object.entries(validationResults)) {
        const resultId = `${user.uid}_${boulderId}_${selectedCompetition.id}`;
        await setDoc(doc(db, 'competition_results', resultId), {
          user_id: user.uid,
          competition_id: selectedCompetition.id,
          boulder_id: boulderId,
          success: result.success,
          attempts: result.attempts,
          rating: result.rating,
          proposed_difficulty: result.proposedDifficulty,
          created_at: new Date().toISOString()
        });
      }
      setSuccess("Résultats soumis avec succès !");
      setOpenValidationDialog(false);
      setValidationResults({});
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const isAlreadyRegistered = async (competitionId: string): Promise<boolean> => {
    if (!user) return false;
    const q = query(
      collection(db, 'competition_participants'),
      where('competition_id', '==', competitionId),
      where('user_id', '==', user.uid)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  };

  const calculatePoints = (difficulty: string, attempts: number, success: boolean): number => {
    if (!success) return 0;
    // ✅ Utiliser color si difficulty n'est pas définie
    const base = basePoints[difficulty] || 0;
    const deduction = (attempts > 1 ? (attempts - 1) * (deductions[difficulty] || 0) : 0);
    return Math.max(0, base - deduction);
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

  if (!user) return null;

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>Mes Compétitions</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Typography variant="h6" sx={{ mb: 2 }}>Compétitions en cours</Typography>
      {competitions.length === 0 ? (
        <Typography>Aucune compétition en cours.</Typography>
      ) : (
        <Grid container spacing={2}>
          {competitions.map((competition) => {
            // ✅ Vérifier si l'utilisateur peut s'inscrire (pour afficher/masquer le bouton)
            const userDoc = allUsers.find(u => u.uid === user?.uid);
            const canRegister = userDoc ? canUserRegister(userDoc, competition) : false;

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={competition.id}>
                <Card>
                  <CardContent>
                    <Typography variant="h6">{competition.name}</Typography>
                    <Typography>Date: {new Date(competition.date).toLocaleDateString()}</Typography>
                    <Typography>Statut: {competition.status}</Typography>
                    <Typography>Participants: {competition.registered_count}/{competition.max_participants}</Typography>
                    {/* ✅ Afficher les restrictions de niveau */}
                    {competition.minLevel || competition.maxLevel ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Niveau requis: {competition.minLevel ? `min ${competition.minLevel}` : ''}
                        {competition.minLevel && competition.maxLevel ? ' - ' : ''}
                        {competition.maxLevel ? `max ${competition.maxLevel}` : ''}
                      </Typography>
                    ) : null}
                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={() => {
                          isAlreadyRegistered(competition.id).then(registered => {
                            if (registered) {
                              loadBoulders(competition);
                              setOpenValidationDialog(true);
                            } else {
                              if (canRegister) {
                                setSelectedCompetition(competition);
                                setOpenRegisterDialog(true);
                              } else {
                                setError("Vous ne pouvez pas vous inscrire à cette compétition (niveau ou accès insuffisant).");
                              }
                            }
                          });
                        }}
                        disabled={!canRegister} // ✅ Désactiver si niveau insuffisant
                      >
                        {competition.registered_count > 0 ? "Valider mes blocs" : "S'inscrire"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => loadBoulders(competition)}
                      >
                        Voir les détails
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Modale 1: Inscription à une compétition */}
      <Dialog
        open={openRegisterDialog}
        onClose={() => setOpenRegisterDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        {selectedCompetition && (
          <>
            <DialogTitle>Inscription à {selectedCompetition.name}</DialogTitle>
            <DialogContent>
              <Typography sx={{ mb: 2 }}>
                Vous allez vous inscrire à la compétition <strong>{selectedCompetition.name}</strong> qui aura lieu le {new Date(selectedCompetition.date).toLocaleDateString()}.
              </Typography>
              <Typography sx={{ mb: 2 }}>
                <strong>Code d'accès:</strong> {selectedCompetition.access_code}
              </Typography>
              <Typography sx={{ mb: 2 }}>
                <strong>Nombre maximum de participants:</strong> {selectedCompetition.max_participants}
              </Typography>
              {/* ✅ Afficher les restrictions de niveau */}
              {selectedCompetition.minLevel || selectedCompetition.maxLevel ? (
                <Typography sx={{ mb: 2 }}>
                  <strong>Niveau requis:</strong> {selectedCompetition.minLevel ? `min ${selectedCompetition.minLevel}` : ''}
                  {selectedCompetition.minLevel && selectedCompetition.maxLevel ? ' - ' : ''}
                  {selectedCompetition.maxLevel ? `max ${selectedCompetition.maxLevel}` : ''}
                </Typography>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenRegisterDialog(false)}>Annuler</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={() => handleRegister(selectedCompetition)}
              >
                Confirmer l'inscription
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Modale 2: Validation des blocs de compétition */}
      <Dialog
        open={openValidationDialog}
        onClose={() => setOpenValidationDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        {selectedCompetition && (
          <>
            <DialogTitle>Validation des blocs - {selectedCompetition.name}</DialogTitle>
            <DialogContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Validez vos blocs et proposez une cotation (tous les blocs de compétition sont considérés comme "mystère").
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {boulders.map((boulder) => {
                  const result = validationResults[boulder.id] || {
                    success: false,
                    attempts: 1,
                    rating: 0,
                    proposedDifficulty: ''
                  };
                  // ✅ Utiliser color si difficulty n'est pas définie
                  const difficulty = boulder.color || boulder.difficulty;
                  const points = calculatePoints(difficulty, result.attempts, result.success);
                  return (
                    <Card key={boulder.id} sx={{ width: 300, mb: 2 }}>
                      <CardMedia
                        component="img"
                        height="150"
                        image={boulder.image_base64 || '/images/logo-blocabrac.png'}
                        alt={`Bloc ${boulder.number}`}
                        sx={{ objectFit: 'contain' }}
                      />
                      <CardContent>
                        <Typography>Bloc n°{boulder.number} - {boulder.wall}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          <Button
                            variant={result.success ? "contained" : "outlined"}
                            color="success"
                            size="small"
                            onClick={() => handleValidateBoulder(
                              boulder.id,
                              true,
                              result.attempts,
                              result.rating,
                              result.proposedDifficulty
                            )}
                          >
                            ✅ Réussi
                          </Button>
                          <Button
                            variant={!result.success ? "contained" : "outlined"}
                            color="error"
                            size="small"
                            onClick={() => handleValidateBoulder(
                              boulder.id,
                              false,
                              result.attempts,
                              result.rating,
                              result.proposedDifficulty
                            )}
                          >
                            ❌ Échoué
                          </Button>
                        </Box>
                        <FormControl fullWidth sx={{ mt: 1 }}>
                          <InputLabel>Nombre d'essais</InputLabel>
                          <Select
                            value={result.attempts}
                            onChange={(e) => handleValidateBoulder(
                              boulder.id,
                              result.success,
                              e.target.value as number,
                              result.rating,
                              result.proposedDifficulty
                            )}
                            label="Nombre d'essais"
                          >
                            {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
                              <MenuItem key={num} value={num}>{num} essai{num > 1 ? 's' : ''}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                          <Typography>Note: </Typography>
                          <Rating
                            name={`rating-${boulder.id}`}
                            value={result.rating}
                            onChange={(e, newValue) => handleValidateBoulder(
                              boulder.id,
                              result.success,
                              result.attempts,
                              newValue || 0,
                              result.proposedDifficulty
                            )}
                          />
                        </Box>
                        <FormControl fullWidth sx={{ mt: 1 }}>
                          <InputLabel>Cotation proposée</InputLabel>
                          <Select
                            value={result.proposedDifficulty}
                            onChange={(e) => handleValidateBoulder(
                              boulder.id,
                              result.success,
                              result.attempts,
                              result.rating,
                              e.target.value
                            )}
                            label="Cotation proposée"
                          >
                            {Object.keys(levelColors).map(color => (
                              <MenuItem key={color} value={color}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <Box sx={{
                                    width: 20,
                                    height: 20,
                                    backgroundColor: levelColors[color],
                                    marginRight: 1,
                                    border: '1px solid #ccc'
                                  }} />
                                  {color}
                                </Box>
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Typography sx={{ mt: 1, fontWeight: 'bold' }}>
                          Points: {points}
                        </Typography>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenValidationDialog(false)}>Annuler</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSubmitResults}
              >
                Soumettre les résultats
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Container>
  );
};

export default ClientCompetitions;