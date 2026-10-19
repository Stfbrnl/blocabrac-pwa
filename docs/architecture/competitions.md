# Les compétitions

> Récit extrait de `CLAUDE.md` le 18/10/2026, lorsque celui-ci a dépassé la limite de
> 150 000 caractères. **Le texte n'a pas été réécrit** : c'est celui qui y vivait, à
> l'identique, titres compris. Ce qui s'applique **sans condition** (invariants courts,
> interdits, procédures) est resté dans `CLAUDE.md` ; ce document porte le *pourquoi*,
> l'histoire et les incidents — c'est-à-dire ce qui ne se lit qu'au moment d'y toucher.
>
> 📖 **À lire avant toute modification touchant inscriptions, modes de comptage, résultats verrouillés, palmarès gelé.**

---

## `competition_results` — written live, then locked

`ClientCompetitions.tsx` writes each boulder validation to `competition_results` immediately (`setDoc(..., {merge:true})`) rather than buffering in React state until submit — a discharged tab or a reload must never lose a validation. The success/fail click writes immediately; the repeated-entry fields (attempts, rating, proposed cotation) are debounced ~800ms to avoid a write per `Select` interaction. On opening the validation dialog, existing results for that user+competition are re-fetched to repopulate the UI (this is what makes a reload safe, not just the debounce). "Soumettre les résultats" is a **lock**, not a submit: a single `writeBatch` sets `submitted: true` + `submitted_at` on every result doc for that competition, and `firestore.rules` then refuses any further `update`/`create` by the owning client on a doc with `submitted: true` (admin/ouvreur keep unrestricted write access — deliberate status quo, see `docs/plans/PLAN-spark-images-competition.md` "Écart à trancher"). Once locked, the dialog goes read-only client-side too, but the enforcement that matters is server-side.


## `competition_participants` — one builder, three callers, and the identity it denormalizes

`utils/competitionParticipant.ts`'s **`buildCompetitionParticipant` is the only place this document is composed**, and `competitionParticipantId` the only place its deterministic id (`${uid}_${competitionId}`, which `firestore.rules` depends on for a cheap `get()`) is built. Three paths create an inscription — the admin's manual add (`AdminCompetitionRegistration.tsx`), "Générer le roster" (`AdminCompetitionManagement.tsx`) and **the climber's own self-registration** (`Client/Competitions/ClientCompetitions.tsx`, which is the *normal* path in this gym: climbers register themselves for every competition, the admin only as a fallback, and only the Finale is self-determined by the season classement).

⚠️ **Until 03/10/2026 those three paths had three different contracts, and the normal one was the incomplete one**: it wrote no `dateOfBirth`, no `gender`, no `level`, and an **empty name** — because it split `user.displayName` from Firebase **Auth**, which this project never populates (the name lives in `users`). The live display, which reads these off this document, therefore showed nameless lines and an "Inconnu" age category for every self-registered climber. Full account: `docs/handoffs/RETOUR-auto-inscription.md`. This was the project's **third** instance of "one document, several writers, divergent contracts", after `role`/`roles[]` and the ludic state — hence the builder, in the same spirit as `applyCompetitionValidationUpdate`. **Any new registration path must go through it.**

- **`?? null` on every optional field, never `undefined`** — Firestore rejects `undefined` in a `setDoc`, and the failure surfaces while registering someone, in the gym, in front of them. `null` is a legitimate state (an old account with no birth date); an **empty string is not**, and is what caused the original defect: `null` means "absent" and lets the live display's `users` fallback do its job, `''` claims to carry a value.
- **`is_client` merges `roles` + the legacy scalar `role`**, with a `true` fallback when no role is readable (every account carries `client` by convention). The two admin paths tested only `roles`, the self-registration hardcoded `true` — a fourth divergence found while centralizing.
- **The lock (`submitted`/`submitted_at`, written with `merge: true` by `ClientCompetitions.tsx` and `CompetitionJudgeEntry.tsx`) is deliberately NOT routed through the builder** — it is not a creation and touches no identity field. It does use the id helper.
- Guarded by a **property test** (`competitionParticipant.test.ts`), not three per-path cases: the builder always produces exactly `PARTICIPANT_FIELDS` and never `undefined`, checked over all 256 presence/absence combinations. Three separate tests would each stay green the day someone adds a fourth path, or a field to one caller only; this one fails by itself. Same shape as `classementFlushWrites.test.ts`'s 1024 combinations.
- Registration is open for a competition `à venir` **or** `en cours` (for late-comers), never `terminée`/`annulée` — `where('status', 'in', [...])`, no composite index. It was `== 'en cours'` until 03/10/2026, so nobody could register in advance; this went unnoticed because the screen was titled "Compétitions en cours" and therefore described its own gap faithfully. **A missing specification is contradicted by nothing** — the title now says what the list contains.
- The card's button label reads from **this climber's own** registrations (one query at mount), never from `registered_count`, the global counter: as soon as one climber registered, everyone else read "Valider mes blocs" and a late-comer could believe registration closed.


