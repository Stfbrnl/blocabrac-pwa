# Conception — Bloc Roulette & Défis entre potes

> Rédigée le 17/08/2026 par la session Claude (navigateur), à partir d'idées soumises par
> l'utilisateur. **Version 2** — intègre le calibrage par niveau, les familles de
> contraintes, le catalogue de propositions et les défis déclaratifs.
>
> **Deux chantiers de coût très différent.** La Roulette est presque gratuite et peut être
> livrée seule ; les Défis sont un vrai chantier avec une collection nouvelle. Ne pas les
> traiter ensemble.
>
> **Le troisième idée soumise (feed d'activité de la salle) est volontairement écartée** —
> voir §0.

---

## §0 — Pourquoi le feed d'activité n'est pas dans ce document

Idée bonne en soi, mais trois obstacles la placent après les deux autres :

1. **Elle heurte le modèle de confidentialité.** `client_boulder_results` n'est lisible que
   par son propriétaire — c'est la raison d'être de `classement_profiles`, le miroir public
   créé exprès. Un feed demanderait **un second miroir**, avec la même dénormalisation, les
   mêmes risques de dérive et la même réconciliation à écrire.
2. **Consentement.** « Thomas vient de réussir le rouge #37 » diffuse une activité
   nominative à toute la salle. `classementOptIn` couvre le classement, pas ça. Question
   déjà rencontrée deux fois (`liveDisplayEnabled`, qualification saisonnière). Les
   réactions ❤️ ouvrent en plus une surface de modération que personne ne veut tenir.
3. **L'intérêt dépend d'une masse d'utilisateurs qui n'existe pas encore.** Avec 12 comptes,
   un feed affiche trois lignes par semaine — l'effet inverse de celui recherché.

À reprendre plus tard. Rien dans ce document ne ferme cette porte.

---

# PARTIE 1 — Bloc Roulette

**Le meilleur rapport valeur/effort.** Aucune collection nouvelle, aucune écriture
Firestore, aucune règle à modifier — sous réserve du prérequis « murs » du §1.7.

## 1.1 — Pourquoi c'est (presque) gratuit

Tout ce dont la fonctionnalité a besoin est **déjà en mémoire** quand le grimpeur ouvre la
page quotidienne : les blocs du jour (`ClientDaily.tsx`), son niveau (`users.level`,
synchronisé automatiquement), et l'historique de ses validations (`successfulAttemptsRef`,
la `Map` du chantier compteur incrémental).

Un tirage dans une liste déjà chargée. Le **catalogue de propositions est du code**, pas
des données : une constante TypeScript, zéro lecture Firestore.

## 1.2 — Calibrage du niveau : le principe central

**Règle générale : la grande majorité des propositions visent le niveau max−1 du grimpeur.**

La raison est ludique avant d'être technique. Un défi n'amuse que s'il est réalisable dans
la séance. Proposer systématiquement du niveau max produit de l'échec, et l'échec répété
fait fermer l'application. Le max−1 laisse la place à la contrainte — c'est elle qui rend
le bloc intéressant, pas sa difficulté brute.

| Niveau visé | Part indicative | Usage |
|---|---|---|
| **max − 1** | ~70 % | Socle. Le bloc est acquis, la contrainte fait le jeu. |
| **max** | ~20 % | Défis exigeants, chronométrés serrés, séries. |
| **max + 1** | ~10 % | **Toujours en réussite partielle** (§1.3.E), sauf « roulette de la mort ». |

### Le mode découverte : ne pas exiger le bloc entier

Sur un bloc de niveau max+1, la proposition ne demande **pas** de le réussir, mais d'y
faire trois ou quatre mouvements, ou d'isoler le passage difficile.

C'est la manière dont les grimpeurs progressent réellement — s'habituer aux prises et aux
mouvements d'un niveau avant de prétendre l'enchaîner. Une roulette qui enseigne ça a
plus de valeur qu'une roulette qui distribue des blocs.

⚠️ **Conséquence sur les données : une réussite partielle n'est pas une validation.** Elle
ne doit rien écrire dans `client_boulder_results`, sous peine de fausser le classement, les
badges et le niveau automatique. Elle reste déclarative, dans l'écran, sans trace.

### Cas limites à traiter

