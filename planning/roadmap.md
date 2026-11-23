# Roadmap

## Must Have

- [done] **Driving range simulator redesign** (2026-11-15) — drastic redesign of the
  shot-shape visualizer into a 3D driving range experience: third-person golfer,
  dynamic ball-follow camera, built in phases starting with a migration off the
  vendored-global Three.js setup. Phases 0–3 shipped 2026-11-15. See
  [product-specs/driving-range-game.md](product-specs/driving-range-game.md) and
  [eng-plans/driving-range-game.md](eng-plans/driving-range-game.md).

- **Players, leaderboard and visitor tracking** (names, leaderboard and PostHog analytics live 2026-11-17) — save a
  name, record every game, rank players by share of targets hit; visitor
  analytics; gamification in later phases. Needs a small backend. Awaiting
  approval and a hosting decision. See
  [product-specs/profiles-leaderboard.md](product-specs/profiles-leaderboard.md)
  and [eng-plans/profiles-leaderboard.md](eng-plans/profiles-leaderboard.md).
  - [done] Shorter game: 5 targets, 3 to win, 4 in advanced (2026-11-17).
  - [done] Optional accounts (name + password) replace recovery codes; save form is Name only / Account / Not now; our own accounts mark the browser internal, replacing `?internal=1`; Sign in with Google as a second way in to an account (2026-11-22, built and pushed; deploy and a Google client id pending).
  - [done] Privacy page at `/privacy.html`; Google Analytics and AdSense tags removed; replay text masked (2026-11-22).
  - Privacy follow-ups from the counsel review (2026-11-22): consent banner or no replay for EU/UK visitors; a retention period with a purge job; a deletion runbook that also removes the PostHog person; PostHog "discard client IP".
  - [done] **Analytics instrumentation and dashboards** (2026-11-21; bot
    filtering and a real `app_version` outstanding) — every action tracked with
    a game id, load and error events, three PostHog dashboards. See
    [product-specs/analytics.md](product-specs/analytics.md) and
    [eng-plans/analytics.md](eng-plans/analytics.md).
  - **Optimize activation** (asked 2026-11-21, after analytics ships) — raise
    the share of visitors who take a first shot and finish a game; baseline and
    drop-off points come from the Gameplay dashboard. Activated = attempted a
    target in a game in the first session. First pass built 2026-11-21: Hit
    prompt, easy first target, miss coaching, card progress, Practice / Game
    with difficulty on the card, three controls in a normal game, first-visit
    replay, 15 s model timeout. See
    [product-specs/activation.md](product-specs/activation.md) and
    [eng-plans/activation.md](eng-plans/activation.md).
    - **Shrink the golfer model** (3.3 MB, sent uncompressed; phone load p75
      ~8.8 s on 2 loads) — Draco or meshopt geometry. Blocked on a clean
      re-export: exporting `tools/blender/golfer.blend` today gives a 4.8 MB
      file, not the shipped 3.3 MB, so the build pipeline needs checking first.
    - **Hallway tests** — five people who've never seen it, half on phones.

## Should Have

- [done] Regression tests for `src/simulate/shot.js` — shipped with Phase 0 of the
  driving range redesign, then extended with tour launch-monitor benchmarks.
- [done] **Scenery upgrade** (2026-11-15) — procedural sky and clouds, mountains,
  striped turf, woodland, and a rebuilt tee line and markers
  (`src/simulate/scenery/`).
- **Visual fidelity pass, remainder** (Phase 4 of the driving range plan) — a
  properly modelled golfer, postprocessing (bloom, depth of field), ball/club
  materials. Scenery follow-ups: finer foliage on trees seen up close, real
  shadows beyond the tee, a frame-rate check on an integrated GPU and a phone.
  - [done] **Sharper golfer from a reference video** (2026-11-16) — real golf
    clothes, better skin, eyes and hair, design matched to Sachal's video without
    the heavier build. Open: poses not yet checked (down-the-line, lob wedge,
    left-handed), frame rate, beard edge. See
    [eng-plans/golfer-definition.md](eng-plans/golfer-definition.md).
- **Move golfswingsimulator.com to Render** — the domain still serves the
  pre-redesign GitHub Pages build; needs a DNS change and a custom domain on the
  Render static site.
- [done] **Bounce and roll** (2026-11-15) — Penner bounce + Stimpmeter roll with
  Soft / Normal / Firm ryegrass presets; readout shows total, carry and run.
- **Physics follow-ups from the 2026-11-15 review** — a Reynolds-number drag term
  (driver carry is ~3% short at tour speed); irons and fairway woods land 6–11°
  too shallow (matters once club selection exists); first-bounce heights look
  high on shallow landings; Penner's bounce constants were taken from memory and
  should be checked against the paper. See
  [eng-plans/ball-physics-review.md](eng-plans/ball-physics-review.md).

## Nice to Have

