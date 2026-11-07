# Documents de la salle, préavis de modification, et suivi des validations côté moniteur

**Pour ClaudeCode — 7 novembre 2026**

Trois sujets indépendants, livrables séparément. Le premier est demandé, les deux autres
viennent d'un incident en salle hier.

---

# PARTIE A — L'accès aux documents depuis l'application

## A.0 La décision, et la formulation qui compte

Les trois documents (`topo-blocabrac.pdf`, `topo-roulettes-defis.pdf`,
`affiche-bareme-competition.pdf`) vont dans `frontend/public/docs/`, servis publiquement, listés
dans un sous-menu des profils **Admin, Ouvreur et Moniteur**.

**La décision est la bonne, et la menace est négligeable.** Il est exact que l'URL se trouve dans
le bundle servi à tout visiteur — l'application est une page unique, le code de l'écran admin
part chez tout le monde. Mais il faudrait quelqu'un qui ouvre les outils de développement d'une
application de sport gratuite pour y chercher un document de staff inoffensif. Ça n'arrivera pas,
et ce n'est pas une raison de faire quoi que ce soit différemment.

**Ce qui vaut la peine d'être écrit n'est donc pas une protection, c'est une politique de
dossier** — et sa raison n'est pas le topo d'aujourd'hui, c'est le document de demain :

> `public/docs/` est **servi publiquement et sans authentification**. Tout fichier qui y entre
> est, de fait, publié. N'y mettre que des documents qu'on accepterait de voir circuler. Le
> sous-menu est un **confort de navigation**, jamais une protection.

Une ligne dans `CLAUDE.md` et un `README` dans le dossier. Ce qu'elle empêche : que quelqu'un —
toi dans six mois, ou un successeur — y dépose un export de comptes ou une liste d'adhérents en
se disant que le menu protège.

Si un document doit un jour être réellement réservé, **Firebase Hosting ne peut pas le faire** :
il sert des fichiers statiques, point. Il faudra Cloud Storage for Firebase, dont les règles
peuvent exiger un rôle. À vérifier le jour venu — le projet utilise Cloudinary pour les images,
Storage n'est peut-être pas activé.

## A.1 Lectures à confirmer

1. **Les deux topos sont aujourd'hui à la racine du dépôt**, pas dans `public/docs/`. Vérifier
   qu'aucun script de génération n'écrit en dur le chemin racine — sinon la prochaine
   régénération les remet hors du périmètre servi, en silence.
2. **`navigateFallbackDenylist: [/^\/docs\//]`** est en place depuis V2.76.2 (les PDF sous
   `public/docs/` renvoyaient `index.html`). Confirmer qu'elle couvre bien les nouveaux fichiers.
3. **Le poids du déploiement** : trois PDF dont un de 14 pages. Vérifier que le précache du
   service worker ne les embarque pas — 148 fichiers / 4,6 Mo aujourd'hui, et un PDF de 500 Ko
   précaché serait téléchargé par chaque grimpeur sans qu'aucun ne l'ouvre jamais.

   ⚠️ **C'est le vrai coût caché de ce chantier**, et il est invisible à la relecture.

## A.2 Le lot

1. **Déplacer les deux topos** dans `public/docs/`, corriger les chemins de génération, ajouter
   le `README` de la règle ci-dessus.
2. **Exclure les PDF du précache** (`globIgnores` ou équivalent dans la configuration PWA), et
   le vérifier sur le manifeste produit, pas sur l'intention.
3. **Le sous-menu**, Admin et Ouvreur : une liste de liens avec, pour chacun, le titre, à quoi il
   sert en une ligne, et **la version et la date d'estampille** — elles existent déjà depuis
   `topo-stamp.cjs`. Un document daté se repère périmé ; un document nu ne se repère jamais.
4. **Une entrée de changelog**, parce que c'est le genre de fonctionnalité que personne ne
   découvre tout seul.

## A.3 L'argument qui justifie ce chantier, du 28/10 — à ne pas perdre

*C'est ② qui aurait fait découvrir ① plus tôt.* Un lien dans l'application est un chemin que
quelqu'un emprunte. Tant que l'accès passe par une URL qu'on se transmet à la main, le chemin
n'est jamais parcouru — et le guide de connexion est resté cassé **depuis sa création** sans que
personne le voie.

---

# PARTIE B — Prévenir avant de modifier pendant que la salle tourne

