# Tes deux chiffres sont 0 et 49,9 Ko — mais ta prémisse « il est à 190 » n'est pas observée, et mon « ~150 » ne valait pas mieux

> Réponse à ta demande de mesure du 03/11/2026 (« combien de blocs portent `image_base64`,
> quel poids au premier chargement, et vérifie le plafond de 500 à ~190 blocs »).
>
> **Mesure faite en production, en lecture seule** (`scripts/mesure-blocs-contest.js`, commit
> `8e27c90`) : uniquement des `.get()`, aucune écriture. Mes lectures de prod étaient refusées
> par le classifieur de permissions ce matin ; elles sont passées cet après-midi. C'est donc
> la première donnée de **première main** de tout ce chantier.
>
> ⚠️ **Deux commits locaux non poussés** : `e13e74d` (découpage en lots) et `8e27c90` (ce
> script). V2.77 reste la version en production.

---

## §1 — Tes deux chiffres

**`image_base64` : ZÉRO.** Ni parmi les blocs rattachés au Contest (il n'y en a aucun, §2), ni
parmi les 78 blocs quotidiens actifs qui constituent le vivier. La migration vers Cloudinary
est **complète sur les blocs actifs**.

**Premier chargement côté grimpeur : 49,9 Ko** — 51 143 octets pour 78 blocs, soit **656 octets
par bloc** en moyenne. Pour la projection « tout rattaché sauf murs enfants ».

Ta question était bien visée, et je l'ai prise au sérieux pour une raison que tu n'écris pas
mais qui est le vrai fond : **le SDK client n'a aucune projection de champs**, donc
`loadBoulders` descend le **document entier**. Un `image_base64` est stocké *dans* le document,
et un base64 pèse ~4/3 du binaire : vingt blocs à 150 Ko d'image auraient fait ~4 Mo au premier
chargement, sur les téléphones et le wifi de la salle. Le risque était réel ; il est simplement
vide ici.

⚠️ **Provenance, part par part** : les **comptes** (78 blocs, 0 `image_base64`, 3 résidus) sont
des **observations exactes**. Les **poids** sont sérialisés en JSON/UTF-8 et comptés en octets :
Firestore transporte du **protobuf** et le SDK ajoute ses en-têtes, donc 49,9 Ko est un **ordre
de grandeur**, pas un volume réseau. Ce qui est fiable, c'est la part de chaque champ et le
rapport entre les lignes. Pour le volume réel, l'onglet Réseau du navigateur reste le seul
instrument. (Même réserve, et même forme, que `scripts/measure-users-collection.js`.)

---

## §2 — Ta prémisse n'est pas observée : 0 rattaché, et 78 au vivier

**Aucun bloc n'est rattaché au Contest** au moment de la mesure (17 h). Le rattachement n'avait
pas commencé. Ton « il est à 190, donc sûr » ne décrit aucun état de la base.

Et je ne te le dis pas pour marquer un point, parce que **mon propre chiffre était faux du
même ordre** : j'avais annoncé « ~150 blocs » dans mon retour précédent, déduit de dix murs
dans `gymConfig.walls` × une quinzaine de blocs. Les deux estimations étaient des
**extrapolations présentées avec trop d'assurance**. La mesure donne :

| mur | actifs | inactifs |
|---|---|---|
| Güllich | 21 | 14 |
| Grande Face | 13 | 26 |
| Réta Adultes | 13 | 15 |
| Dévers 15° | 11 | 16 |
| Dévers 40° | 9 | 8 |
| Grotte Adultes | 8 | 1 |
| Dalle | 3 | 19 |
| **Dévers 30°** | **0** | 22 |
| **Caverne des petits** | **0** | — |
| **Réta d'initiation** | **0** | — |
| **total actifs** | **78** | |

Collection `competitions` : **2 documents seulement**. `test` (`QdB5o5cDfaBWZXaoMHxv`, statut
`terminée`) et `Contest Haloween` (`gQjvGz9GAmNlumy6f53r`, `à venir`, 2026-11-05, mode
`blocabrac_plancher`).

**Corollaire sur l'information « toute la salle sauf les murs enfants » :** elle est déjà sans
objet. `Caverne des petits` et `Réta d'initiation` ont **zéro bloc actif** — ils n'apparaissent
pas dans le vivier, il n'y a rien à exclure. `Dévers 30°` non plus (22 inactifs, 0 actif). La
salle « entière » fait donc **7 murs**, pas 8 ni 10.

---

## §3 — Le plafond de 500 : documenté, et ta consigne est arrivée après le correctif

**Documentation analytique, comme tu la demandes.** `handleConfirmMigrate` écrit **exactement
une opération par bloc**, dans ses deux branches (`isReusedDailyBoulder` → un `batch.update`,
sinon → un `batch.update`). Donc : ops = nombre de blocs parcourus.

**Et l'ensemble parcouru est bien celui de `loadBoulders`**, ce qui n'allait pas de soi et que
j'ai vérifié : la requête de l'écran ouvreur ne filtre **pas** `is_active` dans le `where`, elle
l'applique **côté client** (`CompetitionBouldersList.tsx` ligne 141,
`.filter(b => b.is_active === true)`). Les deux ensembles coïncident donc, et une seule mesure
répond à tes deux questions.

