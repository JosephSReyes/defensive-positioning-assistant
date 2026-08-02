---
title: "Spec 03 — Play-Log Import fails at ~7+ screenshots"
type: spec
status: proposed
created: 2026-06-24
surface: >
  netlify/functions/openai-play-log-import.js (raise max_tokens, salvage a
  truncated JSON array) · js/play-log-import.js (batch the screenshots into
  small requests and merge with the existing dedup)
depends_on: []
tags: [dpa, spec, play-log-import, netlify-function, openai]
---

# Spec 03 — Play-Log Import fails at ~7+ screenshots

> **Status — 2026-06-24: PARTIALLY SHIPPED (steps 1–2).** The server-side fix
> landed: `max_tokens` raised 4000 → 16000 and a `salvageObjects()` recovery added
> so a truncated array imports its complete leading objects instead of failing the
> whole request (returns 422 only when nothing is salvageable). This resolves the
> field-reported 7+ screenshot failure. Guarded by 3 new tests in
> `tests/integration/play-log-import.integration.test.js` (suite **381 passing**,
> was 378). **Step 3 (client-side batching) was intentionally deferred** per
> deliberately — revisit only if the 6 MB Netlify request-payload limit surfaces near
> the 12-image max (it bites ~10–12 images, not 7). Until then `MAX_FILES` /
> `MAX_IMAGES` remain 12 and all screenshots are still sent in one request.

> **Symptom (reported from field use).** Importing **7 or more** play-by-play log
> screenshots in one go fails with **"Import failed: Could not read plays from
> the screenshots. Try clearer images."** Fewer screenshots work. The images are
> not the problem.
>
> **Root cause.** `netlify/functions/openai-play-log-import.js` asks OpenAI for the
> extracted plays with **`max_tokens: 4000`** (`openai-play-log-import.js:168`).
> Once enough screenshots are imported that the returned JSON array of plays
> exceeds ~4000 output tokens, OpenAI **truncates the response mid-array**. The
> function then runs a hard `JSON.parse(cleaned)` with no tolerance for a
> truncated array (`:199-202`); it throws, and the `catch` returns
> **422 "Could not read plays from the screenshots. Try clearer images."**
> (`:203-208`), which `readPlayLogFiles` surfaces verbatim as the "Import failed:
> …" message (`js/play-log-import.js:354-357`). The message blames the images, but
> the real cause is the output-token ceiling.
>
> **Fix (smallest safe, robust to the real limits).** (a) raise `max_tokens` to
> the gpt-4o ceiling, (b) salvage complete objects from a truncated array instead
> of failing the whole import, and (c) send the screenshots to the function in
> **small batches** and merge the results with the existing `dedupPlays`, so no
> single request can hit either the token ceiling or the 6 MB Netlify request-body
> limit. No new data model, no UI redesign.

## Problem / motivation

The Play-Log Import (Step 13, `PLAY_LOG_IMPORT.md`, `DECISIONS.md` decision 13)
lets a coach pick multiple play-by-play log screenshots on the Team screen and
turn them into previous-game data. The flow:

1. `readPlayLogFiles(e)` (`js/play-log-import.js:312-371`) preprocesses every
   selected file with `preprocessRosterImage` (grayscale, ≤1600px, JPEG q0.92 →
   base64) and POSTs **all of them in one request** to
   `/api/openai-play-log-import` as `{ images, teamName, roster }` (`:347-352`).
2. The function (`netlify/functions/openai-play-log-import.js`) sends every image
   to OpenAI Vision in **one** chat-completions call (`:160-177`) and expects a
   single JSON **array** of play objects back, which it `JSON.parse`s (`:199-202`)
   and sanitizes (`:213-231`).

There is **no hard "7" limit anywhere** — `MAX_FILES` (`js/play-log-import.js:324`)
and `MAX_IMAGES` (`openai-play-log-import.js:10`) are both **12**. The failure at
~7 is emergent, and two ceilings are in play:

