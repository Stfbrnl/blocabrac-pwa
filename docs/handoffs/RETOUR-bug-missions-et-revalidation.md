# Retour ClaudeNav — Bug grille de missions + règle de revalidation

> Rédigé le 25/09/2026 par la session Claude (navigateur), en réponse à la §8 de
> `HANDOFF-anecdote-methodes-missions-2026-09-24.md`.
> **Rien à coder avant d'avoir lu le §1.2 (contrôle qui peut invalider le diagnostic) et
> tranché le §2 (A ou B).**

---

## §0 — Verdict en trois lignes

1. **Le diagnostic §8.2 est juste**, et le bug est **plus grave que ne le dit le handoff** :
   il n'est pas occasionnel, il est **structurellement déclenché par deux des huit
   missions**. Voir §1.1.
2. **Un contrôle simple peut l'invalider** — s'il échoue, il y a une seconde cause. À faire
   avant d'écrire le correctif. Voir §1.2.
3. **B est la bonne règle** — une répétition n'est pas une nouvelle mesure (§2.1) — **mais
   sans la fenêtre temporelle** que propose le handoff (§2.2). J'avais d'abord recommandé A
   dans la première version de ce retour ; le §2.0 dit pourquoi c'était faux.

Et une observation qui chapeaute tout : **ce ne sont pas trois bugs, c'en est un seul, vu
trois fois** (§4).

---

## §1 — Question 1 : le diagnostic est-il complet ?

### 1.1 — Il est juste, mais il sous-estime la portée

La chaîne causale est correcte et précisément identifiée : condition de lecture héritée
d'avant le chantier C, `readData.userLudic === undefined`, grille vide reconstruite,
`merge:true` qui ne fusionne pas les **tableaux**. C'est bien la famille V2.46.

Ce que le handoff ne dit pas : **le chemin fautif n'est pas un cas de bord, c'est le chemin
nominal de la mission M4.**

M4 (« tester un niveau max+1 ») se valide explicitement par un **échec**. Un échec ne produit
jamais de `colorCountDelta`, donc jamais de `wallDeltas`, donc jamais de lecture de
`user_ludic_state`. **Tout grimpeur qui fait M4 corrompt sa grille, à chaque fois, par
construction.** M1 par reclic (le cas vécu) est le second déclencheur garanti.

Deux missions sur huit détruisent la grille de façon déterministe. Ce n'est pas « un bug
rencontré lors d'un test », c'est la fonctionnalité qui s'auto-efface dès qu'on l'utilise
comme prévu. Cela change la priorité et, accessoirement, cela explique pourquoi la grille est
restée vide plutôt que partiellement remplie.

### 1.2 — ⚠️ Le contrôle qui peut invalider le diagnostic — à faire avant de coder

Si la cause est bien celle décrite, alors **une nouvelle première réussite** (un bloc jamais
validé, réussi aujourd'hui) produit un `colorCountDelta ≠ 0`, donc un `wallDeltas` non vide,
donc **la lecture a lieu** et la grille doit se remettre à progresser normalement à partir de
zéro.

Or l'utilisateur rapporte une grille **« toujours vide depuis »**.

**Deux lectures possibles**, et il faut savoir laquelle avant d'écrire le correctif :

- soit il n'a pas refait de première réussite depuis — le diagnostic tient, rien à ajouter ;
- soit il en a refait une et la grille est **quand même** restée vide — et alors **il y a une
  seconde cause**, non identifiée, que le correctif proposé ne traitera pas.

**À faire** : valider un bloc jamais réussi sur un compte de test, et regarder si
`weeklyMissions.done` se peuple. Cinq minutes, et ça vaut mieux que de déployer un correctif
qui ne corrige que la moitié du problème. C'est exactement le contrôle qui manquait à V2.46.

### 1.3 — Élargir l'audit : tous les écrivains de `user_ludic_state`, pas seulement ceux des missions

La question posée est « d'autres chemins écrivent-ils `weeklyMissions` ? ». **Ce n'est pas la
bonne question.** La bonne est : **quels chemins écrivent `user_ludic_state` ?** — parce que
le document est partagé, et qu'un écrivain qui ignore `weeklyMissions` peut quand même le
détruire selon *comment* il écrit.

Inventaire à faire, avec deux colonnes pour chacun :

| Écrivain | Compose-t-il un tableau depuis la mémoire ? | `setDoc` avec ou sans `merge` ? |
|---|---|---|
| transaction débouchée partagée (`classementFlushWrites`) | oui — la cause du bug | — |
| `handleMissionM4Bis` | oui | — |
| `incrementRouletteCompleted` | oui | — |
| **écrivain de `weeklyGoalItems`** (objectif personnel) | ? | ? |
| **écrivain de `wallCounts` hors flush, s'il en existe un** | ? | ? |
| tout autre appel à `updateLudicState` | ? | ? |

Les deux lignes en gras ne sont pas dans les candidats listés par Claude Code, et c'est
précisément là qu'il faut regarder : **un `setDoc` sans `merge` sur `user_ludic_state`
effacerait `weeklyMissions` en entier**, quel que soit l'état des lectures. Si un tel appel
existe, c'est une seconde cause possible au §1.2, et elle est bien plus destructrice.

### 1.4 — Les deux candidats nommés sont réels, et `arrayUnion` les règle sans lecture

`handleMissionM4Bis` et `incrementRouletteCompleted` écrivent `done` depuis l'état React.
C'est moins dangereux que le chemin du flush (la mémoire est en général *plus* fraîche que le
document, pas plus vieille), mais c'est une **perte de mise à jour** classique dès qu'il y a
deux onglets, un remontage en cours, ou une écriture concurrente.

