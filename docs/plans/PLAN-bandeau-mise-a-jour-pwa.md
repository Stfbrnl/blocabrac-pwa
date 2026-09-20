# Plan — Bandeau de mise à jour PWA

> Rédigé le 06/09/2026 par la session Claude (navigateur), à la demande de l'utilisateur.
> À destination de Claude Code dans le Codespace.
>
> **Le symptôme** : après un déploiement, l'utilisateur doit vider le cache de Chrome sur
> PC, et sur Android fermer tous ses onglets puis recharger deux ou trois fois par tirage
> vers le bas avant d'obtenir la nouvelle version.
>
> **Diagnostic fait à partir de `vite.config.ts`, `firebase.json`, `main.tsx` et
> `package.json`** — voir §1. Ce n'est ni `registerType` (déjà correct) ni les en-têtes
> HTTP (déjà corrects). **Il manque le rechargement au moment de la bascule.**
>
> **Aucun coût Firestore, aucun quota**, uniquement du code client.

---

## §1 — Diagnostic

### Ce qui est déjà bon (vérifié, ne pas y toucher)

- `vite.config.ts` : `registerType: 'autoUpdate'` est déjà en place.
- `firebase.json` : `index.html` est en `no-cache`, `/assets/**` en `immutable`. La
  découverte des mises à jour n'est pas bloquée en amont par le cache HTTP.
- `main.tsx` : le garde-fou `vite:preloadError` (rechargement unique protégé par
  `sessionStorage`) est bien vu.

### La cause

**`autoUpdate` active le nouveau service worker, mais ne recharge pas la page.** Le
JavaScript déjà chargé en mémoire reste celui de l'ancienne version.

D'où la séquence observée :

1. **1er rechargement** : la page démarre depuis l'ancien précache. *Pendant* ce
   chargement, le service worker découvre la mise à jour et télécharge le nouveau
   précache.
2. **2e rechargement** : le nouveau service worker est actif, la nouvelle version s'affiche.

Le « deux ou trois tirages vers le bas » est exactement ce cycle.

`main.tsx` n'importe pas `virtual:pwa-register` : c'est le script d'enregistrement injecté
par défaut qui opère, et il se contente d'enregistrer sans piloter la bascule.

### Le second facteur, spécifique à Android

Un service worker ne cherche une mise à jour **qu'au chargement de la page**, et le
navigateur limite cette vérification. Une PWA installée que l'on ne ferme jamais peut
ignorer une version pendant des jours — ce qui explique pourquoi fermer tous les onglets
« débloque » la situation.

### Conséquence sur le garde-fou existant

`vite:preloadError` est aujourd'hui un **pansement sur ce problème** : il rattrape le cas
où un `index.html` périmé référence un chunk qui n'existe plus. Une fois la mise à jour
correctement pilotée, il redevient ce qu'il doit être — un filet pour le cas rare.
**Le conserver**, ne pas le retirer.

---

## §2 — La cible : bandeau plutôt que rechargement automatique

