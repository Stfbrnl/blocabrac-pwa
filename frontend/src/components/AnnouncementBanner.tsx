import React, { useState, useEffect } from 'react';
import { Box, Alert, Stack } from '@mui/material';
import { Campaign as CampaignIcon } from '@mui/icons-material';
import { db } from '../services/firebaseConfig';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';

interface Announcement {
  id: string;
  text: string;
  order: number;
}

// Affiche, au-dessus du menu client, toutes les informations actuellement actives
// définies par l'admin (horaires de vacances, dates de cours, prochaine compétition...).
// Plusieurs informations peuvent s'afficher en même temps, triées par leur ordre.
// Reste affiché tant que l'admin n'a pas désactivé ou supprimé l'information : pas de
// bouton pour le fermer côté client.
const AnnouncementBanner: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'announcements'),
      where('active', '==', true),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const data: Announcement[] = querySnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          text: docSnap.data().text || '',
          order: docSnap.data().order ?? 0,
        }));
        setAnnouncements(data);
      },
      (error) => {
        // On échoue silencieusement : une information manquante ne doit jamais
        // bloquer l'accès au menu ou faire planter l'écran du client.
        console.error('Erreur lors du chargement des informations :', error);
      }
    );

    return () => unsubscribe();
  }, []);

  if (announcements.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Stack spacing={1}>
        {announcements.map((announcement) => (
          <Alert
            key={announcement.id}
            severity="info"
            icon={<CampaignIcon fontSize="inherit" />}
            sx={{ alignItems: 'center' }}
          >
            {announcement.text}
          </Alert>
        ))}
      </Stack>
    </Box>
  );
};

export default AnnouncementBanner;
