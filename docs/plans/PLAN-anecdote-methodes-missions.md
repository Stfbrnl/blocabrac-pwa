# Plan — Anecdote d'ouvreur, Carnet de méthodes, Missions hebdomadaires

> Rédigé le 24/09/2026 par la session Claude (navigateur), à partir d'idées soumises par
> l'utilisateur et arbitrées en session.
> À destination de Claude Code dans le Codespace.
>
> **Trois chantiers indépendants**, de coût et de complexité très différents. À livrer
> séparément, dans l'ordre du §0.
>
> **Une quatrième idée a été écartée** : le « mode flash » (un bloc valant double points
> pendant 30 minutes). Raison décisive — `reconcile-classement-profiles.js` recalcule le
> score attendu depuis les validations et la couleur du bloc, et **effacerait silencieusement
> tout point d'une autre origine** au passage mensuel, avec `--fix` automatique. S'y ajoute
> l'absence d'infrastructure de notification : sans push, seuls les grimpeurs ayant
> l'application ouverte au bon moment le verraient. **Ne pas la réintroduire sans traiter
> ces deux points.**

---

## §0 — Ordre de livraison et coûts

| # | Chantier | Lectures | Écritures | Effort |
|---|---|---|---|---|
| **A** | Anecdote d'ouvreur | 0 | 0 (champ sur une écriture existante) | quelques heures |
| **B** | Carnet de méthodes | 0 | +1 par bloc et par grimpeur | 1 jour |
| **C** | Missions hebdomadaires | 0 | **0** (fondues dans les écritures existantes) | 2 jours |

**Aucun des trois n'ajoute de lecture.** C est le plus gros en travail mais le moins cher
en quota — tout se greffe sur des écritures qui ont déjà lieu.

Livrer **A** en premier : il est trivial, il complète `openedBy` livré en V2.65, et il ne
touche à rien de sensible.

---

# CHANTIER A — L'anecdote d'ouvreur

## A.1 — Le principe

Un champ texte libre sur le bloc, rempli par l'ouvreur : intention de mouvement, nom donné
au bloc, avertissement. *« Mouvement inspiré de Fontainebleau, attention au
rétablissement. »*

Prolonge directement V2.65 : `openedBy` dit **qui** a ouvert, l'anecdote dit **ce qu'il
avait en tête**.

## A.2 — Modèle

`boulders/{id}.openerNote: string | null`

⚠️ **Plafonner à 300 caractères**, contrôlé côté formulaire **et** côté règles
(`request.resource.data.openerNote.size() <= 300`).

Raison : `boulders` est chargé **en masse** pour afficher un mur. À quinze blocs, 300
caractères sont négligeables ; sans limite, c'est le début exact de la mécanique qui a
obligé à sortir les images base64 du document.

## A.3 — Implémentation

- Champ `TextField` multiligne dans `DailyBoulderForm.tsx` **et**
  `CompetitionBoulderForm.tsx` — le second est systématiquement oublié, il l'a encore été
  jusqu'à ce que V2.65 corrige l'habitude.
- Modifiable en édition.
- Affichage sur la fiche du bloc côté grimpeur, **uniquement si renseigné** (pas de « non
  renseigné » bruyant — même traitement que `openedBy` en V2.65).
- **Blocs de compétition** : même décision que pour `openedBy` — masqué pendant l'épreuve.
  Garanti par construction, `ClientCompetitions.tsx` n'affiche pas le champ.
- Règles : écriture staff uniquement (la règle `boulders` existante couvre déjà), plus le
  contrôle de longueur.

## A.4 — Vérification

