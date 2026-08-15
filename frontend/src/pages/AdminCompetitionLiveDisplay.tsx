import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Typography, FormControl, InputLabel, Select, MenuItem, CircularProgress } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { formattedAppVersion } from '../config/appVersion';
import {
  getClassementByCategory,
  type BoulderInput,
  type CompetitionResultInput,
  type ParticipantBase,
  type ScoreEntry,
  type CategoryGroup,
} from '../utils/competitionClassement';

// ✅ Étapes 5 à 7 de CONCEPTION-ecran-live-competition.md §8 : route + layout nu +
// Wake Lock (étape 5, V2.31), listeners temps réel + recalcul groupé (étape 6),
// mise en page grand écran + rotation par catégorie (étape 7). Étape 8 (répétition
// matérielle à froid) est hors périmètre d'un agent — matériel physique.

const ROTATION_INTERVAL_MS = 18000; // 15-20s demandés par le §5
const RECOMPUTE_DEBOUNCE_MS = 1500; // "groupé toutes les 1 à 2 secondes" (§4)

interface Competition {
  id: string;
  name: string;
}

interface LiveParticipant extends ParticipantBase {
  first_name: string;
  last_name: string;
  submitted: boolean;
}

interface LivePage {
  title: string;
  entries: ScoreEntry<LiveParticipant>[];
}

// ✅ Prénom + initiale (§7, "Format d'affichage") : les catégories FFME impliquent des
// mineurs, le nom complet n'est pas affiché sur un écran public.
const displayName = (p: LiveParticipant): string => {
  const initial = p.last_name?.trim().charAt(0).toUpperCase();
  return initial ? `${p.first_name} ${initial}.` : p.first_name;
};

// ✅ Aucune interaction prévue sur cet écran (§5 : "il se regarde, il ne s'utilise
// pas") : le composant Wake Lock est isolé dans ce hook plutôt que dispersé dans le
// JSX, pour que le reste du composant reste un simple affichage.
function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // ✅ L'API n'existe pas sur tous les navigateurs/plateformes — dégrade
    // silencieusement (l'écran peut alors se mettre en veille) plutôt que de
    // planter l'affichage : ce n'est pas le seul filet, voir aussi les parades
    // matérielles du §3 (veille désactivée sur le PC).
    if (!('wakeLock' in navigator)) return;

    let cancelled = false;
    const requestLock = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
      } catch (err) {
        console.error('Wake Lock indisponible :', err);
      }
    };

    requestLock();

    // ✅ Le Wake Lock est automatiquement relâché quand l'onglet perd le focus
    // (changement d'onglet, minimisation) : sans ce ré-abonnement, revenir sur
    // la fenêtre TV après un aller-retour ailleurs laisserait l'écran repartir
    // en veille sans avertissement.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);
}

