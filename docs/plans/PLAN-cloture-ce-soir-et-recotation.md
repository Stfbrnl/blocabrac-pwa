# Plan de clôture du 02/10 au soir, et la question de la recotation d'un bloc

> Rédigé le 02/10/2026 à 20h25.
>
> **§1 : ce qu'il faut faire ce soir — et ce qu'il ne faut PAS déployer ce soir.**
> **§2 : recoter un bloc bleu en violet — impact, risques, et la bonne fenêtre pour le faire.**

---

## §1 — Clôture du dossier « flush bloqué »

### 1.0 — Où on en est

| | |
|---|---|
| Règles corrigées et **déployées** | ✅ fait, 20h15 |
| Vérification en direct | ✅ fait, console muette, +1 bloc / +170 points |
| V2.71.4 (code) | ✅ écrite, 320/320, 149/149, 3 e2e verts, build fait |
| V2.71.4 **déployée** | ❌ non — **et c'est volontaire, voir §1.3** |
| Points perdus restitués | ❌ non — c'est l'étape 1 ci-dessous |

### 1.1 — Réconciliation : restituer les points (≈ 15 min)

C'est désormais sans risque : la cause est traitée, les points restitués ne re-dériveront pas.

1. **Simulation d'abord**, sur la prod. L'écart attendu sur le compte de l'utilisateur est
   **exactement** :

   | | stocké | attendu |
   |---|---|---|
   | score | 5665 | **5865** |
   | blocs validés | 37 | **38** |
   | `colorCounts.violet` | 8 | **9** |

   ⚠️ **Si l'écart est différent de celui-là, s'arrêter et le signaler.** Ce chiffre a été
   prédit avant d'être mesuré ; s'il ne tombe pas juste, c'est qu'il reste autre chose.

2. **Regarder aussi les autres comptes.** Les trois du 1ᵉʳ octobre (`4Urs3bj8`, `7SvZhyuX`,
   `nP1TFARq`) ne devraient **pas** avoir re-dérivé — le handoff l'a vérifié il y a deux
   heures. Si l'un d'eux réapparaît, c'est une information importante sur l'énigme des
   46 blocs → 6, à consigner avant de corriger.

3. **`--fix`**, puis journal commité, comme le fait le workflow mensuel.

4. **Relire le score dans l'application** : 5865 / 38. Boucle fermée, et l'utilisateur
   récupère son violet.

### 1.2 — Documentation (≈ 15 min)

Quatre lignes à inscrire, toutes issues de cette soirée :

1. **Dans `CLAUDE.md`, l'acquis principal** — formulation de Claude Code, à garder telle
   quelle :
   > *Une escalade qui ne compte que les échecs consécutifs ne peut pas se déclencher sur un
   > échec sélectif.*

2. **Simulations** :
   > *Une simulation n'écrit rien, nulle part.* (Le garde-fou actuel ne couvre que le cas
   > émulateur ; une simulation lancée sur la prod depuis un poste a réécrit le journal du
   > cron du 1ᵉʳ octobre.)

3. **Comptes de test** :
   > *Ils servent à **répéter** un geste destructif en production avant de l'appliquer à tous,
   > jamais à **détecter** un défaut : ils sont jeunes et propres, et les défauts de ce projet
   > naissent de l'état accumulé. Pour détecter, l'instrument est l'audit de production — en
   > particulier l'audit des **références mortes**.*

4. **Conventions e2e, Windows** : `set "VAR=valeur"` et non `set VAR=valeur &&`, qui injecte
   une espace et fait pointer l'application sur la **production**.

### 1.3 — ⚠️ Ne pas déployer V2.71.4 ce soir

Je sais que l'objectif est de boucler, mais c'est le mauvais moment, pour trois raisons qui se
cumulent :

- **L'urgence a disparu.** Les règles ont arrêté l'hémorragie à 20h15, vérifié en direct.
  V2.71.4 est de la défense en profondeur, pas le remède.
- **Elle réécrit le chemin d'écriture de tous les grimpeurs.** Elle découpe la transaction
  partagée en deux — c'est-à-dire exactement le code qui a cassé en V2.46 et en V2.68. Les
  e2e sont verts, mais **rien n'a été vu sur un vrai appareil**, et le hook débouchée modifié
  est le seul changement du lot **sans couverture automatisée** (le handoff le signale
  lui-même comme son point faible).
- **Vendredi soir, la salle est ouverte.** Un défaut de ce lot serait rencontré par des
  grimpeurs avant de l'être par toi — et c'est précisément ce scénario qui a produit les deux
  derniers incidents.

**À faire ce soir quand même** : commiter et **pousser** V2.71.4 sur `main` sans déployer, pour
que le travail ne soit pas perdu et que l'arbre soit propre. Le déploiement demain matin, salle
calme, avec une vérification sur téléphone.

### 1.4 — La purge reste suspendue

Elle attend deux choses qui ne se font pas à 21h après cette soirée : la dérogation ciblée, et
la **répétition sur un compte de test** recommandée cet après-midi. Un geste destructif en fin
de soirée, c'est la définition du moment où l'on se trompe. Elle n'a pas bougé depuis le
17/09, elle attendra lundi.

