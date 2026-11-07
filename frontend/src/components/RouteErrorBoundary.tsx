import React from 'react';
import { Container, Box, Typography, Button, Alert } from '@mui/material';
import { performLogout } from '../services/logout';

interface Props {
  children: React.ReactNode;
}

interface State {
  erreur: Error | null;
}

/**
 * Page TERMINALE rendue à la place d'un écran qui a planté — au lieu d'un écran blanc.
 *
 * ─── POURQUOI (07/11/2026) ───────────────────────────────────────────────────────────────
 *
 * Le dépôt n'avait **aucun ErrorBoundary** et n'a **aucune route `*`** : une exception dans un
 * écran, ou un `import()` de route qui échoue, laissait une page **entièrement blanche, sans
 * la moindre sortie**. Et sur l'écran live TV, personne n'est là pour la voir tomber.
 *
 * Le chemin qui a rendu ce manque concret : après un déploiement `--only hosting`, un onglet
 * resté ouvert navigue vers un écran chargé à la demande dont le fragment n'existe plus
 * (`vite:preloadError`). Le garde de `main.tsx` recharge — mais il refuse de boucler, et il a
 * raison de refuser : quand recharger ne suffit pas, il faut **montrer quelque chose**.
 * Jusqu'ici, ce quelque chose était du blanc.
 *
 * ⚠️ INVARIANT REPRIS DE `AccessDenied.tsx`, et il a DEUX moitiés : **une page terminale ne
 * navigue nulle part, ET elle offre toujours une issue qui n'est pas elle-même une
 * redirection.** La première évite la boucle, la seconde évite de la remplacer par un
 * cul-de-sac. D'où les deux boutons, et d'où le fait que « Recharger » ne soit pas un
 * `<Navigate>` : c'est un vrai rechargement, qui va rechercher le bundle courant.
 *
 * ⚠️ **La déconnexion est l'issue qui marche dans tous les cas** (et elle passe par
 * `services/logout.ts`, jamais par un `auth.signOut()` nu : la purge d'IndexedDB et son ordre
 * y sont). Elle compte double ici : si l'écran plante à cause d'une donnée en cache périmée,
 * c'est précisément la purge qui le répare.
 *
 * ⚠️ **Et il JOURNALISE.** Un ErrorBoundary qui avale sans trace serait le `catch` vide que ce
 * dépôt poursuit depuis `docs/processus/PROCESSUS-erreurs-avalees.md`. Ici l'échec est
 * signalé deux fois : à l'écran (pour le visiteur) et dans la console (pour le diagnostic à
 * distance, l'utilisateur sachant faire une capture de console).
 *
 * 🔴 CE QU'IL NE FAIT PAS, et qu'il ne faut pas croire qu'il fait : il n'attrape **que** les
 * exceptions de rendu React des composants qu'il enveloppe. Une erreur dans un gestionnaire
 * d'événement, dans une promesse non rattrapée ou dans un `useEffect` asynchrone ne passe pas
 * par lui. Ce n'est pas une filet général, c'est la suppression de l'écran blanc de route.
 */
class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: React.ErrorInfo): void {
    // Journalisé pour le diagnostic ; l'écran, lui, SIGNALE (voir l'en-tête).
    console.error('Écran en échec, page de récupération affichée :', erreur, info.componentStack);
  }

  render(): React.ReactNode {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;

    // Un `import()` de route qui échoue a un message reconnaissable, et la conduite à tenir
    // n'est pas la même que pour un bug d'écran : dans ce cas-là, recharger suffit vraiment.
    const estFragmentManquant = /dynamically imported module|Importing a module script failed|Failed to fetch/i
      .test(erreur.message || '');

    return (
      <Container maxWidth="sm">
        <Box sx={{ mt: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Alert severity="warning" sx={{ width: '100%', mb: 3 }}>
            {estFragmentManquant
              ? "Cette page n'a pas pu se charger : l'application a été mise à jour pendant que "
                + 'cet onglet était ouvert.'
              : "Cette page a rencontré une erreur et n'a pas pu s'afficher."}
          </Alert>

          <Typography variant="h5" sx={{ mb: 2 }}>
            {estFragmentManquant ? 'Mise à jour nécessaire' : 'Écran indisponible'}
          </Typography>

          <Typography sx={{ mb: 1 }}>
            {estFragmentManquant
              ? 'Rechargez pour récupérer la version à jour. Vos validations déjà enregistrées '
                + 'ne sont pas perdues.'
              : 'Rechargez la page. Si le problème revient, déconnectez-vous puis reconnectez-vous : '
                + 'cela vide aussi les données gardées en mémoire sur cet appareil.'}
          </Typography>

          {/* ⚠️ DEUX issues, aucune n'étant une redirection — voir l'invariant en tête de
              fichier. « Recharger » est un vrai rechargement (il va rechercher le bundle
              courant) ; la déconnexion marche pour toute combinaison de rôles et purge
              IndexedDB au passage. */}
          <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="contained" onClick={() => window.location.reload()}>
              Recharger l'application
            </Button>
            <Button variant="outlined" onClick={() => { void performLogout(); }}>
              Se déconnecter
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 3, wordBreak: 'break-word' }}>
            Détail technique : {erreur.message || erreur.name || 'erreur sans message'}
          </Typography>
        </Box>
      </Container>
    );
  }
}

export default RouteErrorBoundary;
