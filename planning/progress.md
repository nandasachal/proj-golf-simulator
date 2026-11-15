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
