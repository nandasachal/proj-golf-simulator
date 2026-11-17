# Phase plan: Players, Leaderboard and Visitor Tracking

Status: proposed 2026-11-17
Tier: 1
Spec: [../product-specs/profiles-leaderboard.md](../product-specs/profiles-leaderboard.md)

## Goal

A player can save a name, have every game recorded under it, and see a
leaderboard ranked by share of targets hit. Sachal can see how many people
visit and how many play.

## Architecture

The site is a static React build on Render with nothing behind it. This adds:

```
browser (React)  ──HTTPS/JSON──►  API  ──►  Postgres
   localStorage:                  players, shots
   player id + secret key
```

**Backend choice (needs Sachal's decision, it costs money):**

| | A. Render web service + Render Postgres (recommended) | B. Cloudflare Worker + D1 |
|---|---|---|
| Language | Python (FastAPI) | JavaScript |
| Fits the stack preference | Yes | No |
| Cost | Roughly $13 a month for the smallest paid web service and database. Prices to be confirmed on Render before creating anything. | Free at this size |
| Free tier | Exists, but the server sleeps after 15 minutes (first leaderboard load takes 30 to 60 s) and the free database expires after 30 days. Not usable. | Usable |
| Where it lives | Same Render workspace as the site | Cloudflare, already in front of the domain |

Recommendation: A. It matches every other project, and the cost is small. B is
the answer if paying monthly for a friends' leaderboard is not worth it.

The API lives in this repo under `server/` and is served from
`api.golfswingsimulator.com` (a DNS record: Sachal's action).

**Data model**

- `players`: id, name, name_key (lowercased, unique), key_hash, recovery_hash,
  created_at
- `shots`: id, player_id, game_id, mode (normal/advanced), club, target_yards,
  hit, created_at
- Leaderboard and funnel numbers are queries over `shots`; no separate totals
  table until it is slow.

**API**

- `POST /players` {name} → {id, key, recoveryCode}; 409 if taken
- `POST /players/recover` {name, recoveryCode} → {id, key}
- `POST /shots` (key in a header) {gameId, mode, club, targetYards, hit}
- `GET /leaderboard?mode=&period=week|all&player=` → top 20 plus the caller's
  row and neighbours
- `GET /stats` (admin token) → funnel counts

**Abuse limits:** per-player and per-IP rate limits on `POST /shots` (a real
shot takes about 8 s), target distance must be inside the club's range, a game
id accepts at most 5 shots, CORS locked to the site's origin, and an admin
endpoint to remove a player.

**Client:** a `src/players/` module (API client, local profile), a save-name
step on the end-of-game card, a trophy button and leaderboard dialog. If the
API is down the game still plays; shots queue in localStorage and are sent
later.

## Phases

Each phase is shippable alone. Built top down, one at a time.

### Phase 0: shorter game — done 2026-11-17

- [x] A game is 5 targets, 3 to win (4 in advanced). Commit `2bee6c8`.

### Phase 1: visitor analytics

- In: Cloudflare Web Analytics beacon in `public/index.html`.
- Needs Sachal: turn on Web Analytics for the domain in Cloudflare and give
  the site token (it is public, not a secret).
- [ ] AC1 — the live page loads the beacon script and the Cloudflare dashboard
  shows a visit.

### Phase 2: players and recording

- In: `server/` (FastAPI, Postgres, migrations, tests against a real local
  Postgres), `POST /players`, `/players/recover`, `POST /shots`; client
  save-name step, local profile, offline queue.
- Out: any leaderboard UI.
- [ ] AC1 — `scripts/check.sh` runs the server tests as well as the client's
  and is green.
- [ ] AC2 — a new name returns an id, key and recovery code; the same name in
  different capitals returns 409.
- [ ] AC3 — `POST /shots` without a valid key is 401; a sixth shot on one game
  id is rejected; an out-of-range target is rejected.
- [ ] AC4 — in the browser: finish a game with no name saved, enter a name,
  reload, play another game; the database holds 10 shots under that player.
- [ ] AC5 — with the API unreachable the game plays normally and the shots are
  sent once it is back.
- [ ] AC6 — practice shots are never sent.

### Phase 3: leaderboard

- In: `GET /leaderboard`, trophy button, dialog with Normal/Advanced and This
  week/All time, the player's own row and neighbours, "one more hit passes X"
  on the end-of-game card, the win moment.
- [ ] AC1 — hit % = hits ÷ attempts across all of a player's shots in that
  mode, abandoned games included; covered by a server test with fixed data.
- [ ] AC2 — a player with fewer than 15 attempts is listed as warming up and
  not ranked.
- [ ] AC3 — the caller's row is returned and shown even outside the top 20.
- [ ] AC4 — the dialog works by keyboard and at phone width.
- [ ] AC5 — `knowledge-base/product-functionality` is created and describes
  names, scoring and the leaderboard as shipped.

### Phase 4: ranks, bests, badges, daily streak

Planned after Phase 3 is in use; criteria written then.

### Phase 5: daily challenge and share

Planned after Phase 4.

## Verify

- `scripts/check.sh` green (client tests, server tests, strict build)
- Server tests run against a real local Postgres, not mocks
- Each UI criterion driven in the browser preview at laptop and phone width

## Evidence required before "done"

Per criterion: the test name and its output for server rules; a screenshot of
the running app for UI; a database query result for AC4 of Phase 2.

## Stop condition

Stop and hand back to Sachal when a phase's criteria all pass, after 3 failed
attempts at one criterion, or before anything that spends money or changes
DNS: creating the Render web service or database, adding the `api.` record,
turning on Cloudflare Web Analytics.

## Risks

- **Fake scores.** Accepted at this scale; limits above, plus removal by hand.
- **Offensive names.** Basic word list; removal by hand.
- **Lost profile on a new device.** Recovery code.
- **A second thing to keep running.** The game must never depend on the API.