- **Output-token ceiling (the cause at ~7).** `max_tokens: 4000`
  (`openai-play-log-import.js:168`). Each kept play is a verbose JSON object —
  `date`, `battingTeam`, `batterName`, `batterJersey`, `result`,
  `battedBallType`, `locationExplicit`, `fielder`, `strikeoutKind`, and a free-text
  `rawText` (the prompt's object shape, `:75-87`) — roughly **75–120 tokens each**.
  ~7 dense screenshots ≈ a full game's worth of the coach's at-bats ≈ **35–55
  plays ≈ 4,000+ output tokens**, so the array is cut off before its closing `]`.
  `JSON.parse` throws → 422 → "Try clearer images." This matches the reported
  threshold.
- **Request-payload ceiling (a *separate*, higher limit).** Netlify Functions run
  on AWS Lambda, whose synchronous request body is capped at **6 MB**. A
  preprocessed screenshot is ~0.4–0.7 MB of base64, so the combined body crosses
  6 MB only around **~10–12** images — *not* 7. So payload is **not** the
  7-screenshot cause, but it is a real ceiling that an "import up to 12" feature
  will hit if we only raise the token limit. The per-image guard
  (`MAX_BASE64_LENGTH = 7 MB`, `:9`, `:142-144`) checks each image in isolation and
  never catches the *combined* size.

Net: the feature advertises up to 12 screenshots but reliably breaks well before
that, with an error that misdirects the coach to "clearer images."

## Outcome

A coach can select **up to the full 12 screenshots** and the import succeeds:

- **7–12 screenshots import without the truncation error.** Every play the model
  reads for the coach's roster is imported (subject to the existing matching/drop
  rules — `matchBatterToRoster`, `DECISIONS.md` 13). The "Could not read plays …
  Try clearer images." 422 no longer fires for a merely *large* (but well-formed)
  import.
- **A near-limit response degrades gracefully, not catastrophically.** If a single
  request's array is still truncated, the function imports the **complete leading
  objects** it did receive rather than throwing away the entire response.
- **Import summary stays correct.** The merged-and-deduped play set flows through
  the unchanged `importPlayLogPlays` / `showPlayLogSummary`, so the counts
  (players updated, walks, strikeouts, hits, outs, markers) are right.
- **Nothing else changes.** Same Team-screen button, same multi-file picker, same
  roster-gating, same previous-game data model, same blue-dot/X markers, same
  drop-unmatched behavior. No third-party brand name appears.

Concrete before/after (coach selects 9 screenshots covering one game):

| | Before | After |
|---|---|---|
| Result | "Import failed: Could not read plays from the screenshots. Try clearer images." | "Imported N plays for M players." + summary modal |
| Cause exercised | One 9-image request → >4000 output tokens → truncated array → 422 | Images sent in batches (≤4/request) → each response well under the token + payload ceilings → merged + deduped |

## Where it fits

Two files, both already central to this feature. No new module, no new function, no
schema change.

- **`netlify/functions/openai-play-log-import.js`** — owns the OpenAI call and the
  parse. Already validates inputs, rate-limits (`RATE_MAX = 5`/min, `:15`),
  sanitizes output (`:211-231`), and keeps the key server-side. We touch only the
  `max_tokens` value and the parse/`catch` block.
- **`js/play-log-import.js` `readPlayLogFiles`** — owns file reading and the
  single fetch. We wrap the fetch in a small batch loop and reuse the **existing**
  `dedupPlays` (`:232-242`) so overlapping screenshots across batches collapse
  exactly as they do today within one response. `importPlayLogPlays` (`:273-302`)
  already calls `dedupPlays` itself, so concatenating batch results and handing the
  combined list to it is safe and idempotent.

**Reuses:** `preprocessRosterImage` (image prep, unchanged), `dedupPlays`
(cross-batch + cross-screenshot de-dup, unchanged), `importPlayLogPlays` +
`showPlayLogSummary` (apply + summarize, unchanged), the function's sanitizer
(unchanged).

**Must not disturb:** the roster-import path (`imageRosterNotice`, separate
button + `#rosterImportStatus`), the empty-roster gate
(`openPlayLogImport` early-return + the disabled button in `renderTeamScreen`),
the per-IP rate limiter, the drop-unmatched/no-Unknown-Player rule, and the
previous-game arrays (`previousEvents` / `outcomes`, `mode:"previous"`).

## Design

Three changes, smallest-first. (1) and (2) are server-side hardening; (3) is the
change that makes the full 7–12 range reliable by keeping every request small.

### 1. Raise the output-token ceiling (server)

`openai-play-log-import.js:168` — bump `max_tokens` from `4000` to **`16000`**
(gpt-4o supports up to 16,384 completion tokens). With batching (change 3) no
single request will approach this, but the headroom also protects the
not-yet-batched path and any unusually dense single batch.

```js
body: JSON.stringify({
  model: 'gpt-4o',
  max_tokens: 16000,   // was 4000 — a full game of plays overflowed 4000 and the
                       // truncated JSON array failed to parse (Spec 03)
  messages: [ /* unchanged */ ],
}),
```

### 2. Salvage a truncated array instead of failing the whole import (server)

`openai-play-log-import.js:198-209` — when `JSON.parse(cleaned)` fails, attempt to
recover the **complete leading objects** of a cut-off array before giving up. A
truncated array looks like `[ {...}, {...}, {...` — every object up to the last
complete `}` is valid data we can still import.