- **Grimpeur au niveau plancher** : max−1 n'existe pas. Rabattre sur le niveau courant, et
  ne jamais proposer de contrainte qui suppose un niveau inférieur.
- **Grimpeur au niveau plafond** : max+1 n'existe pas. Retirer la famille E du tirage et
  compenser par des contraintes de style.
- **Niveau absent ou jamais synchronisé** : traiter comme le plancher plutôt que d'échouer.

Réutiliser **la hiérarchie de couleurs existante**, celle qui pilote déjà la
synchronisation automatique du niveau. Ne pas en écrire une seconde.

## 1.3 — Les six familles de contraintes

Une proposition = un **niveau visé** + une **famille de contrainte**. C'est ce qui produit
la variété sans multiplier les logiques.

**A. Socle** — un bloc, sans contrainte particulière. Vérifiable par les données.

**B. Style** — contrainte sur la manière : départ assis, pieds silencieux, sans reprendre
une prise, en annonçant les mouvements. **Déclaratif** : l'application ne peut pas
vérifier, et n'a pas à essayer.

**C. Chronométré** — un bloc en moins de X secondes, N blocs en Y minutes. Déclaratif, avec
un chronomètre dans l'écran (aucune persistance).

**D. Murs** — cibler les secteurs délaissés, ou imposer une diversité. **Nécessite le
prérequis du §1.7.**

**E. Progression** — niveau max+1, en réussite partielle. Déclaratif par construction.

**F. Sans échec** — flash (premier essai), séries sans raté. **Partiellement vérifiable** :
le nombre d'essais est déjà dans les données.

### Vérifiable ou déclaratif : une distinction structurante

**La majorité des propositions sont déclaratives, et c'est une bonne nouvelle.** Une
proposition déclarative ne se branche sur aucun chemin d'écriture : elle s'affiche, le
grimpeur joue, il ferme. Coût nul, complexité nulle.

Cohérent avec la décision du 17/08 sur le classement saisonnier — confiance donnée aux
grimpeurs, enjeu faible. **Ne pas construire de mécanisme de vérification.**

## 1.4 — Logique de tirage

1. Déterminer le **niveau cible** selon la pondération du §1.2.
2. Filtrer les blocs du jour : couleur correspondant au niveau cible, **hors blocs déjà
   validés** (sauf familles B, C, E, où refaire un bloc connu est le principe même).
3. Appliquer le filtre de la famille si nécessaire (mur ciblé pour D).
4. Tirer uniformément dans ce qui reste.

**Si la liste éligible est vide** — tout validé, secteur démonté — élargir
progressivement : d'abord la contrainte de couleur, puis celle des blocs déjà faits, **en
le disant** (« tu as tout fait à ton niveau, en voici un plus dur ») plutôt qu'en affichant
une erreur.

## 1.5 — Anti-lassitude

**Correction par rapport à la version 1 de ce document**, qui recommandait de ne rien
conserver.

Un catalogue de trente propositions ne sert à rien si le tirage répète la même trois fois
de suite. Il faut donc une mémoire courte des derniers tirages — **mais elle n'a rien à
faire dans Firestore**.

Conserver les identifiants des ~10 dernières propositions tirées dans `localStorage`, et
les exclure du tirage suivant. Coût Firestore : zéro. Le tirage lui-même reste sans trace
persistée côté serveur, comme prévu initialement.

Ne pas conserver d'historique des blocs tirés — seulement des propositions, pour la
rotation.

## 1.6 — Catalogue de départ (34 propositions)

**À faire relire par l'ouvreur avant implémentation** : certaines supposent une
configuration physique que je ne connais pas, et lui saura lesquelles ne conviennent pas.

Structure suggérée pour chaque entrée du catalogue :
`{ id, label, family, levelTarget, verifiable, needsWall, extreme }`

### A — Socle (max−1, vérifiable)

1. « Ton prochain bloc : {couleur} n°{numéro}. »
2. « Un bloc que tu n'as jamais validé. »
3. « Deux blocs d'affilée sur le même mur, sans t'asseoir. »
4. « Trois blocs, trois murs différents. »
5. « Le plus grand numéro que tu n'as pas encore fait. »
6. « Un bloc posé cette semaine. »

