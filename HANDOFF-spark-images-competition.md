# Handoff — Plan Spark (images + compétition) : état au 30/07/2026 (mis à jour 14/08/2026)

> Rédigé par Claude Code (CLI) à destination d'une session Claude Opus dans le
> navigateur, pour reprendre le contexte sans avoir à relire toute la conversation
> précédente. Le document de travail original est `PLAN-spark-images-competition.md`
> à la racine du dépôt — il contient le détail chantier par chantier, les mesures et
> les critères d'acceptation cochés. Ce fichier-ci résume plutôt **les décisions prises
> en cours de route** et **ce qui reste à faire**, en particulier ce qui nécessite un
> vrai navigateur (que je n'ai pas dans ce Codespace).

## Mise à jour du 14/08/2026 — réponse aux 3 points de `SUIVI-post-chantiers-spark.md`

Une session Claude navigateur avait relu ce handoff une fois "tous chantiers clos" et
relevé 3 points (fichier `SUIVI-post-chantiers-spark.md` à la racine, toujours présent
pour le détail complet). Les trois sont **traités** en Codespace le 14/08/2026 :

- **Point 1 (pas de backup images)** : `scripts/cleanup-orphan-boulder-images.js` a
  maintenant un mode `--backup <dossier>` — télécharge les images actuellement
  référencées, idempotent, écrit un manifeste `public_id → boulder_id → nom de fichier`.
  Testé en conditions réelles sur les 25 blocs de prod (25 téléchargées, relance → 25
  déjà présentes, 0 retéléchargée). **Décision utilisateur : usage manuel occasionnel**,
  pas d'automatisation CI pour l'instant — où stocker l'archive durablement reste ouvert,
  à trancher au passage multi-salles.
- **Point 2 (garde-fou 20% mal calibré)** : contexte donné par l'utilisateur — la salle
  compte 10 murs à 15 blocs, donc 150 blocs à pleine capacité (25 aujourd'hui, montée en
  charge). Le garde-fou est passé à un seuil **hybride** : il ne se déclenche que si la
  chute dépasse **20% ET 20 références absolues** (`DROP_GUARD_ABSOLUTE_MIN_DROP` dans le
  script), plus un drapeau `--force`/`--accept-drop` pour contourner explicitement sans
  éditer `cleanup-state/state.json` à la main. Testé : une chute de 15 (retrait d'un mur)
  passe sans intervention, une chute de 75 s'arrête et exige `--force`. Le cas "pas de
  `state.json`" (premier run/fichier perdu) est maintenant signalé explicitement au lieu
  de passer silencieusement — c'était un vrai défaut, confirmé dans le code avant
  correction.
- **Point 3 (remesurer le gain)** : refait via un script (`firestore-migration/measure-boulder-images-v2.js`,
  ponctuel, pas commité comme le reste de `firestore-migration/`) plutôt qu'un vrai
  onglet Réseau navigateur (toujours indisponible en Codespace). Résultat consigné en
  tête de `PLAN-spark-images-competition.md` : **gain de ×2,9 au premier chargement**
  (30,2 Ko/bloc doc+thumb contre 88 Ko en base64 le 30/07), **pas** le facteur 5-10
  espéré — celui-ci se vérifie au **rechargement** grâce au cache HTTP Cloudinary
  (`Cache-Control max-age=2592000`, 30 jours), confirmé mais pas chronométré précisément
  (toujours le point non mesuré du Chantier 3 ci-dessous, si tu as l'occasion). `f_auto`
  sert bien du WebP (24/25 images) — mais seulement vérifié en simulant un en-tête
  `Accept` de navigateur moderne : un `fetch()` Node nu ne déclare pas ce support et
  reçoit du JPEG par défaut, piège à connaître si tu relances une mesure similaire.
  Dimensionnement compétition 90/35 sur cette base : ≈95 Mo, largement sous le quota.

Commit `778aea2` (rebasé en `3ff046a` après un commit automatique de la GitHub Action
entre-temps) sur `main`, poussé.

## Où on en est

Les 4 chantiers du plan sont **terminés, commités et déployés en production**
(`blocabrac.web.app`, hosting + `firestore.rules`). Commits `783e5f5` → `aedb524` sur
`main` (V2.18 à V2.24 + deux commits de documentation). **Tout est maintenant clos, y
compris les deux points qui étaient encore ouverts lors de la première version de ce
document** (Passe B et validation réelle de la GitHub Action) :

- **Passe B exécutée** (voir Chantier 2 ci-dessous) : plus aucun bloc n'a de base64
  résiduel en prod.
- **La GitHub Action de nettoyage a réellement tourné avec succès** — mais pas du premier
  coup : son premier déclenchement manuel a révélé un vrai bug (voir Chantier 4), corrigé
  et vérifié par un second run réussi. **Elle est maintenant 100 % automatique, aucune
  action manuelle requise à l'avenir** — voir la fin du Chantier 4 pour le détail.

Il ne reste plus de point d'action bloquant pour une session navigateur. Le point encore
ouvert ci-dessous (mesure réseau précise du cache, Chantier 3) est un simple "si tu as
l'occasion", pas un blocage.

## Chantier 1 — Résultats de compétition écrits au fil de l'eau

- `ClientCompetitions.tsx` écrit chaque validation immédiatement dans
  `competition_results` (`setDoc(..., {merge:true})`), pas seulement en état React.
  Réussi/Échoué écrit **immédiatement** ; essais/note/cotation proposée sont
  **debounced ~800ms**.
- À l'ouverture de la modale de validation, les résultats existants sont rechargés
  depuis Firestore (`loadExistingResults`) — c'est ce qui rend un rechargement de page
  sans perte possible, pas seulement le debounce.
- "Soumettre les résultats" est devenu **un verrouillage** (`handleLockResults`) : un
  seul `writeBatch` pose `submitted: true` + `submitted_at`. `firestore.rules` refuse
  ensuite toute modification du propriétaire sur un document `submitted: true`.
- **Décision prise avec l'utilisateur** : les droits de l'ouvreur sur
  `competition_results`/`competition_participants` restent **inchangés** (accès complet,
  comme l'admin). Le plan notait un écart entre l'intention ("l'ouvreur ne devrait voir
  que ses propres blocs") et l'implémentation actuelle — l'utilisateur a choisi de
  **garder le statu quo**, pas de resserrement des règles ni de refonte de l'écran
  "Classement Compétitions" ouvreur.
- Vérifié via 5 tests de règles (`frontend/test/competition-results-lock.test.ts`) et le
  scénario Playwright complet (`e2e-competition-flow.mjs`, 15/15 étapes, y compris la
  reprise après rechargement et le verrouillage).

## Chantier 2 — Images de blocs hors Firestore (Cloudinary)

- **Compte Cloudinary créé par l'utilisateur** pendant la session : cloud name
  `hhqwqj48`, upload preset non signé `blocabrac_boulders_unsigned` (dossier
  `blocabrac/boulders`, Signing Mode = Unsigned). Ces deux valeurs sont dans
  `frontend/.env` (suivi par git — voir plus bas pourquoi ce n'est pas un problème) et
  documentées dans `frontend/.env.example`.
- **Seul fichier qui parle à Cloudinary** : `frontend/src/services/imageStorage.ts`
  (`uploadBoulderImage`, `getBoulderImageUrl`, `deleteUnconfirmedUpload`). Aucun autre
  fichier ne doit importer Cloudinary directement.
- **Décision d'architecture prise en cours de route** (conflit découvert en
  implémentant, pas anticipé par le plan) : le plan voulait lancer l'upload **dès la
  sélection du fichier** pour masquer la latence pendant l'annotation. Mais les cercles
  jaunes/verts (prises de départ/fin) sont **incrustés dans le raster de l'image** au
  moment de l'enregistrement (`canvas.toDataURL()`), pas affichés en surcouche à la
  lecture — l'image finale n'existe donc qu'une fois l'annotation terminée. **Choix
  retenu avec l'utilisateur : upload simple au clic sur "Créer le bloc"** (spinner
  `isUploading` existant, 1-3s d'attente à l'enregistrement plutôt que masquée). Pas
  d'upload en deux temps (brouillon + final).
- Repli `image_public_id → image_base64 → logo` codé sur les 6 écrans qui affichent
  vraiment une image de bloc (recensement vérifié par grep, pas seulement supposé) :
  `ClientDaily.tsx`, `ClientCompetitions.tsx`, `ClientCourseSession.tsx`,
  `DailyBoulderForm.tsx`, `CompetitionBoulderForm.tsx`. (`CompetitionBouldersList.tsx`
  déclare le champ mais n'affiche aucune image — rien à faire là.)
- **`frontend/.env` est suivi par git dans ce dépôt** (config Firebase web déjà présente
  avant cette session) — ce n'est pas une fuite de secret : une clé API Firebase web est
  faite pour être publique (protégée par les restrictions de référents + les règles
  Firestore), et un preset Cloudinary non signé est conçu pour être exposé côté client
  par nature. Rien de secret n'a été ajouté à ce fichier.
- **Migration Passe A exécutée en prod** (`firestore-migration/migrate-boulder-images-to-cloudinary.js`,
  sans flag) : 24/24 blocs migrés, 0 échec, base64 conservé en repli au départ.
- **✅ Passe B exécutée le 30/07/2026, après vérification visuelle en prod par
  l'utilisateur** (accès direct à toutes les images, création d'un nouveau bloc pour
  tester). 24/24 blocs nettoyés du champ `image_base64` résiduel, 0 échec. Prod compte
  aujourd'hui 25 blocs : les 24 migrés (base64 supprimé, `image_public_id` seul) + 1 créé
  directement par l'utilisateur via le nouveau flux Cloudinary (jamais eu de base64) —
  ce 25e bloc est la meilleure preuve que la création fonctionne bien de bout en bout en
  prod.
- **Correctif additionnel appliqué après coup** (V2.22) : l'aperçu d'annotation (Ouvreur,
  mode édition d'un bloc existant) chargeait l'image Cloudinary dans un `<canvas>` sans
  `crossOrigin="anonymous"`, ce qui "tainte" silencieusement le canvas côté navigateur.
  Sans effet visible avant la correction (rien n'exportait ce canvas précis en édition
  sans nouvelle photo), mais une future fonctionnalité qui l'aurait fait
  (`toDataURL`/`toBlob`/`getImageData`) aurait levé une `SecurityError`. Corrigé sur les
  deux formulaires, vérifié via Playwright + émulateurs (`getImageData()` ne lève plus
  d'erreur sur un canvas chargé depuis Cloudinary).

### Le rôle du navigateur ici — mis à jour, plus bloquant

L'utilisateur a fait lui-même la vérification visuelle en prod (accès direct aux
images), donc **ce point n'attend plus rien**. Si tu veux double-vérifier à l'occasion :
un mur de blocs quotidiens (`/client/daily`), un bloc de compétition, et les écrans
ouvreur de création/édition — tout devrait s'afficher normalement depuis Cloudinary, sans
repli base64 possible puisqu'il n'existe plus.

## Chantier 3 — Persistance IndexedDB

- `firebaseConfig.ts` utilise `initializeFirestore` + `persistentLocalCache({tabManager:
  persistentMultipleTabManager()})` au lieu de `getFirestore`. Désactivé (cache mémoire
  simple) quand `MODE === 'test'` **ou** `VITE_USE_EMULATOR === 'true'` — sinon les
  règles de sécurité ne s'appliquent pas aux lectures servies depuis le cache, ce qui
  masquerait une erreur de permission dans les tests Playwright.
- `Navbar.tsx` : la déconnexion (bouton desktop + item du Drawer mobile) passe par
  `handleLogout`, ordre strict imposé par l'API : `signOut` → `terminate(db)` →
  `clearIndexedDbPersistence(db)` → `window.location.reload()`.
- Vérifié manuellement (bascule temporaire du garde-fou de test, jamais restée dans le
  code final — confirmé par `git diff` après coup) : deux onglets simultanés sans erreur
  d'activation ; une écriture avec le canal Firestore coupé est mise en file localement
  puis livrée après reconnexion ; IndexedDB est bien vidé après déconnexion.
- **Non mesuré précisément** : le critère "rechargement d'une page de compétition = pas
  de nouveau transfert d'images" repose sur le cache HTTP navigateur (Cloudinary) + le
  cache Firestore local, mais je n'ai pas pu le chronométrer dans l'onglet Réseau faute
  d'accès navigateur direct. Si tu as l'occasion, un contrôle rapide onglet Réseau
  (vider le cache, ouvrir un mur, recharger, vérifier l'absence de nouvelles requêtes
  d'image) confirmerait ce dernier point.

## Chantier 4 — Nettoyage des images orphelines

- Script **`scripts/cleanup-orphan-boulder-images.js`** (⚠️ pas dans
  `firestore-migration/` — voir pourquoi juste en dessous) : simulation par défaut,
  `--delete` pour une suppression réelle. Garde-fous testés en conditions réelles contre
  Cloudinary/Firestore de prod : jamais une ressource < 7 jours ; arrêt si les
  références chutent de >20% par rapport au run précédent ; un bloc désactivé
  (`is_active: false`) garde son image protégée.
- **GitHub Action créée** (`.github/workflows/cleanup-orphan-boulder-images.yml`, cron
  mensuel le 1er à 3h UTC + déclenchement manuel `workflow_dispatch`) avec **`--delete`
  actif dès la première exécution** — décision explicite de l'utilisateur, pas de
  période de rodage en simulation.

### Épisode "le premier run a échoué" — instructif, à connaître

Le premier déclenchement manuel de l'Action a échoué immédiatement :
`Cannot find module '.../firestore-migration/cleanup-orphan-boulder-images.js'`. Cause :
**tout le dossier `firestore-migration/` est ignoré par git** (`.gitignore`, pour
protéger les fichiers de creds qu'il contient) — le script y avait été écrit à
l'origine, donc il n'avait **jamais été commité**, et `actions/checkout` ne peut
évidemment pas restaurer un fichier qui n'a jamais existé dans le dépôt distant. Un test
local (`node cleanup-orphan-boulder-images.js` depuis le Codespace) ne pouvait pas
détecter ce problème puisque le fichier existait bien localement.

**Correction (V2.23)** : le script a été déplacé vers `scripts/` (suivi normalement par
git). Les identifiants, eux, restent dans `firestore-migration/` pour l'usage local
manuel (jamais commités) ; en CI ils viennent des secrets GitHub. Un second run manuel a
ensuite réussi. Un avertissement de dépréciation Node 20 sur `actions/checkout@v4`/
`actions/setup-node@v4` a aussi été corrigé en passant en v7 (V2.24).

**Leçon générale pour toi** : si un jour un autre script doit être automatisé en CI dans
ce dépôt, vérifie d'abord qu'il ne vit pas dans un chemin ignoré par git
(`firestore-migration/`, `GCloudSDK/`, etc.) — sinon `actions/checkout` ne l'aura tout
simplement pas.

### Automatisation — état final, réponse à "dois-je faire quelque chose ?"

**Non, c'est entièrement automatique désormais.** Le cron tourne seul le 1er de chaque
mois à 3h UTC ; il committe lui-même son fichier d'état (`cleanup-state/state.json`)
après chaque exécution pour se souvenir du nombre de références au run suivant. Le seul
déclenchement manuel qui restera utile à l'avenir, c'est si l'utilisateur veut vérifier
ponctuellement que ça tourne toujours bien, ou en cas de doute après un changement du
schéma `boulders` — sinon, rien à faire.

## Point de sécurité non résolu (à connaître, pas à corriger seul)

Pendant la session, une sélection dans l'éditeur VS Code a fait apparaître la **clé
privée complète du compte de service Firebase** en clair dans la conversation (visible
dans un system-reminder). L'utilisateur a été prévenu et a **explicitement choisi de ne
pas faire tourner cette clé**. Ce n'est pas un TODO — juste un fait à connaître si le
sujet revient.

## Fichiers clés pour se repérer

- `PLAN-spark-images-competition.md` — le plan original, à jour avec mesures et cases
  cochées.
- `CLAUDE.md` — sections "Boulder images", "`competition_results`", "Firestore
  persistent cache" mises à jour avec le detail architectural durable.
- `frontend/src/services/imageStorage.ts` — indirection Cloudinary.
- `scripts/cleanup-orphan-boulder-images.js` — le script de nettoyage, **suivi par
  git** (contrairement à `firestore-migration/`) puisque la GitHub Action doit pouvoir
  le checkout.
- `firestore-migration/` — scripts de migration ponctuels (`migrate-boulder-images-to-cloudinary.js`,
  jamais automatisés) + fichiers d'identifiants (dossier entièrement ignoré par git :
  `serviceAccountKey.json`, `cloudinary-admin-credentials.json`, jamais commités).
- `cleanup-state/` — état du garde-fou de nettoyage (suivi par git, mis à jour
  automatiquement par la GitHub Action après chaque run).
