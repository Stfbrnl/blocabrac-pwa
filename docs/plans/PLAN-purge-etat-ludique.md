# Plan — Purge de l'état ludique hors de `users`, et réponses au §9

> Rédigé le 02/10/2026 par la session Claude (navigateur), à la demande de l'utilisateur.
> Suite de `PLAN-etat-ludique-hors-users.md` (Passe C déployée en V2.61 le 12/09) et de
> `HANDOFF-ludic-state-backfill-simulation-2026-09-17.md`.
>
> **C'est la seule opération destructive du chantier.** Les conditions étaient réunies au
> 17/09, mais quinze jours ont passé et le dépôt a bougé : le §1 dit ce qu'il faut refaire
> avant, le §2 ce qui n'a jamais été vérifié, le §3 la procédure.
>
> Le §6 répond aux quatre questions du handoff du 02/10.

---

## §0 — Rappel de l'objectif, parce qu'il conditionne la recette

`users/{uid}` portait quatre champs d'état ludique — `weeklyGoalItems`, `wallCounts`,
`rouletteChallengesCompleted`, `rouletteRecentChallenges` — et les écrans staff chargent
`getDocs(collection('users'))` **sans projection**. Le client Firestore ne sait pas projeter :
tout le document passe sur le réseau, pour chaque utilisateur, à chaque ouverture.

Passe C a déplacé les **écritures** vers `user_ludic_state`. La purge supprime les copies
restées sur `users`. **Le gain ne se constate qu'après** — d'où le §4, qui n'est pas une
formalité mais le critère d'acceptation du chantier.

---

## §1 — Trois choses à régler **avant** de lancer quoi que ce soit

### 1.1 — 🔴 Remettre `npm test` au vert d'abord

Deux tests de `classementFlushWrites.test.ts` sont rouges sur `main` depuis le passage en
semaine W40 (handoff du 02/10, §6). Ce n'est pas une régression, mais ça bloque quand même
cette opération-ci, pour une raison précise :

**la suite rouge est exactement celle qui garde l'invariant lectures/écritures du flush
partagé — c'est-à-dire le code qui écrit `user_ludic_state`.** Lancer une purge destructive
sur la collection adjacente pendant que son filet est hors service, c'est se priver du seul
signal qui dirait que quelque chose a bougé.

Le correctif proposé par Claude Code est le bon : **dériver la semaine** (`isoWeekKey(new
Date())`) ou passer une date de référence, plutôt que de la figer. Et faire l'inventaire des
autres fixtures à date figée dans la foulée — il est annoncé comme non fait.

### 1.2 — Décider le sort de V2.71.3 avant d'écrire un log en prod

V2.71.3 est **commitée localement, ni poussée ni déployée**. Or la purge produit un journal
qui se commite, comme le fait le workflow mensuel de réconciliation.

⚠️ **Pousser le log pousserait V2.71.3 avec lui**, et donc mettrait sur `main` un correctif
que l'utilisateur a explicitement choisi de ne pas déployer encore.

Trois sorties, à trancher avant :
- pousser **et** déployer V2.71.3 (le correctif de la carte de partage est prêt et vérifié) ;
- la garder locale et **ne pas commiter le log** de la purge tout de suite ;
- la mettre de côté sur une branche.

Peu importe laquelle, mais il faut choisir sciemment plutôt que de le découvrir au `git
push`.

### 1.3 — Rejouer la simulation : les chiffres du 17/09 ont quinze jours

La simulation du 17/09 donnait **16 comptes candidats, 0 champ jamais migré**. Depuis,
l'audit du 25/09 compte **59 `users`** et **30 `user_ludic_state`**. Les comptes créés depuis
le 12/09 le sont par le nouveau code et ne portent pas de champ legacy — le nombre de
candidats devrait donc être **inchangé ou en baisse**.

**S'il a augmenté, s'arrêter** : cela voudrait dire que quelque chose écrit encore sur
`users`, ce qui contredit toute l'investigation du 17/09.

---

## §2 — ⚠️ La vérification qui n'a jamais été faite : **qui lit encore ces champs ?**

C'est le point le plus important de ce plan, et il n'apparaît dans aucun document précédent.

L'investigation du 17/09 a cherché, et n'a pas trouvé, de code qui **écrit** encore sur
`users`. Elle n'a **pas** cherché de code qui **lit** encore ces champs.

Un repli de lecture du type

```ts
const counts = ludic.wallCounts ?? user.wallCounts;
```

survit **silencieusement** tant que le champ existe sur `users`, puisqu'il n'est jamais
atteint. Il se met à compter le jour où le champ disparaît — et le symptôme serait un
compteur à zéro, pas une erreur.

C'est exactement la famille d'échecs déjà consignée trois fois dans `CLAUDE.md` : *tout a
l'air correct*.

