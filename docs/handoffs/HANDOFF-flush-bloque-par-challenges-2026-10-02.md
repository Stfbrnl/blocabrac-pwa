# Handoff ClaudeNav — V2.71.4 : le flush tué par une lecture de défi refusée

> Session Claude Code (PC Windows de l'utilisateur), 02/10/2026, soirée.
> Applique `docs/URGENT-flush-bloque-par-challenges.md` dans l'ordre de son §4.
>
> **Consigne explicite de l'utilisateur : AUCUN déploiement, AUCUN `reconcile --fix`.**
> Les phases 2a-10 (déploiement des règles), 2b-14 (déploiement), et toute la phase 3
> (réparation) sont donc **faites côté code mais pas exécutées**. La prod tourne toujours
> en **V2.71.3 avec les anciennes règles** : l'hémorragie n'est pas encore arrêtée.
>
> Ton diagnostic était bon. Deux points le précisent et un le corrige — §2.2, §4 et §5.

---

## §1 — Phase 0 : constat (lecture seule)

### 1.1 — Le défi n'existe pas

`challenges/Oln9qhIHF1oaYVDi8NqL` : **`exists = false`**. C'est ton hypothèse n°1 (document
absent), et elle est la bonne.

**Ton hypothèse n°2 est écartée**, pas laissée en suspens : j'ai ajouté un test qui lit un
défi `status: 'termine'`, et **il passait déjà avant tout correctif**. Un défi terminé n'a
jamais été illisible ; la condition de lecture n'était pas trop stricte.

### 1.2 — Le bloc perdu est le violet

Réconciliation en **simulation** sur la prod (jamais `--fix`), compte de l'utilisateur :

| | stocké | attendu |
|---|---|---|
| score | 5495 | 5695 |
| blocs validés | 36 | **37** |
| `colorCounts.violet` | 7 | **8** |

Le « attendu 37 » de ton §1.2 est confirmé au document près, et c'est **le violet** qui
manque — donc le défi concerné portait sur le violet.

### 1.3 — Population touchée : un seul compte, aujourd'hui

Sur **61 profils vérifiés, 1 seul est en écart réel** : celui de l'utilisateur. Les trois
autres comptes du 1ᵉʳ octobre ont bien été corrigés par le cron et n'ont pas re-dérivé.

Population **exposée pour la suite** : **3 défis existants, 5 comptes** avec au moins un défi
`en_cours`. Chacun d'eux sera empoisonné le jour où son créateur supprimera le défi.

### 1.4 — ⚠️ Le mécanisme est pire que « un défi supprimé » : il est PERSISTANT

C'est le point que ton document n'avait pas, et il explique pourquoi ça ne se répare pas tout
seul. `ClientDaily.tsx` charge ses défis actifs avec **`getDocsCacheFirst`** :

```ts
const snap = await getDocsCacheFirst(query(
  collection(db, 'challenges'),
  where('participants', 'array-contains', user.uid),
  where('status', '==', 'en_cours')
));
```

