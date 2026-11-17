# Phase: Sharper golfer, designed from a reference video

Status: proposed 2026-11-16
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

## Acceptance criteria

- [ ] AC1 — Budget held: `golfer.glb` under 8 MB and under 60k triangles (build
      prints both); frame rate during a swing on this machine not below 55 fps.
- [ ] AC2 — Eyes: iris and pupil read as dark brown with a white sclera in the
      face still; no red cast.
- [ ] AC3 — Skin and hair: skin has visible roughness variation (not uniformly
      glossy) and the hairline has no hard edge or loose strands in the face and
      face-side stills.
- [ ] AC4 — Scene lighting: the golfer is lit by an environment map taken from
      the sky, and his shadow on the mat has a clean edge at the address camera.
- [ ] AC5 — Polo: a folded collar and a buttoned placket exist as geometry, and
      no texture edge on the shirt is stair-stepped in the face still.
- [ ] AC6 — Trousers and belt: no denim seams, rivets or jean pockets; a belt
      with a buckle at the waist.
- [ ] AC7 — Cap: fitted to the head with a curved peak; no hair or scalp pokes
      through at any keyed position P1 to P10.
- [ ] AC8 — Glove and shoes: a glove on the lead hand only (left for a
      right-hander, and it swaps for a left-hander); shoes read as golf shoes.
- [ ] AC9 — Nothing tears: address, top, impact and finish, face-on and
      down-the-line, driver and lob wedge, both hands, show no clothing poking
      through skin and no stretched collar, belt or cap.
- [ ] AC10 — Character sheet written into this plan from the video, with the
      stills kept outside git.
- [ ] AC11 — Design matches the sheet: garment colours within a small tolerance
      of the sheet's hex values, hair and cap as described, skin tone matched,
      height and limb ratios within 3% of the sheet.
- [ ] AC12 — Not fatter: a Jest test reads waist, chest and hip girth over height
      from the exported file and fails if any exceeds today's value by more
      than 2%.
- [ ] AC13 — Side by side sent to Sachal: before and after at the address camera
      and the 1.5 yard close-up, next to a still from the video.
- [ ] AC14 — README, `public/models/LICENSE.md`, `tools/blender/README.md` and
      the knowledge-base describe the golfer as shipped.

Order: AC12's baseline measurement first (it must be taken before anything
changes), then AC1 to AC9, then AC10 to AC14.

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
