# Plan — Classement par niveau max, palmarès de clôture, anonymat du live display

> Rédigé le 15/10/2026, à partir de trois demandes du gérant pour la compétition du
> **5 novembre** (dans trois semaines).
>
> **Trois conséquences de la demande ne sont pas dans la demande, et elles décident de
> l'architecture :**
>
> ⚠️ **§1.2 — un classement par niveau max affiché *en direct* divulgue les cotations
> cachées pendant l'épreuve.** C'est la base même sur laquelle repose la règle de
> départage. Il faut trancher avant d'écrire la vue, pas après.
>
> ⚠️ **§1.6 — ce classement partitionne les participants par la grandeur même que la règle
> de départage utilise en premier critère.** Dans un paquet, ce critère est constant par
> construction : la règle y est affaiblie, et aucun test actuel n'exerce ce cas.
>
> ⚠️ **§2.2 — un palmarès recalculé à la lecture bouge si on recote un bloc après l'épreuve.**
> Le gérant en a recoté un il y a treize jours. Un palmarès est un fait daté, pas une requête.
>
> Et un prérequis : **§0.1 — `is_client` décide qui apparaît dans quatre des cinq
> classements.** Le défaut trouvé hier soir en centralisant n'est plus cosmétique, il est sur
> le chemin critique.

---

## §0 — Avant d'écrire une ligne

### 0.1 — ⚠️ `is_client` sur les participations existantes

Hier soir, la centralisation dans `utils/competitionParticipant.ts` a révélé une quatrième
divergence : `is_client` codé en dur à `true` sur l'auto-inscription, contre
`roles.includes('client')` ailleurs. La fonction partagée corrige **l'écriture future**. Le
rattrapage du matin portait sur le nom et la date de naissance, **pas sur `is_client`**.

C'est la leçon de ton propre §3 d'hier : *un correctif à l'écriture ne répare jamais le passé.*

Or ce lot-ci fait de `is_client` **le filtre de quatre classements sur cinq** (§2.1). Un
`is_client` faux ne produit plus une donnée inexacte dans un document que personne ne lit :
il met un visiteur dans le classement des clients, ou en retire un client — **et le palmarès
sera gelé avec**.

**À faire** : relire les participations existantes, comparer `is_client` à
`roles.includes('client')` sur le compte, corriger les écarts. Trois documents, dix minutes.
Si c'est déjà fait depuis hier soir, le dire et passer.

**À ajouter à l'audit de prod** : `is_client` incohérent avec les rôles du compte. C'est une
référence incohérente, exactement de la famille déjà couverte.

### 0.2 — Les six lectures qui conditionnent le plan

Je n'ai lu aucun de ces points dans le code. Chacun est une **lecture à faire**, et chacun
vient avec sa conséquence, pour que tu puisses avancer sans aller-retour.

| # | À lire | Si A | Si B |
|---|---|---|---|
| 1 | **Les résultats d'une compétition alimentent-ils `client_boulder_results`, ou vivent-ils dans des documents propres ?** | A : ils y vont → le niveau bouge tout seul, et « le niveau après l'épreuve » se lit comme d'habitude | B : ils sont séparés → le niveau de classement doit être calculé en §1.1, il ne se lit nulle part |
| 2 | **Comment un résultat est-il rattaché à une compétition : par un `competitionId` explicite, ou par une fenêtre de dates ?** | A : `competitionId` → périmètre net, rien à faire | B : fenêtre de dates → ⚠️ un bloc validé dans la salle pendant la fenêtre **hors compétition** compterait. À trancher avant tout calcul |
| 3 | **Comment une compétition devient-elle « clôturée » : action admin, ou comparaison de dates à la lecture ?** | A : action admin → « automatiquement » suppose que quelqu'un clique | B : dates → l'affichage §2.3 est gratuit et vraiment automatique |
| 4 | **Les trois classements existants (open, genre, âge) partagent-ils un mécanisme de partition, ou sont-ils trois chemins distincts ?** | A : partagé → le niveau max est une fonction de clé + un libellé, une demi-journée | B : trois copies → ⚠️ voir §4.2 : l'extraction passe **avant** l'ajout |
| 5 | **Quel mode de compétition sera utilisé le 5 novembre, et les cinq classements ont-ils un sens dans les quatre modes ?** | — | ⚠️ Ne généralise pas aux quatre modes avant le 5. Fais marcher celui du 5, vérifie-le, généralise après |
| 6 | **Le live display est-il authentifié, et lit-il les documents de participation directement ?** | — | voir §3.3 |

