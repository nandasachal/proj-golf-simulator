# Phase: Sharper golfer, designed from a reference video

Status: built 2026-11-16 (Sachal supplied the video and said to go; open items listed under "As built")
Tier: 1
Spec: none (continues [modelled-golfer.md](modelled-golfer.md); roadmap "Visual fidelity pass, remainder")

## Goal

The golfer reads as a well-made golf character up close and at the address
camera: a real polo, trousers, cap, glove and golf shoes, believable skin, eyes
and hair. His design (outfit, colours, hair, skin tone, broad face shape, height
and limb proportions) follows Sachal's reference video. His build does not: he
stays as lean as today's golfer.

## Where it stands (stills rendered 2026-11-16 from `golfer.blend`)

- Shirt is a T-shirt with a ring painted round the neck: no collar, no placket,
  and the navy trim has stair-stepped edges from the 1024 px texture.
- Trousers are recoloured jeans (denim seams and pockets still show). Shoes are
  trainers. No cap, glove or belt.
- Irises render red-brown, skin is evenly shiny, the hairline is a hard edge with
  stray strands, and the face is MakeHuman's generic young man.
- The MakeHuman pack on this machine has no polo, golf shoe or cap (the only hat
  is a fedora), so the golf-specific pieces have to be made, not picked.

## Decisions for Sachal

1. **The video could not be read.** macOS blocks the Apple Notes folder for this
   app. Put a copy in `tools/blender/reference/` (now git-ignored, so it cannot
   reach the public repo). Everything in Part A below can start without it.
2. **How close a likeness.** Recommended: a resemblance (outfit, colouring, hair,
   broad face shape), not a recognisable face, because the repo and site are
   public. Say so if you want it closer.
3. **Who is in the video.** If it is you or a friend, fine. If it is a character
   from a game or a broadcast, I take the general look, not a copy of that design.
4. **"Not fatter" means no heavier than today's golfer.** Waist, chest and hip
   girth relative to height are measured on today's model and become the cap. If
   you want him leaner than today, say by how much.

## Scope

