# Phase: Modelled golfer on the swing rig

Status: in progress — built and shipped 2026-11-16, AC7 and AC8 open; approved 2026-11-16 (source A, MPFB download approved; Blender work files kept in the repo)
Tier: 1
Spec: none (follows the "Detailed golfer" roadmap item)

## Goal

The golfer on the range is a professionally topologised human (real face, fingered
hands, modelled golf clothes) instead of tubes generated in code, making the same
keyed swing it makes today. Close up it should hold up the way a mid-budget sports
game character does.

## Why this, and what it costs

Two rounds of work on the code-built body moved the motion a lot and the close-up
look only a little. The look is limited by the approach (tube rings, painted folds,
rigid fingers), not by effort. The swing (`swing-keys.js`, `swing-rig.js`) is the
part worth keeping and is independent of what mesh hangs on it.

This breaks the project's "everything is generated in code, no imported assets"
property for the golfer only. Clubs, range and scenery stay procedural.

## Decisions for Sachal (before any build)

1. **Where the character comes from.** Recommended: **A**.
   - **A. MakeHuman via the MPFB Blender add-on, scripted.** Blender 4.x is already
     on this machine. A script in `tools/` builds the character headless (body
     sliders, polo, trousers, shoes, cap, hair) and exports a GLB, so the asset is
     reproducible from the repo. MakeHuman states its exported characters are CC0,
     which matters because this repo is **public**. No account, no photo upload.
     Likeness is by hand-set sliders: "a man who resembles you", not a scan.
   - **B. Photo-to-avatar service (Meshy, Avatar SDK MetaPerson).** Better likeness
     from the headshot. Needs your account, means uploading your photo to a third
     party (your action, not mine), and the licence for committing the output to a
     public repo is unconfirmed for both. Bodies from these tools are often one
     fused mesh with weak joints for a golf swing.
   - **Ruled out:** Mixamo characters (raw files may not be redistributed, and a
     public repo is redistribution), Ready Player Me (shut down 2026-01-31),
     MetaHuman (licence ties it to Unreal).
2. **Your likeness on a public site and in a public repo.** A is a resemblance by
   proportions and colouring only. If you want a true likeness (B, or B's head on
   A's body), that puts a recognisable model of you in a public repo. Your call.
3. **Installing MPFB** means downloading the add-on from extensions.blender.org and
   its asset packs from the MakeHuman community site. I need your OK to download.

## Scope

- In: a rigged GLB character under `public/models/`; the Blender build script; a
  retarget layer that drives the GLB's skeleton from `solveRig` output; a posed
  grip (fingers closed round the club, lead glove); loading with the current
  procedural golfer shown until the model is ready; left-handed mirror; club in
  hand unchanged (`golfer-club.js`).
- Out (explicitly not this phase): changing the swing keys; shorter wedge swing;
  waggle; cloth simulation; facial animation; a scanned likeness (decision 2);
  removing the procedural golfer files (kept as the loading stand-in and so the
  swing tests keep a figure to check; deletion is a later cleanup).

## How it fits

`solveRig` already returns a world position and orientation for 17 flat bones plus
hands, head and club. The GLB has a parented skeleton with its own rest axes and
its own limb lengths. Two pieces bridge them:

- **Proportions.** Limb lengths (`UPPER_ARM`, `FOREARM`, `THIGH`, `SHIN`, spine,
  shoulder and hip offsets) move out of `golfer-body-figure.js` into a proportions
  object the rig takes. The procedural figure passes today's numbers; the modelled
  figure passes lengths measured from the GLB's rest pose, scaled so standing
  height matches. The IK then closes exactly on the model's own wrists and ankles.
- **Retarget** (`golfer-retarget.js`, pure maths, no WebGL). Per mapped bone, a
  fixed offset between the rig's rest frame and the model's, found once from the
  rest pose; each frame, rig world orientation times offset, converted to the
  bone's local frame through its parent. Unmapped bones (fingers, neck twist) keep
  a fixed authored pose. Forearm twist is split between elbow and wrist so the
  sleeve and wrist don't candy-wrap.

No new npm dependency: `GLTFLoader` and the meshopt decoder ship with `three`.

## Acceptance criteria

- [x] AC1 — Source chosen and licence recorded: `public/models/LICENSE.md` names
      the source of every mesh and texture in the GLB and its licence, with links.
- [x] AC2 — `tools/build-golfer.py` run with Blender headless produces
      `public/models/golfer.glb` from nothing but the script and the installed
      add-on; the GLB is under 8 MB and under 60k triangles.
- [x] AC3 — Rig takes proportions: every existing swing test passes unchanged for
      the procedural figure, and new tests show that with a second, different set
      of limb lengths the clubhead still meets the ball at contact for all 22 clubs
      and both hands stay on the grip.
- [x] AC4 — Retarget is correct: Jest tests show that for every keyed position
      P1–P10 the retargeted model joints (shoulders, elbows, wrists, hips, knees,
      ankles, head) land within 0.5 cm of the rig's, and no bone flips between
      consecutive frames across the whole swing.
- [x] AC5 — In the browser the modelled golfer swings: address, top, impact and
      finish from down-the-line and face-on show hands closed on the grip, feet on
      the mat, no mesh tearing at shoulders, elbows, wrists, hips or knees, for
      driver, 7-iron and lob wedge, right- and left-handed.
- [x] AC6 — Loading: on a throttled connection the procedural golfer shows first
      and is swapped for the model without a blank frame; if the GLB fails to load
      the procedural golfer stays and the console has one warning, no error.
- [x] AC7 (60 fps steady with the model shown or hidden, dev build in the app browser pane; 43 fps averaged over the 3 s straight after page load and Hit; no before-number for the code-built figure was ever taken) — Frame rate measured on this machine during a swing, before and after,
      and recorded in `planning/progress.md`; after is not below 55 fps.
- [ ] AC8 (stills taken, side-by-side not yet shown) — Close-up check: face, hands on the grip and shoes at 1.5 yards, side
      by side with the current golfer, shown to Sachal.
- [x] AC9 — README architecture and `knowledge-base` (if the golfer is described
      there) updated; roadmap item marked `[done]`.

## Verify

- `scripts/check.sh` green.
- `blender -b -P tools/build-golfer.py` then `git status` shows the GLB unchanged
  (the build is reproducible).
- Dev server: a real Hit, then `__golfSim.advance()` to each position; screenshots
  from `__golfSim.view()` at the two standard cameras and the close-up camera.

## Evidence required before "done"

- AC1: the licence file and the pages it links to.
- AC2: command output with file size and triangle count.
- AC3, AC4: test names and passing output.
- AC5, AC6, AC8: screenshots of the running app; console log for AC6.
- AC7: the two measured numbers and how they were taken.

## Risks

- **Shoulders.** A full backswing and finish are the hardest poses for any
  character rig. MakeHuman's default weights may collapse at the trail shoulder;
  fix is corrective weight painting in the build script, which is fiddly.
- **Clothes from the MakeHuman library** are community assets with per-item
  licences (mostly CC0 or CC-BY). Only CC0 or CC-BY items are used, each recorded
  in AC1. A golf polo and golf shoes may not exist as such; nearest items get
  re-textured.
- **Hair** from that library is card-based and may look no better than today's.
  The cap hides most of it.
- **Likeness under A is limited.** If AC8 shows the face is the weak point, the
  follow-up is decision 2, not more slider work.

## Stop condition

Stop and hand back to Sachal when: all criteria pass, OR 3 failed attempts at the
same criterion, OR a licence turns out not to allow a public repo, OR the next
step needs a download, an account or a photo upload that hasn't been approved.
