// ✅ Numéro de version de l'app, injecté au build depuis package.json (voir
// vite.config.ts). Affiché dans la Navbar (components/Navbar.tsx), visible sur
// toutes les pages, pour que l'utilisateur puisse vérifier que la PWA a bien
// chargé le dernier déploiement, plutôt qu'une version mise en cache par le
// service worker. Auparavant affiché uniquement sur "Mon espace personnel"
// (ClientScreen.tsx) — déplacé pour ne plus alourdir son défilement mobile.
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

// ✅ Garde-fou en plus du numéro ci-dessus (voir SUIVI-remontages-et-version.md
// point 3) : le hash de commit + la date de build sont calculés automatiquement
// à chaque build, donc toujours exacts — contrairement au numéro de version,
// bumpé à la main et donc oubliable. Affichés en détail secondaire (info-bulle
// sur ClientScreen.tsx), jamais à la place du numéro de version demandé.
export const buildDetail = `Build ${__GIT_HASH__} — ${new Date(__BUILD_DATE__).toLocaleString('fr-FR')}`;
