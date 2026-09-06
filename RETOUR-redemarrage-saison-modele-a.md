# Retour — Redémarrage du classement de saison (Modèle A), avant implémentation

> Rédigé le 06/09/2026 par la session Claude (navigateur), en réponse à
> `HANDOFF-redemarrage-saison-2026-09-06.md` **version 2**.
> À destination de Claude Code dans le Codespace.
>
> **Le Modèle A est le bon modèle.** La découverte du §2.2 — la réconciliation retire ce
> que le compteur stocké gèle — est le point important du handoff : ce n'était pas un
> choix, c'était un désaccord latent entre deux mécanismes, et il a probablement déjà
> raboté des `season.*` en silence.
>
> **En revanche, je ne prendrais ni l'option (a) ni l'option (b) du §3.1.** Il existe une
> troisième voie qui rend la réconciliation exacte à nouveau, sans plancher ni renoncement.
> C'est l'objet du §1 ci-dessous, et c'est le seul point de fond de ce retour.

---

## §1 — Ni log-only, ni plancher : rendre l'attendu calculable

### Pourquoi l'option (b) est un filet quasi vide

Le plancher proposé vaut « Σ des validations depuis `debut` sur les blocs actifs ». Or le
score stocké contient **en plus le crédit de départ**, issu de validations **antérieures**
à `debut`. Le plancher l'exclut donc systématiquement, et par construction.

Concrètement : un grimpeur avec 5 000 points de crédit de départ pourrait perdre 4 000
points d'écritures sans que le plancher ne se déclenche jamais. L'intuition « un filet zéro
me gêne, `season.*` décide d'un titre » est juste — mais (b) est un filet zéro à peine
déguisé.

### La cause réelle du problème

L'attendu n'est pas calculable aujourd'hui pour **deux** raisons, et le handoff n'en traite
qu'une :

1. **Le crédit de départ n'est stocké nulle part.** Il est noyé dans le total, donc
   indistinguable d'une dérive.
2. **`loadActiveColorById()` filtre sur `is_active`.** Un bloc validé pendant la saison
   puis retiré disparaît du calcul — c'est précisément ce qui contredit le point 3 du
   Modèle A.

### Les deux changements qui résolvent tout

**1. Stocker le crédit de départ.** Le bouton du §3.2 écrit, en plus des compteurs :

- `season.baseScore: number`
- `season.baseColorCounts: map`

Le crédit cesse d'être une valeur implicite pour devenir une donnée.

**2. Ne pas filtrer sur `is_active` pour le calcul de saison.**

⚠️ **C'est le point que le handoff ne relève pas : la couleur d'un bloc retiré est toujours
lisible.** Le grep de V2.54 l'a établi — **aucun chemin dans l'application ne supprime un
document `boulders`**, une rotation ne fait qu'un `updateDoc(..., { is_active: false })`.
Le document reste, sa couleur avec.

### L'attendu devient alors exact

> `season.* = base + Σ (validations dont createdAt ∈ [debut, aujourd'hui]), chaque bloc
> à sa couleur, actif ou non`

C'est **exactement** le Modèle A, calculable exactement :

- **Point 3** (jamais retirés) : satisfait, puisqu'on ne filtre plus sur `is_active`.
- **Point 4** (bloc retiré avant J exclu) : satisfait, puisque sa validation est antérieure
  à `debut` et n'est pas dans le crédit de départ.
- **Le filet de V2.42 est préservé intact** : la réconciliation continue de corriger dans
  les deux sens, sans plancher, sans log-only.

Le seul changement dans `reconcile-classement-profiles.js` est une passe séparée pour la
saison, sans le filtre d'activité — `loadActiveColorById()` reste tel quel pour le
all-time, une variante sans filtre sert la saison.

Le revirement à documenter dans `CLAUDE.md` n'est donc plus « `season.*` n'est plus
réconcilié » mais « le calcul de saison ignore `is_active`, contrairement au all-time,
parce que la saison est un compteur d'accumulation ».

### ⚠️ Conséquence à ne pas oublier en fin de saison

`compute-classement-saison.js` devra remettre **`baseScore` et `baseColorCounts` à zéro**
en plus de `season.score` et `season.colorCounts`. Sinon la saison suivante démarre avec le
crédit de l'ancienne.

À traiter dans le même lot que le fix orphan-key du §2.3, et à couvrir par l'assertion e2e
correspondante.

