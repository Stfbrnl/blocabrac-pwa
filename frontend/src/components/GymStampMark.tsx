// ✅ V2.70.1 : la marque de la salle en « tampon » (masque alpha `missionStampMarkUrl` recoloré
// en CSS, même technique que les tuiles de WeeklyMissionsGrid.tsx), pour un affichage statique
// hors de la grille — aujourd'hui l'en-tête du « Badge du grimpeur régulier » dans « Mes stats »,
// à la place de la médaille. Décoratif : toujours aria-hidden, le nom du badge porte le sens.
import React from 'react';
import { Box } from '@mui/material';
import { missionStampMarkUrl } from '../config/gymConfig';

interface GymStampMarkProps {
  // Hauteur en px ; la marque est en portrait 2:3.
  height: number;
  color: string;
  angle?: number;
}

const GymStampMark: React.FC<GymStampMarkProps> = ({ height, color, angle = -13 }) => (
  <Box
    aria-hidden="true"
    sx={{
      height,
      width: Math.round((height * 2) / 3),
      rotate: `${angle}deg`,
      backgroundColor: color,
      WebkitMaskImage: `url(${missionStampMarkUrl})`,
      maskImage: `url(${missionStampMarkUrl})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      transition: 'background-color 400ms',
    }}
  />
);

export default GymStampMark;