**À faire avant la purge** — un `grep` sur les quatre noms de champs, dans
`frontend/src/` **et** dans `scripts/` :

```
weeklyGoalItems
wallCounts
rouletteChallengesCompleted
rouletteRecentChallenges
```

Pour chaque occurrence, trancher : lit-elle `user_ludic_state` (bien) ou un document `users`
(à corriger **avant** la purge) ? Suspects naturels : `AdminUsers.tsx`, `MoniteurScreen.tsx`,
`StatsList.tsx`, `ClientScreen.tsx`, et les scripts de réconciliation.

**Cas connu et attendu** : `backfill-ludic-state.js` lit évidemment ces champs sur `users` —
c'est son rôle. Voir §5.

---

## §3 — La procédure

### 3.1 — Sauvegarde : dumper avant de supprimer

Le plan Spark ne donne pas accès à l'export managé de Firestore. Une suppression de champ est
donc **définitive et sans retour**.

En théorie rien n'est perdu : la purge ne supprime que des copies déjà migrées, et le script
refuse par construction de supprimer un champ absent de `user_ludic_state`. Le risque est
faible. Mais il est faible, pas nul, et la différence entre « on pense que rien n'est perdu »
et « on peut le prouver » coûte ici une vingtaine de lignes.

**Avant `--fix`** : dumper les quatre champs des comptes candidats dans un JSON local
(16 documents, quelques kilo-octets). **Hors du dépôt** ou dans un chemin gitignoré — ce
sont des données utilisateurs, elles n'ont rien à faire dans un commit.

### 3.2 — Vérifier que le script sait où il tape

Avant toute opération destructive, le script doit **afficher le projet visé et attendre une
confirmation**. À vérifier dans `purge-legacy-ludic-fields.js` ; si ce n'est pas le cas,
l'ajouter — c'est trois lignes, et le dépôt contient désormais à la fois des identifiants de
prod sur le PC et un helper `resetEmulators()` dans l'arbre de tests. La question « sur quoi
suis-je branché » n'est plus théorique.

### 3.3 — Enchaînement

1. Simulation : `node purge-legacy-ludic-fields.js` (sans `--fix`).
2. **Lire la sortie et la comparer au 17/09** : 16 candidats, 0 champ jamais migré.
   - ⚠️ **Tout champ signalé « jamais migré » arrête l'opération.** C'est le seul garde-fou
     du script, et il signalerait une divergence réelle entre les deux collections.
3. Dump de sauvegarde (§3.1).
4. `node purge-legacy-ludic-fields.js --fix`.
5. Relancer la simulation : elle doit trouver **0 candidat**.
6. Log, selon la décision du §1.2.

### 3.4 — Contrôle fonctionnel immédiatement après

Sur un compte de test, dans l'application :
- la grille de missions de la semaine s'affiche et progresse ;
- les compteurs de murs sont intacts ;
- le compteur de roulettes relevées est intact ;
- l'objectif hebdomadaire personnel est intact.

Ce sont les quatre champs purgés. Si l'un d'eux retombe à zéro, c'est le repli de lecture du
§2 qui n'avait pas été trouvé.

---

## §4 — La mesure, qui est le critère d'acceptation

Le chantier a été lancé pour réduire le volume réseau des écrans staff. **Sans mesure, on ne
saura pas s'il a servi.**

Ouvrir `AdminUsers.tsx`, onglet Réseau des outils de développement, et relever le poids de la
requête `users` — **après** la purge. La valeur d'avant n'a, à ma connaissance, jamais été
relevée non plus ; si elle ne l'a pas été, la mesure d'après vaut quand même comme référence
pour la suite, et comme vérification que le gain est réel plutôt que supposé.

À consigner dans le handoff, chiffre à l'appui. C'est la dernière étape du plan de septembre,
et elle est restée ouverte depuis.

---

## §5 — Ce que la purge règle au passage : le piège de `backfill-ludic-state.js`

Rappel du garde-fou en vigueur depuis le 17/09 : **ne jamais relancer
`backfill-ludic-state.js --fix`**, parce qu'il écrase dans les deux sens et régresserait tout
compte dont `user_ludic_state` est plus récent que la copie figée sur `users`.

**Après la purge, ce piège disparaît** : il n'y a plus rien sur `users` à recopier par-dessus.
Le script devient inoffensif parce qu'inopérant.

**Deux conséquences à traiter dans le même lot :**
- marquer le script comme **obsolète** en tête de fichier (daté, avec la raison), plutôt que
  le supprimer — il documente la migration ;
- **retirer le garde-fou** des points ouverts et de `CLAUDE.md`, en disant pourquoi il ne
  s'applique plus. Un avertissement devenu faux qu'on continue de recopier, c'est exactement
  ce que le §7.4 du handoff vient de documenter sur `aide-connexion-installation.html` — sept
  transports sans relecture. Autant ne pas en créer un nouveau le jour même.

