import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Box, Alert, AlertTitle, Container, Stack } from '@mui/material';
import {
  Campaign as CampaignIcon,
  WarningAmber as WarningAmberIcon,
} from '@mui/icons-material';
import { auth, db } from '../services/firebaseConfig';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';

interface Announcement {
  id: string;
  text: string;
  order: number;
  /** Un PRÉAVIS, visuellement distinct d'une information ordinaire. Voir plus bas. */
  urgent: boolean;
}

/**
 * Les informations actives définies par l'admin (horaires de vacances, dates de cours,
 * prochaine compétition, préavis de maintenance…).
 *
 * ─── RENDU DANS LA COQUILLE, PAS SUR UN ÉCRAN (07/11/2026) ───────────────────────────────
 *
 * Il ne vivait que dans `ClientScreen.tsx` — c'est-à-dire sur **un seul écran**. Un préavis
 * (« mise à jour dans 10 minutes, terminez vos validations ») n'y servait donc à rien : la
 * monitrice qui est sur l'écran d'une séance, ou le grimpeur qui est sur « Mon Blocabrac
 * quotidien », ne le voyaient jamais.
 *
 * ⚠️ **La correction est un PLACEMENT, pas un mécanisme** : monté dans `main.tsx`, à côté de
 * `UpdateBanner`, il apparaît partout. L'abonnement `onSnapshot` tournait déjà — l'afficher
 * partout ne coûte **aucune lecture supplémentaire**, c'est le même et unique abonnement.
 *
 * ⚠️ **JAMAIS sur l'écran live TV** : même exclusion que `Navbar` et `UpdateBanner`, et pour
 * la même raison — cet écran est conçu pour être lu à cinq mètres et personne n'est devant
 * pour agir sur une annonce.
 *
 * ⚠️ **Abonné seulement une fois connecté** : `firestore.rules` exige `request.auth != null`
 * pour lire `announcements`. S'abonner sur l'écran de connexion produisait un
 * `permission-denied` garanti, attrapé et journalisé — un échec permanent dans la console
 * apprend à ignorer la console.
 *
 * ⚠️ **ET UN BANDEAU N'INTERROMPT PAS.** C'est sa limite, pas un défaut à corriger : il
 * informe celui qui regarde. Pour qu'un préavis réel ne se fonde pas dans le décor de celui
 * qui le voit depuis une heure, le champ `urgent` le rend en avertissement titré, pas en
 * information bleue. Rien dans `firestore.rules` à changer : les écritures d'`announcements`
 * ne contraignent aucun champ.
 */
const AnnouncementBanner: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [user] = useAuthState(auth);
  const location = useLocation();

  useEffect(() => {
    // Pas de compte connecté : pas d'abonnement du tout (les règles le refuseraient).
    // ⚠️ On ne VIDE pas l'état ici : un `setState` synchrone dans un effet déclenche une
    // cascade de rendus (et ESLint le refuse). C'est le RENDU qui est conditionné à `user`
    // plus bas — l'état résiduel d'une session précédente n'est alors jamais affiché.
    if (!user) return;

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
          // Absent sur tous les documents créés avant le 07/11/2026 : `false` est le repli
          // juste, une information ancienne n'étant pas un préavis.
          urgent: docSnap.data().urgent === true,
        }));
        setAnnouncements(data);
      },
      (error) => {
        // On échoue silencieusement : une information manquante ne doit jamais
        // bloquer l'accès à l'application ou faire planter un écran.
        console.error('Erreur lors du chargement des informations :', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // ⚠️ L'exclusion de l'écran live TV est faite APRÈS les hooks, jamais avant : un retour
  // anticipé placé plus haut changerait le nombre de hooks appelés d'un rendu à l'autre.
  if (location.pathname.startsWith('/admin/competitions/live-display/')) return null;
  // Déconnecté : rien à montrer, et l'état éventuellement resté d'une session précédente
  // n'est pas affiché (voir l'effet ci-dessus, qui ne le vide volontairement pas).
  if (!user) return null;
  if (announcements.length === 0) return null;

  return (
    <Container maxWidth="lg" sx={{ mt: 2 }}>
      <Box>
        <Stack spacing={1}>
          {announcements.map((announcement) => (
            <Alert
              key={announcement.id}
              severity={announcement.urgent ? 'warning' : 'info'}
              icon={announcement.urgent
                ? <WarningAmberIcon fontSize="inherit" />
                : <CampaignIcon fontSize="inherit" />}
              // ✅ pre-line : respecte les sauts de ligne saisis dans le texte (ex: un
              // classement multi-lignes), au lieu de tout aplatir sur une seule ligne.
              // alignItems par défaut (flex-start) plutôt que "center" : plus lisible
              // dès que le texte dépasse une ligne.
              sx={{ whiteSpace: 'pre-line' }}
            >
              {announcement.urgent && <AlertTitle>Préavis</AlertTitle>}
              {announcement.text}
            </Alert>
          ))}
        </Stack>
      </Box>
    </Container>
  );
};

export default AnnouncementBanner;
