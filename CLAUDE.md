Read [README.md](README.md) before making structural changes or adding modules —
it's the source of truth for project purpose, domain context, and architecture.

- `scripts/check.sh` must be green before any commit (tests + build).
- Three.js is a vendored global (`public/lib/three.js` → `window.THREE`), not an npm
  package — see README's Architecture section.