La n°1 est la plus structurante : elle décide si §1.1 est un calcul ou une lecture.

### 0.3 — Deux tâches humaines, qui ont maintenant une date

Elles étaient classées « pas maintenant ». Le 5 novembre les rend datées, et elles ne sont
pas déléguables à du code.

1. **Annoncer la règle de départage aux grimpeurs.** Elle repose sur des cotations cachées
   pendant l'épreuve : personne ne peut la déduire en grimpant. Jusqu'ici l'enjeu était
   théorique, toutes les compétitions étant des tests. À partir du 5 novembre, un palmarès
   officiel et **gelé** sera publié : un départage non annoncé y sera lu comme arbitraire.
2. **Annoncer la règle du niveau max** du §1.1 — en particulier que réussir au-dessus de son
   niveau fait **monter de paquet pendant l'épreuve**. Si un grimpeur l'apprend en lisant le
   palmarès, il le vivra comme une sanction de sa performance.

Les deux tiennent dans la même annonce, et le panneau « Quoi de neuf » empile les entrées
depuis V2.71.2. **Avant le 5 novembre**, pas le 5.

---

## §1 — Le classement par niveau max

### 1.1 — La règle, écrite comme un maximum

La formulation du gérant — *« si la compétition fait passer dans le niveau du dessus, alors
c'est ce niveau qui est comptabilisé »* — s'écrit :

> **`niveau_de_classement = max(niveau avant l'épreuve, plus haute couleur réussie pendant
> l'épreuve)`**

Écrite ainsi, elle est **monotone** : un résultat de compétition ne peut que faire monter, et
l'ordre dans lequel on applique les choses n'a plus d'importance. Toute autre écriture
(« remplacer par », « mettre à jour si ») laisse une ambiguïté sur le cas où le niveau
baisserait.

C'est la monotonie de V2.56 — *on ne perd pas ce qui est acquis* — et pas celle que j'avais
confondue avec elle en septembre (*on gagne plus en répétant*). Ici, rien ne se gagne en
répétant : une seule réussite dans une couleur suffit, la deuxième n'ajoute rien au paquet.

**Anti-sandbagging** : c'est l'effet utile de la règle, et il vaut d'être dit au gérant.
Sans elle, un grimpeur aurait intérêt à sous-déclarer son niveau pour gagner le paquet
facile. Avec elle, réussir un noir range parmi les noirs. La règle n'est pas une contrainte
technique, c'est la règle sportive.

### 1.2 — ⚠️ En direct, ce classement divulgue les cotations cachées

C'est le point à trancher avant d'écrire quoi que ce soit.

Pendant l'épreuve, les cotations sont **cachées** — c'est l'hypothèse sur laquelle repose
toute la règle de départage. Or le paquet d'un grimpeur est, par construction, **une fonction
de la couleur de ce qu'il a réussi**.

Donc : si le classement par niveau max est affiché en direct, voir un grimpeur passer du
paquet « rouge » au paquet « noir » **révèle qu'il vient de réussir un noir** — c'est-à-dire
la cotation d'un bloc que personne n'est censé connaître. Le classement devient un canal
latéral sur la donnée même qu'on cache.

Et une deuxième conséquence, indépendante : **le classement est instable**. Un grimpeur peut
changer de paquet à tout instant, donc sortir d'un classement et apparaître dans un autre, en
cours d'épreuve. Ce n'est pas un défaut, c'est la règle du §1.1 appliquée en direct — mais
c'est illisible sur un écran projeté dans la salle.

