// ✅ Bandeau de mise à jour de la PWA (PLAN-bandeau-mise-a-jour-pwa.md, 06/09/2026 ;
// corrigé V2.62, CORRECTIF-bandeau-mode-prompt.md).
//
// V2.57/V2.58 utilisaient `registerType: 'autoUpdate'` + `onNeedReload` (un événement
// émis quand le SW prend le contrôle pendant que la page tourne). Sur un onglet PC resté
// ouvert, React gagne toujours la course avec cet événement. Sur un démarrage à froid
// Android, le SW peut s'activer (skipWaiting, propre à `autoUpdate`) avant même que
// `UpdateBanner` soit monté : l'événement part dans le vide, jamais de bandeau, saut
// direct à la nouvelle version au rechargement suivant — constaté en prod (2.60→2.61).
//
// `registerType: 'prompt'` (vite.config.ts) élimine la course : le nouveau SW reste
// "waiting" au lieu de s'activer seul. `needRefresh` (de `useRegisterSW`) est un état
// durable, pas un événement fugace — peu importe quand `UpdateBanner` se monte, il
// retrouve un SW en attente s'il y en a un. Le clic sur « Mettre à jour » appelle
// `updateServiceWorker(true)`, qui active le SW puis recharge.
//
// Conséquence à connaître : tant que personne ne clique, l'ancienne version continue
// d'être servie indéfiniment (contrairement à `autoUpdate`, qui finissait par l'imposer
// au rechargement suivant). Le repère de version en Navbar reste le diagnostic.
//
// Conservé à l'identique :
//  1. Vérification forcée (`registration.update()`) au retour au premier plan après une
//     absence, et toutes les heures — fait apparaître le SW en attente plus tôt, sans
//     attendre un rechargement complet.
//  2. Aucun bandeau sur l'écran TV de compétition.
//
// `registration.update()` = une requête réseau vers `sw.js` (quelques centaines d'octets,
// servi en no-cache). Négligeable, ZÉRO lecture Firestore.
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Snackbar, Alert, Button, Box } from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';

// L'écran TV de compétition (AdminCompetitionLiveDisplay) tourne des heures sans personne
// devant : un bandeau y serait inutile et pourrait masquer une ligne du classement. Le
// repère de version discret déjà présent en coin d'écran suffit au diagnostic.
const isSilentRoute = (pathname: string): boolean =>
  pathname.startsWith('/admin/competitions/live-display/');

// Délai minimal en arrière-plan avant de revérifier au retour au premier plan — évite de
// déclencher `update()` à chaque bascule d'application.
const VISIBILITY_RECHECK_AFTER_MS = 3 * 60 * 1000;
// Vérification périodique pour une PWA laissée ouverte en continu.
const PERIODIC_RECHECK_MS = 60 * 60 * 1000;

const UpdateBanner: React.FC = () => {
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const hiddenSinceRef = useRef<number | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swScriptUrl, registration) {
      registrationRef.current = registration;
    },
  });

  useEffect(() => {
    const check = () => { registrationRef.current?.update().catch(() => { /* réseau : sans conséquence */ }); };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now();
        return;
      }
      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (hiddenSince === null || Date.now() - hiddenSince >= VISIBILITY_RECHECK_AFTER_MS) check();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = window.setInterval(check, PERIODIC_RECHECK_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
    };
  }, []);

  if (!needRefresh || dismissed || isSilentRoute(pathname)) return null;

  return (
    <Snackbar
      open
      // ✅ En haut, bien visible (retour utilisateur 06/09) : décalé sous l'AppBar
      // (`position="static"`, ~56-64 px), largeur confortable, jamais auto-fermant
      // (c'est une action, pas une notification).
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ top: { xs: 64, sm: 72 }, width: '100%', maxWidth: 620, px: { xs: 1, sm: 0 } }}
    >
      <Alert
        severity="warning"
        variant="filled"
        icon={false}
        sx={{
          width: '100%',
          alignItems: 'center',
          fontWeight: 600,
          boxShadow: 6,
          '& .MuiAlert-action': { pt: 0, alignItems: 'center' },
        }}
        action={
          <Box sx={{ display: 'flex', gap: 1, whiteSpace: 'nowrap' }}>
            <Button color="inherit" size="small" onClick={() => setDismissed(true)}>
              Plus tard
            </Button>
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              sx={{ borderColor: 'currentColor', fontWeight: 700 }}
              onClick={() => updateServiceWorker(true)}
            >
              Mettre à jour
            </Button>
          </Box>
        }
      >
        Une nouvelle version est disponible.
      </Alert>
    </Snackbar>
  );
};

export default UpdateBanner;
