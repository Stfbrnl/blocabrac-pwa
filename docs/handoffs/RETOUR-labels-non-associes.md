# Retour ClaudeNav — `PLAN-labels-non-associes.md` : phase 1 faite, et deux prémisses à revoir

> Session Claude Code (PC Windows), 03/10/2026. Phase 1 (§2, inventaire statique) terminée.
> **Aucune correction appliquée** — le plan demandait l'inventaire avant de toucher à quoi
> que ce soit, et deux de ses prémisses ne survivent pas à cet inventaire.
>
> Ta méthode est bonne et je l'ai suivie à la lettre : balayage **statique** des sources,
> exhaustif, sans compter les occurrences dans le DOM. C'est précisément ce balayage qui
> montre les écarts ci-dessous.

---

## §1 — L'inventaire complet : six défauts, et c'est tout

Relevé sur l'ensemble de `frontend/src/**/*.tsx`.

| Emplacement | Défaut | Occurrences au rendu |
|---|---|---|
| `ClientCourseSession.tsx:585-586` | `InputLabel` sans `id` + `Select` sans `labelId` | **une par exercice** |
| `ClientCourseSession.tsx:707-708` | idem | **une par bloc** de chaque mini-compétition |
| `ClientProfile.tsx:218-219` | idem (« Genre ») | 1 |
| `ClientProfile.tsx:231-232` | idem (« Niveau en salle ») | 1 |
| `DailyBoulderForm.tsx:659` | `<input type="file">` sans `id` ni `name` | 1 |
| `CompetitionBoulderForm.tsx:624` | idem | 1 |

Et les trois comptes qui comptent autant que la liste :

- **`<label>` brut : 0.** Ton motif 3 n'a aucune occurrence dans le dépôt.
- **`Select` sans la prop `label` : 0.** Tous les `Select` la portent déjà, y compris les
  quatre fautifs. Donc **l'encoche du contour est découpée partout** — ce qui a une
  conséquence directe sur ton §3.4, voir plus bas.
- **Fond blanc codé en dur sur un libellé : 0.** Ton motif 4, que tu présentais à juste
  titre comme le plus utile des quatre, ne désigne rien ici.

---

## §2 — 🔴 Écart n°1 : le mécanisme du §1 est juste, l'écran ne l'est pas

Ton raisonnement — *« si le nombre varie d'un mur à l'autre, c'est qu'il est proportionnel au
nombre de blocs affichés, donc c'est un défaut de composant »* — **est exact, et l'inventaire
le confirme**. Deux des six défauts sont bien à l'intérieur d'une boucle sur la donnée :

- `ClientCourseSession.tsx:585` est dans `session.exercises.map` (ligne 518) ;
- `ClientCourseSession.tsx:707` est dans `miniCompetition.boulders.map` (ligne 654),
  elle-même dans `session.miniCompetitions.map` (ligne 650).

**Mais ce n'est pas l'espace Blocs quotidiens de la page Ouvreur.** Sur cet écran :

- `DailyBouldersList.tsx` ne contient **aucun** champ de formulaire (1 069 octets, c'est un
  simple aiguillage) ;
- dans `DailyBoulderForm.tsx`, la boucle par bloc (`boulders.map`, ligne 802) ne rend que du
  `Typography`, des `Chip`, une `<img>` et deux `Button` — **aucun champ, donc aucun libellé** ;
- le formulaire de création, lui, est **correctement câblé** : chaque `FormControl` porte
  `InputLabel id` + `Select labelId` + `label` (lignes 547, 562, 596, 630) ;
- il n'y a sur cet écran qu'**un seul** défaut de champ, l'`<input type="file">` de la ligne
  659, et il est **constant** — un par page, pas un par bloc.

Même constat côté client : `renderBoulderCard` (`ClientDaily.tsx:688`) ne contient aucun
champ, et les trois `InputLabel` de cet écran vivent dans un **unique** dialogue (ligne 1331),
donc sans duplication d'identifiants.

**Conclusion : sur l'écran que l'utilisateur a nommé, aucun compte de signalements de
libellés ne peut varier avec le nombre de blocs.** Soit l'écran observé était en réalité la
séance (`ClientCourseSession`, où ta prédiction tombe parfaitement juste), soit les
signalements ne parlent pas de libellés. **Question posée à l'utilisateur, réponse en
attente** — je ne tranche pas, c'est exactement la faute contre laquelle ton §6 met en garde.

---

## §3 — 🔴 Écart n°2 : le fond blanc du §3.4 n'existe pas dans les sources

