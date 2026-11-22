Read [README.md](README.md) before making structural changes or adding modules —
it's the source of truth for project purpose, domain context, and architecture.

- `scripts/check.sh` must be green before any commit (tests + strict build).
- `src/simulate/main.js` and `range.js` need WebGL, so Jest can't cover them: after
  changing the scene, drive it in the browser (README, "Verifying the scene").
  With the browser pane hidden the scene doesn't animate and a Hit never lands;
  check landing and scoring with the scene's own physics in Jest instead (see
  "easyTarget against the scene's own shot" in `src/simulate/game.test.js`).
