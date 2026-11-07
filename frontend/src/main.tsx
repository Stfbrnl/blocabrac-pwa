import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeModeProvider } from './context/ThemeModeContext';
import { AuthProvider } from './context/AuthContext';
import './styles/fonts.css';

// Composants partagés
import Navbar from './components/Navbar';
import UpdateBanner from './components/UpdateBanner';
import AnnouncementBanner from './components/AnnouncementBanner';
import ReloadNotice from './components/ReloadNotice';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import AppRoutes from './AppRoutes';
import { formattedAppVersion, buildDetail } from './config/appVersion';
import {
  decidePreloadErrorReload,
  noterRechargement,
  consommerNotice,
  lireStockageSession,
} from './utils/preloadErrorGuard';

// ✅ Utile pour un diagnostic à distance (l'utilisateur peut faire une capture
// d'écran de la console) sans avoir à ouvrir "Mon espace personnel" — voir
// SUIVI-remontages-et-version.md point 3.
console.log(`Blocabrac ${formattedAppVersion} — ${buildDetail}`);

// ✅ Après un déploiement, un onglet resté ouvert (ou un index.html mis en cache) peut
// encore référencer un chunk JS (ex: Admin-<hash>.js) qui n'existe plus sur le serveur :
// le fetch échoue et Vite déclenche cet événement plutôt que de laisser l'écran blanc.
//
// 🔴 CE GARDE A ÉTÉ CORRIGÉ LE 07/11/2026, ET IL ÉTAIT DÉSARMÉ POUR DE BON. Il posait un
// drapeau `sessionStorage` qu'il ne retirait jamais : il rechargeait une fois par onglet
// **et pour toute la vie de l'onglet**. Un onglet ayant connu l'incident le matin était sans
// défense au déploiement du soir — l'`import()` échouait pour de bon, et comme le dépôt
// n'avait alors ni ErrorBoundary ni route `*`, c'était un écran blanc sans sortie.
//
// La décision est désormais une FENÊTRE DE TEMPS, pas un drapeau (voir
// utils/preloadErrorGuard.ts : un drapeau booléen n'a pas la dimension où une boucle et un
// nouvel incident diffèrent). Et le rechargement laisse un mot, que ReloadNotice affiche :
// un rechargement muet est indiscernable d'un plantage, et c'est sous cette forme que le
// défaut a été rapporté.
window.addEventListener('vite:preloadError', () => {
  const stockage = lireStockageSession();
  const decision = decidePreloadErrorReload(stockage, Date.now());
  console.warn(decision.message);
  if (!decision.recharger) return;
  noterRechargement(stockage, Date.now());
  window.location.reload();
});

// ✅ Le mot laissé par le garde ci-dessus lors du rechargement PRÉCÉDENT, consommé UNE FOIS
// ici — au chargement du module, hors de React. Voir consommerNotice pour pourquoi ce n'est
// pas un useEffect : il y faudrait un setState synchrone, et le double montage de StrictMode
// rendrait l'ordre des appels significatif sur un geste qui doit avoir lieu exactement une fois.
const noticeDeRechargement = consommerNotice(lireStockageSession());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeModeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Navbar />
          <UpdateBanner />
          {/* ✅ 07/11/2026 — le bandeau d'annonces vit dans la COQUILLE, plus sur le seul
              ClientScreen : un préavis ne sert à rien s'il n'est visible que sur l'écran où
              personne ne se trouve. Même abonnement onSnapshot, donc aucune lecture de plus. */}
          <AnnouncementBanner />
          {/* ✅ Le mot laissé par le garde vite:preloadError ci-dessus. */}
          <ReloadNotice afficher={noticeDeRechargement} />
          {/* ✅ Page TERMINALE au lieu d'un écran blanc quand un écran plante ou qu'un
              fragment de route a disparu. Enveloppe AppRoutes seulement : la Navbar et les
              bandeaux doivent survivre à l'échec d'un écran, pour que la sortie reste à
              portée (même invariant que AccessDenied.tsx). */}
          <RouteErrorBoundary>
            <AppRoutes />
          </RouteErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </ThemeModeProvider>
  </React.StrictMode>
);