**Trois options, par ordre de préférence :**

| | ce qu'on fait | fuite | stabilité |
|---|---|---|---|
| **A — recommandée** | le classement par niveau max n'existe **qu'à la clôture** | aucune | sans objet |
| **B — repli** | en direct, les paquets sont **ceux du départ**, figés ; à la clôture, la règle du §1.1 s'applique | aucune | stable, mais les paquets diffèrent entre provisoire et définitif — à libeller explicitement |
| **C — à écarter** | en direct, paquets recalculés en continu | ⚠️ divulgue les cotations | instable |

**A** satisfait littéralement la demande n°2 du gérant, qui demande ce classement *à la
clôture*. La demande n°1 ne dit pas « en direct » ; elle dit « qu'apparaisse un nouveau
classement ». Prends A, et signale le choix — c'est une décision produit, pas technique, et
elle appartient au gérant.

### 1.3 — Le niveau se recalcule, il ne se lit pas sur un compteur

`bestColorRank` existe et sert ailleurs. **Ne l'utilise pas comme clé de paquet sans le
recalculer.** Les raisons sont documentées dans ce dépôt :

- c'est un compteur entretenu, donc sujet à la même dérive que le score — et on a passé la
  soirée du 2 octobre à réparer exactement cela ;
- un paquet faux serait **gelé** avec le palmarès (§2.2), donc faux pour toujours ;
- selon la lecture n°1 du §0.2, il peut tout simplement ne pas inclure les résultats de
  l'épreuve.

**Règle à inscrire : la réconciliation passe avant le gel.** Le script de publication (§2.3)
lance la réconciliation, vérifie qu'elle ne trouve rien à corriger, et **refuse de publier**
si elle trouve quelque chose. Une ligne de garde, et le palmarès ne peut pas geler une dérive.

### 1.4 — Les paquets de taille 1

Avec une soixantaine de comptes et une vingtaine de participants répartis sur cinq ou six
couleurs, des paquets à un seul grimpeur sont le cas normal, pas le cas limite. Un classement
à un participant n'est pas un classement.

**Affiche tous les paquets non vides, avec leur effectif dans le titre** — « Niveau rouge —
3 participants ». Ne masque aucun paquet : un grimpeur qui ne se trouve dans aucun classement
produit une question à l'accueil, et le masquage est précisément ce qui la produit. Un paquet
d'un seul participant s'affiche avec son effectif, ce qui le qualifie tout seul sans qu'on
ait à couronner personne.

Si le gérant veut un seuil, c'est sa décision — mais ne l'invente pas, et ne bloque pas le
lot en l'attendant.

### 1.5 — Clients uniquement, et c'est structurel

Le niveau est une notion de l'application : il est piloté par les badges depuis V2.54, et un
visiteur extérieur n'en a pas. Le classement par niveau max **ne peut donc exister que pour
les clients**. Ce n'est pas une restriction arbitraire qu'on choisit, c'est la seule
population où la clé est définie — et c'est cohérent avec la demande n°2, qui le range parmi
les classements clients.

À écrire explicitement dans le code, avec cette raison : sinon quelqu'un « corrigera »
l'omission dans six mois.

### 1.6 — ⚠️ La règle de départage est affaiblie dans ce classement, et aucun test ne l'exerce

Voici la conséquence que je trouve la plus intéressante, et elle n'est visible qu'en
rapprochant deux choses du projet.

La règle de départage s'appuie sur les cotations. Le classement par niveau max **partitionne
les participants par leur plus haute cotation réussie**. Donc, à l'intérieur d'un paquet,
cette grandeur est **constante par construction** : le premier critère de départage ne
discrimine plus rien.

Trois conséquences :

1. la règle dégrade sur son critère suivant — s'il en a un ;
2. si le critère suivant est lui aussi fonction de la couleur maximale, le départage peut
   **ne séparer personne**, et les ex aequo deviennent la norme dans ce classement ;
