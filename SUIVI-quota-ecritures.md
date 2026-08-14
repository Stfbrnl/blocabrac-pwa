# Suivi — Le quota d'écritures : mesurer puis réduire

> Note rédigée le 15/08/2026 par la session Claude (navigateur).
> À destination de Claude Code dans le Codespace.
>
> **Contexte.** Les lectures ont été mesurées et corrigées (≈3 500 pour 90 participants,
> 7 % du plafond de 50 000). **Les écritures ne l'ont jamais été, à aucun moment.**
> L'estimation du plan initial (« ~3 150 minimum, viser < 8 000 ») sous-évaluait le
> poste : elle ne comptait pas le verrouillage, facturé par document.
>
> **Statut : à traiter avant la compétition à 90 participants.** Rien ne casse
> aujourd'hui. La marge estimée sur les écritures est de l'ordre du facteur 2, contre un
> facteur 10 sur les lectures — c'est désormais le compteur le plus tendu.
>
> **Contrainte inchangée : gratuité totale, plan Spark, pas de Cloud Functions.**

---

## Le principe directeur

Les deux quotas Spark sont indépendants et tous deux inclus dans le forfait :

| Compteur | Plafond/jour | Estimé pour la compétition | Marge |
|---|---|---|---|
| Lectures | 50 000 | ~3 500 (mesuré) | ×14 |
| Écritures | 20 000 | 8 000 à 12 000 (estimé) | ×2 |

**Toute transformation d'une écriture en lecture est donc gagnante**, et gratuite. C'est
le levier principal de cette note — en particulier au point 2, où un `get()` dans les
règles remplace 35 écritures.

---

## Point 0 — Mesurer (préalable, sans quoi tout le reste est à l'aveugle)

Le protocole existe : les scripts de mesure des lectures
(`measure-competition-reads*.mjs`) se transposent aux écritures sans difficulté — même
approche, vrai client SDK sous émulateur, comptage des opérations réellement émises.

Parcours à simuler pour **un grimpeur**, au plus près du réel :

