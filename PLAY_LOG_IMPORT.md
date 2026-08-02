# Defensive Positioning Assistant — Play-Log Import (Feature Spec)

Status: **Implemented (Step 13).** This document records the agreed expectations
for the play-log import feature. Implementation: `js/play-log-import.js` +
`netlify/functions/openai-play-log-import.js`, wired from the Team screen. Read it
alongside `ARCHITECTURE.md`, `DECISIONS.md` (decision 13), and the Step 13 entry
in `PLAYBOOK.md`.

> Naming note: do **not** use any third-party scorekeeping-app brand name in the
> codebase, UI, docs, or commit messages. Refer to the input only as a
> **play-by-play log screenshot** and the feature as **Play-Log Import**.

---

## 1. Goal

Let a coach upload one or more **play-by-play log screenshots** (the "Plays"
view of a scorekeeping app) from the Team screen. Defensive Positioning Assistant reads each play,
identifies the **batter**, matches the batter to the **existing roster**, and
writes the result into that batter's **previous-game** history — updating
walk/strikeout history and adding spray-chart markers for balls in play — with
**no manual charting**.

This is **not** a pitch-tracking feature.

---

## 2. Confirmed data model — the "main play object"

A requirement was to confirm that the app stores plays as a single unit. It
does. Every batter (a roster `player` object in `js/game.js` / `js/storage.js`)
carries three arrays:

| Array | Holds | Used for |
|-------|-------|----------|
| `previousEvents[]` | Balls in play from **prior games** (have `x`/`y`) | Blue dots / X markers in "Previous Games" mode; spray + recommendations |
| `currentEvents[]` | Balls in play from the **live game** (have `x`/`y`) | Red markers in "Current" mode |
| `outcomes[]` | The unified plate-appearance log (capped at 50) — **both** balls in play (`type:"hit"`) **and** no-location events like Walk / Strikeout / Bunt (`type:"noBall"`) | Last-5, hot/cold, at-bat counts |

A **batted-ball event** object looks like:

```js
{ x, y, time, outcome, isOut, mode, type:"hit" }   // x, y are normalized 0–100
```

A **no-location event** object looks like:

```js
{ outcome, type:"noBall", mode, time, isOut }       // no x/y → no marker
```

The importer writes into these **existing** arrays — **no new schema, no
team-spray-chart rebuild.** The team spray chart already auto-builds from each
batter's combined `previousEvents` + `currentEvents`, which satisfies the
"most important rule" (update each batter first; the team chart follows).

### What the importer writes per play

| Imported play | Target | Object |
|---------------|--------|--------|
| Hit (Single / Double / Triple / Home Run) | `previousEvents` **+** `outcomes` copy | `{x,y,time,outcome,isOut:false,mode:"previous",type:"hit"}` → **blue dot** |
| Reached On Error / Fielder's Choice | `previousEvents` **+** `outcomes` copy | same shape, `isOut:false` → **blue dot** |
| Out in play (Ground Out, Fly Out, Line Out, Pop Out, Sac Fly, Sac Bunt, batter out on a DP) | `previousEvents` **+** `outcomes` copy | `{x,y,...,isOut:true,...}` → **X** |
| Walk / Hit By Pitch / Catcher's Interference | `outcomes` only | `{outcome:"Walk",type:"noBall",mode:"previous",time,isOut:false}` → **no marker** |
| Strikeout | `outcomes` only | `{outcome:"Strikeout",type:"noBall",mode:"previous",time,isOut:true, kind?:"looking"\|"swinging"}` → **no marker** |

All imported events carry `mode:"previous"` so they render as historical (blue)
data and never pollute the live game. Optional metadata (`game`, `date`,
`source`) may be attached to imported events; the storage validator only checks
top-level `appData` fields, so extra event fields are safe.

> Rendering reference: `js/ui.js` draws `.hit.previous` (blue dot) when
> `isOut` is false and `.hit-x` (X) when `isOut` is true; `zoneLabel(e)` in
> `js/utils.js` classifies the marker's zone from its `x`/`y`. So setting a real
> `outcome` + correct `isOut` + a sensible `x`/`y` is all that's required.

---

## 3. v1 scope (locked)

**v1 is import-only.** Build the importer and the post-import summary. **Do not**
build any review/reassignment screen, marker editing, or **any "Unknown Player"
concept** — those are out of v1 (see §9).

