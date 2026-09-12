# Correctif — Bandeau de mise à jour : passer en mode `prompt`

> Rédigé le 12/09/2026 par la session Claude (navigateur), après observation du
> comportement réel en production sur deux transitions de version.
> À destination de Claude Code dans le Codespace.
>
> **Le symptôme, rapporté par l'utilisateur** : sur navigateur PC avec l'application laissée
> ouverte, le bandeau apparaît et fonctionne. **Sur Android, jamais** — ni à l'ouverture, ni
> après attente. Un rechargement par tirage vers le bas fait passer directement à la
> nouvelle version, **sans bandeau**.
>
> **Ce n'est pas un bug d'implémentation.** C'est la « limite résiduelle » que le handoff
> V2.58 avait explicitement anticipée, et elle se manifeste comme prévu. Le correctif est un
> changement de mode, pas une rustine.

---

## §1 — Diagnostic : un événement là où il faut un état

### Ce qui se passe

Le bandeau actuel repose sur `onNeedReload`, un **événement** émis quand le nouveau service
worker prend le contrôle pendant que la page tourne. **Un événement émis sans auditeur est
perdu définitivement.**

**Sur PC**, l'onglet reste ouvert des heures. La vérification périodique
(`registration.update()`) a lieu longtemps après le montage de React, l'écouteur est en
place, le bandeau s'affiche. C'est le cas favorable.

**Sur Android**, c'est un démarrage à froid, et la séquence probable est :

1. la page commence à charger ;
2. le navigateur récupère `sw.js` (servi en `no-cache`) et constate qu'il a changé ;
3. le nouveau service worker s'installe et — `skipWaiting` étant propre au mode
   `autoUpdate` — **s'active immédiatement** ;
4. tout cela peut se produire **avant que React n'ait monté `UpdateBanner`**.

L'événement part dans le vide. D'où les deux symptômes exacts décrits :

- **rien à l'ouverture** — l'événement a eu lieu trop tôt ;
- **rechargement suivant : nouvelle version sans bandeau** — le nouveau service worker est
  déjà aux commandes depuis le départ, il n'y a plus rien à annoncer.

### Pourquoi c'était prévisible

Le mode `autoUpdate` est **conçu pour recharger tout seul**. Intercepter ce rechargement
pour afficher une invite, c'est travailler contre la conception du mode : on demande à un
mécanisme automatique de se comporter comme un mécanisme manuel, et on dépend d'une course
entre l'activation du service worker et le montage de React.

Sur un onglet déjà ouvert, React gagne toujours. Sur un démarrage à froid, pas
nécessairement.

---

## §2 — Le correctif : `registerType: 'prompt'`

### La différence décisive

En mode `prompt`, le nouveau service worker **reste en attente** (`waiting`) au lieu de
s'activer.

**Un service worker en attente est un état durable, pas un événement fugace.** Peu importe
quand `UpdateBanner` se monte : il interroge l'état, trouve le service worker en attente, et
affiche le bandeau. La course disparaît, parce qu'il n'y a plus de course.

Le clic sur « Mettre à jour » déclenche alors l'activation (`skipWaiting`) puis le
rechargement.

### Ce qu'il faut changer

1. **`vite.config.ts`** : `registerType: 'autoUpdate'` → `'prompt'`.
2. **`UpdateBanner.tsx`** : utiliser **`needRefresh`** de `useRegisterSW` (le booléen d'état
   prévu pour ce mode) à la place de l'interception `onNeedReload`. Le bouton appelle
   `updateServiceWorker(true)`, qui active **et** recharge.
3. **`onNeedReload`** n'a plus lieu d'être — le retirer plutôt que de le laisser inerte.

### Ce qu'il faut conserver

- **Les deux déclencheurs de `registration.update()`** (`visibilitychange` après ≥ 3 min,
  intervalle horaire). Ils restent utiles : ils font apparaître le service worker en attente
  **plus tôt**, sans attendre un rechargement complet. C'est ce qui permettra au bandeau de
  s'afficher sur une PWA ouverte en continu.
- **L'exclusion de la route de l'écran TV** — inchangée, et toujours justifiée.
- **Le garde-fou `vite:preloadError`** de `main.tsx` — filet de dernier recours, il prend
  d'ailleurs plus d'importance avec `prompt` (voir §3).

---

## §3 — Deux conséquences à connaître avant de décider

### A. Le correctif ne sera pas observable à la prochaine transition

Le service worker **actuellement déployé** (2.61) est en mode `autoUpdate` : il activera
d'office son successeur, quel que soit le mode de celui-ci.

Donc à la transition **2.61 → 2.62**, le comportement Android restera celui d'aujourd'hui.
Le mode `prompt` ne prendra effet qu'à partir de **2.62 → 2.63**.

