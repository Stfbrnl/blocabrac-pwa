# Retour — Réponses aux 3 questions du handoff `dateOfBirth` (à lire avant modifs)

> Rédigé le 17/08/2026 par la session Claude (navigateur), en réponse à
> `HANDOFF-date-de-naissance-2026-08-17.md`.
> À destination de Claude Code dans le Codespace.
>
> **Ce document remplace `SUIVI-date-de-naissance.md` sur les points où il le contredit.**

---

## Correction préalable — mon §1 partait d'une prémisse fausse

`SUIVI-date-de-naissance.md` §1 décrivait un risque de divergence `age`/`dateOfBirth`
« exactement du profil du bug `role`/`roles` », et réclamait « un utilitaire unique et
testé » qui dériverait l'âge.

**Cet utilitaire existait déjà** (`utils/ageCategory.ts`, `getSeasonAge`), et plus aucun
site n'écrivait `age`. J'ai extrapolé depuis un bug passé sans vérifier le code — la note
demandait de construire quelque chose qui était déjà là.

Le handoff a bien fait de vérifier avant d'appliquer. **Ne pas traiter le §1 de la note
précédente comme une consigne**, il est remplacé par le §2 ci-dessous.

Ce qui reste juste dans cette note : le §3, dont la priorisation était bonne — la
vérification a effectivement trouvé une fuite réelle.

---

## §1 — `classement_profiles.dateOfBirth` : oui, c'est une fuite à corriger

### Confirmation

Ce n'est pas un arbitrage de conception déjà pris, c'est un **effet de bord du mirroring** :
le motif recopie les champs du profil sans se demander lesquels sont nécessaires au
lecteur.

Le diagnostic du handoff est exact : la date brute est stockée dans une collection lisible
par tout compte connecté (`allow read: if request.auth != null`), alors que **son unique
lecteur la dérive immédiatement** et n'affiche jamais la date. Stockage sans usage,
exposition sans contrepartie.

### Le correctif proposé est le bon niveau

**Stocker le dérivé plutôt que le brut**, sans restriction de règle Firestore.

Restreindre la lecture de `classement_profiles` casserait le classement, qui a
précisément besoin de lire les profils des autres — c'est la raison d'être de la
collection. Retirer le champ résout le problème à la source : la donnée n'est plus exposée
parce qu'elle n'est plus là. Pas de compromis entre sécurité et fonctionnalité.

### Un ajustement au correctif : `ffmeCategory` seul, pas `seasonAge`

Le handoff propose de stocker « un `seasonAge`/`ffmeCategory` dérivé ». **Ne stocker que
`ffmeCategory`.**

Un âge exact reste une donnée identifiante ; une tranche de catégorie ne l'est pas. Et le
lecteur (`ClientClassement.tsx`) n'a besoin que de la catégorie. Si un écran futur réclame
l'âge, il le demandera à `users`, où la règle le protège correctement.

Principe : ne mirrorer que ce que le lecteur consomme réellement — c'est exactement la
règle qui n'a pas été appliquée en ajoutant `dateOfBirth`.

### Trois conséquences à traiter dans le même lot

**A. La catégorie devient une valeur figée.** Contrairement à une date, elle se périme :
un grimpeur change de catégorie FFME d'une saison à l'autre. Il faut donc la recalculer.

L'endroit naturel est **la réconciliation existante** — elle vérifie déjà `gender` sur ce
même document, elle peut vérifier `ffmeCategory` à l'identique, en la recomputant depuis
`users.dateOfBirth`. Aucun script nouveau, même patron, même garde-fou.

⚠️ Attention à l'interaction avec le garde-fou `cloturee` du chantier saisonnier :
`gender` est explicitement exclu de ce garde-fou (« ce champ n'a pas de notion de
saison »). `ffmeCategory`, elle, **dépend de la saison de référence**. Décider
explicitement : soit elle suit le même traitement que `gender` (toujours vérifiée), soit
elle est gelée avec `season.*`. Je penche pour toujours vérifiée — la catégorie doit
refléter la saison courante, pas celle qui vient de se clore.

**B. Migration : `deleteField()`, pas seulement cesser d'écrire.** Les documents
`classement_profiles` existants portent déjà `dateOfBirth`. Un champ orphelin reste
lisible aussi longtemps qu'il n'est pas supprimé. Script ponctuel dans
`firestore-migration/`, dry-run par défaut, comme les précédents.

