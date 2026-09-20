# Plan — Nouvelles icônes PWA (V2.58)

> Rédigé le 06/09/2026 par la session Claude (navigateur), à la demande de l'utilisateur.
> À destination de Claude Code dans le Codespace.
>
> **Objectif** : remplacer les trois icônes PWA par des versions dérivées du logo de la
> salle, avec le vert de la charte, puis commiter, pousser et déployer en V2.58.
>
> **Aucun impact Firestore** : ni règle, ni index, ni quota. `--only hosting`.
>
> **Ce déploiement a une seconde utilité** : il sera le premier à suivre V2.57, donc
> **le premier à pouvoir déclencher le bandeau de mise à jour**. Voir §6 — c'est
> l'occasion de faire le test manuel resté ouvert.

---

## §1 — Les fichiers fournis

L'utilisateur a téléchargé un zip contenant trois PNG, produits à partir de
`src/assets/logo-blocabrac.png` :

| Fichier | Taille | Contenu |
|---|---|---|
| `maskable-512x512.png` | 512×512 | symbole 216×317 centré, couverture 62 % |
| `pwa-512x512.png` | 512×512 | symbole 251×368 centré, couverture 72 % |
| `pwa-192x192.png` | 192×192 | idem, réduit |

**Traitement appliqué à la source** (pour information, ne pas le refaire) :

- **Lettrage retiré** — « BLOCABRAC » vertical et « ESCALADE INDOOR » sont illisibles à
  48 px, et le format portrait 2:3 du verrouillage complet aurait réduit le symbole à une
  vignette. Seul le symbole (grande forme + deux éclats) est conservé.
- **Grain de texture nettoyé** — la trame du logo devient du bruit à petite taille.
  Composantes connexes < 1500 px supprimées.
- **Fond `#27B142`** (`brandGreen` de `gymConfig.ts`), symbole blanc centré.
- **Zone de sécurité maskable respectée** : demi-diagonale du symbole 192 px pour un rayon
  utile de 205 px (cercle de 80 %). Vérifié sous forme circulaire, carré arrondi et
  squircle — rien n'est rogné.

---

## §2 — ⚠️ Renommer les fichiers : ce n'est pas optionnel

Les fichiers de `frontend/public/` **ne portent pas de hash de build**, contrairement à
ceux de `assets/`. Le service worker les précache sous leur nom.

**Réutiliser les mêmes noms avec un contenu différent est exactement le cas qui reste
bloqué en cache** — et sur un projet qui vient de passer trois versions à traiter un
problème de cache PWA, ce serait dommage.

### À faire

1. Déposer les fichiers dans `frontend/public/icons/` sous de **nouveaux noms** portant un
   suffixe de version :
   - `maskable-512x512-v2.png`
   - `pwa-512x512-v2.png`
   - `pwa-192x192-v2.png`
2. **Supprimer les anciens fichiers** (`maskable-512x512.png`, `pwa-512x512.png`,
   `pwa-192x192.png`) — plus rien ne doit y faire référence.
3. Mettre à jour le tableau `icons` du manifeste dans `vite.config.ts` avec les nouveaux
   chemins. Conserver la structure existante (`sizes`, `type`, `purpose: 'maskable'` sur le
   seul fichier maskable).

⚠️ **Vérifier qu'aucun autre fichier ne référence les anciens noms** : `index.html`
(balises `<link rel="icon">` éventuelles), `includeAssets` de `VitePWA`, `ClientHelp.tsx`,
`aide-connexion-installation.html`, ou une capture d'écran de documentation. Un `grep` sur
`pwa-192`, `pwa-512` et `maskable` suffit.

---

## §3 — Aligner `background_color` du manifeste

Dans `vite.config.ts`, le manifeste porte encore `background_color: '#ffffff'` alors que
`theme_color` est passé au vert de la charte en V2.40.

`background_color` est la couleur de **l'écran de démarrage** de la PWA installée. Un
démarrage blanc suivi d'une application verte est une incohérence visible à chaque
lancement.

**À faire** : aligner sur `env.VITE_THEME_COLOR`, comme `theme_color`. Une ligne.

Rappel du piège documenté en V2.40 : `VITE_THEME_COLOR` (lu par `vite.config.ts` pour le
manifeste) et le thème MUI (`ThemeModeContext.tsx`) sont **deux réglages séparés que rien
ne garde synchronisés**. Ici on ne touche qu'au manifeste, donc pas de risque — mais ne pas
en profiter pour « harmoniser » l'autre sans y réfléchir.

---

## §4 — Vérifications avant commit

1. **`npm run build`** — le manifeste est généré au build, une référence à un fichier
   absent doit se voir ici.
