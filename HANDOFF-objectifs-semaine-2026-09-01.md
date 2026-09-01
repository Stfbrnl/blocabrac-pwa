# Handoff — Objectifs de la semaine cumulables (V2.52)

> Rédigé le 01/09/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur / ClaudeNav). Demande directe de l'utilisateur, pas de
> `CONCEPTION-*.md`/`SUIVI-*.md` en amont cette fois.
>
> **Commité, poussé et déployé** — commit `8ff095e` sur `main` (après rebase
> sur `ccf58fd`, un commit automatique du CI `cleanup-orphan-boulder-images`
> arrivé entre-temps, sans rapport), hosting uniquement (`npx firebase-tools
> deploy --only hosting`, aucune règle Firestore à déployer).

---

## Résumé en trois phrases

L'objectif hebdomadaire client (`ClientScreen.tsx`, "Mon espace personnel")
était un simple nombre ("N blocs, tous niveaux confondus"). Il devient une
**liste cumulable** d'objectifs combinables librement : un nombre de blocs
d'une couleur donnée (ex. 2 rouges + 3 noirs), un bloc précis identifié par
mur+numéro (ex. "bloc n°6 de la Dalle"), ou un nombre de blocs tous niveaux
confondus (l'ancien comportement, conservé comme un type d'objectif parmi
d'autres, pas supprimé). `topo-blocabrac.pdf`, `CLAUDE.md`, le changelog
client et la page d'aide ont été mis à jour en cohérence.

---

## 1. Modèle de données

Nouveau champ `users/{uid}.weeklyGoalItems: WeeklyGoalItem[]`, remplaçant
l'ancien `weeklyGoalTarget: number | null` :

```ts
type WeeklyGoalItem =
  | { type: 'color'; color: string; target: number }
  | { type: 'boulder'; boulderId: string; boulderLabel: string }
  | { type: 'all'; target: number };
```

- Plafonné à `MAX_WEEKLY_GOAL_ITEMS` (8) — la liste s'affiche en entier sur
  l'écran d'accueil mobile, pas de pagination prévue.
- **Repli de lecture pour l'ancien champ**, même principe que
  `legacyAge`/`image_base64` (voir CLAUDE.md) : `legacyGoalToItems(target)`
  convertit à la volée un `weeklyGoalTarget` hérité en
  `[{type:'all', target}]`. Le champ n'est **jamais réécrit** — dès le
  premier enregistrement depuis le nouveau dialogue, il est effacé
  (`deleteField()`) et `weeklyGoalItems` prend le relais définitivement.
- Aucun changement de `firestore.rules` nécessaire : `weeklyGoalItems` est
  un champ libre du document `users/{uid}` du propriétaire, déjà couvert
  par la règle `update` existante (les seules clés verrouillées sont
  `inscritAuxCours`/`inscritAuxCompetitions`/`role`/`roles`/`levelOverride`
  — vérifié dans `firestore.rules:66-91` avant d'écrire le code).

## 2. Module pur `utils/weeklyGoal.ts`

Même discipline que `roulette.ts`/`challenges.ts` : **aucun import
Firestore**, entièrement unit-testable sans émulateur (`weeklyGoal.test.ts`,
10 cas).

- `computeWeeklyGoalProgress(items, validationsThisWeek, colorById)` →
  `{item, current, target, done}[]`.
- `upsertGoalItem(items, newItem)` : remplace (ne duplique jamais) un
  objectif existant de même nature — même couleur, même `boulderId`, ou
  l'unique objectif `'all'`. Évite l'ambiguïté de deux objectifs "rouge"
  distincts dans la même semaine.
- `legacyGoalToItems(target)` : le repli décrit ci-dessus.

## 3. Calcul de la progression — toujours à la volée, délibérément pas un compteur incrémental

**Différence assumée avec `classement_profiles`/`wallCounts`/
`challenges.progress`** : ces trois-là sont des compteurs incrémentaux
justifiés par un coût de lecture qui grandirait sinon avec l'historique du
compte (voir `CONCEPTION-selecteur-marge-compteur-incremental.md`). L'objectif
de la semaine, lui, était **déjà** recalculé à la volée avant cette évolution
(un seul `getDocs` sur `client_boulder_results` par ouverture de l'écran,
filtré `success==true`, borné à la semaine en cours) — recalculer par-dessus
la même lecture reste strictement moins cher qu'ajouter une transaction
incrémentale de plus dans `ClientDaily.tsx`, pour une fonctionnalité
personnelle à faible enjeu. Choix : **garder la sémantique existante**, pas
la remplacer.

Concrètement :
- La lecture existante (déjà utilisée pour le 🔥 streak) porte maintenant
  aussi le `boulderId` de chaque validation, plus seulement sa date.
- Un objectif `'color'` a besoin de connaître la couleur **actuelle** de
  chaque bloc (jointure `colorById`, comme dans `ClientDaily.tsx` pour
  `classement_profiles` — jamais la couleur au moment de la validation).
  Cette carte est chargée **paresseusement** : seulement si la liste
  d'objectifs contient au moins un item `'color'`. Une liste ne contenant
  que des objectifs `'boulder'`/`'all'` ne coûte donc aucune lecture
  supplémentaire par rapport à l'ancien système.
- Le sélecteur "bloc précis" du dialogue d'édition réutilise **verbatim**
  le pattern "bloc désigné" des Défis entre potes (`ClientFriends.tsx`,
  structure `bloc_designe`) : même requête (`boulders`, `type=='daily'`,
  `is_active==true`), même libellé composé `` `${color} n°${number} -
  ${wall}` ``. Aucune nouvelle convention d'UI introduite.

### ⚠️ Point à trancher/surveiller : sémantique "cette semaine" pour un objectif `'boulder'`

`client_boulder_results.createdAt` est immuable après la première écriture
(voir CLAUDE.md, section immutabilité). Un objectif est donc "atteint" quand
le **premier succès jamais enregistré** sur ce bloc/cette couleur tombe dans
la semaine en cours — pas "revalidé cette semaine". J'ai choisi de garder
**exactement la même règle pour les trois types d'objectifs** (`color`,
`boulder`, `all`), par cohérence plutôt que de traiter `'boulder'`
différemment :

- Conséquence assumée : si un client choisit comme objectif un bloc déjà
  réussi il y a plusieurs mois, l'objectif s'affichera "non atteint" toute
  la semaine, même s'il grimpe ce bloc à nouveau — puisque `createdAt` ne
  bouge pas sur une revalidation (seul `updatedAt` change).
- C'est le même comportement que l'ancien système pour `'all'` (déjà en
  prod depuis V2.13, jamais signalé comme un bug) et que le nouveau type
  `'color'` — je n'ai rien inventé de spécifique à `'boulder'`.
- **Mais l'usage réel d'un objectif "bloc précis" est probablement
  différent** de celui d'un objectif "couleur" : on choisit un bloc précis
  précisément parce qu'on ne l'a *pas encore* réussi (un "projet" pour la
  semaine), donc le cas "déjà réussi avant" devrait être rare en pratique —
  mais s'il se présente, l'expérience utilisateur est un objectif
  visuellement "jamais atteignable" sans qu'aucun message n'explique
  pourquoi. Je n'ai pas ajouté de garde-fou (ex. avertir à la sélection
  d'un bloc déjà validé, ou basculer sur `updatedAt` pour ce type
  uniquement) faute d'un signal clair que c'est un vrai problème vécu.
  **À surveiller après mise en usage réelle** ; si ça remonte, la correction
  la plus simple serait un avertissement à la sélection plutôt qu'un
  changement de sémantique de calcul.

