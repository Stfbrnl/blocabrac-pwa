import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Paper, Container, Button, Box,
  MenuItem, Select, InputLabel, FormControl, IconButton, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Chip, Checkbox,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
  Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon,
  PublishedWithChanges as PublishIcon, PlaylistAdd as PlaylistAddIcon,
  RemoveCircleOutlined as RemoveCircleOutlineIcon
} from '@mui/icons-material';
import { collection, query, where, getDocs, orderBy, updateDoc, doc, writeBatch, deleteField } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { walls, colorGrades } from '../../../config/gymConfig';
import type { ScoringMode } from '../../../utils/climbingPoints';
import { decouperEnLots, MAX_OPS_PAR_LOT } from '../../../utils/firestoreBatchChunks';

interface Competition {
  id: string;
  name: string;
  date: string;
  status: string;
  walls: string[];
  scoring_mode?: ScoringMode;
}

interface Boulder {
  id: string;
  wall: string;
  number: number;
  type: string;
  difficulty?: string;
  color?: string;
  difficulty_types: string[];
  instructions: string;
  image_base64?: string;
  competition_id: string;
  competition_active?: boolean;
  is_active: boolean;
  difficulty_level?: 'Plus' | 'Égal' | 'Moins';
  points_value?: number; // ✅ Mode de comptage "Blocs validés" uniquement
  // ✅ docs/plans/2026-11-03-CN-plan-multiplicateur-v2.md : multiplicateur de points pour
  // CETTE compétition. Absent = ×1. Un nombre et non un booléen pour n'avoir jamais à migrer
  // la donnée le jour d'un ×3 ; l'interface n'expose que ×1 et ×2, et `firestore.rules`
  // (isValidPointsMultiplier) porte la liste blanche qui fait foi.
  points_multiplier?: number;
  openedBy?: { uid: string; displayName: string } | null; // ✅ docs/plans/PLAN-ouvreur-createur-bloc.md
}

const colorRatings: { value: string; label: string }[] = colorGrades.map(
  ({ value, label }) => ({ value, label })
);
const levelOrder: string[] = colorRatings.map((c) => c.value);

// ✅ Un bloc réutilisé depuis "Blocs quotidiens" garde son `type: 'daily'` (il
// reste visible et éditable normalement en dehors de la compétition) ; seul un
// `competition_id` le rattache temporairement à cette compétition. Un bloc créé
// spécifiquement pour l'épreuve, lui, est en `type: 'competition'` (caché du
// public tant que l'épreuve dure). D'où cette distinction dans tout l'écran.
const isReusedDailyBoulder = (boulder: Boulder): boolean => boulder.type === 'daily';

// ✅ V2.79 — TOUS les blocs rattachés à une compétition, ACTIFS OU NON.
//
// 🔴 LE DÉFAUT QUE CETTE FONCTION FERME (mesuré en prod le 06/11/2026). L'effet de chargement
// ci-dessous applique `.filter(boulder => boulder.is_active === true)` avant de poser l'état
// `boulders` — ce qui est juste pour un ÉCRAN : un ouvreur n'a rien à faire d'un bloc retiré du
// mur dans sa liste. Mais c'est cet état que « Terminer la compétition » parcourait. **Un bloc
// désactivé pendant qu'il était rattaché était donc invisible à l'écran ET sauté par la
// clôture** : il gardait `competition_active: true` pour toujours, et plus aucune interface ne
// pouvait l'atteindre. Constaté sur le Contest du 5 novembre, bloc n°7 du Dévers 40°.
//
// ⚠️ LA LEÇON, plus large que ce bouton : **un filtre d'AFFICHAGE ne doit jamais devenir le
// périmètre d'une OPÉRATION DE DONNÉE.** L'écran décide de ce qu'on montre, la clôture décide
// de ce qui est vrai. Même famille que la verrue du sélecteur ×1/×2, qui ne s'affiche que pour
// un bloc rattaché : dès qu'un geste se règle sur ce que l'œil voit, il oublie ce qui est
// caché.
//
// ⚠️ ET ELLE RELIT À L'INSTANT DE L'ÉCRITURE, jamais la copie en mémoire — même doctrine que
// `utils/firstAscentWrites.ts`. Deux raisons : l'état d'affichage est filtré (c'est le défaut
// ci-dessus), et il peut être périmé si un collègue a saisi des blocs entre-temps, ce qui est
// le cas NORMAL dans cette salle (la saisie se fait par vagues).
//
// ⚠️ Pas de nouvel état React qui porterait la liste complète : ce serait une seconde source de
// vérité à côté de `boulders`, et c'est la forme d'échec la plus fréquente de ce dépôt (un
// document, plusieurs rédacteurs, des contrats divergents).
//
// Les deux requêtes sont celles de l'effet de chargement, SANS le filtre d'activité. Elles
// restent séparées plutôt qu'un `type in [...]` : les blocs créés pour l'épreuve s'identifient
// par leur seul `type`, les blocs quotidiens réutilisés par `competition_active: true` — sans
// ce champ dédié, un ancien bloc de compétition devenu `daily` après une clôture précédente
// reviendrait à tort, puisqu'il garde son `competition_id` pour les statistiques.
const chargerBlocsRattaches = async (competitionId: string): Promise<Boulder[]> => {
  const [classicSnapshot, reusedSnapshot] = await Promise.all([
    getDocs(query(
      collection(db, 'boulders'),
      where('competition_id', '==', competitionId),
      where('type', '==', 'competition')
    )),
    getDocs(query(
      collection(db, 'boulders'),
      where('competition_id', '==', competitionId),
      where('type', '==', 'daily'),
      where('competition_active', '==', true)
    )),
  ]);
  return [...classicSnapshot.docs, ...reusedSnapshot.docs]
    .map(d => ({ id: d.id, ...d.data() })) as Boulder[];
};

