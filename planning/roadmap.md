# Roadmap

No groomed backlog yet — this project was dormant since 2024-04 before being
migrated onto the standard repo scaffold. Items below are gaps noticed during
migration, not a prioritized product plan; revisit with Sachal.

## Must Have

(none yet)

## Should Have

- Regression tests for `src/simulate/shot.js` (the actual physics/trajectory
  derivation — currently untested). Blocked on getting a `THREE.Vector3`-compatible
  object into Jest/jsdom, since Three.js is a vendored global script here, not an
  npm import — see README's Architecture section.

## Nice to Have

- Resolve the `npm audit` findings surfaced on 2026-11-15 (80 vulnerabilities,
  mostly in old transitive CRA/webpack deps) — likely needs a CRA → Vite migration
  to fix cleanly rather than patching in place.
- Fix the stale `caniuse-lite` browserslist data (build-time warning).
