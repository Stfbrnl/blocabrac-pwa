# Conception — Sélecteur live, marge réelle de lectures, compteur incrémental `ClientDaily`

> Note rédigée le 16/08/2026 par la session Claude (navigateur), après lecture de
> `HANDOFF-ecran-live-tv-2026-08-15.md` (V2.29→V2.32) et
> `HANDOFF-scoring-modes-2026-08-15.md` (V2.33).
> À destination de Claude Code dans le Codespace.
>
> **Trois chantiers de nature et d'urgence différentes**, à ne pas traiter ensemble :
>
> | § | Chantier | Effort | Quand |
> |---|---|---|---|
> | §1 | Sélecteur live → paramètre d'URL | ~1 h | Avant la compétition — **FAIT 16/08/2026** |
> | §2 | Ligne de base de lectures quotidiennes | 0 (relevé) | Sur plusieurs jours, dès maintenant — **toujours ouvert, relevé manuel** |
> | §3 | Compteur incrémental `ClientDaily` | Chantier | Pas d'urgence en soi — **FAIT 16/08/2026 sur décision explicite de l'utilisateur**, malgré la recommandation de ne pas précipiter |
>
> Rien ici ne remet en cause le go de l'écran live : le chiffrage de 28 010 lectures
> (56 % du plafond) est solide et sous le critère de sortie.

---

## §1 — Le sélecteur de compétition : le supprimer plutôt que le protéger (FAIT — 16/08/2026)

✅ **Fait le 16/08/2026 par Claude Code (Codespace), option retenue.** Route devenue
`/admin/competitions/live-display/:competitionId`, sélecteur interne supprimé de
`AdminCompetitionLiveDisplay.tsx` (remplacé par un `getDoc` unique sur l'identifiant
d'URL, un seul message explicite pour les 3 cas d'échec : doc absent, `status !=
'en cours'`, `liveDisplayEnabled != true` — aucun n'a besoin d'un message distinct,
aucun des trois ne doit rien afficher). Bouton "Ouvrir l'affichage TV"
(`AdminCompetitionManagement.tsx`) passe désormais l'identifiant dans le chemin plutôt
qu'en requête. `Navbar.tsx` adapté (préfixe plutôt qu'égalité stricte, le chemin exact
varie maintenant par compétition). Repère de version et Wake Lock inchangés. Vérifié :
`npm run build`/`lint`/`test` (70 tests, aucun changement de `firestore.rules` donc pas
de `test:rules` à relancer).

### Constat

`LiveCompetitionView` est remontée via `key={competition.id}` au changement de
compétition. Chaque changement rétablit les deux `onSnapshot` et **repaie les 3 240
documents du snapshot initial** (3 150 résultats + 90 participations).

Le budget mesuré prévoit 3 remontages. Un admin qui ouvre le sélecteur pour vérifier
quelque chose, revient, hésite, en consomme autant en quelques secondes : **cinq
allers-retours ajoutent plus de 16 000 lectures** et font franchir le plafond.

Rien dans l'interface ne suggère qu'un simple changement de sélection coûte quoi que ce
soit. C'est le geste le plus cher de l'application, déguisé en clic anodin.

Le cas est peu probable tant qu'une seule compétition est en cours — ce qui sera l'usage
normal. Mais le coût d'une parade est très inférieur au coût de l'incident.

### Correctif retenu : la compétition en paramètre d'URL

