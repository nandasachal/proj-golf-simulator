# Eng Plan: Driving Range Simulator

Status: proposed 2026-11-15
Tier: 1
Spec: [product-specs/driving-range-game.md](../product-specs/driving-range-game.md)

Built one phase at a time, top to bottom. Each phase gets its own commit(s) and a
`loop-evaluator` pass before moving to the next. Nothing here starts until Sachal
approves this plan.

---

## Phase 0 — Engine foundation: npm `three` migration

### Goal

Replace the vendored-global Three.js setup with the npm `three` package, with the
existing shot visualized exactly as it is today. No new visuals yet — this phase
is purely "same behavior, modern foundation," so later phases aren't fighting a
15-version-old API.

### Scope

- In: `npm install three`; convert `src/simulate/main.js` and
  `src/simulate/draw-lib.js` from the `window.THREE` global + old API
  (`THREE.Geometry`, `THREE.TextGeometry`, global `THREE.OrbitControls`) to ES
  module imports (`three`, `three/addons/controls/OrbitControls.js`,
  `three/addons/geometries/TextGeometry.js`, `BufferGeometry` in place of the
  removed `Geometry`). Remove `public/lib/three.js`, `OrbitControls.js`,
  `dat.gui.min.js`, `stats.min.js`, `helvetiker_regular.typeface.js` and their
  `<script>` tags once nothing references the globals.
