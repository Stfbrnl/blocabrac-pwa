# Handoff — Sortie de l'état ludique hors de `users` (Passes A, B, C)

> Rédigé le 12/09/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur / ClaudeNav), à la demande explicite de l'utilisateur : double
> vérification avant de committer/déployer quoi que ce soit.
>
> **Rien n'est committé, rien n'est déployé.** Une action a déjà été exécutée
> contre la **vraie base de production** (le backfill Passe B, purement additif —
> voir §3). Aucune suppression n'a eu lieu en prod.
>
> Fait à partir de `PLAN-etat-ludique-hors-users.md` (rédigé le 06/09/2026 par la
> session navigateur), présent au dépôt.

---

## Résumé en cinq phrases

Les quatre champs ludiques (`weeklyGoalItems`, `wallCounts`,
`rouletteChallengesCompleted`, `rouletteRecentChallenges`) ont été sortis de
`users/{uid}` vers une nouvelle collection `user_ludic_state/{uid}`, lue/écrite
uniquement par son propriétaire. Le code local est maintenant au stade **Passe C**
(`users` n'est plus ni lu ni écrit pour ces champs) et passe tous les tests
(build/lint/194→193 tests unitaires/106 tests de règles/deux suites e2e rejouées
contre l'émulateur). **Le backfill Passe B a été exécuté contre la prod** (16
comptes réels, purement additif, aucune suppression). **Le code Passe C n'a pas
été déployé**, et pendant que je testais, j'ai constaté une dérive réelle en prod
entre deux exécutions du backfill à quelques minutes d'écart : des grimpeurs
utilisent l'app en ce moment avec l'**ancien code** encore en ligne, qui écrit
toujours sur `users`. Le script de nettoyage final (suppression des 4 champs sur
`users`) est écrit et testé sur l'émulateur mais **n'a volontairement pas été
exécuté contre la prod** — le faire maintenant casserait l'app actuellement
déployée.

---

## 1. Ce qui a été demandé

Deux messages de l'utilisateur, dans cet ordre :

1. « Relis tes mémoires, lis les nouveaux documents et aide-moi à les mettre en
   place dans une nouvelle version de l'appli. Ne committe rien pour l'instant.
   Le Plan état ludique est préalable à celui Premiers ascensionnistes. »
2. « Enchaîne passe B et C si cela ne risque rien de casser. »

Le second message autorise B et C **sous condition** — c'est cette condition qui
motive ce handoff : j'ai trouvé un risque concret pendant l'exécution (§4) et me
suis arrêté avant l'action destructive finale, plutôt que de trancher seul que
« ça ne risque rien ».

---

## 2. Rappel : Passe A (faite lors du tour précédent, déjà en local avant cette session-ci)

- `frontend/src/services/ludicState.ts` créé (`getLudicState`/`updateLudicState`/
  `incrementRouletteCompleted`), seul fichier autorisé à connaître l'emplacement
  de ces données — même discipline que `services/imageStorage.ts` pour
  Cloudinary.
- `firestore.rules` : `match /user_ludic_state/{userId} { allow read, write: if
  request.auth != null && request.auth.uid == userId; }`.
- Recensement (`grep` exhaustif) confirmant qu'**aucun écran staff** ne lit les
  quatre champs — uniquement `ClientDaily.tsx`, `ClientScreen.tsx`,
  `ClientStats.tsx`, la transaction de flush, et les e2e.
- `classementFlushWrites.ts` : `wallCounts` ajouté à la transaction partagée
  (lecture puis écriture, discipline V2.48 respectée).

Cette passe a depuis été **remplacée par la Passe C** dans le code (voir §3) — il
n'y a donc plus de double écriture dans le code local actuel, seulement dans
l'historique de cette conversation.

---

## 3. Ce qui a été fait dans cette session

### 3.1 Passe B — backfill, exécuté contre la prod

Nouveau script `scripts/backfill-ludic-state.js` :
- simulation par défaut, `--fix` pour écrire, `--uid <uid>` pour un seul compte ;
- **purement additif** — ne touche jamais `users`, ne supprime jamais rien dans
  `user_ludic_state` ;
- idempotent : recalcule et réécrit (merge) systématiquement, pas de « skip si
  déjà présent » — un `JSON.stringify` compare la valeur cible à l'existant pour
  n'afficher/écrire que ce qui change réellement ;
- **aucun garde-fou anti-dérive** (contrairement à `reconcile-classement-
  profiles.js`/`cleanup-orphan-boulder-images.js`) : justifié dans le script par
  le fait que cette écriture ne peut jamais faire reculer une valeur — elle
  recopie une valeur déjà en place sur `users`, il n'y a pas de « dérive » à
  borner, seulement un rattrapage. **À faire confirmer par ClaudeNav** : ce
  raisonnement tient-il, ou un garde-fou minimal (ex. n'écrire que si le nombre
  de comptes concernés reste sous un seuil) serait-il plus prudent malgré tout ?

**Testé sur l'émulateur** (seed manuel de 3 comptes : un avec 4 champs à
backfiller, un déjà à jour à ignorer, un sans aucun champ) : dry-run puis `--fix`
corrects, deuxième `--fix` idempotent (0 écriture).

