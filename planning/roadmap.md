# Roadmap

## Must Have

- **Driving range simulator redesign** (2026-11-15) — drastic redesign of the
  shot-shape visualizer into a 3D driving range experience: third-person golfer,
  dynamic ball-follow camera, PGA Tour PS5-level visual bar, built in phases
  starting with a migration off the vendored-global Three.js setup. See
  [product-specs/driving-range-game.md](product-specs/driving-range-game.md) and
  [eng-plans/driving-range-game.md](eng-plans/driving-range-game.md).

## Should Have

- Regression tests for `src/simulate/shot.js` (the actual physics/trajectory
  derivation — currently untested). Resolved as part of Phase 0 of the driving
  range redesign above (migrating to npm `three` makes `THREE.Vector3` importable
  in Jest).

## Nice to Have

- Resolve the `npm audit` findings surfaced on 2026-11-15 (80 vulnerabilities,
  mostly in old transitive CRA/webpack deps) — likely needs a CRA → Vite migration
  to fix cleanly rather than patching in place.
- Fix the stale `caniuse-lite` browserslist data (build-time warning).
