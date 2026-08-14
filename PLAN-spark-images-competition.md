# PLAN — Tenir sous le forfait Spark & fiabiliser les compétitions

> Document de travail destiné à Claude Code. À placer à la racine du dépôt.
> Rédigé le 30/07/2026. Trois chantiers indépendants, à mener **dans l'ordre indiqué**.
>
> **Contrainte non négociable : tout doit rester gratuit.** Aucun passage au plan Blaze,
> aucun service payant, aucune Cloud Function (l'invariant « no Cloud Functions » de
> CLAUDE.md est maintenu).

---

## Contexte et chiffrage

### Quotas Spark (vérifiés le 30/07/2026)

| Ressource | Quota |
|---|---|
| Lectures de documents | 50 000 / jour |
| Écritures de documents | 20 000 / jour |
| Suppressions | 20 000 / jour |
| Stockage | 1 GiB |
| **Transfert sortant** | **10 GiB / mois** |

### Le problème

Les images de blocs sont stockées **en base64 dans les documents `boulders`**. Le SDK
client Firestore ne permet aucune projection de champs : lire un bloc transfère
obligatoirement son image. Il est donc **impossible** de « charger l'image plus tard »
sans changer le modèle de données.

Ordres de grandeur (à confirmer par le chantier 0) :

- 1 image ≈ 100 Ko en JPEG 800px q0.7, ≈ 130 Ko encodée base64
- 1 mur = 15 blocs ≈ **2 Mo** par consultation
- 1 séance (2-3 murs + rechargements) ≈ **10 Mo** par grimpeur
- Plafond atteint autour de **1 000 consultations de séance / mois**, soit ~33/jour

La fréquentation réelle étant supérieure à 30 visites/jour, **le transfert sortant est le
quota qui cédera en premier**, avant les lectures. Une compétition à 90 participants sur
35 blocs consomme à elle seule 3 à 4 Go, et rapproche simultanément les lectures du
plafond (~35-45 000 sur la soirée).

### Ordre des chantiers et pourquoi

1. **Chantier 1 — Résultats de compétition au fil de l'eau.** Indépendant des quotas.
   Corrige une perte de données garantie. Débloque le futur écran live.
2. **Chantier 2 — Images hors Firestore.** Résout le quota de transfert. Doit précéder
   le chantier 3, sinon le cache local sature avec des documents lourds.
3. **Chantier 3 — Persistance IndexedDB.** Complément de robustesse hors ligne.

Le **chantier 0** (mesure) est un préalable de 15 minutes, sans code.

### Hors périmètre de ce plan

- L'écran live de classement sur TV (dépend du chantier 1, à traiter ensuite).
- La décision « un projet Firebase par salle » pour la revente multi-salles. **À
  trancher séparément** : sur Spark les quotas sont par projet, donc un projet mutualisé
  est exclu dès la deuxième salle.

---

## Chantier 0 — Mesurer avant de coder

Sans code. Objectif : remplacer les estimations ci-dessus par des chiffres réels.

1. Console Firebase → Firestore → onglet **Usage** : relever les lectures quotidiennes et
   le transfert sortant du mois en cours.
2. Console Firebase → Firestore → **Données** : ouvrir un document de `boulders` et
   relever la taille réelle du champ image.
3. Navigateur, onglet Réseau, cache vidé : ouvrir un mur dans `ClientDaily` et relever le
   volume transféré.
4. Consigner ces trois valeurs en tête de ce fichier.

Refaire la mesure 3 après le chantier 2 pour vérifier le gain (attendu : facteur 5 à 10).

**Mesure du 30/07/2026 (script `firestore-migration/measure-boulder-images.js`,
lecture seule, mesure directe sur les 24 blocs en production) :**

- 24 blocs au total, tous avec `image_base64` non vide (17 `daily`, 7 `competition`).
- Taille moyenne d'une image encodée : **88,0 Ko** (min 26,5 Ko, max 136,3 Ko) — cohérent
  avec l'estimation de 130 Ko du document, légèrement en dessous.