3. **aucun test actuel n'exerce ce cas**, parce qu'aucun des trois classements existants ne
   partitionne par la clé du départage. Open, genre et âge sont tous orthogonaux à la couleur.

**À faire** : un cas de test où le critère premier du départage est constant sur tous les
participants d'un paquet, et une assertion sur ce que la règle produit alors. Si elle ne
sépare pas, **affiche l'ex aequo honnêtement** plutôt que d'inventer un critère secondaire
que les grimpeurs n'ont pas eu dans l'annonce du §0.3. Un ex aequo annoncé est un résultat ;
un critère secondaire improvisé est une contestation.

Et s'il faut un critère secondaire, il entre dans l'annonce du §0.3 — donc il faut le
décider **avant** le 5, pas en lisant le palmarès.

---

## §2 — Les cinq classements de clôture

### 2.1 — La lecture de la demande

> *« le classement général open complet, ainsi que tous les classements du client : open,
> genre, catégorie d'âge et niveau max »*

Deux familles, et c'est `is_client` qui les sépare :

| # | classement | population | partition |
|---|---|---|---|
| 1 | **général open complet** | tous les participants | aucune |
| 2 | client open | `is_client` | aucune |
| 3 | client genre | `is_client` | `gender` |
| 4 | client catégorie d'âge | `is_client` | tranche d'âge dérivée |
| 5 | client niveau max | `is_client` | §1.1 |

**Vérifie cette lecture avec Stéphane avant de coder.** C'est une interprétation de la phrase
du gérant, pas un fait : « complet » peut aussi vouloir dire « le classement général de la
salle », tous comptes confondus et non les seuls participants. Les deux sont plausibles et
l'écart est important.

Ce tableau dit aussi pourquoi §0.1 est bloquant : **quatre lignes sur cinq sont filtrées par
`is_client`.**

### 2.2 — ⚠️ Gelé, pas recalculé — et la raison est la recotation du 02/10

Deux conceptions possibles, et le choix est structurant.

**Recalculer à la lecture** : simple, aucun document nouveau, toujours cohérent avec la
donnée. Et c'est exactement pour cela qu'il faut l'écarter — parce que la donnée bouge
derrière. On l'a écrit noir sur blanc le 2 octobre :

> *Recoter un bloc déjà validé réécrit rétroactivement le score de tous ceux qui l'ont
> validé*, parce que `client_boulder_results` ne stocke pas la couleur.

Le gérant a recoté un bleu en violet **le 2 octobre**. Il le refera. Un palmarès recalculé à
la lecture **changerait de podium un mois après l'épreuve**, sans que personne n'ait touché à
la compétition. Un score qui bouge abîme la confiance ; un podium qui bouge la détruit.

Deux raisons de plus, accessoires mais réelles : le gel fait tomber le coût de lecture de
N participations à **un document** (Spark, quota de lectures), et il rend la page de la
compétition lisible indéfiniment sans dépendre de l'état courant de `boulders`.

**Donc : gel.**

> **Un palmarès est un fait daté, pas une requête.**

### 2.3 — Qui écrit le gel, sur Spark, sans fonction

Pas de Cloud Functions : il n'existe aucun déclencheur serveur. Trois écrivains possibles.

| | écrivain | verdict |
|---|---|---|
| a | une action admin dans l'application | acceptable, mais crée un chemin d'écriture client sur le résultat officiel |
| b | le premier client qui charge la page après la fin | ⚠️ à écarter — résultat officiel écrit par un client, course entre plusieurs navigateurs, règles permissives, et le cache IndexedDB peut servir du vide |
| c | **un script, comme la réconciliation** | ✅ recommandé |

**(c) est la bonne réponse, et elle est déjà dans les habitudes du dépôt.** Un script
`publish-competition-rankings.mjs --competitionId X [--dry-run]`, du même moule que les scripts
de réconciliation : simulation d'abord, écart affiché, puis écriture. Il tourne avec la clé de
service, **donc hors des règles** — ce qui permet la posture la plus serrée possible côté
client :

```
match /competition_rankings/{id} {
  allow read:  if request.auth != null;
  allow write: if false;
}
```

