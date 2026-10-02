# Retour ClaudeNav — V2.71.4, et la question des comptes de test

> Rédigé le 02/10/2026 à 20h10, en réponse aux deux handoffs du 02/10 et à une question de
> l'utilisateur sur l'usage des comptes de test.
>
> **§1 : une action à faire ce soir, trois minutes.**
> **§2 : où je me suis trompé, et la formulation de Claude Code qu'il faut garder.**
> **§3 : la question des comptes de test — l'instinct est juste, l'instrument doit changer.**

---

## §1 — Déployer les règles ce soir

Le correctif de règles est écrit, prouvé par deux tests rouges devenus verts, et accompagné
d'un test de non-régression qui vérifie qu'il n'ouvre pas la lecture à tout le monde.
`npm run test:rules` : 149/149.

`firebase deploy --only firestore:rules` — trois minutes, **effet immédiat pour tous les
grimpeurs**, aucune nouvelle version d'application, aucune attente de service worker.

Rien ne justifie d'attendre. Cinq comptes portent un défi en cours ; chacun sera empoisonné le
jour où ce défi sera supprimé, et le restera **jusqu'à déconnexion** — c'est le point du §1.4
du handoff, et il est important : le cache ne se répare pas tout seul.

Le reste de la chaîne (V2.71.4, puis `reconcile --fix`, puis le journal) peut suivre à ton
rythme. Mais la règle, ce soir.

---

## §2 — Je me suis trompé sur l'alerte, et la correction vaut mieux que mon diagnostic

J'écrivais : *« l'erreur est dans la console, mais personne ne regarde une console de
production ; il faudrait prévenir le grimpeur. »*

**L'alerte existait depuis V2.48.** La vraie question n'était pas « faut-il une alerte » mais
« pourquoi celle-ci ne s'est jamais déclenchée » — et la réponse est bien meilleure que la
mienne :

1. rien ne réarmait le minuteur après un échec, donc les trois tentatives n'avaient jamais
   lieu ;
2. le compteur retombait à zéro à chaque succès, et comme l'échec est **sélectif**, chaque
   échec était suivi d'un succès.

