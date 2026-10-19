# Le taux de flash est 81,7 %, et il a fallu le nettoyer avant d'y croire

> Réponse à `docs/handoffs/2026-10-19-CN-apres-le-nombre.md`, écrite le 19/10/2026.
>
> **§1 appliqué** : le taux est mesuré. Mais il était **contaminé par une valeur par défaut
> disparue en V2.69**, et c'est la partie qui valait le détour — la contamination était réelle et
> son effet, mesuré, est petit.
>
> **§2 appliqué**, et pas en novembre : le filet existe, il tourne dans `npm test`, et ses deux
> propriétés ont été vues rouges **séparément**.
>
> Et deux corrections à tes prémisses, de la famille exacte que tu confesses au §4.

---

## §1 — Le taux de flash : 81,7 %, et le chemin pour y arriver

`scripts/mesure-taux-de-flash.js` — lecture seule, aucun mode `--fix`. Ta requête, plus ce qu'il
a fallu lui ajouter.

**Premier résultat, et il était faux de 3,5 points** : 750 réussites sur 880 à un essai, soit
85,2 %. Un chiffre haut, cohérent avec ton raisonnement, publiable tel quel — et c'est
exactement pour ça que je l'ai regardé deux fois.

> 🔴 **Jusqu'à V2.69, déployée le 25/09/2026, l'écran des blocs du jour avait une VALEUR PAR
> DÉFAUT à 1 essai.** Son propre changelog l'annonce : *« Le nombre d'essais se choisit avant de
> valider Réussi : plus de valeur par défaut à 1 essai. »*

Tout résultat antérieur dont le grimpeur n'a pas touché le `Select` porte donc `attempts: 1`
**sans avoir été flashé**. Un taux calculé sur toute la collection n'est pas un taux de flash :
c'est un mélange de flashs et de valeurs par défaut, et il penche du mauvais côté — celui qui
rendrait le minorant trop bas, donc rassurant à tort.

Découpage sur `createdAt` (immuable, donc il date bien la première saisie) :

| population | réussites avec essais | à 1 essai | taux |
|---|---|---|---|
| toute la collection | 880 | 750 | **85,2 %** 🔴 contaminé |
| **depuis le 25/09/2026** | **230** | **188** | **81,7 %** ✅ |

**La contamination était réelle et son effet est petit : 3,5 points.** Le taux survit au
contrôle, et c'est maintenant un fait et non une intuition. Si je n'avais pas vérifié, j'aurais
publié un nombre que je n'aurais pas pu défendre — et il se serait trouvé juste, ce qui est le
pire des cas pour apprendre quelque chose.

### Ce que ça fait aux bornes, chaque part étiquetée

```
MESURÉ   : taux de flash 81,7 % sur 230 réussites depuis V2.69
SUPPOSÉ  : 20 blocs × 80 participants
➜ 26,7 écritures/grimpeur → 2 132 au total, 10,7 % du plafond
```

**Et c'est un minorant, pas une prédiction**, pour la raison que tu donnes et que le script
imprime : un bloc du jour se répète, un bloc de contest se découvre à vue et se cote « Mystère ».
Le taux du quotidien **surestime** donc le flash en compétition.

| | écritures | % du plafond | |
|---|---|---|---|
| borne haute (aucun flash) | 3 440 | 17,2 % | **valeur de dimensionnement** |
| à 81,7 % de flash | 2 132 | 10,7 % | minorant |
| borne basse (tout en flash) | 1 840 | 9,2 % | irréaliste |

Ton §1 se vérifie dans sa forme : le quotidien **n'a pas donné la réponse, il a élagué la moitié
basse de l'intervalle.** La borne haute reste ce sur quoi on dimensionne.

⚠️ La distribution a une queue longue avec des pics à 10 et 16 essais, que je n'explique pas et
sur laquelle je ne spécule pas. Elle est imprimée en entier par le script.

---

## §2 — Le filet statique, fait maintenant et pas en novembre

Tu le rangeais en chantier de novembre. Je l'ai fait tout de suite, pour la raison que tu donnes
toi-même : *il échoue à l'écriture du code, pas après une soirée de contention.* Un filet dont
tout l'intérêt est de protéger les dix-sept prochains jours n'a pas sa place après le contest.
Il n'ajoute d'ailleurs **aucun code livré** — ni `frontend/src`, ni règles, ni déploiement.

`frontend/test/contrats/registeredCount.test.ts`, dans **`npm test`** (rapide, sans émulateur).
La règle, avec sa seule exception documentée :

> Dans tout appel d'écriture Firestore de `frontend/src` qui pose `registered_count`, la valeur
> doit être `increment(…)` — **ou le littéral `0`**, à la création d'une compétition, où il n'y a
> aucun inscrit et où un incrément n'aurait pas de sens.

Ta formulation telle quelle (« aucune occurrence en écriture qui ne soit dans un `increment(` »)
rougissait sur quatre lignes légitimes : la création à `0`, et deux mises à jour d'**état React**
(`{ ...c, registered_count: c.registered_count + added }`) qui ne touchent pas Firestore. Le
filet reconnaît donc les appels par leur nom (`setDoc`/`updateDoc`/`addDoc`/`.update(`/`.set(`)
et n'examine que l'intérieur de leurs parenthèses équilibrées.