| In v1 | Out of v1 |
|-------|-----------|
| Upload one or more screenshots from the Team screen | Any "Unknown Player" bucket, list, or review UI |
| OpenAI Vision extraction of plays | Marker **edit** (tap / drag / delete) |
| Roster matching (no new players created) | Per-record editing of any kind |
| Write balls-in-play, walks, strikeouts into previous-game history | Team-spray-chart rebuild (already exists) |
| De-dup overlapping screenshots | Pitch tracking from the log |
| Multi-game uploads in one batch | |
| Import summary | |

---

## 4. Screenshot reality (from the example images)

The example set establishes what the importer must cope with:

1. **Each play log contains BOTH teams.** Inning headers alternate, e.g.
   `BOTTOM 3RD • <our team> 12U` (the coach's team batting) vs
   `TOP 4TH • <opponent> 12U` (the opponent batting). Only innings where the
   **coach's team is batting** are imported.
2. **The coach's own batters appear by NAME, not jersey number** — e.g.
   "A Nolan walks", "M Ellis is hit by pitch", "J Pike strikes out looking".
   Jersey numbers appear only for the **opponent**, whose roster wasn't entered.
   So in practice the coach's team is matched **by name first**, which inverts
   the stated Jersey→Name priority.
3. **Names are truncated** — either "First L" ("Devon R", "Sam O", "Nico A")
   or "F Last" ("M Ellis", "C Vance", "J Pike"). The roster stores fuller
   names, so matching is fuzzy (initial + partial).
4. **The coach's fielders are named inside opponent at-bats** — e.g.
   "grounds out to shortstop C Vance", "error by first baseman M Ellis".
   The importer must extract only the **batter** of each play and must **never**
   credit a fielder's name as an at-bat.
5. **Multiple games / dates per batch** — the examples span four games against
   different opponents.
6. **Overlapping screenshots** — consecutive scrolled shots repeat the same
   plays, so the importer must de-duplicate.

---

## 5. How the importer knows which plays are the coach's

The import runs **from the Team screen**, so Defensive Positioning Assistant already knows the selected
team's name and full roster. Both are injected into the OpenAI request:

- `roster` — `[{ name, number }]` for every player on the team. **This is the
  authoritative signal.**
- `teamName` — the Defensive Positioning Assistant team name, passed only as a weak hint.

> **Identify the coach's plays by the ROSTER, not the team name.** The scorekeeping
> app almost always labels the team differently than the coach named it in Defensive Positioning Assistant
> (e.g. Defensive Positioning Assistant "Riverside Rockets 12U" appears as "Northgate Baseball Club
> 12U-Sanders" in the screenshots, and the inning header that reads
> "BOTTOM 3RD • NORTHGATE…" is the coach's team batting). Filtering on the
> team-name header returns **zero plays**.
> So the model keeps a play only when its **batter matches a roster player** (by
> name, allowing truncated "First L" / "F Last" forms, or by jersey number when
> shown); every other batter is an opponent and is omitted.

The model is instructed to identify the **batter only** (never a fielder), match
that batter to the roster, and copy the batter exactly as written. The
client-side matcher (§7) re-checks every returned play against the roster as a
backstop.

---

## 6. AI extraction contract — extract only the confident, known plays

New Netlify Function: `netlify/functions/openai-play-log-import.js`
(modeled on `openai-roster-import.js` — server-side `OPENAI_API_KEY`, per-IP
rate limit, input validation, JSON-only output). It accepts an **array** of
images plus the roster context, and returns a flat array of structured plays.

**Confidence rule (locked):** the model should return **only** plays it
can confidently attribute to a **known roster player we provided** and whose
result/location it can read clearly. Anything ambiguous, unreadable, belonging
to the opponent, or not matching a roster player is **omitted** — there is no
"Unknown" output. The client-side importer applies the same rule as a backstop:
a play that does not confidently match a roster player is **dropped** (see §9).

To keep geometry deterministic, **the model does not output coordinates.** It
returns structured fields and the browser computes `x`/`y` (see §8). Per-play
shape:

```jsonc
{
  "date":        "Jun 3",                       // game date from the screenshot header
  "battingTeam": "Northgate Baseball Club 12U", // header team name — informational only, NOT a filter
  "batterName":  "Micah E",                     // batter must match a roster player
  "batterJersey":"",
  "result":      "Single",   // Single|Double|Triple|Home Run|Walk|Hit By Pitch|
                             // Catcher's Interference|Strikeout|Ground Out|Fly Out|
                             // Line Out|Pop Out|Sac Fly|Sac Bunt|Error|Fielders Choice|...
  "battedBallType": "ground", // ground|line|fly|popup|none
  "location":    { "explicit": "left field", "fielder": "shortstop" },  // either/both/none
  "strikeoutKind": "looking", // looking|swinging|null
  "rawText":     "Sam O singles on a hard ground ball to left fielder T Marsh."
}
```

The function sanitizes strings and returns `{ plays: [...] }`. It does **not**
filter on `battingTeam` — the roster match (done by the model and re-checked
client-side) is what isolates the coach's plays.

---

## 7. Roster matching (client-side, `js/play-log-import.js`)

For each extracted play, match the batter to a roster player using, in order:

1. **Jersey + name** — both agree.
2. **Jersey** — exact jersey match (mostly relevant if the coach's scorekeeping
   roster shows numbers).
3. **Name** — fuzzy match against the truncated name. Handle both "First L" and
   "F Last" forms: compare last name + first initial, or first name + last
   initial, against each roster player.

**Confidence rule:** a unique, unambiguous match wins. If the name/initial is
ambiguous (two roster players fit) or nothing fits, the play is **dropped** — see
§9. **Never create a new roster player** (hard rule).

**Jersey numbers are not unique between teams**, so jersey-only matching is only
trustworthy *inside a half-inning where the coach's team is batting*. The model
(§6) anchors which side is the coach's by the roster **names** (names are far more
unique than numbers), then skips any half-inning where the coach's players are
the **fielders** — even if an opposing batter's `#N` matches a roster number. This
prevents an opponent's jersey-number play (e.g. `#9 doubles` in a half-inning the
coach is fielding) from being credited to the coach's `#9`.

