# Retour ClaudeNav — l'auto-inscription en compétition : quatre défauts sur le chemin le plus fréquenté

> Session Claude Code (PC Windows), 03/10/2026, nuit. Déployé en **V2.72** puis **V2.72.1**,
> vérifié en ligne.
>
> Document **séparé** de `RETOUR-competition-audit-et-simulation.md` : ce n'est pas le même
> chantier. Celui-là portait sur le **comptage** des points ; celui-ci sur l'**inscription**.
> Ils se sont rencontrés par accident, et c'est l'histoire la plus intéressante des deux.

---

## §1 — Comment ce chantier est né : d'une question de l'utilisateur, pas d'un plan

À la toute fin du chantier compétition, l'utilisateur a posé une dernière question avant de
me laisser déployer : **« ces éléments touchent-ils et risquent-ils de casser l'écran live de
compétition ? »**

La réponse était non (§8 de l'autre document). Mais en allant vérifier, j'ai trouvé que
**l'écran live résout l'identité des participants uniquement depuis `competition_participants`,
sans repli sur `users`** — alors que les deux écrans de classement, eux, relisent `users`, avec
les commentaires « ✅ Prendre age depuis users » / « ✅ Prendre gender depuis users ».

Ces commentaires sont la pièce à conviction : **quelqu'un a déjà rencontré ce problème et ne
l'a corrigé que là où il le voyait.** L'écran live, qu'on ne regarde que les soirs de
compétition, est resté avec la version naïve.

J'ai signalé le soupçon sans le corriger, parce qu'il dépendait d'un fait que je n'avais pas :
**qui inscrit les participants ?** Si l'admin les inscrit tous, le défaut ne se manifeste
jamais. La réponse de l'utilisateur a tout changé :

> « Les grimpeurs s'inscrivent à toutes les compétitions, l'admin peut le faire le cas
> échéant, sauf bien sûr pour la finale qui est autodéterminée par le classement saisonnier.
> Idéalement, on doit pouvoir s'inscrire à une compétition à venir ou en cours (pour les
> retardataires), mais pas terminée bien sûr. »

Donc : **l'auto-inscription est le chemin normal**, pas un cas de repli. Et la phrase contenait
aussi une spécification, formulée comme une évidence — *« normalement, le champ concerné est
dans l'onglet Mes compétitions »*. Elle ne tenait pas.

---

## §2 — Les quatre défauts, tous sur le parcours réel

Aucun n'a été trouvé en lisant du code. Les quatre ont été **constatés dans le navigateur**,
sur le vrai parcours « Mon espace » → « Mes compétitions » → « S'inscrire », par
`test/e2e-client-registration-flow.mjs` écrit pour l'occasion.

| # | défaut | effet pour le grimpeur |
|---|---|---|
| ① | l'auto-inscription écrivait un **nom vide** | lignes sans nom sur la télévision |
| ② | elle n'écrivait **ni date de naissance, ni genre, ni niveau** | catégorie « Inconnu » sur la télévision |
| ③ | impossible de s'inscrire à une compétition **« à venir »** | il faut attendre le début de l'épreuve |
| ④ | le bouton affichait « Valider mes blocs » **sans être inscrit** | un retardataire croit les inscriptions fermées |

### ① Le nom vide — un champ qui n'existe pas

Le code faisait `user.displayName?.split(' ')[0]` sur l'objet Firebase **Auth**. Or **ce projet
ne renseigne jamais `displayName`** : le nom vit dans le document `users`. Le découpage
produisait donc deux chaînes vides, et `setDoc` les écrivait fidèlement.

C'est un défaut qui ne peut pas se voir en relisant la ligne : elle est correcte en elle-même.
Il faut savoir que la source est vide — et pour le savoir, il faut lire le document écrit.

### ② Les données d'âge jamais écrites

`dateOfBirth`, `gender`, `level` : absents du `setDoc`. Les deux autres chemins d'inscription
les écrivent pourtant, avec le `?? null` qu'impose Firestore :

| chemin | identité et âge écrits ? |
|---|---|
| `AdminCompetitionRegistration` (ajout manuel) | oui |
| « Générer le roster » | oui, avec `?? null` |
| **auto-inscription** (`ClientCompetitions`) | **non** |

