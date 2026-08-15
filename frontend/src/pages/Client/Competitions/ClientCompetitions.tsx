import React, { useState, useEffect, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection, query, where, getDocs, doc, updateDoc, getDoc, setDoc, increment
} from 'firebase/firestore';
import { getDocsCacheFirst } from '../../../utils/firestoreCacheFirst';
import {
  Container, Typography, Box, Button, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, Card, CardContent, CardMedia, Rating,
  FormControl, InputLabel, Select, MenuItem,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { calculateCompetitionPoints, type ScoringMode, type CustomScoringTable } from '../../../utils/climbingPoints';
import { logoPath } from '../../../config/gymConfig';
import { getBoulderImageUrl } from '../../../services/imageStorage';

const levelColors: Record<string, string> = {
  jaune: '#FFFF00',
  vert: '#00FF00',
  bleu: '#0000FF',
  violet: '#800080',
  rouge: '#FF0000',
  noir: '#000000',
  blanc: '#FFFFFF',
  rose: '#FFC0CB'
};

const levelOrder: string[] = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];

interface Competition {
  id: string;
  name: string;
  date: string;
  status: 'à venir' | 'en cours' | 'terminée' | 'annulée';
  access_code: string;
  max_participants: number;
  registered_count: number;
  minLevel?: string;
  maxLevel?: string;
  // ✅ Écran live TV (CONCEPTION-ecran-live-competition.md §7) : si vrai, la mention de
  // diffusion est affichée ci-dessous — l'inscription vaut alors consentement.
  liveDisplayEnabled?: boolean;
  // ✅ Chantier "comptes de points" : n'affecte que l'aperçu de points affiché ici
  // pendant la validation, pas ce qui est écrit dans competition_results.
  scoring_mode?: ScoringMode;
  custom_scoring?: CustomScoringTable;
}

interface RegistrableUser {
  uid?: string;
  inscritAuxCompetitions?: boolean;
  level?: string;
}

interface Boulder {
  id: string;
  number: number;
  wall: string;
  difficulty: string;
  difficulty_level?: string;
  difficulty_types?: string[];
  instructions?: string;
  image_base64?: string;
  image_public_id?: string;
  competition_id?: string;
  competition_active?: boolean;
  is_active: boolean;
  color?: string;
  points_value?: number; // ✅ Mode de comptage "Blocs validés" uniquement
}

