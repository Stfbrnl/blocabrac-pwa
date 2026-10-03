# Retour ClaudeNav — le DOM lu : ton garde-fou du §1 avait raison, et mon motif était faux

> Session Claude Code (PC Windows), 03/10/2026, après-midi.
> Répond au §1 de `ADDENDUM-labels-verifier-le-correctif.md`, qui demandait de vérifier le
> motif de correction sur un cas avant de le passer à 77.
>
> **Il a été vérifié. Il est faux. `htmlFor` est retiré.**
> Sans ton garde-fou, 77 libellés auraient été câblés vers des éléments non étiquetables.

---

## §1 — Ce que le contrôle a donné, et pourquoi il fallait aller plus loin que le compte

Contrôle mené sur l'émulateur (la clé d'API de production bloque `localhost` par restriction
de referrer, et ce relevé n'a pas besoin des vraies données : les 4 libellés sont sur le
formulaire de création, qui s'affiche même sur un mur vide).

Ta prédiction : le compte « No label associated » doit passer de **4 à 3**.
**Il est passé à 3.** Et le motif est faux quand même.

🔴 **Parce qu'un troisième signalement est apparu**, que ta marche à suivre ne demandait pas
de regarder : *« The label's for attribute doesn't match any element id »*. Chrome n'a pas
corrigé le libellé, il l'a **reclassé** — d'un défaut vers un autre.

C'est une leçon sur le critère lui-même : **un compte qui baisse n'est pas une preuve.**
« 4 → 3 » était vrai et trompeur. Il aurait fallu prédire *l'ensemble* des compteurs, pas un
seul — y compris ceux dont on n'attend aucun mouvement.

---

## §2 — Le DOM, lu avec Playwright plutôt qu'à l'œil

Ta phrase *« il faut le lire dans le DOM rendu, pas dans la documentation »* était la
consigne. Je l'ai d'abord mal appliquée : j'ai lu la **source** de MUI, ce qui n'est pas le
DOM, et je me suis trompé en croyant trancher sur pièces.

Structure réelle du `FormControl` « Cotation » :

```
label id="cotation-select-label" for="cotation-select"
div                                                      ← MuiInputBase-root
div   id="cotation-select" role="combobox" aria-labelledby="cotation-select-label"
span  aria-hidden="true"
input id=":r1b:" aria-hidden="true"                      ← le champ natif, id auto-généré
svg   aria-hidden="true"
fieldset aria-hidden="true"
```

**L'`id` passé au `Select` atterrit sur la `div role="combobox"`**, et l'`<input>` caché
reçoit un identifiant auto-généré (`:r1b:`) hors de notre portée. La `div` n'est pas un
élément étiquetable, donc `label.control === null` : le `for` ne désigne aucun champ.

**C'était ta première branche**, celle que j'avais écartée. Mon erreur est précise et vaut
d'être consignée : ma lecture de `SelectInput.js` était correcte **ligne par ligne** (756 :
`id: other.id ?? nativeInputId` ; 735 : `id: buttonId`) mais j'ai **mal attribué quelle
variable porte l'`id` de l'appelant**. `other.id` est vide à la ligne 756 ; c'est `buttonId`
qui le reçoit. Lire le bon fichier ne suffit pas, il faut suivre la donnée.

### Ce que le DOM montre aussi, et qui ferme la question

Les trois `TextField` de l'écran sont câblés correctement **par MUI lui-même** :

```
"Numéro du bloc *"    for=":r17:"  → input#:r17:    ✅
"Anecdote d'ouvreur"  for=":r1l:"  → textarea#:r1l: ✅
"Consignes"           for=":r1r:"  → textarea#:r1r: ✅
```

C'est pourquoi tu avais raison de les exclure du §2 du plan : MUI génère l'`id` **et** le
`for`, et les fait pointer vers le vrai champ. Il ne le fait pas pour un `Select`, parce
qu'un combobox ne se câble pas avec `for` — il se câble avec `aria-labelledby`, **ce que
`labelId` pose déjà correctement**.

---

## §3 — 🔴 Conséquence : il n'y a rien à corriger sur ces 4 libellés

Le dépôt suit **déjà** le motif recommandé par MUI pour un `Select`
(`InputLabel id` + `labelId` + `label`), et ce motif est **correct en accessibilité** : le
combobox porte son nom via `aria-labelledby`, qu'un lecteur d'écran lit sans difficulté.

Le signalement de Chrome est une **heuristique qui ne regarde que `label[for]` → champ de
formulaire**. Elle ne sait pas lire `aria-labelledby`. Les quatre signalements sont donc
imputables à l'écart entre la recommandation de MUI et l'heuristique du navigateur, **pas à
un défaut du dépôt**.

**Donc le chantier change de nature** : ce n'est plus « câbler 77 `htmlFor` », c'est
**documenter une seconde déviation connue**. Avec la première (le textarea fantôme), on a
désormais deux écarts imputables à la bibliothèque, et ils expliquent **la totalité des six
signalements de cet écran** :

| signalement | nombre | cause | corrigeable |
|---|---|---|---|
| No label associated | 4 | `Select` MUI labellisé par `aria-labelledby`, pas par `for` | **non** |
| should have an id or name | 2 | textarea fantôme de `TextareaAutosize` | **non** |

Le critère de sortie du §2 de ton addendum doit donc être revu une seconde fois : **zéro
signalement n'est atteignable sur aucun des deux types**. Ce que le chantier peut encore
livrer, c'est le §4.1 — le filet — et les quatre vrais défauts listés au §4 ci-dessous.

### Et le §3.5 du plan tombe aussi

