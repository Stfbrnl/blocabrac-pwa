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

Official/regular competitions (not the annual `classement des grimpeurs`) can pick one of five counting modes per competition, chosen via a button → menu in `AdminCompetitionManagement.tsx`, stored as `competitions.scoring_mode` (`'blocabrac' | 'blocabrac_plancher' | 'blocs_valides' | 'personnalise' | 'officiel'`, defaults to `'blocabrac'` when absent). Four of the five (`blocabrac`/`blocabrac_plancher`/`blocs_valides`/`personnalise`) are **points-based** and go through `utils/climbingPoints.ts`'s `calculateCompetitionPoints` — a separate function from `calculatePoints`, never called by `classementScore.ts` or the mini-compétition path, so this feature cannot leak into the annual classement by construction. `officiel` is **not points-based at all** (see its own entry below) and has a completely separate calculation path in `competitionClassement.ts`.

- **`blocabrac`** (default): identical to the classic barème, degressive by attempt count — behaves exactly like `calculatePoints`.
- **`blocabrac_plancher`** (V2.76, 28/10/2026) : « la décroissance qui s'aplatit ». Même base par couleur (jaune 25 → rose 1000), mais `base × (0,25 + 0,75 × 0,85^(essais−1))`, arrondi à l'entier le plus proche **une seule fois, à la fin** (jamais sur une valeur intermédiaire). Le détail est dans `docs/handoffs/2026-10-28-CN-plan-bareme-plancher.md` ; ce qui suit est **pourquoi il est ainsi**.

  **L'incident qui l'a produit.** Un grimpeur a soulevé la question : dans le barème `blocabrac`, un bloc arraché après beaucoup d'essais finit par ne plus rien rapporter — un **noir en cinquante essais valait 0**, un blanc valait 0 dès le 17ᵉ essai. Pire, la déduction étant un chiffre **propre à chaque couleur** (50 sur base 800 pour le blanc, 20 sur base 600 pour le noir), le blanc était **moins tolérant** qu'un noir : l'ordre des couleurs s'inversait aux grands nombres d'essais. C'est l'« anomalie du blanc ».

  **Pourquoi un nouveau mode, et pas une correction de `calculatePoints`.** C'était la tentation naturelle — l'anomalie est dans `calculatePoints`, donc on la corrige là. Et c'était faux : `calculatePoints` est **partagé** avec le classement quotidien, dont `scripts/reconcile-classement-profiles.js` recalcule l'attendu **depuis tout l'historique** de `client_boulder_results`. Modifier cette fonction n'aurait pas recoté un bloc : à la passe de réconciliation suivante, elle aurait **réécrit d'un coup les points de tous les grimpeurs sur tous les blocs jamais validés** — la même classe d'effet qu'une recotation, mais à l'échelle de la base entière, et sans que personne l'ait demandé. C'est la leçon du 02/10 (« recoter un bloc déjà validé réécrit rétroactivement le score de tous ceux qui l'ont validé ») appliquée à toute la collection.

  **Le raisonnement qui tranche, et qui vaut au-delà de ce lot** (décision de Stéphane) : *une compétition se joue et se clôt, donc on peut changer ses règles entre deux éditions ; le classement général est cumulatif et recalculé, donc toute modification de son barème réécrit tout son passé.* D'où :

  > **Le barème de compétition peut changer aujourd'hui. Le barème quotidien ne peut changer proprement à aucune date.**

  C'est un argument pour garder les deux séparés **durablement**, pas seulement cette fois-ci. ⚠️ **L'anomalie du blanc reste donc en place au quotidien**, et c'est assumé : la corriger vaut le déplacement qu'elle provoquera dans le classement général, ou elle ne le vaut pas, et c'est une question ouverte — jamais un oubli à rattraper au passage.

  **Le moment choisi.** Zéro compétition jouée cette saison (vérifié en prod le 28/10 : une seule `competitions`, le Contest du 5 novembre, `status: 'à venir'`, **0 `competition_results`**, 0 palmarès publié). Aucune règle n'est donc modifiée en cours de route et aucun score existant ne bouge. ⚠️ Le plan parlait de « trois compétitions de test » à ne pas rattraper : c'était un **fait daté** repris d'un document antérieur, il n'en restait aucune. Un chiffre repris d'un document n'est pas un état courant — le relire en prod coûte une requête.

  **Ce que la courbe garantit**, vérifié comme **propriétés** sur 1 à 500 essais et pour les huit couleurs (`climbingPoints.test.ts`), chacune vue rouge **séparément** par une casse dédiée :

  | propriété | pourquoi elle tient |
  |---|---|
  | un bloc réussi ne vaut **jamais** zéro | plancher à 25 % de la base, par construction |
  | l'ordre des couleurs est **strict à tous les nombres d'essais** | le facteur ne dépend que des essais, **jamais de la couleur** |
  | l'anomalie du blanc est **supprimée** | il n'y a plus **aucun paramètre propre à une couleur** |
  | la perte est forte au début, négligeable à la fin | −11 % de la base au 2ᵉ essai, −0,6 % au 20ᵉ |
  | un flash reste nettement devant un combat | noir flashé 600, noir en 50 essais 150 |
  | un bloc dur arraché ne dépasse pas un bloc plus facile flashé | noir à 50 essais (150) < violet flashé (200) |
  | le flash est le **maximum** | `attempts` borné à 1 dans `plancherPoints` (voir ci-dessous) |

  ⚠️ **`attempts` est borné à 1 par le bas, à l'intérieur de `plancherPoints`** — pas chez l'appelant. À 0 essai, `0,85^(0−1)` vaut 1,18 : le facteur **dépasserait 1** et un bloc vaudrait **plus** que son flash. `Number.isFinite` couvre aussi `NaN`/`Infinity`. Un invariant énoncé dans la fonction tient pour tous ses appelants présents et futurs ; posé chez l'appelant, il se perd au premier appelant suivant.

  ⚠️ **La table des points est un artefact qui SORT de l'application** (§5 du plan : la table est affichée à l'accueil, pas la formule — « la phrase donne l'intention, la table donne les chiffres », et personne ne lira la formule). Elle est donc **épinglée par un test**, et les 88 valeurs du test sont la **source** de l'affiche : l'affiche s'en recopie, jamais l'inverse. Un chiffre affiché qui ne serait pas celui que le code calcule serait pire que l'ancien barème — et c'est le grimpeur qui a soulevé la question qui s'en apercevrait le premier.

  ⚠️ **Ce que cet épinglage ne peut pas attraper**, écrit dans son propre commentaire : il garde la table contre une **dérive future**, il ne dit rien de la justesse du barème **aujourd'hui**. Un épinglage garde le passé, pas le présent. La justesse est gardée par les propriétés du tableau ci-dessus, qui sont d'une autre nature. ⚠️ **Une cellule du plan a d'ailleurs dû être corrigée par ce test** : noir à 2 essais vaut `600 × 0,8875 = 532,5`, et le plan écrivait **532** — la seule des 88 cellules où il arrondissait l'autre moitié. `Math.round` rend **533**, et c'est 533 qui part sur l'affiche. Le test a été écrit avec les valeurs du plan **avant** d'être exécuté, précisément pour que la divergence apparaisse au lieu d'être recopiée.

  ⚠️ **Deux chiffres FIXES** (`PLANCHER_RATIO = 0.25`, `PLANCHER_TAUX = 0.85`), exportés pour les tests et volontairement **non paramétrables par compétition** : le mode `personnalise` existe déjà pour qui veut régler lui-même, et un troisième chemin de réglage serait une divergence de plus à tenir.

  ⚠️ **La clé technique décrit la RÈGLE, jamais son rang d'apparition.** `blocabrac_v2` vieillit mal : dans six mois personne ne sait ce que v2 désignait, et un v3 rend le v2 illisible. Le libellé à l'écran peut changer au gré du gérant ; la clé, qui est écrite dans les documents de prod, ne peut plus changer.

  ⚠️ **Un client sur un ancien bundle retombe silencieusement sur `calculatePoints`** : la branche du mode n'existe pas dans son code, donc `blocabrac_plancher` n'y correspond à rien et le `return` final s'applique. Il verrait l'**ancien** barème, sans aucun message — plausible et faux. **L'ordre est donc : déployer, PUIS poser le mode sur la compétition de prod.** Jamais l'inverse. Et c'est une raison de plus pour le point « acceptez la mise à jour » de l'annonce aux grimpeurs.

  **Ce que ce lot n'a volontairement pas touché** : `calculatePoints` (mot pour mot inchangé, et **aucun test existant modifié** — c'était le signal d'alarme du plan, et il est resté silencieux) ; aucun paramétrage par compétition ; aucun rattrapage des compétitions passées (un mode se choisit à la création, il ne se rejoue pas) ; rien sur la chaîne des niveaux, gelée jusqu'au 6 novembre.

  **Le départage n'a rien demandé** : `competitionClassement.ts` mesure la dureté d'un bloc par `calculateCompetitionPoints(boulder, 1, true, mode)`, et dans ce mode le facteur à 1 essai vaut exactement 1 — la dureté y est donc la base de la couleur, comme dans `blocabrac`. Une définition unique de « le plus dur » qui reste juste dans les quatre modes à points, et pas une cinquième à écrire.

  **Deux unions locales du type ont été supprimées au passage** (`CompetitionBoulderForm.tsx`, `CompetitionBouldersList.tsx`) : elles recopiaient la liste des modes, et celle du formulaire avait **déjà divergé** — elle ignorait `'officiel'`. Elles importent maintenant `ScoringMode`. Un sixième mode n'ouvrira plus ces fichiers.
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


## Le multiplicateur de points par bloc (`points_multiplier`, V2.77, 03/11/2026)

Plan : `docs/plans/2026-11-03-CN-plan-multiplicateur-v2.md`. Le gérant a annoncé aux grimpeurs
que les blocs d'un mur neuf compteraient double, sans consultation, à deux jours du contest du
5 novembre — mais il le voudra à l'avenir. D'où une **fonctionnalité durable** et non un
correctif de 48 heures : un sélecteur ×1/×2 en face de chaque bloc de la liste des blocs d'une
compétition, pour les deux formes de bloc, modifiable à tout moment pendant l'épreuve.

### Pourquoi un nombre et non un booléen

Un correctif de 48 heures veut un booléen, qu'on ne peut pas mal poser. Une fonctionnalité
durable veut le nombre, pour n'avoir **jamais à migrer la donnée** le jour d'un ×3. Le champ
est donc un nombre ; l'interface n'expose que ×1 et ×2 ; et `firestore.rules` porte une **liste
blanche** (`isValidPointsMultiplier`, valeur absente, `null`, 1 ou 2). Élargir plus tard, c'est
une valeur dans la liste et une option dans le menu.

⚠️ **La liste blanche n'est pas décorative.** Sans elle, un `0` ou un `0,5` posé par erreur
annulerait des points **sans rien afficher d'anormal** : le champ ne se lit nulle part avant
d'avoir déjà faussé un classement. Et c'est aussi pourquoi il n'y a **aucun repli dans le
code** — un `Math.max` ou une normalisation silencieuse rendrait aveugle au défaut qu'il
compense. La règle serveur fait foi, comme pour le verrou de `competition_results`.

### 🔴 Le cycle de vie, et l'inversion qu'une lecture a révélée

`ClientCompetitions.tsx` porte depuis le chantier « comptes de points » ce commentaire sur
`scoring_mode` : « n'affecte que l'aperçu de points affiché ici pendant la validation, **pas ce
qui est écrit dans `competition_results`** ». Et l'interface `ValidationResult` le confirme :
`competition_results` stocke `success`, `attempts`, `rating`, `proposedDifficulty`, `zone`,
`attemptsToZone` — **des faits bruts, aucun point**. Les points sont **recalculés à chaque
affichage** depuis le mode et le bloc.

**Conséquence**, et c'est tout le chantier : si le multiplicateur était supprimé à la clôture —
comme l'est `points_value`, et comme la première version du plan le prescrivait — alors tout
recalcul postérieur d'une compétition terminée rendrait les blocs doublés **au simple**.
L'histoire changerait après coup. Le champ n'appartient donc **pas** au groupe de
`points_value` (effacé à la clôture) mais à celui de **`competition_id` (conservé pour
l'historique)**.

Mais conserver le champ ouvre le défaut inverse : un bloc quotidien réutilisé dans une
compétition future hériterait du ×2. **Les deux exigences ne se contredisent qu'en apparence :
la remise à zéro ne va pas à la clôture, elle va au RATTACHEMENT.**

| moment | `points_value` | `points_multiplier` |
|---|---|---|
| **Rattachement** (`handleConfirmAddExisting`) | — | **effacer** ← la ligne nouvelle |
| **Retrait de l'épreuve** (`handleConfirmRemove`) | effacé | **effacer** |
| **Clôture** (`handleConfirmMigrate`) | effacé | **CONSERVER** ← l'inversion |

`handleConfirmAddExisting` écrase déjà `competition_id` et pose `competition_active` dans son
`batch.update` : la remise à zéro y est une clé de plus dans un objet déjà écrit, et c'est le
**seul** endroit où un bloc change de compétition.

⚠️ **Deux des trois clauses sont des ABSENCES, et une absence ne s'observe pas en exécutant un
geste.** Le défaut n'apparaîtrait qu'à la consultation d'un classement passé, des semaines plus
tard, et il ressemblerait **trait pour trait** à un classement normal — aucun écran n'affiche
« ×1 » là où il y avait « ×2 ». D'où `frontend/test/contrats/pointsMultiplier.test.ts`, qui lit
les **sources** (même doctrine que `registeredCount.test.ts`) : le contrat est statique, il se
garde statiquement, et il échoue à `npm test` pendant qu'on écrit le code.

### Le multiplicateur s'applique APRÈS l'arrondi

`calculateCompetitionPoints` est devenue un **emballage d'une ligne** autour du calcul
historique, inchangé mot pour mot et désormais interne (`pointsAvantMultiplicateur`) :

```ts
export const calculateCompetitionPoints = (...) =>
  pointsAvantMultiplicateur(...) * (boulder.points_multiplier ?? 1);
```

Un emballage et non une ligne glissée dans le corps, parce que le corps a **cinq retours
anticipés** — il n'y a pas de « fin » où glisser quoi que ce soit. Cette position couvre les
cinq modes **uniformément** (`blocs_valides` et `officiel` compris, où elle est un no-op) et
`success: false` rend 0, dont le multiple est 0 : aucun cas particulier, aucune branche par
mode à tenir à jour le jour où un sixième mode arrive.

⚠️ **L'ordre vaut un point.** En `blocabrac_plancher`, arrondir **puis** doubler rend
exactement le double de ce que l'écran affiche — une propriété que le grimpeur vérifie de tête.
L'ordre inverse décale **86 des 160 combinaisons** couleur × essais (mesuré) : un violet à
3 essais afficherait 158 et créditerait 317 au lieu de 316, un écart de 1 point inexplicable au
micro.

⚠️ **Les chiffres du §D3 du plan étaient faux, et c'est le test qui l'a dit** : il annonçait
« violet, 3 essais → 144, donc 288 contre 289 », la valeur réelle étant 158, donc 316 contre
317. Écrits dans le test **avant** exécution, les chiffres fournis se sont manifestés comme
faux au lieu d'être recopiés depuis le code — même forme d'erreur que la cellule du barème à
plancher du 28/10. La **conclusion** du plan, elle, tenait entièrement.

### ⚠️ CINQ sites composent un bloc pour le calcul, pas deux

Le §3 du plan annonçait « les deux déclarations : l'ouvreur et `ClientCompetitions.tsx` ». Il y
en a **cinq**, parce que chacun mappe ses champs **un par un** plutôt que par étalement :
`AdminCompetitionLiveDisplay.tsx` (écran live TV), `AdminCompetitionManagement.tsx`
(publication du palmarès gelé), `AdminCompetitionStats.tsx`,
`Ouvreur/CompetitionBoulders/CompetitionStats.tsx`, et `ClientCompetitions.tsx` (l'aperçu du
grimpeur). **Un seul qui oublie le champ compte le SIMPLE pendant que les autres comptent le
double, sur la même compétition** — et c'est l'écran de l'admin qui proclame.

### Ce que le multiplicateur fait au classement, et ce qu'il n'y fait pas

- **Il COULE DANS LE DÉPARTAGE**, et c'est voulu : `getParticipantScores` mesure la dureté d'un
  bloc par `calculateCompetitionPoints(bloc, 1, true, mode)`, donc un violet ×2 (400) se mesure
  aussi dur qu'un rouge (400). Dans un mode à **points**, la dureté *est* la valeur en points —
  c'est déjà le choix accepté pour `blocs_valides`, où la cotation ne reflète plus la
  difficulté. Une seconde voie de calcul de la dureté serait une divergence de plus.
  **C'est annonçable : un bloc doublé compte double partout, départage compris.**
- **Le classement PAR NIVEAU MAX n'est PAS affecté** : il partitionne par `boulderColorKey` (la
  couleur du bloc), jamais par ses points. Un violet ×2 reste un violet et ne fait monter
  personne dans le paquet rouge.

Les deux moitiés sont testées, parce qu'une seule d'entre elles ne décrirait pas le système. En
supprimant la multiplication, les tests à points rougissent et **ceux de niveau max restent
verts** — c'est cela qui montre leur indépendance plutôt que de la supposer.

### L'asymétrie assumée avec `scoring_mode`

`scoring_mode` est **verrouillé côté serveur** dès que la compétition quitte `status: 'à
venir'`, précisément parce que le changer en cours d'épreuve changerait rétroactivement le
score de tout le monde. **`points_multiplier` ne l'est pas**, et c'est une demande explicite du
plan (« activable et modifiable à tout moment pendant la compétition ») : le gérant peut décider
du mur doublé la veille comme en cours de soirée. L'asymétrie est réelle et tenue par la
procédure, pas par les règles — le topo le dit : **régler les multiplicateurs avant le coup
d'envoi, et avant de publier le palmarès**, qui est immuable.

### Le défaut latent que cette lecture révèle, et qu'il ne faut pas corriger avant le 6

Si rien ne stocke les points et que `points_value` est **supprimé à la clôture**, alors une
compétition `blocs_valides` terminée se recalcule **déjà aujourd'hui** avec des valeurs
disparues. C'est peut-être sans effet — si seul le palmarès gelé est affiché pour une épreuve
terminée — ou c'est un défaut réel. **Noté, pas touché** : ce n'est pas le chantier de cette
semaine, et le gel tient.


## Le plafond de 500 opérations par lot, et l’échelle qui l’a rendu atteignable (03/11/2026)

Le 3 novembre, à J-2 du contest, le gérant a changé une hypothèse de conception sans le
savoir : la compétition du 5 novembre porterait **tous les blocs de la salle** — dix murs —
et non les quelques dizaines envisagées. Les murs Grande Face et Dalle venaient d’être
ouverts (23 blocs, tous ×2), la Grotte devait suivre le jeudi.

Rien dans le multiplicateur ne bronche à cette échelle. Ce qui bronche, c’est l’écran qui le
règle. **`CompetitionBouldersList.tsx` a quatre gestes qui écrivent une opération PAR BLOC** :
le rattachement de blocs quotidiens existants, l’application en masse du multiplicateur, la
clôture (« Terminer la compétition »), et la renumérotation. Les trois premiers étaient un
`writeBatch` unique et non borné ; le quatrième était une boucle de `updateDoc` séquentiels.

### Pourquoi c’est la pire forme de panne, et non une lenteur

Un `writeBatch` Firestore accepte **au maximum 500 opérations**, et son échec est
**tout-ou-rien** : au-delà, `commit()` lève et absolument rien n’est écrit. Le défaut
appartient donc exactement à la classe décrite dans
`docs/architecture/tests-et-fiabilite.md` — une panne **permanente et déterministe**
(chaque nouvelle tentative échoue à l’identique) **déguisée en panne transitoire** par un
« Une erreur est survenue » générique. Celui qui clique le soir d’un contest rechargerait,
recliquerait, et conclurait que l’application est cassée.

Le geste le plus exposé est **la clôture**, et c’est aussi le moins rattrapable : un échec
total y laisse tous les blocs `competition_active`, donc la cotation cachée invisible et la
salle entière encore en compétition.

### Ce qui a été fait, et la raison de la forme choisie

`utils/firestoreBatchChunks.ts` — `decouperEnLots`, pure, sans aucun import Firestore (donc
testable sans émulateur, même discipline que `classementFlushWrites.ts`), et
`MAX_OPS_PAR_LOT = 450`. Le motif n’est pas neuf : il existait **déjà en ligne** dans
`AdminUsers.tsx` (`setLevelOverrideForAll`), avec le même 450 et le même commentaire. Ce
module le nomme une fois au lieu de le recopier — ce n’est pas un second chiffre à tenir
synchronisé.

> ⚠️ **C’est un garde de SEUIL, pas une optimisation.** Sous 450, `decouperEnLots` rend un
> lot unique : le geste est identique à l’ancien, atomicité comprise. Il ne change quelque
> chose que dans le cas qui, sans lui, ne marcherait pas du tout. C’est ce qui rend son ajout
> sans risque à J-2 — et c’est la propriété qu’un test épingle en premier, parce qu’un
> découpage qui rendrait deux lots de 75 pour 150 blocs casserait l’atomicité de la clôture
> sans qu’aucun autre test ne s’en aperçoive : l’écran continuerait de « marcher ».

### La contrepartie, qui devait être dite et non cachée

> ⚠️ **Le découpage échange « rien n’est écrit » contre « peut-être une partie ».** Un garde
> qui améliore le pire cas dégrade donc le cas moyen de l’échec, et le message d’erreur doit
> le DIRE.

Le cas le plus net était l’action en masse, dont le message affirmait **« Aucun bloc n’a été
modifié »** : vrai avec un lot unique, **faux** dès qu’il y en a deux. Un message faux sur un
écran qui règle des points vaut pire que pas de message — l’ouvreur se fierait à une salle
qu’il croit intacte. Les quatre gestes comptent désormais leurs lots commités et distinguent
« rien écrit » de « une partie écrite », en nommant la réparation : les trois écritures sont
**idempotentes**, relancer la même sélection est sans danger.

### L’effet de bord de l’échelle que personne n’aurait vu — et qui n’est PAS un bug

`firestore.rules` refuse **côté serveur** les premiers ascensionnistes et les votes de
méthode sur tout bloc portant `competition_active` (« la méthode employée renseigne sur la
difficulté, qui reste cachée pendant une grosse compétition »). La règle a été écrite pour
quelques blocs ; avec toute la salle engagée elle s’applique à **tous les blocs noir, blanc
et rose de la salle** pendant toute la durée de l’épreuve.

Les votes de méthode se rattrapent — on vote après. **Les premiers ascensionnistes ne se
rattrapent pas** : `shouldRecordFirstAscent` est évalué à l’instant de la validation, et
rien n’est rétroactif. La liste n’est pas perdue (le document n’est jamais supprimé, et les
cinq places se rouvrent dès la clôture) : elle est **mal attribuée**. Sur les murs ouverts
la veille du contest, les cinq noms finiront par être ceux des grimpeurs d’après le
5 novembre, pas ceux qui ont réellement fait les premières.

> ⚠️ **Ce n’est pas un défaut à corriger dans le code, c’est une conséquence à arbitrer dans
> la PROCÉDURE** : rattacher un mur neuf à une compétition le plus tard possible, et non dès
> son ouverture. Forme générale, qui vaut au-delà de ce cas : **une règle écrite pour une
> exception change de nature quand l’exception devient la règle.** Ici l’exclusion des blocs
> de compétition était une petite réserve ; « tous les blocs de la salle » en fait une
> suspension générale de deux fonctionnalités, sans qu’une seule ligne de code ait bougé.

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

---

## Le barème unifié, et pourquoi ce fichier affirmait l'inverse la veille (V2.80, 06/11/2026)

Plan : `docs/plans/2026-11-06-CN-plan-bareme-unifie-et-ecran-competition.md`, partie A.

### Le renversement, et ce qui l'a produit

Le 28/10/2026, `blocabrac_plancher` est né **pour les compétitions seulement**, et la raison
était écrite partout : `calculatePoints` est partagé avec le classement quotidien, que
`reconcile-classement-profiles.js` **rejoue sur tout l'historique**, donc le modifier ne
recoterait pas un bloc — il réécrirait d'un coup les points de tous les grimpeurs sur tous les
blocs jamais validés. `CLAUDE.md` en tirait une conséquence plus forte : l'anomalie du blanc
« **n'a de bon moment pour être corrigée à aucune date** ».

Cette phrase était **juste sur le coût et muette sur le critère**. Le 06/11 l'utilisateur a
nommé celui qui gouverne :

> **Quand on compte des points avec les essais, il doit y avoir une seule façon de le faire,
> quel que soit le processus compétitif.**

Et il a écarté la variante la **moins perturbante** (la « variante C » : le classique borné au
quart de la base, mesurée à +738 points et **0 compte en baisse**), pourtant recommandée la
veille, pour deux raisons qui primaient :

1. **le compteur général ne qualifie à rien** — ni badge, ni niveau, ni classement de
   compétition. C'est un totaliseur de vitrine : les 26 comptes qui baissent ne coûtent rien de
   réel, seulement une annonce ;
2. **une troisième courbe aurait contredit exactement le critère d'uniformité** qui motivait le
   chantier.

⚠️ **La leçon à garder n'est pas « on peut changer un barème »** : c'est qu'un argument de
**coût** ne tranche pas une question de **principe**, et qu'un document qui écrit « à aucune
date » déguise un arbitrage en loi de la nature. La partie de l'argument qui est restée vraie :
la bascule a bien réécrit tout le passé, et c'est pour ça qu'elle s'est faite **une fois**,
annoncée, en déployant l'application et le script **ensemble**.

### Les chiffres, prédits puis mesurés

Prédiction écrite **avant** de lancer la réconciliation, depuis une base relue à l'instant (et
non reprise du handoff de la veille) :

