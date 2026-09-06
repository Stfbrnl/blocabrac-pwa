// ✅ Bloc Roulette (CONCEPTION-roulette-et-defis.md, Partie 1) : dialog de tirage/relance,
// affichage de la proposition résolue, cas particuliers famille E (aucune écriture) et
// famille C (chronomètre non persisté). AUCUN import Firestore ici — vérification
// structurelle de la gratuité du tirage (§1.9 du document) : le composant ne reçoit que des
// callbacks purs (`onDraw`) et un `onClose`, jamais de `setDoc`/`db`.
import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Alert, Chip,
  Collapse, Link, MenuItem, TextField, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CasinoIcon from '@mui/icons-material/Casino';
import ReplayIcon from '@mui/icons-material/Replay';
import { resolveDrawLabel, type DrawResult, type Family } from '../../../utils/roulette';
import { colorGrades, walls } from '../../../config/gymConfig';

export interface RouletteChosenBoulder {
  wall: string | null;
  number: string | null;
}

interface RouletteDialogProps {
  open: boolean;
  isDeath: boolean;
  result: DrawResult | null;
  onClose: () => void;
  onRelancer: () => void;
  // ✅ V2.55 (version hybride) : "J'ai relevé le défi" — 1 écriture côté ClientDaily
  // (compteur + liste des derniers défis sur users/{uid}), jamais dans client_boulder_results.
  onValider: (chosen: RouletteChosenBoulder) => void;
}

// ✅ Retour utilisateur (18/08/2026) : la famille affichée en lettre nue ("Famille F") ne
// disait rien — soit l'expliciter, soit la retirer. Choix : l'expliciter partout (aide à
// savoir si le bloc se répète/se vérifie), jamais de lettre seule à l'écran.
const familyLabels: Record<Family, string> = {
  A: 'Socle',
  B: 'Style',
  C: 'Chronométré',
  D: 'Mur délaissé',
  E: 'Progression',
  F: 'Sans échec',
  G: 'Créatif',
};

const colorHexByValue: Record<string, string> = Object.fromEntries(colorGrades.map((c) => [c.value, c.hex]));
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Mini-chronomètre local pour la famille C — jamais persisté, remis à zéro à chaque
// ouverture/fermeture du dialog (aucun état ne survit à un rechargement, comme prévu §1.8).
const Chronometre: React.FC = () => {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const toggle = () => {
    if (running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setRunning(false);
    } else {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setRunning(true);
    }
  };
  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    setSeconds(0);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
      <Typography variant="h5" sx={{ fontFamily: 'monospace' }}>{mm}:{ss}</Typography>
      <Button size="small" variant="outlined" onClick={toggle}>{running ? 'Pause' : 'Démarrer'}</Button>
      <Button size="small" onClick={reset}>Réinitialiser</Button>
    </Box>
  );
};