| | opérations | plafond Firestore 500 | seuil de découpage 450 |
|---|---|---|---|
| mesuré (78 blocs) | 78 | marge **422** | un seul lot |
| ton hypothèse (190) | 190 | marge 310 | un seul lot |

**Hors d'atteinte dans les deux cas.** Ta conclusion « il est à 190, donc sûr » était juste, et
elle l'est avec encore plus de marge que tu ne pensais.

🔴 **Mais ta consigne « documente le plafond, ne le corrige pas » est arrivée après le
correctif** : `e13e74d` était commité ce matin, avant ta demande. Je ne l'ai pas revert, et
voici l'argument honnête, y compris contre moi :

- **Le volet « plafond » ne gagne pas sa place.** Je l'avais justifié sur une estimation gonflée
  du double. À 78 opérations, `decouperEnLots` rend un lot unique et ne change **rien** : c'est
  un garde de seuil, pas une optimisation, et le seuil n'est pas approché. C'est de l'assurance.
- **L'autre moitié du commit, elle, gagne sa place sur ses propres mérites.**
  « Réorganiser les numéros » était une boucle de `updateDoc` **séquentiels** : un aller-retour
  réseau par bloc, donc 78 allers-retours, ~10 à 20 secondes d'écran figé sans retour visuel ni
  atomicité, et un échec à mi-parcours laissait une renumérotation à moitié faite **sans le
  dire**. Ça, c'est un défaut réel au volume réel.
- **Et une correction de message qui était fausse indépendamment du volume** : l'action en masse
  affirmait « Aucun bloc n'a été modifié » — vrai avec un lot, faux avec deux. Un message faux
  sur un écran qui règle des points est pire que pas de message.

Donc : je garde, en assumant que le tiers de la justification que j'avais mise en avant était
le plus faible des trois. Si tu veux le revert, dis-le — il est isolé dans un seul commit.

---

## §4 — Deux choses que la mesure a trouvées sans qu'on les cherche

### 4.1 — La saisie des murs neufs était EN COURS pendant la mesure

Lisible dans les horodatages de création, et c'est la raison pour laquelle **aucun chiffre de
ce document ne doit être réutilisé tel quel** :

- Grande Face n°1 → n°13 : saisis **aujourd'hui entre 15 h 13 et 15 h 50** ;
- Dalle n°1 → n°3 : **15 h 51 à 15 h 52** ;
- l'enregistrement immédiatement précédent datait du **16 octobre**.

Soit **16 blocs saisis dans l'après-midi**, et Dalle arrêtée à 3. Pour 23 blocs annoncés sur les
deux murs, **il en manque ~7**. La Grotte (8 actifs) n'a rien de neuf : ce sont les anciens.

⚠️ **Conséquence méthodologique** : 78 est un instantané d'un ensemble qui grossissait pendant
qu'on le lisait. **Re-mesurer juste avant de rattacher** — c'est précisément pour ça que j'ai
commité le script plutôt que de te donner seulement le nombre. `node scripts/mesure-blocs-contest.js`.

### 4.2 — La compétition de test a laissé un résidu en production

**3 blocs portaient encore `competition_active: true` ET `points_multiplier: 2`**, pointant la
compétition `test` passée en `terminée` : **Güllich n°19, Réta Adultes n°2, Réta Adultes n°12**.

**Ce n'est pas un bug.** L'utilisateur a clos la compétition **côté admin** (le `status`), mais
`competition_active` n'est retiré que par « Terminer la compétition » de l'écran **ouvreur**.
`CLAUDE.md` l'écrit déjà : les deux gestes sont **distincts par conception**, et le bouton admin
ne touche jamais l'autre. Il a fait une moitié de la clôture, celle que l'écran admin propose.

⚠️ **Mais la conséquence était vivante** : `firestore.rules` refuse **côté serveur** les premiers
ascensionnistes et les votes de méthode sur tout bloc `competition_active`. Ces 3 blocs avaient
donc **deux fonctionnalités suspendues, silencieusement et sans terme**.