**Correctif propre et sans coût** : écrire `done` et `walls` avec **`arrayUnion`** au lieu
d'un tableau complet. L'opération devient **commutative et idempotente** — l'ordre des
écritures n'a plus d'importance, une reprise après échec ne duplique ni ne perd rien, et
aucune lecture préalable n'est nécessaire *pour ce champ*.

⚠️ **Ce que `arrayUnion` ne règle pas** : la réinitialisation hebdomadaire a toujours besoin
de connaître `isoWeek`, donc la lecture reste nécessaire pour décider *reset ou pas*. Ne pas
vendre `arrayUnion` comme « on n'a plus besoin de lire » — c'est faux. Il supprime la classe
« perte de mise à jour », pas la lecture.

Conséquence : la lecture étant de toute façon requise, **le surcoût de la proposition de
Claude Code (« toujours lire ») est nul**, et l'argument coût ne doit pas entrer dans la
décision.

### 1.5 — Le vrai correctif est la fonction pure — mais testée comme une **propriété**, pas comme des cas

`classementFlushReadKeys(pending)` est la bonne idée. Mais testée par cas, elle ne protège que
des cas auxquels on a pensé aujourd'hui — et le bug vient justement de quelque chose auquel
personne n'avait pensé en élargissant la transaction.

**Test à écrire, formulé comme un invariant** :

> pour toute forme de `pending`, **toute référence écrite par `buildClassementFlushWrites`
> doit appartenir à `classementFlushReadKeys(pending)`**.

Concrètement : instrumenter `buildClassementFlushWrites` pour collecter les refs qu'elle
touche, et asserter l'inclusion sur un échantillon de `pending` couvrant toutes les
combinaisons de champs (produit cartésien des champs présents/absents — ils ne sont pas si
nombreux).

Ce test-là a une propriété que les tests par cas n'ont pas : **le jour où quelqu'un ajoutera
un quatrième champ à la transaction partagée sans toucher aux lectures, il échouera tout
seul.** C'est la troisième fois que ce chemin casse pour la même raison (V2.46, puis ici) —
il faut un filet qui ne dépende pas de la vigilance.

### 1.6 — Oui au `throw`, et le « problème » de `undefined` a une solution triviale

Le handoff écarte à demi la variante défensive : *« il faudrait distinguer "non lu" de
"document absent", ce que `undefined` ne permet pas aujourd'hui »*.

**Il suffit que `readData` soit une `Map`** (ou que les clés lues soient passées à côté) :

- clé **absente de la Map** → la lecture n'a pas été faite → **`throw`** ;
- clé **présente avec une valeur `undefined`** → le document n'existe pas → grille neuve,
  comportement normal.

C'est trois lignes, et ça transforme une corruption silencieuse en erreur bruyante. C'est
littéralement la doctrine de `PROCESSUS-erreurs-avalees.md` : **un invariant violé doit
crier.** Le `failureThreshold` de la file remonte l'erreur au bout de 3 tentatives ; perdre
une écriture bruyamment vaut infiniment mieux que corrompre silencieusement.

### 1.7 — Garde-fou côté règles : envisageable, mais à tester avant d'y croire

Une règle interdisant à `weeklyMissions.done` de **rétrécir à `isoWeek` constant**
transformerait ce bug en refus d'écriture plutôt qu'en perte de données. Quelque chose comme
`request.resource.data.weeklyMissions.done.hasAll(resource.data.weeklyMissions.done)`, avec
une branche autorisant le rétrécissement quand `isoWeek` change.

