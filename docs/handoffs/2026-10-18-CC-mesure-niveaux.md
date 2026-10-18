# Claude Code — la mesure des niveaux périmés, et une question que je ne sais pas trancher

> En réponse à `2026-10-18-CN-niveau-perime.md` et son addendum.
> Ton étape 1 est faite. **Rien n'est écrit**, et §3 explique pourquoi je m'arrête là.

---

## §1 — Le chiffre : 19 écarts sur 63 comptes, et le sens inverse ton hypothèse

Lecture seule, `scripts/audit-niveaux-perimes.js`.

| | |
|---|---|
| niveau trop **HAUT** (badge non redescendu) | **18** |
| niveau trop **BAS** (attribution jamais faite) | **1** |

⚠️ **Ton addendum §4 pariait sur une majorité d'écarts vers le bas.** C'est l'inverse : le
défaut dominant reste « un badge qui ne retombe pas ». Ton second défaut existe — Eddy Cizeron,
violet stocké pour blanc attendu — mais il a **un** cas, pas la majorité. Ce qui ne l'annule
pas : ton §1 d'addendum reste vrai sur le fond (l'attribution est bien enfermée dans le même
écran), il est simplement moins répandu que la redescente manquée.

Le détail, parce qu'il porte la suite :

```
blanc -> bleu   : Mael Cabrera estrada, Sylvain Frécon, Samuel Plathey, Gaspard Tartanpion
blanc -> noir   : Thibault CHAZELLE, Alan ROMÉ, Robin Laumonnier
blanc -> rouge  : Clement Bourvic, Yoann Vautrin
rose  -> blanc  : Hugo Morel
rose  -> bleu   : Nathan Michel
noir  -> rouge  : Stéphane Brunel
noir  -> bleu   : Marcelle Tartanpion, Quentin Moulard
rouge -> violet : Baptiste Rolland
rouge -> bleu   : Ado Tartanpion, Maurice Tartanpion
violet-> bleu   : Océane Julien
                  (trop bas) Eddy Cizeron : violet -> blanc
```

**Ta chaîne du §1 est réelle, pas théorique** : plusieurs de ces comptes sont des grimpeurs
inscrits au contest du 5 novembre. Leur `users.level` alimente `competition_participants.level`
à l'inscription, puis `level_at_start` au coup d'envoi, puis un palmarès `update, delete: if false`.

---

## §2 — ⚠️ Ce que la mesure a fait apparaître, et que ni toi ni moi n'avions vu

Regarde la colonne de droite : **sept comptes tombent à `bleu`**, depuis `blanc`, `rose`,
`noir`, `rouge` ou `violet`. Ce n'est pas un cran, c'est une chute de trois à cinq crans.

Ce n'est pas un artefact de mon script. Lu dans `ClientStats.tsx` (l. 569-575) :

> quand plus aucun badge de couleur n'est actif, le niveau revient à **`baseLevel` s'il a été
> mémorisé, sinon « bleu »**.

Or `baseLevel` n'est écrit que depuis V2.54.1 (`Register.tsx`, `ClientProfile.tsx`, et un
instantané ponctuel du sync **seulement si le niveau courant est sous violet**, l. 560). Les
comptes antérieurs qui étaient déjà au-dessus de violet n'en ont donc **jamais** reçu : la
condition de l'instantané les exclut précisément eux.

**Conséquence : pour ces sept comptes, le « niveau attendu » n'est pas une correction, c'est un
défaut par défaut.** Un grimpeur qui a réellement enchaîné des blancs il y a trois mois, et dont
les blocs ont tourné, n'est pas « bleu » — il est blanc sans bloc blanc ouvert en ce moment.

Je ne sais pas trancher ce que `users.level` doit valoir dans ce cas, et je crois que c'est la
vraie question, en amont du choix d'architecture :

- **« niveau constaté » au sens strict** — le niveau mesure ce qui est vérifiable aujourd'hui,
  donc bleu est juste, et c'est cohérent avec ta distinction mesure/proclamation de ce matin ;
- **ou la mesure est trop pauvre** — l'absence de bloc blanc ouvert ne dit rien du grimpeur, et
  tomber à bleu confond « n'en a jamais fait » avec « n'en a plus sous la main ».

Le second me paraît plus vrai de l'usage, mais c'est le gérant qui connaît ses grimpeurs. Et
l'enjeu est concret : avec le classement par niveau max, bleu ou blanc décide du paquet dans
lequel ils concourent le 5 novembre.

---

## §3 — Pourquoi je n'écris rien, et ce que ça change à ton ordre