`getDocsCacheFirst` renvoie le cache IndexedDB dès qu'il n'est **pas vide**, et ne va au
serveur que s'il l'est. Un défi supprimé par son créateur **sur un autre appareil** n'est
jamais invalidé localement (aucun `onSnapshot`, c'est un choix de coût assumé et documenté).
Donc l'appareil garde indéfiniment en mémoire un identifiant de défi mort, et **chaque**
validation qui ferait avancer ce défi meurt — pas une fois, à chaque fois, jusqu'à ce que le
cache soit vidé (la déconnexion le fait, via `clearIndexedDbPersistence`).

Cela confirme ton §1.4 (« ça paraît intermittent ») et le durcit : ce n'est pas aléatoire,
c'est **déterministe par appareil et par défi**.

---

## §2 — Phase 1 : reproduit avant correctif

### 2.1 — Deux tests de règles, rouges d'abord

Ajoutés à `test/firestore.rules.test.ts`, **lancés sur les règles non modifiées** :

```
× ⚠️ lire un défi INEXISTANT est refusé proprement, sans faire planter la règle
× ⚠️ un défi supprimé en cours de route n'avorte pas la transaction de validation
   Tests  2 failed | 147 passed (149)
```

Le second reproduit la forme exacte du défaut : un `runTransaction` qui fait `tx.get()` sur
un défi disparu et ignore le résultat s'il n'existe pas — ce que fait le code de production.

### 2.2 — La cause, formulée précisément

```
allow read: if request.auth != null && request.auth.uid in resource.data.participants;
```

Sur un document absent, `resource` est `null`, donc `resource.data` **fait planter
l'évaluation**, et un plantage de règle se présente au client comme `permission-denied`.
C'est bien le piège que tu cites (V2.27), dans sa variante `resource` plutôt que `get()`.

**Ce que ça invalide dans `CLAUDE.md`** : la section « Deletion (V2.53) » affirmait
*« Safe mid-flight: … `buildClassementFlushWrites` already skips a vanished challenge
(`if (!challengeData || !challengeRef) return;`) »*. Le garde-fou existe bien — **mais il
n'était jamais atteint**, la lecture mourant avant lui. L'affirmation était fausse depuis
V2.53, soit un mois et demi. Corrigée.

---

## §3 — Phase 2a : les règles (corrigées et prouvées, **NON déployées**)

```
allow read: if request.auth != null &&
              (resource == null || request.auth.uid in resource.data.participants);
```

`npm run test:rules` : **149/149 vert**.

Deux tests permanents de plus (ta phase 4, point 18) : défi inexistant, et défi existant lu
par un non-participant — pour que le correctif n'ouvre pas la lecture à tout le monde en
réparant le plantage.

🔴 **Point 10 de ta marche à suivre NON exécuté** : `firebase deploy --only firestore:rules`
est précisément ce que l'utilisateur a interdit ce soir. **C'est la seule action qui arrête
l'hémorragie sans attendre une mise à jour d'application**, et elle reste à faire. Tant
qu'elle ne l'est pas, les 5 comptes exposés le restent.

---

## §4 — Phase 2b : le correctif de fond (V2.71.4)

`utils/challengeProgressWrite.ts` (nouveau, pur, sans import Firestore) reçoit la logique
d'écriture des défis, **extraite** de `buildClassementFlushWrites` — pas dupliquée. Le flush
débouncé de `ClientDaily.tsx` enchaîne maintenant **deux** transactions :

1. `classement_profiles` + `user_ludic_state` — score, murs, missions. **Ne lit plus
   `challenges` du tout.** Si elle échoue, la file retente tout le `pending`.
2. `challenges.progress` seul, **après**, dans son propre `try/catch`. Son échec est
   journalisé et s'arrête là.

L'échec avalé en 2) est une **exception assumée** à `PROCESSUS-erreurs-avalees.md`, commentée
comme telle : rien n'est dérivé de `challenges.progress` (ni score, ni badge, ni niveau), et
surtout **le propager ferait retenter tout le `pending` par la file, donc ré-appliquer un
delta de classement déjà écrit**. Un échec silencieux coûte ici une progression de jeu ; une
propagation coûterait un score faux.

**Verrou de non-régression** (ton point 13) : le test de propriété sur les 1024 combinaisons
assert désormais, pour chaque masque, que `classementFlushReadKeys(pending)` ne contient
**aucune** clé `challenge:`. Ajouter un jour une lecture de défi dans cette transaction fait
échouer le test tout seul.

Les trois tests sur les défis ont déménagé dans `challengeProgressWrite.test.ts`, enrichis de
quatre cas (dont « écrit les autres défis même si l'un d'eux a disparu »).

---

## §5 — 🔴 Phase 4, point 17 : ton diagnostic est à corriger, et la vraie raison est pire

Tu écris : *« le message est dans la console… mais personne ne regarde une console de
production. Une écriture abandonnée après les trois tentatives du `failureThreshold` doit le
dire au grimpeur. »*

**Elle le dit déjà.** `ClientDaily.tsx` passe un `onDurableFailure` qui pose un `Alert` rouge
visible (ligne 1206), en place depuis V2.48 :

> « Ta progression (classement, murs, défis) n'arrive pas à s'enregistrer depuis plusieurs
> tentatives. Tes validations de blocs restent bien enregistrées… »

**La vraie question n'est donc pas « faut-il une alerte » mais « pourquoi celle-ci ne s'est
jamais déclenchée ».** Deux raisons, trouvées dans `useDebouncedFlushQueue.ts` :

1. **Rien ne réessayait.** En cas d'échec, le payload est remis dans `pendingRef` — mais
   **aucun minuteur n'est réarmé**. Il attendait la prochaine action de l'utilisateur, ou un
   `pagehide` (non garanti d'aboutir). Les « trois tentatives » n'avaient donc jamais lieu.
2. **Le compteur est remis à zéro par tout succès.** Comme l'échec est *sélectif* (seules
   meurent les validations faisant avancer un défi), chaque échec était suivi d'un succès qui
   remettait le compteur à 0. **Trois échecs consécutifs ne pouvaient structurellement jamais
   s'accumuler.**

L'utilisateur a fait 3 validations, 1 a échoué : compteur à 1, jamais 3. L'alerte était
inatteignable **par construction**, pas par oubli.

Correctif : le chemin d'échec **réarme lui-même son minuteur** (repli progressif
`debounceMs × n`), donc les tentatives ont réellement lieu et le seuil devient atteignable.
Un échec permanent comme celui-ci produit maintenant ses 3 tentatives en ~9 s, puis l'alerte.

