# Corrections avant push — V2.55 + V2.56

> Rédigé le 06/09/2026 par la session Claude (navigateur), en réponse à
> `HANDOFF-v255-v256-avant-push-2026-09-06.md`.
> À destination de Claude Code dans le Codespace.
>
> **Verdict : le lot est bon, deux corrections avant de pousser.**
>
> Le §1 ci-dessous est une **régression réelle** introduite par V2.56 — elle ne se
> manifestera qu'à la première vraie clôture de saison, mais elle produira des compteurs
> pollués que le mécanisme de correction entérinera au lieu de les corriger.
>
> Le §2 est un problème de calendrier, pas de code : le changelog partirait quinze jours
> avant l'événement qu'il annonce.
>
> Le reste (§3 à §6) répond aux six questions du handoff. **Aucun autre changement de code
> n'est demandé.**
>
> Note préalable sur le §2.6 du handoff : le jeu de test de `e2e-season-restart-flow.mjs`
> est bien construit — quatre comptes dont un opt-out, deux blocs désactivés, une clé
> orpheline et un `season.*` volontairement faux. Il reproduit les conditions réelles plutôt
> que le chemin heureux, et l'étape 5 (score inchangé après désactivation d'un bloc) est
> précisément l'assertion qui manquait jusqu'ici.

---

## §1 — CORRECTION BLOQUANTE : la porte `createdAt` casse la fin de saison

### Le problème

La réponse à la Q3 du handoff est **non** : le passage à `createdAt` n'est pas strictement
plus correct. Il l'est pour le cas visé (édition d'une validation antérieure à `debut`),
mais il perd une propriété que l'ancienne porte assurait sans qu'on l'ait remarqué —
**« aujourd'hui ∈ fenêtre » bloquait aussi tout delta une fois la saison terminée.**

### Le scénario, après `fin`

1. `compute-classement-saison.js` clôture : archive dans `classement_saisons`, remet
   `season.score`/`colorCounts` **et** `baseScore`/`baseColorCounts` à zéro, pose
   `cloturee: true`. La fenêtre `[debut, fin]` reste **l'ancienne** jusqu'à ce que l'admin
   reconfigure — jusqu'à 7 jours de battement (`RECONFIGURATION_GRACE_DAYS`).
2. Pendant ce battement, un grimpeur édite une validation dont le `createdAt` tombe dans
   l'ancienne fenêtre (nombre d'essais, notation, dé-validation).
3. `isWithinSeasonWindow(resultCreatedAt, debut, fin)` est **vrai** → un delta est appliqué
   à des compteurs qu'on vient de remettre à zéro.
4. **La réconciliation ne le verra pas** :
   `expected = storedBase (0) + Σ(validations en fenêtre)` inclut cette validation.
   L'écart est nul, la pollution est entérinée.

Avec l'ancienne porte, « aujourd'hui » était hors fenêtre et rien ne se passait.

### Le correctif

**Les deux conditions, pas l'une ou l'autre.** Un delta de saison ne s'applique que si :

- la validation appartient à la saison : `createdAt ∈ [debut, fin]` (nouveau, à garder) ;
- **et** la saison est en cours : `cloturee !== true`.

Le drapeau `cloturee` existe déjà sur `app_config/classement_saison` et est chargé côté
client. Aucune lecture supplémentaire.

Une alternative serait de tester aussi « aujourd'hui ∈ fenêtre », mais `cloturee` est plus
direct et exprime l'intention : *on n'écrit pas dans une saison close.*

### À vérifier dans la foulée

**La réconciliation doit appliquer la même règle.** Si un profil clôturé (`base*` à zéro,
`cloturee: true`) est réconcilié pendant le battement, `expected` doit valoir zéro, pas
`Σ(validations en fenêtre)`. Sinon elle **repeuplerait** les compteurs qu'on vient de
remettre à zéro — c'est exactement le hasard d'ordonnancement signalé au §2 de
`RELECTURE-classement-saisonnier.md`, et le garde-fou `cloturee` avait été ajouté pour ça.

À confirmer que ce garde-fou couvre bien la nouvelle branche saison de `computeExpectedProfile`.

### Test à ajouter

Étendre `e2e-season-restart-flow.mjs` (ou `e2e-season-classement-flow.mjs`) d'une étape :
après la clôture de l'étape 6, éditer une validation dont le `createdAt` est dans
l'ancienne fenêtre, puis vérifier que `season.score` **reste à zéro** — avant et après un
passage de `reconcile --fix`.

C'est le seul chemin qui exerce réellement le correctif.

---

## §2 — CORRECTION : le changelog partirait quinze jours trop tôt

### Le problème

`changelog[0]` est montré au client, et il part avec le build. Le déploiement est prévu le
06/09 ; le bouton « Redémarrer la saison » sera cliqué vers le 21/09 (§5.4 du handoff).

Pendant deux semaines, les grimpeurs liraient donc une annonce de redémarrage **qui n'a pas
eu lieu**, avec un classement de saison inchangé sous les yeux. C'est le genre d'incohérence
qui fait douter du reste.

### Deux sorties, au choix

- **Reformuler au futur avec la date** : « le classement de saison sera redémarré le 21
  septembre — vos points sur les blocs actuellement en place seront conservés, vous n'aurez
  rien à revalider. » Simple, et ça prépare les grimpeurs au lieu de les surprendre.
- **Sortir l'entrée de ce lot** et la livrer dans un micro-déploiement le jour du clic.
  Plus propre chronologiquement, mais demande un second déploiement.

Je pencherais pour la première : annoncer à l'avance vaut mieux que constater après.

### Point lié — la restitution all-time n'est pas annoncée

