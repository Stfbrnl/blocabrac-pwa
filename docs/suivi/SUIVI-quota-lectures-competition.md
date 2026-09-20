# Suivi — Le quota de lectures est devenu le point bloquant des compétitions

> Note rédigée le 14/08/2026 par la session Claude (navigateur), après lecture du
> handoff mis à jour du 14/08 (les 3 points de `SUIVI-post-chantiers-spark.md` traités,
> mesure ×2,9 consignée).
> À destination de Claude Code dans le Codespace.
>
> **Statut : à traiter avant la compétition à 90 participants.** Rien ne casse en usage
> quotidien actuel (25 blocs, poignée de testeurs). Le problème n'apparaît qu'à l'échelle
> de l'événement — mais il apparaîtra à coup sûr, et il coupera l'application pendant
> l'épreuve.
>
> **Ce document corrige aussi une erreur du plan initial** (`PLAN-spark-images-competition.md`,
> point 1.3) — voir la section « Erreur à corriger dans le plan ».

---

## Résumé en trois phrases

Le chantier 2 a résolu le quota de **transfert sortant** (10 GiB/mois) : mesure ×2,9,
dimensionnement 90/35 ≈ 95 Mo, très confortable. Mais une lecture Firestore est facturée
**par document, quelle que soit sa taille** — la migration des images n'a donc rien
changé au quota de **lectures** (50 000/jour), qui devient le plafond contraignant. Or le
chantier 1, en ajoutant `loadExistingResults`, a **augmenté** ce poste.

---

## Le défaut principal : `loadExistingResults` à chaque ouverture de modale

### Constat

Dans `ClientCompetitions.tsx`, les résultats existants du grimpeur sont rechargés depuis
Firestore **à chaque ouverture de la modale de validation**.

C'est bien ce qui rend la reprise après rechargement possible — la fonctionnalité est
juste, c'est sa fréquence d'appel qui pose problème.

### Arithmétique

Hypothèses explicites, à ajuster selon le comportement réel observé :

| Paramètre | Valeur retenue |
|---|---|
| Participants | 90 |
| Blocs de compétition | 35 |
| Ouvertures de modale par grimpeur | ~35 (une par bloc, au minimum) |
| Documents lus par `loadExistingResults` | jusqu'à 35 (tous ses résultats) |

→ **~1 225 lectures par grimpeur**, soit **~110 000 lectures** pour 90 participants.

Le plafond quotidien Spark est de **50 000**. Ce seul mécanisme le dépasse d'un facteur 2,
avant même de compter les chargements de page.

Le nombre d'ouvertures est probablement supérieur à 35 dans la réalité : un grimpeur
rouvre une modale pour corriger un nombre d'essais, hésite, revient. Traiter 35 comme un
plancher, pas comme une estimation moyenne.

### Correction proposée, par ordre de préférence

**Option A — `onSnapshot` unique sur les résultats du grimpeur** (recommandée)

Un seul listener monté à l'ouverture de la page de compétition, sur
`competition_results` filtré par `user_id == uid` et `competition_id == compId`.

- Coût : ~35 documents au snapshot initial, puis **uniquement les deltas**.
- Ordre de grandeur : ~100 lectures par grimpeur sur toute la soirée, contre ~1 225.
- Bénéfice secondaire : l'état devient réactif, ce qui prépare directement l'écran live
  de classement (voir « Reste à faire » plus bas).
- La modale lit alors l'état déjà en mémoire, sans aucune requête.

**Option B — chargement unique au montage de la page**

Conserver `getDocs`, mais l'appeler une seule fois à l'ouverture de la page plutôt qu'à
chaque ouverture de modale. Plus simple, presque aussi efficace en lectures, mais sans le
bénéfice de réactivité.

Dans les deux cas : **ne pas régresser sur la reprise après rechargement**, qui est la
raison d'être de ce chargement. Le test Playwright existant
(`e2e-competition-flow.mjs`, étape de reprise après rechargement) doit continuer à passer
sans modification de son intention.

---

## Audit à mener : les autres sources de lectures de l'écran compétition

`loadExistingResults` est le poste le plus visible, mais probablement pas le seul. À
vérifier dans `ClientCompetitions.tsx` — **ne pas se contenter de corriger le point
ci-dessus sans faire ce recensement**.

Sources candidates, par ordre de volume attendu :

- **Liste des blocs de compétition** : ~35 documents par chargement de page.
- **Liste des participants** : jusqu'à 90 documents par chargement de page.
- Tout autre `getDocs` déclenché à l'affichage ou à un changement d'onglet.

