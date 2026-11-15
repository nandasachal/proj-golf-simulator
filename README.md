# Golf Swing Simulator

A browser-based 3D driving range. You set club face angle, club path angle, and
swing speed; a golfer hits the shot, the camera follows the ball down the range,
and a readout tells you the shape (draw, fade, hook, slice, push, pull), carry,
how far offline it finished, apex, and hang time. Built to make the
face-angle/path-angle relationship that produces shot shape intuitive, rather
than abstract.

### Domain context

- **Club face angle** — direction the clubface points at impact relative to the
  target line. The ball starts mostly where the face points (about 85% face, 15%
  path).
- **Club path angle** — direction the clubhead is moving at impact relative to the
  target line. The ball curves away from the path toward the face: the
  face-to-path difference tilts the spin axis, which is what produces draw/fade
  (hook/slice at the extremes). Face and path equal means a straight push or pull.
- **Sign convention** — for a right-hander, positive is right of target (open face,
  in-to-out path). A left-hander is the mirror image, so "open" and "in-to-out"
  mean the same thing to both. `src/simulate/launch-conditions.js` owns this.
- **Club** — every shot is a driver: 1.48 smash factor, 12° launch, 2700 rpm
  backspin. Only swing speed, face, and path vary.
- **Aerodynamics** — quadratic drag plus Magnus lift, with both coefficients a
  function of spin ratio. The constants in `src/simulate/shot.js` are fitted to
  published TrackMan tour averages (driver, 7 iron, wedge), which are regression
  tests in `shot.test.js`. Distance is carry only; there is no bounce or roll.
- Units: physics runs in meters/seconds (`src/simulate/conversions-lib.js` converts
  to/from the MPH/yards/RPM shown in the UI). The 3D scene is in yards, tee at the
  origin, target down +z, and -x is the right-hand side looking downrange.

### Architecture

```
React UI (App.js, components/)          src/simulate/ (no React)
  sliders + side toggle  ──────────►  launch-conditions.js   face/path/speed → launch
  Hit button                          shot.js                launch → trajectory points
  shot readout  ◄── callbacks ──────  shot-analysis.js       trajectory → carry, shape…
  URL query state (hooks/use-query)   main.js                scene, render loop, shot states
                                        ├─ range.js          turf, markers, trees, sky, lights
                                        ├─ golfer.js         procedural figure + swing keyframes
                                        └─ camera-director.js address → swing → flight → landed
```

- **UI** (`src/App.js`, `src/components/`) — React shell. The scene fills the
  viewport and the controls float over it as a HUD panel (stacked under the scene
  on phones). Shot setup lives in the query string (`hooks/use-query.js`), so a
  setup is shareable via URL. The UI talks to the scene only through
  `createSimulator(container, callbacks)` in `main.js`.
- **Simulation** (`src/simulate/`) — framework-agnostic. `launch-conditions.js`,
  `shot.js`, `shot-analysis.js`, `camera-director.js`, and the pose math in
  `golfer.js` are pure and unit-tested; `main.js` and `range.js` need WebGL and are
  verified in the browser.
- **A shot** moves through four states owned by `main.js`: `address` → `swing`
  (the golfer's swing plays; the ball launches on the frame the clubhead returns
  to it, 1.15 s in) → `flight` (ball follows the precomputed trajectory in real
  time, tracer draws behind it) → `landed` (camera settles on the ball for 4.5 s)
  → back to `address`.
- **Golfer** is built from primitives and animated by hand-written keyframes
  rather than an imported rigged model: nothing to license or download, and the
  contact frame is exact by construction.
- **Three.js** is the npm `three` package, imported as ES modules.
- **Verifying the scene** — in development `main.js` exposes `window.__golfSim`
  with `advance(seconds)` (step the simulation without waiting on real time) and
  `inspect()` (current state, ball, camera, clubhead). Use it when a background
  tab is throttling animation frames.

### Hosting

Static React app (Create React App) on Render: static site `golf-swing-simulator`,
auto-deploying from `main`, build `npm ci && npm run build`, publish `build/`. The project uses npm only:
a `yarn.lock` in the repo makes Render run its own `yarn install` first.
Live at https://golf-swing-simulator.onrender.com (`NODE_VERSION` is pinned to 20.9.0 there).

`scripts/check.sh` (tests + a `CI=true` build) is the local gate and uses the same
strict build Render does, so a lint warning fails locally before it fails a deploy.

The custom domain in `CNAME` (golfswingsimulator.com) still points at the old
GitHub Pages deploy on the `gh-pages` branch, which serves the pre-redesign
build. Moving the domain to Render is a DNS change that has not been made.

### Notes

To change slider ranges, edit min, max, default and step in
`src/utils/constant.js`. Camera framing for each shot state is in
`src/simulate/camera-director.js`.
