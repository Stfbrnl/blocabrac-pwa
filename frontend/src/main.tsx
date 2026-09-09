import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeModeProvider } from './context/ThemeModeContext';
import { AuthProvider } from './context/AuthContext';
import './styles/fonts.css';

// Composants partagés
import Navbar from './components/Navbar';
import UpdateBanner from './components/UpdateBanner';
import AppRoutes from './AppRoutes';
import { formattedAppVersion, buildDetail } from './config/appVersion';

// ✅ Utile pour un diagnostic à distance (l'utilisateur peut faire une capture
// d'écran de la console) sans avoir à ouvrir "Mon espace personnel" — voir
// SUIVI-remontages-et-version.md point 3.
console.log(`Blocabrac ${formattedAppVersion} — ${buildDetail}`);

// ✅ Après un déploiement, un onglet resté ouvert (ou un index.html mis en cache) peut
// encore référencer un chunk JS (ex: Admin-<hash>.js) qui n'existe plus sur le serveur :
// le fetch échoue et Vite déclenche cet événement plutôt que de laisser l'écran blanc.
// On recharge une seule fois pour récupérer la version courante (garde-fou sessionStorage
// pour ne jamais boucler si le rechargement ne suffit pas à résoudre le problème).
window.addEventListener('vite:preloadError', () => {
  // ✅ V2.59 : trace de diagnostic — savoir si ce rechargement de secours
  // court-circuite le bandeau de mise à jour lors d'un test (voir UpdateBanner.tsx).
  console.warn('[main] vite:preloadError — rechargement de secours');
  if (sessionStorage.getItem('reloadedAfterPreloadError')) return;
  sessionStorage.setItem('reloadedAfterPreloadError', '1');
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeModeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Navbar />
          <UpdateBanner />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeModeProvider>
  </React.StrictMode>
);