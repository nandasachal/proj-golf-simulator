from conftest import shoot, signup


def test_shot_is_recorded(client, db):
    player = signup(client)
    response = shoot(client, player["key"], mode="advanced", club="7i", hit=False)
    assert response.status_code == 201
    assert response.json() == {"ok": True}
    assert db.execute(
        "SELECT player_id::text, game_id, mode, club, target_yards, hit FROM shots"
    ).fetchall() == [(player["id"], "game-1", "advanced", "7i", 215, False)]


def test_shot_without_a_valid_key_is_401(client):
    signup(client)
    assert shoot(client, None).status_code == 401
    assert shoot(client, "not-a-key").status_code == 401


def test_sixth_shot_on_a_game_is_rejected(client):
    player = signup(client)
    for _ in range(5):
        assert shoot(client, player["key"]).status_code == 201
    sixth = shoot(client, player["key"])
    assert sixth.status_code == 409
    assert sixth.json() == {"error": "game_full"}
    assert shoot(client, player["key"], gameId="game-2").status_code == 201


def test_another_players_game_id_does_not_count(client):
    first = signup(client, "First")
    second = signup(client, "Second")
    for _ in range(5):
        shoot(client, first["key"])
    assert shoot(client, second["key"]).status_code == 201


def test_out_of_range_target_is_rejected(client):
    player = signup(client)
    for yards in [0, -10, 401, 5000]:
        assert shoot(client, player["key"], targetYards=yards).status_code == 422, yards
    for yards in [1, 140, 333, 400]:
        assert shoot(client, player["key"], targetYards=yards, gameId=str(yards)).status_code == 201


def test_bad_fields_are_rejected(client):
    player = signup(client)
    assert shoot(client, player["key"], mode="practice").status_code == 422
    assert shoot(client, player["key"], hit="yes").status_code == 422
    assert shoot(client, player["key"], club="").status_code == 422
    assert shoot(client, player["key"], gameId="").status_code == 422


def test_player_rate_limit_allows_a_queue_flush_then_429(client):
    player = signup(client)
    statuses = [
        shoot(client, player["key"], gameId=f"game-{i // 5}").status_code
        for i in range(14)
    ]
    assert statuses[:10] == [201] * 10
    assert statuses[-1] == 429
    other = signup(client, "Other")
    assert shoot(client, other["key"]).status_code == 201


def test_ip_rate_limit(client):
    statuses = set()
    for i in range(45):
        statuses.add(shoot(client, None).status_code)
    assert statuses == {401, 429}


def test_admin_delete_removes_player_and_shots(client, db):
    from conftest import ADMIN

    player = signup(client)
    shoot(client, player["key"])
    assert client.delete(f"/admin/players/{player['id']}").status_code == 401
    assert (
        client.delete(
            f"/admin/players/{player['id']}", headers={"Authorization": "Bearer nope"}
        ).status_code
        == 401
    )
    assert client.delete(f"/admin/players/{player['id']}", headers=ADMIN).status_code == 200
    assert db.execute("SELECT count(*) FROM players").fetchone() == (0,)
    assert db.execute("SELECT count(*) FROM shots").fetchone() == (0,)
    assert client.delete(f"/admin/players/{player['id']}", headers=ADMIN).status_code == 404
    assert client.post("/players", json={"name": "Sachal"}).status_code == 201


def test_a_resent_shot_is_recorded_once(client, db):
    player = signup(client)
    for _ in range(2):
        assert shoot(client, player["key"], shotId="shot-1").status_code == 201
    assert db.execute("SELECT count(*) FROM shots").fetchone() == (1,)
    for n in range(2, 6):
        assert shoot(client, player["key"], shotId=f"shot-{n}").status_code == 201
    assert shoot(client, player["key"], shotId="shot-5").status_code == 201
    assert db.execute("SELECT count(*) FROM shots").fetchone() == (5,)


def test_a_queued_shot_keeps_when_it_was_played_within_a_week(client, db):
    player = signup(client)
    shoot(client, player["key"], shotId="a", playedAt="2020-01-01T00:00:00Z")
    shoot(client, player["key"], shotId="b", playedAt="2999-01-01T00:00:00Z")
    ages = db.execute(
        "SELECT extract(epoch FROM now() - created_at) FROM shots ORDER BY id"
    ).fetchall()
    assert abs(float(ages[0][0]) - 7 * 86400) < 60
    assert abs(float(ages[1][0])) < 60


def test_a_medium_shot_is_taken_and_has_its_own_board(client, db):
    player = signup(client)
    assert shoot(client, player["key"], mode="medium", club="7i", hit=True).status_code == 201
    assert db.execute("SELECT mode FROM shots").fetchall() == [("medium",)]
    assert client.get("/leaderboard", params={"mode": "medium"}).status_code == 200
    assert shoot(client, player["key"], mode="easy").status_code == 422
