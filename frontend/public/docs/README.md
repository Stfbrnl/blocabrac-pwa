# `public/docs/` — tout ce qui entre ici est PUBLIÉ

> ⚠️ **Ce dossier est servi publiquement et sans authentification.** Tout fichier qui y entre
> est, de fait, publié : il suffit d'en connaître l'URL. N'y mettre que des documents qu'on
> accepterait de voir circuler.
>
> **Le sous-menu « Documents de la salle » de l'application est un confort de navigation,
> jamais une protection.** Il est réservé aux rôles `admin`, `ouvreur` et `moniteur`, mais
> l'application est une page unique : le code de cet écran — et donc les URL qu'il contient —
> part dans le bundle servi à **tout** visiteur, connecté ou non.

## La raison de cette règle n'est pas le topo d'aujourd'hui, c'est le document de demain

Les documents présents (topos, affiches) sont inoffensifs, et la menace est négligeable : il
faudrait quelqu'un qui ouvre les outils de développement d'une application de sport gratuite
pour y chercher un document de staff. Ce n'est pas pour eux que cette page existe.

Elle existe pour empêcher que quelqu'un — toi dans six mois, ou un successeur — dépose ici un
export de comptes, une liste d'adhérents ou un fichier de contacts **en se disant que le menu
protège**. Il ne protège rien.

## Si un document doit un jour être réellement réservé

**Firebase Hosting ne peut pas le faire** : il sert des fichiers statiques, un point c'est
tout. Aucune configuration de `firebase.json` n'y changera quelque chose. Il faudrait **Cloud
Storage for Firebase**, dont les règles peuvent exiger un rôle — à vérifier le jour venu, le
projet utilisant Cloudinary pour les images, Storage n'est peut-être même pas activé.

Ne pas chercher à bricoler un contrôle d'accès côté client : il n'en existe pas qui tienne.

## Deux pièges techniques propres à ce dossier

1. 🔴 **Un `.pdf` et un `.html` déposés ici n'ont PAS le même sort.** Les `globPatterns` du
   service worker (`vite.config.ts`) précachent `html`, pas `pdf` : un `.html` ajouté ici est
   **téléchargé par chaque visiteur**, qu'il l'ouvre ou non. Un PDF de plusieurs centaines de
   kilo-octets précaché serait le coût caché de ce dossier — vérifier le manifeste produit
   (`dist/sw.js`), pas l'intention.
2. 🔴 **`navigateFallbackDenylist: [/^\/docs\//]`** est obligatoire et déjà en place. Sans ce
   refus, ouvrir un `/docs/*.pdf` est traité comme une **navigation** et reçoit `index.html` :
   écran blanc. Et ce défaut est **invisible à `curl`**, qui ne traverse aucun service worker —
   l'instrument est `frontend/scripts/verify-deploy-servi.cjs`, ou un vrai navigateur après
   rechargement.

## Les documents, et d'où ils viennent

Aucun de ces fichiers ne se modifie à la main : ils sont **générés**, et leur estampille
(version + date) est **dérivée** à la génération par `frontend/scripts/topo-stamp.cjs`, qui
écrit aussi `frontend/src/data/documentsStamp.json` — le registre que l'écran affiche.

| fichier | généré par |
|---|---|
| `topo-blocabrac.pdf` | `npm run topo` |
| `topo-roulettes-defis.pdf` | `npm run topo:roulettes` |
| `affiche-bareme-competition.pdf` / `.html` | `npm run affiche:bareme` |
| `diplome-vierge.pdf` | `npm run diplome:vierge` |
| `aide-connexion-installation.pdf` / `.html` | **aucun générateur** — fabriqué à la main en septembre 2026, donc sans estampille dérivable |

⚠️ Les **sources** (`*-source.html`) restent à la racine du dépôt : ce sont des gabarits, pas
des documents. Seules les **sorties** entrent ici. Déplacer une sortie hors de ce dossier la
rend introuvable autrement qu'en ouvrant le dépôt — c'est exactement l'état dont les deux topos
sont sortis le 07/11/2026.
