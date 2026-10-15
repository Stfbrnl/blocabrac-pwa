import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Button, TextField, Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, FormControl, InputLabel, Select, MenuItem, Chip,
  FormControlLabel, Switch, Tooltip,
  useTheme, useMediaQuery
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon, Tune as TuneIcon } from '@mui/icons-material';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, deleteField, query, where, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { buildCompetitionParticipant, competitionParticipantId } from '../utils/competitionParticipant';
import { buildLevelAtStartSnapshot, type ParticipationForSnapshot, type SnapshotSourceUser } from '../utils/competitionLevelSnapshot';
import { buildFrozenRankings, isScoringModeGelable, type FrozenRankings, type RankingParticipant } from '../utils/competitionRankings';
import { basePoints, deductions, type ScoringMode, type CustomScoringTable } from '../utils/climbingPoints';

type CompetitionStatus = 'à venir' | 'en cours' | 'terminée' | 'annulée';
type Level = 'jaune' | 'vert' | 'bleu' | 'violet' | 'rouge' | 'noir' | 'blanc' | 'rose';

// ✅ Liste des niveaux (pour les sélecteurs)
const levelOptions: Level[] = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];

// ✅ Chantier "comptes de points" : 4 modes. "officiel" (tops/zones) ne produit pas
// de points — voir climbingPoints.ts/competitionClassement.ts. Jamais utilisé par le
// classement annuel (classementScore.ts n'a jamais connaissance de ce champ) :
// uniquement les écrans de classement compétition.
const scoringModeOptions: { value: ScoringMode; label: string; description: string }[] = [
  {
    value: 'blocabrac',
    label: 'Barème par couleur (essais comptabilisés)',
    description: 'Le barème par couleur utilisé partout ailleurs, avec dégression selon le nombre d\'essais.'
  },
  {
    value: 'blocs_valides',
    label: 'Blocs validés',
    description: 'Chaque bloc rapporte une valeur en points fixée individuellement par l\'ouvreur/l\'admin (la cotation étant cachée en compétition), sans tenir compte du nombre d\'essais.'
  },
  {
    value: 'personnalise',
    label: 'Personnalisé',
    description: 'Un barème par couleur propre à cette compétition : points de base et déduction par essai supplémentaire, réglables couleur par couleur.'
  },
  {
    value: 'officiel',
    label: 'Officiel (FFME / coupe du monde)',
    description: 'Classement par tops, puis zones, puis essais au top, puis essais à la zone (version simplifiée sur les totaux cumulés de la compétition, pas un classement bloc par bloc). Aucun score en points — les grimpeurs valident top et zone séparément.'
  }
];

const defaultCustomScoring = (): CustomScoringTable =>
  Object.fromEntries(levelOptions.map(level => [level, { base: basePoints[level] || 0, deduction: deductions[level] || 0 }]));

interface Competition {
  id: string;
  name: string;
  date: string;
  status: CompetitionStatus;
  access_code: string;
  max_participants: number;
  registered_count: number;
  minLevel?: Level; // ✅ Nouveau : Niveau minimum
  maxLevel?: Level; // ✅ Nouveau : Niveau maximum
  // ✅ Écran live TV (docs/plans/CONCEPTION-ecran-live-competition.md §7) : diffusion optionnelle,
  // verrouillée côté règles dès que status quitte "à venir" (voir firestore.rules).
  liveDisplayEnabled?: boolean;
  // ✅ Chantier "comptes de points" : verrouillé côté UI dès que status quitte "à venir"
  // (même garde-fou que liveDisplayEnabled), pour ne jamais changer les règles du jeu
  // une fois la compétition commencée.
  scoring_mode?: ScoringMode;
  custom_scoring?: CustomScoringTable;
}