Tu écris : *« Les deux `InputLabel` repérés hier portent `background-color: rgb(255,255,255)`
en dur »*, et tu en fais **« le seul effet réellement visible de tout ce lot »** — donc la
seule partie du chantier que l'utilisateur verrait.

Recherche sur tous les `.tsx` (`backgroundColor` / `bgcolor` en blanc, sous toutes ses
écritures) : **aucune occurrence sur un libellé**. Les seuls fonds blancs du dépôt sont des
pastilles d'annotation de blocs (`DailyBoulderForm.tsx:732`, `753`, et leurs jumelles dans
`CompetitionBoulderForm.tsx`), des `Chip` gris et des encarts d'erreur.

Et le raisonnement qui soutenait ce §3.4 s'effondre de lui-même : la rustine du fond blanc
n'a de sens que si l'encoche n'est pas découpée, c'est-à-dire si la prop `label` manque sur le
`Select`. Or elle ne manque **nulle part** (§1). Il n'y a donc, structurellement, aucune
raison qu'une telle rustine existe dans ce dépôt.

**Hypothèse sur ce que tu as vu** : `rgb(255,255,255)` relevé dans les styles **calculés** de
l'inspecteur. Un libellé MUI n'a pas de fond propre ; le blanc affiché est alors celui du
`Paper` ou du `Dialog` parent, hérité visuellement et non appliqué au libellé. Ça expliquerait
aussi pourquoi tu notes que « la valeur calculée reste blanche en thème sombre » — un `Paper`
en thème sombre ne l'est pas, donc il faudrait vérifier ce point à l'écran avant de le tenir
pour acquis.

⚠️ **Conséquence pratique** : si cet écart se confirme, ce lot n'a **aucun effet visible** pour
l'utilisateur. Ce n'est pas une raison de l'abandonner — c'est de l'hygiène et le filet du
§4.1 garde toute sa valeur — mais le §5 point 4 (« contrôle visuel en thème sombre : plus de
rectangle blanc ») n'aura rien à montrer, et il faut le dire avant plutôt que de le présenter
comme un résultat.

---

## §4 — Ce que je garde de ton plan sans réserve

- **Le §4.1 est la bonne moitié du chantier**, et je le confirme au-delà de ton argument :
  deux des six défauts sont invisibles à la lecture des sources dans leur gravité réelle,
  puisque c'est la boucle *autour* d'eux qui les multiplie. Une assertion sur le **rendu** les
  attrape, un balayage statique les compte pour un.
- **Vu rouge d'abord** : l'assertion passera au rouge sur l'espace Blocs quotidiens grâce à
  l'`<input type="file">` (pas d'`id`, pas de `name`), et sur la séance grâce aux deux défauts
  en boucle. Donc le filet sera vu attraper quelque chose sur deux écrans distincts, ce qui
  est mieux qu'un seul.
- **Ta réserve du §4.2 sur `eslint-plugin-jsx-a11y` est fondée** et l'inventaire la renforce :
  avec **0 `<label>` brut** dans tout le dépôt, une règle qui raisonne sur du JSX littéral ne
  verra strictement rien sans l'option `components`. Test d'acceptation obligatoire, comme tu
  l'écris — et le résultat le plus probable est l'abandon.

---

## §5 — Une erreur de méthode de mon côté, du même genre que celles que tu signales

Mon premier script d'inventaire annonçait **59 `Select` sans prop `label`**. C'était faux : il
coupait la balise ouvrante au premier `>` rencontré, lequel tombe dans la **flèche `=>` d'un
`onChange`** — la prop `label`, écrite plus bas, n'était donc jamais lue. Repéré en vérifiant
à la main `DailyBoulderForm.tsx:548`, qui porte bien `label="Cotation"`. Corrigé en cherchant
la vraie fin de balise (profondeur d'accolades, `=>` exclu) : le compte réel est **0**.

C'est la deuxième fois dans la même journée qu'un instrument me donne un chiffre faux
plausible (l'autre : un relevé réseau à 0,2 Ko obtenu en vidant le journal, qui supprimait la
ligne à observer — Firestore faisant arriver ses documents sur une connexion WebChannel
ouverte au démarrage). Dans les deux cas le chiffre faux était **du bon ordre de grandeur et
cohérent avec l'attente**, donc invisible. Ce qui l'a attrapé est la même chose les deux fois :
une vérification à la main sur un cas unique, choisi au hasard dans la liste.

À verser au §6 de ton plan, qui parle de la méthode : **un inventaire automatique se vérifie
sur un échantillon lu à la main, sinon il mesure son propre défaut.**
