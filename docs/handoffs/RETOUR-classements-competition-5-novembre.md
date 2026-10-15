# Retour ClaudeNav — ton plan du 5 novembre est implémenté, et c'est ton §4.1 qui a payé

> Rédigé le 15/10/2026 par la session Claude Code, à destination de la session navigateur.
> Plan source : `docs/plans/PLAN-classements-competition-5-novembre.md`.
>
> **Les quatre lots sont faits et committés. Rien n'est déployé au-delà de V2.73**, qui ne
> contient que le lot 0 — par choix : ton §0.3 veut une seule annonce pour les deux règles, donc
> une seule version.
>
> Commits : `82c0508` (V2.73), `01186c7`, `2b09c33`, `6e88bfc`, `352cd4f`, `8aaafcd`. Leurs
> messages portent le détail et les chiffres ; ce document porte ce qui t'est adressé.

---

## §1 — Ton §0.2 : les six lectures, et ce qu'elles ont changé

Tu avais raison de les mettre en préalable bloquant. Trois des six ont modifié la conception.

| # | Ta question | Réponse mesurée | Conséquence |
|---|---|---|---|
| 1 | Les résultats de compétition alimentent-ils `client_boulder_results` ? | **B — non.** Seuls `competition_results` sont écrits | Le niveau de classement est **un calcul**, et le niveau de départ n'existait nulle part → `level_at_start` |
| 2 | Rattachement à une compétition | **A — `competition_id` explicite** | Périmètre net, rien à trancher |
| 3 | Clôture | **A — `status` manuel** (un `Select` admin) | « Automatiquement » suppose bien un clic |
| 4 | Partition partagée ? | **A — partagée** (`groupByAge`/`groupByGender` dans un seul module) | **Ton §4.2 est sans objet** : rien à extraire, le quatrième classement est une fonction de clé et un libellé |
| 5 | Mode du 5 novembre | `blocabrac`, déjà posé sur le document | — |
| 6 | Live display authentifié ? | **Oui**, `ProtectedRoute role="admin"` | Ton §3.3 est moins aigu que craint |

### 1.1 — Et une lecture que tu n'avais pas demandée a trouvé le vrai urgent

En lisant `ClientCompetitions.tsx` pour la n°5, je suis tombé sur `canUserRegister`, qui refuse
l'auto-inscription si `users.inscritAuxCompetitions` n'est pas vrai. Mesuré en production :
**53 comptes sur 61 à `false`**, et `Register.tsx` créait tout nouveau compte à `false`.

Autrement dit, à trois semaines d'un contest ouvert à tous, 53 grimpeurs se voyaient répondre
« Vous n'êtes pas autorisé à participer aux compétitions », sur le chemin d'inscription qui est
**le chemin normal de cette salle**. Le défaut n'était visible nulle part : aucun écran ne
compte les comptes bloqués, et le grimpeur ne découvre le refus qu'au moment de s'inscrire.

C'est V2.73, déployée. Basculés avec un script dont `--fix` **exige `--expected <n>>`** — le
nombre doit être écrit d'avance, sinon le script s'arrête sans rien écrire. Prédit 53, mesuré
53, vérifié en relisant la prod : 61/61.

> **La leçon, pour toi autant que pour moi** : tes six lectures étaient conçues pour décider de
> l'architecture. Elles ont surtout servi à trouver un défaut bloquant **sur le chemin
> critique du même événement**, sans rapport avec les classements. Un plan qui impose de lire
> le code avant d'écrire paie même quand les réponses sont celles qu'on attendait.

---

## §2 — Ton §0.1 : `is_client` — rien à corriger, et le contrôle est né vert

0 écart sur les trois participations existantes. Les deux comptes concernés portent `client`,
donc le `true` codé en dur était **accidentellement juste**. Ton rattrapage du matin ne portait
effectivement pas sur ce champ (`FIELDS` = nom / date de naissance / genre / niveau).

Contrôle ajouté à `audit-prod-catalog.js`, dans l'ordre que tu as établi le 03/10 : rattraper
d'abord, contrôler ensuite. Ici il n'y avait rien à rattraper, donc il naît vert **légitimement**.

⚠️ Mais ce vert ne prouvait rien par lui-même : le jeu de données de prod est **incapable
d'exprimer le défaut**. Vu rouge sur l'émulateur, dans les deux sens (un client déclaré
non-client, un ouvreur déclaré client), et muet sur la participation cohérente comme sur celle
où le champ est absent — 2 signalements sur 4.

---

## §3 — Ton §1.6 : tu le surestimais, et le test le dit

Tu écrivais que le classement par niveau max partitionne par la grandeur même dont le premier
critère de départage est fonction, donc que ce critère « ne discrimine plus rien ». C'est vrai
**en partie seulement**, et la nuance vient de ta propre écriture du §1.1.

