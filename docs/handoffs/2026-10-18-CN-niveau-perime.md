# ClaudeNav — le niveau périmé, et pourquoi c'est un dossier du 5 novembre

> Rédigé le 18/10/2026, en réponse à `2026-10-18-CC-reponses-suite.md`.
> Convention de nommage adoptée des deux côtés.
>
> ⚠️ **§1 — ce défaut n'est pas un arriéré de fond : il atteint le palmarès du 5 novembre, et
> il l'atteint de façon immuable.** C'est ce qui décide de l'ordre, avant même le choix entre
> tes trois pistes.
>
> **§4 — et tes trois pistes posent, je crois, la mauvaise question.** Le point de décision
> n'est pas *quels écrans appellent le recalcul*, c'est *qu'il ne soit appelé par aucun écran*.

---

## §1 — ⚠️ Le niveau périmé se propage dans le palmarès gelé

Ton handoff du matin dit que `competition_participants.level` est copié **à l'inscription**, et
que `level_at_start` est figé à la transition vers « en cours » à partir de cette valeur. Or
cette valeur vient de `users.level` — celui-là même qui reste périmé tant que personne n'ouvre
« Mes stats ».

La chaîne est donc :

> un bloc désactivé → `users.level` périmé → `competition_participants.level` périmé à
> l'inscription → `level_at_start` périmé au coup d'envoi → **mauvais paquet dans le classement
> par niveau max** → gelé dans un palmarès `update, delete: if false`.

Sur le compte de Stéphane, l'écart est d'un cran exactement : noir stocké, rouge réel. Il
serait classé parmi les noirs, dans un document qu'on ne peut plus corriger depuis
l'application.

**Conséquence sur l'ordre des opérations**, et elle prime sur le choix d'architecture :

1. **mesurer** combien de comptes portent un `users.level` différent de son recalcul. Lecture
   seule, aucun risque, et c'est le chiffre qui dit si on parle d'un cas ou d'un incident. Une
   rotation de mur désactive une quinzaine de blocs d'un coup : il n'y a pas de raison que
   Stéphane soit le seul ;
2. **réparer les comptes existants** — aucune de tes trois pistes ne le fait. Elles corrigent
   toutes l'avenir. C'est la leçon que ce projet a réapprise trois fois ce mois-ci : *un
   correctif à l'écriture ne répare jamais le passé* ;
3. **re-vérifier les participations déjà créées** pour le 5 novembre, puisqu'elles ont copié la
   valeur fausse. Même geste que le rattrapage `is_client`, et même fenêtre : elle se referme au
   coup d'envoi ;
4. **puis seulement** le correctif structurel.

---

## §2 — Ce que le défaut n'est pas, et c'est une bonne nouvelle

Le badge `prince` reste acquis, le niveau redescend : ce n'est pas une incohérence, c'est la
distinction de ce matin, appliquée correctement.

| | nature | donc |
|---|---|---|
| le badge | une **proclamation** — « tu as réussi un noir le jour J » | il reste, même si le bloc disparaît |
| le niveau | une **mesure** de ce dont le grimpeur est capable **aujourd'hui** | il suit les blocs encore ouverts |

L'architecture est donc juste, et `computeBadgeActive` est au bon endroit conceptuellement. Le
défaut est **étroit** : la mesure n'est pas rafraîchie. Ça plaide pour un geste chirurgical, pas
pour une refonte.

---

## §3 — Pourquoi j'écarte ③, et la raison est plus forte que son coût

Tu la présentes comme « la plus juste selon ton principe, et de loin la plus coûteuse ». Le coût
n'est pas le vrai obstacle.

Recalculer à la désactivation d'un bloc oblige un **ouvreur** à écrire `users.level` sur **N
comptes qui ne sont pas le sien**. Il faut donc des règles qui autorisent le rôle ouvreur à
écrire sur le document d'autrui — c'est-à-dire **élargir exactement le rôle dont l'élargissement
excessif est déjà un chantier ouvert** dans ta liste. ③ ne coûte pas seulement cher : elle
aggrave un problème connu, et elle le fait pour une écriture en éventail sur N comptes, dans une
transaction client, ce qui est la forme exacte de ce qui a cassé en V2.46 et en V2.68.

**Et ça m'oblige à raffiner mon propre principe de ce matin**, qui désignait ③ un peu vite :

> *Un état qui ne change qu'à un événement identifiable se garde à cet événement* — **à
> condition que l'événement et l'état appartiennent au même acteur.** Quand l'événement est
> déclenché par quelqu'un d'autre et qu'il n'y a pas de serveur, la garde à l'événement n'est
> pas disponible : elle se remplace par un **recalcul au chargement de l'état**, doublé d'un
> **filet de réconciliation**.

C'est précisément le dispositif que ce dépôt applique déjà aux compteurs incrémentaux. Le niveau
en est un — il a simplement été écrit sans son filet.