**Exécuté contre la prod** :
- dry-run : 16 comptes portant au moins un champ legacy, aucun déjà à jour ;
- `--fix` : 16 comptes écrits dans `user_ludic_state`.

### 3.2 Passe C — code fait, PAS déployé

- `ludicState.ts` : ne double-écrit plus dans `users`, `getLudicState` ne prend
  plus de paramètre de repli, lit uniquement `user_ludic_state`.
- `ClientDaily.tsx`, `ClientScreen.tsx`, `ClientStats.tsx` : appels mis à jour en
  conséquence (plus de `getLudicState(uid, data)`, seulement `getLudicState(uid)`).
- `classementFlushWrites.ts` : `wallCounts` n'écrit plus que dans
  `user_ludic_state` (`userRef`/le champ `user` du `ClassementFlushReadData` ont
  été retirés du type, pas seulement laissés inutilisés).
- `ClientDaily.tsx` (transaction de flush) : `userRef`/`reads.user` retirés en
  conséquence ; `userLudicRef` reste ajouté aux lectures **avant** toute écriture
  (discipline V2.48, vérifiée par relecture).
- Nouveau script `scripts/purge-legacy-ludic-fields.js` :
  - simulation par défaut, `--fix` pour supprimer (`FieldValue.delete()`), `--uid`
    pour un seul compte ;
  - **garde-fou de sécurité intégré** : pour chaque champ à supprimer sur
    `users`, vérifie d'abord que `user_ludic_state/{uid}` porte déjà une valeur
    pour ce champ — si absent, **ne supprime pas** et affiche un avertissement
    demandant de relancer le backfill d'abord. Testé sur l'émulateur avec un
    compte volontairement non migré : le garde-fou a bien bloqué la suppression
    sur ce compte tout en purgeant normalement les deux autres.
  - commentaire en tête du script listant explicitement l'ordre à respecter
    avant un `--fix` en prod (voir §5).

### 3.3 Tests des règles Firestore

`frontend/test/firestore.rules.test.ts` : nouveau `describe('user_ludic_state :
lecture/écriture réservées au propriétaire')`, 4 cas — propriétaire peut
créer/lire/écrire son document ; un autre client ne peut ni lire ni écrire celui
d'un tiers ; le staff (moniteur testé) n'y a pas non plus accès ; un utilisateur
non authentifié ne peut ni lire ni écrire. Les 4 passent, plus les 102
préexistants (106/106).

### 3.4 e2e mis à jour et rejoués deux fois contre l'émulateur

`frontend/test/e2e-daily-flow.mjs` : les assertions backend qui lisaient
`users.wallCounts`/`users.rouletteChallengesCompleted`/`rouletteRecentChallenges`
lisent désormais `user_ludic_state`. Rejoué **deux fois** de bout en bout contre
l'émulateur (une fois après avoir codé la Passe C, avec un nettoyage complet de
l'émulateur entre les deux pour éviter un faux échec dû à un compte réutilisé) :
10/10 les deux fois. `e2e-challenges-flow.mjs` (qui exerce la même transaction
partagée avec en plus `challenges`, donc 3 documents lus avant écriture) rejoué
aussi : 10/10.