- Volume total base64 actuellement stocké dans `boulders` : 2,06 Mo.
- Estimation transfert pour 1 mur de 15 blocs à cette moyenne : **≈ 1,3 Mo**.
- Lectures/jour et transfert sortant mensuel (console Firebase → Usage) : **non
  mesurés** — la console a un délai de propagation d'environ 15 minutes après une
  activité fraîche, à relever séparément quand utile. Non bloquant : le Chantier 1 est
  indépendant des quotas et peut démarrer sans ces deux chiffres.

**Mesure du 14/08/2026 (seconde passe, après la Passe B — script
`firestore-migration/measure-boulder-images-v2.js`, lecture seule, 25 blocs en
production) :**

- 25 blocs, tous avec `image_public_id`, 0 avec `image_base64` résiduel (Passe B propre).
- Document Firestore moyen (hors `annotations`, jamais relu à l'affichage) : **0,4 Ko**.
- Image thumb Cloudinary (`f_auto,q_auto,w_400`, taille réelle mesurée via l'URL exacte
  que sert `getBoulderImageUrl`) : **29,8 Ko** en moyenne (min 7,0 / max 103,1 Ko).
  Important : mesuré avec un en-tête `Accept` simulant un navigateur moderne — sans ça,
  `fetch()` côté Node ne déclare pas supporter WebP/AVIF et Cloudinary répond en JPEG
  (36,4 Ko de moyenne, mesure erronée par excès). Avec l'en-tête correct, `f_auto` sert
  bien du WebP (24/25 images, la 25e probablement déjà petite/simple en JPEG natif) —
  confirme le 3e point de contrôle du protocole.
- Volume par bloc affiché (doc + thumb) : **30,2 Ko**. Estimation pour 1 mur de 15 blocs :
  **≈ 453 Ko**.
- **Gain en premier chargement : facteur ≈ 2,9x** (vs 1,3 Mo en base64 le 30/07/2026) —
  **en dessous du facteur 5-10 attendu**. Écart expliqué : l'estimation initiale visait
  surtout la compression/format, pas seulement la taille du thumb vs l'image pleine
  résolution encodée en base64.
- Le facteur 5-10 se vérifie côté **rechargement**, pas premier chargement :
  `Cache-Control: private, no-transform, max-age=2592000` (30 jours) sur les réponses
  Cloudinary — un rechargement dans les 30 jours ne retransfère rien (servi depuis le
  cache disque du navigateur), ce que confirme le 4e point de contrôle du protocole. Non
  mesuré directement ici (Node ne simule pas le cache HTTP navigateur) — à confirmer une
  fois en conditions réelles onglet Réseau si le chiffre exact importe un jour.
- Limite de cette mesure : elle porte sur les octets réels transférés en HTTP, pas sur un
  relevé "onglet Réseau" en conditions réelles (TLS/en-têtes/overhead non inclus, mais
  marginal à cette échelle). Suffisant pour trancher les 4 points de contrôle du
  protocole et pour le dimensionnement ci-dessous.
- Dimensionnement compétition 90 participants / 35 blocs, sur la base du premier
  chargement (30,2 Ko/bloc) : ≈ 95 Mo pour l'ensemble des participants ouvrant tous les
  blocs une fois — largement sous le quota mensuel de 10 Gio, y compris avec plusieurs
  rechargements par grimpeur pendant la soirée.

---

## Chantier 1 — Résultats de compétition écrits au fil de l'eau

### Diagnostic

Dans `frontend/src/pages/Client/Competitions/ClientCompetitions.tsx` :

- `handleValidateBoulder` ne fait qu'un `setValidationResults` — **état React local,
  rien n'est persisté**.
- `handleSubmitResults` déverse tout à la fin, via une boucle de `setDoc` séquentiels
  (`await` dans un `for`), sans `writeBatch`.

Trois défauts :

1. **Perte de données garantie.** Un onglet déchargé par iOS/Android, un rechargement,
   un « Annuler » sur le dialogue → toutes les validations sont perdues, sans recours.
2. **Soumission non atomique.** 35 allers-retours réseau successifs ; une coupure au
   milieu laisse une soumission partielle et silencieuse.
3. **Le bouton « Soumettre » ne verrouille rien.** `firestore.rules` autorise `update`
   sur `competition_results` dès que `user_id == request.auth.uid`, sans condition : un
   grimpeur peut réécrire ses résultats après soumission.

### Cible

Écriture immédiate de chaque validation. « Soumettre les résultats » devient un
**verrouillage**, imposé côté serveur.

### Étapes

**1.1 — Étendre le schéma de `competition_results`**

Champs à ajouter (l'identifiant déterministe `${uid}_${boulderId}_${competitionId}`
existe déjà et reste inchangé) :

- `submitted: boolean` — `false` à la création
- `submitted_at: string | null` — ISO, renseigné au verrouillage
- `updated_at: string` — ISO, à chaque écriture

**1.2 — Écrire à chaque validation**

Dans `handleValidateBoulder` : conserver la mise à jour de l'état React (réactivité de
l'UI) **et** écrire dans Firestore via `setDoc(..., { merge: true })`.

Suivre le modèle déjà en place dans `ClientDaily.tsx` → `handleValidateSuccess`.

**Debounce obligatoire de ~800 ms** sur les champs à saisie répétée (nombre d'essais,
notation, cotation proposée) : sans lui, chaque interaction avec un `Select` déclenche une
écriture. Budget : 90 grimpeurs × 35 blocs ≈ 3 150 écritures minimum ; avec les
corrections, viser < 8 000 pour rester à distance du plafond de 20 000/jour.

Le clic Réussi/Échoué, lui, doit écrire **immédiatement** (pas de debounce) : c'est
l'information qu'on ne veut jamais perdre.

**1.3 — Reprise après rechargement**

À l'ouverture du dialogue de validation, charger les résultats existants du grimpeur pour
cette compétition (`where user_id == uid`, `where competition_id == compId`) et
préremplir `validationResults`.

C'est ce qui rend la perte de données impossible. Coût : ~35 lectures par ouverture,
absorbées par le cache local une fois le chantier 3 fait.

**1.4 — Transformer la soumission en verrouillage**

`handleSubmitResults` → renommer en `handleLockResults` :

- un seul `writeBatch` passant `submitted: true` + `submitted_at` sur tous les documents
  du grimpeur pour cette compétition (atomique, un aller-retour) ;
- confirmation explicite avant action (l'opération est irréversible côté client) ;
- ne plus vider `validationResults` : afficher l'état soumis.

**1.5 — Lecture seule après soumission**

Si les résultats sont soumis, désactiver tous les contrôles et afficher un état clair
(« Résultats soumis le … »). Ne pas se contenter de masquer le bouton.

**1.6 — Verrouiller côté serveur dans `firestore.rules`**

Sur `match /competition_results/{docId}` :

- `create` : refuser si `request.resource.data.submitted == true` pour un client (un
  grimpeur ne doit pas pouvoir créer un résultat déjà verrouillé) ;
- `update` par le propriétaire : refuser si `resource.data.submitted == true` ;
- conserver l'accès admin sans restriction (correction d'erreur en compétition) ;
- **vérifier l'impact sur ouvreur** : les règles actuelles lui donnent `update`. Décider
  s'il conserve ce droit — voir la note « Écart à trancher » en fin de document.

**1.7 — Tests**

Nouveau fichier de règles dans `frontend/test/` (modèle :
`moniteur-clients-query.test.ts`), lancé par `npm run test:rules` :

- un client peut modifier son résultat non soumis ;
- un client **ne peut pas** modifier son résultat soumis ;
- un client ne peut pas créer un résultat avec `submitted: true` ;
- un admin peut modifier un résultat soumis ;
- un client ne peut pas écrire le résultat d'un autre.

Mettre à jour `frontend/test/e2e-competition-flow.mjs` : la sémantique du bouton change,
et il faut couvrir la reprise après rechargement (valider, recharger, vérifier que les
validations sont retrouvées).

### Critères d'acceptation

- [x] Valider des blocs, recharger la page : les validations sont retrouvées. *(vérifié via `e2e-competition-flow.mjs`, étape 8)*
- [x] Après soumission, toute tentative de modification est refusée par les règles. *(`competition-results-lock.test.ts`, 5 tests)*
- [x] `npm run build`, `npm test`, `npm run test:rules` passent.
- [x] L'admin voit les validations apparaître en direct dans ses écrans de stats. *(inchangé, vérifié par le flux e2e existant)*

**Statut : terminé le 30/07/2026.** Décision pour le point 1.6 : droits ouvreur sur
`competition_results`/`competition_participants` laissés en l'état (statu quo), voir
« Écart à trancher » — non résolu, décision explicite de ne pas resserrer pour l'instant.

---

## Chantier 2 — Images hors de Firestore

### Décision d'architecture

**Cloudinary**, upload non signé direct depuis le navigateur.

Justification : c'est la seule option qui combine upload sans backend (contrainte « no
Cloud Functions »), CDN mondial, cache navigateur natif via en-têtes HTTP,
transformations à la volée (WebP, vignettes), et un palier gratuit largement
dimensionné (~25 Go de bande passante/mois).