⚠️ **C'est le seul changement de ce lot sans couverture automatisée** : le dépôt n'a pas de
harnais de test React, et `useDebouncedFlushQueue.test.ts` ne couvre que `combineByFreshness`
(fonction pure). Les trois e2e ci-dessous exercent le chemin nominal du hook, pas son chemin
d'échec. **À considérer comme le point faible du lot.**

La ligne que tu demandais est dans `CLAUDE.md`, avec ce corollaire — qui est, je crois, plus
utile que la règle elle-même : *une escalade qui ne compte que les échecs consécutifs ne peut
pas se déclencher sur un échec sélectif.*

---

## §6 — Vérifications

| | |
|---|---|
| `npm test` | ✅ **320/320** (25 fichiers) |
| `npm run test:rules` | ✅ **149/149** |
| `npx tsc -b` | ✅ |
| `npm run lint` | ✅ |
| `e2e-challenges-flow.mjs` | ✅ **10/10** — la progression de défi marche toujours, via sa nouvelle transaction séparée |
| `e2e-daily-flow.mjs` | ✅ **10/10** — `wallCounts` et compteurs Roulette intacts |
| `e2e-weekly-missions-flow.mjs` | ✅ **11/11** — la grille de missions survit au découpage |
| `npm run build` | ✅ lancé **après** le bump, `2.71.4` retrouvée dans `dist/` |

## §7 — ⚠️ Ce qui n'est PAS fait

- 🔴 **Déploiement des règles** (ta phase 2a-10) — interdit ce soir. **L'hémorragie
  continue.** C'est l'action la plus urgente qui reste, et elle est indépendante de
  l'application.
- 🔴 **Déploiement de V2.71.4** (2b-14).
- 🔴 **Réparation** (phase 3) : `reconcile --fix` interdit. Le compte de l'utilisateur reste
  à −200 points / −1 bloc violet. Ta consigne du §0 est respectée : la dérive garde sa trace.
- **Revérification en direct** (2a-11) : impossible sans déploiement.
- Rien n'a été vu sur un vrai téléphone.

## §8 — Deux choses trouvées en chemin, hors de ton document