Ordre de grandeur : ~125 lectures par chargement de page. À 90 grimpeurs et seulement 5
chargements chacun (rechargement d'onglet, retour depuis l'arrière-plan iOS/Android,
navigation), cela fait déjà **~56 000 lectures** — le plafond est franchi par ce seul
poste.

### Le levier pour ces données-là

Les blocs et la liste des participants **ne changent pas pendant l'épreuve**. Ce sont les
candidats parfaits à une lecture depuis le cache local :

- soit `onSnapshot` (snapshot initial puis deltas nuls) ;
- soit une lecture explicite depuis le cache (`getDocsFromCache`) avec repli serveur si le
  cache est vide.

⚠️ **La persistance IndexedDB seule ne suffit pas.** Par défaut, un `getDocs` en ligne
interroge **toujours** le serveur : le cache ne sert que de repli hors ligne. Il faut
changer la façon de lire, pas seulement activer le cache. C'est le point le plus souvent
mal compris sur ce sujet.

À noter aussi : la reprise d'un `onSnapshot` après une coupure réseau prolongée peut
refacturer l'intégralité du jeu de documents si le jeton de reprise est trop ancien.
Google ne garantit pas le comportement incrémental. Ne pas traiter les deltas comme un
plafond garanti — c'est une forte réduction, pas une certitude.

---

## Erreur à corriger dans le plan initial

`PLAN-spark-images-competition.md`, **point 1.3**, contient cette phrase :

> « Coût : ~35 lectures par ouverture, absorbées par le cache local une fois le
> chantier 3 fait. »

**C'est faux.** Le cache local n'absorbe pas ces lectures, pour la raison rappelée
ci-dessus : un `getDocs` en ligne va toujours au serveur. Cette affirmation a fait passer
pour anodin un coût qui ne l'est pas, et le chantier 1 a été implémenté sur cette base.

Corriger la phrase dans le plan (ou la barrer avec un renvoi vers ce document), pour
qu'une relecture ultérieure ne reparte pas de la même hypothèse erronée.

---

## Ce qui n'est PAS un problème

Pour éviter des optimisations inutiles :

- **Les écritures.** ~3 150 résultats au minimum, jusqu'à ~8 000 avec les corrections et
  le debounce à 800 ms. Le plafond est à 20 000/jour. Confortable.
- **Le transfert sortant.** ~95 Mo pour la compétition selon la mesure du 14/08, contre
  10 GiB/mois. Confortable.
- **La bande passante Cloudinary.** Poste distinct du quota Firestore, sur un palier
  d'environ 25 Go/mois. Confortable, et les vignettes sont mises en cache par le
  navigateur pendant 30 jours (`Cache-Control max-age=2592000`).

**Un seul compteur est en dépassement : les lectures.** Concentrer l'effort là.

---

## Vérification

Ne pas se fier au calcul ci-dessus : le mesurer.

1. **Compter les lectures d'un parcours type.** Émulateur Firestore ou console Firebase
   (onglet Usage), en simulant le parcours d'un grimpeur : ouvrir la page de compétition,
   ouvrir et fermer une dizaine de modales, valider quelques blocs, recharger la page.
   Relever le nombre de lectures produites.
2. **Extrapoler à 90 participants** et comparer aux 50 000 quotidiens.
3. **Refaire la mesure après correction.** Cible : passer sous 20 000 lectures pour
   l'ensemble de la compétition, afin de garder de la marge pour l'usage quotidien de la
   salle le même jour.

Consigner le avant/après en tête de `PLAN-spark-images-competition.md`, à côté des
mesures de transfert.

---

## Rappel : ce qui reste ouvert par ailleurs

- **Écran live de classement sur TV.** Débloqué par le chantier 1, non commencé.
  L'option A ci-dessus (`onSnapshot`) est un prérequis naturel. Points de conception
  déjà arrêtés : recalcul depuis le snapshot en mémoire et **jamais** de refetch complet ;
  recalcul groupé toutes les 1-2 s plutôt qu'à chaque snapshot ; rotation par catégorie
  FFME plutôt qu'un classement global de 90 lignes illisible à 5 m ; route hors `Navbar`
  ouvrable en fenêtre séparée pour l'écran étendu HDMI ; et **extraction préalable de
  `getParticipantScores()`** dans un utilitaire partagé — il est aujourd'hui dupliqué
  entre `AdminCompetitionStats.tsx` et `Ouvreur/CompetitionBoulders/CompetitionStats.tsx`,
  un troisième exemplaire créerait trois vérités possibles le jour où le barème change.
- **Un projet Firebase par salle ou un projet mutualisé**, pour la revente. Sur Spark les
  quotas sont par projet : le mutualisé est exclu dès la deuxième salle. À trancher avant
  tout développement orienté multi-salles.