| grandeur | prédit | mesuré |
|---|---|---|
| somme des scores | 212 655 → 206 787 | identique |
| comptes en écart (sur 71 profils) | 29 | **29** |
| en baisse / en hausse / inchangés (sur 34 actifs) | 26 / 3 / 5 | identique |
| rangs qui bougent | 9, dont le 6ᵉ/7ᵉ | identique |
| saison | 3 grimpeurs, 2 460 → 2 344 | identique |
| `colorCounts` / `bestColorRank` | **aucun mouvement** | **aucun diff** |

⚠️ **La dernière ligne est celle qui compte le plus** : un critère de sortie doit prédire
*toutes* les grandeurs observables, **y compris celles dont on n'attend aucun mouvement**. Sans
elle, un recalcul qui aurait aussi abimé les compteurs de couleurs serait passé pour un succès.

✔️ Et un acquis gratuit : le recoupement du recalcul classique contre les scores **stockés**
donnait **0 écart sur 34 comptes** avant la bascule — le compteur incrémental n'avait aucune
dérive, donc **tout** l'écart observé ensuite est attribuable au changement de barème, et à rien
d'autre. Une attribution, pas une supposition.

### Deux lectures qui ont fermé des questions ouvertes du plan

- **`season.baseScore` : 63 profils en portent un, et ils sont TOUS à zéro** (8 n'en ont pas, et
  la réconciliation saute leur saison). Le plan craignait qu'un total de saison devienne un
  **mélange permanent des deux barèmes** si les bases restaient figées à l'ancien ; la lecture
  montre qu'il n'y a **rien à décider**. La question était bonne, la réponse était dans la base.