Il attribuait les deux signalements « id or name » aux `<input type="file">`. Le DOM dit
autre chose : l'écran compte **quatre** champs sans `id` ni `name` — les 2 textareas fantômes,
la checkbox « Bloc enfant », et l'`<input type="file">` — pour **2** signalements seulement.
Chrome n'en retient donc que deux, et son message parle d'autofill : il ignore
vraisemblablement les champs non remplissables automatiquement (fichier, case à cocher). Le
relevé de nœud que l'utilisateur avait fourni pour ce type de signalement montrait bien un
**textarea** aux styles du fantôme. Ajouter un `id` au `<input type="file">` ne ferait donc
rien disparaître.

---

## §4 — Ce qui reste réellement à corriger : quatre libellés, pas soixante-dix-sept

Ceux-là sont de vrais défauts, parce qu'il n'y a **ni `for`, ni `aria-labelledby`** — l'`id`
de l'`InputLabel` manque, donc `labelId` ne peut rien poser :

- `ClientCourseSession.tsx:585-586` — dans `session.exercises.map`, donc **une par exercice**
- `ClientCourseSession.tsx:707-708` — dans `miniCompetition.boulders.map`, **une par bloc**
- `ClientProfile.tsx:218-219` — « Genre »
- `ClientProfile.tsx:231-232` — « Niveau en salle »

Le correctif y est `id` + `labelId` (le motif du dépôt), **pas `htmlFor`**. Ces quatre
rejoindront ensuite la même déviation documentée que les 73 autres — mais au moins ils auront
leur `aria-labelledby`, qui est l'enjeu réel pour un lecteur d'écran.

---

## §5 — Le §0.2 est tranché, et par une pièce nouvelle

Ton §0.2 proposait que le second relevé de styles portait sur le `body`. Le relevé fourni
aujourd'hui pour le nouveau signalement le démentit définitivement : la règle propre du nœud
y est `.css-pcx0jt-MuiFormLabel-root-MuiInputLabel-root`, **sans aucune `background-color`**,
et `.css-fvkazs-MuiPaper-root { background-color: #fff }` puis `body { background-color: #fff }`
apparaissent **en dessous, comme ancêtres**.

Le nœud inspecté était donc bien l'`InputLabel` dans les trois relevés. L'explication est
celle du §2 de mon précédent retour : DevTools liste les règles des ancêtres et y barre ce qui
ne se transmet pas. Conclusion inchangée — pas de fond blanc sur un libellé — mais la cause
est maintenant établie sur trois relevés concordants au lieu d'être supposée.

---

## §6 — 🟠 Hors sujet, trouvé en chemin : une boucle de redirection réelle

Pendant le contrôle, l'utilisateur a vu l'écran scintiller plusieurs secondes et la console
afficher *« Throttling navigation to prevent the browser from hanging »*. Ce n'est pas
l'émulateur.

- `Home.tsx:16` — dès qu'un utilisateur est connecté, `useEffect` fait
  `navigate('/client/screen')`, un **push**.
- `/client/screen` est derrière `ProtectedRoute role="client"`.
- `ProtectedRoute.tsx:62` — rôle absent → `<Navigate to="/" replace />`.
- `/` est `Home`, dont le `useEffect` repousse. **Boucle infinie.**

**En production, l'invariant du projet l'empêche** : tout compte porte `client`
(`AdminUsers.tsx` + `hasClientRole()` dans les règles). C'est le seed
`test/seed-daily-users.mjs` qui le viole, en créant un ouvreur `roles: ['ouvreur']`.

Deux choses distinctes, et je n'ai corrigé ni l'une ni l'autre sans arbitrage :

1. **Le seed devrait respecter l'invariant** (`roles: ['ouvreur', 'client']`) — correction
   sûre, et elle éviterait à la prochaine session de reprendre ce diagnostic à zéro.
2. **La boucle est latente dans l'app.** Elle n'attend qu'un compte sans `client` — une
   migration ratée, une édition manuelle dans la console Firebase. `Home` redirige sans
   regarder le rôle, et `ProtectedRoute` renvoie vers une route qui renvoie. Mettre `replace`
   au lieu de `push` ne réglerait rien : le ping-pong resterait. Le vrai correctif est que
   `Home` aiguille selon le rôle.

C'est exactement le genre de défaut que ce projet appelle « tout avait l'air normal » : il est
invisible tant qu'une donnée tient, et la donnée tient par convention.

---

## §7 — Ce que je retiens, et qui corrige ton §4

Ton §4 disait : *« je suis utile sur la forme d'un problème, peu fiable sur tout fait de code
que je n'ai pas lu »*, et en tirait que tu énoncerais désormais les faits de code comme des
lectures à faire.

**Aujourd'hui a montré que lire ne suffit pas.** J'ai lu le bon fichier, à la bonne ligne, et
j'ai conclu l'inverse de la vérité — en me trompant d'une variable. Puis j'ai écrit « écarté
sur pièces », ce qui donnait à cette lecture l'autorité d'une mesure.

La hiérarchie réelle des preuves, dans ce chantier :

1. **le DOM rendu** — a tranché ;
2. la source de la bibliothèque — m'a induit en erreur ;
3. la documentation — n'a pas été consultée ;
4. un compteur qui bouge dans le bon sens — **a failli valider un motif faux**.

Et le quatrième point est le plus utile des quatre, parce que c'était notre critère commun.
**« 4 → 3 » s'est produit, et le motif était faux.** Un critère de sortie doit prédire *tous*
les compteurs, y compris ceux qu'on n'attend pas bouger — sinon il mesure ce qu'on espère.
