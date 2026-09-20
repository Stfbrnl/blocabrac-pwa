# Handoff — Mise en veille des badges couleur à la rotation des murs (V2.54)

> Rédigé le 02/09/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur / ClaudeNav).
>
> **Commité, poussé et déployé** — commit `7d07fd6` sur `main`
> (`b9f9a8a..7d07fd6`), hosting uniquement (`npx firebase-tools deploy --only
> hosting`). **Aucune règle Firestore, aucun index** modifié.
>
> Origine : question de l'utilisateur ("confirme-moi que les utilisateurs
> perdent bien leurs badges après rotation des murs"), puis relecture de tes
> quatre points de vigilance, tous traités ici.

---

## Résumé en trois phrases

Un badge « couleur » (`type:"automatic"` : Earl/Duke/Prince/King/Emperor/Master)
ne se grisait **jamais** après une rotation de mur, parce que le calcul
d'activation ne vérifiait que `boulderDoc.exists()` — or une rotation ne
supprime jamais un bloc, elle le passe en `is_active:false`. V2.54 ajoute le
filtre `is_active === true && type === 'daily'` au comptage des badges **et** à
l'inventaire du badge « Master », et fait redescendre `users.level` (via un
nouveau champ `users.baseLevel`) quand tous les badges couleur retombent en
veille. Trois surfaces d'explication ont été ajoutées (chip, aide en ligne,
changelog) pour que le grisage soit lu comme un objectif et pas comme un bug.

---

## 1. Le bug de fond

- **Aucun chemin dans l'app ne supprime un document `boulders`.** Le seul
  « suppression » d'un bloc quotidien (`DailyBoulderForm.tsx:444`) fait
  `updateDoc(..., { is_active: false })`. Vérifié par `grep` : pas de
  `deleteDoc` sur `boulders` nulle part.
- `ClientStats.tsx` (`fetchStats`), boucle sur `client_boulder_results` de
  l'utilisateur : chaque résultat déclenche un `getDoc(doc(db,'boulders',
  result.boulderId))`. Avant V2.54, seul `if (!boulderDoc.exists()) continue;`
  filtrait — donc un bloc désactivé comptait encore comme « en salle », le
  badge restait coloré indéfiniment.
- `inventoryByColor` (dénominateur du badge « Master », `criteria.count:"all"`)
  faisait `getDocs(collection(db,'boulders'))` **sans filtre** : les blocs
  désactivés et les blocs `type:'competition'` gonflaient le total exigé, et la
  lecture croissait sans borne (les blocs retirés ne sont jamais effacés).

---

## 2. Ce qui a changé — lecture / écriture

### 2.1 `ClientStats.tsx` — comptage des badges (LECTURES, inchangé en nombre)

Dans la boucle par résultat, sur le doc `boulders` **déjà chargé** (aucune
lecture ajoutée) :

```ts
const countsForBadges =
  boulderData.is_active === true && boulderData.type === 'daily';
