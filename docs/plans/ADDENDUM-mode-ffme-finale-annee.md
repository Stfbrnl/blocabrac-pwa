# Addendum — Mode FFME : format « Finale de l'année » et écran de saisie juge

> ✅ **Traité le 16/08/2026 par Claude Code (Codespace).** Décisions tranchées avec
> l'utilisateur : **écran juge** (pas autodéclaration) et **super-finale** (pas titre
> partagé) en cas d'égalité parfaite au sommet.
>
> - **§1/§2** : `AdminCompetitionLiveDisplay.tsx` n'a plus de rotation pour le mode
>   "Officiel" — les groupes par genre s'affichent côte à côte en permanence, filtrés
>   sur "au moins un top ou une zone", classés avec `rankOfficialEntries`. Jeu de test
>   calculé à la main (10 grimpeurs/5 blocs, ex æquo parfait inclus) figé dans
>   `competitionClassement.test.ts`.
> - **§3** : `pages/CompetitionJudgeEntry.tsx` (nouveau), route
>   `/competitions/judge-entry/:competitionId`, accessible depuis
>   `AdminCompetitionManagement.tsx` et `CompetitionBouldersList.tsx` (Ouvreur) pour
>   les compétitions en mode "Officiel". Grille climbers × blocs, mêmes invariants de
>   saisie que le client (`applyCompetitionValidationUpdate`), même patron d'écriture
>   différée. Vérifié par 2 nouveaux tests de règles : admin ET ouvreur peuvent bien
>   CRÉER (pas seulement modifier) le résultat de quelqu'un d'autre — confirmé, aucune
>   modification de `firestore.rules` nécessaire. Verrouillage tout-d'un-coup (pas
>   grimpeur par grimpeur) : simplification assumée pour un juge unique en une seule
>   séance.
> - **Super-finale** : aucun mécanisme dédié construit — le flux existant "ajouter un
>   bloc à une compétition" suffit (le juge saisit ensuite les résultats des seuls
>   grimpeurs concernés sur ce bloc via la même grille, les totaux des autres restent
>   inchangés). Documenté dans CLAUDE.md, pas codé séparément.
> - **Non fait** : rien côté §4 "ce qui reste valable" au-delà de ce qui l'était déjà
>   (vérification du règlement FFME toujours ouverte, `points_value` toujours sans
>   objet, verrouillage de `scoring_mode` déjà hérité).

> Note rédigée le 16/08/2026 par la session Claude (navigateur).
> **Complète `CONCEPTION-mode-ffme-et-garde-fou-reconciliation.md`** (§B), qui avait été
> écrit en supposant le format 90 grimpeurs / 35 blocs. L'usage réel visé est très
> différent, et **plusieurs réserves de ce document tombent**.
>
> Le §A (garde-fou de réconciliation) de la note précédente reste valable et indépendant.

---

## Le format réel visé

Compétition **« Finale de l'année »** :

