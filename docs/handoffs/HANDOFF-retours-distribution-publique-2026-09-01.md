# Handoff — Retours des premiers utilisateurs (V2.53 + V2.53.1)

> Rédigé le 01/09/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur / ClaudeNav). Demandes directes de l'utilisateur après le
> passage de l'appli en **distribution publique** — pas de `CONCEPTION-*.md`
> en amont.
>
> **Commité, poussé, déployé.** Deux commits sur `main` :
> - `1a35ff7` — V2.53 (badges auto, défis, couleur des blocs)
> - `c380504` — V2.53.1 (suppression d'un défi, correctif réconciliation)
> - `64bad98` entre les deux — commit du journal de réconciliation prod.
>
> Déploiements : `npx firebase-tools deploy --only firestore:rules,hosting`
> (l'auth firebase-tools était déjà valide dans le Codespace, `firebase login`
> pas nécessaire cette fois).

---

## Résumé

Cinq points remontés par l'utilisateur (bugs + évolutions) + un correctif de
script demandé explicitement. Tout traité, `npm test` (179) + `npm run
test:rules` (102) + `build`/`lint` verts. Trois corrections de données prod
faites en séance (blocs `noire`, réconciliation, `levelOverride` de Kenzo).

---

## 1. Badges couleur — attribution automatique (bug de fond)

**Symptôme utilisateur** : « une collègue a validé ses blocs mais n'a obtenu
aucun badge ».

**Cause** : le catalogue `badges` contient 6 badges `type:"automatic"`
(Duke/Earl/Prince/King/Emperor/Master of the Bloc = « réussir un bloc
<couleur> », `criteria:{color, count}`) — mais **aucun code de l'appli ne les
attribuait**. `client_badges` n'était écrit que par `Moniteur/Stats/
StatsList.tsx` → `awardBadgeToUser` (attribution manuelle par un moniteur).
`ClientStats.tsx` savait seulement lire un badge déjà possédé et le
griser/colorer via `utils/badgeActivation.ts` `computeBadgeActive`.

**Correctif** (`src/pages/Client/Stats/ClientStats.tsx`, dans `fetchStats`,
juste avant la synchro de niveau existante) :

- charge le catalogue `badges` complet ;
- pour chaque badge `type === 'automatic'` non déjà possédé
  (`ownedBadgeIds` dérivé du snapshot `client_badges`), évalue
  `computeBadgeActive({color, criteria}, validatedExistingByColorLocal,
  inventoryByColor)` — mêmes maps que celles qui pilotent déjà le
  grisé/coloré ;
- si vrai → `setDoc(doc(db, 'client_badges', `${uid}_${badgeId}`), {userId,
  badgeId, awardedAt: serverTimestamp(), awardedBy: 'auto', awardedByName:
  'Attribution automatique'})`. **ID déterministe** → aucun doublon au
  rechargement. `try/catch` par badge (`console.error`, on continue).
- les badges fraîchement attribués sont fusionnés dans la liste locale
  **avant** le bloc de synchro de niveau (L~460) pour qu'un nouveau badge
  fasse monter `users.level` dans la même passe.

**Rétroactif par construction** : tout compte récupère ses badges dus à sa
prochaine ouverture de « Mes stats ». Rien à backfiller.

**`firestore.rules`** — bloc `match /client_badges/{clientBadgeId}`, `create`
élargi (en plus de admin/moniteur/ouvreur) :

```
(request.resource.data.userId == request.auth.uid &&
 request.resource.data.awardedBy == "auto" &&
 clientBadgeId == request.auth.uid + "_" + request.resource.data.badgeId &&
 request.resource.data.keys().hasOnly(["userId","badgeId","awardedAt","awardedBy","awardedByName"]) &&
 exists(/databases/$(database)/documents/badges/$(request.resource.data.badgeId)) &&
 get(/databases/$(database)/documents/badges/$(request.resource.data.badgeId)).data.type == "automatic")
```

`update, delete: if false` conservé → un badge auto-attribué reste inviolable.
Tests : `test/firestore.rules.test.ts` `describe('client_badges :
auto-attribution…')` (client peut créer le sien type:automatic ; pas pour un
autre uid ; pas type:manual ni inexistant ; pas d'ID non canonique ; non
modifiable/supprimable après).

**Point d'attention non résolu** : les badges couleur ne **grisent en
pratique jamais** quand un mur change. `computeBadgeActive` teste
`boulderDoc.exists()` (pas `is_active`), et « supprimer un bloc » côté Ouvreur
= soft delete (`is_active:false`, le doc reste). Donc un badge « 1 bloc
rouge » obtenu reste doré indéfiniment. Signalé à l'utilisateur, pas corrigé
(ce serait un changement de comportement : des badges dorés passeraient
gris). À trancher si besoin — le fix serait un filtre `is_active === true`
dans `ClientStats.tsx`.

## 2. Défi "seuil" — champ « Nombre de blocs » ininterrogeable (bug)

`ClientFriends.tsx` : `value={newTargetCount}` (number) +
`onChange={setNewTargetCount(Math.max(1, parseInt(e.target.value,10) || 1))}`.
Effacer le « 5 » → `parseInt("")` = NaN → `|| 1` → « 1 » ré-affiché aussitôt,
champ invidable.

Corrigé : état `useState('5')` (string), `onChange` accepte le vide,
`onBlur` normalise (`String(Math.max(1, parseInt(v,10)||1))`), et
`createChallenge` re-clampe à l'écriture (`payload.target_count =
Math.max(1, parseInt(newTargetCount,10)||1)`).

## 3. Défi "seuil" — cibles « niveau max » / « niveau max −1 » (évolution)

Objectif : un défi équitable entre grimpeurs de niveaux différents.

`utils/challenges.ts` (module pur, aucun import Firestore — discipline
respectée) :

```ts
export const SEUIL_TARGET_MAX = '__niveau_max__';
export const SEUIL_TARGET_MAX_MINUS_1 = '__niveau_max_moins_1__';
export const resolveSeuilTargetColor = (target, userLevel, levelOrderAsc) => {
  if (target !== SEUIL_TARGET_MAX && target !== SEUIL_TARGET_MAX_MINUS_1) return target;
  if (!userLevel) return null;
  const i = levelOrderAsc.indexOf(userLevel);
  if (i < 0) return null;
  return target === SEUIL_TARGET_MAX ? userLevel : (i > 0 ? levelOrderAsc[i-1] : userLevel);
};
```

- `ClientFriends.tsx` : 2 `MenuItem` en tête du Select « Couleur / niveau » ;
  `describeSeuilTarget()` pour l'affichage (« de ton niveau max » / « … max
  −1 » / la couleur brute) ; `target_color` stocke le jeton tel quel.
- `ClientDaily.tsx`, branche `seuil` de `applyClassementDelta` : au lieu de
  `challenge.target_color === color`, on résout
  `resolveSeuilTargetColor(challenge.target_color, selfProfile.level,
  levelOrder)` **par participant** au moment du delta.
- Aucun changement `firestore.rules` (les règles `challenges` ne valident pas
  `target_color`). `resolveSeuilWinner`/clôture inchangés (comparaison
  numérique `value` ↔ `target_count`).
- Tests : `challenges.test.ts` `describe('resolveSeuilTargetColor')` (5 cas).

## 4. Couleur des blocs (évolution)

- **Côté client** (le vrai besoin, précisé en 2e échange) :
  `ClientDaily.tsx` `renderBoulderCard` — les cartes du menu d'un mur
  n'affichaient que « Bloc n°X » → pastille ronde colorée + nom de la couleur
  (« Bloc n°1 — 🔵 bleu »), masqué si Mystère. Map hex depuis `colorGrades`
  (`levelColors` déjà en place dans le fichier).
- **Côté Ouvreur** : `DailyBoulderForm.tsx` liste « Blocs existants » — le nom
  de la couleur était déjà en texte (depuis mai 2026) ; ajout d'une pastille
  ronde devant « Bloc n°X » (`boulderColorHex()` local depuis `colorGrades` +
  `mysteryColorHex`).
- **Aucune migration** : `color` est déjà sur tous les blocs.

## 5. Suppression d'un défi par son créateur (évolution, V2.53.1)

`ClientFriends.tsx` : `deleteChallenge(id)` (`window.confirm` →
`deleteDoc(doc(db,'challenges',id))` → `fetchAll()`), bouton « Supprimer ce
défi » affiché quand `challenge.created_by === user?.uid`, quel que soit le
statut.

`firestore.rules`, bloc `challenges` :
`allow delete: if request.auth != null && resource.data.created_by == request.auth.uid;`

Sans danger en cours de route : `ClientDaily.tsx` charge les défis actifs une
seule fois au montage et `buildClassementFlushWrites` ignore déjà un défi
disparu (`if (!challengeData || !challengeRef) return;`).

Tests : `firestore.rules.test.ts` — créateur peut supprimer ; participant non
créateur ne peut pas.

## 6. Correctif `scripts/reconcile-classement-profiles.js` (V2.53.1)

**Défaut** : les corrections partaient en `set(update, { merge: true })`, qui
**fusionne** les maps et ne retire jamais une clé. Une couleur orpheline dans
`colorCounts` (ex. un bloc recoloré `"noire"` → `"noir"`, laissant
`colorCounts.noire` derrière) survivait à chaque passe → le profil restait
éternellement « en écart réel ». Constaté sur le profil d'Alice Morel après
la recolorisation des 2 blocs « Réta Adultes ».

**Fix** : `colorCountsWriteValue(stored, expected)` — renvoie `{...expected}`
plus un `FieldValue.delete()` explicite pour chaque clé présente dans
`stored` mais absente de `expected`. Appliqué à `colorCounts` **et**
`season.colorCounts`. `FieldValue` ajouté à l'import
`firebase-admin/firestore`.

**Test de non-régression** : `frontend/test/reconcile-orphan-key-emulator.mjs`
— seed un profil avec `colorCounts:{rouge:1, noire:1}` + 1 validation rouge,
lance le script `--fix --uid`, assert que `noire` a disparu et
`rouge === 1`. Lancer via
`npx firebase-tools emulators:exec --only firestore "node frontend/test/reconcile-orphan-key-emulator.mjs"`
(pas câblé dans un script npm, comme les autres e2e du projet).

---

## Corrections de données prod faites en séance

1. **2 blocs `color:"noire"` → `"noir"`** (mur Réta Adultes, n°4/n°12, IDs
   `4va5PltQXTJS6GJpSaKn` / `BUFadcbVGi01x470ToKX`) — l'utilisateur les a
   réédités via l'UI Ouvreur.
2. **Réconciliation `classement_profiles`** (`node
   scripts/reconcile-classement-profiles.js` puis `--fix`) : 2 profils
   recalés — Alice Morel (`noire`→`noir` fusionnés, score 7700→8300,
   37→38 blocs) et un autre compte (−360 pts : 1 rouge validé sur un bloc
   depuis désactivé, comportement documenté, recalé au passage). Garde-fou
   non déclenché (2/17). Journal commité (`64bad98`).
3. **Clé orpheline `colorCounts.noire`** d'Alice, restée après le `set merge`
   d'avant le correctif §6 : supprimée avec
   `firestore-migration/clean-colorcounts-orphan-keys.js` (lecture seule +
   `--fix`, gitignoré). Reconcile ensuite : 0 écart.
4. **Kenzo Dupin** (`users.level:"noir"`, `levelOverride:true`) : voir §7.

## 7. Classement ≠ `users.level` — mise au point (cas Kenzo Dupin)

L'utilisateur voulait qu'une correction admin du niveau (verrouillée) se
répercute « rétroactivement » sur le classement saisonnier.

**Le classement (général ET saisonnier) ne lit jamais `users.level`.** La
couleur affichée = `bestColorRank` dérivé de `colorCounts` /
`season.colorCounts`, eux-mêmes issus des blocs **réellement validés**
(`client_boulder_results`). Kenzo a 7 succès (rouge ×3, violet ×4, aucun
noir) → il apparaît « rouge » = sa vraie donnée.

**Résolution** (choix utilisateur, doctrine confiance) : repasser
`levelOverride:false` — à sa prochaine ouverture de « Mes stats », les badges
Earl+Duke s'attribuent auto et `users.level` se recale sur « rouge » (badge
actif le plus élevé). Le niveau d'inscription n'est qu'une base avant
validations effectives ; ensuite le plus haut bloc validé fait foi. **Rien à
coder** — le mécanisme badge→niveau (déjà en place, sauf `levelOverride`) +
l'attribution auto §1 le font seuls. L'utilisateur a fait la modif.

---

## Docs mises à jour

- `CLAUDE.md` : nouvelle section **Badges** ; note jetons `SEUIL_TARGET_MAX*`
  dans « Défis entre potes » ; entrée « Deletion (V2.53) » ; note
  `colorCountsWriteValue` dans la section reconcile.
- `frontend/src/pages/Client/Help/ClientHelp.tsx` : badges auto ;
  identification numéro+couleur dans le menu d'un mur ; cible niveau du défi
  seuil ; suppression d'un défi.
- `frontend/src/data/changelog.ts` : entrée 2.53 (« Quoi de neuf ? »).
- `topo-blocabrac-source.html` + `topo-blocabrac.pdf` **régénéré** —
  nouveau `npm run topo` (`frontend/scripts/regen-topo.cjs`, playwright).
  Le PDF committé passe de 10 à 9 pages : il était périmé (source éditée
  sans régénération lors d'un chantier précédent), pas une régression.

## Reste ouvert

1. **Badges qui ne grisent pas** (§1, dernier paragraphe) — décision produit
   en attente.
2. `frontend/test/reconcile-orphan-key-emulator.mjs` n'est pas câblé dans un
   script npm ni la CI (comme les autres e2e du projet).
3. `firestore-migration/*.js` créés en séance (`inspect-alice-morel.js`,
   `inspect-kenzo.js`, `find-noire-boulders.js`,
   `clean-colorcounts-orphan-keys.js`) : lecture seule (sauf le dernier avec
   `--fix`), dossier entièrement gitignoré, conservés localement.