if (result.success === true && countsForBadges) {
  existingValidatedBoulderIdsByColor[color].add(result.boulderId);
}
```

`existingValidatedBoulderIdsByColor` → `validatedExistingByColorLocal`
(`{couleur: nb de blocs distincts validés, actifs, quotidiens}`) alimente
`computeBadgeActive` pour l'affichage grisé/coloré **et** l'auto-attribution
**et** la synchro de niveau.

- `BoulderData` a gagné `is_active?: boolean` et `type?: string`.
- Le tableau de stats affiché (`boulderStatsData`, filtré par période) n'est
  **pas** touché : un bloc désactivé reste visible dans l'historique, il ne
  compte simplement plus pour les badges.

### 2.2 `ClientStats.tsx` — inventaire « Master » (LECTURES : diminuent, deviennent bornées)

```ts
// avant : getDocs(collection(db, 'boulders'))   → B docs (tous, croît sans fin)
// après :
getDocs(query(
  collection(db, 'boulders'),
  where('type', '==', 'daily'),
  where('is_active', '==', true),
))                                                // → A docs (inventaire actif, borné)
```

Même requête que `ClientDaily.tsx:332-334` → **l'index composite `(type ASC,
is_active ASC)` existe déjà**, rien à ajouter dans `firestore.indexes.json`.
`A < B` toujours, et `A` est stable dans le temps alors que `B` croissait à
chaque bloc retiré : c'est un gain net de quota, du même ordre que les chantiers
quota précédents.

### 2.3 `ClientStats.tsx` — synchro de niveau + `users.baseLevel` (ÉCRITURES)

Contexte : le catalogue prod n'a **aucun badge en dessous de `violet`**
(jaune/vert/bleu = niveaux faciles, sans badge — vérifié, voir §3). Donc
`users.level` porte le niveau **déclaré** par le client jusqu'à ce qu'un badge
l'élève.

Nouveau champ **`users.baseLevel`** (string, couleur) :

| Écrit par | Quand | Valeur |
|---|---|---|
| `Register.tsx` (batch de création `users`) | à l'inscription | `= level` choisi au formulaire |
| `ClientStats.tsx` (synchro de niveau) | **1re** élévation par un badge, **seulement si** le niveau courant est jaune/vert/bleu (`currentLevelIndex < colorOrder.indexOf('violet')`) et `baseLevel` pas déjà présent | `= userData.level` d'avant l'élévation |

Logique de synchro (`if (!userData?.levelOverride && userData)`) :

- **≥ 1 badge couleur actif** → `level = highestActiveColor` (comme avant),
  éventuellement + `baseLevel` dans le **même** `updateDoc` (un seul write, 1-2
  champs).
- **0 badge couleur actif ET `level >= violet`** (nouveau) → cette valeur ne
  peut venir que d'un badge désormais en veille → `level = baseLevel` s'il
  existe, **sinon `'bleu'`** (défaut pour comptes legacy sans snapshot — « le
  client a probablement déclaré bleu »). **Jamais vers le haut** : garde
  `colorOrder.indexOf(fallbackLevel) < currentLevelIndex`.
- **0 badge couleur actif ET `level < violet`** → rien (le niveau déclaré est
  déjà cohérent).

`baseLevel` **n'est pas** dans les clés verrouillées de `firestore.rules`
(`inscritAuxCours`/`inscritAuxCompetitions`/`role`/`roles`/`levelOverride`) →
le client l'écrit sur son propre doc `users`, **aucune règle à modifier**.

**Coût écritures** : toujours **au plus un `updateDoc` sur `users` par ouverture
de « Mes stats »**, comme avant V2.54 — juste déclenché dans un cas où il ne
l'était pas (descente), et portant parfois un 2e champ.

### 2.4 Auto-attribution des badges (`ClientStats.tsx`, inchangé sur le fond)

L'auto-award (`setDoc(client_badges/${uid}_${badgeId}, {awardedBy:'auto'})`)
utilise le même `validatedExistingByColorLocal`. Conséquence indirecte du
correctif : dans le cas limite « le seul bloc validé de cette couleur est
désactivé », un badge auto n'est **plus** attribué — c'est un write **évité**,
jamais un write ajouté. Le badge reste immuable une fois créé.

### 2.5 Surfaces d'explication (aucune donnée)

- `ClientStats.tsx` : le `Chip` sous un badge grisé →
  « Badge en veille : plus de bloc de cette couleur actuellement en salle. Il se
  rallume dès que vous en revalidez un. »
- `ClientHelp.tsx`, section « Mes statistiques » : phrase ajoutée.
- `frontend/src/data/changelog.ts` : entrée `version:'2.54'` (seul
  `changelog[0]` est montré au client) annonçant explicitement que d'anciens
  badges liés à des murs démontés vont s'éteindre — « c'est voulu, pas un bug ».

---

## 3. Audit du catalogue `badges` en prod (lecture seule)

`firestore-migration/audit-badges-criteria.js` (dossier **gitignore**, comme les
autres scripts d'inspection ponctuels — `inspect-kenzo.js`, `check-client-role.js`).
`node firestore-migration/audit-badges-criteria.js`, credentials
`firestore-migration/serviceAccountKey.json`.

Résultat au 02/09/2026 (**aucune anomalie**) :

| id | couleur | `criteria.count` |
|---|---|---|
| `badge-debutant` / `-intermediaire` / `-avance` / `-expert` | — | absent → toujours actif (manuels, moniteur) |
| `earl_of_the_bloc` | violet | `"1"` |
| `duke_of_the_bloc` | rouge | `"1"` |
| `prince_of_the_bloc` | noir | `"1"` |
| `king_of_the_bloc` | blanc | `"1"` |
| `emperor_of_the_bloc` | rose | `"1"` |
| `master_of_the_bloc` | rose | `"all"` |

- `count` est stocké en **chaîne** `"1"` (pas `1`) — `computeBadgeActive` le
  gère : `parseInt(String(rawCount ?? '1'), 10) || 1`. Défaut = 1 si absent.
- Règle métier confirmée : **1 bloc suffit pour tout badge couleur**, sauf le
  plus élevé (`Master`, rose, `"all"` = toute la couleur en salle).
- `emperor` et `master` sont tous deux `rose` : Emperor = 1 rose, Master = tous
  les roses.

---

## 4. Tes quatre points de vigilance — statut

1. **Descente de niveau via les badges** → traité §2.3. La comparaison
   `userData.level !== highestActiveColor` était déjà bidirectionnelle ; l'angle
   mort réel était « 0 badge actif » (le `if (activeBadgeColors.length > 0)`
   sautait tout write). Comblé par le repli `baseLevel`/`'bleu'`.
2. **Descente de niveau ≠ défi cassé** → **vérifié, rien à faire.** Pour `seuil`
   (seule structure à cible dépendante du niveau via `SEUIL_TARGET_MAX` /
   `_MAX_MINUS_1`), la cible de victoire est `target_count` (un entier fixe,
   jamais recalculé) ; le niveau ne décide que **quelles futures validations**
   incrémentent `progress[uid].value` (compteur cumulatif pur, jamais recalculé
   ni décrémenté). `resolveSeuilWinner` reste `value >= targetCount`.
   `fenetre`/`bloc_designe`/`declaratif` : cible indépendante du niveau.
   `selfProfile.level` est relu à chaque montée de `ClientDaily.tsx`.
3. **Badge éteint compréhensible** → traité §2.5 (chip reformulé + aide).
4. **Grisage massif au déploiement** → traité §2.5 (entrée changelog V2.54).

---

## 4bis. Suivi V2.54.1 — `ClientProfile.tsx` écrit `baseLevel` (retour ClaudeNav)

Le point « réserve » ci-dessous a été **corrigé** dans la foulée (commit
V2.54.1). Raisonnement retenu, redéfinissant le champ plutôt que le corrigeant :

- `baseLevel` = **niveau déclaré**, `level` = **niveau constaté**. Le constaté
  fait foi tant qu'un badge couleur est actif ; quand tous sont en veille, le
  déclaré reprend la main.
- Enregistrer sa fiche « Mes informations » vaut **re-déclaration** :
  `ClientProfile.tsx` écrit désormais `baseLevel: userData.level` dans le même
  `batch.update` que `level`. Sans ça, le cas exact décrit par l'utilisateur —
  grimpeur de retour après blessure, aucun badge actif, qui saisit le niveau
  qui lui semble cohérent — voyait sa saisie écrasée à la visite suivante de
  « Mes stats » par l'instantané `baseLevel` pris des mois plus tôt (ou `'bleu'`).
- **La synchro ne fait jamais remonter le niveau** — vérifié : la branche
  « 0 badge actif » n'écrit que si
  `colorOrder.indexOf(fallbackLevel) < currentLevelIndex` (repli strictement
  vers le bas). Un grimpeur qui déclare un niveau *supérieur* à son ancienne
  base voit donc sa déclaration respectée (le nouveau `baseLevel` == le niveau
  courant → aucune écriture de repli). La seule remontée possible reste
  l'attribution d'un badge, ce qui est l'intention.
- Caption ajoutée sous le `Select` « Niveau en salle » de `ClientProfile.tsx` :
  la valeur ne s'applique que si aucun badge couleur n'est actif.
- Conséquence : le snapshot legacy dans `ClientStats.tsx`
  (`!userData.baseLevel && currentLevelIndex < violet`) ne sert plus qu'aux
  comptes créés avant V2.54 qui n'ont jamais réenregistré leur profil —
  conservé, inoffensif.

## 5. Réserves / dettes connues
- **Comptes legacy sans `baseLevel`** : si tous leurs badges passent un jour en
  veille, ils retombent à `'bleu'` par défaut, pas à leur vraie déclaration
  d'origine (perdue). Jugé acceptable : retomber en dessous de violet avec un
  vrai palmarès de badges est très improbable (accord utilisateur).
- **Pas de test rules relancé** (`npm run test:rules` — pas de changement de
  règles, et il faut l'émulateur Java). `npm test` : 179/179 vert. `npm run
  build` / `lint` : verts.
- **Pas de test unitaire ajouté sur la synchro de niveau** : la logique vit dans
  un `useEffect` de composant (pas de harnais React ici). `badgeActivation.ts`
  reste couvert (6 cas). Un e2e « rotation → badge grisé → niveau redescend »
  serait le vrai filet mais n'existe pas (pas de suite e2e câblée, cf. section
  Testing de `CLAUDE.md`).
- **`topo-blocabrac.pdf` a beaucoup rétréci** (447 KB → 143 KB) à la
  régénération : c'est le sous-ensemble de polices / la compression du Chromium
  actuel (Skia/PDF m149), pas une perte de contenu — `pdfinfo` confirme 11
  pages, titre correct, A4.

---

## 6. Fichiers touchés

| Fichier | Changement |
|---|---|
| `frontend/src/pages/Client/Stats/ClientStats.tsx` | filtre `is_active && type==='daily'` (badges + inventaire) ; repli de niveau sur `baseLevel`/`'bleu'` ; snapshot `baseLevel` ; libellé du chip ; `BoulderData` + 2 champs |
| `frontend/src/pages/Register.tsx` | écrit `baseLevel: level` à la création du doc `users` |
| `frontend/src/pages/Client/Profile/ClientProfile.tsx` | **(V2.54.1)** écrit `baseLevel` en même temps que `level` ; caption sous le champ « Niveau en salle » |
| `frontend/src/pages/Client/Help/ClientHelp.tsx` | phrase sur la mise en veille |
| `frontend/src/data/changelog.ts` | entrée `version:'2.54'` |
| `frontend/package.json` | `2.53.2` → `2.54.0` |
| `CLAUDE.md` | section *Badges* : sous-section « mise en veille » + invariant catalogue |
| `topo-blocabrac-source.html` + `topo-blocabrac.pdf` | ligne « Mes statistiques » réécrite, version/date |
| `firestore-migration/audit-badges-criteria.js` | script d'audit lecture seule (non versionné) |
