# Relecture — `CONCEPTION-classement-saisonnier.md` : quatre points avant développement

> Note rédigée le 17/08/2026 par la session Claude (navigateur), après relecture de
> `CONCEPTION-classement-saisonnier.md`.
> À destination de Claude Code dans le Codespace.
>
> **La conception est bonne et ne demande pas de refonte.** Deux choix méritent d'être
> soulignés parce qu'ils portent tout le reste :
>
> - **Compteur parallèle plutôt que bornage.** Ça referme proprement le débat de V2.26 en
>   reconnaissant deux besoins distincts (progression à vie / classement de saison) plutôt
>   qu'en sacrifiant l'un pour l'autre.
> - **La vue saison ne coûte aucune lecture supplémentaire**, les champs vivant sur des
>   documents déjà chargés par `ClientClassement.tsx`. C'est ce qui rend le suivi en direct
>   viable sous Spark.
>
> Quatre points ci-dessous. **Le §1 est bloquant** : en l'état, le chantier introduirait un
> mécanisme qui corrompt silencieusement les données de qualification.

---

## §1 — BLOQUANT : la réconciliation contredit la conception, et `--fix` la rend destructrice

### La contradiction

Deux sections du document s'opposent :

- **« Ce qui ne change pas »** écarte le bug `createdAt`/`updatedAt` au motif que « le
  compteur de saison se base sur la date de validation **au moment où elle a lieu**, jamais
  sur une relecture a posteriori de la date stockée ». Vrai — **pour le compteur
  incrémental**.
- **« Réconciliation étendue »** prévoit de recomputer `season.colorCounts`/`season.score`
  depuis `client_boulder_results` « en ne retenant que les validations dont la date tombe
  dans `[debut, fin]` ». C'est **exactement** une relecture a posteriori de la date stockée.

Le bug écarté est donc au cœur du chemin critique, pas à côté.

### Le scénario

1. Un grimpeur valide un bloc **en mai** — dans la saison. Le compteur incrémental
   s'incrémente correctement.
2. **En juin** — hors saison — il modifie sa note ou son nombre d'essais sur ce même bloc.
3. Si la date stockée sur `client_boulder_results` est réécrite à cette occasion, la
   validation sort de la fenêtre aux yeux de la réconciliation.
4. Le script constate un écart, et **corrige à la baisse un compteur qui était juste**.

Avec `--fix` actif et un cron mensuel, ça se produit sans que personne ne le sache.
**Et ça change qui se qualifie pour la Finale.**

### Le garde-fou ne protège pas

Le seuil anti-dérive (30 % **et** ≥ 3 comptes) est calibré pour détecter un script
défaillant, pas quelques comptes légitimement touchés. Quelques grimpeurs ayant édité une
validation après la fin de saison passent largement sous le seuil et sont « corrigés ».

### Deux voies, à trancher explicitement

**Voie A — corriger le bug de date en amont.** Distinguer clairement une date de création
(immuable) d'une date de modification. Ce chantier devient alors le **prérequis** du
classement saisonnier, pas son voisin. C'est la voie propre, et elle a de la valeur
au-delà de ce chantier — toute logique future fondée sur « quand cette validation a-t-elle
eu lieu » en dépend.

**Voie B — ne pas réconcilier `season.*`.** Limiter le script aux champs all-time et à
`gender`, comme aujourd'hui. Le compteur de saison n'a alors aucun filet, mais il ne peut
pas non plus être corrompu par un filet défectueux. Acceptable vu l'enjeu réel (voir §4),
à condition que ce soit un choix assumé et documenté, pas un oubli.

**Ce qu'il ne faut pas faire** : laisser les deux affirmations coexister dans le document
et implémenter la réconciliation telle qu'elle est décrite.

---

## §2 — Le reset de fin de saison et la réconciliation peuvent se défaire mutuellement

### Le scénario

1. Le job de fin de saison archive puis **remet `season.*` à zéro** sur tous les profils.
2. L'admin doit ensuite reconfigurer `app_config/classement_saison` pour la saison
   suivante — **manuellement**, le job ne le fait délibérément pas (bon choix).
3. Entre les deux, `app_config` contient **encore la fenêtre de la saison écoulée**.
4. Si le cron mensuel de réconciliation tombe dans cet intervalle, il recompute les
   compteurs sur l'ancienne fenêtre, constate que tout le monde est à zéro, et
   **restaure les valeurs de la saison précédente** — annulant le reset.

L'intervalle n'est pas théorique : rien n'oblige l'admin à reconfigurer le jour même, et
la fin de saison (fin mai) tombe dans une période de faible activité.

### Correctif

La réconciliation doit **ignorer les champs `season.*` lorsque la date du jour dépasse
`fin`**. Une saison terminée mais non reconfigurée est un état transitoire connu, pas une
anomalie à corriger.

Rendre l'état explicite plutôt qu'implicite : un marqueur sur `app_config/classement_saison`
(par exemple `cloturee: boolean`, posé par le job à l'étape 3, levé par l'admin à la
reconfiguration) évite de déduire l'état d'une comparaison de dates. La réconciliation le
lit, le journal l'affiche, et l'écran admin peut rappeler qu'une reconfiguration est
attendue.

