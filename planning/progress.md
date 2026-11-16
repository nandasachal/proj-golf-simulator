# Progress Log

2026-11-15 — repo migration — done: renamed GitHub repo golf-simulator →
proj-golf-simulator to match ~/co naming convention, cloned to
~/co/proj-golf-simulator, put it on the standard personal-os engineering scaffold
(README purpose/context/architecture, CLAUDE.md, planning/, continuous-learning.md,
scripts/check.sh). Fixed the pre-existing broken CRA boilerplate test
(`src/App.test.js` asserted text that no longer exists and crashed on missing
Router context) and added a real unit suite for `src/simulate/conversions-lib.js`.
check: green (`scripts/check.sh` — tests + build) · decisions: kept the
lightweight direct-commit-to-main git workflow (no CI/PR flow requested);
left the physics engine (`shot.js`) untested for now since Three.js is a vendored
global, not an npm import — see roadmap · next: nothing queued; this was a
one-off scaffold migration, not active feature work.

2026-11-15 — driving range redesign, Phases 0–3 — done: migrated Three.js to the
npm package (Phase 0); built the range environment and address → flight-follow →
landed camera (Phase 1); added a procedural golfer whose swing launches the ball at
the contact frame (Phase 2); rebuilt the UI as a HUD over a full-screen scene with
a shape/carry/offline/apex/hang readout (Phase 3). Outside the plan: replaced the
ball-flight aerodynamics and the face/path → launch mapping, which were badly wrong
(95 mph carried 325 yd; open face curved the wrong way), fitted to TrackMan tour
averages. check: green (`scripts/check.sh`, 67 tests + strict build) · evaluator:
all criteria PASS except Phase 0 AC2 (grid opacity differed in the interim port;
superseded by Phase 1, not fixed). Evaluator defects fixed: camera no longer ends
inside the treeline on wild shots, a handedness switch mid-shot now mirrors the
golfer on return to address, URL values are clamped to slider ranges · decisions:
physics fixed despite spec saying out of scope; procedural golfer instead of an
imported rig; hosting moves to Render static site (GitHub Pages + custom domain left
untouched) · next: judge it live, then scope Phase 4 (visual fidelity) with Sachal;
move golfswingsimulator.com DNS to Render if wanted.

2026-11-15 — ball physics review + bounce and roll — done: independent review of the
flight model; added `ground.js` (Penner bounce, Stimpmeter roll, Soft/Normal/Firm
ryegrass presets) with the run animated in the scene and a Turf toggle; readout now
leads with total and shows carry and run. Flight fixes from the review: true
spin-axis tilt at ~4.5° per degree of face-to-path, speed-dependent driver launch
table, landing interpolated to the ground. check: green (94 tests + strict build) ·
decisions: implemented the review's recommendations A, B and D; left the
Reynolds-number drag term (C) for later · next: verify Penner's constants against
the paper; consider damping first-bounce height; see
planning/eng-plans/ball-physics-review.md.

2026-11-15 — tunable turf + game mode — done: ⋯ overflow menu on the control panel
exposes every turf assumption (grass species, height of cut, firmness, leaf
wetness) with the presets still one tap away and custom values carried in the URL;
Game mode puts a random target ring with a beacon downrange, scores a shot that
touches the ground inside it, shows hit/miss with the miss distance, and serves a
new target after a hit. check: green (117 tests + strict build) · decisions:
"hit" means any ground contact inside the ring, not only where the ball stops;
bentgrass/bermudagrass modifiers are rough, direction-only adjustments · next:
game-mode follow-ups on the roadmap; phone layout is crowded with both cards up.

2026-11-15 — result bar — done: the shot readout is now a low, wide bar along the
bottom of the scene (centred in the area the control panel doesn't cover; full
width on phones with the feedback button above it) instead of a card top-right.
check: green · next: nothing queued.