Trois chemins vers le même document, trois contrats différents. Le seul qui soit le chemin
*normal* était le seul incomplet, parce que c'est celui que personne ne regarde depuis un
écran d'administration.

### ③ « À venir » invisible — et pourquoi personne ne l'avait vu

La requête était `where('status', '==', 'en cours')`. Un grimpeur ne pouvait donc **pas**
s'inscrire à l'avance.

Ce qui m'intéresse ici, c'est **pourquoi ça a pu durer** : l'écran s'intitulait
« **Compétitions en cours** ». Il décrivait donc **fidèlement** ce qu'il montrait. Il n'y avait
aucune incohérence à repérer, aucun décalage entre l'interface et son contenu — le titre
*justifiait* le manque. Une spécification absente n'est contredite par rien.

Corrigé en `where('status', 'in', ['à venir', 'en cours'])` (aucun index composite : `in` sur
un seul champ), et **le titre a changé avec** : « Compétitions ouvertes aux inscriptions ». Un
titre resté « en cours » aurait rendu une compétition à venir incompréhensible dans la liste.

### ④ Le libellé du bouton — et le piège du jeu d'essai

Le libellé était `competition.registered_count > 0 ? "Valider mes blocs" : "S'inscrire"` :
le compteur **global**. Dès qu'**un seul** grimpeur s'inscrivait, tous les autres lisaient
« Valider mes blocs ».

Le clic faisait la bonne chose (`isAlreadyRegistered` vérifie vraiment), donc rien n'était
cassé — mais un retardataire pouvait croire les inscriptions fermées et ne jamais cliquer. Or
l'inscription des retardataires est **précisément** ce que le défaut ③ venait d'ouvrir : les
deux ensemble se renforçaient.

🔴 **Et c'est ici que ta règle du jour a frappé une troisième fois.** Ce défaut ne peut
apparaître **que s'il existe un autre inscrit**. Mon seed n'avait **qu'un** grimpeur :
`registered_count` valait 0 partout, l'ancien code affichait donc « S'inscrire »,
**correctement, par accident**. Le pas que j'allais écrire serait resté vert sans rien
vérifier. J'ai ajouté un second grimpeur déjà inscrit **avant** d'écrire l'assertion.

Et le rouge a montré l'impact réel mieux que mon raisonnement : avec l'ancien libellé, le pas
d'inscription **échoue aussi**, parce que le test clique un bouton « Valider mes blocs » et
n'atteint jamais le dialogue d'inscription. C'est exactement ce qu'aurait vécu un retardataire.

---

## §3 — Le correctif que les trois autres ne rendent pas inutile

L'écran live gagne le **repli sur `users`**, aligné sur les deux écrans de classement.

On pourrait croire qu'il devient superflu une fois ① et ② corrigés. **Non**, et c'est le point
à retenir : **les participations déjà écrites en production viennent de l'ancien code, et rien
ne les rétroremplit.** Un correctif à l'écriture ne répare jamais le passé. Il fallait les
deux : l'écriture pour l'avenir, le repli pour l'existant.

C'est ce qu'un pas dédié vérifie, et lui seul : il **réécrit** une participation à
l'ancienne — sans date de naissance, sans genre, avec des noms vides — et exige que l'écran
live s'en sorte quand même. Il affiche `« Camille T. »` et `« Vétérans 1 (40-49 ans) »`.

---

## §4 — Chaque correctif cassé séparément, et ce que ça a révélé

Quatre correctifs, un filet de 7 pas. J'ai cassé **chaque correctif isolément** plutôt que de
me contenter d'un filet « vu attraper quelque chose » :

| correctif retiré | pas qui rougissent | pas qui restent verts |
|---|---|---|
| le repli sur `users` | 7 | 6 |
| l'écriture de l'identité + la règle de statut | 2, 4 | 6 |
| l'ancien libellé remis | 3, 4 | 2, 6, 7 |

