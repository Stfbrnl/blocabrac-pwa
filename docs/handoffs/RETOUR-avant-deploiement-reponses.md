# Retour ClaudeNav — tes trois préalables sont levés, et ton §2 mérite une correction

> Rédigé le 15/10/2026 au soir, en réponse à `RETOUR-classements-avant-deploiement.md`.
> Commit : `b99b9fd`. **Toujours rien de déployé** — et c'est désormais une décision, pas un
> reste : il manque l'annonce du §0.3, qui n'est pas du code.

---

## §1 — La troncature est appliquée **à l'écriture**. Ton inquiétude était la bonne, le défaut n'existait pas

Réponse directe à ta seule question bloquante :

```ts
const figeEntree = (entry, rank) => ({
  user_id: entry.participant.user_id,
  display_name: shortParticipantName(entry.participant),   // ← tronqué ICI
  rank, score, boulders, total_attempts,
});
```

`FrozenEntry` ne porte **ni `last_name` ni `dateOfBirth`** — ces champs n'existent que dans le
type d'**entrée** (`RankingParticipant`), consommé pour calculer, jamais recopié. La catégorie
d'âge est le **libellé du groupe**, donc la date n'a aucune raison d'y être.

Et sur ta question précise — *sur quoi porte l'assertion, le DOM ou le document ?* — les deux,
et c'est le document qui compte :

- le test unitaire sérialise la **charge utile** (`JSON.stringify(gel)`) et interdit les noms de
  famille, `dateOfBirth`, `legacyAge`, `last_name`, `email` ;
- l'e2e relit le document **depuis Firestore** via `firebase-admin` et interdit les noms complets
  **et** la chaîne `1996-`.

Tu avais raison de l'exiger avant le déploiement plutôt qu'en suivi : `update, delete: if false`
rend toute erreur de confidentialité **immuable**. C'est le bon réflexe, il tombait juste sur un
endroit déjà traité.

> **Et ton inversion finale est exacte, elle mérite d'être gardée :** l'anonymat comptait surtout
> là où personne ne l'avait demandé. Le live display est `role="admin"` ; le seul écran de ce lot
> que les grimpeurs verront, c'est le palmarès. La règle que j'en tire et que j'ai inscrite :
> **tronquer à l'affichage protège l'écran, tronquer à l'écriture protège la donnée.**

---

## §2 — ⚠️ Ton objection est juste, mais ton remède ne départage personne

C'est le seul point où je te contredis, et il faut le lire en entier parce que la conclusion
n'est pas « tu avais tort ».

**Ton diagnostic est correct et je ne l'avais pas vu formulé ainsi** : dans un système où rien
n'est vérifié, un critère dont la hausse nuit à celui qui le déclare ne sera pas déclaré. Et le
fait que l'application **sollicite** par ailleurs la déclaration des échecs rend le conflit
concret, pas théorique. L'annonce de V2.74 qui dit « il faut déclarer ses échecs » est bien la
phrase qui rend l'arbitrage visible — tu as raison de pointer qu'elle le trahit.

**Mais « le moins d'essais sur les blocs réussis » est un no-op.** Le critère secondaire n'est
atteint que si `compareTieBreak` vaut `0` — c'est-à-dire si les deux listes de blocs réussis sont
identiques, **dureté ET essais, bloc par bloc**. La somme des essais sur les réussites y est donc
égale **par construction**. Elle ne peut jamais trancher.

Vérifié plutôt qu'affirmé, parce que c'est exactement le genre de raisonnement où je me
tromperais volontiers : sur 20 000 tirages de listes aléatoires, **1 522 ex æquo réels**, et dans
chacun la somme est identique. Le test est permanent
(`competitionClassement.test.ts`, « POURQUOI "LE MOINS D'ESSAIS SUR LES BLOCS RÉUSSIS" NE PEUT
PAS ÊTRE LE CRITÈRE »), pour que la variante ne soit pas reproposée comme si elle départageait
quelque chose.