- Resolve the `npm audit` findings surfaced on 2026-11-15 (80 vulnerabilities,
  mostly in old transitive CRA/webpack deps) — likely needs a CRA → Vite migration
  to fix cleanly rather than patching in place.
- Fix the stale `caniuse-lite` browserslist data (build-time warning).
- [done] Settings modal, keyboard shortcuts, aim control and club-at-impact views
  (2026-11-15).
- [done] **Auto club** (2026-11-22) — each new game target puts the club that
  suits it in hand (by distance on the ground in Normal, by the sphere's
  distance and height in Advanced); on by default, switched off in Settings.
- [done] Attack angle and loft-at-impact controls (2026-11-15).
- [done] Heel/toe strike location control (2026-11-15).
- [done] Heel/toe strike control; Game mode as the default (2026-11-15).
- [done] 3D driver close-up replacing the flat club diagrams (2026-11-15), first
  pass. Refinements still open: head shape from behind, materials, making small
  face-to-path angles easier to see at true size, labels in the scene, and the
  view's size on short screens.
- [done] Direct-manipulation shot controls (2026-11-16) — drag handles on the
  club, click-to-type values, live shot-shape preview; sliders removed.
- [done] Shot-control redesign (2026-11-21) — designed in Claude Design
  (Desktop B v2, Mobile B v2): on laptops a strip along the bottom, boxes
  with ‹ number ›, a ruler, the club and Hit on the right, key bar under it;
  type a digit to edit; phones show one control at a time with the
  bag as chips in the drawer. All seven controls show in every
  mode, each with its ruler (2026-11-22; a normal game used to show three, and
  the seven-box strip had no rulers).
- [done] 3D control views (2026-11-16) — the two flat control diagrams are now
  live 3D views of the driver with the drag handles on top.
- Free-look close-up: the orbiting, enlargeable 3D view was removed when the
  controls became 3D. The scene still supports it; bring it back as an
  "expand" on a control view if it is missed.
- [done] **Game rounds and advanced mode** (2026-11-16) — Practice / Normal /
  Advanced; a game is 10 targets (5 to win in normal, 8 in advanced); advanced
  targets float in the air; scoreboard with a per-shot log. Open: tune the air
  target size against real play, a win/lose moment in the scene, saved best scores.
- **More shot controls**, in rough order of value: high/low strike on the face
  (changes launch and spin); wind; tee height; ball position in the stance.
  Altitude/temperature and slope are lower value.
- [done] Club selection (2026-11-15) — 22 clubs chosen in Settings with lofts and
  editable stock carries; every club modelled in 3D in the control views.
- [done] Detailed golfer (2026-11-15) — skinned, clothed figure with a sculpted
  head, two-hand grip, and the selected club's own model in the hands.
- [done] Keyed swing rig (2026-11-16) — full-body swing keyed at P1–P10 against
  tour reference, per-club setup (stance, ball position, tilt, attack angle),
  shoulder and toe joints, breathing at address.
- [done] Modelled golfer (2026-11-16) — a MakeHuman character (CC0), built by
  script in `tools/blender`, driven by the same swing rig. Plan:
  [eng-plans/modelled-golfer.md](eng-plans/modelled-golfer.md).
- [done] Look round (2026-11-16) — drag to orbit the golfer, wheel to zoom, reset
  button; grey wall behind the tee with the motto and Saanchal mark.
- [done] Look up at the sky (2026-11-22) — dragging up past the turf tips the
  view to the sky; Star Wars Mode adds a capital ship over the range and a
  battle station high up.
- [done] Battle station strike (2026-11-22) — look at the station and it
  charges, fires on the 300 yard marker, the blast covers the view and the game
  restarts. Later the same day: beams converge off the dish rim first, the
  blast is a fire shader, and a "You made Darth Vader angry" screen with the
  Empire's mark and an Exit button follows.
- **Golfer follow-ups**: polo collar and golf glove; closer facial likeness
  (needs a decision on a scanned head in a public repo); shorter swing for wedges (every club makes a full
  driver-length swing today); waggle; face-on comparison against real frames.
- **Club follow-ups**: saved distance profiles; altitude,
  temperature and wind settings for the stock distances; a quicker way to change
  club than opening Settings; a putter.
- [done] Target challenge (2026-11-15) — Game mode: random target rings, hit/miss
  scoring and streak.
- [done] Tunable turf (2026-11-15) — grass, height of cut, firmness and leaf
  wetness editable from the ⋯ menu.
- Game mode follow-ups: closest-to-centre scoring, a best-streak record that
  survives a reload, difficulty levels, and a more compact phone layout (the
  target and result cards cover much of the scene together).
- Shot history, saved presets — deferred from Phase 3.
- Delete dead pre-redesign code: `src/components/old/`, the unused root-level
  `src/*Component.js` files, and the old build artifacts committed at the repo root.
- [done] Last shot clears itself (2026-11-22) — stats and line go 5 s after the next target, with a countdown bar and an x to close.
