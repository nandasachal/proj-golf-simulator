# Analytics: tracking plan and dashboards

Status: agreed with Sachal 2026-11-21, not yet built

## Why

PostHog went live 2026-11-17 with six events and no dashboards. A first look
(2026-11-21) found eight anonymous visitors in four days: four were Sachal's own
devices, three were data-centre crawlers that only loaded the page, one was
unclear. Nobody had saved a name. The events cannot yet answer whether people
load the app, how a game goes, where they leave, or whether they come back.

## Questions and metrics

| # | Question | Metrics |
|---|---|---|
| 1 | Is anyone coming? | Visitors, sessions, new vs returning, referrer and UTM, country, device and viewport. Crawlers and internal devices excluded. |
| 2 | Does it load? | `app_ready` load time (p50, p75), share using the built-in figure fallback, WebGL and model failures, API failures. |
| 3 | Do they play? | Visitor to first shot to game started to game finished to won, as one funnel. |
| 4 | Is the game fair and fun? | Win rate and hit rate by mode, club and target distance; shots per player; games abandoned and at which target; practice vs game shots. |
| 5 | Do they join? | Sign-up prompt shown to name saved (by source), name save failures, leaderboard opens. |
| 6 | Do they come back? | Day-1 and day-7 retention, weekly active players, stickiness. |

**North star: weekly players who finish at least one game** (distinct people with a
`game_finished` event in the week).

## Events

Existing events are kept; "extend" adds properties. All property names are
snake_case. No personal data: a player is identified by player id only (the name
is no longer sent to PostHog; it is already public on the leaderboard and the
server holds it).

| Event | Status | Properties | Fires when |
|---|---|---|---|
| `$pageview`, `$pageleave`, `$web_vitals` | automatic | PostHog defaults | page load / leave |
| `app_ready` | new | `load_ms`, `model` (`glb` or `figure_fallback`), `viewport` (`phone` or `laptop`) | the scene calls `onReady` and the loading screen fades |
| `app_error` | new | `kind` (`webgl_unsupported`, `model_load_failed`, `api_unreachable`), `detail` (short, no personal data) | each failure, once per kind per page load |
| `$exception` | turn on | PostHog exception capture | unhandled errors |
| `shot_landed` | extend | existing `mode`, `club`, `total_yards`; add `game_id` (null in practice), `in_game`, `carry_yards`, `offline_yards`, `apex_yards`, `shape`, and the seven shot controls as set at impact (flat: `aim`, `face`, `path`, `attack`, `loft_change`, `swing_speed`, `strike_inches`) | every shot, practice included |
| `setting_changed` | new | `setting` (`mode`, `club`, `view`), `from`, `to` | the player changes one |
| `game_started` | extend | add `game_id` | first scored shot |
| `target_attempted` | extend | add `game_id`, `target_height_yards` (advanced), `miss` (short miss category, null on a hit) | each scored shot |
| `game_finished` | extend | add `game_id` | last target |
| `game_abandoned` | new | `game_id`, `mode`, `club`, `shots_taken` | a new game starts, or the tab closes, with a partial game |
| `info_opened` | new | `topic` (the control or mode) | an (i) button is opened |
| `save_name_shown` | new | `source` (`game_card` or `leaderboard`) | the sign-up step appears |
| `name_saved` | extend | add `source` | a new name saved (a recovery code used is `player_recovered`) |
| `name_save_failed` | new | `source`, `reason` (`taken`, `invalid`, `wrong_code`, `rate_limited`, `network`) | save fails |
| `leaderboard_opened` | existing | `mode` | dialog opens |
| `leaderboard_filter_changed` | new | `mode`, `period` | mode or period tab changes |
| `player_recovered` | new | none | recovery code used on a second device |

Every event also carries, as PostHog super properties: `app_version` (short build
sha, so before/after a release can be compared), `player_saved` (boolean), and
`viewport`. Events from a browser opened with `?internal=1` keep `internal: true`.

Out of scope: session replay, autocapture, per-drag slider events, heatmaps.

## Dashboards (PostHog project 745617)

Each insight excludes `internal: true` and known bots by default.

1. **Traffic**: visitors and sessions over time, new vs returning, referrers and
   UTMs, country, device and viewport, load time (p75), figure-fallback rate,
   error count by kind.
2. **Gameplay**: funnel (visit, first shot, game started, game finished, won),
   win rate by mode and club, hit rate by target distance, shots per player,
   abandoned games by target number, practice vs game shots, most-opened (i) topics.
3. **Players and retention**: weekly players (north star), sign-up funnel by
   source, name-save failures, leaderboard opens, day-1 and day-7 retention,
   stickiness.

## Decisions (Sachal, 2026-11-21)

- North star is weekly players who finish a game.
- Swing inputs recorded once per shot at impact, never per drag.
- Identify by player id only; the name is not sent to PostHog.
- Turn on PostHog bot filtering.