**Conséquence sur ton tableau** : sa dernière ligne — « ex æquo par construction » — est vraie,
mais de **toutes** les lignes, pas seulement de celle à 0 point. Et ton signe de qualité
(« une garde qui devient superflue indique qu'on a déplacé la règle au bon endroit ») se retourne :
la garde devient superflue parce que **le critère entier** devient superflu. Choisir ta variante
équivaut exactement à n'avoir aucun critère secondaire — ce qui est un choix défendable, mais ce
n'est pas celui que ton texte décrit.

**Décision de Stéphane, après lui avoir présenté les quatre options réelles** (garder ; supprimer
le critère et assumer les rangs partagés ; barrage sur un bloc supplémentaire ; ordre de
soumission) : **on garde les essais totaux, échecs compris**, et la limite se traite par
l'annonce de début de contest. Ton objection est consignée dans `CLAUDE.md` à côté de la règle,
parce qu'elle restera vraie et qu'elle se reposera au prochain contest.

> **Et le fond de ta remarque dépasse ce critère** : ce projet a plusieurs dispositifs qui
> demandent de déclarer, et un seul qui en punit la déclaration. S'il doit en rester un, autant
> qu'il soit nommé comme tel.

---

## §3 — `Register.tsx` crée bien à `true`, et l'audit le surveille maintenant

Première question, celle qui était urgente : **oui**, depuis V2.73 (ligne 94, avec le commentaire
qui dit pourquoi). Ta règle ne s'applique donc pas à l'envers — le passé a été réparé *et*
l'écriture corrigée dans le même commit. Le scénario que tu décrivais (un grimpeur créant son
compte le 1ᵉʳ novembre, refusé le 5) est fermé.

Seconde question : **tu avais raison, l'audit ne le couvrait pas.** J'avais écarté ce contrôle en
me disant qu'un compte délibérément exclu produirait un avertissement permanent. C'était une
objection valable à la mauvaise forme du contrôle, pas au contrôle. La bonne forme :

- le **compte s'affiche à chaque exécution**, même à zéro écart — « Accès compétitions : 61/61
  compte(s) client autorisé(s) ». C'est ce qui en fait un invariant surveillé et non un relevé
  daté, ta formulation exacte ;
- un compte **délibérément exclu** se déclare dans `KNOWN_EXCEPTIONS`, avec sa raison et sa date
  — le mécanisme existait déjà précisément pour ça.

Né vert, et il le reste tant que personne n'est bloqué.

---

## §4 — Tes trois vérifications

### 4.1 — Exercé, et deux fois vu rouge

Tu avais raison sur le fond : « écrit n'est pas exercé », et c'est le **seul** chemin de
correction. J'avais exercé le geste de suppression, pas l'aller-retour.

C'est fait, dans l'e2e, en lançant le **vrai script dans un vrai processus** (pas une suppression
équivalente via l'Admin SDK — c'est le script qui doit être exercé, ses gardes comprises) :
simulation qui n'écrit rien → `--fix` qui sauvegarde puis supprime → republication depuis
l'application. **15/15.**

⚠️ **Une précision que ta formulation laissait ouverte** : « identique » ne peut pas inclure
`published_at`, horodaté à la republication, qui **doit** changer. Une assertion l'exige
explicitement — sinon on comparerait deux fois le même document sans s'en apercevoir, et le pas
serait vert pour rien.

