# Les deux caches

> Récit extrait de `CLAUDE.md` le 18/10/2026, lorsque celui-ci a dépassé la limite de
> 150 000 caractères. **Le texte n'a pas été réécrit** : c'est celui qui y vivait, à
> l'identique, titres compris. Ce qui s'applique **sans condition** (invariants courts,
> interdits, procédures) est resté dans `CLAUDE.md` ; ce document porte le *pourquoi*,
> l'histoire et les incidents — c'est-à-dire ce qui ne se lit qu'au moment d'y toucher.
>
> 📖 **À lire avant toute modification touchant la persistance Firestore (IndexedDB) et le service worker, et le bandeau de mise à jour.**

---

## `public/docs/` et le repli de navigation — l'écran blanc du 28/10/2026

Les documents statiques (`frontend/public/docs/` : le guide de connexion, l'affiche du
barème) sont ouverts **par leur adresse**, `blocabrac.web.app/docs/<fichier>`. Rien dans
l'application n'y renvoie : on tape l'URL, ou on suit un lien depuis le topo.

**Le symptôme.** Stéphane ouvre l'affiche du barème en ligne : **écran blanc**. Il doit
aller chercher le fichier sur son disque.

**Le mécanisme.** `vite-plugin-pwa` en `generateSW` enregistre une `NavigationRoute` avec
`createHandlerBoundToURL("index.html")` — c'est ce qui fait marcher les URL profondes
d'une application monopage. Sans refus explicite, **toute navigation** y passe, y compris
vers un PDF. Le service worker répond donc `index.html` ; l'application se charge ; aucune
route ne correspond à `/docs/...` ; et comme `AppRoutes.tsx` n'a **aucune route `*`**, il
ne reste rien à l'écran.

**Ce qui rend le défaut difficile à voir, et qui est le vrai enseignement :**

- 🔴 **`curl` ne passe par aucun service worker.** Mes deux vérifications de déploiement
  (`200`, `application/pdf`, octets identiques au dépôt) étaient **justes et sans rapport
  avec la question**. J'avais mesuré la couche HTTP et conclu sur le navigateur — la même
  faute que « un contrôle validé sur une méthode d'une API ne se transfère pas à une autre
  méthode de la même API ». La tentation du transfert est maximale là où il est invalide.
- ⚠️ **Les deux fichiers du même dossier avaient des sorts opposés.** Le `.html` est
  **précaché** (`globPatterns` contient `html`), donc servi depuis le précache et jamais
  soumis au repli : il marchait. Le `.pdf` n'est pas précaché (`pdf` absent des patterns),
  donc il tombait dans le repli : écran blanc. Constater que « le document est accessible »
  sur l'un ne dit **rien** de l'autre.
- ⚠️ **Le guide de connexion était cassé depuis sa création**, sans que personne le
  remarque — et la mémoire de projet le décrivait comme « servi en ligne ». Un document
  que personne n'a encore eu besoin d'ouvrir peut être cassé depuis toujours.

**Le correctif** : `navigateFallbackDenylist: [/^\/docs\//]` dans le bloc `workbox` de
`vite.config.ts` (V2.76.2). Le service worker décline ces URL, qui repartent au réseau —
vérifié dans un navigateur piloté, service worker **aux commandes** : `application/pdf` et
`fromServiceWorker: false`, là où l'on avait `text/html` et le titre de l'app shell.