Aucun client n'écrit jamais le palmarès. Il n'y a pas d'accès à `resource.data` dans cette
règle, donc **pas de risque d'écrasement de règle sur document absent** — le piège du 2
octobre ne s'applique pas ici. En revanche le **code client** doit gérer le document absent
(§4.4), ce qui est un cas normal et non une erreur de permission.

**Et « automatiquement » dans la demande du gérant ?** Il est satisfait sans contradiction :

- dès que la compétition est terminée (lecture n°3 du §0.2), la page affiche les classements
  **calculés à la lecture**, libellés **« classement provisoire »** ;
- quand le script a tourné, le palmarès **gelé** les remplace, libellé **« palmarès officiel »**
  avec sa date de publication.

Quelque chose apparaît tout seul à la clôture — c'est ce que le gérant demande — et le
résultat officiel reste immuable.

### 2.4 — Un seul rendu, deux sources

Le §2.3 crée deux origines pour le même affichage : calculé et gelé. **C'est précisément la
situation qui fabrique une divergence**, et on en a trouvé quatre hier en centralisant un cas
identique.

**Un seul composant de rendu, qui reçoit un objet classement.** Les deux sources produisent
le même objet ; seul le libellé (provisoire / officiel) diffère. Et le test qui compte : la
**même** entrée, passée par les deux chemins, produit des classements **identiques** — même
ordre, mêmes rangs, mêmes ex aequo. S'ils divergent, l'un des deux est faux.

C'est la transposition directe de ce que tu as fait hier avec `competitionAnnouncement.ts`,
dont les tests assertent l'**égalité des rangs avec l'écran** plutôt qu'un texte.

### 2.5 — Le gel se crée, il ne se met pas à jour

Le script **refuse d'écraser** un palmarès existant, sauf `--force` explicite. Sinon, un
second passage après une recotation réécrirait le palmarès — et annulerait exactement ce que
le gel sert à protéger.

Même motif que le garde-fou de dérive de la réconciliation : le refus est le comportement
correct, `--force` existe pour les cas où l'on sait pourquoi.

---

## §3 — L'anonymat du live display

### 3.1 — Ce que cette demande vérifie vraiment

« Vérifier que le live display n'affiche bien que prénom et première lettre du nom » n'est pas
une demande d'affichage, c'est une demande de **confidentialité** sur un écran public. Elle
mérite d'être traitée comme telle : l'enjeu n'est pas l'esthétique de la ligne, c'est qu'un
écran projeté dans la salle ne publie pas l'identité complète de mineurs.

### 3.2 — L'inventaire, puis l'assertion — pas l'inspection à l'œil

C'est la méthode du chantier libellés, et elle a tenu quand ses trois prémisses étaient
fausses :

1. **inventaire statique** : toutes les occurrences, dans le live display, où un nom de
   participant est rendu. Pas « regarder l'écran » — le compte dépend de la donnée affichée ;
2. **une assertion partagée**, sur le DOM rendu : aucun nœud du live display ne contient de
   nom de famille complet. Avec un jeu de participants dont les noms sont assez longs pour
   que la troncature soit détectable (`Dupont-Lachaise`, pas `Li`) ;
3. ⚠️ **la voir rouge d'abord** — en désactivant volontairement la troncature, ou sur un
   participant dont le nom n'est pas tronqué s'il en existe un. Un filet qu'on n'a jamais vu
   attraper quelque chose n'est pas un filet ;
4. seulement ensuite, corriger ce que l'inventaire a trouvé.

Et un cas limite à couvrir explicitement : **un nom de famille absent ou vide**. La fonction
de troncature ne doit pas produire `Stéphane .` ni planter — c'est le cas réel du compte
rattrapé hier, qui n'a ni nom ni date de naissance.

### 3.3 — ⚠️ Tronquer l'affichage ne protège pas la donnée (constat, hors de ce lot)

À vérifier (lecture n°6 du §0.2), et **à ne pas traiter dans ce lot** :