### 8.1 — 🟠 Une simulation locale écrase le journal de production suivi par git

`reconcile-classement-profiles.js`, lancé **en simulation**, réécrit
`cleanup-state/classement-profiles-reconcile-log.json` — le fichier **suivi par git** qui
contenait le run du cron du 1ᵉʳ octobre. Je l'ai restauré (`git checkout`), le contenu du
01/10 est intact.

Le garde-fou de `CLAUDE.md` ne couvre que le cas émulateur (`FIRESTORE_EMULATOR_HOST` →
`*.emulator.json`). Il ne couvre pas « prod, mais en simulation depuis un poste ». Une
simulation ne devrait rien écrire du tout, ou écrire ailleurs. **Non corrigé** : hors
périmètre ce soir, mais c'est le même piège que celui du 19/08.

### 8.2 — Le lancement e2e sous Windows : `set VAR=true &&` injecte une espace

`cmd /c set VITE_USE_EMULATOR=true && npx vite` donne la valeur `"true "`, donc
`=== 'true'` est faux et **l'application pointe sur la PRODUCTION** au lieu de l'émulateur.
Symptôme : l'e2e échoue à l'étape 1 avec un `403`. Il faut écrire `set "VITE_USE_EMULATOR=true"`.
Noté en mémoire de session ; mérite sans doute une ligne dans les conventions e2e.

---

## §9 bis — Clôture du soir (application de `PLAN-cloture-ce-soir-et-recotation.md`)

| Étape du plan | État |
|---|---|
| §1.1 réconciliation `--fix` | ❌ **non lancée** — voir ci-dessous, la situation a changé |
| §1.2 quatre lignes de documentation | ✅ faites (déjà au tour précédent ; la formulation française est maintenant conservée **verbatim**) |
| §1.3 ne PAS déployer V2.71.4, mais pousser | ✅ `b7ea103` poussé sur `main`, **aucun déploiement d'application** |
| §1.4 purge suspendue | ✅ inchangée |
| §1.5 points ouverts | ✅ inscrits — **dont un déjà fait**, voir §9 ter |
| §2 recotation | ⚠️ **déjà faite avant l'exécution du plan** — analyse d'impact ci-dessous |

### 🔴 Le §1.1 s'est arrêté sur sa propre clause de garde, et c'était justifié

Prédiction du plan : **1 compte**, score 5665 → 5865, 37 → 38 blocs, violet 8 → 9.
Mesure réelle : **7 comptes**, et pour l'utilisateur 5665 → **5965**, violet 8 → **10**,
bleu 10 → **9**.

La clause « si l'écart est différent, s'arrêter et signaler » a donc joué. Cause trouvée, et
elle est entièrement explicative :

**La recotation du §2 a déjà été faite.** Le bloc `ENaQkqYtY6FuyjngcYz0` (**n°4, Grande
Face**) est aujourd'hui `violet`. Attribution certaine et non supposée : **les 7 comptes en
écart sont exactement les 7 qui ont réussi ce bloc**, et chacun porte la même signature — un
bleu qui devient un violet, +100 points.

L'écart de l'utilisateur est donc la somme de deux choses : **+200 / +1 violet** (le bloc perdu
par le défaut des défis, la prédiction du plan) **et +100 / un bleu→violet** (la recotation).
5665 + 200 + 100 = 5965. Le compte est juste.

### Analyse d'impact du §2.3 point 1 (lecture seule, faite avant toute correction)

| compte | prénom | niveau | meilleure couleur avant → après | violets déjà acquis |
|---|---|---|---|---|
| `1gq6Jyr4` | Alice | blanc | blanc → blanc | 14 |
| `5erGHVpD` | Stéphane | noir | noir → noir | 8 |
| `DsyfChO9` | Kenzo | noir | noir → noir | 12 |
| `EHEBHrOC` | Ludovic | blanc | blanc → blanc | 1 |
| `aGkno50E` | Robin | blanc | blanc → blanc | 15 |
| `lTKfW9Xb` | Samuel | rouge | rouge → rouge | 6 |
| `nP1TFARq` | Cécile | noir | noir → noir | 6 |

