import React from 'react';
import { Container, Box, Typography, Button, Alert } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

/**
 * Écran TERMINAL d'accès refusé, rendu sur place par ProtectedRoute.
 *
 * ⚠️ INVARIANT À NE PAS CASSER : **une cible de redirection doit être une page terminale,
 * jamais une route qui redirige à son tour.** Ce composant ne redirige vers rien — il
 * n'affiche qu'un lien que l'utilisateur peut suivre lui-même.
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

      {/* Un lien, jamais une redirection automatique : c'est tout l'objet de cet écran. */}
      <Button component={RouterLink} to="/" variant="outlined" sx={{ mt: 2 }}>
        Retour à l'accueil
      </Button>
    </Box>
  </Container>
);

export default AccessDenied;
