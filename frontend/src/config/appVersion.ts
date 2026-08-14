// ✅ Numéro de version de l'app, injecté au build depuis package.json (voir
// vite.config.ts). Affiché dans "Mon espace personnel" (ClientScreen.tsx) pour
// que l'utilisateur puisse vérifier que la PWA a bien chargé le dernier
// déploiement, plutôt qu'une version mise en cache par le service worker.
//
// Convention : le champ "version" de package.json doit suivre le numéro donné
// en commit ("Application Sociale Blocabrac V2.XX" dans l'historique git) —
// le bumper à chaque commit versionné le fait apparaître automatiquement ici
// après le prochain build/déploiement.
export const appVersion = __APP_VERSION__;

// Affichage : "2.25.0" -> "V2.25" (le ".0" de patch, quasi toujours nul dans
// cette convention, n'apporte rien à l'affichage) ; "2.14.3" -> "V2.14.3" (un
// vrai correctif de patch reste visible).
export const formattedAppVersion = `V${appVersion.replace(/\.0$/, '')}`;
