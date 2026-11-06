# Retour à ClaudeNav — la sonde du 5 novembre, et ce que le barème à plancher ferait vraiment

**06/11/2026, matin.** Deux sujets, dans l'ordre où ils ont été demandés : la sonde de la soirée
de contest (prévue), puis la question du barème à plancher appliqué au classement quotidien
(nouvelle, posée ce matin).

🔴 **Décision de l'utilisateur sur le second, prise après lecture des mesures : on ne touche à
rien pour l'instant.** Le chantier barème est **différé**, à reprendre « dans un temps décalé »,
après les opérations déjà listées (correctif des niveaux → déverrouillage → relevé final →
retour en Spark). Ce document est donc un **dossier d'instruction**, pas un plan de livraison.

---

## 1. La sonde : le modèle tenait, mais la contrainte a changé de camp

**Source : `scripts/sonde-metriques-firestore.cjs`, Cloud Monitoring, journée CLOSE.** Le 5
novembre est désormais fermé, c'est précisément la fenêtre qu'il fallait attendre.

### Les chiffres bruts

| jour | lectures | écritures |
|---|---|---|
| 03/11 | 1 501 | 88 |
| 04/11 | 238 | **0** |
| **05/11 (contest)** | **3 731** | **696** |
| 06/11 (en cours, à ne pas lire) | 41 | — |

Sur les 19 jours de la fenêtre Blaze : pire jour en lectures **11 990** (le 19/10, mes propres
audits), pire jour en écritures **696**, c'est-à-dire la soirée du contest.

### L'attribution des 696 écritures

⚠️ **« 696 / 6 participants = 116 écritures par grimpeur » aurait été faux d'un facteur
inconnu**, et aurait eu l'air d'une mesure. Le rattachement de toute la salle a eu lieu le même
jour. D'où `scripts/mesure-soiree-contest.js` (lecture seule), qui cherche la part
administrative **dans la donnée** au lieu de l'estimer :

| part | écritures | provenance |
|---|---|---|
| gestes d'ouvreur sur les blocs | **214** | 93 rattachements + 29 poses de ×2 + ~92 « Terminer la compétition » |
| résultats de compétition | **186 créations + ≥71 réécritures** | OBSERVÉ : 186 documents, dont 71 portent `updated_at > createdAt` |
| verrou « Soumettre les résultats » | jusqu'à **186** | un `writeBatch` par grimpeur, 1 écriture par résultat |
| palmarès gelé | 1 | publié à 20 h 01 |
| validations quotidiennes du soir | ~26 | 13 documents, 1 grimpeur, + leurs transactions |
| inscriptions + `registered_count` | ~16 | 8 participations |

**L'énumération couvre les 696 sans résidu** (elle dépasse même légèrement, ce qui est le signe
que tous les grimpeurs n'ont pas verrouillé, ou que certaines réécritures sont uniques).

### ✔️ Le modèle est validé — la question 3 de la fenêtre Blaze est répondue

L'unité mesurée au navigateur était **23 à 43 écritures par grimpeur sur 20 blocs**, soit
**1,4 à 2,2 écritures par bloc tenté**. Le réel : **≈ 2,4 écritures par bloc tenté**
(≈ 443 écritures de grimpeurs / 6 grimpeurs / ≈ 31 blocs touchés chacun). **Même ordre,
légèrement au-dessus** — le harnais navigateur ne sous-estimait pas d'un facteur, il
sous-estimait à la marge.

**Ce qui scelle la bonne formule de dimensionnement** : les écritures suivent **ce qu'un grimpeur
tente**, jamais le catalogue. Les six ont touché de 14 à 65 blocs sur 80 offerts. À 80
participants : ≈ 6 000 écritures, **30 % de la franchise gratuite**. Confortable.

### 🔴 Mais la contrainte n'est pas celle qu'on surveillait : ce sont les LECTURES

**3 731 lectures** pour 6 grimpeurs *et* une soirée entière d'administration (écran live,
aperçu du palmarès, stats). Je ne peux pas répartir ce total par acteur — c'est une limite réelle
de l'instrument, à ne pas masquer.

Ce qu'on sait en revanche : la part par grimpeur est dominée par **« Mes stats » (170 à 280
lectures par montage)** et par le **catalogue de la compétition (93 blocs, une fois par
appareil, cache-first)**. À 80 participants ouvrant chacun l'onglet et ses stats une fois :
≈ 30 000 lectures, **60 % du quota Spark**.

