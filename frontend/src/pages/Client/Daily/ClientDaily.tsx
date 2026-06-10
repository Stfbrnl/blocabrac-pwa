import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import {
  Container, Typography, Box, Button, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, CardMedia, Rating, TextField,
  Grid, Chip
} from '@mui/material';

// Couleurs des niveaux
const levelColors: Record<string, string> = {
  jaune: '#FFFF00', vert: '#00FF00', bleu: '#0000FF', violet: '#800080',
  rouge: '#FF0000', noir: '#000000', blanc: '#FFFFFF', rose: '#FFC0CB',
};

// Liste des murs
const wallList = [
  "Dalle", "Grotte Adultes", "Güllich", "Réta Adultes", "Grande Face",
  "Dévers à 15°", "Dévers à 30°", "Dévers à 40°",
  "Caverne des petits", "Réta d'initiation"
];

const ClientDaily: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [boulders, setBoulders] = useState<any[]>([]);
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [selectedBoulder, setSelectedBoulder] = useState<any | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [successResults, setSuccessResults] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modales
  const [openWallDialog, setOpenWallDialog] = useState(false);
  const [openBoulderDialog, setOpenBoulderDialog] = useState(false);

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
      await addDoc(collection(db, 'client_boulder_results'), {
        userId: user.uid,
        boulderId,
        success,
        attempts: 1,
        createdAt: new Date().toISOString()
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
      await addDoc(collection(db, 'client_boulder_results'), {
        userId: user.uid,
        boulderId,
        rating,
        comment,
        createdAt: new Date().toISOString()
      });
      setRatings(prev => ({ ...prev, [boulderId]: rating }));
      setComments(prev => ({ ...prev, [boulderId]: comment }));
      setSuccess('Note enregistrée!');
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
      {/* ✅ Correction MUI v9 : suppression de `item` et `component` */}
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

      {/* Modale 1 : Liste des blocs d'un mur (miniatures + numéros) */}
      <Dialog
        open={openWallDialog}
        onClose={() => setOpenWallDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Blocs sur le mur : {selectedWall}
        </DialogTitle>
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

      {/* Modale 2 : Détails d'un bloc (toutes les infos + actions) */}
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
                  backgroundColor: levelColors[selectedBoulder.difficulty_level] || '#CCCCCC',
                  color: ['noir', 'blanc'].includes(selectedBoulder.difficulty_level) ? 'black' : 'white',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  marginLeft: '8px'
                }}>
                  {selectedBoulder.difficulty_level}
                </Box>
              </Box>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Conseils:</strong> {selectedBoulder.instructions || selectedBoulder.constraints || 'Aucun'}
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Contraintes:</strong> {selectedBoulder.constraints || 'Aucune'}
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

              <Typography variant="body2" sx={{ mb: 1 }}>
                Note actuelle: {ratings[selectedBoulder.id] || 'Non noté'}
              </Typography>
              <Rating
                name={`rating-${selectedBoulder.id}`}
                value={ratings[selectedBoulder.id] || 0}
                onChange={(e, newValue) => setRatings(prev => ({ ...prev, [selectedBoulder.id]: newValue || 0 }))}
              />
              <TextField
                label="Commentaire ou signalement"
                value={comments[selectedBoulder.id] || ''}
                onChange={(e) => setComments(prev => ({ ...prev, [selectedBoulder.id]: e.target.value }))}
                multiline
                rows={2}
                fullWidth
                sx={{ mt: 2 }}
                placeholder="Ex: Prise cassée, problème de sécurité..."
              />
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