- **Le garde-fou de dérive** (30 % **et** ≥ 3 comptes) se déclenche : 29/71 = 40,8 %. Le `--fix`
  demande donc `--force`, **une fois**, et c'est le comportement voulu — un réalignement de masse
  doit être confirmé explicitement.

### La forme du livrable, et le défaut le plus grave du lot

`calculateDailyPoints` appelle `plancherPoints` et `basePoints`, **le même code** que la branche
`blocabrac_plancher` — pas une copie de la formule. Et `calculatePoints` **n'a pas bougé d'un
caractère**.

🔴 **Et le soir du même jour, son périmètre a été resserré encore : elle n'a plus qu'UN SEUL
APPELANT**, la branche du mode `blocabrac`, pour que les compétitions **passées** s'affichent
juste. Les **mini-compétitions** ont été alignées sur le barème unifié.

La question venait de l'utilisateur — *« il n'y a jamais eu de mini-compétitions véritablement
déroulées, ne serait-ce pas pertinent de les aligner aussi ? »* — et la mesure lui a donné
raison : **1 mini-compétition créée** (« Adulte Toussaint », 35 blocs, rattachée à 1 séance),
**0 document portant un `miniCompetitionId`** sur les 3 `client_course_results` de la prod. La
doctrine « proclamé = figé » ne protégeait donc **rien**, et le plan écartait les
mini-compétitions pour une raison qui ne s'appliquait pas encore.

