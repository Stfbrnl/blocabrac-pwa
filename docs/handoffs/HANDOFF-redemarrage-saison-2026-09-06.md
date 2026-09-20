# Handoff — Redémarrage du classement de saison (Modèle A) pendant le rollout

> Rédigé le 06/09/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur / ClaudeNav). **Version 2** — la v1 avait mal lu la demande
> (« coupure par date »). La demande réelle est un **recalcul avec conservation
> du crédit acquis** (Modèle A ci-dessous), confirmée par l'utilisateur.
>
> **Rien n'est codé.** Avis demandé avant implémentation. À traiter **après** le
> commit Roulette V2.55 (`HANDOFF-roulette-v255-2026-09-06.md`).
>
> ⚠️ **Ce chantier revient sur une décision de conception de V2.42** (la
> réconciliation de `season.*`). C'est le point central à valider — voir §4.

---

## 1. La demande

Le classement de saison a démarré avec la diffusion publique de l'appli. Tant que
la majorité des grimpeurs n'est pas équipée, il est faussé (avance accumulée
pendant une période d'adoption inégale, points sur des blocs depuis retirés lors
des rotations de murs). L'utilisateur veut le **redémarrer dans ~15 jours**.

Citations utilisateur (deux messages) :

> « les données de tous se remettant à zéro, sans trace des anciennes validations
> de points si ce n'est les murs et blocs existants à ce moment-là (pour éviter
> aux clients d'avoir à les revalider) »

> « un bloc validé aujourd'hui mais qui serait encore présent dans quinze jours
> puisse compter au niveau des points, sans nécessité de réenregistrer sa
> validation pour un client, qui a d'ailleurs probablement oublié son nombre
> d'essais »

> « les points de départ comptent puis s'accumulent sans jamais être retirés
> lorsque les murs changent : c'est l'idée même du changement »

### Modèle A (confirmé par l'utilisateur)

1. **Au jour J du redémarrage**, pour chaque compte, `season.score` /
   `season.colorCounts` est **recalculé** = somme de **ses validations existantes**
   (`client_boulder_results`, `success:true`, avec le `attempts` d'origine) des
   blocs **actifs à J** (`type:'daily' && is_active:true`), via
   `calculatePoints(couleur_actuelle, attempts)`. → c'est le **score de départ**.
   Le client ne re-clique rien ; son nombre d'essais d'origine est réutilisé.
2. **À partir de J**, les nouvelles validations s'ajoutent (mécanisme incrémental
   existant de `ClientDaily.tsx`).
3. **Les points ne sont JAMAIS retirés quand un mur change.** Un bloc validé
   (avant ou après J) puis retiré garde ses points dans `season.*`.
   « C'est l'idée même du changement » — le classement de saison devient un
   **compteur purement monotone** : combien as-tu grimpé cette saison.
