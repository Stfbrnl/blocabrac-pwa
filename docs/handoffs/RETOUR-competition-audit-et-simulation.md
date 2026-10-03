# Retour ClaudeNav — le comptage en compétition : audit du risque, puis simulation grandeur réelle

> Session Claude Code (PC Windows), 03/10/2026, fin de soirée.
> Deux demandes de l'utilisateur, avant d'organiser une vraie compétition : **le défaut du
> 02/10 (perte de points à cause d'un défi supprimé) peut-il atteindre le comptage en
> compétition ?**, puis **simuler une compétition complète et vérifier que tout est juste.**
>
> **Réponse courte : non pour le premier, oui pour le second.** La seule réserve trouvée —
> l'affichage et le départage des ex æquo — a été **arbitrée par l'utilisateur le soir même,
> puis implémentée, testée et vue à l'écran : voir le §6**, qui est la partie à lire si tu n'en
> lis qu'une.

---

## §1 — Le défaut du 02/10 ne peut pas atteindre la compétition : quatre raisons indépendantes

Rappel du mécanisme : une règle Firestore faisait `resource.data.participants` sur un document
de défi **supprimé**, où `resource` vaut `null`. Un plantage de règle arrive au client en
`permission-denied`, le `tx.get()` était refusé, et **toute la transaction partagée** mourait
avec lui — emportant le score, les murs et les missions. Ce qui le rendait grave, c'est qu'il
était **silencieux** : le bloc paraissait validé.

### 1.1 — La lecture est une requête, pas un `getDoc` sur un identifiant peut-être absent

`ClientCompetitions.tsx` (ligne ~296) lit ses résultats ainsi :

```ts
getDocsCacheFirst(query(
  collection(db, 'competition_results'),
  where('user_id', '==', user.uid),
  where('competition_id', '==', competition.id)
))
```

Une requête **ne renvoie que des documents existants**, donc `resource` n'est jamais `null`
quand la règle s'évalue. Le plantage du 02/10 est impossible par cette porte — et c'était
exactement la porte.

### 1.2 — Il n'y a aucune transaction sur ce chemin

L'écriture est un `setDoc(..., { merge: true })` **indépendant par bloc** (ligne ~470). Il n'y
a donc aucune transaction partagée qu'une lecture ratée pourrait faire avorter. La perte du
02/10 venait du regroupement ; ici il n'y a rien à regrouper.

### 1.3 — Le seul `get()` des règles est correctement gardé

```
function isParticipationSubmitted(competitionId) {
  let partPath = /databases/$(database)/documents/competition_participants/$(request.auth.uid + '_' + competitionId);
  return exists(partPath) && get(partPath).data.get('submitted', false) == true;
}
```

`exists()` court-circuite, et `.data.get('submitted', false)` protège même d'un champ absent.
Même une participation **supprimée en cours d'épreuve** ne plante pas : elle s'évalue en « non
verrouillé » et l'écriture passe. C'est le motif correct, et il était déjà là.

### 1.4 — Un échec serait signalé au premier coup, pas au troisième

`failureThreshold: 1` sur cet écran, contre le défaut du hook (3) sur l'écran des blocs du
jour — commenté sur place pour que personne ne les aligne. L'invisibilité du 02/10 venait
précisément de ce 3, qu'un échec **sélectif** ne pouvait structurellement jamais atteindre
(*« une escalade qui ne compte que les échecs consécutifs ne peut pas se déclencher sur un
échec sélectif »*). Ici, un seul échec suffit à afficher le message rouge. Et l'écran utilise
le même `useDebouncedFlushQueue`, donc il a hérité du réarmement de minuteur de V2.71.4.

### 1.5 — Et la raison de fond : **aucun compteur incrémental**

C'est la plus solide des cinq. Le classement de compétition est **recalculé depuis
`competition_results`** à chaque ouverture d'un écran de stats, et le dialogue du grimpeur
relit ses résultats à l'ouverture. **Le document stocké est ce qui s'affiche.**

Ce qui rendait le bug du 02/10 dangereux, c'est que deux choses pouvaient diverger : un bloc
*paraissait* validé tandis que le compteur ne bougeait pas. En compétition cette divergence
n'existe pas : si une écriture manquait, le grimpeur verrait son bloc **non validé**. Le
symptôme est visible par construction.

### 1.6 — Deux vérifications faites en chemin

- Le bouton « **Supprimer** » d'un bloc chez l'ouvreur fait en réalité
  `updateDoc(..., { is_active: false })` — une désactivation. La doctrine « ne jamais supprimer
  un document `boulders` » est tenue **par le code**, pas seulement par la consigne.
- `firestore.rules` **n'a aucune règle `delete` sur `boulders`** : refusé par défaut, pour
  tout le monde. Le seul chemin restant est la console Firebase avec les identifiants admin —
  le risque manuel déjà documenté, et que l'audit prod couvre désormais par sa recherche de
  références mortes (0 sur 777 résultats au 03/10).

---

## §2 — La simulation : 3 murs × 10 blocs (bleu → blanc), 10 participants

Deux instruments, livrés tous les deux, et **tous les deux vérifiés contre un oracle
indépendant** — un barème recopié à la main, jamais importé du code de l'application.
Comparer `getParticipantScores` à lui-même n'aurait rien prouvé.

### 2.1 — Niveau unitaire : `src/utils/competitionSimulation.test.ts` (dans `npm test`)

**60 compétitions différentes à chaque exécution**, générateur à graine donc reproductible.
10 cas, tous verts :

- 30 blocs, 3 murs de 10, deux de chaque couleur par mur, identifiants uniques ;
- score **et** nombre de blocs validés exacts pour chaque participant, sur les 60 tirages ;
- un échec ne rapporte rien et n'incrémente pas le compte ;
- barème dégressif vérifié essai par essai (1 à 8) sur chacune des cinq couleurs ;
- classement Open trié décroissant, chaque participant au plus une fois ;
- catégories d'âge : partition **sans perte ni doublon**, et appartenance recalculée depuis
  les bandes FFME ;
- idem par genre ;
- un résultat référençant un bloc ou un participant inconnu est **ignoré**, jamais compté ;
- mode « blocs validés » : la valeur du bloc versée en entier quel que soit le nombre d'essais.

**Vu rouge** : en altérant `noir: 600 → 610` dans le barème de production, deux cas tombent
(`expected 6390 to be 6340`). L'oracle mord sur 10 points d'écart.

### 2.2 — Niveau écran : `seed-competition-simulation.mjs` + `e2e-competition-simulation.mjs`

Une vraie compétition dans l'émulateur — 30 blocs, 10 participants, **224 résultats** sur la
graine par défaut — puis l'écran `AdminCompetitionStats` ouvert dans un navigateur et son
rendu comparé au calcul indépendant. 10 étapes, vertes :

- les 10 participants, séquence de scores **exactement** celle attendue ;
- score et blocs validés de chacun ;
- catégorie d'âge et genre affichés ;
- catégories d'âge : partition sans perte ni doublon, décroissance interne ;
- idem par genre ;
- aucun libellé orphelin (le filet du chantier précédent, posé ici aussi).

**Vu rouge** : en altérant **un seul** résultat sur 224 (`attempts 2 → 8`), l'e2e tombe en
nommant le grimpeur et l'écart (`score affiché 6640, attendu 6700`).

---

## §3 — ✅ La réserve est tranchée et implémentée : le départage des ex æquo

> **Arbitré par l'utilisateur le 03/10/2026, le soir même, puis implémenté et testé.**
> La règle retenue est la sienne, et elle est meilleure que les trois options que je
> proposais ci-dessous — voir le §6 pour la règle, son implémentation et ses preuves.
> Le texte qui suit est conservé tel quel : c'est l'état des lieux qui a motivé la décision.

### (état des lieux avant arbitrage)

### Ce qui a été mesuré

Sur **399 tirages**, **40 produisent au moins un ex æquo** — environ **une compétition sur
dix**. Ce n'est pas un cas théorique à 10 participants.

Sur la graine 17, deux égalités, et voici ce que l'écran affiche :

```
à 5750 pts : positions 2 et 3 pour Prenom3 (19 blocs) et Prenom1 (18 blocs)
à 5180 pts : positions 4 et 5 pour Prenom7 et Prenom5
```

### Deux constats distincts

1. **La position affichée ne marque pas l'égalité.** Les écrans de classement des modes à
   points numérotent avec `index + 1` (`AdminCompetitionStats.tsx` ligne ~501), donc deux
   grimpeurs à égalité reçoivent **deux positions différentes**. Le mode « officiel » utilise
   lui `rankOfficialEntries`, qui fait un classement sportif (1, 1, 3). Les deux modes ne se
   comportent donc pas pareil sur le même écran.
2. **Le départage est arbitraire, et pas celui qu'on croirait.** À score égal, l'ordre vient
   de l'ordre dans lequel la requête renvoie les résultats, c'est-à-dire de l'ordre
   **lexicographique des identifiants de documents** (`uid_boulderId_competitionId`) — donc
   d'uid Firebase aléatoires. Ce n'est ni le nombre de blocs validés, ni le nom, ni l'ordre
   d'inscription. Dans l'exemple ci-dessus, celui qui a **19 blocs** passe devant celui qui en
   a 18 — mais par chance, pas par règle.

### Ce que je n'ai pas fait, et pourquoi

Changer l'affichage d'une position est une **décision de produit**, pas un correctif : il faut
d'abord savoir ce que la salle veut annoncer. Trois options, que seul l'utilisateur peut
trancher :

- **a)** laisser tel quel, en sachant que l'ordre des ex æquo n'a pas de sens ;
- **b)** afficher le classement sportif (1, 1, 3) comme le mode officiel le fait déjà —
  cohérence entre les deux modes, `rankOfficialEntries` existe et est testé ;
