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
