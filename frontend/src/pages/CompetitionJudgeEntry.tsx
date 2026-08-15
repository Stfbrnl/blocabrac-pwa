import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container, Paper, Typography, Box, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Button, IconButton,
  Alert, CircularProgress, Tooltip
} from '@mui/material';
import { CheckCircle, RadioButtonUnchecked } from '@mui/icons-material';
import { db } from '../services/firebaseConfig';
import { collection, doc, getDoc, getDocs, query, where, setDoc, writeBatch } from 'firebase/firestore';
import { applyCompetitionValidationUpdate, type CompetitionValidationState } from '../utils/competitionValidation';

// ✅ Écran juge (ADDENDUM-mode-ffme-finale-annee.md §3) : pour le format "Finale de
// l'année" (10 grimpeurs, 5 blocs, passages consécutifs sous le regard de tous pour un
// titre annuel), l'autodéclaration côté client n'a pas le même statut qu'une compétition
// conviviale à 90 participants — un juge (admin ou ouvreur) saisit les résultats de TOUS
// les grimpeurs depuis un seul écran, comme en vraie compétition. Réutilise entièrement
// competition_results (même ID déterministe "${uid}_${boulderId}_${competitionId}"),
// le même patron d'écriture différée que ClientCompetitions.tsx, et les mêmes invariants
// de saisie (applyCompetitionValidationUpdate) — rien de nouveau côté schéma ni règles
// (confirmé par les tests ajoutés à competition-results-lock.test.ts : admin/ouvreur ont
// déjà un accès en écriture inconditionnel, y compris pour CRÉER, pas seulement modifier,
// le résultat de quelqu'un d'autre).
//
// Cet écran vise volontairement le petit format (≤ une quinzaine de grimpeurs/blocs) —
// une grille lignes × colonnes ne passerait pas à l'échelle d'une compétition à 90
// participants/35 blocs (voir §1 de la note : "tous les sujets de quota... ne
// s'appliquent pas" à ce format précisément parce qu'il reste petit).

interface Competition {
  id: string;
  name: string;
  scoring_mode?: string;
}

interface Boulder {
  id: string;
  number: number;
  wall: string;
}

interface Participant {
  user_id: string;
  first_name: string;
  last_name: string;
  submitted: boolean;
}

const defaultCellState: CompetitionValidationState = { success: false, attempts: 1, zone: false, attemptsToZone: 1 };

