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
2026-11-16 — modelled golfer, build — done: MakeHuman character built by script (tools/blender), exported to public/models/golfer.glb (2.0 MB, 35k triangles, CC0); swing rig takes body measurements; golfer-retarget.js drives the model skeleton (arm frames from the elbow bend, forearm twist share, closed grip); loaded at runtime with the code-built figure as stand-in · check: green (308 tests) · decisions: wrist smoothness bound for hands/forearms is 0.88 per 1/120 s because the rig releases the club that fast; leg-length sanity bound 20% · next: frame rate, close-up comparison, collar, likeness; then orbit view and wall.
2026-11-16 — look round + wall — done: drag to orbit the golfer and wheel to zoom (orbit-view.js, tested), reset button bottom right shown only while orbiting; grey wall behind the tee with the motto and the Saanchal mark (scenery/wall.js, logo copied to src/assets/images); frame rate 60 fps steady with the model · check: green (312 tests) · decisions: orbit persists through swing and flight until reset; logo is now in a public repo at Sachal's request · next: Render deploy needs Sachal (deploy tool call was denied), AC8 side-by-side, collar/glove, likeness.
2026-11-16 — modelled golfer, grip and open checks — done: grip rebuilt so the club lies across the fingers (lead 58°, trail 74°), thumbs resting on top, wrists placed from the model's own palm; checked in the browser: 7-iron right-handed and lob wedge left-handed (address, top, follow-through, finish), failed-load fallback (built figure stays, one warning), side-by-side sent; tests added for swapping the model in · check: green · decisions: hands sit 0.022 yd nearer the butt than the rig's hold points so a straight lead arm reaches with the lob wedge · next: polo collar and glove (the old figure's shirt is better detailed), likeness.
2026-11-16 — game rounds + advanced mode — done: modes are Practice / Normal / Advanced (mode=game still means normal); a game is 10 targets, one shot each, 5 to win in normal and 8 in advanced; advanced targets are spheres in the air placed on the flight of a random swing with the club in hand (game.js randomAirTarget, evaluateTarget judges the flight); scene draws the sphere with hoops, tether and ground mark, lit green as the ball goes through; game card rebuilt as a scoreboard (pips, goal, per-shot log, games won this session, Restart / Play again) · check: green · evidence: advanced game driven in the browser, two hits and a miss logged, no console errors · decisions: every target gets one shot (a miss no longer keeps the target), New target button replaced by Restart, air radius 5 + 0.02 x distance is a first guess · next: tune air target size, win/lose moment in the scene, saved best scores.
2026-11-16 — Share removed; Hit releases a dragged view — done: Share button, its URL builder and the toaster removed (Reset is full width); `hit()` calls `resetView()` so a shot always starts from the address view and follows the ball · check: green · decisions: snap, not ease, back to the address view · next: tune air target size, win/lose moment in the scene
2026-11-16 — Panel: mode, reset icon, club dropdown — done: mode buttons moved from Settings to the bottom of the shot panel; Reset is an icon in the panel header; the club chip opens a dropdown of the bag (distances stay in Settings); keyboard shortcuts stand down while the list is open · check: green · decisions: club can still be picked in Settings beside its distance · next: tune air target size, win/lose moment in the scene
2026-11-16 — Panel tidy — done: header is three boxes (Shot Shape, Club dropdown, Reset icon) matching the value chips; "Drag or click" hint removed; mode buttons read "Game Mode: Normal / Advanced"; panel padding and gaps evened out · check: green · decisions: "Game Mode" is a caption above the word so three buttons fit the panel width · next: walkthrough feature (Sachal, later), tune air target size
2026-11-16 — sharper golfer, plan — done: stills of the current model reviewed (T-shirt with painted neck ring, recoloured jeans, trainers, red-brown irises, glossy skin, hard hairline; no polo, cap or golf shoe in the MakeHuman pack); phase plan written at planning/eng-plans/golfer-definition.md; tools/blender/reference/ git-ignored for the video · check: not run (docs only) · decisions: build stays no heavier than today's golfer, enforced by a girth test; clothes made by script before any downloaded asset · next: Sachal approves the plan and copies the video into tools/blender/reference/ (the Apple Notes path is unreadable from here); then baseline girth, Part A.
2026-11-16 — Hidden fleet — done: `?empire` in the URL adds seven wedge-shaped capital ships crossing the sky left to right (`scenery/fleet.js`, placement tested); read once when the scene is built · check: green · decisions: hulls skip the fog so they stand out from cloud; ships fade at the ends of the crossing so the wrap is unseen · next: walkthrough feature, tune air target size
2026-11-16 — Fleet at true scale — done: five ships 750-1700 yd long flying level beyond the mountains (z 1450-2250), hazed by hand, hull plating texture, belly hangar and reactor dome; camera far plane 4600 while the fleet is on; pad views a little shorter so the whole panel fits an 850px-tall window · check: green · decisions: fewer, far larger ships instead of seven small near ones · next: walkthrough feature, tune air target size
2026-11-16 — sharper golfer, built — done: outfit redesigned from Sachal's video (beanie, quarter-zip pullover with stand collar and zip, grey trousers, dark trainers, white lead-hand glove, stubble); MakeHuman sweater, jeans and trainers repainted, collar/zip/beanie built by script, hand re-skinned as the glove; eyes no longer red, skin has a normal map; trainer texture's brand mark painted out; girth test added (chest 0.5207, waist 0.4384, hips 0.5274 of height) · check: green · evidence: Blender stills, in-app screenshots at address (close), top and finish face-on with the driver, console clean; GLB 1.83 MB, 32,074 triangles · decisions: proportions left alone, no environment map, no belt · next: check down-the-line, lob wedge and left-handed poses; frame rate during a swing; loop-evaluator review; soften the beard's edge by the ear.
2026-11-16 — Fleet: fighters, fewer capital ships — done: capital ships cut from five to two; flights of three twin-panel fighters loop each ship (5 flights each) and 14 patrol flights circle the range at all bearings and overhead, drawn as instanced meshes; placement functions tested · check: green · decisions: fighters oversized (20-46 yd) so they read at range; patrol circles centred off the tee so fighters aren't always seen panel-on · next: walkthrough feature, tune air target size
2026-11-16 — sharper golfer, cap and face — done: beanie replaced by a six-panel golf cap with a curved peak (Sachal's call); face reworked: head split off and subdivided once, skin worked at 4096 px with sharpening, pores and a normal map, short beard and cropped hair painted as strokes with a hairline, glossy eyes; beard edge by the ear faded; shoulder seam straightened · check: green · evidence: Blender stills; in app: driver right-handed down-the-line (address, top, impact), lob wedge left-handed (address, top, finish), close-up of the face, console clean; GLB 5.03 MB, 58,700 triangles · decisions: only the head is subdivided to stay under 60k triangles · next: frame rate and load time with the pane showing (readings here were throttled), the pullover bunching under the lead arm at the finish, loop-evaluator review, a real likeness needs face photos.
2026-11-16 — Fleet: fighter sizes by distance — done: escorts beside the capital ships cut from 46 to 12 yd and far patrols to 9-15 yd so they are in proportion to the hulls; overhead patrols keep 20-32 yd · check: green · decisions: none · next: walkthrough feature, tune air target size
2026-11-16 — sharper golfer, face from photos — done: face shape set from Sachal's front and side photos with MakeHuman targets (oval head, broad round-tipped nose, wide mouth, larger closer-set eyes, ears out), eyebrow009 darkened, even stubble with a moustache, darker skin tone and lips; preview.py gained BARE=1 and straight-on face views; girth measurement now uses fixed levels and a fixed reference height so head changes cannot move it (chest 0.5198, waist 0.4393, hips 0.5275: body unchanged) · check: green · evidence: renders beside the photos (kept out of git), in-app load and close-up, console clean; GLB 4.87 MB, 58,668 triangles · decisions: resemblance by sliders, the photo is not projected onto the model; Blender is now 5.3 and the build runs with BLENDER_USER_RESOURCES pointed at the 5.2 folder · next: decide whether to go further on likeness, frame rate and load time with the pane showing, pullover bunching at the finish, loop-evaluator review.
2026-11-16 — sharper golfer, photo on the face — done: Sachal's front photo projected onto the head's skin texture (affine fit on eyes, nose tip and chin; weighted by how squarely the surface faces the camera; eyes and the smiling mouth masked off; broad shading divided out; tone matched to the skin); eyebrow cards removed when the photo is used; LICENSE.md says the face is not CC0 · check: green · evidence: renders beside the photo (kept out of git), in-app close-up at the finish, console clean; GLB 4.80 MB, 58,476 triangles; girth unchanged · decisions: Sachal chose the likeness knowing the site and repo are public; build falls back to painted skin when the photo is absent · next: a neutral mouth-closed photo would let the whole face be used; frame rate and load time; pullover bunching at the finish; loop-evaluator review.
2026-11-16 — Phone layout — done: mode + Hit in a bar fixed to the bottom of the screen; compact game card (150px: target, pips, score, Restart); Settings and Reset view in the bottom corners of the picture with the result bar above them; keyboard hint hidden on phones; club chip tooltip removed; checked at 320, 375 and 768 wide · check: green · decisions: bar rendered outside the blurred panel (backdrop-filter pins fixed children) · next: page-load speed
2026-11-16 — range: coloured target nets removed — done: the three colour-coded catch nets with bullseyes (red, yellow, blue, at 75, 125 and 225 yd) are gone from scenery/props.js; yardage signs, greens and flags stay · check: green on a clean copy of HEAD with only this change (the shared working tree had another session's main.js mid-edit and not compiling) · evidence: none in the browser, for the same reason · next: look at the range once main.js compiles again.
2026-11-16 — Camera behind the ball; faster load — done: address and swing cameras sit on the target line so a straight shot goes straight up the picture; the picture is lens-shifted just enough to keep a right-hander clear of the shot panel on narrow laptop windows. Load: the figure built in code (~4 s of main thread, measured on the dev server) is no longer built unless the model fails; golfer.glb is preloaded from index.html; its textures re-encoded by tools/model/shrink_textures.py (4.8 MB -> 3.3 MB) · check: green · decisions: colour maps kept at 2048 so the painted face keeps its detail; no geometry compression (needs a decoder and tooling not installed) · next: bird's-eye view card after a hit
2026-11-16 — Bird's-eye view — done: a collapsible card under the game card, shown once a shot has stopped: range from above with 50 yd lines, flight, run, landing and rest points, and the target; `shot-track.js` supplies the points with the shot result · check: green · decisions: portrait map (downrange is up); starts folded on phones · next: walkthrough feature, tune air target size
2026-11-17 — Loading screen — done: static `#loading` screen in public/index.html (title, moving bar, "Building the range…"), painted before React starts (index.js waits a frame), faded out on the scene's new `onReady` once the golfer is in place · check: green · evidence: dev server, loading screen visible on navigation, gone with the golfer on the tee, no app console errors; live site measured before this at 4.0 s (cached) to 8.5 s (first visit) of blank page on an M4 · decisions: waits for the golfer rather than showing the range without him · next: timing marks to split the scene-building task (scenery vs WebGL setup), then cut it
2026-11-17 — Wall mottos — done: the back wall's motto now cycles through three (`MOTTOS` in scenery/wall.js) every 5 s, the old one lifting away as it fades and the new rising in; `mottoAt` picks motto and blend, tested · check: green · evidence: dev server, all three seen on the wall, no console errors; the mid-fade frame was not caught in a screenshot · next: none
2026-11-17 — Wall mottos — done: third motto changed to "Do or Do Not / There Is No Try" · check: green · next: none
2026-11-17 — Shorter game — done: a game is now 5 targets; normal needs 3, advanced 4 (was 10, 5 and 8); tooltip, README and tests follow · check: green · evidence: dev server, card reads "Target 1 of 5" · decisions: advanced kept at 80% (4 of 5), Sachal only named 3 of 5 · next: profiles and leaderboard plan
2026-11-17 — Players and leaderboard, plan — done: product spec and phase plan written (planning/product-specs/profiles-leaderboard.md, planning/eng-plans/profiles-leaderboard.md), roadmap entry added; no code · check: n/a · decisions: none taken; hosting (Render ~$13/mo vs Cloudflare free), advanced at 4 of 5, 3-game minimum and rank names are Sachal's · next: Sachal approves the plan and picks hosting, then Phase 1 (analytics) and Phase 2 (players and recording)
2026-11-17 — wall motto — done: wall shows one static motto (Do or Do Not, There Is No Try); cycling and its test removed · check: green (346 tests) · decisions: none · next: leaderboard plan awaits approval and backend choice
2026-11-17 — players + leaderboard, phases 2 and 3 — done: server/ (FastAPI + Postgres API, 36 tests on embedded Postgres), src/players (profile, offline shot queue), save-name step, leaderboard dialog, win confetti + sound, README section, knowledge-base doc; driven in browser against a local API at laptop and phone width · check: green (390 client, 36 server, build) · decisions: Render backend (Sachal); shots carry a client id and played-at time (dedupe, right week); recovery rotates the key; name filter matches word starts only; CORS allows the onrender.com origin too · review: loop-evaluator found no failing criterion; fixed duplicate neighbour row, fetch timeouts, rate-limit message, phone card overlap · next: confirm Render prices and get Sachal's go-ahead to create the web service + Postgres, set REACT_APP_API_URL or api. DNS, then deploy API before redeploying the site; phase 1 needs the Cloudflare Web Analytics token. Open: per-club target bound, week boundary is Monday 00:00 UTC, old device is silent after a recovery elsewhere
2026-11-17 — leaderboard deploy — done: Render Postgres golf-leaderboard-db (basic-256mb, 1 GB) and web service golf-leaderboard-api (starter) created via render.yaml blueprint (manual sync, manual deploys); site points at https://golf-leaderboard-api.onrender.com and is redeployed; live leaderboard dialog loads from the API on golfswingsimulator.com · check: green · decisions: no api. subdomain; ADMIN_TOKEN generated by Render, never read · next: Sachal saves the first real name on the live site; phase 1 needs the Cloudflare Web Analytics token; store ADMIN_TOKEN in 1Password; phase 4 (ranks, bests, badges, streak) criteria to be written
2026-11-17 — targets, bird's-eye, recovery, analytics — done: normal target is one circle at 0.9x the old radius (2.5x the old inner ring); air target is the centre sphere only at 2x (0.32x the old radius); bird's-eye card shows in a game before hitting with Previous shot / Current shot views and altitude in advanced; recovery adds a key so both devices keep working (migration 003); PostHog wired (src/analytics.js), off until REACT_APP_POSTHOG_KEY is set · check: green (393 client, 36 server, build) · decisions: autocapture and replay off, localStorage persistence; weekly board is a filter over shots, nothing is deleted · next: Sachal creates the PostHog project and gives the key; watch whether 4 of 5 in advanced is still winnable with the small sphere
2026-11-17 — PostHog live — done: PostHog project 745617 (US) created by Sachal; REACT_APP_POSTHOG_KEY set on the Render static site and redeployed; a Pageview and a shot_landed from golfswingsimulator.com seen in PostHog's event list · check: no code change · decisions: none · next: build the funnel insight (visit, shot, game finished, name saved, return) in PostHog; turn on 'filter out internal and test users' once Sachal's own visits should be excluded
2026-11-17 — internal-device filter — done: ?internal=1 marks a browser (golf.internal in localStorage) and its events carry internal: true; PostHog project filter 'internal is not set' added and on by default for new insights; verified in the event list (5 events, 3 with the filter on) · check: green (396 client, 36 server, build) · next: Sachal opens the site once with ?internal=1 on each of his devices; build the funnel insight
2026-11-17 — beam target, banded air target — done: normal target is the circle at the foot of the beam, 3.6 yd radius at any distance (3x the old beam), outer circle gone; air sphere has slanted bands and spins · check: green (396 client, 36 server, build) · decisions: scoring radius follows what is drawn · next: watch whether 3 of 5 on a 3.6 yd circle and 4 of 5 on the small sphere are winnable
2026-11-17 — mode info, sign-up from leaderboard, bird's-eye timing — done: each mode button has an (i) that explains it on click (hover tooltip removed); a name can be saved from the leaderboard dialog at any time; the bird's-eye card shows the previous shot for 5 s after it lands, then returns to the current shot · check: green (400 client, 36 server, build) · next: Sachal to say what the 'second screenshot' summary stats request refers to
2026-11-17 — shot controls rework, bird's-eye fix — done: all seven value boxes together with the two club views stacked under them (views not built on phones); seven distinct dot colours (attack violet, loft pink, speed teal, matched in the views); word is a menu; (i) per control; all hover tooltips removed; keyboard starts on Aim and returns to it each shot; a bird's-eye view asked for during the 5 s now stays · check: green (405 client, 36 server, build) · decisions: App tests run at laptop width by default, phone where a test asks · open: Sachal's 'not working' report on the 5 s flip could not be reproduced (works on localhost and live); a first shot was sometimes not scored on localhost only, unexplained
2026-11-17 — shot clears with the bird's-eye card — done: when the card returns to Current shot (5 s after a shot stops) the scene's red shot line, landing marker and the bottom result bar are put away, and come back if Previous shot is chosen; long miss lines on the game card end in an ellipsis instead of a scrollbar · check: green (406 client, 36 server, build) · decisions: this was what Sachal's 'not working' report meant, the card itself was fine
2026-11-18 — panel header and club menu — done: swing speed bar removed; club menu sits beside the swing speed box; header reads 'Shot shape: {shape}' with Reset, set apart from the controls by a rule; bird's-eye buttons read Previous / Current on phones · check: green (406 client, 36 server, build) · decisions: swing speed is now set by typing, the word menu or the keyboard only
2026-11-21 — analytics plan — done: first PostHog look (8 anonymous visitors, 4 Sachal's own, 3 crawlers, nobody saved a name); wrote product-specs/analytics.md and eng-plans/analytics.md (events, properties, three dashboards, 4 phases); roadmap updated incl. 'optimize activation' as the follow-on · check: n/a (docs only) · decisions: north star = weekly players who finish a game; swing inputs once per shot; identify by player id only; bot filtering on · next: Sachal approves the phase plan, then phase 1 (payloads + game id); activation needs a definition and spec once the Gameplay dashboard has a baseline
2026-11-21 — analytics phases 1 and 2 — done: game_id on every game event; shot_landed carries carry/offline/apex/shape and the seven controls; identify by player id only; app_version, player_saved, viewport on every event; app_ready (load_ms, model) and app_error (webgl_unsupported, scene_failed, model_load_failed, api_unreachable, once per kind); exception capture on; payloads in src/analytics-events.js with tests (App test plays a whole game and checks the ids) · check: phase 1 green and committed (418 client, 36 server, build); phase 2 tests green (145 in the touched suites), full check running · decisions: shot controls sent as flat properties (aim, face, path, attack, loft_change, swing_speed, strike_inches) · next: phase 3 (setting_changed, game_abandoned, info_opened, save_name_shown/failed, leaderboard_filter_changed, player_recovered), then phase 4 in PostHog (needs the project key for a local verify run; REACT_APP_VERSION build change is Sachal's call)
2026-11-21 — analytics phase 3 — done: setting_changed (mode, club, bird's-eye view), game_abandoned (new game started or page closed mid-game, under its own game id), info_opened, save_name_shown / name_saved / name_save_failed with source, player_recovered, leaderboard_filter_changed; phases 1 and 2 pushed and deployed to Render earlier today (deploy dep-dc10480m7kps73dkkocg) · check: App and analytics suites green (139); full check running · decisions: a recovery code used is player_recovered, not name_saved; fail reasons also include wrong_code and rate_limited · next: phase 4 — verify events in PostHog with a local run using the project key, turn on bot filtering, build the three dashboards; REACT_APP_VERSION build change still Sachal's call
2026-11-21 — analytics phase 4 — done: events verified in PostHog from a local run and the live site (game ids match, abandoned game under its own id, model_load_failed then figure_fallback, one app_ready per production load); three dashboards built (Traffic 8 insights, Gameplay 10, Players and retention 6) in project 745617; phase 3 deployed (dep-dc10bdifngtc73e5polg, live) · check: green (436 client, 36 server, build) · decisions: bot rules not set (needs web_analytics:write and would not catch the data-centre Chrome visits); knowledge-base unchanged (nothing user-visible) · next: Sachal decides on the Render build command for app_version and on granting the PostHog bot-rule scope; then the activation spec, baseline from the Gameplay funnel
2026-11-21 — activation, first pass — done: spec (activated = attempted a target in a game in the first session) and eng plan; first-visit Hit prompt + pulse (src/first-visit.js); easy first target on the centre line where the stock straight shot stops (game.js easyTarget, proven against the scene's own physics for driver/7i/pw on all turfs); one-line miss coaching on the game card (simulate/coach.js) with coach_shown; card shows target number and what's needed on phones; mode bar is Practice | Game with Normal/Advanced on the card; normal shows face/path/speed only, hidden controls play at defaults; first_visit super property and replay only on a first tab session (PostHog project already has replay on); 15 s golfer-model timeout · check: green (461 client, 36 server, build); driven at phone and tablet width in the pane (easy target scored, tip shown after a miss) and by loop-evaluator headless at 375 and 1280 · review: loop-evaluator FAIL on coach_shown test and this entry, both fixed · load: app_ready last 30 days, mostly internal: phone glb p50 8.8 s (n=2), laptop glb 3.9 s (n=1), laptop figure_fallback ~40.5 s (n=2) · decisions: departs from the plan's "figure first if phone p75 > 4 s" — the built-in figure is slow to build and n=2 doesn't show the download is the cause; instead a 15 s timeout ends the 40 s stalls, and model compression is the real fix but is blocked: re-exporting tools/blender/golfer.blend gives a 4.8 MB GLB, not the shipped 3.3 MB, so the pipeline has drifted; npm gltf-transform was blocked by the permission classifier · next: deploy; shrink the model once the Blender export matches; hallway tests (5 people, half on phones); read the activation funnel once real visitors arrive
2026-11-21 — shot-control redesign — done: built the approved Claude Design boards into club-pads.jsx. Laptop: 2-column grid of boxes in a 360px panel (was 340), each with name + (i) + reset to neutral, ‹ number ›, a ruler (range input over a drawn scale), and the word menu; Club box beside speed; key bar with the selected box's step and words; a digit typed with no field open starts editing the selected box; a bare typed number keeps the side, +/− picks it (text input, was number). Phone: club chips row, a tab per control, big number + word + blurb, tall ruler, step/neutral/step buttons; Hit stays in the bottom bar · check: green · verified in the pane at 1440×900 (step, type, digit-to-type, ruler drag) and phone layout via headless Chrome at 520 px (pane was hidden) · decisions: kept the left panel instead of a literal bottom strip (7 controls in Practice/Advanced and the 3D views don't fit a strip, and it would collide with the result bar and Hit); kept the word as a menu · next: Practice/Advanced panel now scrolls to the 3D views on a 900 px screen — consider a compact box when 7 controls show
2026-11-21 — compact shot boxes — done: with all seven controls showing (Practice/Advanced) the laptop boxes are compact (72 px: name row + ‹ number word ›, no ruler; club box shows stock speed in its header), 3D views 20/12 dvh in that mode; speed's 'mph' is screen-reader only there so 'faster' fits · check: green (468 client, server, build) · verified in the pane at 1440×900: panel 807/807 px, no scroll, no truncation at 130 mph / 0.75 in · decisions: normal game keeps the full boxes with rulers · next: phone layout still only checked headless at 520 px
2026-11-21 — Desktop B as designed — done: Sachal pointed out he asked for Desktop B (a strip with Hit on the right), not boxes in the left panel. Laptop controls are now a strip in a band along the bottom (App.js `strip`, ClubPads draws into it by portal): one row of boxes, Club, Hit with a Space keycap, key bar under; the picture ends above the band so nothing covers the golfer or ball; the left panel (back to 340px) keeps shot shape, Reset, 3D views and mode; ← → move along the strip (GRID is one row). With all seven controls the boxes drop the ruler and use short names, so the strip stays one row down to 1280 px · check: green (468 client, server, build) · verified with headless Chrome at 1440×900 (normal and practice) and 1280×800 (practice); the pane was hidden · decisions: the strip gets its own band instead of floating over the scene, because the camera only shifts sideways and a floating strip would cover the ball · next: below ~1150 px wide the seven boxes wrap to two rows; the phone layout still only checked headless
2026-11-21 — first-shot prompt removed — done: dropped the 'Press Hit or Space…' (laptop) and 'Tap Hit…' (phone) pop-ups at Sachal's request ('too spammy'); Hit still pulses on a first visit until the first shot · check: green (468 client, server, build) · decisions: kept the pulse (only the pop-up was named); activation spec item 1 now ships without its prompt line · next: watch whether time-to-first-shot moves on the Gameplay dashboard
2026-11-22 — strip fixes from Sachal's review — done: club menu opens upward; Space hits from any focus (buttons, mode switch, word menu, club button, sliders, body), not while typing; app key listener in capture phase, stops propagation and blurs on Hit so the focused control does not also act; typed values keep two decimals (exact()), steps go a whole step from there (nudge()), face/path/aim/loft read from the URL as decimals; lime outline on the selected box removed (lighter background only); Practice/Game is a clean segmented switch with one (i) for both, in the panel's top row beside the shot shape; Reset moved to the top-right corner of the club view from above · check: green (470 client, server, build) · verified in the pane at 1440×900: menu opens up, Space after clicking Practice / a step arrow / with the word menu focused all hit, face=2.25 typed and saved · decisions: read 'two significant figures' as two decimal places (95.25 mph, 2.25°); info_opened topic for the modes is now 'modes' · next: Sachal's feature list came through empty
2026-11-22 — phone game overlay, option A — done: Sachal picked A from three canvas options (status row / top pill + mini-map / in the drawer). On phones a game in progress is one row along the foot of the picture (GameRow: target n/5, distance, side, altitude in advanced, pips, Restart, the last tip); the full card shows only when the game ends; the bar's switch is Practice | Normal | Advanced; the bird's-eye card is hidden until a map button (top left with Settings and the leaderboard, which moved up from the bottom corners) is pressed; Reset view moved to top right · check: green (473 client, server, build) · verified headless at 520 px (Chrome won't go narrower or load the app in a frame); at 375 px the row has 327 px for ~280 px of content by measurement · next: bird's-eye as a camera toggle (Sachal's idea) — design first
2026-11-22 — bird's-eye as a camera mode (option 1) — done: Sachal picked 'tags in the scene' from three canvas options. The map button (laptop and phone) eases the 3D camera straight down (main.js setOverhead(on, insets), 0.7 s, framed on tee + last shot + target within the HUD-clear band) and reports screen points once settled (onOverhead); OverheadTags pins carry·line, run→total, apex and the target; Hit flies back; orbit drag off while overhead; flight-map.jsx and its tests removed; setting_changed birds_eye on/off · check: green (467 client, server, build) · verified by driving headless Chrome over CDP (scratchpad cdp/shoot.js): hit, step, toggle, screenshot at 1440×900 and 390×844 · decisions: removed the old card entirely (Sachal: 'we have to remove' it); analysis.track / shot-track.js now unused by the UI but left in place · next: Sachal to try it; tags can overlap on a very short or offline shot
2026-11-22 — club change keeps the target; phone camera lift — done: changing club no longer restarts the game or replaces the target (game restarts only on a mode change; each new target is one the club in hand can reach; a ball in the air at a club change still counts). Phones lift the picture by a lens shift (55% of the covered bottom, capped at 20% of the height) so golfer and ball sit above the result card and game row; overhead framing accounts for the lift · check: green · next: Star Wars Mode setting replacing ?empire=1
2026-11-22 — Star Wars Mode — done: a switch in Settings (role=switch, remembered in localStorage as golf.starWars, tracked as setting_changed star_wars) shows the fleet live: range.userData.setFleet builds it on first use then shows/hides it, simulator.setFleet also moves the camera's far plane. ?empire=1 retired (no longer read). Verified in headless Chrome: toggled on with no reload, fleet drawn · check: green · next: —
2026-11-22 — phone mode layout — done: phones show the Practice / Game switch in the shot panel's top row beside the shot shape (as on laptops), Reset after it; the bottom bar (PhoneBar) is Hit plus Normal / Advanced during a game, Hit alone in practice · check: green · next: —
2026-11-22 — shot shape one line — done: label and shape name are FitLine (never wrap; shrink a pixel at a time to fit, 8px floor); label tracking tightened and the phone mode switch padding cut so they fit at full size from ~390px · check: green · next: bottom-bar design options for difficulty
2026-11-22 — phone difficulty menu (design A) — done: Normal/Advanced is a Listbox chip in GameRow opening upward (sub text: Target on the ground / Target in the air); PhoneBar is a full-width Hit in every mode · check: green · next: —