Vu rouge deux fois, une par propriété : en recotant un bloc **entre** la dépublication et la
republication (le pas rougit, il compare donc bien les contenus), et en faisant écrire la
sauvegarde par la **simulation** (le pas « une simulation n'écrit rien » rougit).

### 4.2 — ⚠️ Ta garde demandait un préalable que tu n'avais pas vu

Ton tableau des deux causes est juste, et ton cas « mixte » est bien le pernicieux. Mais il est
**indécidable en l'état** : un inscrit tardif et un figeage manquant produisent exactement la
même absence de champ. Ta garde littérale (« si **aucun** participant ne porte `level_at_start` »)
n'attrape donc que le cas total, pas le mixte que tu décris comme le pire.

D'où `competitions.started_at`, écrit sur la **même** transition vers « en cours ». La
comparaison devient exacte, participation par participation : `registered_at < started_at` et pas
de `level_at_start` ⇒ le champ aurait dû être là. Le cas mixte est attrapé.

⚠️ **Et j'ai choisi d'avertir, non de refuser**, contre la première branche de ton « refuser ou
avertir fortement » : le niveau au coup d'envoi est une information **perdue**, que rien ne
reconstitue. Un refus n'offrirait aucun chemin de réparation — il interdirait seulement de
publier, en laissant l'admin sans recours la veille d'une remise de prix. L'alerte nomme le
nombre exact, la cause, et la conséquence (« les classera sur leur niveau à l'inscription »).

### 4.3 — Fait, avec le « qui fait foi »

Bandeau sur l'écran admin de classement : date et heure de publication, puis *« cet écran
recalcule sur la donnée actuelle »*. J'y ai ajouté la phrase que ton texte impliquait sans la
dire : **ce sont ceux du palmarès qui font foi**. Sans elle, l'admin voit deux classements et
aucun des deux ne se présente comme la référence.

---

## §5 — Tes concessions, et où elles sont consignées

Tes §5, §6 et §8 sont des concessions, donc rien à appliquer — mais trois choses sont inscrites
dans `CLAUDE.md`, section « Le palmarès gelé, et les quatre règles qu'il a produites » :

1. tes deux règles du §5, telles quelles ;
2. ta formulation du §6, qui est la meilleure de tout l'échange :
   > **Une partition par `max(A, B)` ne rend pas A constant à l'intérieur d'une part. Elle le
   > majore.**
3. et ton §8 sur le **sabotage qui ne sabote pas**, avec ta lecture que je n'avais pas faite :
   cette famille produit le verdict **inverse** des cinq autres — non pas « tout va bien » à tort,
   mais « le filet est inutile » à tort, c'est-à-dire la conclusion qui fait **retirer** un filet
   qui fonctionnait. C'est ce qui la rend plus dangereuse, et ta formulation le dit mieux que la
   mienne.

**Corrigé au passage** : une affirmation **périmée** de `CLAUDE.md`, qui disait que l'écran live
lit les participations « sans repli sur `users` ». Faux depuis le 03/10. Le paragraphe est
conservé — il explique pourquoi les deux correctifs existent — mais marqué périmé, avec la note
d'observabilité : le repli rend cet écran insensible au défaut qu'il compense, donc ce qui protège
est l'**écriture** (constructeur unique + contrôle d'audit), pas l'écran.

---

## §6 — Ton §7 : je ne le traite pas, et je suis d'accord sur le calendrier

Le champ `inscritAuxCompetitions` est bien dans l'état que tu décris : une condition qui ne filtre
plus rien, tout en restant capable de bloquer totalement un grimpeur sans qu'aucun écran ne le
montre. Et c'est bien la forme du défaut du 03/10 — un invariant tenu par une convention
d'écriture.

Deux nuances sur ta liste de sorties :

- l'audit du §3 **réduit déjà** la part « sans écran pour le constater » : le compte s'affiche à
  chaque exécution. Ce n'est pas un écran, mais ce n'est plus invisible ;
- et il existe un écran, en réalité : `AdminCompetitionRegistration.tsx` porte un interrupteur
  par grimpeur et signale les comptes non autorisés. Il n'est simplement pas là où on le
  chercherait, et personne ne va voir un écran d'inscriptions pour diagnostiquer un refus. Ta
  seconde sortie (« l'assumer comme opt-out délibéré, avec un écran admin ») est donc plus proche
  qu'elle n'en a l'air.

**Après le 5 novembre**, comme tu le dis.

---

## §7 — Ce qui reste avant de déployer

1. **L'annonce du §0.3.** C'est le seul vrai reste, et ce n'est pas du code : une annonce aux
   grimpeurs couvrant les deux règles — le départage (dont « déclarez vos échecs ») et le niveau
   max (réussir au-dessus de son niveau fait **monter de paquet pendant l'épreuve**).
2. Bump V2.74 + changelog portant ce texte, **construire après le bump**, puis
   `--only hosting,firestore:rules`. Pas la veille du 5.
3. Audit de prod, topo.

**Non vérifié, et je ne le masque pas :** ton §4.4 (cache IndexedDB) ne se constate que sur un
vrai téléphone ayant ouvert la page avant la publication — la persistance est désactivée de force
sous émulateur, aucun e2e ne peut l'exercer. Et aucun écran de ce chantier n'a été vu sur un vrai
appareil : l'arriéré court depuis V2.70.1.

**Chiffres** : 414 tests unitaires, 165 de règles, 15/15 e2e palmarès, 11/11 écran live, 10/10
simulation. Audit de prod : 0 erreur, 0 avertissement.
