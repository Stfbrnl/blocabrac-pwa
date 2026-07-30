# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Blocabrac PWA: a French climbing-gym management app (Firebase project `blocabrac`, hosting at `blocabrac.web.app`). React + TypeScript + Vite + MUI frontend, no backend server — the frontend talks directly to Firestore/Auth, with all access control enforced in `firestore.rules`. There are no Cloud Functions.

## Commands

All commands run from `frontend/` (the actual app lives there, not at repo root):

```bash
npm run dev              # Vite dev server
npm run build            # tsc -b && vite build — always run before considering a change done
npm run lint             # eslint .
npm test                 # vitest run — fast unit tests (src/**/*.test.ts), no external deps
npm run test:watch       # vitest in watch mode
npm run test:rules       # Firestore security-rules tests, requires the Firebase emulator (needs Java)
```

- Run a single unit test file: `npx vitest run src/utils/climbingPoints.test.ts`
- `npm run test:rules` wraps `firebase-tools emulators:exec` around `vitest --config vitest.rules.config.ts` (tests live in `frontend/test/`, not `frontend/src/`) — this is why it's a separate npm script and a separate vitest config from `npm test`.
- Deploy from the repo root (not `frontend/`): `npx firebase-tools deploy --only hosting` or `--only firestore:rules` (or both) — `firebase.json` points hosting at `frontend/dist`. `firebase login` needs a real interactive terminal, not this CLI's sandboxed shell.
- Before a `firestore.indexes.json` deploy, diff it against what's actually live — it has drifted from prod before.

## Architecture

### Roles and the `roles` vs `role` field

Every account has a role set (`admin`, `ouvreur`, `moniteur`, `client` — combinable, e.g. a moniteur account is also always `client`). Current accounts store this as an array field `roles: string[]`; some legacy accounts still only have a scalar `role: string`. **Never query or check role by the scalar `role` field alone** — always merge both. The canonical patterns are:
- Firestore rules: `isUserRole(role)` in `firestore.rules` (checks `roles` array OR legacy `role` string).
- Frontend: `ProtectedRoute.tsx` and `Navbar.tsx` both merge `roles` + legacy `role` into a `Set` before checking access.
- Any new query that needs "all users with role X" must do the same two-branch merge (see `MessagesList.tsx` for the pattern: two `getDocs` calls, one `where('role','==',X)`, one `where('roles','array-contains',X)`, merged by doc id).

Every account is always guaranteed to have `client` in its roles (enforced in `AdminUsers.tsx` and mirrored server-side by `hasClientRole()` in rules) — the "client" area is not staff-exclusive-free, it hosts features (like "Potes de grimpe") open to everyone including staff.

### Boulders: one collection, several lifecycles

All climbing routes (daily wall routes and competition routes) live in a single `boulders` collection, discriminated by `type: 'daily' | 'competition'`:

