# Plan — Sortir l'état ludique du document `users`

> Rédigé le 06/09/2026 par la session Claude (navigateur), à la demande de l'utilisateur.
> À destination de Claude Code dans le Codespace.
>
> **Objectif** : `users/{uid}` cesse de porter l'état ludique par utilisateur, transporté
> aujourd'hui à chaque `getDocs(collection('users'))` des écrans staff.
>
> **Contrainte inchangée** : gratuité totale, plan Spark, pas de Cloud Functions. Ce
> chantier ne consomme aucun quota supplémentaire — il en libère.
>
> **Statut : non urgent, mais à faire maintenant plutôt que plus tard.** 28 comptes
> aujourd'hui contre 12 il y a trois semaines. Le coût du chantier croît avec le nombre de
> comptes ; le bénéfice aussi.

---

## §0 — Le problème, en une phrase

**Le SDK client Firestore ne permet aucune projection de champs.** Tout ce qui vit dans
`users/{uid}` est transporté à chaque lecture de ce document — et sept écrans staff font un
`getDocs(collection('users'))` **sans filtre**, chargeant l'état ludique complet de tous les
comptes pour n'afficher qu'un nom et un rôle.

C'est exactement la contrainte qui avait imposé de sortir les images base64 de `boulders`
(chantier 2 de `PLAN-spark-images-competition.md`). La conclusion est la même :
**déplacer les données, pas optimiser la requête** — il n'y a rien à optimiser.

### Champs concernés

- `weeklyGoalItems`
- `wallCounts`
- `rouletteChallengesCompleted`
- `rouletteRecentChallenges` ← **le plus lourd** : 10 objets portant chacun un libellé
  résolu complet

### Écrans staff impactés (à recenser à nouveau, la liste date du 14/08)

`CompetitionStats.tsx`, `AdminCompetitionStats.tsx`, `AdminCompetitionRegistration.tsx`,
`AdminUsers.tsx` (×4 occurrences), `BoulderStats.tsx`, `CompetitionBoulderStats.tsx`.

---

## §1 — Chantier 0 : mesurer (15 minutes, sans code)

Comme pour le chantier images, mesurer avant et après plutôt que de se fier à une
estimation.

1. Navigateur, cache vidé, onglet Réseau ouvert. Ouvrir `AdminUsers.tsx` en production.
   Relever le **volume transféré** par la requête `users`.
2. Console Firebase → Firestore → Données : ouvrir le document `users` du compte le plus
   actif, relever sa taille réelle et la part occupée par les quatre champs ci-dessus.
3. Consigner les deux valeurs en tête de ce fichier.

Refaire la mesure 1 après le chantier. **Gain attendu : la part des quatre champs,
multipliée par 28 comptes.** Si la mesure montre que c'est marginal (< 10 % du transfert),
le chantier reste justifié pour le multi-salles mais descend en priorité.

---

## §2 — La cible

### Collection `user_ludic_state/{uid}`

Même identifiant que le compte. Un document par grimpeur, **lu uniquement par lui-même**.

| Champ | Origine |
|---|---|
| `weeklyGoalItems` | `users.weeklyGoalItems` |
| `wallCounts` | `users.wallCounts` |
| `rouletteChallengesCompleted` | `users.rouletteChallengesCompleted` |
| `rouletteRecentChallenges` | `users.rouletteRecentChallenges` |
| `updated_at` | nouveau, ISO |

### Pourquoi une collection racine et pas une sous-collection

`users/{uid}/state/ludic` est tentant — la parenté est explicite. **À écarter** : une
sous-collection n'est pas récupérée avec son parent, donc elle n'apporte rien de plus
qu'une collection racine, et elle complique les règles, les scripts d'administration et les
requêtes de maintenance.

`user_ludic_state/{uid}` avec le même identifiant est plus simple, et le lien est tout
aussi évident.

### Pourquoi pas hors de Firestore

L'analogie avec `boulders` s'arrête là. Une image est un binaire lourd, servi par HTTP, mis
en cache par le navigateur, jamais interrogé par une requête — d'où Cloudinary. L'état
ludique est fait de petites données structurées, lues et écrites par l'application, dans
des transactions Firestore avec le reste. **Le sortir de Firestore serait absurde.**

