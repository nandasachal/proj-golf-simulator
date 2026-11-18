from conftest import ADMIN, add_shots, seed


def board(client, **params):
    response = client.get("/leaderboard", params={"mode": "normal", "period": "all", **params})
    assert response.status_code == 200, response.text
    return response.json()


def test_pct_counts_every_shot_including_abandoned_games(client, db):
    # Three full games and one abandoned after two shots: 9 hits in 17.
    player = seed(db, "Sachal", "hhmhm" + "hmhmh" + "mhhmm" + "hm")
    data = board(client)
    assert data["mode"] == "normal"
    assert data["period"] == "all"
    assert data["minAttempts"] == 15
    assert data["rows"] == [
        {
            "rank": 1,
            "id": player,
            "name": "Sachal",
            "hits": 9,
            "attempts": 17,
            "pct": 52.9,
            "games": 4,
            "bestStreak": 2,
        }
    ]
    assert data["warmingUp"] == []
    assert data["me"] is None
    assert data["passes"] is None


def test_best_streak_runs_across_games_in_time_order(client, db):
    seed(db, "Streaky", "mhhhh" + "hhmhh" + "hmmmm")
    assert board(client)["rows"][0]["bestStreak"] == 6


def test_under_15_attempts_is_warming_up_and_unranked(client, db):
    ranked = seed(db, "Ranked", "h" * 5 + "m" * 10)
    warming = seed(db, "Warming", "h" * 14)
    data = board(client, player=warming)
    assert [row["id"] for row in data["rows"]] == [ranked]
    assert data["warmingUp"] == [
        {"id": warming, "name": "Warming", "hits": 14, "attempts": 14, "games": 3}
    ]
    assert data["me"]["rank"] is None
    assert data["me"]["ranked"] is False
    assert data["me"]["attempts"] == 14
    assert data["me"]["neighbours"] == []
    assert data["passes"] is None


def test_modes_are_separate(client, db):
    player = seed(db, "Sachal", "h" * 15)
    add_shots(db, player, "m" * 15, mode="advanced")
    assert board(client)["rows"][0]["pct"] == 100
    assert board(client, mode="advanced")["rows"][0]["pct"] == 0


def test_ties_go_to_more_attempts(client, db):
    fewer = seed(db, "Aaron", "hm" * 10)
    more = seed(db, "Zed", "hm" * 15)
    best = seed(db, "Best", "h" * 12 + "m" * 3)
    rows = board(client)["rows"]
    assert [(row["rank"], row["id"]) for row in rows] == [
        (1, best),
        (2, more),
        (3, fewer),
    ]


def test_caller_outside_the_top_20_gets_their_row_and_neighbours(client, db):
    # P01 hits 24 of 25, P02 23 of 25 ... P25 hits none.
    ids = [
        seed(db, f"P{n:02d}", "h" * (25 - n) + "m" * n) for n in range(1, 26)
    ]
    data = board(client, player=ids[22])
    assert len(data["rows"]) == 20
    assert [row["rank"] for row in data["rows"]] == list(range(1, 21))
    assert [row["name"] for row in data["rows"]] == [f"P{n:02d}" for n in range(1, 21)]
    me = data["me"]
    assert (me["rank"], me["name"], me["ranked"]) == (23, "P23", True)
    assert (me["hits"], me["attempts"], me["pct"]) == (2, 25, 8.0)
    assert [(n["rank"], n["name"]) for n in me["neighbours"]] == [
        (22, "P22"),
        (24, "P24"),
    ]
    # 3 of 25 is 12%; 3 of 26 is behind, 4 of 27 is ahead.
    assert data["passes"] == {"name": "P22", "hitsNeeded": 2}


def test_top_player_has_one_neighbour_and_nobody_to_pass(client, db):
    top = seed(db, "Top", "h" * 15)
    seed(db, "Second", "h" * 10 + "m" * 5)
    data = board(client, player=top)
    assert data["me"]["rank"] == 1
    assert [n["name"] for n in data["me"]["neighbours"]] == ["Second"]
    assert data["passes"] is None


def test_passes_a_tied_player_by_overtaking_on_attempts(client, db):
    seed(db, "Ahead", "h" * 20)
    me = seed(db, "Behind", "h" * 15)
    assert board(client, player=me)["passes"] == {"name": "Ahead", "hitsNeeded": 6}


def test_cannot_pass_a_perfect_record_from_below(client, db):
    seed(db, "Perfect", "h" * 15)
    me = seed(db, "Me", "h" * 14 + "m")
    data = board(client, player=me)
    assert data["me"]["rank"] == 2
    assert data["passes"] is None


def test_week_counts_only_shots_since_monday(client, db):
    veteran = seed(db, "Veteran", "h" * 20, days_ago=8)
    add_shots(db, veteran, "m" * 5)
    current = seed(db, "Current", "h" * 15)

    all_time = board(client, player=veteran)
    assert [(r["name"], r["hits"], r["attempts"]) for r in all_time["rows"]] == [
        ("Current", 15, 15),
        ("Veteran", 20, 25),
    ]

    week = board(client, period="week", player=veteran)
    assert week["period"] == "week"
    assert [row["id"] for row in week["rows"]] == [current]
    assert week["warmingUp"] == [
        {"id": veteran, "name": "Veteran", "hits": 0, "attempts": 5, "games": 1}
    ]
    assert week["me"]["ranked"] is False


def test_week_starts_monday_midnight_utc():
    from datetime import datetime, timezone

    from app.leaderboard import week_start

    monday = datetime(2026, 11, 16, tzinfo=timezone.utc)
    assert week_start(datetime(2026, 11, 16, 0, 0, tzinfo=timezone.utc)) == monday
    assert week_start(datetime(2026, 11, 22, 23, 59, tzinfo=timezone.utc)) == monday
    assert week_start(datetime(2026, 11, 23, 0, 0, tzinfo=timezone.utc)) > monday


def test_player_with_no_shots_and_unknown_player(client, db):
    idle = seed(db, "Idle", "")
    me = board(client, player=idle)["me"]
    assert (me["attempts"], me["rank"], me["ranked"]) == (0, None, False)
    assert board(client, player="00000000-0000-0000-0000-000000000000")["me"] is None


def test_bad_query_is_422(client):
    assert client.get("/leaderboard", params={"mode": "practice"}).status_code == 422
    assert client.get("/leaderboard", params={"period": "month"}).status_code == 422


def test_stats_needs_the_admin_token(client):
    assert client.get("/stats").status_code == 401
    assert client.get("/stats", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_stats_funnel(client, db):
    # Two finished games and one abandoned, on a single day.
    seed(db, "OneDay", "h" * 12)
    # Came back three days after the first shot.
    back = seed(db, "CameBack", "hhhhh", days_ago=5)
    add_shots(db, back, "mm", days_ago=2)
    # Came back, but more than a week after the first shot.
    late = seed(db, "TooLate", "hhhhh", days_ago=20)
    add_shots(db, late, "hhhhh", days_ago=1)
    seed(db, "NeverPlayed", "")
    assert client.get("/stats", headers=ADMIN).json() == {
        "gamesStarted": 7,
        "gamesFinished": 5,
        "namesCreated": 4,
        "playersReturning": 1,
    }