const ClientCompetitions: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [openRegisterDialog, setOpenRegisterDialog] = useState(false);
  const [openValidationDialog, setOpenValidationDialog] = useState(false);

  const [validationResults, setValidationResults] = useState<Record<string, {
    success: boolean;
    attempts: number;
    rating: number;
    proposedDifficulty: string;
  }>>({});

  // ✅ Verrouillage des résultats : une fois soumis (submitted: true côté
  // Firestore), plus aucune modification n'est possible — ni ici ni côté règles.
  const [isLocked, setIsLocked] = useState(false);
  const [lockedAt, setLockedAt] = useState<string | null>(null);

  // ✅ Chantier écritures point 4 : 2500ms (au lieu de 800ms) — un grimpeur qui
  // ajuste son nombre d'essais en plusieurs clics successifs déclenchait une
  // écriture intermédiaire à chaque pause dépassant 800ms. Sûr uniquement parce
  // que les trois conditions du suivi sont tenues ci-dessous : flush à la
  // fermeture de la modale, flush sur "pagehide", et le clic Réussi/Échoué
  // reste immédiat (jamais debouncé, voir handleValidateBoulder).
  const DEBOUNCE_MS = 2500;
  // ✅ Debounce des champs à saisie répétée (essais, note, cotation proposée) :
  // évite une écriture Firestore à chaque interaction avec un Select/Rating.
  // Le clic Réussi/Échoué, lui, écrit immédiatement (voir persistResult).
  // Stocke aussi le résultat en attente (pas seulement le timer) pour pouvoir
  // le flusher immédiatement (voir flushPendingResults) sans attendre le délai.
  const debounceEntries = useRef<Record<string, {
    timer: ReturnType<typeof setTimeout>;
    boulderId: string;
    result: { success: boolean; attempts: number; rating: number; proposedDifficulty: string };
  }>>({});
  // ✅ Ids des blocs déjà persistés (chargés au 1.3 ou écrits cette session) :
  // permet de ne poser created_at qu'une seule fois par document.
  const persistedBoulderIds = useRef<Set<string>>(new Set());
  // ✅ Chantier écritures point 3 : dernière valeur réellement PERSISTÉE par
  // bloc (pas la valeur affichée) — persistResult compare avant d'écrire et ne
  // renvoie rien à Firestore si rien n'a changé depuis la dernière écriture
  // (modale rouverte sans modification, resélection de la même valeur, reclic
  // sur un bloc déjà marqué dans le même état).
  const lastPersistedRef = useRef<Record<string, {
    success: boolean; attempts: number; rating: number; proposedDifficulty: string;
  }>>({});

  // ✅ Chargement unique des résultats du grimpeur par compétition (voir
  // SUIVI-quota-lectures-competition.md option A, puis
  // SUIVI-remontages-et-version.md point 1) : un `getDocs` était d'abord refait
  // à chaque ouverture de la modale, puis remplacé par un `onSnapshot` unique
  // par compétition — mais un `onSnapshot` refacture son snapshot initial à
  // chaque nouvel abonnement, donc à chaque REMONTAGE de page (rechargement
  // d'onglet, retour d'arrière-plan iOS/Android déchargé), pas seulement à
  // chaque ouverture de modale au sein d'un même montage. Remplacé par une
  // lecture ponctuelle cache-first (`getDocsCacheFirst`, voir utils/) : gratuite
  // dès que le cache local contient déjà la donnée, y compris après un
  // remontage complet. `compId` évite de relire même le cache inutilement tant
  // que la même compétition reste ouverte dans ce montage.
  const loadedResultsCompId = useRef<string | null>(null);

  // ✅ Même logique pour les blocs (jamais modifiés pendant l'épreuve).
  const loadedBouldersCompId = useRef<string | null>(null);

  // ✅ Une fois l'inscription du grimpeur à une compétition confirmée, elle ne
  // change plus pour la session : évite de reposer la question à Firestore à
  // chaque clic sur "Valider mes blocs"/"S'inscrire".
  const confirmedRegistrations = useRef<Set<string>>(new Set());

  const [currentUserDoc, setCurrentUserDoc] = useState<RegistrableUser | null>(null);

  // ✅ Détection mobile pour passer les Dialogs en plein écran
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    // ✅ Un client ne peut lire (selon firestore.rules) que son PROPRE document dans
    // "users" — un getDocs(collection(db,'users')) non filtré (comme avant) échoue
    // toujours en permission-denied pour ce rôle, laissant canRegister bloqué à
    // false en permanence. On ne récupère donc que son propre document.
    if (!user) return;
    const fetchOwnUser = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          setCurrentUserDoc({ uid: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.error('Erreur fetch user', err);
      }
    };
    fetchOwnUser();
  }, [user]);

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'competitions'),
          where('status', '==', 'en cours')
        );
        const snapshot = await getDocs(q);
        const competitionsData: Competition[] = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          date: doc.data().date || '',
          status: doc.data().status || 'à venir',
          access_code: doc.data().access_code || '',
          max_participants: doc.data().max_participants || 0,
          registered_count: doc.data().registered_count || 0,
          minLevel: doc.data().minLevel,
          maxLevel: doc.data().maxLevel,
          liveDisplayEnabled: doc.data().liveDisplayEnabled || false,
          scoring_mode: doc.data().scoring_mode || 'blocabrac',
          custom_scoring: doc.data().custom_scoring
        }));
        setCompetitions(competitionsData);
      } catch (err: unknown) {
        setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompetitions();
  }, [user, loadingAuth]);

  const mapBoulderDoc = (docSnap: { id: string; data: () => Record<string, unknown> }): Boulder => ({
    id: docSnap.id,
    number: (docSnap.data().number as number) || 0,
    wall: (docSnap.data().wall as string) || '',
    difficulty: (docSnap.data().difficulty as string) || '',
    difficulty_level: docSnap.data().difficulty_level as string | undefined,
    difficulty_types: (docSnap.data().difficulty_types as string[]) || [],
    instructions: (docSnap.data().instructions as string) || '',
    image_base64: docSnap.data().image_base64 as string | undefined,
    image_public_id: docSnap.data().image_public_id as string | undefined,
    competition_id: docSnap.data().competition_id as string | undefined,
    is_active: (docSnap.data().is_active as boolean) || false,
    color: docSnap.data().color as string | undefined,
    points_value: docSnap.data().points_value as number | undefined
  });

  const loadBoulders = async (competition: Competition) => {
    setSelectedCompetition(competition);
    if (loadedBouldersCompId.current === competition.id) {
      // Déjà chargés pour cette compétition dans ce montage : rien à refaire.
      return;
    }
    setLoading(true);
    try {
      // ✅ Deux requêtes fusionnées : les blocs créés pour l'épreuve (type:
      // 'competition', comme avant, aucun changement rétrocompatible) et les
      // blocs quotidiens réutilisés (type: 'daily' + competition_active: true)
      // des compétitions "régulières" bâties sur des blocs déjà en place. Un
      // simple `type in [...]` ferait réapparaître ici, à tort, les anciens
      // blocs de compétition redevenus 'daily' après "Terminer la compétition"
      // (ils gardent leur competition_id pour l'historique des résultats).
      const [classicSnapshot, reusedSnapshot] = await Promise.all([
        getDocsCacheFirst(query(
          collection(db, 'boulders'),
          where('competition_id', '==', competition.id),
          where('is_active', '==', true),
          where('type', '==', 'competition')
        )),
        getDocsCacheFirst(query(
          collection(db, 'boulders'),
          where('competition_id', '==', competition.id),
          where('is_active', '==', true),
          where('type', '==', 'daily'),
          where('competition_active', '==', true)
        )),
      ]);
      const merged = [...classicSnapshot.docs, ...reusedSnapshot.docs]
        .map(mapBoulderDoc)
        .sort((a, b) => a.number - b.number);
      setBoulders(merged);
      loadedBouldersCompId.current = competition.id;
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Chantier écritures point 2 : ID déterministe de la participation, pour
  // que firestore.rules puisse la vérifier par un get() bon marché (voir
  // isParticipationSubmitted dans firestore.rules) au lieu d'une requête —
  // non supportée dans les règles. Suppose la migration
  // firestore-migration/rekey-competition-participants.js déjà passée.
  const participationDocRef = (competitionId: string) =>
    doc(db, 'competition_participants', `${user!.uid}_${competitionId}`);

  // ✅ 1.3 — Reprise après rechargement : préremplit validationResults à partir
  // des résultats déjà écrits par ce grimpeur pour cette compétition, pour que
  // la fermeture d'onglet/le rechargement/l'"Annuler" ne fasse jamais perdre
  // une validation déjà enregistrée côté serveur — sans refaire cette lecture
  // à chaque ouverture de modale ni, grâce au cache-first, à chaque remontage
  // de page.
  const loadResults = async (competition: Competition) => {
    if (!user) return;
    if (loadedResultsCompId.current === competition.id) {
      return;
    }
    persistedBoulderIds.current = new Set();
    try {
      const [snapshot, participationSnap] = await Promise.all([
        getDocsCacheFirst(query(
          collection(db, 'competition_results'),
          where('user_id', '==', user.uid),
          where('competition_id', '==', competition.id)
        )),
        // ✅ Chantier écritures point 2 : source du verrou désormais ici (1
        // lecture) plutôt que dispersée sur chacun des documents de résultats.
        // getDocCacheFirst n'est pas utilisé volontairement : le statut de
        // verrouillage doit rester à jour même après un remontage, un client ne
        // devant jamais voir "non soumis" en cache alors qu'il l'a verrouillé
        // depuis un autre appareil entretemps.
        getDoc(participationDocRef(competition.id)),
      ]);
      const results: typeof validationResults = {};
      // ✅ Repli sur l'ancien champ (compétitions verrouillées avant ce
      // chantier, dont les 35 documents de résultats portent encore
      // submitted:true individuellement) — voir firestore.rules isParticipationSubmitted.
      let locked = false;
      let lockedAtValue: string | null = null;
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const loaded = {
          success: data.success || false,
          attempts: data.attempts || 1,
          rating: data.rating || 0,
          proposedDifficulty: data.proposed_difficulty || ''
        };
        results[data.boulder_id] = loaded;
        persistedBoulderIds.current.add(data.boulder_id);
        // ✅ Chantier écritures point 3 : ce qui vient d'être lu EST la dernière
        // valeur persistée — évite une écriture inutile si la première
        // interaction du grimpeur reproduit exactement l'état déjà en base.
        lastPersistedRef.current[data.boulder_id] = loaded;
        if (data.submitted) {
          locked = true;
          lockedAtValue = data.submitted_at || null;
        }
      });
      if (participationSnap.exists() && participationSnap.data().submitted) {
        locked = true;
        lockedAtValue = participationSnap.data().submitted_at || lockedAtValue;
      }
      setValidationResults(results);
      setIsLocked(locked);
      setLockedAt(lockedAtValue);
      loadedResultsCompId.current = competition.id;
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const canUserRegister = (user: RegistrableUser, competition: Competition): boolean => {
    if (!user.inscritAuxCompetitions) {
      return false;
    }

    if (!competition.minLevel && !competition.maxLevel) {
      return true;
    }

    const userLevel = user.level;
    if (!userLevel) return true;

    const userLevelIndex = levelOrder.indexOf(userLevel);
    const minLevelIndex = competition.minLevel ? levelOrder.indexOf(competition.minLevel) : -1;
    const maxLevelIndex = competition.maxLevel ? levelOrder.indexOf(competition.maxLevel) : levelOrder.length;

    return (
      (minLevelIndex === -1 || userLevelIndex >= minLevelIndex) &&
      (maxLevelIndex === levelOrder.length || userLevelIndex <= maxLevelIndex)
    );
  };

  const handleRegister = async (competition: Competition) => {
    if (!user) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        setError("Utilisateur introuvable.");
        return;
      }

      const userData = userDoc.data();
      if (!userData.inscritAuxCompetitions) {
        setError("Vous n'êtes pas autorisé à participer aux compétitions. Contactez l'administrateur pour activer votre accès.");
        return;
      }

      if (userData.level && (competition.minLevel || competition.maxLevel)) {
        const userLevelIndex = levelOrder.indexOf(userData.level);
        const minLevelIndex = competition.minLevel ? levelOrder.indexOf(competition.minLevel) : -1;
        const maxLevelIndex = competition.maxLevel ? levelOrder.indexOf(competition.maxLevel) : levelOrder.length;

        if (userLevelIndex < minLevelIndex || userLevelIndex > maxLevelIndex) {
          const minLevelLabel = competition.minLevel ? `niveau minimum ${competition.minLevel}` : 'aucun niveau minimum';
          const maxLevelLabel = competition.maxLevel ? `niveau maximum ${competition.maxLevel}` : 'aucun niveau maximum';
          setError(`Votre niveau (${userData.level}) ne correspond pas aux restrictions de cette compétition (${minLevelLabel} à ${maxLevelLabel}).`);
          return;
        }
      }

      // ✅ Chantier écritures point 2 : ID déterministe (voir participationDocRef)
      // plutôt qu'une requête + addDoc — vérifie la double inscription et écrit
      // sous le même chemin que celui attendu par firestore.rules.
      const participationRef = participationDocRef(competition.id);
      const existing = await getDoc(participationRef);
      if (existing.exists()) {
        setError("Vous êtes déjà inscrit à cette compétition.");
        return;
      }

      await setDoc(participationRef, {
        user_id: user.uid,
        competition_id: competition.id,
        email: user.email || '',
        first_name: user.displayName?.split(' ')[0] || '',
        last_name: user.displayName?.split(' ')[1] || '',
        registered_at: new Date().toISOString(),
        is_client: true
      });

      await updateDoc(doc(db, 'competitions', competition.id), {
        // ✅ increment() plutôt qu'une lecture-puis-écriture côté client : évite une
        // course si deux clients s'inscrivent au même instant.
        registered_count: increment(1)
      });

      // ✅ Sans ça, le libellé du bouton ("S'inscrire" vs "Valider mes blocs", basé sur
      // registered_count) restait figé sur l'ancienne valeur jusqu'au rechargement de
      // la page, alors que l'inscription venait de réussir.
      setCompetitions(prev => prev.map(c =>
        c.id === competition.id ? { ...c, registered_count: (c.registered_count || 0) + 1 } : c
      ));
      confirmedRegistrations.current.add(competition.id);
      setSuccess("Inscription réussie !");
      setOpenRegisterDialog(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ✅ 1.2 — Écrit chaque validation dans Firestore (merge: true), en plus de
  // l'état React local qui pilote l'affichage immédiat. Ne pose created_at que
  // sur la première écriture du document (voir persistedBoulderIds).
  // ✅ Chantier écritures point 3 : rien à écrire si le résultat est identique
  // à la dernière valeur réellement persistée (voir lastPersistedRef) — un
  // reclic sur "Réussi" déjà actif, ou une resélection du même nombre
  // d'essais, ne déclenche plus d'écriture Firestore.
  const persistResult = async (boulderId: string, result: {
    success: boolean; attempts: number; rating: number; proposedDifficulty: string;
  }) => {
    if (!user || !selectedCompetition) return;
    const last = lastPersistedRef.current[boulderId];
    if (last &&
        last.success === result.success &&
        last.attempts === result.attempts &&
        last.rating === result.rating &&
        last.proposedDifficulty === result.proposedDifficulty) {
      return;
    }
    const resultId = `${user.uid}_${boulderId}_${selectedCompetition.id}`;
    const isFirstWrite = !persistedBoulderIds.current.has(boulderId);
    try {
      await setDoc(doc(db, 'competition_results', resultId), {
        user_id: user.uid,
        competition_id: selectedCompetition.id,
        boulder_id: boulderId,
        success: result.success,
        attempts: result.attempts,
        rating: result.rating,
        proposed_difficulty: result.proposedDifficulty,
        ...(isFirstWrite ? { createdAt: new Date().toISOString(), submitted: false } : {}),
        updated_at: new Date().toISOString()
      }, { merge: true });
      persistedBoulderIds.current.add(boulderId);
      lastPersistedRef.current[boulderId] = result;
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ✅ Chantier écritures point 4 : vide immédiatement les écritures en
  // attente de debounce (sans attendre les 2500ms), appelé à la fermeture de
  // la modale et sur "pagehide" — l'une des trois conditions impératives pour
  // pouvoir allonger le debounce sans réintroduire la perte de données que le
  // chantier 1 avait corrigée.
  const flushPendingResults = () => {
    Object.values(debounceEntries.current).forEach(({ timer, boulderId, result }) => {
      clearTimeout(timer);
      persistResult(boulderId, result);
    });
    debounceEntries.current = {};
  };

  // ✅ flushPendingResults ferme sur `persistResult`, qui ferme lui-même sur
  // `user`/`selectedCompetition` — les deux sont redéfinis à chaque rendu. Un
  // effet à dépendances vides n'enregistrerait le listener qu'une fois, figé
  // sur la fermeture du tout premier rendu (user encore `null` avant que
  // l'authentification ne se résolve) : la ref, tenue à jour à chaque rendu,
  // garantit que "pagehide" appelle toujours la version la plus récente.
  const flushPendingResultsRef = useRef(flushPendingResults);
  useEffect(() => {
    // Pas de tableau de dépendances : tenue à jour après CHAQUE rendu (mais
    // en dehors du rendu lui-même, une mutation de ref pendant le rendu étant
    // interdite).
    flushPendingResultsRef.current = flushPendingResults;
  });

  useEffect(() => {
    const handler = () => flushPendingResultsRef.current();
    window.addEventListener('pagehide', handler);
    return () => window.removeEventListener('pagehide', handler);
  }, []);

  const handleValidateBoulder = (
    boulderId: string,
    success: boolean,
    attempts: number,
    rating: number,
    proposedDifficulty: string,
    immediate: boolean = false
  ) => {
    if (isLocked) return;
    const result = { success, attempts, rating, proposedDifficulty };
    setValidationResults(prev => ({ ...prev, [boulderId]: result }));

    if (immediate) {
      // ✅ Réussi/Échoué : écriture immédiate, jamais de debounce — c'est
      // l'information qu'on ne veut jamais perdre.
      if (debounceEntries.current[boulderId]) {
        clearTimeout(debounceEntries.current[boulderId].timer);
        delete debounceEntries.current[boulderId];
      }
      persistResult(boulderId, result);
    } else {
      // ✅ Essais / note / cotation proposée : debounce (voir DEBOUNCE_MS) pour
      // éviter une écriture à chaque interaction avec un Select.
      if (debounceEntries.current[boulderId]) {
        clearTimeout(debounceEntries.current[boulderId].timer);
      }
      const timer = setTimeout(() => {
        persistResult(boulderId, result);
        delete debounceEntries.current[boulderId];
      }, DEBOUNCE_MS);
      debounceEntries.current[boulderId] = { timer, boulderId, result };
    }
  };

  // ✅ 1.4 — "Soumettre" devient un verrouillage. Chantier écritures point 2 :
  // une seule écriture sur la participation (au lieu d'un writeBatch sur les
  // ~35 documents de résultats, facturé par document — ~3000 écritures en
  // moins sur la compétition à 90 participants), et firestore.rules refuse
  // ensuite toute modification des résultats par le propriétaire via
  // isParticipationSubmitted.
  const handleLockResults = async () => {
    if (!user || !selectedCompetition) return;
    const confirmed = window.confirm(
      "Une fois vos résultats soumis, ils ne pourront plus être modifiés. Confirmer la soumission définitive ?"
    );
    if (!confirmed) return;
    try {
      const now = new Date().toISOString();
      await setDoc(participationDocRef(selectedCompetition.id), {
        submitted: true,
        submitted_at: now
      }, { merge: true });
      setIsLocked(true);
      setLockedAt(now);
      setSuccess("Résultats verrouillés avec succès !");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const isAlreadyRegistered = async (competitionId: string): Promise<boolean> => {
    if (!user) return false;
    // ✅ Une fois l'inscription confirmée, plus besoin de reposer la question à
    // chaque clic sur "Valider mes blocs" — voir `confirmedRegistrations`.
    if (confirmedRegistrations.current.has(competitionId)) return true;
    // ✅ Chantier écritures point 2 : getDoc par ID déterministe plutôt qu'une
    // requête — même coût en lecture, plus simple, et cohérent avec le chemin
    // attendu par firestore.rules.
    const snapshot = await getDoc(participationDocRef(competitionId));
    if (snapshot.exists()) {
      confirmedRegistrations.current.add(competitionId);
      return true;
    }
    return false;
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
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>Mes Compétitions</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Typography variant="h6" sx={{ mb: 2 }}>Compétitions en cours</Typography>
      {competitions.length === 0 ? (
        <Typography>Aucune compétition en cours.</Typography>
      ) : (
        <Grid container spacing={2}>
          {competitions.map((competition) => {
            const canRegister = currentUserDoc ? canUserRegister(currentUserDoc, competition) : false;

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={competition.id}>
                <Card>
                  <CardContent>
                    <Typography variant="h6">{competition.name}</Typography>
                    <Typography>Date: {new Date(competition.date).toLocaleDateString()}</Typography>
                    <Typography>Statut: {competition.status}</Typography>
                    <Typography>Participants: {competition.registered_count}/{competition.max_participants}</Typography>
                    {competition.minLevel || competition.maxLevel ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Niveau requis: {competition.minLevel ? `min ${competition.minLevel}` : ''}
                        {competition.minLevel && competition.maxLevel ? ' - ' : ''}
                        {competition.maxLevel ? `max ${competition.maxLevel}` : ''}
                      </Typography>
                    ) : null}
                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={() => {
                          isAlreadyRegistered(competition.id).then(registered => {
                            if (registered) {
                              loadBoulders(competition);
                              loadResults(competition);
                              setOpenValidationDialog(true);
                            } else {
                              if (canRegister) {
                                setSelectedCompetition(competition);
                                setOpenRegisterDialog(true);
                              } else {
                                setError("Vous ne pouvez pas vous inscrire à cette compétition (niveau ou accès insuffisant).");
                              }
                            }
                          });
                        }}
                        disabled={!canRegister}
                      >
                        {competition.registered_count > 0 ? "Valider mes blocs" : "S'inscrire"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => loadBoulders(competition)}
                      >
                        Voir les détails
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Modale 1: Inscription à une compétition — plein écran sur mobile */}
      <Dialog
        open={openRegisterDialog}
        onClose={() => setOpenRegisterDialog(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        {selectedCompetition && (
          <>
            <DialogTitle>Inscription à {selectedCompetition.name}</DialogTitle>
            <DialogContent>
              <Typography sx={{ mb: 2 }}>
                Vous allez vous inscrire à la compétition <strong>{selectedCompetition.name}</strong> qui aura lieu le {new Date(selectedCompetition.date).toLocaleDateString()}.
              </Typography>
              <Typography sx={{ mb: 2 }}>
                <strong>Code d'accès:</strong> {selectedCompetition.access_code}
              </Typography>
              <Typography sx={{ mb: 2 }}>
                <strong>Nombre maximum de participants:</strong> {selectedCompetition.max_participants}
              </Typography>
              {selectedCompetition.minLevel || selectedCompetition.maxLevel ? (
                <Typography sx={{ mb: 2 }}>
                  <strong>Niveau requis:</strong> {selectedCompetition.minLevel ? `min ${selectedCompetition.minLevel}` : ''}
                  {selectedCompetition.minLevel && selectedCompetition.maxLevel ? ' - ' : ''}
                  {selectedCompetition.maxLevel ? `max ${selectedCompetition.maxLevel}` : ''}
                </Typography>
              ) : null}
              {/* ✅ Mention de diffusion (CONCEPTION-ecran-live-competition.md §7) :
                  seul mécanisme de consentement retenu — l'inscription qui suit vaut
                  consentement. */}
              {selectedCompetition.liveDisplayEnabled && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Le classement de cette compétition sera diffusé en direct sur l'écran
                  de la salle pendant l'épreuve (prénom et initiale du nom uniquement).
                  En vous inscrivant, vous en êtes informé·e.
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenRegisterDialog(false)}>Annuler</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={() => handleRegister(selectedCompetition)}
              >
                Confirmer l'inscription
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Modale 2: Validation des blocs de compétition — plein écran sur mobile */}
      <Dialog
        open={openValidationDialog}
        onClose={() => { flushPendingResults(); setOpenValidationDialog(false); }}
        maxWidth="lg"
        fullWidth
        fullScreen={isMobile}
      >
        {selectedCompetition && (
          <>
            <DialogTitle>Validation des blocs - {selectedCompetition.name}</DialogTitle>
            <DialogContent>
              {isLocked ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Résultats soumis{lockedAt ? ` le ${new Date(lockedAt).toLocaleString()}` : ''} — lecture seule, plus aucune modification possible.
                </Alert>
              ) : (
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Validez vos blocs et proposez une cotation (tous les blocs de compétition sont considérés comme "mystère").
                </Typography>
              )}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {boulders.map((boulder) => {
                  const result = validationResults[boulder.id] || {
                    success: false,
                    attempts: 1,
                    rating: 0,
                    proposedDifficulty: ''
                  };
                  const points = calculateCompetitionPoints(
                    boulder,
                    result.attempts,
                    result.success,
                    selectedCompetition.scoring_mode || 'blocabrac',
                    selectedCompetition.custom_scoring
                  );
                  return (
                    <Card key={boulder.id} sx={{ width: 300, mb: 2 }}>
                      <CardMedia
                        component="img"
                        height="150"
                        image={(boulder.image_public_id ? getBoulderImageUrl(boulder.image_public_id, 'thumb') : boulder.image_base64) || logoPath}
                        alt={`Bloc ${boulder.number}`}
                        sx={{ objectFit: 'contain' }}
                      />
                      <CardContent>
                        <Typography>Bloc n°{boulder.number} - {boulder.wall}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          <Button
                            variant={result.success ? "contained" : "outlined"}
                            color="success"
                            size="small"
                            disabled={isLocked}
                            onClick={() => handleValidateBoulder(
                              boulder.id,
                              true,
                              result.attempts,
                              result.rating,
                              result.proposedDifficulty,
                              true
                            )}
                          >
                            ✅ Réussi
                          </Button>
                          <Button
                            variant={!result.success ? "contained" : "outlined"}
                            color="error"
                            size="small"
                            disabled={isLocked}
                            onClick={() => handleValidateBoulder(
                              boulder.id,
                              false,
                              result.attempts,
                              result.rating,
                              result.proposedDifficulty,
                              true
                            )}
                          >
                            ❌ Échoué
                          </Button>
                        </Box>
                        <FormControl fullWidth sx={{ mt: 1 }} disabled={isLocked}>
                          <InputLabel id="nombre-d-essais-select-label">Nombre d'essais</InputLabel>
                          <Select
                            labelId="nombre-d-essais-select-label" id="nombre-d-essais-select"
                            value={result.attempts}
                            disabled={isLocked}
                            onChange={(e) => handleValidateBoulder(
                              boulder.id,
                              result.success,
                              e.target.value as number,
                              result.rating,
                              result.proposedDifficulty
                            )}
                            label="Nombre d'essais"
                          >
                            {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
                              <MenuItem key={num} value={num}>{num} essai{num > 1 ? 's' : ''}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                          <Typography>Note: </Typography>
                          <Rating
                            name={`rating-${boulder.id}`}
                            value={result.rating}
                            disabled={isLocked}
                            onChange={(e, newValue) => handleValidateBoulder(
                              boulder.id,
                              result.success,
                              result.attempts,
                              newValue || 0,
                              result.proposedDifficulty
                            )}
                          />
                        </Box>
                        <FormControl fullWidth sx={{ mt: 1 }} disabled={isLocked}>
                          <InputLabel id="cotation-proposee-select-label">Cotation proposée</InputLabel>
                          <Select
                            labelId="cotation-proposee-select-label" id="cotation-proposee-select"
                            value={result.proposedDifficulty}
                            disabled={isLocked}
                            onChange={(e) => handleValidateBoulder(
                              boulder.id,
                              result.success,
                              result.attempts,
                              result.rating,
                              e.target.value
                            )}
                            label="Cotation proposée"
                          >
                            {Object.keys(levelColors).map(color => (
                              <MenuItem key={color} value={color}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <Box sx={{
                                    width: 20,
                                    height: 20,
                                    backgroundColor: levelColors[color],
                                    marginRight: 1,
                                    border: '1px solid #ccc'
                                  }} />
                                  {color}
                                </Box>
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Typography sx={{ mt: 1, fontWeight: 'bold' }}>
                          Points: {points}
                        </Typography>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { flushPendingResults(); setOpenValidationDialog(false); }}>Fermer</Button>
              {!isLocked && (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleLockResults}
                >
                  Soumettre les résultats
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Container>
  );
};

export default ClientCompetitions;