## B.0 L'incident, et ce qu'il faut en déduire avant de coder quoi que ce soit

Hier, une monitrice utilisait l'application avec ses élèves pendant que Stéphane modifiait
l'application. Les validations des jeunes sautaient. La mise à jour a résolu le problème.

🔴 **Avant de construire un préavis, il faut savoir ce qui a réellement cassé** — les trois
sortes de modification n'ont pas du tout le même rayon :

| modification | effet sur une session déjà ouverte |
|---|---|
| **Déploiement du code** (`--only hosting`) | Sous `registerType: 'prompt'`, l'onglet ouvert **garde son ancien bundle** : l'écran courant n'est pas touché. ⚠️ **Mais une navigation vers un écran chargé à la demande cherche un fragment que le nouveau déploiement a supprimé** → `vite:preloadError`. C'est exactement ce que fait une monitrice qui passe d'un écran à l'autre pendant une séance. |
| **Déploiement des règles** (`--only firestore:rules`) | **Immédiat, côté serveur, sur TOUS les clients, ancien bundle compris.** Si une règle nouvelle exige un champ que l'ancien bundle n'écrit pas, **toutes les écritures des clients non mis à jour échouent** — sans message explicite. C'est la modification silencieuse. |
| **Changements de données en admin** | Immédiats, par `onSnapshot` ou à la lecture suivante. Désactiver un bloc, modifier une séance, retirer une mini-compétition : la séance en cours le voit. |

**La conséquence pratique est plus utile qu'un bandeau** : tu n'as pas besoin d'arrêter de coder
aux heures d'ouverture. Tu as besoin de **ne pas déployer les règles ni toucher aux données**
pendant qu'une séance tourne. Le code, lui, est presque inoffensif.

**Donc : séparer systématiquement les déploiements.** `--only hosting` quand tu veux,
`--only firestore:rules` hors des heures d'ouverture.

## B.1 Savoir s'il faut prévenir — avant de savoir comment prévenir

Le besoin réel n'est pas d'avertir tout le monde tout le temps, c'est de **savoir si quelqu'un
est en train de s'en servir**. Deux indicateurs, du plus ciblé au plus général :

1. **Une séance est-elle active en ce moment ?** C'est exactement le cas qui t'a mordu. Une
   requête sur `courses` avec un `activatedAt` et pas d'`archivedAt` répond oui/non. Une lecture,
   bornée. **C'est l'indicateur qui compte.**
2. **Quelqu'un a-t-il validé récemment ?** `client_boulder_results` trié par `createdAt`
   décroissant, limite 5. Cinq lectures, et un « dernière validation il y a N minutes ».

À poser sur l'écran d'administration, près de rien d'autre, comme un voyant. ⚠️ **Et libellé par
sa conséquence, pas par son état** : « 1 séance en cours — ne pas déployer les règles » vaut
mieux que « séances actives : 1 ».

## B.2 Le préavis lui-même

Le bandeau d'annonces existe déjà (CRUD admin, `onSnapshot` temps réel). Ton objection est juste :
il ne sert à rien si la personne n'est pas sur l'écran qui le porte.

**La correction est un placement, pas un mécanisme** : rendre le bandeau dans la coquille de
l'application plutôt que sur un écran, de sorte qu'il apparaisse partout. L'abonnement
`onSnapshot` tourne déjà — l'afficher partout ne coûte **aucune lecture supplémentaire**.

Deux réserves :
- ⚠️ **Jamais sur l'écran live TV.** `CLAUDE.md` l'écrit déjà pour le bandeau de mise à jour ;
  la même exclusion vaut ici, et pour la même raison.
- ⚠️ **Un bandeau n'interrompt pas.** Pour un préavis réel (« mise à jour dans 10 minutes,
  terminez vos validations »), il faut qu'il soit visuellement distinct d'une annonce ordinaire —
  sinon il se fond dans le décor de celui qui le voit depuis une heure.

## B.3 Lectures à confirmer

1. **Où le bandeau d'annonces est-il rendu aujourd'hui ?** Un écran, plusieurs, la coquille ?
2. **Le garde `vite:preloadError` de `main.tsx`** : que fait-il exactement — rechargement
   automatique, message, silence ? C'est lui qui détermine si une navigation après déploiement
   est une gêne ou une perte.
