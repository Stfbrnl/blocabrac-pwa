# Suivi — Après les correctifs quota de lectures (commit `2dfa4a9`)

> Note rédigée le 14/08/2026 par la session Claude (navigateur), après lecture de
> `HANDOFF-quota-lectures-2026-08-14.md`.
> À destination de Claude Code dans le Codespace.
>
> **Aucun de ces points n'est un défaut du travail livré.** Les correctifs sont bons et
> la découverte de `ClientDaily.tsx` — un problème continu et non borné, plus grave que
> le pic ponctuel de la compétition — sortait du périmètre initial et n'avait pas été
> vue côté navigateur.
>
> Trois points : une mesure manquante qui peut remettre en cause le dimensionnement
> (point 1, **à traiter avant la compétition**), un compromis introduit par un correctif
> (point 2, à connaître, correction partielle recommandée), et une suggestion sur le
> numéro de version en cours d'implémentation (point 3).

---

## Point 1 — La mesure « après » ne couvre pas l'axe des rechargements

### Constat

Les 39 lectures par grimpeur (~3 500 à 90 participants, 7 % du plafond) sont un excellent
résultat, et la convergence des deux scénarios démontre bien que la garde par compétition
rend les ouvertures de modale gratuites.

Mais **ce chiffre vaut pour un seul montage de page**. Les gardes
(`activeResultsListener`, `ensureBouldersListener`, `confirmedRegistrations`) vivent dans
des refs de composant : elles ne survivent pas à un démontage, et encore moins à un
rechargement de l'onglet. Chaque remontage repaie le snapshot initial complet.

Or c'est précisément l'axe que le terrain impose :

- iOS et Android déchargent agressivement les onglets en arrière-plan ;
- un grimpeur range son téléphone entre deux blocs et revient sur une page remontée ;
- la soirée dure 2-3 h, avec de nombreux allers-retours.

### Arithmétique

| Remontages par grimpeur | Lectures/grimpeur | À 90 participants | vs 50 000 |
|---|---|---|---|
| 1 (mesuré) | 39 | 3 510 | 7 % |
| 5 | ~195 | ~17 550 | 35 % |
| 15 | ~585 | ~52 650 | **au plafond** |

Le facteur ×47,6 est réel, mais il est mesuré sur l'axe « ouvertures de modale », qui
n'est plus le facteur limitant. L'axe qui reste est celui des remontages, et il n'est pas
mesuré.

### L'inconnue qui décide

Le jeton de reprise de l'`onSnapshot` est persisté avec le cache IndexedDB (chantier 3
déjà en place). **Si** la reprise après rechargement est incrémentale, le coût d'un
remontage tombe à quasi rien et le problème disparaît. **Sinon**, chaque remontage
refacture ~39 documents et le tableau ci-dessus s'applique.

Google **ne garantit pas** le comportement incrémental : selon l'ancienneté du jeton et la
nature de la requête, le jeu complet peut être refacturé. C'est donc à mesurer, pas à
supposer — dans un sens comme dans l'autre.

### Ce qu'il faut faire

Adapter `frontend/test/measure-competition-reads-after.mjs` pour paramétrer le nombre de
**montages de page** (simuler un démontage/remontage complet, pas seulement des ouvertures
de modale), et relever la courbe pour 1, 5 et 15 remontages.

⚠️ **La persistance doit être active pendant cette mesure.** Le handoff indique que le
cache est désactivé quand `VITE_USE_EMULATOR === 'true'` — donc une mesure sous émulateur
avec la configuration par défaut testerait exactement le mauvais cas de figure et
donnerait un résultat pessimiste artificiel. Il faut soit lever ce garde-fou pour la durée
de la mesure (et vérifier par `git diff` qu'il n'est pas resté levé, comme cela avait été
fait au chantier 3), soit mesurer autrement.

### Si le résultat est mauvais

Pistes, par ordre de préférence :

1. **Vérifier d'abord que le remontage est bien nécessaire.** Un retour d'arrière-plan ne
   démonte pas toujours le composant — si React conserve l'arbre, les refs survivent et le
   problème est moins fréquent qu'estimé. À observer avant d'optimiser.
2. **Sortir les gardes du cycle de vie du composant** (module-level, ou contexte React
   monté au-dessus de la route) : survit à une navigation interne, pas à un rechargement.
3. **Lecture explicite depuis le cache** (`getDocsFromCache` avec repli serveur) pour les
   blocs de compétition, qui ne changent pas pendant l'épreuve : le seul jeu de données où
   la fraîcheur temps réel n'apporte rien.

### Critère de sortie

Rester **sous 20 000 lectures** pour l'ensemble de la compétition dans le scénario à 15
remontages, afin de laisser de la marge à l'usage quotidien de la salle le même jour.

---

## Point 2 — Le cache mémoire de `ClientDaily` : deux réserves

Le correctif est bon et le compromis probablement le bon. Deux réserves à connaître, dont
une seule mérite peut-être une correction.

### 2a. Fraîcheur multi-sessions (compromis assumé)