Ton ordre était : mesurer → réparer les comptes → re-vérifier les participations → correctif
structurel. La mesure insère une décision entre 1 et 2 : **on ne peut pas « réparer » 7 comptes
vers une valeur qu'on n'a pas choisie.** Écrire `bleu` sur un grimpeur blanc serait une
réparation qui abîme, et elle se propagerait ensuite dans `level_at_start`.

Ce que je propose d'ajouter avant ton étape 2 :

> **2 bis — reconstituer `baseLevel` pour les comptes qui n'en ont pas**, depuis le niveau le
> plus haut qu'ils aient **jamais** atteint (leurs blocs validés, actifs ou non). C'est une
> information que la base détient encore, et qui disparaît un peu plus à chaque rotation.

Ça rend ensuite le recalcul inoffensif : le repli tombe sur une valeur déclarée plutôt que sur
un défaut. Et ça a la même forme que le `season.baseScore` — un crédit de départ figé, posé une
fois, pour que le compteur incrémental ait un plancher.

---

## §4 — Sur ton §4 et ton addendum §2 : tu as raison, et contre ma propre préférence

Je penchais pour ② (module pur appelé par deux écrans) ; tu montres que la question « quels
écrans appellent le recalcul ? » est **celle qui a produit le bug**, et que passer de 1 à 2 ne
ferme pas la classe. C'est juste.

Et ton addendum corrige ensuite ta propre réponse avec la bonne raison : le calcul a besoin de
l'inventaire des blocs actifs, donc il doit vivre **là où cette donnée est déjà chargée**, et
c'est `ClientDaily`. Mon ① était la bonne piste pour un motif que je ne lui donnais pas.

Ce que je retiens, et que j'applique : **le module pur, appelé depuis `ClientDaily`, et portant
toute la chaîne — attribution des badges manquants PUIS recalcul du niveau**, pas la synchro du
niveau seule. Ton addendum §1 est le point que j'avais manqué : sans l'attribution, le correctif
ne fait monter personne.

---

## §5 — Ton filet, adopté, et il donne la mesure gratuitement

`scripts/audit-niveaux-perimes.js` est déjà la moitié de ton §5 : il compte les écarts et dit
leur sens. Il lui manque d'être branché dans `audit-prod-catalog.js` pour s'afficher à chaque
exécution, même à zéro — je le ferai quand les trois questions ci-dessus seront tranchées, pour
ne pas figer un « attendu » qui pourrait changer.

⚠️ **Et une réserve de méthode sur ce script, qui vaut d'être connue** : il ne réimplémente
**pas** `computeBadgeActive` — ce serait fabriquer une divergence, la leçon du palmarès. Il
calcule la grandeur dominante (la plus haute couleur encore validée **et** active), ce qui
coïncide avec le niveau attendu **tant que chaque badge de couleur exige 1 bloc**. Cette
hypothèse est **vérifiée contre le catalogue au démarrage** et le script s'arrête si elle est
fausse — elle n'est pas supposée.

---

## §6 — Tes deux autres points

**§6, `core.hooksPath` :** ta solution marche, et tes deux vérifications sont faites. `prepare`
est dans `frontend/package.json` ; il s'exécute depuis `frontend/` tout en configurant le dépôt
parent (la config est à l'échelle du dépôt, pas du dossier), et la garde répond correctement
après. La réserve de mon document précédent tombe.

**§7, `ClientClassement` :** ta réponse est meilleure que mes deux options et elle les dissout —
le rang est une propriété du grimpeur, pas de l'affichage ; il se calcule au score avec les ex
æquo partagés, il s'affiche dans sa propre colonne, et trier par nom réordonne les lignes sans
y toucher. Je la propose telle quelle au gérant.

---

## §7 — Une contrainte de notre côté, à intégrer

**`/docs/` ne peut pas être ajouté aux filtres de synchronisation : le projet devient trop
lourd.** Ta proposition tombe donc, et la pièce jointe du jour reste le seul canal pour les
documents. La convention de nommage prend d'autant plus d'importance — elle est le seul tri
disponible.

---

## Ce sur quoi j'attends ton avis

1. **Le niveau d'un grimpeur dont plus aucun bloc de sa couleur n'est ouvert** : bleu (mesure
   stricte) ou son plus haut niveau jamais atteint (§2) ? C'est la question qui bloque tout le
   reste.
2. **Mon étape 2 bis** — reconstituer `baseLevel` depuis l'historique avant tout recalcul —
   est-elle la bonne forme, ou vois-tu un piège ?
3. **Fenêtre du 5 novembre** : vaut-il mieux rattraper maintenant au risque d'une valeur mal
   choisie, ou figer l'existant et traiter après l'épreuve, en acceptant que des grimpeurs
   concourent dans le mauvais paquet ?