**Base-runners are not batters.** A description like "Strike 3 Looking, X steals
2nd, X scores" names a *runner* (X), not the batter; the batter is whoever the
result belongs to (here, whoever struck out). The model is told never to credit a
runner — or a fielder — as the batter.

---

## 8. Location → coordinates (0–100 space)

The app's coordinate space (`js/utils.js` `zoneLabel`, and the field SVG) puts
home plate low (`y≈84`), second base high (`y≈39`), `x=50` up the middle.
Reference infield spots: `3B {21,62}`, `SS {34,52}`, `2B {66,52}`, `1B {76,62}`,
`P {50,65}`. Outfield is anything outside the dirt diamond at a smaller `y`
(deeper). The mapping follows the agreed rules exactly:

**Priority 1 — explicit location** in the text; **Priority 2 — fielder position**
if no explicit location.

**Ground balls plot in the INFIELD lane** (where the ball traveled), never the
outfield, even when the text says "to left field":

| Ground ball direction (phrases) | Marker zone | Approx (x,y) |
|---------------------------------|-------------|--------------|
| Left side — "through the left side", "past shortstop", "between SS and 3B", grounder "to left field" | Left infield lane (SS–3B) | ~`{28,55}` |
| Middle — "up the middle", "through the middle", grounder "to center" | Middle lane (SS–2B) | ~`{50,48}` |
| Right side — "through the right side", "between 1B and 2B", "past second baseman", grounder "to right field" | Right infield lane (1B–2B) | ~`{72,55}` |

**Line drives & fly balls plot in the OUTFIELD:**

| Direction | Marker zone | Approx (x,y) |
|-----------|-------------|--------------|
| Left field | LF | ~`{25,25}` |
| Left-center | LCF | ~`{38,18}` |
| Center field | CF | ~`{50,15}` |
| Right-center | RCF | ~`{62,18}` |
| Right field | RF | ~`{75,25}` |

**Fielder-position fallback** (Priority 2) maps the named fielder to its
position coordinate; a ground ball to that fielder goes to the nearest **infield
lane**, a fly/line/pop to that fielder goes to its **position area** (an infield
pop stays in the infield near the fielder).