⚠️ **À traiter comme une hypothèse d'expressivité, pas comme un acquis.** Ce projet a déjà
été mordu deux fois par les limites des règles (comparaison sur champ absent, `get()` sur
document inexistant). Prévoir : `resource.data.get('weeklyMissions', {})` pour le cas du
premier écrit, et **valider sur l'émulateur avant de compter dessus**. Si ça ne s'exprime pas
proprement en dix minutes, **abandonner** — c'est un filet de confort, pas une frontière de
sécurité, et les §1.5/§1.6 suffisent.

---

## §2 — Question 2 : **B**, mais sans fenêtre temporelle

### 2.0 — Ce retour recommandait A. C'était faux, sur deux points.

Corrigé par l'argument de l'utilisateur du 25/09, qui est meilleur que le mien :

1. **Mauvaise échelle de temps.** J'avais bâti l'objection sur « un bloc de plusieurs mois
   n'est plus posé ». Mais un mur vit **six semaines**, et la répétition typique arrive
   **trois jours** après la première réussite, bloc encore en place. B ne protège donc pas un
   cas rare : elle protège le cas **fréquent**. Mon objection ne tombait pas à côté du sujet,
   elle visait la mauvaise fenêtre.
2. **Deux monotonies confondues.** J'invoquais V2.56 (« les compteurs ne redescendent
   jamais ») pour justifier A. V2.56 dit *ne pas perdre ce qui est acquis* ; A dit *gagner
   plus en répétant*. Ce ne sont pas le même principe, et je les ai assimilés trop vite pour
   faire tenir l'argument.

### 2.1 — L'argument décisif, et il est du côté de B

Un grimpeur qui réussit un bloc de son niveau max en **huit essais constructifs** produit une
mesure : ce bloc est à la limite de ce qu'il sait faire. Trois jours plus tard il le refait en
un essai — non parce qu'il a progressé, mais parce que **son corps a mémorisé les
mouvements**. La seconde donnée ne mesure plus rien.

Or le barème récompense le faible nombre d'essais **précisément parce que c'est un signal de
difficulté relative au grimpeur** — et ce signal n'existe qu'à la première rencontre avec le
bloc.

Conséquence sous A : sur six semaines de rotation, tout le monde converge vers « un essai
partout », et le classement finit par mesurer le **temps passé à répéter** plutôt que le
niveau. Les missions M1 et M3 poussant désormais à retourner sur des blocs déjà faits, ce ne
serait pas une dérive théorique mais une **inflation systématique, alimentée par la
fonctionnalité qu'on vient de livrer**.

**Règle retenue : la première réussite enregistrée est la mesure ; une répétition n'est pas
une nouvelle mesure.**

### 2.2 — ⚠️ Mais pas de fenêtre temporelle

Seul point de la version initiale de ce retour qui survit — et il vise la *mise en œuvre* de
B, pas son principe.

Indexer la correction sur « le jour de `createdAt` » crée un problème que rien n'oblige à
créer : celui qui saisit le lendemain matin, ou qui repère une faute de frappe deux jours plus
tard, ne peut plus rien corriger. Et cela impose de maintenir un concept — la fenêtre — qui
n'existe nulle part ailleurs dans le projet.

La distinction recherchée n'est pas temporelle, elle est **d'intention** :

| Geste | Effet |
|---|---|
| Clic « Réussi » sur un bloc **déjà réussi** | fait avancer les missions, **n'écrit rien**, ne touche pas au classement — quelle que soit la date |
| Action explicite **« Corriger ma saisie »** | ouvre le résultat stocké ; permet de modifier essais, note, commentaire, cotation, **et** de dé-valider — **sans limite de temps** |

Le chemin de correction et la trappe de secours deviennent **un seul mécanisme** au lieu de
deux, et la fenêtre disparaît avec ses cas limites. Un geste délibéré et nommé reste possible
indéfiniment ; le geste par défaut ne peut plus rien abîmer ni gonfler.

### 2.3 — Ce que l'interface doit dire

Un grimpeur qui reclique « Réussi » et ne voit pas son score bouger doit comprendre pourquoi,
sinon c'est la prochaine question. La fiche d'un bloc déjà réussi affiche l'état stocké en
clair — « Déjà validé le 21/09 en 8 essais » — et présente la répétition pour ce qu'elle est :
elle coche la mission, elle ne recompte pas le bloc.

### 2.4 — Le pré-remplissage reste nécessaire, pour d'autres raisons

B ferme à elle seule le chemin d'inflation accidentelle : une répétition n'écrit plus rien,
donc le `Select` à 1 par défaut ne peut plus gonfler un score au passage. Le pré-remplissage
garde malgré tout trois usages :

