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
