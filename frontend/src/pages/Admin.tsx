import React from 'react';
import { Typography, Container, Box, Button, Card, CardContent, CardHeader } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../services/firebaseConfig';

export default function Admin() {
  const [user, loading] = useAuthState(auth);
  const navigate = useNavigate();

  // Style pour les cartes de fonctionnalités
  const cardStyle = {
    marginBottom: '16px',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    '&:hover': {
      transform: 'translateY(-5px)',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Typography sx={{ mt: 4, textAlign: 'center' }}>Chargement...</Typography>
      </Container>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" sx={{ mb: 2, textAlign: 'center' }}>
          Tableau de bord Administrateur - BLOCABRAC
        </Typography>

        <Typography variant="body1" sx={{ mb: 4, textAlign: 'center' }}>
          Bienvenue sur votre espace administrateur. Utilisez les options ci-dessous pour gérer votre application.
        </Typography>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
          gap: 2
        }}>

          {/* Carte pour gérer les utilisateurs */}
          <Card sx={cardStyle} onClick={() => navigate('/admin/users')}>
            <CardHeader title="Gérer les Utilisateurs" />
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Créer, modifier ou supprimer des comptes utilisateurs (ouvreurs, moniteurs, admins).
              </Typography>
            </CardContent>
          </Card>

          {/* Carte pour modifier la page d'accueil */}
          <Card sx={cardStyle} onClick={() => navigate('/admin/home-content')}>
            <CardHeader title="Modifier la Page d'Accueil" />
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Mettre à jour le texte, les horaires et les coordonnées affichés sur la page d'accueil.
              </Typography>
            </CardContent>
          </Card>

          {/* Carte pour les statistiques */}
          <Card sx={cardStyle}>
            <CardHeader title="Statistiques" />
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Consultez les statistiques d'utilisation de l'application (bientôt disponible).
              </Typography>
            </CardContent>
          </Card>

          {/* Carte pour la gestion des blocs */}
          <Card sx={cardStyle}>
            <CardHeader title="Gérer les Blocs" />
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Ajouter, modifier ou supprimer des blocs d'escalade.
              </Typography>
            </CardContent>
          </Card>

          {/* Carte pour la gestion des réservations */}
          <Card sx={cardStyle}>
            <CardHeader title="Gérer les Réservations" />
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Visualiser et gérer les réservations des clients (bientôt disponible).
              </Typography>
            </CardContent>
          </Card>

          {/* Carte pour les paramètres */}
          <Card sx={cardStyle}>
            <CardHeader title="Paramètres" />
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Configurer les paramètres généraux de l'application (bientôt disponible).
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Bouton de déconnexion */}
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Button
            variant="outlined"
            color="error"
            onClick={async () => {
              await auth.signOut();
              navigate('/login');
            }}
          >
            Déconnexion
          </Button>
        </Box>
      </Box>
    </Container>
  );
}