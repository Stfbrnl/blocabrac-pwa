# Multiplicateur de points par bloc — plan v2

**Pour ClaudeCode — 3 novembre 2026, J-2**

**Cette v2 remplace entièrement `2026-11-03-CN-plan-compte-double.md`. Ne transmets pas la v1 :
son instruction centrale était fausse.** Deux choses ont changé depuis :

1. Le gérant a annoncé le doublement sans consultation, mais il le voudra à l'avenir : c'est
   donc une **fonctionnalité durable**, pas un correctif de 48 heures. Elle prend la forme d'un
   **sélecteur en face de chaque bloc** de la liste des blocs d'une compétition — qu'il ait été
   créé pour l'épreuve ou ajouté depuis les blocs quotidiens — activable et modifiable à tout
   moment pendant la compétition.
2. **Une lecture a inversé la règle de cycle de vie du champ.** Voir §0.

---

## §0 ⚠️ La lecture qui inverse tout

`ClientCompetitions.tsx` porte ce commentaire sur `scoring_mode` :

> *« n'affecte que l'aperçu de points affiché ici pendant la validation, **pas ce qui est écrit
> dans `competition_results`** »*

Et l'interface `ValidationResult` le confirme : `competition_results` stocke `success`,
`attempts`, `rating`, `proposedDifficulty`, `zone`, `attemptsToZone` — **des faits bruts,
aucun point**. Les points sont **recalculés à chaque affichage** depuis le mode et le bloc.

**Conséquence :** si le multiplicateur est supprimé du bloc à la clôture — comme l'est
`points_value`, et comme je l'avais écrit en v1 — alors tout recalcul postérieur d'une
compétition terminée rend les blocs doublés au simple. L'histoire change après coup.

Le multiplicateur n'appartient donc **pas** au groupe de `points_value` (supprimé à la
clôture) mais à celui de **`competition_id` (conservé pour l'historique)**.

Mais conserver le champ ouvre le défaut inverse : un bloc quotidien réutilisé dans une
compétition future hériterait du ×2 — exactement ce que le commentaire de
`handleConfirmMigrate` interdit pour `points_value`.

**Les deux exigences ne se contredisent qu'en apparence. La remise à zéro ne va pas à la
clôture, elle va au rattachement.**

| moment | `points_value` (existant) | `points_multiplier` (nouveau) |
|---|---|---|
| **Rattachement** (`handleConfirmAddExisting`) | — | **effacer** ← la ligne nouvelle |
| **Retrait de l'épreuve** (`handleConfirmRemove`) | effacé | **effacer** (idem) |
| **Clôture** (`handleConfirmMigrate`) | effacé | **CONSERVER** ← l'inversion |

`handleConfirmAddExisting` écrase déjà `competition_id` et pose `competition_active` dans son
`batch.update` : la remise à zéro y est une clé de plus dans l'objet qui est déjà écrit.
Coût nul, et c'est le seul endroit où un bloc change de compétition.

### Un défaut latent que cette lecture révèle, à ne PAS corriger avant le 6

Si rien ne stocke les points et que `points_value` est supprimé à la clôture, alors une
compétition `blocs_valides` terminée se recalcule déjà aujourd'hui avec des valeurs disparues.
C'est peut-être sans effet — si seul le palmarès gelé est affiché pour une épreuve terminée —
ou c'est un défaut réel. **À lire, à noter, à ne pas toucher avant le 6 novembre.** Ce n'est
pas le chantier de cette semaine, et le gel tient.

---

## §0 bis Le second signal d'alarme, inchangé

**`calculatePoints` ne doit pas être touché.** C'est le barème quotidien, partagé avec le
classement général et le script de réconciliation. Le multiplicateur vit **uniquement** dans
`calculateCompetitionPoints`. Un diff qui touche `calculatePoints` est faux : arrête-toi.

**L'invariant à prouver :** un bloc **sans** multiplicateur rend exactement la valeur qu'il
rend aujourd'hui — cinq modes, huit couleurs, tout nombre d'essais. **Si un test existant doit
être modifié, un mode existant a bougé.**

---

## §1 Lectures à confirmer sur la source actuelle

Mon index date du 19/10 ; V2.75 et V2.76 ont été livrées depuis.

1. **`calculateCompetitionPoints`** — signature et **emplacement exact de l'arrondi unique**
   de `blocabrac_plancher` (décision D3).
2. **`CompetitionBouldersList.tsx`** — la structure de la liste, pour y ajouter une colonne.
   Confirme qu'elle affiche bien **les deux formes** de bloc (créé pour l'épreuve et quotidien
   rattaché) : c'est ce qui permet un seul sélecteur pour les deux cas.
