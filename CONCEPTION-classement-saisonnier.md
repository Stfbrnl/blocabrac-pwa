# Conception — Classement de saison (fenêtre paramétrable) et Finale de l'année

> Rédigé le 16/08/2026, à la demande de l'utilisateur, après une conversation de
> conception (pas encore de code). **Mis à jour le même jour avec les 5 décisions de
> l'utilisateur sur les points ouverts — voir chaque section pour le détail.**
>
> **17/08/2026 — relecture ClaudeNav** (`RELECTURE-classement-saisonnier.md`) a trouvé un
> point bloquant (§1 : la réconciliation de `season.*` s'appuierait sur `createdAt`, un
> champ réécrit à chaque édition, contredisant la section "Ce qui ne change pas"
> ci-dessous). **Voie A retenue** (corriger le bug de date en amont) et **FAITE** le même
> jour dans `ClientDaily.tsx` : `createdAt` est désormais préservé depuis la première
> écriture d'un résultat, jamais réécrit ensuite ; `updatedAt` continue de refléter
> chaque édition. Vérifié : `npm run build`/`lint`/`test` (106 tests). La section
> "Réconciliation étendue" plus bas est donc de nouveau valide telle quelle.
>
> **§2 et §3 tranchés avec l'utilisateur le 17/08/2026** (pas encore codés) :
> - **§2** : marqueur `cloturee: boolean` sur `app_config/classement_saison` — posé par
>   le job de fin de saison à l'archivage, levé par l'admin à la reconfiguration. La
>   réconciliation ignore `season.*` tant qu'il est vrai (voie retenue plutôt qu'une
>   simple comparaison de dates — état explicite, visible côté admin).
> - **§3** : `classementOptIn` s'applique aussi à la qualification pour la Finale — un
>   grimpeur ayant masqué son profil du classement public n'est pas retenu dans le top
>   10/10, même à score qualifiant. Le réglage (`ClientProfile.tsx`) gagne un texte
>   d'aide explicite pour que ce ne soit pas une surprise.
>
> **17/08/2026 — implémentation terminée** (les 10 étapes de "Ordre de réalisation
> proposé" ci-dessous, dans l'ordre). `npm run build`/`lint`/`test` (110 tests) et
> `npm run test:rules` (81 tests) tous verts. Détail par étape :
> 1. `AdminSeasonConfig.tsx` (`/admin/season-config`, lien Navbar "CLASSEMENT DE
>    SAISON") — formulaire debut/fin, pose `cloturee: false` à chaque enregistrement.
> 2. `utils/classementScore.ts` : `isWithinSeasonWindow` (pure, testée) — pas de
>    nouvelle fonction de delta, `scoreDeltaForValidation`/`summaryFromColorCounts`
>    étaient déjà génériques et réutilisables tels quels pour `season.*`.
> 3. `ClientDaily.tsx` : fenêtre lue une fois au montage (ref, pas d'état), delta de
>    saison accumulé en parallèle du delta all-time et écrit dans la même transaction.
>    **Mirroring de `gender` retiré du plan** : déjà fait ailleurs (`Register.tsx`,
>    `ClientProfile.tsx`, `AdminUsers.tsx` écrivent tous `classement_profiles.gender`
>    depuis avant ce chantier) — constaté en lisant le code, rien à ajouter ici.
> 4. `ClientClassement.tsx` : bascule "Classement général"/"Classement de saison"
>    (`ToggleButtonGroup`), zéro lecture Firestore supplémentaire comme prévu.
> 5. `ClientProfile.tsx` : texte d'aide sous le réglage `classementOptIn`.
> 6. `firestore.rules` (+ 5 tests `test:rules`) : `app_config` (lecture authentifiée,
>    écriture admin), `classement_saisons` (lecture authentifiée, écriture fermée
>    même à l'admin — seul le job planifié, Admin SDK, écrit).
> 7. `scripts/compute-classement-saison.js` + `.github/workflows/compute-classement-saison.yml`
>    (cron quotidien 04h00 UTC + `workflow_dispatch`, garde-fous `fin`/`cloturee`,
>    départage à égalité, archive avant reset).
> 8. `scripts/reconcile-classement-profiles.js` étendu : `season.*` recomputé depuis
>    `client_boulder_results.createdAt` (désormais immuable, §1), `gender` comparé à
>    `users.gender` — les deux sautés entièrement si `cloturee == true` (§2).
> 9. `AdminCompetitionManagement.tsx` : bouton "Générer le roster" (visible seulement
>    en mode `officiel`, à côté de "Saisie juge") — lit `classement_saisons` le plus
>    récent, crée les inscriptions manquantes, idempotent.
> 10. CLAUDE.md : nouvelle section "Seasonal classement (`season.*`) and the
>     end-of-season Finale".
>
>> **17/08/2026 — passage e2e fait** (Playwright + émulateurs Firestore/Auth, jamais
> contre la prod), `test/e2e-season-classement-flow.mjs` (nouveau, 14 étapes) +
> `test/seed-season-classement-users.mjs` : config admin de la fenêtre → bouton roster
> sans archive (message explicite) → ouvreur crée un bloc → client voit le texte d'aide
> opt-in, l'active, valide le bloc → `classement_profiles.season` vérifié en base
> (score 50, vert, 1 essai) → bascule "Classement de saison" affiche le score sans
> lecture supplémentaire → `compute-classement-saison.js` exécuté en sous-processus
> contre l'émulateur (fenêtre forcée dans le passé) : archive écrite, `cloturee` posé,
> `season.*` remis à zéro, `score` all-time intact → second run = no-op confirmé →
> `reconcile-classement-profiles.js` confirmé sauter `season.*` tant que `cloturee` →
> bouton "Générer le roster" avec archive : inscription créée, puis idempotence
> confirmée sur un second clic. **14/14 étapes réussies.** `test/e2e-daily-flow.mjs`
> (préexistant) rejoué aussi, sans régression, pour couvrir le changement de
> `createdAt`/`applyClassementDelta` dans `ClientDaily.tsx`.
>
> **Deux bugs réels trouvés et corrigés par ce passage** (aucun des deux n'aurait été
> vu par `build`/`lint`/`test`/`test:rules`) :
> 1. `AdminCompetitionManagement.tsx` interrogeait `classement_saisons` avec
>    `orderBy('__name__', 'desc')` pour trouver l'archive la plus récente — Firestore
>    (émulateur et prod, même limitation) refuse un tri descendant sur la clé du
>    document seule ("Firestore does not support descending key scans"). Corrigé en
>    récupérant tous les documents (collection minuscule, un par saison) et en triant
>    côté client sur l'ID (`"YYYY-YYYY"` se compare lexicographiquement).
> 2. Le même écran plantait `setDoc` sur `competition_participants` avec
>    `Unsupported field value: undefined` dès qu'un compte qualifié n'avait pas de
>    champ `users.age` renseigné (Firestore refuse `undefined`, contrairement à
>    `null`) — corrigé avec `?? null` sur tous les champs optionnels copiés depuis
>    `users`. Le flux d'ajout manuel (`AdminCompetitionRegistration.tsx`) a
>    probablement la même fragilité latente, non corrigée ici (hors périmètre de ce
>    chantier, à surveiller si un ajout manuel échoue un jour pour la même raison).
>
> **Non fait** : `compute-classement-saison.js` n'a jamais tourné contre la prod
> (seulement l'émulateur, aucune première saison n'y étant encore configurée).
>
> **À relire avant tout commit/déploiement.**
>
> Rappel utile (voir `CONCEPTION-selecteur-marge-compteur-incremental.md` §3) : en V2.26,
> un bornage saisonnier de `classement_profiles` avait déjà été envisagé **puis écarté**,
> parce que borner la requête aurait faussé `score`/`bouldersValidated` à la baisse — ces
> champs sont sensés rester cumulatifs à vie (progression personnelle). Ce chantier ne
> revient pas sur ce choix : il **ajoute un second compteur en parallèle**, il ne remplace
> rien de l'existant. Les deux besoins (progression perso à vie / classement de saison
> pour la Finale) sont désormais reconnus comme distincts et coexistent.

## Objectif métier

Le classement annuel des grimpeurs doit désormais servir de qualification pour une
Finale de fin de saison (mode `officiel` FFME, voir CLAUDE.md "Mode officiel FFME" /
`ADDENDUM-mode-ffme-finale-annee.md`) :

- **Saison à fenêtre paramétrable, pas de dates codées en dur** (décision, voir
  "Fenêtre de saison" ci-dessous) — cible habituelle 1er septembre → 31 mai, mais
  réglable par l'admin. Cette année, la saison démarrera à la date réelle de lancement
  officiel de l'appli (incertaine à ce jour), pas nécessairement le 1er septembre.
- Les validations hors fenêtre de saison **comptent pour la progression personnelle du
  client** (`ClientStats.tsx`, streak, etc. — champs all-time inchangés), mais **jamais
  pour le classement de saison**.
- Le lendemain de la fin de saison (date configurée), le classement de saison est figé
  et le top 10 garçons / top 10 filles est calculé.
- Un admin peut ensuite générer le roster de la compétition Finale à partir de ce top
  10/10, via un bouton — pas d'automatisation intégrale de la création de la compétition
  elle-même.
- Nouvelle saison : les compteurs de saison repartent à zéro dès le calcul de fin de
  saison, et l'admin règle la fenêtre de la saison suivante (par défaut proposée
  1er septembre → 31 mai, modifiable).
- Le classement de saison est **suivable en direct par tous les clients tout au long de
  l'année** (décision, voir "Écran de classement de saison" ci-dessous), pas seulement
  révélé au moment du calcul du top 10/10 — volontairement pensé comme un facteur de
  motivation, pas juste un mécanisme de qualification.

## Modèle de données

### Fenêtre de saison — nouveau doc de config, paramétrable par l'admin (décision, point 1)

Aucun pattern de "doc de config singleton" n'existe encore dans ce projet (vérifié —
ni collection `app_config`/`settings`, ni écran admin de ce type). C'est donc un
nouveau pattern, à garder minimal :

```
app_config/classement_saison
  debut: string (ISO date, ex. "2026-09-15")
  fin: string (ISO date, ex. "2027-05-31")
  cloturee: boolean   // NOUVEAU (décision §2 relecture, 17/08/2026)
```

- Un seul document, lu par tout client authentifié (nécessaire pour que
  `ClientDaily.tsx` sache si la validation du jour tombe en saison), écrit par
  l'admin uniquement.
- **Résout le point ouvert n°5** (rattrapage de la saison 2025-2026 en cours) :
  puisque `debut` est réglé à la date réelle de lancement officiel de l'appli (quelle
  qu'elle soit), il n'y a rien à rattraper — la saison démarre son décompte exactement
  là où l'admin la fait démarrer. Pas de recalcul depuis `client_boulder_results`, pas
  de sous-comptage à justifier.
- Petit écran admin à créer (nouveau — pas d'écran de réglages existant à réutiliser),
  ou un simple ajout à un écran admin déjà là (ex. `AdminCompetitionManagement.tsx`) si
  on préfère éviter une nouvelle route pour deux champs de date. Pas encore tranché,
  détail d'implémentation à faible enjeu.
- **Lu une seule fois côté client**, au montage de `ClientDaily.tsx` (comme
  `colorById`), pas à chaque validation — un doc de config ne justifie pas une lecture
  par écriture.
- Après le calcul de fin de saison (job planifié), l'admin doit reconfigurer ce doc
  pour la saison suivante — le job ne le fait pas tout seul par défaut (une saison mal
  calée doit être une décision explicite, pas une reconduction automatique silencieuse).
  Le job peut au mieux suggérer la fenêtre par défaut (1er septembre → 31 mai suivant)
  dans son journal, sans l'appliquer lui-même.
- **`cloturee` (décision §2, 17/08/2026)** : posé à `true` par le job de fin de saison,
  au moment où il archive `classement_saisons/{saisonId}` et remet `season.*` à zéro
  (étape 3-4, voir "Le job planifié de fin de saison" ci-dessous). Reste `true` tant que
  l'admin n'a pas reconfiguré `debut`/`fin` pour la saison suivante — le repasser à
  `false` fait partie de cette reconfiguration (un seul geste admin, pas une étape à
  part). Sert de **garde-fou explicite** pour la réconciliation (voir plus bas) plutôt
  qu'une simple comparaison de dates : une saison clôturée mais pas encore reconfigurée
  est un état transitoire nommé, pas déduit.

### `classement_profiles/{uid}` — nouveaux champs, à côté de l'existant

```
classement_profiles/{uid}
  colorCounts: Partial<Record<Level, number>>   // existant, all-time, INCHANGÉ
  score: number                                  // existant, all-time, INCHANGÉ
  bestColorRank: number                          // existant, all-time, INCHANGÉ
  season: {                                      // NOUVEAU
    colorCounts: Partial<Record<Level, number>>
    score: number
  }
  gender?: string                                // NOUVEAU, mirroré depuis users.gender
```

- `season.colorCounts` / `season.score` suivent exactement la même mécanique de delta
  que les champs all-time (`summaryFromColorCounts`, `scoreDeltaForValidation` dans
  `utils/classementScore.ts`), appliqués dans la **même transaction** que la mise à jour
  all-time — pas d'écriture séparée, pas de risque d'incohérence entre les deux.
- **Condition d'application du delta de saison** : seulement si la date du jour (calculée
  côté client, au moment de la validation) tombe dans `[debut, fin]` lu depuis
  `app_config/classement_saison`. Hors fenêtre, seuls les champs all-time bougent.
- `gender` : mirroré une fois depuis `users/{uid}.gender` au moment de la première
  écriture de `classement_profiles` (comme le reste du mirroring de ce document — voir
  CLAUDE.md "Cross-user visibility"), pour permettre le tri top 10 garçons/filles sans
  avoir à relire `users` en masse au moment du calcul.
  - Si `users.gender` change après coup, `classement_profiles.gender` ne se
    resynchronise pas automatiquement tout seul — **couvert dans ce chantier** (décision,
    point 4) en étendant `scripts/reconcile-classement-profiles.js` pour vérifier aussi
    ce champ, pas seulement les compteurs (voir section dédiée plus bas).

### `classement_saisons/{saisonId}` — nouvelle collection, archive figée

```
classement_saisons/{"2025-2026"}
  computed_at: string (ISO)
  top_garcons: [{ uid, score, bouldersValidated, rank }]   // 10 entrées (ou plus en cas d'égalité, voir départage)
  top_filles: [{ uid, score, bouldersValidated, rank }]
```

- Un document par saison, créé une seule fois par le job de fin de saison (voir plus
  bas). Écrit intégralement (pas de merge partiel) — pas de risque de doc à moitié
  peuplé.
- Sert de source pour le bouton "Générer le roster" côté admin — pas besoin de
  recalculer le classement à la demande, l'archive est déjà la réponse.
- **Lecture large, confirmée** (décision, point 2) : n'importe quel compte authentifié
  peut lire `classement_saisons`, écriture uniquement via le job planifié
  (service account, comme `reconcile-classement-profiles.js`) — pas de chemin d'écriture
  client à ouvrir dans `firestore.rules`.
- Cette collection reste l'**archive figée** du seul top 10/10 officiel, calculé une
  fois en fin de saison. Le suivi en direct pendant la saison (section suivante) ne
  passe pas par elle — il n'y a rien à archiver avant que la saison soit terminée.

## Écran de classement de saison — suivi en direct toute l'année (décision, point 2)

Demande explicite : le classement de saison doit être suivable **en continu**, pas
seulement révélé au moment du calcul du top 10/10 — pour créer de la motivation.
Contrainte associée, explicitement soulevée par l'utilisateur : **attention au coût en
lectures**.

Bonne nouvelle constatée en creusant l'écran existant : `ClientClassement.tsx` (seul
écran client affichant aujourd'hui le classement all-time) fait déjà **un seul
`getDocs` non filtré par date** sur `classement_profiles` (filtré uniquement par
`classementOptIn == true`), puis trie/pagine côté client. `season.score` et
`season.colorCounts` vivent **sur les mêmes documents** que `score`/`colorCounts`
all-time déjà lus par cet écran.

**Conséquence : afficher le classement de saison en direct n'ajoute aucune lecture
Firestore supplémentaire** — c'est un second mode de tri/affichage sur des données déjà
en mémoire côté client (ex. un `ToggleButtonGroup`/onglet "Saison" à côté de
"Classement général" dans `ClientClassement.tsx`), pas un nouvel appel réseau. Même
filtre `classementOptIn` réutilisé pour les deux vues, par cohérence.

Point de vigilance à garder pour l'implémentation (pas un problème de lecture, un
problème d'affichage) : ce tri doit lire `season.score`/`season.colorCounts` avec un
repli à 0 pour tout profil qui n'a pas encore ces champs (comptes existants avant ce
chantier, ou aucune validation depuis le début de la saison) — pas de `NaN`/tri cassé
sur un champ manquant.

