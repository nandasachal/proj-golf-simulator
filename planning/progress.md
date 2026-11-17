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

2026-11-15 — Scenery upgrade — done: range scenery rebuilt as five procedural
modules in `src/simulate/scenery/` (sky/clouds/lights, terrain/mountains, trees,
props) behind a shared contract (`shared.js`), built in parallel by four subagents
and assembled in `range.js`; `__golfSim.view()` added for inspecting scenery ·
check: green · evidence: driven in the browser from the tee, mid-flight, landed and
at the tree line, no console errors, ~16 ms/frame at 2048x1536 on this Mac ·
decisions: boundary netting built but switched off (it cut across the trees);
ground stays flat inside `FLAT`; trees get baked shade, not shadow maps · next:
measure on an integrated GPU and a phone; finer near-tree foliage; golfer model.

2026-11-15 — Club selection — done: `clubs.js` (22 clubs: loft, lie, length, tour
delivery), `clubLaunch` generalising the driver model, `club-distances.js` (stock
carry, carry→speed), club picker with editable session-only carries in Settings,
`club` URL param, per-club swing-speed range and attack default (attack range now
-8..5), club-aware game targets, club scene takes a club (ball on turf, tangent
contact, sole rested on turf), heads in `club-heads/` (wood.js, iron.js) built by
two subagents to one contract · check: green (242 tests) · evidence: tour-speed
carries within 4% of TrackMan; 8 iron hit in the browser carries 129 yd matching
the Settings table; every family viewed in both pads and at close range ·
decisions: a typed distance changes the club's swing speed, not the physics;
speed/attack/loft reset when the club changes; golfer figure untouched · next:
golfer's club and swing per club; distance profiles; conditions settings.

2026-11-15 — Panel, keyboard and camera — done: top club view taller and side
view zoomed 1.7x (both scale with window height); letter shortcuts removed for
arrow navigation between value boxes with Command-arrows to change (left/right
number, up/down word); each box split into word and number fields; address
camera straight behind a centred golfer, view inset removed; rails beside the
player's bay removed; attack handle kept in view when hitting up off turf ·
check: green (259 tests) · evidence: driven in the browser at 1440x860 and
800x600, driver / lob wedge / 7 iron left-handed extremes · decisions: neutral
for the word is 0 (stock speed for swing speed); R reset shortcut removed with
the letters · next: confirm the Command up/down reading with Sachal.

2026-11-15 — detailed golfer — done: golfer rebuilt by three parallel agents
behind fixed seams (golfer.js skeleton/pose; golfer-body-*.js skinned body,
hands, clothing; golfer-head.js sculpted head modelled on Sachal's photo, photo
not in the repo; golfer-club.js the selected club's head model fitted to the
hands); main.js setClub now reaches the golfer · check: green (278 tests) ·
evidence: driven in the browser at 800x600, driver at address (body, face,
clubhead close-ups), top of backswing and finish, ball launched, no console
errors; agents also checked 6 clubs and left-handed · decisions: clubheadPosition
changed away from address/impact (hands fold in); one club length for all clubs;
club carries its own reflection map since the scene has no environment · next:
face likeness pass (nose, expression, hair silhouette), frame rate measurement,
per-club length and posture.

2026-11-15 — golfer swing rig and anatomy — done: swing rebuilt as a keyed
full-body rig (swing-keys.js: pelvis, chest, head, feet, hands and club keyed
at P1-P10 from published tour biomechanics; swing-rig.js: FK spine, two-bone
IK legs and trail arm, clubface tied to the lead hand), 3:1 tempo, address
shaft 52.4 degrees, SWING_DURATION 1.9; body surfaces reshaped with anatomy,
curved neck joining the head, hair cards, swept-tube fingers, self-shadowing
and wrap-lit skin · check: green (293 tests) · evidence: posed at address, top,
impact, finish from down-the-line and face-on plus close-ups in the browser;
agents covered P1-P10, left-hander, 7 iron, sand wedge and a real Hit ·
decisions: no outside code/data taken (open swing datasets had no clear
licence); no video frames compared, numbers only · next: finish position
(hands high, lead elbow), iron/wedge stance and ball position, toe break and
clavicle bones, trouser fit, hands and face close up, frame rate.

2026-11-15 — golfer round two — done: clavicle and toe bones (shoulders deform
with the chest, shoes bend at the ball of the foot); swing re-keyed against
down-the-line stills of a tour driver swing (deeper hip hinge, steeper top,
lower finish, driver attack +0.9 degrees); per-club setup by category (stance
width, ball position, tilt, hand position, plane from the club's lie; attack
from +0.9 driver to -5.7 wedge), all 22 clubs tested back at the ball at
contact; breathing idle at address (main.js calls golfer.setIdle); looser
trousers, hand and forearm skin maps, calmer face, finer hair · check: green
(301 tests) · evidence: real Hit driven in the browser, top / delivery /
follow-through / finish from face-on and down-the-line, face close-up, no
console errors · decisions: two smoothness bounds in golfer.test.js loosened by
the motion agent (joint 0.012 to 0.02, clubhead 0.03 to 0.05) for the faster
release; no waggle (clubhead would leave the ball before t=0) · next: face-on
comparison against real frames, shorter swing for wedges, articulated fingers,
face likeness, pose-driven cloth folds, frame rate measurement.
2026-11-16 — modelled golfer, scoping — done: phase plan written at planning/eng-plans/modelled-golfer.md (MakeHuman/MPFB scripted in Blender recommended; Mixamo, Ready Player Me, MetaHuman ruled out on licence or shutdown; repo is public so only CC0/CC-BY assets) · check: green · decisions: none taken, three are Sachal's (asset source, likeness in a public repo, OK to download MPFB) · next: on approval start AC1, then AC3 (rig takes proportions) which needs no asset.