### B — Style (max−1, déclaratif)

7. « Départ assis, même si le bloc ne le demande pas. »
8. « Pieds silencieux : aucun bruit de pied, du départ à la fin. »
9. « Une seule fois par prise : interdit de repositionner une main. »
10. « Annonce chaque prise à voix haute avant de l'attraper. »
11. « Enchaîne sans jamais reposer les deux mains en même temps. »
12. « Repère tout le bloc depuis le sol, puis grimpe sans hésiter. »
13. « Termine le bloc en contrôlant la prise finale trois secondes. »

### C — Chronométré (max−1 ou max, déclaratif)

14. « Ce bloc en moins de 45 secondes, du départ à la prise finale. »
15. « Trois blocs en 10 minutes. »
16. « Le plus de blocs possible en 15 minutes. »
17. « Une minute de repos maximum entre deux essais, pendant 20 minutes. »

### D — Murs et diversité (nécessite §1.7)

18. « Ton mur le moins fréquenté en ce moment : {mur}. Un bloc dessus. »
19. « Un bloc sur chacun des trois murs que tu délaisses le plus. »
20. « Mur du jour : {mur}. Un bloc de chaque couleur jusqu'à ton niveau. »
21. « Cinq murs consécutifs dans l'ordre de la salle, un bloc sur chacun. »
22. « Le mur que tu n'as pas touché depuis le plus longtemps. »

### E — Progression (max+1, réussite partielle, déclaratif)

23. « Trouve un {couleur max+1} et fais-en les trois premiers mouvements. »
24. « Un {couleur max+1} : réussis le départ et le premier mouvement, c'est tout. »
25. « Repère le mouvement dur d'un {couleur max+1} et réussis-le isolément. »
26. « Un {couleur max+1} : quatre mouvements n'importe où dans le bloc. »

### F — Sans échec (vérifiable via le nombre d'essais)

27. « Flash : ce bloc au premier essai. »
28. « Trois flashs d'affilée, deux niveaux en dessous du tien. »
29. « Cinq blocs, aucun échec autorisé. Un raté et le défi tombe. »
30. « Un bloc à ton niveau max, essais illimités, jusqu'à le sortir. »

### G — Créatif et traversées (déclaratif)

31. **« Invente un bloc »** — compose une ligne avec des prises de plusieurs couleurs,
    annonce la cotation que tu lui donnes, fais-la valider par un ami.
32. « Traversée : trois murs consécutifs sans poser le pied au sol. »
33. **« Le grand tour »** — la salle entière dans l'ordre des murs, sans toucher le sol.
34. « Refais un bloc que tu connais en t'interdisant une prise sur deux. »

### La roulette de la mort (à part)

Une entrée distincte, **explicitement signalée comme extrême**, niveau max+1 ou au-delà,
bloc entier : « Un {couleur max+1}. En entier. Bonne chance. »

À ne pas mélanger au tirage courant — un bouton séparé, ou une probabilité très faible avec
un avertissement visuel. Son intérêt tient à sa rareté.

## 1.7 — Prérequis de données : les murs

**Deux manques bloquent la famille D et les traversées.**

### A. Le mur n'est pas (probablement) sur le bloc

À vérifier : `boulders` porte-t-il un champ de mur ou de secteur ? Si non, c'est un ajout
de schéma **plus une saisie côté ouvreur** dans les deux formulaires de création. Sans
lui, aucune proposition de la famille D n'est possible.

L'ordre des murs est **circulaire et propre à cette salle** :

> grotte → grotte des enfants → Gullich → Réta adultes → Réta enfants → grande face →
> dalle → 15 degrés → 40 degrés → 30 degrés → (retour à grotte)

**Cette liste doit vivre dans `config/gymConfig.ts`, jamais en dur dans un composant.**
C'est exactement le type de valeur qu'une deuxième salle changera intégralement — au même
titre que la charte graphique déjà externalisée.

### B. Compter les validations par mur sans relire l'historique

La famille D a besoin de savoir quels murs le grimpeur délaisse. Le calculer en relisant
`client_boulder_results` reproduirait le problème de lecture non bornée déjà corrigé deux
fois.

**Solution : un compteur incrémental par mur, exactement comme le compteur par couleur.**
Incrémenté à la validation, jamais recalculé.

