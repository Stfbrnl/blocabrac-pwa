# Handoff — Correctifs quota de lectures Firestore + perte de données en séance

> Rédigé le 14/08/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur), qui avait produit `SUIVI-quota-lectures-competition.md` plus tôt
> dans la journée. Déployé en production le même jour
> (https://blocabrac.web.app), commit `2dfa4a9`, poussé sur `main`.
>
> Objectif de ce document : donner tout le contexte nécessaire pour qu'une
> relecture ultérieure (par toi ou par l'utilisateur) comprenne ce qui a été
> fait, pourquoi, et ce qui reste ouvert — sans avoir à relire tout le diff.

---

## Résumé en cinq phrases

Ton constat était juste et a été confirmé par la mesure : `loadExistingResults`
et consorts dans `ClientCompetitions.tsx` dépassaient le plafond de lectures
Spark d'un facteur ×3,3 à 90 participants. Corrigé par des `onSnapshot` uniques
par compétition (gain mesuré ×47,6). En creusant le même schéma ailleurs dans
l'app à la demande de l'utilisateur, un bug **plus grave** a été trouvé en usage
quotidien normal (`ClientDaily.tsx`, non borné, continu), et un bug **différent**
(perte de données, pas de lectures) a été trouvé et corrigé dans les séances
moniteur (`ClientCourseSession.tsx`). Moniteur/ouvreur/admin ont été audités et
n'ont rien de comparable.

---

## 1. Ce qui a été mesuré et corrigé — compétition (ton périmètre initial)

### Constat confirmé par mesure directe

Script `frontend/test/measure-competition-reads.mjs` (émulateur, vrai client SDK
Firebase, authentifié comme un grimpeur, comptage des documents réellement
retournés — donc fidèle à la facturation Firestore réelle, pas une estimation
théorique). Deux scénarios :

| Scénario | Lectures/grimpeur | Extrapolé à 90 participants | vs plafond 50 000 |
|---|---|---|---|
| ~10 ouvertures de modale | 406 | 36 540 | 73% (marge trop fine) |
| 35 ouvertures (1/bloc, ton hypothèse "plancher") | 1 857 | 167 130 | **×3,3 le plafond** |

Confirmation d'un point que ton estimation théorique n'avait pas isolé :
`loadBoulders` (35 lectures rechargées **intégralement** à chaque ouverture,
alors que les blocs ne changent jamais pendant l'épreuve) pèse **autant** que
`loadExistingResults` — les deux se cumulent, ce qui aggrave le total par
rapport au calcul initial du suivi.

### Correctif appliqué — Option A de ton document (celle que tu recommandais)

Dans `ClientCompetitions.tsx` :

- `loadExistingResults` (un `getDocs` à chaque ouverture de modale) →
  `ensureResultsListener` : un `onSnapshot` sur `competition_results` filtré
  `user_id`+`competition_id`, monté une seule fois par compétition. Une ref
  (`activeResultsListener`, gardée par `compId`) évite de se réabonner (donc de
  refacturer le snapshot initial) tant que le grimpeur reste sur la même
  compétition.
- `loadBoulders` (deux `getDocs` fusionnés — blocs classiques + blocs
  quotidiens réutilisés — à chaque ouverture) → `ensureBouldersListener` : deux
  `onSnapshot` fusionnés, même garde par compétition.
- `isAlreadyRegistered` (un `getDocs` à chaque clic sur "Valider mes blocs")
  → mis en cache localement (`confirmedRegistrations`, un `Set<competitionId>`)
  une fois l'inscription confirmée.
- Nettoyage de tous les listeners au démontage de la page (`useEffect` de
  cleanup), pour ne pas laisser un abonnement Firestore actif après avoir
  quitté l'écran.

### Mesure après correctif

Script `frontend/test/measure-competition-reads-after.mjs` (même protocole,
simule fidèlement les gardes du nouveau code) :

| Scénario | Avant | Après | Facteur |
|---|---|---|---|
| ~10 ouvertures | 406/grimpeur (36 540 à 90) | 38/grimpeur (3 420 à 90, 7%) | ×10,7 |
| 35 ouvertures | 1 857/grimpeur (167 130 à 90) | 39/grimpeur (3 510 à 90, 7%) | ×47,6 |

Les deux scénarios "après" convergent vers ~3 500 lectures quel que soit le
nombre d'ouvertures de la modale — attendu, puisque la garde par compétition
rend les ouvertures répétées gratuites (0 lecture) : seul le premier montage de
page compte encore.

### L'erreur que tu as signalée dans le plan initial

`PLAN-spark-images-competition.md`, point 1.3, affirmait : *"Coût : ~35
lectures par ouverture, absorbées par le cache local une fois le chantier 3
fait."* C'était faux, et **cette erreur a été confirmée puis corrigée dans le
plan** (barrée avec renvoi vers ton document) : un `getDocs` en ligne interroge
**toujours** le serveur, la persistance IndexedDB (chantier 3) ne sert que de
repli hors ligne. Ça n'a rien absorbé du tout — la mesure "avant" a été prise
avec le chantier 3 déjà en place, et le problème était intégralement présent.

### Vérification

À chaque étape : `npm run build`/`lint`/`test`/`test:rules` verts, et
`e2e-competition-flow.mjs` (15 étapes, dont l'étape 8 qui teste spécifiquement
la reprise après rechargement — le point que le correctif ne devait surtout pas
casser) rejoué à 15/15 sous émulateur + serveur dev réel, pas seulement
lu/relu.

---

## 2. Ce qui a été trouvé en creusant plus loin (demande explicite de
   l'utilisateur, pas dans ton périmètre initial)

L'utilisateur a demandé si le même type de problème existait ailleurs — cours,
usage quotidien. Réponse : oui, deux choses différentes, une des deux pire que
le cas compétition.

### 2a. `ClientDaily.tsx` — même défaut, plus grave

`updateClassementProfile`, appelée à chaque clic Réussi/Échoué **et** à chaque
"Enregistrer" (jusqu'à 2 fois par bloc, 20-30 blocs/jour pour un grimpeur
assidu qui revient plusieurs fois dans la journée), refaisait un `getDocs` sur
**tout l'historique de réussites du grimpeur** (`client_boulder_results`,
`success == true`, sans limite de date).

Pourquoi c'est pire que le cas compétition :
- **Continu** : tourne tous les jours, pas un seul soir par an.
- **Non borné** : contrairement aux ~35 blocs fixes d'une compétition, cet
  historique grossit indéfiniment avec l'ancienneté du compte (des centaines
  de blocs après quelques mois d'usage régulier).
- **Fréquence élevée** : jusqu'à 40-60 appels/jour pour un grimpeur assidu,
  chacun relisant tout le passif.

Avec quelques dizaines de grimpeurs réguliers, ce mécanisme pouvait à terme
dépasser le plafond quotidien **sans aucune compétition** — un tas de fond qui
grossit chaque jour, contrairement à un pic ponctuel.

**Correctif** : même principe qu'en compétition, adapté (pas d'`onSnapshot`
ici, un chargement unique suffit puisque l'historique n'a pas besoin d'être
temps réel multi-onglets pour ce cas d'usage) :
- `successfulAttemptsRef` : `Map<boulderId, attempts>` chargée une fois au
  montage de la page (un seul `getDocs`).
- `initialResultsLoadedRef` : une promesse que `updateClassementProfile` attend
  avant de muter le cache, au cas où un clic arrive avant la fin du chargement
  initial (protection contre une course).
- `updateClassementProfile` prend maintenant `(uid, boulderId, success,
  attempts)` en paramètres — elle connaît déjà la valeur qu'elle vient
  d'écrire, elle n'a plus besoin de la relire. Elle met à jour la `Map` en
  mémoire (ajoute/retire selon `success`) puis recalcule le résumé
  (`summarizeValidatedResults`) et écrit `classement_profiles`.

Vérifié via `e2e-daily-flow.mjs`, 7/7 étapes (le classement en continu reste
juste après validation et après note).

### 2b. `ClientCourseSession.tsx` — audité, rien à corriger côté lectures, mais
   un bug de perte de données trouvé et corrigé

Côté lectures : `fetchSession` (séance + résultats déjà écrits) ne s'exécute
qu'une fois au montage de la page. Aucun `getDocs` déclenché par un clic. Déjà
le bon pattern.

Mais en l'auditant, un **bug de fiabilité distinct** (pas un problème de
quota) a été repéré : les résultats de séance (`validationResults`,
`boulderResults`) restaient uniquement en state React jusqu'au clic final
"Enregistrer les résultats" (`handleSubmitResults`, qui bouclait sur tout et
écrivait en une fois). Un onglet fermé ou un rechargement **avant** ce clic
perdait toute la progression de la séance — un grimpeur qui valide 5 exercices
puis ferme l'appli par erreur (ou dont l'onglet est déchargé en arrière-plan
sur iOS/Android) perd tout.

