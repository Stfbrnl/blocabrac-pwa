import React from 'react';
import {
  Box,
  Button,
  Container,
  Paper,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

const MoniteurScreen: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Espace Moniteur
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Gestion des groupes, séances et exercices.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/moniteur/groups')}
            sx={{ height: '48px' }}
          >
            Gérer les groupes
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/moniteur/courses')}
            sx={{ height: '48px' }}
          >
            Gérer les séances
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/moniteur/exercises')}
            sx={{ height: '48px' }}
          >
            Gérer les exercices
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default MoniteurScreen;