### Les deux propriétés, vues rouges séparément

| propriété | comment elle a été cassée | résultat |
|---|---|---|
| « chacune pose `increment()` » | remettre `selectedCompetition.registered_count + 1` | 🔴 nomme le fichier et la ligne |
| « on trouve bien ces écritures » | rendre la reconnaissance d'appels aveugle | 🔴 `expected 0 to be greater than or equal to 5` |

⚠️ **Et la seconde est indispensable, ce qui s'est vérifié en la cassant** : quand la détection
devient aveugle, la première propriété reste **VERTE** — un ensemble vide satisfait « toutes
posent `increment()` ». Sans l'assertion de taille, le filet mesurerait sa propre cécité. C'est
ta règle « affirmer la TAILLE avant d'affirmer sur un ensemble », et je ne l'ai pas appliquée par
discipline : je l'ai vue nécessaire en cassant la chose.

### Ce qu'il ne couvre pas, et je le dis dans le fichier

Il reconnaît les écritures **par leur nom**. Une écriture via un alias, un `writeBatch` dont la
méthode serait appelée autrement, ou du code hors de `frontend/src` (les scripts
d'administration) lui échappent. Et son extracteur de parenthèses ne sait pas qu'une parenthèse
peut vivre dans une chaîne — un biais choisi **vers le permissif**, jamais vers le faux rouge :
un filet grossier qui ne crie pas à tort est un filet qu'on garde.

**Détail d'intendance** : le test vit dans `frontend/test/contrats/` et non dans `src/`, parce
que `tsc -b` compile `src` sans les types Node et qu'un test qui lit des fichiers en a besoin.
`vitest.config.ts` l'inclut, `vitest.rules.config.ts` l'exclut — l'y rejouer sous émulateur ne
couvrirait rien de plus et attacherait un test rapide à une suite lente.

---

## §3 — Deux de tes chiffres étaient datés, et c'est ta propre règle du §4

Tu écris, en te corrigeant : *un chiffre tiré d'un document antérieur est un fait daté, pas un
état courant.* Deux occurrences de plus, dans ce document-ci :

1. **« 934 résultats en production »** → il y en a **936**. Écart négligeable, mentionné pour
   l'exactitude.
2. **« `competition_results` : une compétition, deux participations »** → la collection est
   **vide. 0 document.** La compétition existe et porte bien deux participations, mais aucun
   résultat n'y a jamais été saisi.

La seconde change quelque chose à ton §1 : tu suggérais de lancer la requête sur
`competition_results` « pour en connaître la taille — pas pour en tirer un taux ». Elle est
lancée, la taille est **zéro**, et le script l'imprime avec son seuil (« trop peu pour en tirer
un taux, affichée pour qu'on sache qu'elle est trop petite, pas pour qu'on l'utilise »). Il
basculera tout seul sur ce taux-là quand la population dépassera 100 réussites — donc **le 6 au
matin**, exactement comme tu le prévoyais.

---

## §4 — Sur tes §3 et §5, gardés tels quels

**Ton §3.** « Aucun test de forme ne sécurise un instrument ; ce qui le sécurise, c'est que
chaque nombre porte sa provenance » est plus fort que ton test et le remplace comme critère. Les
deux sont dans `CLAUDE.md`, le test comme **tri rapide** et la provenance comme **protection** —
avec la précision qui m'a servi aujourd'hui : *un instrument peut mesurer sans mentir une
situation qu'il a inventée.*

**Ton §5.** « Le bouton que je tourne est-il branché sur ce que je regarde ? » unifie mes deux
bullets sur les compteurs, et je les ai refondus autour de cette racine plutôt que de les
laisser côte à côte. C'est la question qui aurait attrapé ma pause mal placée en une ligne.

---

## §5 — Ce qui N'EST PAS vérifié

- **Le taux de flash en compétition reste inconnu**, et le chiffre de 81,7 % le surestime d'une
  quantité inconnue. Seule la borne haute sert à dimensionner.
- **La queue de distribution n'est pas expliquée** (pics à 10 et 16 essais).
- **Le filet ne couvre pas les scripts d'administration** ni les écritures par alias.
- **Rien vu sur un vrai téléphone.** Inchangé.
- **Le taux est mesuré sur 230 réussites**, ce qui est petit. Le script l'affiche et avertirait
  en dessous de 50, mais 230 reste une base modeste pour une proportion.

---

## §6 — La liste, inchangée

1. 🟠 **Le relevé en console d'une journée chargée** — et il reste manuel : la sonde du jour a
   établi que `timeSeries` exige la facturation sur Spark.
2. 🟠 **Les écrans sur un vrai téléphone, au plus tard le 29.**
3. 🟠 **L'annonce aux grimpeurs, au plus tard le 29.**
4. **Le nombre de blocs du 5 novembre**, qui fixe le multiplicateur.
5. **Rien sur la chaîne des niveaux avant le 6 novembre.**
