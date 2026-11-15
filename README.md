# Golf Swing Simulator

A browser-based 3D golf ball flight visualizer. You set club face angle, club path
angle, and swing speed; it simulates the resulting ball flight (draw/fade/hook/slice,
carry distance, apex) and renders the trajectory in 3D. Built to make the
face-angle/path-angle relationship that produces shot shape intuitive, rather than
abstract.

### Domain context

- **Club face angle** — direction the clubface points at impact relative to the
  target line. Sets the initial launch direction.
- **Club path angle** — direction the clubhead is moving at impact relative to the
  target line. Combined with face angle, the difference between the two determines
  curve: face-to-path produces draw/fade (hook/slice at the extremes).
- **Backspin** — modeled as a fixed initial rate; lift (Magnus force) from backspin is
  what keeps the ball in the air longer than pure projectile motion would.
- Units: internal physics runs in meters/seconds (`src/simulate/conversions-lib.js`
  converts to/from the MPH/yards/RPM shown in the UI).

### Architecture

- **UI** (`src/App.js`, `src/components/`) — React shell: parameter sliders
  (`components/simulator/`), navbar, and query-string state sync (`hooks/use-query.js`)
  so a shot setup is shareable via URL.
- **Physics** (`src/simulate/`) — pure, framework-agnostic ball-flight simulation.
  `shot.js` steps the trajectory via Euler integration (gravity + drag + Magnus lift);
  `conversions-lib.js` handles unit conversion; `draw-lib.js` and `main.js` wire the
  computed trajectory into a Three.js scene.
- **Three.js** is vendored as a global script (`public/lib/three.js`, old version) and
  attached to `window.THREE`, not an npm package — see `src/App.js`'s `window.THREE`
  check. This is why `src/simulate/shot.js` can't easily be unit-tested yet (no
  importable `THREE.Vector3` in a Jest/jsdom environment); see `planning/roadmap.md`.
- **Hosting** — static React app (Create React App), deployed to GitHub Pages from the
  `main` branch root (see `CNAME`, deploy steps below). `scripts/check.sh` is the local
  test+build gate.

### Deployment

After you have all the changes done and pushed to main branch, you can deploy the app to github pages by running the following commands:

```
  git checkout -b gh-pages
  git pull origin main
  yarn build
  cp -r build/* .

  git add .
  git commit -m "deploy"
  git push origin gh-pages
```

PS. The `cp -r build/* .` is extremely important for the changes to appear in the build, since the deployed github page considers the entire project to be the source directory.

### Notes:

#### 1. To chage the range values:

Check the file `src/utils/constant.js` file and edit the values from there for min, max, default and step for the slider

#### 2. To change the camera settings:

You will need to go the file `public/lib/OrbitControls.js` and edit the values `phiDelta`, `thetaDelta`, `scale` to change the orientation of the camera.
While following the build steps, this file will be copied/compiled for the final build to reflect the changes.