⚠️ **C'est une PRÉDICTION, pas une mesure** — annoncée comme telle. Elle est tenable, mais elle
déplace le poste à surveiller : « Mes stats » (point ouvert n°3, N+1) redevient le sujet, et ce
n'est plus une question de confort mais de plafond.

### Deux constats de donnée, au passage

- 🟠 **1 bloc garde `competition_active`** après la clôture du Contest. C'est **la cause
  récurrente de la demi-clôture, pas un reliquat inerte** : sur ce bloc, premières ascensions et
  votes de méthode restent suspendus silencieusement et sans terme. Le filet proposé dans
  `audit-prod-catalog.js` trouve ici sa première occurrence réelle — et le rattrapage étant
  trivial (un bloc), l'ordre « rattraper d'abord, contrôler ensuite » peut enfin être respecté.
- ✔️ **`registered_count` = 8 = participations réelles = 8.** Le champ partagé reste sain. 6 des
  8 inscrits ont effectivement grimpé (159 réussites, 27 échecs, **93,7 % de flash**).

---

## 2. Le barème à plancher au quotidien : la bonne intuition, et deux renversements

### La question posée

> « Le compte de points officiel de la compétition avec palier a été plébiscité hier. Ne
> serait-il pas possible de l'appliquer dans le correctif, sachant qu'on pourrait vérifier
> combien de grimpeurs ont réellement validé des points de saison depuis l'ouverture du
> premier novembre ? »

### ⚠️ Renversement n°1 : le chiffre proposé est juste, et il ne borne pas ce qu'on croit

**Mesuré : 15 validations, 3 grimpeurs** dans la fenêtre de saison (01/11/2026 → 31/05/2027).
Le chiffre est exact et l'intuition derrière lui — « tôt dans la saison, l'ardoise est presque
vierge » — est correcte.

Mais il ne borne **que la saison**. Le compteur **général** est un second compteur, cumulatif
depuis l'origine, et c'est lui que `reconcile-classement-profiles.js` recalcule **entièrement**
depuis `client_boulder_results` :

| compteur | portée | exposition réelle |
|---|---|---|
| `season.score` | 01/11 → 31/05 | 15 réussites, **3 comptes** |
| `score` (général) | depuis l'origine | **982 réussites, 34 comptes, 212 655 points** |

C'est exactement la forme « **le bouton que je tourne est-il branché sur ce que je regarde ?** » :
la grandeur proposée pour décider est réelle, mesurable, et répond à une autre question.

### 🔴 Renversement n°2 : le barème à plancher n'est pas « plus généreux ». J'avais écrit l'inverse

J'ai écrit dans la légende de mon propre instrument que le plancher « ne peut jamais faire
baisser un score ». **La mesure l'a démenti dans la ligne suivante.** La raison, visible une fois
les trois barèmes côte à côte :

| couleur | 1 essai | 2 essais | 5 essais | 10 essais | 20 essais |
|---|---|---|---|---|---|
| bleu (classique → plancher) | 100 → 100 | 90 → **89** | 60 → 64 | 10 → 42 | 0 → 28 |
| rouge | 400 → 400 | 380 → **355** | 320 → **257** | 220 → **169** | 20 → 114 |
| blanc | 800 → 800 | 750 → **710** | 600 → **513** | 350 → **339** | 0 → 227 |

**À 1 essai les deux barèmes sont identiques** (facteur = 0,25 + 0,75 × 0,85⁰ = 1). Au-delà, le
plancher retire **11,25 % de la base** au 2ᵉ essai, quand la déduction classique n'en retire que
10 points sur 100 (bleu), 20 sur 400 (rouge) ou 50 sur 800 (blanc) — **soit moins**. Le
croisement n'arrive qu'au 4ᵉ-5ᵉ essai sur les couleurs tendres, et **après le 10ᵉ sur le blanc**.

Le plancher est donc **plus dur d'abord, plus doux ensuite**. Il n'avantage que la queue lointaine
de la distribution.

### Pourquoi il a quand même été plébiscité

**93,7 % de flash au contest.** Presque personne n'a vu de différence de chiffres : à 1 essai les
deux barèmes rendent la même valeur. Ce qui a été plébiscité est le **principe** — *un bloc réussi
rapporte toujours quelque chose* — et non la courbe. La distinction décide de tout le reste.

### Les trois variantes, mesurées sur la production

