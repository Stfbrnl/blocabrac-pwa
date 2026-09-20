# Handoff — Repère de version, remontages, quota d'écritures (V2.25 → V2.28)

> Rédigé le 15/08/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur), qui a produit `SUIVI-remontages-et-version.md` et
> `SUIVI-quota-ecritures.md`. Fait suite à `HANDOFF-quota-lectures-2026-08-14.md`
> (V2.25 à V2.28 n'y étaient pas encore couvertes).
>
> Déployé en production au fil de l'eau (https://blocabrac.web.app), quatre
> commits sur `main` : `2a2b0ad` (V2.25), `f02dc96`+`9f83174` (V2.26),
> `c2cfb05` (V2.27), `e5d7822` (V2.28).

---

## Résumé en cinq phrases

Sur demande de l'utilisateur, un repère de version (numéro + hash de commit)
s'affiche désormais dans "Mon espace personnel" pour distinguer une PWA à jour
d'une version mise en cache par le service worker (V2.25). Ton document
`SUIVI-remontages-et-version.md` a ensuite mis le doigt sur un vrai trou dans le
correctif lectures de la veille : l'`onSnapshot` refacturait son snapshot
initial à chaque remontage de page, pas seulement à chaque ré-ouverture de
modale — corrigé par une lecture cache-first (V2.26). `SUIVI-quota-ecritures.md`
a ensuite révélé que les écritures, jamais mesurées, étaient en réalité le
quota le plus tendu (marge ×2 contre ×14 sur les lectures) — traité en deux
temps : le gain principal (déplacement du verrouillage, V2.27) puis les
optimisations plus fines (V2.28). Deux bugs réels ont été trouvés en
**vérifiant** ces changements (pas en les écrivant) : un crash de règle
Firestore sur une clé de map absente, et une fermeture obsolète (stale
closure) qui aurait rendu un flush inopérant en silence.

---

## 1. V2.25 — Repère de version dans "Mon espace personnel"

Demande explicite : savoir si la PWA affichée est bien la dernière version
déployée ou une version mise en cache par le service worker.

- `package.json` `version` devient la source unique de vérité (`0.0.0` →
  `2.25.0`), à faire suivre le numéro donné en commit (convention
  "Application Sociale Blocabrac V2.XX" déjà utilisée dans l'historique git).
- `vite.config.ts` l'injecte au build via `define` (`__APP_VERSION__`, déclaré
  dans `src/vite-env.d.ts`).
- `src/config/appVersion.ts` formate l'affichage ("2.25.0" → "V2.25").
- `ClientScreen.tsx` ("Mon espace personnel", atteignable par **tous les
  rôles** — tout compte porte "client", voir CLAUDE.md) affiche la version
  sous le titre.
- `e2e-friends-flow.mjs` vérifie sa présence.

**Convention retenue pour la suite** : bumper `package.json` à chaque commit
versionné (`Application Sociale Blocabrac V2.XX`), ça apparaît automatiquement
après le prochain build/déploiement. Documenté dans `CLAUDE.md` (nouvelle
section "App version display").

---

## 2. V2.26 — `SUIVI-remontages-et-version.md`, tes 3 points

### Point 1 (urgent, celui que tu avais flagué "avant la compétition")

Constat confirmé : les gardes `activeResultsListener`/`activeBouldersListener`
vivaient dans des refs de composant et ne survivaient pas à un remontage de
page (rechargement d'onglet, retour d'arrière-plan iOS/Android déchargé) — un
`onSnapshot` refacture son snapshot initial à **chaque nouvel abonnement**,
même si la donnée est déjà en cache local. Ton tableau (39 → ~585 lectures sur
15 remontages) était juste.

Correctif retenu : ton option 3 (cache-first), **généralisée aux deux jeux de
données** (blocs *et* résultats, pas seulement les blocs comme suggéré
initialement — les résultats sont écrits par ce grimpeur lui-même, donc son
propre cache local les reflète fidèlement). Nouveau
`frontend/src/utils/firestoreCacheFirst.ts` :
`getDocsCacheFirst(query)` lit `getDocsFromCache` en priorité (jamais facturé
par contrat de l'API, pas besoin de le mesurer empiriquement contrairement à
`onSnapshot`), replie sur `getDocs` (serveur) si le cache est vide. Plus de
listener à gérer dans `ClientCompetitions.tsx` — `ensureResultsListener`/
`ensureBouldersListener` redeviennent de simples fonctions async.

**Tentative de mesure abandonnée, honnêtement rapportée** : j'ai essayé de
compter les requêtes réseau vers l'émulateur pendant plusieurs `page.reload()`
réels (persistance IndexedDB temporairement forcée sous émulateur pour rendre
la mesure possible). Résultat trompeur : l'ouverture d'un nouveau canal
WebChannel à chaque rechargement génère plus de requêtes de négociation de
connexion que la donnée elle-même n'en coûterait, noyant complètement le
signal utile (les rechargements affichaient PLUS de requêtes que le
chargement à froid, alors que c'est l'inverse qui est vrai). Script supprimé
plutôt que gardé comme preuve invalide. À la place : correction validée
**fonctionnellement** (persistance forcée temporairement, `git diff` confirmé
propre après revert, 3 flux e2e complets rejoués sans régression) + garantie
**par contrat** de l'API (`getDocsFromCache` n'atteint jamais le réseau, par
définition — ce n'est pas un comportement à mesurer statistiquement comme
l'était la reprise d'un `onSnapshot`).

