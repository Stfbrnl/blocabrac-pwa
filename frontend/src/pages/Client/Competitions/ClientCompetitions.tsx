import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc, getDoc, doc } from 'firebase/firestore';
import {
  Container, Typography, Box, Paper, Button, CircularProgress,
  Alert, Card, CardContent, CardHeader, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';

const ClientCompetitions: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<any>(null);
  const [boulders, setBoulders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [isRegistered, setIsRegistered] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user || loadingAuth) return;
    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, 'competitions'), where('isActive', '==', true));
        const snapshot = await getDocs(q);
        const competitionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCompetitions(competitionsData);

        // Vérifier les inscriptions
        const participantsSnapshot = await getDocs(query(collection(db, 'competition_participants'), where('userId', '==', user.uid)));
        const registeredCompetitions = participantsSnapshot.docs.map(doc => doc.data().competitionId);
        setIsRegistered(competitionsData.reduce((acc, comp) => {
          acc[comp.id] = registeredCompetitions.includes(comp.id);
          return acc;
        }, {} as Record<string, boolean>));
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchCompetitions();
  }, [user, loadingAuth]);

  const handleRegister = async (competitionId: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'competition_participants'), {
        userId: user.uid,
        competitionId,
        registrationDate: new Date().toISOString()
      });
      setIsRegistered(prev => ({ ...prev, [competitionId]: true }));
      setSuccess('Inscription réussie!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const fetchCompetitionBoulders = async (competitionId: string) => {
    try {
      setLoading(true);
      const competitionDoc = await getDoc(doc(db, 'competitions', competitionId));
      if (competitionDoc.exists()) {
        const boulderIds = competitionDoc.data().boulders || [];
        const bouldersSnapshot = await getDocs(query(collection(db, 'boulders'), where('__name__', 'in', boulderIds)));
        setBoulders(bouldersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setSelectedCompetition({ id: competitionId, ...competitionDoc.data() });
        setOpenDialog(true);
      }
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateBoulder = async (boulderId: string) => {
    if (!user || !selectedCompetition) return;
    try {
      await addDoc(collection(db, 'client_competition_results'), {
        userId: user.uid,
        competitionId: selectedCompetition.id,
        boulderId,
        success: true,
        attempts: attempts[boulderId] || 1,
        createdAt: new Date().toISOString()
      });
      setSuccess('Résultat enregistré!');
      setOpenDialog(false);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  if (loadingAuth || loading) return <Container maxWidth="lg"><Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box></Container>;
  if (!user) return null;

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>Mes compétitions</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {competitions.map(comp => (
          <Card key={comp.id} sx={{ width: { xs: '100%', sm: '45%', md: '30%' } }}>
            <CardHeader title={comp.name} subheader={`Du ${comp.startDate} au ${comp.endDate}`} />
            <CardContent>
              <Typography variant="body2">{comp.description}</Typography>
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                {!isRegistered[comp.id] ? (
                  <Button variant="contained" color="primary" onClick={() => handleRegister(comp.id)}>S'inscrire</Button>
                ) : (
                  <Chip label="Inscrit" color="success" />
                )}
                <Button variant="outlined" onClick={() => fetchCompetitionBoulders(comp.id)}>Voir les blocs</Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Blocs de la compétition: {selectedCompetition?.name}</DialogTitle>
        <DialogContent>
          {boulders.map(boulder => (
            <Box key={boulder.id} sx={{ mb: 2, p: 2, border: '1px solid #ddd', borderRadius: 1 }}>
              <Typography variant="h6">Bloc {boulder.id}</Typography>
              <TextField
                label="Nombre d'essais"
                type="number"
                value={attempts[boulder.id] || 1}
                onChange={(e) => setAttempts(prev => ({ ...prev, [boulder.id]: parseInt(e.target.value) || 1 }))}
                sx={{ mt: 1 }}
              />
              <Button
                variant="contained"
                color="primary"
                onClick={() => handleValidateBoulder(boulder.id)}
                sx={{ mt: 1 }}
              >
                Valider
              </Button>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ClientCompetitions;