### Règles Firestore — un durcissement au passage

Aujourd'hui, `users` est lisible par le staff, donc l'état ludique aussi. Sur la nouvelle
collection :

```
match /user_ludic_state/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

Lecture **et** écriture réservées au propriétaire. Le staff n'y a pas accès, et n'en a pas
besoin.

⚠️ **À vérifier avant d'écrire cette règle** : un écran staff lit-il aujourd'hui l'un des
quatre champs ? Le recensement du §0 doit le confirmer. Si oui, la règle doit rester ouverte
au staff en lecture — mais ce serait surprenant, ces champs n'existent que pour le grimpeur.

---

## §3 — Le module d'indirection (le point qui compte le plus)

**Enseignement direct du chantier images** : `imageStorage.ts` est le seul fichier qui
connaît Cloudinary. L'application ignore où vivent les images, et un changement de
fournisseur ne toucherait qu'un fichier.

Créer `frontend/src/services/ludicState.ts`, **seul point du code connaissant l'emplacement
de ces données** :

- `getLudicState(uid): Promise<LudicState>` — lecture cache-first
  (`getDocsCacheFirst` / équivalent document), repli serveur.
- `updateLudicState(uid, partial): Promise<void>` — écriture par chemins pointés.
- `incrementRouletteCompleted(uid, entry)` — cas particulier du compteur + liste plafonnée
  à 10, aujourd'hui dans `ClientDaily.tsx`.

**Aucun écran ne doit importer directement la collection.** C'est ce qui rendra un futur
déplacement trivial, exactement comme pour les images.

Y placer aussi la transaction : `wallCounts` est aujourd'hui mis à jour dans
`flushClassementWrite`, la transaction partagée avec `classement_profiles`.

⚠️ **Point d'attention majeur — la règle des lectures avant écritures.** Déplacer
`wallCounts` dans une autre collection ajoute une référence à cette transaction. C'est
exactement la situation qui avait produit le bug de V2.46 (lecture après écriture, erreur
avalée, compteur mort pendant un jour).

Le helper a été restructuré depuis (V2.48) pour prendre une liste de références puis une
fonction pure : **ajouter `user_ludic_state/{uid}` à la liste des références, jamais un
`get()` inline**. La signature impose l'ordre — il suffit de ne pas la contourner.

---

## §4 — Migration en deux passes (modèle du chantier images)

### Passe A — écrire aux deux endroits, lire le nouveau avec repli

1. `ludicState.ts` écrit dans `user_ludic_state` **et** dans `users` (double écriture).
2. Les écrans lisent via `ludicState.ts`, qui lit `user_ludic_state` avec **repli sur
   `users`** si le document n'existe pas encore.
3. Déployer. Aucun changement de comportement, entièrement réversible.

### Passe B — backfill

Script dans `scripts/` (**suivi par git** — leçon de la GitHub Action ratée), dry-run par
défaut, `--fix` pour appliquer :

- pour chaque document `users` portant l'un des quatre champs, créer
  `user_ludic_state/{uid}` avec ces valeurs ;
- idempotent, relançable, journalisé.

Vérifier ensuite en production que les écrans client affichent les mêmes valeurs qu'avant.

### Passe C — retirer de `users`

1. `ludicState.ts` cesse d'écrire dans `users`, le repli en lecture est retiré.
2. Script de nettoyage : `deleteField()` sur les quatre champs de tous les documents
   `users`. Dry-run par défaut.
3. Déployer, puis refaire la mesure du §1.

### Une différence assumée avec le chantier images

**Les précautions peuvent être plus légères.** Ces données sont **régénérables** :
`wallCounts` se recompute depuis l'historique, `rouletteRecentChallenges` n'est qu'un
affichage, le compteur de défis relevés est purement déclaratif.

Une image perdue était irremplaçable ; ici, le pire cas est un compteur de murs à refaire.
Ne pas surdimensionner les garde-fous — mais garder le découpage en trois passes, qui est
ce qui rend le chantier réversible.

---

## §5 — Ce qu'il faut vérifier avant de commencer

Trois points, dans cet ordre :

1. **Recensement exhaustif des lecteurs.** `grep` sur les quatre noms de champs, dans tout
   `frontend/src` **et** dans `scripts/` et `firestore-migration/`. Un script d'audit ou de
   réconciliation qui lirait `users.wallCounts` casserait silencieusement.
2. **`wallCounts` dans la transaction de flush.** Confirmer que le helper V2.48 permet bien
   d'ajouter une référence d'une autre collection sans réécriture — c'est le point le plus
   technique du chantier.
3. **Aucun écran staff ne lit ces champs.** Si l'un le fait, la règle du §2 doit être
   adaptée avant, pas après.

---

## §6 — Découpage et ordre

| Étape | Contenu | Risque |
|---|---|---|
| 1 | §1 mesure + §5 vérifications | nul |
| 2 | `ludicState.ts` + règles + passe A (double écriture) | faible, réversible |
| 3 | Passe B (backfill) | faible, régénérable |
| 4 | Vérification en production | — |
| 5 | Passe C (retrait de `users`) + mesure finale | **point de non-retour** |

Les étapes 1 à 4 ne changent aucun comportement. **Le point de non-retour est l'étape 5** —
même découpage que pour le compteur incrémental et pour `dateOfBirth`, pour la même raison :
vérifier le nouvel emplacement avant de supprimer l'ancien.

**Livrable minimal utile** : les étapes 1 et 2 suffisent à borner le problème, puisque tout
nouvel état par utilisateur ira désormais dans la nouvelle collection. Même si les étapes 3
à 5 attendent, `users` cesse de grossir.

---

## §7 — Mesure de contrôle et critère de sortie

- **Avant** : volume transféré par la requête `users` sur `AdminUsers.tsx` (§1).
- **Après** : même mesure.
- **Critère** : la part des quatre champs disparaît du transfert. À 28 comptes le gain
  absolu sera modeste ; ce qui compte est que **le transfert cesse de croître avec l'état
  ludique** — il ne dépend plus que du nombre de comptes et des champs d'identité.

Consigner les deux valeurs dans `PLAN-spark-images-competition.md`, à côté des autres
mesures de transfert.

---

## §8 — Règle à inscrire dans `CLAUDE.md`

Au-delà du chantier lui-même, c'est la règle qui empêche le problème de revenir :

> **`users/{uid}` est lu en entier par les écrans staff** (`getDocs(collection('users'))`
> non filtré), et le SDK client ne permet aucune projection de champs. N'y placer que ce
> qui relève de l'identité et des droits : nom, rôle, niveau, date de naissance,
> inscriptions. **Tout état par utilisateur — compteurs, préférences, historiques
> d'affichage — va dans `user_ludic_state/{uid}`**, lu uniquement par son propriétaire.

La note actuelle (« le jour où ça pèse, doc séparé ») devient obsolète et doit être
remplacée par celle-ci.

---

## Points ouverts par ailleurs (inchangés)

- **Clic « Redémarrer la saison »** ~mi-septembre, après vérification du nombre de profils.
- **Surveiller le profil recalé de −190** au prochain passage mensuel de la réconciliation :
  une seconde dérive sur le même compte indiquerait un chemin d'écriture défaillant plutôt
  qu'un incident isolé.
- Défis `fenetre` / `bloc_designe` : en production sans e2e navigateur.
- Chantier droits d'accès — en attente du gérant.
  `CONCEPTION-droits-acces-abonnements.md` toujours pas transmis au dépôt.
- `topo-blocabrac.pdf` sans la police Dosis ; `aide-connexion-installation.html` hors charte.
- Un projet Firebase par salle vs mutualisé — **ce chantier en est un prérequis de
  confort** : c'est en multi-salles que le transport inutile deviendrait coûteux, chez un
  client plutôt que chez toi.
- Sauvegarde durable des images Cloudinary (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout script destiné à la CI doit vivre dans un chemin suivi par git.
- Tout compteur incrémental doit avoir une assertion e2e sur sa valeur résultante
  (`PROCESSUS-erreurs-avalees.md` §4) — `wallCounts` et `rouletteChallengesCompleted` en ont
  une, **elles doivent continuer à passer après le déplacement**.
