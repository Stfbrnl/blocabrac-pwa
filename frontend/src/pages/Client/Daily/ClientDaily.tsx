import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc, setDoc, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { scoreDeltaForValidation, isWithinSeasonWindow } from '../../../utils/classementScore';
import { calculatePoints } from '../../../utils/climbingPoints';
import { getDocsCacheFirst } from '../../../utils/firestoreCacheFirst';
import { useDebouncedFlushQueue } from '../../../utils/useDebouncedFlushQueue';
import { runReadThenWriteTransaction } from '../../../utils/firestoreTransaction';
import {
  buildClassementFlushWrites, mergeClassementFlushPending, emptyClassementFlushPending,
  classementFlushReadKeys, challengeReadKey,
  type ClassementFlushPending,
} from '../../../utils/classementFlushWrites';
import { buildFirstAscentWrite } from '../../../utils/firstAscentWrites';
import type { FirstAscentEntry } from '../../../utils/firstAscents';
import { buildMethodVoteWrite } from '../../../utils/methodVoteWrite';
import { summarizeMethodVotes } from '../../../utils/methodVote';
import {
  Container, Typography, Box, Button, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, CardMedia, Rating, TextField,
  Grid, Chip, FormControl, InputLabel, Select, MenuItem,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { walls as wallList, colorGrades, mysteryColorHexKey, mysteryColorHex, logoPath, storageKeyPrefix, firstAscentColors, climbingMethods, MAX_METHODS_PER_VOTE, wallCategories } from '../../../config/gymConfig';
import { getBoulderImageUrl } from '../../../services/imageStorage';
import CasinoIcon from '@mui/icons-material/Casino';
import ExploreIcon from '@mui/icons-material/Explore';
import ReplayIcon from '@mui/icons-material/Replay';
import { levelOrder, type Level } from '../../../utils/competitionEligibility';
import { resolveSeuilTargetColor } from '../../../utils/challenges';
import {
  drawProposal, drawDeathProposal, resolveDrawLabel, resolveTargetColor,
  type DrawResult, type WallCounts, type RouletteCompletion,
} from '../../../utils/roulette';
import RouletteDialog, { type RouletteChosenBoulder } from './RouletteDialog';
import WeeklyMissionsGrid from './WeeklyMissionsGrid';
import { getLudicState, incrementRouletteCompleted, recordDeclarativeMission, recordMissionGesture } from '../../../services/ludicState';
import {
  planResultWrite, storedResultFromDoc, isAlreadySucceeded, canEraseFailure,
  type StoredBoulderResult, type BoulderResultFields,
} from '../../../utils/boulderResult';
import {
  resolveWeeklyMissionsState, applyValidationToWeeklyMissions, mergeWeeklyMissionsForDisplay,
  isAtLevelCeiling, missionGestureAdvances,
  type WeeklyMissionsState, type BoulderValidationEvent,
} from '../../../utils/weeklyMissions';
import { getSeasonAge } from '../../../utils/ageCategory';

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
  // ✅ docs/plans/PLAN-premiers-ascensionnistes.md : reste 'daily'/false pour tout bloc affiché ici (la
  // requête filtre déjà type=='daily'), mais lu explicitement par prudence — voir §5 du plan.
  competition_active?: boolean;
  firstAscents?: FirstAscentEntry[];
  // ✅ docs/plans/PLAN-ouvreur-createur-bloc.md : qui a réellement OUVERT le bloc (distinct de
  // `created_by`, qui a saisi), dénormalisé — jamais lu ici pour un bloc de compétition
  // (cette page ne charge que type=='daily', voir la requête plus bas).
  openedBy?: { uid: string; displayName: string } | null;
  // ✅ PLAN-anecdote-methodes-missions.md §A : anecdote libre de l'ouvreur (intention de
  // mouvement, nom donné au bloc, avertissement) — même traitement que openedBy, jamais
  // lue ici pour un bloc de compétition (cette page ne charge que type=='daily').
  openerNote?: string | null;
  // ✅ docs/plans/PLAN-anecdote-methodes-missions.md §B : agrégat du carnet de méthodes,
  // affiché à tous (§B.1) — jamais lu ici pour un bloc de compétition (voir plus bas).
  methodCounts?: Record<string, number>;
  methodVotes?: number;
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
  // ✅ docs/plans/PLAN-anecdote-methodes-missions.md §B.6 : sélection courante du carnet de
  // méthodes par bloc, seedée depuis le dernier vote connu au moment du clic "Réussi" (voir
  // resolvePreviousResultState) — jamais avant, jamais obligatoire.
  const [selectedMethods, setSelectedMethods] = useState<Record<string, string[]>>({});
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
  const [selfProfile, setSelfProfile] = useState<{
    level?: Level;
    wallCounts?: WallCounts;
    rouletteChallengesCompleted?: number;
    rouletteRecentChallenges?: RouletteCompletion[];
    // ✅ docs/plans/PLAN-premiers-ascensionnistes.md §3 : consentement dédié (distinct de
    // classementOptIn), lu ici pour être vérifié sans lecture supplémentaire au moment
    // du clic "Réussi".
    firstAscentOptIn?: boolean;
    // ✅ docs/plans/PLAN-anecdote-methodes-missions.md §C : grille hebdomadaire, résolue une
    // fois au montage (resolveWeeklyMissionsState — jamais recalculée en cours de semaine, voir
    // §C.3.c) puis tenue à jour localement à chaque mission nouvellement accomplie.
    weeklyMissions?: WeeklyMissionsState;
    weeklyMissionsCompleted?: number;
  }>({});
  // ✅ Ref-de-state (même discipline que `activeChallengesRef`) :
  // `handleValiderRoulette` doit repartir de l'état LE PLUS RÉCENT pour recomposer la liste
  // des 10 derniers défis (deux validations rapprochées sans remontage sinon → la 2e écrase
  // la 1re dans le tableau — retour ClaudeNav 06/09). La ref est mise à jour dans un effet,
  // jamais pendant le rendu.
  const selfProfileRef = useRef(selfProfile);
  useEffect(() => { selfProfileRef.current = selfProfile; }, [selfProfile]);
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

  // ✅ Compteur incrémental (docs/plans/CONCEPTION-selecteur-marge-compteur-incremental.md §3) :
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
  // réécrit à chaque édition, cf. docs/handoffs/RELECTURE-classement-saisonnier.md §1).
  // ✅ §B.6 du plan : `methods` ajouté au même cache/à la même lecture — aucun coût
  // supplémentaire, c'est le même document déjà lu pour attempts/success/createdAt.
  // ✅ V2.69 : le cache porte désormais le résultat stocké COMPLET (note, commentaire, cotation
  // proposée) — il alimente le pré-remplissage de la fiche et l'affichage en lecture seule d'un
  // bloc déjà réussi (docs/handoffs/RETOUR-bug-missions-et-revalidation.md §2.3/§2.4).
  // `storedResults` en est le miroir pour le rendu (clé absente = pas encore chargé).
  const previousStateCacheRef = useRef<Map<string, StoredBoulderResult | null>>(new Map());
  const [storedResults, setStoredResults] = useState<Record<string, StoredBoulderResult | null>>({});
  const [correctionMode, setCorrectionMode] = useState(false);
  const [missionGestureBusy, setMissionGestureBusy] = useState(false);

  // ✅ Chantier écritures point 5 : classement_profiles est un résumé dérivé, pas la
  // donnée source — pas besoin d'être exact à la seconde près. Les deltas sont accumulés
  // en mémoire et appliqués en une seule transaction Firestore après un debounce, avec
  // flush sur fermeture de la modale de détail et sur "pagehide" — le résultat du bloc
  // lui-même (client_boulder_results) continue d'être écrit immédiatement.
  //
  // ✅ docs/processus/PROCESSUS-erreurs-avalees.md §3 (V2.48) : le minuteur/pagehide/compteur d'échecs
  // qui vivaient ici en refs éparpillées sont maintenant portés par `useDebouncedFlushQueue`
  // (générique, réutilisé par ClientCompetitions.tsx/ClientCourseSession.tsx) — une seule
  // clé ('classement'), un seul payload `ClassementFlushPending` fusionné par addition (voir
  // `mergeClassementFlushPending`). `persist` ci-dessous construit les écritures via la
  // fonction PURE `buildClassementFlushWrites`, appliquées par `runReadThenWriteTransaction`
  // qui impose par sa signature l'ordre lectures-puis-écritures — la classe de bug trouvée le
  // 19/08 (lecture après écriture, silencieusement avalée) ne peut plus se reproduire ici.
  const CLASSEMENT_DEBOUNCE_MS = 3000;

  // ✅ Défis entre potes (docs/plans/CONCEPTION-roulette-et-defis.md, Partie 2, §2.4) : défis actifs de
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
      // ✅ docs/plans/PLAN-etat-ludique-hors-users.md, passe C : seule cible de wallCounts désormais
      // (plus de double écriture sur "users" — retiré après vérification en production de
      // la passe A/B). Toujours dans la liste des LECTURES de la transaction, jamais un
      // `get()` en ligne (voir firestoreTransaction.ts).
      const userLudicRef = doc(db, 'user_ludic_state', user.uid);
      const challengeIds = new Set<string>([...pending.challengeDeltas.keys(), ...pending.blocDesigneScores.keys()]);
      const challengeRefs = new Map(Array.from(challengeIds, (id) => [id, doc(db, 'challenges', id)]));

      // ✅ V2.68.1 (docs/handoffs/RETOUR-bug-missions-et-revalidation.md §1.5) : les lectures sont
      // dérivées du `pending` par la fonction pure `classementFlushReadKeys` — plus aucune
      // condition écrite ici à la main (celle de V2.68 oubliait les missions, et un flush ne
      // portant que des missions réécrivait la grille depuis un état vide).
      const readKeys = classementFlushReadKeys(pending);
      const reads: Record<string, ReturnType<typeof doc>> = { classementProfile: classementProfileRef };
      if (readKeys.has('userLudic')) reads.userLudic = userLudicRef;
      challengeRefs.forEach((ref, id) => { if (readKeys.has(challengeReadKey(id))) reads[challengeReadKey(id)] = ref; });

      await runReadThenWriteTransaction(db, reads, (readData) => buildClassementFlushWrites(
        user.uid,
        pending,
        {
          readKeys,
          classementProfile: readData.classementProfile,
          userLudic: readData.userLudic,
          challenges: new Map(Array.from(challengeIds, (id) => [id, readData[challengeReadKey(id)]])),
        },
        { classementProfileRef, userLudicRef, challengeRefs }
      ));
    },
    // ✅ Niveau 3 (docs/processus/PROCESSUS-erreurs-avalees.md §2) : réutilise l'état error/Alert déjà
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
          // ✅ Bloc Roulette : niveau depuis "users" (identité/droits, reste à sa place —
          // docs/plans/PLAN-etat-ludique-hors-users.md) ; wallCounts + suivi des défis relevés viennent
          // de `user_ludic_state` via ludicState.ts (passe C : plus de repli sur "users",
          // la passe B a backfillé tous les comptes existants avant ce retrait). Lus ici
          // pour être réécrits sans relecture au moment du "J'ai relevé le défi".
          const ludicState = await getLudicState(user.uid);
          // ✅ docs/plans/PLAN-anecdote-methodes-missions.md §C.3.c/§C.7 : niveau et "compte
          // comme enfant" figés UNE SEULE FOIS ici, à l'ouverture de la page — jamais
          // recalculés en cours de semaine. `getSeasonAge` est le seul point de dérivation de
          // l'âge (voir CLAUDE.md, section "age vs dateOfBirth") ; `data` est déjà en mémoire,
          // aucune lecture supplémentaire. Âge inconnu → traité comme adulte (§C.7).
          const seasonAge = getSeasonAge(data.dateOfBirth, data.age);
          const countsChildWalls = seasonAge !== undefined && seasonAge < 10;
          const weeklyMissions = resolveWeeklyMissionsState(
            ludicState.weeklyMissions, new Date(), data.level || 'jaune', countsChildWalls
          );
          setSelfProfile({
            level: data.level,
            wallCounts: ludicState.wallCounts,
            rouletteChallengesCompleted: ludicState.rouletteChallengesCompleted,
            rouletteRecentChallenges: ludicState.rouletteRecentChallenges,
            firstAscentOptIn: ludicState.firstAscentOptIn,
            weeklyMissions,
            weeklyMissionsCompleted: ludicState.weeklyMissionsCompleted || 0,
          });
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
  // `seasonWindowRef` ci-dessus). Une config absente/incomplète (admin n'a jamais réglé
  // `app_config/classement_saison`) OU une saison clôturée (`cloturee: true`, en attente
  // de reconfiguration — jusqu'à 7 jours de battement) laisse `seasonWindowRef` à `null` :
  // aucune validation ne compte alors pour la saison. Sans le test `cloturee`, éditer
  // pendant ce battement une validation dont le `createdAt` tombe dans l'ancienne fenêtre
  // repeuplerait des compteurs qu'on vient de remettre à zéro (retour ClaudeNav 06/09,
  // §1) — et la réconciliation l'entérinerait. Même garde-fou que `loadSeasonWindow()`
  // côté script (`if (data.cloturee) return null`).
  useEffect(() => {
    if (!user || loadingAuth) return;
    const fetchSeasonWindow = async () => {
      try {
        const snap = await getDoc(doc(db, 'app_config', 'classement_saison'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.debut && data.fin && data.cloturee !== true) {
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

  // ✅ V2.69 (§2.3/§2.4) : à l'ouverture, charge le résultat déjà enregistré (une lecture, une
  // fois par bloc et par session — la même que celle qu'un clic faisait déjà) et pré-remplit
  // note/commentaire/cotation/méthodes. Un bloc déjà réussi s'affiche alors en lecture seule.
  // Le nombre d'essais n'est PAS pré-rempli pour un bloc non réussi : choix explicite requis.
  const handleOpenBoulder = (boulder: Boulder) => {
    setSelectedBoulder(boulder);
    setCorrectionMode(false);
    setOpenBoulderDialog(true);
    if (!user || previousStateCacheRef.current.has(boulder.id)) return;
    resolvePreviousResultState(user.uid, boulder.id)
      .then((stored) => {
        if (!stored) return;
        const fillIfEmpty = <T,>(setter: React.Dispatch<React.SetStateAction<Record<string, T>>>, value: T) =>
          setter((prev) => (prev[boulder.id] === undefined ? { ...prev, [boulder.id]: value } : prev));
        if (stored.rating) fillIfEmpty(setRatings, stored.rating);
        if (stored.comment) fillIfEmpty(setComments, stored.comment);
        if (stored.proposedDifficulty) fillIfEmpty(setProposedDifficulties, stored.proposedDifficulty);
        fillIfEmpty(setSelectedMethods, stored.methods);
        fillIfEmpty(setSuccessResults, stored.success);
      })
      .catch((err) => {
        console.error("Erreur lors de la lecture du résultat enregistré:", err);
        setError("Impossible de charger ton résultat sur ce bloc — réessaie dans un instant.");
      });
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

  // ✅ "J'ai relevé le défi" (V2.55, version hybride ; docs/plans/PLAN-etat-ludique-hors-users.md pour
  // l'emplacement) : une écriture via ludicState.ts (double écriture user_ludic_state +
  // users tant que la passe C n'a pas eu lieu) — compteur + liste plafonnée des 10 derniers
  // défis, recomposée depuis `selfProfileRef.current` (aucune relecture Firestore : l'état a
  // été chargé au montage). Valeur EXPLICITE (jamais `increment()`) : un `increment()`
  // appliqué séparément aux deux documents diffuserait tant que `user_ludic_state` n'a pas
  // été backfillé (voir incrementRouletteCompleted). JAMAIS `client_boulder_results`, donc
  // famille E / roulette de la mort comptent sans toucher classement/badges/niveau.
  // Mise à jour de l'affichage APRÈS le succès de l'écriture (pas d'UI optimiste) : le
  // compteur ne monte que si Firestore a bien pris — pas d'état incohérent en cas d'échec
  // (retour ClaudeNav 06/09).
  const handleValiderRoulette = async (chosen: RouletteChosenBoulder) => {
    if (!user || !rouletteResult) return;
    const entry: RouletteCompletion = {
      proposalId: rouletteResult.proposal.id,
      label: resolveDrawLabel(rouletteResult),
      family: rouletteResult.proposal.family,
      color: rouletteResult.resolvedTraversee ? null : rouletteResult.resolvedColor,
      wall: chosen.wall,
      number: chosen.number,
      at: new Date().toISOString(),
    };
    setOpenRoulette(false);
    // ✅ docs/plans/PLAN-anecdote-methodes-missions.md §C.2/§C.5 : M8, fondue dans cette même
    // écriture (voir incrementRouletteCompleted). `missionsFige` retombe sur le niveau/l'âge
    // déjà figés cette semaine si la grille a été résolue, sinon sur le niveau brut — la
    // fonction ré-ouvre une semaine si besoin (resolveWeeklyMissionsState), aucune lecture ici.
    const missionsFige = {
      level: selfProfileRef.current.weeklyMissions?.level ?? selfProfileRef.current.level ?? 'jaune',
      countsChildWalls: selfProfileRef.current.weeklyMissions?.countsChildWalls ?? false,
    };
    try {
      // ✅ V2.68.1 : relu dans une transaction (services/ludicState.ts), plus recomposé depuis
      // la mémoire. L'affichage fusionne la grille écrite avec la grille en mémoire, qui peut
      // porter des cases dont le flush débouncé n'est pas encore parti.
      const { rouletteChallengesCompleted, rouletteRecentChallenges, weeklyMissions, weeklyMissionsCompleted } = await incrementRouletteCompleted(
        user.uid,
        entry,
        missionsFige
      );
      setSelfProfile((prev) => ({
        ...prev,
        rouletteChallengesCompleted,
        rouletteRecentChallenges,
        weeklyMissions: mergeWeeklyMissionsForDisplay(prev.weeklyMissions, weeklyMissions),
        weeklyMissionsCompleted,
      }));
      setSuccess(`Bravo, ${rouletteChallengesCompleted}ᵉ défi Roulette relevé !`);
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement du défi Roulette relevé:', err);
      setError("Le défi n'a pas pu être enregistré — réessaie dans un instant.");
    }
  };

  // ✅ §C.3.b (décision retenue) : M4 bis, réservée au grimpeur déjà au plafond (rose) —
  // réutilise le motif déclaratif de la Roulette ("J'ai relevé le défi"), sa propre écriture
  // dédiée (pas de flux existant à réutiliser ici, contrairement à M8) mais un cas rare par
  // construction (un seul grimpeur de la salle au rose permanent au moment du plan).
  const handleMissionM4Bis = async () => {
    if (!user) return;
    const base = selfProfileRef.current.weeklyMissions;
    if (!base || base.done.includes('M4')) return;
    try {
      // ✅ V2.68.1 : relu dans une transaction (services/ludicState.ts), plus recomposé depuis
      // la mémoire — même correctif que "J'ai relevé le défi" ci-dessus.
      const { weeklyMissions, weeklyMissionsCompleted } = await recordDeclarativeMission(
        user.uid,
        'M4',
        { level: base.level, countsChildWalls: base.countsChildWalls }
      );
      setSelfProfile((prev) => ({
        ...prev,
        weeklyMissions: mergeWeeklyMissionsForDisplay(prev.weeklyMissions, weeklyMissions),
        weeklyMissionsCompleted,
      }));
      setSuccess('Mission "M4 bis" validée !');
    } catch (err) {
      console.error('Erreur lors de la validation de la mission M4 bis:', err);
      setError("La mission n'a pas pu être enregistrée — réessaie dans un instant.");
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
          <Typography variant="body2" sx={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 0.5 }}>
            Bloc n°{boulder.number}
            {!isMysteryBoulder(boulder) && (boulder.color || boulder.difficulty) && (
              <>
                {' — '}
                <Box
                  component="span"
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    display: 'inline-block',
                    backgroundColor: levelColors[boulder.color || boulder.difficulty || ''] || '#CCCCCC',
                    border: '1px solid rgba(0,0,0,0.35)',
                  }}
                />
                {boulder.color || boulder.difficulty}
              </>
            )}
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
  // Cas marginal, inchangé par ce chantier — voir writeBoulderResult,
  // qui n'appliquent un delta que si `colorById.get(boulderId)` résout une couleur.
  const colorById = useMemo(
    () => new Map(boulders.map((b) => [b.id, b.color || b.difficulty || 'Inconnu'])),
    [boulders]
  );

  // ✅ Bloc Roulette / compteur par mur (docs/plans/CONCEPTION-roulette-et-defis.md §1.7.B) : même
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
  // une vraie date de première écriture). Correctif docs/handoffs/RELECTURE-classement-saisonnier.md
  // §1 : avant ce correctif, `createdAt` était réécrit à "maintenant" à CHAQUE édition
  // (même setDoc que `updatedAt`), donc inutilisable pour savoir quand une validation a
  // réellement eu lieu — un prérequis du classement de saison.
  const rememberStoredResult = (boulderId: string, stored: StoredBoulderResult | null) => {
    previousStateCacheRef.current.set(boulderId, stored);
    setStoredResults((prev) => ({ ...prev, [boulderId]: stored }));
  };

  const resolvePreviousResultState = async (uid: string, boulderId: string): Promise<StoredBoulderResult | null> => {
    const cached = previousStateCacheRef.current.get(boulderId);
    if (cached !== undefined) return cached;
    // ✅ Un échec de lecture REMONTE (V2.69) : l'ancien repli "traité comme pas de résultat
    // antérieur" aurait, sous la règle B, laissé réécrire un bloc déjà réussi comme une
    // première saisie. Mieux vaut refuser le geste et afficher l'erreur.
    const snap = await getDoc(doc(db, 'client_boulder_results', `${uid}_${boulderId}`));
    const stored = snap.exists() ? storedResultFromDoc(snap.data(), new Date().toISOString()) : null;
    rememberStoredResult(boulderId, stored);
    return stored;
  };

  // ✅ V2.69 (§2.5) : UNIQUE chemin d'écriture de client_boulder_results depuis cet écran —
  // `merge`, et seulement les champs que le geste pilote (planResultWrite, pur). Le delta de
  // classement n'est appliqué qu'après le succès de l'écriture, et seulement si l'état
  // "réussi / nombre d'essais" a réellement changé.
  const writeBoulderResult = async (boulderId: string, fields: BoulderResultFields) => {
    if (!user) return null;
    const previous = await resolvePreviousResultState(user.uid, boulderId);
    const plan = planResultWrite(previous, fields, new Date().toISOString());
    if (!plan.changed) return { previous, plan, written: false };
    await setDoc(
      doc(db, 'client_boulder_results', `${user.uid}_${boulderId}`),
      { userId: user.uid, boulderId, ...plan.patch },
      { merge: true }
    );
    rememberStoredResult(boulderId, plan.next);
    const classementColor = colorById.get(boulderId);
    const classementMoved = JSON.stringify(plan.classementBefore) !== JSON.stringify(plan.classementAfter);
    if (classementColor && classementMoved) {
      applyClassementDelta(classementColor, plan.classementBefore, plan.next.success, plan.next.attempts ?? 1, plan.next.createdAt, wallById.get(boulderId), boulderId);
    }
    return { previous, plan, written: true };
  };

  // ✅ Mutation : appelée seulement après le succès du setDoc de l'appelant. Construit le
  // delta de cette validation et le confie à la file débouncée (voir `classementQueue`
  // ci-dessus) — `enqueue` fusionne (additionne) avec un éventuel delta déjà en attente et
  // (re)planifie le flush. Appelée uniquement par writeBoulderResult (V2.69), après l'écriture.
  const applyClassementDelta = (
    color: string,
    previous: { attempts: number } | null,
    success: boolean,
    resultAttempts: number,
    resultCreatedAt: string,
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
    // seulement si LA DATE DE CETTE VALIDATION (`createdAt`, immuable) tombe dans la
    // fenêtre — pas "maintenant" (retour ClaudeNav 06/09, V2.56). Depuis le redémarrage
    // Modèle A, tout l'historique antérieur à `debut` est hors fenêtre : éditer un tel
    // bloc (essais corrigés, ou dé-validation) ne doit PAS toucher `season.*`, sinon le
    // score descendrait sous le crédit de départ pour une validation jamais comptée dans
    // la fenêtre. Une validation faite aujourd'hui a `createdAt` = aujourd'hui → comptée.
    // (`seasonWindowRef` est déjà `null` si la saison est clôturée — voir `fetchSeasonWindow`.)
    const seasonWindow = seasonWindowRef.current;
    if (seasonWindow && isWithinSeasonWindow(resultCreatedAt, seasonWindow.debut, seasonWindow.fin)) {
      delta.seasonScoreDelta = scoreDelta;
      if (colorCountDelta !== 0) delta.seasonColorDeltas.set(color, colorCountDelta);
    }

    // ✅ Défis entre potes (docs/plans/CONCEPTION-roulette-et-defis.md §2.2/§2.4) : même transition
    // succès/échec, répercutée sur chaque défi actif concerné — jamais de relecture des
    // autres participants, jamais de recalcul depuis l'historique. "seuil" ne compte que la
    // couleur ciblée ; "fenetre" ignore la couleur (métrique "blocs") ou réutilise le même
    // scoreDelta que le classement (métrique "points"), et seulement si la fenêtre n'est pas
    // encore terminée ; "bloc_designe" ne regarde que CE bloc précis et ne retient que le
    // meilleur score (jamais un cumul, voir buildClassementFlushWrites).
    const nowISO = new Date().toISOString();
    activeChallengesRef.current.forEach((challenge) => {
      if (challenge.structure === 'seuil') {
        // ✅ V2.53 : la cible peut être une couleur fixe OU un jeton relatif au niveau du
        // grimpeur (résolu ici, par participant, jamais figé à la création du défi).
        const effectiveTarget = resolveSeuilTargetColor(challenge.target_color ?? '', selfProfile.level, levelOrder);
        if (effectiveTarget && effectiveTarget === color && colorCountDelta !== 0) {
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



  // ✅ docs/plans/PLAN-premiers-ascensionnistes.md §6 : écriture IMMÉDIATE (pas débouncée, contrairement
  // au flush classement/murs/défis) — déclenchée par le clic "Réussi", déjà immédiat, et
  // unique par bloc sur toute sa vie (≤5 écritures). Relit le bloc FRAÎCHEMENT dans une petite
  // transaction dédiée (jamais l'état `boulders` en mémoire, potentiellement périmé si un
  // autre grimpeur vient de prendre une place) — `buildFirstAscentWrite` ne reçoit jamais
  // `tx`, seulement les données déjà lues (même discipline que `classementFlushWrites.ts`).
  // Échec silencieux côté utilisateur (console seulement) : la validation du bloc elle-même a
  // déjà réussi au moment de cet appel, rater cette liste de prestige ne doit pas faire
  // remonter une erreur intrusive sur un succès par ailleurs bien enregistré.
  const maybeRecordFirstAscent = async (boulderId: string, success: boolean) => {
    if (!user || !success || !selfProfile.firstAscentOptIn) return;
    const boulder = boulders.find((b) => b.id === boulderId);
    if (!boulder) return;
    const color = boulder.color || boulder.difficulty;
    if (!color || !firstAscentColors.includes(color)) return;
    if (boulder.type !== 'daily' || boulder.competition_active) return;
    const boulderRef = doc(db, 'boulders', boulderId);
    const entry: FirstAscentEntry = { uid: user.uid, displayName: getUserFullName(user.uid), at: new Date().toISOString() };
    try {
      await runReadThenWriteTransaction(db, { boulder: boulderRef }, (readData) => buildFirstAscentWrite(
        {
          success, color, boulderType: boulder.type, competitionActive: boulder.competition_active,
          uid: user.uid, optIn: true, eligibleColors: firstAscentColors,
        },
        entry,
        { boulder: readData.boulder as { firstAscents?: FirstAscentEntry[] } | undefined },
        { boulderRef }
      ));
      // ✅ Rafraîchit l'état local (mur + fiche ouverte si c'est la même) avec la liste
      // réellement écrite — évite d'afficher une liste périmée sans recharger toute la page.
      // Une seule lecture supplémentaire, seulement empruntée sur ce chemin rare (validation
      // d'un bloc difficile, opt-in actif) — jamais sur une validation ordinaire.
      const freshSnap = await getDoc(boulderRef);
      const freshFirstAscents = freshSnap.exists() ? (freshSnap.data().firstAscents as FirstAscentEntry[] | undefined) : undefined;
      setBoulders((prev) => prev.map((b) => (b.id === boulderId ? { ...b, firstAscents: freshFirstAscents } : b)));
      setSelectedBoulder((prev) => (prev && prev.id === boulderId ? { ...prev, firstAscents: freshFirstAscents } : prev));
    } catch (err) {
      console.error("Erreur lors de l'enregistrement du premier ascensionniste:", err);
    }
  };

  // ✅ docs/plans/PLAN-anecdote-methodes-missions.md §B.5/§B.6 : écriture IMMÉDIATE à chaque
  // coche/décoche (pas de débounce — le plan ne le prévoit pas, et l'interaction reste rare,
  // 3 cases maximum). Relit TOUJOURS les deux documents FRAÎCHEMENT dans une transaction
  // dédiée (jamais l'état local `selectedMethods`/`boulders` en mémoire) : c'est cette
  // fraîcheur qui permet à firestore.rules de valider le delta par un get() sur
  // client_boulder_results, qui ne voit que l'état d'AVANT la transaction (voir
  // firestore.rules, isValidMethodVoteUpdate — vérifié empiriquement sur l'émulateur).
  // Échec silencieux côté utilisateur (console) sur l'agrégat seulement : en cas d'erreur, la
  // sélection locale est annulée pour ne pas afficher une coche qui n'a pas été enregistrée.
  const handleMethodToggle = async (boulderId: string, method: string) => {
    if (!user) return;
    const current = selectedMethods[boulderId] || [];
    const isSelected = current.includes(method);
    if (!isSelected && current.length >= MAX_METHODS_PER_VOTE) return;
    const newMethods = isSelected ? current.filter((m) => m !== method) : [...current, method];
    setSelectedMethods((prev) => ({ ...prev, [boulderId]: newMethods }));
    const clientResultRef = doc(db, 'client_boulder_results', `${user.uid}_${boulderId}`);
    const boulderRef = doc(db, 'boulders', boulderId);
    try {
      await runReadThenWriteTransaction(db, { clientResult: clientResultRef, boulder: boulderRef }, (readData) => buildMethodVoteWrite(
        newMethods,
        {
          clientResult: readData.clientResult as { methods?: string[] } | undefined,
          boulder: readData.boulder as { methodCounts?: Record<string, number>; methodVotes?: number } | undefined,
        },
        { clientResultRef, boulderRef }
      ));
      const freshSnap = await getDoc(boulderRef);
      if (freshSnap.exists()) {
        const fresh = freshSnap.data();
        const patch = { methodCounts: fresh.methodCounts, methodVotes: fresh.methodVotes };
        setBoulders((prev) => prev.map((b) => (b.id === boulderId ? { ...b, ...patch } : b)));
        setSelectedBoulder((prev) => (prev && prev.id === boulderId ? { ...prev, ...patch } : prev));
      }
    } catch (err) {
      console.error('Erreur lors du vote de méthode:', err);
      setSelectedMethods((prev) => ({ ...prev, [boulderId]: current }));
    }
  };

  // ✅ V2.69 — Règle "B sans fenêtre" (docs/handoffs/RETOUR-bug-missions-et-revalidation.md §2) :
  // "Réussi"/"Échoué" ne s'appliquent qu'à un bloc PAS ENCORE réussi (jamais tenté, ou tenté et
  // échoué — §2.7 : l'échec puis la réussite est bien une première réussite). Sur un bloc déjà
  // réussi, la fiche est en lecture seule ; seules "Corriger ma saisie" (sans limite de temps)
  // et le geste "Je l'ai refait" (mission seule) restent possibles. Le garde-fou est aussi ici,
  // pas seulement dans l'interface.
  //
  // Missions : évaluées sur ce geste, AVANT l'écriture (un reclic "Échoué" identique ne réécrit
  // rien mais reste un essai fait cette semaine). M3 (flash) exige qu'il n'existe AUCUN résultat
  // antérieur pour ce bloc (§2.6) — une répétition en un essai n'est pas un flash.
  const handleValidateSuccess = async (boulderId: string, success: boolean) => {
    if (!user) return;
    const chosenAttempts = attempts[boulderId];
    // ✅ §2.4 : plus de valeur par défaut à 1 — un "Réussi" sans nombre d'essais choisi
    // déclarerait un flash à l'insu du grimpeur.
    if (success && !chosenAttempts) {
      setError("Choisis d'abord ton nombre d'essais.");
      return;
    }
    try {
      const previous = await resolvePreviousResultState(user.uid, boulderId);
      if (isAlreadySucceeded(previous)) return;

      const currentMissions = selfProfileRef.current.weeklyMissions;
      if (currentMissions) {
        const boulderWallForMissions = wallById.get(boulderId);
        const nextMissions = applyValidationToWeeklyMissions(currentMissions, {
          color: colorById.get(boulderId),
          wall: boulderWallForMissions,
          success,
          attempts: chosenAttempts ?? 0,
          neverTriedBefore: previous === null,
          wallInfo: boulderWallForMissions ? wallCategories[boulderWallForMissions] : undefined,
        });
        const newlyDone = nextMissions.done.filter((m) => !currentMissions.done.includes(m));
        const newlyVisited = nextMissions.walls.filter((w) => !currentMissions.walls.includes(w));
        if (newlyDone.length > 0 || newlyVisited.length > 0) {
          setSelfProfile((prev) => ({ ...prev, weeklyMissions: nextMissions }));
          const missionDelta = emptyClassementFlushPending();
          newlyDone.forEach((m) => missionDelta.missionsNewlyDone.add(m));
          newlyVisited.forEach((w) => missionDelta.wallsNewlyVisited.add(w));
          missionDelta.missionsFige = { level: currentMissions.level, countsChildWalls: currentMissions.countsChildWalls };
          classementQueue.enqueue('classement', missionDelta);
        }
      }

      const result = await writeBoulderResult(boulderId, {
        success,
        attempts: chosenAttempts,
        proposedDifficulty: proposedDifficulties[boulderId] || undefined,
      });
      setSuccessResults(prev => ({ ...prev, [boulderId]: success }));
      if (success) {
        // ✅ §B.6 : le carnet de méthodes ne se propose qu'après une réussite — la sélection
        // affichée part de ce qui est déjà voté.
        setSelectedMethods(prev => ({ ...prev, [boulderId]: result?.plan.next.methods ?? [] }));
        setSuccess('Réussite enregistrée!');
        setTimeout(() => setSuccess(null), 3000);
        if (result?.written) void maybeRecordFirstAscent(boulderId, true);
      }
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ✅ "Enregistrer" : note, commentaire, cotation proposée — jamais `success`/`attempts`
  // (V2.69 : le nombre d'essais d'un bloc déjà réussi ne se change que par "Corriger ma saisie").
  const handleSaveNotes = async (boulderId: string) => {
    if (!user) return;
    const rating = ratings[boulderId] || 0;
    const comment = comments[boulderId];
    const proposedDifficulty = proposedDifficulties[boulderId] || undefined;
    try {
      const previous = await resolvePreviousResultState(user.uid, boulderId);
      // Rien à enregistrer sur un bloc jamais saisi : ne pas créer de document vide.
      if (!previous && !rating && !comment && !proposedDifficulty) return;
      const result = await writeBoulderResult(boulderId, {
        rating: rating || undefined,
        comment,
        proposedDifficulty,
      });
      if (result?.written) {
        setSuccess('Note enregistrée!');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ✅ "Corriger ma saisie" (§2.2) : seul chemin pour modifier le nombre d'essais d'une réussite
  // enregistrée, ou l'annuler — sans limite de temps. Le classement suit (delta 8 -> 2, ou
  // sortie). Aucune mission n'est touchée : corriger n'est pas grimper.
  const handleCorrectAttempts = async (boulderId: string) => {
    const chosen = attempts[boulderId];
    if (!chosen) return;
    try {
      await writeBoulderResult(boulderId, { attempts: chosen });
      setCorrectionMode(false);
      setSuccess('Saisie corrigée.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCancelSuccess = async (boulderId: string) => {
    if (!window.confirm('Annuler ta réussite sur ce bloc ? Il sortira de ton classement. Tu pourras le valider à nouveau plus tard.')) return;
    try {
      await writeBoulderResult(boulderId, { success: false });
      setSuccessResults(prev => ({ ...prev, [boulderId]: false }));
      setAttempts(prev => {
        const next = { ...prev };
        delete next[boulderId];
        return next;
      });
      setCorrectionMode(false);
      setSuccess('Réussite annulée.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ✅ V2.70.2 : effacer un échec (clic « Échoué » par erreur, ou réussite annulée) — le bloc
  // redevient « jamais tenté », ce qui rouvre le flash (M3). Aucun effet sur le classement (un
  // échec n'y compte pas) ni sur les missions (corriger n'est pas grimper). Voir canEraseFailure.
  const handleEraseFailure = async (boulderId: string) => {
    if (!user) return;
    if (!window.confirm('Effacer cet échec ? Ce bloc redeviendra « jamais tenté » (ta note et ton commentaire sur ce bloc seront effacés aussi).')) return;
    try {
      const previous = await resolvePreviousResultState(user.uid, boulderId);
      if (!canEraseFailure(previous)) return;
      await deleteDoc(doc(db, 'client_boulder_results', `${user.uid}_${boulderId}`));
      rememberStoredResult(boulderId, null);
      const without = <T,>(prev: Record<string, T>) => {
        const next = { ...prev };
        delete next[boulderId];
        return next;
      };
      setSuccessResults(without);
      setAttempts(without);
      setRatings(without);
      setComments(without);
      setSuccess('Échec effacé.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ✅ V2.69 (§2.8/§2.10) : gestes de mission — "J'ai testé ce bloc" (max+1 pas encore réussi,
  // M4) et "Je l'ai refait" (bloc déjà réussi). N'écrivent JAMAIS client_boulder_results :
  // écrivain dédié (recordMissionGesture, relu dans une transaction), hors de la transaction
  // débouncée du classement. Leçons V2.55 : pas d'UI optimiste (la grille ne bouge qu'après
  // confirmation), état lu par ref et non capturé dans la fermeture.
  const missionGestureEvent = (boulderId: string, kind: 'tested' | 'redone'): BoulderValidationEvent => {
    const wall = wallById.get(boulderId);
    return {
      color: colorById.get(boulderId),
      wall,
      success: kind === 'redone',
      attempts: 0,
      neverTriedBefore: false,
      wallInfo: wall ? wallCategories[wall] : undefined,
    };
  };

  const handleMissionGesture = async (boulderId: string, kind: 'tested' | 'redone') => {
    const missions = selfProfileRef.current.weeklyMissions;
    if (!user || !missions || missionGestureBusy) return;
    setMissionGestureBusy(true);
    try {
      const { weeklyMissions, weeklyMissionsCompleted } = await recordMissionGesture(
        user.uid,
        missionGestureEvent(boulderId, kind),
        { level: missions.level, countsChildWalls: missions.countsChildWalls }
      );
      setSelfProfile((prev) => ({
        ...prev,
        weeklyMissions: mergeWeeklyMissionsForDisplay(prev.weeklyMissions, weeklyMissions),
        weeklyMissionsCompleted,
      }));
      setSuccess('Mission avancée — aucun résultat de bloc enregistré.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Erreur lors du geste de mission:', err);
      setError("La mission n'a pas pu être enregistrée — réessaie dans un instant.");
    } finally {
      setMissionGestureBusy(false);
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

      {/* ✅ Bloc Roulette (docs/plans/CONCEPTION-roulette-et-defis.md, Partie 1) : tirage 100% gratuit,
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
      {(selfProfile.rouletteChallengesCompleted || 0) > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: -2, mb: 3 }}>
          🎲 {selfProfile.rouletteChallengesCompleted} défi{(selfProfile.rouletteChallengesCompleted || 0) > 1 ? 's' : ''} Roulette relevé{(selfProfile.rouletteChallengesCompleted || 0) > 1 ? 's' : ''}
        </Typography>
      )}

      {/* ✅ docs/plans/PLAN-anecdote-methodes-missions.md §C.8 : grille à 8 cases pour tout le
          monde — un grimpeur au plafond voit M4 bis à la place de M4 (§C.3.b), avec un bouton
          déclaratif identique à celui de la Roulette. Le niveau figé est rappelé explicitement
          (describeMission), sinon un grimpeur qui progresse en cours de semaine ne comprend
          pas pourquoi ses cases ne bougent pas. */}
      {/* ✅ V2.70 : grille « bingo » tamponnée (WeeklyMissionsGrid.tsx, RETOUR-bug-missions-et-revalidation.md §2.11). */}
      {selfProfile.weeklyMissions && (
        <WeeklyMissionsGrid
          missions={selfProfile.weeklyMissions}
          weeklyMissionsCompleted={selfProfile.weeklyMissionsCompleted || 0}
          onM4Bis={handleMissionM4Bis}
        />
      )}

      <RouletteDialog
        open={openRoulette}
        isDeath={rouletteIsDeath}
        result={rouletteResult}
        onClose={() => setOpenRoulette(false)}
        onRelancer={handleRelancerRoulette}
        onValider={handleValiderRoulette}
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
              {/* ✅ docs/plans/PLAN-ouvreur-createur-bloc.md §4 (décision) : n'apparaît que si renseigné —
                  un bloc ancien ou sans ouvreur désigné n'affiche simplement rien. */}
              {selectedBoulder.openedBy && (
                <Typography variant="body2" sx={{ mb: 2 }}>
                  <strong>Ouvert par:</strong> {selectedBoulder.openedBy.displayName}
                </Typography>
              )}

              {/* ✅ docs/plans/PLAN-anecdote-methodes-missions.md §A.3 : n'apparaît que si
                  renseigné — même traitement que "Ouvert par" juste au-dessus. */}
              {selectedBoulder.openerNote && (
                <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic' }}>
                  « {selectedBoulder.openerNote} »
                </Typography>
              )}

              {/* ✅ docs/plans/PLAN-anecdote-methodes-missions.md §B.1/§B.4 : visible de tous
                  (pas seulement après un clic "Réussi", contrairement au vote lui-même
                  plus bas) — c'est justement l'info qui aide AVANT de grimper. Rien sous le
                  seuil de votes (summarizeMethodVotes renvoie null). */}
              {(() => {
                const methodSummary = summarizeMethodVotes(selectedBoulder.methodCounts, selectedBoulder.methodVotes);
                if (!methodSummary) return null;
                return (
                  <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>🧗 Méthodes utilisées ({selectedBoulder.methodVotes} vote{(selectedBoulder.methodVotes || 0) > 1 ? 's' : ''})</Typography>
                    {methodSummary.map((entry) => (
                      <Typography key={entry.value} variant="body2">
                        {entry.percent}% — {entry.label}
                      </Typography>
                    ))}
                  </Box>
                );
              })()}

              {/* ✅ docs/plans/PLAN-premiers-ascensionnistes.md §7 : uniquement sur la fiche de détail
                  (pas sur la vignette du mur), et jamais sur un bloc de compétition (§5) —
                  un bloc désactivé conserve sa liste (palmarès du mur précédent), le document
                  n'étant jamais supprimé (invariant V2.56). */}
              {firstAscentColors.includes(selectedBoulder.color || selectedBoulder.difficulty || '') &&
                selectedBoulder.type === 'daily' && !selectedBoulder.competition_active && (
                <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>🏆 Premiers ascensionnistes</Typography>
                  {(selectedBoulder.firstAscents || []).length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Personne n'a encore validé ce bloc — sois le premier !
                    </Typography>
                  ) : (
                    <>
                      {(selectedBoulder.firstAscents || []).map((entry, idx) => (
                        <Typography
                          key={entry.uid}
                          variant="body2"
                          sx={{ fontWeight: entry.uid === user?.uid ? 'bold' : 'normal' }}
                        >
                          {idx + 1}. {entry.displayName} — {new Date(entry.at).toLocaleDateString()}
                        </Typography>
                      ))}
                      {(selectedBoulder.firstAscents || []).length < 5 && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {5 - (selectedBoulder.firstAscents || []).length} place{5 - (selectedBoulder.firstAscents || []).length > 1 ? 's' : ''} restante{5 - (selectedBoulder.firstAscents || []).length > 1 ? 's' : ''} !
                        </Typography>
                      )}
                    </>
                  )}
                  {!selfProfile.firstAscentOptIn && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Active « apparaître dans les premiers ascensionnistes » dans Mes informations pour y figurer.
                    </Typography>
                  )}
                </Box>
              )}

              {/* ✅ V2.69 (docs/handoffs/RETOUR-bug-missions-et-revalidation.md §2) : trois états.
                  1. bloc déjà réussi -> lecture seule ("Déjà validé le … en N essais") + gestes ;
                  2. "Corriger ma saisie" -> seul chemin pour changer les essais ou annuler ;
                  3. sinon -> choix EXPLICITE du nombre d'essais, puis Réussi / Échoué.
                  Grammaire des boutons (§2.9) : un adjectif d'état écrit un résultat ("Réussi",
                  "Échoué") ; la première personne au passé n'en écrit jamais ("J'ai testé ce
                  bloc", "Je l'ai refait", "J'ai relevé le défi"). */}
              {(() => {
                const boulderId = selectedBoulder.id;
                if (!(boulderId in storedResults)) {
                  return <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}><CircularProgress size={24} /></Box>;
                }
                const stored = storedResults[boulderId];
                const missions = selfProfile.weeklyMissions;
                const boulderColor = colorById.get(boulderId);
                const canRedone = !!missions && isAlreadySucceeded(stored) && missionGestureAdvances(missions, missionGestureEvent(boulderId, 'redone'));
                const canTested = !!missions && !isAlreadySucceeded(stored) && !isAtLevelCeiling(missions.level)
                  && boulderColor === resolveTargetColor(missions.level as Level, 'max+1').color
                  && missionGestureAdvances(missions, missionGestureEvent(boulderId, 'tested'));
                const gestureButton = (kind: 'tested' | 'redone') => (
                  <Box sx={{ mb: 2 }}>
                    <Button
                      variant="outlined"
                      startIcon={kind === 'tested' ? <ExploreIcon /> : <ReplayIcon />}
                      disabled={missionGestureBusy}
                      onClick={() => handleMissionGesture(boulderId, kind)}
                    >
                      {kind === 'tested' ? "J'ai testé ce bloc" : "Je l'ai refait"}
                    </Button>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Fait avancer tes missions — n'enregistre pas de résultat
                    </Typography>
                  </Box>
                );
                const attemptsSelect = (
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel id="nombre-d-essais-select-label">Nombre d'essais</InputLabel>
                    <Select
                      labelId="nombre-d-essais-select-label"
                      id="nombre-d-essais-select"
                      value={attempts[boulderId] ?? ''}
                      onChange={(e) => setAttempts(prev => ({ ...prev, [boulderId]: e.target.value as number }))}
                      label="Nombre d'essais"
                    >
                      {attemptOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                );

                if (stored && stored.success && !correctionMode) {
                  const n = stored.attempts ?? 1;
                  return (
                    <Box sx={{ mb: 2 }}>
                      <Alert severity="success" icon={false} sx={{ mb: 1.5 }}>
                        ✅ Déjà validé le {new Date(stored.createdAt).toLocaleDateString()} en {n} essai{n > 1 ? 's' : ''}
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                          Refaire ce bloc ne le recompte pas : c'est ta première réussite qui mesure ton niveau.
                        </Typography>
                      </Alert>
                      {canRedone && gestureButton('redone')}
                      <Button
                        size="small"
                        onClick={() => {
                          setAttempts(prev => ({ ...prev, [boulderId]: n }));
                          setCorrectionMode(true);
                        }}
                      >
                        Corriger ma saisie
                      </Button>
                    </Box>
                  );
                }

                if (stored && stored.success && correctionMode) {
                  return (
                    <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Corriger ma saisie</Typography>
                      {attemptsSelect}
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button variant="contained" onClick={() => handleCorrectAttempts(boulderId)}>
                          Enregistrer la correction
                        </Button>
                        <Button variant="outlined" color="error" onClick={() => handleCancelSuccess(boulderId)}>
                          Annuler ma réussite
                        </Button>
                        <Button onClick={() => setCorrectionMode(false)}>Retour</Button>
                      </Box>
                    </Box>
                  );
                }

                return (
                  <Box sx={{ mb: 1 }}>
                    {attemptsSelect}
                    <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
                      <Button
                        variant={successResults[boulderId] === true ? "contained" : "outlined"}
                        color="success"
                        disabled={!attempts[boulderId]}
                        onClick={() => handleValidateSuccess(boulderId, true)}
                      >
                        ✅ Réussi
                      </Button>
                      <Button
                        variant={successResults[boulderId] === false ? "contained" : "outlined"}
                        color="error"
                        onClick={() => handleValidateSuccess(boulderId, false)}
                      >
                        ❌ Échoué
                      </Button>
                    </Box>
                    {!attempts[boulderId] && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                        Choisis ton nombre d'essais pour pouvoir valider « Réussi ».
                      </Typography>
                    )}
                    {canTested && gestureButton('tested')}
                    {canEraseFailure(stored) && (
                      <Button size="small" onClick={() => handleEraseFailure(boulderId)}>
                        Effacer cet échec
                      </Button>
                    )}
                  </Box>
                );
              })()}

              {/* ✅ docs/plans/PLAN-anecdote-methodes-missions.md §B.6 : le choix des méthodes
                  ne se propose qu'après une réussite, jamais avant, jamais obligatoire —
                  jamais pour un bloc de compétition non plus (cette page ne charge que
                  type=='daily', voir la requête plus haut). */}
              {isAlreadySucceeded(storedResults[selectedBoulder.id]) && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Méthode(s) utilisée(s) (3 maximum) :
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {climbingMethods.map((m) => {
                      const current = selectedMethods[selectedBoulder.id] || [];
                      const isSelected = current.includes(m.value);
                      return (
                        <Chip
                          key={m.value}
                          label={m.label}
                          clickable
                          color={isSelected ? 'primary' : 'default'}
                          disabled={!isSelected && current.length >= MAX_METHODS_PER_VOTE}
                          onClick={() => handleMethodToggle(selectedBoulder.id, m.value)}
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}

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
                  await handleSaveNotes(selectedBoulder.id);
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