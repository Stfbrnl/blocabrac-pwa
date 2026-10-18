# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Blocabrac PWA: a French climbing-gym management app (Firebase project `blocabrac`, hosting at `blocabrac.web.app`). React + TypeScript + Vite + MUI frontend, no backend server — the frontend talks directly to Firestore/Auth, with all access control enforced in `firestore.rules`. There are no Cloud Functions.

## Commands

All commands run from `frontend/` (the actual app lives there, not at repo root):

```bash
npm run dev              # Vite dev server
npm run build            # tsc -b && vite build — always run before considering a change done
npm run lint             # eslint .
npm test                 # vitest run — fast unit tests (src/**/*.test.ts), no external deps
npm run test:watch       # vitest in watch mode
npm run test:rules       # Firestore security-rules tests, requires the Firebase emulator (needs Java)
```

- Run a single unit test file: `npx vitest run src/utils/climbingPoints.test.ts`
- `npm run test:rules` wraps `firebase-tools emulators:exec` around `vitest --config vitest.rules.config.ts` (tests live in `frontend/test/`, not `frontend/src/`) — this is why it's a separate npm script and a separate vitest config from `npm test`.
- Deploy from the repo root (not `frontend/`): `npx firebase-tools deploy --only hosting` or `--only firestore:rules` (or both) — `firebase.json` points hosting at `frontend/dist`. `firebase login` needs a real interactive terminal, not this CLI's sandboxed shell.
- ⚠️ **Rebuild *after* bumping `package.json`'s `version`, immediately before the hosting deploy — never deploy a `dist/` built before the bump.** `npm run build` embeds `__APP_VERSION__` as a literal string in the output; a `dist/` built earlier in a session still carries the *previous* version number no matter what `package.json` says when `firebase deploy` runs, since the deploy just uploads whatever is already in `frontend/dist`. Caught in V2.65 (17/09/2026): a session built, then bumped the version, then deployed the stale pre-bump `dist/` — the update banner correctly offered a new version (new file hashes, so the service worker did detect a change) but the Navbar still showed the old number after "Mettre à jour", confusing enough on its own to look like the banner mechanism was broken when it wasn't. If a deploy ever needs re-running after a late version bump, rebuild first — don't assume the existing `dist/` is current just because it built successfully earlier in the same session.
- Before a `firestore.indexes.json` deploy, diff it against what's actually live — it has drifted from prod before.

## Chantier documentation (`docs/`)

Per-chantier working documents used to sit at the repo root and had accumulated into 50+ files cluttering it; they were moved (via `git mv`, history preserved) into `docs/` in four subfolders, split by document nature:

- **`docs/handoffs/`** — end-of-chantier writeups: `HANDOFF-*.md`, `BILAN-*.md`, `RETOUR-*.md`, `RELECTURE-*.md`.
- **`docs/plans/`** — upfront design docs written before/during a chantier: `PLAN-*.md`, `CONCEPTION-*.md`, `ADDENDUM-*.md`.
- **`docs/suivi/`** — ongoing tracking logs: `SUIVI-*.md`.
- **`docs/processus/`** — process/fix writeups not tied to a single feature chantier: `PROCESSUS-*.md`, `CORRECTIF-*.md`, `CORRECTIONS-*.md`.
- **`docs/architecture/`** — le **récit** des systèmes de l'application, un fichier par domaine. Différent des quatre autres : ce ne sont pas des documents de chantier datés, mais la mémoire **vivante** de chaque système — pourquoi il est ainsi, quels incidents l'ont façonné, quelles idées ont été rejetées et pour quelle raison. **À mettre à jour quand le système change**, pas à archiver.

### Pourquoi `CLAUDE.md` est court et où est passé le reste

Ce fichier avait atteint ≈ 190 000 caractères pour une limite de 150 000, donc une troncature silencieuse du tiers le plus récent — c'est-à-dire du plus utile. Le 18/10/2026 il a été découpé **par nature, jamais par ancienneté** :

- **Reste ici** ce qui s'applique **sans condition** : les invariants, les ⚠️ courts, les interdits, les procédures (bump de version, déploiement), et les règles de méthode.
- **Part dans `docs/architecture/`** le *récit* : l'histoire, les incidents, les arbitrages, les chiffres de mesure, les variantes rejetées. Le texte n'a **pas été réécrit** : il y a été déplacé tel quel.

⚠️ **Chaque section d'architecture ci-dessous porte un lien 📖 en tête. C'est un déclencheur de lecture, pas une référence de courtoisie : avant de modifier le système décrit, lire son document.** Le résumé suffit pour *comprendre* ; il ne suffit pas pour *toucher*.

⚠️ **Et pour écrire ici** : une nouveauté s'ajoute à `CLAUDE.md` si elle s'applique sans condition, sinon elle enrichit le document d'architecture correspondant. Si ce fichier regrossit, c'est le signe que du récit s'y est réinstallé.

**Create any new document of these kinds directly in its matching subfolder** (e.g. a new handoff goes straight to `docs/handoffs/HANDOFF-<sujet>-<date>.md`), never at repo root. When citing one of these documents from code comments or from this file, reference it by its full path (`docs/plans/CONCEPTION-....md`), not by bare filename — the bare-filename citation style predates this reorganization and is what had to be corrected across the codebase when the move happened.

## Architecture

### ⚠️ Recotation : ce qui mesure se recalcule, ce qui a été proclamé se fige

