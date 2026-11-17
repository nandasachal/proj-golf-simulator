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
- **Game mode** (`src/simulate/game.js`) — a game is 10 targets with one shot at
  each, chosen at the bottom of the shot panel as Normal or Advanced (`?mode=practice` turns the game
  off, `?mode=advanced` picks advanced; normal is the default).
  - **Normal**: a random target ring on the ground, 140–330 yd out with the driver
    (between a soft and a full swing's carry with any other club) and up to 40 yd
    either side, bigger the farther it is (13–20 yd radius). A shot scores if the
    ball touches the ground inside the ring at any point: landing, bouncing,
    rolling through or stopping. Hit 5 of 10 to win.
  - **Advanced**: a sphere floating in the air that the ball has to fly through
    (7 yd radius at 100 yd, 9 at 200). Each one is placed on the flight of a random
    swing with the club in hand, 30–85% of the way along it, so it is always
    reachable and turns up low and early, at the apex, or late on the way down. A
    miss reports how far high/low and left/right the ball passed it, or how far
    short it fell. Hit 8 of 10 to win.
  - The card top right shows the target that is up, a pip per target, hits against
    the goal, a log of every shot in the game and the games won this session
    (reset by changing mode or club, and by a reload).
- **Strike location** — where on the face the ball is hit, up to 1 in toward the
  toe or heel. A toe strike starts the ball on the open side (3.5° per inch, from
  the face's bulge and the head twisting) and gear effect tilts the spin axis
  back the other way (14° per inch), so it is a push draw that finishes near the
  line; a heel strike is the mirror, a pull fade. Smash factor drops by 0.07 per
  inch squared (about 8% of carry at a full inch). These three rates are
  estimates chosen to give the well-known pattern, not fitted to measurements.
- **Aim** — where the golfer is set up, up to 10° right or left of the range's
  centre line. Face and path are measured from the aim line, so aiming turns the
  whole shot (`Shot.aim`) and the golfer's stance; shot shape is named relative to
  the aim line, offline distance relative to the centre line.
- **Sign convention** — for a right-hander, positive is right of target (open face,
  in-to-out path). A left-hander is the mirror image, so "open" and "in-to-out"
  mean the same thing to both. `src/simulate/launch-conditions.js` owns this.
- **Clubs** (`src/simulate/clubs.js`) — the bag is 22 clubs: driver (10.5°), 3/5/7/9
  wood (15–24°), 2–6 hybrid (17–28°), 2–9 iron (18–42°) and pitching, gap, sand and
  lob wedge (46–60°), each with its loft, lie, length and a tour reference delivery
  (club speed, attack angle, launch, spin, smash). The references are TrackMan's
  PGA Tour averages where published (driver, 3 and 5 wood, hybrid, 3 iron to
  pitching wedge) and interpolated by loft for the rest. The club is chosen from
  the chip at the top of the shot panel (or in Settings, with its distance); the driver is the default and the only club played off a tee.
  - The driver's standard delivery moves with swing speed (`driverLaunch`): 80 mph
    is 13.8° launch / 3075 rpm / 1.445 smash, 140 mph is 9.6° / 2295 rpm / 1.50,
    passing close to PGA Tour averages at 113 mph.
  - Every other club uses its tour launch numbers at its tour attack angle, with
    backspin in proportion to swing speed and launch 0.03° higher per mph slower
    (`clubLaunch`). At tour speeds the carries land within 4% of TrackMan's
    (regression-tested in `clubs.test.js`).
  - The swing-speed control covers the same golfer for every club: the driver's
    80–140 mph (95 default) scaled by the tour's speed for that club, so a 7 iron
    is 64–112 mph, 76 by default.
  - Face-to-path curves the ball less the more spin loft a club has, the ball
    starts 85% toward the face with woods and 75% with irons, and off-centre
    strikes matter far more with woods (bulge and gear effect) than irons. The
    per-family strike rates are estimates.
- **Stock distances** (`src/simulate/club-distances.js`) — Settings shows each
  club's carry for a solid, straight strike at its default swing speed, in the
  air Shot always flies in: sea level, 68°F, no wind. Typing a distance sets
  that club's swing speed (to 0.1 mph) for the session; it is held in memory
  only, so a reload returns to the stock numbers. Saved profiles are a later
  feature.
- **Attack angle and loft** — attack angle is how far up (+) or down (-) the head
  is travelling at impact (±5°); loft at impact (dynamic loft) is the standard
  loft for the swing speed plus or minus up to 4°. Spin loft is loft minus attack
  angle. Launch is 85% loft + 15% attack angle; backspin scales with spin loft;
  each extra degree of spin loft costs 0.012 of smash factor (capped at 1.50);
  and more spin loft means less curve for the same face-to-path. So hitting up
  with the same loft launches higher, spins less and carries farther. The
  proportionalities are standard launch-monitor relationships; the smash-loss
  rate is fitted to one comparison (driver vs 7 iron), not measured.
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
- **Turf** — the landing area is flat. Four conditions feed the ground model and
  are all editable in Settings (the ⋯ button on the control panel): grass species, height of
  cut (0.35–1.5 in), ground firmness (0–1) and leaf wetness (0–1). Ryegrass is
  the baseline the model was tuned on; bentgrass (rolls ~12% farther) and
  bermudagrass (thatchy: deeper pitch mark, deader bounce, slower roll) are rough
  adjustments in the direction the USGA/R&A study reports, not fitted values.
  Three ryegrass presets set the other fields:
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
  club chip, settings modal           clubs.js               the bag: loft, lie, tour delivery
  ⋯ settings modal (turf)             ground.js              touchdown → bounces + roll
  mode buttons, score                 game.js                ground and air targets, hit or miss
  shot readout  ◄── callbacks ──────  shot-analysis.js       trajectory → carry, total, shape…
  URL query state (hooks/use-query)   main.js                scene, render loop, shot states
                                        ├─ range.js          assembles scenery/ (below)
                                        ├─ golfer.js         hangs the meshes on the rig
                                        │    swing-keys.js     the swing keyed at P1-P10 (tour reference)
                                        │    swing-rig.js      spine chain, leg and arm IK, grip
                                        │    golfer-model.js   loads the modelled character (public/models/golfer.glb)
                                        │    golfer-retarget.js  drives its skeleton from the rig
                                        │    golfer-body-*.js  stand-in figure built in code, shown until the model loads
                                        │    golfer-head.js    the stand-in's head
                                        │    golfer-club.js    the selected club, fitted to the hands
                                        └─ camera-director.js address → swing → flight → landed
```

- **UI** (`src/App.js`, `src/components/`) — React shell. The scene fills the
  viewport with a HUD over it (stacked under the scene on phones).
  - **Shot controls are the club itself** (`components/simulator/club-pads.jsx`).
    The left panel shows the club in hand at impact in two live 3D views, built from
    the same scene as the old close-up (`club-scene.js`, below): from above
    (aim, face, path, strike) and from the toe (attack angle, loft), plus one
    bar for swing speed. Drag handles are laid over each view at the screen
    position of a point in the scene, and a drag is read back by casting a
    ray from the pointer onto the turf (or the upright plane through the ball
    and target). Every control can be set three ways: drag its handle, use
    the keyboard, or click its number to type one. Each control has a value
    box showing two fields: a word (closed / square / open) and a number.
    The keyboard (`src/utils/shortcuts.js`) works on the boxes: the arrow
    keys move between them, Command (Ctrl) with ←/→ changes the selected
    box's number by a step, Command with ↑/↓ steps its word (one side,
    neutral, the other side), and Space hits. There are no letter shortcuts.
    Clicking the word sets the control back to neutral. Handles are real `role="slider"` elements (Home/End,
    double-click to reset; arrows belong to the boxes) and show their value in a tag while
    hovered or held. The panel names the shot shape for the current setup with
    a thumbnail of its flight, but gives no distance, so game mode still has
    to be judged.
  - **Angles are drawn bigger than life in the two views** so one degree is a
    visible, grabbable movement: face and path ×5, aim ×2.5, attack and loft
    ×4, strike ×2 (the × is shown in each view's corner; the numbers are
    always true). The handle geometry is pure and tested in
    `src/utils/club-handles.js`, in the scene's own centimetres.
  - The shot panel carries the club in hand (the chip in its header opens the
    bag), Reset (the icon top right) and the mode (Practice, Normal, Advanced,
    along the bottom). On phones the mode and Hit are a bar fixed to the
    bottom of the screen, the game card shrinks to the target, pips and
    score, and Settings and Reset view sit in the bottom corners of the
    picture. Club distances, dominant side, turf and the feedback
    link are in a modal behind the gear button, bottom left. On laptops Hit sits to the
    right of the result bar.
  - Shot setup, the club (`club`), turf (`turf` preset plus `cut`/`firm`/`wet`/`grass` overrides)
    and `mode` live in the query string (`hooks/use-query.js`), so a setup is
    kept in the URL; the game score and current target are not.
  - The UI talks to the scene only through `createSimulator(container,
    callbacks)` in `main.js`.
- **Simulation** (`src/simulate/`) — framework-agnostic. `launch-conditions.js`,
  `shot.js`, `ground.js`, `game.js`, `shot-analysis.js`, `camera-director.js`, and the pose math in
  `golfer.js` are pure and unit-tested; `main.js` and `range.js` need WebGL and are
  verified in the browser.
- **Golfer** — the one imported asset. `public/models/golfer.glb` is a MakeHuman
  character (CC0, see `public/models/LICENSE.md`) built by script in
  `tools/blender/` (its README covers setup and rebuilding). The swing is not
  baked into it: `swing-keys.js` and `swing-rig.js` pose a 17-bone rig each
  frame, and `golfer-retarget.js` maps that onto the model's own skeleton,
  re-solving the arms and legs for the model's measurements so its hands close
  on the grip and its feet stay planted. A figure built in code stands in while
  the file loads, and stays if it fails to.
  He wears a golf cap, a quarter-zip pullover, grey trousers, dark trainers and
  a glove on the lead hand, a design taken from a reference video of Sachal
  that is kept out of the repo. The collar, zip, cap and glove are built by
  script (`golfer_outfit.py`), which also subdivides the head; the rest is MakeHuman clothing repainted
  (`golfer_finish.py`). The design follows the video but the build does not:
  `golfer-build.test.js` fails if the body's girth grows.
  His face is Sachal's: a front photo is projected onto the skin texture
  during the build. The photo itself is not in the repo, so rebuilding
  without it gives the same golfer with a generic face, and the face is not
  CC0 (`public/models/LICENSE.md`).
- **Scenery** (`src/simulate/scenery/`) — everything but the golfer, generated in
  code (no downloaded assets). `range.js` assembles five parts, each returning
  `{ object, update(seconds, camera) }`; `main.js` calls the update every frame
  (clouds drift, trees sway, flags wave).
  - `fleet.js` — a hidden extra: `?empire` in the URL puts two
    wedge-shaped capital ships slowly crossing the sky, each circled by
    flights of twin-panel fighters, with more fighter patrols all round the
    range (fighters near the capital ships and far out are small, in proportion
    to the hulls; the ones overhead are larger). The capital ships are town-sized (900 and 1700 yd long) and fly beyond the mountains, so they are hazed by
    hand rather than by the scene fog, and the camera's far plane is pushed
    out while they are on. Not in any menu.
  - `shared.js` — the contract the parts agree on: the sun direction and colour,
    the horizon/fog colour, `terrainHeight(x, z)` and the `FLAT` rectangle where
    the ground must stay at y = 0 because the ball physics assumes level ground.
  - `sky.js` — sky dome shader (atmosphere gradient, sun, two cloud layers lit by
    the sun), the lights, the golfer's shadow map and `FOG`.
  - `terrain.js` — one ground mesh with a single turf material (fairway stripes,
    first cut, rough, meadow, all computed from world position) and four rings of
    mountains with their own haze.
  - `trees.js` — about 2,800 instanced trees in four species with alpha-tested
    foliage cards, wind, baked ground shade (the shadow map only covers the tee),
    shrubs and grass tufts.
  - `props.js` — yardage signs, yard lines, target greens with waving flags, the
    tee line (deck, mats, rails, ball trays, bags) and range furniture. Greenside
    bunkers are visual only.
- **Looking round** — dragging the picture swings the camera round the golfer
  and the wheel moves it in and out (`orbit-view.js`, pure and tested; pointer
  handling in `main.js`). The view stays where it was put until the reset
  button (bottom right, shown only then) or the next hit hands it back to the
  camera director, so a shot is always followed from the address view. Behind the tee line stands a grey wall with the motto and
  the Saanchal mark (`scenery/wall.js`), there to be found by turning round.
- **Address camera** — straight behind the ball, looking down the target
  line, so a straight shot leaves straight up the middle of the picture; the
  golfer stands beside it. The scene is centred on the whole window (the
  control panel overlaps its left edge).
- **A shot** moves through four states owned by `main.js`: `address` → `swing`
  (the golfer's swing plays; the ball launches on the frame the clubhead returns
  to it, 1.15 s in) → `flight` (ball follows the precomputed trajectory in real
  time, then its bounces and roll, tracer drawing behind it) → `landed` (camera
  settles on the ball for 3.5 s)
  → back to `address`.
- **Golfer** is built from primitives and animated by hand-written keyframes
  rather than an imported rigged model: nothing to license or download, and the
  contact frame is exact by construction.
- **Club scene** — the 3D club used by the two control views. `createClubScene`
  takes the club, options for a fixed camera, which guides to draw, and exposes `project`
  (scene point to screen pixels) and `pick` (screen position to scene point) for
  the drag handles. The named camera angles, orbiting and value tags from the
  earlier free-look close-up are still in the scene but no longer mounted.
  `club-setup.js` (pure, tested) turns the controls into the pose: absolute face,
  path and start directions, loft tilt, strike offset, launch. The scene puts the
  face where it is tangent to the ball for the loft delivered (lower on the ball
  the more loft) and, for clubs off the turf, slides the head along its face
  until its sole rests on the grass, so irons show their forward shaft lean.
  The heads are sculpted in code in `src/simulate/club-heads/`, all to one
  contract (centimetres, right-handed, origin at the middle of the face leaning
  back by the club's loft, `userData.solePoints` for resting it on the turf):
  `wood.js` builds the driver, fairway woods (pear-shaped, shallow face, railed
  sole) and hybrids (compact, iron-like face, keeled sole); `iron.js` builds
  forged cavity-back irons in satin chrome with stamped numbers and steel
  shafts, and dark teardrop specialty wedges with full-face grooves. The driver
  head: `headPoint` maps a unit sphere onto the head (rounded-triangle plan,
  domed crown over a rim set below mid-face, shallow sole, blunt tail, cut flat
  at a face with 10.5° of built-in loft plus bulge and roll), finished with a woven-carbon crown under clear coat, brushed-metal sole,
  weight port and a necked hosel, plus shaft, dimpled ball, tee and a patch of
  turf, and draws the guides at true angles: a wide lime ribbon with chevrons for club
  path, white for where the face points plus a white line along the face itself,
  orange for the ball's start line, a lime rod for the head arriving (tilted by
  attack angle) and an orange rod for the launch. Each guide carries a small tag
  with its value; tags stay a fixed size on screen and hide behind the club. A 3×
  button draws the small angles three times bigger (`amplifyAngles`) while the
  tags keep the true numbers.
  It renders only when something changes. Buttons move the camera between four
  angles (Behind, Toe, Above, Face), drag orbits, and Enlarge pops it out.
  In development it is reachable as `window.__clubScene` (`setView(name, {instant:
  true})`).
- **Three.js** is the npm `three` package, imported as ES modules.
- **Verifying the scene** — in development `main.js` exposes `window.__golfSim`
  with `advance(seconds)` (step the simulation without waiting on real time),
  `inspect()` (current state, ball, camera, clubhead) and `view(position, target)`
  (hold the camera somewhere to look at scenery; `view(null)` releases it). Use it when a background
  tab is throttling animation frames. A hidden preview pane also delays React's
  passive effects, so the scene can lag the UI (a new target not yet set, a
  scored shot looking unscored): click something first (e.g. Restart) to flush
  them before hitting.

### Load time

- The modelled golfer (`public/models/golfer.glb`) is preloaded from
  `index.html`, so it downloads alongside the script. The figure built in
  code takes about four seconds of main-thread time to make, so it is only
  built if the model fails to load (`createGolfer({ figure: false })`,
  `golfer.buildFigure()`).
- After every Blender export run `python3 tools/model/shrink_textures.py`: it
  re-encodes the model's largest textures in place (normal maps to 1024 px,
  colour maps to 2048 px). Needs `cwebp`/`dwebp`.

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
