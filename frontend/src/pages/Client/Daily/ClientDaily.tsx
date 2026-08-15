import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc, setDoc, doc, getDoc, runTransaction } from 'firebase/firestore';
import { summaryFromColorCounts, scoreDeltaForValidation, type ColorCounts } from '../../../utils/classementScore';
import {
  Container, Typography, Box, Button, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, CardMedia, Rating, TextField,
  Grid, Chip, FormControl, InputLabel, Select, MenuItem,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { walls as wallList, colorGrades, mysteryColorHexKey, mysteryColorHex, logoPath } from '../../../config/gymConfig';
import { getBoulderImageUrl } from '../../../services/imageStorage';

const levelColors: Record<string, string> = {
  ...Object.fromEntries(colorGrades.map(({ value, hex }) => [value, hex])),
  [mysteryColorHexKey]: mysteryColorHex
};

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

interface Boulder {
  id: string;
  number: number | string;
  wall: string;
  color?: string;
  difficulty?: string;
  difficulty_level?: string;
  difficulty_types?: string[];
  image_url?: string;
  image_base64?: string;
  image_public_id?: string;
  instructions?: string;
  created_at?: string;
  created_by?: string;
  type?: string;
  is_child_route?: boolean;
  is_active?: boolean;
}

// ✅ Chantier 2 : image_public_id (Cloudinary) prioritaire, repli sur l'ancien
// base64 pour les blocs non encore migrés (voir imageStorage.ts).
const boulderImageSrc = (boulder: Boulder, variant: 'thumb' | 'full'): string =>
  (boulder.image_public_id ? getBoulderImageUrl(boulder.image_public_id, variant) : boulder.image_url || boulder.image_base64) || logoPath;

const ClientDaily: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [usersById, setUsersById] = useState<Record<string, UserInfo>>({});
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [selectedBoulder, setSelectedBoulder] = useState<Boulder | null>(null);
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
  // ✅ "tous" = vue par mur historique ; une couleur = vue transversale (tous les murs)
  // pour retrouver son niveau sans avoir à ouvrir chaque mur un par un.
  const [levelFilter, setLevelFilter] = useState<string>('tous');

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

  // ✅ Compteur incrémental (CONCEPTION-selecteur-marge-compteur-incremental.md §3) :
  // remplace l'ancien cache en mémoire préchargé au montage (historique complet des
  // réussites, un `getDocs` non borné qui grossissait avec l'ancienneté du compte —
  // voir git blame pour l'ancienne version). Une validation ne lit plus désormais que
  // SON PROPRE bloc, à la demande, par un `getDoc` sur l'ID déterministe du résultat
  // ("${uid}_${boulderId}") — coût constant, jamais proportionnel à l'historique.
  //
  // `previousStateCacheRef` évite de relire Firestore deux fois pour le même bloc dans
  // la même session (ex. Réussi puis "Enregistrer" avec un nombre d'essais modifié) :
  // après une transition, on y stocke le nouvel état, qui devient la référence pour la
  // transition suivante. `undefined` = jamais consulté cette session (à lire) ;
  // `null` = confirmé absent de Firestore (jamais validé avant cette session).
  const previousStateCacheRef = useRef<Map<string, { attempts: number } | null>>(new Map());

  // ✅ Chantier écritures point 5 (repris ici) : classement_profiles est un résumé
  // dérivé, pas la donnée source — pas besoin d'être exact à la seconde près. Les
  // deltas de score/couleur sont accumulés en mémoire et appliqués en une seule
  // transaction Firestore après un debounce, avec flush sur fermeture de la modale de
  // détail et sur "pagehide" (mêmes précautions que le point 4 côté compétition/cours)
  // — le résultat du bloc lui-même (client_boulder_results) continue d'être écrit
  // immédiatement.
  const CLASSEMENT_DEBOUNCE_MS = 3000;
  const classementWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScoreDeltaRef = useRef(0);
  const pendingColorDeltaRef = useRef<Map<string, number>>(new Map());

  // ✅ Chantier écritures point 3 : dernière valeur réellement PERSISTÉE (pas
  // affichée) par bloc pour client_boulder_results — évite une écriture si un
  // reclic sur "Réussi" déjà actif ou un "Enregistrer" sans changement
  // reproduit exactement l'état déjà écrit. Ne couvre que la session en cours
  // (pas de lecture au montage : en ajouter une reviendrait sur le correctif
  // de lectures de ClientDaily fait plus tôt ce jour-là).
  const lastPersistedResultRef = useRef<Record<string, {
    success: boolean; rating: number; comment: string; attempts: number; proposedDifficulty: string | null;
  }>>({});

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchUsers = async () => {
      const map: Record<string, UserInfo> = {};
      // ✅ Un client ne peut pas lister toute la collection "users" (règles Firestore :
      // lecture limitée à son propre document pour ce rôle). "staff_directory" (annuaire
      // public admin/moniteur/ouvreur, voir AdminUsers.tsx) permet de résoudre le "Créé
      // par" d'un bloc ; son propre document reste lu à part pour son propre nom dans
      // les signalements envoyés.
      try {
        const staffSnapshot = await getDocs(collection(db, 'staff_directory'));
        staffSnapshot.docs.forEach((staffDoc) => {
          const data = staffDoc.data();
          const [firstName, ...lastNameParts] = (data.displayName || '').split(' ');
          map[staffDoc.id] = { id: staffDoc.id, firstName: firstName || '', lastName: lastNameParts.join(' ') };
        });
      } catch (err) {
        console.error("Erreur lors du chargement de l'annuaire staff:", err);
      }
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
        const bouldersData: Boulder[] = snapshot.docs.map(doc => ({
          id: doc.id,
          number: doc.data().number || doc.id,
          ...doc.data()
        } as Boulder));
        setBoulders(bouldersData);
      } catch (err: unknown) {
        setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
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

  const isMysteryBoulder = (boulder: Boulder): boolean => {
    return boulder.color === 'mystère' ||
           boulder.color === 'mystere' ||
           boulder.difficulty === 'mystère' ||
           boulder.difficulty_level === 'mystère';
  };

  const handleOpenWall = (wall: string) => {
    setSelectedWall(wall);
    setOpenWallDialog(true);
  };

  const handleOpenBoulder = (boulder: Boulder) => {
    setSelectedBoulder(boulder);
    setOpenBoulderDialog(true);
  };

  const getFilteredBoulders = () => {
    if (levelFilter === 'tous') return [];
    return boulders.filter((b) => (b.color || b.difficulty) === levelFilter);
  };

  // ✅ Carte de bloc factorisée : utilisée à la fois dans la modale "par mur" et dans
  // la vue transversale "par niveau" (showWall affiche alors le nom du mur dessus).
  const renderBoulderCard = (boulder: Boulder, showWall = false) => (
    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={boulder.id}>
      <Card sx={{ cursor: 'pointer' }} onClick={() => handleOpenBoulder(boulder)}>
        <CardMedia
          component="img"
          height="100"
          image={boulderImageSrc(boulder, 'thumb')}
          alt={`Bloc ${boulder.number}`}
          sx={{ objectFit: 'cover' }}
        />
        <CardContent sx={{ p: 1 }}>
          {showWall && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
              {boulder.wall}
            </Typography>
          )}
          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            Bloc n°{boulder.number}
            {isMysteryBoulder(boulder) && (
              <Chip label="Mystère" size="small" sx={{ ml: 1, backgroundColor: levelColors.mystère }} />
            )}
            {boulder.is_child_route && (
              <Chip label="🐒 Enfant" size="small" color="info" sx={{ ml: 1 }} />
            )}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );

  // ✅ Couleur courante de chaque bloc actif — utilisée à la fois pour calculer le
  // delta de points d'une validation et, si un jour un bloc est recoloré, pour que
  // c'est SA prochaine validation (pas une relecture globale) qui applique le nouveau
  // barème. Un bloc désactivé entre-temps (is_active devenu false) sort de `boulders`,
  // donc de cette carte — comme avant ce chantier (l'ancien filtre `colorById.has(bId)`
  // avait le même effet) : sa contribution au classement reste celle du dernier calcul
  // avant désactivation, elle n'est plus mise à jour tant qu'il ne redevient pas actif.
  // Cas marginal, inchangé par ce chantier — voir handleValidateSuccess/handleRate,
  // qui n'appliquent un delta que si `colorById.get(boulderId)` résout une couleur.
  const colorById = useMemo(
    () => new Map(boulders.map((b) => [b.id, b.color || b.difficulty || 'Inconnu'])),
    [boulders]
  );

  // ✅ Classement en continu (ClientClassement.tsx) : un client ne peut pas lire les
  // résultats des AUTRES clients (règles Firestore), donc chaque client tient à jour
  // SON PROPRE résumé sur sa fiche "classement_profiles" à chaque validation — le
  // classement se contente ensuite de lire ces résumés déjà calculés.
  //
  // ✅ Compteur incrémental (CONCEPTION-selecteur-marge-compteur-incremental.md §3,
  // remplace l'ancien recalcul complet depuis successfulAttemptsRef) : cette fonction
  // applique les deltas accumulés (pendingScoreDeltaRef/pendingColorDeltaRef) dans une
  // transaction Firestore — jamais de lecture de l'historique complet. bouldersValidated
  // et bestColorRank sont dérivés de colorCounts APRÈS application des deltas (jamais
  // incrémentés indépendamment), pour n'avoir qu'une seule source de vérité.
  const flushClassementWrite = React.useCallback(async () => {
    if (classementWriteTimer.current) {
      clearTimeout(classementWriteTimer.current);
      classementWriteTimer.current = null;
    }
    if (!user) return;
    const scoreDelta = pendingScoreDeltaRef.current;
    const colorDeltas = pendingColorDeltaRef.current;
    if (scoreDelta === 0 && colorDeltas.size === 0) return;
    // ✅ Capturé puis remis à zéro AVANT l'écriture (pas après) : un delta qui arrive
    // pendant la transaction doit s'accumuler dans un nouveau cycle, pas se perdre s'il
    // arrivait pendant l'await ci-dessous.
    pendingScoreDeltaRef.current = 0;
    pendingColorDeltaRef.current = new Map();
    try {
      const ref = doc(db, 'classement_profiles', user.uid);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists() ? snap.data() : {};
        const colorCounts: ColorCounts = { ...(data.colorCounts as ColorCounts | undefined) };
        colorDeltas.forEach((delta, color) => {
          colorCounts[color as keyof ColorCounts] = ((colorCounts[color as keyof ColorCounts] as number) || 0) + delta;
        });
        const { bouldersValidated, bestColorRank } = summaryFromColorCounts(colorCounts);
        tx.set(ref, {
          score: (data.score || 0) + scoreDelta,
          bouldersValidated,
          bestColorRank,
          colorCounts,
        }, { merge: true });
      });
    } catch (err) {
      console.error('Erreur lors de la mise à jour du classement:', err);
      // ✅ L'écriture a échoué : remettre les deltas en attente plutôt que les perdre
      // silencieusement (ils seront réappliqués au prochain flush réussi).
      pendingScoreDeltaRef.current += scoreDelta;
      colorDeltas.forEach((delta, color) => {
        pendingColorDeltaRef.current.set(color, (pendingColorDeltaRef.current.get(color) || 0) + delta);
      });
    }
  }, [user]);

  // ✅ Flush sur "pagehide" (mêmes précautions que le point 4 côté compétition
  // / cours) : sans ça, une validation juste avant fermeture de l'onglet
  // perdrait sa mise à jour de classement (le résultat du bloc, lui, est déjà
  // en base — seul le résumé dérivé serait en retard).
  useEffect(() => {
    window.addEventListener('pagehide', flushClassementWrite);
    return () => window.removeEventListener('pagehide', flushClassementWrite);
  }, [flushClassementWrite]);

  // ✅ Phase 1/2 (lecture pure, aucune mutation) : résout l'ancien état de CE bloc,
  // lu une seule fois par session (pas l'historique entier) via un getDoc() ciblé sur
  // l'ID déterministe du résultat. Appelée AVANT l'écrasement de client_boulder_results
  // par l'appelant, pour lire l'état encore en base. Séparée de applyClassementDelta
  // ci-dessous pour que rien ne soit muté si le setDoc qui suit échoue ensuite — sans
  // quoi classement_profiles pourrait dériver d'un résultat jamais réellement écrit.
  const resolvePreviousClassementState = async (uid: string, boulderId: string): Promise<{ attempts: number } | null> => {
    const cached = previousStateCacheRef.current.get(boulderId);
    if (cached !== undefined) return cached;
    try {
      const snap = await getDoc(doc(db, 'client_boulder_results', `${uid}_${boulderId}`));
      return snap.exists() && snap.data().success ? { attempts: snap.data().attempts || 1 } : null;
    } catch (err) {
      console.error("Erreur lors de la lecture de l'ancien résultat:", err);
      return null; // ✅ Traité comme "pas de validation antérieure" — le script de réconciliation corrigera un éventuel écart.
    }
  };

  // ✅ Phase 2/2 (mutation) : appelée seulement après le succès du setDoc de
  // l'appelant. Accumule le delta dans les refs "pending" et planifie le flush débounced.
  const applyClassementDelta = (
    boulderId: string,
    color: string,
    previous: { attempts: number } | null,
    success: boolean,
    resultAttempts: number
  ) => {
    const newState = success ? { attempts: resultAttempts } : null;
    pendingScoreDeltaRef.current += scoreDeltaForValidation(
      color,
      previous?.attempts ?? null,
      newState?.attempts ?? null
    );
    const colorCountDelta = (newState ? 1 : 0) - (previous ? 1 : 0);
    if (colorCountDelta !== 0) {
      pendingColorDeltaRef.current.set(color, (pendingColorDeltaRef.current.get(color) || 0) + colorCountDelta);
    }
    previousStateCacheRef.current.set(boulderId, newState);

    if (classementWriteTimer.current) clearTimeout(classementWriteTimer.current);
    classementWriteTimer.current = setTimeout(() => { flushClassementWrite(); }, CLASSEMENT_DEBOUNCE_MS);
  };


  const handleValidateSuccess = async (boulderId: string, success: boolean) => {
    if (!user) return;
    const candidate = {
      success,
      rating: ratings[boulderId] || 0,
      comment: comments[boulderId] || '',
      attempts: attempts[boulderId] || 1,
      proposedDifficulty: proposedDifficulties[boulderId] || null,
    };
    const last = lastPersistedResultRef.current[boulderId];
    if (last &&
        last.success === candidate.success &&
        last.rating === candidate.rating &&
        last.comment === candidate.comment &&
        last.attempts === candidate.attempts &&
        last.proposedDifficulty === candidate.proposedDifficulty) {
      // ✅ Chantier écritures point 3 : état déjà persisté à l'identique
      // (reclic sur "Réussi" déjà actif) — rien à écrire.
      return;
    }
    // ✅ Lu AVANT l'écrasement du document (pure lecture, aucune mutation) : c'est le
    // seul moment où l'ancien état de ce bloc est encore en base.
    const classementColor = colorById.get(boulderId);
    const previousClassementState = classementColor
      ? await resolvePreviousClassementState(user.uid, boulderId)
      : null;
    try {
      const resultId = `${user.uid}_${boulderId}`;
      await setDoc(doc(db, 'client_boulder_results', resultId), {
        userId: user.uid,
        boulderId,
        ...candidate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      lastPersistedResultRef.current[boulderId] = candidate;
      setSuccessResults(prev => ({ ...prev, [boulderId]: success }));
      setSuccess('Réussite enregistrée!');
      setTimeout(() => setSuccess(null), 3000);
      // ✅ Appliqué seulement maintenant que l'écriture a réussi : si le setDoc
      // ci-dessus avait échoué, aucune mutation du classement n'aurait eu lieu.
      if (classementColor) {
        applyClassementDelta(boulderId, classementColor, previousClassementState, success, candidate.attempts);
      }
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRate = async (boulderId: string, rating: number | null, comment: string) => {
    if (!rating || !user) return;
    const candidate = {
      success: successResults[boulderId] || false,
      rating,
      comment,
      attempts: attempts[boulderId] || 1,
      proposedDifficulty: proposedDifficulties[boulderId] || null,
    };
    const last = lastPersistedResultRef.current[boulderId];
    if (last &&
        last.success === candidate.success &&
        last.rating === candidate.rating &&
        last.comment === candidate.comment &&
        last.attempts === candidate.attempts &&
        last.proposedDifficulty === candidate.proposedDifficulty) {
      return;
    }
    // ✅ "Enregistrer" est le seul endroit où un changement du nombre d'essais fait
    // après le clic Réussi/Échoué initial est réellement sauvegardé (même doc,
    // ré-écrit ici) : il faut donc aussi rafraîchir le classement à ce moment, sinon
    // le score reste basé sur la valeur d'essais du tout premier clic. Lu AVANT
    // l'écrasement du document, même raison que dans handleValidateSuccess.
    const classementColor = colorById.get(boulderId);
    const previousClassementState = classementColor
      ? await resolvePreviousClassementState(user.uid, boulderId)
      : null;
    try {
      const resultId = `${user.uid}_${boulderId}`;
      await setDoc(doc(db, 'client_boulder_results', resultId), {
        userId: user.uid,
        boulderId,
        ...candidate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      lastPersistedResultRef.current[boulderId] = candidate;
      if (classementColor) {
        applyClassementDelta(boulderId, classementColor, previousClassementState, candidate.success, candidate.attempts);
      }
      setRatings(prev => ({ ...prev, [boulderId]: rating }));
      setComments(prev => ({ ...prev, [boulderId]: comment }));
      setSuccess('Note enregistrée!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleReportIssue = async (boulderId: string, boulderNumber: number | string, wall: string) => {
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
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
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

      <FormControl size="small" sx={{ mb: 3, minWidth: 220 }}>
        <InputLabel id="level-filter-label">Filtrer par niveau</InputLabel>
        <Select
          labelId="level-filter-label"
          label="Filtrer par niveau"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
        >
          <MenuItem value="tous">Tous les niveaux (par mur)</MenuItem>
          {Object.keys(levelColors).map((color) => (
            <MenuItem key={color} value={color}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Box sx={{ width: 14, height: 14, backgroundColor: levelColors[color], border: '1px solid #ccc', mr: 1 }} />
                {color.charAt(0).toUpperCase() + color.slice(1)}
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {levelFilter === 'tous' ? (
        <>
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
        </>
      ) : (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Blocs de niveau {levelFilter}, tous murs confondus :
          </Typography>
          {getFilteredBoulders().length === 0 ? (
            <Typography sx={{ mb: 4 }}>Aucun bloc de ce niveau pour le moment.</Typography>
          ) : (
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {getFilteredBoulders().map((boulder) => renderBoulderCard(boulder, true))}
            </Grid>
          )}
        </>
      )}

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
              {selectedWall && getBouldersByWall(selectedWall).map((boulder) => renderBoulderCard(boulder))}
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
        onClose={() => { flushClassementWrite(); setOpenBoulderDialog(false); }}
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
              {selectedBoulder.is_child_route && (
                <Chip label="🐒 Enfant" size="small" color="info" sx={{ ml: 1 }} />
              )}
            </DialogTitle>
            <DialogContent>
              <CardMedia
                component="img"
                height="200"
                image={boulderImageSrc(selectedBoulder, 'full')}
                alt={`Bloc ${selectedBoulder.number}`}
                sx={{ mb: 2, objectFit: 'contain' }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2">Niveau: </Typography>
                <Box sx={{
                  backgroundColor: levelColors[selectedBoulder.color || selectedBoulder.difficulty || ''] || '#CCCCCC',
                  color: ['blanc', 'mystère', 'mystere'].includes(selectedBoulder.color || selectedBoulder.difficulty || '') ? 'black' : 'white',
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
              <Button onClick={() => { flushClassementWrite(); setOpenBoulderDialog(false); }}>Annuler</Button>
              <Button
                variant="contained"
                onClick={async () => {
                  await handleRate(selectedBoulder.id, ratings[selectedBoulder.id] || 0, comments[selectedBoulder.id] || '');
                  await flushClassementWrite();
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