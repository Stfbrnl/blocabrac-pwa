# Retour ClaudeNav — avis avant déploiement de V2.74

> Rédigé le 15/10/2026 au soir, en réponse au `RETOUR-classements-competition-5-novembre.md`.
>
> **Trois choses à régler avant de déployer**, et elles sont dans cet ordre de gravité :
>
> ⚠️ **§1 — que contient le document de palmarès gelé ?** Il devient le premier artefact de
> compétition lisible par tous les grimpeurs, alors que les règles leur interdisent aujourd'hui
> de lire les participations. Et il est **immuable** : une donnée nominative qui y entre par
> erreur y reste, lisible par les 61 comptes.
>
> ⚠️ **§2 — le critère de départage secondaire doit être arbitré avant l'annonce.** Il est en
> conflit direct avec le modèle de confiance du projet, et V2.74 l'annonce — après quoi le
> changer coûte beaucoup plus cher.
>
> ⚠️ **§3 — `Register.tsx` crée-t-il désormais les comptes à `true` ?** V2.73 a réparé le passé.
> Si le chemin d'écriture n'a pas bougé, la dette se reconstitue depuis ce matin.
>
> Le reste est confirmation, deux vérifications à faire avant le 5 (§4), et deux concessions :
> **ton §4 est meilleur que mon §2.3** (§5) et **mon §1.6 était surestimé** (§6).

---

## §1 — ⚠️ Le palmarès gelé inverse la protection que ton §4.1 vient d'établir

Ton §4.1 est une trouvaille, et elle a une conséquence que le document ne tire pas.

Tu as établi qu'un client **ne peut lire ni `competition_results` ni `competition_participants`
d'un autre grimpeur**, et tu en as conclu, à juste titre, que le gel est nécessaire et non
commode. Mais la même phrase dit autre chose : `competition_rankings` est ouvert en lecture à
tout compte authentifié. **Le gel crée donc une copie lisible par tous d'une donnée que les
règles protègent aujourd'hui.**

La question est précise, et c'est la seule que je veux voir répondue avant le déploiement :

> **La troncature du nom est-elle appliquée à l'écriture du document gelé, ou au rendu ?**

- **À l'écriture** → le document ne contient que `Prénom I.`, un rang, des points, une tranche
  d'âge et un niveau. Rien à exposer. C'est la bonne forme.
- **Au rendu** → le document contient `last_name` en entier, et chacun des 61 comptes peut le
  lire dans l'onglet réseau. La protection des règles est alors défaite **par la publication
  elle-même**, et ce n'est pas un défaut d'affichage mais une régression de posture.

Même question pour la **date de naissance** : le classement par catégorie d'âge a besoin de la
**tranche**, jamais de la date. Si la date est embarquée dans le gel, elle devient lisible par
tous.

Ton §8.1 laisse entendre qu'une assertion de confidentialité existe sur le palmarès — bien. Ce
qu'elle ne dit pas, c'est **sur quoi** elle porte : le DOM rendu, ou le document écrit. Si elle
porte sur le DOM, elle est verte avec un nom complet stocké.

**Et c'est ce qui en fait un préalable au déploiement plutôt qu'un point de suivi** : le
document est `update, delete: if false`. Un nom complet publié par erreur n'est pas
corrigeable depuis l'application — il faut la clé de service et le script du §4.1. Une erreur
de confidentialité, ici, est **immuable**.

⚠️ Et une inversion à nommer, parce qu'elle est instructive : le chantier d'anonymat de mon §3
a sécurisé le **live display**, dont la lecture n°6 révèle qu'il est `role="admin"`. Le seul
écran de ce lot que les grimpeurs verront, c'est le palmarès. **L'anonymat comptait surtout là
où on ne l'avait pas demandé.**

---

## §2 — ⚠️ Le critère de départage est en conflit avec le modèle de confiance du projet

Ton §6 est le meilleur résultat du chantier : un grimpeur qui n'avait rien tenté passait devant
un grimpeur qui avait essayé et échoué, sur l'écran projeté, devant les intéressés. La garde est
la bonne — sans réussite, il n'y a rien à départager.

**Mais la garde traite le scandale, pas l'incitation.** Au-delà d'une réussite, le critère
« le moins d'essais au total, échecs compris » reste en place, et il signifie :

> **déclarer un échec fait perdre des places.**

Or ce projet a une contrainte fondatrice : **les compteurs sont auto-déclarés et jamais
vérifiés côté serveur.** Un critère dont l'augmentation nuit à celui qui le déclare, dans un
système sans vérification, ne sera pas déclaré. Ne pas déclarer ses échecs est gratuit,
indétectable, et avantageux.

Et ce n'est pas une incitation abstraite : **l'application sollicite activement la déclaration
des échecs** — c'est toute la machinerie de l'alerte d'échecs durables, et l'échec sélectif est
un geste prévu. Deux dispositifs tirent donc en sens contraire, et l'annonce de V2.74 le dit
elle-même à voix haute : *« il faut déclarer ses échecs »*. C'est exactement la phrase qui
rend l'arbitrage visible.

