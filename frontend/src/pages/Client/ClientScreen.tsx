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
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
  HelpOutlined as HelpOutlineIcon,
  LocalFireDepartment as LocalFireDepartmentIcon,
  Edit as EditIcon,
  Share as ShareIcon,
  Download as DownloadIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { doc, getDoc, setDoc, deleteField, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import * as html2canvas from 'html2canvas';
import AnnouncementBanner from '../../components/AnnouncementBanner';
import WhatsNewPanel from '../../components/WhatsNewPanel';
import { computeStreakDays, getStartOfWeek } from '../../utils/streak';
import { getDocsCacheFirst } from '../../utils/firestoreCacheFirst';
import {
  computeWeeklyGoalProgress,
  legacyGoalToItems,
  upsertGoalItem,
  MAX_WEEKLY_GOAL_ITEMS,
  type WeeklyGoalItem,
  type WeeklyValidation,
} from '../../utils/weeklyGoal';
import { colorGrades, logoPath, gymName, brandGreen, brandGreenDark } from '../../config/gymConfig';

// Tableau de correspondance code-couleur/cotations (cohérent avec ClientProfile.tsx, AdminUsers.tsx...)
const levelOptions: Record<string, string> = Object.fromEntries(
  colorGrades.map(({ value, label }) => [value, label])
);

const levelColors: Record<string, string> = Object.fromEntries(
  colorGrades.map(({ value, hex }) => [value, hex])
);

interface NextCompetition {
  name: string;
  date: string;
}

interface LastBadge {
  name: string;
  color?: string;
  awardedAt: Date;
}

interface ActiveBoulderOption {
  id: string;
  label: string;
  color?: string;
}

interface ClientUserData {
  level?: string;
  inscritAuxCours?: boolean;
  first_name?: string;
  // weeklyGoalTarget : ancien champ (un simple nombre, "tous niveaux confondus"),
  // conservé en lecture seule pour les comptes n'ayant jamais rouvert ce nouvel
  // écran — voir legacyGoalToItems dans utils/weeklyGoal.ts. Plus jamais écrit.
  weeklyGoalTarget?: number | null;
  weeklyGoalItems?: WeeklyGoalItem[] | null;
}

const ClientScreen: React.FC = () => {
  const [user, loading] = useAuthState(auth);
  const [userData, setUserData] = React.useState<ClientUserData | null>(null);
  const [loadingData, setLoadingData] = React.useState(true);
  const [nextCompetition, setNextCompetition] = React.useState<NextCompetition | null>(null);
  const [lastBadge, setLastBadge] = React.useState<LastBadge | null>(null);
  const [streak, setStreak] = React.useState(0);
  const [weekValidations, setWeekValidations] = React.useState<WeeklyValidation[]>([]);
  const [goalDialogOpen, setGoalDialogOpen] = React.useState(false);
  const [draftItems, setDraftItems] = React.useState<WeeklyGoalItem[]>([]);
  const [newItemType, setNewItemType] = React.useState<'color' | 'boulder' | 'all'>('color');
  const [newColor, setNewColor] = React.useState('rouge');
  const [newColorTarget, setNewColorTarget] = React.useState('3');
  const [newAllTarget, setNewAllTarget] = React.useState('5');
  const [newBoulderId, setNewBoulderId] = React.useState('');
  const [activeBoulders, setActiveBoulders] = React.useState<ActiveBoulderOption[] | null>(null);
  const loadingBouldersRef = React.useRef(false);
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

  // ✅ Série de jours consécutifs + validations de la semaine en cours, calculées
  // côté client à partir des mêmes validations que le classement (client_boulder_results,
  // déjà lisible par son propriétaire d'après les règles Firestore) : pas de nouvelle
  // collection ni de champ dénormalisé à maintenir en plus. On garde ici le boulderId
  // de chaque validation (plus seulement sa date) : nécessaire pour évaluer un
  // objectif "couleur" ou "bloc précis" (voir utils/weeklyGoal.ts), pas seulement
  // l'ancien total tous niveaux confondus.
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
        const validations = snapshot.docs
          .map((d) => {
            const data = d.data();
            const createdAt = data.createdAt ? new Date(data.createdAt) : null;
            return createdAt ? { boulderId: data.boulderId as string, createdAt } : null;
          })
          .filter((v): v is WeeklyValidation => v !== null);

        setStreak(computeStreakDays(validations.map((v) => v.createdAt)));
        const weekStart = getStartOfWeek();
        setWeekValidations(validations.filter((v) => v.createdAt >= weekStart));
      } catch (err) {
        console.error('Erreur lors du calcul de la série :', err);
      }
    };

    fetchValidations();
  }, [user]);

  // Objectifs effectifs : ceux du nouveau champ, ou à défaut la conversion de
  // l'ancien champ numérique (voir ClientUserData.weeklyGoalTarget ci-dessus).
  const weeklyGoalItems = React.useMemo(
    () => userData?.weeklyGoalItems ?? legacyGoalToItems(userData?.weeklyGoalTarget),
    [userData]
  );

  const colorById = React.useMemo(() => {
    const map = new Map<string, string>();
    (activeBoulders || []).forEach((b) => { if (b.color) map.set(b.id, b.color); });
    return map;
  }, [activeBoulders]);

  const goalProgress = React.useMemo(
    () => computeWeeklyGoalProgress(weeklyGoalItems, weekValidations, colorById),
    [weeklyGoalItems, weekValidations, colorById]
  );

  // Requête seule (pas de setState ici) : réutilisée par les deux points d'appel
  // ci-dessous, chacun responsable de son propre setState — un objectif "couleur"
  // a besoin de connaître la couleur actuelle des blocs pour calculer sa
  // progression, et le dialogue d'édition en a besoin pour son sélecteur "bloc
  // précis". Même pattern de chargement paresseux que le "bloc désigné" des
  // Défis entre potes (ClientFriends.tsx).
  const fetchActiveBoulders = React.useCallback(async (): Promise<ActiveBoulderOption[]> => {
    const snap = await getDocsCacheFirst(
      query(collection(db, 'boulders'), where('type', '==', 'daily'), where('is_active', '==', true))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        color: data.color,
        label: `${data.color || '?'} n°${data.number || d.id} - ${data.wall || ''}`.trim(),
      };
    });
  }, []);

  // La fonction async est définie ET appelée directement dans le corps de
  // l'effet (comme fetchValidations/fetchSummary ci-dessus) plutôt que via une
  // référence externe : c'est ce qui évite l'avertissement ESLint
  // react-hooks/set-state-in-effect sur un setState appelé depuis un effet.
  React.useEffect(() => {
    if (!user) return;
    if (activeBoulders || loadingBouldersRef.current) return;
    if (!weeklyGoalItems.some((it) => it.type === 'color')) return;

    loadingBouldersRef.current = true;
    const load = async () => {
      try {
        setActiveBoulders(await fetchActiveBoulders());
      } catch (err) {
        console.error('Erreur lors du chargement des blocs actifs :', err);
      } finally {
        loadingBouldersRef.current = false;
      }
    };
    load();
  }, [user, weeklyGoalItems, activeBoulders, fetchActiveBoulders]);

  const ensureActiveBoulders = () => {
    if (activeBoulders || loadingBouldersRef.current) return;
    loadingBouldersRef.current = true;
    fetchActiveBoulders()
      .then(setActiveBoulders)
      .catch((err) => console.error('Erreur lors du chargement des blocs actifs :', err))
      .finally(() => { loadingBouldersRef.current = false; });
  };

  const goalItemLabel = (item: WeeklyGoalItem): string => {
    if (item.type === 'all') return `${item.target} bloc${item.target > 1 ? 's' : ''} (tous niveaux)`;
    if (item.type === 'color') return `${item.target} bloc${item.target > 1 ? 's' : ''} ${levelOptions[item.color] || item.color}`;
    return item.boulderLabel;
  };

  const openGoalDialog = () => {
    setDraftItems(weeklyGoalItems);
    setNewItemType('color');
    setNewColor('rouge');
    setNewColorTarget('3');
    setNewAllTarget('5');
    setNewBoulderId('');
    ensureActiveBoulders();
    setGoalDialogOpen(true);
  };

  const handleAddDraftItem = () => {
    let item: WeeklyGoalItem | null = null;
    if (newItemType === 'color') {
      const target = parseInt(newColorTarget, 10);
      if (!Number.isFinite(target) || target <= 0) return;
      item = { type: 'color', color: newColor, target };
    } else if (newItemType === 'all') {
      const target = parseInt(newAllTarget, 10);
      if (!Number.isFinite(target) || target <= 0) return;
      item = { type: 'all', target };
    } else {
      if (!newBoulderId) return;
      const opt = (activeBoulders || []).find((b) => b.id === newBoulderId);
      item = { type: 'boulder', boulderId: newBoulderId, boulderLabel: opt?.label || newBoulderId };
    }
    setDraftItems((items) => upsertGoalItem(items, item!).slice(0, MAX_WEEKLY_GOAL_ITEMS));
    setNewBoulderId('');
  };

  const handleRemoveDraftItem = (idx: number) => {
    setDraftItems((items) => items.filter((_, i) => i !== idx));
  };

  const handleSaveGoal = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        weeklyGoalItems: draftItems.length > 0 ? draftItems : deleteField(),
        // Ancien champ : jamais réécrit avec une valeur, seulement effacé au
        // premier enregistrement depuis ce nouvel écran (voir weeklyGoal.ts).
        weeklyGoalTarget: deleteField(),
      }, { merge: true });
      setUserData((prev) => (prev ? {
        ...prev,
        weeklyGoalItems: draftItems.length > 0 ? draftItems : null,
        weeklyGoalTarget: null,
      } : prev));
      setGoalDialogOpen(false);
    } catch (err) {
      console.error("Erreur lors de la sauvegarde de l'objectif :", err);
    }
  };

  const handleRemoveAllGoals = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        weeklyGoalItems: deleteField(),
        weeklyGoalTarget: deleteField(),
      }, { merge: true });
      setUserData((prev) => (prev ? { ...prev, weeklyGoalItems: null, weeklyGoalTarget: null } : prev));
      setDraftItems([]);
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
        {/* ✅ Bug mobile corrigé (18/08/2026) : l'icône d'aide était positionnée en
            absolu (top:0, right:0) par-dessus un titre centré en pleine largeur — sur
            petit écran, le texte du titre arrivait jusque sous l'icône et le "?"
            devenait illisible/impossible à taper, noyé dans le titre. Remplacé par une
            mise en page flexbox : un spacer invisible de la même largeur que l'icône
            équilibre le titre (qui reste visuellement centré) sans jamais chevaucher
            le bouton, quelle que soit la largeur d'écran ou la longueur du texte. */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ width: 40, flexShrink: 0 }} />
          <Typography variant="h4" gutterBottom sx={{ textAlign: 'center', flex: 1 }}>
            Mon espace personnel
          </Typography>
          {/* ✅ Repère de version : déplacé dans la Navbar (visible sur tout l'appli,
              en permanence) pour ne plus alourdir le défilement mobile de cet écran —
              voir src/config/appVersion.ts et components/Navbar.tsx. */}
          <Tooltip title="Comment ça marche ?">
            <IconButton
              aria-label="Aide"
              onClick={() => navigate('/client/aide')}
              sx={{ flexShrink: 0 }}
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

          {goalProgress.length > 0 ? (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Objectifs de la semaine ({goalProgress.filter((g) => g.done).length}/{goalProgress.length} atteints)
                </Typography>
                <Button size="small" startIcon={<EditIcon />} onClick={openGoalDialog}>
                  Modifier
                </Button>
              </Box>
              {goalProgress.map((g, i) => (
                <Box key={i} sx={{ mb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="body2">{goalItemLabel(g.item)}</Typography>
                    <Typography variant="body2">{g.current}/{g.target}</Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, (g.current / g.target) * 100)}
                    color={g.done ? 'success' : 'primary'}
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                </Box>
              ))}
            </Box>
          ) : (
            <Button size="small" startIcon={<EditIcon />} onClick={openGoalDialog}>
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
          <DialogTitle>Objectifs de la semaine</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Cumulez plusieurs objectifs pour cette semaine (du lundi à aujourd'hui) : un nombre de blocs
              d'une couleur donnée, un bloc précis, ou un nombre de blocs tous niveaux confondus.
            </Typography>

            {draftItems.length > 0 && (
              <Stack spacing={1} sx={{ mb: 2 }}>
                {draftItems.map((item, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 0.75 }}>
                    <Typography variant="body2">{goalItemLabel(item)}</Typography>
                    <IconButton size="small" aria-label="Retirer cet objectif" onClick={() => handleRemoveDraftItem(i)}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 1 }}>Ajouter un objectif</Typography>
            <Stack spacing={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel id="new-goal-type-label">Type d'objectif</InputLabel>
                <Select
                  labelId="new-goal-type-label"
                  label="Type d'objectif"
                  value={newItemType}
                  onChange={(e: SelectChangeEvent) => setNewItemType(e.target.value as 'color' | 'boulder' | 'all')}
                >
                  <MenuItem value="color">Un nombre de blocs d'une couleur</MenuItem>
                  <MenuItem value="boulder">Un bloc précis</MenuItem>
                  <MenuItem value="all">Un nombre de blocs, tous niveaux confondus</MenuItem>
                </Select>
              </FormControl>

              {newItemType === 'color' && (
                <Stack direction="row" spacing={1}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="new-goal-color-label">Couleur</InputLabel>
                    <Select
                      labelId="new-goal-color-label"
                      label="Couleur"
                      value={newColor}
                      onChange={(e: SelectChangeEvent) => setNewColor(e.target.value)}
                    >
                      {colorGrades.map(({ value, label }) => (
                        <MenuItem key={value} value={value}>{label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    type="number"
                    label="Nombre"
                    value={newColorTarget}
                    onChange={(e) => setNewColorTarget(e.target.value)}
                    slotProps={{ htmlInput: { min: 1 } }}
                    sx={{ width: 110, flexShrink: 0 }}
                  />
                </Stack>
              )}

              {newItemType === 'boulder' && (
                <FormControl fullWidth size="small">
                  <InputLabel id="new-goal-boulder-label">Bloc</InputLabel>
                  <Select
                    labelId="new-goal-boulder-label"
                    label="Bloc"
                    value={newBoulderId}
                    onChange={(e: SelectChangeEvent) => setNewBoulderId(e.target.value)}
                  >
                    {(activeBoulders || []).map((b) => (
                      <MenuItem key={b.id} value={b.id}>{b.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {newItemType === 'all' && (
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Nombre de blocs"
                  value={newAllTarget}
                  onChange={(e) => setNewAllTarget(e.target.value)}
                  slotProps={{ htmlInput: { min: 1 } }}
                />
              )}

              <Button
                variant="outlined"
                size="small"
                onClick={handleAddDraftItem}
                disabled={
                  draftItems.length >= MAX_WEEKLY_GOAL_ITEMS ||
                  (newItemType === 'color' && (!newColorTarget || Number(newColorTarget) <= 0)) ||
                  (newItemType === 'all' && (!newAllTarget || Number(newAllTarget) <= 0)) ||
                  (newItemType === 'boulder' && !newBoulderId)
                }
              >
                Ajouter à la liste
              </Button>
            </Stack>
          </DialogContent>
          <DialogActions>
            {(!!userData?.weeklyGoalItems?.length || !!userData?.weeklyGoalTarget) && (
              <Button color="error" onClick={handleRemoveAllGoals} sx={{ mr: 'auto' }}>
                Tout supprimer
              </Button>
            )}
            <Button onClick={() => setGoalDialogOpen(false)}>Annuler</Button>
            <Button variant="contained" onClick={handleSaveGoal}>
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
                // ✅ Dégradé aligné sur le vert de la charte du site vitrine (voir
                // gymConfig.ts) — auparavant un bleu/violet sans lien avec la marque.
                background: `linear-gradient(135deg, ${brandGreen}, ${brandGreenDark})`,
                color: '#fff',
                textAlign: 'center',
              }}
            >
              <Box component="img" src={logoPath} alt={gymName} sx={{ width: 56, height: 56, mb: 1 }} />
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