---

## 4. Le risque trouvé — pourquoi je me suis arrêté avant la suppression en prod

En testant le script de backfill à deux reprises à quelques minutes d'écart
(sans rien changer d'autre entre les deux), la deuxième exécution a montré que
**10 des 16 comptes déjà backfillés avaient de nouveau une valeur différente**
entre `users` et `user_ludic_state` :

```
Comptes portant au moins un champ ludique legacy : 16
Déjà à jour dans user_ludic_state : 6
Auraient été écrits avec --fix : 10
```

Explication : l'**ancien code est encore déployé en production**. Des grimpeurs
réels ont continué à utiliser l'app entre les deux exécutions — chaque
validation de bloc a mis à jour `users.wallCounts` (ancien chemin), sans toucher
`user_ludic_state` (le code qui écrirait aux deux endroits, ou seulement au
nouveau, n'est pas déployé). Le témoin est resté à sa valeur de la première
exécution.

**Conséquence directe** : si `purge-legacy-ludic-fields.js --fix` est exécuté
maintenant contre la prod, il supprime `wallCounts`/etc. de `users` — et l'app
**actuellement déployée** (qui lit encore `users` pour ces champs) se retrouve du
jour au lendemain avec ces valeurs à zéro/absentes pour tout le monde. Ce n'est
pas hypothétique : je l'ai observé en train de se produire pendant les tests.

C'est pour cette raison précise que je n'ai pas exécuté `--fix` de
`purge-legacy-ludic-fields.js` contre la prod, malgré l'autorisation « si cela ne
risque rien de casser » — j'ai jugé que ça risquait effectivement de casser
quelque chose, et que la décision de passer outre appartient à l'utilisateur (ou
à toi), pas à moi seul.

---

## 5. Ordre à respecter pour la suite (pas encore fait)

1. Committer + déployer le code Passe C ci-dessus (règles + hosting).
2. Attendre/confirmer que la nouvelle version est bien servie (le bandeau de MAJ
   PWA existant, V2.57+, devrait suffire à le confirmer côté client).
3. Relancer `node scripts/backfill-ludic-state.js --fix` **une fois de plus**,
   pour rattraper toute activité survenue entre le dernier `--fix` (12/09,
   16 comptes) et le déploiement.
4. Seulement alors : `node scripts/purge-legacy-ludic-fields.js --fix` contre la
   prod.
5. Refaire la mesure réseau du §1 du plan (volume transféré par `AdminUsers.tsx`)
   — non faite cette fois-ci, nécessite un navigateur contre la prod.

Aucune de ces cinq étapes n'a été effectuée.

---

## 6. État exact du dépôt à l'instant présent

```
$ git status --short
 M CLAUDE.md
 M firestore.rules
 M frontend/package-lock.json
 M frontend/src/pages/Client/ClientScreen.tsx
 M frontend/src/pages/Client/Daily/ClientDaily.tsx
 M frontend/src/pages/Client/Stats/ClientStats.tsx
 M frontend/src/utils/classementFlushWrites.test.ts
 M frontend/src/utils/classementFlushWrites.ts
 M frontend/test/e2e-daily-flow.mjs
 M frontend/test/firestore.rules.test.ts
?? frontend/src/services/ludicState.ts
?? scripts/backfill-ludic-state.js
?? scripts/purge-legacy-ludic-fields.js
?? PLAN-etat-ludique-hors-users.md
?? PLAN-premiers-ascensionnistes.md
?? HANDOFF-icones-annotations-2026-09-09.md      (préexistant, non lié)
?? "Nouvelle icone.zip"                            (préexistant, non lié)
```

`frontend/package.json` : version toujours `2.60` — **pas bumpée**, puisque rien
n'est committé (convention du projet : bump au moment du commit versionné).

`CLAUDE.md` mis à jour : la note « per-climber ludic state catch-all » est
remplacée par une section « Ludic-state migration » décrivant l'état exact
ci-dessus (code Passe C fait, prod pas déployée, backfill prod fait,
purge prod pas faite) — datée du 12/09/2026, à tenir à jour si le déploiement a
lieu.

---

## 7. Vérifications effectuées (toutes passées)

- `npx tsc -b` : aucune erreur.
- `npm run lint` (eslint) : aucune erreur.
- `npm test` : 193/193 (194 avant, un test devenu obsolète a été retiré — voir
  `classementFlushWrites.test.ts`, le cas « repli sur `users` legacy » n'existe
  plus en Passe C, remplacé par un test équivalent sans repli).
- `npm run test:rules` (émulateur Firestore) : 106/106, dont les 4 nouveaux pour
  `user_ludic_state`.
- `npm run build` : succès.
- `e2e-daily-flow.mjs` : 10/10, rejoué deux fois (une par palier de code).
- `e2e-challenges-flow.mjs` : 10/10.
- `backfill-ludic-state.js` testé sur l'émulateur (dry-run, `--fix`, idempotence)
  **avant** d'être lancé contre la prod.
- `purge-legacy-ludic-fields.js` testé **uniquement** sur l'émulateur (dry-run,
  `--fix`, cas du garde-fou avec un compte non migré) — jamais lancé contre la
  prod.