⚠️ **À placer sur `users`, pas sur `classement_profiles`.** Le miroir public ne doit
contenir que ce que des lecteurs tiers consomment — principe posé le 17/08 après la fuite
`dateOfBirth`. Les compteurs de murs ne servent qu'au grimpeur lui-même, et `users` est
déjà restreint à son propriétaire et au staff.

Si le compteur par couleur (chantier saisonnier) est réalisé, **faire les deux ensemble** :
même chemin d'écriture, même logique, même réconciliation.

### Repli si le prérequis n'est pas fait

La famille D et les traversées se désactivent proprement : 29 propositions sur 34 restent
disponibles. **Livrer sans elles est parfaitement viable** — et c'est même l'ordre que je
recommande.

## 1.8 — Interface

Un bouton 🎲 sur `ClientDaily.tsx`. Un tirage, une proposition, un bouton « relancer ».

- La proposition vit en état React et ne survit pas à un rechargement. Un tirage est un
  geste, pas un engagement.
- Pour les propositions chronométrées, un chronomètre dans l'écran, non persisté.
- Pour les réussites partielles (famille E), **aucun bouton de validation** : rien ne doit
  être écrit. Un simple « c'est fait » qui ferme la carte, sans trace.
- Distinguer visuellement les propositions extrêmes du reste.

## 1.9 — Vérification

- Fonction de tirage extraite dans un utilitaire pur et testée : pondération des niveaux,
  exclusion des validés, plancher et plafond de niveau, liste éligible vide,
  élargissement progressif, non-répétition des dernières propositions.
- **Vérifier explicitement qu'aucune écriture Firestore n'est déclenchée** par le bouton ni
  par la validation d'une réussite partielle. C'est la propriété qui rend la fonctionnalité
  gratuite, et c'est la première chose qu'une évolution future cassera.

---

# PARTIE 2 — Défis entre potes

Vrai chantier. Le socle existe (`climbing_partners`, `client_boulder_results`, et l'écran
live comme preuve que le classement temps réel fonctionne), mais il faut une collection
nouvelle.

## 2.1 — Quatre structures, pas trente

Les défis proposés se ramènent à **quatre structures**. Concevoir ces quatre-là couvre tout
le catalogue, et un format inventé plus tard entrera dans l'une d'elles sans refonte.

| Structure | Exemples | Vainqueur |
|---|---|---|
| **Seuil** — premier à atteindre N | « premier à 5 rouges », « 3 blocs violets » | le premier à N |
| **Fenêtre** — maximiser sur une période | « le plus de points cette semaine », « 30 blocs en 7 jours » | meilleur total à l'échéance |
| **Bloc désigné** — comparer sur un bloc | « même bloc, meilleur score », défi duo | meilleur score sur ce bloc |
| **Déclaratif** — le défi n'est pas mesurable | traversées, blocs inventés, contraintes de style | validation croisée entre participants |

**La quatrième structure est celle qui ouvre le catalogue de la partie 1 aux défis à
plusieurs**, et c'est la moins coûteuse : aucun branchement sur le chemin de validation,
juste un bouton « fait » par participant, éventuellement confirmé par un autre.

### Ce que j'écarte

**« Le dernier à réussir le bloc perd »** : ça désigne un perdant entre amis. Ça vieillit
mal dans une petite communauté.

**« Défi sans tomber »** au sens littéral : l'application ne capte pas les chutes, et le
nombre d'essais n'en est pas un substitut fidèle. Reformulé en « validation au premier
essai » (famille F), c'est déjà dans les données.

## 2.2 — Le piège de quota, et sa parade

**Fait naïvement, chaque défi relit les résultats de tous les participants à chaque
validation.** Avec 6 participants et 20 blocs validés dans une séance, on retombe
exactement sur le motif corrigé dans `ClientDaily.tsx` et `ClientCompetitions.tsx`.

**Parade, identique à celle adoptée deux fois : compteur incrémental.** Le document de défi
porte la progression de chaque participant. Le grimpeur qui valide met à jour **sa propre
ligne**, sans relire celle des autres. Le classement se lit dans un seul document.

Les défis de structure **déclarative n'ont même pas ce problème** : un bouton, une écriture,
rien à recalculer.