## Announcement texts published to climbers — composed in a pure function, never inline

⚠️ **Tout artefact destiné à sortir de l'application se compose dans une fonction pure, jamais en ligne dans un composant** (règle proposée par ClaudeNav, `docs/handoffs/RETOUR-auto-inscription-reponses.md` §3). The repo's test coverage stops at the edge of the `.tsx` files (no React harness), so anything composed inline there is **structurally invisible** — and that is exactly where two defects were born: the shareable progress image, then the classement announcement, whose `officiel` branch numbered `1, 2, 3` while the on-screen tables already shared ranks `1, 1, 3`. In the one mode where a perfect tie at rank 1 is an expected case (it triggers the super-finale). Found by reading, not by testing.

`utils/competitionAnnouncement.ts` now composes it (`buildPointsAnnouncement`, `buildOfficialAnnouncement`, `announcementTitle`), and its tests assert the property that survives a format change: **the message's ranks equal the screen's ranks**, section by section — not merely that the text looks right. No markdown (`**bold**`): `AnnouncementBanner.tsx` renders plain text.


## Le palmarès gelé, et les quatre règles qu'il a produites (V2.74, 15/10/2026)

`docs/plans/PLAN-classements-competition-5-novembre.md`, `docs/handoffs/RETOUR-classements-competition-5-novembre.md` et `docs/handoffs/RETOUR-classements-avant-deploiement.md`. Les quatre, dans l'ordre d'utilité :

> ⚠️ **Un palmarès est un fait daté, pas une requête.** Un résultat de compétition calculé à la lecture change quand la donnée sous-jacente change — et dans ce projet, elle change : une recotation réécrit l'histoire de tous ceux qui ont validé le bloc (02/10/2026, un bleu passé violet, 7 grimpeurs). Un score qui bouge abîme la confiance ; un podium qui bouge la détruit. D'où `competition_rankings`, **immuable par les règles** (`allow update, delete: if false` pour tout le monde, l'admin compris).

> ⚠️ **Tout artefact dont le calcul doit rester unique se compose dans l'application, jamais dans un script.** Le calcul vit en TypeScript dans `frontend/src/utils/` et n'est **pas atteignable** depuis un script CommonJS : `rolldown` (le bundler de Vite 8 — il n'y a pas d'esbuild ici) ne se résout que depuis `frontend/node_modules`, Node résolvant depuis l'emplacement du *fichier* et non le cwd. Le réimplémenter fabriquerait une cinquième divergence.

> ⚠️ **Un script de correction n'a pas besoin de recalculer : chercher d'abord le geste qui supprime, avant d'envisager un outil de compilation.** `unpublish-competition-rankings.js` supprime, et l'application republie avec l'unique calcul — plus sûr que reconstituer par un second code. Règle utile précisément au moment où l'on est déjà en train de chercher un bundler, c'est-à-dire où l'on ne se pose plus la question.

> ⚠️ **Tronquer à l'affichage protège l'écran ; tronquer à l'écriture protège la donnée.** `competition_rankings` est lisible par tout compte authentifié **et** immuable : un nom complet ou une date de naissance qui y entre par erreur n'est pas corrigeable depuis l'application. Le nom y est donc déjà tronqué (`shortParticipantName`), la catégorie d'âge remplace la date, et l'assertion de confidentialité porte sur le **document écrit**, jamais sur le DOM — une assertion sur le DOM serait verte avec un nom complet stocké.

⚠️ **Un critère d'égalité doit nommer ce qui, lui, doit DIFFÉRER** — sinon il est satisfait par le cas dégénéré où l'on compare la chose à elle-même (règle de ClaudeNav, `RETOUR-avant-deploiement-cloture.md` §5). C'est la symétrique exacte de la règle du 03/10 (« un critère de sortie doit prédire *toutes* les grandeurs observables, y compris celles dont on n'attend aucun mouvement ») : les deux se résument à **un critère qui ne nomme qu'une moitié de l'attendu se laisse satisfaire par la mauvaise**. Appliqué dans `e2e-palmares-flow.mjs` : « le palmarès republié est identique » exige d'abord que `published_at` ait changé.

⚠️ **Et un critère de rang ne discrimine que sur les dimensions que les critères antérieurs n'épuisent pas** (même source, §1) : proposer comme critère suivant un **agrégat** de grandeurs que le précédent compare déjà terme à terme ne peut jamais trancher — une somme de termes égaux est égale. C'est l'erreur de forme qui a produit la variante « le moins d'essais sur les blocs réussis ».