## 4. Piège technique rencontré (ESLint `react-hooks/set-state-in-effect`)

Appeler depuis le corps d'un `useEffect` une fonction `useCallback` qui fait
un `setState` après un `await` déclenche cette règle bloquante — même si
l'appel est authentiquement asynchrone, parce que le linter ne peut pas
tracer un `setState` situé dans une fonction référencée depuis l'extérieur
de l'effet. Les effets voisins du même fichier (`fetchValidations`,
`fetchSummary`) définissent et appellent leur fonction async **directement
dans le corps de l'effet** — c'est ce qui les fait passer le lint. Corrigé
en suivant le même pattern : `fetchActiveBoulders` (le fetch pur, sans
`setState`) est un `useCallback` partagé, mais l'effet définit et appelle sa
propre fonction async locale qui fait le `setState` ; l'appel depuis le
dialogue (`ensureActiveBoulders`, hors effet, dans un gestionnaire
d'événement) n'a pas ce problème et appelle `fetchActiveBoulders` librement.

## 5. Fichiers touchés

- `frontend/src/utils/weeklyGoal.ts` (nouveau) + `weeklyGoal.test.ts`
  (nouveau, 10 cas)
- `frontend/src/pages/Client/ClientScreen.tsx` : modèle de données, effets
  de calcul, dialogue d'édition (liste + formulaire d'ajout par type),
  affichage de la progression (une barre par objectif)