1. inscription à la compétition ;
2. 35 validations (clic Réussi/Échoué + saisie du nombre d'essais) ;
3. une dizaine de corrections (rouvrir une modale, changer une valeur) ;
4. quelques ouvertures/fermetures **sans modification** (voir point 3) ;
5. verrouillage final.

Extrapoler à 90, puis **ajouter l'usage quotidien de la salle le même jour** : le plafond
de 20 000 est partagé, la compétition ne se déroule pas dans une journée vide.

Consigner le résultat en tête de `PLAN-spark-images-competition.md`, à côté des mesures de
lectures et de transfert. Refaire la mesure après correctifs.

**Cible : rester sous 8 000 écritures pour l'ensemble de la compétition**, afin de
conserver plus de la moitié du plafond pour le reste de la journée.

---

## Point 1 — Ce qui n'est PAS en cause

Pour éviter des optimisations inutiles :

- **Les validations elles-mêmes.** Une validation = une écriture, c'est irréductible et
  c'est la donnée. ~3 150 écritures pour 90×35, c'est le plancher incompressible.
- **Les lectures.** Facteur 14 de marge après correctifs. Il y a de la place pour en
  ajouter si cela économise des écritures (c'est tout l'objet du point 2).
- **Le transfert sortant.** ~95 Mo mesurés pour la compétition, contre 10 GiB/mois.

---

## Point 2 — Le verrouillage : déplacer `submitted` sur la participation

**C'est le gain principal : environ 3 000 écritures, soit à peu près un tiers du total
estimé.**

### Constat

`handleLockResults` pose `submitted: true` + `submitted_at` sur **chacun des 35 documents**
`competition_results` du grimpeur, via un `writeBatch`. Un `writeBatch` est atomique, mais
**facturé par document** : 35 écritures par grimpeur, soit ~3 150 pour 90 participants —
uniquement pour basculer un booléen.

### Le raisonnement

L'état de soumission ne caractérise pas le résultat d'un bloc : il caractérise la
**participation du grimpeur à la compétition**. Il est aujourd'hui dupliqué 35 fois sur
des documents dont ce n'est pas la responsabilité.

En le portant sur le document `competition_participants` du grimpeur — qui existe déjà —
le verrouillage passe de **35 écritures à 1**.

### Ce que ça implique

**Schéma.** Ajouter `submitted: boolean` et `submitted_at: string | null` sur
`competition_participants`. Conserver les champs existants sur `competition_results`
pendant la transition (repli, et compatibilité des compétitions déjà déroulées).

**`firestore.rules`.** La règle d'écriture sur `competition_results` doit lire le document
de participation pour vérifier le verrou :

- un `get()` dans une règle est facturé comme **une lecture** ;
- soit ~3 000 lectures supplémentaires sur la compétition, portant le total à ~7 000 sur
  50 000 — toujours 14 % du plafond ;
- **c'est exactement l'arbitrage favorable décrit en tête de note** : 3 000 écritures
  échangées contre 3 000 lectures.

Attention au coût réel du `get()` : il est facturé **à chaque évaluation de règle**, donc
à chaque validation, pas une fois par grimpeur. Le chiffre ci-dessus en tient compte
(≈1 `get()` par validation).

**Code applicatif.** `handleLockResults` écrit un seul document. La lecture de l'état de
soumission (affichage « Résultats soumis le … », désactivation des contrôles) se fait
depuis la participation, plus depuis les résultats — ce qui évite au passage de parcourir
35 documents pour connaître un booléen.

**Tests.** Adapter `frontend/test/competition-results-lock.test.ts` (5 tests existants) :
la sémantique change, les garanties doivent rester identiques.

- un client peut modifier son résultat tant que sa participation n'est pas verrouillée ;
- un client **ne peut pas** modifier un résultat une fois sa participation verrouillée ;
- un client ne peut pas verrouiller la participation d'un autre ;
- un client ne peut pas déverrouiller sa propre participation ;
- l'admin conserve son accès sans restriction.

Adapter également `e2e-competition-flow.mjs` (étape de verrouillage).

**Migration.** Vérifier ce que deviennent les compétitions déjà déroulées : soit un script
ponctuel dans `firestore-migration/` qui pose `submitted` sur les participations
existantes, soit un repli en lecture sur l'ancien champ. Trancher explicitement plutôt que
de laisser un état hybride implicite.

### Bénéfices annexes

- Le verrouillage devient réellement atomique (un document, pas un lot de 35).
- Un seul point de vérité pour l'état de soumission, au lieu de 35 copies pouvant diverger
  en cas d'écriture partielle.

---

## Point 3 — Ne pas écrire quand rien n'a changé

Sans risque, gain difficile à chiffrer d'avance mais réel — le point 0 le mesurera.

Aujourd'hui, une écriture part même quand la valeur est identique à la précédente :

- un grimpeur rouvre une modale, regarde, referme ;
- il resélectionne la même valeur dans un `Select` ;
- il reclique « Réussi » sur un bloc déjà marqué réussi.

**Correctif** : comparer à la dernière valeur **persistée** (pas à la valeur affichée)
avant d'émettre l'écriture, et ne rien envoyer si elle est inchangée. Conserver une
référence des dernières valeurs écrites par document.

À appliquer aux trois écrans qui écrivent au fil de l'eau :
`ClientCompetitions.tsx`, `ClientCourseSession.tsx`, `ClientDaily.tsx`.

---

## Point 4 — Allonger le debounce, avec précaution

Le debounce est aujourd'hui à ~800 ms. C'est court pour un sélecteur d'essais qu'on ajuste
en plusieurs clics successifs : chaque pause dépassant 800 ms déclenche une écriture
intermédiaire.

**Passer à 2-3 s** réduit le nombre d'écritures par correction.

⚠️ **Conditions impératives, sans lesquelles ce changement réintroduit exactement la perte
de données que le chantier 1 a corrigée :**

- **vider la file en attente à la fermeture de la modale** (flush synchrone) ;
- **vider la file sur `pagehide`** (et non `beforeunload`, peu fiable sur mobile) — c'est
  le cas du grimpeur qui range son téléphone et dont l'onglet est déchargé ;
- **le clic Réussi/Échoué reste immédiat**, jamais debouncé. C'est l'information qu'on ne
  veut jamais perdre, et c'est déjà le comportement actuel : ne pas le changer.

Si l'un de ces trois points n'est pas tenu, **ne pas allonger le debounce** : le gain ne
vaut pas le risque.

---

## Point 5 — `classement_profiles` : débrayer l'écriture du quotidien

À vérifier dans `ClientDaily.tsx` : `updateClassementProfile` écrit
`classement_profiles` à chaque clic Réussi/Échoué **et** à chaque « Enregistrer », soit
jusqu'à 2 écritures par bloc, en plus de l'écriture du résultat lui-même.

L'usage quotidien de la salle continue le jour de la compétition et partage le même
plafond de 20 000. Ce poste est donc à traiter dans le même chantier, pas séparément.

**Correctif** : debounce de quelques secondes sur cette écriture spécifique. Le classement
n'a aucun besoin d'être exact à la seconde près — c'est un résumé dérivé, pas la donnée
source. Le résultat du bloc, lui, continue d'être écrit immédiatement.

Mêmes précautions de flush qu'au point 4.

---

## Addendum du 15/08/2026 — points 3, 4 et 5 traités

Appliqués aux trois écrans (`ClientCompetitions.tsx`, `ClientCourseSession.tsx`,
`ClientDaily.tsx`) :

- **Point 3** : chaque écran garde désormais une ref de la dernière valeur réellement
  persistée par document (`lastPersistedRef`/`lastPersistedExerciseRef`/
  `lastPersistedBoulderRef`/`lastPersistedResultRef`), comparée avant d'écrire —
  identique = rien envoyé à Firestore. Pour les deux écrans qui rechargent déjà l'état
  existant au montage (compétition, cours), la ref est aussi peuplée à ce chargement,
  pour qu'une première interaction reproduisant l'état déjà en base ne déclenche rien
  non plus. `ClientDaily.tsx` ne charge pas l'état existant au montage (volontairement,
  pour ne pas rouvrir le chantier lectures) : sa comparaison ne couvre que la session en
  cours, plus faible mais toujours utile (reclic sur un bouton déjà actif, "Enregistrer"
  sans changement).