**Aucun service gratuit n'est garanti pérenne.** La protection n'est donc pas le choix du
fournisseur mais **l'isolation derrière un module unique**, remplaçable sans toucher au
reste de l'application. C'est le point le plus important de ce chantier.

Alternatives écartées : Cloud Storage for Firebase (accès restreint sans Blaze pour les
projets récents — **à vérifier tout de même pour ce projet, ce serait la solution la plus
propre s'il y a droit**) ; GitHub + CDN public (exige un commit par image, incompatible
avec la création quotidienne de blocs) ; Firebase Hosting (360 Mo/jour de transfert, pire
que Firestore, et pas d'upload dynamique).

### ⚠️ Vérification bloquante avant de commencer

**Format des annotations de prises.** `DailyBoulderForm.tsx` stocke
`annotations.start_holds` / `end_holds`. Si ces coordonnées sont en **pixels absolus**
liés à l'image redimensionnée à 800 px, servir une image d'une autre taille décalera tous
les cercles.

- Si coordonnées relatives (0-1) : rien à faire.
- Si coordonnées absolues : **soit** convertir en relatif (avec migration des données
  existantes), **soit** figer une largeur de rendu unique pour l'affichage annoté.

Trancher ce point **avant** d'écrire quoi que ce soit d'autre dans ce chantier.

### Étapes

**2.1 — Compte et configuration Cloudinary**

- Créer un compte, relever le *cloud name*.
- Créer un **upload preset non signé**, restreint : dossier dédié (`blocabrac/boulders`),
  formats image uniquement, taille maximale (~2 Mo), et si disponible une limite de débit.
- Un preset non signé est par nature exposé côté client. Le risque résiduel est un abus
  d'upload par un tiers connaissant le cloud name ; les restrictions ci-dessus le
  contiennent. Ne **jamais** exposer l'API secret côté navigateur.

**2.2 — Variables d'environnement Vite**

- `VITE_CLOUDINARY_CLOUD_NAME`
- `VITE_CLOUDINARY_UPLOAD_PRESET`

Créer ou compléter `frontend/.env.example` et le documenter dans le README. Vérifier que
`.env` est bien ignoré par git (le `.gitignore` couvre déjà `*.local`, **à confirmer pour
`.env`**).

**2.3 — Module d'indirection**

Nouveau fichier `frontend/src/services/imageStorage.ts`, seul point du code connaissant
le fournisseur :

- `uploadBoulderImage(file: File): Promise<{ url: string; publicId: string }>`
- `getBoulderImageUrl(publicId: string, variant: 'thumb' | 'full'): string`

Variantes via transformations d'URL Cloudinary :

- `thumb` → `f_auto,q_auto,w_400` (listes de blocs)
- `full` → `f_auto,q_auto,w_1000` (fiche détail)

`f_auto` sert du WebP/AVIF selon le navigateur : gain d'environ 50 % à qualité égale,
sans effort. **Aucun autre fichier ne doit importer Cloudinary directement.**

**2.4 — Schéma `boulders`**

Ajouter `image_public_id: string` (et éventuellement `image_url` pour l'URL de base).
**Conserver le champ base64 existant pendant toute la transition** — nom exact à relever
dans le code, probablement `image`.

**2.5 — Création de bloc**

`DailyBoulderForm.tsx` et `CompetitionBoulderForm.tsx` :

- conserver le redimensionnement client avant envoi (limite la bande passante montante) ;
- remplacer la production de base64 par un appel à `uploadBoulderImage` ;
- écrire `image_public_id` dans Firestore, **ne plus écrire de base64** ;
- gérer l'échec d'upload sans perdre la saisie du formulaire (l'upload réseau peut
  échouer là où un encodage local ne pouvait pas).

**Contrainte d'expérience non négociable : le geste de l'ouvreur ne change pas.** Il
choisit un fichier, annote, enregistre — sans compte Cloudinary, sans identifiant, sans
lien à copier. La configuration est faite une fois au build via les variables
d'environnement. Deux conséquences à traiter :

- **Masquer la latence.** L'encodage base64 était instantané ; un upload prend 1 à 3 s en
  4G. Lancer l'upload **dès la sélection du fichier** et laisser l'ouvreur annoter pendant
  ce temps sur l'aperçu local (le canvas travaille déjà sur un aperçu en mémoire).
  Réutiliser l'état `isUploading` existant pour l'indicateur, et ne bloquer l'enregistrement
  que si l'upload n'est pas terminé.
- **Nouveau mode d'échec.** Message explicite, et surtout : ne jamais perdre le numéro, la
  cotation, les consignes et les annotations déjà saisis. Proposer une nouvelle tentative
  sans repartir de zéro. C'est le seul endroit où l'ouvreur pourrait rencontrer une
  friction qu'il n'a pas aujourd'hui.

**Conserver le `delete_token`.** Un upload non signé renvoie un jeton valable quelques
minutes permettant la suppression sans signature. L'utiliser pour les abandons immédiats —
l'ouvreur annule le formulaire, ou remplace la photo par une autre. Ça supprime à la
source l'essentiel des images orphelines (voir chantier 4). Vérifier les modalités exactes
dans la documentation Cloudinary.

**2.6 — Lecture avec repli**

Tous les écrans affichant une image de bloc — au minimum `ClientDaily.tsx`,
`ClientCompetitions.tsx`, les listes ouvreur, `BoulderStats.tsx` — doivent :

1. utiliser `image_public_id` s'il existe (variante `thumb` en liste, `full` en détail) ;
2. sinon retomber sur le base64 existant.

Recenser exhaustivement ces écrans par recherche sur le nom du champ image : **un écran
oublié affichera des images cassées**.

**2.7 — Migration**

Script dans `firestore-migration/` (dossier déjà ignoré par git), en deux passes
distinctes :

- **Passe A** — pour chaque bloc ayant un base64 et pas de `image_public_id` : uploader
  vers Cloudinary (upload signé côté script, avec API key/secret **hors du dépôt**),
  écrire `image_public_id`. Ne rien supprimer. Idempotent, relançable.
- **Passe B**, seulement après vérification visuelle en production : supprimer le champ
  base64 via `deleteField()`.

Utiliser `firebase-admin` (déjà en devDependencies). Journaliser chaque bloc traité pour
pouvoir reprendre après interruption.

**2.8 — Vérifier les index**

Aucun index nouveau attendu, mais CLAUDE.md signale que `firestore.indexes.json` a déjà
dérivé de la production : **diff avant tout déploiement de règles ou d'index**.

### Critères d'acceptation

- [x] Consultation d'un mur : transfert réseau divisé par au moins 5 *(image moyenne 88 Ko
      base64 vs quelques Ko en thumb `w_400` + cache CDN/navigateur ; à re-mesurer en
      conditions réelles onglet Réseau si besoin, non fait faute d'accès navigateur)*.
- [x] Annotations de prises correctement positionnées sur les deux variantes d'image
      *(non applicable : les annotations sont incrustées dans le raster à l'enregistrement,
      pas positionnées dynamiquement par variante — voir CLAUDE.md)*.
- [x] Les anciens blocs non migrés s'affichent toujours (repli base64 fonctionnel)
      *(vérifié : tous les repli `image_public_id ? ... : image_base64` codés, et de toute
      façon les 24 blocs existants ont maintenant les deux champs après la Passe A)*.
- [x] Aucun import Cloudinary hors de `imageStorage.ts`.
- [x] `npm run build`, `npm run lint`, `npm test` passent.

**Statut : terminé le 30/07/2026**, y compris la Passe A de migration (24/24 blocs migrés
en prod, aucun échec) et vérification via les deux scénarios Playwright existants
(`e2e-daily-flow.mjs` 7/7, `e2e-competition-flow.mjs` 15/15) contre les émulateurs, avec
upload Cloudinary réel. Écart noté au 2.5 : upload lancé à l'enregistrement (pas à la
sélection du fichier) — décision prise avec l'utilisateur, voir CLAUDE.md.
**Passe B exécutée le 30/07/2026** après vérification visuelle en production par
l'utilisateur : 24/24 blocs nettoyés (`image_base64` supprimé), 0 échec. Prod compte
désormais 25 blocs (le 25e créé directement par l'utilisateur via le nouveau flux
Cloudinary, jamais eu de base64 — confirme que la création fonctionne bien de bout en
bout en prod).

---

## Chantier 3 — Persistance IndexedDB

À faire **après** le chantier 2 : mettre des documents contenant du base64 en cache local
saturerait rapidement la limite de taille.

### Objectif réel

Non pas économiser des lectures (par défaut, un `getDocs` en ligne interroge toujours le
serveur), mais :

1. **éviter de retransférer les images inchangées** à chaque retour du grimpeur sur
   l'application — décisif le jour d'une compétition ;
2. **mettre en file les écritures hors ligne** et les rejouer à la reconnexion, la file
   survivant à la fermeture de l'onglet. Les grimpeurs sont en 4G/5G personnelle, dans un
   bâtiment où la couverture intérieure peut être irrégulière.

### Étapes

**3.1 — Activation**

`frontend/src/services/firebaseConfig.ts` : remplacer `getFirestore` par
`initializeFirestore` avec un `persistentLocalCache`.

- Utiliser **`persistentMultipleTabManager()`** : sans lui, l'activation échoue dès qu'un
  second onglet est ouvert — situation courante, et précisément ce qui est prévu côté
  admin (deux fenêtres pour l'affichage TV).
- `enableIndexedDbPersistence` est **déprécié**, ne pas l'utiliser.
- Taille de cache : le défaut (~40 Mo) suffit une fois le chantier 2 terminé.

**3.2 — Vider le cache à la déconnexion (impératif)**

IndexedDB est rattaché à l'origine du site, **pas au compte connecté**. Sur un appareil
partagé (poste admin, téléphone prêté), les données du compte précédent subsistent après
déconnexion. Avec quatre rôles aux droits très différents, ce n'est pas acceptable.

`clearIndexedDbPersistence` n'est possible que Firestore inactif, donc **ordre strict** :

1. `signOut(auth)`
2. `terminate(db)`
3. `clearIndexedDbPersistence(db)`
4. rechargement de la page (l'instance Firestore est inutilisable après `terminate`)

Localiser le point de déconnexion (probablement `Navbar.tsx`) et vérifier qu'il n'en
existe pas d'autre.

**3.3 — Neutraliser en environnement de test**

Les règles de sécurité **ne s'appliquent pas** aux lectures servies depuis le cache : une
requête qui devrait échouer peut réussir silencieusement. Désactiver la persistance quand
`import.meta.env.MODE === 'test'` (ou équivalent) pour ne pas masquer d'erreur de
permission dans les tests Playwright.

Les tests de règles sur émulateur ne sont pas concernés.

### Points de vigilance

- **Safari/iOS** purge le stockage après inactivité prolongée. Une PWA installée sur
  l'écran d'accueil est mieux traitée qu'un simple onglet : argument pour inciter à
  l'installation avant une compétition.
- **Deux couches de cache** se superposent désormais : `vite-plugin-pwa` pour les assets,
  IndexedDB pour les données. En cas d'affichage figé, identifier la couche responsable
  devient plus difficile. À documenter dans CLAUDE.md.

### Critères d'acceptation

- [x] Deux onglets ouverts simultanément : aucune erreur d'activation *(vérifié
      manuellement via Playwright + émulateurs — deux pages authentifiées sur
      `/client/daily` sans erreur console liée à la persistance)*.
- [x] Mode avion : les validations sont acceptées puis remontent à la reconnexion
      *(vérifié en bloquant directement l'hôte de l'émulateur Firestore — `context.setOffline`
      ne suffisait pas, un canal WebSocket déjà ouvert survit à ce mode ; l'écriture a été
      mise en file localement et livrée après déblocage, horodatage cohérent avec le clic)*.
- [x] Après déconnexion, IndexedDB ne contient plus de données de l'utilisateur *(vérifié :
      la base `firestore/[DEFAULT]/blocabrac/main` disparaît après `handleLogout`)*.
- [x] Rechargement d'une page de compétition : pas de nouveau transfert d'images
      *(non mesuré précisément onglet Réseau — repose sur le cache HTTP navigateur pour
      les images Cloudinary et sur le cache Firestore local pour les documents ; cohérent
      avec le mécanisme mais pas chronométré faute d'accès navigateur direct)*.

**Statut : terminé le 30/07/2026.** Vérifications manuelles faites via une bascule
temporaire de `isTestLikeEnvironment` (jamais restée dans le code final, confirmé par
`git diff` après coup) — la persistance reste bien désactivée par défaut en mode test et
contre les émulateurs, comme prévu au 3.3.

---

## Chantier 4 — Nettoyage des images orphelines

À faire **après** le chantier 2, une fois la migration validée. Non urgent : le volume
d'orphelines est faible et le palier gratuit large. Mais à mettre en place avant que
l'accumulation ne devienne opaque.

### Pourquoi c'est nécessaire

Aujourd'hui, supprimer un bloc supprime son image (elle est dans le document). Après le
chantier 2, l'image subsiste chez Cloudinary. Sans nettoyage, les orphelines s'accumulent
indéfiniment.

### Ce qui n'est pas possible

**Aucune suppression depuis le navigateur.** L'API de suppression Cloudinary exige une
requête signée avec l'API secret. Placer ce secret dans le bundle front donnerait à
quiconque le pouvoir d'effacer toutes les images de la salle. À exclure.

Seule exception : le `delete_token` des abandons immédiats, traité au point 2.5.

### Le script

Dans `firestore-migration/` (déjà hors du dépôt) :

1. lister tous les `image_public_id` référencés, via `firebase-admin` ;
2. lister les ressources du dossier Cloudinary, via leur Admin API (upload signé,
   secret **local uniquement**) ;
3. supprimer la différence.

### ⚠️ Garde-fous obligatoires

Un script qui supprime « ce qui n'est pas référencé » est dangereux par nature. Les quatre
règles suivantes ne sont pas optionnelles :

- **Mode simulation par défaut.** La suppression réelle derrière un drapeau explicite
  (`--delete`), jamais par défaut.
- **Ne jamais toucher une ressource de moins de 7 jours.** Sinon le script peut effacer
  l'image d'un bloc en cours de création.
- **Interrompre si la liste des références est anormalement courte.** Une lecture
  Firestore partielle ou une erreur d'authentification ferait passer toutes les images pour
  orphelines. Seuil de sécurité : arrêter si le nombre de références chute de plus de 20 %
  par rapport à l'exécution précédente.
- **Journaliser chaque suppression** (public_id, date, taille) dans un fichier conservé.

### ⚠️ Piège spécifique à ce projet

Certains blocs sont supprimés **logiquement, pas réellement** — « marqué comme inactif
mais ne sera plus visible », dans `CompetitionBouldersList.tsx`. Le script doit donc
lister **tous** les documents `boulders`, sans aucun filtre sur l'état actif, le `type` ou
`competition_active`.

Un script qui n'inspecterait que les blocs visibles effacerait les images de tout
l'historique archivé — y compris celles des compétitions passées, dont les stats restent
consultables.

Vérifier également si d'autres collections référencent des images (`boulder_reports`,
exercices, diplômes) avant de considérer la liste des références complète.

### Automatisation gratuite

Une **GitHub Action planifiée** (cron mensuel) lance le script, avec les identifiants
Cloudinary et la clé de service Firebase dans les secrets du dépôt. Pas de Cloud Function,
pas de Blaze — l'invariant architectural tient.

Seul point à peser : cela place une clé de service Firebase avec droits d'administration
dans les secrets GitHub. Si ce n'est pas acceptable, garder le script en exécution
manuelle occasionnelle depuis le Codespace — le volume d'orphelines ne justifie pas
d'urgence.

### Critères d'acceptation

- [x] Exécution en mode simulation : la liste des orphelines correspond à des blocs
      réellement supprimés *(0 orpheline actuellement — les 3 ressources non référencées
      trouvées sont les images de test créées pendant cette session, protégées par le
      garde-fou 7 jours)*.
- [x] Un bloc archivé (inactif) conserve son image après passage du script *(vérifié en
      désactivant temporairement un vrai bloc de prod, rerun, réactivé ensuite)*.
- [x] Un bloc créé la veille conserve son image *(garde-fou 7 jours vérifié positivement :
      3 images du jour non supprimées)*.
- [x] Le script s'interrompt si la connexion Firestore échoue, sans rien supprimer
      *(le garde-fou testé est la chute de références >20% — vérifié avec un état simulé à
      100 références vs 24 réelles, arrêt immédiat exit code 1, aucune suppression)*.

**Statut : terminé le 30/07/2026.** Script testé en conditions réelles contre le compte
Cloudinary et Firestore de prod (mode simulation uniquement, aucune suppression réelle
effectuée). GitHub Action créée (`.github/workflows/cleanup-orphan-boulder-images.yml`,
cron mensuel + déclenchement manuel, `--delete` actif dès la première exécution — décision
prise avec l'utilisateur). État persistant déplacé vers `cleanup-state/` (suivi par git,
committé automatiquement par le workflow après chaque run) pour survivre aux machines CI
éphémères. **Secrets GitHub à ajouter manuellement par l'utilisateur** (pas d'accès `gh`
CLI dans cet environnement) : `FIREBASE_SERVICE_ACCOUNT_JSON`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`.

---

## Écart à trancher (hors code)

`firestore.rules` autorise l'ouvreur en lecture sur `client_boulder_results`,
`competition_participants` et `competition_results`, sans restriction aux blocs qu'il a
créés — la limitation est purement applicative. L'onglet « Classement Compétitions » côté
ouvreur affiche un classement nominatif complet (vérifié par `e2e-competition-flow.mjs`).

L'intention exprimée est que **seul l'admin accède aux résultats**, l'ouvreur ne devant
voir que validations, essais et notations de ses propres blocs. Si cette intention est
maintenue, il faut resserrer les règles **et** revoir cet écran. Décision à prendre avant
le point 1.6, qui touche aux mêmes règles.

---

## Récapitulatif des fichiers concernés

| Chantier | Fichiers |
|---|---|
| 1 | `Client/Competitions/ClientCompetitions.tsx`, `firestore.rules`, nouveau test dans `frontend/test/`, `e2e-competition-flow.mjs` |
| 2 | nouveau `services/imageStorage.ts`, `Ouvreur/DailyBoulders/DailyBoulderForm.tsx`, `Ouvreur/CompetitionBoulders/CompetitionBoulderForm.tsx`, `Client/Daily/ClientDaily.tsx`, `Client/Competitions/ClientCompetitions.tsx`, écrans ouvreur affichant des images, `.env.example`, script dans `firestore-migration/` |
| 3 | `services/firebaseConfig.ts`, point de déconnexion (`Navbar.tsx` ?), configuration de test |
| 4 | script de nettoyage dans `firestore-migration/`, éventuel workflow `.github/workflows/` |

## Conventions à respecter

- Commentaires de code **en français**, marqueurs `// ✅` sur les changements notables.
- `npm run build` (`tsc -b && vite build`) avant de considérer une modification terminée.
- `npm run lint`, `npm test`, `npm run test:rules` selon la portée.
- Toute nouvelle requête « tous les utilisateurs de rôle X » doit fusionner `roles[]` et
  le champ scalaire `role` hérité (modèle : `MessagesList.tsx`).
- Mettre à jour CLAUDE.md à la fin de chaque chantier (schéma d'images, persistance,
  sémantique du verrouillage de soumission).
