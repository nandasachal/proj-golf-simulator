import os
import uuid

import pgserver
import pytest
from fastapi.testclient import TestClient

ADMIN = {"Authorization": "Bearer test-admin-token"}


@pytest.fixture(scope="session")
def app(tmp_path_factory):
    server = pgserver.get_server(tmp_path_factory.mktemp("pg"), cleanup_mode="delete")
    os.environ["DATABASE_URL"] = server.get_uri()
    os.environ["ADMIN_TOKEN"] = "test-admin-token"
    os.environ.pop("ALLOWED_ORIGINS", None)
    from app import main

    with TestClient(main.app):
        yield main
    server.cleanup()


@pytest.fixture
def client(app):
    with app.app.state.pool.connection() as conn:
        conn.execute("TRUNCATE players CASCADE")
    for limiter in app.LIMITERS:
        limiter.reset()
    return TestClient(app.app)


@pytest.fixture
def db(app, client):
    with app.app.state.pool.connection() as conn:
        yield conn


def signup(client, name="Sachal", password=None):
    body = {"name": name, **({"password": password} if password else {})}
    response = client.post("/players", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def shoot(client, key, **overrides):
    body = {
        "gameId": "game-1",
        "mode": "normal",
        "club": "driver",
        "targetYards": 215,
        "hit": True,
    }
    return client.post(
        "/shots",
        json={**body, **overrides},
        headers={"Authorization": f"Bearer {key}"} if key else {},
    )


def seed(db, name, results, mode="normal", days_ago=0, game_size=5):
    """A player with one shot per character of `results`: 'h' is a hit, 'm' a miss."""
    player_id = uuid.uuid4()
    db.execute(
        "INSERT INTO players (id, name, name_key, key_hash)"
        " VALUES (%s, %s, %s, %s)",
        (player_id, name, name.lower(), f"hash-{player_id}"),
    )
    add_shots(db, player_id, results, mode, days_ago, game_size)
    return str(player_id)


def add_shots(db, player_id, results, mode="normal", days_ago=0, game_size=5):
    batch = uuid.uuid4()
    for i, result in enumerate(results):
        db.execute(
            "INSERT INTO shots"
            " (player_id, game_id, mode, club, target_yards, hit, created_at)"
            " VALUES (%s, %s, %s, 'driver', 200, %s,"
            # Noon UTC, so a run of shots never straddles midnight.
            " date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"
            " + interval '12 hours' - make_interval(days => %s)"
            " + make_interval(secs => %s))",
            (
                player_id,
                f"{batch}-{i // game_size}",
                mode,
                result == "h",
                days_ago,
                i,
            ),
        )
    db.commit()