⚠️ **LE FAIT QUI A RENDU LE MOMENT DÉCISIF, et qui n'était écrit nulle part** : les points d'une
mini-compétition **ne sont pas stockés**. `buildMiniCompetitionRanking` les recalcule à chaque
affichage depuis `boulderColor` + `attempts`. Le gel d'une mini-compétition porte donc sur la
**couleur** — immunité contre une **recotation**, qui est ce que la doctrine visait — et **pas sur
les points**. Changer le barème *plus tard* aurait donc réécrit un classement réellement proclamé
devant des élèves : exactement l'interdit. **C'était le seul moment où l'alignement était
gratuit, et il ne se représentera pas.**

⚠️ **Leçon générale, au-delà du barème** : *vérifier qu'une exception doctrinale protège encore
quelque chose avant de la reconduire.* Celle-ci était juste à l'écrit et vide dans les faits, et
la reconduire aurait rendu le même changement **impossible pour toujours** — une exception vide
qui se remplit devient une contrainte.

✔️ **Et un contrôle gratuit sur l'alignement lui-même** : la seule valeur de
`miniCompetitionRanking.test.ts` qui a bougé est celle du seul essai **non-flash** (480 → 455,
rouge au 2ᵉ essai). Les flashs et les zéros n'ont pas bronché, ce qui est la signature attendue
d'un changement de courbe et de rien d'autre.

