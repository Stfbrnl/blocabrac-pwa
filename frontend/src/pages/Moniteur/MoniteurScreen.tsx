import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Box, Typography, Container, Paper } from '@mui/material';
import Grid from '@mui/material/Grid';

export default function MoniteurScreen(): JSX.Element {
  const navigate = useNavigate();

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Espace Moniteur
        </Typography>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 2,
          '@media (max-width: 900px)': { gridTemplateColumns: '1fr' }
        }}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={() => navigate('/moniteur/groups')}
            sx={{ p: 3 }}
          >
            Gérer les Groupes
          </Button>
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={() => navigate('/moniteur/courses')}
            sx={{ p: 3 }}
          >
            Gérer les Cours
          </Button>
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={() => navigate('/moniteur/stats')}
            sx={{ p: 3 }}
          >
            Statistiques
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}