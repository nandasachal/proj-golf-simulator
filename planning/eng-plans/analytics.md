# Phase plan: Analytics instrumentation and dashboards

Status: proposed 2026-11-21
Tier: 1
Spec: [../product-specs/analytics.md](../product-specs/analytics.md)

## Goal

Every action in the spec's event table is tracked with the agreed properties,
and PostHog has three dashboards (Traffic, Gameplay, Players and retention) that
answer the six questions in the spec, with internal devices and crawlers
excluded.

## Scope

- In: `src/analytics.js` and its call sites (`src/App.js`,
  `leaderboard-modal.jsx`, `save-name.jsx`, the scene's `onReady` and error
  paths); a pure payload module with tests; PostHog bot filtering and exception
  capture; the three dashboards through the PostHog connector; README Analytics
  section and the knowledge-base doc.
- Out: session replay, autocapture, per-drag events, funnels beyond the six
  questions, any server (FastAPI) change.

## Phases

Built one at a time, each ending with `scripts/check.sh` green and a commit.

1. **Payloads and game id.** A pure module builds each event's properties
   (`src/analytics-events.js`); `game_id` threaded through the game events;
   `shot_landed` gains the carry, offline, apex, shape and seven controls;
   super properties (`app_version`, `player_saved`, `viewport`); `identify` sends
   player id only.
2. **Load and health.** `app_ready` with `load_ms` and `model`; `app_error` for
   WebGL, model and API failures; `$exception` capture on.
3. **Engagement.** `setting_changed`, `game_abandoned`, `info_opened`,
   `save_name_shown`, `name_save_failed`, `leaderboard_filter_changed`,
   `player_recovered`.
4. **PostHog.** Verify each event arrives with its properties, switch on bot
   filtering, build the three dashboards, record their links in the README.

## Acceptance criteria

- [ ] AC1 — `src/analytics-events.js` builds every property set in the spec's
  event table, with Jest tests per event (fixed input, fixed output, no network).
- [ ] AC2 — `game_started`, `target_attempted`, `game_finished` and
  `game_abandoned` of one game share one `game_id`; a test plays a game through
  the App and asserts the ids match.
- [ ] AC3 — `shot_landed` carries the new fields; practice shots have
  `game_id: null` and `in_game: false`.
- [ ] AC4 — `identify` payload contains the player id and no name (test).
- [ ] AC5 — `app_ready` fires once per load with `load_ms` and `model`;
  forcing the model download to fail yields `figure_fallback` and an `app_error`
  of kind `model_load_failed` (driven in the browser).
- [ ] AC6 — a game left half-played, then a new game started, sends one
  `game_abandoned` with the right `shots_taken`.
- [ ] AC7 — with `?internal=1` and a local build pointed at the project, every
  event in the spec appears in PostHog's event list with its properties, and
  `app_version` matches the build.
- [ ] AC8 — bot filtering is on in the project settings.
- [ ] AC9 — three dashboards exist with every tile listed in the spec; each tile
  returns data or is explained as waiting for traffic; each filters out
  `internal: true`.
- [ ] AC10 — README Analytics section and `knowledge-base` doc describe the
  events as shipped, dated.

## Verify

- `scripts/check.sh` green.
- Run the app with `REACT_APP_POSTHOG_KEY` set and `?internal=1`; play a
  practice shot, a full game, an abandoned game, open each (i), the leaderboard
  and save-name; read the events back through the PostHog connector.

## Evidence required before "done"

Per criterion: the test names and their output (AC1 to AC4), the PostHog event
rows with properties (AC5 to AC7), the setting screenshot or connector read (AC8),
dashboard links and tile screenshots (AC9), the changed README lines (AC10).

## Open details settled during the build

- `app_version`: the Render build command gains `REACT_APP_VERSION=${RENDER_GIT_COMMIT:0:7}`,
  or the sha is read at build time another way.
- Exact names of the seven shot controls and the result fields (`carry`, `offline`,
  `apex`, `shape`) are read from the code, not guessed, in phase 1.
- Test events from a laptop all carry `internal: true`, so they never pollute the
  dashboards.

## Stop condition

Stop and hand back to Sachal when: all criteria pass, OR 3 failed attempts at the
same criterion, OR before changing the Render build command or any production
setting the connector cannot undo.
