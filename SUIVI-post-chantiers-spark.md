# Suivi post-chantiers — 3 points relevés après lecture du handoff

> Note rédigée le 14/08/2026 par la session Claude (navigateur) après lecture de
> `HANDOFF-spark-images-competition.md` (version mise à jour, tous chantiers clos).
> À destination de Claude Code dans le Codespace.
>
> **Rien ici n'est bloquant ni urgent.** Les quatre chantiers sont terminés et
> fonctionnels en production. Ces trois points sont : un manque du plan initial (point 1),
> un défaut de calibrage qui se manifestera à la prochaine rotation de secteur (point 2),
> et une mesure de contrôle désormais possible (point 3).

---

## Point 1 — Aucune copie de secours des images (manque du plan initial)

### Constat

C'est le corollaire de la Passe B, et **le plan original ne l'avait pas prévu**.

Avant la migration, les images vivaient dans Firestore : sauvegardées avec la base,
exportables, sous contrôle direct. Depuis la suppression du champ `image_base64`,
**l'unique exemplaire de chaque photo de bloc se trouve chez un prestataire tiers, sur un
compte gratuit**.

Scénarios de perte définitive : suspension du compte Cloudinary, changement des conditions
du palier gratuit, suppression accidentelle depuis leur interface web, ou bug du script de
nettoyage. Dans tous les cas, Firestore ne conserverait qu'un `image_public_id` pointant
sur rien — et le repli `image_base64` n'existe plus.

### Pourquoi ça compte au-delà du risque immédiat

Le risque à court terme est faible (25 blocs, compte actif, palier large). Mais l'ambition
commerciale est de vendre la solution à d'autres salles : proposer un produit où les
photos de chaque client reposent sur un unique compte gratuit sans sauvegarde n'est pas
une position tenable dans la durée. Autant traiter le sujet maintenant, sur 25 blocs,
plutôt que sur plusieurs milliers répartis entre plusieurs salles.

### Solution proposée — réutiliser l'existant

`scripts/cleanup-orphan-boulder-images.js` liste déjà toutes les ressources du dossier
Cloudinary via l'Admin API. Un mode supplémentaire qui les **télécharge** au lieu de les
comparer suffit :

- nouveau drapeau, par exemple `--backup <dossier>` ;
- télécharger chaque ressource du dossier `blocabrac/boulders` non déjà présente
  localement (idempotent, relançable, incrémental) ;
- conserver le `public_id` dans le nom de fichier pour permettre une restauration ;
- écrire un manifeste JSON associant `public_id` → `boulder_id` → nom de fichier, sans
  lequel une restauration serait laborieuse.

### Automatisation

La GitHub Action mensuelle peut déclencher la sauvegarde **avant** le nettoyage, dans le
même workflow. Ordre important : sauvegarder d'abord, supprimer ensuite.

Reste à décider où stocker l'archive. Quelques pistes, à arbitrer selon la contrainte de
gratuité :

- artefact de workflow GitHub (simple, mais rétention limitée dans le temps) ;
- commit dans un dossier suivi par git (fonctionne à ce volume, mais alourdit le dépôt et
  passe mal à l'échelle multi-salles) ;
- téléchargement manuel occasionnel depuis le Codespace (le moins automatique, mais zéro
  dépendance nouvelle).

Sur 25 blocs, l'archive complète représente quelques mégaoctets — n'importe laquelle de
ces options convient aujourd'hui. Le choix se fera vraiment au moment du passage
multi-salles.

---

## Point 2 — Le garde-fou anti-chute de 20 % est mal calibré pour ce métier

### Constat

Le script s'interrompt si le nombre de références chute de plus de 20 % par rapport au run
précédent. C'est la bonne protection face à une lecture Firestore partielle ou une erreur
d'authentification.

**Mais dans une salle d'escalade, une rotation de secteur supprime légitimement une grosse
fraction des blocs d'un coup.** C'est le cycle normal de l'activité, pas une anomalie.

Ordre de grandeur avec l'état actuel de la prod (25 blocs) : retirer un mur de 15 blocs
fait chuter la référence de 60 %. Le script s'arrêtera donc — correctement selon sa règle,
inutilement selon le métier — et il faudra intervenir manuellement.

Le problème est aggravé par le petit volume total : plus le nombre de blocs est faible,
plus un pourcentage est volatil. Une variation qui serait du bruit sur 500 blocs est une
alerte sur 25.

### Corrections possibles

À arbitrer, les trois sont acceptables :

1. **Drapeau de contournement explicite** (`--force` ou `--accept-drop`) permettant de
   relancer sans éditer `cleanup-state/state.json` à la main. Le minimum vital : sans lui,
   la reprise après alerte suppose de manipuler un fichier d'état, ce qui est exactement
   le genre d'opération où l'on casse le garde-fou en voulant le contourner.
2. **Seuil en valeur absolue plutôt qu'en pourcentage** — par exemple, s'arrêter si les
   références passent sous un plancher fixe, plus stable à petit volume.
3. **Seuil hybride** : déclencher l'alerte seulement si la chute dépasse à la fois 20 %
   **et** un nombre absolu de références.

Quelle que soit l'option retenue, le comportement doit rester : **s'arrêter sans rien
supprimer**, jamais passer outre silencieusement.

### À vérifier au passage

Que fait le script en **l'absence** de `cleanup-state/state.json` (premier run, ou fichier
perdu) ? S'il passe sans vérifier plutôt que de s'arrêter, c'est un défaut à corriger :
c'est précisément la situation où la protection est la plus utile et la moins présente.

