import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeModeProvider } from './context/ThemeModeContext';
import { AuthProvider } from './context/AuthContext';

// Composants partagés
import Navbar from './components/Navbar';
import AppRoutes from './AppRoutes';

// ✅ Après un déploiement, un onglet resté ouvert (ou un index.html mis en cache) peut
// encore référencer un chunk JS (ex: Admin-<hash>.js) qui n'existe plus sur le serveur :
// le fetch échoue et Vite déclenche cet événement plutôt que de laisser l'écran blanc.
// On recharge une seule fois pour récupérer la version courante (garde-fou sessionStorage
// pour ne jamais boucler si le rechargement ne suffit pas à résoudre le problème).
window.addEventListener('vite:preloadError', () => {
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeModeProvider>
  </React.StrictMode>
);