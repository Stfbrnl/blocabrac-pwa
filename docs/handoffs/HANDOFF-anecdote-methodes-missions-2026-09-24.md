# Handoff ClaudeNav — V2.66/V2.67/V2.68 : anecdote d'ouvreur, carnet de méthodes, missions hebdomadaires

> Session Claude Code (Codespace), 24/09/2026.
> Implémente `docs/plans/PLAN-anecdote-methodes-missions.md` en entier (chantiers A, B, C —
> rédigé le 24/09 par la session navigateur, dans la foulée du même jour).
> **Committé (3 commits séparés, un par chantier), poussé sur `main`, déployé**
> (`--only hosting,firestore:rules`).
> `topo-blocabrac.pdf` mis à jour et régénéré (voir §6). Aucune vérification visuelle en
> prod faite par l'agent ni par l'utilisateur — voir §5, c'est le principal point ouvert.

---

## 0. Comment ça s'est déroulé

Livré chantier par chantier, dans l'ordre du plan, avec un point de passage explicite entre
chacun (l'utilisateur a choisi "committer A puis enchaîner B" plutôt que tout faire d'un
bloc). Chantier C a buté sur son propre bloquant annoncé par le plan (§C.7, "relever les
valeurs exactes... ne rien recopier depuis ce document") — la classification des 10 murs
réels a été obtenue en session directement auprès de l'utilisateur (pas de requête Firestore
prod), voir §1.

---

## 1. Décision produit tranchée avec l'utilisateur en session : `wallCategories`

Le plan (§C.7) interdisait explicitement de recopier ses propres exemples ("Réta Enfants",
"Grotte des enfants" — non vérifiés). Classification obtenue par questions directes,
confirmée pour les 10 murs réels de `gymConfig.ts` :

| Mur | Catégorie | `kidsOnly` |
|---|---|---|
| Grotte Adultes | `devers` | non |
| Caverne des petits | `autre` | **oui** |
| Güllich | `dalle` | non |
| Réta Adultes | `reta` | non |
| Réta d'initiation | `reta` | **oui** |
| Grande Face | `autre` | non |
| Dalle | `dalle` | non |
| Dévers 15° | `autre` (délibérément — trop proche de la verticale) | non |
| Dévers 30° | `devers` | non |
| Dévers 40° | `devers` | non |

Écrit dans `gymConfig.ts` (`wallCategories`). **Si un mur est renommé, ajouté ou retiré côté
salle, cette table doit être revue à la main** — rien ne la garde synchronisée avec le
tableau `walls` automatiquement.

---

## 2. Modèle de données (résumé, détail complet dans `CLAUDE.md`)

- **A** — `boulders/{id}.openerNote: string | null`, plafonné à 300 caractères (formulaire +
  `firestore.rules`, `isValidOpenerNote()`).
- **B** — `client_boulder_results/{uid}_{boulderId}.methods: string[]` (vote du grimpeur,
  ≤3, vocabulaire fixe `gymConfig.ts` `climbingMethods`) + `boulders/{id}.methodCounts` /
  `methodVotes` (agrégat, affiché dès 3 votes).
- **C** — `user_ludic_state/{uid}.weeklyMissions: WeeklyMissionsState` (`isoWeek`, `level`,
  `countsChildWalls`, `done: MissionKey[]`, `walls: string[]`, `completedAt`) +
  `weeklyMissionsCompleted: number`. Badge `type: 'mission'` (nouveau, dans le catalogue
  `badges`) attribué par `ClientStats.tsx`.

---

## 3. Implémentation