### 1.5 — Points ouverts à inscrire avant de fermer

- **Étendre `audit-prod-catalog.js` aux références mortes** (défi actif → `challenges`,
  `client_boulder_results.boulderId` → `boulders`). C'est la vraie suite : ça ferme la classe
  **et** ça répond à l'énigme des 46 blocs → 6.
- **Filet de réconciliation pour `challenges.progress`**, maintenant compteur incrémental sans
  net et avec un chemin d'échec silencieux assumé.
- V2.71.4 à déployer, puis vérification sur téléphone (liste accumulée depuis le 25/09).
- Fenêtre de saison 2026-11-01 → 2027-05-31 à enregistrer **avec « Enregistrer »**.

---

## §2 — Recoter un bloc bleu en violet

### 2.1 — Ce qui se passe, mécaniquement

`client_boulder_results` **ne stocke pas la couleur**. Il stocke `boulderId`. La couleur est
lue sur `boulders/{id}` **au moment du calcul**.

Conséquence directe : **changer la couleur réécrit rétroactivement l'histoire de tous ceux qui
ont déjà validé ce bloc.**

| | effet |
|---|---|
| compteur incrémental (`classement_profiles.score`) | **inchangé** — il garde la valeur calculée au moment de la validation, en bleu |
| réconciliation | recalcule **avec la couleur actuelle** → violet |
| → résultat | **tous les grimpeurs ayant validé ce bloc voient leur score monter** au prochain passage |
| `colorCounts` | un bleu se déplace en violet, pour chacun d'eux |

### 2.2 — Les trois risques, par ordre d'importance

**1. Le niveau de certains grimpeurs peut monter tout seul.** C'est le risque sérieux. Un
grimpeur dont le meilleur bloc validé était bleu se retrouve avec un violet à son actif → le
badge automatique « violet » s'attribue → et depuis V2.54, les badges pilotent `users.level`.
Son niveau peut donc **monter sans qu'il ait grimpé quoi que ce soit de nouveau**.

Et le niveau n'est pas décoratif : il pilote les missions hebdomadaires (M1, M3, M4, dont le
niveau est figé le lundi), la roulette, et les badges. **À vérifier en simulation avant de
décider.**

**2. Le garde-fou de dérive de la réconciliation va probablement se déclencher.** Si dix
grimpeurs ont validé ce bloc sur une trentaine de profils, on dépasse les 30 % et la passe
s'arrête. **Ce serait le garde-fou fonctionnant correctement**, pas un incident — mais il
faudra `--force` **en connaissance de cause**, après avoir vérifié que la dérive est
exactement celle attendue et rien d'autre.

**3. Un score qui change sans explication abîme la confiance dans le classement.** Plus que le
bug de ce soir, qui était invisible. Là, des grimpeurs verront leurs points bouger du jour au
lendemain.

### 2.3 — Ce que je recommande

**Modifier la couleur sur le bloc existant**, pas créer un nouveau bloc.

La raison est de fond : une recotation n'est pas un changement, c'est **la correction d'une
erreur**. Le gérant dit que ce bloc *est* violet et l'a toujours été. Ceux qui l'ont validé ont
donc bien grimpé un violet, et la hausse de leurs points est juste. Créer un bloc neuf
figerait au contraire une cotation reconnue fausse.

**Et le faire maintenant, pas après le 1ᵉʳ novembre.** C'est le point de calendrier : une fois
la saison ouverte, une recotation déplacerait aussi les scores **de la saison en cours**, en
plus du classement général. Aujourd'hui, la saison n'existe pas encore — la fenêtre est propre.

**Marche à suivre** :

1. **Avant de toucher au bloc** : relever combien de grimpeurs l'ont validé, et lesquels
   verraient leur `bestColorRank` ou leur niveau changer. Lecture seule.
2. Changer la couleur dans l'écran ouvreur.
3. **Réconciliation en simulation** : la dérive doit porter **exactement** sur ces
   grimpeurs-là, et sur personne d'autre. Toute surprise arrête l'opération.
4. `--fix` (avec `--force` si le garde-fou saute, et seulement après le point 3).
5. **Prévenir les grimpeurs** — c'est la partie qu'on oublie et qui compte le plus. Une ligne
   de changelog suffit : *« le bloc X a été recoté en violet ; les points de celles et ceux qui
   l'avaient déjà validé ont été ajustés en conséquence. »* Le panneau « Quoi de neuf » est
   enfin lisible sur mobile depuis V2.70.1 et empile les entrées depuis V2.71.2 : il fera le
   travail.

### 2.4 — Et une règle générale à inscrire

> **Recoter un bloc déjà validé réécrit rétroactivement le score de tous ceux qui l'ont
> validé**, parce que `client_boulder_results` ne stocke pas la couleur. Une recotation est
> donc une opération de classement, pas une simple modification de fiche : elle se fait en
> dehors d'une saison en cours, suivie d'une réconciliation vérifiée, et annoncée aux
> grimpeurs.
