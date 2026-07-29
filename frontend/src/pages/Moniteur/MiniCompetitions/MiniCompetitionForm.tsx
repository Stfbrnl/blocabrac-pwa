import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc
} from 'firebase/firestore';
import {
  Container, Typography, Box, Paper, TextField, Button, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Checkbox, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Snackbar, Alert,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { walls, colorGrades } from '../../../config/gymConfig';

interface Boulder {
  id: string;
  wall: string;
  number: number;
  color?: string;
  is_child_route?: boolean;
}

const colorRatings: { value: string; label: string }[] = colorGrades.map(
  ({ value, label }) => ({ value, label })
);
const levelOrder: string[] = colorRatings.map((c) => c.value);

export default function MiniCompetitionForm(): JSX.Element {
  const { miniCompetitionId } = useParams<{ miniCompetitionId?: string }>();
  const isEditMode = !!miniCompetitionId;
  const [user, loadingAuth] = useAuthState(auth);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [wallFilter, setWallFilter] = useState('');
  const [colorFrom, setColorFrom] = useState('');
  const [colorTo, setColorTo] = useState('');
  const [childOnly, setChildOnly] = useState(false);
  const [candidates, setCandidates] = useState<Boulder[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Charge la mini-compétition existante en mode édition.
  useEffect(() => {
    const fetchMiniCompetition = async () => {
      if (!isEditMode || !miniCompetitionId) {
        setIsLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'mini_competitions', miniCompetitionId));
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || '');
          setSelectedIds(new Set(data.boulderIds || []));
        }
      } catch (err) {
        setError(`Erreur lors du chargement : ${err}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMiniCompetition();
  }, [isEditMode, miniCompetitionId]);

  // Charge les blocs quotidiens candidats selon les filtres.
  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        setIsLoadingCandidates(true);
        const clauses = [where('type', '==', 'daily'), where('is_active', '==', true)];
        if (wallFilter) clauses.push(where('wall', '==', wallFilter));
        const snapshot = await getDocs(query(collection(db, 'boulders'), ...clauses));

        let list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Boulder[];

        if (colorFrom) {
          const fromIndex = levelOrder.indexOf(colorFrom);
          const toIndex = colorTo ? levelOrder.indexOf(colorTo) : fromIndex;
          const [lo, hi] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
          list = list.filter(b => {
            const index = levelOrder.indexOf(b.color || '');
            return index >= lo && index <= hi;
          });
        }
        if (childOnly) list = list.filter(b => b.is_child_route);

        list.sort((a, b) => a.wall.localeCompare(b.wall) || (a.number || 0) - (b.number || 0));
        setCandidates(list);
      } catch (err) {
        setError(`Erreur lors du chargement des blocs quotidiens : ${err}`);
      } finally {
        setIsLoadingCandidates(false);
      }
    };
    fetchCandidates();
  }, [wallFilter, colorFrom, colorTo, childOnly]);

  const toggleSelected = (id: string): void => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllVisible = (): void => {
    const visibleIds = candidates.map(b => b.id);
    const allVisibleSelected = visibleIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      visibleIds.forEach(id => (allVisibleSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      setError('Veuillez donner un nom à la mini-compétition.');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Veuillez sélectionner au moins un bloc.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        name: name.trim(),
        boulderIds: Array.from(selectedIds),
        createdBy: user.uid,
      };

      if (isEditMode && miniCompetitionId) {
        await updateDoc(doc(db, 'mini_competitions', miniCompetitionId), payload);
      } else {
        await addDoc(collection(db, 'mini_competitions'), {
          ...payload,
          createdAt: new Date(),
        });
      }
      setSuccess('Mini-compétition enregistrée !');
      setTimeout(() => navigate('/moniteur/mini-competitions'), 1200);
    } catch (err) {
      setError(`Erreur lors de l'enregistrement : ${err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingAuth || isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Typography variant="h5" gutterBottom>
          {isEditMode ? 'Modifier la mini-compétition' : 'Nouvelle mini-compétition'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choisissez des blocs quotidiens existants : ils sont notés comme au quotidien (même barème de points), le classement de cette mini-compétition sera consultable dans vos "Stats".
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            label="Nom de la mini-compétition"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            margin="normal"
            placeholder="Ex: Défi rouge du mois"
          />

          <Box sx={{ display: 'flex', gap: 2, mb: 2, mt: 1, flexWrap: 'wrap' }}>
            <FormControl sx={{ minWidth: 200 }} size="small">
              <InputLabel id="mur-filtre-select-label">Mur</InputLabel>
              <Select
                labelId="mur-filtre-select-label"
                value={wallFilter}
                label="Mur"
                onChange={(e: SelectChangeEvent) => setWallFilter(e.target.value)}
              >
                <MenuItem value="">Tous les murs</MenuItem>
                {walls.map((w) => <MenuItem key={w} value={w}>{w}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 180 }} size="small">
              <InputLabel id="couleur-de-select-label">Couleur (de)</InputLabel>
              <Select
                labelId="couleur-de-select-label"
                value={colorFrom}
                label="Couleur (de)"
                onChange={(e: SelectChangeEvent) => setColorFrom(e.target.value)}
              >
                <MenuItem value="">Toutes couleurs</MenuItem>
                {colorRatings.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </Select>
            </FormControl>

            {colorFrom && (
              <FormControl sx={{ minWidth: 180 }} size="small">
                <InputLabel id="couleur-a-select-label">à (optionnel)</InputLabel>
                <Select
                  labelId="couleur-a-select-label"
                  value={colorTo}
                  label="à (optionnel)"
                  onChange={(e: SelectChangeEvent) => setColorTo(e.target.value)}
                >
                  <MenuItem value="">Cette couleur uniquement</MenuItem>
                  {colorRatings.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                </Select>
              </FormControl>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Checkbox checked={childOnly} onChange={(e) => setChildOnly(e.target.checked)} />
              <Typography variant="body2">🐒 Blocs enfants uniquement</Typography>
            </Box>
          </Box>

          {isLoadingCandidates ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={28} />
            </Box>
          ) : candidates.length === 0 ? (
            <Typography color="text.secondary">Aucun bloc quotidien ne correspond à ces filtres.</Typography>
          ) : (
            <>
              <Button size="small" onClick={handleToggleSelectAllVisible} sx={{ mb: 1 }}>
                {candidates.every(b => selectedIds.has(b.id)) ? 'Tout désélectionner' : `Tout sélectionner (${candidates.length})`}
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
                    {candidates.map((b) => (
                      <TableRow key={b.id} hover onClick={() => toggleSelected(b.id)} sx={{ cursor: 'pointer' }}>
                        <TableCell padding="checkbox">
                          <Checkbox checked={selectedIds.has(b.id)} />
                        </TableCell>
                        <TableCell>{b.number}</TableCell>
                        <TableCell>{b.wall}</TableCell>
                        <TableCell>{b.color || '—'}{b.is_child_route ? ' 🐒' : ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          <Typography variant="body2" sx={{ mt: 2 }}>
            {selectedIds.size} bloc(s) sélectionné(s) au total (tous filtres confondus).
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={20} /> : null}
            >
              {isSubmitting ? 'Enregistrement...' : isEditMode ? 'Mettre à jour' : 'Créer'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/moniteur/mini-competitions')}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
          </Box>
        </Box>
      </Paper>

      <Snackbar
        open={!!error || !!success}
        autoHideDuration={6000}
        onClose={() => { setError(null); setSuccess(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={error ? 'error' : 'success'} sx={{ width: '100%' }}>
          {error || success}
        </Alert>
      </Snackbar>
    </Container>
  );
}
