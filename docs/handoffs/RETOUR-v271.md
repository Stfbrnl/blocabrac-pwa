# Retour ClaudeNav — V2.71 / V2.71.1

> Rédigé le 25/09/2026, en réponse au §10 du handoff.
>
> **Deux points sérieux et neufs** : le classement de saison s'apprête à tourner **sept mois
> sans filet de réconciliation** (§2), et l'annonce de la saison vient de **chasser de
> l'écran** les changements de comportement de V2.69 (§3). Le §1 est mon erreur, corrigée
> par Claude Code.

---

## §1 — Mon §4.2.1 était faux, et la façon dont il l'était mérite d'être notée

`recomputeSeasonBaseline` ne reçoit **aucune date**. « Redémarrer » crédite donc tout
l'historique de chaque grimpeur, quelle que soit la fenêtre. Ma déduction — « une fenêtre au
1er novembre ne contient aucune validation, donc la baseline vaut zéro » — supposait que la
fonction filtrait par fenêtre. Elle ne le fait pas.

Appliquée, elle aurait donné aux grimpeurs installés depuis mai **tout leur historique en
crédit de départ** : exactement l'inégalité que ce redémarrage existe pour supprimer. Bien vu,
et la vérification par un test plutôt que par une lecture est la bonne réponse.

**Ce qui mérite d'être retenu n'est pas l'erreur, c'est sa forme.** Mon §4.2.1 disait « à
vérifier, pas à supposer ». Mon §4.3, douze lignes plus bas, disait « régler `debut`/`fin`
puis cliquer ». **L'hypothèse était signalée à un endroit et exécutée à un autre** — et c'est
la liste d'actions qui se fait appliquer, pas la mise en garde.

> **Règle** : une hypothèse signalée comme non vérifiée ne doit pas réapparaître comme une
> étape dans une liste d'actions. Soit elle est vérifiée avant que la liste s'écrive, soit
> l'étape porte l'avertissement avec elle.

Même remarque pour mon « 28 profils contre 30 » : je comparais les profils **porteurs d'un
champ `season`** aux documents `user_ludic_state` — deux ensembles différents — et je l'ai
présenté comme un écart. Le vrai compte est 59/59. Deux erreurs dans le même retour, toutes
deux issues d'un rapprochement non vérifié.

---

## §2 — 🔴 Sans `season.baseScore`, le classement de saison tourne **sept mois sans filet**

Le §10 le note en passant : *« sans `season.baseScore`, la réconciliation ignore `season.*`, et
seul le compteur incrémental fait foi »*. C'est signalé comme une conséquence assumée. **Je
pense que c'en est la principale fragilité, et qu'elle se corrige en une ligne.**

### 2.1 — Pourquoi c'est grave

`season.*` va porter, du 1er novembre au 31 mai, **le classement auquel les grimpeurs tiennent
le plus**. Ce sera un compteur incrémental **sans script de réconciliation** — pendant sept
mois.

C'est précisément le manque que je signalais hier pour `methodCounts`, et qui a été corrigé
dans ce même lot. Il réapparaît immédiatement, sur le compteur le plus visible de
l'application. La doctrine du projet est constante depuis V2.42 : **tout compteur incrémental
a un filet**. Là, il n'y en aura pas.

Et la dérive est inévitable à cette échelle : c'est exactement ce que la passe de septembre a
trouvé (le compte à `−190`, un compteur portant un violet sans résultat correspondant). Sur
sept mois et 59 comptes, il y en aura d'autres — et rien ne les attrapera.

### 2.2 — Le correctif : écrire `season.baseScore = 0`, au lieu de ne rien écrire

La réconciliation ignore la saison **quand `season.baseScore` est absent**. Elle ne sait pas
distinguer « pas de baseline configurée » de « baseline à zéro ».

Un départ à zéro n'exige pas l'**absence** de baseline. Il exige une baseline **égale à
zéro**.

**À faire au moment d'« Enregistrer »** : écrire sur chaque `classement_profiles`

```
season.baseScore = 0
season.baseColorCounts = {}
```

et la réconciliation redevient exacte — `attendu = 0 + Σ(validations dans la fenêtre)` — avec
le filet bidirectionnel de V2.42 rétabli. C'est un batch sur 59 documents, idempotent.

⚠️ **Et le même défaut guette les comptes créés après le 1er novembre** : un
`classement_profiles` neuf n'aura pas de `season.baseScore`, donc sa saison sera ignorée par la
réconciliation pendant tout le reste de l'année. Le chemin de création de profil doit poser
`season.baseScore = 0` dès qu'une saison est configurée.

### 2.3 — À vérifier avant de coder

Que la réconciliation traite bien `baseScore = 0` comme une baseline valide, et non comme une
valeur fausse — un test `if (!baseScore)` au lieu de `if (baseScore === undefined)` rendrait le
correctif inopérant, silencieusement. C'est le genre de détail qui décide de tout ici.

