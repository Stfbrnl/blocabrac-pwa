# Handoff — Bloc Roulette V2.44, cheminement pour relecture

> Rédigé le 18/08/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur / ClaudeNav). Décrit le cheminement de conception → implémentation du
> Bloc Roulette (`CONCEPTION-roulette-et-defis.md`, Partie 1, étapes 1+2+3 du §3),
> pour relecture — pas seulement le résultat mais les points où j'ai dû trancher
> moi-même une ambiguïté du document source.
>
> Committé, poussé et déployé : `9cf7db6` → `blocabrac.web.app`. Version V2.44.
> Défis entre potes (Partie 2 du document) non traités, chantier séparé.

---

## Résumé en trois phrases

Le document de conception (rédigé par toi le 17/08) était volontairement flou sur
plusieurs points d'algorithme (pondération D/G, ordre d'élargissement, portée du
filtre "déjà validé") — j'ai tranché chacun avec l'utilisateur avant de coder plutôt
que de deviner, et documenté chaque décision en commentaire dans le code. Le tirage
lui-même est un module pur (`utils/roulette.ts`, zéro import Firestore, 20 tests
unitaires) ; le seul coût Firestore réel du chantier est un nouveau compteur privé
(`users.wallCounts`), greffé dans une transaction qui existait déjà. Rien de neuf côté
`firestore.rules` — la règle générique qui autorise déjà un client à modifier son
propre document `users` sur n'importe quel champ non verrouillé suffisait.

---

## 1. Ce que le document supposait à tort

Le §1.7.A du document posait comme un prérequis à vérifier « `boulders` porte-t-il un
champ de mur ? » et envisageait, si non, un ajout de schéma + saisie ouvreur. J'ai
vérifié avant de coder quoi que ce soit : **`boulders.wall` existe déjà**, renseigné
depuis toujours via l'URL `/ouvreur/daily-boulders/:wall` de `DailyBoulderForm.tsx`.
Seul le second prérequis (§1.7.B, un compteur par mur) restait réel. Ça a évité un
chantier de schéma + formulaire qui n'avait pas lieu d'être — je le signale
explicitement parce que c'est le genre d'écart entre conception et code réel que ta
relecture attrape d'habitude, autant le documenter moi-même cette fois.

## 2. Ambiguïtés tranchées avec l'utilisateur (pas seules par moi)

Le document listait lui-même plusieurs points comme non tranchés. Je ne les ai pas
comblés par supposition — je suis passé par `AskUserQuestion` puis j'ai écrit les
réponses dans le plan avant de coder. Trois décisions structurantes :

