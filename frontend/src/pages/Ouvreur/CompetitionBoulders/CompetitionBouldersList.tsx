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

interface Competition {
  id: string;
  name: string;
  date: string;
  status: string;
  walls: string[];
  scoring_mode?: 'blocabrac' | 'blocs_valides' | 'personnalise' | 'officiel'; // ✅ Nouveau
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

export default function CompetitionBouldersList(): JSX.Element {
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [boulders, setBoulders] = useState<Boulder[]>([]);
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

      try {
        // ✅ Deux requêtes fusionnées plutôt qu'un `type in [...]` : les blocs créés
        // pour l'épreuve restent identifiés par leur seul `type` (comme avant, aucun
        // changement rétrocompatible), tandis que les blocs quotidiens réutilisés
        // portent en plus `competition_active: true` tant qu'ils sont dans CETTE
        // compétition — sans ce champ dédié, un ancien bloc de compétition devenu
        // `type: 'daily'` après "Terminer la compétition" réapparaîtrait ici à tort,
        // puisqu'il garde son `competition_id` pour les statistiques historiques.
        const [classicSnapshot, reusedSnapshot] = await Promise.all([
          getDocs(query(
            collection(db, 'boulders'),
            where('competition_id', '==', selectedCompetition),
            where('type', '==', 'competition')
          )),
          getDocs(query(
            collection(db, 'boulders'),
            where('competition_id', '==', selectedCompetition),
            where('type', '==', 'daily'),
            where('competition_active', '==', true)
          )),
        ]);

        const allBoulders = [...classicSnapshot.docs, ...reusedSnapshot.docs].map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Boulder[];

        const filteredAndSortedBoulders = allBoulders
          .filter(boulder => boulder.is_active === true)
          .sort((a, b) => (a.number || 0) - (b.number || 0));

        setBoulders(filteredAndSortedBoulders);
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
    });
    setBoulders(boulders.filter(b => b.id !== boulderToRemove));
    setOpenRemoveDialog(false);
    setBoulderToRemove(null);
  };

  const handleReorder = async (): Promise<void> => {
    try {
      for (const boulder of boulders) {
        await updateDoc(doc(db, 'boulders', boulder.id), {
          number: boulder.number
        });
      }
      alert('Numéros réorganisés avec succès !');
    } catch (error: unknown) {
      console.error('Erreur lors de la réorganisation :', error);
      alert('Une erreur est survenue lors de la réorganisation.');
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
    try {
      setIsAddingExisting(true);
      const batch = writeBatch(db);
      selectedExistingIds.forEach((id) => {
        batch.update(doc(db, 'boulders', id), { competition_id: selectedCompetition, competition_active: true });
      });
      await batch.commit();

      const added = existingCandidates
        .filter(b => selectedExistingIds.has(b.id))
        .map(b => ({ ...b, competition_id: selectedCompetition, competition_active: true }));
      setBoulders(prev => [...prev, ...added].sort((a, b) => (a.number || 0) - (b.number || 0)));
      setOpenAddExistingDialog(false);
    } catch (error: unknown) {
      console.error('Erreur lors de l\'ajout des blocs quotidiens :', error);
      alert('Une erreur est survenue lors de l\'ajout des blocs quotidiens.');
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
  const handleConfirmMigrate = async (): Promise<void> => {
    try {
      setIsMigrating(true);
      const batch = writeBatch(db);
      boulders.forEach((boulder) => {
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
      setBoulders([]);
      setOpenMigrateDialog(false);
      alert('La compétition est terminée : les blocs créés pour l\'épreuve sont maintenant des blocs quotidiens (à recoter depuis "Gérer les blocs quotidiens"), et les blocs quotidiens réutilisés ont simplement quitté la compétition.');
    } catch (error: unknown) {
      console.error('Erreur lors du basculement en blocs quotidiens :', error);
      alert('Une erreur est survenue lors du basculement en blocs quotidiens.');
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
              {/* ✅ Écran juge (ADDENDUM-mode-ffme-finale-annee.md §3) : même écran que
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

            {boulders.length > 0 ? (
              // ✅ Scroll horizontal de secours pour ce tableau à 6 colonnes
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: 700 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>N°</TableCell>
                      <TableCell>Mur</TableCell>
                      <TableCell>Origine</TableCell>
                      <TableCell>Difficulté (interne)</TableCell>
                      <TableCell>Types</TableCell>
                      {isBlocsValidesMode && <TableCell>Points</TableCell>}
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {boulders.map((boulder: Boulder) => (
                      <TableRow key={boulder.id}>
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