C'est exactement le même décalage qu'entre 2.57 et 2.58. **Le signaler avant le test**,
sinon la conclusion sera « le correctif ne marche pas ».

### B. Avec `prompt`, « Plus tard » a une vraie conséquence

En mode `autoUpdate`, refuser ne fait que différer : le rechargement suivant applique la
nouvelle version de toute façon.

En mode `prompt`, **tant que personne ne clique, l'ancienne version continue d'être servie
indéfiniment**. C'est le principe même d'une invite, mais ça change la nature du bouton.

Deux conséquences pratiques :

- Un grimpeur qui ferme systématiquement le bandeau peut rester des semaines sur une
  version périmée. Le repère de version en Navbar reste le diagnostic.
- **Le garde-fou `vite:preloadError` devient plus important** : un `index.html` en cache
  pointant vers un chunk supprimé est plus probable quand une version ancienne persiste. Il
  est déjà en place, ne pas y toucher.

**À arbitrer par l'utilisateur** : si ce comportement gêne, une variante possible est de
laisser le bandeau non refermable, ou de forcer la mise à jour au-delà d'un certain délai.
**Je ne le recommande pas d'emblée** — commencer simple, observer l'usage réel.

---

## §4 — Vérification

Le test manuel est le seul valable : aucun test automatisé ne peut simuler un déploiement
intermédiaire.

**Protocole, à jouer sur la transition 2.62 → 2.63** (pas avant, voir §3.A) :

1. **PC, onglet déjà ouvert en 2.62** : attendre la vérification périodique, ou recharger
   une fois. Bandeau → « Mettre à jour » → la Navbar affiche 2.63 sans vidage de cache.
2. **Android, PWA installée en 2.62, application fermée** : la rouvrir. **Le bandeau doit
   apparaître** — c'est le cas qui échoue aujourd'hui, et le seul qui valide le correctif.
3. **Android, application en arrière-plan ≥ 3 min** puis retour au premier plan sans
   fermer : bandeau attendu (déclencheur `visibilitychange`).
4. « Plus tard » referme sans casser. Vérifier que l'ancienne version continue de
   fonctionner (§3.B).
5. Écran TV : **aucun bandeau**.

**L'étape 2 est celle qui compte.** Les autres vérifient qu'on n'a rien cassé.

---

## §5 — Ordre d'exécution

1. `vite.config.ts` : `registerType: 'prompt'`.
2. `UpdateBanner.tsx` : bascule sur `needRefresh`, retrait de `onNeedReload`.
3. Vérifier que les deux déclencheurs de `registration.update()` sont intacts, ainsi que
   l'exclusion de la route TV.
4. `npm run build` / `lint` / `test`.
5. Commit, push, `--only hosting` (aucune règle touchée par ce lot).
6. `CLAUDE.md` : mettre à jour la section cache PWA — **le mode a changé, et la raison
   compte plus que le mode**. Noter que `autoUpdate` avait été retenu en V2.57 et pourquoi
   il ne convenait pas : le bandeau dépendait d'une course entre l'activation du service
   worker et le montage de React, perdue sur un démarrage à froid.
7. **Ne pas tester à la transition suivante** (§3.A) — attendre celle d'après.

Pas d'entrée de changelog nécessaire : c'est un correctif invisible pour le grimpeur, qui
n'a jamais vu le bandeau fonctionner sur mobile.

---

## Points ouverts par ailleurs (inchangés)

- **Migration de l'état ludique** : Passe C déployée en 2.61. Purge en attente — relancer
  périodiquement `backfill-ludic-state.js` **en simulation** ; tant qu'il trouve des écarts,
  quelqu'un tourne encore sur l'ancien code. Puis backfill final, purge, et **mesure réseau
  sur `AdminUsers.tsx`**, qui reste le seul contrôle de l'effet du chantier.
- **Date butoir de la purge** à inscrire dans `CLAUDE.md`, avec la règle durable sur ce qui
  a le droit de vivre dans `users`.
- **`PLAN-premiers-ascensionnistes.md`** peut démarrer — commencer par son §2 (test de
  l'expressivité des règles sur l'émulateur), qui conditionne tout le reste.
- **Clic « Redémarrer la saison »** — mi-septembre, après vérification du nombre de profils.
- **Contrôle visuel des annotations** après le correctif V2.58.
- Surveiller le profil recalé de −190 au prochain passage mensuel de la réconciliation.
- Défis `fenetre` / `bloc_designe` : en production sans e2e navigateur.
- Chantier droits d'accès — en attente du gérant.
- `topo-blocabrac.pdf` sans la police Dosis ; `aide-connexion-installation.html` hors charte.
- Un projet Firebase par salle vs mutualisé, et le fork « Grimpe ! ».
- Sauvegarde durable des images Cloudinary (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