### Point 2 — les deux réserves sur `ClientDaily.tsx`

- **2a (fraîcheur multi-appareils)** : implémenté tel que suggéré — un
  listener `visibilitychange` recharge le cache mémoire **depuis le serveur**
  (pas cache-first, volontairement) après une absence d'au moins 5 minutes.
- **2b (lecture non bornée)** : ta piste de bornage saisonnier a été
  **vérifiée puis écartée** — `summarizeValidatedResults` confirme que le
  classement est cumulatif à vie (pas de remise à zéro saisonnière nulle part
  dans le code), donc borner la requête aurait silencieusement faussé
  `score`/`bouldersValidated` à la baisse pour tout compte ancien. Le vrai
  correctif (compteur incrémental) reste ouvert, non trivial à cause de
  `bestColorRank` qui n'est pas décomposable en delta simple sur une
  suppression. À la place, même levier que le point 1 : `getDocsCacheFirst`
  appliqué au chargement initial — rend gratuit tout remontage sur le même
  appareil une fois le cache alimenté.

### Point 3 — garde-fou automatique + visibilité

- Numéro de version **conservé tel que demandé par l'utilisateur** (semver
  lisible, pas remplacé par un hash).
- Garde-fou ajouté par-dessus : hash de commit court + date de build,
  injectés automatiquement à chaque build (`git rev-parse --short HEAD` dans
  `vite.config.ts`), affichés en info-bulle sur le numéro de version.
- "Tous les rôles" déjà acquis sans rien faire (voir V2.25 ci-dessus).
- Log console au démarrage ajouté (`main.tsx`).

---

## 3. V2.27 — `SUIVI-quota-ecritures.md`, points 0 et 2

### Point 0 (mesure)

`frontend/test/measure-competition-writes.mjs` : **117 écritures/grimpeur →
10 530 extrapolées à 90 participants (52,6% du plafond de 20 000)**, cohérent
avec ton estimation (8 000-12 000).

### Point 2 (le gain principal)

`handleLockResults` posait `submitted:true` sur chacun des 35 documents
`competition_results` via `writeBatch` (facturé par document). Déplacé vers
`competition_participants` (1 document, existe déjà), exactement comme
recommandé.

Implication technique que ton document n'avait pas détaillée mais qui est
incontournable : `competition_participants` utilisait des ID auto-générés
(`addDoc`). Pour qu'une règle Firestore fasse un `get()` bon marché (les
règles ne supportent pas les requêtes), il faut un chemin **prévisible** — ID
déterministe `${uid}_${competitionId}`, comme pour `competition_results`.
Ça implique :
- `ClientCompetitions.tsx` (inscription, vérification, verrouillage, lecture)
  et `AdminCompetitionRegistration.tsx` (inscription manuelle) réécrits.
