import React from 'react';
import { Typography, Paper, Container, Box } from '@mui/material';

const AdminHomeContent: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Bienvenue sur l'espace Administrateur
        </Typography>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body1">
            Ici, vous pouvez gérer les compétitions, les utilisateurs, et consulter les statistiques.
          </Typography>
        </Box>
        <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Gérer les Compétitions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Créez, modifiez ou supprimez des compétitions.
            </Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Gérer les Utilisateurs
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ajoutez ou modifiez les rôles des utilisateurs.
            </Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Statistiques
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Consultez les données des compétitions.
            </Typography>
          </Paper>
        </Box>
      </Paper>
    </Container>
  );
};

export default AdminHomeContent;