La clé de paquet est un **maximum** avec le niveau de départ. Donc dans un paquet, la couleur
max réussie n'est constante que pour les grimpeurs qui y sont **par leur performance**. Un
grimpeur rangé en rouge par son niveau déclaré, qui n'a réussi qu'un bleu, est dans le même
paquet avec une couleur max différente.

Et quand elle *est* constante, le critère suivant — les essais sur ce bloc — n'est pas fonction
de la couleur. Il tranche. **La règle est affaiblie d'un cran, pas neutralisée.**

Le test que tu demandais existe (`§1.6 — le départage à l'intérieur d'un paquet de niveau`),
avec les cinq grimpeurs qu'il faut pour exprimer les trois cas : quatre arrivés par la
performance (dureté constante, vérifiée par une assertion de **taille** avant l'assertion de
propriété, comme ta technique du 03/10 l'exige), dont deux que même le critère ultime ne sépare
pas (rang partagé affiché honnêtement), et Paulo rangé par son niveau déclaré.

---

## §4 — Ton §2.3 : j'ai dévié, et voici pourquoi

Tu recommandais **(c) un script avec la clé de service**, et ton argument était juste :
c'est ce qui permet la posture la plus serrée côté client, `write: if false`.

Mais ton (c) supposait que le script pouvait réutiliser le calcul de l'application. **Il ne
peut pas.** Le classement est en TypeScript dans `frontend/src/utils/`, les scripts sont du
CommonJS lancé depuis la racine. Essayé : `rolldown` (le bundler de Vite 8 — il n'y a pas
d'esbuild dans ce dépôt) n'est résolvable que depuis `frontend/node_modules`, parce que Node
résout depuis l'emplacement du *fichier* et non le cwd ; et son API a échoué sur ce point
d'entrée. `vite-node` et `tsx` sont absents.

Or réimplémenter le classement en JS serait fabriquer la cinquième divergence de ce projet, ce
que ton §2.4 interdit — et c'est l'invariant le plus fort du lot.

**Arbitré avec Stéphane : les deux.**

- **L'admin publie depuis l'application** (un seul calcul, celui des écrans), et les règles
  rendent le document **immuable** : `allow update, delete: if false` pour tout le monde,
  l'admin compris. L'immuabilité devient une **propriété du serveur**, pas une convention
  d'outil — c'est plus fort que le `--force` d'un script.
- **`scripts/unpublish-competition-rankings.js`** est le chemin de correction, écrit avant
  d'en avoir besoin. Et il **ne recalcule rien** : il supprime, l'application republie avec
  l'unique calcul. C'est aussi plus sûr que recalculer — le palmarès republié est recalculé
  sur la donnée corrigée, pas reconstitué par un second code qui pourrait ne pas dire la même
  chose.

> **La règle que j'en tire, et qui te concerne pour les prochains plans** : dans ce dépôt, tout
> artefact dont le calcul doit rester unique se compose **dans l'application**, jamais dans un
> script. Et un script de *correction* n'a pas besoin de recalculer : chercher d'abord le geste
> qui supprime, avant d'envisager un outil de compilation.

### 4.1 — Et ton §2.3 avait un angle mort qui renforce ta conclusion

Vérifié dans `firestore.rules` : **un client ne peut lire ni `competition_results` ni
`competition_participants` d'un autre grimpeur.** Le « classement provisoire calculé à la
lecture », que tu proposais d'afficher aux grimpeurs en attendant le gel, est donc
**infaisable** — il faudrait ouvrir ces lectures à tous, c'est-à-dire exposer les résultats et
les dates de naissance de tout le monde, enfants compris.

Conséquence : **le gel n'est pas une commodité, il est nécessaire.** C'est le seul moyen qu'un
grimpeur voie un jour un classement de compétition. Le provisoire reste côté admin/ouvreur, où
il existe déjà. Ton §2.2 était donc encore plus juste que son propre argument.

### 4.2 — Ton §1.3 ne s'applique pas, et ce n'est pas un oubli

« La réconciliation passe avant le gel » protégeait contre le gel d'une dérive de
`bestColorRank`. Ce palmarès n'en lit aucun : tout s'y recalcule depuis `competition_results`,
`boulders` et `competition_participants` — des faits stockés, pas des compteurs. Le niveau vient
de `level_at_start`, figé au coup d'envoi. C'était déjà la raison de ton §1.3 ; en l'appliquant,
il s'est annulé.

---

## §5 — Ton §1.1 : la question de Stéphane a trouvé un trou

Tu écrivais que si la lecture n°1 donnait « A », « le niveau après l'épreuve se lit comme
d'habitude ». Elle a donné **B**. Et Stéphane a posé la bonne question : *pourquoi « inscrit
trois semaines avant » — `users.level` ne peut-il pas être lu au début de la compétition ?*

Réponse : **rien ne le figeait.** `competition_participants.level` est copié à l'**inscription**
(ouverte dès qu'une compétition est « à venir » depuis le 03/10, donc possiblement trois
semaines avant), et `users.level` n'est historisé nulle part — on ne peut pas reconstituer après
coup ce qu'il valait le 5 novembre à 9 h.

D'où `level_at_start`, écrit sur la seule **transition** vers « en cours », et seulement là où
il est absent : deux gardes qui se cumulent, donc rejouable sans rien redater. Un inscrit tardif
n'en a pas, et c'est correct — son niveau d'inscription **est** son niveau de départ.

Un échec de ce figeage est **signalé à l'admin dans le bandeau**, pas seulement journalisé :
sans message, le palmarès classerait sur les niveaux d'inscription et personne ne saurait
pourquoi.

---

## §6 — Ton §4.1 a payé, et c'est le résultat le plus important de ce chantier

Tu demandais un test épinglant les trois classements existants, vert avant et après. Il l'est
resté **à l'identique**. Mais il n'a pas suffi — et c'est l'e2e de l'écran live qui a attrapé le
défaut, par un **pas qui existait déjà** :

> « En début d'épreuve, avec uniquement des échecs, tout le monde partage le rang 1 » →
> affichait **1 à 10**.

Cause : le critère de départage secondaire choisi par Stéphane (« le moins d'essais au total,
échecs compris ») compte les essais des **échecs**. Deux grimpeurs à 0 point n'étaient donc plus
à égalité — et dans le pire sens possible : **celui qui n'avait rien tenté passait devant celui
qui avait essayé et échoué.** Sur l'écran projeté dans la salle, devant les intéressés.

Corrigé par une garde : aucun bloc réussi des deux côtés → ex æquo, le critère ne s'applique
pas. Il existe pour séparer deux grimpeurs dont les **performances** sont identiques ; sans
performance, il n'y a rien à séparer.

**Pourquoi l'épinglage ne l'a pas vu** : sa paire ex æquo a, par construction, le même total
d'essais — je l'avais voulu ainsi pour que le test reste vrai mot pour mot avant et après le
chantier. C'était correct, et c'est précisément ce qui l'a rendu aveugle à ce cas. Deux filets,
deux portées : le tien garde les résultats existants, l'e2e garde l'écran.

> **Ce que j'en retiens, et que je te propose comme règle** : un test d'épinglage conçu pour ne
> pas bouger est, par construction, insensible au changement qu'on introduit. Il garde le passé,
> il ne garde pas le présent. Il faut donc nommer, en l'écrivant, **ce qu'il ne pourra pas
> attraper** — et prévoir où ce cas-là sera gardé.

---

## §7 — Ton §3 : l'inventaire, et un angle mort du mien

Ta méthode (inventaire statique, puis assertion partagée sur le DOM, puis la voir rouge) a
tenu. Deux choses à te signaler.

**L'inventaire a trouvé deux sites de rendu, et ils appartiennent à deux modes mutuellement
exclusifs** : les pages en rotation (modes à points) et les colonnes par genre (mode officiel).
Un seul pas, sur le seul mode du jeu d'essai, n'en aurait couvert qu'un — l'autre pouvait
divulguer un nom complet sans que rien ne rougisse. D'où un pas par mode, le second obtenu en
basculant `scoring_mode` puis en rechargeant (ce champ est lu une seule fois au montage). **Les
deux vus rouges** en désactivant la troncature.

**Et le jeu d'essai était incapable d'exprimer le défaut** — ta règle du 03/10, encore. Les noms
étaient `Nom0`, `Nom1`… : tronqué en « N. », indiscernable d'un nom non tronqué. Et surtout, le
prénom `Prenom0` **contient** la sous-chaîne `nom0` : l'assertion était à une différence de casse
près de se tromper, dans un sens ou dans l'autre. Remplacés par dix noms longs et distinctifs,
dont un **vide** (le cas réel du compte rattrapé le 03/10). Les noms cherchés sont **dérivés de
l'oracle**, jamais recopiés : une seule source, donc pas de liste périmée.

Le filet lit `textContent` et non le texte visible — un nom caché par du CSS est quand même dans
la page — et il **exige une taille** avant d'affirmer : une page vide ne divulgue aucun nom et
serait verte sans rien vérifier.

⚠️ L'oracle de l'e2e garde **sa propre** troncature, délibérément. Un test qui réutiliserait la
fonction de production ne prouverait plus rien sur elle. Il y a donc deux implémentations en
production (unifiées) et une troisième dans le test (indépendante, et c'est voulu).

---

## §8 — Mes erreurs de méthode de ces deux séances

Toutes de la même famille, et toutes dans le sens rassurant.

1. **Une casse peut ne pas casser ce qu'on croit.** Pour vérifier l'assertion de
   confidentialité du palmarès, j'ai désactivé la troncature avec un `perl` dont la chaîne de
   remplacement contenait `${entry…}` — **interpolé par Perl**, si bien que le champ devenait la
   chaîne **vide** au lieu du nom complet. L'assertion restait verte **à bon droit** : aucun nom
   n'était écrit. J'en aurais conclu qu'elle ne gardait rien. Refait avec un remplacement
   **compté** (vérifier que l'ancre apparaît exactement une fois), puis relecture de la ligne
   modifiée avant de lancer le test.
2. **Un jeu à cinq participants ne pouvait pas rougir le pas « genre »** : aucun groupe de genre
   n'avait d'égalité. Quatre tests d'identité sur cinq rougissaient, et j'ai failli conclure que
   le filet attrapait. Sixième participant ajouté, commenté sur place.
3. **Un tri non exercé** : retirer le tri des paquets de niveau ne rougissait rien, l'ordre
   d'insertion coïncidant avec l'ordre trié. Il a fallu que le **meilleur score soit dans le
   paquet le plus bas** (cinq bleus valent plus qu'un noir arraché en dix essais).
4. **Une propriété inexprimable** : « non déterminé en dernier » ne pouvait être testée par
   aucun cas — un grimpeur sans niveau n'a aucune réussite, donc 0 point, donc la dernière place
   de toute façon. Il a fallu un cas où tout le monde est à 0.
5. **Un `; echo "code=$?"` après un tube** ne dit rien du code de sortie de la commande, mais de
   celui de `tail`. Je l'ai écrit plusieurs fois avant de m'en apercevoir, et j'ai dû revérifier
   les codes de sortie sans tube. Ta règle du 03/10, que j'ai réapprise.
6. **Une affirmation fausse dans une question posée à l'utilisateur** : j'ai écrit que le
   critère secondaire « ne modifierait jamais un classement existant ». Faux — il départage
   exactement les cas aujourd'hui ex æquo, c'est son objet. Corrigé auprès de Stéphane avant
   d'écrire le filet, ce qui a changé la façon de le construire.

---

## §9 — Ce qui reste, et ce qui n'est pas vérifié

**À faire, dans l'ordre :**

1. **Bump V2.74 + changelog**, avec **une seule annonce** pour les deux règles (ton §0.3) :
   le départage secondaire — et qu'il faut **déclarer ses échecs** — et le niveau max, en
   particulier que réussir au-dessus de son niveau fait **monter de paquet pendant l'épreuve**.
2. **Construire après le bump**, puis déployer `--only hosting,firestore:rules`. Les règles sont
   additives (`competition_rankings`), mais un déploiement de règles prend effet
   **immédiatement pour tous** : pas la veille du 5.
3. Audit de prod après déploiement.
4. Topo + mémoire.

**Non vérifié, et je le dis plutôt que de le sous-entendre :**

- **Ton §4.4 (cache IndexedDB).** Le code lit le palmarès en direct et non en cache-first, mais
  cela ne se **constate** que sur un vrai téléphone ayant ouvert la page *avant* la publication.
  La persistance Firestore est désactivée de force sous `VITE_USE_EMULATOR`, donc aucun e2e ne
  peut l'exercer. Reste à faire à la main — c'est ce que ton plan dit lui-même.
- **Le mode `officiel` n'est pas gelable**, et la publication le **refuse** explicitement :
  `calculateCompetitionPoints` y renvoie 0 par construction, le gel donnerait un palmarès à zéro
  partout **et immuable**. À implémenter le jour où la Finale est confirmée, dans
  `utils/competitionRankings.ts` et nulle part ailleurs.
- **Aucun écran de ce chantier n'a été vu sur un vrai appareil.** L'arriéré court depuis V2.70.1.
- **Les deux tâches humaines de ton §0.3** ne sont pas faites : ce sont des annonces, et c'est
  tout ce qui peut faire passer une règle juste pour une règle inventée après coup.

**Une note de méthode pour qui relancera les e2e** : les deux flux qui partagent
`seed-competition-simulation.mjs` ne sont **pas indépendants** — celui de l'écran live supprime
tous les résultats à son dernier pas. Un enchaînement sans re-semer donne « 0 lignes affichées,
10 attendues », qui ressemble à une régression sans en être une.

**Chiffres de clôture** : 413 tests unitaires, 165 tests de règles, 11/11 e2e écran live, 10/10
e2e simulation, 12/12 e2e palmarès. `tsc` et `eslint` propres.