2026-11-15 — ground flicker fix — done: root-caused the flashing turf during the
follow camera to depth fighting between the stacked ground planes (measured: up to
72% of ground pixels changing between consecutive frames, vs a steady ~2% with the
overlays hidden). Overlays now render through `groundOverlay()` (draw order, polygon
offset, no depth write) and the camera near plane went 0.1 → 0.5. After: a smooth
5–11% per frame with no spikes, which is the mowing stripes legitimately moving.
check: green · next: nothing queued.

2026-11-15 — controls rework — done: session settings (game mode, dominant side,
turf presets and fields) moved into a modal behind the ⋯ button, leaving the left
panel for shot controls only; keyboard shortcuts for every shot control with the
keys shown on hover; result bar centred on the screen; new Aim control (±10°) that
turns the shot and the golfer's stance; three club-at-impact diagrams under the
panel (from behind, from the toe, from above) that redraw with the controls. Reset
now clears only the shot, not the settings. check: green (136 tests + strict
build) · decisions: letter keys rather than arrows so shortcuts don't fight a
focused slider; diagrams exaggerate angles 3× with true numbers in captions ·
next: more shot controls per roadmap (attack angle / dynamic loft first).

2026-11-15 — attack angle and loft — done: two new shot controls (attack angle ±5°,
loft at impact ±4° around the standard for the swing speed) feeding launch angle,
backspin, smash factor and curve through spin loft; sliders, G/T and H/Y shortcuts,
URL params `attack`/`loft`; the toe view now tilts the arriving-head arrow and the
face line with them. Defaults reproduce the previous flight exactly. check: green
(148 tests + strict build) · next: strike location on the face per roadmap.

2026-11-15 — strike location + game default — done: Strike control (up to 1 in
toward toe or heel, B/N keys, `strike` URL param): toe strikes start on the open
side and draw back, heel strikes pull and fade, both lose ball speed; the plan
views slide the club head so the ball sits toward the toe or heel. Game mode is now
the default (`?mode=practice` opts out). check: green (158 tests + strict build) ·
decisions: strike rates are estimates chosen for the known pattern, flagged in
README · next: high/low strike or wind per roadmap; the left column is ~795 px
tall now and scrolls on shorter windows.

2026-11-15 — strike location + game default — done: heel/toe strike control (±1 in,
B/N keys, URL `strike`): a toe strike starts the ball on the open side and gear
effect draws it back, a heel strike is the mirror, and off-centre contact costs
ball speed. Game mode is now the default; `mode=practice` in the URL selects
practice. check: green (158 tests + strict build) · next: realistic 3D club view
replacing the three flat diagrams (one large view, angle buttons, ground ribbons,
driver sculpted in code — options confirmed by Sachal).

2026-11-15 — 3D club view — done: replaced the three flat SVG diagrams with one
live 3D close-up of the driver at impact (options confirmed by Sachal: sculpted in
code, one large view with angle buttons, ground ribbons at true angles). Driver
head shaped from a sphere with a lofted, curved face, hosel, red shaft, dimpled
ball on a tee, turf patch, studio reflections and shadows; ribbons for path, face
and start line plus rods for attack and launch; Behind/Toe/Above/Face camera
buttons, drag to orbit, Enlarge. check: green (169 tests + strict build) ·
decisions: true angles, so face and start lines nearly overlap at small values;
view shrinks on short screens · next: Sachal to review the look and direct
refinements (head shape, materials, camera angles, labels).

2026-11-15 — 3D club view: head shape and materials — done: reshaped the driver
head (rim lowered below mid-face so the crown is a dome and the sole a shallow
dish, squarer plan, rounder tail, crown peak just behind the face); crown is
woven carbon under clear coat and now reads gloss black; brushed-metal sole;
weight port set flush with a chrome surround; hosel grows out of the heel with a
neck and collar; added a rim light. check: green (169 tests + strict build) ·
next: guide lines and labels, or further look-and-feel notes from Sachal.