## Départage à égalité (10e place)

Décidé avec l'utilisateur : **à égalité de `season.score`, le nombre total de blocs
validés dans la saison** (somme de `season.colorCounts`) départage. Concrètement,
tri à deux clés : `(season.score desc, totalBouldersSeason desc)`. Une égalité
persistante au-delà de ces deux critères n'a pas été tranchée — improbable en pratique
(deux critères numériques indépendants), mais si ça arrive, comportement à définir
(actuellement : ordre indéterminé entre égalités strictes, aucun impact fonctionnel
puisque rien ne dépend de l'ordre interne au top 10, seulement de l'appartenance au
top 10).

## Le job planifié de fin de saison

Nouveau script `scripts/compute-classement-saison.js`, même patron que
`reconcile-classement-profiles.js` / `cleanup-orphan-boulder-images.js` :

0. Lit `app_config/classement_saison` pour connaître `fin` et `cloturee` — **la fenêtre
   n'est plus une constante codée en dur** (décision, point 1), le script doit la lire
   dynamiquement. Ne s'exécute réellement (archivage + reset) que si la date du jour est
   bien postérieure à `fin` **et** que `cloturee` n'est pas déjà `true` — un
   `workflow_dispatch` lancé par erreur avant la fin de saison, ou un second run du cron
   quotidien après une clôture déjà faite (l'admin n'a pas encore reconfiguré la saison
   suivante), ne doit ni clôturer une saison en cours, ni réarchiver/re-zérofier une
   saison déjà clôturée (décision §2 relecture 17/08/2026 — évite un second document
   d'archive parasite ou une remise à zéro sans effet mais inutile).
1. Lit tous les `classement_profiles` **filtrés sur `classementOptIn == true`**
   (un seul `getDocs`, pas de recalcul depuis `client_boulder_results` — le compteur de
   saison est déjà à jour de façon incrémentale toute l'année, ce script ne fait que
   trier/archiver/réinitialiser, pas recomputer). **Décision §3 relecture 17/08/2026** :
   un compte opt-out du classement public n'entre pas dans le tri de qualification —
   refuser le classement, c'est renoncer à la Finale. Son `season.*` est quand même remis
   à zéro à l'étape 4 (le reset s'applique à tous les comptes, opt-out ou non — seule la
   sélection du top 10/10 est filtrée).
