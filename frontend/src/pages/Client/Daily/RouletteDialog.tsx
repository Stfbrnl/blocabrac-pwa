// ✅ Bloc Roulette (CONCEPTION-roulette-et-defis.md, Partie 1) : dialog de tirage/relance,
// affichage de la proposition résolue, cas particuliers famille E (aucune écriture) et
// famille C (chronomètre non persisté). AUCUN import Firestore ici — vérification
// structurelle de la gratuité du tirage (§1.9 du document) : le composant ne reçoit que des
// callbacks purs (`onDraw`) et un `onClose`, jamais de `setDoc`/`db`.
import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Alert, Chip,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CasinoIcon from '@mui/icons-material/Casino';
import ReplayIcon from '@mui/icons-material/Replay';
import type { DrawResult, Family } from '../../../utils/roulette';
import { colorGrades } from '../../../config/gymConfig';

interface RouletteDialogProps {
  open: boolean;
  isDeath: boolean;
  result: DrawResult | null;
  onClose: () => void;
  onRelancer: () => void;
}

// ✅ Retour utilisateur (18/08/2026) : la famille affichée en lettre nue ("Famille F") ne
// disait rien — soit l'expliciter, soit la retirer. Choix : l'expliciter partout (aide à
// savoir si le bloc se répète/se vérifie), jamais de lettre seule à l'écran.
const familyLabels: Record<Family, string> = {
  A: 'Socle',
  B: 'Style',
  C: 'Chronométré',
  D: 'Mur délaissé',
  E: 'Progression (réussite partielle)',
  F: 'Sans échec',
  G: 'Créatif',
};

const colorHexByValue: Record<string, string> = Object.fromEntries(colorGrades.map((c) => [c.value, c.hex]));
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Substitue {couleur}/{mur}/{numéro} par les valeurs résolues du tirage.
const renderLabel = (result: DrawResult): string => {
  let text = result.proposal.label;
  text = text.replace('{couleur}', result.resolvedColor);
  if (result.resolvedWall) text = text.replace('{mur}', result.resolvedWall);
  if (result.resolvedBoulder) {
    text = text.replace('{numéro}', String(result.resolvedBoulder.number));
    if (!result.resolvedWall) text = text.replace('{mur}', result.resolvedBoulder.wall);
  }
  return text;
};

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

const RouletteDialog: React.FC<RouletteDialogProps> = ({ open, isDeath, result, onClose, onRelancer }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
              <Chip
                label={`Niveau visé : ${capitalize(result.resolvedColor)}`}
                size="small"
                variant="outlined"
                sx={{
                  borderColor: colorHexByValue[result.resolvedColor],
                  '& .MuiChip-label': { fontWeight: 600 },
                }}
              />
            </Box>
            <Typography variant="h6" sx={{ mb: 1 }}>{renderLabel(result)}</Typography>

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
        {result?.proposal.family === 'E' && (
          // ✅ Famille E : "c'est fait" ferme la carte SANS AUCUNE ÉCRITURE (§1.3.E) — une
          // réussite partielle ne doit jamais apparaître dans client_boulder_results, sous
          // peine de fausser classement/badges/niveau auto. Ce bouton n'appelle donc que
          // `onClose`, jamais un callback d'écriture.
          <Button variant="contained" startIcon={<CasinoIcon />} onClick={onClose}>
            C'est fait
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RouletteDialog;
