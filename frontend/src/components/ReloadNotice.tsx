import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Container } from '@mui/material';

/**
 * Le mot laissé au visiteur dont l'écran vient de se recharger tout seul.
 *
 * ⚠️ POURQUOI IL EXISTE : le garde `vite:preloadError` de `main.tsx` recharge la page sous les
 * doigts de quelqu'un qui est en train de s'en servir. Un rechargement muet est
 * **indiscernable d'un plantage** — et c'est exactement sous cette forme-là que le défaut a
 * été rapporté le 06/11/2026 (« les validations sautaient »), pas sous celle d'un message
 * d'erreur. Dire pourquoi l'écran a cligné coûte une ligne et change le diagnostic de celui
 * qui le vit.
 *
 * ⚠️ **LA NOTICE N'EST PAS LUE ICI**, elle est reçue en propriété : `main.tsx` la consomme
 * (lit ET efface) une seule fois au chargement du module, hors de React. La lire dans un
 * `useEffect` demandait un `setState` synchrone dans l'effet — cascade de rendus, refusée par
 * ESLint — et rendait l'ordre des montages de `StrictMode` significatif sur un geste qui doit
 * se produire exactement une fois. Le geste unique vit dans `consommerNotice`, module pur et
 * testé ; ce composant ne fait plus que l'afficher et le laisser fermer.
 */
const ReloadNotice: React.FC<{ afficher: boolean }> = ({ afficher }) => {
  const [visible, setVisible] = useState(afficher);
  const location = useLocation();

  // Même exclusion que les autres bandeaux : l'écran live TV n'a personne devant lui.
  if (location.pathname.startsWith('/admin/competitions/live-display/')) return null;
  if (!visible) return null;

  return (
    <Container maxWidth="lg" sx={{ mt: 2 }}>
      <Alert severity="info" onClose={() => setVisible(false)}>
        L’application vient d’être mise à jour : cette page s’est rechargée pour récupérer la
        nouvelle version. Vos validations déjà enregistrées ne sont pas perdues.
      </Alert>
    </Container>
  );
};

export default ReloadNotice;