Ce dépôt donne **trois réponses différentes** à la question « que devient un score quand on
recote un bloc après coup ? ». Ce n'est pas une divergence à corriger, c'est un choix par
collection — et faute de l'avoir écrit, deux écrans se sont retrouvés en désaccord sur laquelle
appliquer (18/10/2026, mini-compétitions : 80 points chez le moniteur, 900 chez l'élève).

| collection | ce qui est stocké | une recotation ultérieure… |
|---|---|---|
| `client_boulder_results` | **pas** la couleur | …réécrit rétroactivement le score |
| `client_course_results` | `boulderColor` **figée** à la validation | …ne change rien |
| `competition_rankings` | le **résultat entier** figé, immuable par les règles | …ne change rien |

Le principe qui justifie les trois (proposé par ClaudeNav, `docs/handoffs/RETOUR-seance-18-10.md` §3) :

> **Une recotation corrige une erreur de mesure. Elle corrige donc rétroactivement tout ce qui
> *mesure* une capacité, et jamais un résultat déjà *proclamé*.**

- le classement général **mesure** ce dont un grimpeur est capable aujourd'hui → il doit suivre
  la cotation corrigée → ne pas stocker la couleur est **juste** ;
- le classement d'une séance a été **proclamé** aux élèves présents ce soir-là → figer la
  couleur est **juste** ;
- le palmarès d'une compétition est proclamé avec une remise de prix → le figer entièrement et
  le rendre immuable est **juste**.

⚠️ **Critère opérationnel pour toute nouvelle fonctionnalité qui posera la question : ce nombre
sera-t-il annoncé à quelqu'un ?** Si oui, il se fige au moment de l'annonce. Sinon, il se
recalcule.

### Roles and the `roles` vs `role` field

Every account has a role set (`admin`, `ouvreur`, `moniteur`, `client` — combinable, e.g. a moniteur account is also always `client`). Current accounts store this as an array field `roles: string[]`; some legacy accounts still only have a scalar `role: string`. **Never query or check role by the scalar `role` field alone** — always merge both. The canonical patterns are:
- Firestore rules: `isUserRole(role)` in `firestore.rules` (checks `roles` array OR legacy `role` string).
- Frontend: `ProtectedRoute.tsx` and `Navbar.tsx` both merge `roles` + legacy `role` into a `Set` before checking access.
- Any new query that needs "all users with role X" must do the same two-branch merge (see `MessagesList.tsx` for the pattern: two `getDocs` calls, one `where('role','==',X)`, one `where('roles','array-contains',X)`, merged by doc id).

Every account is always guaranteed to have `client` in its roles (enforced in `AdminUsers.tsx` and mirrored server-side by `hasClientRole()` in rules) — the "client" area is not staff-exclusive-free, it hosts features (like "Potes de grimpe") open to everyone including staff.

### `age` vs `dateOfBirth` — a deliberately accepted legacy field, not a `role`/`role`s-style divergence

`users.dateOfBirth` (ISO date, collected at registration since V2.4x) is the only field any write path still populates; the older `users.age` (a number, frozen at whatever it was when entered — wrong as soon as the person has a birthday) is never written by current code anywhere in the app. `utils/ageCategory.ts`'s `getSeasonAge(dateOfBirth, legacyAge, referenceDate)` is the single place that derives an age — it prefers `dateOfBirth`, falling back to the legacy number only when a given account has never had a date entered. Every TypeScript `User`/`Participant`-shaped interface that reads this fallback names the field `legacyAge`, not `age` — the name itself is the warning not to write it, since it's read in repli only; the underlying Firestore field is still literally `age` (never renamed in the 11 legacy documents that still carry it, there is nothing to gain from a data migration that cannot reconstruct a birth date from a frozen age anyway). This is why it is *not* the same failure mode as the `role`/`roles` split above: that one had multiple write sites racing to keep two fields in sync; this one has exactly one direction of truth and zero remaining writers of the old field.

### Boulders: one collection, several lifecycles

📖 **Récit complet, incidents et raisons : [`docs/architecture/blocs.md`](docs/architecture/blocs.md) — à lire avant de toucher aux blocs.**

Toutes les voies vivent dans une seule collection `boulders`, discriminée par `type: 'daily' | 'competition'`.

> ⚠️ **Ne jamais supprimer un document `boulders`.** La désactivation (`is_active: false`) est le *seul* chemin de retrait. La monotonie des classements, `client_boulder_results`, `client_badges` et toutes les pages de stats en dépendent : une suppression dure ferait disparaître d'un coup chaque validation associée et ses points. Un bloc d'essai se désactive, il ne se supprime pas — même depuis la console Firebase.

- **`type: 'daily'`** : couleur (`color`) publique. `is_child_route` marque une voie « ouistiti » — elle existe sur toute la gamme de couleurs, ce n'est pas une couleur à part.
- **`type: 'competition'`** : cotation réelle dans `difficulty`, **cachée aux grimpeurs** pendant l'épreuve (« Mystère »).
- **Compétition régulière** : des blocs du jour réutilisés, qui restent `type: 'daily'` pour toujours et gagnent `competition_id` + `competition_active: true`. C'est `competition_active` qui distingue « membre actif de cette compétition » d'un bloc portant encore un ancien `competition_id`.
- ⚠️ **`competition_id` n'est jamais effacé** : toute page de stats reconstruit une compétition en interrogeant `competition_id` **seul**, sans filtre sur `type`.
- « Terminer la compétition » convertit les blocs `competition` en `daily` (la cotation cachée devient la couleur publique) et retire `competition_active` aux blocs du jour réutilisés. Le `status` de la compétition est une action d'admin **distincte**, que ce bouton ne touche jamais.

### Boulder images: Cloudinary, `image_public_id` first, `image_base64` as fallback

📖 **Récit complet : [`docs/architecture/blocs.md`](docs/architecture/blocs.md).**

- **`services/imageStorage.ts` est le seul fichier autorisé à importer ou appeler Cloudinary** (`uploadBoulderImage`, `getBoulderImageUrl`, `deleteUnconfirmedUpload`) — changer de prestataire ne doit réécrire que ce module.
- ⚠️ **Tout affichage d'image de bloc doit implémenter LES DEUX branches** : `image_public_id ? getBoulderImageUrl(...) : image_base64`. Un écran qui n'en teste qu'une affiche des images cassées pour l'autre sorte de bloc. `image_base64` n'est plus jamais écrit, mais reste lu.
- Les points d'annotation sont **cuits dans l'image** au moment de l'enregistrement (`canvas.toDataURL()`) ; le champ `annotations` n'est relu qu'à la ré-édition du même bloc, jamais pour superposer un calque à l'affichage. C'est pourquoi l'envoi à Cloudinary a lieu à la soumission, pas à la sélection du fichier.
- `scripts/cleanup-orphan-boulder-images.js` (mensuel, CI) : simulation par défaut, `--delete` pour agir, jamais une ressource de moins de 7 jours, et un garde-fou sur la chute du nombre de références. Il interroge `boulders` **sans aucun filtre** — un bloc désactivé garde son image pour les stats historiques.
- ⚠️ Ses fichiers d'état (`cleanup-state/`) sont **conscients de l'émulateur** : ils dérivent de `FIRESTORE_EMULATOR_HOST` et écrivent des `*.emulator.json` gitignorés quand il est posé.

### `competition_results` — written live, then locked

📖 **Récit complet : [`docs/architecture/competitions.md`](docs/architecture/competitions.md).**

`ClientCompetitions.tsx` écrit chaque validation **immédiatement** (`setDoc(..., {merge:true})`) plutôt que de la garder en état React jusqu'à la soumission : un onglet déchargé ou un rechargement ne doit jamais perdre une validation. Le clic réussi/échoué écrit tout de suite ; les champs ressaisis (essais, note, cotation proposée) sont débouncés ~800 ms. À l'ouverture de la fiche, les résultats existants sont **relus** pour repeupler l'interface — c'est cela qui rend un rechargement sûr, pas le débounce.

« Soumettre les résultats » est un **verrou**, pas un envoi : un `writeBatch` pose `submitted: true` sur tous les résultats de la compétition, et `firestore.rules` refuse ensuite toute écriture du client propriétaire. L'admin et l'ouvreur gardent un accès sans restriction. L'interface passe aussi en lecture seule, mais **c'est la règle serveur qui fait foi**.

### Firestore persistent cache (IndexedDB), the service worker, and the update banner

📖 **Récit complet (l'historique du bandeau, le défaut Android, les arbitrages) : [`docs/architecture/cache-et-service-worker.md`](docs/architecture/cache-et-service-worker.md).**

`firebaseConfig.ts` initialise Firestore avec `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`. ⚠️ **`persistentMultipleTabManager()` est obligatoire** : sans lui l'activation lève dès qu'un second onglet est ouvert, ce qui est exactement le montage TV de l'admin. La persistance est **désactivée de force** quand `MODE === 'test'` ou `VITE_USE_EMULATOR === 'true'` — les règles de sécurité ne sont pas rejouées sur une lecture en cache, et une entrée périmée pourrait masquer un vrai défaut de permissions.

⚠️ **IndexedDB est liée à l'origine du site, pas au compte connecté. `services/logout.ts`'s `performLogout()` est l'UNIQUE chemin de déconnexion** et impose l'ordre exact : `auth.signOut()` → `terminate(db)` → `clearIndexedDbPersistence(db)` → `window.location.reload()` (le rechargement est dans un `finally`). Tout nouveau point de sortie doit appeler cette fonction, jamais un `auth.signOut()` nu.

**Deux couches de cache indépendantes** se tiennent devant l'application : le service worker (coquille et fichiers statiques) et ce cache Firestore (données). Devant un écran figé, déterminer **laquelle** est en cause avant de soupçonner un bug : figé après un changement de donnée, c'est en général Firestore ; figé après un déploiement, c'est en général le service worker.

**Bandeau de mise à jour** (`components/UpdateBanner.tsx`, monté dans `main.tsx`) :
- **`registerType: 'prompt'`** : le nouveau service worker reste **en attente**, un *état* durable et non un événement fugitif — le bandeau lit `needRefresh` et trouve l'attente quel que soit le moment de son montage. « Mettre à jour » appelle `updateServiceWorker(true)`, qui active **et** recharge.
- **Contrepartie assumée, par conception** : plus rien ne force la mise à jour ; tant que personne ne clique, l'ancienne version continue d'être servie. Le repère de version dans la barre de navigation reste le diagnostic.
- ⚠️ **C'est le mode d'enregistrement de la version DÉPLOYÉE qui gouverne sa propre succession**, pas celui de la version qui arrive : un changement de mode ne prend effet qu'à la transition *suivante*. Ne pas conclure « le correctif ne marche pas » en testant la mauvaise transition.
- **Deux déclencheurs de `registration.update()` à conserver** : `visibilitychange` (après ≥ 3 min en arrière-plan) et un `setInterval` horaire. Quelques centaines d'octets réseau, **zéro lecture Firestore**.
- **Jamais rendu sur l'écran live TV.** Le garde `vite:preloadError` de `main.tsx` reste : il compte **plus** sous `prompt`, puisqu'une vieille version peut persister bien plus longtemps.
- **Vérifier le bandeau demande un essai manuel sur deux déploiements successifs** — un e2e ne peut pas simuler un déploiement intermédiaire, ne pas en écrire un.

### Mini-compétitions (moniteur) — a third, unrelated system

`mini_competitions` is a **separate collection**, not part of the boulders/competitions system above. A moniteur builds one by picking existing daily boulders (by wall/color), and it's referenced by id from a `courses` (séance) doc's `miniCompetitions: string[]` array — same shape as that doc's `exercises: string[]`. Results are written to `client_course_results` (the same collection exercises use) with `boulderId`/`boulderColor`/`miniCompetitionId` fields; `boulderColor` is snapshotted at validation time so a later re-grade doesn't retroactively change past scores. Ranking is computed client-side in `Moniteur/Stats/StatsList.tsx` from `climbingPoints.ts`.

### Course sessions (`courses` collection) and the scheduled/active/archived lifecycle

A `courses` doc (called "séance" in the UI) goes through `scheduled → active → archived`, driven by `activatedAt`/`archivedAt` timestamps (see `utils/courseSessionStatus.ts` for the client-side status derivation, mirrored server-side by `canValidateCourse()` in rules). Content (exercises, mini-compétitions) is only fetched/shown to clients once a session leaves `scheduled` — "objectifs visibles, contenu caché" until activation. Participants default to the whole group (`Participants: string[]`), with individual opt-out (`optedOut: string[]`) only allowed before activation.

### Cross-user visibility: the `classement_profiles` mirroring pattern

📖 **Récit complet : [`docs/architecture/classement-et-saison.md`](docs/architecture/classement-et-saison.md).**

Les règles ne laissent un client lire que son propre `users` : un client ne peut pas lister les résultats des autres. Partout où l'application doit montrer à un grimpeur une donnée dérivée d'un autre (classement, statut des potes), **c'est le grimpeur *source* qui recopie un petit résumé sur un document largement lisible, clé sur son propre uid** (`classement_profiles/{uid}`), calculé et écrit par lui-même à l'occasion de sa propre activité.

⚠️ **Réutiliser ce motif — ne jamais « résoudre » un besoin de visibilité croisée en élargissant les règles de lecture** sur `users` ou sur une collection de résultats.

⚠️ **Ne recopier que ce que le lecteur consomme réellement, jamais un champ entier « puisqu'il est déjà là ».** `classement_profiles` a porté quelque temps la `dateOfBirth` brute, recopiée par habitude, alors que son unique lecteur n'a jamais eu besoin que d'une catégorie d'âge dérivée — une exposition non forcée des dates de naissance de mineurs à tout compte authentifié. Corrigé en écrivant la chaîne `ffmeCategory` à la place. **Avant d'ajouter un champ à un document miroir, demander ce dont le lecteur a besoin, pas ce que le document source contient.**

### `classement_profiles`: incremental counter, never a full-history recompute

📖 **Récit complet, incidents et détail du script : [`docs/architecture/classement-et-saison.md`](docs/architecture/classement-et-saison.md).**

Les champs de score sont entretenus **de façon incrémentale** par `ClientDaily.tsx` : une validation ne lit que son propre état antérieur (un `getDoc` sur `client_boulder_results/{uid}_{boulderId}`, identifiant déterministe) et applique un delta dans un `runTransaction` — **jamais un `getDocs` sur tout l'historique**, dont le coût grandissait sans borne avec l'âge du compte.

- **`colorCounts` est l'unique source de vérité** : `bouldersValidated` et `bestColorRank` en sont *dérivés* (`summaryFromColorCounts`), jamais incrémentés séparément — une seule origine possible de dérive.
- La couleur qui compte est la couleur **courante** du bloc (`colorById`) : `client_boulder_results` n'en stocke aucune.
- Un bloc désactivé sort de `colorById`, donc sa contribution **gèle** dans le compteur ; la réconciliation en fait autant depuis V2.56 — **les deux compteurs (général et saison) sont des accumulateurs : une validation d'un bloc retiré compte toujours**, à sa dernière couleur connue.
- ⚠️ **Recoter un bloc déjà validé réécrit rétroactivement le score de tous ceux qui l'ont validé.** Une recotation est donc une **opération de classement, pas une modification de formulaire** : hors saison en cours, réconciliation en simulation d'abord (vérifier que la dérive touche *exactement* les grimpeurs concernés), puis annonce dans le changelog. Surveiller un risque précis : un grimpeur dont la meilleure couleur était l'ancienne gagne une couleur supérieure, donc un badge automatique, donc un **niveau** — qui pilote les missions et la Roulette. À vérifier avant, pas après.

**`scripts/reconcile-classement-profiles.js`** est le filet non optionnel de ce compteur : il recalcule l'attendu depuis `client_boulder_results` pour **tout compte de `users`** (pas seulement ceux qui ont déjà un profil). Simulation par défaut, `--fix` pour écrire, `--uid` pour un seul compte. Mensuel via GitHub Actions.
- **Garde de dérive** : `--fix` s'interrompt sans rien écrire, en échec visible, si la dérive touche plus de 30 % des comptes **et** au moins 3 — parce que « une dérive est corrective par construction » ne vaut que pour une vraie dérive de données, pas pour un bug du recalcul lui-même. `--force` passe outre explicitement ; `--uid` en est exempté.
- ⚠️ **Journal jamais partagé avec l'émulateur** : le chemin dérive de `FIRESTORE_EMULATOR_HOST`. Même garde étendue aux fichiers d'état de `cleanup-orphan-boulder-images.js`.
- ⚠️ **« Une simulation n'écrit rien, nulle part. »** Le journal n'est écrit que sous `--fix` ; une simulation imprime son détail à la console. La garde émulateur couvrait « mauvaise cible », pas « bonne cible, mauvais mode » — une simple simulation contre la prod a détruit le journal du cron mensuel.

### Seasonal classement (`season.*`) and the end-of-season Finale — a second counter

📖 **Récit complet (calendrier, redémarrage V2.56, clôture, roster, textes de la Finale à remettre) : [`docs/architecture/classement-et-saison.md`](docs/architecture/classement-et-saison.md). À lire avant toute intervention sur la saison.**

`classement_profiles/{uid}.season.{colorCounts,score}` est un **deuxième compteur incrémental indépendant**, ajouté à côté du général et non à sa place : le général suit une progression personnelle pour toujours, la saison sert à déterminer qui se qualifie pour la « Finale de l'année » et a donc besoin d'une fenêtre bornée.

- **La fenêtre est une donnée d'admin, jamais codée en dur** : `app_config/classement_saison` (`debut`/`fin`/`cloturee`), éditée dans `AdminSeasonConfig.tsx`. `ClientDaily.tsx` la lit **une fois au montage** (jamais par validation) et n'applique le delta de saison que si la date tombe dedans. Hors fenêtre, seul le compteur général bouge.
- **Calendrier retenu** : 1er novembre → 31 mai, juin réservé à la Finale. `seasonPhase(config, todayISO)` (pur, testé) rend `'aucune' | 'a_venir' | 'en_cours' | 'terminee'` — une fenêtre enregistrée des semaines à l'avance est un état normal, pas un tableau de zéros.
- ⚠️ **« Enregistrer » et « Redémarrer la saison » ne sont pas deux façons d'ouvrir une saison.** `recomputeSeasonBaseline` **ignore les dates** : « Redémarrer » crédite à chacun **tout son historique** de réussites, et ne donne jamais zéro. Une saison où tout le monde part de zéro s'ouvre avec **« Enregistrer »**.
- ⚠️ **Une saison à zéro a quand même une base de zéro** : la réconciliation saute `season.*` tant que `season.baseScore` est *absent* (0 est une base valide). « Enregistrer » et le flush partagé posent cette base zéro via `seasonZeroBasePatch`.
- **L'intersaison (juin → octobre) est un état légitime, pas une erreur** : `RECONFIGURATION_GRACE_DAYS` vaut **150**, pour qu'aucun rouge quotidien n'apprenne à tout le monde à ignorer les rouges. Le workflow échoue vers le 29 octobre si la fenêtre suivante n'est toujours pas enregistrée. **Ce nombre est lié au départ au 1er novembre : le raccourcir si la saison commence plus tôt.**
- **`classementOptIn` conditionne aussi la qualification**, pas seulement l'affichage public : refuser le classement public, c'est refuser la Finale. Décidé explicitement.
- ⚠️ **Les textes annonçant la Finale aux grimpeurs sont retirés** jusqu'à confirmation de sa faisabilité (décision du 25/09/2026). La **machinerie** est intacte. Les trois textes exacts à remettre, et le pas d'e2e à inverser ce jour-là, sont listés dans le document d'architecture.
- **La clôture** (`scripts/compute-classement-saison.js`, cron quotidien) : simulation par défaut, `--fix` pour agir — c'est le plus destructeur des trois scripts de maintenance. Il **archive d'abord** (`classement_saisons/{"YYYY-YYYY"}`, top 10 par genre, ex æquo au seuil tous inclus), pose `cloturee: true`, et **seulement ensuite** remet `season.*` à zéro. Jamais l'inverse : une remise à zéro prématurée est une perte de données irrécupérable.
- **`cloturee` est le garde qui empêche la réconciliation mensuelle de défaire la remise à zéro** : tant qu'il vaut `true`, la réconciliation saute `season.*` (et seulement lui). Reconfigurer la fenêtre l'efface et la réactive.
- **`client_boulder_results.createdAt` est immuable** (repris tel quel à chaque écriture par `resolvePreviousResultState`, `updatedAt` seul bouge) : c'est lui qui décide à quelle saison appartient une validation ancienne. Ce fut un prérequis, pas un chantier annexe.
- **La génération du roster est une action manuelle d'admin**, pas un automatisme : elle trie les identifiants `"YYYY-YYYY"` côté client (Firestore refuse `orderBy('__name__', 'desc')`) et crée les `competition_participants` manquants avec `?? null` sur chaque champ facultatif (`setDoc` lève sur `undefined`, pas sur `null`).

### Points scoring

`utils/climbingPoints.ts` (`calculatePoints`, `basePoints`, `deductions`) is the single shared scoring function for daily classement (`utils/classementScore.ts`) and mini-compétition classement. It scores by color string (`jaune` through `rose`), degressive by attempt count. Real "grosse compétition" boulders never use `jaune` in practice (beginner-only) even though the picker still lists it — that's intentional gym policy, not a bug. **The annual classement (`classementScore.ts`) always uses `calculatePoints` and nothing else — it has no concept of `scoring_mode` and never will**, see below.

### `competition_participants` — one builder, three callers, and the identity it denormalizes

📖 **Récit complet et incident fondateur : [`docs/architecture/competitions.md`](docs/architecture/competitions.md).**

⚠️ **`buildCompetitionParticipant` (`utils/competitionParticipant.ts`) est le seul endroit où ce document se compose**, et `competitionParticipantId` le seul où se construit son identifiant déterministe (`${uid}_${competitionId}`, dont `firestore.rules` dépend pour un `get()` bon marché). Trois chemins créent une inscription — l'ajout manuel de l'admin, « Générer le roster », et **l'auto-inscription du grimpeur, qui est le chemin NORMAL dans cette salle**. **Tout nouveau chemin d'inscription doit passer par ce constructeur.** C'est la troisième occurrence dans ce projet de « un document, plusieurs rédacteurs, des contrats divergents », après `role`/`roles[]` et l'état ludique.

- **`?? null` sur chaque champ facultatif, jamais `undefined`** — Firestore refuse `undefined` dans un `setDoc`, et l'échec surgit pendant qu'on inscrit quelqu'un, dans la salle, devant lui. `null` est un état légitime ; **une chaîne vide ne l'est pas** et c'est elle qui a causé le défaut d'origine : `null` veut dire « absent » et laisse le repli faire son travail, `''` prétend porter une valeur.
- **`is_client` fusionne `roles` et le scalaire hérité `role`**, avec un repli à `true` quand aucun rôle n'est lisible.
- **Le verrou (`submitted`) n'est délibérément PAS routé par le constructeur** : ce n'est pas une création et il ne touche aucun champ d'identité. Il utilise l'aide à l'identifiant.
- Garanti par un **test de propriété** (les 256 combinaisons de présence/absence), pas par trois cas par chemin : trois tests resteraient verts le jour où quelqu'un ajoute un quatrième chemin.
- L'inscription est ouverte sur une compétition **à venir** *ou* **en cours** (retardataires), jamais terminée/annulée. Le libellé du bouton se lit depuis **les inscriptions de ce grimpeur-là**, jamais depuis le compteur global.

### Announcement texts published to climbers — composed in a pure function, never inline

⚠️ **Tout artefact destiné à sortir de l'application se compose dans une fonction pure, jamais en ligne dans un composant.** La couverture de tests du dépôt s'arrête au bord des fichiers `.tsx` (pas de harnais React) : ce qui y est composé en ligne est **structurellement invisible** — et c'est exactement là que sont nés deux défauts, dont une annonce de classement qui numérotait `1, 2, 3` quand les tableaux affichaient déjà `1, 1, 3`, dans le seul mode où une égalité parfaite en tête est un cas attendu.

`utils/competitionAnnouncement.ts` compose ces textes, et ses tests affirment la propriété qui survit à un changement de format : **les rangs du message sont ceux de l'écran**, section par section — pas que le texte « a l'air bon ». Pas de markdown (`**gras**`) : `AnnouncementBanner.tsx` rend du texte brut.

### Le palmarès gelé, et les règles qu'il a produites (V2.74)

📖 **Récit complet : [`docs/architecture/competitions.md`](docs/architecture/competitions.md).**

> ⚠️ **Un palmarès est un fait daté, pas une requête.** Un résultat calculé à la lecture change quand la donnée change — et ici elle change : une recotation réécrit l'histoire de tous ceux qui ont validé le bloc. Un score qui bouge abîme la confiance ; un podium qui bouge la détruit. D'où `competition_rankings`, **immuable par les règles** (`allow update, delete: if false` pour tout le monde, l'admin compris).

> ⚠️ **Tout artefact dont le calcul doit rester unique se compose dans l'application, jamais dans un script.** Le calcul vit en TypeScript dans `frontend/src/utils/` et n'est pas atteignable depuis un script CommonJS. Le réimplémenter fabriquerait une cinquième divergence.

> ⚠️ **Un script de correction n'a pas besoin de recalculer : chercher d'abord le geste qui SUPPRIME, avant d'envisager un outil de compilation.** `unpublish-competition-rankings.js` supprime, et l'application republie avec l'unique calcul.

> ⚠️ **Tronquer à l'affichage protège l'écran ; tronquer à l'écriture protège la donnée.** Le document est lisible par tout compte authentifié **et** immuable : le nom y entre déjà tronqué, la catégorie d'âge remplace la date, et l'assertion de confidentialité porte sur le **document écrit**, jamais sur le DOM.

⚠️ **Un critère d'égalité doit nommer ce qui, lui, doit DIFFÉRER** — sinon il est satisfait par le cas dégénéré où l'on compare la chose à elle-même. Symétrique exact de la règle « un critère de sortie doit prédire *toutes* les grandeurs observables, y compris celles dont on n'attend aucun mouvement » : **un critère qui ne nomme qu'une moitié de l'attendu se laisse satisfaire par la mauvaise.**

⚠️ **Un critère de rang ne discrimine que sur les dimensions que les critères antérieurs n'épuisent pas** : proposer comme critère suivant un **agrégat** de grandeurs que le précédent compare déjà terme à terme ne peut jamais trancher.

⚠️ **Une publication immuable mérite une confirmation, pas un avertissement.** Ailleurs un avertissement ignoré se répare ; ici il ne se répare qu'avec la clé de service. Et celui qui clique le soir d'un contest n'aura lu aucun document : **un clic survit à ce contexte, une bannière non.** D'où l'interrupteur « Je publie quand même », remis à zéro à chaque ouverture de l'aperçu.

**Une partition par `max(A, B)` ne rend pas A constant à l'intérieur d'une part : elle le majore.** Le classement par niveau max partitionne par `max(niveau de départ, couleur réussie)` : la couleur n'y est constante que pour les grimpeurs arrivés par leur performance.

⚠️ **Le mode `officiel` n'est pas gelable** et la publication le **refuse** (`isScoringModeGelable`). Le jour où la Finale est confirmée, c'est dans `utils/competitionRankings.ts` qu'il faudra l'implémenter, jamais dans l'écran d'administration.

⚠️ **Le critère de départage ultime** — le moins d'essais au total, échecs compris — **ne s'applique QUE si les deux grimpeurs ont réussi quelque chose.** Sans cette garde, en début d'épreuve, celui qui n'avait rien tenté passait devant celui qui avait essayé et échoué, sur l'écran projeté. Sa variante « essais sur les blocs réussis » a été évaluée et **rejetée comme no-op** : à ex æquo réel, les essais sont déjà égaux bloc par bloc.

### Competition scoring modes (`scoring_mode`) — competitions only, never the annual classement

📖 **Récit complet (les quatre modes en détail, le mode officiel, l'écran live, la Finale) : [`docs/architecture/competitions.md`](docs/architecture/competitions.md).**

Une compétition choisit un mode de comptage parmi quatre, stocké dans `competitions.scoring_mode` (défaut `'blocabrac'`). Trois sont **à points** et passent par `calculateCompetitionPoints` — une fonction **distincte** de `calculatePoints`, jamais appelée par `classementScore.ts` : **ce réglage ne peut pas fuir dans le classement annuel, par construction**.

- **`blocabrac`** : le barème classique, dégressif aux essais.
- **`blocs_valides`** : chaque bloc porte son `points_value`, acquis en entier à la réussite. ⚠️ Sur un **bloc du jour réutilisé**, ce champ est **effacé** (`deleteField()`) dès qu'il quitte la compétition — le même bloc physique peut resservir ailleurs avec un autre mode.
- **`personnalise`** : barème propre à cette compétition (`competitions.custom_scoring`).
- **`officiel`** (style FFME/IFSC) : **pas une somme de points, un tri** — tops, puis zones, puis essais au top, puis essais à la zone (`compareOfficialTotals`). ⚠️ **Cet ordre vient d'une connaissance générale IFSC, pas d'une lecture du règlement FFME en vigueur : à vérifier avant de s'en servir pour trancher une vraie compétition.** Version **simplifiée** assumée (cumul sur toute l'épreuve), pas le « classement de classements » de l'IFSC. Les **égalités sont l'état normal**, pas un cas limite : `rankOfficialEntries` (1, 1, 3) est utilisé partout où ce mode affiche une position.
  - **La cohérence des saisies est imposée à l'entrée**, jamais après coup : `utils/competitionValidation.ts`'s `applyCompetitionValidationUpdate` (pure, testée) — un top force la zone, décocher la zone annule le top, les essais à la zone sont bornés par les essais au top.
  - **Saisie par un juge** (`pages/CompetitionJudgeEntry.tsx`), pas par auto-déclaration : même document, même débounce, aucun changement de schéma ni de règles. Verrouillage tout-ou-rien.
  - **Une égalité parfaite en tête se tranche par une super-finale**, pas par un titre partagé — sans code dédié : on ajoute un bloc de plus à la même compétition.

⚠️ **`AdminCompetitionLiveDisplay.tsx` est le seul des trois écrans de classement qui PAGINE, et le seul que personne ne regarde.** La page 1 est `slice(0, 10)` et ses rangs sont calculés **sur la tranche** — correct uniquement parce que c'est un *préfixe* ; paginer 11-20 redémarrerait silencieusement chaque page à 1. Le dépôt n'a **aucun ErrorBoundary** : une exception y est un écran blanc que personne ne voit tomber. `test/e2e-live-display-flow.mjs` est le filet, et ses deux propriétés ont chacune été vues rouges **séparément** — aucune ne remplace l'autre.

Comme `liveDisplayEnabled`, `scoring_mode`/`custom_scoring` sont **verrouillés côté serveur** dès que la compétition quitte `status: 'à venir'` : changer le mode en cours d'épreuve changerait rétroactivement le score de tout le monde.

### Bloc Roulette — a free, stateless daily-challenge draw

📖 **Récit complet (le catalogue, les familles, les traversées, les bornes de niveau) : [`docs/architecture/jeu-et-missions.md`](docs/architecture/jeu-et-missions.md).**

`utils/roulette.ts` tire une proposition dans un catalogue fixe, plus une « roulette de la mort » à part.

- ⚠️ **Le module n'importe RIEN de Firestore**, et c'est la propriété qui rend la fonction gratuite : le tirage et le « relancer » ne coûtent ni lecture ni écriture. Tout ce dont il a besoin est déjà en mémoire. À préserver à chaque modification.
- **Pondération par niveau** : max−1 (~70 %), max (~20 %), max+1 (~10 %), avec plancher et plafond ; `levelExcludedE` empêche la famille E (« réussite partielle ») d'apparaître à quelqu'un déjà au sommet.
- **La famille E n'écrit jamais dans `client_boulder_results`** : sur un bloc max+1 la proposition ne demande qu'une tentative partielle, et l'écrire corromprait classement, badges et niveau automatique.
- **« J'ai relevé le défi »** fait **une** écriture sur `user_ludic_state` (compteur + liste des 10 derniers), **zéro lecture supplémentaire**, et **jamais** `client_boulder_results`. Pas d'interface optimiste : le compteur visible ne bouge qu'après résolution de l'écriture.
- ⚠️ **Ce compteur est 100 % déclaratif, pour toutes les familles. Il ne doit JAMAIS devenir l'entrée de quoi que ce soit de dérivé** (badge, niveau, contribution au classement) : un badge « 10 défis relevés » serait auto-attribuable en dix clics et rouvrirait par le côté ce que l'invariant de la famille E ferme. Affichage seulement, pour toujours.
- **La « roulette de la mort »** est toujours max+1 **sans repli** : elle renvoie `null` plutôt que de rebasculer silencieusement sur max, puisque sa rareté est tout son intérêt.
- **Le filtre « déjà validé » est limité à la session**, pas à l'historique complet — choix délibéré pour garder le tirage gratuit. ⚠️ **Le texte du catalogue ne doit jamais promettre plus que ce mécanisme ne peut tenir** : écrire « pas encore fait aujourd'hui », jamais « jamais validé ».
- **L'anti-lassitude vit dans `localStorage`**, lu/écrit par `ClientDaily.tsx` autour de l'appel : `roulette.ts` reste une fonction pure de ses entrées, donc trivialement testable avec un `rng` injecté.
- **`wallCounts`** (compteur par mur, dans `user_ludic_state`) alimente la famille « murs délaissés ». **Délibérément sans script de réconciliation**, contrairement à `colorCounts` : c'est un champ privé et purement ludique, dont aucune dérive n'est un problème d'intégrité.
- L'ordre du tableau `walls` de `config/gymConfig.ts` suit le **circuit physique réel** de la salle, pas l'ordre d'ajout historique.
- **Document de référence du staff** : `topo-roulettes-defis-source.html` → `npm run topo:roulettes`. À resynchroniser dès qu'une entrée du catalogue, une borne de niveau ou une règle de défi change.

### L'état ludique hors de `users` (`user_ludic_state`)

📖 **Récit complet (la migration, ses passes, la mesure, les scripts) : [`docs/architecture/etat-ludique.md`](docs/architecture/etat-ludique.md).**

⚠️ **`users/{uid}` est lu EN ENTIER par chaque écran du staff** (`getDocs(collection(db, 'users'))`, sans filtre), et le SDK client **n'a pas de projection de champs**. N'y mettre que des champs d'identité et de droits : nom, rôle, niveau, date de naissance, inscriptions. **Tout état propre à un utilisateur — compteur, préférence, historique d'affichage — va dans `user_ludic_state/{uid}`**, lu et écrit par son seul propriétaire.

- **`services/ludicState.ts` est le seul fichier qui lit ou écrit cette collection**, même discipline que `imageStorage.ts` pour Cloudinary. `firestore.rules` l'ouvre au propriétaire seul.
- **Déploiement terminé (03/10/2026)** : plus aucune copie héritée en production.
- 🔴 **`scripts/backfill-ludic-state.js --fix` ne doit PAS être relancé.** « Sans danger par construction » était faux et le suivre détruirait des données : le durcissement protège contre l'écrasement d'une valeur plus récente, pas contre le **remplissage d'un champ que le grimpeur a délibérément supprimé** — une absence et un champ jamais migré sont indiscernables, il n'y a pas de pierre tombale.
- **Ordre correct pour qui finirait ce travail** : lancer d'abord la **simulation** de la purge, traiter tout avertissement « jamais migré » comme *à investiguer*, jamais comme *lancer le backfill*. Pour un champ supprimé en aval, la vérité est l'absence : il faut le purger, via la dérogation explicite `purge-legacy-ludic-fields.js --purge-unmigrated <uid>.<champ>` — **délibérément sans forme en masse**, parce que le jugement qu'elle encode ne se fait que compte par compte.
- Le script distingue les deux cas qu'il confondait : **aucun document `user_ludic_state`** est un « jamais migré » certain (refusé, sans suggestion de dérogation) ; **un document vivant auquel ce seul champ manque** est le cas ambigu, rapporté avec son `updated_at`.

### Défis entre potes — a `challenges` collection, built on Bloc Roulette's counters

📖 **Récit complet, incidents et détail des quatre structures : [`docs/architecture/jeu-et-missions.md`](docs/architecture/jeu-et-missions.md).**

`utils/challenges.ts` est un petit module pur (gagnant et progression seulement, aucun import Firestore) derrière une collection `challenges/{id}` : 2 à 6 amis, quatre structures (`seuil`/`fenetre`/`bloc_designe`/`declaratif`).

- **`progress` est un champ map unique sur le document**, jamais une sous-collection : ⚠️ **c'est le plafond de 6 participants qui rend la limite d'écriture par document sans objet — ne jamais le relever sans revoir le modèle.**
- **Aucune notification poussée nulle part dans cette application** : un défi se découvre en ouvrant « Potes de grimpe ». Pas d'étape d'acceptation par défi — le consentement, c'est d'être déjà amis.
- **Même discipline de compteur incrémental** que `classement_profiles` : les défis actifs sont chargés **une fois** au montage et gardés en mémoire, jamais réinterrogés par validation.
- ⚠️ **Le flush débouncé exécute DEUX transactions successives, et non une seule** : ① `classement_profiles` + `user_ludic_state` (score, murs, missions — ce qui ne peut pas être perdu), puis ② `challenges.progress` seul, dont l'échec est journalisé et ne va pas plus loin. **La progression d'un défi est un bonus ; le score d'un grimpeur ne l'est pas**, et partager une transaction faisait mourir le second avec le premier — en production, sur de vraies validations. L'échec de la seconde n'est **pas** relancé : remettre en file ferait réappliquer un delta de classement déjà écrit.
- ⚠️ **Une transaction Firestore exige que TOUS les `tx.get()` précèdent la première écriture, sur l'ENSEMBLE de la transaction** — pas document par document. Toute addition à cette transaction doit préserver l'ordre « lectures, puis écritures ».
- ⚠️ **Aucune écriture ne reconstruit un document depuis l'état en mémoire** : ou bien le document a été lu dans la même transaction, ou bien l'écriture est additive par construction (`increment`, `arrayUnion`, chemins pointés), ou bien elle est refusée.
- ⚠️ **Un test ne doit jamais créer la donnée dont il teste l'existence. Si le livrable est un document de production, le contrôle doit le lire là où il vit.** Quatre fois ce projet a connu la même forme d'échec, où tout avait l'air d'aller : un `catch` qui avalait, un état React juste pendant que Firestore était corrompu, un test de règles qui semait son propre badge, et une validation visible pendant que le compteur était refusé. **Ce qui rassure est une fois de plus ce qui trompe.**
- ⚠️ **Un échec journalisé n'est pas un échec signalé.** Si une panne peut rester invisible au grimpeur pendant que sa donnée n'est pas enregistrée, elle doit apparaître dans l'interface, pas seulement dans la console. Corollaire, plus important que la règle : ***« Une escalade qui ne compte que les échecs consécutifs ne peut pas se déclencher sur un échec sélectif. »*** Rien ne réessayait, et une validation réussie entre-temps remettait le compteur à zéro ; le hook réarme désormais son minuteur.
- **La clôture est une action de consultation, sans cron** : `fenetre` se clôt elle-même à la première ouverture après son terme ; `seuil`/`bloc_designe` offrent un bouton à **n'importe quel** participant. Les règles imposent une clôture à un coup et bornée aux champs : une écriture touche `progress` (et seulement la clé de l'appelant, via un `diff()` **imbriqué**) **ou** `status`+`winner_uid`, jamais les deux.
- **Suppression par le créateur**, à tout moment. ⚠️ Sa sûreté en vol était **fausse** jusqu'au 02/10/2026 : sur un document supprimé `resource` est nul, donc la règle de lecture **plantait**, ce qui arrive au client en `permission-denied` et faisait échouer toute la transaction partagée. Corrigé des deux côtés (`resource == null ||` dans la règle, et la sortie du défi de la transaction partagée), avec deux tests de règles permanents. ⚠️ Et comme les défis sont chargés **cache-first**, un défi supprimé sur un autre appareil survit dans l'IndexedDB locale.
- **Pas de script de réconciliation**, comme `wallCounts` : enjeux faibles, documents de courte vie. ⚠️ Position **affaiblie** depuis que `challenges.progress` est un compteur incrémental **à la fois** sans filet **et** à échec silencieux : à revoir avant que quoi que ce soit n'en dérive une conséquence.

**`scripts/audit-prod-catalog.js`** (lecture seule, code de sortie ≠ 0 en erreur) contrôle la prod contre les **contrats** que le code suppose — aucun identifiant de badge n'est codé en dur, l'attribution se fait par `type`. Il vérifie aussi les **références mortes** entre collections. ⚠️ **Une référence ne peut pas être auditée côté serveur, et c'est justement celle qui a cassé** : le défi actif d'un grimpeur n'est stocké nulle part, il est reconstruit depuis le cache du navigateur. Ne pas laisser le vert de cet audit laisser croire que cette classe de défaut est couverte. **Tout chantier qui dépend d'un document de catalogue ou de configuration a une étape de déploiement explicite « le créer en prod », vérifiée en exécutant cet audit.**

⚠️ **Une règle d'audit ajoutée à une base qui a un passé doit être précédée d'un rattrapage, ou bornée dans le temps. Sinon elle naît comme un avertissement permanent, et un avertissement permanent n'est plus un signal.** L'ordre est donc **rattraper d'abord, contrôler ensuite** — à partir de là toute occurrence est une régression réelle, et c'est ce qui lui donne sa valeur. ⚠️ Le rattrapage lui-même a une **fenêtre de tir** (il réécrit des données affichées) : la vérifier avant, pas après. Et un contrôle né vert sur un terrain propre **ne prouve rien par lui-même** : il doit avoir été exercé dans les deux sens.

⚠️ **La distinction qui rend un tel contrôle utilisable est PAR CHAMP, pas par document** : un champ absent de la participation *alors que* le compte le porte est un défaut d'inscription ; absent des deux, c'est une lacune du **compte**, comptée mais tenue hors du rapport.

**Comptes de test.** Ils servent à **répéter un geste destructif** en production avant de l'appliquer à tout le monde — jamais à **détecter** un défaut : ils sont jeunes et propres, alors que les défauts de ce projet naissent de l'**état accumulé**. Pour détecter, l'instrument est l'audit de production. Corollaire : un compte de test gardé des années vaut **plus**, pas moins.

### Badges (`badges` / `client_badges`) et leur effet sur `users.level`

📖 **Récit complet : [`docs/architecture/badges-et-niveaux.md`](docs/architecture/badges-et-niveaux.md).**

`badges` est un petit catalogue tenu à la main ; `client_badges/{uid}_{badgeId}` lie un badge à un compte et est **immuable une fois créé** (`update, delete: if false`). `utils/badgeActivation.ts`'s `computeBadgeActive` décide **à la lecture** si un badge possédé s'affiche en couleur ou grisé.

- **Trois types** : `manual` (décerné par un moniteur), `automatic` (badges de couleur, attribués tout seuls dès le critère rempli, rétroactivement), `mission`. Un plain client ne peut créer qu'un document pour son propre uid, `awardedBy == "auto"`, identifiant canonique, exactement cinq clés, et seulement si le badge existe avec le bon `type`.
- ⚠️ **La mise en veille n'est pas cosmétique, elle pilote une chaîne** : badge grisé → niveau qui baisse → cible des défis `seuil`, calibrage de la Roulette et affichages « niveau max » qui se décalent. Un badge de couleur ne reste allumé que si un bloc de cette couleur validé par le grimpeur est encore `is_active && type === 'daily'`.
- **`baseLevel` = niveau *déclaré*, `level` = niveau *constaté*.** Tant qu'un badge de couleur est actif, `level` suit le plus haut ; quand tous dorment, la synchronisation réécrit `level` vers `baseLevel`, **jamais vers le haut**. Enregistrer son profil est une **re-déclaration** : `ClientProfile.tsx` écrit `baseLevel` en même temps que `level`.
- **Une baisse de niveau ne peut pas casser un défi en cours** : `seuil` compare une valeur cumulée à une cible fixe, et le niveau ne décide que des validations *futures*. Aucune progression n'est recalculée ni diminuée.
- Un badge grisé doit **se lire comme un objectif, pas comme un bug** : le `Chip` explicatif de `ClientStats.tsx` et la ligne d'aide sont là pour ça.

### First ascents (`boulders/{id}.firstAscents`) — a capped list, not a counter, V2.61

📖 **Récit complet : [`docs/architecture/blocs.md`](docs/architecture/blocs.md).**

Sur un bloc de couleur dure (`gymConfig.firstAscentColors`), les cinq premiers à l'avoir validé s'affichent sur sa fiche. La liste vit **sur le document du bloc** (`firstAscents: {uid, displayName, at}[]`), déjà chargé : coût ≈ 0 lecture, ≤ 5 écritures sur toute la vie du bloc.

- **Le consentement est un champ dédié**, `firstAscentOptIn` dans `user_ludic_state/{uid}` — jamais `classementOptIn`. Évalué au moment de la validation : l'activer plus tard ne rattrape rien, et l'interface le dit.
- ⚠️ **Les règles imposent l'ajout en fin de liste, pas seulement la taille** : `isAppendOnly4()` déroule jusqu'à 4 comparaisons indexées, parce que Firestore **n'a pas d'opérateur de concaténation de listes** (`list + list` est une erreur, constatée sur l'émulateur). Si `FIRST_ASCENT_LIST_MAX` change, ajouter un index déroulé et relever le plafond.
- L'écriture est **immédiate**, jamais débattue dans la transaction débouncée du classement : `utils/firstAscentWrites.ts`, qui **relit le bloc à l'instant de l'écriture** (jamais la copie en mémoire, qui peut être périmée). Un échec n'est que journalisé — la validation du bloc, elle, a déjà réussi.
- `utils/firstAscents.ts`'s `shouldRecordFirstAscent()` centralise les six conditions. Se retirer n'est pas rétroactif ; `scripts/purge-first-ascent-entry.js --uid <uid>` existe pour une demande explicite.

### Boulder attribution: `openedBy` (who opened it) vs `created_by` (who entered it), V2.65

📖 **Récit complet : [`docs/architecture/blocs.md`](docs/architecture/blocs.md).**

⚠️ **Ne jamais confondre les deux champs.** `created_by` (uid, automatique, jamais réécrit) dit **qui a saisi** le bloc dans l'application ; `openedBy` (`{uid, displayName} | null`, choisi dans un menu, modifiable après coup) dit **qui l'a ouvert** physiquement.

- `displayName` est **dénormalisé** et figé à l'écriture : un client ne peut pas lire le `users` d'un autre uid. Un changement de nom ultérieur ne réécrit pas les blocs passés.
- `null` est une valeur **normale et fréquente** : tout lecteur doit la rendre sans message d'erreur.
- Le menu se construit depuis le **vivier courant** (`utils/staffAccounts.ts`, `buildOuvreurOptions()`, fusion `role` + `roles[]`), une fois par montage de formulaire.
- **Jamais affiché tant qu'une cotation de compétition est cachée** : `openedBy` n'apparaît qu'une fois le bloc redevenu `type: 'daily'`.
- Les règles valident **l'uid, pas l'honnêteté du choix** (`isValidOpenedBy()` → `hasRoleUid(uid, "ouvreur")`), et ne paient leur `get()` que si `openedBy` est dans le diff de l'écriture.

### Opener's note (`boulders/{id}.openerNote`), V2.66

📖 **Récit complet : [`docs/architecture/blocs.md`](docs/architecture/blocs.md).**

Texte libre de l'ouvreur (intention du mouvement, nom donné au bloc, avertissement). `openedBy` dit **qui**, `openerNote` dit **ce qu'il avait en tête**. Même doctrine : n'apparaît que s'il est rempli, jamais sur un bloc de compétition, présent dans **les deux** formulaires.

⚠️ **Plafonné à 300 caractères**, côté client **et** dans `firestore.rules` (`isValidOpenerNote()`, sans `get()`, donc appliqué inconditionnellement) : `boulders` se charge en masse par mur, une note sans borne reproduirait exactement le problème de coût qui a sorti les images vers Cloudinary.

### Method log (`carnet de méthodes`) — `boulders/{id}.methodCounts`/`methodVotes`, V2.67

📖 **Récit complet : [`docs/architecture/blocs.md`](docs/architecture/blocs.md).**

Les grimpeurs votent la ou les techniques employées, dans un **vocabulaire fixe** (`gymConfig.ts`'s `climbingMethods`, dont les clés sont recopiées mot pour mot dans `methodVocabulary()` de `firestore.rules` — **à garder synchronisés à la main**), 3 au maximum, affichées à partir de 3 votes (`summarizeMethodVotes` renvoie `null` en dessous : on n'affiche rien plutôt qu'un « 100 % » trompeur sur un vote unique).

- **Deux écritures dans une seule transaction** : le vote sur le `client_boulder_results` du grimpeur, l'agrégat sur le bloc. `utils/methodVoteWrite.ts` relit les deux documents.
- ⚠️ **Dans les règles, un `get()` à l'intérieur d'une transaction voit l'état d'AVANT la transaction, jamais une écriture sœur faite plus tôt dans la MÊME transaction** — vérifié sur l'émulateur, pas supposé (`firestore.rules.test.ts`). C'est ce qui rend `isValidMethodVoteUpdate()` possible. Toute règle future qui voudrait recouper deux documents écrits ensemble doit relire ce test avant de supposer « avant » ou « après ».
- Modifiable, pas en ajout seul ; `methodVotes` ne bouge qu'au passage 0 ⇄ ≥1 méthode.
- Filet : `scripts/reconcile-method-counts.js` (mensuel, simulation par défaut, `--fix`, même garde de dérive que la réconciliation du classement).
- Seulement sur des blocs `type: 'daily'` hors compétition — la méthode employée renseigne sur la difficulté, qui reste cachée pendant une grosse compétition.

### Weekly missions — `user_ludic_state/{uid}.weeklyMissions`, V2.68

📖 **Récit complet (les huit missions, la grille tamponnée, le badge) : [`docs/architecture/jeu-et-missions.md`](docs/architecture/jeu-et-missions.md).**

Huit missions remises à zéro chaque semaine ISO, récompensées par un **badge** à la première grille complète (jamais par des points de classement), avec un compteur de répétitions. ⚠️ **Distinct de `weeklyGoalItems`, et coexiste avec lui** : un objectif est fixé *par le grimpeur pour lui-même*, une mission est fixée *par la salle, identique pour tous*. Ne pas fusionner les deux, ne pas supprimer l'un.

- **Aucun cron, aucune vérification de date côté serveur** : `resolveWeeklyMissionsState` compare la semaine ISO stockée à celle de l'horloge **du client**, même doctrine de confiance que le reste de l'application. **Ne jamais construire de vérification serveur pour cela.**
- **`level` et `countsChildWalls` sont figés à l'ouverture de la semaine**, jamais redérivés en cours de semaine. L'âge vient de `getSeasonAge` — le point unique de dérivation de l'âge, à ne jamais recalculer ailleurs.
- **M1 passe par le geste « Je l'ai refait », jamais par « Réussi »** ; **M3 (flash) exige un bloc jamais essayé** (`neverTriedBefore`), un seul essai sur une répétition n'est pas un flash ; **M4 bis** remplace M4 pour un grimpeur au plafond, et est purement déclaratif. Les plafonds et planchers réutilisent ceux de la Roulette — **ne pas écrire une seconde implémentation**.
- ⚠️ **Si les missions devaient un jour rapporter des points de classement, les gestes ne devraient plus compter** : l'écart de confiance est acceptable pour un badge, pas pour des points.
- **M8 se replie dans l'écriture que la Roulette fait déjà ; M1-M7 dans la transaction débouncée partagée — jamais une écriture à part.** Une seule écriture vers `user_ludic_state` par transaction, jamais deux `tx.set()` sur la même référence.
- ⚠️ **V2.68 a livré un bug qui effaçait la grille** : le flush n'ajoutait `user_ludic_state` à ses lectures que si des deltas de murs existaient — condition écrite avant les missions. Tout flush ne portant que des missions reconstruisait la grille depuis le vide. Correctif structurel : le jeu de lectures est dérivé par `classementFlushReadKeys(pending)`, et `buildClassementFlushWrites` **lève** sur toute écriture vers un document qu'il n'a pas lu (une écriture perdue mais bruyante vaut mieux qu'une corruption silencieuse). Vérifié comme **propriété** sur les 1024 combinaisons : ajouter un champ à la transaction sans étendre les lectures fait rougir le test tout seul.
- **Le badge est de `type: 'mission'`, un TROISIÈME type à côté de `manual` et `automatic` — ne jamais réutiliser `automatic`** : `computeBadgeActive` tient un badge sans couleur pour toujours actif, donc le faire passer par la boucle d'attribution automatique l'aurait donné à tout le monde dès la première ouverture de « Mes stats ».
- **Une quatrième idée du même document — un « mode flash » à points doublés — a été explicitement REJETÉE, pas reportée** : la réconciliation effacerait silencieusement des points d'une autre origine à sa prochaine passe, et l'application n'a aucune notification poussée pour annoncer la fenêtre. Ne pas la réintroduire sans résoudre les deux.

### Daily boulder results: the first success is the measure, a repeat is not (V2.69)

📖 **Récit complet : [`docs/architecture/blocs.md`](docs/architecture/blocs.md).**

Le barème récompense le petit nombre d'essais parce qu'il signale la difficulté **relative au grimpeur** — un signal qui n'existe qu'à la première rencontre. Laisser une répétition réécrire le résultat ferait converger le classement vers « 1 essai partout ».

- **`utils/boulderResult.ts` (pur) + `writeBoulderResult` de `ClientDaily.tsx` sont l'unique chemin d'écriture** de `client_boulder_results` depuis cet écran : `setDoc(..., { merge: true })` ne portant **que** les champs que le geste contrôle, `createdAt` repris du document stocké.
- **Trois états de la fiche** : déjà réussi → lecture seule ; « Corriger ma saisie » (sans limite de temps) → seul chemin pour changer les essais ou annuler ; sinon → choix explicite des essais puis « Réussi »/« Échoué ». `handleValidateSuccess` revérifie le résultat stocké : la règle ne repose pas sur la seule interface.
- **Un échec puis une réussite est une PREMIÈRE réussite** : la règle porte sur « déjà *réussi* », jamais « déjà *saisi* ».
- **Aucun nombre d'essais par défaut** : le `Select` démarre vide, « Réussi » est inerte tant qu'on n'a pas choisi. « Échoué » n'en demande pas (`attempts: null` est un état légal).
- **Les gestes de mission n'écrivent jamais de résultat** (`recordMissionGesture`), et chacun ne s'affiche que s'il ferait avancer la grille.
- ⚠️ **Grammaire des boutons, à conserver pour tout bouton futur** : un bouton qui écrit un résultat est un **adjectif d'état** (« Réussi », « Échoué ») ; un bouton qui n'en écrit pas parle à la **première personne, au passé** (« J'ai testé ce bloc », « Je l'ai refait », « J'ai relevé le défi »), est *outlined*, et porte la légende grise « n'enregistre pas de résultat ».
- **« Effacer cet échec »** supprime le document (un échec stocké fermerait M3 pour toujours sur ce bloc), refusé si un vote de méthode s'y trouve encore (`canEraseFailure`), sans effet sur le classement ni les missions.
- **Lacune connue, assumée** : `firestore.rules` laisse le propriétaire réécrire son propre résultat. La règle est tenue par l'interface, pas par le serveur.

### Weekly goals (`ClientScreen.tsx`) — cumulables, calculés en direct, jamais persistés

📖 **Récit complet : [`docs/architecture/jeu-et-missions.md`](docs/architecture/jeu-et-missions.md).**

`weeklyGoalItems` est une **liste cumulable** d'objectifs de la semaine : `{type:'color'}`, `{type:'boulder'}` ou `{type:'all'}`, librement combinables, plafonnée à `MAX_WEEKLY_GOAL_ITEMS`.

- `utils/weeklyGoal.ts` est un **module pur, sans import Firestore**, comme `roulette.ts` et `challenges.ts`. `upsertGoalItem` **remplace** un objectif de même nature au lieu d'en créer un second.
- **La progression est recalculée à chaque chargement, délibérément PAS un compteur incrémental** — contrairement à `classement_profiles`/`wallCounts`/`challenges.progress` : la lecture existait déjà pour la série, et c'est une statistique personnelle, bon marché à recalculer. Le `colorById` n'est chargé que si un objectif de type couleur existe.
- **Même sémantique « première réussite de la semaine » pour les trois types**, y compris `'boulder'` : choisir comme objectif un bloc validé depuis longtemps s'affiche honnêtement comme non fait, plutôt que trivialement satisfait.
- **Repli de lecture pour l'ancien format** (`weeklyGoalTarget`), converti à la lecture et effacé au premier enregistrement — même motif que `legacyAge` et `image_base64`.

### Swallowed-error process — ce qu'il a laissé dans le code

📖 **Récit complet (les quatre étapes, leurs constats) : [`docs/architecture/tests-et-fiabilite.md`](docs/architecture/tests-et-fiabilite.md).**

Écrit après un bug de transaction, non pour ce bug — déjà corrigé — mais pour sa **classe** : une panne permanente et déterministe déguisée en panne transitoire, avalée par un `catch` qui remet en file et ne signale jamais rien. Ce qu'il en reste dans le code, et qui doit le rester :

- **`utils/firestoreTransaction.ts`'s `runReadThenWriteTransaction(db, reads, buildWrites)`** : `buildWrites` ne reçoit **jamais `tx`**, il est donc *structurellement impossible* d'y faire une lecture après une écriture. Son pendant, `utils/classementFlushWrites.ts`, n'importe rien de Firestore et se teste sans émulateur.
- **`utils/useDebouncedFlushQueue.ts`** : un seul hook débouncé, générique sur une charge par clé et un `merge` fourni par l'appelant — sémantique **cumulative** ou **remplaçante** selon l'écran. La journalisation, le compteur d'échecs et l'escalade vers `onDurableFailure`/`onRecovered` vivent **dans le hook**, pas recopiés par écran.
- ⚠️ **L'ordre des arguments de `merge` est `(older, newer)`, jamais `(prev, incoming)`.** Le hook l'appelle depuis deux endroits dont la relation d'ancienneté est **opposée** (mise en file / réessai après échec) : un `merge` qui ferait « prev gagne » serait juste pour l'un et silencieusement faux pour l'autre — deux saisies rapides persisteraient la **première**. Le cas cumulatif ne l'exposait pas, l'addition étant commutative, ce qui est précisément pourquoi le défaut est passé inaperçu. `combineByFreshness` est exporté et testé pour ça.
- **ESLint** : `@typescript-eslint/no-unused-vars` avec `caughtErrors: 'all'` et `no-empty` sans `allowEmptyCatch`, en `'error'`. L'inventaire était vide, donc ce passage à `error` fut une formalité — l'heuristique vise le `catch` vide, pas le « journalisé une fois, réessayé pour toujours » qui est réellement arrivé.
- ⚠️ **Affirmer l'effet, pas « ça n'a pas planté »** : tout compteur incrémental a besoin d'une assertion e2e sur la valeur **écrite**, lue côté serveur.

### Form labels and accessibility: `aria-labelledby`, never `htmlFor` on a MUI `Select`

📖 **Récit complet (l'enquête, les fausses pistes, les mesures) : [`docs/architecture/tests-et-fiabilite.md`](docs/architecture/tests-et-fiabilite.md).**

- **Le câblage canonique d'un champ composé à la main est `InputLabel id` + `Select labelId` + `Select label`** — trois propriétés, et **jamais un quatrième `htmlFor`**. Un `Select` rend un `div role="combobox"` plus un `<input>` `aria-hidden` ; le `id` atterrit **sur le div**, qui n'est pas un élément étiquetable. Un `for` qui le vise ne désigne aucun champ. Un combobox se nomme par `aria-labelledby`, que `labelId` pose déjà correctement. `TextField` est exempt : MUI y génère les deux et les fait pointer sur le vrai champ.
- ⚠️ **Dans une boucle de rendu, dériver l'identifiant de la DONNÉE, jamais le figer** : un littéral figé produit N identifiants en double, et `aria-labelledby` résout alors sur le premier pour toutes les lignes — un défaut échangé contre un autre, **invisible pour les deux avertissements de Chrome**.
- **Deux écarts sont acceptés et documentés** (l'heuristique de Chrome ne sait pas lire `aria-labelledby` ; le `textarea` fantôme de `TextareaAutosize` n'est atteignable par aucune propriété), même doctrine que les exceptions connues de l'audit : un avertissement permanent apprend à ignorer les avertissements.
- 🔴 **« Zéro avertissement Chrome » n'est donc JAMAIS un critère de sortie valable ici** : il est inatteignable sur les deux types. Le critère est le filet ci-dessous.
- **Le filet est `frontend/test/assertNoOrphanLabels.mjs`**, appelé depuis un e2e sur chaque écran visité : il lit le DOM **rendu**, où le balisage de MUI existe réellement, et vérifie trois choses — tout libellé résout vers un champ étiquetable ou est référencé par un `aria-labelledby` ; tout champ a un `id` ou un `name` ; aucun identifiant n'est en double. ⚠️ **`aria-hidden` n'est exclu que de la deuxième**, jamais de la première ni de la troisième : l'exclure partout ferait rougir le filet *à cause d'un correctif juste*. Les trois ont été vues rouges avant d'être vertes.

### A redirect target must be a terminal page, never a route that redirects in turn

📖 **Récit complet et mesures : [`docs/architecture/tests-et-fiabilite.md`](docs/architecture/tests-et-fiabilite.md).**

`ProtectedRoute` répondait à un rôle manquant par un `<Navigate to="/">`. Mais `/` pousse vers `/client/screen`, lui-même gardé par le rôle `client` : un compte sans ce rôle tournait en **boucle de redirection infinie** — application **totalement inutilisable**, pas seulement dégradée. La production n'était protégée que par la *convention* que tout compte porte `client`.

- **Corrigé par la terminalité, pas par `replace`** : `components/AccessDenied.tsx` est rendu sur place et ne navigue nulle part. `replace` n'aurait rien changé — le ping-pong serait resté. La terminalité supprime **toute la classe**, pour n'importe quelle combinaison de rôles présente ou future.
- ⚠️ **Seconde moitié de l'invariant : une page terminale doit TOUJOURS offrir une sortie, et cette sortie ne doit pas être elle-même une redirection.** Sinon on a troqué une boucle contre un cul-de-sac. D'où le bouton de **déconnexion**, seule sortie qui marche pour toute combinaison de rôles. Une page terminale ne doit pas dépendre de ce qui l'entoure pour avoir une porte.
- 🟠 **Point ouvert : `Navbar` et `ProtectedRoute` lisent chacun `users/{uid}` de leur côté** — deux composants qui décident indépendamment des rôles d'un utilisateur. C'est cette dispersion que la boucle manifestait. Le correctif est un contexte partagé, pour qu'**un seul endroit réponde à « qui est cet utilisateur »**. ⚠️ **Ne jamais justifier ce chantier par l'économie de lectures** : passer de 2 à 1 est négligeable, et une justification quantitative qui s'effondre à la mesure discrédite un chantier par ailleurs juste. **Quand :** avec le chantier « droits d'accès, rôle ouvreur trop large », qui touche les rôles de toute façon.
- ⚠️ **`seed-daily-users.mjs` garde son ouvreur avec `roles: ['ouvreur']`, sans `client`, exprès — ne pas « corriger ».** Cette violation est la seule chose qui ait jamais exercé ce chemin ; y ajouter `client` supprimerait la preuve au lieu du défaut.

### Gestion des versions

`frontend/package.json`'s `version` field is the **single source of truth** — every other place the version appears derives from it at build/read time, none of them is ever hand-edited independently:

1. **`frontend/package.json` → `version`** — the only field to edit by hand for a bump.
2. **`vite.config.ts`** reads it at build time and injects it as the `__APP_VERSION__` global, alongside `__GIT_HASH__`/`__BUILD_DATE__` (both auto-computed from `git rev-parse`/`new Date()` at build time — never hand-maintained, and `gitHash` falls back to `'inconnu'` when no `.git` is available, e.g. a tarball build).
3. **`src/config/appVersion.ts`** derives `appVersion` (raw string) and `formattedAppVersion` (`"2.65"` → `"V2.65"`, trailing `.0` patch stripped; `"2.57.3"` → `"V2.57.3"`, a real patch digit stays visible) plus `buildDetail` (commit hash + build date, a safeguard against a forgotten bump — see `docs/suivi/SUIVI-remontages-et-version.md` point 3).
4. **User-facing display**, all reading `formattedAppVersion`/`buildDetail`, none keeping its own number: `components/Navbar.tsx` (`VX.XX` caption next to the gym logo, on every page — moved there in V2.40 from "Mon espace personnel" to stop lengthening that screen's mobile scroll), `Client/ClientScreen.tsx` (tooltip with the full `buildDetail`), `AdminCompetitionLiveDisplay.tsx` (corner marker on the unattended TV screen).
5. **`src/data/changelog.ts`** — since V2.71.2 the "Quoi de neuf" panel shows **every entry newer than the last version this device dismissed**, newest first, capped at 3 (`utils/changelogDisplay.ts`, pure, tested; a device that never dismissed anything sees only `[0]`). Each entry therefore describes **only its own version**: never copy the previous entry's points into a new one. That copying was the old workaround, and the 2.71 season announcement had silently pushed 2.69's input changes off screen (`docs/handoffs/RETOUR-v271.md` §3). `changelog[0].version` tracks the most recent version that shipped a **client-visible feature**, not necessarily the current `package.json` value: a "bump seul" version (no user-visible change, e.g. V2.62–V2.64) deliberately gets no changelog entry, per the file's own header comment. Don't treat a mismatch between `changelog[0].version` and `package.json`'s `version` as a bug by itself — check whether the intervening bumps were feature-bearing first.
6. **Commit message convention** (git history, not enforced by tooling): `"Application Sociale Blocabrac VX.XX : <description>"` for a feature version, `"Application Sociale Blocabrac VX.XX : bump seul (<raison>)"` for a version bumped with no other code change (e.g. to validate a deploy mechanism) — the number must match what that same commit puts in `package.json`.
7. **PWA manifest** (`vite.config.ts`'s `VitePWA({ manifest: {...} })`) carries **no version field at all** — the web app manifest spec doesn't define one. `name`/`short_name`/`theme_color`/etc. come from `VITE_*` env vars (`.env`), entirely independent of the app version number. Nothing to keep in sync here.
8. **Service worker** has no manual cache-invalidation version constant — `vite-plugin-pwa`/Workbox regenerates the precache manifest with a per-file content hash on every build, so cache invalidation is automatic and never depends on the displayed version number. The version number is purely informational for the user (see "Update banner" above for the actual update mechanism, which works off that content hash, not off this number).

**Bump procedure** (apply this without being asked again):
1. Pick the next number following the existing `major.minor[.patch]` convention (`X.YY`, patch digit only for an actual point-fix) — never skip one.
2. Edit **only** `frontend/package.json`'s `version`.
3. If the change is client-visible (not a "bump seul"), prepend a new entry to `changelog.ts` (a new object at index `[0]`; never edit past entries).
4. `npm run build` **after** the bump, never before — see the stale-`dist/` warning in the Commands section above; a `dist/` built pre-bump still embeds the old `__APP_VERSION__` literal no matter what `package.json` says by deploy time.
5. Deploy whatever actually changed (`--only hosting` and/or `--only firestore:rules`).
6. Commit using the convention in point 6 above.

### Visual identity: matches the gym's real website (`www.blocabrac.fr`)

V2.40 aligned the MUI theme with the gym's actual public website instead of MUI's default blue/Roboto: primary color `#27B142` (dark variant `#177038`, both in `config/gymConfig.ts` as `brandGreen`/`brandGreenDark`) and the "Dosis" font, both read directly from that site's live CSS — set once in `context/ThemeModeContext.tsx`'s single `createTheme(...)` call (`palette.primary`, `typography.fontFamily`), so it propagates to every button/link/focus ring/AppBar without touching individual screens. `VITE_THEME_COLOR` in `.env` (browser chrome tint + PWA manifest icon backdrop) was updated to the same green — it does **not** feed the MUI theme itself, that's a separate `env.VITE_THEME_COLOR` read only in `vite.config.ts`'s PWA manifest block, so both must be kept in sync by hand if the brand color ever changes again. Dosis is self-hosted (`src/assets/fonts/dosis-variable-latin.woff2`, one variable-weight file covering 200–800, `src/styles/fonts.css`'s single `@font-face`, imported from `main.tsx`) rather than linked from `fonts.googleapis.com` — this app's PWA app-shell is meant to survive being reopened offline (see IndexedDB/service-worker section above), and a third-party font request would fail offline and delay first paint online; `vite.config.ts`'s workbox `globPatterns` includes `woff2` so the font file itself is precached like the rest of the shell. The "latin" Google Fonts subset (`U+0000-00FF`) is sufficient — it already covers every accented character French needs (é/è/à/ç/ù/etc.), no need for `latin-ext`. The one other pre-existing hardcoded color (a blue/purple gradient on the shareable progress card, `Client/ClientScreen.tsx`) was repainted to the same green pair for consistency — it was the only other spot in the app not already driven by the MUI theme.

**PWA icons (`frontend/public/icons/`) — version the filename, never the content (V2.58)**: the three icons (`pwa-192x192-v2.png`, `pwa-512x512-v2.png`, `maskable-512x512-v2.png`) are white symbol on `#27B142`, derived from `src/assets/logo-blocabrac.png` (lettering/grain stripped, maskable safe zone respected). Files in `public/` carry **no build hash** — the service worker precaches them by name, so replacing an icon under its existing filename is exactly the case that stays stuck in cache. Any icon change must land under a **new `-vN` filename**, delete the old one, and update the `icons` array in `vite.config.ts` + the `apple-touch-icon` in `index.html` (grep `pwa-192`/`pwa-512`/`maskable` to be sure nothing else points at the old name). The manifest's `background_color` (PWA splash screen) is set to `env.VITE_THEME_COLOR`, same as `theme_color` — keep them equal. Note: an already-installed PWA keeps its old icon until reinstalled — OS behaviour, nothing to code.

### Testing

📖 **Récit complet et exemples : [`docs/architecture/tests-et-fiabilite.md`](docs/architecture/tests-et-fiabilite.md).**

- `npm test` (rapide, sans dépendance externe) couvre les fonctions utilitaires pures — c'est ce qu'une vérification équivalente à la CI doit toujours lancer.
- `npm run test:rules` (émulateur) est le seul moyen de vérifier les règles de sécurité et la logique de permissions inter-collections. Tout changement touchant `firestore.rules` ou la forme d'un chemin d'écriture doit y gagner un test.
- Il n'y a **pas de suite Playwright branchée sur ces scripts** malgré la dépendance : les e2e se lancent à la main, chacun avec son propre `seed-*.mjs`.
- ⚠️ **Lancer le serveur de dev e2e sous Windows : entourer l'affectation de guillemets.** `cmd /c set VITE_USE_EMULATOR=true && npx vite` donne la valeur `"true "` — espace finale — donc `=== 'true'` est faux et **l'application se connecte à la PRODUCTION**. Seul symptôme : un `403` à l'étape de connexion. Écrire `set "VITE_USE_EMULATOR=true"`.
- **Isolation** : `test/emulator-reset.mjs` vide Firestore et Auth par leur API REST locale, et **lève** si les deux variables d'environnement ne pointent pas sur localhost. Tout nouveau seed dont l'e2e affirme quelque chose sur un état **global** doit l'appeler.
- **Exceptions connues** : les écarts acceptés vivent dans la carte `KNOWN_EXCEPTIONS` de `audit-prod-catalog.js`, chacun avec sa raison et sa date, imprimés sur une ligne `ℹ️` et non comme avertissements — **un avertissement permanent apprend à ignorer les avertissements**. N'en ajouter que sur décision explicite de l'utilisateur.

#### Les règles de méthode, qui valent au-delà des tests

- ⚠️ **Un critère de sortie doit prédire *toutes* les grandeurs observables, y compris celles dont on n'attend aucun mouvement.** Sommé de vérifier un correctif d'un champ, le critère était « le compteur doit passer de 4 à 3 ». **Il y est passé — et le correctif était faux** : l'outil avait simplement reclassé le défaut dans un troisième avertissement que personne n'avait demandé de regarder. **Un compteur qui bouge dans le sens espéré mesure l'espoir.**
- ⚠️ **Hiérarchie des preuves** : ① le **DOM rendu** tranche (piloter un navigateur) ; ② la source installée de la bibliothèque **induit en erreur** — bon fichier, bonne ligne, mauvaise variable, et la conclusion s'écrit ensuite comme « écarté sur preuve », ce qui donne à une lecture l'autorité d'une mesure ; ③ la documentation ne fut jamais nécessaire. **Lire la source n'est pas lire le DOM.**
- ⚠️ **Un instrument fait maison mesure ses propres défauts en silence**, d'autant plus qu'il a été écrit pour l'occasion — et ses chiffres faux sont du **bon ordre de grandeur**, donc invisibles. Ce qui les attrape : **vérifier à la main un cas tiré au hasard de la liste.**
- ⚠️ **« Voir rouge d'abord » a une condition : le jeu de données doit pouvoir produire le défaut.** Deux fois le même jour, la tentative de voir rouge a produit du **vert**, et on en aurait conclu que le filet fonctionnait. **La question à poser à chaque seed : quels défauts ce jeu de données est-il physiquement incapable d'exprimer ?** Un jeu d'essai à un seul élément ne peut exhiber aucun défaut de multiplicité, d'ordre, de collision ou de concurrence.
- ⚠️ **Cas particulier qui se présente souvent : un rechargement de page remet l'état d'un composant à sa valeur initiale. Une assertion sur une REMISE À ZÉRO placée après un `reload()` ne peut donc jamais rougir** — le rechargement produit lui-même ce qu'elle croit vérifier. Constaté le 18/10/2026 : la vérification que l'interrupteur « Je publie quand même » est remis à zéro vivait après un rechargement, et supprimer la remise à zéro du code laissait le pas **vert**. Déplacée dans un pas qui ferme et rouvre la fenêtre **sans rechargement**, elle rougit. La forme générale : **se demander ce qui, dans le décor, produirait l'effet attendu à la place du code.**
- ⚠️ **Et la règle ne s'arrête pas au seed : elle vaut pour tout ce que l'assertion REGARDE.** Un pas qui lit un écran qui tourne, pagine ou se rafraîchit doit **désigner** ce qu'il lit, jamais prendre ce qui passe. **Technique mécanique qui remplace cette vigilance : avant d'affirmer quelque chose sur un ensemble, affirmer sa TAILLE.** Une ligne par assertion, et la question de jugement devient une vérification automatique. À appliquer à tout sujet sélectionné dynamiquement.
- ⚠️ **Un repli rend aveugle au défaut qu'il compense : la défense en profondeur et l'observabilité sont en tension.** Quand on ajoute un repli, on ajoute ou on vérifie **dans le même geste** l'assertion sur ce dont on se replie — ce qui est **ÉCRIT**, pas ce qui est **AFFICHÉ**. Sinon on vient de désarmer silencieusement un test existant.
- ⚠️ **Tout script dont la raison d'être est un effet de bord doit ANNONCER son effet** (« 3 collections vidées, 47 documents supprimés »). Un succès silencieux est indiscernable d'un no-op : `node test/emulator-reset.mjs` sur un module qui ne fait qu'exporter **sort en 0 sans rien faire**, et trois exécutions se sont empilées en silence le 18/10. Même famille que la commande qui réussit sans que l'effet ait lieu. Effet secondaire utile : un script qui annonce son effet se relit, et on voit tout de suite celui qui n'annonce rien.
- ⚠️ **Les trois endroits où un test peut être INCAPABLE d'échouer, et aucun ne se voit en lisant le test.** Formulés pour dire **où regarder**, pas quoi espérer :
  - **l'entrée** — *quels défauts ce jeu de données est-il physiquement incapable d'exprimer ?* (un seul élément n'exprime ni multiplicité, ni ordre, ni collision) ;
  - **le décor** — *qu'est-ce qui, dans la mise en scène, produirait l'effet attendu à la place du code ?* (un `reload()` remet un état de composant à sa valeur initiale tout seul) ;
  - **l'assertion** — *nomme-t-elle ce qui doit DIFFÉRER, et pas seulement ce qui doit être égal ?* (sans `published_at`, on compare un document à lui-même).
- ⚠️ **Sur un filet à plusieurs propriétés, vérifier que chacune rougit SÉPARÉMENT.** Un filet « vu attraper quelque chose » ne dit rien de celles de ses vérifications qui ne vérifient rien. **Casser le code une fois par propriété, pas une fois pour le filet.**
