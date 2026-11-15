# Golf Swing Simulator

A browser-based 3D driving range. You set club face angle, club path angle, and
swing speed; a golfer hits the shot, the camera follows the ball down the range,
and a readout tells you the shape (draw, fade, hook, slice, push, pull), carry,
total distance, carry, run, how far offline it finished, and apex. Built to make the
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
  The tilt is atan(tan(face-to-path) / tan(spin loft)) with a 12.5° driver spin
  loft: about 4.5° of axis tilt per degree, in line with TrackMan's published
  driver examples.
- **Sign convention** — for a right-hander, positive is right of target (open face,
  in-to-out path). A left-hander is the mirror image, so "open" and "in-to-out"
  mean the same thing to both. `src/simulate/launch-conditions.js` owns this.
- **Club** — every shot is a solidly struck driver. Launch numbers move with swing
  speed (`driverLaunch`): 80 mph is 13.8° / 3075 rpm / 1.445 smash, 140 mph is
  9.6° / 2295 rpm / 1.50, passing close to PGA Tour averages at 113 mph.
- **Aerodynamics** — quadratic drag plus Magnus lift, with both coefficients a
  function of spin ratio. The constants in `src/simulate/shot.js` are fitted to
  published TrackMan tour averages (driver, 7 iron, wedge), which are regression
  tests in `shot.test.js`.
- **Bounce and roll** (`src/simulate/ground.js`) — after touchdown the ball bounces
  (Penner's model: a rigid impact against a surface tilted back by the pitch
  mark, speed-dependent restitution, friction that slides or grips, so backspin
  kills forward speed) until a hop would rise under about 5 cm, then rolls to rest
  at a constant deceleration tied to a Stimpmeter reading. Steeper landings and
  more spin run less.
- **Turf** — the landing area is perennial ryegrass (upright, no grain), flat.
  Three presets differ in height of cut, soil firmness and leaf wetness:
  Normal (0.6 in, average moisture, dry leaf; about 18 yd of run for a tour
  drive), Soft (0.75 in, wet; about 8 yd) and Firm (0.45 in, dry; about 32 yd).
  The bounce mechanics and the Stimpmeter-to-deceleration conversion are standard
  physics; the per-preset scalings were tuned to tour carry-vs-total gaps and
  USGA/R&A bounce-and-roll measurements, and Penner's constants were fitted to
  iron shots onto greens, so drives onto fairway are an extrapolation. See
  `planning/eng-plans/ball-physics-review.md`.
- Units: physics runs in meters/seconds (`src/simulate/conversions-lib.js` converts
  to/from the MPH/yards/RPM shown in the UI). The 3D scene is in yards, tee at the
  origin, target down +z, and -x is the right-hand side looking downrange.

### Architecture

```
React UI (App.js, components/)          src/simulate/ (no React)
  sliders + side toggle  ──────────►  launch-conditions.js   face/path/speed → launch
  Hit button                          shot.js                launch → trajectory points
  turf toggle                         ground.js              touchdown → bounces + roll
  shot readout  ◄── callbacks ──────  shot-analysis.js       trajectory → carry, total, shape…
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
  `shot.js`, `ground.js`, `shot-analysis.js`, `camera-director.js`, and the pose math in
  `golfer.js` are pure and unit-tested; `main.js` and `range.js` need WebGL and are
  verified in the browser.
- **A shot** moves through four states owned by `main.js`: `address` → `swing`
  (the golfer's swing plays; the ball launches on the frame the clubhead returns
  to it, 1.15 s in) → `flight` (ball follows the precomputed trajectory in real
  time, then its bounces and roll, tracer drawing behind it) → `landed` (camera
  settles on the ball for 3.5 s)
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