Passer de `/admin/competitions/live-display` (compétition en état d'écran) à
`/admin/competitions/live-display/:competitionId`.

- L'admin choisit la compétition **depuis `AdminCompetitionManagement.tsx`**, où le bouton
  « Ouvrir l'affichage TV » existe déjà — il passe simplement l'identifiant dans l'URL.
- La fenêtre s'ouvre directement sur la bonne compétition. **Plus de sélecteur sur l'écran
  TV**, ce qui est de toute façon cohérent avec un écran sans interaction (§4 de
  `CONCEPTION-ecran-live-competition.md`).
- Changer de compétition redevient ce que c'est réellement : ouvrir une autre fenêtre. Le
  geste coûteux redevient visiblement coûteux.

Bénéfice annexe : l'URL devient partageable et rejouable à l'identique. Un rechargement
accidentel revient sur la même compétition au lieu de retomber sur un sélecteur vide.

### Points à traiter

- **Validation de l'identifiant** : compétition inexistante, `status != 'en cours'`, ou
  `liveDisplayEnabled == false` → afficher un message explicite, pas un écran vide ni un
  crash. Réutiliser le message déjà écrit à V2.31 (« aucune compétition en diffusion »).
- **Conserver le repère de version** en coin d'écran (V2.31) : c'est le seul moyen de
  repérer un affichage servi par un service worker périmé.
- **Ne pas casser le Wake Lock** ni le masquage de la `Navbar` sur cette route.
- Vérifier qu'aucun autre point d'entrée ne mène à l'ancienne route sans paramètre.

### Si le sélecteur doit être conservé malgré tout

Alternative de repli, si la navigation par URL pose un problème que je ne vois pas : une
confirmation explicite lorsqu'une compétition est **déjà affichée** (« changer de
compétition rechargera l'intégralité des résultats »). Moins propre, mais suffisant.

Dans tous les cas, **ajouter la consigne aux notes du jour J**, à côté de « ne pas
déployer pendant l'événement ».

### Détail relevé au passage

Dans le tableau de mesure de `HANDOFF-ecran-live-tv`, le coût des remontages
(3 240 × 2 = 6 480) semble **appliqué par calcul** plutôt que mesuré, contrairement au
reste du tableau qui est empirique.

C'est dans le sens conservateur, donc sans risque. Mais si le cache IndexedDB permettait
en réalité une reprise partielle du snapshot, le total serait plus favorable qu'affiché.
Sans importance pour la décision — à ne pas re-mesurer sauf curiosité.

---

## §2 — La marge réelle : établir une ligne de base (aucun développement)

### Le chiffre manquant

**Les 56 % du plafond ne laissent pas 44 % de marge.** Les 28 010 lectures mesurées
couvrent la compétition seule. Le plafond de 50 000 est **journalier et partagé** avec :

- les grimpeurs non participants qui utilisent l'application le même jour ;
- `ClientDaily`, qui lit tout l'historique de chaque compte à son premier montage (§3) ;
- les écrans staff (moniteur, ouvreur, admin), dont plusieurs font encore un
  `getDocs(collection(db,'users'))` non filtré.

La marge réelle est donc de 22 000 lectures **moins la journée ordinaire**, dont personne
ne connaît le volume.

### Ce qu'il faut faire

Relever la consommation quotidienne dans la console Firebase (Firestore → Usage) **sur
plusieurs jours consécutifs**, en distinguant si possible un jour creux d'un jour de forte
fréquentation.

Consigner le résultat en tête de `PLAN-spark-images-competition.md`, à côté des autres
mesures.

Cette ligne de base sert deux fois :

1. **Avant la compétition** : elle dit si les 22 000 lectures restantes sont réellement
   disponibles.
2. **Dans la durée** : sa dérive mesure directement l'effet du problème traité au §3, à
   mesure que les comptes vieillissent.

### Conséquence sur le jour J

Le critère de sortie de 30 000 lectures était calibré **sur la compétition seule**, et il
est tenu de justesse (28 010, soit 93 % du seuil). Une hausse de 6 % suffirait à le
franchir.

Ça ne remet pas le go en cause, mais ça déplace le geste critique du code vers
l'exploitation : **le relevé des compteurs à mi-parcours n'est plus une précaution
facultative**, c'est la seule chose qui indiquera où on en est pendant l'épreuve.

---

## §3 — `ClientDaily` : le compteur incrémental (FAIT — 16/08/2026)

✅ **Fait le 16/08/2026 par Claude Code (Codespace), sur demande explicite de
l'utilisateur** ("je pense qu'il faut le faire malgré tout" — décision assumée de ne
pas attendre malgré la recommandation "pas d'urgence" ci-dessous, toujours valable
pour justifier le choix mais plus pour le calendrier).

**Écart au plan proposé, à noter** : l'ordre de réalisation en 5 étapes ci-dessous
(double écriture parallèle → script de réconciliation en simulation → migration →
bascule de lecture → retrait de la double écriture) a été **condensé** plutôt que suivi
à la lettre — l'échelle réelle du projet (une salle, 12 comptes, 1 avec des
validations) rendait une bascule directe raisonnable à vérifier plutôt qu'un
déploiement en plusieurs phases espacées dans le temps. Fait à la place :
`utils/classementScore.ts` gagne `summaryFromColorCounts`/`scoreDeltaForValidation`
(testés isolément, 15 tests dont 4 rejouent des séquences ajout/modification/retrait
comparées au recalcul complet — voir `classementScore.test.ts`) ;
`ClientDaily.tsx` bascule directement sur le nouveau chemin (plus d'ancien mode de
calcul en parallèle) ; `scripts/reconcile-classement-profiles.js` sert à la fois de
migration ET de garde-fou de réconciliation permanent (même script, deux usages —
voir CLAUDE.md, section `classement_profiles`).