```js
let plays;
const cleaned = rawContent.replace(/```(?:json)?\n?/g, '').trim();
try {
  plays = JSON.parse(cleaned);
  if (!Array.isArray(plays)) throw new Error('Response is not an array');
} catch {
  plays = salvageObjects(cleaned);   // recover complete leading {...} objects
  if (!plays.length) {
    console.error('Failed to parse play-log response:', rawContent);
    return {
      statusCode: 422,
      body: JSON.stringify({ error: 'Could not read plays from the screenshots. Try clearer images.' }),
    };
  }
}
```

`salvageObjects` is a small brace-depth scanner (no `eval`, no new dependency): walk
the string tracking `{`/`}` depth while respecting string literals + escapes, and
`JSON.parse` each top-level `{...}` slice, keeping the ones that parse. This is the
last-resort net; with batching it should rarely run.

### 3. Batch the screenshots into small requests and merge (client)

`js/play-log-import.js` `readPlayLogFiles` — instead of one fetch with all images,
send the preprocessed images in **chunks of `BATCH_SIZE = 4`**, then concatenate
every batch's `plays` and import once.

Why 4: 4 preprocessed screenshots ≈ **~2–3 MB** body (well under the 6 MB Lambda
limit) and ≈ 4 screenshots' worth of plays (well under 16,000 output tokens). 12
images → **3 requests**, under the function's **5/min** rate limit (`RATE_MAX`), so
**no rate-limit change is required**. (Batch size 2 would make 6 requests and trip
the limiter — do not go below 3.)

```js
const BATCH_SIZE = 4;
const allPlays = [];
const roster = team.players.map(p => ({ name: p.name, number: p.number }));

for (let i = 0; i < images.length; i += BATCH_SIZE) {
  const batch = images.slice(i, i + BATCH_SIZE);
  const batchNo = Math.floor(i / BATCH_SIZE) + 1;
  const batchCount = Math.ceil(images.length / BATCH_SIZE);
  if (status && batchCount > 1) status.textContent = `Reading screenshots… (${batchNo} of ${batchCount})`;

  let result;
  try {
    const response = await fetch('/api/openai-play-log-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: batch, teamName: team.name, roster }),
    });
    result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Server error');
  } catch (err) {
    console.error('Play-log import error:', err);
    if (status) status.textContent = 'Import failed: ' + (err.message || 'Unknown error') + '.';
    return;                       // v1: fail-fast on a bad batch (see Risks)
  }
  allPlays.push(...((result && result.plays) || []));
}

if (!allPlays.length) {
  if (status) status.textContent = 'No plays for this team were found in those screenshots.';
  return;
}

const summary = importPlayLogPlays(allPlays, team);   // dedups internally
save();
renderTeamScreen();
if (status) status.textContent = `Imported ${summary.imported} play${summary.imported === 1 ? '' : 's'} for ${summary.playersUpdated} player${summary.playersUpdated === 1 ? '' : 's'}.`;
showPlayLogSummary(summary);
```

Everything above the loop (file read, `MAX_FILES` check, `preprocessRosterImage`
mapping, the empty-roster guard) is unchanged. `importPlayLogPlays` already calls
`dedupPlays`, so overlapping screenshots that land in different batches still
collapse correctly — the de-dup key is content-based (`playKey`:
date + batter + result + normalized `rawText`), not batch-scoped.

## Step-by-step implementation plan

1. **Read** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `PLAYBOOK.md`,
   `DECISIONS.md` (decision 13), `PLAY_LOG_IMPORT.md`, and this spec. Confirm the
   data model and the drop-unmatched rule before touching code.
2. **Server — raise the ceiling.** In `netlify/functions/openai-play-log-import.js`
   change `max_tokens: 4000` → `16000` (`:168`) with the explanatory comment.
3. **Server — salvage truncated arrays.** Add a `salvageObjects(str)` helper
   (brace-depth scan, string/escape aware, `JSON.parse` each top-level object) and
   wire it into the parse `catch` (`:198-209`) per **Design 2**: only return the
   422 when salvage yields **zero** objects. Leave the sanitizer (`:211-231`)
   untouched — salvaged objects flow through it unchanged.
4. **Client — batch the requests.** In `js/play-log-import.js` `readPlayLogFiles`,
   replace the single fetch (`:345-364`) with the `BATCH_SIZE = 4` loop from
   **Design 3**: per-batch fetch, per-batch progress text, concatenate
   `result.plays`, then the existing empty-check → `importPlayLogPlays(allPlays,
   team)` → `save()` → `renderTeamScreen()` → status → `showPlayLogSummary`. Keep
   the pre-loop file/roster/preprocess logic and `MAX_FILES`/`MAX_IMAGES = 12` as
   is.
5. **Tests** (Vitest; follow the `new Function` extraction style already in
   `tests/unit/play-log-import.test.js`):
   - **`salvageObjects`** (new unit test, extracted from the function file):
     a complete array parses to all objects; a **truncated** array
     `'[{"result":"Single","batterName":"A B"},{"result":"Walk","batterName":"C'`
     recovers exactly the **one** complete object and drops the partial; junk →
     `[]`; a fenced ```` ```json ```` wrapper is stripped first.
   - **Batch fan-out** (integration, mock `fetch`): with `BATCH_SIZE = 4` and 9
     images, `readPlayLogFiles` issues **3** POSTs of sizes 4/4/1, the union of
     their `plays` reaches `importPlayLogPlays`, and **overlapping plays across two
     batches are deduped** (assert via the resulting summary counts). A non-OK
     batch surfaces "Import failed: …" and stops (fail-fast).
   - **Regression guard for the bug:** assert the function body sets
     `max_tokens` to a value `>= 16000` (string/AST check on the source), and that
     a truncated-array response no longer produces a 422 when ≥1 object is
     salvageable (drive the parse path with a stubbed `rawContent`).
   - Keep the existing 21 integration + 51 unit + 2 E2E play-log tests green.