export default function CompetitionBouldersList(): JSX.Element {
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  // ✅ V2.79 : combien de blocs sont rattachés à la compétition SANS être affichés, parce que
  // désactivés. Un simple compte, jamais la liste — voir `chargerBlocsRattaches`.
  const [detachedAttachedCount, setDetachedAttachedCount] = useState(0);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [boulderToDelete, setBoulderToDelete] = useState<string | null>(null);
  const [openRemoveDialog, setOpenRemoveDialog] = useState(false);
  const [boulderToRemove, setBoulderToRemove] = useState<string | null>(null);
  const [openMigrateDialog, setOpenMigrateDialog] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  // Ajout de blocs quotidiens existants
  const [openAddExistingDialog, setOpenAddExistingDialog] = useState(false);
  const [existingWallFilter, setExistingWallFilter] = useState<string>('');
  const [existingColorFrom, setExistingColorFrom] = useState<string>('');
  const [existingColorTo, setExistingColorTo] = useState<string>('');
  const [existingCandidates, setExistingCandidates] = useState<Boulder[]>([]);
  const [selectedExistingIds, setSelectedExistingIds] = useState<Set<string>>(new Set());
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isAddingExisting, setIsAddingExisting] = useState(false);

  // ✅ Sélection de lignes pour l'application en masse du multiplicateur (§3 du plan).
  const [selectedForMultiplier, setSelectedForMultiplier] = useState<Set<string>>(new Set());
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);

  useEffect(() => {
    const fetchCompetitions = async (): Promise<void> => {
      const q = query(collection(db, 'competitions'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      setCompetitions(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Competition[]);
    };
    fetchCompetitions();
  }, []);

  useEffect(() => {
    const fetchBoulders = async (): Promise<void> => {
      if (!selectedCompetition) {
        setBoulders([]);
        return;
      }
      // ✅ Une sélection de lignes n'a aucun sens d'une compétition à l'autre : la garder
      // ferait porter une action en masse sur des identifiants qui ne sont plus à l'écran.
      setSelectedForMultiplier(new Set());

      try {
        // ✅ V2.79 : les deux requêtes vivent désormais dans `chargerBlocsRattaches`, partagée
        // avec « Terminer la compétition » — un seul endroit répond à « quels blocs sont
        // rattachés à cette compétition ? ».
        const allBoulders = await chargerBlocsRattaches(selectedCompetition);

        const filteredAndSortedBoulders = allBoulders
          .filter(boulder => boulder.is_active === true)
          .sort((a, b) => (a.number || 0) - (b.number || 0));

        setBoulders(filteredAndSortedBoulders);
        // ✅ V2.79 : le NOMBRE de blocs rattachés mais désactivés — pas la liste, qui n'a
        // rien à faire à l'écran. Il sert uniquement à ce que le dialogue de clôture dise la
        // vérité sur ce qu'il va modifier.
        //
        // ⚠️ Sans lui, le correctif ci-dessus produirait un MENSONGE D'UN AUTRE GENRE : la
        // clôture traiterait plus de blocs que le dialogue n'en annonce. Ce dépôt a déjà
        // tranché que sur un écran qui règle des points, un message faux est pire que pas de
        // message — l'ouvreur se fie alors à une salle qu'il croit dans un état donné.
        setDetachedAttachedCount(allBoulders.length - filteredAndSortedBoulders.length);
      } catch (error: unknown) {
        console.error('Erreur lors du chargement des blocs :', error);
        alert('Une erreur est survenue lors du chargement des blocs.');
      }
    };

    fetchBoulders();
  }, [selectedCompetition]);

  // Charge les candidats "blocs quotidiens" selon les filtres du dialogue d'ajout.
  useEffect(() => {
    if (!openAddExistingDialog) return;

    const fetchCandidates = async (): Promise<void> => {
      try {
        setIsLoadingCandidates(true);
        const clauses = [where('type', '==', 'daily'), where('is_active', '==', true)];
        if (existingWallFilter) clauses.push(where('wall', '==', existingWallFilter));
        const q = query(collection(db, 'boulders'), ...clauses);
        const snapshot = await getDocs(q);

        let candidates = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Boulder[];
        // Déjà activement rattaché à CETTE compétition : inutile de le reproposer.
        // (Un `competition_id` d'une ANCIENNE compétition terminée, sans
        // `competition_active`, reste un candidat valide pour une nouvelle.)
        candidates = candidates.filter(b => !(b.competition_active && b.competition_id === selectedCompetition));

        if (existingColorFrom) {
          const fromIndex = levelOrder.indexOf(existingColorFrom);
          const toIndex = existingColorTo ? levelOrder.indexOf(existingColorTo) : fromIndex;
          const [lo, hi] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
          candidates = candidates.filter(b => {
            const index = levelOrder.indexOf(b.color || '');
            return index >= lo && index <= hi;
          });
        }

        candidates.sort((a, b) => a.wall.localeCompare(b.wall) || (a.number || 0) - (b.number || 0));
        setExistingCandidates(candidates);
        setSelectedExistingIds(new Set());
      } catch (error: unknown) {
        console.error('Erreur lors du chargement des blocs quotidiens :', error);
        alert('Une erreur est survenue lors du chargement des blocs quotidiens.');
      } finally {
        setIsLoadingCandidates(false);
      }
    };

    fetchCandidates();
  }, [openAddExistingDialog, existingWallFilter, existingColorFrom, existingColorTo, selectedCompetition]);

  const handleOpenDeleteDialog = (boulderId: string): void => {
    setBoulderToDelete(boulderId);
    setOpenDeleteDialog(true);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!boulderToDelete) return;
    await updateDoc(doc(db, 'boulders', boulderToDelete), { is_active: false });
    setBoulders(boulders.filter(b => b.id !== boulderToDelete));
    setOpenDeleteDialog(false);
    setBoulderToDelete(null);
  };

  const handleOpenRemoveDialog = (boulderId: string): void => {
    setBoulderToRemove(boulderId);
    setOpenRemoveDialog(true);
  };

  // ✅ Pour un bloc quotidien réutilisé : on ne le supprime jamais (is_active
  // resterait vrai, il continue d'exister hors compétition), on annule juste son
  // rattachement à CETTE compétition (contrairement à "Terminer la compétition",
  // ceci efface aussi `competition_id` : c'est une correction d'ajout, pas une
  // fin de vie de compétition dont les stats doivent rester consultables).
  const handleConfirmRemove = async (): Promise<void> => {
    if (!boulderToRemove) return;
    await updateDoc(doc(db, 'boulders', boulderToRemove), {
      competition_id: deleteField(),
      competition_active: deleteField(),
      // ✅ Une valeur en points n'a de sens que pour CETTE compétition (mode "Blocs
      // validés") — la laisser survivrait sur un bloc redevenu purement quotidien.
      points_value: deleteField(),
      // ✅ Même raison, et même moment : un bloc retiré de l'épreuve ne doit pas rester
      // doublé. Contrairement à "Terminer la compétition" (voir handleConfirmMigrate), ce
      // geste est une CORRECTION d'ajout — il n'y a pas d'histoire à préserver.
      points_multiplier: deleteField(),
    });
    setBoulders(boulders.filter(b => b.id !== boulderToRemove));
    setOpenRemoveDialog(false);
    setBoulderToRemove(null);
  };

  // ⚠️ 03/11/2026 — ÉTAIT une boucle de `updateDoc` séquentiels, un aller-retour réseau PAR
  // BLOC. Correct à 23 blocs, intenable à l'échelle de la salle entière : ~150 blocs font
  // autant d'allers-retours, soit une demi-minute d'écran figé sans aucun retour visuel — et
  // un échec à mi-parcours laissait une renumérotation à MOITIÉ FAITE sans le dire.
  const handleReorder = async (): Promise<void> => {
    let lotsFaits = 0;
    try {
      for (const lot of decouperEnLots(boulders)) {
        const batch = writeBatch(db);
        lot.forEach((boulder) => batch.update(doc(db, 'boulders', boulder.id), { number: boulder.number }));
        await batch.commit();
        lotsFaits += 1;
      }
      alert('Numéros réorganisés avec succès !');
    } catch (error: unknown) {
      console.error('Erreur lors de la réorganisation :', error);
      alert(lotsFaits === 0
        ? 'Une erreur est survenue lors de la réorganisation. Aucun numéro n\'a été modifié.'
        : 'Une erreur est survenue EN COURS de réorganisation : une partie des numéros a été écrite, l\'autre non. Rechargez la page et relancez — l\'opération se rejoue sans dommage.');
    }
  };

  const toggleSelectedExisting = (id: string): void => {
    setSelectedExistingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllExisting = (): void => {
    setSelectedExistingIds(prev =>
      prev.size === existingCandidates.length
        ? new Set()
        : new Set(existingCandidates.map(b => b.id))
    );
  };

  // ✅ Rattache les blocs quotidiens choisis à la compétition : ils restent en
  // `type: 'daily'` (toujours visibles/éditables normalement) et gagnent
  // `competition_id` + `competition_active: true`, ce qui les fait apparaître
  // dans cet écran et dans la validation côté client, en plus de leur vie
  // normale de bloc quotidien.
  const handleConfirmAddExisting = async (): Promise<void> => {
    if (selectedExistingIds.size === 0) return;
    // ⚠️ 03/11/2026 — DÉCOUPÉ EN LOTS : le contest du 5 novembre porte TOUS les blocs de la
    // salle (10 murs) et non les quelques dizaines prévues, et « Tout sélectionner » rattache
    // le vivier entier d'un coup — une opération par bloc. Au-delà de 500, `commit()` lève et
    // RIEN n'est écrit : une panne permanente et déterministe sous un message générique.
    // Sous le seuil, `decouperEnLots` rend UN lot : le geste est inchangé, atomicité comprise.
    let lotsFaits = 0;
    try {
      setIsAddingExisting(true);
      for (const lot of decouperEnLots([...selectedExistingIds])) {
        const batch = writeBatch(db);
        lot.forEach((id) => {
          // ✅ 2026-11-03-CN-plan-multiplicateur-v2.md §0 : LA REMISE À ZÉRO DU MULTIPLICATEUR
          // EST ICI, au rattachement — pas à la clôture. `points_multiplier` est conservé à la
          // fin d'une compétition (c'est le seul moyen de recalculer juste le classement d'une
          // épreuve terminée, puisque `competition_results` ne stocke aucun point), donc un
          // bloc quotidien qui a déjà servi dans une compétition doublée le porte encore. Sans
          // cet effacement, il hériterait silencieusement du ×2 dans la compétition SUIVANTE.
          // C'est le seul endroit où un bloc change de compétition, et la clé est une de plus
          // dans un objet déjà écrit : coût nul.
          batch.update(doc(db, 'boulders', id), {
            competition_id: selectedCompetition,
            competition_active: true,
            points_multiplier: deleteField(),
          });
        });
        await batch.commit();
        lotsFaits += 1;
      }

      const added = existingCandidates
        .filter(b => selectedExistingIds.has(b.id))
        // ✅ `points_multiplier: undefined` et non l'omission : l'état local doit refléter
        // l'effacement qui vient d'être écrit, sinon le sélecteur afficherait ×2 sur un bloc
        // redevenu ×1 en base.
        .map(b => ({ ...b, competition_id: selectedCompetition, competition_active: true, points_multiplier: undefined }));
      setBoulders(prev => [...prev, ...added].sort((a, b) => (a.number || 0) - (b.number || 0)));
      setOpenAddExistingDialog(false);
    } catch (error: unknown) {
      console.error('Erreur lors de l\'ajout des blocs quotidiens :', error);
      // ⚠️ Le découpage échange « rien n'est écrit » contre « peut-être une partie » : le
      // message doit le DIRE. Un rattachement est idempotent, relancer la même sélection
      // est sans danger — c'est ce qui rend la réparation évidente pour l'ouvreur.
      alert(lotsFaits === 0
        ? 'Une erreur est survenue lors de l\'ajout des blocs quotidiens. Aucun bloc n\'a été rattaché.'
        : 'Une erreur est survenue APRÈS le rattachement d\'une partie des blocs. Rechargez la page, puis relancez la même sélection : les blocs déjà rattachés ne seront pas affectés.');
    } finally {
      setIsAddingExisting(false);
    }
  };

  // ✅ À la fin d'une compétition : les blocs créés spécifiquement pour l'épreuve
  // (type: 'competition') deviennent des blocs quotidiens, leur cotation interne
  // (jusque-là cachée) servant de point de départ à recoter. Les blocs quotidiens
  // réutilisés (type: 'daily') redeviennent simplement de purs blocs quotidiens :
  // seul `competition_active` est retiré (ils quittent la compétition), sans
  // toucher à leur cotation publique. `competition_id` est volontairement
  // conservé dans les deux cas : les pages de résultats/classement (déjà basées
  // uniquement sur ce champ, sans filtre de type) doivent pouvoir reconstituer
  // l'historique d'une compétition terminée.
  //
  // ⚠️ 2026-11-03-CN-plan-multiplicateur-v2.md §0 — `points_multiplier` est VOLONTAIREMENT
  // ABSENT des deux `batch.update` ci-dessous, et cette absence est le cœur du chantier :
  // `competition_results` ne stocke QUE des faits bruts (succès, essais, note, cotation
  // proposée) et jamais de points — les points sont recalculés à chaque affichage depuis le
  // bloc et le mode. Effacer le multiplicateur ici rendrait donc au simple, pour toujours, les
  // blocs doublés d'une compétition terminée : l'histoire changerait après coup. Le champ
  // appartient au groupe de `competition_id` (conservé pour l'historique), pas à celui de
  // `points_value` (effacé). La remise à zéro vit au RATTACHEMENT (handleConfirmAddExisting),
  // ce qui ferme le défaut inverse — l'héritage du ×2 par une compétition future.
  // ⚠️ 03/11/2026 — DÉCOUPÉ EN LOTS, même raison qu'au rattachement, et c'est ICI que
  // l'enjeu est le plus grand : « Terminer la compétition » écrit une opération par bloc de
  // l'épreuve. Avec toute la salle engagée, un lot unique pouvait dépasser 500 et ÉCHOUER
  // ENTIÈREMENT, à chaque tentative, le soir du contest — laissant tous les blocs
  // `competition_active` et la cotation cachée invisible.
  const handleConfirmMigrate = async (): Promise<void> => {
    let lotsFaits = 0;
    try {
      setIsMigrating(true);
      // ✅ V2.79 : on RELIT la liste complète ici, au lieu de parcourir l'état `boulders`,
      // qui est filtré sur `is_active` pour l'affichage. Voir `chargerBlocsRattaches` pour le
      // défaut que cela ferme et pour la raison de relire plutôt que de mémoriser.
      //
      // ⚠️ Et cela ferme un second défaut, du même coup : un bloc `type: 'competition'`
      // désactivé n'était jamais repassé en `daily`, donc **sa cotation restait cachée pour
      // toujours** et il devenait l'un de ces blocs inatteignables dont la production porte
      // déjà 7 exemplaires. La clôture le récupère maintenant.
      const tousLesBlocsRattaches = await chargerBlocsRattaches(selectedCompetition);
      for (const lot of decouperEnLots(tousLesBlocsRattaches)) {
        const batch = writeBatch(db);
        lot.forEach((boulder) => {
          if (isReusedDailyBoulder(boulder)) {
            // ✅ Même raison que dans handleConfirmRemove : la valeur en points ne
            // vaut que pour cette compétition, elle doit repartir avec elle.
            batch.update(doc(db, 'boulders', boulder.id), { competition_active: deleteField(), points_value: deleteField() });
          } else {
            // ✅ Ce bloc devient un bloc quotidien ordinaire : s'il est un jour
            // réutilisé dans une future compétition en mode "Blocs validés", sa
            // valeur en points doit être ressaisie pour cette nouvelle épreuve,
            // jamais hériter de celle d'une compétition passée déjà terminée.
            batch.update(doc(db, 'boulders', boulder.id), {
              type: 'daily',
              color: boulder.difficulty,
              points_value: deleteField(),
            });
          }
        });
        await batch.commit();
        lotsFaits += 1;
      }
      setBoulders([]);
      setDetachedAttachedCount(0);
      setOpenMigrateDialog(false);
      alert(`La compétition est terminée : ${tousLesBlocsRattaches.length} bloc(s) traité(s). `
        + 'Les blocs créés pour l\'épreuve sont maintenant des blocs quotidiens (à recoter depuis '
        + '"Gérer les blocs quotidiens"), et les blocs quotidiens réutilisés ont simplement quitté '
        + 'la compétition.');
    } catch (error: unknown) {
      console.error('Erreur lors du basculement en blocs quotidiens :', error);
      alert(lotsFaits === 0
        ? 'Une erreur est survenue lors du basculement en blocs quotidiens. Aucun bloc n\'a été modifié.'
        : 'Une erreur est survenue APRÈS le basculement d\'une partie des blocs. Rechargez la page et relancez « Terminer la compétition » : les blocs déjà basculés ne seront pas affectés.');
    } finally {
      setIsMigrating(false);
    }
  };

  const newlyCreatedCount = boulders.filter(b => !isReusedDailyBoulder(b)).length;
  const reusedCount = boulders.filter(isReusedDailyBoulder).length;
  // ✅ Les blocs créés pour l'épreuve saisissent déjà leur valeur en points dans leur
  // propre formulaire (CompetitionBoulderForm.tsx) ; cette colonne ne sert donc qu'aux
  // blocs quotidiens réutilisés, seuls à ne pas passer par ce formulaire.
  const isBlocsValidesMode = competitions.find(c => c.id === selectedCompetition)?.scoring_mode === 'blocs_valides';

  // ✅ 2026-11-03-CN-plan-multiplicateur-v2.md §3 — le multiplicateur de points.
  //
  // Affiché pour LES DEUX formes de bloc (créé pour l'épreuve et quotidien rattaché), et
  // modifiable à tout moment pendant la compétition : les règles ne verrouillent pas les blocs
  // sur le statut de la compétition, et le gérant peut décider du mur doublé la veille comme
  // en cours de soirée.
  //
  // ⚠️ MASQUÉ en mode "Officiel" : ce mode ne produit pas de points mais un tri
  // (tops/zones/essais), `calculateCompetitionPoints` y rend 0, donc un multiplicateur y
  // serait sans aucun effet. Afficher un réglage inopérant est pire que ne rien afficher —
  // même raison que l'absence de "Points: 0" dans le dialogue de validation du grimpeur.
  const isOfficielMode = competitions.find(c => c.id === selectedCompetition)?.scoring_mode === 'officiel';

  const persistMultiplier = async (boulderId: string, value: number): Promise<void> => {
    // ✅ `deleteField()` pour ×1 plutôt que d'écrire le littéral 1 : l'absence du champ EST
    // ×1 partout (calcul, règles), et ne pas semer de 1 inutiles garde la donnée lisible —
    // un bloc portant `points_multiplier` est un bloc que quelqu'un a réglé.
    await updateDoc(doc(db, 'boulders', boulderId), {
      points_multiplier: value === 1 ? deleteField() : value,
    });
  };

  const handleMultiplierChange = async (boulderId: string, value: number): Promise<void> => {
    const avant = boulders.find(b => b.id === boulderId)?.points_multiplier;
    // Optimiste, puis annulé en cas d'échec : une écriture par changement, négligeable, mais
    // un sélecteur qui resterait sur la valeur choisie après un refus mentirait à l'ouvreur.
    setBoulders(prev => prev.map(b => (b.id === boulderId ? { ...b, points_multiplier: value } : b)));
    try {
      await persistMultiplier(boulderId, value);
    } catch (error: unknown) {
      console.error('Erreur lors de la sauvegarde du multiplicateur :', error);
      setBoulders(prev => prev.map(b => (b.id === boulderId ? { ...b, points_multiplier: avant } : b)));
      alert('Le multiplicateur n\'a pas pu être enregistré.');
    }
  };

  // ✅ Action en masse : poser 23 drapeaux jeudi soir sans 23 clics. C'est un confort d'écran,
  // pas une règle de calcul — elle passe par exactement la même écriture, bloc par bloc.
  const handleBulkMultiplier = async (value: number): Promise<void> => {
    if (selectedForMultiplier.size === 0) return;
    const cibles = [...selectedForMultiplier];
    let lotsFaits = 0;
    try {
      setIsApplyingBulk(true);
      // ⚠️ Découpé comme les autres gestes de cet écran : « tout sélectionner puis ×2 » sur
      // une salle entière dépasserait la limite de 500 opérations par lot.
      for (const lot of decouperEnLots(cibles)) {
        const batch = writeBatch(db);
        lot.forEach((id) => {
          batch.update(doc(db, 'boulders', id), {
            points_multiplier: value === 1 ? deleteField() : value,
          });
        });
        await batch.commit();
        lotsFaits += 1;
      }
      setBoulders(prev => prev.map(b => (selectedForMultiplier.has(b.id) ? { ...b, points_multiplier: value } : b)));
      setSelectedForMultiplier(new Set());
    } catch (error: unknown) {
      console.error('Erreur lors de l\'application en masse du multiplicateur :', error);
      // ⚠️ Le message affirmait « Aucun bloc n'a été modifié » : vrai avec un lot unique,
      // FAUX dès qu'il y en a deux. Un message faux sur un écran de réglage de points est
      // pire que pas de message — l'ouvreur se fierait à une salle qu'il croit intacte.
      alert(lotsFaits === 0
        ? 'Les multiplicateurs n\'ont pas pu être enregistrés. Aucun bloc n\'a été modifié.'
        : 'Une partie seulement des multiplicateurs a été enregistrée (' + (lotsFaits * MAX_OPS_PAR_LOT) + ' bloc(s) au plus). Rechargez la page pour voir l\'état réel avant de relancer.');
    } finally {
      setIsApplyingBulk(false);
    }
  };

  const toggleSelectedForMultiplier = (id: string): void => {
    setSelectedForMultiplier(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handlePointsValueChange = (boulderId: string, rawValue: string): void => {
    const value = rawValue === '' ? undefined : parseInt(rawValue, 10) || 0;
    setBoulders(prev => prev.map(b => (b.id === boulderId ? { ...b, points_value: value } : b)));
  };

  const handlePointsValueBlur = async (boulderId: string, value: number | undefined): Promise<void> => {
    try {
      await updateDoc(doc(db, 'boulders', boulderId), { points_value: value ?? deleteField() });
    } catch (error: unknown) {
      console.error('Erreur lors de la sauvegarde de la valeur en points :', error);
      alert('Une erreur est survenue lors de la sauvegarde de la valeur en points.');
    }
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          Gérer les blocs de compétition
        </Typography>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="selectionnez-une-competition-select-label">Sélectionnez une compétition</InputLabel>
          <Select
            labelId="selectionnez-une-competition-select-label" id="selectionnez-une-competition-select"
            value={selectedCompetition}
            onChange={(e: SelectChangeEvent): void => setSelectedCompetition(e.target.value)}
            label="Compétition"
          >
            {competitions.map((comp: Competition) => (
              <MenuItem key={comp.id} value={comp.id}>
                {comp.name} - {new Date(comp.date).toLocaleDateString()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedCompetition && (
          <>
            {/* ✅ flexWrap pour empiler les boutons sur mobile au lieu de les compresser */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate(`/ouvreur/competition-boulders/${selectedCompetition}/add`)}
              >
                Ajouter un bloc
              </Button>
              <Button
                variant="outlined"
                startIcon={<PlaylistAddIcon />}
                onClick={() => setOpenAddExistingDialog(true)}
              >
                Ajouter des blocs quotidiens existants
              </Button>
              <Button
                variant="outlined"
                onClick={handleReorder}
              >
                Réorganiser les numéros
              </Button>
              {/* ✅ Écran juge (docs/plans/ADDENDUM-mode-ffme-finale-annee.md §3) : même écran que
                  celui accessible depuis AdminCompetitionManagement.tsx, uniquement pour
                  les compétitions en mode de comptage "Officiel". */}
              {competitions.find(c => c.id === selectedCompetition)?.scoring_mode === 'officiel' && (
                <Button
                  variant="outlined"
                  onClick={() => navigate(`/competitions/judge-entry/${selectedCompetition}`)}
                >
                  Saisie juge
                </Button>
              )}
              {boulders.length > 0 && (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<PublishIcon />}
                  onClick={() => setOpenMigrateDialog(true)}
                >
                  Terminer la compétition
                </Button>
              )}
            </Box>

            {/* ✅ Action en masse du multiplicateur — n'apparaît que quand des lignes sont
                cochées, pour ne pas alourdir l'écran le reste du temps. */}
            {!isOfficielMode && selectedForMultiplier.size > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Typography variant="body2">
                  {selectedForMultiplier.size} bloc{selectedForMultiplier.size > 1 ? 's' : ''} sélectionné{selectedForMultiplier.size > 1 ? 's' : ''} :
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  disabled={isApplyingBulk}
                  onClick={() => { void handleBulkMultiplier(2); }}
                >
                  Compter double (×2)
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={isApplyingBulk}
                  onClick={() => { void handleBulkMultiplier(1); }}
                >
                  Revenir au simple (×1)
                </Button>
                <Button size="small" onClick={() => setSelectedForMultiplier(new Set())}>
                  Tout décocher
                </Button>
              </Box>
            )}

            {boulders.length > 0 ? (
              // ✅ Scroll horizontal de secours : 7 à 10 colonnes selon le mode de comptage
              // (la case de sélection et le multiplicateur s'ajoutent hors mode « Officiel »,
              // la colonne Points seulement en « Blocs validés »).
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: 900 }}>
                  <TableHead>
                    <TableRow>
                      {!isOfficielMode && (
                        <TableCell padding="checkbox">
                          <Checkbox
                            slotProps={{ input: { 'aria-label': 'Tout sélectionner pour le multiplicateur' } }}
                            checked={boulders.length > 0 && selectedForMultiplier.size === boulders.length}
                            indeterminate={selectedForMultiplier.size > 0 && selectedForMultiplier.size < boulders.length}
                            onChange={() => setSelectedForMultiplier(prev =>
                              prev.size === boulders.length ? new Set() : new Set(boulders.map(b => b.id))
                            )}
                          />
                        </TableCell>
                      )}
                      <TableCell>N°</TableCell>
                      <TableCell>Mur</TableCell>
                      <TableCell>Origine</TableCell>
                      <TableCell>Difficulté (interne)</TableCell>
                      <TableCell>Types</TableCell>
                      <TableCell>Ouvert par</TableCell>
                      {isBlocsValidesMode && <TableCell>Points</TableCell>}
                      {!isOfficielMode && <TableCell>Multiplicateur</TableCell>}
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {boulders.map((boulder: Boulder) => (
                      <TableRow key={boulder.id}>
                        {!isOfficielMode && (
                          <TableCell padding="checkbox">
                            <Checkbox
                              slotProps={{ input: { 'aria-label': `Sélectionner le bloc n°${boulder.number}` } }}
                              checked={selectedForMultiplier.has(boulder.id)}
                              onChange={() => toggleSelectedForMultiplier(boulder.id)}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <TextField
                            type="number"
                            value={boulder.number}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                              const newBoulders = [...boulders];
                              const index = newBoulders.findIndex(b => b.id === boulder.id);
                              if (index !== -1) {
                                newBoulders[index] = { ...newBoulders[index], number: parseInt(e.target.value) || 0 };
                                setBoulders(newBoulders);
                              }
                            }}
                            size="small"
                            sx={{ width: 70 }}
                          />
                        </TableCell>
                        <TableCell>{boulder.wall}</TableCell>
                        <TableCell>
                          {isReusedDailyBoulder(boulder) ? (
                            <Chip label="Quotidien existant" size="small" color="info" />
                          ) : (
                            <Chip label="Créé pour l'épreuve" size="small" />
                          )}
                        </TableCell>
                        <TableCell>
                          {boulder.difficulty || boulder.color || '—'}
                          {boulder.difficulty_level && (
                            <Chip
                              label={boulder.difficulty_level}
                              size="small"
                              color={
                                boulder.difficulty_level === 'Plus' ? 'error' :
                                boulder.difficulty_level === 'Moins' ? 'success' : 'default'
                              }
                              sx={{ ml: 1 }}
                            />
                          )}
                        </TableCell>
                        <TableCell>{boulder.difficulty_types?.join(', ') || 'Aucun'}</TableCell>
                        {/* ✅ §7 du plan : utile pour repérer les blocs non attribués. Éditable
                            uniquement depuis le formulaire d'origine (Daily/Competition), pas ici. */}
                        <TableCell>{boulder.openedBy?.displayName || '—'}</TableCell>
                        {isBlocsValidesMode && (
                          <TableCell>
                            {isReusedDailyBoulder(boulder) ? (
                              <TextField
                                type="number"
                                value={boulder.points_value ?? ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                                  handlePointsValueChange(boulder.id, e.target.value)
                                }
                                onBlur={(e: React.FocusEvent<HTMLInputElement>): void => {
                                  void handlePointsValueBlur(boulder.id, e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0);
                                }}
                                size="small"
                                sx={{ width: 90 }}
                              />
                            ) : (
                              boulder.points_value ?? '—'
                            )}
                          </TableCell>
                        )}
                        {!isOfficielMode && (
                          <TableCell>
                            {/* ⚠️ L'identifiant est DÉRIVÉ DE LA DONNÉE, jamais un littéral
                                figé : dans une boucle de rendu, un littéral produit N
                                identifiants en double et `aria-label`/`aria-labelledby`
                                résoudraient alors sur la première ligne pour toutes les
                                autres — un défaut échangé contre un autre, invisible aux
                                avertissements du navigateur. */}
                            <Select
                              id={`points-multiplier-${boulder.id}`}
                              name={`points-multiplier-${boulder.id}`}
                              inputProps={{ 'aria-label': `Multiplicateur de points du bloc n°${boulder.number}` }}
                              value={boulder.points_multiplier ?? 1}
                              size="small"
                              sx={{ minWidth: 90 }}
                              onChange={(e: SelectChangeEvent<number>): void => {
                                void handleMultiplierChange(boulder.id, Number(e.target.value));
                              }}
                            >
                              {/* L'interface n'expose que ×1 et ×2 ; le champ est un nombre et
                                  `firestore.rules` porte la liste blanche, donc un ×3 sera un
                                  jour une option de plus ici et une valeur de plus là-bas —
                                  aucune migration de donnée. */}
                              <MenuItem value={1}>×1</MenuItem>
                              <MenuItem value={2}>×2</MenuItem>
                            </Select>
                            {boulder.points_multiplier === 2 && (
                              <Chip label="compte double" size="small" color="warning" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          {isReusedDailyBoulder(boulder) ? (
                            <>
                              <IconButton
                                color="primary"
                                title="Éditer depuis les blocs quotidiens"
                                onClick={() => navigate(`/ouvreur/daily-boulders/${boulder.wall}`)}
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                color="warning"
                                title="Retirer de la compétition"
                                onClick={() => handleOpenRemoveDialog(boulder.id)}
                              >
                                <RemoveCircleOutlineIcon />
                              </IconButton>
                            </>
                          ) : (
                            <>
                              <IconButton
                                color="primary"
                                onClick={() => navigate(`/ouvreur/competition-boulders/${selectedCompetition}/edit/${boulder.id}`)}
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                color="error"
                                onClick={() => handleOpenDeleteDialog(boulder.id)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography>Aucun bloc trouvé pour cette compétition.</Typography>
            )}
          </>
        )}
      </Paper>

      <Dialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Supprimer le bloc</DialogTitle>
        <DialogContent>
          Êtes-vous sûr de vouloir supprimer ce bloc ?
          <br />
          <strong>Il sera marqué comme inactif mais ne sera plus visible.</strong>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" autoFocus>
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openRemoveDialog}
        onClose={() => setOpenRemoveDialog(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Retirer de la compétition</DialogTitle>
        <DialogContent>
          Ce bloc quotidien ne sera plus rattaché à cette compétition.
          <br />
          <strong>Il continue d'exister normalement dans "Blocs quotidiens" (aucun changement pour les grimpeurs).</strong>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRemoveDialog(false)}>Annuler</Button>
          <Button onClick={handleConfirmRemove} color="warning" variant="contained" autoFocus>
            Retirer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openMigrateDialog}
        onClose={() => (isMigrating ? undefined : setOpenMigrateDialog(false))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Terminer la compétition</DialogTitle>
        <DialogContent>
          {newlyCreatedCount > 0 && (
            <>
              {newlyCreatedCount} bloc(s) créé(s) pour cette épreuve vont devenir des <strong>blocs quotidiens</strong>, visibles de tous. Leur cotation interne (jusqu'ici cachée) sera reprise comme point de départ, à corriger ensuite depuis « Gérer les blocs quotidiens ».
              <br /><br />
            </>
          )}
          {reusedCount > 0 && (
            <>
              {reusedCount} bloc(s) quotidien(s) réutilisé(s) vont simplement quitter la compétition : ils redeviennent uniquement des blocs quotidiens, sans aucun changement de cotation.
            </>
          )}
          {/* ✅ V2.79 : les blocs rattachés mais DÉSACTIVÉS sont traités eux aussi, et le
              dialogue doit le dire — sinon il annonce moins que ce que la clôture modifie.
              Avant ce correctif ils étaient simplement oubliés, et gardaient leur drapeau de
              compétition pour toujours. */}
          {detachedAttachedCount > 0 && (
            <>
              <br /><br />
              S'y ajoutent <strong>{detachedAttachedCount} bloc(s) désactivé(s)</strong>, absents
              de la liste ci-dessus parce que retirés du mur, mais encore rattachés à la
              compétition : ils seront détachés eux aussi, sans réapparaître en salle.
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenMigrateDialog(false)} disabled={isMigrating}>Annuler</Button>
          <Button onClick={handleConfirmMigrate} color="success" variant="contained" disabled={isMigrating} autoFocus>
            {isMigrating ? 'Basculement...' : 'Confirmer'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openAddExistingDialog}
        onClose={() => (isAddingExisting ? undefined : setOpenAddExistingDialog(false))}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Ajouter des blocs quotidiens existants</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ces blocs restent des blocs quotidiens (toujours visibles et grimpables normalement) et deviennent en plus des blocs de cette compétition. Ils redeviendront uniquement quotidiens quand vous « Terminerez la compétition ».
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <FormControl sx={{ minWidth: 200 }} size="small">
              <InputLabel id="mur-filtre-select-label">Mur</InputLabel>
              <Select
                labelId="mur-filtre-select-label"
                value={existingWallFilter}
                label="Mur"
                onChange={(e: SelectChangeEvent) => setExistingWallFilter(e.target.value)}
              >
                <MenuItem value="">Tous les murs</MenuItem>
                {walls.map((w) => <MenuItem key={w} value={w}>{w}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 180 }} size="small">
              <InputLabel id="couleur-de-select-label">Couleur (de)</InputLabel>
              <Select
                labelId="couleur-de-select-label"
                value={existingColorFrom}
                label="Couleur (de)"
                onChange={(e: SelectChangeEvent) => setExistingColorFrom(e.target.value)}
              >
                <MenuItem value="">Toutes couleurs</MenuItem>
                {colorRatings.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </Select>
            </FormControl>

            {existingColorFrom && (
              <FormControl sx={{ minWidth: 180 }} size="small">
                <InputLabel id="couleur-a-select-label">à (optionnel)</InputLabel>
                <Select
                  labelId="couleur-a-select-label"
                  value={existingColorTo}
                  label="à (optionnel)"
                  onChange={(e: SelectChangeEvent) => setExistingColorTo(e.target.value)}
                >
                  <MenuItem value="">Cette couleur uniquement</MenuItem>
                  {colorRatings.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </Box>

          {isLoadingCandidates ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={28} />
            </Box>
          ) : existingCandidates.length === 0 ? (
            <Typography color="text.secondary">Aucun bloc quotidien ne correspond à ces filtres.</Typography>
          ) : (
            <>
              <Button size="small" onClick={handleToggleSelectAllExisting} sx={{ mb: 1 }}>
                {selectedExistingIds.size === existingCandidates.length ? 'Tout désélectionner' : `Tout sélectionner (${existingCandidates.length})`}
              </Button>
              <TableContainer sx={{ maxHeight: 350, overflowY: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox"></TableCell>
                      <TableCell>N°</TableCell>
                      <TableCell>Mur</TableCell>
                      <TableCell>Couleur</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {existingCandidates.map((b) => (
                      <TableRow key={b.id} hover onClick={() => toggleSelectedExisting(b.id)} sx={{ cursor: 'pointer' }}>
                        <TableCell padding="checkbox">
                          <Checkbox checked={selectedExistingIds.has(b.id)} />
                        </TableCell>
                        <TableCell>{b.number}</TableCell>
                        <TableCell>{b.wall}</TableCell>
                        <TableCell>{b.color || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddExistingDialog(false)} disabled={isAddingExisting}>Annuler</Button>
          <Button
            onClick={handleConfirmAddExisting}
            color="primary"
            variant="contained"
            disabled={isAddingExisting || selectedExistingIds.size === 0}
            autoFocus
          >
            {isAddingExisting ? 'Ajout...' : `Ajouter (${selectedExistingIds.size})`}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