3. **`handleConfirmAddExisting`, `handleConfirmRemove`, `handleConfirmMigrate`** — les trois
   sites du tableau du §0.
4. **Le dialogue de validation client** — où l'aperçu des points est calculé, pour la puce.
5. **`competitionClassement.ts`** — le site d'appel qui mesure la dureté (décision D2).
6. **`firestore.rules`** — où valider la valeur écrite (D1).
7. **En production, les 23 blocs** : `type: 'daily'` avec `color`, et **déjà rattachés ou
   non** ? Un mur changé hier produit des blocs quotidiens *non rattachés* : voir tâche 0.

---

## §2 Trois décisions

### D1 — Un nombre, pas un booléen — et une liste blanche dans les règles

**Je reviens sur la recommandation « booléen » de la v1 : la contrainte a changé.** Un
correctif de 48 heures veut un booléen, qu'on ne peut pas mal poser. Une fonctionnalité
durable veut le nombre, pour ne jamais avoir à migrer la donnée le jour où le gérant demande
un ×3.

```ts
points_multiplier?: number;   // absent = 1
```

Le champ est un nombre, **l'interface n'expose que ×1 et ×2** — c'est le sélecteur demandé — et
`firestore.rules` porte une **liste blanche** : la valeur doit être absente ou appartenir à
`[1, 2]`. Élargir plus tard, c'est une valeur dans la liste et une option dans le menu : aucune
migration, aucun changement de calcul.

La liste blanche n'est pas décorative. Sans elle, un `0` ou un `0.5` posé par erreur annule
des points sans rien afficher d'anormal. Le test de règles
`competition-existing-daily-boulders.test.ts` est l'endroit où la verrouiller.

### D2 — Le départage : le multiplicateur y coule

`competitionClassement` mesure la dureté par `calculateCompetitionPoints(boulder, 1, true, mode)`.
Si le multiplicateur est dans cette fonction, un violet ×2 (400) se mesure aussi dur qu'un
rouge (400).

**Je recommande de le laisser couler**, pour la raison que le projet a déjà acceptée en mode
`blocs_valides` : dans un mode à points, la dureté *est* la valeur en points. Une seconde voie
de calcul à J-2 est le risque le plus grand des deux. Mais c'est à dire à voix haute, parce que
c'est annonçable : **un bloc doublé compte double partout, départage compris.**

### D3 — Le multiplicateur s'applique APRÈS l'arrondi

En `blocabrac_plancher`, `points = arrondi(base × (0,25 + 0,75 × 0,85^(essais−1)))`, arrondi
**une seule fois**. L'ordre vaut un point :

| ordre | violet, 3 essais | ce que le grimpeur constate |
|---|---|---|
| `arrondi(base × facteur × 2)` | 289 | l'écran affiche 144, le total crédite 289 |
| `arrondi(base × facteur) × 2` | **288** | **exactement le double de la valeur affichée** |

Un seul arrondi subsiste dans les deux cas, mais seul le second préserve la propriété que le
grimpeur vérifie de tête. L'autre produit des écarts de 1 point inexplicables au micro.

Concrètement : **une seule ligne, tout à la fin** de `calculateCompetitionPoints`, après le
switch de mode et après l'arrondi :

```ts
points *= (boulder.points_multiplier ?? 1);
```

Cette position couvre les cinq modes uniformément, `blocs_valides` et `officiel` compris. Et
`success: false` donne 0, dont le multiple est 0 : aucun cas particulier.

---

## §3 Le lot — cinq commits

