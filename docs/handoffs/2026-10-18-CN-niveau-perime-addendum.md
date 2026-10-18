# ClaudeNav — addendum au niveau périmé, après lecture du code

> Rédigé le 18/10/2026, après `2026-10-18-CN-niveau-perime.md`.
>
> L'index du projet a été resynchronisé : il porte le `CLAUDE.md` **d'après le découpage**, avec
> ses liens 📖. C'est donc l'état d'aujourd'hui, et non plus celui du 28 juillet. Les trois
> points ci-dessous viennent de cette lecture, pas de mon raisonnement.
>
> ⚠️ **§1 — le bug est plus grand que son diagnostic : le bloc de `ClientStats.tsx` ne
> synchronise pas seulement le niveau, il attribue les badges.**
>
> **§2 — et je corrige mon §4 : mon argument de coût ne tenait pas, parce que je n'avais pas lu
> ce que le calcul exige en entrée.**

---

## §1 — ⚠️ Ce n'est pas la synchro du niveau qui est enfermée dans cet écran, c'est toute la chaîne

Dans le même bloc, avant la synchronisation du niveau, il y a une boucle sur le catalogue
`badges` qui **crée les `client_badges` manquants** — les badges `automatic` et `mission` dont le
critère est rempli et que le grimpeur ne possède pas encore. Le commentaire sur place le dit :
*« on les attribue ici, au chargement de "Mes stats" »*.

Conséquence, et elle dépasse le niveau périmé :

> **Un grimpeur qui n'ouvre jamais « Mes stats » n'obtient jamais un badge automatique.** Pas
> « avec du retard » : jamais. Et comme le niveau suit le plus haut badge actif, son niveau ne
> monte jamais non plus.

Le cas de Stéphane est donc **une moitié du défaut** : son niveau est trop haut parce que la
redescente n'a pas eu lieu. L'autre moitié est invisible et probablement plus répandue — des
grimpeurs dont le niveau est trop **bas**, parce que l'attribution n'a jamais tourné. Celui qui
consulte ses stats est à jour ; celui qui se contente de valider ses blocs ne l'est pas.

**Et ça change ce que tes trois pistes doivent déplacer.** Elles parlent toutes de « la
synchro ». Si c'est la synchronisation du niveau seule, le correctif est à moitié fait :
l'attribution des badges reste accrochée au même écran, et avec elle la seule chose qui fait
monter un niveau.

---

## §2 — Correction de mon §4 : mon argument de coût était faux

J'ai écrit qu'un recalcul attaché au chargement de `userData` serait « moins cher que ①, pas
plus ». Je n'avais pas lu ce que le calcul consomme : `computeBadgeActive` a besoin des blocs
validés du grimpeur **croisés avec l'inventaire des blocs encore actifs**
(`validatedExistingByColorLocal`, `inventoryByColor`), plus le catalogue `badges`. Ce n'est pas
une lecture d'appoint, c'est un jeu de lectures complet.

C'est exactement la faute dont je me donnais la règle il y a trois heures — un fait de code non
lu servant de justification. Je la refais le jour même. La différence, cette fois, est que je
l'ai attrapée en lisant plutôt que par ta correction, ce qui est le minimum.

**Ce que la lecture change à ma recommandation :**

Le module pur reste la bonne moitié de ②. Mais le lieu d'appel ne devrait pas être « le
chargement de `userData` » dans l'abstrait : il devrait être **l'endroit qui tient déjà
l'inventaire en main**, et c'est `ClientDaily` — l'écran que les grimpeurs ouvrent pour valider,
donc celui qui charge les blocs actifs de toute façon.

Ce qui veut dire que **ton ① était probablement la bonne réponse, pour une raison que tu ne lui
donnais pas** : non pas « ajouter des lectures sur l'écran le plus fréquenté », mais « poser le
calcul là où sa donnée d'entrée est déjà chargée ». Formulé ainsi, le surcoût n'est plus le même
argument, et le choix n'est plus un compromis.

Reste ton objection du quatrième écran, et elle est réelle. Elle se traite non par le lieu
d'appel mais par le filet du §5 de mon document : le contrôle d'écart dans l'audit, affiché à
chaque exécution. Un écran qui lit un `users.level` périmé devient alors un écart mesuré, pas
une découverte fortuite.

---

## §3 — Un échec d'attribution est silencieux

La boucle écrit chaque badge dans un `try/catch` qui fait un `console.error` et continue. Donc
un badge que les règles refusent, ou une écriture qui échoue, ne produit **rien** : pas
d'affichage, pas de compteur, pas d'alerte. Le grimpeur voit simplement un badge qu'il n'a pas.

C'est la même famille que `challenges.progress` — compteur sans filet et à échec silencieux —
que tu as déjà classée ouverte. Ici le filet du §5 la couvre gratuitement : un badge non attribué
produit un niveau différent de son recalcul, donc un écart visible.

---

## §4 — Ce que ça change pour le 5 novembre

Mon §1 disait : mesurer, puis réparer les comptes, puis re-vérifier les inscriptions. La lecture
ajoute une étape **avant** les deux dernières, et c'est celle que personne n'avait listée :

> **Le rattrapage n'est pas « recalculer `users.level` ». C'est « attribuer les badges
> manquants, puis recalculer `users.level` ».**

Dans cet ordre, sinon on recalcule un niveau à partir d'un palmarès de badges incomplet, et on
fige une valeur trop basse — toujours juste au regard des badges possédés, et fausse au regard
de ce que le grimpeur a réellement réussi.

Un script à clé de service peut écrire ces `client_badges` : il passe au-dessus de la règle qui
limite un client à ses propres badges. Mais le document reste **immuable une fois créé**
(`update, delete: if false`), donc un badge attribué par erreur ne se reprend pas depuis
l'application — la simulation d'abord, comme pour le reste.

Et la mesure du §1.1 devient plus intéressante qu'annoncé : elle dira non seulement combien de
comptes ont un niveau périmé, mais **dans quel sens**. Si la majorité des écarts sont vers le
bas, le défaut n'a jamais été « un badge qui ne retombe pas » — c'est « la chaîne entière
n'avance que pour ceux qui consultent leurs statistiques ».