2. **Inspecter `dist/manifest.webmanifest`** (ou le nom généré) : les trois chemins
   pointent bien vers les nouveaux fichiers, `background_color` est au vert.
3. **Vérifier que `dist/icons/` contient les trois nouveaux PNG** et plus les anciens.
4. **`npm run lint`** et **`npm test`** — aucune logique touchée, mais par discipline.
5. **Contrôle visuel** : ouvrir `maskable-512x512-v2.png` et confirmer que le symbole est
   centré sur fond vert, sans lettrage ni grain.

Pas d'e2e à écrire : une icône ne se teste pas automatiquement, et le rendu réel dépend du
lanceur Android.

---

## §5 — Commit, push, déploiement

- Bumper `package.json` : `2.57` → **`2.58`**.
- Commit : `Application Sociale Blocabrac V2.58` — nouvelles icônes PWA + alignement de
  `background_color`.
- Push sur `main`.
- **`npx firebase-tools deploy --only hosting`** — aucune règle Firestore ni index touché.
- Entrée `changelog.ts` pour V2.58 : courte, une ligne sur la nouvelle icône. C'est visible
  et sympathique à annoncer.
- Mettre à jour `CLAUDE.md` si une section décrit les assets PWA : noter la convention du
  **suffixe de version sur les fichiers de `public/`**, qui est la leçon durable de ce lot.

---

## §6 — À faire après le déploiement : le test du bandeau (V2.57)

**Ce déploiement est le premier qui suit V2.57**, donc le premier capable de déclencher le
bandeau de mise à jour. C'est l'occasion de fermer le point resté ouvert.

⚠️ **Nuance importante** : les clients encore sur **2.56.1** exécutent du code sans
intercepteur — ils seront rechargés d'office par leur ancien service worker, sans bandeau.
C'est attendu, pas un échec. Seuls les clients déjà passés en **2.57** verront le bandeau à
la transition vers 2.58.

**Protocole** (rappel du §5 de `PLAN-bandeau-mise-a-jour-pwa.md`) :

1. **Sur un poste déjà en 2.57** : recharger une fois. Le bandeau doit apparaître. Cliquer
   « Mettre à jour ». Vérifier que le repère de version en Navbar affiche 2.58 **sans avoir
   vidé le cache**.
2. **Sur Android, PWA installée en 2.57** : mettre en arrière-plan au moins 3 minutes (seuil
   retenu à l'implémentation), puis revenir au premier plan **sans fermer les onglets**. Le
   bandeau doit apparaître.
3. Vérifier que « Plus tard » referme le bandeau sans casser l'application.
4. Ouvrir l'écran TV et confirmer qu'**aucun bandeau n'y apparaît**.

L'étape 2 est celle qui valide le correctif — c'est le scénario fastidieux d'origine.

---

## §7 — Ce qu'il faut savoir sur la propagation des icônes

**L'icône est capturée à l'installation de la PWA.** Les grimpeurs qui ont déjà installé
l'application sur leur écran d'accueil **garderont l'ancienne icône** : ni le déploiement,
ni le bandeau de mise à jour, ni un rechargement ne la remplacent. Seule une
désinstallation-réinstallation le fait.

**Rien à coder pour ça** — c'est un comportement du système, pas un défaut. Mais autant le
savoir plutôt que de chercher pourquoi l'icône ne change pas. À mentionner éventuellement
dans l'entrée de changelog ou dans `ClientHelp.tsx` : « si vous avez déjà installé
l'application, réinstallez-la pour voir la nouvelle icône ».

**Contrôle recommandé avant de pousser** : passer `maskable-512x512-v2.png` sur
**maskable.app**, qui simule les découpes réelles des lanceurs. Les vérifications faites
côté conception couvrent le cercle, le carré arrondi et le squircle, mais certains lanceurs
constructeurs découpent plus agressivement.

---

## Points ouverts par ailleurs (inchangés)

- **Clic « Redémarrer la saison »** ~mi-septembre, après vérification du nombre de profils
  (28 attendus).
- **Surveiller le profil recalé de −190** au prochain passage mensuel de la réconciliation :
  une seconde dérive sur le même compte indiquerait un chemin d'écriture défaillant.
- **Sortir l'état ludique de `users`** — `PLAN-etat-ludique-hors-users.md`.
- Défis `fenetre` / `bloc_designe` : en production sans e2e navigateur.
- Chantier droits d'accès — en attente du gérant.
  `CONCEPTION-droits-acces-abonnements.md` toujours pas transmis au dépôt.
- `topo-blocabrac.pdf` sans la police Dosis ; `aide-connexion-installation.html` hors charte
  (`--primary: #1976d2` codé en dur).
- Un projet Firebase par salle vs mutualisé.
- Sauvegarde durable des images Cloudinary (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