- **Portée du filtre « déjà validé »** (familles A/F) : rester à zéro lecture
  Firestore au tirage (dérivé de `successResults`, donc limité à la session en
  cours) plutôt qu'ajouter un `getDocs` sur `client_boulder_results` au montage.
  L'utilisateur a choisi le zéro-lecture. **C'est le compromis le plus significatif
  du chantier** : la proposition A2 (« un bloc que tu n'as jamais validé ») ne sait en
  réalité dire que « jamais validé cette session » — un grimpeur qui rouvre l'appli le
  lendemain peut se voir representer un bloc qu'il a réellement déjà validé la veille.
  Assumé, pas caché : commenté dans `roulette.ts` et dans `CLAUDE.md`.
- **Réconciliation de `wallCounts`** : pas de script dédié, contrairement à
  `colorCounts`/`classement_profiles`. Justification retenue : le champ est privé
  (`users`, pas un miroir public) et purement ludique — aucun classement, aucun badge
  n'en dépend, une dérive éventuelle ne produit qu'une suggestion de mur légèrement
  mal ciblée.
- **Ordre des murs** : le document donnait un ordre circulaire sous des libellés
  informels ("grotte", "40 degrés"...) qui ne correspondent pas aux valeurs réelles en
  base. Je les ai fait comparer explicitement côte à côte par l'utilisateur avant
  d'écrire quoi que ce soit dans `gymConfig.ts`, pour éviter une correspondance
  fausse silencieuse.

## 3. Ambiguïtés que j'ai tranchées seul (implémentation), à relire

Ici je n'ai pas reposé la question à l'utilisateur — ce sont des choix d'algorithme
qui découlent directement du texte du document sans changer le comportement perçu.
**C'est la partie qui mérite le plus ta relecture**, parce que le document ne les
spécifiait pas assez pour qu'il y ait une seule lecture possible :

- **D et G ne sont pas un troisième axe de pondération.** Le tirage se fait en deux
  temps indépendants : (1) tier de niveau via `pickLevelTarget` (70/20/10), (2) tirage
  uniforme parmi *toutes* les entrées du catalogue dont `levelTarget` correspond à ce
  tier — D et G y sont mélangées avec A/B/C/F/E plutôt que de recevoir un budget de
  probabilité séparé. Concrètement, D/G sortent avec une fréquence proportionnelle à
  leur nombre d'entrées dans le pool du tier tiré, pas avec un pourcentage dédié. Le
  document ne donnait aucun chiffre pour elles — j'ai choisi la règle la plus simple
  plutôt que d'en inventer un.
- **Ordre d'élargissement progressif** (§1.4, liste éligible vide) : j'ai choisi
  couleur d'abord (élargir aux couleurs voisines dans `levelOrder`), puis seulement
  ensuite retirer le filtre « déjà validé ». Le document dit "élargir progressivement"
  sans préciser l'ordre des deux étapes — mon choix part de l'idée que la couleur est
  la contrainte la plus souvent bloquante (peu de blocs à une couleur donnée sur le
  jour), donc la lever en premier redonne le plus de chances d'un tirage pertinent
  avant de revenir sur la contrainte de nouveauté.
- **F reste soumise au filtre "déjà validé", contrairement à B/C/E.** Le §1.4 du
  document dit littéralement "sauf familles B, C, E" — j'ai pris ça au pied de la
  lettre malgré que F ("sans échec") soit listée comme "partiellement vérifiable" dans
  le même paragraphe où E est qualifiée de "toujours en réussite partielle" : un flash
  ou une série sans échec n'a de sens que sur un bloc pas encore acquis, donc F reste
  filtrée. Vérifie que cette lecture te semble la bonne — c'est une extrapolation du
  texte, pas une citation directe.
- **`resolveTargetColor` au plafond retombe sur `'max'`, pas sur un état d'erreur.**
  Quand le tier tiré est `max+1` mais que le grimpeur est déjà à la couleur la plus
  haute (`rose`), la fonction renvoie quand même une couleur valide (`appliedTarget:
  'max'`) plutôt que `null`, et signale l'exclusion de la famille E via
  `levelExcludedE: true` côté `DrawResult`. Choix : ne jamais renvoyer "rien" au
  tirage normal, réserver le cas `null` à la seule roulette de la mort (qui, elle, n'a
  explicitement pas de repli par construction du document, "son intérêt tient à sa
  rareté").

## 4. Ce qui est vérifié, et comment

- **20 tests unitaires** (`utils/roulette.test.ts`, RNG injecté pour déterminisme) :
  bornes exactes de la pondération 70/20/90, plancher/plafond de `resolveTargetColor`
  (y compris niveau absent), exclusion "déjà validé" pour A mais pas B/C/E, exclusion
  pour F, exclusion de la famille E au plafond (boucle de 50 tirages), élargissement
  progressif (couleur absente, secteur entièrement démonté/validé), anti-lassitude
  (seul id non récent systématiquement tiré), `leastVisitedWall` (compte le plus bas +
  égalité), `drawDeathProposal` (pas de repli, `null` explicite).
- **Vérification structurelle de la gratuité** (§1.9 du document, "vérifier
  explicitement qu'aucune écriture Firestore n'est déclenchée") : pas un test
  automatisé — relecture directe, confirmée par `grep firebase` sur `roulette.ts` et
  `RouletteDialog.tsx` (seule occurrence : le commentaire d'en-tête qui l'interdit).
  `RouletteDialog.tsx` ne reçoit aucun callback d'écriture pour la famille E — le
  bouton "C'est fait" n'appelle que `onClose`.
- **`npm run build` / `npm run lint` / `npm test`** : tous verts, 130 tests au total
  (110 préexistants + 20 nouveaux) sans régression.
- **Pas de `npm run test:rules`** : aucune règle Firestore n'a changé (la règle
  existante `request.auth.uid == userId` sur `users/{userId}` couvrait déjà l'écriture
  de `wallCounts`, un champ non listé dans les clés verrouillées) — pas de nouveau
  chemin de permission à vérifier par ce biais.

## 5. Ce qui reste ouvert, volontairement

- **Relecture ouvreur/gérant du catalogue et de l'ordre des murs** : le document
  source le demandait explicitement ("à faire relire par l'ouvreur avant
  implémentation"). Décision actée avec l'utilisateur : livrer maintenant, ajuster
  après coup — le catalogue est un seul tableau (`CATALOG` dans `roulette.ts`), facile
  à corriger sans toucher à l'algorithme. Trois propositions du catalogue ont déjà été
  corrigées en cours de route sur relecture utilisateur (A1, A5, B7, B13) — voir le
  commit pour le détail des textes.
- **Le compromis "déjà validé = session uniquement"** (point 2 ci-dessus) est le plus
  susceptible de générer un signalement utilisateur du type "il m'a proposé un bloc
  que j'ai déjà fait" — attendu, documenté, pas un bug si ça arrive.
- **Défis entre potes (Partie 2 du document)** : pas commencé. Nouvelle collection
  `challenges`, nouvelles règles Firestore, chantier de taille comparable à ce qui
  vient d'être livré — à traiter séparément.

## Question pour toi

Le point 3 ci-dessus (pondération D/G, ordre d'élargissement, filtre F) est celui où
j'ai le plus dû improviser une lecture du document plutôt que suivre une instruction
explicite. Si l'un de ces choix te semble aller à l'encontre de l'intention du
document que tu as rédigé, dis-le — c'est un simple changement dans `roulette.ts`,
couvert par les tests existants, sans redesign.