`scripts/simule-bareme-plancher-quotidien.js`, lecture seule, sur les **982 réussites** de
`client_boulder_results` à la couleur **dernière connue** de chaque bloc (actif ou retiré, sans
filtre — comme la réconciliation depuis V2.56) :

| variante | somme des scores | comptes qui baissent | qui montent | rangs qui bougent | saison |
|---|---|---|---|---|---|
| **A** · classique (actuel) | 212 655 | — | — | — | 2 460 |
| **B** · `blocabrac_plancher` tel quel | **206 787** (−5 868, −2,76 %) | **26 / 34** | 3 | **9**, dont le 6ᵉ/7ᵉ | 2 344 (−116) |
| **C** · classique **borné au quart de la base** | **213 393** (+738, +0,35 %) | **0** | 3 | 3, tous en 29ᵉ-31ᵉ | **inchangée** |

**C = `max(base × 0,25 ; classique)`.** Elle retient le principe seul : plus jamais zéro sur un
bloc réussi, et par construction jamais en dessous du barème actuel. ⚠️ La ligne « comptes qui
baissent : 0 » **le vérifie**, elle ne le suppose pas — si elle n'était pas à zéro, la formule
serait fausse.

C solde au passage le **point ouvert n°6** : l'anomalie du blanc au quotidien (déduction 50 sur
base 800, donc zéro au 17ᵉ essai, moins tolérant qu'un noir) disparaît, et elle disparaît **sans
rien changer pour personne d'autre** — les trois comptes qui bougent sont ceux qui avaient des
validations à 10-16 essais.

### Ce que vaut l'argument de doctrine, revu à la lumière de ces chiffres

`climbingPoints.ts` dit : *« un changement de barème se livre comme un NOUVEAU mode, jamais comme
une modification de l'existant »*, et *« le classement général est cumulatif et recalculé, donc
son barème ne peut changer proprement à aucune date »*.

La première moitié tient **intégralement** et dicte la forme : ce serait une **nouvelle
fonction** (`calculateDailyPoints`), appelée par les trois sites de `classementScore.ts`, en
laissant `calculatePoints` **intact** pour les mini-compétitions et pour le mode `blocabrac`.
C'est d'ailleurs la bonne réponse au regard de la doctrine de recotation : un résultat de
mini-compétition a été **proclamé** le soir même, il se fige ; le classement général **mesure**,
il se recalcule.

La seconde moitié est **affaiblie par la mesure, pas réfutée** : avec C, il n'y a aucune date
mauvaise, puisque aucun score ne baisse et que la dérive touche 3 comptes sur 34 (8,8 %) — **sous
le seuil du garde-fou de la réconciliation**, qui n'exigerait donc même pas de `--force`. Avec B
elle tient entièrement : 26 comptes en baisse, à annoncer.

⚠️ **Un point à ne pas perdre si le chantier reprend** : `reconcile-classement-profiles.js`
porte **sa propre copie** de `calculatePoints` (ligne 158), en CommonJS, parce qu'il ne peut pas
importer le module TypeScript. Toute modification du barème quotidien doit toucher **les deux**,
et cette duplication est un défaut latent *déjà présent* — à nommer, pas à découvrir le jour J.

### 🔴 Et le biais de donnée à citer avec ces chiffres

Jusqu'à **V2.69 (25/09/2026)**, l'écran des blocs du jour proposait **1 essai par défaut**. Les
`attempts` anciens sont donc tirés vers 1 — et comme les deux barèmes coïncident exactement à
1 essai, **l'écart mesuré ici est un MINORANT** de l'effet qu'aurait un nouveau barème sur les
saisies à venir. Le taux de flash observé (83,0 % sur tout l'historique, 78,1 % sur les blocs
encore posés) est à lire avec la même réserve.

---

## 3. Une leçon d'instrument, parce qu'elle a failli passer

**Ma première version du simulateur était fausse** : elle filtrait `colorById` sur
`is_active && type === 'daily'`, alors que `loadDailyColorById` ne filtre **plus** sur
`is_active` depuis V2.56 (les deux compteurs sont des compteurs d'**accumulation** : un bloc
validé puis retiré garde ses points). Elle perdait **731 réussites sur 982** et rendait un total
de **43 930 points** là où la somme réellement stockée est de **212 655** — un **facteur 5**.

⚠️ **Ce chiffre faux était parfaitement plausible à la lecture.** Il avait le bon ordre de
grandeur pour un petit club, les bonnes unités, une distribution crédible. Rien dans sa forme ne
le dénonçait. Et j'avais déjà mesuré 212 655 **dans la même séance** sans faire le rapprochement.