si le live display lit les documents de participation complets et tronque à l'affichage, alors
le nom entier et la **date de naissance** sont dans la charge réseau et dans la mémoire du
navigateur. Pour un écran projeté dans la salle, c'est sans conséquence pratique. Si le live
display est accessible sans authentification, ça n'en est plus une.

La question en dessous est celle des règles : **qui peut lire `competition_participants` ?**
Si tout compte authentifié peut lire toutes les participations, chaque grimpeur peut lire le
nom complet et la date de naissance de tous les autres, enfants compris.

Et il existe une sortie propre, qui réduit le besoin au lieu de le garder : le classement par
catégorie d'âge a besoin de la **tranche**, pas de la date de naissance. Un champ
`age_category` dérivé à l'inscription permettrait au live display de ne jamais lire de date de
naissance.

**Je le signale, je ne le mets pas dans ce lot.** La consigne est de ne rien casser à trois
semaines d'un événement, et une modification de règles prend effet immédiatement pour tous les
utilisateurs, sans version d'application. C'est un chantier à part, à chiffrer après le
5 novembre — ou avant, si Stéphane juge que le live display est exposé.

---

## §4 — Les cinq façons dont ce lot peut casser l'existant

La consigne est explicite : *sans toucher ni casser ce qui fonctionne déjà*. Voici les cinq
chemins par lesquels il pourrait le faire. Chacun rejoue un incident déjà vécu dans ce projet.

### 4.1 — Modifier le calcul des classements existants

**Garde** : avant toute modification, un test qui **épingle** les trois classements actuels
(open, genre, âge) sur un jeu de participants fixe — ordre complet, rangs, ex aequo. Vert
avant, vert après, **à l'identique**. Si l'un bouge, le refactor a changé un résultat visible
par les grimpeurs.

### 4.2 — L'extraction de la partition va révéler des divergences

Si la lecture n°4 donne « trois chemins distincts », l'extraction du mécanisme de partition
passe **avant** l'ajout du quatrième — parce qu'ajouter par copie est précisément comment on
obtient une quatrième divergence, et on en a trouvé une hier.

Et l'acquis d'hier s'applique en entier :

> **Centraliser ne prévient pas seulement la divergence, ça la révèle.**

⚠️ **Donc : les divergences révélées se signalent, elles ne s'harmonisent pas en silence.**
Harmoniser, c'est changer la sortie d'un classement existant — donc le rang de quelqu'un. Le
choix de la bonne variante est une décision produit, pas un nettoyage de refactor. Exactement
comme `is_client` hier.

### 4.3 — Les règles Firestore

La nouvelle collection est **additive** : rien ne change dans les règles existantes. Et comme
la règle du §2.3 ne lit aucun `resource.data`, elle n'expose pas au piège du 2 octobre
(`resource.data.x` sur un document inexistant plante, et remonte au client en
`permission-denied`).

⚠️ **Mais le test doit inclure le cas « lire un palmarès qui n'existe pas »**, parce que c'est
l'état normal de toutes les compétitions passées et de celle du 5 novembre jusqu'à sa
publication. Et un déploiement de règles prend effet **immédiatement pour tous les
utilisateurs**, sans version d'application ni attente de service worker : il ne se fait pas
la veille de l'événement.

### 4.4 — Le cache IndexedDB

Si la page de la compétition lit le palmarès via `getDocsCacheFirst`, un appareil qui a chargé
la page **avant** la publication a mis en cache l'absence — et ne verra jamais le palmarès, ou
seulement après une déconnexion. C'est le même mécanisme que l'identifiant de document
supprimé qui persiste indéfiniment sur un appareil.

**Lecture directe du document, pas cache-first**, pour le palmarès. Et le vérifier **sur un
téléphone réel ayant visité la page avant la publication** — c'est le seul test qui vaut, et
il ne se fait pas sur un poste.

### 4.5 — Le volume de lectures

