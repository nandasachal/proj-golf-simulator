# Ball physics review and ground model

2026-11-15. An independent review of the flight model, plus the design of bounce
and roll. This records what was found, what was changed, and what is still a guess.

## Flight model: findings, ranked by what a golfer sees

| # | Issue | Size | Status |
|---|---|---|---|
| 1 | No bounce or roll | 17 yd at tour speed, 26 yd at 95 mph, 37 yd at 80 mph | Fixed (`ground.js`) |
| 2 | Curve too small: 3° of axis tilt per degree of face-to-path, built with sin not a true tilt | ~35% under TrackMan's driver examples | Fixed: atan(tan(ftp)/tan(12.5°)), true tilt |
| 3 | Same 12° / 2700 rpm / 1.48 at every swing speed | Carry ±2 yd, but 140 mph ballooned (apex 59 yd, 48° descent) | Fixed: `driverLaunch` table |
| 4 | Driver carry short at high speed | −2.9% (8 yd) at PGA Tour numbers | Open: needs a Reynolds-number drag term |
| 5 | Irons and fairway woods land too shallow | Descent 6–11° shallow, apex 10–17% low | Open: invisible while driver-only |
| 6 | Numerics (Euler at 1 ms) | 0.09 yd vs RK4 on a 267 yd drive | Fine; landing now interpolated to y = 0 |

Checked and left alone: the Cd(S)/Cl(S) forms are the standard Smits & Smith forms;
the fitted constants beat Smits & Smith's own against modern launch-monitor data;
4%/s spin decay is right within uncertainty; the ball stays above the drag crisis
across the app's speed range. Across 22 tour rows (all clubs) the flight model's RMS
error is 2.2% on carry, 9.2% on apex, 7.2° on descent.

Curve after the fix, PGA Tour driver: 2° face-to-path 17.7 yd (TrackMan 19), 5°
39.3 yd (TrackMan 44). Caveat: if TrackMan's "curve" there is total offline with a
zero path, the old value was about right; the page is ambiguous.

## Ground model

Default turf: perennial ryegrass fairway, 0.6 in cut, normal moisture, medium
firmness, dry leaf, flat (about 4.2 ft on a Stimpmeter). Many real range landing
areas are mown longer and would play like Soft.

Bounce (each impact), from Penner (Can. J. Phys. 80, 2002), generalised to 3D:
pitch-mark tilt θc = T · 15.4° · (speed / 18.6) · √(θi / 44.4°); restitution
e = E · (0.510 − 0.0375·vn + 0.000903·vn²), 0.12 above 20 m/s; Coulomb friction
μ = 0.40 with a slide/grip switch (2/7 of slip removed when gripping). A hop under
1 m/s vertical starts the roll. Roll: deceleration = μ_roll · g with
μ_roll = 0.56 / stimp_ft.

| Preset | Cut | Firmness | Leaf | μ_roll | T | E | Tour-drive run |
|---|---|---|---|---|---|---|---|
| Soft | 0.75 in | 0.2 | wet | 0.237 | 1.265 | 0.55 | 7.5 yd |
| Normal | 0.60 in | 0.5 | dry | 0.133 | 1.100 | 0.70 | 17.5 yd |
| Firm | 0.45 in | 0.75 | dry | 0.105 | 0.958 | 0.825 | 31.7 yd |

Against published roll-out: PGA Tour 2023 carry 282 vs driving distance ~300
(model 17.5 yd on Normal); USGA 2007 fairway-only tour drives 30.1 ± 3.5 yd (model
31.7 on Firm); a TrackMan sample landing at 31° ran 28 yd (model 27.6). Those three
were tuned to. Not fitted, and within about 30%: the USGA/R&A irrigation, mowing
height and soft-bermuda effects.

## What is solid and what is a guess

- Solid: rigid-impact mechanics with the slide/grip switch; the Stimpmeter
  conversion; the direction of every turf effect, with moisture the largest.
- Borrowed and unverified: Penner's restitution polynomial and tilt calibration
  point were recalled, not read from the paper, and were fitted to irons onto
  greens.
- Tuned: the square-root angle dependence of the tilt (Penner's is linear), T and
  E per preset, μ = 0.40, the stimp-vs-cut line (one USGA anchor), the 1 m/s hop
  cut-off, and the split between bounce and roll distance (only the total is
  constrained by data).
- Weak spots: first-bounce heights look high (1.3–2.1 m) on shallow landings; run
  is very sensitive to T (1.1 → 1.2 cuts tour run from ~18 to ~13 yd); firm turf
  gives 8–14 small skips before rolling.
- Unresolved: the model's 6.7 s tour-drive hang time vs 6.1–6.3 s in
  ShotLink-based articles.

## Sources

USGA/R&A "Agronomic Impacts on Bounce and Roll Distance"; TrackMan blog (Face to
Path, Spin Axis, Shot Optimizer, tour averages); golf.com launch-window table;
Penner, Can. J. Phys. 80(8):931–940 (via arXiv 2208.11685's reference list).