Ce qui l'a attrapé : le **recoupement**, désormais écrit dans le script (③ bis) — le recalcul au
barème classique doit retrouver le score **stocké** dans `classement_profiles`. Il tombe
maintenant à **0 écart sur 34 comptes**, à l'unité près.

**Effet de bord utile : ce zéro prouve que le compteur incrémental n'a aucune dérive aujourd'hui.**
La prochaine réconciliation mensuelle ne trouvera rien à corriger — c'est une information qu'on
n'avait pas, obtenue gratuitement par un contrôle posé pour autre chose.

Forme générale, à ajouter à la famille des instruments faits maison : **un instrument qui
recalcule une grandeur dont il existe une version STOCKÉE doit se recouper contre elle avant de
publier quoi que ce soit.** Le recoupement ne coûte qu'une lecture de collection, et sans lui
rien ne distingue un instrument juste d'un instrument faux du bon ordre de grandeur.

---

## 4. Ce qui reste, dans l'ordre

1. **Les opérations déjà listées** (décision de l'utilisateur ce matin : elles passent avant
   tout) — correctif du plancher des niveaux → déploiement → **puis** déverrouillage des niveaux,
   jamais l'inverse ; suppression de la compétition `test` + `purge-orphan-competition-refs.js`
   (simulation annonçant 4, puis `--fix --expected 4`) ; relevé final ; **retour en Spark**.
2. **Les 8 commits locaux** sont dégelés depuis aujourd'hui. ⚠️ Déployer exige un **bump en 2.78
   puis un rebuild** — jamais le `dist/` existant.
3. 🟠 **Le bloc resté `competition_active`** : à solder, et à transformer en filet d'audit
   exercé dans les deux sens.
4. **Le chantier barème : différé.** Ce document en est le dossier. Les deux instruments sont au
   dépôt et relançables tels quels — ils **observent** la production, donc ils ne vieilliront pas
   comme un harnais qui transcrit.
5. **« Mes stats »** passe devant les écritures dans l'ordre des soucis de coût, maintenant que
   le plafond Spark revient.

### Les retours de grimpeurs sur le mode compétition

L'utilisateur annonce « de nombreux retours pour faire évoluer le mode compétition sur des
choses très concrètes », à venir. Rien n'est encore connu de leur contenu — **à ne pas anticiper
par du code**, et à lire comme un chantier distinct de celui du barème.

---

## 5. Le correctif des niveaux — livré en V2.78, et un troisième défaut trouvé en le vérifiant

Chantier de `docs/handoffs/2026-10-18-CN-plan-niveaux-contest.md`, dégelé ce matin. Commit
`44f506a`. **500 tests / 40 fichiers, lint propre, build après le bump.**

### ① Le plancher (le correctif prévu)

La décision de réécrire `users.level` sort de `ClientStats.tsx` vers **`utils/levelSync.ts`**,
pur et testé (12 tests). Quand plus aucun badge de couleur n'est actif **et** que `baseLevel`
est absent ou illisible, **plus aucune écriture** : le niveau reste à sa dernière valeur connue.
L'ancien code posait `'bleu'`, qui n'est pas une donnée mais une hypothèse.

**Mesuré en prod : 9 comptes** portent un niveau ≥ violet sans `baseLevel` (rose ×1, blanc ×4,
noir ×2, rouge ×2) et tombaient tous à `'bleu'` dès qu'un recalcul tournait.

✔️ Les 3 tests du groupe « LE PLANCHER » ont été vus rouges **seuls**, en remettant l'ancien
repli dix secondes : les 9 autres restent verts. Le filet mesure donc le plancher, et pas le
reste de la fonction.

### ② Régler un niveau à la main est une DÉCLARATION

`AdminUsers.tsx` écrivait `level` **sans jamais `baseLevel`**, contrairement à
`ClientProfile.tsx` et `Register.tsx`. Les 68 niveaux réglés nom par nom le soir du contest
n'étaient donc enregistrés nulle part comme des déclarations. Corrigé à l'édition **et** à la
création.

⚠️ **La forme générale, qui vaut au-delà de ce champ** : le plancher protège d'une valeur
**INVENTÉE** ; il ne peut rien contre une valeur **ANCIENNE mais lisible**. Deux défauts de
natures différentes derrière le même symptôme — il fallait les deux correctifs, et le premier
seul aurait donné l'illusion d'avoir fini.

