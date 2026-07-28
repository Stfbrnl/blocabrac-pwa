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
