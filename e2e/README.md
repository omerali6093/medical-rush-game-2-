# Browser end-to-end tests (headless Chromium + WebGL)

Drive the real built app: signup, locked-level guard, pause, three quiz checkpoints, timeout loss, retry, win, unlock,
dashboard, challenges, leaderboard, shop, admin portal and sponsored collectibles.

**Use a throwaway database** — script 01 rewrites Level 1 to a 15-second mission and 01 starts from an empty DB.

```bash
npm run build                      # build the React app (the API serves ./client/dist)
cd server
NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/pr-e2e PORT=4200 \
  ADMIN_EMAIL=admin@e2e.test ADMIN_PASSWORD=Adm1nPassw0rd npx tsx src/index.ts &
cd ../e2e && npm install
node 01-journey.mjs     # player journey (signup -> mission -> quizzes -> loss/retry -> win -> unlock)
node 02-screens.mjs     # dashboard, challenges, leaderboard, profile/shop, admin portal
node 03-sponsorship.mjs # approved sponsor campaign: briefing, HUD badge, results, report
```
Software WebGL is slow (a few FPS); the game keeps real time regardless. Screenshots are written next to the scripts.