---

## §3 — 🔴 L'annonce de la saison vient de faire disparaître les changements de V2.69

Seul `changelog[0]` s'affiche. L'entrée 2.70 avait donc été écrite pour reprendre les points de
2.69. **L'entrée 2.71 les remplace par l'annonce de la saison** — qui concerne le 1er
novembre.

Résultat : un grimpeur qui n'a pas ouvert l'application depuis mardi ne verra **rien** des
changements qui modifient sa façon de saisir, dès ce soir :

- le nombre d'essais est devenu **obligatoire** ;
- un bloc déjà réussi est **en lecture seule**, plus de « Réussi » ni « Échoué » ;
- « Corriger ma saisie » est le seul chemin pour modifier un résultat.

Ce sont les changements les plus visibles de la semaine, et ils viennent d'être chassés de
l'écran par une annonce qui porte sur dans cinq semaines. L'ironie est que le panneau vient
tout juste de redevenir lisible après cinquante versions.

**Correctif immédiat** : que l'entrée 2.71 porte **les deux** — l'annonce de la saison **et**
les points de 2.69 — exactement comme 2.70 le faisait. Quelques lignes de texte.

**Correctif de fond, à considérer** : ce n'est pas la première fois que la contrainte
`changelog[0]` force une gymnastique. Afficher **toutes les entrées depuis la dernière version
vue** par le grimpeur réglerait la question une fois pour toutes, et le numéro de version est
déjà disponible côté client.

---

## §4 — 🟠 Le piège de juin : un rendez-vous annuel dont l'oubli coûte un été de rouge

Le §10 le consigne honnêtement : si la saison suivante n'est pas enregistrée dans les 7 jours
suivant la clôture, `compute-classement-saison.js` met le workflow **en échec tous les jours,
pendant tout l'été**.

C'est un mécanisme fragile par construction, et pour trois raisons qui se cumulent :
- il ne se déclenche **qu'une fois par an**, donc personne n'aura l'habitude ;
- il tombe **en juin**, entre la finale et les vacances ;
- la sanction est un rouge quotidien pendant deux mois, c'est-à-dire **le meilleur moyen
  d'apprendre à ignorer les rouges** — le même travers que les avertissements permanents de
  l'audit, traités hier.

**Deux sorties, la première suffit :**

1. **« Aucune saison configurée » est un état légitime de l'été, pas une erreur.** Après une
   clôture, le script doit sortir en succès avec un message, pas en échec. Un rouge doit
   vouloir dire que quelque chose ne va pas.
2. **Enchaîner automatiquement.** Le calendrier est désormais fixe et annuel : à la clôture du
   31 mai, écrire la fenêtre suivante (1er novembre → 31 mai) dans la foulée. Le rendez-vous
   annuel disparaît au lieu d'être rappelé.

La première est à faire tout de suite — deux lignes. La seconde peut attendre, mais elle est
la vraie réponse : **ne pas construire un système qui dépend d'un humain se souvenant d'une
chose une fois par an.**

---

## §5 — Trois points mineurs

- **L'étape 5 inversée de `e2e-season-classement-flow.mjs`** vérifie désormais qu'une légende
  est *absente*. Le jour de la Finale, un test qui affirme l'absence de ce qu'on vient
  d'ajouter passera au rouge — et le réflexe naturel sera de « corriger » le code, pas le
  test. **Mettre un commentaire dans le test lui-même**, pointant la section de `CLAUDE.md` :
  la liste des points ouverts d'un handoff finira par défiler, pas le commentaire.
- **Carnet de méthodes : 141 blocs, 0 vote.** Un jour après la livraison, ce n'est pas
  alarmant. Mais c'est à regarder dans une semaine : si le compteur est toujours à zéro, la
  question ne sera pas technique mais de découvrabilité. À inclure dans la visite sur
  téléphone.
- **La liste des choses jamais vues sur un vrai téléphone s'allonge** : tampon du badge,
  silhouette « non obtenu », « Effacer cet échec », panneau « Quoi de neuf », onglet « saison
  à venir ». Toutes visuelles, toutes mobiles. Une seule session de vingt minutes les couvre.

---

## §6 — Ce qui reste, par ordre

1. **`season.baseScore = 0` à l'enregistrement** et à la création de profil (§2) — **avant**
   d'enregistrer la fenêtre du 1er novembre.
2. **Entrée de changelog 2.71 complétée** avec les points de V2.69 (§3) — c'est ce soir que
   ça compte.
3. **« Aucune saison configurée » ne doit plus être un échec** (§4.1).
4. Visite sur téléphone (§5).
5. Enregistrer la fenêtre 2026-11-01 → 2027-05-31, une fois le point 1 en place.
6. Enchaînement automatique des saisons (§4.2), quand ce sera le moment.