- **10 grimpeurs** — les mieux classés de la salle.
- **5 blocs** avec zones, **passages consécutifs** (les grimpeurs passent l'un après
  l'autre sur le même bloc).
- **Une seule catégorie : open**, séparée garçons / filles.
- Le meilleur devient le grimpeur de l'année.

Soit **50 résultats au total**, contre 3 150 pour une compétition ordinaire.

---

## §1 — Ce qui tombe du document précédent

Ces réserves visaient l'échelle 90/35 et **ne s'appliquent pas** :

- **Tous les sujets de quota.** 50 résultats, aucun enjeu de lecture ni d'écriture. Ne pas
  optimiser ce qui n'a pas besoin de l'être.
- **La rotation par catégorie sur l'écran live** (§B.4). Deux classements de 5 lignes
  tiennent **ensemble sur un seul écran**, côte à côte. Pas de rotation, pas de pagination,
  pas d'attente pour voir son nom.
- **La charge de saisie** (§B.1). Quatre champs sur 5 blocs n'a rien à voir avec quatre
  champs sur 35. Le pré-remplissage et le raccourci « top au premier essai » restent
  agréables, mais ne sont plus des atténuations nécessaires.

## §2 — Ce qui devient central

### Les égalités ne sont plus un cas limite, c'est l'issue probable

Sur 5 blocs entre les 10 meilleurs grimpeurs de la salle, **plusieurs feront les 5 tops**.
Le départage se jouera entièrement sur les essais — c'est exactement ce à quoi servent les
critères successifs, et c'est ici qu'ils seront réellement sollicités.

**Décision à prendre avant l'événement** : que fait-on d'un ex æquo parfait au sommet
(mêmes tops, mêmes zones, mêmes essais partout) ?

- titre partagé, ou
- super-finale sur un bloc supplémentaire.

Ça ne se tranche pas le soir même, devant les intéressés. L'affichage doit refléter le
choix : deux premiers ex æquo, ou un mécanisme de départage prévu.

### Vérifiabilité à la main — à exploiter

Avec 10 grimpeurs sur 5 blocs, **le classement complet se vérifie au crayon**. Aucun bug de
comparateur ne peut passer inaperçu.

Concrètement : construire un jeu de test correspondant à une finale plausible (plusieurs
grimpeurs à 5 tops, départage sur les essais), calculer le classement attendu à la main, et
le figer comme test unitaire. C'est la meilleure garantie disponible sur ce chantier, et
elle est bon marché à cette échelle.

---

## §3 — Saisie par un juge plutôt qu'autodéclaration

### Pourquoi le format le justifie

Les blocs sont **consécutifs** : les grimpeurs passent l'un après l'autre, sous le regard
des autres, pour un **titre annuel**. L'autodéclaration n'a pas le même statut que dans une
compétition conviviale à 90 participants — ici, le concurrent saisit lui-même le score qui
décide du titre.

C'est aussi ce qui se pratique en compétition réelle : un juge note.

### La solution : un écran de saisie staff

Un écran **admin (ou ouvreur)** permettant de saisir les résultats **de tous les
grimpeurs**, plutôt que chaque grimpeur pour lui-même.

À cette échelle, c'est une interface simple :

- **une grille 10 lignes × 5 colonnes** (un grimpeur par ligne, un bloc par colonne) ;
- chaque cellule saisit les quatre valeurs : top, essais au top, zone, essais à la zone ;
- parfaitement tenable pour une seule personne pendant l'épreuve.

**Contraintes de cohérence identiques à celles du §B.2 précédent**, et à imposer à la
saisie, pas à vérifier après coup :

- un **top implique une zone** (cocher le top coche la zone) ;
- **essais à la zone ≤ essais au top**.

### Réutiliser l'existant plutôt que dupliquer

Les résultats vont dans `competition_results`, **même collection, même identifiant
déterministe** `${uid}_${boulderId}_${competitionId}`. Rien de nouveau côté schéma.

Points à vérifier :

- **`firestore.rules`** : l'admin peut-il déjà écrire un `competition_results` dont le
  `user_id` n'est pas le sien ? Probablement oui (accès admin large), mais à confirmer et à
  couvrir par un test — c'est la seule modification de règles potentiellement nécessaire.
- **Écriture au fil de l'eau + debounce** : réutiliser le patron déjà en place
  (`ClientCompetitions.tsx`, V2.28), y compris le flush sur `pagehide` et la comparaison à
  la dernière valeur persistée. Ne pas réinventer un chemin d'écriture parallèle.
- **Verrouillage** : `submitted` vit sur `competition_participants` (V2.27). Décider si le
  juge verrouille grimpeur par grimpeur ou l'ensemble d'un coup en fin d'épreuve.
- **L'écran live consomme les mêmes données**, sans changement : il lit
  `competition_results`, peu importe qui les a écrits.

### Alternative si l'autodéclaration est conservée

Choix légitime : le contrôle social d'une finale observée par tous joue probablement son
rôle, et ça évite d'écrire un écran.

Mais **c'est un choix à faire consciemment**, parce qu'il détermine où vit l'interface de
saisie — côté client ou côté staff. C'est la décision la plus structurante de ce chantier,
plus que le comparateur lui-même.

---

## §4 — Ce qui reste valable du document précédent

- **Vérifier le règlement FFME en vigueur** avant d'écrire le comparateur : l'ordre exact
  des critères de départage et le traitement des blocs non tentés. Ma description (tops
  décroissants, puis zones, puis essais au top, puis essais à la zone) est le format
  classique tel que je le connais, **pas une lecture du texte actuel**.
- **Ne pas forcer ce mode dans `ScoreEntry { score: number }`** : type de retour distinct
  et comparateur explicite. Pas de score composite encodant les quatre critères dans un
  nombre — ça fonctionne et devient indéchiffrable au premier litige.
- **`scoring_mode` est déjà verrouillé** côté règles une fois la compétition déclenchée
  (V2.30/V2.33) : le nouveau mode en hérite sans rien à faire.
- **`points_value`** : sans objet ici, les données de zone vivent sur le résultat, pas sur
  le bloc.
- **Afficher le même rang pour les ex æquo** sur l'écran live, jamais un ordre arbitraire.
  Colonnes T / Z / essais plutôt qu'une valeur unique.

---

## §5 — Ordre suggéré

1. **Trancher : juge ou autodéclaration.** Détermine tout le reste.
2. Vérifier le règlement FFME (critères de départage).
3. Comparateur + type de retour distinct dans `competitionClassement.ts`, avec le jeu de
   test calculé à la main (§2).
4. Interface de saisie — grille staff, ou extension de l'écran client selon le point 1.
5. Contraintes de cohérence à la saisie (top ⇒ zone, essais zone ≤ essais top).
6. Adaptation de l'écran live : colonnes T/Z/essais, deux classements côte à côte sans
   rotation, gestion des ex æquo.
7. Décider du traitement d'un ex æquo parfait au sommet (titre partagé ou super-finale).

---

## Points ouverts inchangés

- **§A de la note précédente — garde-fou de réconciliation** (seuil hybride, échec visible
  du workflow). Indépendant de ce chantier, le cron mensuel tourne déjà avec `--fix`.
- **Ligne de base de lectures quotidiennes** — relevé manuel console Firebase, toujours à
  faire. Concerne la compétition à 90 participants, pas cette finale.
- **Répétition matérielle à froid** (PC + HDMI + TV, mode étendu, overscan, veille).
- **Concurrence à 90 utilisateurs simultanés** — jamais testée. Ne concerne pas cette
  finale à 10 grimpeurs.
- **Plan de repli si un quota saute** — sans objet pour cette finale, toujours ouvert pour
  la grande compétition.
- **Un projet Firebase par salle vs mutualisé.**
- **Stockage durable des sauvegardes d'images** (`--backup`).
- **Correction admin des résultats après verrouillage** — autorisée par les règles, aucune
  interface ne l'exerce. **L'écran juge du §3 en est une forme** : si le juge peut corriger
  après verrouillage, ce point se referme en partie.

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
