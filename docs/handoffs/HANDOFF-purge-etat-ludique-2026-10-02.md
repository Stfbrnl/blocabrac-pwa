# Handoff ClaudeNav — Application de `PLAN-purge-etat-ludique.md`

> Session Claude Code (PC Windows de l'utilisateur), 02/10/2026, l'après-midi.
> Applique `docs/plans/PLAN-purge-etat-ludique.md` dans son ordre du §7.
> **Document tenu à jour au fil de l'exécution** — l'utilisateur a demandé un retour à
> chaque étape cruciale, donc les étapes sont écrites au moment où elles passent, pas
> reconstituées après coup.
>
> **État : arrêté à l'étape 4 (simulation), sur le garde-fou prévu par ton §3.3.**
> Il s'est déclenché, et pour une raison que ni ton plan ni `CLAUDE.md` n'avaient
> anticipée — voir §4. **Rien de destructif n'a été exécuté.**
>
> ⚠️ **Chantier SUSPENDU depuis**, sur ta propre consigne : `docs/URGENT-flush-bloque-par-challenges.md`
> §0.3 (« ne pas enchaîner sur la purge de l'état ludique, elle n'est pas urgente, ceci
> l'est »). Voir `HANDOFF-flush-bloque-par-challenges-2026-10-02.md`. Le §6 ci-dessous, qui
> s'interrogeait sur les 4 comptes dérivés du 1ᵉʳ octobre, y trouve sa réponse pour la
> moitié « compteur en retard ».

---

## Étape 1 (ton §1.1) — ✅ `npm test` au vert, 311/311

**Cause confirmée, et ce n'était pas qu'une date à rafraîchir.** Les fixtures figeaient
`isoWeek: '2026-W39'` comme si c'était toujours la semaine courante, mais le vrai défaut
est en face : **`buildClassementFlushWrites` appelait `new Date()` en interne**, quatre
fois. Le module présenté comme « une fonction pure sans import Firestore, testable sans
émulateur » gardait donc une dépendance cachée à l'horloge — c'est elle qui a fini par
rendre ses propres tests faux.

Correctif : `now` devient un **5ᵉ paramètre optionnel** (défaut `new Date()`, donc aucun
appelant de production ne change), et les quatre appels internes passent par lui. Les
fixtures dérivent leur semaine d'une date de référence fixe. Le module est maintenant
vraiment une fonction pure de ses entrées.

J'ai préféré ça à `isoWeekKey(new Date())` dans la fixture (ton autre option) : cette
variante-là reste fausse l'espace de quelques millisecondes par semaine, au passage du
dimanche au lundi, et surtout elle laisse la dépendance à l'horloge dans le code de
production.

### Inventaire des autres fixtures à date figée (tu le demandais, il était annoncé non fait)

Fait, **et sans suite** — c'était la seule occurrence dangereuse :

| Fichier | Verdict |
|---|---|
| `ludicStateWrites.test.ts` | injecte déjà son `NOW` — c'est le bon motif, il existait déjà dans le dépôt |
| `missionGridStyle.test.ts` | `isoWeek` présent dans la fixture mais **jamais lu** par le code testé |
| `weeklyMissions.test.ts` (`baseState`) | idem : `applyValidationToWeeklyMissions` ne lit pas `isoWeek` |
| `weeklyGoal.test.ts` | `new Date()` sur des validations dont la date n'entre dans aucun calcul |

Vérifié dans le code, pas supposé : `isoWeek` n'est lu que par `resolveWeeklyMissionsState`
(qui reçoit son horloge) et `mergeWeeklyMissionsForDisplay` (qui compare deux états, sans
horloge).

## Étape 2 (ton §1.2) — ✅ V2.71.3 poussée et déployée

Question posée à l'utilisateur, qui a choisi **« pousser et déployer »**. Fait :
`3097277` sur `main`, `firebase deploy --only hosting` réussi, **la prod est en V2.71.3**.
La purge pourra donc commiter son journal normalement, sans emporter autre chose.

**Au passage, le `git push` a été rejeté** : les crons mensuels du 1ᵉʳ octobre avaient
poussé entre-temps (`b24cbd7` images orphelines, `3ee41ad` réconciliation). Rebase propre,
aucun conflit — mais voir le §6 ci-dessous, ce que ce journal contient mérite un œil.

## Étape 3 (ton §2) — ✅ Aucun lecteur ne se replie sur `users`

C'était l'étape qui pouvait tout arrêter. Elle passe. `grep` des quatre champs dans
`frontend/src/`, `scripts/`, `frontend/test/` et `firestore.rules`.

Les deux seuls endroits qui mélangent un document `users` et l'état ludique sont sains :

- **`ClientScreen.tsx:139`** — `setUserData({ ...data, weeklyGoalItems: ludicState.weeklyGoalItems })`.
  Le spread ramène bien `users.weeklyGoalItems`, mais il est **écrasé inconditionnellement**
  par la valeur ludique, y compris quand celle-ci est `undefined`. Le `??` qui suit tombe
  donc sur `legacyGoalToItems(weeklyGoalTarget)`, jamais sur la copie `users`.
- **`ClientDaily.tsx:349-352`** — `setSelfProfile({...})` est un objet **explicite**, sans
  spread : les quatre champs viennent tous de `ludicState`. Seul `level` vient de `users`,
  ce qui est correct (champ d'identité, hors purge).

`services/ludicState.ts` ne connaît que `user_ludic_state` (vérifié, aucun `users`).
Aucun script hors `backfill`/`purge` ne touche ces champs.

**Deux commentaires périmés corrigés au passage** : `roulette.ts` et
`firestoreTransaction.ts` désignaient encore `users/{uid}.wallCounts`. Aucun code concerné,
mais c'est exactement l'indication qui égare la prochaine lecture — et on venait d'en
documenter une autre, transportée sept fois.

## Étape 4 (ton §3.1) — ✅ Sauvegarde faite avant toute suppression

`firestore-migration/dump-ludic-legacy.js` (lecture seule, refuse de tourner si
`FIRESTORE_EMULATOR_HOST` est défini). **16 comptes, 6 468 octets**, dans
`firestore-migration/` — dossier **entièrement gitignoré**, vérifié par `git check-ignore`.

Le dump enregistre, pour chaque compte, les champs présents sur `users`, ceux présents dans
`user_ludic_state`, et **ceux présents sur `users` mais absents de `user_ludic_state`** —
c'est cette troisième liste qui a révélé le problème ci-dessous.

---

## 🔴 §4 — Le garde-fou s'est déclenché, et ton remède l'aurait aggravé

### Ce que donne la simulation (prod, aujourd'hui)

```
Comptes portant au moins un champ legacy : 16          (17/09 : 16  → inchangé ✅)
Champs signalés comme non migrés          : 1          (17/09 :  0  → NOUVEAU 🔴)

⚠️  5erGHVpDAnbEzkypzOxKSt1VKo53.weeklyGoalItems : absent de user_ludic_state, PAS supprimé
```

Le nombre de candidats est **identique** au 17/09 : rien n'écrit plus sur `users`, ton §1.3
est satisfait. Mais le compteur « jamais migré » est passé de 0 à 1, et ton §3.3 dit que
tout champ dans cet état arrête l'opération. Il a arrêté l'opération.

J'ai vérifié le chiffre du 17/09 **à la source** (`HANDOFF-ludic-state-backfill-simulation-2026-09-17.md`
lignes 37-39) plutôt que sur la foi de ton plan : c'est bien **0**.

### Ce que c'est réellement

Le compte est **celui de l'utilisateur** (Stéphane, niveau noir). Lecture directe :

| | valeur |
|---|---|
| `users.weeklyGoalItems` | 2 objectifs `type:'boulder'` (« rouge n°4 - Dévers 15° », « rouge n°10 - Dévers 15° ») |
| `user_ludic_state` | **existe**, `updated_at` au 01/10/2026, porte les 6 autres champs ludiques |
| `user_ludic_state.weeklyGoalItems` | **absent** |

Le document ludique existe, il est actif, et il lui manque **ce seul champ**. Combiné au 0
du 17/09, la conclusion est forcée : **le champ était présent dans `user_ludic_state` le
17/09 et en a été supprimé depuis.**

Par quoi ? Par l'application elle-même. `ClientScreen.tsx` appelle
`updateLudicState(uid, { weeklyGoalItems: deleteField() })` à **deux endroits** :
`handleRemoveAllGoals` (« supprimer mes objectifs ») et `handleSaveGoal` quand la liste est
enregistrée vide. L'utilisateur a retiré ses objectifs de la semaine, le champ a disparu de
`user_ludic_state` — et la copie figée sur `users`, que plus personne n'écrit depuis la
passe C, est restée.

**Ce n'est donc pas « jamais migré ». C'est « supprimé en aval ».** Le script ne peut pas
faire la différence : il n'y a pas de pierre tombale, une suppression et une absence ont
exactement la même tête.

### 🔴 Pourquoi la marche à suivre documentée est maintenant fausse

`CLAUDE.md` et le message d'avertissement du script disent tous les deux la même chose :
*relancer `backfill-ludic-state.js --fix` d'abord*, décrit comme **« now safe to rerun at
any time, by construction »**.

**Ici, ce serait l'erreur.** Vérifié dans le code du script (`backfill-ludic-state.js`,
branche `if (existingData[field] === undefined)`), pas déduit de la documentation :

```js
if (existingData[field] === undefined) {
  toFill[field] = ludicFields[field];   // ← recopie users → user_ludic_state
}
```

Le backfill **ressusciterait les deux objectifs que l'utilisateur vient de supprimer**.

Le durcissement du 17/09 protégeait contre l'écrasement d'une valeur **plus récente** ; il
ne protège pas contre le **remplissage d'un champ délibérément vidé**, parce que ce cas
n'existait pas encore quand il a été écrit. L'affirmation « safe to rerun at any time, by
construction » de `CLAUDE.md` est donc fausse depuis que l'application sait supprimer un
champ ludique — et `weeklyGoalItems` est **le seul des quatre** dans ce cas :
`wallCounts`, `rouletteChallengesCompleted` et `rouletteRecentChallenges` ne sont
qu'incrémentés ou complétés, jamais supprimés.

### Ce que ça implique pour la suite

La valeur à conserver est **l'absence**, pas la copie. Le champ sur `users` est un déchet
figé d'avant le 12/09 ; `user_ludic_state` dit la vérité. Il faut donc **le supprimer**, ce
que le garde-fou du script refuse par construction — et c'est un refus correct en général,
simplement inadapté à ce cas précis.

La sauvegarde du §3.1 est déjà prise et contient la valeur, donc l'opération est réversible
en pratique. Mais elle demande une dérogation explicite au garde-fou, et c'est une décision
humaine : **question posée à l'utilisateur, exécution en attente de sa réponse.**

---

## §4 bis — Ordre de reprise arrêté le 02/10 au soir (décision : on ne purge pas ce soir)

Raison, et ce n'est pas une réserve sur l'exécution : **asymétrie**. La purge supprime
définitivement des champs sur seize comptes, elle attend depuis le 17/09 (un jour de plus ne
coûte rien), et il est 21h après deux heures de diagnostic — le moment exact de la faute
d'inattention, sur la seule opération de la soirée qui ne se rejoue pas.

Il manque surtout l'étape proposée l'après-midi et jamais faite : **la répétition sur un
compte de test**. Elle a une valeur réelle ici, parce que **la simulation n'a jamais exercé le
chemin d'ÉCRITURE** — seulement la lecture et la comparaison.

Ordre de reprise, dans cet ordre exact :

1. Ajouter un drapeau **`--uid`** à `purge-legacy-ludic-fields.js` (il ne l'a pas) — donc du
   code, à écrire à tête reposée.
2. Purger **un seul compte de test**, en production.
3. Vérifier : les quatre champs ont disparu de `users`, `user_ludic_state` est **intact**.
4. **Ouvrir l'application sur ce compte** (objectif de la semaine, compteurs de murs, compteur
   Roulette, grille de missions).
5. Seulement ensuite, les seize comptes.
6. **La mesure du poids de la requête `users` dans `AdminUsers.tsx`** (§4 du plan) — l'utilisateur
   seul peut la faire, et sans elle le chantier n'est pas terminé.
7. Traiter la dérogation du §4 ci-dessus pour `weeklyGoalItems`, **sans jamais relancer le
   backfill** (voir `CLAUDE.md`, corrigé le 02/10 : l'affirmation « safe to rerun at any time »
   était fausse et aurait rendu à l'utilisateur des objectifs qu'il avait supprimés).

Compter environ quarante-cinq minutes, salle calme.

## §5 — Ce qui reste à faire (ton §7, étapes 5 à 9)

- [ ] Dérogation pour `5erGHVpD….weeklyGoalItems`, puis `--fix`.
- [ ] Simulation de contrôle : doit retomber à **0 candidat**.
- [ ] Contrôle fonctionnel sur un compte de test (ton §3.4).
- [ ] **Mesure du poids de la requête `users` dans `AdminUsers.tsx`** (ton §4) — sans elle
      le chantier n'est pas terminé. Ne peut être faite que par l'utilisateur, dans son
      navigateur, connecté en admin.
- [ ] Marquer `backfill-ludic-state.js` obsolète, retirer son garde-fou de `CLAUDE.md`
      (ton §5) — **et y ajouter la nuance du §4 ci-dessus**, qui est plus importante que le
      retrait : tant que la purge n'est pas passée, ce script est *plus* dangereux que ce
      que `CLAUDE.md` affirme, pas moins.
- [ ] Vérifier `firestore.rules` : rien à changer a priori (les quatre champs n'ont jamais
      été des clés verrouillées), mais ce n'est pas encore contrôlé.

## §6 — 🟠 Hors plan, mais à ne pas laisser passer : la réconciliation du 1ᵉʳ octobre

Découvert en rebasant sur les commits des crons mensuels. Le run du 01/10 a corrigé
**4 comptes**, et les écarts vont **dans les deux sens** :

| compte | score | blocs | couleurs |
|---|---|---|---|
| `4Urs3bj8` | 4770 → 825 (**−3945**) | 46 → 6 | jaune 8→1, vert 14→2, bleu 13→1, violet 9→1, rouge 2→1 |
| `5erGHVpD` | 3345 → 5070 (**+1725**) | 23 → 33 | vert 4→5, jaune 3→4, bleu 7→9, violet 4→7, rouge 5→8 |
| `7SvZhyuX` | 4910 → 4360 (−550) | 65 → 43 | jaune 30→8 |
| `nP1TFARq` | 6835 → 4915 (−1920) | 31 → 26 | rouge 12→7 |

Le garde-fou de dérive n'a pas sauté (4 comptes, sous les 30 %), et il a eu raison de ne pas
sauter. Mais :

- **un compte a GAGNÉ 1725 points** : le compteur incrémental était *en retard* sur la
  réalité, donc des écritures de flush ne sont pas parties. C'est le symptôme que la file
  débounce perd des écritures, pas une dérive de barème.
- **`4Urs3bj8` passe de 46 blocs à 6.** C'est énorme, et ça ne ressemble pas à une dérive
  ordinaire.
- `5erGHVpD` est **le même compte** que celui du §4. Compte très actif, donc le plus exposé
  aux deux phénomènes — mais la coïncidence mérite d'être notée plutôt qu'écartée.

Je n'ai **pas** investigué : c'est hors du périmètre que l'utilisateur m'a donné, et la
réconciliation a fait son travail (correction par construction). Mais 4 comptes dérivés en
un mois, dans les deux sens, sur une trentaine de profils, ça ne se range pas sous « bruit
de fond ». À arbitrer : est-ce que ça mérite son propre chantier ?