1. **Afficher l'état stocké** (§2.3) — impossible autrement.
2. **Alimenter « Corriger ma saisie »**, qui doit partir des vraies valeurs et non d'un
   formulaire vide, sans quoi la correction devient elle-même une perte de données.
3. **Éviter la perte de la note, du commentaire et de la cotation proposée** — le `setDoc`
   sans merge réécrit le document depuis l'état React, vide faute de pré-remplissage. Ce
   chemin reste ouvert à la première saisie comme à la correction.

⚠️ **Et un problème que ni A ni B ne règle** : à la **première** saisie il n'y a rien à
pré-remplir, et le `Select` vaut 1 par défaut (`attempts[id] || 1`). Un grimpeur qui a mis
huit essais et ne touche pas au sélecteur déclare un flash — et valide M3 au passage. Le
sélecteur devrait-il exiger un choix explicite plutôt que proposer 1 ? Question distincte de
la revalidation, mais elle touche le même barème et mérite d'être tranchée dans le même lot.

### 2.5 — Mais ne pas faire reposer la préservation sur la lecture

Le pré-remplissage corrige l'expérience ; il ne doit pas être **le seul** rempart. Si la
lecture échoue, est lente, ou si l'utilisateur valide avant qu'elle n'arrive, on retombe dans
l'écrasement.

**L'écriture doit préserver structurellement les champs qu'elle ne pilote pas** : `merge`, ou
report explicite de tous les champs, indépendamment de ce que la lecture a ramené. C'est la
même leçon que le bug des missions — *ne jamais reconstruire un document composite depuis un
état mémoire supposé complet*.

`handleRate` partage le même `setDoc` et doit suivre la même règle : le handoff le signale,
c'est juste, ne pas l'oublier au moment de coder.

### 2.6 — M3 n'est pas seulement auto-déclarative, elle est **sémantiquement fausse**

Le handoff note que M3 se valide sur un clic. Je vais plus loin : **un flash est par
définition une réussite au premier essai sur un bloc jamais tenté.** Une répétition en un
essai n'est pas un flash, même déclarée de bonne foi — c'est exactement l'argument de la
mémoire motrice du §2.1, appliqué à la mission plutôt qu'au barème.

M3 doit donc exiger **aucun résultat antérieur** pour ce grimpeur sur ce bloc — ni réussite ni
échec, puisqu'un échec enregistré lundi signifie qu'il a déjà tenté — **et** `attempts == 1`. L'information est disponible : c'est exactement ce que la
lecture de pré-remplissage ramène. Coût nul, et cela retire M3 de la liste des missions
auto-déclaratives — il n'en resterait que **M1 et M4 bis**, ce qui est plus défendable le
jour où la question des points reviendra.

### 2.6 bis — Conséquence directe : le sélecteur d'essais doit être en lecture seule sur un bloc déjà réussi

Cas soumis par l'utilisateur : il ouvre un bloc déjà validé à 8 essais, saisit **2** (il est
tombé par inadvertance), clique « Réussi ».

**Sous B : rien ne change. Ni le clic, ni les essais. Le bloc reste à 8.** C'est le
comportement voulu.

⚠️ **Mais ce n'est pas le comportement actuel.** En **V2.68 déployée aujourd'hui**, ce même
geste réécrit le document : `attempts` passe de 8 à 2, `scoreDelta = points(2) − points(8)`
et le **score annuel monte**. Le geste décrit est donc actuellement destructeur — à ne pas
reproduire avant la livraison de V2.69.

Et cela met en lumière un défaut d'interface que la règle seule ne corrige pas : **afficher un
sélecteur modifiable dont la valeur est jetée, c'est mentir à l'utilisateur.** Sur un bloc
déjà réussi, l'état doit s'afficher **en lecture seule**, et « Corriger ma saisie » doit être
la seule porte d'entrée vers la modification. Sinon le grimpeur croira avoir corrigé quelque
chose — et l'absence de retour sera signalée comme un bug.

### 2.7 — ⚠️ Un cas limite à ne pas perdre : échec puis réussite

Un « Échoué » saisi lundi, puis une réussite mercredi, **n'est pas une répétition** : c'est la
première réussite. Elle doit s'écrire et compter normalement, points compris.

La règle porte donc sur « un bloc **déjà réussi** », jamais sur « un bloc déjà saisi ». La
nuance est facile à perdre à l'implémentation, et l'inverser reviendrait à empêcher un
grimpeur d'enregistrer la réussite d'un projet — exactement le contraire de l'intention.

En revanche ce n'est pas un flash pour M3 (§2.6) : il avait déjà tenté le bloc.

---

### 2.8 — Faut-il un écran de missions séparé ? **Le diagnostic est juste, le remède est trop lourd**