Deux approches possibles. **Le bandeau est retenu** (choix de l'utilisateur), et c'est le
bon choix dans ce contexte précis :

- **L'écran TV de compétition** (`AdminCompetitionLiveDisplay.tsx`) tourne plusieurs heures
  sans surveillance. Un rechargement automatique en pleine épreuve repaierait ~3 240
  documents de snapshot initial (chiffrage du §3 de `CONCEPTION-ecran-live-competition.md`).
- **Un grimpeur en train de saisir** ses essais ne doit pas voir sa page se recharger sous
  ses doigts.

La consigne « ne pas déployer le jour J » reste valable, mais le bandeau la rend beaucoup
moins critique.

---

## §3 — Implémentation

### 3.1 — Le hook d'enregistrement

Utiliser `virtual:pwa-register/react` (fourni par `vite-plugin-pwa` 1.3, déjà en
dépendance), qui expose `useRegisterSW` avec `needRefresh` et `updateServiceWorker`.

Créer un composant dédié, par exemple
`frontend/src/components/UpdateBanner.tsx`, monté dans `main.tsx` **à côté de `Navbar`**
(donc présent sur tous les écrans, tous rôles).

Points de conception :

- `updateServiceWorker(true)` déclenche l'activation **et** le rechargement. C'est ce que
  le bouton du bandeau appelle.
- `onRegisteredSW(swUrl, registration)` donne accès à l'objet `registration`, nécessaire au
  §3.3.
- Prévoir la déclaration de type pour `virtual:pwa-register/react` si `tsc -b` s'en plaint
  (ajout dans `src/vite-env.d.ts`, où `__APP_VERSION__` est déjà déclaré).

### 3.2 — Le bandeau

Réutiliser le `Snackbar` MUI déjà employé ailleurs dans l'application — **ne pas en
inventer un second**.

- Texte : « Une nouvelle version est disponible. » + bouton « Mettre à jour ».
- **Ne pas se fermer tout seul** (`autoHideDuration={null}`) : c'est une action, pas une
  notification.
- Position discrète (bas de l'écran), pour ne pas masquer une action en cours.
- Un bouton « Plus tard » qui referme le bandeau. La mise à jour s'appliquera de toute
  façon au prochain démarrage complet.
- Afficher le numéro de la version disponible **n'est pas possible** : le bundle courant ne
  connaît que le sien. Ne pas essayer.

⚠️ **Ne pas afficher le bandeau sur la route de l'écran TV**
(`/admin/competitions/live-display/:competitionId`). Cet écran est conçu sans interaction,
lu à cinq mètres, et personne n'est devant pour cliquer. Un bandeau y serait au mieux
inutile, au pire masquerait une ligne du classement. Le repère de version discret déjà
présent en coin d'écran suffit à diagnostiquer une version périmée.

### 3.3 — Vérification périodique (le point qui règle le cas Android)

Sans cela, le bandeau n'apparaîtra jamais sur une PWA installée qu'on ne ferme pas.

Dans `onRegisteredSW`, mettre en place **deux déclencheurs** :

1. **`visibilitychange`** — appeler `registration.update()` quand l'application revient au
   premier plan après une absence (seuil de quelques minutes, pour ne pas déclencher à
   chaque bascule d'application). **C'est le déclencheur le plus important dans ce
   contexte** : le grimpeur rouvre l'application en arrivant en salle, elle vérifie.
2. **Intervalle périodique** — `registration.update()` toutes les heures, pour la PWA
   laissée ouverte en continu.

Nettoyer l'intervalle et l'écouteur au démontage.

`registration.update()` est une requête réseau vers `sw.js` (quelques centaines d'octets,
en `no-cache`). Négligeable, et **zéro lecture Firestore**.

---

## §4 — Vérification à faire en parallèle : les en-têtes `/assets/**`

Dans `firebase.json`, deux règles se chevauchent : `**` en `no-cache` et `/assets/**` en
`public, max-age=31536000, immutable`. **L'ordre de priorité appliqué par Firebase Hosting
mérite un contrôle direct** plutôt qu'une supposition :

```
curl -I https://blocabrac.web.app/assets/<un-fichier-hashé>.js
```

- Si la réponse porte `immutable` → tout va bien, rien à faire.
- Si elle porte `no-cache` → les bundles sont revalidés à chaque visite alors que leur nom
  porte déjà un hash. **Ça n'explique pas la staleness** (au contraire, ça la réduirait),
  mais c'est du trafic inutile et de la latence au démarrage. Corriger en plaçant la règle
  spécifique avant la générique, ou en restreignant le motif `**`.

À traiter dans le même lot si le contrôle est négatif, sinon ne rien toucher.

---

## §5 — Vérification du chantier

### Test manuel, en conditions réelles

C'est le seul test qui prouve quelque chose ici — un test unitaire sur un hook de service
worker ne vérifierait rien d'utile, et le projet n'a pas d'infrastructure de test React.

**Protocole** :

1. Déployer la version N. Ouvrir l'application sur PC **et** sur Android (PWA installée),
   noter le repère de version en Navbar.
2. Bumper la version, déployer N+1.
3. **Sur PC** : recharger une fois. Le bandeau doit apparaître. Cliquer « Mettre à jour ».
   Vérifier que le repère de version affiche N+1 **sans vider le cache**.
4. **Sur Android** : mettre l'application en arrière-plan une dizaine de minutes, puis la
   ramener au premier plan **sans la fermer**. Le bandeau doit apparaître (déclencheur
   `visibilitychange` du §3.3). Vérifier N+1 après clic, **sans fermer les onglets**.
5. Vérifier que « Plus tard » referme le bandeau sans casser l'application.
6. Ouvrir l'écran TV et confirmer qu'**aucun bandeau n'y apparaît**.

L'étape 4 est celle qui valide le vrai correctif — c'est le scénario fastidieux d'origine.

### Non-régression

- `npm run build` / `lint` / `test` : le bandeau ne touche aucune logique métier.
- Vérifier que le garde-fou `vite:preloadError` de `main.tsx` est toujours en place.
- Un e2e Playwright ne peut pas simuler un déploiement intermédiaire : **ne pas essayer
  d'en écrire un**, le test manuel est le bon niveau.

---

## §6 — Documentation

- **`CLAUDE.md`** : nouvelle note dans la section PWA — `registerType: 'autoUpdate'` est en
  place **mais** c'est le bandeau qui déclenche le rechargement ; toute modification de
  l'enregistrement du service worker doit préserver les deux déclencheurs de
  `registration.update()`.
- **`ClientHelp.tsx`** : une phrase sur le bandeau, pour que les grimpeurs sachent quoi en
  faire plutôt que de le refermer par réflexe.
- **`changelog.ts`** : entrée courte. C'est une amélioration visible et bienvenue.
- **Consigne d'exploitation** (à noter à côté de « ne pas déployer le jour J ») : le
  bandeau réduit fortement le risque, mais un déploiement en pleine compétition reste à
  éviter.

---

## §7 — Ordre d'exécution

1. Contrôle `curl` du §4 (une minute, avant tout code).
2. `UpdateBanner.tsx` + montage dans `main.tsx` + déclaration de type si nécessaire.
3. Les deux déclencheurs de `registration.update()` (§3.3).
4. Exclusion de la route TV (§3.2).
5. `npm run build` / `lint` / `test`.
6. Déploiement, puis **test manuel du §5 avec deux déploiements successifs** — c'est la
   seule preuve valable.
7. Documentation (§6), en-têtes si le §4 le demande.

---

## Points ouverts par ailleurs (inchangés)

- **Clic « Redémarrer la saison »** ~mi-septembre, après vérification du nombre de profils
  (28 attendus).
- **Surveiller le profil recalé de −190** au prochain passage mensuel de la réconciliation :
  une seconde dérive sur le même compte indiquerait un chemin d'écriture défaillant.
- **Sortir l'état ludique de `users`** — voir `PLAN-etat-ludique-hors-users.md`.
- Défis `fenetre` / `bloc_designe` : en production sans e2e navigateur.
- Chantier droits d'accès — en attente du gérant.
  `CONCEPTION-droits-acces-abonnements.md` toujours pas transmis au dépôt.
- `topo-blocabrac.pdf` sans la police Dosis ; `aide-connexion-installation.html` hors charte.
- Un projet Firebase par salle vs mutualisé.
- Sauvegarde durable des images Cloudinary (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné — **et ici, il en faudra deux
  successifs pour tester** (§5).
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