---

## §6 — Réponses aux quatre questions du §9 du handoff

### 6.1 — Un filet permanent sur la carte de partage ? **Oui, mais pas celui qu'on croit**

Le réflexe « test visuel » fait penser à une image de référence comparée pixel à pixel. Ce
serait effectivement une fausse bonne idée : crénelage, versions de polices, machine de
rendu — ça casse pour de mauvaises raisons et on finit par l'ignorer.

**Mais ce n'est pas ce que le harnais a fait**, et c'est tout l'intérêt. Il a posé une
question binaire : *« la zone du libellé contient-elle autre chose que le fond ? »* Cette
assertion-là est **robuste** — elle ne dépend ni de la police, ni du crénelage, ni du texte
exact. Elle n'aurait pas pu passer au vert avec un libellé absent.

**Donc oui**, et c'est une catégorie nouvelle pour le projet : un test de rendu, sans
émulateur ni compte. Qu'il vive dans un dossier à lui (`test/render/`) plutôt que parmi les
e2e, dont il ne partage ni les prérequis ni la durée.

L'argument décisif est celui du §7.2 du handoff : **c'est le seul artefact de l'application
qui en sort**. Un écran faux se corrige au prochain déploiement ; une image publiée est
définitive.

### 6.2 — `LIGHT_LEVELS` local ou partagé ? **Partagé — mais ce n'est pas une refactorisation**

Je rejoins la conclusion, pas le raisonnement. La duplication de la règle dans six écrans
n'est pas un problème d'élégance : **la règle dupliquée est fausse**. « Noir si blanc, blanc
sinon » donne du blanc sur jaune, et un grimpeur de niveau jaune voit son libellé illisible
**aujourd'hui, dans six écrans**.

Ce n'est donc pas un chantier de refactorisation greffé sur un correctif, c'est **un bug de
lisibilité présent en production**, dont la carte de partage n'était qu'une instance.

`textColorForLevel()` dans `gymConfig.ts`, les six écrans alignés dessus. **Mais dans sa
propre version**, pas dans V2.71.3 : ça change l'apparence de six écrans, donc ça demande un
contrôle visuel — et le contrôle visuel est précisément ce qui manque le plus en ce moment.

### 6.3 — Sortir de `html2canvas` ? **Pas maintenant, et pas sous cette forme**

Dessiner la carte directement sur un `<canvas>` créerait **deux rendus de la même carte** :
celui affiché à l'écran et celui exporté. C'est exactement le défaut qui vient d'être corrigé
sur le badge, où l'en-tête de la grille montrait encore une médaille quand « Mes stats »
montrait un tampon. Deux rendus divergent toujours, c'est une question de temps.

La seule forme qui tiendrait, le jour venu : **un seul rendu canvas, affiché à l'écran *et*
exporté**. Là il n'y a plus d'écart possible, et la question des polices et des proportions
est réglée définitivement.

Tant que la carte reste simple, `html2canvas` plus le filet du §6.1 suffit. Si elle grossit —
saison, missions, tampon —, c'est le rendu canvas unique qu'il faudra viser, pas un doublon.

### 6.4 — Changer le rituel des points ouverts ? **Oui, et une seule règle suffit**

Un item transporté sept fois sans relecture, c'est le même mécanisme que les avertissements
permanents de l'audit : *ce qu'on recopie sans relire finit par ne plus rien vouloir dire*.

**La règle minimale : tout point ouvert reporté porte la date de sa dernière vérification.**

Un item daté du 16/08 qu'on recopie le 02/10 se signale tout seul. Pas besoin de rituel plus
lourd : la date fait le travail, et elle coûte quatre caractères.

Dans la foulée, trancher l'autre moitié de la ligne — *« on ne sait pas si Dosis s'affiche
dans `topo-blocabrac.pdf` »* — qui traîne depuis le même jour et se vérifie en deux minutes
avec le genre de harnais écrit aujourd'hui.

---

## §7 — Ordre d'exécution

1. Remettre `npm test` au vert (§1.1), et inventorier les autres fixtures à date figée.
2. Trancher le sort de V2.71.3 (§1.2).
3. `grep` des quatre champs, côté lectures (§2) — **c'est l'étape qui peut tout arrêter**.
4. Simulation, comparaison au 17/09 (§1.3, §3.3).
5. Dump de sauvegarde (§3.1), confirmation du projet visé (§3.2).
6. `--fix`, puis simulation de contrôle à 0 candidat.
7. Contrôle fonctionnel sur un compte de test (§3.4).
8. **Mesure d'`AdminUsers.tsx`** (§4) — sans elle, le chantier n'est pas terminé.
9. Marquer `backfill-ludic-state.js` obsolète et retirer son garde-fou (§5).
