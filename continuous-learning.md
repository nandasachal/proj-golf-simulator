# Continuous Learning Log

Append-only. See `~/.claude/CLAUDE.md` for format and process.

2026-11-15 — note — Three.js here is a vendored global script
(`public/lib/three.js` → `window.THREE`), not an npm package. Any future test or
build tooling work on `src/simulate/` needs to account for that — it's why
`shot.js` isn't unit-tested yet (see `planning/roadmap.md`).
2026-11-15 — note — `build/` is git-tracked (not actually ignored despite being
listed in `.gitignore`) because GitHub Pages serves this site from the `main`
branch root. Running `npx react-scripts build` directly will dirty tracked files;
`scripts/check.sh` builds to a temp `BUILD_PATH` to avoid that.
2026-11-15 — note — Superseded: Three.js is now the npm `three` package (ES module
imports), not a vendored global. The 2026-11-15 note above describes the
pre-redesign setup.
2026-11-15 — mistake — The driving range spec asserted the existing physics was
"correct and reused as-is" without anyone running it. It was not: constant-magnitude
drag and a made-up lift constant gave a 95 mph swing 325 yd of carry and a 140 mph
swing 664 yd with a 15 s hang time, and the face/path mapping curved an open face
the wrong way. Before a spec declares existing behaviour correct, run it against a
known real-world number (here: TrackMan tour averages, now tests in `shot.test.js`).
2026-11-15 — note — Ball flight convention: scene/physics +z is downrange and -x is
the golfer's right. `Shot` launches toward -x for a positive horizontal angle and
curves toward +x for a positive spin angle, so `launch-conditions.js` negates the
spin angle. Getting either sign wrong silently mirrors every shot shape.
2026-11-15 — note — The Claude desktop browser pane throttles requestAnimationFrame
when hidden, so the scene looks frozen or stale in screenshots. Drive it with
`window.__golfSim.advance(seconds)` (dev only) and wait ~1 s before a screenshot.
2026-11-15 — note — `npm run build` under `CI=true` (what a hosted build uses) fails
on any ESLint warning. `scripts/check.sh` now builds with `CI=true` so that shows up
locally first.
2026-11-15 — preference — Sachal: press ahead and ship rather than stopping for
approvals on this project; hosting is Render (static site), deployed through the
Render MCP.
2026-11-15 — note — Roll-out depends strongly on descent angle, so launch angle and
spin feed total distance far more than they feed carry. Changing `driverLaunch` or
the aerodynamic constants moves run as well as carry; re-check the ground tests.
2026-11-15 — note — The ground model's bounce constants (Penner) were recalled by
the review, not read from the paper, and its turf scalings are tuned to three
published roll-out figures. Treat `ground.js` numbers as calibrated, not derived.
2026-11-15 — mistake — The ground flickered whenever the camera followed the ball.
Cause: the fairway, greens, marker lines and tee deck were planes stacked 0.01–0.03
yd above the rough, with a 0.1 near plane; past ~100 yd the depth buffer can't
separate them, so which plane won changed frame to frame (50–70% of ground pixels
flipping on bad frames). Anything flat on the ground must go through
`groundOverlay()` in `range.js` (draw order + polygon offset + no depth write), not
just a small y offset. Still screenshots hid this; it only shows in motion, so
measure frame-to-frame pixel change when touching the ground layers.
2026-11-15 — mistake — `Math.round` on a signed value rounds -2.25 to -2.2 but 2.25
to 2.3, so a left-hander's label read "2.2° left" where a right-hander's read
"2.3° right". Round the magnitude, then add the direction word.
2026-11-15 — note — The left column now holds seven sliders plus the 3D club view
and overflows windows under about 850 px tall. Anything else added there needs to
come with a plan for height (collapse, move to Settings, or shrink something).
2026-11-15 — note — A session can end mid-task and another can pick the work up: at
the start of a turn after an interruption, check `git status` and run the tests
before assuming what is or isn't done. Here the strike control had been finished,
and the Game-mode default changed, without this session doing either.
2026-11-15 — note — Two Claude sessions were editing this repo at once (one on the
3D club view, one on the laptop layout). Before committing, run `git status`: if
there are changes you did not make, copy only your files into a throwaway
`git worktree`, run `scripts/check.sh` there, and commit from it, so the other
session's half-finished work is neither committed nor blocked.
2026-11-16 — note — The browser tool's real mouse drag aborts when the page URL
changes mid-drag, and every control change updates the query string. To test a drag
in the pane, dispatch PointerEvents on the handle (pointerdown, several pointermove,
pointerup) from page JS instead.
2026-11-16 — preference — Sachal finds sliders clunky on a laptop: shot controls
should be direct manipulation on the club picture, with every number also typeable
and keyboard-adjustable. Don't add a new control as a plain slider.
2026-11-16 — mistake — First verification of the drag handles dispatched every
pointer event straight at the handle with a valid pointer id, which hid two real
bugs (overlapping grab areas, reliance on pointer capture). When simulating a drag,
send pointerdown to `document.elementFromPoint(x, y)` and the moves to `window`,
and try an unknown pointer id, so the test routes events the way a real pointer
does.
2026-11-16 — note — Never write to the URL on every step of a continuous control.
Safari throws a SecurityError after 100 `history.replaceState` calls in 30 seconds.
Shot values live in a draft in `App.js` and are written to the URL 250 ms after
they stop changing.
2026-11-16 — preference — Sachal wants the shot controls to look like the 3D
close-up (real modelled driver, turf, lit), not flat schematic diagrams. Any new
control surface should be built on the 3D club scene, with handles projected onto
it, and held to a high visual bar.
2026-11-16 — note — A hidden preview pane delays React passive effects, so a
correctly scored shot can look unscored during browser verification (the scene's
target was still null at hit time). Flush with a click or render (e.g. Restart)
before hitting, and don't chase it as an app bug.
