# The club view: one setting at a time, at true size

Status: **phase 1 in build** 2026-11-22 (the focused view for today's seven
controls). The variable inventory below is a starting list, not yet decided.

## Why

The shot panel on laptops shows the club at impact twice: from above ("Above
×5") and from the toe ("Toe ×4"). Both draw every guide line at once, and both
draw the angles several times bigger than they are, so the picture is not what
the club really does. "×5" also needs explaining (Sachal asked what it meant,
2026-11-22).

What we want instead (Sachal, 2026-11-22): the picture changes with the
setting being adjusted. You see the one most relevant view, close up, with
only that setting drawn and one control point to drag, at true size. The
separate Above and Toe views go away.

## What the player sees

One picture of the club at impact, in the shot panel. Which setting is
selected (the highlighted box in the strip, or the arrow keys) decides:

| Selected setting | View | What is drawn | Control point |
|---|---|---|---|
| Club face | From above, golfer's side at the bottom | The face's line and where it points, against the aim line | End of the face's pointing line |
| Club path | From above | The path the head travels, against the aim line | Tail of the path line, behind the ball |
| Aim | From above | The aim line, against the range's centre line | End of the aim line |
| Strike | From above, closer in | The face line and the ball's place on it | The head itself, slid heel to toe |
| Attack angle | From the toe | The arriving arrow, against level | Tail of the arriving arrow |
| Loft | From the toe, closer in | The line up the face | Top of the line up the face |
| Swing speed | From above | Everything, for reference | None (speed has no shape to draw) |

Rules:

- **True size.** Every angle and distance is drawn as it is. Nothing is
  multiplied, so the caption no longer carries a "×".
- **One thing.** Only the selected setting's guide and control point are
  drawn, plus the one line it is measured from.
- **Big enough to use.** Because the angles are real, a degree is small. The
  view is framed so the control point sits most of the picture away from the
  pivot: about 3 to 4 pixels a degree at the panel's size. The value snaps to
  the control's step, and the number, ruler and keys still set it exactly.
- **The club stays honest.** The head is posed with every setting at once
  (a closed face stays closed while you look at path); only the guides are
  filtered.
- The caption names the setting and the side it is seen from ("Club face ·
  from above"). The toe view keeps its launch and spin read-out.
- Phones keep today's layout (no club picture): the boxes are the controls
  there. Bringing the focused view to phones is a later phase.

## Out of scope for phase 1

- Animating the camera between views (it cuts).
- Any new setting. Phase 1 covers the seven that exist.
- Phones.

## Phases

1. **Focused view for the seven controls** (this build): one picture, per
   setting view and control point, true size, Above and Toe removed.
2. **New settings**, from the inventory below, a few at a time. Each needs its
   physics in `launch-conditions.js` (or `shot.js` / `ground.js`) before it
   gets a box and a view.
3. **Phones**: the focused view above the selected control.

## Inventory: what a golfer can adjust

A starting list to argue with. "Modelled" says whether the simulation already
has the physics. "View" is the picture that would show it best.

### In the simulator today

| Setting | What it changes | View |
|---|---|---|
| Club face | Where the ball starts | Above |
| Club path | Curve, with the face | Above |
| Strike (heel to toe) | Start line, gear-effect curve, ball speed | Above |
| Aim | Turns the whole shot | Above |
| Attack angle | Launch, spin, ball speed | Toe |
| Loft delivered | Launch, spin, ball speed | Toe |
| Swing speed | Distance, and how much a curve grows | None |
| Club | Loft, length, how it is delivered | (picker) |
| Handedness | Mirrors the shot | (setting) |
| Turf (cut, firmness, wetness, grass) | Bounce and roll | (setting) |

### Setup, before the swing

| Setting | What it changes | Modelled | View | Notes |
|---|---|---|---|---|
| Tee height | Where on the face the ball is met (high or low), so launch and spin; lets you hit up more | No | Toe | Driver first. Needs strike height (below) |
| Tee angle (tee tilted toward or away from the target) | Little by itself; some players tilt it forward to encourage hitting up | No | Toe | Probably cosmetic plus a small strike-height effect. Check the evidence before giving it physics |
| Ball position (forward or back in the stance) | Attack angle, loft delivered and path all move together: forward is more up, more loft, more out-to-in | Partly (as its three results) | Toe, with the stance | Could drive attack, loft and path from one setting, as a real golfer does |
| Stance (open or closed to the target line) | Path relative to the target | Partly (as path and aim) | Above, wider | Feet line against aim line |
| Distance from the ball, posture | Lie at impact, strike point | No | Face-on | Depends on dynamic lie (below) |
| Grip (strong, neutral, weak) | Face angle at impact, rate of closure | Partly (as face) | Face-on, hands | A friendlier way to set the face than a number |
| Shaft lean at address, hands forward | Loft delivered, attack angle | Partly (as loft) | Toe | Today's Loft control is this, without the hands shown |
| Club fitting: loft sleeve, lie, shaft length and flex, face-angle setting | Static loft, lie, speed, face | Loft and length per club only | Per club | A fitting screen rather than a per-shot control |

### Delivery, at impact

| Setting | What it changes | Modelled | View | Notes |
|---|---|---|---|---|
| Strike height (high or low on the face) | Vertical gear effect: high launches higher with less spin; thin and fat contact | No | Toe / face-on to the face | Pairs with tee height. Biggest gap in today's model |
| Dynamic lie (toe up or down) | Tilts the face's aim: toe up points a lofted face left | No | Face-on, behind the ball | Matters most with wedges |
| Low point (ahead of or behind the ball) | Fat and thin strikes; with irons, ball-first contact | No | Toe | Could replace attack angle for irons as the thing you move |
| Swing tempo, partial swing length | Speed, and how repeatable the rest is | Speed only | Golfer, not the club | Part swings exist as low swing speed since 2026-11-22 |
| Closure rate (how fast the face is turning) | How much a timing error costs | No | Above | Only matters if we add shot-to-shot scatter |

### The ball and the air

| Setting | What it changes | Modelled | View | Notes |
|---|---|---|---|---|
| Ball (compression, spin, dimple pattern) | Ball speed, spin, drag and lift | One ball | (picker) | |
| Wind (speed and direction) | Carry and curve | No | Range, from above | The most asked-for range condition |
| Temperature, altitude, humidity | Air density, so carry | Fixed (sea level, 68°F) | (setting) | |
| Slope of the lie (ball above or below feet, up or down hill) | Start line and curve; launch | No | Face-on | |
| Lie (tee, fairway, rough, sand) | Spin, ball speed, launch | Tee and turf only | Toe | Rough takes spin off (a "flyer") |

## Open questions

- Which new setting first? Proposed: strike height with tee height, since it
  is the largest thing the model leaves out and the driver needs it.
- Should one setting drive several results (ball position moving attack,
  loft and path together), or stay one number each as now?
- Do settings that are about the golfer (grip, stance, tempo) belong in the
  club picture at all, or on the golfer in the main scene?
- Tee angle: is there evidence it changes the shot, beyond strike height?