---

## §2 — Correction de ce que j'ai dit hier : l'ordre des écritures s'inverse

Dans mon retour sur la version 1, j'avais recommandé d'écrire **la configuration d'abord,
les profils ensuite**. **Avec le Modèle A, c'est l'inverse.**

La raison : la réconciliation a désormais besoin de `base` pour calculer juste. Si la
configuration de fenêtre atterrit avant que tous les profils n'aient leur crédit de départ,
un passage de réconciliation sur un profil non encore traité calculerait un attendu amputé
du crédit — **et l'écrirait**.

**Ordre correct du bouton :**

1. lire l'inventaire des blocs (voir §1 : **sans** filtre `is_active` pour la saison) ;
2. pour chaque profil : recomputer et écrire `base*` + `season.*` par chemin pointé ;
3. **en dernier seulement**, écrire `app_config/classement_saison`.

Tant que la fenêtre n'a pas changé, l'ancien comportement s'applique et rien n'est
incohérent. Une interruption laisse simplement le travail à moitié fait, sans état faux.

**Le bouton doit rester relançable sans effet de bord** — les chemins pointés le
garantissent (`updateDoc(ref, { 'season.score': X, 'season.colorCounts': {…} })` remplace,
n'additionne pas). Un second clic recalcule la même chose.

---

## §3 — Un point hors périmètre, mais à poser

**`season.*` n'est pas le seul compteur non monotone : le score all-time l'est aussi.**

Le journal de réconciliation de V2.53 le montre noir sur blanc — « un autre compte,
−360 points : 1 rouge validé sur un bloc depuis désactivé, comportement documenté, recalé
au passage ».

Le raisonnement de l'utilisateur — « les points s'accumulent sans jamais être retirés
lorsque les murs changent, c'est l'idée même du changement » — s'applique au moins autant à
un cumul de toute une vie qu'à une saison. Un grimpeur qui voit son score total **baisser**
après une rotation le vivra mal, et rien ne le lui explique.

La correction serait la même qu'au §1 : ne pas filtrer sur `is_active`. Mais c'est un
changement de sémantique du all-time, avec un effet visible sur tous les comptes — donc un
chantier à part, à décider avec l'utilisateur.

**À ne pas traiter dans ce lot.** Mais il serait dommage de rendre la saison monotone en
laissant le all-time décroître : les deux seraient alors incohérents entre eux, et c'est le
genre d'écart qui produit un signalement incompréhensible.

---

## §4 — Réponses aux autres questions

### Q2 — Couleur actuelle plutôt que couleur au moment de la validation

**Oui, cohérent.** C'est déjà ce que font la réconciliation et le compteur all-time, et la
couleur d'origine n'est pas stockée de toute façon.

Pour un bloc retiré (désormais compté, cf. §1), c'est la **dernière couleur connue** — seul
choix disponible, et raisonnable.

### Q3 — Ouistiti (`is_child_route`) et blocs de compétition réutilisés

**Les compter, par cohérence avec le all-time.** Un bloc enfant jaune est probablement plus
facile qu'un jaune adulte, donc il y a une distorsion — mais elle existe déjà dans le
all-time, et la traiter ici créerait un écart entre les deux classements.

Si c'est un vrai problème, c'en est un pour les deux, et c'est un chantier séparé.

### Q4 — Impact Finale

L'analyse tient, aucun angle mort trouvé. Un point à confirmer plutôt qu'à corriger : **un
grimpeur inscrit après J n'a aucun crédit de départ.** C'est juste et voulu — il n'avait
aucune validation avant J — mais autant que ce soit une observation consciente.

### Q5 — Reset depuis le navigateur admin

**Acceptable à N ≈ 12.** La requête `client_boulder_results` par compte est le poste qui
grandit ; quelques centaines restent tenables pour un geste manuel rare, avec un indicateur
de progression.

Avec les profils écrits **avant** la configuration (§2) et un bouton idempotent, une
interruption n'est pas dangereuse — elle laisse du travail à finir, pas un état faux.

Seuil de bascule vers un script Admin SDK : quand la durée du geste dépasse ce qu'un
navigateur tolère sans que l'admin doute qu'il se passe quelque chose. Pas un chiffre de
documents, un ressenti d'usage.

### Q6 — Bug orphan-key (§2.3)

**Confirmé dans les deux sens** : `set({ season: { colorCounts: {} } }, { merge: true })`
fait une fusion profonde, donc une map vide est un no-op ; un chemin pointé dans
`updateDoc` **remplace** la valeur à ce chemin.

⚠️ **Réserve déjà signalée** : `batch.update()` **échoue si le document n'existe pas**, là
où `batch.set(..., merge)` le crée. Si `allRefs` provient d'un instantané de requête, tous
les documents existent et c'est sans risque. S'il provient d'une liste d'uid, un profil
manquant fait échouer le lot entier. **À vérifier avant de changer.**

**Même lot, oui** — même sous-système, précédent V2.53, et laisser un bug connu dans le
script qui tournera à la vraie fin de saison serait dommage. Compléter
`e2e-season-classement-flow.mjs` avec l'assertion `season.colorCounts` vidé **et**
`baseScore`/`baseColorCounts` remis à zéro (§1).

### Livraison

**V2.56 séparée**, d'accord avec ton avis. Le lot Roulette est prêt et vérifié ; y adjoindre
un bouton irréversible qui touche tous les profils mélange deux niveaux de risque très
différents.

---

## §5 — Ce qu'il faut vérifier avant de coder

Trois points, dans cet ordre :

1. **Le chemin de retrait d'une validation.** Teste-t-il « aujourd'hui ∈ fenêtre » ou
   « `createdAt` de la validation ∈ fenêtre » ? Seule la seconde forme est correcte. Après
   le redémarrage, la totalité de l'historique antérieur à `debut` est hors fenêtre — donc
   ce cas limite devient courant, alors qu'il était rare jusqu'ici. Un décrément sur une
   validation qui n'a jamais été comptée ferait descendre le score en dessous du crédit de
   départ.
2. **La provenance de `allRefs`** dans `compute-classement-saison.js` (cf. Q6).
3. **Combien de fois le cron mensuel a déjà tourné** depuis le lancement public, et si une
   rotation de murs a eu lieu entre-temps (§2.2 du handoff). Si oui, des `season.*` ont déjà
   été rabotés — sans conséquence, puisque le redémarrage va tout recalculer, mais ça
   confirme que le désaccord entre les deux mécanismes était bien actif et pas théorique.

---

## §6 — Ce qui reste à trancher côté utilisateur

- **Date exacte de `debut`.** Rappel de l'arbitrage : plus `debut` est proche
  d'aujourd'hui, plus la période « faussée » est écartée — mais le crédit de départ, lui,
  ne dépend pas de `debut` : il vient des validations sur les blocs **actifs à J**, quelle
  que soit leur date. Les deux leviers sont indépendants, ce qui est une propriété
  agréable du Modèle A.
- **Message pendant l'attente.** Si `debut` est postérieur au clic, l'onglet « Classement de
  saison » afficherait un état intermédiaire pendant plusieurs jours. Avec le Modèle A, les
  scores de départ sont écrits immédiatement, donc l'écran n'est pas vide — mais rien
  n'indique qu'un redémarrage a eu lieu. **Une entrée de changelog est nécessaire**, comme
  pour le grisage des badges en V2.54 : présenter le reset comme un choix, sinon il sera lu
  comme une panne.

---

## Points ouverts par ailleurs (inchangés)

- **Lot Roulette V2.55** : les deux points bloquants sont levés, le point à vérifier était
  fondé et corrigé. Reste la note `users` au §5 de `RETOUR-roulette-v255-avant-commit.md`
  (le document accumule l'état ludique et est lu en entier par les écrans staff).
- **Défis `fenetre` et `bloc_designe`** : en production sans e2e navigateur.
- **Chantier droits d'accès** — en attente des réponses du gérant.
  `CONCEPTION-droits-acces-abonnements.md` toujours pas transmis au dépôt.
- Réplique matérielle HDMI à froid ; ligne de base de lectures quotidiennes ; concurrence à
  90 utilisateurs simultanés ; plan de repli quota ; un projet Firebase par salle vs
  mutualisé ; sauvegarde durable des images (`--backup`) ; PDF hors charte (police Dosis) ;
  `aide-connexion-installation.html` hors charte.

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout compteur incrémental doit avoir une assertion e2e sur sa valeur résultante
  (`PROCESSUS-erreurs-avalees.md` §4).
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