⚠️ **Une publication immuable mérite une confirmation, pas un avertissement** (même source, §3). Partout ailleurs un avertissement ignoré se répare plus tard ; sur `competition_rankings` (`update, delete: if false`) il ne se répare qu'avec la clé de service. Et celui qui clique le soir d'un contest n'aura lu aucun document : **un clic survit à ce contexte, une bannière non.** D'où l'interrupteur « Je publie quand même » qui garde le bouton inerte quand des niveaux de départ manquent — remis à zéro à chaque ouverture d'aperçu, sinon la confirmation ne confirme plus rien.

**Une partition par `max(A, B)` ne rend pas A constant à l'intérieur d'une part : elle le majore.** Erreur de raisonnement de ClaudeNav sur son propre §1.6, et c'est la forme générale à retenir — le classement par niveau max partitionne par `max(niveau de départ, couleur réussie)`, donc la couleur n'y est constante que pour les grimpeurs arrivés par leur performance. Le départage y est affaibli d'un cran, pas neutralisé.

⚠️ **Le mode `officiel` n'est pas gelable** et la publication le **refuse** (`isScoringModeGelable`) : `calculateCompetitionPoints` y renvoie 0 par construction, le gel donnerait un palmarès à zéro partout et définitif. À implémenter dans `utils/competitionRankings.ts` le jour où la Finale est confirmée, jamais dans l'écran d'administration.