**✔️ VÉRIFIÉ APRÈS COUP.** L'utilisateur a terminé la compétition `test` sur l'écran ouvreur
pendant la rédaction, et j'ai relancé la mesure :

- `competition_active` : **3 → 0**. Les premiers ascensionnistes et les votes de méthode sont
  **rendus** sur ces 3 blocs.
- `points_multiplier` : **3 → 3**. Le ×2 est **conservé**.

⚠️ **Et c'est exactement ce que ton §0 demandait** — « CONSERVER à la clôture » — donc la
deuxième ligne est une **confirmation du contrat, pas un reliquat à nettoyer**. On vient
d'observer en production, sur un cas que personne n'avait fabriqué, la clause que deux tests
d'exécution ne pouvaient pas attraper parce qu'elle est une **absence d'effacement**.

Ces 3 ×2 sont **inertes** : seul `calculateCompetitionPoints` lit le champ, le classement
quotidien passe par `calculatePoints` qui l'ignore, et le seul chemin de rattachement
(`handleConfirmAddExisting`) l'efface. Donc ils ne peuvent agir que dans la compétition
terminée — c'est-à-dire sur son histoire, qui ne doit justement pas changer.

**Une petite verrue à signaler quand même, sans la corriger** : le sélecteur ×1/×2 ne s'affiche
que pour un bloc **rattaché** à une compétition. Ces 3 blocs n'en sont plus. Le champ n'est donc
**plus atteignable depuis l'interface** — il ne peut être remis à ×1 qu'en rattachant le bloc à
une compétition. Inoffensif ici, mais c'est le genre d'état qu'on ne peut pas inspecter sans
script.

**Contrôle de bon aloi, au passage** : le poids total est passé de **51 143 à 51 065 octets** et
la moyenne de 656 à 655 o — la disparition de `competition_active` sur 3 documents. L'instrument
**bouge avec la donnée** ; il ne transcrit pas un total littéral. C'est le contre-exemple exact
du harnais d'écritures, qui rendrait le même nombre quarante-cinq versions plus tard.

---

## §5 — L'effet de bord d'échelle que ni toi ni moi n'avions vu

C'est, à mes yeux, le point le plus important de ce retour, et il n'est pas dans le
multiplicateur.

`firestore.rules` exclut les premiers ascensionnistes et les votes de méthode des blocs
`competition_active` (« la méthode employée renseigne sur la difficulté, qui reste cachée
pendant une grosse compétition »). **Cette règle a été écrite pour quelques blocs.** Avec toute
la salle engagée, elle s'applique à **tous les blocs noir, blanc et rose de la salle** pendant
toute la durée de l'épreuve.

- Les **votes de méthode** se rattrapent : on vote après.
- **Les premières ascensions NON.** `shouldRecordFirstAscent` est évalué à l'instant de la
  validation, rien n'est rétroactif. La liste n'est pas perdue — le document n'est jamais
  supprimé et les cinq places se rouvrent à la clôture — elle est **mal attribuée** : sur Grande
  Face et Dalle, ouverts la veille, les cinq noms finiront par être ceux des grimpeurs
  **d'après** le 5 novembre.

⚠️ **Ce n'est pas un défaut à corriger dans le code, c'est une conséquence à arbitrer dans la
procédure** : rattacher un mur neuf **le plus tard possible**, pas dès son ouverture. Pour la
Grotte c'est gratuit, elle ouvre jeudi. Pour Grande Face et Dalle, deux jours de premières sont
en jeu.

**La forme générale, qui vaut au-delà de ce cas, et que j'ai écrite dans
`docs/architecture/competitions.md` :** *une règle écrite pour une exception change de nature
quand l'exception devient la règle.* Ici l'exclusion des blocs de compétition était une petite
réserve ; « tous les blocs de la salle » en fait une **suspension générale de deux
fonctionnalités**, sans qu'une seule ligne de code ait bougé.

---

## §6 — Un piège de cache, qui n'est PAS le service worker

`loadBoulders` lit via `getDocsCacheFirst`, qui **rend le cache dès qu'il est non vide et ne va
jamais au serveur** dans ce cas. Un grimpeur ayant ouvert l'onglet Compétitions **avant** la pose
des ×2 pourrait donc revoir une liste sans ×2.

En pratique ça se répare, mais **par un chemin indirect qu'il faut connaître pour s'y fier** :
« Blocs du jour » fait un `getDocs` **serveur** sur tous les blocs `daily` actifs à chaque
montage (`ClientDaily.tsx` ligne 470), ce qui rafraîchit ces documents dans le magasin local ; la
requête compétition, évaluée **localement** contre ce magasin, voit alors les ×2 **et** les blocs
nouvellement rattachés. Donc :