`successfulAttemptsRef` est chargée une fois au montage puis mutée localement.
`updateClassementProfile` recalcule le résumé depuis cette `Map` et écrit
`classement_profiles`.

Avec deux onglets ou deux appareils, les deux caches divergent : chacun ignore les
validations faites par l'autre depuis son propre chargement, et **le dernier à écrire
écrase l'autre avec un résumé incomplet**. L'ancien `getDocs` garantissait la fraîcheur au
prix du quota ; on a échangé de la correction contre de la performance.

Le cas est peu fréquent (un grimpeur valide rarement depuis deux appareils
simultanément) et la conséquence est limitée (un classement temporairement sous-évalué,
corrigé au prochain montage). Ne pas revenir en arrière.

Parade peu coûteuse si tu veux la traiter : recharger la `Map` sur `visibilitychange`
après une absence prolongée (seuil de quelques minutes). Ça couvre aussi le cas d'une PWA
installée restée montée plusieurs jours — où la `Map` serait chargée à l'installation et
jamais rafraîchie.

### 2b. La lecture reste non bornée (à traiter)

Le handoff identifiait trois raisons rendant `ClientDaily.tsx` pire que la compétition :
**continu**, **non borné**, **fréquence élevée**. Le correctif a levé la fréquence — il ne
lit plus qu'une fois par montage au lieu de 40-60 fois par jour. Excellent gain.

Mais **le caractère non borné demeure** : le `getDocs` de montage lit toujours tout
l'historique de réussites du grimpeur, sans limite de date. Un compte de deux ans
d'ancienneté lira des milliers de documents à chaque ouverture de la page quotidienne, et
ce volume ne cessera de croître.

Ce n'est pas urgent — le facteur de fréquence était le plus gros — mais c'est une dette
qui grossit toute seule, et qui repartira à la hausse mécaniquement avec l'ancienneté des
comptes.

**Piste** : borner la requête à la saison en cours. C'est cohérent avec la logique de
remise à zéro saisonnière du classement, et ça transforme un volume croissant en volume
stable. À vérifier avant d'implémenter : le résumé écrit dans `classement_profiles`
a-t-il besoin de l'historique complet, ou seulement de la période courante ? Si le
classement est cumulatif à vie, il faut alors un compteur incrémental plutôt qu'un
recalcul, ce qui est un chantier différent.

---

## Point 3 — Numéro de version (en cours d'implémentation)

Utile au-delà de la commodité, pour une raison précise à ce projet : il y a désormais
**deux couches de cache superposées** — le service worker (`vite-plugin-pwa`) pour les
assets, IndexedDB pour les données. Le symptôme typique est un utilisateur qui décrit un
comportement corrigé depuis longtemps. Un identifiant de build affiché à l'écran répond en
une seconde à la question « est-ce qu'il tourne sur une version périmée ? », ce qu'aucun
log côté serveur ne dira.

Recommandations :

- **Injecter au build** via `define` dans `vite.config.ts` (hash court du commit + date),
  plutôt que de lire quoi que ce soit à l'exécution. Une valeur figée dans le bundle est
  exactement ce qu'on veut : elle identifie le bundle, pas l'environnement.
- **Afficher pour tous les rôles**, pas seulement en admin — c'est le client qui remonte
  les bugs, et c'est de sa version qu'on a besoin. Un discret pied de page ou une ligne
  dans l'écran d'aide suffit.
- Envisager de logger la version au démarrage en console : utile pour un diagnostic à
  distance quand l'utilisateur peut faire une capture d'écran.

---

## État des points ouverts (rappel, inchangé)

- **Écran live de classement sur TV** — débloqué (chantier 1 + les `onSnapshot` de ce
  correctif sont directement réutilisables), non commencé. Rappel des décisions de
  conception déjà prises : recalcul depuis le snapshot en mémoire et jamais de refetch ;
  recalcul groupé toutes les 1-2 s ; rotation par catégorie FFME plutôt qu'un classement
  global de 90 lignes illisible à 5 m ; route hors `Navbar` ouvrable en fenêtre séparée
  pour l'écran étendu HDMI ; **extraction préalable de `getParticipantScores()`** dans un
  utilitaire partagé (dupliqué entre `AdminCompetitionStats.tsx` et
  `Ouvreur/CompetitionBoulders/CompetitionStats.tsx`).
- **Un projet Firebase par salle vs mutualisé** — à trancher avant tout développement
  multi-salles. C'est aussi à ce moment que le `getDocs(collection(db,'users'))` non
  filtré relevé en section 2c du handoff deviendra pertinent.
- **Stockage durable des sauvegardes d'images** (`--backup`).
- **Mesure réseau navigateur du cache au rechargement** — recouvre partiellement le
  point 1 ci-dessus : si la mesure du point 1 est faite proprement, ce point est clos.

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté dans
  le code final.

---

## Addendum du 14/08/2026 — les trois points traités

### Point 1 — traité : `onSnapshot` remplacé par une lecture cache-first