- Test de règle : note de plus de 300 caractères rejetée ; note absente ou `null` acceptée
  (⚠️ **piège V2.27** — utiliser `resource.data.get('openerNote', null)`, une comparaison
  directe sur un champ inexistant fait échouer toute l'évaluation).
- Contrôle visuel : bloc ancien sans note, bloc avec note longue, rendu sur mobile.

---

# CHANTIER B — Le carnet de méthodes

## B.1 — Le principe

Des **tags de méthode** votés par les grimpeurs qui ont validé le bloc. Le grimpeur qui
bloque voit ce que les autres ont utilisé : *« 8 grimpeurs sur 10 ont utilisé un crochet de
talon. »*

Valeur pédagogique réelle, et bien moins coûteux qu'une vidéo.

## B.2 — ⚠️ La forme proposée est incomplète : il faut deux écritures, pas une

L'idée d'origine proposait un simple compteur par méthode sur le bloc. **Un compteur seul ne
sait pas qui a voté** — un grimpeur pourrait voter cinquante fois, et aucune règle ne peut
l'en empêcher.

**La forme correcte** :

1. **Le vote du grimpeur** va dans **son propre** `client_boulder_results` — document déjà
   écrit à la validation, **donc zéro écriture supplémentaire**.
2. **Le compteur agrégé** sur `boulders/{id}.methodCounts` — une écriture.

Le client vérifie son propre document avant d'incrémenter : auto-régulation, comme pour
tout le reste du projet.

**Total : une écriture de plus par bloc et par grimpeur. Zéro lecture.**

## B.3 — Modèle

**Sur `client_boulder_results/{uid}_{boulderId}`** — champ ajouté :

```
methods: string[]   // clés du vocabulaire fixe, 3 maximum
```

**Sur `boulders/{id}`** :

```
methodCounts: { [methode: string]: number }
methodVotes: number   // nombre de grimpeurs ayant voté, pour le seuil d'affichage
```

**Vocabulaire fixe dans `gymConfig.ts`**, jamais de texte libre :

> dynamique · crochet de talon · crochet de pointe · inversée · réglette · pince ·
> opposition · coordination

Six à huit entrées suffisent. **Le fork Grimpe ! en voudra d'autres** — d'où
`gymConfig.ts` et pas une constante enfouie dans un composant.

## B.4 — Seuil d'affichage

⚠️ **Ne rien afficher sous 3 votes.** « 100 % ont utilisé un crochet de talon » sur un seul
vote est trompeur, et décrédibilise la fonctionnalité auprès de ceux qui savent lire un
pourcentage.

Sous le seuil, afficher le nombre de votes sans les proportions, ou rien du tout — à
arbitrer à l'implémentation.

## B.5 — Règles Firestore

Écriture client sur `boulders`, bornée au motif `affectedKeys().hasOnly(['methodCounts',
'methodVotes'])` — même patron que `challenges.progress` (V2.46).

**Point favorable** : contrairement à la liste des premiers ascensionnistes, **les règles
peuvent être étanches ici**. Le vocabulaire est fixe et court, donc elles peuvent vérifier :

- que chaque clé modifiée appartient au vocabulaire ;
- que chaque incrément vaut **exactement +1** ;
- que `methodVotes` augmente de 1 ;
- qu'au plus 3 méthodes sont incrémentées dans une même écriture.

Tests correspondants dans `firestore.rules.test.ts`, sur le modèle des tests `challenges`.

## B.6 — Interface

- Le choix des méthodes se fait **dans la modale de validation**, après le clic Réussi —
  pas avant, et jamais obligatoire.
- 3 méthodes maximum, sinon tout le monde coche tout.
- **Modifiable** tant que le grimpeur revient sur sa validation : décrémenter l'ancienne,
  incrémenter la nouvelle. ⚠️ C'est le chemin le moins parcouru, donc **celui à tester
  explicitement**.
- **Blocs de compétition exclus** : les méthodes renseignent sur la difficulté, comme les
  premiers ascensionnistes.

## B.7 — Vérification

- Test unitaire sur la fonction pure de calcul du delta (vote initial, changement de vote,
  retrait).
- Tests de règles (§B.5).
- e2e : deux comptes votent, vérifier `methodCounts` et `methodVotes` ; puis un compte
  change son vote, vérifier la décrémentation.

---

# CHANTIER C — Les missions hebdomadaires

## C.0 — Ce que ce chantier n'est pas

⚠️ **Les missions ne remplacent pas `weeklyGoalItems`, et ne font pas double emploi.** La
distinction est délibérée :

| | Objectif hebdomadaire | Missions hebdomadaires |
|---|---|---|
| Qui le fixe | **le grimpeur**, pour lui-même | **la salle**, identique pour tous |
| Ce que ça mesure | une intention personnelle | une proposition à accepter |
| Valeur | suivi de sa propre régularité | pédagogie — pousser hors de sa zone |

Les deux coexistent sur l'écran, et se lisent différemment. **Ne pas fusionner, ne pas
supprimer l'un des deux.**

## C.1 — Version retenue : badge, pas points

**Décision de l'utilisateur, à respecter.** Une grille complétée donne **un badge**, pas de
points au classement.

Raison technique décisive : `reconcile-classement-profiles.js` recalcule le score attendu
depuis les validations et la couleur des blocs. **Tout point d'une autre origine serait
effacé au passage mensuel**, silencieusement.

Si le besoin d'une récompense chiffrée apparaît plus tard, la voie existe et elle est
éprouvée : un champ séparé que le recalcul préserve, exactement comme `season.baseScore`
pour le crédit de départ. **Ne pas l'engager tant que le badge n'a pas été essayé.**

## C.2 — Les huit missions

Définies par l'utilisateur. Toutes sont **dérivables des données**, aucune n'est
déclarative — ce qui est la bonne propriété même pour une version badge.

| # | Mission | Détection |
|---|---|---|
| M1 | Un bloc de ton **niveau max** — nouveau ou confirmé | validation réussie sur un bloc de la couleur du niveau figé |
| M2 | Grimper sur **4 murs différents** | ensemble des murs **comptabilisables** (§C.7) où un résultat a été saisi cette semaine, taille ≥ 4 |
| M3 | **Flasher** un bloc de niveau ≥ max−1 | `success && attempts == 1` sur une couleur ≥ max−1 |
| M4 | **Tester** un bloc de niveau max+1 | un résultat **réussi ou échoué** sur un bloc de couleur max+1 — **variante au plafond**, §C.3.b |
| M5 | Un bloc en **dévers ou toit** (force) | validation réussie sur un mur de `deversWalls` |
| M6 | Un bloc en **rétablissement** (engagement) | validation réussie sur un mur de `retaWalls` |
| M7 | Un bloc en **dalle** (équilibre, technique) | validation réussie sur un mur de `dalleWalls` |
| M8 | Activer et **réussir une roulette** | clic « J'ai relevé le défi » |

Les recoupements sont voulus : flasher un bloc de son niveau max valide M1 **et** M3. C'est
une bonne chose, pas un défaut.

## C.3 — Trois points, **tranchés par l'utilisateur le 24/09**

### a) M1 « confirmer un ancien » — évalué sur le geste ✅ TRANCHÉ

**Point le plus important de ce chantier.**

Depuis V2.28 (point 3 du processus erreurs avalées), les écrans **n'écrivent pas quand rien
n'a changé** : recliquer « Réussi » sur un bloc déjà validé avec le même nombre d'essais ne
produit **aucune écriture**. Ni `createdAt` (immuable depuis V2.41) ni `updated_at` ne
bougent.

**Il n'existe donc pas de trace en base d'une re-validation.**

**Décision retenue : évaluer la mission sur le geste, pas sur l'écriture.** Le clic sur
« Réussi » déclenche l'évaluation de M1 même si aucune écriture de résultat n'en découle —
l'écriture de `weeklyMissions`, elle, a bien lieu, donc la mission se coche.

Conséquence assumée : M1 est trivialement cochable en recliquant un bouton. C'est cohérent
avec la doctrine de confiance du projet (le classement de saison repose déjà sur des
compteurs auto-déclarés, et la roulette sur un bouton « J'ai relevé le défi »).

⚠️ **À inscrire dans `CLAUDE.md`** : *« M1 des missions hebdomadaires est évaluée sur le
geste et non sur une écriture ; elle est auto-déclarative de fait. Si les missions rapportent
un jour des points au classement, M1 doit être restreinte aux validations dont `createdAt`
tombe dans la semaine. »* Sans cette note, la limite sera oubliée au moment exact où elle
deviendra gênante.

### b) Plancher et plafond de niveau — M4 se substitue au plafond ✅ TRANCHÉ

M3 suppose qu'un niveau max−1 existe ; M4 suppose un max+1.

- **Grimpeur au plafond** (rose) : pas de max+1 → **M4 impossible**.
- **Grimpeur au plancher** : pas de max−1 → M3 se rabat sur son niveau courant.

La roulette a déjà résolu ce problème (`resolveTargetColor`, clamp plancher/plafond,
`levelExcludedE`). **Réutiliser la même hiérarchie de couleurs et la même logique de
clamp**, ne pas en écrire une seconde.

**Décision retenue pour M4 au plafond : substitution, pas case grisée.** Le grimpeur au
niveau maximal reçoit à la place :

> **M4 bis — Réussir un bloc de ton niveau max en t'interdisant une prise de main ou de
> pied.**

Trois raisons, dans l'ordre d'importance :

1. **Une grille incomplétable est pire qu'une case déclarative.** Griser M4 rendrait le
   badge structurellement inatteignable pour le meilleur grimpeur de la salle — exactement
   la personne qu'une mécanique d'engagement ne doit pas exclure.
2. **La grille reste à 8 cases pour tout le monde.** Pas de seuil de complétion variable
   selon le grimpeur, donc pas de branche dans la logique de complétion ni dans le compteur
   `weeklyMissionsCompleted`.
3. **Le motif déclaratif existe déjà** : c'est le bouton « J'ai relevé le défi » de la
   roulette (V2.55). M4 bis le réutilise tel quel, sans inventer de mécanique nouvelle — et
   M8 en dépend déjà de toute façon.

Contexte du terrain (utilisateur, 24/09) : **un seul grimpeur de la salle est au rose
permanent**, l'ouvreur. Le cas est donc quasi vide aujourd'hui — raison de plus pour choisir
la solution qui ne complexifie pas le cas général.

⚠️ M4 bis est **la seule mission purement déclarative hors M1 et M8**. Même note à porter
dans `CLAUDE.md` que pour M1 : si les points arrivent un jour, ces trois-là sont les
maillons faibles.

### c) Le niveau doit être figé au début de la semaine

M1, M3 et M4 dépendent du niveau du grimpeur — **qui bouge tout seul** depuis V2.54
(badges → `users.level`).

Sans précaution, une mission évaluée lundi au niveau X et vendredi au niveau Y devient
incohérente : un grimpeur qui progresse en cours de semaine verrait ses cases se déplacer.

**Stocker le niveau dans `weeklyMissions` à l'ouverture de la semaine** et l'utiliser pour
toute la grille. Même famille de problème que les défis `seuil` à cible relative.

## C.4 — Modèle et réinitialisation

**Dans `user_ludic_state/{uid}`** (collection créée par le chantier de septembre) :

```
weeklyMissions: {
  isoWeek: string,           // "2026-W39"
  level: string,             // niveau figé à l'ouverture de la semaine (§C.3.c)
  countsChildWalls: boolean, // figé aussi — grimpeur de moins de 10 ans (§C.7)
  done: string[],            // clés des missions accomplies
  walls: string[],           // murs comptabilisables visités cette semaine, pour M2
  completedAt: string|null
}
weeklyMissionsCompleted: number   // nombre de semaines complétées, cumulatif
```

**Réinitialisation sans cron.** Dérivée de la semaine ISO courante : si `isoWeek` diffère de
la semaine en cours, la grille repart à zéro et `level` est refigé. Exactement le motif de
la fenêtre de saison — **aucune tâche planifiée, aucun backend**.

⚠️ La semaine ISO est calculée **côté client**, donc sur l'horloge de l'appareil. Cohérent
avec la doctrine de confiance déjà retenue (classement saisonnier, 17/08). **Ne pas
construire de vérification serveur.**

## C.5 — Pourquoi le coût est nul

`user_ludic_state` est **déjà écrit** à chaque validation (pour `wallCounts`) et à chaque
roulette relevée. **Ajouter `weeklyMissions` à la même écriture ne coûte rien.**

⚠️ **`wallCounts` est écrit dans la transaction partagée** (`flushClassementWrite`). Si
`weeklyMissions` y est ajouté, **la référence doit aller dans la liste des lectures, jamais
dans un `get()` en ligne** — c'est exactement la configuration du bug de V2.46. Le helper
restructuré en V2.48 impose l'ordre par sa signature ; il suffit de ne pas le contourner.

Les évaluations se font **au moment du clic**, avec ce qui est déjà en mémoire : couleur et
mur du bloc, niveau figé, nombre d'essais. **Aucune lecture.**

M8 est évaluée dans le gestionnaire de la roulette, qui écrit déjà `user_ludic_state`.

## C.6 — Le badge : attention à une collision réelle

⚠️ **À vérifier avant d'implémenter.**

`ClientStats.tsx` parcourt tous les badges `type: 'automatic'` et les évalue avec
`computeBadgeActive({color, criteria}, ...)`. Un badge de mission **n'a pas de couleur**.

**Risque** : selon le comportement de `computeBadgeActive` face à un badge sans
`criteria.color`, il pourrait être considéré actif et **auto-attribué immédiatement à tout
le monde**. Les badges manuels existants (`badge-debutant` et consorts) n'ont pas de critère
non plus et sont « toujours actifs » — mais ils ne sont pas `type: 'automatic'`, donc jamais
évalués par cette boucle.

**Solution recommandée** : un **type distinct**, par exemple `type: 'mission'`, exclu de la
boucle d'auto-attribution couleur et attribué par son propre chemin.

Conséquence sur `firestore.rules` : la règle d'auto-attribution de V2.53 exige
`get(badges/$(badgeId)).data.type == "automatic"`. **Elle doit accepter `"mission"`**, avec
les mêmes protections (identifiant canonique `uid_badgeId`, `awardedBy: "auto"`, clés
restreintes, `update/delete: if false`).

**Un seul badge**, attribué à la première grille complétée — pas un badge par semaine, qui
en créerait un nombre illimité. Le compteur `weeklyMissionsCompleted` porte la répétition,
et c'est lui qu'on affiche : *« 7 semaines complétées »*.

## C.7 — Catégories de murs et règle des murs enfants ✅ TRANCHÉ

### Une seule structure, pas trois listes

Quatre missions dépendent de la nature du mur (M2, M5, M6, M7) **et** toutes les quatre
dépendent de la règle enfants ci-dessous. Une structure unique dans `gymConfig.ts`, plutôt
que trois tableaux parallèles :

```
wallCategories: {
  "<valeur exacte de boulders.wall>": { category: 'devers' | 'reta' | 'dalle' | 'autre',
                                        kidsOnly: boolean },
  ...
}
```

- M5 → `category === 'devers'` (dévers et toit)
- M6 → `category === 'reta'` (rétablissement)
- M7 → `category === 'dalle'` (Güllich et Dalle)
- M2 → tous les murs, filtrés par `kidsOnly` (ci-dessous)

Un seul endroit à maintenir, un seul endroit à relire quand la salle change un mur — et un
seul endroit à adapter pour le fork **Grimpe !**, où la géographie sera tout autre.

### La règle enfants

**Décision utilisateur (24/09) : les murs enfants ne comptent que pour les grimpeurs de
moins de 10 ans.**

- Grimpeur **< 10 ans** : tous les murs comptent, enfants compris.
- Grimpeur **≥ 10 ans** : les murs `kidsOnly` **ne comptent pour aucune mission** — ni pour
  les 4 murs de M2, ni pour M5/M6/M7.

⚠️ **Cette règle ne concerne pas que M2.** « Réta Enfants » ne doit pas valider M6 pour un
adulte, sinon la mission d'engagement se valide sur un mur d'initiation. Même chose pour une
éventuelle dalle ou un dévers enfants. C'est le point le plus facile à rater à
l'implémentation.

### Dérivation de l'âge

**Un seul point de dérivation : `getSeasonAge(dateOfBirth, legacyAge, ref)` dans
`utils/ageCategory.ts`.** Ne pas lire `dateOfBirth` directement, ne pas recalculer un âge
ailleurs — c'est la leçon du chantier date de naissance.

**Âge figé à l'ouverture de la semaine**, dans `weeklyMissions.countsChildWalls` (§C.4),
pour la même raison que le niveau : une grille dont les règles changent en cours de semaine
est incompréhensible. Accessoirement, cela évite d'appeler `getSeasonAge` à chaque
évaluation.

**Âge inconnu → traité comme adulte** (`countsChildWalls: false`). Un adulte sans date de
naissance qui validerait ses missions dans la grotte des enfants viderait la mécanique de
son sens ; l'inverse — un enfant sans date de naissance — reste capable de compléter sa
grille sur les murs adultes. Le chantier date de naissance a déjà traité les comptes
concernés, le cas doit être résiduel.

### ⚠️ Avant d'écrire la structure

**Relever les valeurs exactes de `boulders.wall` en base.** Le chantier roulette a déjà buté
là-dessus : les libellés informels (« grotte », « 40 degrés ») ne correspondaient pas aux
valeurs réellement stockées, et il avait fallu les faire comparer côte à côte par
l'utilisateur. **Refaire cette vérification**, ne rien recopier depuis ce document — y
compris « Réta Enfants » et « Grotte des enfants », qui sont ici des exemples et non des
valeurs vérifiées.

## C.8 — Interface

- Grille de **8 cases pour tout le monde**, état accompli / en cours. Le grimpeur au
  plafond voit **M4 bis** à la place de M4 (§C.3.b), avec un bouton déclaratif identique à
  celui de la roulette.
- **Le niveau figé doit être visible** : « missions calées sur ton niveau rouge » — sinon un
  grimpeur qui monte en cours de semaine ne comprendra pas pourquoi ses cases ne bougent
  pas.
- M2 affiche la progression (2 murs sur 4), les autres sont binaires.
- À la complétion : badge, et incrément du compteur de semaines.
- Réinitialisation annoncée : « nouvelle grille lundi ».

## C.9 — Vérification

- **Utilitaire pur** pour l'évaluation des 8 missions, testé unitairement : chaque mission
  isolément, le recoupement M1/M3, plancher et plafond de niveau, changement de semaine ISO,
  M2 avec doublons de murs.
- **Cas explicitement à couvrir**, parce qu'ils viennent des arbitrages du 24/09 et
  qu'aucun ne se révélera en usage courant :
  - grimpeur au plafond → la grille présente **M4 bis** et non M4, et reste complétable ;
  - grimpeur **< 10 ans** → un résultat sur un mur `kidsOnly` compte pour M2 **et** pour
    M6 ;
  - grimpeur **≥ 10 ans** → le même résultat ne compte **ni** pour M2 **ni** pour M6 ;
  - **âge inconnu** → traité comme adulte ;
  - anniversaire franchissant les 10 ans **en cours de semaine** → `countsChildWalls` reste
    figé jusqu'au lundi suivant.
- **Assertion e2e** sur `weeklyMissions` après validation d'un bloc — `weeklyMissionsCompleted`
  est un compteur incrémental, la règle du §4 de `PROCESSUS-erreurs-avalees.md` s'applique.
- Test de règle sur l'attribution du badge de mission (§C.6).
- **Vérifier explicitement qu'aucune lecture n'est ajoutée** au parcours de validation.

---

## §D — Points ouverts par ailleurs

- **Purge de l'état ludique** : conditions réunies depuis le 17/09 (aucune trace de vieux
  code, aucun champ non migré). L'utilisateur attend fin septembre. ⚠️ **Ne pas relancer
  `backfill-ludic-state.js --fix` d'ici là** — il écraserait des valeurs plus récentes par
  des valeurs figées. Deux correctifs recommandés sur ce script : un refus de `--fix` si un
  `user_ludic_state.updated_at` est postérieur au dernier passage, et une comparaison
  normalisant l'ordre des clés (10 faux positifs sur 11 au dernier contrôle).
- **Clic « Redémarrer la saison »** : reporté à fin septembre, après l'afflux lié à la
  publicité sortie le 17/09. Vérifier le nombre de profils avant.
- **Correctif du bandeau** (`registerType: 'prompt'`) — non observable à la transition
  suivante, il faut attendre celle d'après.
- **`PLAN-premiers-ascensionnistes.md`** : commencer par son §2 (expressivité des règles).
- **Script npm unique bump → build → deploy**, pour supprimer l'ordre fautif qui a produit
  l'incident de version du 17/09.
- Défis `fenetre` / `bloc_designe` : en production sans e2e navigateur.
- Chantier droits d'accès — en attente du gérant.
- `topo-blocabrac.pdf` sans police Dosis ; `aide-connexion-installation.html` hors charte.
- Un projet Firebase par salle vs mutualisé ; fork « Grimpe ! ».
- Sauvegarde durable des images Cloudinary (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` **avant** le build, puis déployer (leçon du 17/09).
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout compteur incrémental doit avoir une assertion e2e sur sa valeur résultante.
- Toute requête « tous les utilisateurs de rôle X » fusionne `roles[]` et `role` hérité.
- Les valeurs propres à la salle (couleurs, murs, vocabulaire) vivent dans `gymConfig.ts`.