const AdminCompetitionManagement: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [competitionToDelete, setCompetitionToDelete] = useState<string | null>(null);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [openScoringDialog, setOpenScoringDialog] = useState<'create' | 'edit' | null>(null);
  // ✅ Palmarès officiel gelé (§2 du plan du 5 novembre). `palmaresPublies` évite de proposer
  // une publication déjà faite — la règle la refuserait de toute façon (`update: if false`),
  // mais un bouton qui ne peut qu'échouer n'a pas à être affiché.
  const [palmaresPublies, setPalmaresPublies] = useState<Map<string, string>>(new Map());
  const [palmaresApercu, setPalmaresApercu] = useState<{ competition: Competition; payload: FrozenRankings } | null>(null);
  const [publicationEnCours, setPublicationEnCours] = useState(false);
  const [createForm, setCreateForm] = useState<Omit<Competition, 'id' | 'registered_count'>>({
    name: '',
    date: new Date().toISOString().split('T')[0],
    status: 'à venir',
    access_code: '',
    max_participants: 50,
    minLevel: undefined, // ✅ Nouveau
    maxLevel: undefined, // ✅ Nouveau
    liveDisplayEnabled: false, // ✅ Nouveau
    scoring_mode: 'blocabrac', // ✅ Nouveau
    custom_scoring: defaultCustomScoring() // ✅ Nouveau
  });
  const [editForm, setEditForm] = useState<Omit<Competition, 'id' | 'registered_count'>>({
    name: '',
    date: '',
    status: 'à venir',
    access_code: '',
    max_participants: 50,
    minLevel: undefined, // ✅ Nouveau
    maxLevel: undefined, // ✅ Nouveau
    liveDisplayEnabled: false, // ✅ Nouveau
    scoring_mode: 'blocabrac', // ✅ Nouveau
    custom_scoring: defaultCustomScoring() // ✅ Nouveau
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const querySnapshot = await getDocs(collection(db, 'competitions'));
        const competitionsData: Competition[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          date: doc.data().date || '',
          status: doc.data().status || 'à venir',
          access_code: doc.data().access_code || '',
          max_participants: doc.data().max_participants || 50,
          registered_count: doc.data().registered_count || 0,
          minLevel: doc.data().minLevel, // ✅ Nouveau
          maxLevel: doc.data().maxLevel, // ✅ Nouveau
          liveDisplayEnabled: doc.data().liveDisplayEnabled || false, // ✅ Nouveau
          scoring_mode: doc.data().scoring_mode || 'blocabrac', // ✅ Nouveau
          custom_scoring: doc.data().custom_scoring // ✅ Nouveau
        }));
        setCompetitions(competitionsData);
        // Un document par compétition publiée, et il y en aura autant que de compétitions
        // closes : une lecture de collection entière reste négligeable ici, contrairement à
        // ce qu'elle serait sur `users`.
        const palmaresSnap = await getDocs(collection(db, 'competition_rankings'));
        setPalmaresPublies(new Map(palmaresSnap.docs.map(d => [d.id, d.data().published_at || ''])));
      } catch (error: unknown) {
        console.error("Erreur :", error);
        setSnackbarMessage("Erreur lors du chargement des compétitions.");
        setOpenSnackbar(true);
      } finally {
        setLoading(false);
      }
    };
    fetchCompetitions();
  }, []);

  const handleCreateCompetition = async () => {
    if (!createForm.name || !createForm.access_code) {
      setSnackbarMessage("Le nom et le code d'accès sont obligatoires.");
      setOpenSnackbar(true);
      return;
    }

    try {
      await addDoc(collection(db, 'competitions'), {
        name: createForm.name,
        date: createForm.date,
        status: createForm.status,
        access_code: createForm.access_code,
        max_participants: createForm.max_participants,
        registered_count: 0,
        // ✅ Firestore refuse "undefined" (addDoc plante sinon quand aucune restriction
        // de niveau n'est choisie) : on omet le champ plutôt que de le passer à undefined.
        ...(createForm.minLevel ? { minLevel: createForm.minLevel } : {}),
        ...(createForm.maxLevel ? { maxLevel: createForm.maxLevel } : {}),
        liveDisplayEnabled: createForm.liveDisplayEnabled ?? false, // ✅ Nouveau
        scoring_mode: createForm.scoring_mode ?? 'blocabrac', // ✅ Nouveau
        ...(createForm.scoring_mode === 'personnalise'
          ? { custom_scoring: createForm.custom_scoring ?? defaultCustomScoring() }
          : {}),
      });
      const querySnapshot = await getDocs(collection(db, 'competitions'));
      setCompetitions(querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        date: doc.data().date,
        status: doc.data().status,
        access_code: doc.data().access_code,
        max_participants: doc.data().max_participants,
        registered_count: doc.data().registered_count || 0,
        minLevel: doc.data().minLevel, // ✅ Nouveau
        maxLevel: doc.data().maxLevel, // ✅ Nouveau
        liveDisplayEnabled: doc.data().liveDisplayEnabled || false, // ✅ Nouveau
        scoring_mode: doc.data().scoring_mode || 'blocabrac', // ✅ Nouveau
        custom_scoring: doc.data().custom_scoring // ✅ Nouveau
      })));
      setOpenCreateDialog(false);
      setSnackbarMessage("Compétition créée avec succès !");
      setOpenSnackbar(true);
    } catch (error: unknown) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la création de la compétition.");
      setOpenSnackbar(true);
    }
  };

  const handleOpenEditDialog = (competition: Competition) => {
    setSelectedCompetition(competition);
    setEditForm({
      name: competition.name,
      date: competition.date,
      status: competition.status,
      access_code: competition.access_code,
      max_participants: competition.max_participants,
      minLevel: competition.minLevel, // ✅ Nouveau
      maxLevel: competition.maxLevel, // ✅ Nouveau
      liveDisplayEnabled: competition.liveDisplayEnabled ?? false, // ✅ Nouveau
      scoring_mode: competition.scoring_mode ?? 'blocabrac', // ✅ Nouveau
      custom_scoring: competition.custom_scoring ?? defaultCustomScoring() // ✅ Nouveau
    });
    setOpenEditDialog(true);
  };

  // ✅ docs/plans/CONCEPTION-ecran-live-competition.md §7 : liveDisplayEnabled n'est modifiable
  // que tant que la compétition est "à venir" (verrouillé côté règles au-delà —
  // voir firestore.rules). Le formulaire d'édition désactive le switch dans ce cas,
  // mais on garde ce garde-fou ici pour ne jamais envoyer une valeur différente de
  // celle déjà en base une fois verrouillé (l'écriture serait de toute façon refusée).
  const isLiveDisplayEditable = (competition: Competition) => competition.status === 'à venir';

  // ✅ Chantier "comptes de points" : même verrou que liveDisplayEnabled — changer le
  // mode de comptage en cours d'épreuve changerait le classement rétroactivement pour
  // tout le monde, pas seulement les prochaines validations.
  const isScoringModeEditable = (competition: Competition) => competition.status === 'à venir';

  // ✅ Fige `competition_participants.level_at_start` au COUP D'ENVOI — voir
  // utils/competitionLevelSnapshot.ts pour le pourquoi (rien, dans ce dépôt, ne disait ce que
  // valait le niveau d'un grimpeur le jour de l'épreuve : l'inscription peut dater de trois
  // semaines avant, et `users.level` n'est historisé nulle part).
  //
  // Déclenché sur la seule TRANSITION vers « en cours », et le constructeur ne remplit qu'un
  // champ absent : les deux gardes se cumulent, l'opération est rejouable sans rien redater.
  //
  // ⚠️ Un échec est SIGNALÉ à l'admin, pas seulement journalisé. Le statut, lui, est déjà
  // changé : sans message, un palmarès classerait les grimpeurs sur leur niveau d'inscription
  // au lieu de leur niveau de départ, et personne ne saurait pourquoi. « Un échec journalisé
  // n'est pas un échec signalé. »
  const figerNiveauxAuDepart = async (competitionId: string) => {
    const participationsSnap = await getDocs(query(
      collection(db, 'competition_participants'),
      where('competition_id', '==', competitionId)
    ));
    if (participationsSnap.empty) return 0;

    const participations: ParticipationForSnapshot[] = participationsSnap.docs.map(d => ({
      id: d.id,
      user_id: d.data().user_id,
      level: d.data().level,
      level_at_start: d.data().level_at_start,
    }));

    // Lecture ciblée des seuls comptes concernés, pas de toute la collection `users` : une
    // vingtaine de lectures au lieu de soixante et une, sur une action d'administration.
    const uids = [...new Set(participations.map(p => p.user_id).filter(Boolean))];
    const comptes = await Promise.all(uids.map(uid => getDoc(doc(db, 'users', uid))));
    const usersById = new Map<string, SnapshotSourceUser>(
      comptes.filter(s => s.exists()).map(s => [s.id, { level: s.data()?.level }])
    );

    const writes = buildLevelAtStartSnapshot(participations, usersById);
    if (writes.length === 0) return 0;

    const batch = writeBatch(db);
    writes.forEach(w => {
      batch.update(doc(db, 'competition_participants', w.participationId), {
        level_at_start: w.level_at_start,
      });
    });
    await batch.commit();
    return writes.length;
  };

  // ═══ PALMARÈS OFFICIEL GELÉ (§2 du plan du 5 novembre) ═══════════════════════════════
  //
  // Deux gestes séparés, et c'est essentiel : préparer un APERÇU, puis publier. Le document
  // est IMMUABLE côté serveur (`update, delete: if false`) — publier est donc irréversible
  // sans la clé de service. L'aperçu est la seule occasion de voir ce qu'on gèle, et c'est à
  // ça qu'il sert : y lire « 0 participant » ou un podium manifestement incomplet, c'est
  // découvrir qu'une saisie manque AVANT que le palmarès ne devienne définitif.
  //
  // Le calcul est celui de l'application — `buildFrozenRankings` n'a aucun classement propre,
  // il appelle les mêmes fonctions que les écrans (§2.4). C'est la raison pour laquelle la
  // publication se fait ici plutôt que dans un script : un script aurait dû réimplémenter le
  // classement, c'est-à-dire fabriquer la cinquième divergence de ce projet.
  const handlePreparerPalmares = async (competition: Competition) => {
    // ⚠️ Mode « Officiel » : refus explicite plutôt qu'un palmarès à zéro partout, et immuable
    // (voir isScoringModeGelable). Ce mode ne sert qu'à la Finale, dont l'annonce est elle-même
    // suspendue.
    if (!isScoringModeGelable(competition.scoring_mode)) {
      setSnackbarMessage(
        'Le mode de comptage « Officiel » ne se gèle pas encore : son classement est un tri '
        + 'tops/zones/essais, pas une somme de points. Publier donnerait un palmarès vide et '
        + 'définitif. À implémenter le jour où la Finale est confirmée.'
      );
      setOpenSnackbar(true);
      return;
    }
    try {
      const [participantsSnap, resultsSnap, bouldersSnap] = await Promise.all([
        getDocs(query(collection(db, 'competition_participants'), where('competition_id', '==', competition.id))),
        getDocs(query(collection(db, 'competition_results'), where('competition_id', '==', competition.id))),
        getDocs(query(collection(db, 'boulders'), where('competition_id', '==', competition.id))),
      ]);

      // ⚠️ Pas de filtre sur `type` pour les blocs : une compétition régulière réutilise des
      // blocs `type: 'daily'`, et « Terminer la compétition » reconvertit les blocs de
      // compétition en `daily`. `competition_id` seul est le périmètre, comme partout
      // ailleurs dans ce projet.
      const participants: RankingParticipant[] = participantsSnap.docs.map(d => ({
        user_id: d.data().user_id,
        first_name: d.data().first_name,
        last_name: d.data().last_name,
        gender: d.data().gender,
        dateOfBirth: d.data().dateOfBirth,
        legacyAge: d.data().age,
        level: d.data().level,
        level_at_start: d.data().level_at_start,
        is_client: d.data().is_client,
      }));
      const results = resultsSnap.docs.map(d => ({
        user_id: d.data().user_id,
        boulder_id: d.data().boulder_id,
        success: d.data().success === true,
        attempts: d.data().attempts ?? 0,
        zone: d.data().zone,
        attempts_to_zone: d.data().attempts_to_zone,
      }));
      const boulders = bouldersSnap.docs.map(d => ({
        id: d.id,
        color: d.data().color,
        difficulty: d.data().difficulty,
        points_value: d.data().points_value,
      }));

      const payload = buildFrozenRankings({
        competition: {
          id: competition.id,
          name: competition.name,
          date: competition.date,
          scoring_mode: competition.scoring_mode ?? 'blocabrac',
          custom_scoring: competition.custom_scoring,
        },
        participants,
        results,
        boulders,
        publishedAt: new Date().toISOString(),
      });
      setPalmaresApercu({ competition, payload });
    } catch (error: unknown) {
      console.error('Erreur lors de la préparation du palmarès :', error);
      setSnackbarMessage("Erreur lors de la préparation du palmarès. Rien n'a été publié.");
      setOpenSnackbar(true);
    }
  };

  const handlePublierPalmares = async () => {
    if (!palmaresApercu) return;
    setPublicationEnCours(true);
    try {
      // Identifiant du document = identifiant de la compétition (contrôlé aussi par les
      // règles) : un palmarès par épreuve, et pas deux palmarès concurrents dont aucun ne
      // serait « le » palmarès.
      await setDoc(
        doc(db, 'competition_rankings', palmaresApercu.competition.id),
        palmaresApercu.payload
      );
      setPalmaresPublies(prev => new Map(prev).set(
        palmaresApercu.competition.id,
        palmaresApercu.payload.published_at
      ));
      setPalmaresApercu(null);
      setSnackbarMessage('Palmarès officiel publié. Il est désormais définitif.');
      setOpenSnackbar(true);
    } catch (error: unknown) {
      console.error('Erreur lors de la publication du palmarès :', error);
      // Le cas le plus probable d'échec : un palmarès existe déjà (les règles refusent tout
      // `update`). Le dire explicitement plutôt que « erreur », parce que la conduite à tenir
      // en découle — il faut la clé de service pour dépublier.
      setSnackbarMessage(
        "Publication refusée. Si un palmarès existe déjà pour cette compétition, il est "
        + "définitif : seul scripts/unpublish-competition-rankings.js, avec la clé de service, "
        + "peut le retirer."
      );
      setOpenSnackbar(true);
    } finally {
      setPublicationEnCours(false);
    }
  };

  const handleUpdateCompetition = async () => {
    if (!selectedCompetition) return;
    try {
      const scoringModeEditable = isScoringModeEditable(selectedCompetition);
      const effectiveScoringMode = scoringModeEditable
        ? (editForm.scoring_mode ?? 'blocabrac')
        : selectedCompetition.scoring_mode ?? 'blocabrac';
      await updateDoc(doc(db, 'competitions', selectedCompetition.id), {
        name: editForm.name,
        date: editForm.date,
        status: editForm.status,
        access_code: editForm.access_code,
        max_participants: editForm.max_participants,
        // ✅ Idem qu'à la création : "undefined" ferait planter updateDoc. deleteField()
        // permet en plus d'effacer une restriction existante (contrairement à l'omettre).
        minLevel: editForm.minLevel || deleteField(),
        maxLevel: editForm.maxLevel || deleteField(),
        liveDisplayEnabled: isLiveDisplayEditable(selectedCompetition)
          ? (editForm.liveDisplayEnabled ?? false)
          : selectedCompetition.liveDisplayEnabled ?? false,
        scoring_mode: effectiveScoringMode,
        ...(effectiveScoringMode === 'personnalise'
          ? { custom_scoring: (scoringModeEditable ? editForm.custom_scoring : selectedCompetition.custom_scoring) ?? defaultCustomScoring() }
          : { custom_scoring: deleteField() }),
      });

      // Le coup d'envoi : on vient de faire passer la compétition de « à venir » (ou de tout
      // autre statut) à « en cours ». C'est le seul instant où « le niveau avant l'épreuve »
      // est observable.
      let messageFigeage = '';
      if (editForm.status === 'en cours' && selectedCompetition.status !== 'en cours') {
        try {
          const figes = await figerNiveauxAuDepart(selectedCompetition.id);
          if (figes > 0) messageFigeage = ` Niveau de départ figé pour ${figes} participant(s).`;
        } catch (error: unknown) {
          console.error('Erreur lors du figeage des niveaux de départ :', error);
          messageFigeage = ' ATTENTION : le niveau de départ des participants n\'a PAS pu être figé — '
            + 'le classement par niveau max se rabattrait sur leur niveau d\'inscription. '
            + 'Réenregistrez la compétition pour réessayer.';
        }
      }

      const querySnapshot = await getDocs(collection(db, 'competitions'));
      setCompetitions(querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        date: doc.data().date,
        status: doc.data().status,
        access_code: doc.data().access_code,
        max_participants: doc.data().max_participants,
        registered_count: doc.data().registered_count || 0,
        minLevel: doc.data().minLevel, // ✅ Nouveau
        maxLevel: doc.data().maxLevel, // ✅ Nouveau
        liveDisplayEnabled: doc.data().liveDisplayEnabled || false, // ✅ Nouveau
        scoring_mode: doc.data().scoring_mode || 'blocabrac', // ✅ Nouveau
        custom_scoring: doc.data().custom_scoring // ✅ Nouveau
      })));
      setOpenEditDialog(false);
      setSnackbarMessage(`Compétition mise à jour avec succès !${messageFigeage}`);
      setOpenSnackbar(true);
    } catch (error: unknown) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la mise à jour de la compétition.");
      setOpenSnackbar(true);
    }
  };

  const handleDeleteCompetition = async () => {
    if (!competitionToDelete) return;
    try {
      await deleteDoc(doc(db, 'competitions', competitionToDelete));
      setCompetitions(competitions.filter(comp => comp.id !== competitionToDelete));
      setSnackbarMessage("Compétition supprimée avec succès !");
      setOpenSnackbar(true);
    } catch (error: unknown) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la suppression de la compétition.");
      setOpenSnackbar(true);
    } finally {
      setOpenDeleteDialog(false);
      setCompetitionToDelete(null);
    }
  };

  // ✅ docs/plans/CONCEPTION-classement-saisonnier.md, "Le bouton admin Générer le roster" : lit
  // l'archive de saison la plus récente (classement_saisons, IDs "YYYY-YYYY" — se
  // trient lexicographiquement dans le bon ordre, voir le doc de conception "Points
  // mineurs") et amorce le roster de cette compétition en mode officiel. N'écrase
  // jamais les inscriptions déjà là (ID déterministe, `set` sans `merge` réécrit juste
  // les mêmes champs pour un déjà-inscrit — idempotent), et reste modifiable ensuite à
  // la main via "Gérer les inscriptions" comme n'importe quelle inscription manuelle.
  const handleGenerateRoster = async (competition: Competition) => {
    try {
      // ✅ Pas de tri Firestore descendant sur l'ID du document ("Firestore does not
      // support descending key scans", trouvé en e2e) — cette collection ne contient
      // qu'un doc par saison (un par an), la trier côté client est sans coût réel.
      const seasonsSnapshot = await getDocs(collection(db, 'classement_saisons'));
      if (seasonsSnapshot.empty) {
        setSnackbarMessage("Aucun classement de saison archivé pour l'instant — rien à générer.");
        setOpenSnackbar(true);
        return;
      }
      const mostRecentSeasonDoc = [...seasonsSnapshot.docs].sort((a, b) => b.id.localeCompare(a.id))[0];
      const archive = mostRecentSeasonDoc.data();
      const qualifiedUids: string[] = [
        ...(archive.top_garcons || []).map((e: { uid: string }) => e.uid),
        ...(archive.top_filles || []).map((e: { uid: string }) => e.uid),
      ];
      if (qualifiedUids.length === 0) {
        setSnackbarMessage("Le classement de saison archivé ne contient aucun qualifié.");
        setOpenSnackbar(true);
        return;
      }

      const existingSnapshot = await getDocs(collection(db, 'competition_participants'));
      const alreadyRegistered = new Set(
        existingSnapshot.docs
          .map((d) => d.data())
          .filter((p) => p.competition_id === competition.id)
          .map((p) => p.user_id)
      );

      let added = 0;
      for (const uid of qualifiedUids) {
        if (alreadyRegistered.has(uid)) continue;
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!userSnap.exists()) continue; // ✅ compte supprimé depuis l'archivage — ignoré, pas bloquant
        const user = userSnap.data();
        // ✅ `age` (trouvé en e2e) : un champ `users.age` absent produit `undefined`,
        // que Firestore refuse dans un `setDoc` — contrairement au flux d'ajout manuel
        // (`AdminCompetitionRegistration.tsx`), qui ne s'exécute qu'après un clic sur un
        // utilisateur déjà affiché avec ses champs résolus. `?? null` couvre ce cas
        // et tout autre champ optionnel absent sur un compte plus ancien.
        await setDoc(
          doc(db, 'competition_participants', competitionParticipantId(uid, competition.id)),
          // `legacyAge: user.age` : le champ Firestore s'appelle `age`, et le type local de
          // cet écran le nomme encore ainsi — voir l'en-tête de competitionParticipant.ts.
          buildCompetitionParticipant({ ...user, uid, legacyAge: user.age }, competition.id)
        );
        added += 1;
      }

      if (added > 0) {
        const newCount = competition.registered_count + added;
        await updateDoc(doc(db, 'competitions', competition.id), { registered_count: newCount });
        setCompetitions((prev) => prev.map((c) => (c.id === competition.id ? { ...c, registered_count: newCount } : c)));
      }
      setSnackbarMessage(
        added > 0
          ? `${added} qualifié(s) ajouté(s) au roster (${qualifiedUids.length - added} déjà inscrit(s)).`
          : 'Tous les qualifiés étaient déjà inscrits — rien à ajouter.'
      );
      setOpenSnackbar(true);
    } catch (error) {
      console.error('Erreur :', error);
      setSnackbarMessage('Erreur lors de la génération du roster.');
      setOpenSnackbar(true);
    }
  };

  if (loading) {
    return <Typography>Chargement des compétitions...</Typography>;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
            mb: 2,
          }}
        >
          <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Gestion des Compétitions
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenCreateDialog(true)}
            sx={{ width: { xs: '100%', sm: 'auto' }, height: '48px' }}
          >
            Créer une compétition
          </Button>
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>Nom</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Code d'accès</TableCell>
                {/* ✅ Nouvelle colonne */}
                <TableCell>Niveau requis</TableCell>
                <TableCell>Participants</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {competitions.map(competition => (
                <TableRow key={competition.id}>
                  <TableCell>{competition.name}</TableCell>
                  <TableCell>{new Date(competition.date).toLocaleDateString()}</TableCell>
                  <TableCell>{competition.status}</TableCell>
                  <TableCell>{competition.access_code}</TableCell>
                  {/* ✅ Afficher les restrictions de niveau */}
                  <TableCell>
                    {competition.minLevel && competition.maxLevel ? (
                      <Chip
                        label={`De ${competition.minLevel} à ${competition.maxLevel}`}
                        color="primary"
                        size="small"
                      />
                    ) : competition.minLevel ? (
                      <Chip label={`Min: ${competition.minLevel}`} color="success" size="small" />
                    ) : competition.maxLevel ? (
                      <Chip label={`Max: ${competition.maxLevel}`} color="error" size="small" />
                    ) : (
                      <Chip label="Tous les niveaux" color="default" size="small" />
                    )}
                  </TableCell>
                  <TableCell>{competition.registered_count} / {competition.max_participants}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton
                      color="primary"
                      onClick={() => handleOpenEditDialog(competition)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => {
                        setCompetitionToDelete(competition.id);
                        setOpenDeleteDialog(true);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => navigate(`/admin/competitions/register?competitionId=${competition.id}`)}
                    >
                      Gérer les inscriptions
                    </Button>
                    {/* ✅ Écran live TV (docs/plans/CONCEPTION-ecran-live-competition.md §7) :
                        n'apparaît que pour les compétitions diffusées. window.open
                        (pas navigate) : l'admin garde son poste de travail, la TV
                        reçoit une fenêtre séparée en mode HDMI étendu (jamais miroir,
                        voir §6 — sinon les cotations cachées de l'admin s'y afficheraient). */}
                    {competition.liveDisplayEnabled && (
                      <Button
                        variant="outlined"
                        size="small"
                        sx={{ ml: 1 }}
                        onClick={() => window.open(
                          `/admin/competitions/live-display/${competition.id}`,
                          '_blank',
                          'noopener'
                        )}
                      >
                        Ouvrir l'affichage TV
                      </Button>
                    )}
                    {/* ✅ Écran juge (docs/plans/ADDENDUM-mode-ffme-finale-annee.md §3) : n'apparaît
                        que pour les compétitions en mode de comptage "Officiel" — seul
                        mode où ces 4 champs par bloc (top/essais/zone/essais-zone) ont un
                        sens. Même écran accessible depuis l'espace Ouvreur (voir
                        CompetitionBouldersList.tsx). */}
                    {competition.scoring_mode === 'officiel' && (
                      <Button
                        variant="outlined"
                        size="small"
                        sx={{ ml: 1 }}
                        onClick={() => navigate(`/competitions/judge-entry/${competition.id}`)}
                      >
                        Saisie juge
                      </Button>
                    )}
                    {/* ✅ docs/plans/CONCEPTION-classement-saisonnier.md, "Le bouton admin Générer
                        le roster" : même restriction que "Saisie juge" — le roster
                        automatique n'a de sens que pour la Finale (mode officiel). */}
                    {competition.scoring_mode === 'officiel' && (
                      <Button
                        variant="outlined"
                        size="small"
                        sx={{ ml: 1 }}
                        onClick={() => handleGenerateRoster(competition)}
                      >
                        Générer le roster
                      </Button>
                    )}
                    {/* ✅ Palmarès officiel (§2 du plan du 5 novembre) : seulement une fois
                        l'épreuve TERMINÉE — avant, les classements sont provisoires par
                        nature, et geler en cours d'épreuve serait figer un résultat partiel.
                        Une fois publié, le document est immuable : on affiche la date au lieu
                        d'un bouton qui ne pourrait qu'échouer. */}
                    {competition.status === 'terminée' && (
                      palmaresPublies.has(competition.id) ? (
                        <Chip
                          label={`Palmarès publié le ${new Date(palmaresPublies.get(competition.id) || '').toLocaleDateString()}`}
                          color="success"
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      ) : (
                        <Button
                          variant="contained"
                          size="small"
                          sx={{ ml: 1 }}
                          onClick={() => handlePreparerPalmares(competition)}
                        >
                          Publier le palmarès
                        </Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* ✅ Aperçu avant gel — la seule occasion de voir ce qu'on rend définitif. */}
        <Dialog
          open={palmaresApercu !== null}
          onClose={() => setPalmaresApercu(null)}
          fullWidth
          maxWidth="sm"
          fullScreen={isMobile}
        >
          <DialogTitle>Publier le palmarès officiel</DialogTitle>
          <DialogContent>
            {palmaresApercu && (
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert severity="warning">
                  Cette publication est <strong>définitive</strong>. Le palmarès ne pourra plus
                  être modifié ni republié : une recotation de bloc ultérieure ne changera pas
                  le podium. Vérifiez que toutes les saisies sont faites avant de publier.
                </Alert>

                <Typography variant="subtitle1">
                  {palmaresApercu.competition.name} — {new Date(palmaresApercu.competition.date).toLocaleDateString()}
                </Typography>

                {palmaresApercu.payload.general_open.length === 0 ? (
                  <Alert severity="error">
                    Aucun participant classé : aucun résultat n'a été saisi pour cette
                    compétition. Publier maintenant gèlerait un palmarès vide.
                  </Alert>
                ) : (
                  <>
                    <Typography variant="body2">
                      <strong>{palmaresApercu.payload.general_open.length}</strong> participant(s) au
                      classement général, dont <strong>{palmaresApercu.payload.client_open.length}</strong> client(s).
                    </Typography>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Tête du classement général :</Typography>
                      {palmaresApercu.payload.general_open.slice(0, 3).map((e) => (
                        <Typography key={e.user_id} variant="body2">
                          {e.rank}. {e.display_name} — {e.score} pts
                        </Typography>
                      ))}
                    </Box>
                    <Typography variant="body2">
                      Groupes : {palmaresApercu.payload.client_gender.length} genre(s),{' '}
                      {palmaresApercu.payload.client_age.length} catégorie(s) d'âge,{' '}
                      {palmaresApercu.payload.client_level_max.length} paquet(s) de niveau
                      ({palmaresApercu.payload.client_level_max.map(g => `${g.category} : ${g.entries.length}`).join(', ')}).
                    </Typography>
                  </>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPalmaresApercu(null)}>Annuler</Button>
            <Button
              variant="contained"
              color="primary"
              disabled={publicationEnCours || (palmaresApercu?.payload.general_open.length ?? 0) === 0}
              onClick={handlePublierPalmares}
            >
              Publier définitivement
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue de création */}
        <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
          <DialogTitle>Créer une compétition</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Nom de la compétition"
                value={createForm.name}
                onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                fullWidth
              />
              <TextField
                label="Date"
                type="date"
                value={createForm.date}
                onChange={(e) => setCreateForm({...createForm, date: e.target.value})}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label="Code d'accès"
                value={createForm.access_code}
                onChange={(e) => setCreateForm({...createForm, access_code: e.target.value})}
                fullWidth
              />
              <TextField
                label="Nombre maximum de participants"
                type="number"
                value={createForm.max_participants}
                onChange={(e) => setCreateForm({...createForm, max_participants: parseInt(e.target.value) || 0})}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel id="statut-select-label">Statut</InputLabel>
                <Select
                  labelId="statut-select-label" id="statut-select"
                  value={createForm.status}
                  onChange={(e) => setCreateForm({...createForm, status: e.target.value as CompetitionStatus})}
                  label="Statut"
                >
                  <MenuItem value="à venir">À venir</MenuItem>
                  <MenuItem value="en cours">En cours</MenuItem>
                  <MenuItem value="terminée">Terminée</MenuItem>
                  <MenuItem value="annulée">Annulée</MenuItem>
                </Select>
              </FormControl>

              {/* ✅ Sélecteurs de niveau minimum/maximum */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                <FormControl sx={{ flex: '1 1 200px' }}>
                  <InputLabel id="niveau-minimum-optionnel-select-label">Niveau minimum (optionnel)</InputLabel>
                  <Select
                    labelId="niveau-minimum-optionnel-select-label" id="niveau-minimum-optionnel-select"
                    value={createForm.minLevel || ''}
                    onChange={(e) => setCreateForm({...createForm, minLevel: e.target.value as Level || undefined})}
                    label="Niveau minimum"
                  >
                    <MenuItem value="">Aucun</MenuItem>
                    {levelOptions.map(level => (
                      <MenuItem key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl sx={{ flex: '1 1 200px' }}>
                  <InputLabel id="niveau-maximum-optionnel-select-label">Niveau maximum (optionnel)</InputLabel>
                  <Select
                    labelId="niveau-maximum-optionnel-select-label" id="niveau-maximum-optionnel-select"
                    value={createForm.maxLevel || ''}
                    onChange={(e) => setCreateForm({...createForm, maxLevel: e.target.value as Level || undefined})}
                    label="Niveau maximum"
                  >
                    <MenuItem value="">Aucun</MenuItem>
                    {levelOptions.map(level => (
                      <MenuItem key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* ✅ Écran live TV (docs/plans/CONCEPTION-ecran-live-competition.md §7) : diffusion
                  optionnelle par compétition, à décider avant le déclenchement — voir le
                  Tooltip sur le switch du dialogue d'édition pour le verrouillage. */}
              <FormControlLabel
                control={
                  <Switch
                    checked={createForm.liveDisplayEnabled ?? false}
                    onChange={(e) => setCreateForm({ ...createForm, liveDisplayEnabled: e.target.checked })}
                  />
                }
                label="Diffuser le classement en direct sur l'écran TV"
              />
              {createForm.liveDisplayEnabled && (
                <Alert severity="info">
                  La mention de diffusion sera affichée aux participants à l'inscription.
                  Une fois la compétition déclenchée ("en cours"), ce choix ne pourra plus
                  être modifié.
                </Alert>
              )}

              {/* ✅ Chantier "comptes de points" : bouton → menu dédié plutôt qu'un Select
                  en ligne, le mode "Personnalisé" a besoin de 8 champs supplémentaires. */}
              <Button
                variant="outlined"
                startIcon={<TuneIcon />}
                onClick={() => setOpenScoringDialog('create')}
                sx={{ alignSelf: 'flex-start' }}
              >
                Mode de comptage : {scoringModeOptions.find(o => o.value === createForm.scoring_mode)?.label}
              </Button>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreateCompetition} color="primary">
              Créer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue d'édition */}
        <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
          <DialogTitle>Modifier la compétition</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Nom de la compétition"
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                fullWidth
              />
              <TextField
                label="Date"
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label="Code d'accès"
                value={editForm.access_code}
                onChange={(e) => setEditForm({...editForm, access_code: e.target.value})}
                fullWidth
              />
              <TextField
                label="Nombre maximum de participants"
                type="number"
                value={editForm.max_participants}
                onChange={(e) => setEditForm({...editForm, max_participants: parseInt(e.target.value) || 0})}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel id="statut-select-label-2">Statut</InputLabel>
                <Select
                  labelId="statut-select-label-2" id="statut-select-2"
                  value={editForm.status}
                  onChange={(e) => setEditForm({...editForm, status: e.target.value as CompetitionStatus})}
                  label="Statut"
                >
                  <MenuItem value="à venir">À venir</MenuItem>
                  <MenuItem value="en cours">En cours</MenuItem>
                  <MenuItem value="terminée">Terminée</MenuItem>
                  <MenuItem value="annulée">Annulée</MenuItem>
                </Select>
              </FormControl>

              {/* ✅ Sélecteurs de niveau minimum/maximum */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                <FormControl sx={{ flex: '1 1 200px' }}>
                  <InputLabel id="niveau-minimum-optionnel-select-label-2">Niveau minimum (optionnel)</InputLabel>
                  <Select
                    labelId="niveau-minimum-optionnel-select-label-2" id="niveau-minimum-optionnel-select-2"
                    value={editForm.minLevel || ''}
                    onChange={(e) => setEditForm({...editForm, minLevel: e.target.value as Level || undefined})}
                    label="Niveau minimum"
                  >
                    <MenuItem value="">Aucun</MenuItem>
                    {levelOptions.map(level => (
                      <MenuItem key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl sx={{ flex: '1 1 200px' }}>
                  <InputLabel id="niveau-maximum-optionnel-select-label-2">Niveau maximum (optionnel)</InputLabel>
                  <Select
                    labelId="niveau-maximum-optionnel-select-label-2" id="niveau-maximum-optionnel-select-2"
                    value={editForm.maxLevel || ''}
                    onChange={(e) => setEditForm({...editForm, maxLevel: e.target.value as Level || undefined})}
                    label="Niveau maximum"
                  >
                    <MenuItem value="">Aucun</MenuItem>
                    {levelOptions.map(level => (
                      <MenuItem key={level} value={level}>
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* ✅ Écran live TV (docs/plans/CONCEPTION-ecran-live-competition.md §7) : verrouillé
                  côté règles dès que la compétition quitte "à venir" (firestore.rules)
                  — le switch est désactivé ici pour ne pas laisser croire qu'un
                  changement serait pris en compte. */}
              <Tooltip
                title={
                  selectedCompetition && !isLiveDisplayEditable(selectedCompetition)
                    ? "Verrouillé : la compétition a déjà été déclenchée. Ce choix ne peut plus être modifié."
                    : ''
                }
              >
                <span>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={editForm.liveDisplayEnabled ?? false}
                        disabled={!selectedCompetition || !isLiveDisplayEditable(selectedCompetition)}
                        onChange={(e) => setEditForm({ ...editForm, liveDisplayEnabled: e.target.checked })}
                      />
                    }
                    label="Diffuser le classement en direct sur l'écran TV"
                  />
                </span>
              </Tooltip>

              {/* ✅ Même verrou que liveDisplayEnabled : désactivé dès que la
                  compétition a quitté "à venir". */}
              <Tooltip
                title={
                  selectedCompetition && !isScoringModeEditable(selectedCompetition)
                    ? "Verrouillé : la compétition a déjà été déclenchée. Le mode de comptage ne peut plus être modifié."
                    : ''
                }
              >
                <span>
                  <Button
                    variant="outlined"
                    startIcon={<TuneIcon />}
                    disabled={!selectedCompetition || !isScoringModeEditable(selectedCompetition)}
                    onClick={() => setOpenScoringDialog('edit')}
                  >
                    Mode de comptage : {scoringModeOptions.find(o => o.value === editForm.scoring_mode)?.label}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenEditDialog(false)}>Annuler</Button>
            <Button onClick={handleUpdateCompetition} color="primary">
              Enregistrer
            </Button>
          </DialogActions>
        </Dialog>

        {/* ✅ Chantier "comptes de points" : dialogue-menu partagé création/édition,
            piloté par openScoringDialog ('create' | 'edit' | null). Opère directement
            sur createForm/editForm — refermer sans "Valider" ne les modifie pas puisque
            chaque champ y écrit déjà au fil de la saisie (comme le reste du formulaire),
            donc on ne restaure rien à l'annulation : ce menu n'a pas d'état à lui. */}
        <Dialog
          open={openScoringDialog !== null}
          onClose={() => setOpenScoringDialog(null)}
          fullWidth
          maxWidth="sm"
          fullScreen={isMobile}
        >
          <DialogTitle>Mode de comptage des points</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="info">
                Ne s'applique qu'au classement de cette compétition — jamais au
                classement annuel des grimpeurs.
              </Alert>
              {(() => {
                const form = openScoringDialog === 'create' ? createForm : editForm;
                const setForm = openScoringDialog === 'create' ? setCreateForm : setEditForm;
                const customScoring = form.custom_scoring ?? defaultCustomScoring();
                return (
                  <>
                    <FormControl fullWidth>
                      <InputLabel id="scoring-mode-select-label">Mode</InputLabel>
                      <Select
                        labelId="scoring-mode-select-label" id="scoring-mode-select"
                        value={form.scoring_mode ?? 'blocabrac'}
                        onChange={(e) => setForm({ ...form, scoring_mode: e.target.value as ScoringMode })}
                        label="Mode"
                      >
                        {scoringModeOptions.map(option => (
                          <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Typography variant="body2" color="text.secondary">
                      {scoringModeOptions.find(o => o.value === (form.scoring_mode ?? 'blocabrac'))?.description}
                    </Typography>

                    {form.scoring_mode === 'blocs_valides' && (
                      <Alert severity="warning">
                        La valeur en points de chaque bloc se règle ensuite sur le bloc
                        lui-même, dans l'écran de gestion des blocs de compétition.
                      </Alert>
                    )}

                    {form.scoring_mode === 'personnalise' && (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Couleur</TableCell>
                              <TableCell align="right">Points de base</TableCell>
                              <TableCell align="right">Déduction / essai</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {levelOptions.map(level => (
                              <TableRow key={level}>
                                <TableCell>{level.charAt(0).toUpperCase() + level.slice(1)}</TableCell>
                                <TableCell align="right">
                                  <TextField
                                    type="number"
                                    size="small"
                                    value={customScoring[level]?.base ?? 0}
                                    onChange={(e) => setForm({
                                      ...form,
                                      custom_scoring: {
                                        ...customScoring,
                                        [level]: { ...customScoring[level], base: parseInt(e.target.value) || 0 }
                                      }
                                    })}
                                    sx={{ width: 100 }}
                                  />
                                </TableCell>
                                <TableCell align="right">
                                  <TextField
                                    type="number"
                                    size="small"
                                    value={customScoring[level]?.deduction ?? 0}
                                    onChange={(e) => setForm({
                                      ...form,
                                      custom_scoring: {
                                        ...customScoring,
                                        [level]: { ...customScoring[level], deduction: parseInt(e.target.value) || 0 }
                                      }
                                    })}
                                    sx={{ width: 100 }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </>
                );
              })()}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenScoringDialog(null)} variant="contained">
              Valider
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue de confirmation de suppression */}
        <Dialog
          open={openDeleteDialog}
          onClose={() => setOpenDeleteDialog(false)}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Supprimer la compétition</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer cette compétition ?
            <br />
            <strong>Cette action est irréversible.</strong>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button onClick={handleDeleteCompetition} color="error" variant="contained" autoFocus>
              Supprimer
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={openSnackbar}
          autoHideDuration={6000}
          onClose={() => setOpenSnackbar(false)}
        >
          <Alert
            severity={snackbarMessage.includes("succès") ? "success" : "error"}
            onClose={() => setOpenSnackbar(false)}
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
};

export default AdminCompetitionManagement;