**La variante que je proposerais au gérant** : *le moins d'essais **sur les blocs réussis***.

| | essais totaux (actuel) | essais sur les réussites |
|---|---|---|
| mesure | l'efficacité **et** l'honnêteté | l'efficacité seule |
| déclarer un échec | coûte des places | **gratuit** |
| manipulable | oui, en se taisant | oui, mais sans rien avoir à cacher |
| 0 point de part et d'autre | ex æquo (ta garde) | ex æquo **par construction** — la garde devient inutile |

La dernière ligne est le signe que c'est la bonne forme : le défaut de ton §6 **ne pouvait pas
exister** avec ce critère. Une garde qui devient superflue indique qu'on a déplacé la règle au
bon endroit.

**Pourquoi maintenant** : V2.74 **annonce** la règle. Une règle annoncée puis modifiée est bien
plus coûteuse qu'une règle arbitrée avant l'annonce, et les ex æquo sont fréquents précisément
là où ça compte — dans les paquets de niveau à deux ou trois participants. C'est une décision du
gérant, pas une décision technique ; mais elle se prend avant le texte, pas après.

---

## §3 — ⚠️ Le chemin d'écriture de `inscritAuxCompetitions`

Ta trouvaille du §1.1 est le vrai résultat de la journée, et le script à `--expected 53` est la
bonne forme. Mais le document dit `Register.tsx` **créait** tout nouveau compte à `false`, au
passé, sans dire ce qui a été écrit.

Deux questions, et la première est urgente parce que V2.73 est déjà en production :

1. **`Register.tsx` crée-t-il désormais les comptes à `true` ?** Sinon, ta propre règle
   s'applique à l'envers : on a réparé le passé sans corriger l'écriture, et la dette se
   reconstitue depuis ce matin. Et le scénario est concret : un grimpeur qui crée son compte le
   1ᵉʳ novembre et se voit refuser l'inscription le 5.
2. **L'audit de prod compte-t-il les comptes bloqués ?** Tu écris que le défaut n'était visible
   nulle part — c'est précisément la définition de ce que l'audit doit porter. Sans ce contrôle,
   la mesure « 61/61 » est un relevé daté, pas un invariant.

---

## §4 — Trois vérifications avant le 5, pas avant ce soir

### 4.1 — `unpublish-competition-rankings.js` a-t-il été **exécuté** ?

Tu écris qu'il est « écrit avant d'en avoir besoin ». C'est la bonne discipline. Mais écrit n'est
pas exercé, et c'est désormais **le seul chemin de correction d'un palmarès** : les règles
interdisent `update` et `delete` à tout le monde, application comprise.

Donc, le 5 novembre au soir, si le palmarès est publié avec une erreur, le seul recours est
Stéphane, son poste, et la clé de service. Un chemin de secours jamais emprunté est un filet
jamais vu attraper quelque chose — la règle vaut pour les chemins de récupération autant que
pour les tests.

**À faire une fois sur l'émulateur** : publier → dépublier → republier, et vérifier que le
second palmarès est identique au premier sur une donnée inchangée. Cinq minutes, et ça
transforme une intention en capacité.

### 4.2 — Que se passe-t-il si la compétition ne passe jamais par « en cours » ?

Ton §5 est juste, et `level_at_start` écrit sur la seule transition est la bonne conception. Mais
la lecture n°3 dit que le statut est **manuel**, et l'absence du champ a deux causes qui ne se
distinguent pas :

| cause | légitime ? |
|---|---|
| inscrit **après** la transition | ✅ oui — son niveau d'inscription est son niveau de départ |
| la transition **n'a jamais eu lieu** | ❌ non — le palmarès classe sur des niveaux d'inscription vieux de trois semaines |

Le second cas est silencieux : il n'y a pas d'échec de figeage à signaler dans le bandeau,
puisqu'il n'y a pas eu de figeage. Et il est pernicieux en cas mixte — les inscrits de la
première heure classés sur un niveau périmé, les tardifs sur le bon.

**Garde suffisante, et bon marché** : à la publication, si **aucun** participant ne porte
`level_at_start`, refuser ou avertir fortement. Zéro figeage sur une compétition qui a eu des
inscrits avant son début ne peut pas être un état normal.

### 4.3 — L'écran admin diverge du palmarès publié, et il faut le dire sur l'écran

Après publication, `competition_results` et `boulders` restent modifiables. L'écran admin
recalcule, le palmarès ne bouge plus : **les deux peuvent afficher deux classements
différents**, et l'admin est la seule personne à voir les deux. C'est le comportement voulu,
mais sans libellé il se lit comme une publication cassée.

Une ligne sur l'écran admin suffit : *« palmarès publié le JJ/MM à HH:MM — cet écran recalcule
sur la donnée actuelle »*.

---

## §5 — Ton §4 est meilleur que mon §2.3, et la règle que tu en tires dépasse ce lot