2. Sépare par `gender`, trie par `(season.score desc, totalBouldersSeason desc)`, prend
   les 10 premiers de chaque groupe (plus en cas d'égalité stricte au seuil, comme décidé).
3. Écrit `classement_saisons/{saisonId}`, puis pose `app_config/classement_saison.cloturee
   = true`.
4. Remet `season.colorCounts`/`season.score` à zéro sur **tous** les profils (y compris
   les comptes opt-out, exclus du tri mais pas du reset).
5. Journalise (comme les autres scripts de ce projet) : combien de comptes traités,
   combien exclus pour opt-out, qui est qualifié, tout écart/anomalie (ex. compte sans
   `gender` renseigné — à exclure du tri avec un avertissement explicite plutôt que
   planter ou mal classer, décision point 3 initial — voir section dédiée ci-dessous).

Déclenchement : `.github/workflows/compute-classement-saison.yml`. Comme la fenêtre de
saison est désormais paramétrable et non fixe au 1er juin, le cron ne peut plus viser
une date calendaire précise à l'avance — deux options possibles : (a) cron **quotidien**
qui ne fait rien tant que `fin` (lu à l'étape 0) n'est pas dépassée (le garde-fou de
l'étape 0 rend ça sûr, coût négligeable — un `getDoc` par jour), ou (b)
`workflow_dispatch` uniquement, déclenché manuellement par l'utilisateur le lendemain de
la fin de saison qu'il a lui-même configurée. **Option (a) recommandée** — évite de
compter sur un déclenchement manuel pour un événement qui arrive une fois par an et
qu'on peut facilement oublier. `workflow_dispatch` conservé dans les deux cas pour
rejeu manuel. Réutilise le secret `FIREBASE_SERVICE_ACCOUNT_JSON` déjà configuré —
aucun nouveau secret.

**Étape 4 (reset) est irréversible en pratique** (comme toute remise à zéro) — contrairement
au compteur incrémental de `classement_profiles` où une dérive est "corrective par
construction", ici une remise à zéro **avant** que l'étape 3 (archivage + `cloturee`)
ait réussi serait une perte de données réelle. Le script doit garantir l'ordre
écriture-archive → écriture `cloturee` → vérification → reset, jamais l'inverse, et
s'arrêter (sans reset) si l'une des deux écritures de l'étape 3 échoue.

## Le bouton admin "Générer le roster"

Sur une compétition existante en mode `officiel` (créée à la main comme aujourd'hui,
`AdminCompetitionManagement.tsx`), un nouveau bouton dans son écran de gestion :

1. Lit `classement_saisons/{saisonId le plus récent}`.
2. Pour chacun des 20 (ou plus) uid du top garçons/filles, crée le document
   `competition_participants/{uid}_{competitionId}` — même écriture, même forme que
   l'ajout manuel existant dans `AdminCompetitionRegistration.tsx`
   (`registered_at`, `gender`, `level`, etc. lus depuis `users`).
3. Reste modifiable à la main ensuite via l'écran d'inscription existant (retrait/ajout
   individuel) — le bouton ne fait qu'amorcer le roster, pas le verrouiller.

Pas de garde-fou particulier proposé au-delà de l'existant (double-clic écrase juste
avec les mêmes données, `setDoc` sans `merge` sur un ID déterministe est idempotent).

## Ce qui ne change pas

- `climbingPoints.ts` (barème par couleur, dégressif) — inchangé, réutilisé tel quel
  pour calculer `season.score`.
- `bestColorRank`, `colorCounts`, `score` all-time — inchangés, aucune migration de
  données existantes nécessaire sur ces champs.
- Mode `officiel` FFME (tops/zones, `competitionClassement.ts`,
  `CompetitionJudgeEntry.tsx`) — inchangé, ce chantier ne fait qu'alimenter son roster
  automatiquement en amont.
- ~~Rien ici ne touche `client_boulder_results` ni son schéma~~ — **inexact, corrigé le
  17/08/2026** : le bug `createdAt` réécrit à chaque édition, d'abord écarté comme hors
  chemin critique, s'est révélé être un prérequis bloquant (relecture ClaudeNav §1) dès
  lors que la réconciliation de `season.*` doit relire cette date a posteriori. **Fait**
  dans `ClientDaily.tsx` (voir bandeau en tête de document) : `createdAt` est maintenant
  immuable après la première écriture, schéma du document inchangé (mêmes champs),
  seule leur logique de mise à jour change.

## Réconciliation étendue (décision, point 4 — dans ce chantier)

`scripts/reconcile-classement-profiles.js` est étendu pour vérifier, en plus des
compteurs all-time existants :
- `season.colorCounts`/`season.score` — recomputés depuis `client_boulder_results` en
  ne retenant que les validations dont la date tombe dans `[debut, fin]` de la saison
  **courante** (lue depuis `app_config/classement_saison`). **Garde-fou §2 (décision
  17/08/2026) : si `cloturee == true`, le script n'y touche pas du tout** — ni
  vérification ni correction de `season.*` — le temps que l'admin reconfigure la saison
  suivante. Sans ce garde-fou, un cron de réconciliation tombant dans cet intervalle
  recomputerait sur l'ancienne fenêtre `[debut, fin]` encore en place, verrait tous les
  profils à zéro (venant d'être resetés) et **restaurerait les anciennes valeurs,
  annulant le reset du job de fin de saison**. Une saison déjà clôturée et réinitialisée
  n'est de toute façon pas vérifiable rétroactivement une fois le reset passé — cohérent
  avec le fait que `classement_saisons/{saisonId}` est déjà l'archive qui fait foi pour
  les saisons passées.
- `gender` — comparé à `users/{uid}.gender`, corrigé si divergent (inchangé par
  `cloturee`, ce champ n'a pas de notion de saison).

Même mécanique que l'existant : dry-run par défaut, `--fix` pour écrire, même garde-fou
anti-dérive (30% ET ≥3 comptes), même journal dans `cleanup-state/`. Pas de nouveau
script — une extension de celui qui existe déjà, réutilisant son infrastructure
(credentials, cron mensuel `reconcile-classement-profiles.yml`).

## Compte sans genre renseigné (décision, point 3)

Exclu du tri top 10/10 avec un avertissement explicite dans le journal du job de fin de
saison (`scripts/compute-classement-saison.js`) — ni erreur bloquante, ni classement
par défaut arbitraire. Le compte garde son `season.score` (visible dans le suivi en
direct de `ClientClassement.tsx`, qui n'a pas besoin du genre pour le classement
général), seule l'éligibilité à la Finale est affectée.

## `classementOptIn` et qualification à la Finale (décision §3 relecture, 17/08/2026)

Un grimpeur ayant désactivé `classementOptIn` (masqué du classement public,
`ClientProfile.tsx`) n'est **pas retenu** dans le tri top 10/10 du job de fin de saison
(voir étape 1 ci-dessus) — refuser le classement public équivaut à renoncer à la
qualification pour la Finale, même à score qualifiant. Son `season.score` continue
d'être accumulé normalement (le compteur ne dépend pas de `classementOptIn`, seule la
sélection en fin de saison en tient compte) et remis à zéro au même titre que les autres
comptes à la clôture.

**Conséquence UI** : le texte d'aide de `ClientProfile.tsx`, à côté du réglage
`classementOptIn`, doit mentionner explicitement cet effet de bord — proposé :
« Désactiver ce réglage vous retire aussi de la qualification pour la Finale de fin de
saison. » Sans ce texte, la règle serait invisible pour le grimpeur jusqu'au jour où il
constaterait ne pas être qualifié malgré un score suffisant.

## Ordre de réalisation proposé

1. `app_config/classement_saison` : petit écran/formulaire admin pour régler
   `debut`/`fin`/`cloturee` ; `firestore.rules` (lecture authentifiée, écriture admin) +
   `test:rules`.
2. `utils/classementScore.ts` : ajouter `season.colorCounts`/`season.score` au calcul
   de delta, lecture de la fenêtre depuis la config (pas une constante en dur), tests
   unitaires (mêmes séquences ajout/modification/retrait que `classementScore.test.ts`,
   plus les cas "dans la fenêtre" / "hors fenêtre").
3. `ClientDaily.tsx` : lecture de `app_config/classement_saison` une fois au montage,
   application du delta de saison dans la même transaction, mirroring de `gender` à la
   première écriture.
4. `ClientClassement.tsx` : vue "classement de saison" à côté du classement général —
   aucune lecture Firestore supplémentaire (voir section dédiée plus haut), repli à 0
   pour les profils sans champs `season.*`.
5. `ClientProfile.tsx` : texte d'aide sur `classementOptIn` (décision §3 ci-dessus).
6. `firestore.rules` + `test:rules` : nouveaux champs sur `classement_profiles` (déjà
   couverts par les règles existantes tant qu'on n'ouvre pas de nouveau chemin
   d'écriture) ; nouvelle collection `classement_saisons` (lecture large, écriture
   service-account uniquement).
7. `scripts/compute-classement-saison.js` + workflow (cron quotidien avec garde-fou de
   date + `cloturee`, `workflow_dispatch` pour rejeu manuel), testé manuellement avant de
   compter sur le cron.
8. Extension de `scripts/reconcile-classement-profiles.js` (point 4 ci-dessus, avec le
   garde-fou `cloturee` du §2).
9. Bouton "Générer le roster" côté admin.
10. Mise à jour de CLAUDE.md (nouvelle section, sur le modèle des sections existantes).

## Vérification

- `npm test` : nouveaux cas dans `classementScore.test.ts` (delta de saison,
  fenêtre de dates, égalité au tri).
- `npm run test:rules` : lecture/écriture de `classement_saisons`, rôles.
- Script testé en simulation contre un jeu de données réel (comme
  `reconcile-classement-profiles.js` l'a été) avant tout `--fix`/cron réel.
- `npm run build`/`lint` avant de considérer une étape terminée.