🔴 **Le défaut le plus grave était déjà en place, pas introduit par ce chantier** :
`reconcile-classement-profiles.js` portait **sa propre copie** du barème, en ligne. Si elle
avait gardé l'ancienne formule, sa prochaine passe mensuelle aurait remis **toute la base** à
l'ancien barème — **en croyant la réparer**, sans qu'aucun écran ne s'en plaigne. La copie est
**inévitable** (un script Node CommonJS ne peut pas importer un module TypeScript) ; ce qui se
choisit, c'est **combien** il y en a et si elle est **vérifiée**. Elle vit désormais une seule
fois, dans `scripts/lib/bareme-quotidien.cjs`, et les **deux** implémentations consomment **la
même table figée** (`frontend/test/contrats/baremeQuotidien.test.ts`, 8 couleurs × 60 essais).

⚠️ **Le test d'uniformité ne compare pas une fonction à elle-même.** `calculateDailyPoints`
prend une couleur ; `calculateCompetitionPoints` traverse la lecture de la couleur du bloc
(`color` ou `difficulty`), le choix de la branche de mode et l'application du multiplicateur.
C'est l'accord de ces deux **chemins** qui est affirmé. S'il avait été écrit comme un alias
(`calculateDailyPoints = (c, a, s) => calculateCompetitionPoints({color: c}, a, s, '...')`), le
test aurait été **structurellement incapable de rougir** — le cas dégénéré où l'on compare la
chose à elle-même. Vu rouge en faisant pointer la branche de compétition sur `calculatePoints` :
480 cas.

### Ce que les documents imprimés disaient, et ce que ça a appris

Le plan ne les mentionnait pas, et **deux documents disaient le contraire de ce qui venait
d'être livré** :

- l'**affiche d'accueil** portait « Ce barème est celui des **compétitions**. Vos points de tous
  les jours et le classement des grimpeurs ne changent pas, et aucun de vos scores passés n'a
  été recalculé. » — **les trois affirmations fausses le jour même**. Sa *table*, elle, était
  déjà juste : elle est **générée** depuis `climbingPoints.ts` ;
- la **page 8 du topo papier** portait la table classique à quatre colonnes et un encadré
  affirmant « **C'est voulu et ça ne change pas** ».