## 2.3 — Modèle de données

### `challenges/{challengeId}`

| Champ | Type | Note |
|---|---|---|
| `created_by` | string | uid du créateur |
| `structure` | `'seuil' \| 'fenetre' \| 'bloc_designe' \| 'declaratif'` | |
| `catalog_id` | string \| null | Renvoie au catalogue de la partie 1 |
| `title` | string | Libellé affiché |
| `participants` | string[] | uids, créateur inclus, **2 à 6** |
| `progress` | map | `{ uid: { value, updated_at, confirmed_by? } }` |
| `status` | `'en_cours' \| 'termine'` | |
| `winner_uid` | string \| null | Posé à la clôture |
| `created_at` / `ends_at` | string ISO | `ends_at` requis pour `fenetre` |

Paramètres selon la structure : `target_count` + `target_color` pour `seuil` ; `metric`
(`points` / `blocs`) pour `fenetre` ; `boulder_id` pour `bloc_designe` ;
`description` (texte libre) pour `declaratif`.

**Pour « invente un bloc »** (proposition 31) : la description libre suffit — couleurs des
prises utilisées, cotation annoncée. **Ne pas créer de collection de blocs personnalisés**,
et **pas de photo dans un premier temps** : ce serait un upload Cloudinary, un chemin de
modération, et un stockage à nettoyer, pour une ligne qui vit trois jours.

### Pourquoi `progress` dans le document plutôt qu'une sous-collection

Avec 6 participants au maximum, une map tient dans un document et évite N lectures. Le
point d'attention est la **contention en écriture** : Firestore plafonne à environ une
écriture par seconde soutenue sur un même document.

À 6 participants, c'est sans risque — contrairement aux 90 grimpeurs d'une compétition, où
cette structure avait été explicitement écartée. **Le plafond de 6 n'est pas cosmétique :
c'est ce qui rend le modèle valide.** Ne pas le relever sans revoir la structure.

### Règles Firestore

- **Lecture** : uniquement les participants (`request.auth.uid in resource.data.participants`).
- **Écriture** : un participant ne peut modifier que `progress[son_uid]` — vérifiable avec
  `affectedKeys()`, comme le verrouillage de `liveDisplayEnabled`.
- **Création** : le créateur doit figurer dans `participants`.
- **Clôture** : à trancher — le créateur seul, ou tout participant ?

⚠️ La progression est **auto-déclarée**. Cohérent avec la décision du 17/08. Ne pas
construire de vérification côté serveur.

## 2.4 — Où se branche la mise à jour

Pour les structures mesurables : dans `ClientDaily.tsx`, au moment où une validation est
écrite — au même endroit que la mise à jour de `classement_profiles`.

Charger les défis actifs **une fois au montage** (`getDocsCacheFirst`), les garder en
mémoire, mettre à jour ceux qui sont concernés.

**Débouncer l'écriture** (~3 s, comme `classement_profiles`), avec flush sur `pagehide` et
à la fermeture de la modale. **Les trois conditions du chantier V2.28 s'appliquent telles
quelles**, sans quoi on réintroduit la perte de données qu'il avait corrigée.

## 2.5 — Cycle de vie et cas limites

À trancher explicitement, sinon le comportement émergera du code :

- **Clôture d'un défi `fenetre`** : sans backend, elle ne peut être déclenchée que par une
  ouverture d'écran. Le plus simple : afficher « terminé » dès que `ends_at` est dépassée,
  et laisser le premier participant qui ouvre l'écran figer `winner_uid`.
- **Égalité** : fréquente sur « premier à 5 rouges » entre grimpeurs de niveau proche.
  Départager par `updated_at`, ou afficher un ex æquo — mais le décider.
- **Retrait d'une validation** après avoir progressé : le compteur doit décroître. Même
  asymétrie que pour le compteur saisonnier, et même conclusion — c'est le chemin le moins
  parcouru, donc à tester explicitement.
- **Participant qui n'ouvre jamais le défi** : sa ligne reste à zéro. L'interface doit
  distinguer « n'a pas participé » de « a participé sans réussir ».
- **Défi déclaratif contesté** : prévoir que le champ `confirmed_by` reste facultatif. Ne
  pas construire d'arbitrage — entre amis, ça se règle en parlant.