| Fichier | Changement |
|---|---|
| `firestore.rules` | `isValidOpenerNote()` (A) ; `methodVocabulary()`, `isConsistentMethodDelta()`, `isValidMethodVoteUpdate()` (B, branche client sur `boulders` + branche `methods` sur `client_boulder_results`) ; badge auto-attribution élargi à `type in ["automatic", "mission"]` (C). |
| `frontend/src/config/gymConfig.ts` | `climbingMethods`, `MAX_METHODS_PER_VOTE`, `METHOD_VOTES_DISPLAY_THRESHOLD` (B) ; `wallCategories`, `WallCategory`/`WallCategoryInfo` (C, voir §1). |
| `frontend/src/utils/methodVote.ts` + `.test.ts` (nouveaux) | Delta de vote pur, résumé d'affichage avec seuil. |
| `frontend/src/utils/methodVoteWrite.ts` + `.test.ts` (nouveaux) | Compose l'écriture double (client_boulder_results + boulders) pour `runReadThenWriteTransaction`. |
| `frontend/src/utils/weeklyMissions.ts` + `.test.ts` (nouveaux, 30 tests) | Semaine ISO, ouverture/réinitialisation, évaluation des 8 missions, libellés, M4 bis. Réutilise `resolveTargetColor`/`levelOrder` de `roulette.ts` (le plan §C.3.b le demandait explicitement). |
| `frontend/src/services/ludicState.ts` | `LudicState` étendu (`weeklyMissions`, `weeklyMissionsCompleted`) ; `incrementRouletteCompleted()` fait maintenant aussi avancer M8 dans la même écriture. |
| `frontend/src/utils/classementFlushWrites.ts` + `.test.ts` | `ClassementFlushPending` étendu (`missionsNewlyDone`, `wallsNewlyVisited`, `missionsFige`) ; `buildClassementFlushWrites` combine `wallCounts` et `weeklyMissions` en **une seule** écriture `user_ludic_state` (jamais deux `tx.set()` sur la même ref). |
| `frontend/src/pages/Client/Daily/ClientDaily.tsx` | Champ `openerNote` (formulaire + fiche, A) ; sélecteur de méthodes + agrégat affiché (B) ; grille de missions, `handleMissionM4Bis`, évaluation des missions **avant** le contrôle de dédoublonnage de `handleValidateSuccess` (§C.3.a, voir §4 ci-dessous) ; **correctif** : `setDoc` de `client_boulder_results` (dans `handleValidateSuccess` et `handleRate`) ne reportait pas `methods` — corrigé pour ne pas effacer un vote en cours de route (bug latent introduit par B, trouvé et corrigé dans le même lot). |
| `frontend/src/pages/Ouvreur/DailyBoulders/DailyBoulderForm.tsx`, `CompetitionBoulderForm.tsx` | Champ "Anecdote d'ouvreur" (A) — les deux formulaires traités dès le départ (le plan V2.65 rappelait que le second est systématiquement oublié). |
| `frontend/src/pages/Client/Stats/ClientStats.tsx` | Boucle d'auto-attribution étendue à `type: 'mission'`, **exclue** de `computeBadgeActive` (qui traiterait un badge sans couleur comme "toujours actif" — piège identifié et évité, voir §C.6 du plan). |
| `frontend/test/firestore.rules.test.ts` | +4 tests A (`openerNote`), +16 tests B (dont le test décisif "un grimpeur ne peut pas retirer une méthode votée par un AUTRE grimpeur"), +1 test C (`type: 'mission'`). |
| `CLAUDE.md` | 3 nouvelles sections (Opener's note, Method log, Weekly missions) — la note explicite demandée par le plan sur M1/M4 bis auto-déclaratives y figure (§C.3.a/§C.3.b du plan l'exigeaient noir sur blanc). |
| `topo-blocabrac-source.html` → `.pdf` | Voir §6. |

---

## 4. ⚠️ Point technique décisif (chantier B) — vérifié, pas supposé

Le plan (§B.5) affirmait que les règles pouvaient être "étanches" mais ne détaillait que le
cas du premier vote. Pour couvrir aussi la **modification** de vote (§B.6), la règle
`boulders` doit valider le delta appliqué à `methodCounts` par rapport au vote **précédent**
du grimpeur — lu via `get()` sur son propre `client_boulder_results`, **à l'intérieur de la
même transaction** que celle qui écrit la nouvelle valeur de ce même document.

**Question ouverte avant d'écrire le code** : est-ce que `get()` dans une règle voit
l'écriture jumelle faite plus tôt dans la même transaction, ou seulement l'état d'avant ?
**Vérifié empiriquement sur l'émulateur** (`firestore.rules.test.ts`, la fonction
`voteViaTransaction` reproduit exactement `runReadThenWriteTransaction`) : `get()` voit
**l'état d'avant la transaction**, jamais la sibling write. C'est ce qui rend la conception
possible sans champ supplémentaire ni transaction en deux temps. Documenté dans `CLAUDE.md`
en toutes lettres pour que ça ne se reperde pas — c'est le genre de supposition qui, fausse,
aurait ouvert un vrai trou de sécurité silencieusement.

---

## 5. ⚠️ Ce qui n'a PAS été vérifié — le point le plus important de ce handoff

**Aucune vérification visuelle en navigateur n'a été faite**, ni par l'agent ni par
l'utilisateur, avant le déploiement. Tout repose sur :
- `npm run build` / `npm run lint` : OK à chaque étape.
- `npm test` : **261/261** (212 avant ce plan + 49 nouveaux : 13 carnet de méthodes + 30
  missions + 6 `classementFlushWrites` mission-aware).
- `npm run test:rules` (émulateur) : **145/145** (128 après A, 144 après B, 145 après C).

