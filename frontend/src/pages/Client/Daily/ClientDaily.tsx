import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc, setDoc, doc, getDoc } from 'firebase/firestore';
import { scoreDeltaForValidation, isWithinSeasonWindow } from '../../../utils/classementScore';
import { calculatePoints } from '../../../utils/climbingPoints';
import { getDocsCacheFirst } from '../../../utils/firestoreCacheFirst';
import { useDebouncedFlushQueue } from '../../../utils/useDebouncedFlushQueue';
import { runReadThenWriteTransaction } from '../../../utils/firestoreTransaction';
import {
  buildClassementFlushWrites, mergeClassementFlushPending, emptyClassementFlushPending,
  type ClassementFlushPending,
} from '../../../utils/classementFlushWrites';
import {
  Container, Typography, Box, Button, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, CardMedia, Rating, TextField,
  Grid, Chip, FormControl, InputLabel, Select, MenuItem,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { walls as wallList, colorGrades, mysteryColorHexKey, mysteryColorHex, logoPath, storageKeyPrefix } from '../../../config/gymConfig';
import { getBoulderImageUrl } from '../../../services/imageStorage';
import CasinoIcon from '@mui/icons-material/Casino';
import type { Level } from '../../../utils/competitionEligibility';
import { drawProposal, drawDeathProposal, type DrawResult, type WallCounts } from '../../../utils/roulette';
import RouletteDialog from './RouletteDialog';

// ✅ Bloc Roulette : clé localStorage de l'anti-lassitude (§1.5) — les ~10 derniers ids de
// propositions tirées, exclus du tirage suivant. Préfixée comme les autres clés de la salle
// (voir ThemeModeContext.tsx). Jamais dans Firestore : le tirage doit rester gratuit.
const ROULETTE_RECENT_STORAGE_KEY = `${storageKeyPrefix}_roulette_recent`;
const ROULETTE_RECENT_MAX = 10;

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

  // ✅ Bloc Roulette : niveau et compteur par mur du grimpeur lui-même, lus une seule fois au
  // montage (voir extension de `fetchUsers` ci-dessous — pas de lecture Firestore
  // supplémentaire, le `getDoc(users/{uid})` existait déjà pour résoudre son propre nom).
  const [selfProfile, setSelfProfile] = useState<{ level?: Level; wallCounts?: WallCounts }>({});
  const [openRoulette, setOpenRoulette] = useState(false);
  const [rouletteIsDeath, setRouletteIsDeath] = useState(false);
  const [rouletteResult, setRouletteResult] = useState<DrawResult | null>(null);

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
  // `null` = confirmé absent de Firestore (jamais écrit avant cette session, ni succès
  // ni échec). `success`/`attempts` alimentent le delta de classement (uniquement si
  // `success` est vrai) ; `createdAt` sert à préserver la date de première écriture du
  // document (voir `resolvePreviousResultState` — correctif du bug où `createdAt` était
  // réécrit à chaque édition, cf. RELECTURE-classement-saisonnier.md §1).
  const previousStateCacheRef = useRef<Map<string, { attempts: number; success: boolean; createdAt: string } | null>>(new Map());

  // ✅ Chantier écritures point 5 : classement_profiles est un résumé dérivé, pas la
  // donnée source — pas besoin d'être exact à la seconde près. Les deltas sont accumulés
  // en mémoire et appliqués en une seule transaction Firestore après un debounce, avec
  // flush sur fermeture de la modale de détail et sur "pagehide" — le résultat du bloc
  // lui-même (client_boulder_results) continue d'être écrit immédiatement.
  //
  // ✅ PROCESSUS-erreurs-avalees.md §3 (V2.48) : le minuteur/pagehide/compteur d'échecs
  // qui vivaient ici en refs éparpillées sont maintenant portés par `useDebouncedFlushQueue`
  // (générique, réutilisé par ClientCompetitions.tsx/ClientCourseSession.tsx) — une seule
  // clé ('classement'), un seul payload `ClassementFlushPending` fusionné par addition (voir
  // `mergeClassementFlushPending`). `persist` ci-dessous construit les écritures via la
  // fonction PURE `buildClassementFlushWrites`, appliquées par `runReadThenWriteTransaction`
  // qui impose par sa signature l'ordre lectures-puis-écritures — la classe de bug trouvée le
  // 19/08 (lecture après écriture, silencieusement avalée) ne peut plus se reproduire ici.
  const CLASSEMENT_DEBOUNCE_MS = 3000;

  // ✅ Défis entre potes (CONCEPTION-roulette-et-defis.md, Partie 2, §2.4) : défis actifs de
  // l'utilisateur, chargés UNE FOIS au montage (cache-first, jamais relus par validation —
  // voir l'useEffect plus bas), gardés en mémoire.
  const activeChallengesRef = useRef<Array<{
    id: string;
    structure: 'seuil' | 'fenetre' | 'bloc_designe' | 'declaratif';
    target_color?: string;
    metric?: 'points' | 'blocs';
    boulder_id?: string;
    ends_at?: string;
  }>>([]);

  const classementQueue = useDebouncedFlushQueue<ClassementFlushPending>({
    debounceMs: CLASSEMENT_DEBOUNCE_MS,
    merge: mergeClassementFlushPending,
    // ✅ failureThreshold non précisé -> défaut du hook (3), volontairement plus tolérant
    // que ClientCompetitions/ClientCourseSession (seuil 1) : un résumé dérivé peut se
    // permettre d'attendre une coupure réseau transitoire avant d'alerter, contrairement à
    // une saisie de compétition en direct où chaque échec doit remonter tout de suite.
    errorContext: () => 'Erreur lors de la mise à jour du classement',
    persist: async (_key, pending) => {
      if (!user) return;
      const classementProfileRef = doc(db, 'classement_profiles', user.uid);
      const userRef = doc(db, 'users', user.uid);
      const challengeIds = new Set<string>([...pending.challengeDeltas.keys(), ...pending.blocDesigneScores.keys()]);
      const challengeRefs = new Map(Array.from(challengeIds, (id) => [id, doc(db, 'challenges', id)]));

      const reads: Record<string, ReturnType<typeof doc>> = { classementProfile: classementProfileRef };
      if (pending.wallDeltas.size > 0) reads.user = userRef;
      challengeRefs.forEach((ref, id) => { reads[`challenge:${id}`] = ref; });

      await runReadThenWriteTransaction(db, reads, (readData) => buildClassementFlushWrites(
        user.uid,
        pending,
        {
          classementProfile: readData.classementProfile,
          user: readData.user,
          challenges: new Map(Array.from(challengeIds, (id) => [id, readData[`challenge:${id}`]])),
        },
        { classementProfileRef, userRef, challengeRefs }
      ));
    },
    // ✅ Niveau 3 (PROCESSUS-erreurs-avalees.md §2) : réutilise l'état error/Alert déjà
    // présent sur cet écran plutôt qu'un nouveau Snackbar.
    onDurableFailure: () => {
      setError("Ta progression (classement, murs, défis) n'arrive pas à s'enregistrer depuis plusieurs tentatives. Tes validations de blocs restent bien enregistrées — réessaie plus tard ou recharge la page.");
    },
    onRecovered: () => setError(null),
  });

  // ✅ Fenêtre de saison, lue une seule fois au montage depuis `app_config/classement_saison`
  // (voir useEffect plus bas) — pas de lecture par validation, un doc de config ne le
  // justifie pas. `null` = pas encore configurée par l'admin (aucune validation ne compte
  // alors pour la saison, seulement pour la progression personnelle all-time).
  const seasonWindowRef = useRef<{ debut: string; fin: string } | null>(null);

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
          // ✅ Bloc Roulette : même lecture, pas de getDoc séparé — niveau et compteur par
          // mur du grimpeur, nécessaires au tirage (utils/roulette.ts).
          setSelfProfile({ level: data.level, wallCounts: data.wallCounts });
        }
      } catch (ownErr) {
        console.error('Erreur lors du chargement de son propre profil:', ownErr);
      }
      setUsersById(map);
    };

    fetchUsers();
  }, [user, loadingAuth]);

  // ✅ Défis entre potes : chargés une seule fois au montage (cache-first — voir
  // `activeChallengesRef` ci-dessus), jamais relus à chaque validation. Ne charge que les
  // défis "en_cours" : un défi terminé ne doit plus recevoir de deltas.
  useEffect(() => {
    if (!user || loadingAuth) return;
    const fetchActiveChallenges = async () => {
      try {
        const snap = await getDocsCacheFirst(query(
          collection(db, 'challenges'),
          where('participants', 'array-contains', user.uid),
          where('status', '==', 'en_cours')
        ));
        activeChallengesRef.current = snap.docs.map((challengeDoc) => {
          const data = challengeDoc.data();
          return {
            id: challengeDoc.id,
            structure: data.structure,
            target_color: data.target_color,
            metric: data.metric,
            boulder_id: data.boulder_id,
            ends_at: data.ends_at,
          };
        });
      } catch (err) {
        console.error('Erreur lors du chargement des défis actifs:', err);
      }
    };
    fetchActiveChallenges();
  }, [user, loadingAuth]);

  // ✅ Classement de saison : fenêtre lue une seule fois au montage (voir
  // `seasonWindowRef` ci-dessus). Une config absente ou incomplète (admin n'a jamais
  // réglé `app_config/classement_saison`) laisse `seasonWindowRef` à `null` — aucune
  // validation ne compte alors pour la saison, sans erreur ni blocage de la page.
  useEffect(() => {
    if (!user || loadingAuth) return;
    const fetchSeasonWindow = async () => {
      try {
        const snap = await getDoc(doc(db, 'app_config', 'classement_saison'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.debut && data.fin) {
            seasonWindowRef.current = { debut: data.debut, fin: data.fin };
          }
        }
      } catch (err) {
        console.error('Erreur lors du chargement de la fenêtre de saison:', err);
      }
    };
    fetchSeasonWindow();
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

  // ✅ Bloc Roulette : lecture/écriture localStorage isolées ici (pas dans utils/roulette.ts,
  // qui reste un module pur) — anti-lassitude §1.5.
  const getRecentRouletteIds = (): string[] => {
    try {
      const raw = window.localStorage.getItem(ROULETTE_RECENT_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  };
  const pushRecentRouletteId = (id: string) => {
    try {
      const recent = [id, ...getRecentRouletteIds().filter((existing) => existing !== id)].slice(0, ROULETTE_RECENT_MAX);
      window.localStorage.setItem(ROULETTE_RECENT_STORAGE_KEY, JSON.stringify(recent));
    } catch {
      // ✅ localStorage indisponible (navigation privée stricte, quota) : l'anti-lassitude
      // dégrade proprement, ce n'est pas une fonctionnalité critique.
    }
  };

  // ✅ Blocs éligibles au tirage : uniquement les blocs actifs du jour, avec leur couleur et
  // mur COURANTS (comme colorById/wallById) — aucune lecture Firestore supplémentaire, le
  // module utils/roulette.ts est pur (voir son en-tête).
  const rouletteBoulders = () => boulders.map((b) => ({
    id: b.id,
    color: b.color || b.difficulty || '',
    wall: b.wall,
    number: b.number,
  }));

  // ✅ "déjà validé" limité à la session en cours (successResults), pas l'historique complet
  // — décision actée pour rester gratuit (aucune lecture Firestore au tirage).
  const validatedBoulderIdsThisSession = () =>
    new Set(Object.entries(successResults).filter(([, ok]) => ok).map(([id]) => id));

  const handleOpenRoulette = () => {
    const result = drawProposal({
      boulders: rouletteBoulders(),
      userLevel: selfProfile.level,
      validatedBoulderIds: validatedBoulderIdsThisSession(),
      wallCounts: selfProfile.wallCounts || {},
      recentProposalIds: getRecentRouletteIds(),
    });
    pushRecentRouletteId(result.proposal.id);
    setRouletteResult(result);
    setRouletteIsDeath(false);
    setOpenRoulette(true);
  };

  const handleOpenDeathRoulette = () => {
    const result = drawDeathProposal({
      boulders: rouletteBoulders(),
      userLevel: selfProfile.level,
      validatedBoulderIds: validatedBoulderIdsThisSession(),
      wallCounts: selfProfile.wallCounts || {},
    });
    setRouletteResult(result);
    setRouletteIsDeath(true);
    setOpenRoulette(true);
  };

  const handleRelancerRoulette = () => {
    if (rouletteIsDeath) {
      handleOpenDeathRoulette();
    } else {
      handleOpenRoulette();
    }
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

  // ✅ Bloc Roulette / compteur par mur (CONCEPTION-roulette-et-defis.md §1.7.B) : même
  // principe que `colorById` — le mur COURANT du bloc, jamais un mur figé à la validation.
  const wallById = useMemo(
    () => new Map(boulders.map((b) => [b.id, b.wall])),
    [boulders]
  );

  // ✅ Phase 1/2 (lecture pure, aucune mutation) : résout l'ancien état de CE bloc,
  // lu une seule fois par session (pas l'historique entier) via un getDoc() ciblé sur
  // l'ID déterministe du résultat. Appelée AVANT l'écrasement de client_boulder_results
  // par l'appelant, pour lire l'état encore en base. Séparée des mutations qui suivent
  // pour que rien ne soit muté si le setDoc qui suit échoue ensuite — sans quoi
  // classement_profiles pourrait dériver d'un résultat jamais réellement écrit.
  //
  // Renvoie l'état complet du document existant (pas seulement `attempts`), pour deux
  // usages distincts par les appelants : le delta de classement (qui n'utilise
  // `attempts` que si `success` était vrai) et la préservation de `createdAt` (qui en a
  // besoin quel que soit `success` — un document créé par un clic "Échoué" a quand même
  // une vraie date de première écriture). Correctif RELECTURE-classement-saisonnier.md
  // §1 : avant ce correctif, `createdAt` était réécrit à "maintenant" à CHAQUE édition
  // (même setDoc que `updatedAt`), donc inutilisable pour savoir quand une validation a
  // réellement eu lieu — un prérequis du classement de saison.
  const resolvePreviousResultState = async (uid: string, boulderId: string): Promise<{ attempts: number; success: boolean; createdAt: string } | null> => {
    const cached = previousStateCacheRef.current.get(boulderId);
    if (cached !== undefined) return cached;
    try {
      const snap = await getDoc(doc(db, 'client_boulder_results', `${uid}_${boulderId}`));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        attempts: data.attempts || 1,
        success: !!data.success,
        createdAt: data.createdAt || new Date().toISOString() // ✅ repli si un doc antérieur au correctif n'a jamais eu ce champ correctement peuplé
      };
    } catch (err) {
      console.error("Erreur lors de la lecture de l'ancien résultat:", err);
      return null; // ✅ Traité comme "pas de résultat antérieur" — le script de réconciliation corrigera un éventuel écart de classement ; createdAt repartira de "maintenant" pour ce document.
    }
  };

  // ✅ Mutation : appelée seulement après le succès du setDoc de l'appelant. Construit le
  // delta de cette validation et le confie à la file débouncée (voir `classementQueue`
  // ci-dessus) — `enqueue` fusionne (additionne) avec un éventuel delta déjà en attente et
  // (re)planifie le flush. Ne touche plus au cache de l'état précédent (voir
  // `cachePreviousResultState` ci-dessous, appelé séparément par l'appelant pour couvrir
  // aussi le cas sans couleur).
  const applyClassementDelta = (
    color: string,
    previous: { attempts: number } | null,
    success: boolean,
    resultAttempts: number,
    wall?: string,
    boulderId?: string
  ) => {
    const newState = success ? { attempts: resultAttempts } : null;
    const scoreDelta = scoreDeltaForValidation(
      color,
      previous?.attempts ?? null,
      newState?.attempts ?? null
    );
    const colorCountDelta = (newState ? 1 : 0) - (previous ? 1 : 0);
    const delta = emptyClassementFlushPending();
    delta.scoreDelta = scoreDelta;
    if (colorCountDelta !== 0) {
      delta.colorDeltas.set(color, colorCountDelta);
      // ✅ Bloc Roulette : même delta (succès gagné/perdu) appliqué au compteur par mur — le
      // mur COURANT du bloc (wallById), jamais un mur figé à la validation.
      if (wall) delta.wallDeltas.set(wall, colorCountDelta);
    }

    // ✅ Classement de saison : même delta que ci-dessus, accumulé séparément et
    // seulement si "maintenant" tombe dans la fenêtre de saison configurée. Hors
    // fenêtre (été, ou aucune saison configurée), seuls les champs all-time bougent.
    const seasonWindow = seasonWindowRef.current;
    if (seasonWindow && isWithinSeasonWindow(new Date().toISOString(), seasonWindow.debut, seasonWindow.fin)) {
      delta.seasonScoreDelta = scoreDelta;
      if (colorCountDelta !== 0) delta.seasonColorDeltas.set(color, colorCountDelta);
    }

    // ✅ Défis entre potes (CONCEPTION-roulette-et-defis.md §2.2/§2.4) : même transition
    // succès/échec, répercutée sur chaque défi actif concerné — jamais de relecture des
    // autres participants, jamais de recalcul depuis l'historique. "seuil" ne compte que la
    // couleur ciblée ; "fenetre" ignore la couleur (métrique "blocs") ou réutilise le même
    // scoreDelta que le classement (métrique "points"), et seulement si la fenêtre n'est pas
    // encore terminée ; "bloc_designe" ne regarde que CE bloc précis et ne retient que le
    // meilleur score (jamais un cumul, voir buildClassementFlushWrites).
    const nowISO = new Date().toISOString();
    activeChallengesRef.current.forEach((challenge) => {
      if (challenge.structure === 'seuil') {
        if (challenge.target_color === color && colorCountDelta !== 0) {
          delta.challengeDeltas.set(challenge.id, (delta.challengeDeltas.get(challenge.id) || 0) + colorCountDelta);
        }
      } else if (challenge.structure === 'fenetre') {
        if (!challenge.ends_at || nowISO <= challenge.ends_at) {
          const challengeDelta = challenge.metric === 'points' ? scoreDelta : colorCountDelta;
          if (challengeDelta !== 0) {
            delta.challengeDeltas.set(challenge.id, (delta.challengeDeltas.get(challenge.id) || 0) + challengeDelta);
          }
        }
      } else if (challenge.structure === 'bloc_designe' && boulderId && challenge.boulder_id === boulderId && success) {
        const points = calculatePoints(color, resultAttempts, true);
        const previousBest = delta.blocDesigneScores.get(challenge.id) || 0;
        if (points > previousBest) delta.blocDesigneScores.set(challenge.id, points);
      }
    });

    classementQueue.enqueue('classement', delta);
  };

  // ✅ Met à jour le cache de session avec l'état réellement écrit — appelée
  // inconditionnellement après chaque setDoc réussi (contrairement à
  // `applyClassementDelta`, qui ne tourne que si le bloc a une couleur). Sans couleur,
  // il n'y a pas de delta de classement à appliquer, mais `createdAt` doit quand même
  // être mémorisé pour la prochaine édition de ce même bloc dans la session.
  const cachePreviousResultState = (boulderId: string, success: boolean, resultAttempts: number, createdAt: string) => {
    previousStateCacheRef.current.set(boulderId, { attempts: resultAttempts, success, createdAt });
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
    // seul moment où l'ancien état de ce bloc est encore en base. Appelé sans condition
    // de couleur — createdAt doit être préservé même sur un bloc sans couleur active.
    const classementColor = colorById.get(boulderId);
    const previousResultState = await resolvePreviousResultState(user.uid, boulderId);
    try {
      const resultId = `${user.uid}_${boulderId}`;
      // ✅ createdAt préservé depuis la première écriture de ce document (jamais
      // réécrit ensuite) — updatedAt continue de refléter chaque édition.
      const createdAt = previousResultState?.createdAt ?? new Date().toISOString();
      await setDoc(doc(db, 'client_boulder_results', resultId), {
        userId: user.uid,
        boulderId,
        ...candidate,
        createdAt,
        updatedAt: new Date().toISOString()
      });
      lastPersistedResultRef.current[boulderId] = candidate;
      cachePreviousResultState(boulderId, candidate.success, candidate.attempts, createdAt);
      setSuccessResults(prev => ({ ...prev, [boulderId]: success }));
      setSuccess('Réussite enregistrée!');
      setTimeout(() => setSuccess(null), 3000);
      // ✅ Appliqué seulement maintenant que l'écriture a réussi : si le setDoc
      // ci-dessus avait échoué, aucune mutation du classement n'aurait eu lieu.
      if (classementColor) {
        const previousClassementState = previousResultState?.success ? { attempts: previousResultState.attempts } : null;
        applyClassementDelta(classementColor, previousClassementState, success, candidate.attempts, wallById.get(boulderId), boulderId);
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
    // l'écrasement du document, même raison que dans handleValidateSuccess. Appelé sans
    // condition de couleur — createdAt doit être préservé même sur un bloc sans couleur
    // active.
    const classementColor = colorById.get(boulderId);
    const previousResultState = await resolvePreviousResultState(user.uid, boulderId);
    try {
      const resultId = `${user.uid}_${boulderId}`;
      // ✅ createdAt préservé depuis la première écriture de ce document (jamais
      // réécrit ensuite) — updatedAt continue de refléter chaque édition.
      const createdAt = previousResultState?.createdAt ?? new Date().toISOString();
      await setDoc(doc(db, 'client_boulder_results', resultId), {
        userId: user.uid,
        boulderId,
        ...candidate,
        createdAt,
        updatedAt: new Date().toISOString()
      });
      lastPersistedResultRef.current[boulderId] = candidate;
      cachePreviousResultState(boulderId, candidate.success, candidate.attempts, createdAt);
      if (classementColor) {
        const previousClassementState = previousResultState?.success ? { attempts: previousResultState.attempts } : null;
        applyClassementDelta(classementColor, previousClassementState, candidate.success, candidate.attempts, wallById.get(boulderId), boulderId);
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

      {/* ✅ Bloc Roulette (CONCEPTION-roulette-et-defis.md, Partie 1) : tirage 100% gratuit,
          aucun appel Firestore déclenché par ces boutons ni par "relancer" — voir
          handleOpenRoulette/handleOpenDeathRoulette et l'en-tête de utils/roulette.ts. */}
      <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<CasinoIcon />} onClick={handleOpenRoulette}>
          Bloc Roulette
        </Button>
        <Button variant="outlined" color="error" onClick={handleOpenDeathRoulette}>
          Roulette de la mort ☠️
        </Button>
      </Box>
      <RouletteDialog
        open={openRoulette}
        isDeath={rouletteIsDeath}
        result={rouletteResult}
        onClose={() => setOpenRoulette(false)}
        onRelancer={handleRelancerRoulette}
      />

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
        onClose={() => { classementQueue.flushAll(); setOpenBoulderDialog(false); }}
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
              <Button onClick={() => { classementQueue.flushAll(); setOpenBoulderDialog(false); }}>Annuler</Button>
              <Button
                variant="contained"
                onClick={async () => {
                  await handleRate(selectedBoulder.id, ratings[selectedBoulder.id] || 0, comments[selectedBoulder.id] || '');
                  classementQueue.flushAll();
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