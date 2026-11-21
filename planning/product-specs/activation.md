# Activation: getting a first-time visitor to play the game

Status: **first pass built** 2026-11-21. Decisions below; hallway tests still to run.

## Why

The analytics work (see [analytics.md](analytics.md)) set the north star as
**weekly players who finish at least one game**. Every one of those players first
has to get from landing on the page to actually playing: taking a shot at a target.
Today few do, and nobody has finished a game.

### Where we are (PostHog, last 30 days, internal devices excluded)

| Step | People |
|---|---|
| Visited | 8 (some are data-centre crawlers) |
| Took a shot | 3 |
| Started a game | 2 |
| Finished a game | 0 |
| Saved a name | 1 |

Two caveats:

- **This is not a baseline.** `app_ready`, `game_abandoned` and the richer game
  events only went live today, and eight visitors can't tell a 20% step from a 60%
  one. We can't A/B test anything at this traffic level.
- So the spec makes design calls from first principles and hallway tests, and uses
  the funnel to check direction, not to prove significance. Getting more visitors
  is a separate problem (see Out of scope), but without it we won't be able to
  measure activation well.

## Definition

| Moment | Event | Proposed definition |
|---|---|---|
| **Setup** | first `shot_landed` | Hit the ball once |
| **Activated** *(decided)* | first `target_attempted` | **Took a shot at a target in a game**, hit or miss |
| **Aha** | first `target_attempted` with `hit: true` | Shaped a shot onto a target: the moment face and path click |
| **Engaged** | first `game_finished` | Finished a game (the north-star action) |
| **Habit** | `game_finished` in a later session | Came back within 7 days and finished another game |

**Activation rate** = share of new, non-bot visitors whose scene loaded
(`app_ready`) and who attempt a target in a game in that first session.

Why (Sachal, 2026-11-21): attempting a target means someone chose to play the game
and went to the trouble of aiming at something, not just pressing Hit to see what
happens. A practice shot doesn't count. Finishing a game stays the north star and
is tracked as the next step. Measured against the scene loading, not the page view,
so bots and WebGL failures don't dilute it; load failures are tracked on their own.

Note: `game_started` fires on the first scored shot, so today it equals the first
`target_attempted`; either event works for the funnel.

## Where people probably drop, and why

Hypotheses from walking the first-run flow. The funnel will confirm or kill them as
traffic comes in.

1. **Loading.** The modelled golfer is a GLB download behind a loading screen. On a
   slow phone this may be the biggest leak, and nothing can be done in the
   meantime.
2. **Nothing says "press Hit".** A new visitor lands on a 3D range with seven value
   boxes, two club views, a game card, a bird's-eye card and a mode picker. The one
   action that matters isn't called out.
3. **Too much to understand before the first shot.** Face, path, attack, loft,
   swing speed, strike and aim are all on screen at once. Most visitors know none
   of these terms.
4. **The first target is hard.** A 3.6 yd circle somewhere 140–330 yd out and up
   to 40 yd offline. With default controls the first shot most likely misses, so
   the aha never comes.
5. **A miss doesn't say how to fix it.** The game card says where the ball missed
   ("12 yd right") but not what to change.
6. **Five targets is a commitment when you don't yet care.** Two of the people
   above started a game and neither finished.
7. **Phones.** The game and result cards cover much of the scene.

## Proposed changes, in priority order

Each is small and independently shippable.

| # | Change | Targets | Size |
|---|---|---|---|
| 1 | **Point at Hit.** First visit only: a pulsing Hit button and a one-line prompt ("Press Hit or Space to take your first shot") that goes away after the first shot. | 2 | S |
| 2 | **Easy first target.** The first target of a visitor's first game is close and nearly straight, so the default swing has a real chance of scoring. Later targets are unchanged. | 4 | S |
| 3 | **Coach on a miss.** After a miss, one line saying what to change: "Ball finished right: close the face a little or swing more from the inside." Uses the face/path relationship the app already models. | 5 | M |
| 4 | **Controls follow the mode.** Normal game shows face, path and swing speed only. Advanced shows all seven. Practice shows all seven (it's the sandbox). Hidden controls stay at their defaults. | 3 | M |
| 4b | **Practice / Game toggle.** Two top-level choices, Practice and Game; within Game, a Normal / Advanced switch (placement still open, could move out of the shot panel). Replaces today's three-way mode picker. | 2, 3 | M |
| 5 | **Visible progress.** The game card makes "target 2 of 5, 1 hit, need 3" obvious, so a game reads as short. | 6 | S |
| 6 | **Faster first frame.** Measure `app_ready` p75; if it's over ~4 s on phones, show the built-in figure first and swap in the model when it arrives. | 1 | M |

Not proposed: a multi-step tutorial or a forced walkthrough. They tend to get
skipped, and the game itself can teach better if the first target is winnable and
misses come with a hint.

## How we'll know

- **Primary:** activation rate (above), compared by `app_version` before and after
  each change.
- **Leading:** time from `app_ready` to first shot (median), share switching to
  Practice before attempting a target.
- **Downstream:** share of activated visitors who hit a target (aha) and who
  finish the game (engaged).
- **Guardrails:** win rate for players' *second and later* games doesn't jump
  (the easy first target mustn't make the game trivial); day-7 return doesn't drop.
- **At low traffic:** five hallway tests on people who've never seen the app (half
  on phones), watching for where they stall, plus PostHog session replay for first
  sessions only.

New events this needs: `first_visit: true` as a super property for a browser's first
session, and `coach_shown` (with the hint shown) for change 3.

## Out of scope

- Getting traffic (sharing, SEO, moving golfswingsimulator.com fully to Render).
  It's the real constraint on measuring this, but a separate spec.
- Retention beyond the first return; badges, streaks, accounts.
- Changes to the physics or the target rules for regular games.

## Decisions (Sachal, 2026-11-21)

- Activated = attempted a target in a game in the first session.
- The easy first target counts on the leaderboard as normal.
- Normal shows face, path and swing speed; advanced shows all seven.
- Mode becomes Practice / Game, with Normal / Advanced inside Game.
- Turn on PostHog session replay for first sessions only (inputs masked).

- Keep the name Normal.
- Practice shows all seven controls.
- The Normal / Advanced switch lives in the game card header (Claude's call).
- A first visit opens in Game (Normal).
- Build all six changes ("do all these").

## Open questions

1. Who runs the hallway tests, and roughly when?