C'est une couverture solide pour la **logique pure** et les **règles Firestore**, mais
**aucun test n'a exercé le rendu réel de la grille de missions, du sélecteur de méthodes, ou
de l'anecdote d'ouvreur dans un vrai navigateur.** Ni e2e (`test/e2e-*.mjs`, le plan en
demandait un pour B §B.7 et suggérait la même discipline pour C §C.9 — aucun des deux n'a
été écrit, écart assumé faute de temps dans cette session), ni contrôle manuel.

**À faire en priorité ce soir ou à la prochaine session** : ouvrir l'app en prod, valider un
bloc, vérifier que la grille de missions apparaît et progresse, voter une méthode sur un
bloc, relire une fiche de bloc avec anecdote. Le risque principal si quelque chose ne va pas
est concentré sur `ClientDaily.tsx` (chantiers B et C y touchent tous les deux à la
transaction débouncée partagée — c'est exactement l'historique du bug V2.46).

---

## 6. Topo mis à jour

`topo-blocabrac-source.html` (pas `topo-roulettes-defis-source.html` — aucun catalogue de
roulette/défi n'a changé, seulement des fonctionnalités nouvelles).

- Nouvelle ligne "Carnet de méthodes" et "Missions de la semaine" (section 01 Client).
- Ligne "Blocabrac quotidien" et ligne "Blocs quotidiens" (section 02 Ouvreur) mises à jour
  pour mentionner l'anecdote d'ouvreur.
- Version/date de la page de couverture : V2.65 → **V2.68**, 12/09 → **24/09/2026**.
- **⚠️ La section 01 (Client) ne tenait plus sur une seule page A4** après ajout des deux
  nouvelles lignes — scindée en deux pages (`PAGE 3` + `PAGE 3b : 01 CLIENT (SUITE)`), même
  patron que la section 06 (Barème) qui avait déjà une page "SUITE". Les commentaires
  `<!-- PAGE N -->` suivants ont été renumérotés en conséquence (purement documentaire, sans
  effet sur le rendu). **Vérifié visuellement page par page** (lecture du PDF généré, pas
  seulement "ça compile") — plus aucun débordement, toutes les pages tiennent.
- Régénéré via `cd frontend && npm run topo` — **Playwright n'avait pas Chromium installé
  dans cet environnement**, `npx playwright install chromium` a été nécessaire avant que le
  script fonctionne. Si un futur environnement a le même souci, c'est la première chose à
  essayer.
- `topo-roulettes-defis.pdf` **non touché** — aucun changement de catalogue Roulette/défis
  dans ce plan.

---

## 7. Écarts assumés par rapport au plan

1. **Pas d'e2e navigateur** pour le carnet de méthodes (§B.7) ni les missions (§C.9) — voir
   §5, c'est le principal manque de ce lot.
2. **M4 bis a sa propre écriture dédiée**, pas fondue dans une écriture existante — le plan
   ne le demandait pas explicitement pour M4 bis spécifiquement (seulement pour M8, qui lui
   est bien fondu dans l'écriture Roulette existante), et le cas est rare par construction (un
   seul compte au plafond niveau au moment du plan). Documenté dans `CLAUDE.md`.
3. **Conception des règles B plus riche que ce que le plan esquissait** (voir §4) — pas un
   écart au sens d'un manque, plutôt une extension nécessaire pour couvrir la modification de
   vote que le plan §B.6 exigeait mais dont §B.5 ne détaillait que le cas initial.

Aucun écart sur les décisions produit elles-mêmes (M1 sur le geste, M4 bis, badge sans
points, seuil d'affichage à 3 votes) — toutes appliquées telles que tranchées dans le plan.

---

## Points ouverts par ailleurs (reportés, inchangés sauf mention contraire)

- **Vérification visuelle des 3 nouvelles fonctionnalités — voir §5, nouveau, prioritaire.**
- Migration état ludique : Passe C déployée en V2.61, purge
  (`purge-legacy-ludic-fields.js --fix`) toujours en attente.
- Clic « Redémarrer la saison » — à vérifier si déjà fait par l'utilisateur.
- Défis `fenetre` / `bloc_designe` : toujours en prod sans e2e navigateur.
- Chantier droits d'accès (rôle ouvreur trop large) — en attente du gérant.
- `topo-blocabrac.pdf` : à re-vérifier si la police Dosis s'affiche réellement dans le PDF
  généré (soupçon non levé aujourd'hui, pas dans le périmètre de cette session) ;
  `aide-connexion-installation.html` toujours hors charte.
- Un projet Firebase par salle vs mutualisé ; fork « Grimpe ! ».
- Sauvegarde durable des images Cloudinary (`--backup`).
- Idée "mode flash" du plan : **écartée explicitement, pas seulement reportée** (voir
  `CLAUDE.md`) — ne pas la réintroduire sans traiter l'incompatibilité avec
  `reconcile-classement-profiles.js` et l'absence de notifications push.
