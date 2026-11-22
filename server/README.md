# Leaderboard API

FastAPI + Postgres service behind the golf simulator: saved player names, every
game shot recorded under them, and a leaderboard ranked by share of targets hit.
Plan: [../planning/eng-plans/profiles-leaderboard.md](../planning/eng-plans/profiles-leaderboard.md).

```
app/main.py         routes, validation, auth, rate limits
app/leaderboard.py  leaderboard and funnel queries
app/db.py           connection pool; applies migrations/*.sql in order at startup
app/ratelimit.py    in-memory token buckets (one instance only)
migrations/         numbered plain-SQL migrations
tests/              pytest against a real Postgres
```

## Test

```bash
cd server && uv run pytest -q
```

The suite starts its own throwaway Postgres 16 from the `pgserver` package (a dev
dependency that ships the binaries), so there is nothing to install or start.
After the first `uv sync` it runs offline in a few seconds. `scripts/check.sh`
runs it too.

## Run locally

Needs a Postgres to point at. Without one installed, borrow pgserver's:

```bash
cd server
uv run python -c "import pgserver; print(pgserver.get_server('.pgdata', cleanup_mode=None).get_uri())"
DATABASE_URL='<the printed uri>' ADMIN_TOKEN=dev uv run uvicorn app.main:app --reload --port 8000
```

Then `curl localhost:8000/healthz`.

## Config

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string. Required. |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins. Default: the site's domain (with and without `www.`), its onrender.com address and `http://localhost:3000`. |
| `GOOGLE_CLIENT_ID` | The OAuth client id Sign in with Google credentials must be made for. Unset means `/players/google` always returns 401. |
| `INTERNAL_NAMES` | Comma-separated account names that are ours, any capitals. Unset means none. |
| `ADMIN_TOKEN` | Bearer token for `/stats` and `DELETE /admin/players/{id}`. Unset means those always return 401. |

## API

Errors are `{"error": "<code>"}`.

| Route | Result |
|---|---|
| `POST /players` `{name, password?}` | 201 `{id, name, key, account, internal}` · 409 `name_taken` · 422 `invalid_name`, `invalid_password` |
| `POST /players/login` `{name, password}` | 200, the same shape (a further key; earlier ones keep working) · 401 `invalid_login` |
| `POST /players/google` `{credential, name?}`, optional `Authorization: Bearer <key>` | Sign in with Google. 200 for a Google account seen before (a further key), or one now tied to the saved name whose key was sent · 201 for a new player called `name` · 409 `name_needed` (new, no name given), `name_taken` · 401 `invalid_login` · 422 `invalid_name` |
| `POST /players/password` `Authorization: Bearer <key>`, `{password}` | 200, the same shape: a name saved without a password becomes an account, once · 401 `unauthorized` · 422 `invalid_password` |
| `POST /shots` `Authorization: Bearer <key>`, `{gameId, mode, club, targetYards, hit}` | 201 `{ok: true}` · 401 `unauthorized` · 409 `game_full` · 422 `invalid_request` · 429 `rate_limited` |
| `GET /leaderboard?mode=&period=&player=` | `{mode, period, minAttempts, rows, warmingUp, me, passes}` |
| `GET /stats` (admin) | `{gamesStarted, gamesFinished, namesCreated, playersReturning}` |
| `DELETE /admin/players/{id}` (admin) | 200 `{ok: true}` · 404 `not_found` |
| `GET /healthz` | 200 |

- `pct` is a percentage from 0 to 100, to one decimal place.
- `targetYards` must be above 0 and at most 400.
- A game id holds five shots per player.
- Shots: 12 at once per player, then one every 3 s; 40 at once per IP, then one a
  second. The per-IP limit trusts the first `X-Forwarded-For` entry, so the
  per-player limit is the one that holds against a determined sender.
- The key is stored as SHA-256; the password (8 to 128 characters) as salted
  scrypt, with five login tries a minute per name.
- Of a Google account only the `sub` is stored.
- `account` is true when the name has a password or a Google account. `internal` is true for an
  account whose name is in `INTERNAL_NAMES`; the site then keeps that browser
  out of the analytics.

## Deploying on Render

Defined in [`../render.yaml`](../render.yaml): the web service `golf-leaderboard-api`
and the Postgres `golf-leaderboard-db`, in the same workspace as the static site.
Render generates `ADMIN_TOKEN`; read it from the service's Environment page.
Deploys are manual, like the site's.

Migrations apply themselves when the service starts. Live at
https://golf-leaderboard-api.onrender.com, which is the address the site uses.
