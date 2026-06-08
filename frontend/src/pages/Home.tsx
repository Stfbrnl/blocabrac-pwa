import React, { useState, useEffect } from 'react';
import { Typography, Container, Box } from '@mui/material';
import { db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

// ✅ Import du logo depuis /src/assets/
// TypeScript may not have image module declarations in this project; ignore the import type check.
// @ts-ignore
import logo from '../assets/logo-blocabrac.png';

const Home = () => {
  const [content, setContent] = useState({
    title: "Bienvenue sur BLOCABRAC",
    description: "Connectez-vous pour accéder à votre espace personnel.",
    additionalInfo: "Notre salle d'escalade est ouverte tous les jours de la semaine de 12h à 22h et le week-end de 10h à 20h. Coordonnées : 43 rue Saint-Just, 42000 Saint-Étienne. Tél : 04 77 21 55 03"
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const docRef = doc(db, 'homeContent', 'main');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setContent(docSnap.data() as typeof content);
        }
      } catch (err) {
        console.error("Erreur lors du chargement du contenu :", err);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, []);

  if (loading) {
    return <Typography>Chargement...</Typography>;
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{
        mt: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
      }}>
        {/* ✅ Logo avec import direct depuis /src/assets/ */}
        <img
          src={logo}
          alt="Logo BLOCABRAC"
          style={{
            height: '100px',
            marginBottom: '20px',
            filter: 'drop-shadow(2px 2px 4px rgba(0, 0, 0, 0.5))'
          }}
        />

        <Typography variant="h4" sx={{ mt: 2 }}>
          {content.title}
        </Typography>

        <Typography sx={{ mt: 2, maxWidth: '600px' }}>
          {content.description}
        </Typography>

        {content.additionalInfo && (
          <Typography sx={{ mt: 2, maxWidth: '600px' }}>
            {content.additionalInfo}
          </Typography>
        )}
      </Box>
    </Container>
  );
};

export default Home;