// ✅ V2.70 (docs/handoffs/RETOUR-bug-missions-et-revalidation.md §2.11) : grille "bingo" des
// missions hebdomadaires — une carte tamponnée, pas une liste à cocher. Composant d'affichage
// PUR (aucune écriture ici : M4 bis remonte à ClientDaily via `onM4Bis`).
//
// - 8 tuiles, 2 colonnes × 4 lignes sur mobile (4 × 2 au-delà) ;
// - tampon = marque de la salle (gymConfig `missionStampMarkUrl`, masque alpha recoloré en CSS)
//   encrée en brandGreenDark : grand à l'arrivée (validation pendant que l'écran est ouvert),
//   petit dans un coin au repos ; inclinaison/opacité stables par mission (missionGridStyle.ts) ;
// - la couleur porte du sens : M1/M3/M4 en accent de la couleur de niveau concernée ;
// - pictogrammes dévers / rétablissement / dalle pour M5/M6/M7, 4 segments pour M2 ;
// - accessibilité : l'état n'est jamais porté par la seule couleur (tampon = forme + texte
//   « validée » pour les lecteurs d'écran, tampon lui-même aria-hidden), animations coupées
//   sous `prefers-reduced-motion`.
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material';
import { alpha, keyframes, useTheme } from '@mui/material/styles';
import CasinoIcon from '@mui/icons-material/Casino';
import { brandGreen, brandGreenDark, colorGrades, missionStampMarkUrl } from '../../../config/gymConfig';
import GymStampMark from '../../../components/GymStampMark';
import {
  MISSION_KEYS, MISSION_M4_BIS_LABEL, WEEKLY_MISSIONS_WALLS_TARGET,
  describeMission, isAtLevelCeiling, isWeeklyMissionsGridComplete,
  type MissionKey, type WeeklyMissionsState,
} from '../../../utils/weeklyMissions';
import { LIGHT_LEVEL_COLORS, missionAccentLevel, stampAngle, stampOpacity } from '../../../utils/missionGridStyle';

const levelHex = (level: string): string => colorGrades.find((g) => g.value === level)?.hex ?? '#999999';

// Encre du tampon et des en-têtes : vert foncé sur fond clair, vert de marque sur fond sombre
// (brandGreenDark y était presque invisible — vérifié en capture).
const inkFor = (mode: 'light' | 'dark'): string => (mode === 'dark' ? brandGreen : brandGreenDark);

// Durée pendant laquelle un tampon fraîchement posé reste "grand" avant de rejoindre son coin.
const STAMP_ARRIVAL_MS = 1400;