**Le risque n°1 de ton §2.2 est nul dans ce cas précis** : les sept avaient déjà des violets
(de 1 à 15), aucune meilleure couleur ne bouge, donc aucun badge automatique ne s'attribue et
**aucun niveau ne monte**. Ni les missions hebdomadaires ni la roulette ne sont affectées.

**Le risque n°2 non plus** : 7 profils sur 61, soit **11,5 %**, sous le seuil de 30 %. Le
garde-fou ne se déclenchera pas et `--force` est inutile.

**Reste le risque n°3**, et c'est pour lui que je n'ai pas lancé `--fix` : la correction
déplacerait **ce soir** le score public de 7 grimpeurs, alors que l'annonce qui l'explique
(§2.3 point 5) est rattachée à V2.71.4, qui ne se déploie que demain (§1.3). Faire les deux
dans le même mouvement demain matin évite une nuit de scores qui bougent sans explication.
L'entrée de changelog est écrite et n'attend que le déploiement.

### Les trois comptes du 1ᵉʳ octobre n'ont pas re-dérivé (ton §1.1 point 2)

`4Urs3bj8`, `7SvZhyuX` et `nP1TFARq` n'apparaissent dans la liste que pour la recotation —
`4Urs3bj8` et `7SvZhyuX` n'y sont même pas. Rien de nouveau sur l'énigme des 46 blocs → 6,
qui a par ailleurs trouvé sa réponse (§9 ter).

## §9 ter — Un point ouvert de ton §1.5 était déjà fait, et il a réfuté ton hypothèse

Ton §1.5 demande d'« étendre `audit-prod-catalog.js` aux références mortes », en ajoutant que
« ça répond à l'énigme des 46 blocs → 6 ». **C'était fait cet après-midi**, et le résultat va
dans l'autre sens :

- **0 référence morte** sur 775 résultats, 3 défis, 61 profils. Aucun `client_boulder_results`
  ne pointe vers un bloc supprimé.
- Les trois comptes du 1ᵉʳ octobre avaient des compteurs **gonflés**, pas amputés. Leurs
  profils correspondent aujourd'hui exactement à leurs résultats : 6/6, 43/43, 26/26.
- Signature probable : la **revalidation répétée d'avant V2.69** — `nP1TFARq` a 24 de ses 28
  résultats réécrits après coup. Le premier cron suivant le correctif a nettoyé l'inflation
  historique.

⚠️ Et une ligne de ton tableau du §3.2 n'est **pas auditable** : le défi actif d'un grimpeur
n'est stocké nulle part côté serveur, la référence morte vit dans le cache IndexedDB du
navigateur. Écrit dans le script et dans `CLAUDE.md` pour que le vert de l'audit ne laisse pas
croire cette classe couverte.

## §9 — Ce que je ferais ensuite, dans l'ordre

1. **Déployer les règles seules** (`--only firestore:rules`). Trois minutes, effet immédiat
   pour les 5 comptes exposés, aucune nouvelle version d'application. Rien ne justifie
   d'attendre.
2. Revérifier en direct selon ton protocole (console + lecture serveur).
3. Déployer V2.71.4.
4. Puis seulement `reconcile --fix`, et commiter le journal.
5. Reprendre la purge de l'état ludique, suspendue à ta demande — elle attend une décision de
   l'utilisateur sur un champ bloqué, voir `HANDOFF-purge-etat-ludique-2026-10-02.md` §4.
6. Ton §5 reste entier : les trois comptes du 1ᵉʳ octobre dont le compteur était **en avance**
   (46 blocs → 6) ne sont pas expliqués par ce défaut-ci. Le décompte des résultats orphelins
   reste à faire.