4. Un bloc retiré **avant** J : ses points ne sont pas dans le score de départ
   (on ne peut plus le grimper, et on ne recharge pas l'inventaire historique).

Modèle B (rejeté) : `season.*` = en permanence « tes points sur les blocs
actuellement présents », baisse à chaque rotation. Écarté : la saison perdrait sa
nature d'accumulation, contraire à l'intention.

---

## 2. État du code vérifié (06/09, à re-vérifier)

### 2.1 Le compteur stocké fait DÉJÀ « geler, pas retirer »
`ClientDaily.tsx` incrémente `season.*` ; un bloc passé `is_active:false` sort de
`colorById` → sa contribution **gèle** (reste dans `season.colorCounts`/`score`),
elle n'est ni mise à jour ni retirée. Confirmé par la section « Compteur
incrémental » de `CLAUDE.md` (« same behavior as before this chantier,
unchanged »). **→ Le point 3 du Modèle A est le comportement actuel du compteur
stocké.**

### 2.2 …mais la RÉCONCILIATION, elle, retire (incompatible avec le Modèle A)
`scripts/reconcile-classement-profiles.js` :
- `loadActiveColorById()` (~l.174) ne charge que `type=='daily' && is_active==true`.
- `computeExpectedProfile()` (~l.198) recompute `season.*` = validations **des
  seuls blocs actifs**, filtrées par `isWithinSeasonWindow(createdAt, debut, fin)`.
- `diffOne()` + la passe `--fix` **écrivent** cette valeur recalculée → un bloc
  validé en saison puis retiré voit ses points **supprimés** de `season.*` stocké
  au prochain run du cron mensuel.

C'est un choix de V2.42 (la réconciliation « corrective par construction »). Il
**contredit frontalement** le point 3 du Modèle A. Le cron mensuel
`reconcile-classement-profiles.yml` a pu déjà tourner 1-2 fois depuis le lancement
public — si une rotation de mur a eu lieu entre-temps, des `season.*` ont
peut-être déjà été rabotés en silence.

### 2.3 Bug latent orphan-key — `compute-classement-saison.js:191` (inchangé depuis v1)
`chunkedBatchUpdate(refs, () => ({ season: { score: 0, colorCounts: {} } }))`
→ `batch.set(ref, ..., { merge: true })`. `merge` **ne vide pas une map**
(bug orphan-key exact corrigé en V2.53 pour la réconciliation via
`colorCountsWriteValue` + `FieldValue.delete()`). Après une vraie clôture,
`season.score` = 0 mais `season.colorCounts` garde ses clés → `ClientClassement`
mode saison afficherait « 0 pt » + ancien nombre de blocs / meilleure couleur.
Jamais déclenché en prod (aucune clôture encore). `e2e-season-classement-flow.mjs`
(~l.214) assert `season.score === 0` mais pas `colorCounts` vidé.
Fix = chemin pointé : `updateDoc(ref, { 'season.score': 0, 'season.colorCounts': {} })`.

### 2.4 Droits & lecteurs (inchangé depuis v1)
- `firestore.rules` : un admin peut déjà écrire n'importe quel
  `classement_profiles` (`isUserRole("admin")`) — **aucune règle à ouvrir**.
- `classement_saisons` lu **uniquement** par `AdminCompetitionManagement.tsx`
  (« Générer le roster »), **aucun écran client**. Roster = doc au plus grand ID
  `"YYYY-YYYY"` (`b.id.localeCompare(a.id)`).
- `ClientClassement.tsx` mode saison lit `classement_profiles.season.*` (live),
  jamais `classement_saisons`.

---

## 3. Proposition d'implémentation (Modèle A)

### 3.1 `season.*` devient un compteur purement incrémental, non réconcilié
- `reconcile-classement-profiles.js` **cesse d'écrire `season.*`**. Deux options,
  ton avis §4 :
  - **(a) log-only** : continuer à calculer un « attendu » et journaliser l'écart,
    mais ne jamais l'écrire. Garde une visibilité sur la dérive.
  - **(b) plancher unidirectionnel** : `--fix` ne peut que **remonter** `season.*`
    vers un plancher = `Σ (validations depuis debut, de blocs actifs)`. Si le
    stocké est en dessous → écriture perdue, on corrige vers le haut. S'il est
    au-dessus (points gelés de blocs retirés + base de départ) → on ne touche pas.
    Respecte « jamais retirés » tout en rattrapant les écritures perdues.
  - Je penche pour **(b)** — `season.*` pilote la qualif Finale (« décide d'un
    titre »), un filet zéro me gêne.
- `CLAUDE.md` : documenter ce revirement explicite vs V2.42.

### 3.2 Bouton admin « Redémarrer la saison maintenant » (`AdminSeasonConfig.tsx`)
Sous `window.confirm` (irréversible) :
1. lit tous les `classement_profiles` (N lectures) ;
2. lit l'inventaire des blocs actifs une fois (`type=='daily' && is_active==true`,
   même requête indexée que `ClientDaily`/`ClientStats`) → `colorById` ;
3. pour chaque profil : lit ses `client_boulder_results` (`userId==uid`,
   `success==true`) — **N × (1 requête)** — recompute `season.score` /
   `season.colorCounts` = Σ `calculatePoints(colorById[boulderId], attempts)` sur
   les blocs présents dans `colorById` ;