const stampIn = keyframes`
  0%   { transform: scale(1.7); opacity: 0; }
  60%  { transform: scale(0.94); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;

// Pictogrammes minimalistes (trait = currentColor) : un profil de mur + une silhouette de prise.
const WallPictogram: React.FC<{ kind: 'devers' | 'reta' | 'dalle' }> = ({ kind }) => (
  <Box component="svg" viewBox="0 0 32 32" aria-hidden="true" sx={{ width: 28, height: 28, flexShrink: 0 }}>
    <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'devers' && <path d="M6 29 L6 22 L26 5" />}
      {kind === 'reta' && <path d="M6 29 L6 15 L20 15 L20 5" />}
      {kind === 'dalle' && <path d="M4 29 L22 4" />}
    </g>
    <g fill="currentColor">
      {kind === 'devers' && <><circle cx="13" cy="17.5" r="2" /><circle cx="20" cy="11.5" r="2" /></>}
      {kind === 'reta' && <><circle cx="11" cy="12" r="2" /><circle cx="17" cy="12" r="2" /></>}
      {kind === 'dalle' && <><circle cx="10" cy="17" r="2" /><circle cx="16" cy="9" r="2" /></>}
    </g>
  </Box>
);

const pictogramFor = (key: MissionKey): React.ReactNode => {
  if (key === 'M5') return <WallPictogram kind="devers" />;
  if (key === 'M6') return <WallPictogram kind="reta" />;
  if (key === 'M7') return <WallPictogram kind="dalle" />;
  if (key === 'M8') return <CasinoIcon sx={{ fontSize: 26 }} aria-hidden="true" />;
  return null;
};

const Stamp: React.FC<{ missionKey: MissionKey; arriving: boolean }> = ({ missionKey, arriving }) => (
  <Box
    aria-hidden="true"
    sx={(theme) => ({
      position: 'absolute',
      right: arriving ? '50%' : 8,
      bottom: arriving ? '50%' : 8,
      // Marque en portrait (2:3) : toujours dans un coin au repos, jamais centrée (§2.11).
      height: arriving ? 75 : 26,
      width: arriving ? 50 : 17,
      translate: arriving ? '50% 50%' : '0 0',
      rotate: `${stampAngle(missionKey)}deg`,
      opacity: stampOpacity(missionKey),
      backgroundColor: inkFor(theme.palette.mode),
      WebkitMaskImage: `url(${missionStampMarkUrl})`,
      maskImage: `url(${missionStampMarkUrl})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      // Liseré légèrement irrégulier autour de l'encre (bavure) — un tampon, pas un autocollant.
      filter: `drop-shadow(0 0 0.6px ${alpha(inkFor(theme.palette.mode), 0.7)})`,
      transition: 'all 450ms cubic-bezier(.2,.8,.2,1)',
      animation: arriving ? `${stampIn} 320ms ease-out` : 'none',
      pointerEvents: 'none',
      '@media (prefers-reduced-motion: reduce)': { animation: 'none', transition: 'none' },
    })}
  />
);

interface Props {
  missions: WeeklyMissionsState;
  weeklyMissionsCompleted: number;
  onM4Bis: () => void;
}