⚠️ **Le générateur de l'affiche a refusé d'écrire trois fois** : le premier texte la faisait
déborder sur 2 pages, où son encadré de bas de page disparaît. **La marge était de moins d'une
ligne** — tout ajout doit en retirer autant, et la phrase de réassurance (« il ne commande ni
badge, ni niveau ») a dû migrer vers le changelog et le bandeau d'annonces. Une tentative de
financer la place en raccourcissant la légende de la courbe **n'a pas suffi** : la légende est
plus étroite que l'encadré, donc une ligne gagnée là ne vaut pas une ligne dépensée ici.

⚠️ **Et la différence de nature entre les deux documents est la leçon durable** : l'affiche est
générée, donc elle ne peut pas mentir ; le topo **recopie à la main**, donc c'est une
transcription, et *une transcription littérale ne bouge pas quand la donnée bouge*. À défaut
d'une génération, la recopie est désormais **vérifiée** contre la même table figée, plancher
compris. Vue rouge sur **un seul chiffre** changé (533 → 532) et sur **une ligne entière**
supprimée.

---

## L'écran de validation rangé par mur (V2.80, 06/11/2026)

Plan : même document, partie B. Six grimpeurs devant **92 blocs** dans une liste plate, au
contest du 5 novembre.

### Le diagnostic, plus précis que « pas de numéros »

**Les numéros existaient.** Ils sont attachés au **mur**, pas à la salle. Le tri global
`a.number - b.number` mettait donc tous les n°1 des sept murs ensemble : il **entrelaçait les
murs**. Ça avait un sens pour 30 blocs créés pour une épreuve, et aucun pour toute la salle.

✔️ **Conséquence de conception qui a évité un chantier entier** : le regroupement par mur rend
les numéros par mur non ambigus. Il n'y avait donc **rien à renuméroter** — la section porte le
mur, la ligne porte le numéro, et ça correspond à ce qui est écrit sur la prise.

### Le signal d'alarme, et pourquoi il ne s'observe pas à l'exécution

🔴 Replier une section la **démonte** (`unmountOnExit`), et le débounce est à **2 500 ms** : un
grimpeur règle ses essais, replie dans la foulée, et la validation pourrait être perdue — sans
message, sur l'écran où l'on ne perd jamais une validation.

Lecture faite plutôt que supposée : `validationQueue` (`useDebouncedFlushQueue`) et
`validationResults` vivent dans **le composant**, et les cartes sont du **JSX inline** dans un
`.map()`. **Il n'existe aucun composant par ligne à démonter.** La propriété est donc
**structurelle** — et une propriété structurelle ne s'observe pas en exécutant un geste, elle
s'observe en lisant **qui possède quoi**.

⚠️ Ce que garde `test/contrats/ecranCompetition.test.ts` n'est donc pas le présent : c'est **le
jour où quelqu'un extraira « proprement » une carte en composant et y emmènera la file**. Ce
jour-là le défaut sera invisible — l'écran marchera, et seules les validations suivies d'un
repli dans les 2,5 s manqueront. Trois clauses, dont une qui vérifie que `unmountOnExit` est
bien là : **sans démontage, les deux autres ne garderaient rien, et un filet qui ne garde rien
est pire qu'un filet absent, parce qu'il rassure.**

### Les deux ensembles qui se ressemblent et ne sont pas le même

`groupBouldersByWall` reçoit **séparément** :

- `validatedIds` — les réussis **vivants**, pour **compter** dans l'en-tête ;
- `hiddenIds` — un **instantané**, pour **masquer**.

⚠️ **Deux paramètres plutôt qu'un drapeau, exprès.** Les confondre fait disparaître la ligne
**sous le doigt** à l'instant où on la valide, et aucun test ne pourrait même **écrire**
l'assertion contraire s'ils étaient un seul paramètre. L'instantané se reprend à **deux moments
et deux seulement** : au basculement du filtre, et à l'ouverture d'un mur.

⚠️ **Le dénominateur ne rétrécit jamais** : `total` compte les blocs **du mur**, pas ceux qui
restent après filtrage. Un dénominateur qui bougerait ferait croire que des blocs ont disparu de
l'épreuve. C'est la grandeur dont on n'attend aucun mouvement, et elle a son assertion.

### Le tri par couleur : tout ou rien, dérivé de la donnée

🔴 Il n'est offert que si **tous** les blocs portent une couleur de `levelOrder`. En format mixte
— la forme réelle du contest : des blocs déjà en place plus un mur neuf — un tri par couleur
**placerait quelque part** les blocs à cotation cachée, et leur **position** révélerait leur
cotation. Le tri deviendrait la fuite exacte que « Mystère » existe pour empêcher.

⚠️ **La condition se lit sur le contenu de la liste, jamais sur un réglage de compétition** : un
réglage peut être posé à tort par un ouvreur pressé, une condition lue sur la donnée ne peut pas
mentir. Même forme que la décision prise pour le multiplicateur. Défense en profondeur : le
module **refuse de trier même si l'écran le demande**, *et* l'écran ne le demande pas.

Deux pièges fermés au passage : une **liste vide** (`[].every(...)` rend `true`, ce qui serait
faux ici) et une **cotation non canonique** — sept blocs de prod portent `"noire"` ou `"Rouge"`,
qu'un `every` sur la simple présence du champ aurait acceptés.

### L'écart assumé avec le plan

Le plan proposait de propager le `a.wall.localeCompare(b.wall)` de `fetchCandidates`. L'ordre
retenu est celui de **`gymConfig.walls`**, qui est le **circuit physique réel** de la salle : ces
sections s'ouvrent pendant qu'on **marche** dans la salle, et « Dalle » avant « Dévers 15° » n'a
de sens que pour un lecteur de dictionnaire. Un mur absent du tableau (renommé, retiré de la
configuration sans l'être des blocs) passe **après** les autres, par alphabet — jamais écarté en
silence.

### Le numéro écrit sur la prise : un interdit qui n'était pas gardé

Le §B.3 du plan dit « **jamais sur des blocs quotidiens réutilisés** ». Or `handleReorder`
écrivait `number` sur **tous** les blocs rattachés — blocs quotidiens compris, dont le numéro est
celui **écrit sur la prise**. Un clic désynchronisait l'application du physique (« un grimpeur
chercherait le bloc 47 devant une étiquette qui dit 3 »), **et le geste ne le disait pas**.

- Le périmètre est calculé par un module **pur** (`utils/competitionRenumbering.ts`), pas par un
  `filter` en ligne : c'est une **opération de donnée** (une écriture par bloc dans un
  `writeBatch`), et **V2.79 a appris dans ce même fichier qu'un périmètre d'opération ne doit
  jamais dériver d'un affichage.**
