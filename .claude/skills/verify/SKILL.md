---
name: verify
description: Verify a FitRate change end-to-end before claiming done — typecheck, lint, build, then exercise the affected flow against a real dev server with a mock Upstash Redis and stubbed OpenAI. Use before committing any nontrivial change.
---

# FitRate Verify

"Compiles" is not "works". Verify by driving the affected flow against a running dev server and observing real responses, including failure paths.

## 1. Static gates (always, in order)

```powershell
npx tsc --noEmit
npx next lint
npm run build
```

All three clean before any runtime claim. If the build acts stale, `npm run dev:clean` nukes `.next`.

## 2. Runtime harness

- Dev server: `npm run dev` (webpack; port 3000, check output for the actual port). Run in background, wait for "Ready".
- **Mock Upstash** (Redis features without touching prod): a small Node HTTP server in the scratchpad that speaks the Upstash REST protocol — accept `POST /` and `POST /pipeline` with JSON command arrays, back it with a `Map`, implement the handful of commands the code uses (`SET` w/ NX+EX, `INCR`, `GET`, `EXPIRE`, `LPUSH`/`LRANGE`, `ZADD`/`ZRANGE` as needed). Point the app at it in `.env.local`:
  ```
  UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079
  UPSTASH_REDIS_REST_TOKEN=test-token
  ```
- **OpenAI**: never make paid calls during verification. Either (a) test only the pre-OpenAI gates (moderation/rate-limit/validation reject before spend), or (b) point `OPENAI_API_KEY` at a stub server that returns a canned chat-completions/moderations response.
- **`.env.local` on Windows is a trap**: write it UTF-8 (use the Write tool, not PowerShell redirects — those emit UTF-16 and the app silently ignores the file). Restore the original `.env.local` when done.

## 3. What to exercise (pick the rows your change touches)

| Change touched | Drive this |
|---|---|
| analyze/compare | POST an image data-URL fixture; assert 200 shape (`result`, `token`, one-decimal scores), then over-limit → 429, and moderation-flagged path if reachable |
| save-result / save-compare | Round-trip: get a signed result from analyze (stubbed), POST it → 200 with `/r/{id}` URL; then tampered result + same token → 403; bad occasion → 400; oversized thumbnail → dropped |
| battle / leaderboard | Create → join → vote flow via curl; duplicate join → race-guard behavior; vote on open battle → 409 |
| Rate limiting / caps | Loop requests past the limit, assert the 429 boundary is exact; kill the mock Redis mid-run and assert paid routes 429/503 (fail closed) while cheap routes still work (fail open) |
| Shared pages `/r/`, `/compare-r/`, `/battle/` | Fetch the page HTML for a saved id, assert score/text render; fetch a bogus id, assert graceful not-found |
| UI (page.tsx, components) | Load the page headless or ask the user to eyeball it; at minimum confirm no hydration errors in dev-server logs |

Also run one **legacy-data check** when a stored shape changed: seed the mock Redis with an old-format record and confirm the reader still handles it (pattern: nullable `resultB` battle records).

## 4. Report

State concretely what was exercised and what was observed ("24 checks against dev + mock Upstash: analyze 200 with signed token, tampered save → 403, Redis-down analyze → 429, legacy battle record renders"). If any check failed or was skipped, say so plainly — never round up to "verified".

## Cleanup

Kill background servers, restore `.env.local`, delete scratchpad stubs. Nothing from the harness lands in a commit.
