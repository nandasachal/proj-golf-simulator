from datetime import datetime, timedelta, timezone
from fractions import Fraction

MIN_ATTEMPTS = 15
TOP = 20
WARMING_UP_LIMIT = 50

TOTALS = """
WITH s AS (
    SELECT player_id, game_id, hit,
           row_number() OVER (PARTITION BY player_id ORDER BY created_at, id)
           - row_number() OVER (PARTITION BY player_id, hit ORDER BY created_at, id)
           AS run
    FROM shots
    WHERE mode = %(mode)s AND created_at >= %(since)s
), streaks AS (
    SELECT player_id, max(length) AS best
    FROM (
        SELECT player_id, count(*) AS length FROM s WHERE hit GROUP BY player_id, run
    ) runs
    GROUP BY player_id
)
SELECT p.id, p.name,
       count(*) FILTER (WHERE s.hit) AS hits,
       count(*) AS attempts,
       count(DISTINCT s.game_id) AS games,
       coalesce(streaks.best, 0) AS best_streak
FROM s
JOIN players p ON p.id = s.player_id
LEFT JOIN streaks ON streaks.player_id = p.id
GROUP BY p.id, p.name, streaks.best
"""


def week_start(now=None):
    now = now or datetime.now(timezone.utc)
    monday = now.date() - timedelta(days=now.weekday())
    return datetime(monday.year, monday.month, monday.day, tzinfo=timezone.utc)


def order(row):
    return (
        -Fraction(row["hits"], row["attempts"]),
        -row["attempts"],
        row["name"].lower(),
    )


def hits_needed(me, above):
    for extra in range(1, 1001):
        ahead = {
            **me,
            "hits": me["hits"] + extra,
            "attempts": me["attempts"] + extra,
        }
        if order(ahead) < order(above):
            return extra
    return None


def leaderboard(conn, mode, period, player_id):
    since = week_start() if period == "week" else datetime.min.replace(
        tzinfo=timezone.utc
    )
    players = [
        {
            "id": str(id),
            "name": name,
            "hits": hits,
            "attempts": attempts,
            "pct": round(100 * hits / attempts, 1),
            "games": games,
            "bestStreak": best_streak,
        }
        for id, name, hits, attempts, games, best_streak in conn.execute(
            TOTALS, {"mode": mode, "since": since}
        )
    ]
    ranked = sorted((p for p in players if p["attempts"] >= MIN_ATTEMPTS), key=order)
    ranked = [{"rank": i + 1, **p} for i, p in enumerate(ranked)]
    warming = sorted(
        (p for p in players if p["attempts"] < MIN_ATTEMPTS),
        key=lambda p: (-p["attempts"], p["name"].lower()),
    )

    me = None
    passes = None
    if player_id:
        key = str(player_id)
        index = next((i for i, p in enumerate(ranked) if p["id"] == key), None)
        if index is not None:
            above = ranked[index - 1] if index else None
            me = {
                **ranked[index],
                "ranked": True,
                "neighbours": ranked[max(index - 1, 0) : index]
                + ranked[index + 1 : index + 2],
            }
            needed = above and hits_needed(ranked[index], above)
            if needed:
                passes = {"name": above["name"], "hitsNeeded": needed}
        else:
            mine = next((p for p in warming if p["id"] == key), None)
            if not mine:
                found = conn.execute(
                    "SELECT name FROM players WHERE id = %s", (player_id,)
                ).fetchone()
                if found:
                    mine = {
                        "id": key,
                        "name": found[0],
                        "hits": 0,
                        "attempts": 0,
                        "pct": 0,
                        "games": 0,
                        "bestStreak": 0,
                    }
            if mine:
                me = {"rank": None, **mine, "ranked": False, "neighbours": []}

    return {
        "mode": mode,
        "period": period,
        "minAttempts": MIN_ATTEMPTS,
        "rows": ranked[:TOP],
        "warmingUp": [
            {k: p[k] for k in ("id", "name", "hits", "attempts", "games")}
            for p in warming[:WARMING_UP_LIMIT]
        ],
        "me": me,
        "passes": passes,
    }


STATS = """
WITH games AS (
    SELECT player_id, game_id, count(*) AS shots FROM shots GROUP BY player_id, game_id
), firsts AS (
    SELECT player_id, min(created_at) AS first FROM shots GROUP BY player_id
), came_back AS (
    SELECT s.player_id
    FROM shots s JOIN firsts f ON f.player_id = s.player_id
    WHERE s.created_at < f.first + interval '7 days'
    GROUP BY s.player_id
    HAVING count(DISTINCT (s.created_at AT TIME ZONE 'UTC')::date) >= 2
)
SELECT (SELECT count(*) FROM games),
       (SELECT count(*) FROM games WHERE shots >= 5),
       (SELECT count(*) FROM players),
       (SELECT count(*) FROM came_back)
"""


def stats(conn):
    started, finished, names, returning = conn.execute(STATS).fetchone()
    return {
        "gamesStarted": started,
        "gamesFinished": finished,
        "namesCreated": names,
        "playersReturning": returning,
    }
