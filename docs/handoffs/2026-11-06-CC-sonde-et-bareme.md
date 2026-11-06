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

## 4. Ce qui reste, dans l'ordre — ⚠️ PÉRIMÉ, voir le § 7

🔴 **Cette liste a été écrite le matin et les points 1 à 3 ont été FAITS dans l'après-midi.**
Elle est conservée telle quelle parce qu'elle montre l'ordre dans lequel les choses ont été
décidées, mais **la liste à jour est celle du § 7**. Ne pas agir sur celle-ci : son point 1
prévoyait encore un retour en Spark, que la décision du § 6.6 a annulé.

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

---

# 6. L'après-midi : déploiement, déverrouillage, nettoyages — et une décision de forfait inversée

Tout ce qui suit a été fait, mesuré et vérifié le 06/11. **En prod : V2.78.** Commité et non
déployé : **V2.79**.

## 6.1 Le déploiement, et ce que le garde a appris

`firebase.json` enchaîne `assert-deploy-published.cjs` (refuse de déployer un commit non poussé)
puis `list-commits-since-last-deploy.cjs` (inventaire), et pose l'étiquette `deploy/v2.78` en
`postdeploy`. L'inventaire a bien joué son rôle : **12 commits partaient, dont 2 seulement
touchaient l'application**. C'est exactement la question qu'il a été écrit pour répondre —
« est-ce bien ce qu'on VOULAIT déployer ? » — et la réponse était oui.

⚠️ **Mes `git push` et mes écritures Firestore de prod sont refusés par le classifieur**
(`[Out-of-Place Publication]` et `[Modify Shared Resources]`) ; les **lectures** passent.
L'utilisateur lance donc lui-même les `push` et les `--fix`, avec le préfixe `!`. **Conséquence
de méthode, et elle compte : il faut lui dire ce qu'un script n'a PAS encore prouvé avant qu'il
clique, pas après.** Voir 6.7.

## 6.2 🔴 La vérification « version servie » : trois défauts dans mon instrument, pas dans la prod

Le contrôle est maintenant un script du dépôt, **`frontend/scripts/verify-deploy-servi.cjs`**,
au lieu d'une recette écrite. Il le fallait : la recette du 03/11 était fausse sur deux points,
et je m'en suis aperçu en l'exécutant.

- **① « attendre ~3 s » n'est pas une condition.** Le service worker précache 148 fichiers /
  4,6 Mo : la durée dépend du réseau. On attend l'ÉTAT.
- **② `page.waitForFunction` avec un prédicat `async` se résout IMMÉDIATEMENT**, parce que la
  fonction rend une `Promise` et qu'une `Promise` est *truthy*. Mesuré : l'attente « activated »
  rendait la main en **312 ms**, sans qu'aucun enregistrement existe. Le script annonçait alors
  *« le service worker ne prend jamais le contrôle »* — **un verdict faux produit par
  l'instrument, et indiscernable d'un vrai défaut de déploiement.** `page.evaluate`, lui, attend
  la promesse : le primitif juste est `navigator.serviceWorker.ready`.
- **③ Il faut parfois DEUX navigations** : sous `registerType: 'prompt'`, `clientsClaim` est
  faux, un service worker qui vient de s'activer ne réclame pas la page déjà ouverte. On boucle
  donc sur l'observation du contrôleur.
- **④ Et je ne cherche plus un numéro de version comme une sous-chaîne de chiffres.** Un `grep`
  de `2.78` sur `dist/` trouve `m23 12-2.44-2.78.34-3.68` — **un fragment de tracé SVG**. Ce
  faux positif m'avait fait annoncer « le bundle porte bien 2.78 » alors que je n'avais rien
  vérifié. Un littéral se cherche **avec ses délimiteurs**, et dans les **trois** formes :
  rolldown réécrit `JSON.stringify(version)` en littéral **gabarit**.

**Verdict final, lui, solide** : V2.78 servie, service worker actif, sur un fichier dont le nom
porte un hachage de contenu — donc un 200 sur ce nom prouve ce contenu. ⚠️ Portée : Chromium sur
ordinateur.

## 6.3 Le déverrouillage, et la protection qui ne vivait que dans le bundle

🔴 **Le trou trouvé juste avant de donner le signal** : sous `registerType: 'prompt'`, un
grimpeur qui n'a pas cliqué « Mettre à jour » **continue de recevoir la 2.77**. S'il ouvre « Mes
stats » après le déverrouillage, c'est l'ANCIEN code qui tourne, et qui écrit `bleu`.

⚠️ **La forme générale, à garder : une protection qui vit dans le client ne couvre que les
clients qui l'ont reçue — et sous `prompt`, rien ne force personne à la recevoir.** Le plancher
de `levelSync.ts` était donc une demi-protection.