- In: add a real unit test for `src/simulate/shot.js` (`THREE.Vector3` is now
  importable in Jest, unblocking the roadmap item that's been waiting on this).
- Out: any new visuals, golfer, camera behavior, or environment — those are later
  phases. This phase should look visually identical to production today.

### Acceptance criteria

- [ ] AC1 — `three` is an npm dependency; no code reads `window.THREE`.
- [ ] AC2 — the app renders the same grid + ball-flight-line visualization as
      production today, verified by loading it in a browser and hitting a shot.
- [ ] AC3 — `src/simulate/shot.js` has a unit test suite covering at least the
      trajectory derivation (not just conversions), importing `THREE.Vector3`
      directly from the npm package.
- [ ] AC4 — `scripts/check.sh` is green.

### Verify

- `scripts/check.sh` green.
- Load the app in the browser (built-in browser pane), set face/path/speed
  sliders, click Hit, confirm a trajectory draws and the distance readout
  updates — same behavior as the live site today.

### Evidence required before "done"

- `scripts/check.sh` output.
- A screenshot of a hit shot rendering correctly.
- `file:line` for the new `shot.js` test file and the removed global script tags.

### Stop condition

All 4 criteria pass, or 3 failed attempts at the same criterion (escalate).

---

## Phase 1 — Driving range environment & dynamic camera

### Goal

Replace the flat white background + cyan wireframe grid with an actual driving
range (turf, yardage markers, range boundary) and replace the static top-down
camera with a dynamic one: behind-the-ball at address, tracking the ball in
flight, settling on the landing spot — the PGA Tour PS5 camera feel.

### Scope

- In: range environment (ground plane with turf material, yardage marker
  lines/signage reusing the existing 50yd-interval logic, simple boundary
  props — nets or treeline — and a sky/lighting setup that isn't flat white).
- In: camera state machine — address view (behind golfer/ball, looking downrange)
  → flight-follow (tracks the ball's position, PGA Tour-style smoothing, not a
  rigid lock) → landing/settle view.
- Out: the golfer character itself (Phase 2) — the camera can follow an empty tee
  point or placeholder marker for this phase's verification.

### Acceptance criteria

- [ ] AC1 — range renders with turf, yardage markers at 50yd intervals out to at
      least 300yd, and a boundary/sky that isn't the current flat white.
- [ ] AC2 — camera starts in an address view behind the tee point before a shot.
- [ ] AC3 — on hit, camera transitions to following the ball's position smoothly
      through the whole flight (not a static or purely top-down view).
- [ ] AC4 — camera settles on/near the landing point after the ball stops.
- [ ] AC5 — `scripts/check.sh` green.

### Verify

- `scripts/check.sh` green.
- Browser walkthrough: load app, hit several shots with different face/path/speed
  combinations (straight, draw, slice, short, long), confirm camera tracks each
  correctly and the range renders without visual glitches at different viewport
  sizes.

### Evidence required before "done"

- Screenshots of: address view, mid-flight follow, landing/settle view.
- `scripts/check.sh` output.

### Stop condition

All 5 criteria pass, or 3 failed attempts at the same criterion (escalate).

---

## Phase 2 — Golfer character & swing

### Goal

A third-person golfer model stands at the tee and visibly swings; the ball
launches from the club at the moment of contact, driven by the same physics and
inputs as today.

### Scope

- In: source/add a rigged humanoid character model (needs an asset-sourcing
  decision — e.g. a free Mixamo-rigged model with a golf-swing-adjacent animation,
  vs. a procedural swing animation built by hand; flag this as a decision point
  when this phase starts, don't assume).
- In: wire the swing animation's contact frame to `Shot` launch — the ball must
  appear to leave the clubhead, not spawn from a disconnected point in space.
- In: animation plays fully before the camera moves to flight-follow (Phase 1's
  state machine gets an "address → swinging → flight-follow" state inserted).
- Out: animation variety (different swings per shot shape), club selection, golfer
  customization.

### Acceptance criteria

- [ ] AC1 — a 3D golfer model is visible at the tee in the address camera view.
- [ ] AC2 — clicking Hit plays a swing animation (not an instant/invisible launch).
- [ ] AC3 — the ball's launch position and timing visually match the clubhead's
      position at the animation's contact frame.
- [ ] AC4 — `scripts/check.sh` green.

### Verify

- `scripts/check.sh` green.
- Browser walkthrough: hit multiple shots, confirm the swing plays every time and
  the ball consistently launches from the club, not floating or launching early/late.

### Evidence required before "done"

- Screenshot/short capture of the swing animation mid-motion and at contact.
- `scripts/check.sh` output.

### Stop condition

All 4 criteria pass, 3 failed attempts at the same criterion (escalate), or the
asset-sourcing decision needs Sachal's input (ask, don't guess).

---

## Phase 3 — Simulator UX: keep the "set any variable, see the result" core front and center

### Goal

Make sure the redesign didn't bury the thing that made the original page useful:
freely dialing in face angle, path angle, and swing speed and immediately seeing
the physically-grounded shot shape and distance. Restyle the control panel to fit
the new 3D scene without losing any of that directness.

### Scope

- In: restyled control panel (face/path/speed, left/right side) matching the new
  visual bar — HUD-like, not the current plain white sidebar card — while keeping
  every variable directly and immediately adjustable.
- In: shot result readout (distance, shot shape label e.g. "Draw", "Slice") visible
  after each shot, legible against the 3D scene.
- Out: target/scoring challenges, shot history, saved presets — explicitly
  deferred; flag as a Nice to Have in roadmap.md if Sachal wants them later.

### Acceptance criteria

- [ ] AC1 — all three shot variables (face angle, path angle, swing speed) remain
      directly adjustable and immediately reflected in the next shot.
- [ ] AC2 — a shot's distance and shape are legibly displayed after it lands.
- [ ] AC3 — the control panel visually matches the new scene (not the old plain
      white card).
- [ ] AC4 — `scripts/check.sh` green.

### Verify

- `scripts/check.sh` green.
- Browser walkthrough across a range of parameter combinations, confirming each
  produces a visibly distinct, correct shot shape.

### Evidence required before "done"

- Screenshots of the restyled control panel and a post-shot result readout.
- `scripts/check.sh` output.

### Stop condition

All 4 criteria pass, or 3 failed attempts at the same criterion (escalate).

---

## Phase 4 (stretch) — Visual fidelity pass

### Goal

Push the look closer to the PGA Tour PS5 bar: shadows, improved lighting,
postprocessing (bloom/ambient occlusion), better turf/ball/club materials.

### Scope

- In: whatever subset of the above Sachal wants once Phases 0–3 are live and
  judged against the real bar, not a hypothetical one.
- Out: nothing pre-decided — this phase is intentionally scoped at kickoff time,
  not now, to avoid an open-ended polish loop. Re-scope with Sachal before
  starting.

---

## Cross-cutting notes

- **Fable 5.2**: Sachal wants this model used to generate (some or all of) the
  implementation. Scope of that (code vs. 3D/creative assets vs. both) is an open
  question — see the product spec's "Open question" section. Resolve before
  Phase 1 starts since Phase 0 is mechanical migration work, but Phase 1 onward is
  where the visual/creative generation question actually matters.
- **Git workflow**: lightweight direct-commit-to-`main`, per this repo's existing
  convention (no PR flow requested) — one commit per completed phase/criterion, per
  the standard Development Loop.
- **`npm audit` / CRA→Vite migration** (existing roadmap Nice-to-Have): not part of
  this plan. Phase 0 only touches Three.js usage, not the build tooling.
