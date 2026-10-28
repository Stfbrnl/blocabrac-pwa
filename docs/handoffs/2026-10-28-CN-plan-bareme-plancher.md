# ClaudeNav — plan : décroissance qui s'aplatit, pour le 5 novembre

> Rédigé le 28/10/2026. Décision de Stéphane : option **B** du
> `2026-10-28-CN-bareme-essais.md`, appliquée dès le contest. Motif retenu : zéro compétition
> jouée cette saison, donc aucune règle n'est modifiée en cours de route.
>
> ⚠️ **§1 — une contrainte que la décision ne couvre pas, et elle change la forme du travail :
> il ne faut PAS toucher à `calculatePoints`.** Ce barème est partagé avec le classement
> quotidien ; le modifier réécrirait rétroactivement les points de tous les grimpeurs à la
> prochaine réconciliation. **Le lot est un nouveau mode, pas une modification de l'existant.**
>
> §5 : la faiblesse de B était son annonce. Elle se règle en publiant **la table, pas la
> formule**.
>
> ---
>
> **Deux signaux d'alarme, à surveiller pendant tout le lot :**
>
> 1. ⚠️ **Un test existant qu'il faut modifier = le mode `blocabrac` a bougé**, donc le §1 n'est
>    pas respecté. C'est le contrôle le moins cher de ce lot : il ne demande rien d'autre que de
>    remarquer qu'on s'apprête à ouvrir un fichier de test qui n'aurait pas dû être touché.
> 2. ⚠️ **Pas de numéro de version dans la clé technique.** `blocabrac_v2` vieillit mal — dans
>    six mois personne ne saura ce que v2 désignait, et un v3 rendrait le v2 illisible. **La clé
>    décrit la règle, jamais son rang d'apparition.**

---

## §1 — ⚠️ Un nouveau mode, et surtout pas une modification de `calculatePoints`

`calculateCompetitionPoints(..., mode='blocabrac')` se termine par un appel à
`calculatePoints` — **la même fonction qu'utilise `summarizeValidatedResults` pour le classement
quotidien**, et que `reconcile-classement-profiles.js` emploie comme référence de recalcul
complet.

Conséquence directe, et c'est la leçon du 02/10 appliquée à l'échelle de toute la base :

> **Changer `calculatePoints`, c'est réécrire l'histoire de tous les blocs validés par tous les
> grimpeurs**, à la prochaine passe de réconciliation. Pas une recotation d'un bloc : la
> totalité du classement général, d'un coup.

Et ça ne correspond pas à la décision : le raisonnement de Stéphane porte sur **les règles d'une
compétition**, pas sur le barème quotidien de la salle.

**Donc : un cinquième `ScoringMode`**, à côté de `blocabrac`, `blocs_valides`, `personnalise` et
`officiel`. `blocabrac` reste **intact**, mot pour mot — ses tests existants restent verts sans
y toucher, ce qui est le meilleur garde-fou possible.

Nom de clé proposé : `blocabrac_plancher`. Libellé à l'écran admin : *« Blocabrac — avec
plancher »*. Le nom final appartient au gérant ; la clé technique, elle, ne doit pas porter de
numéro de version.

---

## §2 — La courbe

```
points = base × ( 0,25 + 0,75 × 0,85^(essais − 1) )
```

Bases inchangées : jaune 25, vert 50, bleu 100, violet 200, rouge 400, noir 600, blanc 800,
rose 1000. **Aucune déduction par couleur** — et c'est ce qui fait disparaître l'anomalie du
blanc par construction, puisqu'il n'y a plus de paramètre propre à chaque couleur.

Ce qu'elle garantit, vérifié par calcul sur 1 à 60 essais :

| propriété | vérifiée |
|---|---|
| un bloc réussi ne vaut **jamais zéro** | ✅ plancher à 25 % de la base |
| l'ordre des couleurs tient **à tous les nombres d'essais** | ✅ chaque couleur est la base × le même facteur |
| la perte est **forte au début, négligeable à la fin** | ✅ −11 % au 2ᵉ essai, −1 % au 20ᵉ |
| l'anomalie blanc/rose | ✅ supprimée — plus de déduction par couleur |
| un flash reste **nettement** au-dessus d'un combat | ✅ noir flashé 600, noir en 50 essais 150 |
| un bloc dur arraché ne dépasse pas un bloc plus facile flashé | ✅ noir à 50 essais (150) < violet flashé (200) |

**Arrondi** : à l'entier le plus proche, **une seule fois, à la fin**. Jamais sur une valeur
intermédiaire.

---

## §3 — Le barème en clair