La parade ne dépend d'aucun bundle : **`scripts/backfill-base-level-declare.js --fix`**, qui pose
`baseLevel = level` **côté serveur** sur les comptes dont le niveau ne peut venir que d'une
déclaration (niveau ≥ violet, aucun `baseLevel` lisible, aucune couleur ≥ violet encore posée).
**9 comptes**, tous verrouillés à ce moment-là. Comptes sans `baseLevel` : **14 → 5** (les 5
restants sont sous violet, hors de portée du repli).

⚠️ **Il ne touche PAS les comptes dont une couleur est encore posée** : pour eux la branche des
badges doit pouvoir faire redescendre, et c'est le comportement voulu.

✔️ **Puis déverrouillage : 0 compte verrouillé sur 71.**

⚠️ **Question de l'utilisateur après coup, qui mérite d'être dans la doctrine** : *« je suis
toujours niveau noir après actualisation, est-ce normal ? »* **Oui** — le recalcul ne tourne
**que dans « Mes stats »**. Une actualisation de page affiche la valeur stockée. Rien ne bascule
à l'instant du déverrouillage ; tout se fait au fil des visites. C'est une propriété agréable
(aucun effet de masse), mais elle surprend, donc elle doit être annoncée.

## 6.4 La compétition `test` : soldée, et l'instrument exercé dans les deux sens

Elle avait servi de banc d'essai au seul geste irréversible du contest (publier le palmarès).
Supprimée par l'utilisateur depuis l'écran d'administration, puis
`purge-orphan-competition-refs.js --fix --expected 4`.

| contrôle | résultat |
|---|---|
| purge AVANT suppression | **0 orphelin** — ligne de base propre |
| prédiction | 4 (1 participation + 3 résultats), écrite d'avance |
| purge APRÈS suppression | **4**, exactement les documents prédits |
| effet mesuré | participations 9 → **8**, résultats 189 → **186** |
| purge relancée | **0** |
| sauvegarde | JSON valide, 4 documents avec `id`+`data` → **exploitable** |
| audit de production | **0 erreur, 0 avertissement** |

**0 → 4 → 0 : l'instrument a été exercé dans les deux sens**, c'est ce qui rend ce 4 crédible.
✔️ Et **0 bloc** ne portait plus ce `competition_id`, **0 en `type: competition`** : aucune
cotation bloquée créée par la suppression.

## 6.5 🔴 La demi-clôture : la cause, le rattrapage, le filet, puis le correctif

**La cause, trouvée dans le code et non supposée.** `CompetitionBouldersList.tsx` appliquait
`.filter(boulder => boulder.is_active === true)` avant de poser son état, et c'est cet état que
« Terminer la compétition » parcourait. **Un bloc désactivé pendant qu'il était rattaché était
donc invisible à l'écran ET sauté par la clôture** — il gardait `competition_active: true` pour
toujours, hors d'atteinte de toute interface.

⚠️ **LA LEÇON, plus large que ce bouton : un filtre d'AFFICHAGE ne doit jamais devenir le
périmètre d'une OPÉRATION DE DONNÉE.** L'écran décide de ce qu'on montre, la clôture décide de ce
qui est vrai. Même famille que la verrue documentée du sélecteur ×1/×2 : **dès qu'un geste se
règle sur ce que l'œil voit, il oublie ce qui est caché.**

⚠️ **Le dommage était LATENT, pas actuel, et l'ordre de la phrase compte** : un bloc désactivé ne
reçoit aucune validation, donc rien n'était suspendu tant qu'il restait au placard. Mais
`firestore.rules` refuse premières ascensions et votes de méthode sur tout bloc
`competition_active` : **le jour où il est remis au mur — la routine d'une rotation — les deux
sont muettes, sans terme et sans message.** Un défaut qui attend une action banale pour se
réveiller n'est pas un avertissement.

**Trois livrables, dans cet ordre (rattraper, contrôler, corriger) :**

1. **`scripts/fix-competition-active-apres-cloture.js`** — 1 bloc (n°7 Dévers 40°). N'efface
   **que** `competition_active` : `competition_id` et `points_multiplier` sont conservés par
   contrat. Vérifié champ par champ après coup : `is_active`, `type`, `color` intacts.
   ⚠️ Les statuts légitimes sont énumérés **en positif** (« à venir », « en cours »), jamais par
   exclusion — une liste d'exclusions laisserait passer tout statut futur.
2. **Le contrôle dans `audit-prod-catalog.js`**, en **erreur** et non en avertissement, **vu
   rouge** (1 erreur, code de sortie 1 vérifié *hors pipe*) puis **vert** (0, sortie 0) sur le
   cas réel. Et il a été précédé de son rattrapage, pas l'inverse.