- **Stockage durable des sauvegardes d'images** (`--backup`), laissé ouvert. Noter au
  passage que le mode ne sauvegarde que les images **référencées** : une image dont le
  bloc a été supprimé entre deux sauvegardes n'est jamais archivée. Sans conséquence en
  usage manuel occasionnel, à reconsidérer en cas d'automatisation.
- **Mesure réseau navigateur du cache au rechargement** (critère non mesuré du
  chantier 3), toujours en attente d'un vrai onglet Réseau.

---

## Addendum du 14/08/2026 — le même défaut existait aussi en usage quotidien (et pire)

Après le correctif compétition (option A, ×47,6 sur les lectures — voir
`PLAN-spark-images-competition.md`), audit du reste de l'app pour le même schéma
(requête refaite à chaque interaction au lieu d'une fois puis mise à jour en mémoire).

**`ClientDaily.tsx` — trouvé et corrigé.** `updateClassementProfile`, appelée à chaque
clic Réussi/Échoué et à chaque "Enregistrer" (jusqu'à 2 fois par bloc, 20-30 blocs/jour
pour un grimpeur assidu qui revient plusieurs fois dans la journée), refaisait un
`getDocs` sur **tout l'historique de réussites du grimpeur** (`client_boulder_results`,
`success == true`). Contrairement au cas compétition, borné à ~35 blocs, cet historique
grossit sans limite avec l'ancienneté du compte — plus dangereux à terme que la
compétition car continu (tous les jours, pas un seul soir par an) et à coût croissant.
Corrigé sur le même principe : un cache en mémoire (`successfulAttemptsRef`), chargé une
fois au montage de la page, muté localement à chaque validation (on connaît déjà la
valeur qu'on vient d'écrire, pas besoin de la relire) plutôt que requêté à nouveau.
Vérifié : `build`/`lint`/`test`/`test:rules` verts, `e2e-daily-flow.mjs` 7/7 (classement
en continu toujours à jour après validation/note).

**`ClientCourseSession.tsx` (cours) — vérifié, rien à corriger côté lectures.** La
séance et les résultats déjà écrits ne sont chargés qu'une fois au montage de la page
(pas à chaque clic sur un exercice/mini-bloc) ; `handleValidateExercise`/
`handleValidateBoulder` n'ont aucun `getDocs`. Déjà le pattern "chargement unique"
recherché ailleurs.

**Corrigé également le même jour** (le point ci-dessus, initialement noté "à traiter
séparément", a été traité dans la foulée) : les résultats de séance n'étaient écrits
qu'au clic final "Enregistrer les résultats" (`handleSubmitResults`), gardés en state
React jusque-là — un onglet fermé ou un rechargement avant ce clic perdait toute la
progression de la séance. Même bug que celui corrigé par le chantier 1 côté compétition
("résultats écrits au fil de l'eau"), même remède : `persistExerciseResult`/
`persistBoulderResult` écrivent désormais immédiatement sur les clics Réussi/Échoué (et
avec un debounce ~800ms sur les champs à saisie répétée — essais, données libres),
`handleSubmitResults` ne fait plus qu'annuler les debounces en attente et confirmer/
naviguer. `createdAt` n'est posé qu'à la première écriture par document (lu par
`ClientStats.tsx` comme date de validation) — comportement inchangé. Vérifié :
`build`/`lint`/`test`/`test:rules` verts, et une nouvelle étape ajoutée à
`e2e-course-flow.mjs` (rechargement de page **avant** tout clic sur "Enregistrer",
validation retrouvée) — 11/11 étapes réussies.

**Moniteur / Ouvreur / Admin — audité, rien de comparable trouvé.** Tous les écrans
consultés (`StatsList.tsx`, `CompetitionStats.tsx` côté ouvreur et admin,
`AdminUsers.tsx`, `MessagesList.tsx`, etc.) chargent leurs données une fois par
montage de page, sans requête refaite à chaque clic ni `setInterval`/polling. Le volume
de lectures y est borné par la fréquence d'usage du staff (quelques personnes, usage
occasionnel), pas multiplié par les actions des clients — pas le même ordre de risque.
Seul point à surveiller, non urgent : plusieurs de ces écrans font un
`getDocs(collection(db, 'users'))` non filtré (liste complète des comptes), qui grossira
avec le nombre total de comptes au fil des années — à reconsidérer si l'app passe à
l'échelle multi-salles (voir le point "un projet Firebase par salle" plus haut).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout script destiné à la CI doit vivre dans un chemin suivi par git.
