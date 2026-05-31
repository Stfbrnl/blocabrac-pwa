import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Typography, Box, Button, Paper } from '@mui/material';

export default function MoniteurScreen() {
  const navigate = useNavigate();

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Espace Moniteur - BLOCABRAC
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/moniteur/groups')}
            sx={{ p: 3 }}
          >
            Gérer les groupes
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/moniteur/courses')}
            sx={{ p: 3 }}
          >
            Gérer les séances
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/moniteur/exercises')}
            sx={{ p: 3 }}
          >
            Gérer les exercices
          </Button>
        </Box>

        <Typography variant="body1">
          Bienvenue dans votre espace Moniteur.
        </Typography>
      </Paper>
    </Container>
  );
}