Proposition de l'utilisateur (25/09) : sortir les missions du Blocabrac quotidien vers un
écran dédié — liste des murs → liste des blocs → un bouton « Validé » qui ne remplit que la
mission. Sur un max+1, « Validé » signifierait *« je suis allé le tester »*, pas *« je l'ai
réussi »*.

**Le diagnostic derrière cette idée est exact**, et c'est la racine des deux problèmes du
terrain : **on se sert de gestes d'enregistrement de résultat pour exprimer des non-résultats.**
« Échoué » pour dire « j'ai testé », « Réussi » pour dire « je l'ai refait ». Le geste ment sur
son intention, et c'est pour ça qu'il écrit là où il ne devrait pas.

**Mais l'écran séparé paie ce diagnostic trois fois trop cher** :

1. **Il rend les huit missions déclaratives.** Le plan retenait comme propriété centrale (§C.2)
   que *toutes* les missions soient dérivables des données. Aujourd'hui trois le sont
   imparfaitement (M1, M4 bis, M8) ; avec l'écran séparé, **plus aucune** ne dériverait de
   l'activité réelle. M2, M5, M6 et M7 — qui se cochent aujourd'hui toutes seules pendant
   qu'on grimpe — deviendraient des cases à pointer à la main.
2. **Il crée une double saisie.** Valider un bloc au quotidien *puis* aller le pointer dans
   l'écran missions, c'est faire le travail deux fois. C'est exactement ce qui tue la
   « routine de fonctionnement » recherchée : une grille qui se remplit pendant qu'on grimpe
   est un jeu, une grille à remplir après coup est un devoir.
3. **Il ne peut pas tout absorber de toute façon.** **M8 reste validée par le bouton de la
   Roulette**, qui ne va pas déménager. On se retrouverait donc quand même avec deux points
   d'entrée — ce qui affaiblit l'argument « un seul endroit lisible ».

**Alternative recommandée — les gestes manquants, là où le grimpeur est déjà.** Garder les
missions dans le Blocabrac quotidien, et ajouter sur la fiche du bloc **un bouton contextuel
qui dit ce qu'il fait**, affiché uniquement quand la mission correspondante est active et non
cochée :

| Situation | Bouton affiché | Écrit |
|---|---|---|
| Bloc de niveau **max+1**, M4 non cochée | **« J'ai testé ce bloc »** | mission seule — **rien** dans `client_boulder_results` |
| Bloc **déjà réussi**, M1 non cochée | **« Je l'ai refait »** | mission seule — **rien** dans les résultats |
| Tout le reste | « Réussi » / « Échoué », inchangés | résultat réel, comme aujourd'hui |

Ce que ça donne, comparé à l'écran séparé :
- **la même séparation sémantique** — un geste de mission n'écrit jamais un résultat ;
- **zéro double saisie**, et M2/M5/M6/M7 continuent de se cocher toutes seules ;
- **un bouton contextuel au maximum** à l'écran, pas un second arbre de navigation ;
- les écritures de mission passent par un **écrivain dédié et simple** (un document,
  `arrayUnion`), **hors de la transaction débouchée partagée** — ce qui supprime précisément
  le couplage à l'origine du bug §1.1.

Ce dernier point mérite d'être souligné : l'utilisateur cherchait de la lisibilité côté
client, mais la séparation apporte aussi la bonne propriété **côté architecture** — les
missions cessent d'être un passager de la transaction du classement.

**La seule condition qui ferait gagner l'écran séparé** : si l'objectif est que les missions
fonctionnent aussi pour des grimpeurs qui **n'enregistrent pas leurs résultats du tout** (ceux
qui n'utilisent l'appli que comme topo). Pour eux, rien ne se coche aujourd'hui et
l'alternative ci-dessus n'y change rien. Si cette population compte, l'écran séparé se
justifie ; sinon, elle ne paie pas son coût.

### 2.9 — Distinguer les gestes : la grammaire fait le travail

Les boutons de mission ne doivent pas ressembler aux boutons de résultat. Le plus économique
n'est pas graphique, il est **linguistique** — et il est déjà à l'œuvre dans l'appli sans
qu'on l'ait formulé :

| Famille | Forme | Exemples | Ce que ça exprime |
|---|---|---|---|
| **Résultat** | adjectif, état du bloc | « Réussi », « Échoué » | l'état du bloc pour ce grimpeur — **écrit un résultat** |
| **Geste** | première personne, passé | « J'ai relevé le défi », « J'ai testé ce bloc », « Je l'ai refait » | un acte du grimpeur — **n'écrit jamais de résultat** |