// ✅ Une compétition = un montage de ce composant (voir `key={competition.id}` dans
// le parent) : tout son état (blocs, classement, page de rotation) repart de zéro
// naturellement au changement de compétition, sans effect dédié juste pour
// réinitialiser du state — évite d'appeler setState en plein corps d'effect
// (react-hooks/set-state-in-effect) pour un simple reset.
const LiveCompetitionView: React.FC<{ competition: Competition }> = ({ competition }) => {
  const [boulders, setBoulders] = useState<BoulderInput[]>([]);
  const [bouldersLoaded, setBouldersLoaded] = useState(false);
  const [globalClassement, setGlobalClassement] = useState<ScoreEntry<LiveParticipant>[]>([]);
  const [byAgeClassement, setByAgeClassement] = useState<CategoryGroup<LiveParticipant>[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  // ✅ Les blocs d'une compétition en cours ne changent pas de couleur/cotation
  // pendant l'épreuve (le re-classement n'arrive qu'à "Terminer la compétition", un
  // geste manuel distinct) — une seule lecture (getDocs), pas un troisième onSnapshot
  // pour rien.
  useEffect(() => {
    let cancelled = false;
    const fetchBoulders = async () => {
      try {
        const q = query(collection(db, 'boulders'), where('competition_id', '==', competition.id));
        const snapshot = await getDocs(q);
        if (cancelled) return;
        setBoulders(snapshot.docs.map(d => ({
          id: d.id,
          color: d.data().color,
          difficulty: d.data().difficulty || '',
        })));
      } catch (err) {
        console.error('Erreur lors du chargement des blocs :', err);
      } finally {
        if (!cancelled) setBouldersLoaded(true);
      }
    };
    fetchBoulders();
    return () => { cancelled = true; };
  }, [competition.id]);

  // ✅ Deux onSnapshot montés une fois, jamais de refetch : le classement se recalcule
  // depuis les données en mémoire (resultsRef/participantsRef), pas par une nouvelle
  // requête à chaque delta (§4, "règle absolue"). Les refs (pas de setState par callback
  // de snapshot) + le debounce ci-dessous évitent qu'une vague de 20 validations en
  // 2 secondes déclenche 20 tris de 90 entrées sur 3 150 résultats.
  useEffect(() => {
    if (!bouldersLoaded) return;

    const resultsRef: { current: CompetitionResultInput[] } = { current: [] };
    const participantsRef: { current: LiveParticipant[] } = { current: [] };
    let recomputeTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRecompute = () => {
      if (recomputeTimer) return; // un recalcul est déjà programmé pour ce cycle
      recomputeTimer = setTimeout(() => {
        recomputeTimer = null;
        setGlobalClassement(
          getClassementByCategory(resultsRef.current, participantsRef.current, boulders, 'global')
        );
        setByAgeClassement(
          getClassementByCategory(resultsRef.current, participantsRef.current, boulders, 'age')
        );
        setLastUpdated(new Date());
      }, RECOMPUTE_DEBOUNCE_MS);
    };

    const resultsQuery = query(
      collection(db, 'competition_results'),
      where('competition_id', '==', competition.id)
    );
    const unsubscribeResults = onSnapshot(resultsQuery, (snapshot) => {
      resultsRef.current = snapshot.docs.map(d => ({
        user_id: d.data().user_id || '',
        boulder_id: d.data().boulder_id || '',
        success: d.data().success || false,
        attempts: d.data().attempts || 0,
      }));
      scheduleRecompute();
    }, (err) => console.error('Erreur du listener competition_results :', err));

    const participantsQuery = query(
      collection(db, 'competition_participants'),
      where('competition_id', '==', competition.id)
    );
    const unsubscribeParticipants = onSnapshot(participantsQuery, (snapshot) => {
      participantsRef.current = snapshot.docs.map(d => ({
        user_id: d.data().user_id || '',
        first_name: d.data().first_name || '',
        last_name: d.data().last_name || '',
        dateOfBirth: d.data().dateOfBirth,
        age: d.data().age,
        gender: d.data().gender,
        submitted: d.data().submitted || false,
      }));
      scheduleRecompute();
    }, (err) => console.error('Erreur du listener competition_participants :', err));

    return () => {
      unsubscribeResults();
      unsubscribeParticipants();
      if (recomputeTimer) clearTimeout(recomputeTimer);
    };
  }, [competition.id, bouldersLoaded, boulders]);

  // ✅ "ne pas afficher 90 lignes" (§5) : rotation par catégorie FFME plutôt qu'un
  // classement général complet (8 pages de 90 lignes = ~90s par tour, un grimpeur
  // attendrait 40s en moyenne). Top 10 général fixe en première page.
  const pages = useMemo<LivePage[]>(() => {
    if (globalClassement.length === 0) return [];
    const result: LivePage[] = [{ title: 'Top 10 — Classement général', entries: globalClassement.slice(0, 10) }];
    byAgeClassement.forEach(group => {
      if (group.participants.length > 0) result.push({ title: group.category, entries: group.participants });
    });
    return result;
  }, [globalClassement, byAgeClassement]);

  useEffect(() => {
    if (pages.length <= 1) return;
    const interval = setInterval(() => {
      setPageIndex(i => (i + 1) % pages.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pages.length]);

  const currentPage = pages[pageIndex % pages.length] || null;

  return (
    <Box sx={{ width: '100%', maxWidth: 1100, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
        {competition.name}
      </Typography>

      {!currentPage ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h5" sx={{ opacity: 0.7 }}>
            En attente des premières validations…
          </Typography>
        </Box>
      ) : (
        <>
          <Typography variant="h4" sx={{ mb: 3, opacity: 0.9 }}>
            {currentPage.title}
          </Typography>

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
            {currentPage.entries.map((entry, index) => (
              <Box
                key={entry.participant.user_id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  py: 1,
                  px: 2,
                  borderRadius: 1,
                  bgcolor: index % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'transparent',
                }}
              >
                <Typography variant="h5" sx={{ width: '3ch', fontWeight: 700, opacity: 0.7 }}>
                  {index + 1}
                </Typography>
                <Typography variant="h5" sx={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>
                  {displayName(entry.participant)}
                </Typography>
                {/* ✅ Marqueur provisoire/verrouillé (§5) : le classement bouge tant que
                    la participation n'est pas soumise, on l'assume plutôt que d'attendre
                    les soumissions pour tout afficher. */}
                {!entry.participant.submitted && (
                  <Typography variant="body2" sx={{ opacity: 0.5, fontStyle: 'italic' }}>
                    provisoire
                  </Typography>
                )}
                <Typography variant="h5" sx={{ width: '8ch', textAlign: 'right', fontWeight: 700 }}>
                  {entry.score} pts
                </Typography>
              </Box>
            ))}
          </Box>

          {pages.length > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
              {pages.map((page, i) => (
                <Box
                  key={page.title}
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: i === pageIndex % pages.length ? '#fff' : 'rgba(255,255,255,0.3)',
                  }}
                />
              ))}
            </Box>
          )}
        </>
      )}

      {/* ✅ Horodatage discret (§5) : seul moyen de repérer un écran figé (page
          restée ouverte sans réseau, listener tombé). */}
      <Typography variant="caption" sx={{ mt: 2, opacity: 0.4 }}>
        {lastUpdated
          ? `Dernière mise à jour : ${lastUpdated.toLocaleTimeString('fr-FR')}`
          : 'En attente de données…'}
      </Typography>
    </Box>
  );
};

const AdminCompetitionLiveDisplay: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [eligibleCompetitions, setEligibleCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCompetitionId = searchParams.get('competitionId') || '';

  useWakeLock();

  useEffect(() => {
    const fetchEligibleCompetitions = async () => {
      try {
        setLoading(true);
        // ✅ Deux égalités simples : pas d'index composite nécessaire (voir
        // CONCEPTION-ecran-live-competition.md §7, "Implications sur l'écran live").
        const q = query(
          collection(db, 'competitions'),
          where('status', '==', 'en cours'),
          where('liveDisplayEnabled', '==', true)
        );
        const snapshot = await getDocs(q);
        setEligibleCompetitions(snapshot.docs.map(d => ({ id: d.id, name: d.data().name || '' })));
      } catch (err) {
        console.error('Erreur lors du chargement des compétitions diffusées :', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEligibleCompetitions();
  }, []);

  const handleSelectCompetition = useCallback((competitionId: string) => {
    setSearchParams(competitionId ? { competitionId } : {});
  }, [setSearchParams]);

  const selectedCompetition = eligibleCompetitions.find(c => c.id === selectedCompetitionId) || null;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: '#0a0a0a',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // ✅ Marge de sécurité contre l'overscan des TV (§5) : jamais de contenu
        // collé au bord.
        p: '4vh 4vw',
        textAlign: 'center',
        overflow: 'hidden',
      }}
    >
      {loading ? (
        <CircularProgress sx={{ color: '#fff' }} />
      ) : eligibleCompetitions.length === 0 ? (
        // ✅ Message explicite plutôt qu'un écran vide (§7) : l'admin doit
        // comprendre pourquoi rien ne s'affiche sans ouvrir la console.
        <Typography variant="h4" sx={{ opacity: 0.8 }}>
          Aucune compétition en diffusion pour le moment.
        </Typography>
      ) : selectedCompetition ? (
        <LiveCompetitionView key={selectedCompetition.id} competition={selectedCompetition} />
      ) : (
        <FormControl sx={{ minWidth: 320 }}>
          <InputLabel id="live-display-competition-select-label" sx={{ color: '#fff' }}>
            Compétition à diffuser
          </InputLabel>
          <Select
            labelId="live-display-competition-select-label"
            id="live-display-competition-select"
            value=""
            label="Compétition à diffuser"
            onChange={(e) => handleSelectCompetition(e.target.value)}
            sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: '#fff' } }}
          >
            {eligibleCompetitions.map(comp => (
              <MenuItem key={comp.id} value={comp.id}>{comp.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* ✅ Repère de version, discret (§5) : seul moyen de repérer un écran
          figé sur une version périmée servie par le service worker. */}
      <Typography
        variant="caption"
        sx={{ position: 'fixed', bottom: '2vh', right: '2vw', opacity: 0.35 }}
      >
        {formattedAppVersion}
      </Typography>
    </Box>
  );
};

export default AdminCompetitionLiveDisplay;