2026-11-16 — laptop layout fixes — done: Hit moved to the right of the result bar
with the pair centred (phones keep Hit with the controls); the "Golf Simulator" tag
removed; Settings is now a gear button bottom-left, replacing the "?" button, with
the feedback form linked from a Feedback button inside it. check: green (170
tests + strict build) · next: Sachal to pick a direction from the control/club-view
design variations.

2026-11-15 — 3D club view: guides and labels — done: ribbons fade in from the tail
and the path ribbon carries chevrons; a white line along the club face makes small
face angles readable; every guide has an in-scene tag (Path, Face, Start, Launch,
Attack) that stays a fixed pixel size, sits to the side of its line and hides
behind the club; a 3× button amplifies the small angles while tags keep true
values; the Above camera is pulled back to fit the tags. check: green (174 tests +
strict build), run in an isolated worktree because another session had
uncommitted layout work in the main checkout · next: Sachal's notes on the view.

2026-11-16 — direct-manipulation controls (design direction A) — done: the seven
sliders are replaced by two club pads (from above: aim, face, path, strike; from the
side: attack, loft) with drag handles, plus a speed bar. Each control also takes its
shortcut keys, arrow keys on a focused handle, a double-click reset, and a
click-to-type value that snaps and clamps. The panel names the shot shape for the
current setup and sketches the flight (no distance, so game mode keeps its
challenge). The 3D close-up moved behind a toggle. URL updates now replace history
instead of pushing an entry per step. check: green (204 tests + strict build);
dragging verified in the browser with pointer events for all seven controls, typing
verified, fits 1280x720 and phone width · decisions: 2D pads rather than dragging on
the 3D model (reliable hit targets, testable geometry); 5x angle exaggeration for
grab comfort · next: real-hand play-test by Sachal; touch dragging on a real phone
is untested.

2026-11-16 — club pads: deeper verification and fixes — done: probed the live build
with pointer events routed the way a real pointer routes them, in left-handed mode
with aim offset, and found and fixed five defects. (1) Pressing the face handle
often grabbed Aim: the grab areas overlapped and the top-most won; a press now goes
to the nearest handle. (2) One speed-bar sweep rewrote the URL 123 times (Safari
throws past 100 in 30 s); shot values now sit in memory and the URL is written once
they settle (1 write per sweep, 1 per 50 key repeats). (3) Focus was dropped after
typing a value; it returns to the value. (4) A refused pointer capture threw and
killed the drag; drags now track the pointer at window level with no capture. (5)
Key presses arriving faster than a redraw were lost; steps now build on the latest
value. Also: the 3D close-up scrolls into view when opened. check: green (210
tests) · still open: on phones the pads and the 3D scene don't fit on screen
together, so you adjust, then scroll up to watch; handle grab areas are 41 px on a
phone (44 is the usual minimum); tab order visits Hit and Settings before the
controls; real trackpad/touch still untried by hand.

2026-11-16 — 3D control views — done: the two flat control diagrams are replaced by
live 3D views of the driver (the close-up's scene on fixed cameras: from above and
from the toe) with the drag handles projected onto them and drags read back by ray
casting. `club-scene.js` gained fixed-camera/guide options, `project` and `pick`;
handle geometry moved to world space in `src/utils/club-handles.js` (replaces
`club-pad.js`). Handles show a value tag while hovered or held; the side view has a
line up the face plane for loft. The separate "3D close-up" toggle is gone (it was
the duplicate). check: green (213 tests + strict build) · verified in the browser:
all seven controls drag with realistic pointer routing, both hands, every handle
≥12 px inside its view across 128 extreme setups, fits 1280x720, phone width and
touch-style drag · decisions: two fixed views rather than one tabbed view, so no
control needs a camera change to reach; angles exaggerated per control (×5, ×2.5,
×4, ×2) and disclosed in each view's corner · next: real-hand trial; consider an
expand/free-look on a view.
