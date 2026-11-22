from conftest import shoot, signup

PASSWORD = "correct horse"


def test_healthz(client):
    assert client.get("/healthz").status_code == 200


def test_new_name_returns_id_and_key(client):
    player = signup(client, "  Sachal ")
    assert player["name"] == "Sachal"
    assert len(player["id"]) == 36
    assert len(player["key"]) >= 40
    assert player["account"] is False
    assert "recoveryCode" not in player


def test_secrets_are_stored_only_as_hashes(client, db):
    player = signup(client, password=PASSWORD)
    key_hash, password_hash = db.execute(
        "SELECT key_hash, password_hash FROM players"
    ).fetchone()
    assert player["key"] not in key_hash
    assert PASSWORD not in password_hash


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


def login(client, name="Sachal", password=PASSWORD):
    return client.post("/players/login", json={"name": name, "password": password})


def test_login_gives_a_second_key_and_the_first_still_works(client):
    player = signup(client, password=PASSWORD)
    assert player["account"] is True
    assert shoot(client, player["key"]).status_code == 201
    response = login(client, "SACHAL")
    assert response.status_code == 200
    again = response.json()
    assert again["id"] == player["id"]
    assert again["name"] == "Sachal"
    assert again["account"] is True
    assert again["key"] != player["key"]
    assert shoot(client, player["key"]).status_code == 201
    assert shoot(client, again["key"]).status_code == 201


def test_login_rejects_a_wrong_password_an_unknown_name_and_a_name_without_one(
    client,
):
    signup(client, password=PASSWORD)
    signup(client, "Guest")
    for name, password in [
        ("Sachal", "wrong-password"),
        ("Nobody", PASSWORD),
        ("Guest", ""),
        ("Guest", PASSWORD),
    ]:
        response = login(client, name, password)
        assert response.status_code == 401, name
        assert response.json() == {"error": "invalid_login"}


def test_login_is_rate_limited_per_name(client):
    signup(client, password=PASSWORD)
    statuses = [login(client, password="wrong-password").status_code for _ in range(6)]
    assert statuses == [401] * 5 + [429]


def test_a_password_must_be_8_to_128_characters(client):
    for password in ["", "short", "x" * 129]:
        response = client.post("/players", json={"name": "Sachal", "password": password})
        assert response.status_code == 422, password
        assert response.json() == {"error": "invalid_password"}
    assert login(client).status_code == 401


def test_a_saved_name_becomes_an_account_from_the_browser_that_holds_it(client):
    player = signup(client)
    headers = {"Authorization": f"Bearer {player['key']}"}
    short = client.post("/players/password", json={"password": "short"}, headers=headers)
    assert short.status_code == 422
    stranger = client.post(
        "/players/password",
        json={"password": PASSWORD},
        headers={"Authorization": "Bearer not-a-key"},
    )
    assert stranger.status_code == 401
    assert login(client).status_code == 401

    made = client.post("/players/password", json={"password": PASSWORD}, headers=headers)
    assert made.status_code == 200
    assert made.json() == {**player, "account": True}
    assert login(client).json()["id"] == player["id"]
    # the password is set once; a key alone cannot replace it
    again = client.post(
        "/players/password", json={"password": "another-password"}, headers=headers
    )
    assert again.status_code == 401
    assert login(client).status_code == 200


def test_our_own_accounts_are_marked_internal(client, monkeypatch):
    monkeypatch.setenv("INTERNAL_NAMES", "Sachal, someone")
    assert signup(client, password=PASSWORD)["internal"] is True
    assert login(client).json()["internal"] is True
    assert signup(client, "Other", PASSWORD)["internal"] is False
    # a name with no password proves nothing about who holds it
    monkeypatch.setenv("INTERNAL_NAMES", "guest")
    assert signup(client, "Guest")["internal"] is False


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