L'étape 3 du plan lance `reconcile --fix --force` dès le 06/09, ce qui fait **monter** les
scores all-time de tous les comptes ayant validé un bloc depuis retiré.

Une hausse inquiète moins qu'une baisse, mais elle reste inexpliquée. Une phrase dans la
même entrée suffit : « les points des blocs retirés ne sont plus déduits de votre score
total — certains scores augmentent en conséquence. »

C'est d'ailleurs une bonne nouvelle à annoncer, pas un correctif à cacher.

---

## §3 — Q1 : pas besoin d'un nouveau script

Le mode par défaut de `reconcile-classement-profiles.js` **est déjà un dry-run**. Le lancer
tel quel en production donne l'ampleur exacte de la restitution avant toute décision.

Deux points qui lèvent l'inquiétude du handoff :

- **Le journal sera écrit, et c'est très bien** : c'est une observation réelle de
  production, pas un artefact de test. Rien à voir avec le cas des runs émulateur, réglé en
  V2.51.
- **Le garde-fou de ce script est un ratio calculé au sein d'un même run** (30 % **et**
  ≥ 3 comptes), pas une comparaison à l'état précédent. Contrairement à
  `cleanup-orphan-boulder-images.js`, rien ne se reporte d'une exécution à l'autre : un
  dry-run ne « prépare » ni ne fausse le run suivant.

**Séquence recommandée** : dry-run → lecture du résultat → `--fix --force` en connaissance
de cause. Écrire un script d'inspection dédié serait du code pour rien.

---

## §4 — Q2 : la monotonie repose sur un invariant que rien ne protège

D'accord sur le principe : un score total qui ne baisse jamais est cohérent avec la saison
et avec le compteur stocké, et c'est la demande.

L'angle non cité dans le handoff : la nouvelle règle compte « toutes les validations de
blocs **dont le doc existe** ». La monotonie dépend donc de ce qu'**aucun document
`boulders` ne soit jamais supprimé pour de bon**.

C'est vrai aujourd'hui — le grep de V2.54 l'a établi, la désactivation est le seul retrait.
Mais c'est une **convention, pas une garantie** : une suppression manuelle depuis la console
Firebase ferait disparaître d'un coup toutes les validations associées, et le score
baisserait. Et il y a précédent — la session V2.53 a supprimé à la main un document de test
de `competition_participants`.

**À faire** : inscrire l'invariant dans `CLAUDE.md`, à côté des autres.

> Ne jamais supprimer un document `boulders`. La désactivation (`is_active: false`) est le
> seul retrait. La monotonie des scores all-time et de saison en dépend : un document
> supprimé fait disparaître toutes les validations associées.

Une ligne, et elle protège la propriété que ce lot vient de construire.

Le cas que tu cites (bloc créé par erreur puis désactivé, validations conservées) est
acceptable : il était déjà vrai du compteur stocké, et le volume est marginal.

---

## §5 — Q4, Q5, Q6 : validés

**Q4 — pousser les deux commits d'un coup** : d'accord. `ClientDaily.tsx` est touché par
les deux mais sur des zones disjointes (Roulette / `applyClassementDelta`), et
`CLAUDE.md`/`changelog.ts` sur des sections distinctes.

**Q5 — « Page crashed » de `e2e-season-classement-flow.mjs`** : ta lecture est la bonne. Des
échecs qui **migrent d'une étape à l'autre** pendant que deux autres suites restent stables
désignent l'environnement, pas le code — un bug de régression est reproductible au même
endroit. Ne relance pas pour le plaisir.

**Q6 — itérer `classement_profiles` plutôt que `users`** : acceptable. Plutôt qu'un
changement de code, une vérification d'une minute avant le clic — comparer le nombre de
documents `classement_profiles` au nombre de comptes clients. S'ils correspondent, le
non-cas est confirmé ; sinon, un `reconcile --fix` préalable créera les profils manquants,
et le bouton les traitera.

---

## §6 — Plan révisé

1. **Corriger le §1** (porte `cloturee` + vérification côté réconciliation + test).
2. **Corriger le §2** (reformulation du changelog, mention de la hausse all-time).
3. **Ajouter l'invariant du §4** dans `CLAUDE.md`.
4. `npm run build` / `lint` / `test` / `test:rules` + les trois e2e.
5. `git push` (les deux commits, plus celui-ci).
6. `npx firebase-tools deploy --only hosting`.
7. **Dry-run** `node scripts/reconcile-classement-profiles.js` en prod, lecture du résultat.
8. `--fix --force` si l'ampleur correspond à l'attendu. Journal à committer si lancé en
   local.
9. **Avant le clic du 21/09** : vérifier le nombre de profils (§5, Q6).
10. L'utilisateur règle `debut`/`fin` puis clique « Redémarrer la saison maintenant ».

---

## Items ouverts, pour mémoire

- `users/{uid}` accumule l'état ludique et est lu en entier par les écrans staff — noté
  dans `CLAUDE.md`, rien à faire avant le multi-salles.
- Défis `fenetre` / `bloc_designe` : en production sans e2e navigateur.
- Chantier droits d'accès — en attente du gérant.
  `CONCEPTION-droits-acces-abonnements.md` toujours pas transmis au dépôt.
- `topo-blocabrac.pdf` sans la police Dosis, `aide-connexion-installation.html` hors charte.
- Réplique matérielle HDMI à froid ; ligne de base de lectures quotidiennes ; concurrence à
  90 utilisateurs simultanés ; plan de repli quota ; un projet Firebase par salle vs
  mutualisé ; sauvegarde durable des images (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout compteur incrémental doit avoir une assertion e2e sur sa valeur résultante
  (`PROCESSUS-erreurs-avalees.md` §4).
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