- **Liste BLANCHE** sur `type === 'competition'`, et non liste noire sur `'daily'` : un troisième
  type qui apparaîtrait serait alors **protégé par défaut**, plutôt que renuméroté en silence
  parce que personne n'a pensé à l'exclure.
- **Les deux messages annoncent leur périmètre**, succès comme no-op : un succès silencieux sur
  un sous-ensemble est **indiscernable** d'un succès sur l'ensemble, et l'ouvreur repartirait en
  croyant toute la liste renumérotée.
- Le champ du numéro est **grisé** sur un bloc protégé, pas absent : pour qu'on voie qu'il
  existe. Il reste modifiable dans « Blocs quotidiens », sans quoi ce champ deviendrait le seul
  endroit où l'application refuse une correction légitime.

⚠️ **Et le détail à penser une fois, consigné dans le topo** : si l'ouvreur numérote dans
l'ordre où il ouvre et qu'il ouvre du facile au dur, **le numéro devient un indice de cotation**
sur une épreuve à cotations cachées.

### Le rééquilibrage du topo, et ce qu'un filet ne mesure pas

L'ajout des deux points de vigilance a fait **déborder** la page « Points de vigilance » de
**56 px**, ce que le filet des pieds de page a attrapé. ⚠️ **Mais ce filet mesure les
DÉBORDEMENTS, pas les DISPARITIONS** — c'est exactement comme ça qu'un groupe entier de points
de vigilance a déjà été **supprimé au lieu d'être remis**, le 19/10/2026, avec un document
régénéré **vert et parfait**.

Le rééquilibrage a donc été fait par un script qui **retire exactement ce qu'il réinsère** et
**compte avant/après** (24 → 24 points de vigilance), puis tous les comptes structurels ont été
vérifiés contre `HEAD` : +2 « warns », +1 titre de groupe, +1 ligne de tableau, et **14 sections
/ 15 pieds de page inchangés**. *Après tout déplacement de bloc, compter ce qu'on a déplacé.*

## La clôture des blocs couplée au statut (V2.82, 07/11/2026)

### L'incident qui a produit la demande

Le 06/11, la monitrice a fait tourner **« Contest cours »** (compétition, 11 inscrits), publié
le palmarès gelé à 19:39 et diffusé l'annonce. Elle n'a pas cliqué **« Terminer la
compétition »** côté ouvreur — un geste qui vivait dans un autre espace, sur un autre écran,
sans aucun rappel.

Mesure du 07/11 : **92 blocs** gardaient `competition_active: true`, et ils étaient **tous
`is_active: true`**, donc **au mur**. Or `firestore.rules` refuse `firstAscents` **et**
`methodCounts`/`methodVotes` sur tout bloc `competition_active` : **92 des 230 blocs de la
salle, 40 %**, avec deux fonctionnalités muettes *en ce moment*, et l'échec d'une première
ascension n'étant que **journalisé**.

> 🔴 **Le même état de donnée n'a pas la même gravité selon `is_active`.**
> `fix-competition-active-apres-cloture.js` décrit son dommage comme **latent**, parce qu'il
> visait un bloc **désactivé** — au placard, rien n'est suspendu. Ici les blocs étaient au mur :
> le dommage était **en cours**. L'en-tête du script dit la gravité d'un cas, pas de l'autre.

Demande de Stéphane, mot pour mot : *« Il peut être intéressant d'activer automatiquement ce
clic côté Ouvreur par le passage de la compétition en mode terminée côté admin, si c'est
possible. »*

### Ce que le chantier a dû défaire d'abord

⚠️ **Il revient sur un invariant écrit.** `CLAUDE.md` disait : « le `status` de la compétition
est une action d'admin **distincte**, que ce bouton ne touche jamais ». La séparation reste
vraie **dans un sens** (la bascule ne touche pas le statut) et fausse dans l'autre. Un
invariant qu'on révise se révise **en le disant**, pas en le contournant.

⚠️ **Et pas de déclencheur serveur possible : ce projet n'a aucune Cloud Function.** Le couplage
ne peut être que **côté client**, donc **il ne couvre que les clients qui l'ont reçu** — un
admin sur un ancien bundle passera le statut sans rien basculer, exactement comme avant. Même
raisonnement que pour le barème. **Le filet d'audit reste nécessaire**, et c'est lui qui a
trouvé les 92 blocs, **du premier coup sur de vraies données**, avec le remède nommé dans son
propre message.

### L'extraction, qui est le vrai coût du chantier

La logique vivait entièrement dans `handleConfirmMigrate` de `CompetitionBouldersList.tsx`. La
recopier dans l'écran admin aurait fabriqué un **second rédacteur** d'un geste **irréversible** —
la quatrième occurrence de « un document, plusieurs rédacteurs, des contrats divergents » dans
ce dépôt, après `role`/`roles[]`, l'état ludique et `competition_participants`.