3. ⚠️ **Et la question qui décide si tout ce chantier était bien ciblé** : y a-t-il eu un
   déploiement de **règles** hier pendant la séance, ou seulement du code ? Si c'était les
   règles, B.0 explique tout et le préavis est secondaire. Si c'était du code seul, alors le
   `preloadError` est le coupable et c'est **lui** qu'il faut traiter, pas le préavis.

---

# PARTIE C — Le moniteur veut voir quel élève a validé quel bloc

## C.0 La distinction qui porte tout le besoin

⚠️ **Le besoin est dans l'entrée « mini-compétitions », pas dans l'entrée « exercices ».** Ce sont
deux entrées distinctes de la fonction moniteur, et confondre les deux fait chercher le correctif
au mauvais endroit.

Et le manque n'est pas un défaut d'affichage, c'est une **absence de vue** :

> La mini-compétition ne produit aujourd'hui qu'un **classement**. Or un classement est un
> résumé compétitif — il dit qui a gagné. La monitrice a besoin d'un **relevé** : qui a fait
> quoi. Ce sont deux objets différents, et aucun ne se déduit de l'autre.

Un classement ne dira jamais que Léa a buté trois fois sur le bleu de la dalle pendant que le
reste du groupe le flashait. C'est pourtant la seule information de la séance qui ait une valeur
pédagogique.

## C.1 La bonne nouvelle : c'est probablement gratuit

`StatsList.tsx` charge déjà `userResults` **et** `users`, et calcule le classement de
mini-compétition **côté client** à partir de ces résultats. Les données d'un tableau
« élèves × blocs » sont donc **vraisemblablement déjà en mémoire** : la fonctionnalité est de la
présentation, sans une lecture de plus.

⚠️ **À vérifier, pas à supposer** : `userResults` couvre-t-il tous les élèves de la séance, ou
seulement un sous-ensemble ? Si le chargement est filtré, le tableau coûte des lectures et ce
n'est plus la même décision.

## C.2 La forme

Un tableau **élèves en lignes, blocs en colonnes**, une cellule par validation : réussi en N
essais, échoué, ou vide. Trois précautions :

- **Les blocs en colonnes sont ordonnés comme la salle** — ordre de `gymConfig.walls` puis
  numéro, comme la partie B du chantier d'hier. Pas par identifiant.
- ⚠️ **La couleur affichée est la couleur FIGÉE à la validation** (`result.boulderColor`), jamais
  la couleur courante du bloc. C'est le défaut mesuré le 18/10/2026 — 80 points chez la
  monitrice contre 900 chez l'élève, sur la même validation. Un nouvel écran qui relirait la
  couleur courante le ferait revenir, dans l'écran même où il avait été corrigé.
- **Un total par élève et un taux de réussite par bloc** en marge. Le second est celui qui
  transforme le tableau en outil : il dit quel bloc était trop dur pour le groupe, ce qu'aucune
  autre vue ne donne.

⚠️ **Et une réserve d'usage, à dire plutôt qu'à coder** : ce tableau expose les échecs de chaque
élève à qui regarde l'écran. Sur le téléphone de la monitrice, c'est son métier. Projeté ou tendu
à un groupe, c'est autre chose.

## C.3 Les tests

- **Un élève sans aucune validation apparaît quand même**, ligne vide. L'absence est une
  information pédagogique, et c'est exactement le cas qu'un `map` sur les résultats ferait
  disparaître sans bruit.
- La couleur affichée est celle figée, vérifié **en recotant le bloc après la validation** —
  sinon le test ne distingue pas les deux lectures.
- ⚠️ Affirmer la **taille** avant le contenu : N élèves × M blocs, et le total des cellules
  remplies égale le nombre de résultats chargés. Sinon une validation se perd entre les deux
  représentations sans que rien ne le dise.

## Ce que ce plan ne touche pas

Rien sur le barème, les niveaux, les badges, le multiplicateur ni les classements. La partie A ne
touche aucune donnée. Les parties B et C sont indépendantes l'une de l'autre.

Et il ne traite pas les points ouverts : « Mes stats » et ses lectures, le point d'appel de
`levelSync` depuis `ClientDaily`, la garde devenue fausse de la sonde, et 🔴 **la Roulette quand
aucun bloc ouvert ne correspond au niveau du grimpeur** — jamais vérifié, et vivant depuis le
déverrouillage du 6.
