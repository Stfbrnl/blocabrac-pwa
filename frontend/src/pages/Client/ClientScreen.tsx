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
  Divider,
  IconButton,
  Tooltip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import {
  HelpOutlined as HelpOutlineIcon,
  LocalFireDepartment as LocalFireDepartmentIcon,
  Edit as EditIcon,
  Share as ShareIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { doc, getDoc, setDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import * as html2canvas from 'html2canvas';
import AnnouncementBanner from '../../components/AnnouncementBanner';
import WhatsNewPanel from '../../components/WhatsNewPanel';
import { computeStreakDays, getStartOfWeek } from '../../utils/streak';

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

interface ClientUserData {
  level?: string;
  inscritAuxCours?: boolean;
  first_name?: string;
  weeklyGoalTarget?: number | null;
}

const ClientScreen: React.FC = () => {
  const [user, loading] = useAuthState(auth);
  const [userData, setUserData] = React.useState<ClientUserData | null>(null);
  const [loadingData, setLoadingData] = React.useState(true);
  const [nextCompetition, setNextCompetition] = React.useState<NextCompetition | null>(null);
  const [lastBadge, setLastBadge] = React.useState<LastBadge | null>(null);
  const [streak, setStreak] = React.useState(0);
  const [weeklyCount, setWeeklyCount] = React.useState(0);
  const [goalDialogOpen, setGoalDialogOpen] = React.useState(false);
  const [goalInput, setGoalInput] = React.useState('');
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
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

  // ✅ Série de jours consécutifs + progression de l'objectif hebdomadaire, calculées
  // côté client à partir des mêmes validations que le classement (client_boulder_results,
  // déjà lisible par son propriétaire d'après les règles Firestore) : pas de nouvelle
  // collection ni de champ dénormalisé à maintenir en plus.
  React.useEffect(() => {
    if (!user) return;

    const fetchValidations = async () => {
      try {
        const snapshot = await getDocs(
          query(
            collection(db, 'client_boulder_results'),
            where('userId', '==', user.uid),
            where('success', '==', true)
          )
        );
        const dates = snapshot.docs
          .map((d) => d.data().createdAt)
          .filter((iso): iso is string => Boolean(iso))
          .map((iso) => new Date(iso));

        setStreak(computeStreakDays(dates));
        const weekStart = getStartOfWeek();
        setWeeklyCount(dates.filter((d) => d >= weekStart).length);
      } catch (err) {
        console.error('Erreur lors du calcul de la série :', err);
      }
    };

    fetchValidations();
  }, [user]);

  const handleSaveGoal = async () => {
    if (!user) return;
    const target = parseInt(goalInput, 10);
    const value = Number.isFinite(target) && target > 0 ? target : null;
    try {
      await setDoc(doc(db, 'users', user.uid), { weeklyGoalTarget: value }, { merge: true });
      setUserData((prev) => (prev ? { ...prev, weeklyGoalTarget: value } : prev));
      setGoalDialogOpen(false);
    } catch (err) {
      console.error("Erreur lors de la sauvegarde de l'objectif :", err);
    }
  };

  const handleRemoveGoal = async () => {
    setGoalInput('');
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { weeklyGoalTarget: null }, { merge: true });
      setUserData((prev) => (prev ? { ...prev, weeklyGoalTarget: null } : prev));
      setGoalDialogOpen(false);
    } catch (err) {
      console.error("Erreur lors de la suppression de l'objectif :", err);
    }
  };

  const handleShareCard = async () => {
    if (!cardRef.current) return;
    const canvas = await html2canvas.default(cardRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
    });

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'blocabrac-progression.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Ma progression Blocabrac' });
          return;
        } catch {
          // Partage annulé ou non abouti : on retombe sur le téléchargement classique.
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'blocabrac-progression.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

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
        <Box sx={{ position: 'relative' }}>
          <Typography variant="h4" gutterBottom sx={{ textAlign: 'center' }}>
            Mon espace personnel
          </Typography>
          <Tooltip title="Comment ça marche ?">
            <IconButton
              aria-label="Aide"
              onClick={() => navigate('/client/aide')}
              sx={{ position: 'absolute', top: 0, right: 0 }}
            >
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <WhatsNewPanel />
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

        <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
          <Typography variant="h6" gutterBottom>Série & objectif de la semaine</Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <LocalFireDepartmentIcon color={streak > 0 ? 'error' : 'disabled'} />
            <Typography>
              {streak > 0
                ? `${streak} jour${streak > 1 ? 's' : ''} de suite`
                : "Pas encore de série en cours — validez un bloc aujourd'hui pour la démarrer !"}
            </Typography>
          </Box>

          {userData?.weeklyGoalTarget ? (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
                <Typography variant="body2">
                  Objectif de la semaine : {weeklyCount}/{userData.weeklyGoalTarget} blocs
                </Typography>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => { setGoalInput(String(userData.weeklyGoalTarget)); setGoalDialogOpen(true); }}
                >
                  Modifier
                </Button>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (weeklyCount / userData.weeklyGoalTarget) * 100)}
                color={weeklyCount >= userData.weeklyGoalTarget ? 'success' : 'primary'}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
          ) : (
            <Button size="small" startIcon={<EditIcon />} onClick={() => { setGoalInput(''); setGoalDialogOpen(true); }}>
              Définir un objectif pour la semaine
            </Button>
          )}

          {(userData?.level || lastBadge || streak > 0) && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<ShareIcon />}
              onClick={() => setShareDialogOpen(true)}
              sx={{ mt: 2 }}
            >
              Partager ma progression
            </Button>
          )}
        </Paper>

        <Dialog open={goalDialogOpen} onClose={() => setGoalDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Objectif de la semaine</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Nombre de blocs à valider cette semaine (du lundi à aujourd'hui), tous niveaux confondus.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              type="number"
              label="Objectif (nombre de blocs)"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              slotProps={{ htmlInput: { min: 1 } }}
            />
          </DialogContent>
          <DialogActions>
            {!!userData?.weeklyGoalTarget && (
              <Button color="error" onClick={handleRemoveGoal} sx={{ mr: 'auto' }}>
                Supprimer l'objectif
              </Button>
            )}
            <Button onClick={() => setGoalDialogOpen(false)}>Annuler</Button>
            <Button
              variant="contained"
              onClick={handleSaveGoal}
              disabled={!goalInput || Number(goalInput) <= 0}
            >
              Enregistrer
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Ma progression</DialogTitle>
          <DialogContent>
            <Box
              ref={cardRef}
              sx={{
                p: 3,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #1976d2, #6a1b9a)',
                color: '#fff',
                textAlign: 'center',
              }}
            >
              <Box component="img" src="/images/logo-blocabrac.png" alt="Blocabrac" sx={{ width: 56, height: 56, mb: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {userData?.first_name ? `Bravo ${userData.first_name} !` : 'Bravo !'}
              </Typography>
              {userData?.level && (
                <Chip
                  label={levelOptions[userData.level] || userData.level}
                  sx={{
                    mt: 1,
                    backgroundColor: levelColors[userData.level],
                    color: userData.level === 'blanc' ? 'black' : 'white'
                  }}
                />
              )}
              {lastBadge && (
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  Dernier badge : {lastBadge.name}
                </Typography>
              )}
              {streak > 0 && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  🔥 {streak} jour{streak > 1 ? 's' : ''} de suite
                </Typography>
              )}
              <Typography variant="caption" sx={{ display: 'block', mt: 2, opacity: 0.8 }}>
                Blocabrac — {new Date().toLocaleDateString('fr-FR')}
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShareDialogOpen(false)}>Fermer</Button>
            <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleShareCard}>
              Télécharger / Partager
            </Button>
          </DialogActions>
        </Dialog>

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

          {/* Potes de grimpe : ajout d'amis, statut "je grimpe", prochaine session */}
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/client/friends')}
            sx={{ p: 2 }}
          >
            Potes de grimpe
          </Button>

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