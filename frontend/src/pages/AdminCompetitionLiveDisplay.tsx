import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { formattedAppVersion } from '../config/appVersion';
import {
  getClassementByCategory,
  getOfficialClassementByCategory,
  rankOfficialEntries,
  type BoulderInput,
  type CompetitionResultInput,
  type ParticipantBase,
  type ScoreEntry,
  type OfficialScoreEntry,
  type CategoryGroup,
  type ScoringMode,
  type CustomScoringTable,
} from '../utils/competitionClassement';

// ✅ Étapes 5 à 7 de CONCEPTION-ecran-live-competition.md §8 : route + layout nu +
// Wake Lock (étape 5, V2.31), listeners temps réel + recalcul groupé (étape 6),
// mise en page grand écran + rotation par catégorie (étape 7). Étape 8 (répétition
// matérielle à froid) est hors périmètre d'un agent — matériel physique.
//
// ✅ CONCEPTION-selecteur-marge-compteur-incremental.md §1 (16/08/2026) : le
// sélecteur de compétition interne à cet écran a été supprimé au profit d'un
// paramètre d'URL (/live-display/:competitionId). Changer de compétition via un
// simple Select remontait `LiveCompetitionView` (key={competition.id}) et repayait
// les 3 240 documents du snapshot initial à chaque clic — un geste qui semblait
// anodin mais qui, répété quelques fois, faisait franchir le budget mesuré de 3
// remontages (§3 de CONCEPTION-ecran-live-competition.md). Le choix se fait
// maintenant depuis AdminCompetitionManagement.tsx (bouton "Ouvrir l'affichage
// TV", un par compétition diffusée) : changer de compétition redevient ce que
// c'est réellement, ouvrir une autre fenêtre — le coût reste visible au lieu
// d'être déguisé en clic anodin dans l'écran lui-même, qui n'a par ailleurs
// aucune autre interaction (§5, "il se regarde, il ne s'utilise pas").

const ROTATION_INTERVAL_MS = 18000; // 15-20s demandés par le §5
const RECOMPUTE_DEBOUNCE_MS = 1500; // "groupé toutes les 1 à 2 secondes" (§4)

interface Competition {
  id: string;
  name: string;
  scoring_mode?: ScoringMode; // ✅ Nouveau
  custom_scoring?: CustomScoringTable; // ✅ Nouveau
}

interface LiveParticipant extends ParticipantBase {
  first_name: string;
  last_name: string;
  submitted: boolean;
}