const WeeklyMissionsGrid: React.FC<Props> = ({ missions, weeklyMissionsCompleted, onM4Bis }) => {
  const atCeiling = isAtLevelCeiling(missions.level);
  const doneCount = missions.done.length;
  const complete = isWeeklyMissionsGridComplete(missions);
  const theme = useTheme();

  // ✅ Le grand tampon ne s'affiche que pour une mission validée PENDANT que l'écran est
  // ouvert — jamais au premier rendu (sinon chaque visite rejouerait huit arrivées).
  const previousDoneRef = useRef<Set<MissionKey> | null>(null);
  const [arriving, setArriving] = useState<Set<MissionKey>>(new Set());
  useEffect(() => {
    const previous = previousDoneRef.current;
    previousDoneRef.current = new Set(missions.done);
    if (!previous) return; // premier rendu : état déjà acquis, pas d'arrivée à jouer
    const fresh = missions.done.filter((k) => !previous.has(k));
    if (fresh.length === 0) return;
    setArriving((prev) => new Set([...prev, ...fresh]));
    const timer = setTimeout(() => {
      setArriving((prev) => new Set([...prev].filter((k) => !fresh.includes(k))));
    }, STAMP_ARRIVAL_MS);
    return () => clearTimeout(timer);
  }, [missions.done, missions.isoWeek]);

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6">🎯 Missions de la semaine</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }} aria-label={`${doneCount} missions validées sur 8`}>
              {doneCount} / 8
            </Typography>
            {/* Badge en silhouette grisée qui se colore à la complétion : le tampon, comme le
                badge lui-même dans « Mes stats » (V2.70.2, RETOUR-v2681-v269-v270.md §7). */}
            <GymStampMark height={30} color={complete ? inkFor(theme.palette.mode) : theme.palette.action.disabled} />
          </Box>
        </Box>
        <Chip
          size="small"
          variant="outlined"
          sx={{ mb: 1.5 }}
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              Missions calées sur ton niveau
              <Box
                component="span"
                aria-label={`niveau ${missions.level}`}
                sx={{
                  width: 12, height: 12, borderRadius: '50%', display: 'inline-block',
                  backgroundColor: levelHex(missions.level),
                  border: '1px solid', borderColor: LIGHT_LEVEL_COLORS.has(missions.level) ? 'rgba(0,0,0,0.55)' : 'transparent',
                }}
              />
              <Box component="span" sx={{ fontWeight: 600 }}>{missions.level}</Box>
            </Box>
          }
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Nouvelle grille lundi.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
          {MISSION_KEYS.map((key) => {
            const done = missions.done.includes(key);
            const isM4Bis = key === 'M4' && atCeiling;
            const label = isM4Bis ? MISSION_M4_BIS_LABEL : describeMission(key, missions);
            const accent = missionAccentLevel(key, missions);
            const pictogram = pictogramFor(key);
            return (
              <Box
                key={key}
                data-mission-done={done ? 'true' : 'false'}
                sx={(theme) => ({
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: 118,
                  p: 1.25,
                  pt: accent ? 1.75 : 1.25,
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: done ? alpha(brandGreenDark, 0.35) : alpha(brandGreenDark, 0.18),
                  backgroundColor: done
                    ? alpha(brandGreenDark, theme.palette.mode === 'dark' ? 0.28 : 0.1)
                    : alpha(brandGreenDark, theme.palette.mode === 'dark' ? 0.08 : 0.03),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                })}
              >
                {accent && (
                  // Bandeau d'accent de la couleur de niveau concernée, contouré si trop clair.
                  <Box
                    aria-hidden="true"
                    sx={(theme) => ({
                      position: 'absolute', top: 0, left: 0, right: 0, height: 7,
                      backgroundColor: levelHex(accent),
                      // Contour : couleur claire sur fond clair, ou noir sur fond sombre.
                      borderBottom: theme.palette.mode === 'dark'
                        ? (accent === 'noir' ? '1px solid rgba(255,255,255,0.5)' : 'none')
                        : (LIGHT_LEVEL_COLORS.has(accent) ? '1px solid rgba(0,0,0,0.45)' : 'none'),
                    })}
                  />
                )}
                <Box sx={(theme) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, color: done ? theme.palette.text.disabled : inkFor(theme.palette.mode) })}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'inherit' }}>{key}</Typography>
                  {pictogram && <Box sx={{ color: 'inherit', display: 'flex' }}>{pictogram}</Box>}
                </Box>
                <Typography variant="body2" sx={{ color: done ? 'text.secondary' : 'text.primary', opacity: done ? 0.75 : 1, lineHeight: 1.3, pr: done ? 2.5 : 0 }}>
                  {label}
                </Typography>
                {key === 'M2' && !done && (
                  <Box sx={{ mt: 'auto' }}>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 0.25 }} aria-hidden="true">
                      {Array.from({ length: WEEKLY_MISSIONS_WALLS_TARGET }, (_, i) => (
                        <Box
                          key={i}
                          sx={{
                            flex: 1, height: 6, borderRadius: 1,
                            backgroundColor: i < missions.walls.length ? brandGreenDark : alpha(brandGreenDark, 0.18),
                          }}
                        />
                      ))}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {Math.min(missions.walls.length, WEEKLY_MISSIONS_WALLS_TARGET)} / {WEEKLY_MISSIONS_WALLS_TARGET} murs
                    </Typography>
                  </Box>
                )}
                {isM4Bis && !done && (
                  <Box sx={{ mt: 'auto' }}>
                    <Button size="small" variant="outlined" onClick={onM4Bis}>Je l'ai fait</Button>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      n'enregistre pas de résultat
                    </Typography>
                  </Box>
                )}
                {done && (
                  <>
                    <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                      Mission validée
                    </Box>
                    <Stamp missionKey={key} arriving={arriving.has(key)} />
                  </>
                )}
              </Box>
            );
          })}
        </Box>

        {complete && (
          <Typography variant="body2" sx={(theme) => ({ mt: 1.5, color: inkFor(theme.palette.mode), fontWeight: 600 })}>
            🏅 Grille complétée
            {weeklyMissionsCompleted > 0 &&
              ` — ${weeklyMissionsCompleted} semaine${weeklyMissionsCompleted > 1 ? 's' : ''} complétée${weeklyMissionsCompleted > 1 ? 's' : ''} au total`}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default WeeklyMissionsGrid;