- `frontend/src/pages/Client/Help/ClientHelp.tsx` : texte mis à jour
- `frontend/src/data/changelog.ts` : nouvelle entrée V2.52 (seule
  `changelog[0]` est montrée au client, donc c'est la seule qui compte pour
  l'affichage "Quoi de neuf ?")
- `frontend/package.json` : version → `2.52.0`
- `topo-blocabrac-source.html` + `topo-blocabrac.pdf` : ligne "Série,
  objectif & partage" → "Série, objectifs & partage" avec description à
  jour ; page de garde (version + date de génération) régénérée via
  Playwright (`page.pdf({format:'A4', printBackground:true})`, toujours pas
  de script npm dédié — commande manuelle, voir
  `HANDOFF-branding-navbar-2026-08-16.md` pour le précédent).
- `CLAUDE.md` : nouvelle section "Weekly goals (`ClientScreen.tsx`) —
  cumulable since V2.52, computed live, never persisted as a counter"

Aucun changement à `firestore.rules`, `firestore.indexes.json`, ni à aucun
autre écran.

## 5bis. Vérification demandée par l'utilisateur avant commit : topo + aide en ligne à jour jusqu'à V2.51

L'utilisateur a demandé, avant de commiter, de vérifier que Bloc Roulette et
Défis entre potes (V2.44/V2.46) figurent bien dans `topo-blocabrac.pdf`, et
que le mode d'emploi en ligne (icône « ? », `ClientHelp.tsx`) est à jour de
tous les derniers éléments.

- **Topo** : déjà à jour — Bloc Roulette (ligne 221), Défis entre potes
  (ligne 227, dans la ligne "Potes de grimpe"), classement de saison/Finale
  (lignes 225, 279, 372-386), mode Officiel FFME (ligne 341), écran juge
  (ligne 248) étaient tous déjà présents avant cette session. Rien à
  ajouter de ce côté.
- **Aide en ligne (`ClientHelp.tsx`)** : deux vrais trous trouvés et
  corrigés (pas seulement l'objectif de la semaine) :
  1. **Aucune mention de « Signalement de bloc »** — fonctionnalité pourtant
     implémentée depuis longtemps (`ClientDaily.tsx`, sélecteur de type +
     commentaire + bouton "Signaler un problème" depuis la fiche d'un
     bloc) et documentée dans le topo, mais jamais ajoutée à l'aide en
     ligne. Nouvelle section ajoutée, juste après "Mon Blocabrac
     quotidien".
  2. **Aucune mention du classement de saison / de la Finale** dans la
     section "Classement des grimpeurs" — fonctionnalité de V2.41-V2.42,
     jamais répercutée dans l'aide en ligne à l'époque. Deux puces
     ajoutées : la bascule général/saison, et le lien saison→qualification
     Finale (dont l'effet de l'opt-in classement).
  3. Au passage, le titre de la section objectif de la semaine passe de
     singulier à pluriel ("Série, objectifs de la semaine & partage") par
     cohérence avec son contenu désormais cumulable.

Ces deux trous préexistaient à cette session (introduits en V2.41-V2.42 et
à une date antérieure non identifiée pour le signalement) — le rappel de
`feedback_help_docs_sync` (mémoire) porte sur *toute nouvelle fonctionnalité
ou changement de comportement*, pas seulement celle du jour ; il a donc été
appliqué rétroactivement ici sur demande explicite de l'utilisateur plutôt
que détecté proactivement au moment de ces deux chantiers passés — à garder
en tête : la checklist de vérification devrait normalement être passée à
chaque chantier plutôt qu'en rattrapage.

## 6. Vérifications faites

- `npm run build` (tsc -b && vite build) : vert.
- `npm run lint` : vert (0 erreur, y compris après correction du piège
  `set-state-in-effect` en section 4).
- `npm test` : 174 tests verts (dont les 10 nouveaux de `weeklyGoal.test.ts`).
- PDF régénéré et relu page par page (`pdftoppm` + lecture d'image) — pas de
  coupure de contenu, page de garde correcte (version 2.52, date du jour).

**Pas fait** : pas de test e2e Playwright/émulateur dédié (comme l'ancien
système, cette fonctionnalité n'en avait pas — voir l'inventaire de
l'exploration initiale). Pas de vérification manuelle avec un vrai compte
client connecté (pas d'émulateur ni d'identifiants disponibles ici, l'app
pointe sur Firebase de prod par défaut) — recommandé avant/à la place du
déploiement si possible.

## 7. Ouvert / à trancher

1. **Section 3** ci-dessus (sémantique `'boulder'` + `createdAt` figé) — à
   surveiller après usage réel, pas de garde-fou ajouté pour l'instant.
2. Pas de script npm dédié pour régénérer `topo-blocabrac.pdf` — recopié du
   handoff précédent, toujours vrai, toujours pas fait.
3. Le champ hérité `weeklyGoalTarget` (12 comptes prod potentiellement
   concernés, non vérifié ici) continuera de se convertir correctement à la
   lecture via `legacyGoalToItems` — pas de script de migration/backfill
   écrit, jugé inutile puisque le repli de lecture couvre déjà tous les cas
   et que le champ s'efface tout seul au premier enregistrement.

## 8. Reste à faire côté utilisateur/session suivante

- Éventuellement vérifier avec un vrai compte client en prod maintenant que
  c'est déployé (https://blocabrac.web.app).
- Envisager d'ajouter la vérification systématique "aide en ligne à jour"
  (section 5bis) à la checklist de fin de chantier, pas seulement en
  rattrapage sur demande.

🤖 Généré avec [Claude Code](https://claude.com/claude-code)