C'est exactement le bug que le chantier 1 de ton plan compétition avait déjà
corrigé côté compétition ("résultats écrits au fil de l'eau"). L'utilisateur a
explicitement demandé que ce soit corrigé avant le commit, avec un test dédié.

**Correctif**, même principe que côté compétition :
- `persistExerciseResult(exerciseId, result)` et `persistBoulderResult(boulderId,
  miniCompetitionId, boulderColor, result)` écrivent immédiatement dans
  `client_course_results` (`setDoc(..., {merge:true})`).
- `createdAt` n'est posé qu'à la première écriture par document
  (`persistedExerciseIds`/`persistedBoulderResultIds`, peuplés au chargement
  initial et à chaque écriture) — préserve le comportement lu par
  `ClientStats.tsx` (qui utilise `createdAt` comme date de validation pour les
  stats/badges).
- Réussi/Échoué → écriture immédiate (`immediate=true`), comme en compétition.
- Essais / champs de données libres → debounce ~800ms (`debounceTimers`, même
  mécanisme que `ClientCompetitions.tsx`), pour ne pas écrire à chaque
  interaction avec un `Select`/`TextField`.
- `handleSubmitResults` ne fait plus qu'annuler les debounces en attente et
  réécrire l'état courant en une passe (idempotent, garantit qu'aucune saisie
  très récente <800ms n'est perdue avant la navigation), puis confirme et
  navigue vers `/client/courses`.

