# Conception — Mode de comptage officiel FFME (tops/zones) + garde-fou de réconciliation

> ✅ **§A et §B traités le 16/08/2026 par Claude Code (Codespace), en réponse à cette
> note.** Résumé point par point ci-dessous ; le reste du document (raisonnement
> d'origine) est conservé tel quel.
>
> - **§A (garde-fou)** : ajouté à `scripts/reconcile-classement-profiles.js`. Seuil
>   hybride 30% ET ≥3 comptes (repris tel que recommandé), `--fix` interrompu sans
>   écriture + code de sortie non nul si déclenché, journal écrit même en cas
>   d'interruption, `--force` pour outrepasser explicitement. Testé en simulation ET
>   en `--fix` contre la prod (0 écart trouvé, comportement nominal confirmé).
> - **§B.1/B.2 (cohérence de saisie)** : extrait en fonction pure
>   `applyCompetitionValidationUpdate` (`utils/competitionValidation.ts`, 8 tests
>   dédiés) — top implique zone, décocher la zone décoche un top enregistré, essais-zone
>   pré-rempli avec essais-top à la transition puis re-clampé si essais-top baisse
>   ensuite. Le sélecteur "Essais (zone)" ne propose que `1..essais-top` (contrainte
>   aussi côté options, pas seulement côté fusion). **Raccourci "top au premier
>   essai" non ajouté séparément** : les valeurs par défaut (essais=1) font déjà de
>   "Réussi" seul un raccourci équivalent — une case dédiée aurait été redondante.
> - **§B.3** : déjà conforme (pas de score composite, type `OfficialScoreEntry`
>   distinct) — confirmé, rien à changer.
> - **§B.4 (égalités)** : `rankOfficialEntries` (rang de compétition 1,1,3), utilisé
>   sur les 3 écrans de classement. Écran live : filtre les participants à 0 top/0
>   zone (Top 10 et pages par catégorie), l'état "en attente" existant couvre le cas
>   où personne n'a encore progressé.
> - **§B.6 (tests)** : ajoutés — égalité parfaite, départage à chaque niveau, "tous à
>   zéro", bloc tenté sans zone ni top, cohérence de saisie. **Non fait** : passage
>   e2e Playwright dédié (`e2e-competition-flow.mjs`) — seuls les tests unitaires et
>   de règles ont tourné cette fois, à couvrir si un test manuel en salle est prévu.
> - **⚠️ Vérification du règlement FFME en vigueur** : non faite — je ne peux pas
>   fiabiliser ça moi-même (pas une recherche que je suis en position de garantir
>   exacte), noté comme réserve explicite dans CLAUDE.md plutôt que deviné.

> Note rédigée le 16/08/2026 par la session Claude (navigateur), après lecture de la
> version annotée de `CONCEPTION-selecteur-marge-compteur-incremental.md` (§1 et §3 faits,
> V2.34→V2.36).
> À destination de Claude Code dans le Codespace.
>
> **Deux sujets indépendants** :
>
> - **§A — Garde-fou manquant sur la réconciliation** (V2.36). Court, à traiter dès que
>   possible : le cron mensuel tourne déjà avec `--fix` actif.
> - **§B — Mode de comptage officiel FFME**, chantier en cours. Format retenu par
>   l'utilisateur : **quadruple validation** (top, essais au top, zone, essais à la zone),
>   donc le **tri multi-critères** — pas le barème en points.
>
> Rappel du seul point encore ouvert de la note précédente : **§2, la ligne de base de
> lectures quotidiennes**, relevé manuel dans la console Firebase, toujours à faire.

---

## §A — Réconciliation : un garde-fou manque (V2.36)

### Le raisonnement retenu est vrai pour une dérive, pas pour un bug

La décision d'exécuter `--fix` sans intervention s'appuie sur : « une dérive de compteur
incrémental est corrective par construction, contrairement à une suppression d'image
potentiellement destructive ».

**C'est exact pour une dérive de données. Ça ne l'est pas pour un bug du script.**

`cleanup-orphan-boulder-images.js` a deux garde-fous (7 jours, chute > 20 %).
`reconcile-classement-profiles` n'en a aucun : il réécrit tous les profils sans condition.
Si `summarizeValidatedResults` ou le chemin de recalcul comporte un défaut — aujourd'hui
ou après une évolution du barème — **le cron mensuel propage silencieusement ce défaut à
l'ensemble des profils**, en écrasant au passage les valeurs justes.

C'est un scénario destructif, exactement de la même nature que celui contre lequel le
script de nettoyage est protégé.

### Correctif

Le motif existe déjà dans l'autre script, il suffit de le transposer :

- **Interrompre sans rien écrire si la proportion de profils en écart dépasse un seuil**
  (de l'ordre de 20-30 %, à ajuster). Une réconciliation saine trouve zéro ou un écart ; en
  trouver la moitié signifie que c'est le **script** qui a tort, pas les données.
- Attention au petit volume : avec 12 comptes, un seul écart fait déjà 8 %. Comme pour le
  garde-fou de nettoyage, **un seuil hybride** (pourcentage **et** nombre absolu) évite de
  s'arrêter sur du bruit — même leçon que celle apprise sur les rotations de secteur.
- Le workflow doit **échouer visiblement** (exit code non nul) plutôt que passer au vert en
  ayant refusé d'agir : sinon l'interruption est indiscernable d'un run sans écart.
- Journaliser les écarts détectés même en cas d'interruption — c'est le journal qui
  permettra de trancher entre bug et dérive.

### À vérifier au passage

Le cron est mensuel, donc **la fenêtre de dérive est d'un mois**. À l'échelle actuelle
c'est sans conséquence. Ça deviendra un sujet en multi-salles, où une dérive non corrigée
pendant quatre semaines toucherait des utilisateurs qu'on ne connaît pas — à rattacher à la
décision « un projet Firebase par salle », pas à traiter maintenant.

---

## §B — Mode de comptage officiel FFME (tops / zones)

### Format retenu

**Quadruple validation par bloc** : top (oui/non), essais au top, zone (oui/non), essais à
la zone.

Classement par **tri multi-critères** : nombre de tops (décroissant), puis nombre de zones
(décroissant), puis essais au top (croissant), puis essais à la zone (croissant).

⚠️ **Vérifier le règlement FFME en vigueur avant d'implémenter le comparateur** —
notamment l'ordre exact des critères de départage et le traitement des blocs non tentés.
Ne pas se fier à ma description ci-dessus, qui est le format classique tel que je le
connais, pas une lecture du règlement actuel.

### B.1 — Le vrai risque est la saisie, pas le calcul

Le tri est trivial à écrire et facile à tester. **Le point de fragilité est ailleurs** :

- on passe de 2 à 4 informations par bloc, sur 35 blocs ;
- en **autodéclaration sur téléphone**, alors qu'en compétition officielle ce sont des
  juges qui notent ;
- le grimpeur doit se souvenir séparément du nombre d'essais qui lui ont pris la zone
  **et** le top.

C'est une charge mentale réelle, et une source d'erreurs bien plus probable qu'un bug de
tri. Deux atténuations peu coûteuses :

- **Pré-remplir les essais à la zone avec ceux du top.** Le cas le plus fréquent est zone
  et top au même essai ; laisser corriger à la baisse.
- **Raccourci « top au premier essai »** qui renseigne les quatre valeurs d'un coup.

Soigner cette partie autant que le comparateur — c'est elle qui décidera de la qualité des
données.

### B.2 — Cohérence à imposer à la saisie (pas à vérifier après)

- **Un top implique une zone.** Cocher le top doit cocher la zone automatiquement.
- **Essais à la zone ≤ essais au top.** Contrainte à appliquer dans le contrôle de saisie.

Sans ces deux garde-fous, on obtiendra des données incohérentes produisant des classements
inexplicables — **et incorrigibles a posteriori**, puisque personne ne saura ce que le
grimpeur voulait dire. Le contrôle doit être en amont, à la saisie, pas en aval au calcul.

### B.3 — Ne pas forcer ce mode dans `ScoreEntry`

Un tri multi-critères **n'a pas de score**. C'est ce qui avait motivé l'exclusion de ce
mode à V2.33, et le constat reste juste.

- Prévoir un **type de retour distinct** avec son propre comparateur, plutôt que de plier
  ce mode à `ScoreEntry { score: number }`.
- Les trois modes existants (`blocabrac`, `blocs_valides`, `personnalise`) restent intacts
  et continuent de produire un score.
- `competitionClassement.ts` a précisément été extrait pour absorber ce genre d'évolution
  en un seul endroit — c'est le moment où cette extraction paie une deuxième fois.

⚠️ **Résister à la tentation du score composite.** Encoder les quatre critères dans un
seul nombre (par exemple `tops × 10⁶ + zones × 10⁴ - essais…`) fonctionne et permettrait de
tout garder tel quel. C'est un piège : le nombre affiché n'a aucun sens pour un humain, et
le premier écart de classement devient indéchiffrable. Un comparateur explicite se relit.

### B.4 — Écran live : les égalités sont massives, surtout au début

**À l'ouverture de l'épreuve, tous les participants sont à zéro top et zéro zone** — les 90
sont légitimement premiers ex æquo. Le classement ne devient discriminant qu'après un
certain temps de compétition. Contrairement au barème par points, les égalités ne sont pas
un cas limite : c'est l'état normal pendant une bonne partie de la soirée.

Conséquences pour `AdminCompetitionLiveDisplay.tsx` :

- **Afficher le même rang pour les ex æquo**, jamais un ordre arbitraire. Sur un écran
  mural, un compétiteur remarque immédiatement qu'il est classé derrière quelqu'un qui a
  exactement les mêmes résultats.
- **Prévoir ce que montre l'écran quand rien ne distingue personne.** Un classement de 90
  lignes toutes ex æquo n'apporte rien : envisager un message d'attente, ou n'afficher que
  les participants ayant au moins une zone.
- **Colonnes différentes** : T / Z / essais, pas une valeur unique. La mise en page grand
  écran (rotation par catégorie, grande typographie) reste valable, mais le contenu des
  lignes change.
- La rotation par catégorie FFME prend ici tout son sens : c'est le format officiel, et
  c'est dans sa catégorie qu'un grimpeur se situe.

### B.5 — Ce qui ne pose pas de problème

- **Quota d'écritures** : ce sont des champs supplémentaires dans un document
  `competition_results` **déjà écrit**. Aucune écriture de plus, rien à revoir sur le
  dimensionnement (7 470 écritures mesurées, 37 % du plafond).
- **Verrouillage du mode** : `scoring_mode` est déjà verrouillé côté `firestore.rules` une
  fois la compétition déclenchée (V2.30/V2.33). Le nouveau mode en hérite sans rien à
  faire.
- **`points_value`** : sans objet pour ce mode. Pas d'équivalent à effacer à la sortie de
  compétition, puisque les données de zone vivent sur le résultat, pas sur le bloc.

### B.6 — Vérification

- Tests unitaires du comparateur, en couvrant explicitement : égalité parfaite, départage
  sur chaque critère successivement, participant sans aucune tentative, bloc tenté sans
  zone ni top.
- Test sur la cohérence de saisie (B.2) : un top sans zone ne doit pas pouvoir être
  enregistré.
- `e2e-competition-flow.mjs` : ajouter un passage en mode FFME, ou vérifier au minimum que
  les trois modes existants n'ont pas régressé.
- Rendu de l'écran live avec des ex æquo — c'est le cas que le développement va
  naturellement éviter de tester, et celui que le public verra en premier.

---

## Points ouverts (mise à jour)

- **§2 de la note précédente — ligne de base de lectures quotidiennes.** Relevé manuel dans
  la console Firebase sur plusieurs jours. Toujours ouvert, et c'est ce qui manque pour
  savoir de quelle marge réelle on dispose le jour J (les 28 010 lectures de la compétition
  ne laissent pas 22 000 disponibles : le plafond est partagé avec la journée ordinaire).
- **Répétition matérielle à froid** (PC + HDMI + TV, mode étendu, overscan, veille
  désactivée). Une fois avant le jour J.
- **Concurrence à 90 utilisateurs simultanés** — jamais testée. Une répétition à 10-15
  personnes reste ce qui renseignerait le plus, et permettrait d'éprouver l'écran live et
  la saisie en quadruple validation en conditions réelles. **Cette saisie est un argument
  supplémentaire pour la répétition** : c'est en salle, pas sous émulateur, qu'on verra si
  les grimpeurs remplissent correctement quatre champs par bloc.
- **Plan de repli si un quota saute** — aucune dégradation gracieuse conçue. À décider à
  froid.
- **Un projet Firebase par salle vs mutualisé** — à trancher avant tout développement
  multi-salles.
- **Stockage durable des sauvegardes d'images** (`--backup`).
- **Correction admin des résultats après verrouillage** — autorisée par les règles, aucune
  interface ne l'exerce.

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout script destiné à la CI doit vivre dans un chemin **suivi par git**.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