- **c)** départager par un critère explicite, par exemple **le nombre de blocs validés** (plus
  de blocs pour le même score = moins d'essais gaspillés), puis l'égalité parfaite en (b).

Mon avis, si tu le veux : **(c) puis (b)** — un critère de départage lisible, et le classement
sportif pour ce qui reste à égalité. Mais c'est une annonce faite à des grimpeurs, donc ça
regarde la salle avant le code.

Les deux tests **constatent** le comportement actuel au lieu de le masquer, et le signalent par
une étape explicitement nommée « ⚠️ constat ». Si l'affichage change un jour, ces deux étapes
échouent et renvoient vers cette discussion.

---

## §4 — Une troisième lecture fausse de ma part, de la même famille que les deux autres

Pour mémoire, parce que la série est instructive. Mon e2e a d'abord accusé l'application :
*« 30 lignes dans les catégories d'âge, 10 attendues (perte ou doublon) »* — un message
parfaitement crédible, qui ressemblait à un vrai défaut de partition.

C'était **mon localisateur** : `page.locator('.MuiPaper-root', { hasText: titre })` remontait au
`Paper` englobant, qui contient les trois tableaux, et ramassait donc 30 lignes au lieu de 10.
Corrigé en partant du titre et en redescendant au `Paper` le plus proche, avec un commentaire
interdisant le retour en arrière.

Et une seconde fois le même soir, dans l'autre sens : mon test comparait l'ordre affiché
**ligne à ligne**, ce qui est faux pour les ex æquo — il a échoué sur la graine 17 alors que
l'application avait raison. Corrigé : la séquence des scores est comparée strictement, la
composition de chaque groupe d'égalité est comparée **en ensemble**.

Troisième et quatrième chiffres faux de la journée, après les 59 `Select` et les 0,2 Ko. Les
quatre étaient **du bon ordre de grandeur et cohérents avec l'attente**. Ce qui les a attrapés,
à chaque fois : regarder un cas à la main.

---

## §5 — Pour le jour de la compétition

Ce qui est garanti par les tests : les scores, les blocs validés, les catégories d'âge et de
genre, la partition sans perte ni doublon, et le fait qu'un résultat orphelin ne compte jamais.

Ce qui était à décider — l'affichage des ex æquo — **est tranché, implémenté et prouvé**, voir le §6.

⚠️ **Et la seule chose qui reste à faire est humaine : annoncer la règle de départage aux grimpeurs AVANT l'épreuve.** Elle s'appuie sur les cotations, cachées pendant la compétition : personne ne peut l'anticiper, ce qui est sain, mais quelqu'un qui perd dessus sans l'avoir entendue avant croira à une règle inventée après coup.

Ce qui reste à surveiller, et c'est du bon sens : qu'un grimpeur voie bien sa validation après
un rechargement — couvert par l'étape dédiée de `e2e-competition-flow.mjs`, verte.

---

## §6 — La règle de départage retenue, implémentée et prouvée (03/10/2026)

**Décision de l'utilisateur**, formulée par lui et retenue telle quelle. À points égaux :

1. le **bloc le plus dur réussi** — le plus dur devant ;
2. à difficulté égale, le **nombre d'essais sur ce bloc** — le moins d'essais devant ;
3. puis le **deuxième** bloc le plus dur, puis ses essais, et ainsi de suite ;
4. si une liste s'épuise avant l'autre, **celui qui a un bloc de plus passe devant** ;
5. si tout est identique, les grimpeurs sont **déclarés ex æquo** et partagent leur rang.

### 6.1 — Pourquoi cette règle est bonne, et pourquoi elle bat mes trois options

C'est un **ordre lexicographique** sur la liste des blocs réussis triée par difficulté
décroissante : total, déterministe, et il termine toujours (les listes sont finies). Surtout,
il récompense ce que les grimpeurs tiennent pour la performance — un blanc bat deux rouges —
là où le barème à points les égalise.

Et un argument que l'utilisateur n'avait pas avancé mais qui renforce sa règle : **ce départage
ne s'applique qu'à l'intérieur d'un groupe à points égaux**, ce qui borne tout seul son côté
lexicographique brutal. On pourrait craindre qu'un grimpeur ayant réussi un seul bloc dur
dépasse quelqu'un ayant réussi ce même bloc *plus* d'autres : c'est impossible, le second
aurait strictement plus de points et ne serait donc pas à égalité.

### 6.2 — Les trois précisions apportées à la règle, validées par l'utilisateur

- **① Liste épuisée.** « Et ainsi de suite » impliquait un cas non dit : à préfixe égal, celui
  qui a un bloc de plus passe devant. C'est le cas le plus fréquent après le premier critère,
  d'où son inscription explicite (clause 4).
- **② « Le plus dur » = la valeur du bloc réussi AU PREMIER ESSAI dans le barème de la
  compétition**, et non sa couleur. En mode Blocabrac c'est équivalent (la base de la couleur) ;
  en mode « blocs validés », c'est le `points_value` posé par l'ouvreur — et c'est là que ça
  compte, puisque la cotation y est cachée et ne reflète plus la difficulté. **Une seule
  définition qui reste juste dans les trois modes à points**, au lieu d'une règle à réécrire si
  la salle change de barème.
- **③ L'ex æquo final s'affiche comme tel.** La clause 5 n'avait nulle part où s'exprimer tant
  que l'écran numérotait en `index + 1` : les modes à points passent donc au **rang de
  compétition** (1, 1, 3), exactement comme le mode « officiel » le faisait déjà.

### 6.3 — Implémentation

Tout dans `utils/competitionClassement.ts`, en miroir de ce qui existait pour le mode officiel :
`TieBreakBoulder`, `compareTieBreak`, `compareScoreEntries`, `rankPointEntries`, et
`rankedEntries` (un assistant partagé, pour que les **six** tableaux des trois écrans ne
recalculent pas les rangs chacun à leur façon — c'est exactement l'endroit où deux
implémentations divergent en silence).

`ScoreEntry` gagne un champ `tieBreak`, rempli par `getParticipantScores` : **seuls les blocs
réussis** y entrent, un échec n'étant pas une performance à comparer.

Branché sur les quatre endroits qui numérotent un classement à points :
`AdminCompetitionStats.tsx` (global, âge, genre), `Ouvreur/CompetitionBoulders/CompetitionStats.tsx`
(idem), `AdminCompetitionLiveDisplay.tsx`, **et le message d'annonce publié aux grimpeurs** —
une annonce qui numéroterait autrement que l'écran serait la pire incohérence possible sur ce
sujet précis.

### 6.4 — Les preuves

**Huit cas calculés à la main**, un par clause, dans `competitionSimulation.test.ts` — même
choix que le jeu d'essai « Finale de l'année » : à cette échelle, un calcul vérifiable au
crayon est la garantie la plus forte disponible.

| clause | cas | attendu |
|---|---|---|
| 1 | un blanc à vue (800) vs deux rouges à vue (400+400) | le blanc devant |
| 2 | blanc en 2 essais (750) vs blanc en 4 essais + bleu (650+100) | le moins d'essais devant |
| 3 | noir+rouge (1000) vs noir+violet+2 bleus (1000) | le 2ᵉ bloc tranche |
| 4 | rouge (400) vs rouge + bleu en 11 essais (400+0) | le bloc de plus devant |
| 5 | deux grimpeurs strictement identiques | rangs **1, 1, 3** |

Plus : un échec n'entre pas dans le départage ; en mode « blocs validés » la dureté est le
`points_value` et non la couleur.

**Et la propriété qui résume le chantier**, vérifiée sur 60 tirages : **le rang d'un grimpeur ne
dépend plus de l'ordre d'écriture des résultats.** On rejoue chaque tirage avec les résultats
mélangés et on exige des rangs identiques. Avant, l'ordre des ex æquo venait de l'ordre
lexicographique des identifiants de documents, donc d'uid Firebase aléatoires.

**Vu rouge** : en remettant l'ancien tri (sans départage), la clause 4 **et** la propriété
d'invariance tombent toutes les deux.

### 6.5 — Vu à l'écran, les deux comportements

Sur la graine 17, qui produit deux égalités de points, l'écran affiche maintenant :

```
à 5750 pts : 2. Prenom1  |  3. Prenom3     (départagés par la règle)
à 5180 pts : 4. Prenom7  |  5. Prenom5     (départagés par la règle)
```

À 5750, le départage place Prenom1 devant Prenom3 — soit **l'inverse** de ce que l'écran
affichait avant, quand l'ordre venait des uid. Deux implémentations indépendantes du départage
(celle de l'application, celle de l'oracle du seed) s'accordent sur le résultat affiché.

Et la clause 5, que le hasard ne produit jamais (0 sur 399 tirages), est **forcée** par
`SIMU_EX_AEQUO=1`, qui recopie le tirage d'un grimpeur sur un autre :

```
à 5750 pts : 2. Prenom1  |  2. Prenom2  |  4. Prenom4   (rang PARTAGÉ : départage épuisé)
```

Rang 2 partagé, rang 3 sauté. ⚠️ Ce drapeau existe pour une raison précise : sans lui, le jeu
de données serait **physiquement incapable d'exprimer** la clause 5, et elle n'aurait jamais été
vue à l'écran — c'est la leçon du jour, inscrite dans `CLAUDE.md`.

### 6.6 — Ce qu'il reste à annoncer aux grimpeurs

Le départage s'appuie sur les **cotations, cachées pendant l'épreuve**. Un grimpeur ne peut donc
ni l'anticiper ni le viser — c'est un avantage (ça ne se joue pas), mais **il faut l'annoncer
avant l'épreuve**, sinon quelqu'un qui perd sur ce critère aura l'impression d'une règle sortie
après coup.

Vérifications : `npm test` **338/338**, `tsc`, `lint`, `e2e-competition-simulation` 10/10 sur
les deux graines (avec et sans ex æquo forcé), `e2e-competition-flow` 16/16.