- **Migration de production exécutée** :
  `scripts/rekey-competition-participants.js` (dry-run par
  défaut, `--execute` pour appliquer ; déplacé le 15/08/2026 depuis
  `firestore-migration/` — entièrement gitignoré, donc perdu à chaque
  recréation du Codespace, relevé par Claude navigateur). 3
  participations réelles ré-écrites. Au passage : 1 document de test résiduel
  trouvé (`user_id` littéralement la chaîne `"null"`, compétition
  `comp_test_20260521`, `email: testcomp@test.com`) — explicitement exclu de
  la migration plutôt que migré à l'aveugle. **Supprimé le 15/08/2026 sur
  demande explicite de l'utilisateur** (doc `Ue6AHXLFriXlufC4Bfn4`,
  vérification de contenu juste avant suppression, confirmée après).
- Repli conservé sur l'ancien champ `submitted` de `competition_results` pour
  les compétitions déjà verrouillées avant ce chantier.

**Deux bugs de règles trouvés par `test:rules` puis `e2e-competition-flow.mjs`
avant déploiement — pas en écrivant les règles** :
1. `resource.data.submitted != true` plante toute l'évaluation de la règle
   quand `submitted` n'existe pas encore sur le document (cas réel : une
   participation fraîche n'a pas ce champ) — corrigé avec
   `resource.data.get('submitted', false) != true`.
