# Plan — Libellés non associés : traiter la classe, pas les occurrences

> Rédigé le 03/10/2026, à partir d'une observation de l'utilisateur : sur l'espace Blocs
> quotidiens de la page Ouvreur, les signalements de libellés sont **nombreux et inégaux
> selon les murs**.
>
> **Cette inégalité est le diagnostic.** Le §1 explique pourquoi il ne faut surtout pas
> inspecter les occurrences une à une.
>
> Priorité : **après** V2.71.4 et la purge. C'est de l'hygiène, **sans aucun effet visible**
> pour l'utilisateur (le §3.4, qui en annonçait un, a été supprimé le 03/10). Mais c'est un
> bon candidat pour le même lot.

---

## §1 — Le nombre varie selon les murs : ce que ça prouve

Un mur porte une quinzaine de blocs. Si le nombre de signalements change d'un mur à l'autre,
c'est qu'il est **proportionnel au nombre de blocs affichés**.

Donc :

1. **Ce ne sont pas N défauts distincts.** C'est **un ou deux défauts de composant**, répétés
   une fois par bloc rendu.
2. **Le défaut est dans un composant rendu par bloc**, pas dans l'en-tête de la page — sinon
   le compte serait constant.
3. ⚠️ **Compter les occurrences dans les outils de développement ne mène nulle part** : le
   compte est une fonction de la **donnée** (combien de blocs sont posés aujourd'hui), pas du
   code. Il changera à chaque rotation, sans qu'une ligne ait bougé.

**Conséquence de méthode : l'inspection doit être statique, sur les sources, pas dynamique sur
le DOM.** Un balayage du code est **exhaustif et stable** ; un balayage de l'écran ne l'est ni
l'un ni l'autre.

C'est la même logique que le test de propriété sur les 1024 combinaisons : on ne vérifie pas
les cas rencontrés, on vérifie la forme.

---

## §2 — Phase 1 : inventaire statique, exhaustif

Dans `frontend/src/`, relever **toutes** les occurrences des quatre motifs suivants. Le but
n'est pas de corriger encore, mais d'avoir la liste complète avant de toucher à quoi que ce
soit.

| # | Chercher | Pourquoi |
|---|---|---|
| 1 | `InputLabel` | le câblage est manuel ; MUI ne le devine pas |
| 2 | `FormControl` contenant un `Select` | le cas classique : `labelId` manquant |
| 3 | `<label` en balise brute | hors MUI, câblage à la main |
| 4 | **`backgroundColor` / `bgcolor` blanc posé sur un libellé** | voir ci-dessous |

**Le motif 4 est le plus utile des quatre.** Un fond blanc codé en dur derrière un libellé est
la **rustine** de ce défaut précis : quand le câblage manque, l'encoche du contour ne se
découpe pas et la bordure traverse le texte ; on repeint alors un fond par-dessus. **Chaque
fond blanc trouvé désigne un libellé non câblé**, et sa présence prouve que quelqu'un avait
déjà vu le symptôme sans en traiter la cause.

**À ignorer** : les `TextField` avec une prop `label`. MUI y génère l'identifiant et le
câblage tout seul — ils ne sont jamais en cause, et les parcourir ferait perdre du temps.

**Point de départ recommandé** : le composant qui rend **une ligne de bloc** dans l'espace
Blocs quotidiens de la page Ouvreur. C'est lui que le §1 désigne.

---

## §3 — Phase 2 : les corrections, trois formes seulement

### 3.1 — `InputLabel` + `Select`

```tsx
<FormControl>
  <InputLabel id="couleur-label">Couleur</InputLabel>
  <Select labelId="couleur-label" id="couleur" label="Couleur">
```

⚠️ **CES TROIS PROPRIÉTÉS NE SUFFISENT PAS, et elles sont déjà présentes partout dans ce
dépôt** (voir `RETOUR-labels-non-associes.md` §6.1). `labelId` ne pose qu'`aria-labelledby` ;
il ne produit **aucun attribut `for`** sur le `<label>`, et `for` est exactement ce que Chrome
vérifie. Il faut une **quatrième** propriété, `htmlFor` sur l'`InputLabel`, pointant vers
l'`id` du `Select` :

```tsx
<InputLabel id="couleur-label" htmlFor="couleur">Couleur</InputLabel>
<Select labelId="couleur-label" id="couleur" label="Couleur">
```

Vérifié dans la source MUI installée (v9.1.1, `Select/SelectInput.js` ligne 756) plutôt que
dans la documentation : l'`id` passé au `Select` atterrit sur l'`<input>` caché, qui est un
élément étiquetable — donc `for` résout. L'élément d'affichage (ligne 735) ne prend son `id`
que de `SelectDisplayProps.id` ou du `name`.

`label` sur le `Select` reste ce qui fait **découper l'encoche** du contour.

### 3.2 — `InputLabel` + `OutlinedInput` / `Input`

```tsx
<InputLabel htmlFor="essais">Nombre d'essais</InputLabel>
<OutlinedInput id="essais" label="Nombre d'essais" />
```

### 3.3 — `<label>` brut

Soit `htmlFor` pointant vers l'`id` du champ, soit le champ imbriqué dans le libellé.

### 3.4 — ~~Retirer les fonds blancs~~ — **SUPPRIMÉ le 03/10/2026**

Cette section demandait de retirer un `background-color: rgb(255,255,255)` codé en dur sur
deux `InputLabel`, et la présentait comme le seul effet visible du lot. **Elle reposait sur un
relevé mal identifié : il n'existe aucun fond blanc sur aucun libellé du dépôt** (0 occurrence
sur l'ensemble des `.tsx`), et la rustine n'y a structurellement aucune raison d'exister
puisque tous les `Select` portent déjà la prop `label`, donc que l'encoche est découpée
partout. Retirée à la demande de ClaudeNav (`ADDENDUM-labels-verifier-le-correctif.md` §0),
constat dans `RETOUR-labels-non-associes.md` §3.

⚠️ **Conséquence : ce lot n'a aucun effet visible pour l'utilisateur.** C'est de l'hygiène et
un filet, pas une amélioration perceptible — à dire avant, plutôt qu'à constater après.

### 3.5 — Les champs sans `id`/`name`

Les deux signalements de l'autre type, sur la même page. Ajouter un `id` unique suffit.
Pas d'`autocomplete` à prévoir ici : un formulaire de création de bloc n'a pas vocation à être
rempli automatiquement.

---

## §4 — Phase 3 : le filet, pour que « définitivement » veuille dire quelque chose

C'est la moitié importante de la demande. Un nettoyage ponctuel régresse au prochain
`FormControl` ajouté — et personne ne s'en apercevra, puisque rien n'échoue.

### 4.1 — La solution recommandée : une assertion partagée dans les e2e existants

Le dépôt a déjà des e2e Playwright qui **parcourent les écrans principaux**. Il suffit d'un
assistant appelé à la fin de chacun :

```js
// à appeler dans chaque e2e, sur chaque écran visité
await assertNoOrphanLabels(page);
```

Il vérifie, sur le DOM réellement rendu :
- tout `<label>` porte un `for` qui **résout vers un élément existant**, ou contient son champ ;
- tout champ de formulaire porte un `id` ou un `name`.

Trois avantages décisifs :
- **il teste le rendu**, c'est-à-dire là où le problème vit réellement — MUI génère le balisage,
  les sources ne le montrent pas ;
- **il réutilise la couverture existante** : aucune infrastructure nouvelle, chaque écran déjà
  visité par un e2e est couvert d'office ;
- **il échoue tout seul** le jour où quelqu'un ajoute un `FormControl` non câblé.

⚠️ Et il faut l'écrire **avant** les corrections, et **le voir rouge** — sur l'espace Blocs
quotidiens avec plusieurs blocs posés. Un filet qu'on n'a jamais vu attraper quelque chose
n'est pas un filet : c'est la leçon du badge qui n'existait pas, dont le test fabriquait sa
propre donnée.

### 4.2 — Deuxième ligne, optionnelle : la règle ESLint

`eslint-plugin-jsx-a11y`, règle `label-has-associated-control`. Le dépôt a déjà des règles
ESLint bloquantes, donc le mécanisme existe.

⚠️ **À évaluer avant d'y faire confiance** : la règle raisonne sur du JSX, et `InputLabel` /
`Select` ne sont pas des `<label>` / `<input>` littéraux. Sans l'option `components` qui
déclare la correspondance, elle **ne verra pas les cas réels** — et une règle verte qui ne
regarde rien serait, une fois de plus, pire que pas de règle.

**Test d'acceptation** : la configurer, la lancer **avant** les corrections, et vérifier
qu'elle signale bien les cas connus. Si elle n'en voit aucun, l'abandonner et s'en tenir au
§4.1.

---

## §5 — Vérification

1. L'assertion du §4.1 est **rouge** avant correction, sur le mur le plus fourni.
2. Corrections appliquées.
3. L'assertion passe au vert, et `npm test` / `npm run lint` restent verts.
4. ~~Contrôle visuel en thème sombre~~ — **SUPPRIMÉ le 03/10/2026** avec le §3.4 : il n'y a
   aucun rectangle blanc, donc rien à constater.
5. Rouvrir l'onglet Issues sur l'espace Blocs quotidiens : **zéro signalement de type « No
   label associated with a form field »**. Les signalements « should have an id or name »
   restent, au nombre de deux : ils viennent du textarea fantôme de `TextareaAutosize`, rendu
   par MUI en `aria-hidden`, hors de portée du dépôt — **déviation connue et documentée**,
   même doctrine que les `KNOWN_EXCEPTIONS` de `audit-prod-catalog.js`. Viser zéro tout court
   ferait échouer un chantier réussi.

---

## §6 — Ce qu'on en retient pour la suite

> **Un défaut dont le nombre d'occurrences dépend de la donnée affichée est un défaut de
> composant.** On le compte une fois, on le corrige à la source, et on le vérifie par une
> assertion sur le rendu — jamais en parcourant les occurrences, dont le nombre changera à la
> prochaine rotation sans qu'une ligne de code ait bougé.