- **Pas de réconciliation.** L'enjeu est faible, la durée de vie courte, une dérive
  disparaît avec le défi. À l'inverse du compteur saisonnier, qui décide d'une
  qualification.

## 2.6 — Défis générés automatiquement : pas tout de suite

L'idée est bonne, mais sans backend il n'existe aucun moment où « le système » agit. Un
défi automatique devrait être créé par le premier grimpeur qui ouvre l'application — ce qui
soulève : qui sont les participants ? qui n'a rien demandé ?

**Livrer d'abord les défis créés manuellement.** Si l'usage prend, la génération pourra
s'appuyer sur le motif de **GitHub Action planifiée** déjà en place : un script crée le défi
hebdomadaire de la salle, ce qui est bien plus propre qu'un déclenchement par un client.

## 2.7 — Vérification

- Les quatre structures, chacune avec un test de progression et de détermination du
  vainqueur.
- Le retrait d'une validation qui fait décroître un compteur.
- Tests de règles : un non-participant ne peut pas lire ; un participant ne peut pas
  modifier la ligne d'un autre.
- Un parcours e2e sur une structure, sur le modèle de `e2e-daily-flow.mjs`.

---

# PARTIE 3 — Cadrage physique (à valider avec la salle)

Court, mais à ne pas sauter : certaines propositions se déroulent dans un espace partagé.

- **Les murs enfants** (grotte des enfants, Réta enfants) figurent dans le circuit. Un adulte
  qui traverse ces secteurs aux heures de forte affluence gêne, voire inquiète. Prévoir de
  pouvoir exclure des murs du circuit dans `gymConfig.ts`, ou d'afficher un rappel.
- **Les traversées sans poser le pied** (32, 33) se pratiquent bras fatigués, près du sol,
  parfois au-dessus de zones de réception occupées. C'est un jeu classique en salle, mais la
  proposition mérite une ligne de rappel plutôt que rien.
- **Les blocs inventés** (31) combinent des prises jamais pensées ensemble : départ
  improbable, réception mal orientée. Le gérant voudra peut-être une formulation qui
  rappelle de vérifier la zone de chute.

Ce n'est pas à Claude Code de rédiger ces avertissements — **c'est une décision de la
salle**. Mais l'emplacement doit exister dans l'interface.

---

# §3 — Ordre proposé

1. **Bloc Roulette**, familles A, B, C, F et E — soit 29 propositions sur 34, **sans aucun
   prérequis de données**. Une à deux journées, effet immédiat en salle.
2. **Prérequis murs** (§1.7) : champ sur `boulders`, saisie ouvreur, compteur sur `users`.
   À faire avec le compteur par couleur du chantier saisonnier si celui-ci n'est pas encore
   fait.
3. **Familles D et G** de la Roulette, une fois le prérequis en place.
4. **Défis**, structures `seuil` et `declaratif` — la première valide le modèle mesurable,
   la seconde ouvre tout le catalogue aux défis à plusieurs pour un coût quasi nul.
5. Les structures `fenetre` et `bloc_designe`, si l'usage suit.
6. Génération automatique, via script planifié.
7. Le feed (§0), quand la base d'utilisateurs le justifiera.

**Livrer l'étape 1 seule a une valeur en soi** : elle dira si ce registre ludique est
réellement utilisé dans cette salle, avant d'investir dans le reste.

---

## Points ouverts par ailleurs (inchangés)

- **Chantier droits d'accès** (abonnements, cartes, cours) — en attente des réponses du
  gérant aux 7 questions. `CONCEPTION-droits-acces-abonnements.md` **toujours pas transmis
  au dépôt**.
- Réplique matérielle HDMI à froid avant la première utilisation de l'écran live.
- Ligne de base de lectures quotidiennes (relevé console Firebase).
- Concurrence à 90 utilisateurs simultanés, jamais testée.
- Plan de repli si un quota saute.
- Un projet Firebase par salle vs mutualisé — le *site* est un champ, la *salle* est un
  projet. **La liste des murs (§1.7) est un nouvel exemple de valeur à externaliser.**
- Stockage durable des sauvegardes d'images (`--backup`).
- `aide-connexion-installation.html` toujours hors charte.

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