3. **V2.79** — `chargerBlocsRattaches`, partagée par l'écran et la clôture : un seul endroit
   répond à « quels blocs sont rattachés ? ». La clôture **relit à l'instant de l'écriture**
   (doctrine de `firstAscentWrites.ts`) plutôt que de parcourir la mémoire, qui est filtrée *et*
   peut être périmée puisque la saisie se fait par vagues. **Pas de second état** portant la
   liste complète, qui serait une seconde source de vérité.
   - ✔️ **Second défaut fermé du même coup** : un bloc `type: competition` désactivé n'était
     jamais repassé en `daily`, donc **sa cotation restait cachée pour toujours** et il
     rejoignait les 7 blocs inatteignables que porte déjà la prod.
   - ⚠️ **Et le dialogue DIT ce qu'il va faire.** Sans cela le correctif produisait un mensonge
     d'un autre genre : la clôture traitant plus de blocs qu'annoncé. Un **compte** des blocs
     rattachés mais désactivés, jamais leur liste — elle n'a rien à faire à l'écran.

## 6.6 🔴 DÉCISION INVERSÉE : on RESTE en Blaze

> « Pas de retour en Spark décidé de mon côté. On ne paie qu'au dépassement. C'est pour l'heure
> une grosse sécurité. » — l'utilisateur, 06/11/2026.

Cela **annule** le « retour en Spark décidé pour le 6 novembre » du plan de la fenêtre Blaze.
Le raisonnement est juste et vaut d'être retenu : les allocations quotidiennes gratuites
s'appliquent **aussi** sur Blaze, donc Blaze ne change rien au coût tant qu'on reste dans la
franchise — et il supprime le risque d'**arrêt de service** un soir de compétition, là où Spark
coupe au plafond. Ce n'est pas une dépense, c'est un filet.

✔️ **L'alerte de budget est ACTIVE, à 5 €.** C'était l'action en attente depuis le 19/10. C'est
elle qui rend la position tenable : sans elle, l'essai gratuit (264 € jusqu'au 18/01/2027)
masquerait tout dépassement jusqu'à la mi-janvier.

⚠️ **À corriger quand on y retouchera** : la garde de `sonde-metriques-firestore.cjs` annonce en
rouge, après le 6 novembre, qu'un projet encore en Blaze est « un OUBLI de retour en Spark ».
**Elle est désormais fausse**, et un garde qui crie à tort apprend à ignorer les gardes.

## 6.7 Les trois annonces que j'ai dû retirer aujourd'hui

Je les liste parce que la forme compte plus que les faits.

1. **« Le bundle porte bien 2.78 »** — un `grep` tombé sur un tracé SVG. *Un littéral se cherche
   avec ses délimiteurs.*
2. **« Les 19 écarts de niveau sont résolus »** — l'audit n'en évaluait plus que **3** sur 63,
   son `continue` sur `levelOverride` écartant 68 comptes en silence. *Un verrou masque un écart,
   il ne le résout pas ; un instrument doit annoncer son dénominateur.*
3. **Un script prêt sur la foi de sa simulation** — `fix-competition-active-apres-cloture.js` a
   échoué en mode écriture sur « deleteField is not a function » (API du SDK **client** ; côté
   Admin c'est `FieldValue.delete()`, et l'import ne lève pas, il rend `undefined`). *Une
   simulation n'exerce pas le chemin d'écriture : un script dont le mode sûr est vert n'a prouvé
   que son mode sûr.* La bonne forme était déjà dans le dépôt, à deux fichiers de distance.

**Le point commun des trois : ce qui rassure est ce qui trompe.** Et dans les trois cas, c'est un
contrôle — pas une relecture — qui a rattrapé.

# 7. Ce qui reste, et ce qui attend ClaudeNav

1. **Déployer V2.79** : bump déjà fait, `dist/` reconstruit **après** le bump, 500 tests verts,
   lint propre. ⚠️ Rebuilder si d'autres commits arrivent d'ici là.
2. **Le relevé de consommation du 6 novembre**, lisible **demain seulement** (journée close).
   Le retour en Spark n'est plus à l'ordre du jour.
3. 🟠 **Corriger la garde devenue fausse** de la sonde (6.6).
4. 🟠 **Les 7 blocs orphelins en `type: competition` + `is_active`**, aux `difficulty` non
   canoniques (« noire », « Rouge »). Inchangé, et **jamais par une suppression**. V2.79 ferme la
   voie par laquelle s'en créeraient de nouveaux, mais ne traite pas les existants.
5. **Le point d'appel du correctif des niveaux depuis `ClientDaily`** — reporté, voir §5⑤ :
   +2 lectures de collection sur l'écran le plus ouvert, alors que la sonde vient de désigner
   **les lectures** comme la contrainte. ⚠️ Et la question jamais vérifiée : *la Roulette se
   comporte-t-elle correctement quand aucun bloc ouvert ne correspond au niveau du grimpeur ?*
6. **Le chantier barème** (§2) : différé « dans un temps décalé ». Dossier complet, variante C
   recommandée, mesures au dépôt et relançables.
7. 🔴 **Les retours des grimpeurs sur le mode compétition** : nombreux et « très concrets » selon
   l'utilisateur, **contenu encore inconnu**. C'est probablement le prochain vrai chantier.
   **À ne pas anticiper par du code.**