Le palmarès gelé fait tomber la page à **un document lu**. Mais tant qu'elle affiche le
provisoire (§2.3), chaque visiteur recalcule sur toutes les participations. Avec une vingtaine
de participants et une salle qui consulte le soir de l'épreuve, c'est négligeable — mais
chiffre-le une fois plutôt que de le supposer, et publie le palmarès le soir même pour fermer
la fenêtre.

---

## §5 — Ordre d'exécution

L'ordre est contraint : chaque étape rend la suivante vérifiable.

| # | étape | pourquoi à cette place |
|---|---|---|
| 1 | **§0.1** — corriger `is_client` sur l'existant | quatre classements sur cinq le lisent ; un palmarès gelé avec un `is_client` faux est faux pour toujours |
| 2 | **§0.2** — les six lectures, avec leurs réponses écrites | elles décident de §1.1, §2.1 et §2.3 |
| 3 | **§4.1** — le test qui épingle les trois classements actuels | il doit être vert **avant** qu'on touche à quoi que ce soit |
| 4 | **§4.2** — extraction de la partition, si nécessaire ; divergences **signalées** | ajouter par copie fabrique la cinquième divergence |
| 5 | **§1** — le classement par niveau max, clôture seulement, avec le test du §1.6 | |
| 6 | **§2** — le gel : script, règles, les deux sources, le test d'identité du §2.4 | |
| 7 | **§3** — l'inventaire du live display, l'assertion **vue rouge**, puis la correction | indépendant des précédents, peut se faire en parallèle |
| 8 | **§6** — la répétition en grandeur réelle | |

---

## §6 — Le calendrier, et le test qui décide de tout

Trois semaines. Le point de calendrier qui compte n'est pas la fin du développement, c'est la
**répétition** : le 5 novembre sera la **première fois que ce code tourne pour de vrai**. Les
trois compétitions en production étaient des tests.

**Cible : tout en place et répété au 29 octobre**, une semaine de marge pour ce que la
répétition trouvera.

**La répétition, sur l'émulateur puis sur une compétition de test en production :**

1. une vingtaine de participants, clients et non-clients mélangés, noms longs, un sans nom de
   famille, un sans date de naissance ;
2. des résultats qui font **monter au moins un grimpeur de paquet** pendant l'épreuve (§1.1) ;
3. au moins un paquet à un seul participant (§1.4), et un paquet où le départage ne sépare
   pas (§1.6) ;
4. clôture, affichage du provisoire, puis publication du gel ;
5. lecture de la page **sur un téléphone qui l'avait ouverte avant la publication** (§4.4) ;
6. ⚠️ **et le test décisif : recoter un bloc après le gel, et vérifier que le palmarès ne
   bouge pas d'une ligne.**

Le point 6 exerce exactement la propriété pour laquelle tout le §2 existe. S'il échoue, le gel
ne gèle rien. C'est le critère de sortie du lot — et par construction, il **prédit toutes les
grandeurs observables** : le palmarès inchangé, *et* le classement général qui bouge, lui,
comme il doit bouger après une recotation. Un seul des deux ne suffirait pas.

---

## §7 — Ce que ce lot doit laisser comme acquis

Quatre lignes, à verser dans `CLAUDE.md` si elles se vérifient :

> **Un palmarès est un fait daté, pas une requête.** Un résultat de compétition calculé à la
> lecture change quand la donnée sous-jacente change — et dans ce projet, elle change : une
> recotation réécrit l'histoire de tous ceux qui ont validé le bloc.

> **Un classement affiché en direct est un canal de divulgation.** Toute grandeur affichée
> pendant une épreuve révèle ce dont elle est fonction. Un classement par niveau révèle les
> couleurs réussies — donc les cotations qu'on cache.

> **Partitionner par la clé du départage neutralise le départage.** Dans un paquet constitué
> par une grandeur, cette grandeur ne discrimine plus. Le cas doit être testé là où il
> apparaît, et il n'apparaît que dans les classements dont la clé est celle du départage.

> **La réconciliation passe avant le gel.** Un compteur entretenu peut avoir dérivé ; geler
> sans réconcilier, c'est rendre la dérive définitive.
