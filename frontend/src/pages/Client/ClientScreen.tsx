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
  CircularProgress,
  Chip,
  Divider
} from '@mui/material';
import { doc, getDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import AnnouncementBanner from '../../components/AnnouncementBanner';

// Tableau de correspondance code-couleur/cotations (cohérent avec ClientProfile.tsx, AdminUsers.tsx...)
const levelOptions: Record<string, string> = {
  jaune: 'Jaune (3A-3C)',
  vert: 'Vert (4A-4B+)',
  bleu: 'Bleu (4C-5A+)',
  violet: 'Violet (5B-5C+)',
  rouge: 'Rouge (6A-6B)',
  noir: 'Noire (6B+-6C+)',
  blanc: 'Blanc (7A-7B)',
  rose: 'Rose (7B+-8A)',
};

const levelColors: Record<string, string> = {
  jaune: '#FFFF00', vert: '#00FF00', bleu: '#0000FF', violet: '#800080',
  rouge: '#FF0000', noir: '#000000', blanc: '#FFFFFF', rose: '#FFC0CB'
};

interface NextCompetition {
  name: string;
  date: string;
}

interface LastBadge {
  name: string;
  color?: string;
  awardedAt: Date;
}

const ClientScreen: React.FC = () => {
  const [user, loading] = useAuthState(auth);
  const [userData, setUserData] = React.useState<any>(null);
  const [loadingData, setLoadingData] = React.useState(true);
  const [nextCompetition, setNextCompetition] = React.useState<NextCompetition | null>(null);
  const [lastBadge, setLastBadge] = React.useState<LastBadge | null>(null);
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

  // ✅ Résumé de l'écran d'accueil : prochaine compétition inscrite + dernier badge obtenu.
  // Le niveau actuel, lui, vient directement de userData.level (déjà chargé ci-dessus) :
  // il est tenu à jour automatiquement par ClientStats.tsx (sync niveau/badges).
  React.useEffect(() => {
    if (!user) return;

    const fetchSummary = async () => {
      try {
        const participantsSnapshot = await getDocs(
          query(collection(db, 'competition_participants'), where('user_id', '==', user.uid))
        );
        const competitionIds = participantsSnapshot.docs.map((d) => d.data().competition_id);
        const competitionDocs = await Promise.all(
          competitionIds.map((id) => getDoc(doc(db, 'competitions', id)))
        );
        const upcoming = competitionDocs
          .filter((d) => d.exists() && d.data()?.status === 'à venir')
          .map((d) => ({ name: d.data()?.name || '', date: d.data()?.date || '' }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setNextCompetition(upcoming[0] || null);
      } catch (err) {
        console.error("Erreur lors du chargement de la prochaine compétition :", err);
      }

      try {
        const clientBadgesSnapshot = await getDocs(
          query(collection(db, 'client_badges'), where('userId', '==', user.uid))
        );
        const badgeLinks = clientBadgesSnapshot.docs
          .map((d) => {
            const data = d.data();
            const awardedAt = data.awardedAt instanceof Timestamp
              ? data.awardedAt.toDate()
              : data.awardedAt?.seconds
                ? new Date(data.awardedAt.seconds * 1000)
                : data.awardedAt
                  ? new Date(data.awardedAt)
                  : new Date(0);
            return { badgeId: data.badgeId, awardedAt };
          })
          .sort((a, b) => b.awardedAt.getTime() - a.awardedAt.getTime());

        const mostRecent = badgeLinks[0];
        if (mostRecent?.badgeId) {
          const badgeDoc = await getDoc(doc(db, 'badges', mostRecent.badgeId));
          if (badgeDoc.exists()) {
            const badgeData = badgeDoc.data();
            setLastBadge({
              name: badgeData.name || 'Badge',
              color: badgeData.color,
              awardedAt: mostRecent.awardedAt,
            });
          }
        }
      } catch (err) {
        console.error("Erreur lors du chargement du dernier badge :", err);
      }
    };

    fetchSummary();
  }, [user]);

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

        {(userData?.level || lastBadge || nextCompetition) && (
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
              {userData?.level && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Niveau actuel
                  </Typography>
                  <Chip
                    label={levelOptions[userData.level] || userData.level}
                    sx={{
                      backgroundColor: levelColors[userData.level],
                      color: userData.level === 'blanc' ? 'black' : 'white'
                    }}
                  />
                </Box>
              )}

              {lastBadge && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Dernier badge obtenu
                  </Typography>
                  <Chip
                    label={`${lastBadge.name} (${lastBadge.awardedAt.toLocaleDateString('fr-FR')})`}
                    sx={lastBadge.color ? {
                      backgroundColor: levelColors[lastBadge.color] || lastBadge.color,
                      color: lastBadge.color === 'blanc' ? 'black' : 'white'
                    } : undefined}
                  />
                </Box>
              )}

              {nextCompetition && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Prochaine compétition inscrite
                  </Typography>
                  <Chip
                    label={`${nextCompetition.name} - ${new Date(nextCompetition.date).toLocaleDateString('fr-FR')}`}
                    color="primary"
                    variant="outlined"
                  />
                </Box>
              )}
            </Box>
            <Divider sx={{ mt: 3 }} />
          </Box>
        )}

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

          {/* ✅ Classement (opt-in) : toujours visible, même pour ceux qui n'y figurent pas */}
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/client/classement')}
            sx={{ p: 2 }}
          >
            Classement des grimpeurs
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