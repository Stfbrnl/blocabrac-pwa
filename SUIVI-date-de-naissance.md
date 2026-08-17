# Suivi — Passage à la date de naissance : trois vérifications

> Note rédigée le 17/08/2026 par la session Claude (navigateur).
> À destination de Claude Code dans le Codespace.
>
> **Contexte.** La date de naissance est désormais demandée à la création de compte, et
> renseignable a posteriori via « Mes informations ». Cela **lève le prérequis bloquant**
> identifié au §3 de `CONCEPTION-droits-acces-abonnements.md` : la phase 1 du chantier
> droits d'accès peut démarrer.
>
> Trois vérifications en découlent. Le §1 est le plus important — c'est un risque de
> divergence de schéma, exactement le profil du bug `role`/`roles`.

---

## §1 — Deux sources pour la même information

### Le risque

Si `users.age` subsiste en parallèle de la date de naissance, deux champs décrivent la
même réalité, avec des cycles de vie opposés :

- **`birthdate`** : immuable, l'âge s'en dérive et reste toujours juste.
- **`age`** : figé à la saisie, **faux dès l'anniversaire suivant**.

C'est le profil exact du bug `role`/`roles` déjà retracé sur ce projet : deux champs
concurrents écrits à des endroits différents, une divergence silencieuse, et un bug qui
traverse le codebase sans jamais être rattaché à sa cause.

### À trancher, de façon binaire

**Option A — supprimer `age`.** Tout le code dérive l'âge de `birthdate` via un utilitaire
unique et testé. C'est la voie propre. Elle demande de recenser tous les lecteurs de `age`
et de migrer les comptes qui n'ont pas encore de date (voir §2).

**Option B — conserver `age`.** Alors il faut nommer explicitement qui fait foi, le
documenter dans CLAUDE.md, et garantir que `age` est recalculé — ce qui suppose un
recalcul périodique, donc un script planifié de plus.

**L'entre-deux est le seul choix à exclure** : conserver les deux sans arbitrer, c'est
programmer la divergence.

Recommandation : option A. Le recalcul périodique de l'option B est du travail récurrent
pour éviter un problème que la suppression fait disparaître.

### Lecteurs connus de `users.age` — à recenser exhaustivement

Repérés au fil des handoffs, la liste n'est probablement pas complète :

- `AdminCompetitionRegistration.tsx` (inscription manuelle) ;
- le bouton « Générer le roster » de `AdminCompetitionManagement.tsx` — c'est là qu'un
  `age` absent avait provoqué le `Unsupported field value: undefined` corrigé par `?? null` ;
- les catégories FFME du classement de compétition (`competitionClassement.ts`,
  `getClassementByCategory`) ;
- les catégories tarifaires enfant (−6, −12) du futur chantier droits d'accès.

Faire un `grep` sur le champ plutôt que se fier à cette liste.

⚠️ **Les catégories FFME sont le point sensible** : elles sont calculées à partir de
l'âge, et un âge figé fausse la catégorie d'un grimpeur d'une saison sur l'autre. Un
grimpeur peut concourir dans la mauvaise catégorie sans que personne ne s'en aperçoive.
C'est un bénéfice non anticipé du passage à `birthdate`, et une raison de plus de
supprimer `age`.

---

## §2 — Les comptes sans date de naissance

La saisie via « Mes informations » est volontaire. Il y aura donc une transition longue, et
certains comptes n'y passeront jamais.

### À traiter dans le code

- **Ne jamais échouer sur l'absence.** Un `undefined` qui remonte jusqu'à Firestore
  produit le même `Unsupported field value` que celui déjà corrigé. Repli explicite partout.
- **Accès YBT (16 ans et plus)** : en l'absence de date, **refuser** — mais avec un message
  compréhensible (« date de naissance non renseignée, voir l'accueil »), jamais un refus
  muet ni une erreur technique.
- **Catégories FFME** : même traitement que le genre non renseigné, déjà en place —
  exclusion du tri avec avertissement dans le journal, pas d'erreur bloquante.

### À vérifier côté interface

**L'admin peut-il saisir la date de naissance d'un grimpeur ?** Si « Mes informations » est
le seul point de saisie, un grimpeur qui se présente au comptoir sans l'avoir renseignée
bloque son propre accès, et l'accueil n'a aucun moyen de le débloquer.

`AdminUsers.tsx` devrait permettre cette saisie. À vérifier, et à ajouter si absent — c'est
un prérequis opérationnel du chantier droits d'accès, pas un confort.

### Mesurer avant de décider

Combien de comptes ont déjà une date renseignée ? Un simple comptage dans la console
Firebase indique si la migration est un non-sujet (12 comptes aujourd'hui) ou un vrai
chantier. À faire avant de choisir entre A et B au §1.

---

## §3 — Une date de naissance n'est pas un âge, du point de vue des données

Un âge est approximatif. Une **date de naissance identifie plus précisément une personne**,
et la base en contient pour des **mineurs**.

Rien de bloquant à cette échelle, mais deux réflexes à poser maintenant plutôt qu'après :

**Ne l'afficher que là où elle sert.** L'âge dérivé suffit presque partout (catégories,
contrôle des 16 ans, tarifs). La date elle-même n'a besoin d'apparaître qu'à la saisie et
dans la fiche admin.

**Vérifier l'exposition en lecture.** Plusieurs écrans staff font encore un
`getDocs(collection(db, 'users'))` **non filtré** — relevé en section 2c du handoff quotas
du 14/08 : `CompetitionStats.tsx`, `AdminCompetitionStats.tsx`,
`AdminCompetitionRegistration.tsx`, `AdminUsers.tsx` (×4), `BoulderStats.tsx`,
`CompetitionBoulderStats.tsx`.

Ces requêtes transportent désormais la date de naissance de tous les comptes. Les règles
Firestore autorisent-elles la lecture de `users` à tout compte authentifié, ou seulement au
staff ? Si c'est le premier cas, n'importe quel client peut lire les dates de naissance de
toute la salle — sans interface pour le faire, mais la donnée transite.

**À vérifier en priorité, avant tout autre point de cette note.** Le correctif éventuel
(restreindre la lecture de `users`, ou déplacer les champs sensibles dans un
sous-document) est plus lourd s'il est fait après le chantier droits d'accès.

---

## Conséquence sur le chantier droits d'accès

`CONCEPTION-droits-acces-abonnements.md` §3 mentionnait la date de naissance comme
**prérequis bloquant de la phase 1**. Ce prérequis est levé, sous réserve du §2 ci-dessus
(saisie admin possible, repli propre sur l'absence).

Les sept questions du §7 de ce document restent ouvertes et sont à poser à la salle avant
d'implémenter.

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

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout script destiné à la CI doit vivre dans un chemin suivi par git.
