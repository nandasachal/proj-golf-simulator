# Golfer character (Blender)

The golfer on the range is a MakeHuman character, built by script so it can be
rebuilt and changed from this folder.

| File | What it is |
|---|---|
| `golfer_spec.py` | What the golfer is: body sliders, face targets, skin, clothes, colours. Edit this to change him. |
| `build_golfer.py` | Builds the character with MPFB, rigs it, and exports it. |
| `golfer_outfit.py` | What MakeHuman has no asset for: stand collar and zip, beanie, glove; also measures the bare body's girth. |
| `golfer_finish.py` | Texture work before export: pullover and trousers painted over the sweater and jeans, trainers, eyes, skin relief and stubble, texture sizes. |
| `golfer_paint.py` | Helpers the two above share: image access, painting a per-vertex value into a UV layout, materials. |
| `golfer_measure.json` | Written by the build: chest, waist and hip girth over height. `src/simulate/golfer-build.test.js` fails if he gets heavier. |
| `reference/` | Reference photos and video for the design. Git-ignored: the repo is public. |
| `preview.py` | Renders review stills of the built file. |
| `golfer.blend` | The built working file (textures packed). Open it in Blender to look or adjust by hand. |

Output: `public/models/golfer.glb`, which the simulator loads
(`src/simulate/golfer-model.js`) and drives from the swing rig
(`src/simulate/golfer-retarget.js`).

## One-time setup

1. Blender 4.2 or later (built with 5.2).
2. The MPFB extension:
   `blender --online-mode --command extension install -s -e mpfb`
3. The MakeHuman system asset pack (CC0, 280 MB), unzipped into MPFB's user
   data folder, e.g. on macOS
   `~/Library/Application Support/Blender/5.2/extensions/.user/blender_org/mpfb/data/`:
   <https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html>

## Build

```bash
blender -b -P tools/blender/build_golfer.py
```

```bash
blender -b tools/blender/golfer.blend -P tools/blender/preview.py -- /tmp/golfer-preview
```

After a rebuild run `scripts/check.sh`: the retarget tests read the skeleton
straight from the exported file.

## Things that bit

- The rig and clothes are fitted to the mesh as it stands, so targets are
  baked before either is added, and `detailed_helpers` must stay on: MPFB
  places joints from helper geometry and silently falls back to default
  positions without it.
- Colours in the spec are sRGB. Painted into a texture they are used as they
  are; given to a material they must be converted to linear first
  (`golfer_paint.material` does it), or they come out pale.
- MPFB removes the body under the clothes, but not the neck base and shoulder
  tops under a sweater's collar. Left in, that skin shows through the cloth
  when the shoulders turn, so `golfer_outfit._tuck` removes it.
- Asset textures can carry real brand marks (the trainers did). Look at a
  texture before shipping it.
- Hand-edits to `golfer.blend` are overwritten by the next build. Put lasting
  changes in the scripts.