⚠️ **Et le critère de départage ultime ne s'applique QUE si les deux grimpeurs ont réussi quelque chose.** « Le moins d'essais au total, échecs compris » (choix de l'utilisateur, maintenu le 15/10 après objection) comptait aussi les essais à 0 point : en début d'épreuve, **celui qui n'avait rien tenté passait devant celui qui avait essayé et échoué**, sur l'écran projeté. Trouvé par un pas d'e2e préexistant, pas par le test d'épinglage — dont la paire ex æquo avait, par construction, le même total d'essais. La variante « essais sur les blocs réussis » a été évaluée et **rejetée comme no-op** : à ex æquo réel, `compareTieBreak` a déjà égalisé les essais bloc par bloc, donc cette somme est identique par construction (prouvé sur 1 522 ex æquo tirés dans `competitionClassement.test.ts`).


## Competition scoring modes (`scoring_mode`) — competitions only, never the annual classement

Official/regular competitions (not the annual `classement des grimpeurs`) can pick one of four counting modes per competition, chosen via a button → menu in `AdminCompetitionManagement.tsx`, stored as `competitions.scoring_mode` (`'blocabrac' | 'blocs_valides' | 'personnalise' | 'officiel'`, defaults to `'blocabrac'` when absent). Three of the four (`blocabrac`/`blocs_valides`/`personnalise`) are **points-based** and go through `utils/climbingPoints.ts`'s `calculateCompetitionPoints` — a separate function from `calculatePoints`, never called by `classementScore.ts` or the mini-compétition path, so this feature cannot leak into the annual classement by construction. `officiel` is **not points-based at all** (see its own entry below) and has a completely separate calculation path in `competitionClassement.ts`.

- **`blocabrac`** (default): identical to the classic barème, degressive by attempt count — behaves exactly like `calculatePoints`.
- **`blocs_valides`**: each boulder carries its own `points_value` (set by the ouvreur/admin, invisible to climbers), awarded in full on success regardless of attempt count. Exists because the cotation is hidden in competition ("Mystère"), so a per-color barème doesn't reflect a boulder's actual relative difficulty — the ouvreur assigns points directly instead. For a boulder created for the event (`type: 'competition'`, `CompetitionBoulderForm.tsx`), `points_value` is a required field of that form when the competition is in this mode, and lives permanently on that competition-scoped doc. For a *reused daily boulder* (`type: 'daily'` + `competition_active`, tagged in via `CompetitionBouldersList.tsx`), `points_value` is edited inline in that list and is **cleared** (`deleteField()`) whenever the boulder leaves the competition (manual removal, or "Terminer la compétition") — the same physical boulder can be reused in a later competition with a different mode/value, so this field must never survive past this one competition's lifecycle on a shared doc.
- **`personnalise`**: a full custom barème for this competition only, stored as `competitions.custom_scoring` (`Record<color, {base, deduction}>`), editable in the same button → menu, pre-filled from the default `basePoints`/`deductions` when first opened.
- **`officiel`** (FFME/coupe du monde style): **not a points sum — a ranking**, by tops (most), then zones (most), then attempts-to-top (fewest), then attempts-to-zone (fewest) — `compareOfficialTotals` in `competitionClassement.ts`. ⚠️ **This ordering is from general IFSC/World Cup knowledge, not a reading of the current FFME rulebook** — verify before relying on it to settle a real official competition's final ranking (open item, flagged by review, never independently checked). Deliberately the **simplified** version agreed with the user (2026-08-16): a multi-key sort on totals **cumulated over the whole competition**, not the true IFSC/World Cup method (each boulder ranked independently among all competitors, those per-boulder ranks summed — a "ranking of rankings" recomputed continuously, judged too costly for the live TV screen's real-time listeners). `competition_results` gains two fields for this mode: `zone: boolean` and `attempts_to_zone: number`, written alongside `success`/`attempts` in the same debounced write `ClientCompetitions.tsx` already had (no extra write op, just two more fields on the same doc) — a top always implies the zone (`getOfficialParticipantTotals` counts it even if `zone` wasn't explicitly set, for results written before this field existed). `getOfficialParticipantTotals`/`getOfficialClassementByCategory` return `OfficialScoreEntry` (`{participant, totals: {tops, zones, attemptsToTop, attemptsToZone}}`) — a different shape from `ScoreEntry`, not a variant of it, because there's no single "score" to report. `CategoryGroup<T>` was made generic over the entry type (not just the participant) specifically to let both shapes share the same age/gender bucketing helpers (`groupByAge`/`groupByGender`) without duplicating that logic. All 3 classement screens (`AdminCompetitionStats.tsx`, `Ouvreur/CompetitionBoulders/CompetitionStats.tsx`, `AdminCompetitionLiveDisplay.tsx`) and the client validation UI (`ClientCompetitions.tsx`) branch on `scoring_mode === 'officiel'` to render tops/zones/essais columns instead of a score/points column.

  **Input consistency is enforced at entry, not after the fact** (`utils/competitionValidation.ts`'s `applyCompetitionValidationUpdate`, a pure function shared by every field in `ClientCompetitions.tsx`'s validation card, unit-tested in isolation): a top always forces the zone on, unchecking the zone always forces a recorded top back off (a top without a zone can never be saved), and attempts-to-zone is clamped to never exceed attempts-to-top — pre-filled to match it the moment the zone first becomes reached (the common case: same attempt), then re-clamped down if attempts-to-top is later corrected lower. The "essais (zone)" `Select` only offers `1..attempts` as options, reinforcing the same constraint in the UI, not just in the merge logic.

  **Ties are the normal state, not an edge case** — early in an event everyone is at 0 tops/0 zones. `rankOfficialEntries` (competition-style ranking: 1, 1, 3, not 1, 2, 3) is used everywhere an official-mode position number is shown, across all 3 classement screens.

  **The real target usage is a small "Finale de l'année" format, not a 90/35 competition** (learned 2026-08-16, after the mode was first built — see `docs/plans/ADDENDUM-mode-ffme-finale-annee.md`): 10 climbers, 5 boulders, single "open" category split by gender only. Two consequences that only apply to `officiel` mode:
  🔴 **PÉRIMÉ depuis le 03/10/2026, corrigé ici le 15/10 : l'écran live a désormais un repli sur `users`** (`AdminCompetitionLiveDisplay.tsx`, `u?.first_name || d.data().first_name || ''` et de même pour `last_name`/`dateOfBirth`/`gender`). Le défaut décrit ci-dessous est donc **réparé des deux côtés** (l'inscription écrit les champs via `buildCompetitionParticipant`, et l'écran se replie). ⚠️ Mais le repli a un coût d'observabilité nommé le 03/10 : il rend cet écran **insensible** à une participation vide, donc l'e2e qui le regarde ne rougit plus sur ce défaut — ce qui est protégé, c'est l'écriture, par le constructeur unique et le contrôle d'audit. Le paragraphe est conservé parce qu'il explique **pourquoi** les deux correctifs existent, et que la divergence des sources reste un choix à faire explicitement pour tout nouveau lecteur. Texte d'origine : *« l'écran live résout les participants UNIQUEMENT depuis `competition_participants`, sans repli sur `users` — contrairement aux deux écrans de classement »*. This mattered because the three registration paths are **not** equivalent: `AdminCompetitionRegistration.tsx` (manual add) and "Générer le roster" both copy those fields (the latter with `?? null`), but **the climber's own self-registration (`ClientCompetitions.tsx`, "S'inscrire") writes none of them** — no `dateOfBirth`, no `age`, no `gender`, no `level`, and a name split out of `displayName`. A self-registered climber therefore lands in the **"Inconnu"** age category on the TV while the classement screens show their real category — two screens contradicting each other about the same climber, during the event — and the age-category rotation, which is this screen's whole content, degenerates into one page of everyone: exactly the "90 lignes" it was designed to avoid (§5 of its conception doc). Found 03/10/2026 while verifying the ex-aequo tie-break against this screen, reproduced on the emulator, **not fixed** (it changes the data source of a screen that runs unattended during an event, so it needs an explicit decision; and it does not bite at all if the admin registers every participant). Anything else that reads a participant's identity or age must decide deliberately which of the two sources it uses — and `utils/ageCategory.ts`'s `getSeasonAge` stays the single place that derives an age, whichever source feeds it.

  ⚠️ **This screen is the only one of the three that PAGINATES, and the only one with no human watching it.** Page 1 is `globalClassement.slice(0, 10)` and its ranks are computed **on the slice** — correct only because the slice is a *prefix* (ranks of a prefix are the global ranks); paginating 11–20 would silently restart every page at 1. The repo has **no ErrorBoundary anywhere** (checked, not assumed), so a throw here is a white screen nobody sees fall. `test/e2e-live-display-flow.mjs` is the net: 8 steps, mutating Firestore **while the page is open** (the path the TV actually takes, via its two `onSnapshot`), and its two load-bearing properties were each seen red on their own — the prefix property by paginating `slice(1, 11)`, the shared-rank property by restoring `index + 1`. ⚠️ **Neither substitutes for the other**: under `index + 1` the prefix step stays green, because the seeded draw has no tie inside the top 10.

  - **`AdminCompetitionLiveDisplay.tsx` has no rotation for this mode** — `pages`/`ROTATION_INTERVAL_MS` only ever drive the 3 points-based modes now. `officiel` renders both gender groups **side by side, permanently** (`officialGenderGroups`), each independently filtered to participants with at least one top or zone (still showing a wall of 0-0 rows would bury the one thing worth looking at) and independently ranked via `rankOfficialEntries`.
  - **Judge-entered scoring, not self-declaration**: `pages/CompetitionJudgeEntry.tsx` (route `/competitions/judge-entry/:competitionId`, `allowedRoles={['admin','ouvreur']}`) is a grid (climbers × boulders) where a single judge enters everyone's top/zone/attempts — for blocs consécutifs sous le regard de tous, décidant d'un titre annuel, self-declaration doesn't carry the same weight it does in a casual 90-participant event. Writes to the exact same `competition_results` doc (`${uid}_${boulderId}_${competitionId}`) with the exact same debounce/flush/last-persisted pattern as `ClientCompetitions.tsx` — no schema change, no rules change (confirmed by `competition-results-lock.test.ts`: admin/ouvreur already have unconditional write access, including *creating* a result for a `user_id` that isn't their own). Locking is all-or-nothing (one "Verrouiller la finale" button batches `submitted:true` onto every participant at once), not per-climber — a deliberate simplification for a single-judge, single-sitting event. Reuses `applyCompetitionValidationUpdate` for the same input invariants as the client screen.
  - **A perfect tie at rank 1 resolves via a super-finale, not a shared title** (the user's call, 2026-08-16) — no dedicated code for this: the existing "add a boulder to a competition" flow (`CompetitionBoulderForm.tsx`/reusing a daily boulder) already lets an ouvreur add one more boulder to the same `competition_id` after the fact, and the judge enters results for just the tied climbers on it via the same grid — everyone else's totals are untouched since `getOfficialParticipantTotals` only accumulates from results that exist. The tie is visible to spot in the first place because both climbers already show rank 1 on the live display and in `CompetitionJudgeEntry.tsx`'s data.
  - A hand-computed 10-climber/5-boulder fixture, including a deliberate perfect tie at the top, is frozen as a test in `competitionClassement.test.ts` ("Finale de l'année") — the whole ranking is small enough to verify with a pencil, which is the strongest guarantee available at this scale.

Like `liveDisplayEnabled`, `scoring_mode`/`custom_scoring` are locked once a competition leaves `status: 'à venir'` — enforced **server-side** in `firestore.rules` (not just disabled in the UI), same `affectedKeys().hasAny([...])` pattern, same rationale: changing the mode mid-event would retroactively change everyone's score, not just future validations.


## `competitions.registered_count` — le seul document partagé du chemin du contest (19/10/2026)

Question posée par ClaudeNav (`docs/handoffs/2026-10-19-CN-apres-mesures.md` §2) : **existe-t-il
un document qu'un grand nombre de participants écrivent en même temps ?** Elle visait la
contention — sous contention, Firestore étrangle les écritures sur un même document, le client
réessaie, et un réessai est une écriture de plus. Réponse par recherche exhaustive dans
`frontend/src` : **oui, exactement un**, et ce n'est pas la contention qui mord.

Le chemin du contest est sinon **clos et par grimpeur** : `ClientCompetitions.tsx` n'écrit que
`competition_participants/{uid}_{compId}` et `competition_results/{uid}_{blocId}_{compId}`, et
n'importe ni `ludicState`, ni `classement_profiles`, ni `challenges`. Les deux autres agrégats
partagés de l'application — `boulders.methodCounts` et `boulders.firstAscents` — sont fermés
pendant une compétition (filtre sur `type !== 'daily'` **et** `competition_active`), et
`challenges.progress` est plafonné à 6 participants.

Reste `competitions/{id}.registered_count`, le « Participants : X/Y ». À l'échelle réelle la
contention n'a aucune prise : 40 inscriptions groupées dans les dix minutes avant le coup
d'envoi font 0,07 écriture/seconde, quinze fois sous le seuil. Le défaut était ailleurs — **ses
trois rédacteurs ne s'écrivaient pas de la même façon** :

| rédacteur | avant le 19/10 |
|---|---|
| `ClientCompetitions.tsx` (le grimpeur) | `increment(1)` ✔ |
| `AdminCompetitionRegistration.tsx` (ajout/retrait au comptoir) | `selectedCompetition.registered_count ± 1` ✖ |
| `AdminCompetitionManagement.tsx` (« Générer le roster ») | `competition.registered_count + added` ✖ |

Les deux derniers lisaient un nombre chargé **au montage de l'écran**, y ajoutaient 1, et
réécrivaient : toute inscription arrivée entre-temps était écrasée. Le scénario est exactement
celui du soir d'un contest — l'admin inscrit un retardataire au comptoir pendant que d'autres
s'inscrivent sur leur téléphone. Mesuré sur l'émulateur avant correction : un admin détenant
`registered_count = 0`, cinq inscriptions pendant qu'il remplit le formulaire, puis son ajout →
le compteur retombe à **1 au lieu de 6**, cinq inscriptions perdues sur six.

⚠️ **Tout nouveau rédacteur de ce compteur passe par `increment()`.** C'est la quatrième
occurrence dans ce dépôt de « un document, plusieurs rédacteurs, des contrats divergents »,
après `role`/`roles[]`, l'état ludique et `competition_participants` — et la première où les
rédacteurs divergeaient non sur la *forme* du document mais sur la *façon d'y écrire*.

**Enjeu réel, dit sans le grossir : un nombre faux à l'affichage.** Rien ne *garde* sur
`max_participants` — aucune inscription n'est refusée, aucun résultat n'est touché, et l'écran
de l'admin affiche déjà `participants.length`, donc le vrai compte. Ce qui décrochait est le
compteur que voient les grimpeurs. ⚠️ **Et il n'y a aucun filet permanent** : un retour à une
lecture-puis-écriture ne ferait rougir aucun test du dépôt.

### Le harnais d'écritures ne mesure pas l'application

`measure-competition-writes*.mjs` (août 2026) ne **fait pas tourner** `ClientCompetitions.tsx`,
il le **recopie** : son total est une somme de constantes littérales. Relancé le 19/10/2026 au
code de V2.75, il rend **7 470, au chiffre près** — le même qu'après V2.28. Il ne peut donc pas
vieillir, et ne peut pas non plus être rafraîchi : la seule mise à jour de ce chiffre est une
relecture du code. Son contre-exemple exact est `measure-competition-reads-after.mjs`, qui
totalise des `snap.size` et bouge donc avec la donnée. Voir la règle générale dans `CLAUDE.md`.

⚠️ Et **90 participants × 35 blocs était un surdimensionnement voulu**, pas une estimation : la
répétition générale retient 80 × 20. La marge ×2,7 sur les écritures est pessimiste par
construction. Ce qui reste ouvert est autre chose — la marge est calculée contre le plafond
**entier**, alors que le contest s'ajoute à une journée de salle complète.

### Le coût réel en écritures, mesuré dans le navigateur (19/10/2026)

`frontend/test/measure-competition-writes-browser.mjs` remplace le chiffre d'août par une
mesure : il compte **chaque entrée `writes`** des corps de requête partant vers
`/Write/channel`, lus depuis `page.on('request')` de Playwright. Les corps sont form-encodés et
en clair (`count=4&ofs=2&req0___data__={…}`) — la frontière du SDK est atteignable sans toucher
au bundle, ni patcher `fetch`.

⚠️ **L'unité comptée est le DOCUMENT, pas la requête HTTP.** WebChannel groupe plusieurs
opérations dans un seul POST, et Firestore facture au document écrit : compter les requêtes
aurait rendu un chiffre plausible et faux, du bon ordre de grandeur, donc invisible.

| | par grimpeur (20 blocs) | × 80 participants | % du plafond (20 000) |
|---|---|---|---|
| **borne basse** (tout au 1er essai) | **23** | 1 840 | 9,2 % |
| **borne haute** (rien au 1er essai) | **43** | 3 440 | 17,2 % |
| transcription d'août (90 × 35) | 83 | 7 470 | 37 % |

⚠️ **Pourquoi deux nombres et pas un** : `defaultValidationResult.attempts` vaut **1** sur cet
écran. Un bloc réussi au premier essai est donc déjà dans l'état que « Réussi » vient de
persister, et sélectionner « 1 essai » **n'écrit rien** — le dédoublonnage (`lastPersistedRef`,
V2.75) l'élide. Tout autre nombre écrit une seconde fois. **Le coût par grimpeur dépend donc de
son taux de flash, une grandeur de la salle et pas du code.** Un seul passage du script
n'échantillonne qu'une valeur ; il impose les deux bornes (`MESURE_ESSAIS=flash|varie`), et la
valeur intermédiaire est libellée « hypothèse, PAS une mesure ».