**Règle à inscrire dans `CLAUDE.md`** : *tout bouton qui n'écrit pas de résultat parle à la
première personne au passé ; tout bouton qui écrit un résultat est un adjectif d'état.* La
distinction devient lisible sans explication, et elle s'étendra d'elle-même aux gestes futurs.

En appui, et seulement en appui : les boutons de geste sont **secondaires** (contour, pas
plein), portent une icône, et affichent sous eux une ligne grise *« n'enregistre pas de
résultat »*. Les boutons de résultat gardent leur traitement actuel, plein et
`brandGreen`.

**`ClientHelper`** doit documenter **trois** gestes, pas deux — c'est là que se joue la
compréhension :

1. **Enregistrer un résultat** — « Réussi » / « Échoué ». Compte pour le classement. Une
   seule fois par bloc : c'est la première réussite qui fait foi.
2. **Faire avancer une mission** — « J'ai testé ce bloc », « Je l'ai refait », « J'ai relevé
   le défi ». Ne touche **ni** au classement **ni** aux essais enregistrés.
3. **Corriger une saisie** — « Corriger ma saisie ». Le seul chemin pour modifier un résultat
   déjà enregistré, sans limite de temps.

Avec, en une phrase, la raison de la règle — elle sera mieux acceptée si elle est expliquée
plutôt que subie : *« refaire un bloc trois jours plus tard demande moins d'essais parce que
le corps a mémorisé les mouvements ; c'est la première réussite qui mesure ton niveau. »*

### 2.10 — La roulette : rien à changer, **c'est déjà le modèle**

Question de l'utilisateur : faut-il aligner la roulette sur ce principe ?

**Non — elle y est déjà, et elle est la référence.** Le bouton « J'ai relevé le défi » (V2.55)
écrit `user_ludic_state` et **jamais** `client_boulder_results`. C'est exactement la séparation
qu'on cherche à généraliser. Ce n'est pas la roulette qu'il faut aligner sur les missions,
ce sont les nouveaux boutons qu'il faut aligner sur la roulette.

⚠️ **Et surtout : réappliquer les trois leçons payées en V2.55**, sinon les nouveaux boutons
reproduiront ses bugs :

