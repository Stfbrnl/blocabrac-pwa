import React from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../services/firebaseConfig';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  CircularProgress
} from '@mui/material';
import { doc, getDoc } from 'firebase/firestore';
import AnnouncementBanner from '../../components/AnnouncementBanner';

const ClientScreen: React.FC = () => {
  const [user, loading] = useAuthState(auth);
  const [userData, setUserData] = React.useState<any>(null);
  const [loadingData, setLoadingData] = React.useState(true);
  const navigate = useNavigate();

  // Charger les données utilisateur pour vérifier inscritAuxCours
  React.useEffect(() => {
    if (!user || loading) return;

    const fetchUserData = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
      } catch (err) {
        console.error("Erreur lors du chargement des données utilisateur :", err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchUserData();
  }, [user, loading]);

  if (loading || loadingData) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ textAlign: 'center' }}>
          Mon espace personnel
        </Typography>

        <AnnouncementBanner />

        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          mt: 4
        }}>
          {/* Bouton 1 : Blocabrac quotidien */}
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/client/daily')}
            sx={{ p: 2 }}
          >
            Mon Blocabrac quotidien
          </Button>

          {/* Bouton 2 : Compétitions */}
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/client/competitions')}
            sx={{ p: 2 }}
          >
            Mes compétitions
          </Button>

          {/* ✅ Bouton 3 : Mes statistiques (TOUJOURS visible) */}
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/client/stats')}
            sx={{ p: 2 }}
          >
            Mes statistiques
          </Button>

          {/* Bouton 4 : Cours (conditionnel) */}
          {userData?.inscritAuxCours && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/client/courses')}
              sx={{ p: 2 }}
            >
              Mes cours
            </Button>
          )}

          {/* Bouton 5 : Modifier mes informations */}
          <Button
            variant="contained"
            color="secondary"
            onClick={() => navigate('/client/profile')}
            sx={{ p: 2 }}
          >
            Modifier mes informations
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default ClientScreen;