**On mesure l'unité, on modélise le multiplicateur, et la sortie dit lequel est lequel** — « 43
observées × 80 supposés » est honnête ET révisable : si l'épreuve compte 35 blocs et non 20, on
change le multiplicateur sans refaire la mesure (la borne haute remonte alors vers 5 800, 29 %).

⚠️ **Hors périmètre et non mesuré** : les écritures de l'admin (~250 — verrouillage groupé des
niveaux, `level_at_start` au coup d'envoi, palmarès), celles d'un grimpeur qui valide aussi des
blocs du jour le même soir (`classement_profiles`, `user_ludic_state`, `challenges`), et **la
part du quota qu'une journée de salle ordinaire a déjà consommée** — la mesure est
mono-utilisateur, et seule la console Firebase dira ce qui restera le soir du 5.

**Filet du compteur partagé** : `audit-prod-catalog.js` compare désormais, pour chaque
compétition, `registered_count` au nombre réel de participations, affiché à chaque exécution
même à zéro, sans aucune lecture supplémentaire (les deux collections sont déjà chargées).
⚠️ **Né VERT, et vérifié tel** : 1 compétition en prod, 0 écart — le défaut de mise à jour
perdue exigeait de la **concurrence**, et avec 2 participations il n'a jamais tiré. « Un
correctif à l'écriture ne répare pas le passé » ne dit rien de la question de savoir si le passé
est abîmé : il faut compter. Exercé dans les deux sens sur l'émulateur (3 annoncés pour 2 réels
→ rouge ; 1 pour 1 → muet). ⚠️ Il attrape la **conséquence**, jamais le **retour en arrière** :
un `registered_count: x + 1` réintroduit dans un composant ne serait vu qu'après une soirée de
concurrence réelle.