**C. Vérifier qu'aucun autre champ inutile n'a été mirroré.** Puisque la cause est le
motif de mirroring lui-même et non un oubli isolé, passer en revue la liste complète des
champs de `classement_profiles` et retirer ceux qu'aucun lecteur ne consomme. Une fois le
fichier ouvert, autant fermer la catégorie entière de problèmes plutôt que son seul
symptôme connu.

---

## §2 — `age` : statu quo, mais explicité

**Pas de suppression du champ.** La question A/B de ma note précédente ne se pose plus dans
les termes où je l'avais posée : rien ne réécrit `age`, donc la divergence ne s'aggrave
pas dans le temps. Une valeur figée servant uniquement de repli en lecture est un
comportement défendable, et le nettoyage des 11 comptes n'apporterait rien — on ne peut de
toute façon pas reconstituer une date de naissance depuis un âge.

**Deux gestes peu coûteux ferment le sujet sans chantier :**

1. **Renommer le champ TypeScript en `legacyAge`** dans l'interface `User`, avec un
   commentaire : lu en repli uniquement, ne jamais écrire. Le nom porte alors la règle —
   plus robuste qu'une ligne de documentation que personne ne relit. (Renommage de
   l'interface seulement ; le champ Firestore reste `age` sur les 11 comptes.)
2. **Une ligne dans CLAUDE.md**, à côté de la note `role`/`roles`, comme cas de champ
   hérité **assumé** — pour qu'une relecture future ne rouvre pas le débat, et ne le
   confonde pas avec une vraie divergence de schéma.

---

## §3 — Bug de tri « Âge » dans `AdminUsers.tsx` : même lot

Le correctif de la fuite touche déjà ce fichier. Le traiter séparément voudrait dire y
revenir plus tard sur un fichier qu'on aura refermé entre-temps, pour deux lignes.

Corriger en dérivant le tri de `getSeasonAge`, comme l'affichage le fait déjà.

À noter : c'est le genre de défaut qu'un admin remarque sans pouvoir l'expliquer — la
colonne affiche les bons âges mais s'ordonne mal. Le coût de le laisser n'est pas nul.

---

## Ordre suggéré pour le lot

1. Ajouter `ffmeCategory` aux écritures de `classement_profiles` (`Register.tsx`,
   `ClientProfile.tsx`, `AdminUsers.tsx`) — **en parallèle** de `dateOfBirth`, sans rien
   retirer encore.
2. Basculer `ClientClassement.tsx` sur le champ dérivé, avec repli sur le calcul actuel si
   `ffmeCategory` est absente.
3. Étendre la réconciliation à `ffmeCategory` et la lancer en dry-run : elle vérifie que
   le champ dérivé est cohérent **avant** qu'on s'appuie dessus.
4. Migration `deleteField('dateOfBirth')` sur les `classement_profiles` existants.
5. Retirer l'écriture de `dateOfBirth` et le repli du point 2.
6. Revue des autres champs mirrorés (point C du §1).
7. Renommage `legacyAge` + CLAUDE.md (§2) et correctif de tri (§3).

Les étapes 1 à 3 ne changent aucun comportement et sont réversibles. **Le point de
non-retour est l'étape 4** — même découpage que celui proposé pour le compteur
incrémental, pour la même raison : vérifier le nouveau champ avant de supprimer l'ancien.

---

## Point annexe

`CONCEPTION-droits-acces-abonnements.md` **n'est effectivement pas dans le dépôt** — c'est
un document remis directement à l'utilisateur par la session navigateur. Rien à chercher
dans l'historique git. Il sera transmis séparément si le chantier droits d'accès démarre.

Sa seule dépendance avec le présent lot : le prérequis « date de naissance » y était noté
comme bloquant pour la phase 1. Il est levé — `AdminUsers.tsx` permet déjà la saisie en
création et en édition, ce que le handoff a confirmé.

---

## Points ouverts par ailleurs (inchangés)

- Réplique matérielle HDMI à froid avant la première utilisation de l'écran live.
- Ligne de base de lectures quotidiennes (relevé console Firebase).
- Concurrence à 90 utilisateurs simultanés, jamais testée.
- Plan de repli si un quota saute.
- Un projet Firebase par salle vs mutualisé — rappel : le *site* est un champ, la *salle*
  est un projet.
- Stockage durable des sauvegardes d'images (`--backup`).
- `aide-connexion-installation.html` toujours hors charte.
- Contrôle d'âge YBT (16 ans et plus) — appartient au chantier droits d'accès, hors
  périmètre de ce lot. Confirmation du handoff : non implémenté, et c'est normal.

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout script destiné à la CI doit vivre dans un chemin suivi par git.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
