import React from 'react';
import { Typography, Container, Paper, Box } from '@mui/material';

const Admin: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
          Tableau de bord Administrateur
        </Typography>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body1">
            Bienvenue dans l'espace administrateur de BLOCABRAC.
          </Typography>
          <Typography variant="body1" sx={{ mt: 1 }}>
            Utilisez le menu en haut pour accéder aux différentes fonctionnalités.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default Admin;