**Découverte en testant le script contre la prod, sans rapport avec ce chantier** :
`classement_profiles` était **entièrement vide** (0 document pour 12 comptes), y
compris pour le seul compte ayant de vraies validations (7 blocs,
`client_boulder_results` remonte à juin 2026). Tous les comptes existants ont été
créés avant l'introduction de ce document mirroir et jamais rétro-remplis depuis.
Le script (`--fix`, lancé une fois sur ce constat, confirmé par l'utilisateur) a
créé le document manquant pour ce compte (score=1230, 7 blocs, bestColorRank=4) ;
relancé en simulation ensuite, 0 écart. Les 11 autres comptes n'ont aucune
validation à refléter — rien à corriger pour eux, `classementOptIn` reste de toute
façon leur propre responsabilité (Register.tsx/ClientProfile.tsx/AdminUsers.tsx),
ce script n'y touche jamais.

**Ce qui n'a volontairement PAS été fait** : le badge system de `ClientStats.tsx`
n'a pas été branché sur `colorCounts` (mentionné dans la conception comme bénéfice
annexe, pas comme partie de ce chantier) — reste une piste ouverte si son propre
calcul s'avère coûteux un jour.

Vérifié : `npm run build`/`lint`/`test` (81 tests, dont 15 dans
`classementScore.test.ts`) / `npm run test:rules` (74 tests, dont 3 nouveaux sur le
garde-fou de lecture ajouté à `client_boulder_results`).

**Suite V2.36 (même jour) — automatisation, testée en conditions réelles** :
`.github/workflows/reconcile-classement-profiles.yml` (cron mensuel + `workflow_dispatch`,
même patron que `cleanup-orphan-boulder-images.yml`), `--fix` appliqué sans intervention
sur décision explicite de l'utilisateur (une dérive de compteur incrémental est
corrective par construction, contrairement à une suppression d'image potentiellement
destructive — pas de garde-fou anti-chute équivalent nécessaire). Réutilise le secret
`FIREBASE_SERVICE_ACCOUNT_JSON` déjà configuré, aucun nouveau secret. Déclenché
manuellement par l'utilisateur depuis l'onglet Actions le 16/08/2026 : **passé
entièrement au vert**, aucun commit du bot (attendu — le seul écart réel avait déjà été
corrigé manuellement juste avant, rien à trouver sur ce run). Confirme que le workflow
est opérationnel de bout en bout, pas seulement écrit.

### Le fond du problème (contexte d'origine, toujours valable)

**Le seul poste de tout le projet qui se dégrade par le simple passage du temps.**

Pas d'urgence en soi — rien ne l'exigeait avant la compétition, et c'était un chantier
avec migration et réconciliation, la recommandation ci-dessous restait de ne pas le
précipiter. Fait quand même sur décision explicite de l'utilisateur (voir plus haut).

`classement_profiles` était **recalculé** depuis l'historique complet à chaque mise à jour,
alors qu'il pourrait être **maintenu**.

Une validation est un événement ponctuel : elle devrait modifier le résumé, pas déclencher
sa reconstruction. Aujourd'hui, un compte de deux ans lit des milliers de documents au
premier montage de la page quotidienne, et ce volume ne cesse de croître.

Rappel de l'historique (V2.26) : le bornage saisonnier a été **vérifié puis écarté** — le
classement est cumulatif à vie, borner la requête fausserait `score`/`bouldersValidated` à
la baisse. Le cache-first a réduit la fréquence (les remontages sur le même appareil sont
gratuits) mais **pas le volume du premier chargement**. C'est ce volume qu'il faut traiter.

### L'obstacle identifié, et pourquoi il est plus étroit qu'il n'y paraît

`bestColorRank` ne se décompose pas en delta lors d'une **suppression** de validation.

Mais **à l'ajout**, il se décompose trivialement : `max(ancien, nouveau)`. Le problème
n'existe donc qu'au retrait d'une validation — cas rare et très minoritaire.

### Solution en deux temps

**Étape A — asymétrie ajout/retrait** (résout 95 % du volume, faible risque)

- **Ajout d'une validation** : mise à jour incrémentale du profil. Pas de lecture de
  l'historique.
- **Retrait d'une validation** : recalcul complet, comme aujourd'hui.

Le cas difficile n'est pas résolu, il est **contourné** — et il est assez rare pour que son
coût reste négligeable.

**Étape B — compteur par couleur** (fait disparaître le cas difficile)

Stocker dans `classement_profiles` un **compteur par couleur** (`{ jaune: 12, vert: 8,
bleu: 3, ... }`) plutôt que le seul `bestColorRank`.