### Le taux de flash, et le filet statique du compteur (19/10/2026)

`scripts/mesure-taux-de-flash.js` (lecture seule) situe le curseur entre les deux bornes
d'écritures ci-dessus, à partir de ce que la base contient : **81,7 % des réussites sont à un
essai** (188 sur 230). Soit ≈ 26,7 écritures par grimpeur sur 20 blocs, 2 132 à 80 participants,
10,7 % du plafond.

🔴 **Et le premier chiffre obtenu, 85,2 %, était contaminé.** Jusqu'à **V2.69 (25/09/2026)**
l'écran des blocs du jour avait une **valeur par défaut à 1 essai** — son changelog l'annonce
(« plus de valeur par défaut à 1 essai »). Tout résultat antérieur dont le grimpeur n'a pas
touché le `Select` porte donc `attempts: 1` sans avoir été flashé. Le script découpe sur
`createdAt` (immuable) et ne retient que la population postérieure. L'effet de la contamination
est de **3,5 points** : réel, mesuré, petit. ⚠️ **Toute statistique future tirée de `attempts` sur
`client_boulder_results` doit faire ce découpage.**

⚠️ **Ce taux est un MINORANT du coût réel, jamais une prédiction** : il est mesuré sur des blocs
du jour, que le grimpeur voit, connaît et répète, alors qu'un bloc de contest se découvre à vue
et se cote « Mystère ». Le flash y sera plus rare, d'une quantité inconnue. **La borne haute
(3 440, 17,2 %) reste la valeur de dimensionnement.** Le script bascule tout seul sur
`competition_results` quand cette population dépassera 100 réussites — elle est à **0** au
19/10.

