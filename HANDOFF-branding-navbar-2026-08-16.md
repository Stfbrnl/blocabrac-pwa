# Handoff — Charte visuelle, version en Navbar, libellé mode (V2.40)

> Rédigé le 16/08/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur). Fait suite à `HANDOFF-scoring-modes-2026-08-15.md` et à
> `CONCEPTION-mode-ffme-et-garde-fou-reconciliation.md`/
> `ADDENDUM-mode-ffme-finale-annee.md` (mode FFME livré en V2.37-V2.39, la
> veille). Pas de `SUIVI-*.md` en amont cette fois : trois demandes directes
> et indépendantes de l'utilisateur dans la même session, pas un document que
> tu avais écrit.
>
> Déployé en production (https://blocabrac.web.app), commit `e2d4a60` sur
> `main` (hosting seulement — aucune règle Firestore touchée).

---

## Résumé en trois phrases

Trois demandes cosmétiques indépendantes traitées dans la même session :
renommer le libellé du mode de comptage "Blocabrac" (algorithme inchangé),
déplacer le repère de version + ajouter le logo dans la Navbar (au lieu de
"Mon espace personnel"), et aligner toute la charte visuelle de l'appli
(couleur + police) sur celle du vrai site vitrine de la salle
(`www.blocabrac.fr`), extraite directement de son CSS live plutôt que
devinée. Le "Topo Blocabrac" (PDF de présentation interne, à la racine du
dépôt) a été régénéré en même temps : contenu FFME remis à jour (il disait
encore "non retenu" alors que le mode a été livré la veille) et nouvelle
charte appliquée.

---

## 1. Libellé du mode de comptage "Blocabrac"

`AdminCompetitionManagement.tsx`, `scoringModeOptions` : le libellé affiché
passe de `"Blocabrac (barème habituel)"` à
`"Barème par couleur (essais comptabilisés)"`. **Aucun changement
d'algorithme, aucun changement de valeur stockée** — `scoring_mode` reste
littéralement `'blocabrac'` en base (voir `ScoringMode` dans
`climbingPoints.ts`), seul le texte visible par l'admin change. Raison :
"Blocabrac" est un nom maison qu'un nouveau membre du personnel ne connaît
pas encore ; le mode "Blocs validés" existant déjà avec un algorithme
différent, on ne pouvait pas réutiliser ce nom pour le renommage sans créer
de confusion entre les deux — verrouillé avec l'utilisateur avant d'écrire
le code (voir échanges de la session).

## 2. Repère de version + logo → Navbar

`components/Navbar.tsx` : le logo de la salle et le numéro de version
(`VX.XX`, `config/appVersion.ts`, avec la même info-bulle build/commit
qu'avant) sont maintenant affichés en permanence à côté de "BLOCABRAC", à la
fois dans la barre desktop et dans l'en-tête du menu mobile (Drawer) — plus
seulement sur "Mon espace personnel", pour ne plus alourdir son défilement
mobile. `ClientScreen.tsx` : bloc de version retiré proprement (imports
inutilisés nettoyés).

**Piège trouvé en testant visuellement (Playwright, capture d'écran) :** le
logo (`assets/logo-blocabrac.png`) est un visuel **blanc/transparent**,
invisible sur le fond blanc par défaut du Drawer mobile (il ne l'était pas
dans l'AppBar, bleue à l'époque). Corrigé en donnant à l'en-tête du Drawer
un fond `primary.main` — si un futur écran réutilise ce logo sur un fond
clair, même piège à prévoir.

## 3. Charte visuelle — extraite du vrai site (`www.blocabrac.fr`)

Le site vitrine existe déjà et a sa propre charte (Drupal, thème `bs_multi`),
jamais alignée avec l'appli jusqu'ici (l'appli utilisait le bleu par défaut
de MUI). Extraite directement du CSS live du site (`curl` + grep sur les
`@font-face`/couleurs hex les plus fréquentes dans ses feuilles de style,
pas devinée) :

- **Vert** `#27B142`, variante foncée `#177038` (dégradés de boutons du
  site).
- **Police "Dosis"** (Google Fonts, variable, poids 200-800).

Appliqué **en un seul point** : `context/ThemeModeContext.tsx`, le seul
appel à `createTheme(...)` de toute l'appli — `palette.primary` +
`typography.fontFamily` — ce qui propage automatiquement à tous les
boutons/liens/AppBar/focus sans toucher chaque écran individuellement.
Couleurs dans `config/gymConfig.ts` (`brandGreen`/`brandGreenDark`), pas
codées en dur dans `ThemeModeContext.tsx` lui-même.

**Police auto-hébergée**, pas un `<link>` vers `fonts.googleapis.com` :
`src/assets/fonts/dosis-variable-latin.woff2` (un seul fichier variable,
~30 Ko, couvre tous les poids utilisés), `@font-face` dans
`src/styles/fonts.css`, importé depuis `main.tsx`. Raison : l'app-shell PWA
doit rester utilisable hors-ligne après le premier chargement (voir la
section "Firestore persistent cache" de CLAUDE.md pour le même genre de
raisonnement côté données) — une police tierce chargée à chaque démarrage
casserait ça, et `vite.config.ts`'s workbox `globPatterns` a été étendu pour
inclure `woff2` afin que le fichier soit précaché comme le reste du shell
(sans ça, la police retomberait silencieusement sur la police système
hors-ligne après le premier chargement — bug silencieux, pas planté).
Sous-ensemble Google Fonts "latin" (`U+0000-00FF`) suffisant pour le
français (couvre é/è/à/ç/ù/etc.) — pas besoin de "latin-ext".

**`VITE_THEME_COLOR`** (`.env`) mis à jour de `#863bff` (violet, jamais
utilisé nulle part dans le thème MUI lui-même — juste la couleur de la barre
de statut mobile/l'icône du manifest PWA) vers le même vert. ⚠️ **Ce
réglage et le thème MUI sont deux choses séparées, lues à deux endroits
différents** (`vite.config.ts` pour le manifest PWA, `ThemeModeContext.tsx`
pour MUI) — un futur changement de couleur de marque doit toucher les deux,
rien ne les garde synchronisés automatiquement.

**Seul autre point de couleur codée en dur trouvé et corrigé :** le dégradé
de la carte "Ma progression" partageable (`ClientScreen.tsx`), qui était
bleu/violet (`#1976d2` → `#6a1b9a`, vestige du bleu MUI par défaut) sans
lien avec la marque — repeint dans le même vert/vert foncé.

**Non touché délibérément** (hors périmètre de la demande, mais même
défaut de branding) : `public/docs/aide-connexion-installation.html` (le
guide de connexion/installation servi aux clients depuis
`ClientHelp.tsx`) a sa propre feuille de style autonome avec
`--primary: #1976d2` codé en dur — toujours bleu, jamais reconnecté au
thème MUI ni à la nouvelle charte. Un futur chantier de cohérence visuelle
devra y penser.

## 4. Topo Blocabrac (PDF de présentation interne) régénéré

`topo-blocabrac.pdf` (racine du dépôt, guide interne équipe — 9 pages)
existait déjà en tant que fichier non versionné, généré par une session
précédente le 15/08 (probablement toi). Il était devenu **factuellement
faux** sur un point : sa page 06 disait encore que le mode "Officiel FFME"
était *"discuté, non retenu pour l'instant"*, alors qu'il a été livré la
veille (V2.37-V2.39). Régénéré avec :

- Le mode Officiel FFME décrit tel qu'il existe réellement (Finale de
  l'année, écran juge, pas de rotation à l'écran live, super-finale en cas
  d'égalité).
- Le nouveau libellé "Barème par couleur (essais comptabilisés)".
- Le nouvel emplacement du repère de version (Navbar, pas "Mon espace
  personnel").
- La nouvelle charte graphique (vert + Dosis).
- Une ligne "Écran juge (Finale de l'année)" ajoutée à la section Ouvreur,
  absente de la version précédente.

**Source HTML maintenant versionnée** : `topo-blocabrac-source.html`
(racine du dépôt, nouveau — n'existait pas avant cette session, la version
précédente du PDF n'avait apparemment aucune source trackée). Rendu en PDF
via Playwright (`page.pdf({format:'A4', printBackground:true})`), pas de
script npm dédié pour l'instant — commande manuelle documentée dans
l'historique de cette session si besoin de la refaire. Piège rencontré et
corrigé : sans `page-break-inside: avoid` sur les encadrés (`.warn`,
`.callout`), Chromium coupait un encadré en plein milieu à la limite d'une
page PDF — ajouté sur tous les blocs susceptibles de chevaucher une
coupure de page.

## 5. Fichiers modifiés (commit `e2d4a60`, 16 fichiers)

- `frontend/src/context/ThemeModeContext.tsx` : `palette.primary` +
  `typography.fontFamily`.
- `frontend/src/config/gymConfig.ts` : `brandGreen`/`brandGreenDark`.
- `frontend/src/styles/fonts.css` (nouveau), `frontend/src/assets/fonts/dosis-variable-latin.woff2` (nouveau) : police auto-hébergée.
- `frontend/src/main.tsx` : import du CSS de police.
- `frontend/vite.config.ts` : `globPatterns` étendu à `woff2`.
- `frontend/.env` : `VITE_THEME_COLOR`.
- `frontend/src/components/Navbar.tsx` : logo + version (AppBar + Drawer), fond de contraste du Drawer.
- `frontend/src/config/appVersion.ts` : commentaire mis à jour (nouvel emplacement).
- `frontend/src/pages/Client/ClientScreen.tsx` : retrait du bloc de version, dégradé de la carte de progression repeint en vert.
- `frontend/src/pages/AdminCompetitionManagement.tsx` : libellé du mode "blocabrac".
- `frontend/package.json`/`package-lock.json` : version → `2.40.0`.
- `topo-blocabrac.pdf`, `topo-blocabrac-source.html` (nouveau) : régénérés.
- `CLAUDE.md` : section "App version display" mise à jour, nouvelle section "Visual identity: matches the gym's real website".

Build/lint/`npm test` (106 tests) verts avant commit et déploiement.
Vérifié visuellement par capture d'écran Playwright (clair + sombre,
desktop + mobile + Drawer), et par lecture page par page du PDF régénéré
(via `pdftoppm`/lecture d'image) — pas de compte de test disponible pour
vérifier "Mon espace personnel" avec un vrai profil client connecté (pas
d'émulateur ni d'identifiants ici, l'app pointe sur Firebase de prod), mais
le retrait de code y est propre (plus de référence résiduelle).

## 6. Ce qui reste ouvert

- `public/docs/aide-connexion-installation.html` toujours en bleu
  `#1976d2` (section 3 ci-dessus) — pas retouché, hors périmètre de cette
  session.
- Pas de script npm dédié pour régénérer `topo-blocabrac.pdf` depuis sa
  source — à faire si ce document doit être mis à jour régulièrement plutôt
  qu'occasionnellement.
- Tout ce qui était déjà ouvert dans les handoffs précédents reste ouvert et
  inchangé par ce chantier (écran live TV pas encore testé matériellement en
  salle, multi-salles, stockage durable des sauvegardes d'images, réglement
  FFME exact du mode Officiel toujours non vérifié — voir
  `ADDENDUM-mode-ffme-finale-annee.md`).

Aucun bug fonctionnel trouvé en vérifiant ce chantier, à part le piège du
logo blanc sur fond blanc (section 2, corrigé avant commit) et le
chevauchement de page PDF (section 4, corrigé avant commit) — les deux
attrapés par vérification visuelle avant de committer, pas après coup.