// ✅ N'alimente plus que le mode à points (blocabrac/blocs_valides/personnalise) — le
// mode "Officiel" a son propre rendu séparé (officialGenderGroups), sans rotation.
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
  const scoringMode = competition.scoring_mode || 'blocabrac';
  const customScoring = competition.custom_scoring;
  // ✅ scoring_mode est verrouillé côté firestore.rules dès que la compétition quitte
  // "à venir" (AdminCompetitionManagement.tsx) — ne peut pas changer pendant la vie de
  // ce composant (remonté par compétition via key={competition.id}), donc brancher une
  // fois ici plutôt qu'à chaque recalcul est sûr.
  const isOfficialMode = scoringMode === 'officiel';
  const [boulders, setBoulders] = useState<BoulderInput[]>([]);
  const [bouldersLoaded, setBouldersLoaded] = useState(false);
  const [globalClassement, setGlobalClassement] = useState<ScoreEntry<LiveParticipant>[]>([]);
  const [byAgeClassement, setByAgeClassement] = useState<CategoryGroup<ScoreEntry<LiveParticipant>>[]>([]);
  // ✅ Mode "Officiel" uniquement — voir isOfficialMode. États séparés plutôt qu'un
  // type union sur globalClassement/byAgeClassement : plus simple à peupler depuis
  // scheduleRecompute, au prix de deux paires d'états dont une seule est jamais
  // utilisée pour une compétition donnée.
  //
  // ✅ ADDENDUM-mode-ffme-finale-annee.md §1/§2 (16/08/2026) : le mode "Officiel" cible
  // en réalité le format "Finale de l'année" (10 grimpeurs, 5 blocs) — pas la
  // compétition à 90/35 pour laquelle la rotation par catégorie d'âge avait été conçue.
  // Groupé par genre, pas par âge (une seule catégorie "open" à cette échelle) — voir plus bas,
  // affiché côte à côte SANS rotation (deux classements de 5 lignes tiennent ensemble
  // sur un seul écran).
  const [officialByGenderClassement, setOfficialByGenderClassement] = useState<CategoryGroup<OfficialScoreEntry<LiveParticipant>>[]>([]);
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
          points_value: d.data().points_value,
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
        if (isOfficialMode) {
          setOfficialByGenderClassement(
            getOfficialClassementByCategory(resultsRef.current, participantsRef.current, 'gender')
          );
        } else {
          setGlobalClassement(
            getClassementByCategory(resultsRef.current, participantsRef.current, boulders, 'global', scoringMode, customScoring)
          );
          setByAgeClassement(
            getClassementByCategory(resultsRef.current, participantsRef.current, boulders, 'age', scoringMode, customScoring)
          );
        }
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
        zone: d.data().zone,
        attempts_to_zone: d.data().attempts_to_zone,
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
  }, [competition.id, bouldersLoaded, boulders, scoringMode, customScoring, isOfficialMode]);

  // ✅ "ne pas afficher 90 lignes" (§5) : rotation par catégorie FFME plutôt qu'un
  // classement général complet (8 pages de 90 lignes = ~90s par tour, un grimpeur
  // attendrait 40s en moyenne). Top 10 général fixe en première page.
  // ✅ Mode "Officiel" exclu de cette logique depuis l'addendum : voir le rendu séparé
  // plus bas (officialGenderGroups), sans rotation.
  const pages = useMemo<LivePage[]>(() => {
    if (isOfficialMode) return [];
    if (globalClassement.length === 0) return [];
    const result: LivePage[] = [{ title: 'Top 10 — Classement général', entries: globalClassement.slice(0, 10) }];
    byAgeClassement.forEach(group => {
      if (group.participants.length > 0) result.push({ title: group.category, entries: group.participants });
    });
    return result;
  }, [isOfficialMode, globalClassement, byAgeClassement]);

  useEffect(() => {
    if (pages.length <= 1) return;
    const interval = setInterval(() => {
      setPageIndex(i => (i + 1) % pages.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pages.length]);

  const currentPage = pages[pageIndex % pages.length] || null;
  const currentPageRanks = useMemo(() => {
    if (!currentPage) return [];
    return currentPage.entries.map((_, i) => i + 1);
  }, [currentPage]);

  // ✅ Mode "Officiel" (ADDENDUM-mode-ffme-finale-annee.md §1/§2) : pas de rotation, les
  // deux groupes (Hommes/Femmes — ou tout autre découpage de "gender") tiennent côte à
  // côte sur un seul écran à cette échelle (5 lignes max chacun). Filtre "au moins un
  // top ou une zone" conservé (§B.4 du document précédent, toujours valable) : au tout
  // début de la finale, personne n'a encore progressé.
  const officialGenderGroups = useMemo(() => {
    const hasProgress = (e: OfficialScoreEntry<LiveParticipant>) => e.totals.tops > 0 || e.totals.zones > 0;
    return officialByGenderClassement
      .map(group => ({ category: group.category, participants: group.participants.filter(hasProgress) }))
      .filter(group => group.participants.length > 0);
  }, [officialByGenderClassement]);

  return (
    <Box sx={{ width: '100%', maxWidth: isOfficialMode ? 1400 : 1100, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
        {competition.name}
      </Typography>

      {/* ✅ Pédagogie suggérée par relecture ClaudeNav (voir
          HANDOFF-branding-navbar-2026-08-16.md) : le mode "Officiel" classe par
          tops/zones/essais, pas par un score affiché à l'écran (contrairement aux
          3 autres modes) — un spectateur qui ne connaît pas cette règle voit un
          classement qui bouge sans comprendre pourquoi. Une phrase suffit, pas
          besoin d'expliquer les essais-au-top/à-la-zone (départage silencieux,
          voir competitionClassement.ts) pour que le principe soit suivable. */}
      {isOfficialMode && (
        <Typography variant="h6" sx={{ mb: 2, opacity: 0.75, fontWeight: 400 }}>
          Classement par nombre de tops, puis de zones, puis au nombre d'essais
        </Typography>
      )}

      {isOfficialMode ? (
        // ✅ Mode "Officiel" — ADDENDUM-mode-ffme-finale-annee.md §1/§2 : pas de
        // rotation (deux classements de 5 lignes tiennent ensemble sur un seul écran),
        // groupé par genre (pas par âge : une seule catégorie "open" à cette échelle).
        officialGenderGroups.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="h5" sx={{ opacity: 0.7 }}>
              En attente des premières validations…
            </Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'flex-start', justifyContent: 'center' }}>
            {officialGenderGroups.map(group => {
              const ranks = rankOfficialEntries(group.participants);
              return (
                <Box key={group.category} sx={{ minWidth: 420, flex: '1 1 420px' }}>
                  <Typography variant="h4" sx={{ mb: 2, opacity: 0.9 }}>{group.category}</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {group.participants.map((entry, index) => (
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
                          {ranks[index]}
                        </Typography>
                        <Typography variant="h5" sx={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>
                          {displayName(entry.participant)}
                        </Typography>
                        {!entry.participant.submitted && (
                          <Typography variant="body2" sx={{ opacity: 0.5, fontStyle: 'italic' }}>
                            provisoire
                          </Typography>
                        )}
                        <Typography variant="h5" sx={{ width: '13ch', textAlign: 'right', fontWeight: 700 }}>
                          {entry.totals.tops}T · {entry.totals.zones}Z
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )
      ) : !currentPage ? (
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
                  {currentPageRanks[index]}
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
  const { competitionId } = useParams<{ competitionId: string }>();
  // ✅ 3 états distincts plutôt qu'un simple booléen "trouvée" : le message reste le
  // même dans les 3 cas (doc absent, pas "en cours", pas diffusée — voir plus bas),
  // mais 'loading' doit rester exclusif des deux autres pour ne jamais afficher le
  // message d'erreur pendant la toute première lecture.
  const [status, setStatus] = useState<'loading' | 'ineligible' | 'ready'>('loading');
  const [competition, setCompetition] = useState<Competition | null>(null);

  useWakeLock();

  useEffect(() => {
    let cancelled = false;
    const fetchCompetition = async () => {
      if (!competitionId) {
        setStatus('ineligible');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'competitions', competitionId));
        if (cancelled) return;
        // ✅ Mêmes deux conditions qu'avant (§7 de CONCEPTION-ecran-live-competition.md,
        // "Implications sur l'écran live") : une compétition non "en cours" ou non
        // diffusée n'a rien à faire sur cet écran, qu'elle existe ou non.
        if (!snap.exists() || snap.data().status !== 'en cours' || snap.data().liveDisplayEnabled !== true) {
          setStatus('ineligible');
          return;
        }
        setCompetition({
          id: snap.id,
          name: snap.data().name || '',
          scoring_mode: snap.data().scoring_mode || 'blocabrac',
          custom_scoring: snap.data().custom_scoring,
        });
        setStatus('ready');
      } catch (err) {
        console.error('Erreur lors du chargement de la compétition :', err);
        if (!cancelled) setStatus('ineligible');
      }
    };
    fetchCompetition();
    return () => { cancelled = true; };
  }, [competitionId]);

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
      {status === 'loading' ? (
        <CircularProgress sx={{ color: '#fff' }} />
      ) : status === 'ineligible' || !competition ? (
        // ✅ Message explicite plutôt qu'un écran vide (§7) : l'admin doit comprendre
        // pourquoi rien ne s'affiche sans ouvrir la console. Un seul message pour les
        // 3 cas (compétition inexistante, pas "en cours", pas diffusée) : aucun des
        // trois ne doit afficher quoi que ce soit ici, la distinction n'aiderait pas
        // l'admin à agir différemment.
        <Typography variant="h4" sx={{ opacity: 0.8 }}>
          Aucune compétition en diffusion pour le moment.
        </Typography>
      ) : (
        <LiveCompetitionView key={competition.id} competition={competition} />
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