**Et le contrat d'écriture est désormais gardé statiquement** :
`frontend/test/contrats/registeredCount.test.ts`, dans `npm test`, exige que tout appel
d'écriture Firestore de `frontend/src` posant `registered_count` utilise `increment(…)` — ou le
littéral `0` à la création, seule exception. Il complète l'audit de prod, qui n'attrapait que la
**conséquence** : une régression se verrait ici **pendant qu'on écrit le code**, et non après une
soirée de concurrence. Ses deux propriétés ont été vues rouges séparément, et la seconde
(« on trouve bien ces écritures », une assertion de TAILLE) est indispensable : quand la
reconnaissance d'appels devient aveugle, la première reste verte sur un ensemble vide.
⚠️ Il reconnaît les écritures **par leur nom** — un alias, une autre méthode de batch, ou les
scripts d'administration lui échappent.

### La marge réelle du 5 novembre, enfin mesurée (19/10/2026)

Tous les calculs de quota d'août comparaient la charge d'une compétition au **plafond entier**,
alors que le contest s'ajoute à une journée de salle ordinaire dont la consommation n'avait
jamais été relevée. C'était la dernière inconnue. Elle est levée.

`scripts/sonde-metriques-firestore.cjs` lit Cloud Monitoring. ⚠️ **Et cela n'est possible que sur
Blaze** : `timeSeries.list` répond « This API method requires billing to be enabled » sur un
projet Spark, sous toutes les formes de requête, pendant que `metricDescriptors` répond 200 — le
script porte la chronologie complète de cette découverte dans son en-tête.

