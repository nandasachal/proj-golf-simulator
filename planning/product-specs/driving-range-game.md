# Product Spec: Driving Range Simulator

Status: proposed 2026-11-15

## What this is

A drastic redesign of the existing shot-shape visualizer into a 3D driving range
experience: you set up a shot (club face angle, club path angle, swing speed — the
same variables the page already models), a third-person golfer hits the ball, and
the camera follows the flight down the range. Visual/camera bar: EA Sports PGA
Tour (PS5) — third-person golfer, dynamic ball-follow camera, realistic range
environment — not a line drawn on a grid.

## Who it's for

Golfers (and golf-curious people) who want an intuitive feel for how face angle
and path angle interact to produce draw/fade/hook/slice — the same audience the
current page already serves — but experiencing it as a golf *game moment* instead
of a physics plot.

## What stays from the original page

This is a redesign of the experience, not a replacement of its purpose:

- The core promise — set face angle, path angle, and swing speed; see the
  resulting shot shape and distance — is the product. Phase 3 below is explicitly
  about making sure this "simulator" aspect (freely dialing in any combination of
  variables and seeing a physically-grounded result) is still front and center,
  not buried under game polish.
- The underlying physics (`src/simulate/shot.js` — drag, Magnus lift from backspin,
  gravity) is correct and reused as-is. This is a presentation and interaction
  layer redesign, not a physics rewrite.

## What's new

- **A golfer character**, third-person, who swings at the ball. The swing contact
  moment is what triggers the physics launch (same inputs as today, new trigger).
- **A dynamic camera**: starts behind the golfer/ball at address, then follows the
  ball in flight (PGA Tour-style tracking shot) rather than a fixed top-down/side
  grid view.
- **A driving range environment**: tee area, turf stretching out to ~300+ yards,
  yardage markers, range boundary (nets/trees) — a place, not a grid.
- **Modern visual quality**: real lighting/materials/sky, not the current flat
  white background + cyan wireframe grid.

## Explicitly out of scope (this redesign)

- Multiple holes, putting, a full golf course. This is a **driving range**, not a
  mini-golf or full-hole product — confirmed with Sachal 2026-11-15.
- Multiplayer, scoring/leaderboards, or swing-input minigames (e.g. a power-meter
  you time by hand). Shot parameters stay directly set, as today.
- Mobile/touch-specific redesign beyond what already works responsively.

## Open question to confirm before/while building

Sachal mentioned using the **Fable 5.2** model specifically to generate this
(three.js scene/visual implementation work). Scope of that isn't settled yet —
code generation, 3D-asset/creative generation, or both. Flagging here so it isn't
lost; resolve before Phase 1 (environment/camera) starts, since it affects how
that work gets delegated.

## Architecture note

See [eng-plans/driving-range-game.md](../eng-plans/driving-range-game.md) for the
phased build plan, starting with migrating off the vendored-global Three.js setup
(`public/lib/three.js`, pre-ES-module API) onto the npm `three` package — required
groundwork, since the old API (`THREE.Geometry`, global `OrbitControls`) can't
support the character animation and modern rendering this redesign needs.
