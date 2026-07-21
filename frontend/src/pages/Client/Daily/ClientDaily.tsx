import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc, setDoc, doc, getDoc } from 'firebase/firestore';
import { summarizeValidatedResults } from '../../../utils/classementScore';
import {
  Container, Typography, Box, Button, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, CardMedia, Rating, TextField,
  Grid, Chip, FormControl, InputLabel, Select, MenuItem,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

const levelColors: Record<string, string> = {
  jaune: '#FFFF00',
  vert: '#00FF00',
  bleu: '#0000FF',
  violet: '#800080',
  rouge: '#FF0000',
  noir: '#000000',
  blanc: '#FFFFFF',
  rose: '#FFC0CB',
  mystère: '#808080'
};

const wallList = [
  'Caverne des petits', 'Réta d\'initiation', 'Réta Adultes', 'Grande Face',
  'Dalle', 'Dévers 15°', 'Dévers 30°', 'Dévers 40°', 'Grotte Adultes', 'Güllich'
];

const reportTypes = [
  { value: 'défaillance_prisede', label: 'Défaillance de prise' },
  { value: 'morphologie', label: 'Morphologie' },
  { value: 'trop_difficile', label: 'Trop difficile' },
  { value: 'trop_simple', label: 'Trop simple' },
  { value: 'autre', label: 'Autre' }
];

const attemptOptions = Array.from({ length: 15 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1} essai${i > 0 ? 's' : ''}`
})).concat({ value: 16, label: '15+ essais' });

const difficultyOptions = Object.keys(levelColors).map(color => ({
  value: color,
  label: color.charAt(0).toUpperCase() + color.slice(1)
}));

interface UserInfo {
  id: string;
  firstName: string;
  lastName: string;
}

const ClientDaily: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [boulders, setBoulders] = useState<any[]>([]);
  const [usersById, setUsersById] = useState<Record<string, UserInfo>>({});
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [selectedBoulder, setSelectedBoulder] = useState<any | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [proposedDifficulties, setProposedDifficulties] = useState<Record<string, string>>({});
  const [reportTypesSelected, setReportTypesSelected] = useState<Record<string, string>>({});
  const [successResults, setSuccessResults] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [openWallDialog, setOpenWallDialog] = useState(false);
  const [openBoulderDialog, setOpenBoulderDialog] = useState(false);

  // ✅ Détection mobile pour passer les Dialogs en plein écran
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const getUserFullName = (uid: string | undefined | null): string => {
    if (!uid) return 'Inconnu';
    const found = usersById[uid];
    if (!found) return uid;
    const composed = [found.firstName, found.lastName].filter(Boolean).join(' ').trim();
    return composed || uid;
  };

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchUsers = async () => {
      const map: Record<string, UserInfo> = {};
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        snapshot.docs.forEach((userDoc) => {
          const data = userDoc.data();
          map[userDoc.id] = {
            id: userDoc.id,
            firstName: data.first_name || '',
            lastName: data.last_name || '',
          };
        });
      } catch (err) {
        console.error('Erreur lors du chargement des utilisateurs:', err);
        // ✅ Un client ne peut pas lister toute la collection "users" (règles Firestore
        // : lecture limitée à son propre document pour ce rôle) — la requête ci-dessus
        // échoue donc systématiquement pour un vrai client. On récupère au moins son
        // propre profil, pour que son nom soit correct dans les signalements envoyés
        // (le nom des AUTRES utilisateurs, ex: "Créé par" sur un bloc, reste non
        // résolu tant que ce point n'est pas traité plus largement).
        try {
          const ownDoc = await getDoc(doc(db, 'users', user.uid));
          if (ownDoc.exists()) {
            const data = ownDoc.data();
            map[user.uid] = {
              id: user.uid,
              firstName: data.first_name || '',
              lastName: data.last_name || '',
            };
          }
        } catch (ownErr) {
          console.error('Erreur lors du chargement de son propre profil:', ownErr);
        }
      }
      setUsersById(map);
    };

    fetchUsers();
  }, [user, loadingAuth]);

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchBoulders = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'boulders'),
          where('type', '==', 'daily'),
          where('is_active', '==', true)
        );
        const snapshot = await getDocs(q);
        const bouldersData = snapshot.docs.map(doc => ({
          id: doc.id,
          number: doc.data().number || doc.id,
          ...doc.data()
        }));
        setBoulders(bouldersData);
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBoulders();
  }, [user, loadingAuth]);

  const getBouldersByWall = (wall: string) => {
    return boulders.filter(boulder => boulder.wall === wall);
  };

  const isMysteryBoulder = (boulder: any): boolean => {
    return boulder.color === 'mystère' ||
           boulder.color === 'mystere' ||
           boulder.difficulty === 'mystère' ||
           boulder.difficulty_level === 'mystère';
  };

  const handleOpenWall = (wall: string) => {
    setSelectedWall(wall);
    setOpenWallDialog(true);
  };

  const handleOpenBoulder = (boulder: any) => {
    setSelectedBoulder(boulder);
    setOpenBoulderDialog(true);
  };

  // ✅ Classement en continu (ClientClassement.tsx) : un client ne peut pas lire les
  // résultats des AUTRES clients (règles Firestore), donc chaque client recalcule et
  // stocke SON PROPRE résumé sur sa fiche "classement_profiles" à chaque validation —
  // le classement se contente ensuite de lire ces résumés déjà calculés. Appelé même
  // en cas d'échec, pour que le score baisse correctement si "Réussi" est changé en
  // "Échoué" (recalcul complet, jamais un simple incrément).
  const updateClassementProfile = async (uid: string) => {
    try {
      const resultsSnapshot = await getDocs(
        query(collection(db, 'client_boulder_results'), where('userId', '==', uid), where('success', '==', true))
      );
      const colorById = new Map(boulders.map((b) => [b.id, b.color || b.difficulty || 'Inconnu']));
      const validatedResults = resultsSnapshot.docs
        .map((d) => d.data())
        .filter((r) => colorById.has(r.boulderId))
        .map((r) => ({ color: colorById.get(r.boulderId) as string, attempts: r.attempts || 1 }));

      const summary = summarizeValidatedResults(validatedResults);
      await setDoc(doc(db, 'classement_profiles', uid), {
        score: summary.score,
        bouldersValidated: summary.bouldersValidated,
        bestColorRank: summary.bestColorRank,
      }, { merge: true });
    } catch (err) {
      console.error('Erreur lors de la mise à jour du classement:', err);
    }
  };

  const handleValidateSuccess = async (boulderId: string, success: boolean) => {
    if (!user) return;
    try {
      const resultId = `${user.uid}_${boulderId}`;
      await setDoc(doc(db, 'client_boulder_results', resultId), {
        userId: user.uid,
        boulderId,
        success,
        rating: ratings[boulderId] || 0,
        comment: comments[boulderId] || '',
        attempts: attempts[boulderId] || 1,
        proposedDifficulty: proposedDifficulties[boulderId] || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setSuccessResults(prev => ({ ...prev, [boulderId]: success }));
      setSuccess('Réussite enregistrée!');
      setTimeout(() => setSuccess(null), 3000);
      await updateClassementProfile(user.uid);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const handleRate = async (boulderId: string, rating: number | null, comment: string) => {
    if (!rating || !user) return;
    try {
      const resultId = `${user.uid}_${boulderId}`;
      await setDoc(doc(db, 'client_boulder_results', resultId), {
        userId: user.uid,
        boulderId,
        success: successResults[boulderId] || false,
        rating,
        comment,
        attempts: attempts[boulderId] || 1,
        proposedDifficulty: proposedDifficulties[boulderId] || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setRatings(prev => ({ ...prev, [boulderId]: rating }));
      setComments(prev => ({ ...prev, [boulderId]: comment }));
      setSuccess('Note enregistrée!');
      setTimeout(() => setSuccess(null), 3000);
      // ✅ "Enregistrer" est le seul endroit où un changement du nombre d'essais fait
      // après le clic Réussi/Échoué initial est réellement sauvegardé (même doc,
      // ré-écrit ici) : il faut donc aussi rafraîchir le classement à ce moment,
      // sinon le score reste basé sur la valeur d'essais du tout premier clic.
      await updateClassementProfile(user.uid);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const handleReportIssue = async (boulderId: string, boulderNumber: number, wall: string) => {
    if (!user || !comments[boulderId] || !reportTypesSelected[boulderId]) return;
    try {
      // ✅ user.displayName n'est jamais renseigné (Register.tsx ne l'appelle pas) :
      // utiliser le prénom/nom résolu depuis Firestore plutôt que de tomber sur l'email.
      const resolvedName = getUserFullName(user.uid);
      const reporterName = resolvedName !== user.uid ? resolvedName : (user.displayName || user.email || 'Anonyme');
      await addDoc(collection(db, 'boulder_reports'), {
        boulder_id: boulderId,
        boulder_number: boulderNumber,
        wall: wall,
        report_type: reportTypesSelected[boulderId],
        message: comments[boulderId],
        user_id: user.uid,
        user_name: reporterName,
        created_at: new Date().toISOString(),
        status: 'pending'
      });
      setSuccess('Signalement envoyé à l\'ouvreur!');
      setComments(prev => ({ ...prev, [boulderId]: '' }));
      setReportTypesSelected(prev => ({ ...prev, [boulderId]: '' }));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
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

  if (!user) return null;

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>Mon Blocabrac quotidien</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Typography variant="h6" sx={{ mb: 2 }}>Sélectionnez un mur :</Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {wallList.map((wall) => {
          const boulderCount = getBouldersByWall(wall).length;
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={wall}>
              <Button
                variant="outlined"
                onClick={() => handleOpenWall(wall)}
                sx={{ width: '100%', p: 2, textTransform: 'none' }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <Typography>{wall}</Typography>
                  <Chip label={boulderCount} color="primary" />
                </Box>
              </Button>
            </Grid>
          );
        })}
      </Grid>

      {/* Modale 1 : Liste des blocs d'un mur — plein écran sur mobile */}
      <Dialog
        open={openWallDialog}
        onClose={() => setOpenWallDialog(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Blocs sur le mur : {selectedWall}</DialogTitle>
        <DialogContent>
          {selectedWall && getBouldersByWall(selectedWall).length === 0 ? (
            <Typography>Aucun bloc disponible sur ce mur.</Typography>
          ) : (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {selectedWall && getBouldersByWall(selectedWall).map((boulder) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={boulder.id}>
                  <Card sx={{ cursor: 'pointer' }} onClick={() => handleOpenBoulder(boulder)}>
                    <CardMedia
                      component="img"
                      height="100"
                      image={boulder.image_url || boulder.image_base64 || '/images/logo-blocabrac.png'}
                      alt={`Bloc ${boulder.number}`}
                      sx={{ objectFit: 'cover' }}
                    />
                    <CardContent sx={{ p: 1 }}>
                      <Typography variant="body2" sx={{ textAlign: 'center' }}>
                        Bloc n°{boulder.number}
                        {isMysteryBoulder(boulder) && (
                          <Chip label="Mystère" size="small" sx={{ ml: 1, backgroundColor: levelColors.mystère }} />
                        )}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenWallDialog(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Modale 2 : Détails d'un bloc — plein écran sur mobile */}
      <Dialog
        open={openBoulderDialog}
        onClose={() => setOpenBoulderDialog(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        {selectedBoulder && (
          <>
            <DialogTitle>
              Bloc n°{selectedBoulder.number} - {selectedBoulder.wall}
              {isMysteryBoulder(selectedBoulder) && (
                <Chip label="Mystère" size="small" sx={{ ml: 1, backgroundColor: levelColors.mystère }} />
              )}
            </DialogTitle>
            <DialogContent>
              <CardMedia
                component="img"
                height="200"
                image={selectedBoulder.image_url || selectedBoulder.image_base64 || '/images/logo-blocabrac.png'}
                alt={`Bloc ${selectedBoulder.number}`}
                sx={{ mb: 2, objectFit: 'contain' }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2">Niveau: </Typography>
                <Box sx={{
                  backgroundColor: levelColors[selectedBoulder.color || selectedBoulder.difficulty] || '#CCCCCC',
                  color: ['blanc', 'mystère', 'mystere'].includes(selectedBoulder.color || selectedBoulder.difficulty) ? 'black' : 'white',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  marginLeft: '8px'
                }}>
                  {isMysteryBoulder(selectedBoulder) ? 'Mystère' : (selectedBoulder.difficulty_level || selectedBoulder.difficulty || selectedBoulder.color)}
                </Box>
                {selectedBoulder.difficulty_types && selectedBoulder.difficulty_types.length > 0 && (
                  <Chip
                    label={selectedBoulder.difficulty_types[0]}
                    size="small"
                    sx={{ ml: 1, backgroundColor: 'rgba(0,0,0,0.1)' }}
                  />
                )}
              </Box>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Conseils:</strong> {selectedBoulder.instructions || 'Aucun'}
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Créé le:</strong> {selectedBoulder.created_at ? new Date(selectedBoulder.created_at).toLocaleDateString() : 'Inconnu'}
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Créé par:</strong> {getUserFullName(selectedBoulder.created_by)}
              </Typography>

              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Button
                  variant={successResults[selectedBoulder.id] === true ? "contained" : "outlined"}
                  color="success"
                  onClick={() => handleValidateSuccess(selectedBoulder.id, true)}
                >
                  ✅ Réussi
                </Button>
                <Button
                  variant={successResults[selectedBoulder.id] === false ? "contained" : "outlined"}
                  color="error"
                  onClick={() => handleValidateSuccess(selectedBoulder.id, false)}
                >
                  ❌ Échoué
                </Button>
              </Box>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel id="nombre-d-essais-select-label">Nombre d'essais</InputLabel>
                <Select
                  labelId="nombre-d-essais-select-label"
                  id="nombre-d-essais-select"
                  value={attempts[selectedBoulder.id] || 1}
                  onChange={(e) => setAttempts(prev => ({
                    ...prev,
                    [selectedBoulder.id]: e.target.value as number
                  }))}
                  label="Nombre d'essais"
                >
                  {attemptOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {isMysteryBoulder(selectedBoulder) && (
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel id="proposer-une-cotation-select-label">Proposer une cotation</InputLabel>
                  <Select
                    labelId="proposer-une-cotation-select-label"
                    id="proposer-une-cotation-select"
                    value={proposedDifficulties[selectedBoulder.id] || ''}
                    onChange={(e) => setProposedDifficulties(prev => ({
                      ...prev,
                      [selectedBoulder.id]: e.target.value
                    }))}
                    label="Proposer une cotation"
                  >
                    {difficultyOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Box sx={{
                            width: 20,
                            height: 20,
                            backgroundColor: levelColors[option.value],
                            marginRight: 1,
                            border: '1px solid #ccc'
                          }} />
                          {option.label}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <Typography variant="body2" sx={{ mb: 1 }}>
                Note actuelle: {ratings[selectedBoulder.id] || 'Non noté'}
              </Typography>
              <Rating
                name={`rating-${selectedBoulder.id}`}
                value={ratings[selectedBoulder.id] || 0}
                onChange={(e, newValue) => setRatings(prev => ({ ...prev, [selectedBoulder.id]: newValue || 0 }))}
              />

              <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
                <InputLabel id="type-de-signalement-select-label">Type de signalement</InputLabel>
                <Select
                  labelId="type-de-signalement-select-label"
                  id="type-de-signalement-select"
                  value={reportTypesSelected[selectedBoulder.id] || ''}
                  onChange={(e) => setReportTypesSelected(prev => ({
                    ...prev,
                    [selectedBoulder.id]: e.target.value
                  }))}
                  label="Type de signalement"
                >
                  {reportTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Commentaire ou signalement"
                value={comments[selectedBoulder.id] || ''}
                onChange={(e) => setComments(prev => ({ ...prev, [selectedBoulder.id]: e.target.value }))}
                multiline
                rows={2}
                fullWidth
                sx={{ mt: 1 }}
                placeholder="Ex: Prise cassée, problème de sécurité..."
              />

              <Button
                variant="outlined"
                color="error"
                onClick={() => handleReportIssue(
                  selectedBoulder.id,
                  selectedBoulder.number,
                  selectedBoulder.wall
                )}
                disabled={!comments[selectedBoulder.id] || !reportTypesSelected[selectedBoulder.id]}
                sx={{ mt: 2, width: '100%' }}
              >
                Signaler un problème
              </Button>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenBoulderDialog(false)}>Annuler</Button>
              <Button
                variant="contained"
                onClick={() => {
                  handleRate(selectedBoulder.id, ratings[selectedBoulder.id] || 0, comments[selectedBoulder.id] || '');
                  setOpenBoulderDialog(false);
                }}
              >
                Enregistrer
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Container>
  );
};

export default ClientDaily;