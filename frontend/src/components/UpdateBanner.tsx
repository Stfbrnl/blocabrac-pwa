// ✅ Bandeau de mise à jour de la PWA (PLAN-bandeau-mise-a-jour-pwa.md, 06/09/2026).
//
// `registerType: 'autoUpdate'` (vite.config.ts) active bien le nouveau service worker
// tout seul, MAIS ne recharge pas la page : le JS déjà en mémoire reste celui de
// l'ancienne version. D'où le symptôme (vider le cache sur PC, fermer tous les onglets +
// 2-3 tirages vers le bas sur Android pour finir par obtenir la nouvelle version).
//
// Ici :
//  1. `onNeedReload` intercepte le rechargement automatique de `autoUpdate` (le SW a pris
//     le contrôle, la page "devrait" se recharger) pour proposer un bandeau à la place —
//     un rechargement d'office serait néfaste sur l'écran TV de compétition ou pendant
//     une saisie d'essais.
//  2. On force une vérification (`registration.update()`) quand l'app revient au premier
//     plan après une absence, et toutes les heures — sans quoi une PWA installée qu'on ne
//     ferme jamais peut ignorer une version pendant des jours (le navigateur ne cherche
//     une MAJ qu'au chargement de la page, et bride cette recherche).
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
  const [updateReady, setUpdateReady] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const hiddenSinceRef = useRef<number | null>(null);

  useRegisterSW({
    onNeedReload() {
      setUpdateReady(true);
    },
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

  if (!updateReady || isSilentRoute(pathname)) return null;

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
            <Button color="inherit" size="small" onClick={() => setUpdateReady(false)}>
              Plus tard
            </Button>
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              sx={{ borderColor: 'currentColor', fontWeight: 700 }}
              onClick={() => window.location.reload()}
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