- **`utils/competitionClosure.ts`** — **pur**, n'importe rien de Firestore. Décide qui est touché
  et comment : `planifierCloture` partitionne en `aDetacher` / `aMigrer` / `refuses` et rend un
  compte. `couleursCanoniques` est **dérivé** de `colorGrades`, `STATUTS_EN_VOL` est énuméré
  **en positif** (même forme et mêmes valeurs que dans `audit-prod-catalog.js` — la duplication
  est inévitable, un script CommonJS ne peut pas importer ce module, mais les deux doivent
  rester d'accord).
- **`utils/competitionClosureWrites.ts`** — seul à écrire. Porte `chargerBlocsRattaches` (V2.79,
  **tous** les blocs rattachés, actifs ou non) et `ErreurCloture`, qui **transporte le nombre de
  lots déjà commités** : le découpage en lots échange « rien n'est écrit » contre « peut-être
  une partie », et le message affiché doit le **dire**.

### Les deux décisions de forme, et ce qui les a tranchées

**① Une fenêtre de confirmation APRÈS l'enregistrement, pas une case à cocher dans le
formulaire.** Trois raisons, dont une décisive :

- la migration est **irréversible** (la cotation cachée devient publique, rien ne la recache)
  alors que le statut, lui, se remet comme il était. Doctrine applicable telle quelle : *une
  publication immuable mérite une confirmation, pas un avertissement* ;
- le statut est **déjà écrit** quand la fenêtre s'ouvre, donc « Plus tard » ne perd **rien** — le
  bouton de l'ouvreur reste, l'audit continue de voir le cas. C'est ce qui permet d'**offrir** le
  geste sans le **forcer** ;
- 🔴 **et la raison décisive : une case à cocher n'aurait pu annoncer AUCUN nombre.** L'écran
  d'administration ne charge aucun bloc. La fenêtre, elle, **relit la base** et annonce ce
  qu'elle a mesuré — combien de blocs, combien créés pour l'épreuve, combien réutilisés,
  combien désactivés, lesquels refusés. Faire décider à l'aveugle d'une opération irréversible
  n'est pas une confirmation, c'est une formalité.

**② La condition porte sur l'ÉTAT, pas sur la transition.** On ne vérifie pas que le statut
vient de changer. Une compétition passée en « terminée » la semaine dernière sans que les blocs
aient suivi est **exactement le cas du 06/11** : le proposer au prochain enregistrement la
répare, alors qu'un test de transition l'aurait laissée fautive **pour toujours**. Coût : deux
lectures quand la compétition est hors du vol, **zéro** quand elle y reste.

**Périmètre : `terminée` ET `annulée`**, parce que l'audit traite déjà les deux comme des
erreurs si un drapeau survit. Comme c'est un oui explicite, le proposer sur « annulée » ne force
rien — les blocs d'une épreuve reportée peuvent resservir.

### Le refus des cotations hors échelle, et la question qui l'a produit

Stéphane, pendant le chantier : *« Il existe les blocs mystères mais est-ce considéré comme une
difficulté ? »*

**Non.** `gymConfig.ts` tient `mysteryGrade` **délibérément hors de `colorGrades`** : ce n'est
pas une cotation mais l'**absence annoncée** de cotation publique. Conséquence qu'aucun écran
n'annonce : `basePoints[couleur] || 0` rend **0**, donc un bloc **public** coté `mystere` est un
bloc qui ne rapporte **rien à personne, en silence**.

Mesure du 07/11, avant de décider :

| ce qui a été mesuré | résultat |
|---|---|
| blocs `color: "mystere"` | **1**, `is_active: false`, `type: 'daily'`, **0 validation**, aucune compétition |
| blocs `type: 'competition'` | 7, **tous** à `difficulty` canonique (la normalisation du 06/11 tient) |
| seaux hors échelle dans les 82 `classement_profiles` | **aucun** |

Le cas est donc **dormant**. Le garde a quand même été posé, pour une raison qui n'existait pas
la veille : **le geste est maintenant à un clic d'un écran qui ne charge aucun bloc**, donc
l'admin ne verrait rien passer. Et il **refuse** plutôt que de normaliser — la bonne couleur d'un
bloc est une décision d'ouvreur, pas une déduction de machine. « Explicite ou refus », comme
`scripts/lib/couleur-canonique.cjs`.

⚠️ **Né vert sur un terrain propre, donc exercé dans les deux sens** : une graphie canonique
passe, `mystere` / `"noire"` / `undefined` sont refusés, et chacune des 8 mutations du module a
été vue rouge **séparément**.

### 🔴 Mon instrument s'est trompé deux fois, dans des sens opposés

**① Une liste recopiée à la main.** Le premier script de mesure énumérait les huit couleurs
canoniques **en dur** et avait oublié `violet` : il a déclaré **38 blocs de production fautifs**.
Le script a été **supprimé**, pas corrigé — et son remplaçant **lit** `colorGrades` dans
`gymConfig.ts`, avec un **arrêt dur** s'il n'en trouve pas huit. *La liste se dérive.*

**② Un instrument qui contredisait le filet du dépôt.** Pour dimensionner l'ajout au topo, un
script « mesurer les marges » a été écrit. Il annonçait 2 débordements là où le filet du dépôt
déclarait les 14 sections conformes, **sur le même fichier**. Trois défauts :

- il ne mesurait pas en média **`print`** (celui que `page.pdf()` applique) ;
- il mesurait la source **brute**, pas la source **estampillée** — donc un document que
  personne n'imprime ;
- 🔴 **et surtout, il prétendait rendre une grandeur qui n'existe pas** : `.page` déclare une
  hauteur fixe, donc les 14 sections mesurent **toutes 1123 px pour 1123 disponibles**. La
  **marge n'est pas observable** ; seul le **débordement** l'est. Dimensionner un ajout est
  donc nécessairement **itératif**.

Supprimé plutôt que commité. *Un instrument qui se trompe est un piège, pas une approximation.*

### Le filet qui laissait un PDF fautif derrière lui

En essayant d'ajouter la mention au topo, le filet des pieds de page a bien crié — **mais après
que `page.pdf()` et l'estampille aient été écrites**. Le dépôt s'est donc retrouvé avec un PDF
au **pied de page manquant**, estampillé de la nouvelle version, issu d'une source qui n'existait
plus ; il a fallu restaurer les deux fichiers depuis git.

🔴 **Le filet passe désormais en tête des deux générateurs.** Rien n'imposait l'ordre inverse :
il mesure la **source**, pas le PDF. La raison écrite pour le placer en fin — « la pagination ne
change qu'à une régénération, donc c'est ici qu'elle se vérifie » — portait sur le **moment**,
jamais sur le **rang**. ⚠️ **Un garde qui échoue ne doit rien laisser derrière lui.** Vérifié
dans les deux sens : une source débordante ne modifie plus ni le PDF ni l'estampille, une source
saine régénère toujours.

### Ce qui n'a pas pu entrer dans le topo

La mention du couplage côté admin : **le topo est plein**, aux 14 sections. L'ajout initial
coûtait une ligne sur deux pages (−18 px et −9 px). Le point de vigilance a été **compressé**
jusqu'à tenir, et il dit maintenant ce que l'oubli **coûte** (premières ascensions et carnet de
méthodes refusés sans message) plutôt que seulement que le geste est définitif. La phrase sur
l'écran admin a été retirée — elle est dans le changelog.

⚠️ **Jamais en supprimant un groupe existant** : c'est l'erreur du 19/10, où un rééquilibrage
avait fait disparaître un groupe entier et où le document était ressorti **vert et parfait**.

### Mesuré plutôt que lu : le droit de l'admin

Le droit d'un admin sur ces écritures était **lu** dans `firestore.rules`, pas mesuré. Trois
tests de règles l'établissent, dans les **deux formes** — la bascule (qui met à jour) et le
détachement (qui **supprime** des champs ; le `diff()` des règles n'est pas le même) — avec un
**moniteur en contre-épreuve**, sans laquelle un fichier de règles mal chargé rendrait le test
de l'admin vert pour une mauvaise raison.

> 🟠 **Et la mesure a révélé autre chose, préexistant : `boulders/update` est AU PLAFOND du
> moteur de règles.** Le refus d'un client ou d'un moniteur arrive avec `maximum of 1000
> expressions to evaluate has been reached`. Le refus est correct, mais **toute clause ajoutée
> là peut faire échouer des écritures légitimes** — mesurer avant d'en ajouter une.