| couleur | 1 | 2 | 3 | 4 | 5 | 7 | 10 | 15 | 20 | 30 | 50+ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| jaune | 25 | 22 | 20 | 18 | 16 | 13 | 11 | 8 | 7 | 6 | 6 |
| vert | 50 | 44 | 40 | 36 | 32 | 27 | 21 | 16 | 14 | 13 | 13 |
| bleu | 100 | 89 | 79 | 71 | 64 | 53 | 42 | 33 | 28 | 26 | 25 |
| violet | 200 | 178 | 158 | 142 | 128 | 107 | 85 | 65 | 57 | 51 | 50 |
| rouge | 400 | 355 | 317 | 284 | 257 | 213 | 169 | 131 | 114 | 103 | 100 |
| noir | 600 | 532 | 475 | 426 | 385 | 320 | 254 | 196 | 171 | 154 | 150 |
| blanc | 800 | 710 | 633 | 568 | 513 | 426 | 339 | 262 | 227 | 205 | 200 |
| rose | 1000 | 888 | 792 | 711 | 642 | 533 | 424 | 327 | 284 | 257 | 250 |

Ce que ça change pour le grimpeur qui a soulevé la question : **un noir arraché en cinquante
essais passe de 0 à 150 points**, un blanc de 0 à 200, un rose de 0 à 250.

---

## §4 — Ce qui change dans le code, et rien d'autre

1. `ScoringMode` : ajouter `'blocabrac_plancher'` à l'union ;
2. `calculateCompetitionPoints` : une branche, trois lignes, avant le repli sur `calculatePoints` ;
3. l'écran admin de création/édition de compétition : une option de plus dans le sélecteur ;
4. `competitionClassement.ts` : pour le départage, la dureté de ce mode est **la base de la
   couleur**, exactement comme `blocabrac`. Rien à inventer ;
5. des tests propres au mode : le plancher atteint, l'ordre des couleurs à plusieurs nombres
   d'essais, et **l'absence de zéro** sur un succès.

⚠️ **Ne touche à aucun test existant.** S'il faut en modifier un, c'est le signe que le mode
`blocabrac` a bougé — et c'est précisément ce qu'on ne veut pas.

---

## §5 — L'annonce : la table, pas la formule

La faiblesse de l'option B était son annonce : « −10 points par essai » se dit en une phrase,
une courbe non. La réponse est de **ne pas annoncer la courbe** :

> **Deux phrases pour les grimpeurs** : *« Un bloc réussi rapporte toujours des points, quel que
> soit le nombre d'essais — au minimum un quart de sa valeur. Les points baissent vite sur les
> premiers essais, puis de moins en moins. »*
>
> **Et la table du §3 affichée à l'accueil**, où elle répond à toutes les questions que les deux
> phrases laissent ouvertes.

C'est la bonne division : la phrase donne l'intention, la table donne les chiffres. Personne n'a
besoin de la formule, et personne ne la lira.

⚠️ **Cette annonce s'ajoute aux trois points déjà prévus**, et elle est la plus facile à faire
passer — elle n'annonce que de bonnes nouvelles. Mais elle doit partir **avant** le 5 : un
barème changé en silence serait pire que l'ancien, et c'est le grimpeur qui a soulevé la
question qui s'en apercevrait le premier.

---

## §6 — Ce que ce lot ne doit pas devenir

- **pas de modification de `calculatePoints`** (§1) ;
- **pas de paramétrage** du plancher ni du taux par compétition : le mode `personnalise` existe
  déjà pour qui veut régler lui-même. Deux chiffres fixes, écrits en clair dans le code ;
- **pas de rattrapage sur les compétitions passées** : les trois compétitions de test gardent
  leur barème. Un mode est choisi à la création d'une compétition, il ne se rejoue pas ;
- **rien sur la chaîne des niveaux**, qui reste gelée jusqu'au 6 novembre. Ce lot n'y touche pas.

---

## §7 — Et la question qui reste, pour plus tard

Le barème **quotidien** garde, lui, l'anomalie du blanc : déduction 50 sur base 800, donc zéro
au 17ᵉ essai, moins tolérant qu'un noir. Elle est réelle et elle restera après le 5 novembre.

Mais elle n'a **pas de bon moment** pour être corrigée, et c'est le pendant exact de l'argument
de Stéphane : une compétition se joue et se clôt, donc on peut changer ses règles entre deux
éditions ; le classement général est **cumulatif et recalculé**, donc toute modification de son
barème réécrit tout son passé.

> **Le barème de compétition peut changer aujourd'hui. Le barème quotidien ne peut changer
> proprement à aucune date.**

C'est un argument pour garder les deux séparés **durablement**, et pas seulement cette fois-ci.
La correction de l'anomalie du blanc au quotidien reste à décider : elle vaut le déplacement
qu'elle provoquera dans le classement général, ou elle ne le vaut pas — et c'est une question
pour après le contest.
