# Addendum — vérifier le correctif sur un cas avant de le passer à 77

> Rédigé le 03/10/2026, après le §6 du `RETOUR-labels-non-associes.md`.
> Complète la `CORRECTION-plan-labels.md` de 11h.
>
> **Le §0 porte deux rectifications d'écriture. Le §1 est le seul point neuf, et il
> conditionne tout le lot.** Le reste confirme.

---

## §0 — Deux rectifications à porter avant tout le reste

**1. Supprimer du `PLAN-labels-non-associes.md` le §3.4 (fond blanc) et le §5 point 4
(contrôle visuel en thème sombre).** Ils reposaient sur un relevé mal identifié et n'ont plus
d'objet. Ton §3 a eu raison de les attaquer.

**2. Rectification sur ton §3, pour que l'explication consignée soit la bonne.** Le blanc ne
venait pas d'un héritage visuel du `Paper` : **`background-color` n'est pas une propriété
héritée en CSS** — un élément sans déclaration calcule `rgba(0,0,0,0)`, jamais
`rgb(255,255,255)`.

La vraie cause est que les deux relevés transmis par l'utilisateur portaient sur **deux
éléments différents** :

| relevé | `line-height` | nature |
|---|---|---|
| premier | **1.4375em**, avec `transform-origin`, `pointer-events: none` | un `InputLabel` MUI |
| second | **1.5**, avec `margin: 0`, `background-color: #fff`, typographie barrée | la règle `body` de `CssBaseline` |

`margin: 0` + `color: rgba(0,0,0,0.87)` + la typographie `body1` + `background-color:
background.default` : c'est exactement ce que `CssBaseline` applique à `<body>`, et
`line-height: 1.5` en est la signature, là où un libellé d'input vaut `1.4375em`.

**Le second nœud était le `body`**, et j'ai lu les styles du document comme ceux d'un libellé.

Cette rectification n'a aucune conséquence pratique — la conclusion est la même — mais sans
elle, une explication fausse resterait consignée comme fait établi. C'est précisément ce que
ce projet passe son temps à déterrer.

---

## §1 — ⚠️ Le `htmlFor` doit être vérifié avant d'être généralisé

Le §6.1 a raison et mon §3.1 était incomplet : `labelId` ne pose qu'`aria-labelledby`, Chrome
vérifie `for`, et 77 `InputLabel` du dépôt n'en portent aucun. C'est bien un défaut de classe,
et je ne l'avais pas vu.

**Mais le correctif proposé repose à son tour sur une prémisse non vérifiée**, et c'est
exactement le motif qui nous occupe depuis deux jours.

En HTML, `label[for]` doit désigner un **élément étiquetable** : `input`, `select`,
`textarea`, `button`, `meter`, `output`, `progress`. Or un `Select` MUI **n'est pas un
`<select>`** : il rend une `<div role="combobox">` pour l'affichage, plus un `<input>` caché
qui porte la valeur. Selon l'élément auquel MUI applique la prop `id`, deux issues :

- si l'`id` atterrit sur la `div` → `for` pointe vers un élément **non étiquetable**, et le
  signalement Chrome **peut très bien persister**, ou se transformer en un autre ;
- si l'`id` atterrit sur l'`input` caché → le câblage fonctionne.

Je ne tranche pas : il faut le lire dans le DOM rendu, pas dans la documentation.

**Contrôle, dix minutes, avant toute généralisation :**

1. Ajouter `htmlFor` sur **un seul** champ — « Cotation » dans `DailyBoulderForm.tsx`.
2. Recharger l'espace Blocs quotidiens, **panneau Issues vidé au préalable**.
3. Le compte « No label associated » doit passer de **4 à 3**.

- S'il passe à 3 → le motif est validé, il peut aller aux 77.
- S'il reste à 4 → le `for` ne résout pas vers un élément étiquetable, et il faut chercher
  l'identifiant réel du champ (celui de l'`input` caché) avant d'écrire quoi que ce soit.

C'est la transposition directe de votre propre règle du §5 : **un correctif de classe se
vérifie sur un cas lu à la main, sinon il propage son propre défaut.** Appliqué à 77 endroits
sans ce contrôle, un motif faux se corrige 77 fois.

---

## §2 — Critère de sortie : j'adopte votre formulation

Mon §5 point 5 demandait « zéro signalement de libellé ». Le §6.2 montre que c'est
**inatteignable** : les deux signalements `id`/`name` viennent du textarea fantôme de
`TextareaAutosize`, rendu par MUI, `aria-hidden`, hors de portée.

Critère retenu :

> **Zéro signalement de type « No label associated with a form field ».** Les signalements
> « should have an id or name » issus des textareas fantômes de MUI sont une **déviation
> connue et documentée**, imputable à la bibliothèque et non corrigeable depuis le dépôt.

À consigner avec sa raison, exactement comme les `KNOWN_EXCEPTIONS` de
`audit-prod-catalog.js`. Un écart accepté qu'on ne documente pas redevient un avertissement
permanent, et un avertissement permanent apprend à ignorer les avertissements.

Et le §6.3 en découle : **l'assertion du §4.1 exclut les éléments `aria-hidden`** de la
vérification « tout champ porte un `id` ou un `name` ». Sans cette exclusion elle serait rouge
sur 17 champs intouchables — le filet inutile contre lequel le plan mettait en garde.

---

## §3 — Le seul fil qui reste, et le test qui le coupe

Le §6.4 le dit honnêtement : les deux causes sont constantes, donc le compte devrait être de 6
sur **tous** les murs, et l'inégalité observée n'est pas reproduite par l'analyse.

Deux explications restent en lice, et un seul test les départage :

| hypothèse | prédiction |
|---|---|
| **accumulation** — le panneau Issues ne s'efface jamais seul, et chaque remontage ajoute de nouvelles ressources | le compte **grossit** à mesure qu'on change de mur |
| **autre total** — la comparaison portait sur l'agrégat « améliorations », qui mélange d'autres natures | le compte reste à **6** partout |

**Le test** : vider le panneau, charger un mur, noter. Changer de mur, noter.
Si ça s'additionne → accumulation. Si ça reste à 6 → l'analyse du §6 est complète et
l'observation initiale portait sur autre chose.

Dans les deux cas le chantier n'est pas bloqué : les six signalements de cet écran sont
intégralement attribués.

---

## §4 — Ce que je retiens de cet aller-retour

Mon plan contenait trois prémisses, et **les trois étaient fausses** : l'écran, le fond blanc,
et le motif de correction. Ce qui a tenu, c'est uniquement la **méthode** — inventaire
statique, filet sur le rendu, voir rouge d'abord.

C'est une leçon utile sur la répartition des rôles : je suis utile sur la forme d'un problème
et sur ce qu'il faut vérifier, et peu fiable sur tout fait de code que je n'ai pas lu. Mes
prochains plans énonceront les faits de code comme des **lectures à faire**, jamais comme des
acquis — y compris, désormais, les motifs de correction eux-mêmes.