**Commit 1 — le champ et son cycle de vie.** `points_multiplier?: number` sur le type
`Boulder` (les deux déclarations : l'ouvreur et `ClientCompetitions.tsx`, qui a la sienne),
la liste blanche dans `firestore.rules`, et les **trois** sites du tableau du §0 — effacer au
rattachement, effacer au retrait, **conserver à la clôture**. Aucun changement de calcul.
Les tests de règles verrouillent les trois.

**Commit 2 — la branche de calcul.** La ligne de D3, plus le test de propriété du §4.

**Commit 3 — le sélecteur dans la liste ouvreur.** Une colonne dans
`CompetitionBouldersList.tsx`, un `Select` ×1/×2 par ligne, pour **les deux formes de bloc**,
modifiable à tout moment pendant la compétition. Une écriture par changement : négligeable.
Ajoute une action en masse sur une sélection de lignes — c'est ce qui permettra de poser 23
drapeaux jeudi sans 23 clics, et c'est un confort d'écran, pas une règle de calcul.

**Commit 4 — la puce « ×2 » côté client.** Dans le dialogue de validation, à côté du bloc.
**Ce n'est pas cosmétique :** l'aperçu affichera le double, et sans légende le grimpeur lira un
bug. Pour une fonctionnalité durable, l'affichage du multiplicateur fait partie de la
fonctionnalité, partout où la valeur d'un bloc est montrée au grimpeur.

**Commit 5 — le classement.** Normalement rien à changer (D2 : ça coule). Vérifie-le, et
ajoute un test qui fige le comportement décidé plutôt que de le laisser implicite.

---

## §4 Les tests

**Le test central :** pour les 5 modes × 8 couleurs × essais 1 à 20, un bloc **sans**
`points_multiplier` rend exactement la valeur de référence actuelle. Fige les valeurs en table
dans le test — ne les recalcule pas avec la fonction testée.

Puis : avec `points_multiplier: 2`, exactement le double, mêmes dimensions.

Puis les trois tests de cycle de vie, qui sont le cœur du §0 :
- un bloc rattaché à une **nouvelle** compétition ne porte plus le multiplicateur de la
  précédente ;
- un bloc retiré de l'épreuve ne le porte plus ;
- **un bloc d'une compétition terminée le porte toujours** — c'est l'assertion qui protège
  l'historique, et c'est celle que la v1 aurait fait échouer.

Puis un cas de classement mêlant un bloc ×2 et un bloc normal, pour écrire D2 quelque part.

Et la liste blanche : une écriture à `0`, à `0.5`, à `3` est refusée par les règles.

---

## §5 Hors code — et une question à poser au gérant aujourd'hui

**Tâche 0, indépendante du multiplicateur :** les 23 blocs ont été créés hier lors d'un
changement de mur. Ce sont des blocs quotidiens **probablement pas encore rattachés** à la
compétition. Il faut les rattacher (« Ajouter des blocs quotidiens existants ») — chemin
existant et testé. À faire de toute façon.

**La question au gérant, par écrit, avant de poser le moindre multiplicateur :** *quels murs
exactement ?* « Un ou deux murs, 23 blocs » n'est pas une liste. 23 multiplicateurs posés sur
le mauvais mur sont pires que pas de multiplicateur du tout.

**L'affiche du barème** porte la valeur des couleurs ; un bloc ×2 la contredit. Une ligne au
feutre suffit : *« les blocs du Mur X comptent double »*.

**L'annonce orale a besoin de deux phrases, pas d'une :**

> « Les blocs du mur neuf comptent double. »
>
> « Attention : double **pour la compétition seulement**. Dans l'appli, en classement
> quotidien, ils valent leur couleur normale. »

La seconde phrase t'évitera la file d'attente de ta soirée. Les 23 blocs restent des blocs
quotidiens : les grimpeurs les valideront aussi hors compétition, au barème normal, et
l'écart sera visible.

---

## §6 Si le code n'est pas vert mercredi soir

La porte de sortie existe déjà, sans écrire une ligne : **le mode `blocs_valides`** permet une
valeur en points par bloc. Tu bascules la compétition dessus, `points_value` = 2 × la base de
la couleur sur les 23, la base normale sur les autres.

**Le prix est réel :** tu perds la décroissance par essais de `blocabrac_plancher` — exactement
ce qui a été conçu la semaine dernière pour les longs combats. Tu tiendrais l'annonce du gérant
en abandonnant la tienne.

C'est le plan B. À décider mercredi soir, pas jeudi à 17h.

---

## Ce que ce plan ne touche pas

Rien sur `users.level`, les badges, `calculatePoints`, le gel des niveaux, `level_at_start`,
ni la sonde Blaze. Le gel du 6 novembre reste intact : ce lot est orthogonal.