- **Point 4** : debounce porté de 800ms à 2500ms sur `ClientCompetitions.tsx` et
  `ClientCourseSession.tsx` (essais/note/cotation/données saisies). Les trois conditions
  du suivi sont tenues : flush synchrone à la fermeture de la modale/soumission
  (`flushPendingResults`), flush sur l'évènement `pagehide`, clic Réussi/Échoué toujours
  immédiat (inchangé).
- **Point 5** : l'écriture `classement_profiles` dans `ClientDaily.tsx` est débranchée de
  l'écriture immédiate du résultat — désormais debounced à 3000ms
  (`flushClassementWrite`/`CLASSEMENT_DEBOUNCE_MS`), avec flush sur fermeture de la
  modale de détail (Annuler/Enregistrer) et sur `pagehide`. Le résultat du bloc
  (`client_boulder_results`) continue d'être écrit immédiatement, seul le résumé dérivé
  est différé.

**Bug de fermeture obsolète (stale closure) trouvé et corrigé en implémentant le flush
"pagehide"** : dans `ClientCompetitions.tsx`, un `useEffect` à dépendances vides
enregistrant directement la fonction de flush l'aurait figée sur le tout premier rendu
(donc sur `user`/`selectedCompetition` encore à `null`, avant résolution de
l'authentification) — le flush sur fermeture d'onglet n'aurait alors jamais rien écrit
en pratique. Corrigé avec le pattern ref (`flushPendingResultsRef`, tenu à jour après
chaque rendu via un effet sans dépendances, jamais pendant le rendu lui-même — ESLint
`react-hooks/refs` interdit la mutation d'une ref pendant le rendu). `ClientCourseSession.tsx`
n'avait pas ce problème : ses entrées de debounce stockent un callback de flush créé au
moment du clic (donc déjà lié à un rendu où `user`/`session` sont réels), pas une
référence à la fonction englobante.

Vérifié : `build`/`lint`/`test`/`test:rules` verts (58 tests), et les trois flux
Playwright complets rejoués sans régression : `e2e-competition-flow.mjs` 15/15,
`e2e-course-flow.mjs` 11/11, `e2e-daily-flow.mjs` 7/7.

Pas de nouvelle mesure chiffrée pour ces trois points (contrairement aux points 0 et 2) —
le suivi lui-même prévenait que le gain est réel mais difficile à chiffrer d'avance, et
dépend du comportement réel des grimpeurs (nombre de corrections, pauses entre clics).

---

## Ce que je déconseille explicitement

**Regrouper les 35 résultats d'un grimpeur dans un document unique.** Séduisant en
apparence, mais :

- ça ne réduit **pas** les écritures de validation — une validation reste une écriture, et
  c'est le plancher incompressible ;
- ça touche `firestore.rules`, tous les écrans de statistiques qui agrègent par bloc
  (`BoulderStats.tsx`, `CompetitionStats.tsx`, `AdminCompetitionStats.tsx`), et exige une
  migration de l'historique ;
- ça crée un point de contention en écriture sur un même document.

Beaucoup de surface remuée pour un gain que les points 2 à 5 obtiennent sans rien
restructurer.

**Un document d'agrégat de classement écrit par les clients** est également exclu :
Firestore plafonne à environ une écriture par seconde soutenue sur un même document, et 90
grimpeurs garantissent la contention dans les rafales de fin de rotation.

---

## Le jour J — deux mesures sans développement

Indépendamment de tout correctif :

- **Relever les compteurs à mi-parcours** dans la console Firebase (onglet Usage). Si la
  trajectoire est mauvaise, il reste du temps pour réagir.
- **Décider du plan de repli à froid.** Si un quota saute, Firestore renvoie des erreurs et
  l'application s'arrête — aucune dégradation gracieuse n'a été conçue. Les résultats déjà
  écrits sont en base et le classement reste calculable, mais mieux vaut avoir prévu le
  papier et le crayon que de l'improviser.

**Le plus utile resterait une répétition à 10-15 personnes sur une vingtaine de blocs** :
elle donne des chiffres réels à extrapoler, et fait apparaître les problèmes de
concurrence que ne montre aucune mesure mono-utilisateur (toutes les mesures existantes,
lectures comprises, portent sur un grimpeur seul).

---

## État des points ouverts (rappel)

- **Écran live de classement sur TV** — débloqué, non commencé.
- **Un projet Firebase par salle vs mutualisé** — à trancher avant tout développement
  multi-salles.
- **`ClientDaily` : lecture non bornée au premier montage** — le bornage saisonnier a été
  vérifié puis écarté (classement cumulatif à vie). Le compteur incrémental reste le vrai
  chantier, non trivial à cause de `bestColorRank`. **Seul poste qui se dégrade avec le
  simple passage du temps.**
- **Stockage durable des sauvegardes d'images** (`--backup`).
- **Correction admin des résultats après verrouillage** — les règles l'autorisent, aucune
  interface ne l'exerce. Si une interface est construite un jour, la lecture cache-first
  côté client redevient un sujet (la correction ne remonterait pas sur le téléphone du
  grimpeur). À rattacher à ce chantier-là.

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté dans
  le code final.