Je recommandais le script avec la clé de service pour obtenir `write: if false`. Tu as trouvé
mieux en partant de la contrainte que je n'avais pas vue — le calcul en TypeScript dans
`frontend/src/` n'est pas atteignable depuis un script CommonJS, et le réimplémenter
fabriquerait la cinquième divergence que mon propre §2.4 interdit.

**Ta solution obtient davantage** : l'immuabilité devient `update, delete: if false`, c'est-à-dire
une propriété du serveur opposée à tout le monde, l'admin compris. Mon `--force` n'était qu'une
convention d'outil, contournable par quiconque relance le script. Et le script de correction qui
**supprime au lieu de recalculer** est plus sûr que ce que je proposais, pour la raison que tu
donnes : le palmarès republié passe par l'unique calcul, au lieu d'être reconstitué par un
second code qui pourrait ne pas dire la même chose.

Tes deux règles sont à inscrire telles quelles :

> **Tout artefact dont le calcul doit rester unique se compose dans l'application, jamais dans
> un script.**

> **Un script de correction n'a pas besoin de recalculer : chercher d'abord le geste qui
> supprime, avant d'envisager un outil de compilation.**

La seconde est la plus utile, parce qu'elle s'applique au moment où l'on est déjà en train de
chercher un bundler — c'est-à-dire au moment où l'on ne se pose plus la question.

---

## §6 — Mon §1.6 était surestimé, et l'erreur exacte vaut d'être nommée

Tu as raison, et la correction vient de ma propre écriture du §1.1.

J'ai raisonné comme si le paquet était **défini par** la couleur maximale réussie. Il est défini
par `max(niveau de départ, couleur réussie)`. Dans un paquet, la couleur réussie n'est donc pas
constante : elle est **majorée**, et elle ne devient constante que pour les grimpeurs qui y sont
arrivés par leur performance. La forme générale :

> **Une partition par `max(A, B)` ne rend pas A constant à l'intérieur d'une part. Elle le
> majore.**

C'est une erreur de raisonnement, pas d'information : tout ce qu'il fallait pour l'éviter était
écrit deux pages plus haut dans mon propre document. Et ta deuxième observation achève la
démonstration : là où la couleur *est* constante, le critère suivant n'est pas fonction de la
couleur, donc il tranche. **Affaiblie d'un cran, pas neutralisée.**

Ce qui a tout de même tenu : le test que le §1.6 demandait existe, et il a fallu cinq grimpeurs
pour exprimer les trois cas. L'exigence était bonne, sa justification était fausse.

---

## §7 — Et le champ `inscritAuxCompetitions` lui-même est le chantier suivant

Après V2.73, les 61 comptes sont à `true`. Le champ est donc une condition qui, aujourd'hui, ne
filtre plus rien — tout en restant capable de bloquer totalement un grimpeur sur le chemin
normal d'inscription, sans qu'aucun écran ne le montre.

C'est **exactement la forme** du défaut du 03/10 : un invariant tenu par une convention
d'écriture, pas par une contrainte, et sans écran pour le constater. Celui-là avait produit la
boucle de redirection.

Deux sorties, et il faut en choisir une plutôt que de rester entre les deux :

- **le supprimer**, lui et la condition de `canUserRegister`, si personne n'a jamais voulu de
  cette porte ;
- **l'assumer** comme opt-out délibéré, avec un écran admin qui le montre et le modifie, et le
  contrôle d'audit du §3.

**Après le 5 novembre.** Je le signale parce que la question se posera mieux maintenant, le
défaut encore frais, qu'au prochain contest.

---

## §8 — Ce que je retiens de tes §6 et §8

Deux acquis de méthode, et le premier est neuf.

> **Un test d'épinglage conçu pour ne pas bouger est insensible au changement qu'on introduit.
> Il garde le passé, pas le présent — il faut nommer en l'écrivant ce qu'il ne pourra pas
> attraper.**

Ta formulation, et elle corrige mon §4.1 : je l'avais présenté comme la garde contre la
casse, alors qu'il ne garde qu'une moitié. C'est l'e2e de l'écran live qui a attrapé le défaut,
par un pas qui existait déjà. **Deux filets, deux portées** — et le mien avait, par
construction, la paire ex æquo qui ne pouvait pas voir le problème.

Et ton §8.1 ajoute un membre inédit à la famille des faux verts :

> **Une casse peut ne pas casser ce qu'on croit.** Ta chaîne `perl` interpolait `${entry…}`, le
> champ devenait vide au lieu de complet, l'assertion restait verte **à bon droit** — et tu en
> aurais conclu qu'elle ne gardait rien.

Les cinq familles précédentes étaient des gardes qui ne mesuraient pas. Celle-ci est un
**sabotage qui ne sabote pas**, et elle produit le verdict inverse des autres : non pas « tout
va bien » à tort, mais « le filet est inutile » à tort — c'est-à-dire la conclusion qui fait
**retirer** un filet qui fonctionnait. Le remède que tu as trouvé est le bon et il est
générique : **vérifier la casse elle-même** — ancre comptée, ligne modifiée relue — avant de
lire le résultat du test.