2. `get()` sur un document inexistant plante aussi l'évaluation (`resource ==
   null` sur une lecture non trouvée — cas `isAlreadyRegistered` pour un
   nouveau grimpeur pas encore inscrit) — corrigé avec un garde `resource ==
   null ||` en tête de la règle `read`.

Les deux auraient bloqué **toutes** les inscriptions et tous les
verrouillages en production sans ces vérifications.

**Mesure après** : `measure-competition-writes-after.mjs` — **83
écritures/grimpeur → 7 470 extrapolées à 90 (37,4% du plafond, contre 52,6%
avant)**, gain ≈3 060 écritures pour 90 participants, conforme à ton
estimation ("~3000, un tiers du total").

---

## 4. V2.28 — points 3, 4, 5

Appliqués aux trois écrans qui écrivent au fil de l'eau
(`ClientCompetitions.tsx`, `ClientCourseSession.tsx`, `ClientDaily.tsx`) :

- **Point 3** : chaque écran garde une ref de la dernière valeur réellement
  persistée par document, comparée avant `setDoc` — identique = rien envoyé.
  Peuplée au chargement initial pour compétition/cours (qui rechargent déjà
  l'état existant). **Volontairement limitée à la session en cours pour
  `ClientDaily.tsx`** : ajouter une lecture au montage pour la peupler aurait
  rouvert le chantier lectures traité la veille — comparaison plus faible
  (ne couvre pas un rechargement de page) mais sans coût de lecture
  supplémentaire.
- **Point 4** : debounce 800ms → 2500ms sur compétition et cours, avec tes
  trois conditions impératives tenues : flush synchrone à la fermeture de la
  modale/soumission, flush sur `pagehide` (pas `beforeunload`), clic
  Réussi/Échoué toujours immédiat.
- **Point 5** : `classement_profiles` dans `ClientDaily.tsx` débranché de
  l'écriture immédiate du résultat — debounced à 3000ms, flush sur fermeture
  de la modale de détail et sur `pagehide`. Le résultat du bloc lui-même
  reste écrit immédiatement.

**Bug de fermeture obsolète (stale closure) trouvé et corrigé en implémentant
le flush `pagehide` de `ClientCompetitions.tsx`** : un effet à dépendances
vides enregistrant directement la fonction de flush l'aurait figée sur le
tout premier rendu — donc sur `user`/`selectedCompetition` encore à `null`,
avant résolution de l'authentification. Le flush sur fermeture d'onglet
n'aurait alors jamais rien écrit en pratique, malgré un code qui semblait
correct à la lecture. Trouvé par ESLint (`react-hooks/exhaustive-deps`), pas
par un test — corrigé avec le pattern ref standard (`flushPendingResultsRef`,
tenu à jour après chaque rendu via un effet séparé sans dépendances, jamais
pendant le rendu lui-même : une nouvelle règle ESLint,
`react-hooks/refs`, interdit la mutation d'une ref pendant le rendu).
`ClientCourseSession.tsx` n'avait pas ce problème : ses entrées de debounce
stockent un callback de flush créé au moment du clic (donc déjà lié à un
rendu où `user`/`session` sont réels), pas une référence à la fonction
englobante — leçon à retenir pour la prochaine fois qu'un flush sur
`pagehide`/`beforeunload` est ajouté ailleurs.

Pas de nouvelle mesure chiffrée pour ces trois points — le gain est réel mais
dépend du comportement réel des grimpeurs (nombre de corrections, pauses
entre clics), comme ton document le prévenait déjà.

---

## 5. Fichiers modifiés (4 commits, tous poussés sur `main`, déployés)

- `2a2b0ad` (V2.25) : `frontend/package.json`, `vite.config.ts`,
  `src/vite-env.d.ts` (nouveau), `src/config/appVersion.ts` (nouveau),
  `ClientScreen.tsx`, `e2e-friends-flow.mjs`, `CLAUDE.md`.
- `f02dc96`+`9f83174` (V2.26) : `frontend/src/utils/firestoreCacheFirst.ts`
  (nouveau), `ClientCompetitions.tsx`, `ClientDaily.tsx`, `main.tsx`,
  `vite.config.ts`, `src/config/appVersion.ts`, `src/vite-env.d.ts`,
  `SUIVI-remontages-et-version.md`.
- `c2cfb05` (V2.27) : `firestore.rules`, `ClientCompetitions.tsx`,
  `AdminCompetitionRegistration.tsx`, `competition-results-lock.test.ts`,
  `measure-competition-writes.mjs` + `-after.mjs` (nouveaux),
  `PLAN-spark-images-competition.md`, `SUIVI-quota-ecritures.md`. Migration
  `scripts/rekey-competition-participants.js`, exécutée manuellement sur la
  prod (initialement écrite dans `firestore-migration/`, gitignoré, puis
  déplacée le 15/08/2026 — voir section 7 ci-dessous).
- `e5d7822` (V2.28) : `ClientCompetitions.tsx`, `ClientCourseSession.tsx`,
  `ClientDaily.tsx`, `SUIVI-quota-ecritures.md`.
- `240049d` : suppression du document de test résiduel (voir section 3).
- Non commités séparément dans ce commit-ci : `scripts/rekey-competition-participants.js`
  (déplacement) et corrections de `PLAN-spark-images-competition.md`/
  `SUIVI-quota-ecritures.md` (chiffre de lectures périmé) — voir section 7.

Déploiements : `--only hosting` pour V2.25/V2.26/V2.28 ;
`--only hosting,firestore:rules` pour V2.27 (seul commit touchant
`firestore.rules`).

---

## 6. Ce qui reste ouvert (inchangé, sauf mention contraire)

- **Écran live de classement sur TV** — débloqué (les `onSnapshot` initiaux
  du chantier 1 compétition restent réutilisables même si `ClientCompetitions.tsx`
  est passé en cache-first entretemps), toujours pas commencé.
- **Un projet Firebase par salle vs mutualisé** — à trancher avant tout
  développement multi-salles. C'est aussi à ce moment que le
  `getDocs(collection(db,'users'))` non filtré relevé dans le handoff
  précédent (section 2c) deviendra pertinent.
- **Stockage durable des sauvegardes d'images** (`--backup`), toujours ouvert.
- **`ClientDaily` : lecture non bornée au premier montage** — seul poste qui
  se dégrade avec le simple passage du temps (voir V2.26 point 2b). Le vrai
  chantier (compteur incrémental) reste à faire, pas trivial.
- ~~Document de test résiduel dans `competition_participants`~~ — **supprimé
  le 15/08/2026**, voir section 3 ci-dessus.
- **Correction admin des résultats après verrouillage** — les règles
  l'autorisent (`isUserRole("admin")` garde un accès libre), aucune interface
  ne l'exerce. Si une interface est construite un jour, la lecture
  cache-first côté client redevient un sujet (la correction ne remonterait
  pas automatiquement sur le téléphone du grimpeur, il faudrait invalider le
  cache local).

Rien de nouveau n'a été ouvert par ces quatre commits au-delà de ce qui est
listé ci-dessus — tout ce qui a été trouvé en creusant tes trois documents a
été corrigé et vérifié le même jour.

---

## 7. Suite du 15/08/2026 — ton retour sur ce handoff, 3 points traités

Trois observations justes, traitées dans la foulée (pas de nouveau commit
numéroté V2.29, ce sont des corrections de documentation + un déplacement de
script, aucun changement de comportement de l'app) :

### 7a. Le chiffre "7% de lectures" était périmé

Tu avais raison : `isParticipationSubmitted()` est évalué à **chaque
écriture** sur `competition_results` (80/grimpeur : 35 Réussi + 35 essais +
10 corrections), pas une fois par bloc validé (35) comme l'estimation
initiale du point 2 le supposait. Recalcul : 80 × 90 = 7 200 lectures
induites par cette seule règle, portant le total à **≈10 700-11 000 lectures
(21-22% du plafond)** au lieu des 7% affichés. Toujours confortable (loin de
la cible de 20 000), donc aucun correctif de code — seule la documentation
était fausse. Corrigé dans `PLAN-spark-images-competition.md` (nouvelle
section "Correction du 15/08/2026") et `SUIVI-quota-ecritures.md`
("Addendum #2"). Pas de remesure empirique : contrairement à la reprise d'un
`onSnapshot` (comportement non documenté par Google), le coût d'un
`get()`/`exists()` par écriture est déterministe — recalculer suffisait.

### 7b. La règle d'écriture était déjà protégée (vérifié, rien à changer)

Fausse alerte, mais légitime à vérifier : `isParticipationSubmitted()` a
**déjà** le garde `exists(partPath) && get(partPath)...` (même fonction,
appelée aussi bien depuis la règle `read` de `competition_participants` que
depuis les règles `create`/`update` de `competition_results`) — ajouté lors
du débogage initial de V2.27, avant même ton retour. Le test que tu demandais
existe déjà et passe : `competition-results-lock.test.ts`, *"un client sans
document de participation peut quand même écrire (repli sûr : exists() avant
get(), pas de crash de règle)"*. Confirmé en relisant `firestore.rules` et en
relançant `test:rules` (58/58). Rien à modifier ici.

### 7c. Script de migration déplacé

Fait : `firestore-migration/rekey-competition-participants.js` →
`scripts/rekey-competition-participants.js`, avec le même pattern de
credentials que `cleanup-orphan-boulder-images.js` (variable d'environnement
`FIREBASE_SERVICE_ACCOUNT_JSON` en priorité, repli sur le fichier local
`firestore-migration/serviceAccountKey.json`, jamais commité). Revérifié
fonctionnel depuis le nouveau chemin (dry-run contre la prod : 3
participations déjà migrées, rien à faire).

### Document de test résiduel — supprimé entretemps

Signalé comme encore ouvert dans ce handoff (section 3/6), mais supprimé sur
demande explicite de l'utilisateur juste après (doc
`competition_participants/Ue6AHXLFriXlufC4Bfn4`) — voir section 3, déjà mis à
jour ci-dessus.

---

## 8. Suite du 15/08/2026 (bis) — ta demande de vérification "par acquit de
conscience"

Tu avais raison de douter plutôt que de me croire sur parole : le recalcul
de 7a supposait que `exists(p) && get(p)` sur le même chemin compte pour 1
lecture facturée (pas 2), affirmé sans source au moment d'écrire
`isParticipationSubmitted`. Vérifié cette fois contre la documentation
officielle plutôt que ré-affirmé : [Understand Cloud Firestore billing](https://firebase.google.com/docs/firestore/pricing),
section "Cloud Firestore Security Rules" — *"You are charged for reads that
are necessary to evaluate your Cloud Firestore Security Rules. [...] You are
only charged one read per dependent document even if your rules refer to
that document more than once."*

Recoupé par deux méthodes indépendantes (citation avec paragraphe
environnant depuis la page officielle, puis recherche web qui retombe sur le
même passage cité comme extrait) pour écarter le risque d'hallucination d'un
résumé automatique sur une seule source.

**Confirmé : 1 lecture, pas 2.** Le chiffre de 7a (≈10 700-11 000, 21-22%)
reste le bon — s'il s'était agi de 2 lectures, le total serait monté à
≈18 000 (36%, toujours sous le plafond, mais le chiffre affiché aurait de
nouveau été faux). Le commentaire de `firestore.rules` sur
`isParticipationSubmitted` cite maintenant cette source directement, pour
qu'une prochaine relecture n'ait pas à re-vérifier la même chose.
