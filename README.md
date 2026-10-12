# Pharma Rush — Race Through the Human Body

Medical endless-runner for doctors, pharmacists and students. **React + TypeScript + Three.js + Framer Motion + custom CSS** frontend,
**Node.js + Express + MongoDB** backend. The server is the source of truth for accounts, progress, rewards and rankings.

## Quick start
Requirements: Node 20+, MongoDB 6+ (local or Atlas).
```bash
npm install && npm run server:install
cp server/.env.example server/.env        # set JWT_SECRET, ADMIN_EMAIL/PASSWORD, MONGODB_URI
npm run server:dev                         # API on :4000 (seeds missions + sample quiz content + first admin)
npm run dev                                # Vite on :5173, proxies /api -> :4000 (same-origin cookies)
```
Production: `npm run build && npm run server:build`, then `NODE_ENV=production npm run server:start`
(Express serves `dist/` and `/api` from one origin; set `JWT_SECRET` ≥ 32 chars; serve over HTTPS).
Tests: `npm run server:test` (22 tests; needs MongoDB at `mongodb://127.0.0.1:27017`, or set `MONGODB_URI`). Browser tests: see `e2e/`.

## Architecture
```
shared/        rules.ts (score, stars, rewards, limits)   mission.ts (MissionMachine: timer, health, objective, quizzes, win/loss)
server/src/    models/  routes/ (auth, player, play, compete, admin)  services/ (results, progress, quiz, ranking)  middleware/  seed.ts
src/engine/    Three.js game (GameEngine delegates ALL mission logic to MissionMachine), world, doctor, entities, brand (sponsor coins)
src/hooks/     useGameFlow: start session -> run -> quiz checkpoints -> submit -> server result
src/components screens/ (Auth, Home, Worlds, Missions, Briefing, Dashboard, Leaderboard+Challenges, Profile, Admin, Results, Pause) game/ (Hud, MedicalEvent, Ecg)
```

## Game rules (published to players on the briefing screen)
- Mission = up to **3:00** of *active* time. Objective: collect N medicines. Health 100; a hit costs 20.
- **Win:** objective met while health > 0 before the deadline (ends immediately, no further quiz).
  **Lose:** health 0, or deadline reached first (the final checkpoint quiz is shown, then the run ends as a loss).
- **Quizzes** at ~1:00, ~2:00 and the 3:00 deadline. The timer is frozen during a quiz. Correct +20 HP, wrong/timeout −10 HP (never fatal).
- Same-frame edge case: health 0 beats objective-complete. A run can never be extended past its deadline; the server also enforces an overall wall-clock deadline.
- Qualifying win (≥ `minStars`, default 1 star) unlocks the next level; replays pay 50% rewards; losses never remove progress.
- Score = distance + 10/medicine (+ streak/x2 bonus, server-capped) + 150/correct quiz + time bonus + clean-run bonus − 25/collision. Stars: win = 1, +1 quiz accuracy ≥ 2/3, +1 finished with ≥ 25% time left.

## Server-side validation
Clients only report aggregates. The server ignores any client score/xp/coins and rejects runs that are impossible (pill rate, distance vs time,
active time vs wall clock, objective not met, branded pills without a campaign, …). Quiz questions are sent without answers, option order is shuffled
per session, answers are recorded server-side, checkpoints can't be opened early or answered twice. Rewards are applied once (unique idempotency keys +
`appliedSessions` + optimistic concurrency). Passwords: bcrypt. Sessions: httpOnly SameSite=Lax cookie + required `X-Requested-With` header. Helmet CSP, rate limits on auth.

## Doctor challenges (max 50)
Join is atomic and capped (`maxParticipants` ≤ 50); each player's best finished attempt counts (`maxAttempts`). Ranking order: win → more correct quiz answers →
faster active time (non-wins: more medicines) → fewer collisions → higher score → earlier validated finish → player id. Results freeze after the deadline (+6 min for in-flight runs).

## Branded collectibles & admin
Roles: `player`, `org_admin` (own organization only), `admin`. Logos: PNG/JPEG/WebP ≤ 256 KB, content-type verified, **approved by a platform admin**; campaigns need a
sponsorship disclosure, an approved logo and platform-admin approval; the disclosure is shown on the briefing, HUD badge and results. Admin portal: reports, missions,
quiz content (draft → approved by a *different* reviewer), organizations/assets/campaigns, challenges. All admin mutations are audit-logged.

## Known limitations / remaining work
- **Seed quiz questions are sample content** (flagged in the admin UI). They must be reviewed by qualified clinicians before real use; this is an educational game, not clinical guidance.
- Mission targets (200–440 medicines) are estimates from spawn rates — playtest and tune in the admin portal.
- Password-reset email is not wired to a provider (token is returned only outside production). No email verification / MFA / admin 2FA yet.
- Reports are computed in memory (fine for MVP scale); add aggregation pipelines/indexes for large datasets. Challenge standings freeze lazily on first read or via admin "Finalize".
- Tests ran against FerretDB (MongoDB-compatible) in the build sandbox; run `npm run server:test` once against real MongoDB. In-process locks complement MongoDB atomic updates for single-instance deployments.
- Only the Bloodstream world is playable; other worlds remain "coming soon".