### ③ 🔴 Le défaut qui m'a trompé : un verrou MASQUE un écart, il ne le résout pas

`audit-niveaux-perimes.js` faisait `if (d.levelOverride) continue;`. Au lendemain du contest,
**68 comptes sur 71** portaient ce verrou : l'audit n'en évaluait plus que **3** et annonçait
« ÉCARTS : 1 ». J'ai d'abord lu ce 1 comme la preuve que la passe de verrouillage avait soldé
les 19 écarts du 18 octobre. **C'était faux** : les écarts étaient intacts, simplement
invisibles, et c'est précisément au déverrouillage qu'ils se matérialisent.

L'audit annonce désormais, **toujours et même à zéro** : les écarts **ACTIFS**, les écarts
**LATENTS** (derrière un verrou), et le nombre de comptes sans `baseLevel`. Sa formule d'attendu
suit maintenant `resolveLevelSync` — sans quoi il aurait dénoncé comme « écart » exactement les
9 comptes que le plancher protège. **Un audit qui contredit le code qu'il surveille apprend à
ignorer l'audit.**

⚠️ **La leçon de méthode**, à ranger près de « un critère de sortie doit prédire *toutes* les
grandeurs observables » : **un filtre qui écarte des lignes réduit silencieusement la
POPULATION mesurée, et le compteur qui en sort reste parfaitement plausible.** Ici il est passé
de 63 à 3 comptes sans qu'aucun chiffre ne le dise. La question à poser à tout audit :
*combien d'éléments ont été évalués, et combien ont été écartés avant l'évaluation ?* Un
instrument doit annoncer son dénominateur.

### ④ Ce que le déverrouillage produira — mesuré, et moins grave que je l'ai d'abord écrit

⚠️ **Correction de mon propre message de commit `44f506a`**, qui annonce que les 9 comptes en
écart latent « trop HAUT » ont un `baseLevel` antérieur au réglage du 5 novembre. **C'est vrai
pour 1 seul.** Les 8 autres redescendent par la **branche des badges** :

| | nombre | origine de l'attendu |
|---|---|---|
| redescente pilotée par les badges | **8** | la plus haute couleur du grimpeur encore posée en salle |
| redescente vers un `baseLevel` déclaré | **1** | Clement Bourvic, blanc → noir, badge blanc en veille |
| élévation (attribution jamais faite) | **1** | Olivier John, jaune → rouge |
| protégés du `'bleu'` par le plancher | **9** | niveau ≥ violet sans `baseLevel` |

Les 8 redescentes sont donc **le mécanisme explicitement voulu** — « le badge est la
proclamation, son caractère éphémère EST sa valeur ; le niveau est la mesure ». Il n'y a **pas**
de décision bloquante avant de déverrouiller.

🟠 **La seule question qui reste est de valeur, pas technique** : si l'un de ces 9 grimpeurs a
été réglé plus haut **exprès** le 5 au soir et que ce réglage doit tenir, la réponse est de
relever son `baseLevel`, pas de renoncer au déverrouillage. L'utilisateur figure lui-même dans
la liste (noir → rouge), ce qui en fait un bon juge.

### ⑤ Ce qui n'est PAS fait de ce chantier, et pourquoi

Le plan prévoyait aussi que **le module porte la chaîne entière** (attribuer les badges
manquants *puis* recalculer le niveau) et soit **appelé depuis `ClientDaily`**, pour que la
chaîne n'avance plus seulement chez ceux qui consultent « Mes stats ». **Non livré, délibérément
reporté** :

- il coûte **deux lectures de collection de plus** (`badges` + `client_badges`) sur l'écran le
  plus ouvert de l'application, **le jour même où le plafond Spark revient** et où la sonde
  vient de désigner les lectures comme la contrainte réelle ;
- il n'a plus d'urgence : son bénéfice est le cas « niveau trop BAS », qui ne concerne
  aujourd'hui que **2 comptes**, et qui se répare tout seul dès que l'intéressé ouvre ses stats ;
- ⚠️ la question laissée ouverte par le plan — *la Roulette se comporte-t-elle correctement
  quand aucun bloc ouvert ne correspond au niveau du grimpeur ?* — devient fréquente dès que
  les niveaux cessent d'être périmés, et **elle n'a pas encore été vérifiée.** À lire avant
  d'ajouter ce point d'appel, pas après.

**Ordre à tenir, inchangé : déployer V2.78 → PUIS déverrouiller.** Jamais l'inverse.