const RouletteDialog: React.FC<RouletteDialogProps> = ({ open, isDeath, result, onClose, onRelancer, onValider }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Bloc précisé par le grimpeur (facultatif — "version hybride"). Réinitialisé dès que le
  // tirage change (nouveau `result` => nouveau défi) via le patron React "prev prop en state"
  // plutôt qu'un effet (pas de setState en cascade).
  const [showBoulderPicker, setShowBoulderPicker] = useState(false);
  const [chosenWall, setChosenWall] = useState('');
  const [chosenNumber, setChosenNumber] = useState('');
  const [lastResult, setLastResult] = useState(result);
  if (result !== lastResult) {
    setLastResult(result);
    setShowBoulderPicker(false);
    setChosenWall('');
    setChosenNumber('');
  }

  const handleValider = () => {
    onValider({
      wall: chosenWall || null,
      number: chosenNumber.trim() || null,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isDeath ? '☠️ Roulette de la mort' : '🎲 Bloc Roulette'}
      </DialogTitle>
      <DialogContent>
        {!result ? (
          <Alert severity="info">
            Pas de bloc disponible à ce niveau pour l'instant — reviens quand de nouveaux blocs
            de ton niveau max+1 seront posés.
          </Alert>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip label={familyLabels[result.proposal.family]} size="small" color={isDeath ? 'error' : 'primary'} />
              {/* ✅ Niveau visé toujours affiché explicitement (retour utilisateur 18/08/2026) :
                  le texte de certaines propositions (ex. F29 "cinq blocs") ne précisait jamais
                  la couleur/le niveau à respecter, rendant le défi trop facile à contourner
                  (n'importe quel bloc facile comptait). resolvedColor est déjà la contrainte
                  réellement appliquée par le tirage pour TOUTES les familles (voir
                  utils/roulette.ts), donc l'afficher une seule fois ici couvre tous les cas
                  plutôt que de retoucher chaque texte du catalogue un par un. */}
              {/* Pas de couleur cible pour une traversée : la contrainte est le nombre de
                  murs + les prises interdites, déjà dans le texte. */}
              {!result.resolvedTraversee && (
                <Chip
                  label={`Niveau visé : ${capitalize(result.resolvedColor)}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    borderColor: colorHexByValue[result.resolvedColor],
                    '& .MuiChip-label': { fontWeight: 600 },
                  }}
                />
              )}
            </Box>
            <Typography variant="h6" sx={{ mb: 1 }}>{resolveDrawLabel(result)}</Typography>

            {result.proposal.details && (
              <Typography variant="body2" sx={{ mb: 2, whiteSpace: 'pre-line' }}>
                {result.proposal.details}
              </Typography>
            )}

            {/* ✅ Rappel générique (retour utilisateur 06/09/2026) : valable pour TOUS les
                défis ciblant une couleur — prendre un bloc existant du bon niveau, ou en
                composer un équivalent. Affiché une seule fois ici plutôt que dans chaque texte
                du catalogue. Pas de couleur cible pour une traversée -> masqué. */}
            {!result.resolvedTraversee && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Prends un bloc {capitalize(result.resolvedColor)} déjà en place, ou compose-t'en
                un de niveau équivalent en piochant des prises sur plusieurs blocs d'un même mur.
              </Typography>
            )}

            {result.widened && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Tu as déjà fait le tour à ton niveau habituel — en voici un autre, un peu à
                côté de ce qui était visé.
              </Alert>
            )}

            {result.proposal.childWallWarning && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Ce défi peut passer par les murs enfants (Réta d'initiation, Caverne des
                petits) — vérifie qu'aucun cours n'occupe le secteur avant de t'y engager.
              </Alert>
            )}

            {result.proposal.family === 'C' && <Chronometre />}

            {/* ✅ V2.55 "version hybride" : préciser le bloc utilisé est FACULTATIF — un clic
                sur "J'ai relevé le défi" suffit. Ce qui est saisi ici alimente la liste des
                derniers défis dans "Mes stats". */}
            <Box sx={{ mt: 2 }}>
              {!showBoulderPicker ? (
                <Link component="button" type="button" variant="body2" onClick={() => setShowBoulderPicker(true)}>
                  Préciser le bloc utilisé (facultatif)
                </Link>
              ) : (
                <Collapse in>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <TextField
                      select size="small" label="Mur" value={chosenWall}
                      onChange={(e) => setChosenWall(e.target.value)} sx={{ minWidth: 160 }}
                    >
                      <MenuItem value=""><em>—</em></MenuItem>
                      {walls.map((w) => <MenuItem key={w} value={w}>{w}</MenuItem>)}
                    </TextField>
                    <TextField
                      size="small" label="N° du bloc" value={chosenNumber}
                      onChange={(e) => setChosenNumber(e.target.value)} sx={{ width: 120 }}
                    />
                  </Box>
                </Collapse>
              )}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fermer</Button>
        {result && (
          <Button startIcon={<ReplayIcon />} onClick={onRelancer}>
            Relancer
          </Button>
        )}
        {result && (
          // ✅ "J'ai relevé le défi" pour TOUTES les familles, famille E / roulette de la mort
          // comprises (décision utilisateur 06/09/2026). L'écriture déclenchée par `onValider`
          // (côté ClientDaily) ne touche QUE `users/{uid}` (compteur + derniers défis), jamais
          // `client_boulder_results` — l'invariant famille E (une réussite partielle ne doit
          // pas fausser classement/badges/niveau) est préservé.
          <Button variant="contained" startIcon={<CasinoIcon />} onClick={handleValider}>
            J'ai relevé le défi
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RouletteDialog;