- In: `tools/blender/` build scripts and spec, `public/models/golfer.glb` and its
  licence file, how the model is lit and shaded in the scene (`golfer-model.js`,
  the golfer's share of `scenery/sky.js` lighting), `golfer-retarget.js` only
  where new proportions or the glove require it, README and knowledge-base.
- Out: the swing itself (keys, rig, timing), your own swing from video, cloth
  simulation, facial animation, a scanned likeness, the code-built stand-in
  figure, anything outside the golfer.

## Approach

**Part A, no video needed: fix what is plainly wrong.**
Eyes, skin, hair edge and texture sharpness in the build; an environment map and
a tighter shadow on the golfer in the scene so the materials read as cloth, skin
and leather instead of flat colour.

**Part B, no video needed: real golf clothes, made by script.**
Collar and placket grown from the shirt's neck edge; trousers with the denim
detail removed and a belt at the waist; a cap fitted to the head; a lead-hand
glove as a thin shell over the hand; shoes reshaped and retextured as golf shoes.
Each gets a normal map for weave or stitching. If a piece still looks wrong after
three attempts, the fallback is a CC0 community MakeHuman asset, which needs a
download and so comes back to you first.

**Part C, needs the video: match the design.**
Stills pulled from the video become a character sheet (garments, colours as hex,
cap, hair, skin tone, face notes, height and limb ratios). The spec is set from
it. Body proportions that follow the video are length-only (height, leg, arm,
shoulder width); girth stays under the cap in decision 4.

**Part D: ship.** Independent review, browser check, docs, deploy.

## Character sheet (from the video, 2026-11-16)

Down-the-line phone video at a floodlit range at dusk; the stills stay in
`tools/blender/reference/` (git-ignored). Colours are sampled from frames the
phone had brightened, then darkened by eye, so they are estimates.

| Part | In the video | As built (`golfer_spec.py`) |
|---|---|---|
| Hat | Slate-blue knitted beanie | **Golf cap instead** (Sachal, 2026-11-16): navy six-panel cap with a curved peak, `CAP`, built by script |
| Top | Dark navy quarter-zip pullover, stand collar with a lighter lining, lighter panel over the shoulders | `TOP`, `TOP_YOKE`, `TOP_LINING`; MakeHuman sweater repainted, collar and zip built by script |
| Trousers | Warm grey, tapered, plain | `TROUSERS`; MakeHuman jeans with the denim removed |
| Shoes | Dark knit trainers, white sole | `SHOE`; MakeHuman trainers recoloured, maker's mark painted out |
| Glove | White, lead (left) hand | `GLOVE`; the hand itself, re-skinned |
| Face | Medium-brown skin, short dark beard | existing skin tone; short beard and cropped hair painted as strokes (`BEARD`, `HAIR`); dark brown, glossy eyes; head mesh subdivided; skin at 4096 px with pores |
| Build | Heavier round the middle | **not followed**: girth unchanged from the golfer before this work |

Not taken from the video: height and limb lengths (a phone video is too
distorted to measure from, and changing them moves the grip for little gain),
the watch, the shirt tail under the pullover, the shoe's three stripes.

## Acceptance criteria (revised once the video was readable)

The plan as proposed assumed a polo, cap and belt. The video shows a pullover
and beanie, so AC5 to AC8 were rewritten to match it.

- [x] AC1 — Budget held, with less room: `golfer.glb` is 5.03 MB (limit 8) and
      58,700 triangles (limit 60k) after the face rework. Frame rate was **not**
      measured reliably (see As built).
- [x] AC2 — Eyes: dark brown iris, white sclera, no red cast (face still).
- [x] AC3 — Face rework: the head is split off the body and subdivided once;
      the skin texture is worked at 4096 px (sharpened, pores added, a normal
      map from the same detail); beard and cropped hair are painted as strokes
      with a hairline; lips are less pink; eyes are glossy.
- [ ] AC4 — Dropped: an environment map would relight the whole scene for a
      small gain on rough cloth and skin. The existing shadow was left as is.
- [x] AC5 — Pullover: stand collar and zip exist as geometry; the sweater's
      logo and piping are gone.
- [x] AC6 — Trousers: denim fade, colour and twill removed. Seams and pockets
      remain (the video's trousers have pockets). No belt: the pullover covers it.
- [x] AC7 — Cap fitted to the skull by ray casting, with a peak, panel seams
      and a button; it stays on the head at address, top and finish.
- [x] AC8 — Glove on the lead hand; it swaps for a left-hander because the
      whole figure is mirrored. Shoes are dark trainers, as in the video.
- [x] AC9 — Checked in the app: driver right-handed (address, top, impact
      down-the-line; top and finish face-on) and lob wedge left-handed
      (address, top, finish). The glove swaps hands. One flaw: at the finish
      the pullover bunches into dark wedges under the lead arm.
- [x] AC10 — Character sheet above.
- [x] AC11 — Garments, hat, skin and stubble follow the sheet. Proportions
      deliberately unchanged.
- [x] AC12 — Not fatter: `src/simulate/golfer-build.test.js` reads
      `tools/blender/golfer_measure.json` (chest 0.5207, waist 0.4384, hips
      0.5274 of height, measured on the bare body) and fails above 2% over.
- [x] AC13 — Before and after sent to Sachal with the summary.
- [x] AC14 — README, licence file, Blender README and roadmap updated. The
      knowledge-base does not describe the golfer's appearance.

## As built: open items

- Frame rate and load time were not measured reliably: the preview pane was
  hidden, which throttles the page. One reading with the pane showing gave
  60 fps idle and 56 fps in a swing, but the stand-in figure was on screen.
- The file went from 1.8 MB to 5.0 MB (the 4096 px skin), so the stand-in
  figure shows for longer on a slow connection.
- The independent `loop-evaluator` review was not run.
- At the finish the pullover bunches into dark wedges under the lead arm.
- The face is still MakeHuman's generic head. A likeness needs a clear front
  and side photo of the face; the swing video is too small to take one from.
- The trainers still carry MakeHuman's own white side stripes.

## Verify

- `scripts/check.sh` green.
- `blender -b -P tools/blender/build_golfer.py`, then
  `blender -b tools/blender/golfer.blend -P tools/blender/preview.py -- <dir>`
  for the six stills.
- Dev server: a real Hit, step to each position, screenshots at the address
  camera, face-on, down-the-line and the close-up; console clean.

## Evidence required before "done"

- AC1: build output (size, triangles) and the measured frame rate with how it was
  taken.
- AC2, AC3, AC5 to AC8: the named Blender stills.
- AC4, AC9, AC13: screenshots of the running app.
- AC11, AC12: test names and passing output; the baseline girth numbers recorded
  in `planning/progress.md`.
- AC10, AC14: the files.

## Risks

- **Scripted clothes can look home-made.** A collar and cap built from edge loops
  are achievable; a convincing shoe is the hardest piece and the likeliest to
  need the CC0 fallback.
- **Cap and collar at the top of the backswing and the finish.** The neck and
  shoulders move most there; weights for new pieces are copied from the body and
  may need correcting.
- **Changing limb lengths moves the grip.** The retarget re-solves arms and legs
  from the model's own measurements and its tests read the exported skeleton, so
  a break shows up in `scripts/check.sh`, not on the range.
- **A phone video gives colours and ratios, not measurements.** Lighting shifts
  colour and the lens distorts length; the sheet's values are estimates and
  AC13 is the real check.
- **File size.** Normal maps for five garments add up; textures drop to 1024 px
  anywhere the close-up camera does not reach.

## Stop condition

Stop and hand back to Sachal when: all criteria pass, OR 3 failed attempts at the
same criterion, OR the next step needs a download, an account or a photo or video
upload to a third party, OR Part C is reached and the video is still unreadable.