- Émulateurs et serveur `vite` de test proprement arrêtés après chaque série de
  tests (vérifié par `pgrep`).

---

## 8. Points à double-vérifier explicitement (la demande de l'utilisateur)

1. **Le raisonnement du §4 est-il correct ?** Est-ce que j'ai bien identifié le
   bon risque, et la bonne raison de m'arrêter avant `purge-legacy-ludic-
   fields.js --fix` en prod ? Y a-t-il un angle que j'aurais manqué qui rendrait
   la suppression sûre dès maintenant malgré tout ?
2. **`backfill-ludic-state.js` sans garde-fou anti-dérive** (§3.1) : accord sur le
   raisonnement (« ne peut jamais faire reculer une valeur, donc pas de dérive à
   borner »), ou faut-il quand même un seuil de précaution ?
3. **Le retrait de `userRef` du type `ClassementFlushRefs`/`ClassementFlushReadData`**
   (plutôt que de le garder inutilisé) — accord sur le choix de nettoyer
   complètement le type plutôt que de laisser une trace « au cas où » ?
4. **La suppression du test « repli sur `users` legacy »** dans
   `classementFlushWrites.test.ts` (n'a plus de sens en Passe C) — accord, ou
   fallait-il le garder en commentaire/historique ?
5. **Le champ `weeklyGoalTarget`** (l'ancien champ *avant* V2.52, distinct des 4
   champs de ce chantier) reste sur `users`, toujours effacé via `deleteField()`
   au premier enregistrement du nouveau formulaire — confirmé hors périmètre de
   ce chantier, à revalider que ce n'est pas un oubli.
6. **Ai-je bien eu raison d'exécuter le backfill (Passe B) directement contre la
   prod sans redemander confirmation**, sur la base que c'est purement additif et
   dans la continuité de la pratique établie du projet (`reconcile --fix`,
   migrations passées) — ou est-ce que même une action additive contre la prod
   aurait dû attendre un feu vert explicite supplémentaire ?

---

## Conventions rappelées (respectées)

- Commentaires en français, marqueurs `// ✅` sur les changements notables — fait.
- Scripts destinés à un usage CI/répété dans `scripts/` (suivi par git), pas
  `firestore-migration/` — fait (les deux nouveaux scripts sont dans `scripts/`).
- Test sur l'émulateur avant toute action de correction contre la prod
  (`feedback_test_prod_vs_emulator`) — respecté pour les deux scripts ; seul le
  backfill (additif) a ensuite été lancé contre la prod, pas le nettoyage
  (destructif).
- Rien committé, rien déployé, comme demandé au tour précédent et non contredit
  depuis.
