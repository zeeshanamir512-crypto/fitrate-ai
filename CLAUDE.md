# FitRate AI — Operating Manual

AI outfit-rating app. Next.js 16 + React 19 + TypeScript + Tailwind, deployed on Vercel (fitrate-ai.vercel.app). OpenAI vision (gpt-5.6-terra, overridable via `OPENAI_VISION_MODEL`) rates outfit photos; Upstash Redis backs rate limits, shared results, battles, leaderboard. No auth, no DB.

## Product context (drives prioritization)
Indie project. Monetization plan: affiliate recommendations + Pro tier, **after** virality. The differentiator vs competitor Outfit is the **social layer** (Outfit Battles, weekly leaderboard, challenge/share links) — not raw AI quality. When sequencing work: social/viral features > monetization features. Visual identity ("Apple + Arc + TikTok + luxury streetwear": glassmorphism, neon indigo/violet/cyan) is settled — don't redesign it.

## Working style (non-negotiable)
- **Explain the plan before writing code.** Reasoning first, then step-by-step implementation. Never jump straight to edits, never do wholesale rewrites unrequested.
- Flag tradeoffs explicitly and let the user decide (e.g. fail-open vs fail-closed was a deliberate, user-approved choice per route).

## Architecture map
- `src/app/page.tsx` — monolithic client component (~1,600 lines; known debt, refactor only when asked)
- `src/app/api/analyze` + `compare` — paid OpenAI vision routes (the expensive ones)
- `src/app/api/save-result`, `save-compare` — persist results to public `/r/[id]` / `/compare-r/[id]` pages
- `src/app/api/battle/*`, `leaderboard/*` — social layer
- `src/lib/` — all shared logic: `rateLimit`, `resultSignature`, `moderation`, `occasions`, `formatScore`, one `*Store.ts` per Redis-backed feature

## Hard conventions
1. **Redis env vars are `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`** (what `Redis.fromEnv()` reads). Not `REDIS_URL`, not Vercel-KV-style `KV_REST_API_*`. Everything degrades gracefully when they're unset (local dev): rate limiting allows, stores/sharing return "unavailable".
2. **Rate limiting is Redis-backed, never in-memory** (serverless = multi-instance; a Map resets per instance). Use `checkRateLimit` from `src/lib/rateLimit.ts` with a route-namespaced key (`analyze:{ip}`).
3. **Expensive routes fail CLOSED.** analyze/compare pass `{ failClosed: true }` and also call `checkDailyCallCap` (global `daily-calls:{date}` counter, `DAILY_CALL_LIMIT` env, default 500, always fail-closed). Cheap routes (save, vote) fail open — availability wins there.
4. **Never trust client-posted results.** `/api/analyze` signs the finalized result (`signResult`, HMAC-SHA256 over canonical key-sorted JSON); `/api/save-result` rejects anything unverified with 403. Any new endpoint that accepts server-produced state back from the client MUST reuse this pattern (`src/lib/resultSignature.ts`). Fields traveling outside the signed payload (occasion, thumbnail) get their own whitelist/caps/moderation.
5. **Moderate every user image before it's paid for or published.** `moderateImage` runs BEFORE the vision call (fail closed, flagged→400-level, outage→503) and on the client-generated thumbnail in save-result (flagged→422; outage→save text, drop image — the thumbnail is the only public user image and is NOT HMAC-covered).
6. **Scores are one decimal place everywhere.** `clampScore` quantizes at the API boundary; display goes through `formatScore` (`toFixed(1)`). Streetwear floors/caps stay exact 7.0/8.0.
7. **Occasions come from `src/lib/occasions.ts` only.** Re-declaring the list per route caused real bugs; validate with `isOccasion`.
8. **Refactoring style:** decompose monoliths into named single-purpose functions with WHY comments (see the `sanitizeResult` pipeline in analyze/route.ts), and prove behavior-identical with a differential harness (old vs new over thousands of generated cases, all branches exercised) before merging. See `.claude/skills/safe-refactor`.

## Known traps → rules
- In-memory rate limiting → always Redis-backed (`rateLimit.ts`).
- Fail-open limits on paid routes → `failClosed: true` + daily cap on anything that calls OpenAI vision.
- Trusting client result JSON → HMAC verify or reject (403).
- Skipping moderation on user images → moderate before paid call and before public exposure.
- One giant function → named single-purpose functions, composed in an ordered pipeline.
- Writing `.env.local` with PowerShell → lands as UTF-16 and silently breaks; save UTF-8 (`fix-encoding` script exists because of this).
- `npm run dev` is **webpack** (`dev:turbo` for turbopack); clean rebuild via `dev:clean`.
- Client uploads: HEIC→JPEG + 4MB compression already handled in `src/lib/prepareImageFile.ts` — reuse it, don't reimplement.

## Quality bars (checkable)
- Every route that calls OpenAI vision: rate-limited per IP with `failClosed: true`, counted against the daily cap, image-moderated first, and returns a specific status (429 limit, 503 moderation outage) — never a silent allow.
- Every endpoint persisting user-visible state: HMAC-verified or fully whitelisted/capped field-by-field.
- Every user-facing error is a specific, friendly message (see `errorMessageForUser`); no raw error text or moderation category names ever reach the client.
- `tsc`, lint, and `next build` clean before claiming done; behavior verified end-to-end against a dev server (see `.claude/skills/verify`).
- New Redis keys have a TTL or an explicit reason they don't.
