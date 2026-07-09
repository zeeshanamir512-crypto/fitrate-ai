---
name: safe-refactor
description: Refactor behavior-sensitive FitRate code (sanitizeResult pipeline, score logic, page.tsx decomposition) with differential testing that proves the new code is behavior-identical before merging. Use for any restructuring where output must not change.
---

# Safe Refactor with Differential Testing

FitRate's scoring/sanitization logic encodes months of tuned product behavior (streetwear floors, accessory-overload scrubs, rewrite rules). A refactor that "looks right" but shifts one score or one sentence is a regression. The bar: **prove old and new produce identical output over thousands of generated inputs, with every branch exercised, before merging.** This is how the ~350-line `sanitizeResult` was decomposed (4,360 comparisons, 0 diffs, 30/30 branches).

## Step 0 — Plan first
Present the decomposition plan (target function list, pipeline order, what stays untouched) and get approval before editing. This project never jumps straight to implementation.

## Step 1 — Freeze the old implementation
Copy the function(s) being refactored verbatim into a harness file in the scratchpad (NOT the repo), e.g. `harness/old.ts`, exported under an `old` prefix. The repo copy is what you'll rewrite; the frozen copy is ground truth.

## Step 2 — Refactor in the repo
Style rules:
- Named, single-purpose functions — name says WHAT, doc comment says WHY (the non-obvious product reason, e.g. "streetwear fits with the classic cap+chain trio were being unfairly dinged as 'cluttered'").
- Compose them in an explicitly ordered pipeline in the top-level function (see `sanitizeResult` in `src/app/api/analyze/route.ts` — order matters and is part of the behavior).
- Do NOT "fix" bugs you notice mid-refactor. Mark them `// DEAD:` or note them for a follow-up commit. A refactor commit changes structure only — mixed commits make the differential test meaningless.

## Step 3 — Build the differential harness
A standalone script (tsx/ts-node in scratchpad) that:
1. **Generates inputs** covering the real input space: valid results, partial objects, missing fields, `null`/`NaN`/wrong-typed values, extreme scores, every `OccasionMode` from `src/lib/occasions.ts`, and strings containing the trigger phrases the heuristics match on (pull the actual regex/signal literals from the code — random strings won't reach those branches).
2. **Runs both** old and new on every input × every occasion.
3. **Deep-compares** outputs (canonical JSON stringify both, compare strings). Any diff → print the input, both outputs, and fail.
4. **Measures branch coverage** of the new code: instrument with counters or run under `c8`/coverage, and list any branch with 0 hits. Unhit branch = your generator is missing a case — extend the generator, don't shrug.

Target: thousands of cases, 0 diffs, all branches hit.

## Step 4 — Repo-level checks
`npx tsc --noEmit`, lint, `npm run build` all clean. Then the `verify` skill if the refactored code sits on a live route.

## Step 5 — Report and commit
Report the numbers concretely ("N old-vs-new comparisons, 0 diffs, X/X branches exercised") — not "tests pass". Commit message states the refactor is behavior-identical and cites the harness result. Delete or archive the harness; note any `// DEAD:` markers found as follow-up items.

## When output MAY change
If the user approved an intentional behavior change alongside restructuring, split it: refactor commit (differential-tested, identical) first, behavior-change commit (with its own before/after evidence) second.