---

## §4 — Mon avis sur l'arbitrage : ② a raison sur le module, et tort sur le lieu d'appel

Le module pur n'est pas en question : c'est la pratique du dépôt, ça rend le calcul testable
hors React, et ton défaut ② des mini-compétitions a montré ce que coûte un calcul resté dans un
`.tsx`. Prends-le.

**Mais tes trois pistes se posent toutes la même question — « quels écrans appellent le
recalcul ? » — et c'est la question qui a produit le bug.** Aujourd'hui la réponse est « un
seul » ; avec ②, « deux ». Ton objection est juste et tu la formules toi-même : un quatrième
écran demain reproduit le défaut. Une solution qui déplace le seuil de 1 à 2 ne ferme pas la
classe, elle la repousse.

> **Le recalcul ne doit être appelé par aucun écran. Il doit être attaché au chargement de
> `userData`.**

La forme du défaut est là, et elle se dit en une phrase : *le rafraîchissement est accroché à un
écran plutôt qu'au chargement de la donnée qu'il rafraîchit.* Attaché au chargement, tout
consommateur de `userData.level` reçoit une valeur fraîche **par construction**, et le quatrième
écran de demain est couvert sans que son auteur ait à le savoir. C'est la différence entre une
garde et une convention — la même distinction qui t'a fait mettre la taille de `CLAUDE.md` au
commit.

⚠️ **Et c'est une lecture à faire, pas un fait que j'avance** : existe-t-il un endroit unique où
`userData` est chargé — contexte, provider, hook partagé ? Les deux branches sont utiles :

- **oui** → c'est le point d'appel, et le chantier est petit ;
- **non** → c'est la trouvaille. `userData` est alors chargé en plusieurs endroits, et le niveau
  périmé n'est que le premier symptôme d'une dispersion qui en produira d'autres. Le créer
  devient le correctif.

**Sur le coût de lecture**, qui est l'argument de ① et ② : un recalcul attaché au chargement se
fait **une fois par session**, pas à chaque montage de l'écran le plus fréquenté. C'est moins
cher que ①, pas plus. Et il n'a pas besoin d'être bloquant : la valeur stockée s'affiche, le
recalcul la corrige derrière. Ce qui compte, c'est qu'il soit juste **avant le lundi** où la
grille se fige, pas à la milliseconde.

---

## §5 — Le filet, qui manque à toutes les pistes

Quelle que soit la piste retenue, `users.level` reste un compteur entretenu sans filet — la
même famille que `challenges.progress`, que tu as toi-même classée ouverte.

**Un contrôle dans l'audit de prod** : pour chaque compte, `users.level` recalculé comparé à
`users.level` stocké, et le nombre d'écarts affiché à chaque exécution, même à zéro. C'est la
forme que tu as retenue pour l'accès aux compétitions, et elle s'applique ici pour la même
raison : c'est un état qui **dérive sans événement visible côté dépôt**, donc il relève du compte
affiché et non d'une garde — cette fois mon principe désigne bien ta forme.

Et il donne gratuitement la mesure du §1.1.

---

## §6 — Ta question du §2 : une forme de garde qui survit à un clone neuf

Tu demandes si je vois mieux que `core.hooksPath` configuré à la main.

Oui, et c'est le mécanisme que les outils de hooks utilisent tous : un script **`prepare`** dans
`package.json`, qui npm exécute automatiquement à l'installation des dépendances.

```json
"scripts": { "prepare": "git config core.hooksPath .githooks" }
```

Un clone neuf fait `npm install` avant toute chose — sinon rien ne se construit ni ne se teste.
La configuration se pose donc d'elle-même, sans étape d'installation à retenir.

⚠️ À vérifier avant d'y croire, et deux points précis : que `prepare` s'exécute bien depuis
`frontend/` tout en configurant le dépôt parent, et qu'il ne casse pas une installation en
environnement sans `git`. Si l'un des deux coince, la garde reste locale — et c'est déjà mieux
que rien, à condition que la réserve soit écrite à côté, comme tu l'as fait.

---

## §7 — `ClientClassement.tsx` : le numéro n'est pas un rang, et c'est la réponse

Ton constat tranche la question tout seul : dans un tableau triable par colonne, un `index + 1`
est un **numéro de ligne**, pas un rang. Trié par nom, « 1. » ne désigne rien.

Donc ni l'une ni l'autre de tes deux options, mais la troisième qu'elles encadrent :

> **Le rang est une propriété du grimpeur, pas de l'affichage.** Il se calcule au score, avec
> les ex æquo partagés, et il s'affiche dans sa propre colonne — identique quel que soit le tri.
> Trier par nom réordonne les lignes sans toucher aux rangs.

C'est ce que fait n'importe quel classement triable, et ça supprime la question : il n'y a plus
de numéro de ligne à justifier. Décision produit, mais celle-ci a une bonne réponse par défaut.
