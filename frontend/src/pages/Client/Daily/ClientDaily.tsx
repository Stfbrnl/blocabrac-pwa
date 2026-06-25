import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc, setDoc, doc } from 'firebase/firestore';
import {
  Container, Typography, Box, Button, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, CardMedia, Rating, TextField,
  Grid, Chip, FormControl, InputLabel, Select, MenuItem
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
  rose: '#FFC0CB',
  mystère: '#808080'
};

// ✅ Liste des murs ALIGNÉE sur DailyBouldersList.tsx (Ouvreur)
const wallList = [
  'Caverne des petits', 'Réta d\'initiation', 'Réta Adultes', 'Grande Face',
  'Dalle', 'Dévers 15°', 'Dévers 30°', 'Dévers 40°', 'Grotte Adultes', 'Güllich'
];

// Types de signalements
const reportTypes = [
  { value: 'défaillance_prisede', label: 'Défaillance de prise' },
  { value: 'morphologie', label: 'Morphologie' },
  { value: 'trop_difficile', label: 'Trop difficile' },
  { value: 'trop_simple', label: 'Trop simple' },
  { value: 'autre', label: 'Autre' }
];

// Options pour le nombre d'essais (1 à 15+)
const attemptOptions = Array.from({ length: 15 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1} essai${i > 0 ? 's' : ''}`
})).concat({ value: 16, label: '15+ essais' });

// Options pour la cotation proposée
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
  const [usersById, setUsersById] = useState<Record<string, UserInfo>>({}); // ✅ Annuaire UID -> nom
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

  // Modales
  const [openWallDialog, setOpenWallDialog] = useState(false);
  const [openBoulderDialog, setOpenBoulderDialog] = useState(false);

  // ✅ Construit "Prénom Nom" à partir d'un UID, avec fallback sur l'UID lui-même
  const getUserFullName = (uid: string | undefined | null): string => {
    if (!uid) return 'Inconnu';
    const found = usersById[uid];
    if (!found) return uid;
    const composed = [found.firstName, found.lastName].filter(Boolean).join(' ').trim();
    return composed || uid;
  };

  // Charger l'annuaire des utilisateurs (pour résoudre created_by -> nom)
  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const map: Record<string, UserInfo> = {};
        snapshot.docs.forEach((userDoc) => {
          const data = userDoc.data();
          map[userDoc.id] = {
            id: userDoc.id,
            firstName: data.first_name || '',
            lastName: data.last_name || '',
          };
        });
        setUsersById(map);
      } catch (err) {
        console.error('Erreur lors du chargement des utilisateurs:', err);
      }
    };

    fetchUsers();
  }, [user, loadingAuth]);

  // Charger tous les blocs actifs de type "daily"
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

  // Filtrer les blocs par mur
  const getBouldersByWall = (wall: string) => {
    return boulders.filter(boulder => boulder.wall === wall);
  };

  // Fonction pour détecter les blocs mystère (vérifie color, difficulty, ou difficulty_level)
  const isMysteryBoulder = (boulder: any): boolean => {
    return boulder.color === 'mystère' ||
           boulder.color === 'mystere' ||
           boulder.difficulty === 'mystère' ||
           boulder.difficulty_level === 'mystère';
  };

  // Ouvrir la modale des blocs d'un mur
  const handleOpenWall = (wall: string) => {
    setSelectedWall(wall);
    setOpenWallDialog(true);
  };

  // Ouvrir la modale des détails d'un bloc
  const handleOpenBoulder = (boulder: any) => {
    setSelectedBoulder(boulder);
    setOpenBoulderDialog(true);
  };

  // Valider la réussite d'un bloc
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
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  // Noter un bloc
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
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  // Signaler un problème
  const handleReportIssue = async (boulderId: string, boulderNumber: number, wall: string) => {
    if (!user || !comments[boulderId] || !reportTypesSelected[boulderId]) return;
    try {
      await addDoc(collection(db, 'boulder_reports'), {
        boulder_id: boulderId,
        boulder_number: boulderNumber,
        wall: wall,
        report_type: reportTypesSelected[boulderId],
        message: comments[boulderId],
        user_id: user.uid,
        user_name: user.displayName || user.email || 'Anonyme',
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

      {/* Modale 1 : Liste des blocs d'un mur */}
      <Dialog
        open={openWallDialog}
        onClose={() => setOpenWallDialog(false)}
        maxWidth="md"
        fullWidth
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

      {/* Modale 2 : Détails d'un bloc */}
      <Dialog
        open={openBoulderDialog}
        onClose={() => setOpenBoulderDialog(false)}
        maxWidth="sm"
        fullWidth
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
                  color: ['noir', 'blanc', 'mystère', 'mystere'].includes(selectedBoulder.color || selectedBoulder.difficulty) ? 'black' : 'white',
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
                {/* ✅ Résolution UID -> "Prénom Nom" via l'annuaire usersById */}
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

              {/* Sélecteur du nombre d'essais */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Nombre d'essais</InputLabel>
                <Select
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

              {/* Sélecteur de cotation PROPOSÉE (uniquement pour les blocs mystère) */}
              {isMysteryBoulder(selectedBoulder) && (
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Proposer une cotation</InputLabel>
                  <Select
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

              {/* Sélecteur de type de signalement */}
              <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
                <InputLabel>Type de signalement</InputLabel>
                <Select
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