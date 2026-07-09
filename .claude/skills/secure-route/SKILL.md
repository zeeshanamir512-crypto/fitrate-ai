---
name: secure-route
description: Add or modify a FitRate API route with the full defense stack — rate limiting, cost caps, HMAC verification, image moderation, input whitelisting. Use whenever creating a new route.ts under src/app/api or changing what an existing one accepts.
---

# Secure Route Checklist

Every FitRate endpoint is public (no auth), so every route carries its own defenses. Work through this list top to bottom; copy patterns from the named reference files instead of writing fresh ones.

## 1. Classify the route first

| Class | Examples | Rules |
|---|---|---|
| **Paid** (calls OpenAI vision) | analyze, compare | Rate limit `failClosed: true` + `checkDailyCallCap` + pre-call image moderation |
| **Publishing** (writes user-visible state) | save-result, save-compare, leaderboard/submit, battle/* | HMAC verify or field-by-field whitelist; moderate any image that goes public |
| **Read/cheap** | leaderboard read, vote | Rate limit fail-open (default) is fine |

## 2. Rate limiting (all routes)

```ts
const ip = getClientIp(request.headers);
if (!(await checkRateLimit(`<route-name>:${ip}`, LIMIT, 60, { failClosed: PAID })).allowed) {
  return NextResponse.json({ error: "Rate limited" }, { status: 429 });
}
```

- Key MUST be namespaced with a route-unique prefix (`analyze:`, `save:`, `battle-vote:`) — unprefixed keys collided across routes once already.
- Pick LIMIT by cost: paid routes are tight (analyze 12/min, compare 6/min); cheap writes ~10/min; reads ~60/min.
- Paid routes additionally: `if (!(await checkDailyCallCap(DAILY_CALL_CAP)).allowed) → 429`.
- Never build an in-memory limiter (Map/module state) — serverless instances don't share memory.

## 3. Trust boundary on inputs

- **Server-produced state returning from the client** (a result object being saved): verify with `verifyResultToken(result, token)` → 403 `"Unverified result. Please re-run the analysis."` on failure. If the route RETURNS new trusted state, sign it with `signResult` before responding (reference: `src/app/api/analyze/route.ts` end of POST).
- **Fields outside the signed payload**: whitelist explicitly. Occasion → `isOccasion()` from `src/lib/occasions.ts` (never re-declare the list). Strings → hard length caps (see `textFieldsWithinLimits` in save-result). Images → require exact `data:image/jpeg;base64,` prefix + byte cap.
- Malformed JSON body → 400, wrapped in try/catch (Request.json() throws).

## 4. Image moderation

Any user image the route will (a) send to a paid model or (b) make public:

- **Before paid call** (analyze/compare): `moderateImage` first; flagged → reject with `FLAGGED_IMAGE_MESSAGE`; moderation outage → 503 `MODERATION_UNAVAILABLE_MESSAGE` (fail closed — moderation and vision share a provider, the vision call was doomed anyway).
- **Before publishing** (thumbnails): flagged → 422; outage → keep the signed text result but **drop the image** (reference: save-result route.ts).
- Log flagged category names server-side only. Never echo them to the client.

## 5. Storage

- One `<feature>Store.ts` in `src/lib/` per Redis-backed feature; follow the existing shape (`isRedisConfigured()` guard, `Redis.fromEnv()`, graceful "unavailable" return when unconfigured).
- Env vars are `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — nothing else.
- Every new key gets a TTL (`ex:`) or a written justification. Counters seed with `SET NX + ex` then `INCR` in one pipeline so they can never live without expiry.
- Concurrent claims (e.g. joining a battle) use `SET NX` as the race guard.

## 6. Responses

- Specific status per failure: 400 invalid input, 403 unverified, 422 flagged image, 429 limited, 503 dependency down. No silent fallbacks.
- User-facing messages are friendly and specific; internal detail goes to `console.error/warn` with a `[route-name]` prefix. Dev-only debug payloads gate on `process.env.NODE_ENV === "development"`.
- Scores in any response pass through `clampScore` (one decimal place).

## 7. Before claiming done

Run the `verify` skill: exercise the new route against a dev server, including the failure paths (bad token → 403, over-limit → 429, unconfigured Redis → graceful degrade).
