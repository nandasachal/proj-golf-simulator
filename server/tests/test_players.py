import re

from conftest import shoot, signup


def test_healthz(client):
    assert client.get("/healthz").status_code == 200


def test_new_name_returns_id_key_and_recovery_code(client):
    player = signup(client, "  Sachal ")
    assert player["name"] == "Sachal"
    assert len(player["id"]) == 36
    assert len(player["key"]) >= 40
    assert re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}", player["recoveryCode"])


def test_secrets_are_stored_only_as_hashes(client, db):
    player = signup(client)
    key_hash, recovery_hash = db.execute(
        "SELECT key_hash, recovery_hash FROM players"
    ).fetchone()
    assert player["key"] not in key_hash
    assert player["recoveryCode"].replace("-", "") not in recovery_hash


def test_same_name_in_different_capitals_is_taken(client):
    signup(client, "Sachal")
    response = client.post("/players", json={"name": "sACHAL"})
    assert response.status_code == 409
    assert response.json() == {"error": "name_taken"}


def test_invalid_names(client):
    for name in ["", " a ", "x" * 17, "FuckFace", None]:
        response = client.post("/players", json={"name": name} if name else {})
        assert response.status_code == 422, name
        assert response.json()["error"] in ("invalid_name", "invalid_request")
    assert client.post("/players", json={"name": "a"}).json() == {
        "error": "invalid_name"
    }
    assert client.post("/players", json={"name": "x" * 16}).status_code == 201


def test_recover_rotates_the_key(client):
    player = signup(client)
    assert shoot(client, player["key"]).status_code == 201
    response = client.post(
        "/players/recover",
        json={"name": "SACHAL", "recoveryCode": player["recoveryCode"].lower()},
    )
    assert response.status_code == 200
    recovered = response.json()
    assert recovered["id"] == player["id"]
    assert recovered["name"] == "Sachal"
    assert recovered["key"] != player["key"]
    assert shoot(client, player["key"]).status_code == 401
    assert shoot(client, recovered["key"]).status_code == 201


def test_recover_rejects_a_wrong_code_or_name(client):
    player = signup(client)
    wrong = client.post(
        "/players/recover", json={"name": "Sachal", "recoveryCode": "AAAA-AAAA"}
    )
    assert wrong.status_code == 401
    unknown = client.post(
        "/players/recover",
        json={"name": "Nobody", "recoveryCode": player["recoveryCode"]},
    )
    assert unknown.status_code == 401
    assert shoot(client, player["key"]).status_code == 201


def test_recover_is_rate_limited_per_name(client):
    signup(client)
    statuses = [
        client.post(
            "/players/recover", json={"name": "Sachal", "recoveryCode": "AAAA-AAAA"}
        ).status_code
        for _ in range(6)
    ]
    assert statuses == [401] * 5 + [429]


def test_cors_allows_only_the_site(client):
    allowed = client.get("/healthz", headers={"Origin": "https://golfswingsimulator.com"})
    assert (
        allowed.headers["access-control-allow-origin"]
        == "https://golfswingsimulator.com"
    )
    local = client.get("/healthz", headers={"Origin": "http://localhost:3000"})
    assert local.headers["access-control-allow-origin"] == "http://localhost:3000"
    other = client.get("/healthz", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in other.headers
    preflight = client.options(
        "/shots",
        headers={
            "Origin": "https://golfswingsimulator.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert preflight.status_code == 200


def test_a_blocked_word_inside_a_longer_word_is_allowed(client):
    assert client.post("/players", json={"name": "Mishit"}).status_code == 201
    assert client.post("/players", json={"name": "Big Shithead"}).status_code == 422