6. **E2E (optional, mocked)** — extend `tests/e2e/play-log-import.spec.js`: stub
   `/api/openai-play-log-import` to return a partial array on one batch and a full
   array on another, select ≥5 files, and assert the summary modal opens with the
   merged counts (no "Import failed"). The Team-screen path doesn't need the live
   Memberstack CDN; the import call is mocked.
7. **Run `npm test`** — full suite must pass before marking complete
   (`CLAUDE.md`, `TESTING.md`).
8. **Commit** `fix: import play-log screenshots in batches so large imports succeed`
   (no third-party brand name, no AI/automation mention). Update `PROGRESS.md`
   (new maintenance entry under Phase 9), set this spec `status: done`, move it to
   `specs/Completed/`, and update the `specs/README.md` table. If the batching
   choice should be locked, add a one-line `DECISIONS.md` note (play-log import
   sends ≤4 screenshots per request and merges via `dedupPlays`; `max_tokens` is
   16000; truncated arrays are salvaged).

## Risks / open questions

- **Minimal-only alternative.** If the *smallest possible* change is preferred,
  steps 2 + 3 alone (raise `max_tokens`, salvage truncation) fix the reported
  7-screenshot case, because the cause at 7 is the token ceiling, not payload. But
  that leaves the **6 MB payload ceiling** unaddressed near 10–12 images, so a coach
  importing the full 12 could still fail with a different (Netlify 502 → "Import
  failed") error. Batching (step 4) is what makes the *advertised* 12 reliable.
  **Recommendation: do all three** — batching is a contained loop around the
  existing fetch, not a refactor.
- **Fail-fast vs. partial success.** v1 stops the whole import if any batch errors
  (matches today's single-request behavior). A future enhancement could import the
  successful batches and report "Imported X; couldn't read Y screenshots." Kept out
  of v1 for simplicity; note it in the commit if desired.
- **Cross-batch de-dup correctness.** Relies on `playKey` being content-based
  (date + batter + result + normalized `rawText`). If the model returns slightly
  different `rawText` for the same play seen in two overlapping screenshots, the
  de-dup could miss it and a play could double-count. This risk already exists
  today for two plays within one response; batching does not make it worse, and the
  test in step 5 should include an exact-duplicate `rawText` case to lock the
  behavior. (Reducing screenshot overlap is the coach's lever; out of scope.)
- **Rate limit headroom.** 12 images / 4 = 3 requests < `RATE_MAX` 5/min, so no
  limiter change. If `BATCH_SIZE` is ever lowered to 3 that's 4 requests (still
  under 5); **do not drop below 3** without raising `RATE_MAX`, or a 12-image import
  will throttle itself mid-run.
- **Cost.** Batching makes up to 3 OpenAI calls instead of 1 for a large import,
  but the total image tokens sent are the same (same images, split across calls);
  the only overhead is the prompt text repeated per batch (~small). Net cost is
  roughly flat and the import actually completes.
- **Misleading 422 copy.** Even after the fix, the residual 422 still says "Try
  clearer images," which is wrong for a token/parse failure. Optional copy tweak —
  e.g. "Couldn't read that batch — try fewer screenshots at once." — but it's
  cosmetic and not required to fix the bug.
