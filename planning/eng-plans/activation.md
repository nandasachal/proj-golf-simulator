# Activation: eng plan

Spec: [../product-specs/activation.md](../product-specs/activation.md).
Status: built 2026-11-21 (load: timeout only, compression deferred; see progress.md). Approved by Sachal in conversation ("do all these").

## Goal and scope

Ship the spec's changes in one pass: first-visit Hit prompt, easy first target,
coaching after a miss, clearer game progress, Practice / Game toggle with
difficulty on the game card, controls that follow the mode, first-session replay,
and a load-time check with a faster first frame if phones are slow.

## Design calls

- **First visit** lives in `src/first-visit.js`: localStorage flags `golf.shot`
  (any shot taken) and `golf.target` (any target attempted), read and written in
  try/catch. No flag yet = first time. `first_visit` super property is true on a
  browser's first page load (`golf.visited`).
- **Hit prompt**: while `golf.shot` is unset, Hit pulses and a one-line callout
  sits above it ("Press Hit or Space to take your first shot").
- **Easy first target**: while `golf.target` is unset and the mode is normal, the
  first target is on the centre line between the default swing's carry and where
  it stops, so a straight default shot touches it. `easyTarget()` in `game.js`.
- **Coaching**: `src/simulate/coach.js`, pure, tested. Picks the bigger miss
  (distance or side, like `missKind`), works in the golfer's frame so left-handers
  get the same advice. Side misses: if face-to-path curves the ball the way it
  missed (≥1°), "lower Face or raise Path"; else "lower/raise Face". Distance:
  Speed. Air height: Loft. Shown on the game card after a miss; `coach_shown`
  event with `tip`.
- **Progress**: the card shows "Target N of 5" and the standing line on phones
  too, and before the first shot says "Hit 3 of 5 to win".
- **Mode**: the bar is Practice | Game. Normal / Advanced is a two-way switch in
  the game card header (where the game lives; keeps the phone bar to two buttons
  and Hit). Game remembers the last difficulty in the session. URL param unchanged.
- **Controls by mode**: normal shows Face, Path, Speed; practice and advanced
  show all seven. Hidden controls use their defaults for the shot. Keyboard grid
  skips hidden boxes; the starting box is Aim when shown, else Face.
- **Replay**: recording stays off by default and is started only on a first
  visit (`first_visit`), inputs masked. Needs replay enabled on the PostHog
  project.
- **Load**: read `app_ready.load_ms` by viewport in PostHog. If phone p75 > 4 s
  and the model download is the cause, show the built-in figure first.

## Acceptance criteria

1. New browser: Hit pulses with the callout; both gone after the first shot and
   on reload.
2. New browser, normal game: a default-control first shot hits target 1; target 2
   onward random. A browser that has attempted a target gets random target 1.
3. After a missed target the card shows one coaching line matching the miss;
   `coach_shown` fires. Unit tests cover right/left, curve vs start, long/short,
   air high/low/short, and a left-hander.
4. Card shows target number and what's needed on phones and laptops.
5. Mode bar shows Practice and Game; difficulty switch on the card changes
   targets; `setting_changed` still fires.
6. Normal shows three controls; advanced and practice show seven; a hidden
   control set in the URL does not change a normal shot.
7. `first_visit` on events; replay starts only on first visits.
8. Load p75 by viewport recorded in progress.md, with the decision.
9. `scripts/check.sh` green; driven in the browser at laptop and phone width.

## Stop

All criteria pass, or three failed attempts at one.