**L'alerte était inatteignable par construction, pas par oubli.** C'est une erreur de ma part
du type que je signale aux autres : j'ai conclu d'un symptôme (« rien n'a prévenu ») à une
cause (« il n'y a pas d'alerte ») sans vérifier qu'elle existait.

Et le corollaire tiré est le vrai acquis de la soirée, plus utile que la règle elle-même :

> **Une escalade qui ne compte que les échecs consécutifs ne peut pas se déclencher sur un
> échec sélectif.**

C'est à garder tel quel dans `CLAUDE.md`. Ça s'applique bien au-delà de ce cas : tout seuil
de type « N fois de suite » a ce défaut dès que la défaillance est partielle.

**Deux autres points du lot que je valide sans réserve** :
- l'échec avalé de la transaction 2 est une **exception assumée et bien argumentée** à
  `PROCESSUS-erreurs-avalees.md` : propager ferait retenter tout le `pending` et
  ré-appliquerait un delta de classement déjà écrit. Un échec silencieux coûte une
  progression de jeu ; une propagation coûterait un score faux. Le raisonnement est juste et
  le commentaire en place.
- le verrou sur les 1024 combinaisons, qui interdit désormais toute clé `challenge:` dans les
  lectures du flush, est exactement le bon type de garde : il échoue tout seul le jour où
  quelqu'un refera l'erreur.

**Une réserve, mineure et à traiter plus tard** : `challenges.progress` est maintenant un
compteur incrémental **sans filet de réconciliation** et avec un chemin d'échec silencieux.
C'est la même remarque que pour `methodCounts` il y a une semaine. Pas urgent — rien n'en
dérive — mais à inscrire dans les points ouverts plutôt qu'à oublier.

Et le §8.1 — une **simulation** qui réécrit le journal de production suivi par git — mérite
sa propre correction : *une simulation n'écrit rien, nulle part.* C'est le même piège que le
19/08, sous une variante que le garde-fou ne couvrait pas.

---

## §3 — Les comptes de test : l'instinct est juste, l'instrument doit changer

### 3.1 — Ce que les comptes de test n'auraient pas attrapé : ce bug-ci

C'est le point décisif, et il va à l'encontre de la version naïve de l'idée.

Le défaut de ce soir a été révélé par un compte **réel, actif depuis des mois**, qui portait
dans son cache la référence d'un défi supprimé entre-temps. Cette référence est le produit
d'une **histoire** : un défi créé, rejoint, puis supprimé par son créateur, et un cache
jamais invalidé.

**Un compte de test est propre, synthétique et jeune.** Il ne porte pas d'histoire. Il
reproduit le chemin nominal — c'est-à-dire exactement ce que les e2e sur émulateur couvrent
déjà très bien, et ce qui n'a jamais été le problème ici.

Regarde les quatre défauts marquants du projet : une semaine ISO qui bascule, un champ ludique
supprimé en aval, un défi effacé des mois plus tard, un bloc retiré du mur. **Tous sont des
bugs d'état accumulé dans le temps.** Aucun ne se produit sur un compte créé pour l'occasion.

⚠️ Et il y a un risque à nommer : si « on a vérifié sur les comptes de test » devient un
rituel, c'est **un cinquième membre de la famille** — quelque chose qui rassure sans vérifier.
Exactement le `catch` qui avale, l'état React qui ment, le test qui sème sa donnée, et
l'alerte inatteignable.

### 3.2 — Ce que ton instinct vise vraiment : un audit des références mortes

La bonne question n'est pas « comment tester sur des comptes jetables » mais **« qu'est-ce qui
pointe vers quelque chose qui n'existe plus ? »**

Et là, l'observation est frappante : **les trois énigmes ouvertes du projet sont la même
chose.**

| Référence | Vers | Statut |
|---|---|---|
| le défi actif d'un grimpeur | `challenges/{id}` | ✅ **c'est le bug de ce soir** |
| `client_boulder_results.boulderId` | `boulders/{id}` | ❓ **c'est l'hypothèse des 46 blocs → 6** |
| `client_badges.badgeId` | `badges/{id}` | ✅ déjà audité, et c'est ce qui a trouvé Maurice Tartanpion |

Un audit de références mortes existe donc **déjà**, dans `audit-prod-catalog.js`, pour la
troisième ligne — et c'est lui qui avait trouvé l'anomalie de mai. **Il suffit de l'étendre
aux deux autres.**

Il aurait attrapé le bug de ce soir **avant** qu'un grimpeur ne perde un bloc, en posant une
question simple : *un grimpeur porte-t-il une référence vers un défi qui n'existe pas ?*
Et il répondrait du même coup à la question des 46 blocs → 6, qui attend depuis le 1ᵉʳ
octobre.

**C'est la suite que je recommande**, et elle est bien plus rentable qu'un protocole de
comptes de test : trois requêtes de plus dans un script qui tourne déjà, et qui sort en code
non nul quand il trouve quelque chose.

### 3.3 — Ce à quoi les comptes de test servent vraiment : répéter le geste destructif

Ils ne valent rien pour **détecter**. Ils valent beaucoup pour **répéter**, et c'est un usage
réel qu'il faut écrire :

> **Avant toute opération destructive en production — purge, suppression de champ, script de
> correction en masse — exécuter l'opération sur un compte de test d'abord, en production, et
> vérifier son effet. Ensuite seulement, l'ensemble.**

L'intérêt par rapport à l'émulateur est précis : la vraie base, les vraies règles, les vrais
index, les vrais volumes. Un script peut passer sur l'émulateur et échouer en production pour
des raisons que l'émulateur ne reproduit pas.

Application immédiate : **la purge**. Avant les 16 comptes, la passer sur un seul compte de
test et vérifier que les quatre champs disparaissent de `users` sans que rien ne bouge ailleurs.

Et un corollaire qui justifie de les garder : **un compte de test conservé devient
intéressant en vieillissant**. Un compte créé en mai, qui a traversé toutes les migrations,
est un témoin de l'histoire du schéma — à condition de ne pas le nettoyer. Ce qui donne
rétrospectivement raison à ta décision de garder Maurice Tartanpion.

### 3.4 — La note que je propose pour `CLAUDE.md`

> **Comptes de test.** Ils servent à **répéter un geste destructif** en production avant de
> l'appliquer à tous, jamais à **détecter** un défaut : ils sont jeunes et propres, et les
> défauts de ce projet naissent de l'état accumulé. Pour détecter, l'instrument est l'audit
> de production — en particulier l'audit des **références mortes** (`audit-prod-catalog.js`),
> à étendre à toute référence inter-collections.

---

## §4 — Ordre

1. **`firebase deploy --only firestore:rules`** — ce soir (§1).
2. Revérification en direct : console ouverte, plusieurs validations dont une qui fait avancer
   un défi, puis lecture serveur de `classement_profiles`.
3. Déploiement de V2.71.4.
4. `reconcile --fix` et journal.
5. **Étendre `audit-prod-catalog.js` aux références mortes** (§3.2) — c'est ce qui répond à la
   fois à ta question et à l'énigme des 46 blocs → 6.
6. Reprendre la purge, avec la répétition sur un compte de test d'abord (§3.3).
7. Points ouverts à inscrire : filet de réconciliation pour `challenges.progress` ; « une
   simulation n'écrit rien » ; la convention `set "VAR=valeur"` sous Windows.