**Test ajouté** : une nouvelle étape dans `frontend/test/e2e-course-flow.mjs`,
insérée entre la validation d'un exercice et le clic sur "Enregistrer" — le
client clique "✅ Réussi", **recharge la page sans jamais cliquer sur
"Enregistrer"**, et le test vérifie que la validation est toujours affichée
comme "contained" (donc active) après rechargement. C'est le scénario qui
échouait avant ce correctif. Résultat : 11/11 étapes réussies (contre 9 avant,
l'étape supplémentaire ne remplace rien, elle s'insère).

### 2c. Moniteur / Ouvreur / Admin — audité, rien de comparable

Écrans consultés : `StatsList.tsx` (moniteur), `CompetitionStats.tsx` (ouvreur
et admin), `AdminUsers.tsx`, `MessagesList.tsx`, `AdminCompetitionRegistration.tsx`,
etc. Tous chargent leurs données une fois par montage de page, sans requête
refaite à chaque clic ni `setInterval`/polling. Le volume de lectures y est
borné par la fréquence d'usage du staff (quelques personnes, usage occasionnel),
pas multiplié par les actions des 90 clients — pas le même ordre de risque, pas
de correctif nécessaire.

**Point de vigilance noté mais non traité** (pas urgent) : plusieurs de ces
écrans (`CompetitionStats.tsx`, `AdminCompetitionStats.tsx`,
`AdminCompetitionRegistration.tsx`, `AdminUsers.tsx` ×4, `BoulderStats.tsx`,
`CompetitionBoulderStats.tsx`) font un `getDocs(collection(db, 'users'))` non
filtré (liste complète des comptes). Ça grossira avec le nombre total de
comptes au fil des années, mais reste staff-driven donc basse fréquence. À
reconsidérer si l'app passe à l'échelle multi-salles (voir le point "un projet
Firebase par salle" dans `SUIVI-quota-lectures-competition.md`).

---

## 3. Fichiers modifiés (commit `2dfa4a9`, poussé sur `main`, déployé sur
   `blocabrac.web.app`)

- `frontend/src/pages/Client/Competitions/ClientCompetitions.tsx` — onSnapshot +
  caches (section 1).
- `frontend/src/pages/Client/Daily/ClientDaily.tsx` — cache mémoire de
  l'historique de réussites (section 2a).
- `frontend/src/pages/Client/Courses/ClientCourseSession.tsx` — écriture au fil
  de l'eau (section 2b).
- `frontend/test/e2e-course-flow.mjs` — nouvelle étape de reprise après
  rechargement (section 2b).
- `frontend/test/measure-competition-reads.mjs` (nouveau) — script de mesure
  "avant", jetable, lancé manuellement sous `firebase-tools emulators:exec`.
- `frontend/test/measure-competition-reads-after.mjs` (nouveau) — même chose,
  "après".
- `PLAN-spark-images-competition.md` — mesures avant/après consignées,
  correction du point 1.3.
- `SUIVI-quota-lectures-competition.md` (ton document, déplacé de la racine où
  tu l'avais laissé vers le suivi git normal) — addendum du 14/08 documentant
  tout ce qui précède.

Aucun changement à `firestore.rules` — tous les correctifs restent dans les
patterns d'écriture déjà autorisés par les règles existantes (`canValidateCourse`,
`competition_results` write, etc.). Déploiement fait avec `--only hosting`
uniquement, pas de `--only firestore:rules`.

---

## 4. Ce qui reste ouvert (inchangé depuis ton document, sauf mention contraire)

- **Écran live de classement sur TV.** Débloqué par le chantier 1 (déjà fait)
  et maintenant aussi par l'option A de ce correctif (les listeners
  `onSnapshot` sont directement réutilisables). Toujours pas commencé.
- **Un projet Firebase par salle vs mutualisé** pour la revente multi-salles.
  Toujours à trancher avant tout développement orienté multi-salles — c'est
  aussi le moment où le point de vigilance `getDocs(collection(db,'users'))`
  non filtré (section 2c) deviendra pertinent à traiter.
- **Stockage durable des sauvegardes d'images** (`--backup`), toujours ouvert.
- **Mesure réseau navigateur du cache au rechargement**, toujours en attente
  d'un vrai onglet Réseau.

Rien de nouveau n'a été ouvert par ce chantier — tout ce qui a été trouvé a été
corrigé et vérifié le même jour.