Retirer une validation devient alors : décrémenter le compteur de sa couleur, puis relire
le maximum des couleurs à compteur non nul. **Plus aucun recalcul complet nécessaire**, et
le cas difficile disparaît entièrement.

Ce compteur a une valeur en soi au-delà du quota : il alimente directement le système de
badges de `ClientStats.tsx`, qui a précisément besoin de savoir combien de blocs de chaque
couleur un grimpeur a validés.

### Réconciliation : le filet qui rend l'incrémental sûr

**Non optionnel.** Tout compteur incrémental dérive un jour — écriture perdue, bug
transitoire, correction manuelle en base, migration incomplète. Sans mécanisme de
correction, la dérive est silencieuse et définitive.

Script dans `scripts/` (suivi par git — leçon de la GitHub Action ratée), qui recompute les
profils depuis `client_boulder_results` et corrige les écarts :

- **Mode simulation par défaut**, `--fix` pour appliquer.
- **Journaliser chaque écart détecté** (uid, champ, valeur calculée vs stockée) : c'est ce
  journal qui révélera un bug d'incrémentation, bien plus sûrement qu'un test.
- Traiter les comptes par lots, avec reprise après interruption.
- Réutiliser le patron de credentials de `cleanup-orphan-boulder-images.js`
  (`FIREBASE_SERVICE_ACCOUNT_JSON` en priorité, repli fichier local).

Automatisable via la **GitHub Action mensuelle existante**, en même temps que le nettoyage
des images. Attention au coût : recomputer tous les profils lit l'intégralité de
`client_boulder_results`. Sur un cron mensuel c'est absorbable, mais à surveiller quand le
volume grandira — envisager un échantillonnage (un dixième des comptes par mois) plutôt
qu'un passage complet.

### Ordre de réalisation

1. **Ajouter le compteur par couleur** au schéma de `classement_profiles`, alimenté en
   parallèle du calcul actuel (double écriture, aucun changement de comportement).
2. **Script de réconciliation**, lancé en simulation : il vérifie que le nouveau compteur
   est cohérent avec l'historique **avant** qu'on ne s'appuie dessus.
3. **Migration** : peupler le compteur sur les profils existants (`scripts/`, dry-run par
   défaut).
4. **Basculer la lecture** sur le compteur, supprimer le `getDocs` de l'historique complet.
5. **Retirer la double écriture** une fois la réconciliation stable sur plusieurs passages.

Les étapes 1 à 3 sont sans risque : rien ne dépend encore du nouveau champ. Le point de
non-retour est l'étape 4.

### Bénéfice attendu

- Le premier chargement de la page quotidienne devient **constant**, quelle que soit
  l'ancienneté du compte — aujourd'hui il est proportionnel à l'historique.
- Gain de perception : la page ne ralentit plus avec les années.
- **C'est ce qui rend le modèle viable pour d'autres salles**, où le nombre d'adhérents et
  l'ancienneté des comptes ne seront pas maîtrisés. À rattacher à la décision « un projet
  Firebase par salle », encore ouverte.

### Vérification

- `e2e-daily-flow.mjs` doit continuer à passer sans modification de son intention (le
  classement reste juste après validation et après notation).
- Ajouter un test sur le **retrait** d'une validation — c'est le chemin le moins parcouru et
  le plus susceptible de dériver.
- Comparer le profil produit par la voie incrémentale et par le recalcul complet sur un
  compte réel, avant l'étape 4.

---

## Points ouverts inchangés

- **Étape 8 du §8 de la conception live** : répétition matérielle à froid (PC + HDMI + TV,
  mode étendu, overscan, veille désactivée). Une fois avant le jour J, pas le soir même.
- **Concurrence à 90 utilisateurs simultanés** : jamais testée. Toutes les mesures portent
  sur un grimpeur seul rejoué en boucle. Une répétition à 10-15 personnes sur une vingtaine
  de blocs reste ce qui renseignerait le plus.
- **Plan de repli si un quota saute** : aucune dégradation gracieuse conçue. À décider à
  froid.
- **Un projet Firebase par salle vs mutualisé** — à trancher avant tout développement
  multi-salles. Le §3 ci-dessus en est un prérequis de fait.
- **Stockage durable des sauvegardes d'images** (`--backup`).
- ~~Mode officiel IFSC/FFME (tops/zones)~~ — **fait le 16/08/2026** (version simplifiée
  sur totaux cumulés, décisions validées avec l'utilisateur), voir CLAUDE.md
  "Competition scoring modes".
- **Correction admin des résultats après verrouillage** — autorisée par les règles, aucune
  interface ne l'exerce.

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout script destiné à la CI doit vivre dans un chemin **suivi par git**.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