Diagnostic confirmé : les gardes (`activeResultsListener`, `activeBouldersListener`)
vivaient dans des refs de composant et ne survivaient pas à un remontage de page. Plutôt
que l'option 2 (sortir les gardes du cycle de vie — n'aurait pas résolu le cas d'un vrai
rechargement d'onglet, seulement la navigation interne), l'option 3 a été retenue et
généralisée aux **deux** jeux de données (blocs *et* résultats, pas seulement les blocs
comme suggéré initialement — les résultats sont écrits par ce grimpeur lui-même, donc son
propre cache local les reflète fidèlement) :

- `onSnapshot` → `getDocsCacheFirst` (nouveau `utils/firestoreCacheFirst.ts`) : lit le
  cache IndexedDB local en priorité (jamais facturé), replie sur `getDocs` (serveur) si
  le cache est vide (première visite, ou persistance désactivée en test/émulateur).
- Plus de listener à gérer : `ensureResultsListener`/`ensureBouldersListener` redeviennent
  de simples fonctions async (`loadResults`/`loadBoulders`), plus d'effet de nettoyage au
  démontage nécessaire.
- La garde (déjà présente pour `onSnapshot`) reste, adaptée : dédoublonnage par
  compétition au sein d'un même montage (`loadedResultsCompId`/`loadedBouldersCompId`).

**Sur la mesure demandée** ("adapter le script pour paramétrer les montages de page") :
tentée puis abandonnée — un comptage brut des requêtes réseau vers l'émulateur pendant
plusieurs `page.reload()` réels s'est révélé être un indicateur trompeur (l'ouverture d'un
nouveau canal WebChannel à chaque rechargement génère plus de requêtes de négociation de
connexion que la donnée elle-même n'en aurait coûté, noyant totalement le signal utile).
Le script a été supprimé plutôt que conservé comme preuve invalide. À la place :
- **Correction fonctionnelle vérifiée en conditions réelles** : persistance IndexedDB
  temporairement forcée même sous émulateur (`firebaseConfig.ts`, revert confirmé par
  `git diff` juste après — aucun résidu), puis les trois flux Playwright complets rejoués
  avec cette persistance active : `e2e-competition-flow.mjs` 15/15 (dont la reprise après
  rechargement), `e2e-daily-flow.mjs` 7/7, `e2e-course-flow.mjs` 11/11 — aucune régression.
- **La garantie de coût nul, elle, n'a pas besoin d'être mesurée** : contrairement à la
  reprise d'un `onSnapshot` (dont Google ne documente pas le comportement incrémental
  exact, d'où la mesure empirique du chantier initial), `getDocsFromCache` est *par
  contrat* une lecture qui n'atteint jamais le réseau — ce n'est pas un comportement à
  vérifier statistiquement, c'est la définition même de la fonction.

### Point 2 — traité : les deux réserves sur `ClientDaily.tsx`

- **2a (fraîcheur multi-onglets/appareils)** : implémenté tel que suggéré — un listener
  `visibilitychange` recharge le cache mémoire **depuis le serveur** (pas cache-first,
  volontairement, pour rattraper un écart cross-appareil) après une absence d'au moins 5
  minutes.
- **2b (lecture non bornée)** : **le bornage par date/saison suggéré comme piste a été
  vérifié puis écarté** — `summarizeValidatedResults` confirme que le classement est
  cumulatif à vie (pas de remise à zéro saisonnière nulle part dans le code), donc borner
  la requête aurait silencieusement faussé `score`/`bouldersValidated` à la baisse pour
  tout compte ancien. Le vrai chantier (compteur incrémental) reste ouvert, non trivial à
  cause de `bestColorRank` qui n'est pas décomposable en delta simple sur une suppression
  — confirmé non urgent par le diagnostic initial, laissé de côté. À la place, le même
  levier que le point 1 a été appliqué : la lecture au montage passe par
  `getDocsCacheFirst` — ne change rien au premier chargement (toujours O(historique)),
  mais rend gratuit tout remontage de page sur le même appareil une fois le cache
  alimenté, ce qui couvre la majorité de l'usage réel (le même téléphone, ouvert
  plusieurs fois dans la journée).

### Point 3 — traité : garde-fou automatique + visibilité élargie

- **Numéro de version conservé tel que demandé par l'utilisateur** (semver lisible dans
  "Mon espace personnel", pas remplacé par un hash — c'est le numéro qu'il tape en commit
  qu'il veut voir).
- **Garde-fou ajouté par-dessus** : hash de commit court + date de build, injectés
  automatiquement à chaque build (`vite.config.ts`, via `git rev-parse --short HEAD`),
  affichés en info-bulle sur le numéro de version — toujours exacts même en cas d'oubli de
  bump manuel du semver.
- **"Afficher pour tous les rôles" déjà acquis sans rien faire** : `ClientScreen.tsx`
  ("Mon espace personnel") est déjà atteignable par tous les rôles (tout compte porte
  "client" — voir CLAUDE.md), confirmé par `e2e-friends-flow.mjs` où le moniteur y transite
  aussi. Pas de duplication nécessaire vers un écran staff dédié.
- **Log console au démarrage** : ajouté dans `main.tsx`.