⚠️ **La ligne qui compte est la deuxième.** En cassant l'écriture de l'identité, le pas 6 —
celui qui regarde **l'écran** — reste **vert**, parce que le repli masque le défaut. C'est la
défense en profondeur qui joue, exactement comme voulu. Mais ça veut dire que **le pas 4, qui
lit le document écrit lui-même, est le seul garde sur ce que l'inscription écrit.**

Je le note parce que c'est contre-intuitif et durable : **ajouter un repli rend l'écran
insensible au défaut qu'il compense, et donc inutilisable comme instrument de mesure de ce
défaut.** Un filet posé uniquement sur le rendu aurait cessé de protéger l'écriture au moment
même où on l'a rendue robuste.

---

## §5 — Trois acquis, dont un qui corrige ta formulation

Les deux premiers sont dans `CLAUDE.md` ; le troisième est la nuance du §4.

1. ⚠️ **Ta règle — « quels défauts ce jeu de données est-il physiquement incapable
   d'exprimer ? » — ne s'arrête pas au seed : elle vaut pour tout ce que l'assertion
   REGARDE.** Rencontrée deux fois de plus le même soir. Une fois sur un seed (un seul
   grimpeur, §2④). Une fois sur **la fenêtre d'observation** : un pas censé vérifier que des
   grimpeurs à égalité partagent le rang 1 lisait « la page courante » de l'écran live, dont
   la rotation tourne pendant le test — il est tombé sur une page de catégorie à **une seule
   ligne**, où « tous les rangs valent 1 » est vrai **sans rien prouver**. Vert, et creux,
   avec un seed irréprochable de dix participants. La question à poser est donc : *de quoi la
   fenêtre d'observation est-elle faite au moment où j'affirme ?*
2. ⚠️ **Sur un filet à plusieurs propriétés, casser le code une fois par PROPRIÉTÉ, pas une
   fois par filet.** Sur l'écran live, remettre `index + 1` ne fait rougir qu'**un** des deux
   pas : le tirage n'a aucune égalité dans le top 10, donc le pas sur la pagination reste
   vert. Un seul essai aurait donné une fausse assurance sur la moitié du filet.
3. ⚠️ **Un repli rend aveugle au défaut qu'il compense** (§4). À savoir avant de poser le
   filet, pas après.

---

## §6 — Ce que je te demande

1. **L'extraction des messages d'annonce en fonction pure** — déjà posée au §7.4 de l'autre
   document, et ce chantier-ci la renforce : c'est le seul chemin d'affichage non couvert, et
   c'est du texte **publié aux grimpeurs**.
2. **Un audit des trois chemins d'écriture de `competition_participants`.** Le §2② montre
   trois contrats différents vers le même document. Je n'ai corrigé que celui qui était faux ;
   je n'ai pas vérifié que les deux autres sont d'accord entre eux sur tout le reste. Une
   fonction partagée qui construise ce document me paraît la bonne forme — même famille que
   `applyCompetitionValidationUpdate`, qui a réglé ce genre de divergence pour la validation.
3. **Un regard sur `audit-prod-catalog.js`** : il vérifie déjà les références mortes entre
   collections. Pourrait-il vérifier des **champs manquants attendus** — une participation
   sans `dateOfBirth` alors que son `users` en a une ? Ça aurait trouvé ① et ② sans attendre
   un soir de compétition, et c'est exactement le genre de défaut d'**état accumulé** que
   l'audit de production est censé attraper là où les comptes de test ne peuvent rien.

---

## §7 — État

Déployé en **V2.72** (①②③ + le départage + le mode officiel) puis **V2.72.1** (④), les deux
vérifiés dans le paquet réellement servi par `blocabrac.web.app`, pas seulement dans `dist/`.

`e2e-client-registration-flow` **7/7**, `e2e-live-display-flow` 8/8,
`e2e-competition-simulation` 10/10, `e2e-competition-flow` 16/16, `npm test` **341/341**,
`tsc`, `lint`.

Et une tâche humaine, qui n'est pas du code : **annoncer la règle de départage aux grimpeurs
avant l'épreuve.** Le bandeau « Quoi de neuf ? » leur présentera les deux entrées, mais un
bandeau ne remplace pas une annonce.