4. `updateDoc(ref, { 'season.score': X, 'season.colorCounts': {…} })` (chemin
   pointé → remplace vraiment la map), par batch de 400 ;
5. écrit `app_config/classement_saison` = `{ debut: J, fin, cloturee: false,
   cloturee_at: deleteField() }` (J = date choisie par l'admin) ;
6. **n'archive rien** dans `classement_saisons`.

Réutilise la logique de `computeExpectedProfile` de la réconciliation (extraire un
util pur partagé plutôt que dupliquer le barème).

### 3.3 Coût lectures/écritures
Au clic, une seule fois : **~2N + I lectures** (N profils : 1 doc + 1 requête
`client_boulder_results` chacun ; I = 1 requête inventaire) + **N écritures**
(batchées 400). N ≈ 12 aujourd'hui → ~25 lectures, 12 écritures. Négligeable.
À grande échelle (multi-salles, N = plusieurs centaines) : la requête
`client_boulder_results` par compte est le poste qui grandit — acceptable pour un
geste admin manuel rare ; au-delà, bascule sur un script Admin SDK / une tâche
hors-ligne (pas de backend ni Functions dans ce projet).
**Aucune lecture/écriture ajoutée au parcours client courant.**

### 3.4 Fin de saison, plus tard : inchangé + le fix 2.3
`compute-classement-saison.js` à `fin` : archive top-10/10 → `classement_saisons/
2026-2027`, `cloturee: true`, reset `season.*`. Corriger l'orphan-key (2.3) au
passage + compléter l'e2e (assertion `season.colorCounts` vidé).

---

## 4. Ce sur quoi je veux ton avis

1. **Le revirement 3.1** — d'accord pour que `season.*` cesse d'être recalculé/
   corrigé à la baisse par la réconciliation ? C'est le cœur du Modèle A et ça
   défait un choix de V2.42. Option (a) log-only ou (b) plancher unidirectionnel ?
2. **Le recalcul de départ (3.2 pt 3)** utilise la **couleur actuelle** de chaque
   bloc (comme la réconciliation et le compteur all-time), pas la couleur au
   moment de la validation (non stockée). Un bloc re-coté depuis sa validation
   comptera à sa cotation d'aujourd'hui. Cohérent avec le reste du projet — tu
   confirmes que c'est le bon choix ici aussi ?
3. **Blocs `is_child_route` (ouistiti)** et **blocs de compétition régulière
   réutilisés** (`type:'daily'` + `competition_active`) : `colorById` les inclut
   s'ils sont `is_active`. Le recalcul de départ les compterait. Voulu ?
   (La réconciliation actuelle les compte déjà de la même façon.)
4. **Impact Finale** — mon analyse : qualif toujours sur `season.*` live
   (recalculé puis monotone) ✅ ; « Générer le roster » lit `classement_saisons`
   (vide tant qu'aucune clôture) → OK à la vraie fin de saison ✅ ; cron quotidien
   no-op jusqu'à `fin` ✅ ; garde-fou « cloturee > 7 j » non déclenché
   (`cloturee:false`) ✅ ; `classementOptIn` inchangé ✅. Un angle mort ?
5. **Reset en direct depuis le navigateur admin** (3.2) vs script Admin SDK :
   acceptable à N ≈ 12 ? Seuil de bascule ?
6. **Le bug 2.3** — confirmes-tu (comme le retour V2.53) que
   `set({colorCounts:{}}, {merge:true})` ne vide pas la map, et que
   `updateDoc(ref, {'season.colorCounts': {}})` (chemin pointé) la vide ? Fix
   dans le même lot ou à part ?

---

## 5. Questions en attente côté utilisateur (pas pour toi)

- Date exacte de `debut` du redémarrage (« ~15 jours »).
- Livrer dans le commit V2.55 (avec la Roulette) ou un V2.56 séparé ?
  (mon avis : V2.56 séparé — sujet distinct, touche la réconciliation.)
