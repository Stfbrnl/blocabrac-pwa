import React from 'react';
import { Typography, Container, Paper, Box } from '@mui/material';

const Admin: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
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