# Roadmap

## Must Have

- [done] **Driving range simulator redesign** (2026-11-15) — drastic redesign of the
  shot-shape visualizer into a 3D driving range experience: third-person golfer,
  dynamic ball-follow camera, built in phases starting with a migration off the
  vendored-global Three.js setup. Phases 0–3 shipped 2026-11-15. See
  [product-specs/driving-range-game.md](product-specs/driving-range-game.md) and
  [eng-plans/driving-range-game.md](eng-plans/driving-range-game.md).

## Should Have

- [done] Regression tests for `src/simulate/shot.js` — shipped with Phase 0 of the
  driving range redesign, then extended with tour launch-monitor benchmarks.
- **Visual fidelity pass** (Phase 4 of the driving range plan) — closer to the PGA
  Tour PS5 bar: a properly modelled golfer, postprocessing, better turf/ball/club
  materials. Deliberately unscoped until Phases 0–3 are judged live.
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
- Club selection (irons, wedges) — the physics already matches tour numbers for
  them; every shot is currently a driver.
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