**Two constraints:**
- **Don't stack markers.** Apply a small random jitter (±~2–3 in `x`/`y`) so
  repeated balls to the same zone render as separate dots, kept small enough to
  stay in the same zone (so the dot's `zoneLabel` still matches).
- **Don't place a marker exactly on a fielder dot** — offset slightly toward the
  proper area, per the agreed rules.

The chosen `x`/`y` must land in the zone that `zoneLabel` would report for it, so
the marker's on-field label is consistent with its position.

---

## 9. Unmatched plays — dropped (v1 behavior)

There is **no "Unknown Player" concept anywhere in v1.** Any play that does not
confidently match a roster player — ambiguous name, opponent batter, unreadable,
or a player not on the roster — is **silently dropped** and **not imported**. No
parked list, no bucket, no roster player is created, and the import summary does
**not** report an "unknown/unmatched" count. The AI is instructed to only emit
plays it is confident about; the client-side matcher drops anything that slips
through. (A future version could add an opt-in review screen, but it is out of
scope and must not be stubbed in.)

---

## 10. De-duplication & multi-game handling

- A single import may contain **multiple games**. Each play is tagged with its
  `game`/`date` (from the screenshot header) so plays group by game and a
  strikeout history can record date.
- **De-dup within the import:** before writing, collapse duplicate plays that
  appear in overlapping screenshots. Dedup key ≈
  `game.date + batter + result + normalized(rawText)`. Identical plays are
  written once.
- v1 does **not** track which games were previously imported across separate
  import sessions; importing the same game twice in two sessions can double-count.
  (Acceptable for v1; revisit if it becomes a problem.)

---

## 11. Import summary

After processing, show a summary (modal, matching existing patterns):

- Players Updated
- Walks Recorded
- Strikeouts Recorded
- Hits Added
- Outs Added
- Total Spray-Chart Markers Added

(No "Unknown Player" line — unmatched plays are dropped, §9.) Then `save()` and
re-render the Team screen.

---

## 12. UI & wiring

- **Entry point:** an `IMPORT PLAY LOG` button on the Team screen, in the same
  card as `IMPORT ROSTER` (`index.html` ~line 199–201). It opens a **multi-file**
  image picker (`accept="image/*" multiple`).
- **Button is gated on the roster** (locked): the `IMPORT PLAY LOG` button
  is **disabled / not selectable** whenever the current team has **zero players**,
  and becomes enabled once at least one player exists. `renderTeamScreen()`
  toggles the disabled state (and a muted style) based on `team.players.length`.
  This is correct because import matches against the roster — there is nothing to
  match into on an empty roster.
- **New frontend module:** `js/play-log-import.js` (depends on storage, utils,
  game, ui). Load order becomes:
  `storage → utils → game → recommendations → ai → ui → roster-import →
  **play-log-import** → memberstack → batter → spray-charts → app`
  (update `index.html`, `ARCHITECTURE.md`, and the load-order rule in
  `CLAUDE.md` together).
- **New Netlify Function:** `netlify/functions/openai-play-log-import.js`
  (added to `ARCHITECTURE.md`'s functions table; per-IP rate limit, e.g.
  5/min since multi-image calls are heavier).
- Reuse image preprocessing like `preprocessRosterImage` (scale to ≤1600px).
  Loading + error states required.

---

## 13. Testing expectations

- **Unit:** name-matching (both "First L" and "F Last" forms; **ambiguous →
  dropped, not Unknown**), the result→`{isOut, type, marker}` mapping, the
  location→`(x,y)` mapping (ground ball stays in the infield lane; fly/line goes
  to the outfield; fielder fallback; jitter stays in-zone so `zoneLabel` agrees),
  dedup, and the empty-roster button-disabled state.
- **Integration:** the Netlify Function returns sanitized structured plays,
  filters out non-coach-team batting, and never returns fielder names as batters.
- **E2E:** the Team-screen import button is disabled with an empty roster and
  enabled after a player is added; with a stubbed response it produces the
  expected summary numbers and writes `previousEvents` / `outcomes`.
- Follow `TESTING.md` conventions (`.integration.test.js`, `.spec.js`; never a
  literal `<style` in `.test.js`).

---

## 14. Naming / branding rule

The third-party scorekeeping-app brand name must **not** appear anywhere that
ships: no filenames, identifiers, button labels, comments, docs, or commit
messages. Use "Play-Log Import" / "play-by-play log screenshot." (This is in
addition to the existing rule against mentioning AI-tooling vendors.)