⚠️ **La vérification demande deux précautions**, sans quoi elle ne mesure rien : un profil
de navigateur **neuf** (sinon l'ancien service worker répond), et un **rechargement** après
la première ouverture — sous `registerType: 'prompt'` le service worker ne contrôle pas la
page au premier chargement, donc un test fait sans recharger passe au vert en ne traversant
aucun service worker.

⚠️ **Et le correctif ne vaut que pour les appareils ayant ACTIVÉ ce service worker-ci** :
c'est toujours la version déployée qui gouverne sa propre succession. Un appareil resté sur
l'ancienne continue d'avoir l'écran blanc jusqu'à sa mise à jour. Ne pas en conclure que le
correctif ne marche pas.

**Points ouverts, non traités ici** :

- 🟠 **Il n'existe aucune route `*`.** L'écran blanc n'est pas propre aux PDF : c'est ce que
  voit n'importe qui sur n'importe quelle URL inconnue, une faute de frappe comprise. Une
  page terminale (du genre de `components/AccessDenied.tsx`, avec une sortie qui ne soit pas
  elle-même une redirection) fermerait toute la classe.
- 🟠 **Rien dans l'application ne renvoie vers ces documents.** Ils n'existent que par leur
  URL, écrite dans le topo. Un emplacement d'administration qui les liste serait le bon
  endroit — suggéré par l'utilisateur le 28/10/2026.

## Firestore persistent cache (IndexedDB) and the two cache layers

`firebaseConfig.ts` initializes Firestore with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` (Chantier 3) instead of the default in-memory cache — decisive on competition day so re-opening the app doesn't re-transfer unchanged boulder images, and so validations queue locally and replay on reconnect if the venue's indoor coverage drops. `persistentMultipleTabManager()` is mandatory: without it, activation throws as soon as a second tab is open, which is exactly the admin's TV-display setup (two windows). Persistence is force-disabled (falls back to plain `initializeFirestore(app, {})`) whenever `MODE === 'test'` or `VITE_USE_EMULATOR === 'true'` — Firestore security rules aren't re-checked against cached reads, so a stale cache entry could silently pass what a live read would reject, masking a real permission bug in Playwright.

IndexedDB is scoped to the site origin, not to the signed-in account — on a shared device (admin's workstation, a borrowed phone), a previous account's cached data would otherwise survive logout. **`services/logout.ts`'s `performLogout()` is the single logout path** and enforces the exact required order: `auth.signOut()` → `terminate(db)` → `clearIndexedDbPersistence(db)` → `window.location.reload()`. `clearIndexedDbPersistence` only works while Firestore is inactive, and the SDK instance is unusable after `terminate()`, hence the reload; the reload sits in a `finally` so a failed step never leaves the user on a page whose SDK is half-stopped. If a new logout entry point is ever added, it must call this function, not a bare `auth.signOut()`. It lived inline in `Navbar.tsx`'s `handleLogout` until 03/10/2026 and was extracted the moment a **second** caller appeared (`AccessDenied.tsx`, which needs to offer an exit — see the redirect-target invariant below): the rule already said "must go through this same function", so it had to actually be one. Current callers: `Navbar.tsx` (desktop button + mobile drawer item) and `AccessDenied.tsx`.

Two independent cache layers now sit in front of the app: `vite-plugin-pwa`'s service worker (static assets/shell) and this Firestore IndexedDB cache (data). If something looks frozen/stale, check which layer is responsible before assuming a code bug — a stuck UI after a data change is usually the Firestore cache, a stuck UI after a deploy is usually the service worker.

**Update banner (V2.57→V2.58, `components/UpdateBanner.tsx`, mounted in `main.tsx` next to `Navbar`; mode switched to `'prompt'` in V2.62, `docs/processus/CORRECTIF-bandeau-mode-prompt.md`)**: V2.57/V2.58 used `registerType: 'autoUpdate'` + `onNeedReload`, an **event** fired when the new SW takes control while the page is running — on a PC tab left open for hours, React always won the race against that event and the banner worked. On an Android cold start, the sequence (fetch `sw.js` → install → **activate immediately**, `skipWaiting` being intrinsic to `autoUpdate`) can complete *before* `UpdateBanner` even mounts — the event fires into a void, no listener catches it, and the app silently loads the new version on the next reload with no banner ever shown. Confirmed in prod (2.60→2.61: PC banner worked, Android never showed it, a pull-to-refresh jumped straight to the new version). This was foreseeable: `autoUpdate` is *designed* to reload on its own, and intercepting that is fighting an automatic mechanism into acting like a manual one — a race that isn't guaranteed to resolve in the app's favor.
- **Fix: `registerType: 'prompt'`** (`vite.config.ts`). In this mode the new SW stays **`waiting`** instead of self-activating — a durable *state*, not a fugitive event, so it doesn't matter when `UpdateBanner` mounts: it reads `needRefresh` (the boolean pair from `useRegisterSW`, `[needRefresh]`) and finds a waiting SW if one exists. "Mettre à jour" calls `updateServiceWorker(true)`, which activates the SW **and** reloads in one call — `onNeedReload`/`window.location.reload()` are gone, there's nothing left to intercept.
- **Trade-off that comes with `prompt`, by design, not a bug**: nothing forces the update anymore — as long as nobody clicks, the old version keeps being served indefinitely (unlike `autoUpdate`, which eventually imposed the new version on the next reload regardless). The Navbar version marker stays the diagnostic for "is this device actually up to date". Not mitigated further for now (a non-dismissible banner or a forced-after-N-days variant was considered and deliberately deferred — see the same `.md`) — start simple, watch real usage first.
- **A version's *own* registration mode governs its own transition, not the mode of the version it's replacing** — the SW currently deployed decides whether *its own successor* is auto-activated or held waiting. A version shipped with `autoUpdate` (like every one through V2.61) will still auto-activate whatever comes right after it, `prompt` or not; the `prompt` behavior only takes effect starting from the transition *after* the one where it was introduced (2.62→2.63 here, not 2.61→2.62) — the exact same one-version lag already seen with the banner's own introduction at V2.57→V2.58. Don't conclude "the fix doesn't work" from testing on the wrong transition.
- registers **two `registration.update()` triggers** — `visibilitychange` (only after ≥3 min in the background, so the climber reopening the app in the gym re-checks) and an hourly `setInterval` (for a PWA left open). Without these, an installed PWA that's never closed can ignore a version for days, because the browser only checks for a new SW on page load and throttles it. With `prompt`, these triggers also matter for *making the waiting SW show up sooner*, not just for detecting one. `registration.update()` is a few hundred bytes over the network (`sw.js`, `no-cache`), **zero Firestore reads**. Any change to the SW registration must keep both triggers.
- is **not rendered on `/admin/competitions/live-display/:competitionId`** (the unattended TV screen — the corner version marker is enough there).
- `main.tsx`'s `vite:preloadError` reload guard stays — it's the last-resort net for a stale `index.html` pointing at a deleted chunk. It matters *more* under `prompt` than it did under `autoUpdate`, precisely because an old version can now persist far longer if nobody clicks the banner. Verifying the banner needs a **manual test across two successive deploys** (deploy N, deploy N+1, confirm the banner appears without clearing anything) — a Playwright e2e can't simulate an intermediate deploy, don't write one. The real test for the `prompt` fix specifically is a **cold start** on Android (app fully closed, then reopened on the version right after the one that introduced `prompt`) — that's the exact case that failed under `autoUpdate` and the only one that validates the fix; the PC/backgrounded-app cases were already working before and only confirm nothing broke. ✅ **Verified on 03/10/2026, on the 2.71.3 → 2.71.4 transition: the banner appeared and the update went through it, on the user's Android phone *and* on their PC browser.** The "never seen on a real phone" caveat that this section carried since V2.62 is retired. The deliberate trade-off checked out in the other direction too: the update had **waited** — nothing forced it, the old version kept being served until the click, on both devices (the PC one had been sitting un-updated while the phone was already on 2.71.4).