---

## Point 3 — Mesurer le gain réel (chantier 0, seconde passe)

### Pourquoi maintenant

Le plan prévoyait de reprendre la mesure après le chantier 2. Ça n'avait pas de sens tant
que `image_base64` restait dans les documents : le SDK client Firestore ne permettant
aucune projection de champs, chaque lecture de bloc transférait encore l'ancienne image
**en plus** de l'URL Cloudinary.

Depuis la Passe B, les documents `boulders` sont enfin légers. La mesure est donc
significative pour la première fois.

### Protocole

1. Navigateur, cache vidé, onglet Réseau ouvert.
2. Ouvrir un mur dans `/client/daily`.
3. Relever le volume total transféré, en distinguant les requêtes Firestore des requêtes
   Cloudinary.
4. Comparer à la mesure initiale du chantier 0.

**Gain attendu : facteur 5 à 10.**

### Ce que ça vérifie au-delà du chiffre

- Qu'aucun écran ne relit accidentellement un champ lourd resté dans le schéma.
- Que la variante `thumb` (`w_400`) est bien servie en liste, et non l'image pleine.
- Que `f_auto` sert effectivement du WebP/AVIF selon le navigateur.
- Que le cache HTTP Cloudinary joue son rôle au rechargement (c'est aussi le critère du
  chantier 3 resté non mesuré).

### À quoi ça sert ensuite

Cette mesure donne la base de calcul pour dimensionner **la compétition à 90 participants
sur 35 blocs**, qui reste le vrai test des quotas Spark. Sans elle, tout dimensionnement
repose encore sur des estimations.

Consigner le résultat en tête de `PLAN-spark-images-competition.md`, à côté de la mesure
initiale.

---

## Rappel de contexte encore valable

- **Le transfert sortant Firestore (10 GiB/mois) reste le quota critique**, pas les
  lectures. C'est lui qu'il faut surveiller après une compétition.
- **Décision toujours en suspens, hors périmètre de ces chantiers** : un projet Firebase
  par salle ou un projet mutualisé, pour la revente. Sur Spark les quotas sont par projet,
  donc le mutualisé est exclu dès la deuxième salle. À trancher avant tout développement
  orienté multi-salles.
- **Écran live de classement sur TV** : débloqué par le chantier 1 (les validations sont
  désormais écrites au fil de l'eau), mais non commencé. Conception détaillée disponible
  dans l'historique de la conversation navigateur — points clés : recalcul depuis un
  snapshot `onSnapshot` en mémoire et **jamais** de refetch complet, recalcul groupé
  (1-2 s) plutôt qu'à chaque snapshot, rotation par catégorie FFME plutôt qu'un classement
  global de 90 lignes illisible à 5 m, route hors `Navbar` ouvrable en fenêtre séparée
  pour l'écran étendu HDMI, et extraction préalable de `getParticipantScores()` dans un
  utilitaire partagé (actuellement dupliqué entre `AdminCompetitionStats.tsx` et
  `Ouvreur/CompetitionBoulders/CompetitionStats.tsx` — un troisième exemplaire créerait
  trois vérités possibles le jour où le barème change).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout script destiné à la CI doit vivre dans un chemin **suivi par git** — leçon du
  premier run raté de la GitHub Action.
