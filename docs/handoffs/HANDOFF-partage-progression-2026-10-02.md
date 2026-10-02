# Handoff ClaudeNav — V2.71.3 : l'image « Partager ma progression » était amputée de son texte

> Session Claude Code (PC Windows de l'utilisateur, pas le Codespace), 02/10/2026.
> Pas de plan amont de ta part : signalement direct de l'utilisateur après un usage réel
> (il a partagé sa carte de progression sur Facebook la veille).
> **1 commit, `8c43472` (V2.71.3). Ni poussé, ni déployé** — l'utilisateur a demandé
> explicitement d'attendre. La prod est donc toujours en **V2.71.2**.
> **Aucun changement de `firestore.rules`**, aucun changement de schéma, aucun script.
> Un seul fichier applicatif touché : `src/pages/Client/ClientScreen.tsx`.
> ⚠️ **`main` était déjà rouge avant cette session** : 2 tests unitaires à date figée
> (§6). Traitement reporté à la demande de l'utilisateur.

---

## 0. Comment ça s'est déroulé

Signalement de l'utilisateur, mot pour mot sur le fond : il partage sa progression depuis
« Mon espace », publie l'image sur Facebook, et là **le libellé de son niveau
(« Noire (6B+-6C+) ») n'est pas lisible**. Mais s'il fait une **capture d'écran** de la
même carte et qu'il colle ça, c'est bon. Et au passage, le **logo Blocabrac est déformé**.

Ce « ça marche en capture d'écran, pas à l'export » est le renseignement le plus utile du
signalement : il exclut d'emblée Facebook, le CSS, le thème et le contraste, et désigne
`html2canvas` comme seul suspect. J'ai donc cherché la cause plutôt que de supposer.

## 1. Diagnostic : j'ai reproduit avant de corriger

Je n'ai rien déduit du code. J'ai monté un **harnais jetable** (Vite sur le port 5199 +
Playwright, fichiers temporaires `tmp-h2c-probe.*`, supprimés depuis) qui rend la carte
réelle, appelle `html2canvas` avec **exactement les options de `handleShareCard`**, et
relit les pixels du canvas produit.

### 1.1 Ce que ça a donné tout de suite

La carte exportée sort **complète sauf le texte du Chip** : dégradé, logo, « Bravo … »,
« Dernier badge … », la date, tout est là. La pastille noire du niveau est dessinée —
et **vide**. Pas de texte coupé, pas de texte sombre sur sombre : pas de texte du tout.

### 1.2 Le coupable

**`html2canvas` 1.4.1 n'écrit jamais le contenu de `.MuiChip-label`.** Vérifié en
isolant le composant, sur 5 variantes :

| Variante | Texte dans le PNG |
|---|---|
| `<Chip>` MUI brut | ❌ 0 px |
| `<Chip>` + `.MuiChip-label { overflow: visible }` | ❌ 0 px |
| `<Chip>` + `.MuiChip-label { text-overflow: clip }` | ❌ 0 px |
| `<Chip>` + `.MuiChip-label { white-space: normal }` | ❌ 0 px |
| un `<span>` unique portant le fond **et** le texte | ✅ rendu correct |

Ce n'est donc **pas** un problème d'`overflow`/`ellipsis`, qui était l'hypothèse évidente
(`ChipLabel` dans MUI v9 est un `span` en `overflow: hidden; text-overflow: ellipsis;
white-space: nowrap`). J'ai aussi écarté la piste « les styles `sx` sont perdus dans
l'iframe de clonage » : via le hook `onclone` de `html2canvas`, les styles **calculés dans
le clone sont corrects** (`.MuiChip-root` → `rgb(255,0,0)` / `rgb(255,255,255)`,
`.MuiChip-label` → `rgb(255,255,255)`). C'est donc le **moteur de rendu** de
`html2canvas` qui perd le texte, pas la lecture du CSS — un problème d'ordre de peinture
sur un enfant flex en `overflow: hidden`, que je n'ai pas poussé plus loin une fois la
parade trouvée.

Détail qui compte pour la suite : une variante où le texte est dans un **élément imbriqué
portant sa propre couleur** (`label={<span style={{color:'white'}}>…</span>}`) rend, elle,
correctement. La frontière n'est donc pas « MUI » mais « texte dont la couleur est héritée
d'un ancêtre qui peint aussi le fond, dans ce montage flex ».

### 1.3 Le logo

Beaucoup plus simple, et vrai **aussi à l'écran** : `logo-blocabrac.png` fait **316×468**
et la carte le forçait en `width: 56, height: 56`. Il était donc écrasé en largeur depuis
toujours, personne ne l'avait relevé. La `Navbar` fait déjà bien les choses
(`objectFit: 'contain'`) — la carte de partage était le seul endroit à ne pas suivre.

## 2. Le correctif (V2.71.3)

`src/pages/Client/ClientScreen.tsx`, uniquement dans la carte `cardRef` :

1. **`<Chip>` → `<Box component="span">`** stylé en pastille (inline-block, fond + texte
   sur le même élément). Commentaire ⚠️ en place pour que personne ne remette un `Chip`
   ici par réflexe d'uniformité.
2. **Logo** : `height: 56, width: 'auto', objectFit: 'contain'` — même recette que la
   `Navbar`.
3. **`backgroundColor: null` → `'#ffffff'`** dans `handleShareCard`. Les coins arrondis
   laissaient des pixels transparents ; une PNG à alpha est aplatie par chaque réseau sur
   le fond qu'il veut. Ce n'était pas dans le signalement, mais c'est le même trajet de
   code et le même risque (une image publiée est définitive).
4. **Au-delà de la demande, assumé** : le texte de la pastille était blanc sauf pour
   « blanc ». Un niveau **jaune** donnait donc blanc sur jaune, illisible. Les couleurs
   claires (`jaune`, `vert`, `blanc`, `rose`) passent en texte noir, via une constante
   locale `LIGHT_LEVELS`.

### 2.1 Pourquoi le §4 est local et pas partagé

`levelColors` + la règle « noir si blanc, blanc sinon » est **dupliquée dans au moins 6
écrans** (`AdminUsers`, `ClientClassement`, `ClientCompetitions`, `ClientCourseSession`,
`AdminCompetitionRegistration`, `ClientCompetitionStats`). Je n'ai **pas** touché à ces
écrans et je n'ai **pas** créé d'utilitaire partagé : ç'aurait été un chantier de
refactorisation non demandé, greffé sur un correctif d'une ligne. J'ai donc restreint
`LIGHT_LEVELS` à la carte de partage, avec un commentaire disant pourquoi (une image
publiée est définitive, l'écran non). **Si tu penses que la divergence est pire que la
duplication, c'est à trancher** — voir §8.

## 3. Vérification

| Contrôle | Résultat |
|---|---|
| `npm run lint` | ✅ vert |
| `npm run build` | ✅ vert, lancé **après** le bump, `2.71.3` retrouvée dans `dist/assets/` |
| `npm test` | 309/311 — **les 2 rouges sont préexistants**, voir §6 |
| Rendu `html2canvas` après correctif (harnais) | ✅ niveaux `noir`, `jaune`, `blanc` : libellé lisible, logo aux bonnes proportions, Dosis bien héritée par la pastille |
| `firestore.rules` | non modifié, donc `test:rules` non lancé |

Le point le plus important de ce tableau : **la vérification du correctif est passée par le
même harnais que le diagnostic**, c'est-à-dire par le vrai `html2canvas` sur le vrai
balisage — pas par « ça compile » ni par une relecture.

## 4. ⚠️ Ce qui n'a PAS été vérifié

- **Rien n'a été vu sur un vrai téléphone**, ni publié pour de vrai sur Facebook. Le
  harnais prouve que le PNG contient le texte ; il ne prouve pas le rendu final chez
  Facebook (recompression, recadrage, thème sombre du fil).
- Le partage **natif** (`navigator.share` avec `files`) n'a pas été exercé — le harnais
  s'arrête au canvas. C'est le chemin réel sur Android.
- Les **autres niveaux** (`vert`, `bleu`, `violet`, `rouge`, `rose`) n'ont pas été rendus,
  seulement `noir`, `jaune`, `blanc`. Le mécanisme est le même pour tous.
- Aucun e2e navigateur relancé : aucun ne couvre cet écran (§7.2).

## 5. État de la prod

**Inchangé : V2.71.2.** Le commit `8c43472` est local, non poussé. L'utilisateur déploiera
lui-même (`npx firebase-tools deploy --only hosting` depuis la racine) quand il voudra.
Entrée `changelog.ts` ajoutée en `[0]` pour `2.71.3` — elle ne décrit que sa propre
version, conformément à la règle posée en V2.71.2.

## 6. 🔴 `main` était déjà rouge, et pour une raison qui va se reproduire

`src/utils/classementFlushWrites.test.ts` : **2 tests en échec, déjà sur `main` avant ma
modification** (vérifié par `git stash`, pas supposé).

```
× incrémente weeklyMissionsCompleted seulement au moment où la grille passe à 8/8
  → AssertionError: expected undefined to be 3
× un flush ne portant que des missions relit user_ludic_state et conserve la grille stockée
  → AssertionError: expected [ 'M4' ] to deeply equal [ 'M6', 'M3', 'M4' ]
```

**Ce n'est pas une régression.** Ces tests figent `isoWeek: '2026-W39'` dans leurs
fixtures. Nous sommes en **W40**. `resolveWeeklyMissionsState` fait donc exactement son
travail — il réinitialise une grille de la semaine passée — et les assertions, écrites
pour une semaine qui était « la semaine courante » le jour où elles ont été rédigées,
tombent.

Pourquoi ça mérite mieux qu'un `sed` sur la date :

- C'est une **bombe à retardement**, pas un incident : rejouer le test aujourd'hui en
  mettant `2026-W40` le remet au vert **jusqu'à lundi prochain**.
- Le projet a une doctrine explicite contre les rouges permanents (« un avertissement
  permanent apprend à ignorer les avertissements », cf. `KNOWN_EXCEPTIONS` dans
  `audit-prod-catalog.js`). Un `npm test` rouge en permanence vaut pire : il apprend à ne
  plus lancer `npm test` du tout — et c'est la suite qui garde l'invariant lectures/écritures
  du flush, c'est-à-dire précisément le filet posé après le bug de la grille effacée de V2.68.
- Le correctif propre est d'**injecter la semaine** plutôt que de la figer : soit la
  fixture dérive son `isoWeek` de `isoWeekKey(new Date())`, soit le test passe une date de
  référence (`resolveWeeklyMissionsState` prend déjà la notion de « maintenant »).

L'utilisateur a demandé de traiter ça **après**. Je n'y ai pas touché. Je signale que
d'autres fixtures du dépôt peuvent avoir la même forme ; je n'ai pas fait l'inventaire.

## 7. Retour global — ce que je retiens de cette session

### 7.1 `html2canvas` 1.4.1 est figé depuis 2022, et on construit dessus

C'est la dernière version publiée. Ce n'est pas une alerte de sécurité, c'est une
contrainte de conception : **tout composant MUI placé dans une zone destinée à être
exportée en image est un pari**. Le `Chip` a perdu, silencieusement, sans erreur console,
sans test rouge, pendant un temps que personne ne sait dater — jusqu'à ce qu'un
utilisateur publie l'image.

La règle que j'en tire, et que je propose d'inscrire (§8) : **ce qui entre dans
`cardRef` est du balisage simple, pas des composants MUI structurés**. Un `span` qui porte
son fond et son texte, un `img`, du texte. Si une future carte a besoin d'un composant
riche, il faut d'abord le passer au harnais.

### 7.2 Le vrai trou : aucun filet sur la carte de partage

Le projet a une discipline remarquable sur les compteurs (e2e qui assertent la valeur
écrite, scripts de réconciliation, garde-fous de dérive). La carte de partage n'a **rien** :
ni test unitaire, ni e2e, ni capture de référence. Et c'est le seul artefact de l'app qui
**sort de l'app** et va vivre sur un réseau social.

C'est la même forme d'échec que les trois déjà listées dans `CLAUDE.md` (« tout avait
l'air correct ») : un `catch` qui avale, un état React juste pendant que Firestore est
corrompu, un test qui sème la donnée qu'il teste. Ici : **le DOM est juste, et c'est
l'image qui est fausse**. Personne ne regardait l'image.

Le harnais que j'ai écrit est jetable, mais **la méthode ne l'est pas** : rendre la carte,
appeler `html2canvas`, compter les pixels d'une couleur attendue dans la zone du libellé.
Ça tient en ~40 lignes et ça aurait attrapé ce bug. Je ne l'ai pas commité parce que le
projet n'a pas de convention pour un e2e sans émulateur ni compte, et que ça méritait ton
avis — c'est ma question principale, §9.

### 7.3 Une convention appliquée à un seul endroit n'est pas une convention

`objectFit: 'contain'` sur le logo : présent deux fois dans la `Navbar`, absent du seul
autre endroit qui dimensionne ce logo. Le logo n'est pas carré et ne l'a jamais été.
Rien ne signalait l'écart. C'est un argument de plus pour les constantes partagées
(`gymConfig.ts` expose `logoPath`/`logoAssetUrl` mais pas la façon de les afficher).

### 7.4 🟠 Un point ouvert devenu faux a été recopié sept fois sans être revérifié

En cherchant le guide de connexion imprimable pour l'utilisateur (§10), j'ai vérifié
l'item **« `aide-connexion-installation.html` toujours hors charte / toujours en bleu »**.
Il apparaît dans **9 documents** de `docs/` : `HANDOFF-branding-navbar-2026-08-16.md` (où
il est légitime, c'est là qu'il est levé), `RELECTURE-classement-saisonnier.md`, puis
`BILAN-v255-v256-2026-09-06.md`, `HANDOFF-v255-v256-avant-push-2026-09-06.md`,
`HANDOFF-icones-annotations-2026-09-09.md`,
`HANDOFF-ludic-state-backfill-simulation-2026-09-17.md`,
`HANDOFF-ouvreur-createur-bloc-2026-09-17.md`,
`HANDOFF-anecdote-methodes-missions-2026-09-24.md` et
`HANDOFF-bug-missions-revalidation-bingo-2026-09-25.md` — soit **7 documents datés d'après
la correction**. (Les dates git de ces fichiers valent toutes 20/09, date du `git mv` vers
`docs/` ; je me fie aux dates portées par les noms de fichiers.)

**Il est faux depuis le 16/08/2026.** Le fichier est à la charte :

```
#27B142 / #177038  (brandGreen / brandGreenDark)   aucun #1976d2
font-family: 'Dosis'   — embarquée en base64 woff2, document autonome
```

corrigé par le commit `5172d74` « Guide de connexion re-charté + PDF client », du
16/08/2026 — c'est-à-dire **le jour même** où il a été inscrit comme point ouvert. L'item
était donc juste quand il a été levé ; il est devenu faux dans la journée, et il a été
transporté tel quel sept fois depuis.

C'est exactement le mécanisme contre lequel le projet se protège ailleurs : une ligne
d'avertissement qu'on transporte sans la relire finit par ne plus rien signifier. **Je l'ai
retiré de la liste ci-dessous.** Suggestion : qu'un item de « points ouverts » recopié
d'un handoff à l'autre soit **revérifié ou daté**, et que « on ne sait pas si Dosis
s'affiche dans `topo-blocabrac.pdf` » — l'autre moitié de la même ligne, elle toujours
vraie — soit tranchée une bonne fois (c'est vérifiable en 2 minutes avec le même genre de
harnais).

## 8. Propositions d'ajout à `CLAUDE.md` (pas appliquées, à ton avis)

Je n'ai rien écrit dans `CLAUDE.md` cette fois — la carte de partage n'y a qu'une mention
de passage (section « Objectifs de la semaine »), et je préfère que tu arbitres le niveau
de détail. Ce que je propose, en substance :

> **Carte « Partager ma progression » (`ClientScreen.tsx`, `cardRef`) — l'image sort de
> l'app, pas seulement de l'écran.** Elle est rastérisée par `html2canvas` 1.4.1 (dernière
> version publiée, 2022), dont le moteur de rendu n'est pas celui du navigateur : vérifié
> en V2.71.3, il **n'écrit jamais le texte d'un `.MuiChip-label`** — la pastille se dessine,
> le libellé reste dessous, sans aucune erreur. Donc : **dans `cardRef`, pas de composant
> MUI structuré** ; une pastille est un `<span>` unique portant à la fois le fond et le
> texte. Le fond d'export est **opaque** (`backgroundColor: '#ffffff'`), jamais `null` :
> les réseaux sociaux aplatissent l'alpha sur le fond de leur choix. Les couleurs de niveau
> claires (`jaune`, `vert`, `blanc`, `rose`) prennent du texte noir — sur une image
> publiée, un libellé illisible est définitif. Toute modification de cette carte se vérifie
> **sur le PNG produit**, pas sur le DOM.

Et, si tu valides le §7.2, une ligne dans la section Testing sur le harnais de rendu.

## 9. Questions ouvertes pour toi

1. **Faut-il un filet permanent sur la carte de partage ?** (§7.2) Ma proposition : un
   script dans `frontend/test/` sur le modèle des e2e existants, mais **sans émulateur ni
   compte** — il monte la carte seule et assert sur les pixels du PNG. Est-ce que ça entre
   dans les conventions du projet, ou est-ce qu'un tel test « visuel » est une fausse
   bonne idée à tes yeux (fragilité anti-crénelage, polices, etc.) ?
2. **`LIGHT_LEVELS` doit-il rester local à la carte** (§2.1), ou faut-il un
   `textColorForLevel()` dans `gymConfig.ts`/un util, et aligner les 6 écrans qui
   dupliquent la règle ? Je penche pour l'util, mais c'est un chantier à part.
3. **Sort-on de `html2canvas` ?** L'alternative sérieuse est de dessiner la carte
   directement sur un `<canvas>` (la carte est simple : un dégradé, une image, 5 lignes de
   texte) — déterministe, aucun écart DOM/export, et ça réglerait la question des
   proportions et des polices une fois pour toutes. C'est ~80 lignes et ça dédouble le
   visuel. Je ne l'ai pas fait aujourd'hui : disproportionné pour un correctif. Mais si la
   carte doit grossir (saison, missions, tampon), c'est le moment d'en décider.
4. Le §7.4 appelle-t-il un changement de rituel sur la liste des points ouverts, ou est-ce
   un incident isolé qu'il suffit d'avoir corrigé ?

## 10. Au passage : le guide de connexion imprimable n'avait pas disparu

L'utilisateur ne le retrouvait plus. Il est à sa place et **publié** :

- `frontend/public/docs/aide-connexion-installation.pdf` (+ `.html`)
- en ligne : `https://blocabrac.web.app/docs/aide-connexion-installation.pdf`
  (vérifié aujourd'hui : HTTP 200, `Last-Modified` 25/09/2026)

Comme il est dans `public/`, chaque déploiement du hosting le republie — il n'y a rien à
regénérer, et pas de script de regénération (contrairement aux topos). Contenu relu : les
4 sections (créer un compte / se connecter / installer la PWA / QR code) correspondent
toujours à l'app. **Seule chose à savoir** : le QR code pointe vers `blocabrac.web.app`,
donc il reste valable tant que l'adresse ne change pas — à refaire le jour du
multi-salles.

---

## Points ouverts par ailleurs (repris de `HANDOFF-bug-missions-revalidation-bingo-2026-09-25.md`)

- 🔴 **`npm test` rouge sur `main`** : 2 tests à semaine ISO figée, correctif reporté par
  l'utilisateur, **nouveau** (§6).
- **V2.71.3 ni poussée ni déployée** (décision de l'utilisateur), **nouveau**.
- **Fenêtre de saison 2026-11-01 → 2027-05-31 à enregistrer** avec « Enregistrer » et non
  « Redémarrer ». Toujours pas faite au 02/10 à ma connaissance — l'échéance approche.
- **Après la clôture du 1er juin** : enregistrer la saison suivante avant fin octobre,
  sinon le workflow de clôture passe au rouge vers le 29 octobre.
- **Finale non annoncée** : trois textes client retirés en V2.71.1, à remettre mot pour mot
  (liste dans `CLAUDE.md`) le jour où l'utilisateur confirme sa faisabilité.
- **Premier passage de `reconcile-method-counts.yml`** le 1er octobre : **à regarder, c'était
  hier** — je ne l'ai pas consulté.
- **Découvrabilité du carnet de méthodes** : 0 vote en prod au 25/09, « à revérifier vers le
  02/10 » — **c'est aujourd'hui, et je ne l'ai pas vérifié**.
- **V2.70.1 → V2.71.2 toujours non vues sur un vrai téléphone**, et maintenant **V2.71.3
  non plus** (tampon du badge, « Effacer cet échec », « Quoi de neuf » empilé, onglet
  « saison à venir », et désormais la carte de partage).
- Vérification visuelle de l'anecdote d'ouvreur et du carnet de méthodes (V2.66/V2.67) :
  toujours sans retour.
- Migration de l'état ludique : Passe C déployée en V2.61, la purge
  (`purge-legacy-ludic-fields.js --fix`) toujours en attente.
- Défis `fenetre` / `bloc_designe` : toujours en prod sans e2e navigateur.
- Chantier droits d'accès (rôle ouvreur trop large) : en attente du gérant.
- `topo-blocabrac.pdf` : on ne sait toujours pas si Dosis s'affiche réellement dans le PDF
  généré. ~~`aide-connexion-installation.html` hors charte~~ : **faux depuis le 16/08**,
  item retiré (§7.4).
- Un projet Firebase par salle ou un projet mutualisé ; fork « Grimpe ! ».
- Sauvegarde durable des images Cloudinary (`--backup`).
- Idée « mode flash » : écartée explicitement (voir `CLAUDE.md`).