- **Daily boulders** (`type: 'daily'`): managed per-wall in `Ouvreur/DailyBoulders/`, shown to clients in `Client/Daily/ClientDaily.tsx`. Color (`color` field) is always visible. `is_child_route: boolean` marks a "ouistiti" route (children's route physically marked with a monkey icon instead of the color logo) — it exists across the full color range, it is not a separate color.
- **Official "grosse compétition" boulders** (`type: 'competition'`): created via `Ouvreur/CompetitionBoulders/CompetitionBoulderForm.tsx`, tied to a `competitions` doc via `competition_id`. Their real cotation (`difficulty` field) is hidden from climbers during the event — the validation screen (`Client/Competitions/ClientCompetitions.tsx`) never displays it, climbers just mark success/attempts blind ("Mystère"). Scoring reads `difficulty` live.
- **Reused daily boulders in a "compétition régulière"**: a level-restricted competition (via `minLevel`/`maxLevel` on the `competitions` doc) that runs for weeks on walls that are never stripped, built from *existing* daily boulders instead of new hidden ones. These boulders stay `type: 'daily'` forever and gain `competition_id` + `competition_active: true` while tagged in. `competition_active` is the field that matters here — it's what distinguishes "currently an active member of this competition" from a boulder that merely still carries an old `competition_id` for historical stats. **`competition_id` is never cleared** once set (on either boulder kind) — every stats/classement page reconstructs a competition's results by querying boulders on `competition_id` alone, with no `type` filter.
- "Terminer la compétition" (`Ouvreur/CompetitionBoulders/CompetitionBouldersList.tsx`) ends a competition's boulder lifecycle: `type:'competition'` boulders become `type:'daily'` (their hidden cotation becomes the public `color`, to be re-graded from climber feedback); reused daily boulders just lose `competition_active`. The competition's own `status` field is a separate, manually-controlled admin action — this button never touches it.

### Boulder images: Cloudinary, `image_public_id` first, `image_base64` as fallback

Boulder photos are uploaded to Cloudinary (unsigned preset, folder `blocabrac/boulders`) instead of stored as base64 in Firestore — the free Spark plan's 10 GiB/month egress quota can't survive serving inline images to every wall view. `services/imageStorage.ts` is the **only** file allowed to import/call Cloudinary (`uploadBoulderImage`, `getBoulderImageUrl`, `deleteUnconfirmedUpload`) — swapping providers later means rewriting only that module. New boulders write `image_public_id`; the legacy `image_base64` field is never written again but is kept as a read-time fallback (`image_public_id ? getBoulderImageUrl(...) : image_base64`) wherever a boulder image is rendered — every such site must implement both branches, a screen that only checks one will show broken images for the other kind of boulder. `getBoulderImageUrl(publicId, 'thumb' | 'full')` composes the URL from Cloudinary transformation strings (`f_auto,q_auto,w_400`/`w_1000`) rather than storing pre-built URLs, so there's nothing to keep in sync if the transformation recipe changes.

The annotation dots (start/end holds) are baked into the image raster at save time (`canvas.toDataURL()` in `DailyBoulderForm.tsx`/`CompetitionBoulderForm.tsx`) — the `annotations` field in Firestore is write-only after creation (read back only when re-editing that same boulder), never used to render an overlay at display time. This is why the Cloudinary upload happens at submit time, not on file selection: the final image doesn't exist until the ouvreur has finished placing the dots, so "upload immediately to hide latency" isn't compatible with baking annotations into the raster. Editing an existing boulder without picking a new photo skips the upload entirely and leaves `image_public_id` untouched (Firestore `updateDoc` only touches keys present in the payload).

`firestore-migration/migrate-boulder-images-to-cloudinary.js` is the one-time backfill for boulders created before this change: Passe A (default) uploads existing `image_base64` to Cloudinary and writes `image_public_id`, keeping the base64 as-is; Passe B (`--delete-base64`, run manually later after visual verification in prod) removes the now-redundant base64 field.

`firestore-migration/cleanup-orphan-boulder-images.js` runs monthly via `.github/workflows/cleanup-orphan-boulder-images.yml` (cron + `workflow_dispatch`) to delete Cloudinary images no longer referenced by any `boulders` doc. It deliberately queries `boulders` with **no filter** on `is_active`/`type`/`competition_active` — a deactivated boulder (`is_active: false`) or one whose competition ended still keeps its image referenced for historical stats, and a filtered query would wrongly treat that image as orphaned. Guardrails: dry-run unless `--delete`, never touches a Cloudinary resource younger than 7 days, and aborts if the reference count drops more than 20% versus the last run (likely a partial read or auth failure, not real deletions) — that comparison's state lives in `cleanup-state/` (tracked by git, unlike the rest of `firestore-migration/`) because it must survive across ephemeral CI runs; the workflow commits it back after each execution. Credentials come from env vars in CI (`FIREBASE_SERVICE_ACCOUNT_JSON`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — GitHub secrets) or local gitignored files when run manually from the Codespace (`serviceAccountKey.json`, `cloudinary-admin-credentials.json`).

### `competition_results` — written live, then locked

`ClientCompetitions.tsx` writes each boulder validation to `competition_results` immediately (`setDoc(..., {merge:true})`) rather than buffering in React state until submit — a discharged tab or a reload must never lose a validation. The success/fail click writes immediately; the repeated-entry fields (attempts, rating, proposed cotation) are debounced ~800ms to avoid a write per `Select` interaction. On opening the validation dialog, existing results for that user+competition are re-fetched to repopulate the UI (this is what makes a reload safe, not just the debounce). "Soumettre les résultats" is a **lock**, not a submit: a single `writeBatch` sets `submitted: true` + `submitted_at` on every result doc for that competition, and `firestore.rules` then refuses any further `update`/`create` by the owning client on a doc with `submitted: true` (admin/ouvreur keep unrestricted write access — deliberate status quo, see `PLAN-spark-images-competition.md` "Écart à trancher"). Once locked, the dialog goes read-only client-side too, but the enforcement that matters is server-side.

### Firestore persistent cache (IndexedDB) and the two cache layers

`firebaseConfig.ts` initializes Firestore with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` (Chantier 3) instead of the default in-memory cache — decisive on competition day so re-opening the app doesn't re-transfer unchanged boulder images, and so validations queue locally and replay on reconnect if the venue's indoor coverage drops. `persistentMultipleTabManager()` is mandatory: without it, activation throws as soon as a second tab is open, which is exactly the admin's TV-display setup (two windows). Persistence is force-disabled (falls back to plain `initializeFirestore(app, {})`) whenever `MODE === 'test'` or `VITE_USE_EMULATOR === 'true'` — Firestore security rules aren't re-checked against cached reads, so a stale cache entry could silently pass what a live read would reject, masking a real permission bug in Playwright.

IndexedDB is scoped to the site origin, not to the signed-in account — on a shared device (admin's workstation, a borrowed phone), a previous account's cached data would otherwise survive logout. `Navbar.tsx`'s `handleLogout` (both the desktop button and the mobile drawer item route through it) enforces the exact required order: `auth.signOut()` → `terminate(db)` → `clearIndexedDbPersistence(db)` → `window.location.reload()`. `clearIndexedDbPersistence` only works while Firestore is inactive, and the SDK instance is unusable after `terminate()`, hence the reload. If a new logout entry point is ever added, it must go through this same function, not a bare `auth.signOut()`.

Two independent cache layers now sit in front of the app: `vite-plugin-pwa`'s service worker (static assets/shell) and this Firestore IndexedDB cache (data). If something looks frozen/stale, check which layer is responsible before assuming a code bug — a stuck UI after a data change is usually the Firestore cache, a stuck UI after a deploy is usually the service worker.

### Mini-compétitions (moniteur) — a third, unrelated system

`mini_competitions` is a **separate collection**, not part of the boulders/competitions system above. A moniteur builds one by picking existing daily boulders (by wall/color), and it's referenced by id from a `courses` (séance) doc's `miniCompetitions: string[]` array — same shape as that doc's `exercises: string[]`. Results are written to `client_course_results` (the same collection exercises use) with `boulderId`/`boulderColor`/`miniCompetitionId` fields; `boulderColor` is snapshotted at validation time so a later re-grade doesn't retroactively change past scores. Ranking is computed client-side in `Moniteur/Stats/StatsList.tsx` from `climbingPoints.ts`.

### Course sessions (`courses` collection) and the scheduled/active/archived lifecycle

A `courses` doc (called "séance" in the UI) goes through `scheduled → active → archived`, driven by `activatedAt`/`archivedAt` timestamps (see `utils/courseSessionStatus.ts` for the client-side status derivation, mirrored server-side by `canValidateCourse()` in rules). Content (exercises, mini-compétitions) is only fetched/shown to clients once a session leaves `scheduled` — "objectifs visibles, contenu caché" until activation. Participants default to the whole group (`Participants: string[]`), with individual opt-out (`optedOut: string[]`) only allowed before activation.

### Cross-user visibility: the `classement_profiles` mirroring pattern

Firestore rules only let a client read their own `users` doc — clients cannot list other clients' results directly. Anywhere the app needs to show one client data derived from another (leaderboard, friends' status), the *source* client mirrors a small summary onto a separate, broadly-readable doc keyed by their own uid (e.g. `classement_profiles/{uid}`), computed and written by themselves on their own activity. Reuse this pattern — do not try to grant broader read rules on `users` or per-user result collections to solve a "show me other users' data" need.

### Points scoring

`utils/climbingPoints.ts` (`calculatePoints`, `basePoints`, `deductions`) is the single shared scoring function for daily classement (`utils/classementScore.ts`), official competition classement, and mini-compétition classement. It scores by color string (`jaune` through `rose`), degressive by attempt count. Real "grosse compétition" boulders never use `jaune` in practice (beginner-only) even though the picker still lists it — that's intentional gym policy, not a bug.

### Testing

- `npm test` (fast, no external deps) covers pure utility functions (`utils/*.test.ts`) — this is what CI-equivalent checks should always run.
- `npm run test:rules` (Firestore emulator, `frontend/test/*.test.ts`) is the only way to verify Firestore security rules and cross-collection permission logic (e.g. `canValidateCourse`, role checks). Any change touching `firestore.rules` or a write path's field shape should get a test here, following the existing pattern: `initializeTestEnvironment` + `withSecurityRulesDisabled` to seed fixtures, then `assertSucceeds`/`assertFails` against role-specific `authenticatedContext`s.
- There is no Playwright/browser E2E suite wired into these npm scripts, despite `playwright` being a devDependency — manual/agent-driven browser testing is done ad hoc, not via a committed test suite.