const CompetitionJudgeEntry: React.FC = () => {
  const { competitionId } = useParams<{ competitionId: string }>();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [results, setResults] = useState<Record<string, CompetitionValidationState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const cellKey = (uid: string, boulderId: string) => `${uid}_${boulderId}`;

  // ✅ Mêmes précautions d'écriture que ClientCompetitions.tsx (chantier écritures
  // point 3/4/5) : debounce sur les essais (évite une écriture par clic sur un champ
  // numérique), écriture immédiate sur Top/Zone (l'info qu'on ne veut jamais perdre),
  // comparaison à la dernière valeur persistée, flush sur fermeture/pagehide.
  const DEBOUNCE_MS = 1500;
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingWrites = useRef<Record<string, { uid: string; boulderId: string; state: CompetitionValidationState }>>({});
  const lastPersisted = useRef<Record<string, CompetitionValidationState>>({});

  useEffect(() => {
    if (!competitionId) return;
    const load = async () => {
      try {
        setLoading(true);
        const compSnap = await getDoc(doc(db, 'competitions', competitionId));
        if (!compSnap.exists()) {
          setError('Compétition introuvable.');
          return;
        }
        const compData = { id: compSnap.id, name: compSnap.data().name || '', scoring_mode: compSnap.data().scoring_mode };
        setCompetition(compData);
        if (compData.scoring_mode !== 'officiel') {
          setError('Cet écran ne concerne que le mode de comptage "Officiel (FFME / coupe du monde)".');
          return;
        }

        const [bouldersSnap, participantsSnap, resultsSnap, usersSnap] = await Promise.all([
          getDocs(query(collection(db, 'boulders'), where('competition_id', '==', competitionId))),
          getDocs(query(collection(db, 'competition_participants'), where('competition_id', '==', competitionId))),
          getDocs(query(collection(db, 'competition_results'), where('competition_id', '==', competitionId))),
          getDocs(collection(db, 'users')),
        ]);

        const usersById = new Map(usersSnap.docs.map(d => [d.id, d.data()]));

        setBoulders(
          bouldersSnap.docs
            .map(d => ({ id: d.id, number: d.data().number || 0, wall: d.data().wall || '' }))
            .sort((a, b) => a.number - b.number)
        );

        const participantsData: Participant[] = participantsSnap.docs.map(d => {
          const data = d.data();
          const user = usersById.get(data.user_id);
          return {
            user_id: data.user_id || '',
            first_name: (user?.first_name as string) || data.first_name || '',
            last_name: (user?.last_name as string) || data.last_name || '',
            submitted: data.submitted || false,
          };
        }).sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
        setParticipants(participantsData);
        // ✅ Verrouillage tout-d'un-coup (décision assumée, voir le commentaire sur
        // handleLockAll plus bas) : la finale est verrouillée dès qu'UN participant l'est.
        setLocked(participantsData.some(p => p.submitted));

        const loadedResults: Record<string, CompetitionValidationState> = {};
        resultsSnap.docs.forEach(d => {
          const data = d.data();
          const state: CompetitionValidationState = {
            success: data.success || false,
            attempts: data.attempts || 1,
            zone: data.zone || false,
            attemptsToZone: data.attempts_to_zone || 1,
          };
          const key = cellKey(data.user_id, data.boulder_id);
          loadedResults[key] = state;
          lastPersisted.current[key] = state;
        });
        setResults(loadedResults);
      } catch (err: unknown) {
        setError(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [competitionId]);

  const persistCell = async (uid: string, boulderId: string, state: CompetitionValidationState) => {
    if (!competitionId) return;
    const key = cellKey(uid, boulderId);
    const last = lastPersisted.current[key];
    if (last && last.success === state.success && last.attempts === state.attempts &&
        last.zone === state.zone && last.attemptsToZone === state.attemptsToZone) {
      return;
    }
    try {
      const resultId = `${uid}_${boulderId}_${competitionId}`;
      await setDoc(doc(db, 'competition_results', resultId), {
        user_id: uid,
        competition_id: competitionId,
        boulder_id: boulderId,
        success: state.success,
        attempts: state.attempts,
        zone: state.zone,
        attempts_to_zone: state.attemptsToZone,
        updated_at: new Date().toISOString(),
      }, { merge: true });
      lastPersisted.current[key] = state;
    } catch (err) {
      console.error('Erreur lors de la sauvegarde de la cellule :', err);
    }
  };

  const flushPending = () => {
    Object.values(pendingWrites.current).forEach(({ uid, boulderId, state }) => {
      persistCell(uid, boulderId, state);
    });
    Object.values(debounceTimers.current).forEach(clearTimeout);
    debounceTimers.current = {};
    pendingWrites.current = {};
  };

  useEffect(() => {
    window.addEventListener('pagehide', flushPending);
    return () => {
      window.removeEventListener('pagehide', flushPending);
      flushPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCell = (uid: string, boulderId: string, updates: Partial<CompetitionValidationState>, immediate: boolean) => {
    if (locked) return;
    const key = cellKey(uid, boulderId);
    const current = results[key] || defaultCellState;
    const next = applyCompetitionValidationUpdate(current, updates);
    setResults(prev => ({ ...prev, [key]: next }));

    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    if (immediate) {
      delete pendingWrites.current[key];
      persistCell(uid, boulderId, next);
    } else {
      pendingWrites.current[key] = { uid, boulderId, state: next };
      debounceTimers.current[key] = setTimeout(() => {
        persistCell(uid, boulderId, next);
        delete pendingWrites.current[key];
      }, DEBOUNCE_MS);
    }
  };

  // ✅ Verrouillage tout-d'un-coup plutôt que grimpeur par grimpeur (décision du §3 de
  // la note laissée ouverte, tranchée ici pour la simplicité) : une seule action de fin
  // d'épreuve, cohérente avec un juge unique qui termine sa saisie pour tout le monde en
  // même temps plutôt que dans un ordre précis. writeBatch (comme handleLockResults côté
  // client) : une écriture par participant, pas 50 (une par résultat).
  const handleLockAll = async () => {
    if (!competitionId || participants.length === 0) return;
    const confirmed = window.confirm(
      "Verrouiller la finale ? Plus aucune modification ne sera possible ensuite (sauf correction manuelle admin en base)."
    );
    if (!confirmed) return;
    flushPending();
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      participants.forEach(p => {
        batch.set(doc(db, 'competition_participants', `${p.user_id}_${competitionId}`), {
          submitted: true,
          submitted_at: now,
        }, { merge: true });
      });
      await batch.commit();
      setLocked(true);
    } catch (err: unknown) {
      setError(`Erreur lors du verrouillage : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const columnWidth = useMemo(() => Math.max(160, Math.floor(700 / Math.max(boulders.length, 1))), [boulders.length]);

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, textAlign: 'center' }}><CircularProgress /></Container>;
  }

  if (error) {
    return <Container maxWidth="lg" sx={{ mt: 4 }}><Alert severity="error">{error}</Alert></Container>;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h5">Saisie juge — {competition?.name}</Typography>
          {!locked && (
            <Button variant="contained" color="primary" onClick={handleLockAll} disabled={participants.length === 0}>
              Verrouiller la finale
            </Button>
          )}
        </Box>

        {locked && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Finale verrouillée — lecture seule, plus aucune modification possible depuis cet écran.
          </Alert>
        )}

        {participants.length === 0 ? (
          <Alert severity="warning">
            Aucun participant inscrit à cette compétition — inscrivez-les d'abord (Gérer les inscriptions).
          </Alert>
        ) : boulders.length === 0 ? (
          <Alert severity="warning">Aucun bloc rattaché à cette compétition.</Alert>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 200 + boulders.length * columnWidth }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                    Grimpeur
                  </TableCell>
                  {boulders.map(b => (
                    <TableCell key={b.id} align="center" sx={{ minWidth: columnWidth }}>
                      Bloc n°{b.number}<br /><Typography variant="caption" color="text.secondary">{b.wall}</Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {participants.map(p => (
                  <TableRow key={p.user_id}>
                    <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1, fontWeight: 600 }}>
                      {p.first_name} {p.last_name}
                    </TableCell>
                    {boulders.map(b => {
                      const state = results[cellKey(p.user_id, b.id)] || defaultCellState;
                      return (
                        <TableCell key={b.id} align="center">
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Tooltip title="Top">
                                <span>
                                  <IconButton
                                    size="small"
                                    color={state.success ? 'success' : 'default'}
                                    disabled={locked}
                                    onClick={() => updateCell(p.user_id, b.id, { success: !state.success }, true)}
                                  >
                                    {state.success ? <CheckCircle fontSize="small" /> : <RadioButtonUnchecked fontSize="small" />}
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Zone">
                                <span>
                                  <IconButton
                                    size="small"
                                    color={state.zone ? 'info' : 'default'}
                                    disabled={locked}
                                    onClick={() => updateCell(p.user_id, b.id, { zone: !state.zone }, true)}
                                  >
                                    {state.zone ? <CheckCircle fontSize="small" /> : <RadioButtonUnchecked fontSize="small" />}
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <TextField
                                label="Ess. top" type="number" size="small" disabled={locked}
                                value={state.attempts}
                                onChange={(e) => updateCell(p.user_id, b.id, { attempts: Math.max(1, parseInt(e.target.value, 10) || 1) }, false)}
                                sx={{ width: 80 }}
                                slotProps={{ htmlInput: { min: 1 } }}
                              />
                              {state.zone && (
                                <TextField
                                  label="Ess. zone" type="number" size="small" disabled={locked}
                                  value={state.attemptsToZone}
                                  onChange={(e) => updateCell(p.user_id, b.id, { attemptsToZone: Math.max(1, parseInt(e.target.value, 10) || 1) }, false)}
                                  sx={{ width: 80 }}
                                  slotProps={{ htmlInput: { min: 1, max: state.attempts } }}
                                />
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Container>
  );
};

export default CompetitionJudgeEntry;