1. **UI non optimiste** — ne pas cocher la mission tant que l'écriture n'est pas confirmée
   (l'UI optimiste avait dû être retirée avant commit).
2. **Référence, pas fermeture** — passer par une ref plutôt que capturer la valeur dans la
   fermeture du gestionnaire (bug de fermeture obsolète corrigé en V2.55).
3. **Une seule écriture dédiée**, hors de la transaction débouchée partagée — plus
   `arrayUnion` sur `done` / `walls` (§1.4).

Seul changement à apporter côté roulette : **l'alignement visuel** avec les deux nouveaux
boutons, pour que les trois se lisent comme une même famille.

### 2.11 — Interface de la grille : suggestions graphiques

Demande de l'utilisateur : autre chose qu'une liste à cocher, aux couleurs de la salle, avec
des cases barrées ou tamponnées « validé ».

**La métaphore juste est le tampon, pas la rature.** Une rature dit « tâche faite » (liste de
corvées) ; un tampon dit « validé, certifié » — c'est le carton de compétition, le vocabulaire
natif d'une salle d'escalade. Et c'est cohérent avec le nom d'origine du chantier : une
**carte de bingo**, pas une checklist.

**Six propositions concrètes :**

1. **Grille, pas liste.** 8 tuiles en **2 colonnes × 4 lignes** sur mobile. La forme carrée
   évoque le carton ; la liste évoque le pense-bête.
2. **Le tampon est un moment, pas une décoration** — et il porte **le logo de la salle**
   (choix de l'utilisateur, 25/09). C'est le bon choix : un tampon au logo, c'est le carton
   de compétition tamponné à l'accueil, exactement le geste qu'on imite.

   **Deux tailles, un seul dessin** :
   - **à la validation** — le logo encré en surimpression sur la tuile, incliné, légèrement
     irrégulier, arrivant avec un bref effet d'échelle ;
   - **au repos** — le même logo **en petit, dans un coin**, la tuile teintée
     `brandGreenDark`, libellé estompé mais lisible. Sinon, à 8/8, huit gros tampons rendent
     la grille illisible.

   **✅ Vérifié sur le fichier fourni par l'utilisateur le 25/09** (version blanche sur fond
   transparent, 316 × 468). Trois constats, dont deux corrigent ce que je supposais plus
   haut :

   - **Le logo complet ne survit pas.** Réduit à 40–60 px, « BLOCABRAC » à la verticale et
     « ESCALADE INDOOR » deviennent illisibles. **Seule la marque** — le groupe de formes de
     gauche, sans typographie — reste nette et reconnaissable. C'est elle, le tampon.
   - **Pas besoin de vectoriser.** Le fichier est déjà un **masque alpha monochrome**
     (blanc pur + canal alpha). Il se recolore en CSS via `mask-image` + `background-color`,
     donc l'encre suit l'état de la tuile exactement comme le ferait un SVG.
   - **Et il ne *faut* pas vectoriser** : le fichier porte déjà une **texture grattée**
     (alpha partiel) qui, à l'échelle du tampon, se lit comme de l'encre irrégulière. C'est
     précisément l'effet recherché, et un tracé vectoriel le perdrait.

   **⚠️ Correction de la recommandation d'hébergement** : plutôt qu'inliner un SVG, placer le
   fichier dans **`src/assets/`, surtout pas dans `public/`**. Vite empreinte les assets
   importés depuis les sources, et `firebase.json` sert déjà `/assets/**` en
   `immutable` — le problème de cache qui avait imposé les icônes `-v2` en V2.58 **disparaît
   de lui-même**, sans data-URI ni renommage manuel.

   **Réglages de départ** (issus d'un rendu d'essai, à ajuster à l'œil) : encre
   `brandGreenDark` à **~55 % d'opacité**, rotation **−13°**, marque à **~75 px** à
   l'arrivée puis **~26 px** au repos. La marque étant en format portrait (2:3), elle se
   place **en coin**, pas centrée — une forme haute centrée sur une tuile carrée tombe mal.

   **Trois détails qui font la différence entre un tampon et un autocollant** : un liseré
   irrégulier autour de la marque, une opacité légèrement inégale, et une **inclinaison qui
   varie d'une tuile à l'autre mais reste stable** — dérivée de la clé de la mission, jamais
   tirée au hasard au rendu, sinon la grille bouge à chaque affichage.

   Encre en `brandGreenDark` sur tuile teintée. **Éviter le rouge**, qui se lit comme une
   erreur dans une interface.

   Tout en CSS, sans bibliothèque, neutralisé sous `prefers-reduced-motion`, et
   `aria-hidden` sur le tampon — l'état validé doit rester annoncé en texte.

   **Pour le fork Grimpe !** : la marque du tampon doit venir de `gymConfig.ts`, comme les
   catégories de murs et le vocabulaire de méthodes. Même raisonnement, même endroit.

   Si le rendu est réussi, le même tampon peut marquer un badge obtenu et un défi de roulette
   relevé — mais **seulement après** l'avoir vu en vrai sur la grille.
3. **Les couleurs de la salle portent du sens, pas de la décoration.** M1, M3 et M4 dépendent
   du niveau : leur tuile prend en accent **la couleur de niveau concernée**, telle que
   définie dans `gymConfig.ts` (celle du niveau figé pour M1, max−1 pour M3, max+1 pour M4).
   Le grimpeur voit littéralement de quelle couleur on lui parle. ⚠️ Prévoir un contour foncé
   pour les couleurs claires (blanc, jaune, rose) sur fond clair.
4. **Un pictogramme par famille de mur** pour M5, M6, M7 — un profil de dévers, un
   rétablissement, une dalle. Trois silhouettes simples suffisent, et elles rendent la
   grille lisible d'un coup d'œil sans lire les libellés.
5. **M2 est la seule non binaire** : quatre segments qui se remplissent un par un, avec le
   compte « 2 / 4 murs ». Ne pas la traiter comme les sept autres.
6. **En-tête de la grille** : le niveau figé sous forme de pastille de couleur — « Missions
   calées sur ton niveau ● » (§C.8 du plan l'exigeait déjà) — et l'avancement « 5 / 8 » avec
   **le badge en silhouette grisée**, qui se colore à la complétion. Cela réutilise le
   langage visuel des badges, et la doctrine de grisage que l'utilisateur avait lui-même
   défendue : *entretenir l'envie de revenir*.

⚠️ **Accessibilité** : ne jamais faire porter l'information par la seule couleur — chaque
tuile garde son libellé, et l'état validé est signalé par une **forme** (le sceau) autant que
par la teinte. Certains niveaux sont proches à l'œil, et le daltonisme est fréquent.

---

## §3 — Question 3 : réparer la grille de la semaine ?

**Non pour la grille. Oui pour le compteur — mais en vérifiant, pas en réparant.**

### 3.1 — Ne pas réparer les grilles

Trois raisons convergentes :
- la réparation est **approximative par construction** (le handoff le reconnaît : M1 par
  reclic ne laisse aucune trace) ;
- lundi 28/09 remet tout à zéro, soit **trois jours** de grille dégradée ;
- écrire un script de réparation sur `user_ludic_state` **pendant que la purge des champs
  legacy est encore en attente** ajoute un écrivain de plus sur une collection en cours de
  migration. Le rapport bénéfice/risque est mauvais.

### 3.2 — ⚠️ En revanche, `weeklyMissionsCompleted` doit être vérifié

Le handoff écrit que la réinitialisation de lundi règle la question. **C'est vrai pour la
grille, faux pour le compteur** : `weeklyMissionsCompleted` est **cumulatif** et ne se
réinitialise pas. S'il a été remis à 0 chez quelqu'un, lundi n'y changera rien et le dégât est
permanent.

Vraisemblablement il n'y a **aucun dégât** : la fonctionnalité a un jour, la première semaine
n'est pas finie, personne ne devrait avoir un compteur supérieur à 0. Mais c'est exactement le
genre de raisonnement qu'il faut **confirmer en lecture**, pas supposer — une requête en
simulation sur les 28 comptes, quelques minutes.

Même contrôle pour le badge `type: 'mission'` : s'il a été attribué à quelqu'un alors que son
compteur est à 0, il y a une incohérence à noter.

### 3.3 — Calendrier

Pas de raison de se précipiter pour livrer avant lundi. Le dégât est borné à la semaine en
cours et le contrôle du §1.2 doit passer avant le correctif. **Livrer quand c'est vérifié**
vaut mieux que livrer avant la réinitialisation — un correctif poussé dimanche soir sans e2e
serait la répétition exacte de ce qui a produit ce bug.

---

## §4 — Ce que ces trois problèmes ont en commun

Ce n'est pas un lot de trois défauts indépendants. C'est **une seule erreur, commise trois
fois** :

> **reconstruire un document composite à partir d'un état mémoire dont rien ne garantit qu'il
> est complet.**

- la grille de missions reconstruite sans avoir lu `user_ludic_state` → `done` écrasé ;
- `client_boulder_results` réécrit sans merge depuis un état React jamais pré-rempli → note,
  commentaire et cotation perdus ;
- `attempts` réécrit depuis un `Select` dont la valeur par défaut est 1 → score modifié à
  l'insu du grimpeur.

**Proposition pour `CLAUDE.md`**, dans la lignée de la règle « toutes les lectures avant toute
écriture » :

> *Aucune écriture ne reconstruit un document à partir de l'état mémoire. Soit le document a
> été lu dans la même transaction, soit l'écriture est additive par construction
> (`increment`, `arrayUnion`, chemins pointés), soit elle est refusée.*

Cette phrase, appliquée en V2.65, aurait empêché les trois.

---

## §5 — Ordre suggéré

1. **Contrôle du §1.2** (5 min) — une nouvelle première réussite repeuple-t-elle la grille ?
   Si non, s'arrêter : chercher la seconde cause avant tout correctif.
2. **Audit du §1.3** — inventorier tous les écrivains de `user_ludic_state`, chercher un
   `setDoc` sans `merge`.
3. **Contrôle du §3.2** — `weeklyMissionsCompleted` en prod, en simulation.
4. **V2.68.1** — correctif du bug : `classementFlushReadKeys` + **test d'invariant** (§1.5) +
   `throw` sur lecture manquante (§1.6) + e2e missions avec un échec puis une revalidation
   seule. `arrayUnion` sur `done`/`walls` (§1.4) dans le même lot, il est peu coûteux.
5. **V2.69** séparée, sur la base de **B sans fenêtre** (§2) : une répétition n'écrit pas,
   action explicite « Corriger ma saisie » sans limite de temps, affichage de l'état stocké
   **en lecture seule** (§2.6 bis), pré-remplissage, préservation structurelle à l'écriture,
   M3 sur première tentative, cas échec→réussite (§2.7). Trancher au passage le défaut du
   sélecteur d'essais à la première saisie (§2.4).
6. **Boutons de mission contextuels** (§2.8) — « J'ai testé ce bloc », « Je l'ai refait » —
   avec écrivain dédié hors transaction partagée, en réappliquant les trois leçons de V2.55
   (§2.10). Peut se livrer avec V2.69 ou juste après ; c'est ce qui rend M4 honnête côté
   client et découple définitivement les missions du classement.
   **Livrer `ClientHelper` dans le même lot** (§2.9) : trois gestes documentés, pas deux —
   une règle non expliquée sera signalée comme un bug.
7. **Habillage de la grille** (§2.11) — indépendant du reste, peut se livrer séparément une
   fois la logique saine.
8. Règles du §1.7 **seulement si** elles s'expriment proprement à l'émulateur.

Ne pas mélanger 4 et 5 dans une même version : le premier est un correctif de régression, le
second une décision produit. Les séparer permet de livrer le correctif sans attendre
l'arbitrage.
