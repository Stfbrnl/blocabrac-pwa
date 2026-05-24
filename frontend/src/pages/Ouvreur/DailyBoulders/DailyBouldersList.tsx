import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Paper, Container, Button } from '@mui/material';

const walls: string[] = [
  'Caverne des petits', 'Réta d\'initiation', 'Réta Adultes', 'Grande Face',
  'Dalle', 'Dévers 15°', 'Dévers 30°', 'Dévers 40°', 'Grotte Adultes', 'Güllich'
];

export default function DailyBouldersList(): JSX.Element {
  const navigate = useNavigate();

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          Sélectionnez un mur pour gérer les blocs quotidiens
        </Typography>
        {/* ✅ Correction Grid : Utilisation de la syntaxe MUI v5+ avec sx */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 2 }}>
          {walls.map((wall: string) => (
            <Button
              key={wall}
              fullWidth
              variant="outlined"
              onClick={() => navigate(`/ouvreur/daily-boulders/${wall}`)}
              sx={{ p: 2, textTransform: 'none' }}
            >
              {wall}
            </Button>
          ))}
        </Box>
      </Paper>
    </Container>
  );
}

// ✅ Import de Box depuis @mui/material
import { Box } from '@mui/material';