**Sans objet si la voie B du §1 est retenue** — mais la question de la reconfiguration
oubliée reste, elle : sans marqueur ni rappel, une saison peut démarrer sans que personne
ne s'en aperçoive avant plusieurs semaines.

---

## §3 — `classementOptIn` n'est pas appliqué à la qualification

### Constat

- `ClientClassement.tsx` filtre sur `classementOptIn == true`, et la vue saison réutilise
  ce filtre (explicitement prévu dans la conception, par cohérence).
- Le job de fin de saison, lui, « lit **tous** les `classement_profiles` » — sans ce filtre.

Un grimpeur ayant refusé le classement peut donc être qualifié pour la Finale, et
**apparaître soudain dans un roster public alors qu'il n'a jamais figuré dans aucun
classement visible**.

### Pourquoi ça compte

C'est le même type de question que celle tranchée pour `liveDisplayEnabled` : l'inscription
valait consentement **parce qu'elle était explicite et affichée**. Ici, la qualification
découle d'une activité que le grimpeur a précisément choisi de ne pas rendre visible.

### À trancher

Trois options acceptables, mais il faut en choisir une :

1. **Le job applique le filtre.** Refuser le classement, c'est renoncer à la qualification.
   Simple et cohérent, mais à dire clairement au grimpeur au moment où il désactive
   l'option.
2. **La qualification est un usage distinct**, et l'écran de réglage l'indique
   (« ce réglage masque votre nom du classement public, mais votre score reste pris en
   compte pour la qualification à la Finale »).
3. **Le roster est proposé à l'admin, pas appliqué** — le grimpeur concerné est contacté
   avant d'être inscrit. Cohérent avec le fait que le bouton « Générer le roster » amorce
   sans verrouiller.

À noter : l'option 1 est la plus simple à implémenter et la moins surprenante pour le
grimpeur. Mais elle réduit le vivier, ce qui n'est pas neutre avec un effectif modeste.

---

## §4 — Le modèle de confiance : décision prise, aucune action

La date de saison est **calculée côté client**, et le client écrit lui-même son compteur.
Une horloge d'appareil mal réglée — ou volontairement décalée — permet d'accumuler des
points hors fenêtre.

**Décision de l'utilisateur (17/08/2026) : on conserve la confiance donnée aux grimpeurs.**
L'enjeu ne le justifie pas — il s'agit d'un classement de salle, pas d'un titre à
conséquences. Sans backend (contrainte « no Cloud Functions »), il n'existe de toute façon
pas de parade complète, et le contrôle social d'une petite salle joue son rôle.

**Aucune action à prendre. Ne pas proposer de mécanisme de vérification côté serveur.**

Consigné ici uniquement pour que la question ne soit pas rouverte à chaque relecture, et
pour documenter que c'est un choix, pas un oubli.

Conséquence indirecte : la réconciliation était le seul filet contre une dérive
accidentelle (bug, écriture perdue). C'est ce qui rend le §1 important — un filet qui
corrompt les données est pire que pas de filet du tout.

---

## Points mineurs, sans enjeu

- **Fuseau horaire.** `debut`/`fin` sont des dates ISO sans heure, comparées à une date
  calculée côté client. Pour une salle française avec des clients français, la cohérence
  est de fait assurée. Rien à faire, mais à ne pas oublier si le multi-salles franchit un
  jour une frontière.
- **« Saison la plus récente »** pour le bouton « Générer le roster » : des identifiants de
  la forme `2025-2026` se trient lexicographiquement dans le bon ordre. Sans piège tant que
  la convention de nommage est respectée — à documenter dans CLAUDE.md.
- **Coût du reset** : une écriture par profil. Négligeable à l'échelle actuelle, à garder à
  l'esprit en multi-salles (le job tourne sur un projet, donc par salle — sans objet si la
  décision « un projet par salle » est retenue).

---

## Ordre de réalisation — ajustements

L'ordre proposé dans la conception est bon. Deux insertions :

- **Avant l'étape 7** (extension de la réconciliation) : trancher le §1. Si voie A,
  le correctif de date devient une étape à part entière, **avant l'étape 2**. Si voie B,
  l'étape 7 se limite à `gender` et il faut retirer `season.*` de la description.
- **Dans l'étape 6** (job de fin de saison) : intégrer le marqueur de clôture du §2, et
  trancher le §3 avant d'écrire le tri.

---

## Points ouverts inchangés par ce chantier

- **Garde-fou de réconciliation** (seuil hybride, échec visible du workflow) — visiblement
  déjà en place d'après la conception (« 30 % ET ≥ 3 comptes »). Confirmé, plus rien à
  faire de ce côté.
- **Ligne de base de lectures quotidiennes** — relevé manuel console Firebase, toujours à
  faire.
- **Répétition matérielle HDMI à froid** avant la première utilisation en salle.
- **Concurrence à 90 utilisateurs simultanés** — jamais testée.
- **Plan de repli si un quota saute.**
- **Un projet Firebase par salle vs mutualisé.**
- **Stockage durable des sauvegardes d'images** (`--backup`).
- **`aide-connexion-installation.html`** toujours en bleu `#1976d2`, hors charte.
- **Règlement FFME** — clos : le mode s'inspire du règlement, il ne prétend pas s'y
  conformer (salle privée, aucun partenariat fédéral visé).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout script destiné à la CI doit vivre dans un chemin **suivi par git**.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
