import React from 'react';
import { Container, Box, Typography, Button, Alert } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { performLogout } from '../services/logout';

/**
 * Écran TERMINAL d'accès refusé, rendu sur place par ProtectedRoute.
 *
 * ⚠️ INVARIANT À NE PAS CASSER, dans sa forme complétée par ClaudeNav le 03/10/2026 :
 * **une cible de redirection est une page terminale QUI OFFRE TOUJOURS UNE ISSUE, et cette
 * issue n'est pas une redirection.** La première moitié évite la boucle infinie ; la
 * seconde évite de la remplacer par un cul-de-sac, ce qui serait mieux mais pas suffisant.
 *
 * Ce composant ne redirige vers rien : il propose un lien vers l'accueil ET une
 * déconnexion. La déconnexion est l'issue qui compte, parce que le lien vers l'accueil
 * ramène ici pour un compte sans rôle `client` (Home pousse vers /client/screen, qui
 * réaffiche cet écran). La Navbar, rendue dans main.tsx HORS de AppRoutes, est par ailleurs
 * présente sur cet écran et offre elle aussi la déconnexion (conditionnée au seul `user`,
 * jamais à un rôle) — mais une page terminale ne doit pas dépendre de ce qui l'entoure pour
 * avoir une sortie.
 *
 * Avant ce composant (jusqu'au 03/10/2026), ProtectedRoute faisait
 * `<Navigate to="/" replace />` quand le rôle manquait. Or `/` est `Home`, dont le
 * `useEffect` pousse vers `/client/screen`, lui-même protégé par `role="client"` :
 * un compte sans le rôle `client` partait donc en **boucle de redirection infinie**,
 * bridée par Chrome après quelques secondes (« Throttling navigation to prevent the
 * browser from hanging »), écran scintillant, application totalement inutilisable.
 * Constaté le 03/10/2026 sur un compte d'émulateur `roles: ['ouvreur']`.
 *
 * En production l'invariant « tout compte porte `client` » (AdminUsers.tsx +
 * hasClientRole() dans les règles) l'empêchait — mais cet invariant est tenu par une
 * convention d'écriture, pas par une contrainte : décocher `client` sur un compte ouvreur
 * depuis l'écran admin suffisait à rendre ce compte inutilisable, sans autre recours qu'une
 * édition directe dans la console Firebase. Voir
 * docs/handoffs/RETOUR-labels-apres-dom.md §3.
 *
 * Mettre `replace` au lieu de `push` dans Home n'y changerait rien : le ping-pong entre les
 * deux routes demeurerait. C'est la terminalité de cet écran qui supprime la classe de
 * défaut, pour toute combinaison de rôles présente ou future.
 */
const AccessDenied: React.FC<{ requiredRoles?: string[] }> = ({ requiredRoles }) => (
  <Container maxWidth="sm">
    <Box sx={{ mt: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <Alert severity="warning" sx={{ width: '100%', mb: 3 }}>
        Votre compte n'a pas accès à cet espace.
      </Alert>

      <Typography variant="h5" sx={{ mb: 2 }}>
        Accès non autorisé
      </Typography>

      <Typography sx={{ mb: 1 }}>
        Si vous pensez que c'est une erreur, signalez-le à l'accueil de la salle : vos droits
        d'accès peuvent être ajustés par un administrateur.
      </Typography>

      {requiredRoles && requiredRoles.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 3 }}>
          Espace réservé à : {requiredRoles.join(', ')}.
        </Typography>
      )}

      {/* ⚠️ DEUX issues, et il en faut deux — voir l'invariant complété en tête de fichier.
          « Retour à l'accueil » suffit au cas courant (un compte qui a le rôle `client` mais
          pas `admin`, par exemple) : `/` le renverra vers son espace. Mais pour un compte
          SANS le rôle `client`, ce bouton ramène ici — Home pousse vers /client/screen, qui
          réaffiche cet écran. Un aller-retour, pas une boucle, mais la porte de sortie
          rouvrirait sur la même pièce. La déconnexion est l'issue qui marche dans tous les
          cas, pour toute combinaison de rôles présente ou future. */}
      <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button component={RouterLink} to="/" variant="outlined">
          Retour à l'accueil
        </Button>
        {/* Passe par services/logout.ts, jamais par un auth.signOut() nu : la purge
            d'IndexedDB et son ordre y sont, et c'est le seul point de sortie de l'app. */}
        <Button onClick={() => { void performLogout(); }} variant="contained" color="primary">
          Se déconnecter
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
        Si le retour à l'accueil vous ramène sur cet écran, déconnectez-vous : votre compte
        n'a accès à aucun espace pour le moment.
      </Typography>
    </Box>
  </Container>
);

export default AccessDenied;