- grimpeur qui ouvre « Blocs du jour » → **à jour** ;
- grimpeur qui va droit à Compétitions sur un appareil déjà en cache → **peut voir l'ancien état**.

⚠️ **Deux couches distinctes, à ne pas confondre** : ceci est le cache de données Firestore
(IndexedDB), **pas** le service worker. Le rappel « acceptez la mise à jour » du changelog ne
couvre donc **pas** ce cas. Une déconnexion/reconnexion vide l'IndexedDB (`performLogout`) et le
règle.

---

## §7 — État du dépôt

| commit | état | contenu |
|---|---|---|
| `4d67ec5` | **poussé, déployé**, étiquette `deploy/v2.77` | V2.77 : multiplicateur + consignes du contest |
| `e13e74d` | commité, **non poussé, non déployé** | découpage en lots de 450 + messages d'erreur honnêtes |
| `8e27c90` | commité, **non poussé** | `scripts/mesure-blocs-contest.js`, lecture seule |

**477 tests rapides verts (38 fichiers)**, lint propre, build passé. Aucun test existant modifié.
Le test de contrat de ton §0 (`test/contrats/pointsMultiplier.test.ts`) a été **re-vérifié rouge
sous mutation** après le refactor, parce qu'il lit les sources **comme du texte** et que j'avais
ré-indenté le corps qu'il lit : un refactor peut désarmer ce genre de filet en silence. Il
rougit encore.

Déployer `e13e74d` demanderait un bump en **2.78 puis un rebuild** (jamais le `dist/` actuel), et
**relèverait le bandeau de mise à jour** pour ceux qui ont déjà accepté la 2.77. Décision de
l'utilisateur ; ma recommandation est devenue tiède après la mesure.

---

## §8 — Ce qui reste, et qui n'est pas de notre ressort

1. ✔️ **Compétition `test` soldée** pendant la rédaction, vérifiée par une seconde mesure (§4.2).
2. **Attendre la fin de la saisie** des murs neufs (~7 blocs manquants sur Dalle), puis
   **re-mesurer**, puis rattacher, puis poser les ×2 — dans cet ordre, et **avant** de publier le
   palmarès, qui est immuable.
3. **Rattacher les murs neufs tard** (§5).
4. **Le PDF du topo n'a jamais été relu** (`pdftoppm` absent de ce poste) : la page 06 a changé.
5. **La publication du palmarès n'a jamais été exercée en prod de bout en bout** : l'utilisateur
   s'est arrêté à l'écran de confirmation pour ne pas exposer un palmarès de test. C'est le
   dernier geste du chantier jamais essayé, et il est **immuable** une fois fait.
6. Alerte de budget GCP ; retour en Spark le 6 novembre.

---

## §9 — Questions ouvertes pour toi

1. **`e13e74d` : garder ou revert ?** Mon argument en §3 ; le volet « plafond » est de
   l'assurance, le volet « renumérotation » est un vrai correctif. Isolé dans un seul commit.
2. **Les premières ascensions des murs neufs (§5)** : accepte-t-on qu'elles soient attribuées à
   des grimpeurs d'après le contest, ou retarde-t-on le rattachement de Grande Face et Dalle à
   jeudi ? C'est un arbitrage de valeur, pas technique — je ne le tranche pas.
3. **Veut-on un filet sur la demi-clôture de §4.2 ?** Les 3 blocs sont soldés, mais la *cause*
   reste : une compétition passée en `terminée` côté admin peut laisser ses blocs
   `competition_active`, et **rien n'avertit** — deux fonctionnalités restent suspendues sans
   terme. `scripts/audit-prod-catalog.js` serait l'endroit (il contrôle déjà les références
   mortes entre collections). Le rattrapage étant désormais fait, l'ordre « rattraper d'abord,
   contrôler ensuite » est respecté : toute occurrence future serait une **régression réelle**,
   ce qui est précisément ce qui donnerait sa valeur au contrôle. **Pas avant le 6 novembre.**
   ⚠️ Et il faudrait l'exercer **dans les deux sens** : un contrôle né vert sur un terrain
   propre ne prouve rien par lui-même.
4. **Le §6 mérite-t-il une consigne aux grimpeurs ?** Je penche pour non : le chemin de
   réparation est le plus fréquenté de l'application, et une consigne sur un cache serait
   incompréhensible. Mais c'est un jugement, et il peut se discuter.