Sur 30 jours de production :

| | moyenne/jour | pire jour | part de la franchise |
|---|---|---|---|
| lectures | 2 288 | **11 990** (02/10) | 24 % de 50 000 |
| écritures | 102 | **635** (23/09) | 3,2 % de 20 000 |
| suppressions | 5 | 16 | 0,1 % |

⚠️ **Les pics de LECTURES sont les audits de production eux-mêmes, pas des grimpeurs** — les
trois plus hauts tombent sur des jours de séance. Le bon témoin de l'activité réelle est
l'**écriture** : chaque validation en produit une, et elles sont minuscules.

**D'où la marge du 5 novembre, en écritures :** 635 (pire journée de salle observée) + 3 440
(borne haute mesurée du contest) + ≈ 250 (admin) = **4 325, soit 21,6 % de la franchise
quotidienne**. La part déjà consommée est donc négligeable, et la marge ×2,7 d'août était
pessimiste pour deux raisons cumulées : un surdimensionnement voulu, et une journée de salle
quasi vide.

⚠️ **Et depuis le passage en Blaze, ces plafonds ne sont plus des murs mais des franchises** :
un dépassement est facturé au lieu de faire refuser les opérations. Le risque du 5 novembre
passe de « l'application s'arrête en pleine épreuve » à « cela coûte quelques centimes ». Les
documents de chantier d'août qui écrivent « gratuité totale, plan Spark » sont des faits datés.

⚠️ **Trois défauts d'instrument trouvés en produisant ces chiffres, tous rendant un nombre
plausible** : les jours libellés par `interval.endTime` (toutes les lignes décalées d'un jour,
la dernière portant une date future), puis **deux résumés `awk` cassés par l'espace insécable
que `toLocaleString('fr-FR')` insère** — « 9 568 » se lisait « 9 », et le total s'effondrait sur
une valeur petite et crédible. **Ne jamais gratter la sortie formatée d'un script : réinterroger
l'API.**

⚠️ **La sonde est QUALIFIÉE, et par prédiction plutôt que par comparaison d'écran.** Le contrôle
prévu était « comparer un total à l'onglet Statistiques de la console pour le même jour » ; une
charge dont on connaît la taille exacte est plus forte, à condition d'écrire la prédiction
d'avance. `mesure-taux-de-flash.js` lit 936 documents plus une requête vide (facturée 1 lecture
minimum) : prédiction posée **+936 ou +937**, mesure **+936**.

🔴 **Et la trace a livré le piège le plus dangereux de la série, qui n'était pas prévu** :
l'ingestion de Cloud Monitoring prend 3 à 5 minutes **et elle arrive par tranches**.

| relevé | écart affiché | ce qu'on en conclurait |
|---|---|---|
| +0,8 min | +0 | « la sonde ne voit rien » — faux, mais **repérable** |
| +3,0 min | **+741** | « +741 » — plausible, faux, et **non repérable** |
| +4,5 min | +936 | la valeur réelle |

Le zéro du début se repère parce qu'il est manifestement incomplet ; le 741 intermédiaire ne se
repère pas, parce qu'il est *correct pour ce qu'il contient* et simplement pas fini.
⚠️ **D'où la règle d'usage, non négociable : ne lire que des journées CLOSES.** Un relevé nocturne
sur « hier » est sûr ; un tableau de bord affichant « aujourd'hui » montrerait un nombre qui
dérive à la hausse pendant des minutes, sans jamais dire qu'il n'est pas terminé. Cela condamne
la variante « écran qui interroge l'API en direct » et confirme la forme proposée par ClaudeNav :
un script nocturne qui écrit **un** document par journée révolue.
