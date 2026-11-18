import hashlib
import hmac
import os
import re
import secrets
import uuid
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Literal

import psycopg
from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StrictBool

from . import db
from .leaderboard import leaderboard, stats
from .ratelimit import RateLimiter

DEFAULT_ORIGINS = (
    "https://golfswingsimulator.com,https://www.golfswingsimulator.com,"
    "https://golf-swing-simulator.onrender.com,http://localhost:3000"
)
SHOTS_PER_GAME = 5
# The game's farthest ground target is 330 yd downrange and 40 offline (333 yd);
# air targets sit along a driver's flight, which stays inside 400.
MAX_TARGET_YARDS = 400
BLOCKED_WORDS = (
    "fuck", "shit", "cunt", "bitch", "nigg", "fagg", "whore", "slut", "nazi",
    "hitler", "penis", "vagina", "asshole", "pussy", "retard", "twat", "wank",
)  # fmt: skip
RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

# A real shot takes about 8 s; the burst lets an offline queue of ~10 flush.
shots_by_player = RateLimiter(burst=12, every=3)
shots_by_ip = RateLimiter(burst=40, every=1)
signups_by_ip = RateLimiter(burst=10, every=60)
recoveries_by_name = RateLimiter(burst=5, every=60)
recoveries_by_ip = RateLimiter(burst=10, every=60)
LIMITERS = (
    shots_by_player,
    shots_by_ip,
    signups_by_ip,
    recoveries_by_name,
    recoveries_by_ip,
)


@asynccontextmanager
async def lifespan(app):
    app.state.pool = db.connect(os.environ["DATABASE_URL"])
    yield
    app.state.pool.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


def error(status, code):
    return JSONResponse({"error": code}, status_code=status)


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    return error(422, "invalid_request")


def client_ip(request):
    # Render's proxy puts the caller first in X-Forwarded-For.
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",")[0].strip() if forwarded else request.client.host


def bearer(authorization):
    scheme, _, token = (authorization or "").partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""


def is_admin(authorization):
    expected = os.environ.get("ADMIN_TOKEN", "")
    return bool(expected) and hmac.compare_digest(
        bearer(authorization).encode(), expected.encode()
    )


def key_hash(key):
    return hashlib.sha256(key.encode()).hexdigest()


def recovery_hash(code, salt):
    return hashlib.scrypt(code.encode(), salt=salt, n=2**14, r=8, p=1).hex()


def normalise_code(code):
    return "".join(ch for ch in code.upper() if ch.isalnum())


class NewPlayer(BaseModel):
    name: str = ""


class Recovery(BaseModel):
    name: str = ""
    recoveryCode: str = ""


class NewShot(BaseModel):
    gameId: str = Field(min_length=1, max_length=64)
    mode: Literal["normal", "advanced"]
    club: str = Field(min_length=1, max_length=32)
    targetYards: float = Field(gt=0, le=MAX_TARGET_YARDS)
    hit: StrictBool
    shotId: str | None = Field(None, min_length=1, max_length=64)
    playedAt: datetime | None = None


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/players", status_code=201)
def create_player(body: NewPlayer, request: Request):
    if not signups_by_ip.allow(client_ip(request)):
        return error(429, "rate_limited")
    name = " ".join(body.name.split())
    lowered = name.lower()
    if (
        not 2 <= len(name) <= 16
        or not name.isprintable()
        # Start of a word only: "Mishit" is a golf shot, not an insult.
        or any(
            part.startswith(BLOCKED_WORDS) for part in re.split(r"[^a-z]+", lowered)
        )
    ):
        return error(422, "invalid_name")
    key = secrets.token_urlsafe(32)
    code = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(8))
    salt = secrets.token_bytes(16)
    player_id = uuid.uuid4()
    try:
        with request.app.state.pool.connection() as conn:
            conn.execute(
                "INSERT INTO players (id, name, name_key, key_hash, recovery_hash)"
                " VALUES (%s, %s, %s, %s, %s)",
                (
                    player_id,
                    name,
                    lowered,
                    key_hash(key),
                    f"{salt.hex()}${recovery_hash(code, salt)}",
                ),
            )
    except psycopg.errors.UniqueViolation:
        return error(409, "name_taken")
    return {
        "id": str(player_id),
        "name": name,
        "key": key,
        "recoveryCode": f"{code[:4]}-{code[4:]}",
    }


@app.post("/players/recover")
def recover_player(body: Recovery, request: Request):
    name_key = " ".join(body.name.split()).lower()
    if not recoveries_by_ip.allow(client_ip(request)) or not recoveries_by_name.allow(
        name_key
    ):
        return error(429, "rate_limited")
    with request.app.state.pool.connection() as conn:
        row = conn.execute(
            "SELECT id, name, recovery_hash FROM players WHERE name_key = %s",
            (name_key,),
        ).fetchone()
        if not row:
            return error(401, "invalid_recovery")
        player_id, name, stored = row
        salt, _, expected = stored.partition("$")
        actual = recovery_hash(normalise_code(body.recoveryCode), bytes.fromhex(salt))
        if not hmac.compare_digest(actual, expected):
            return error(401, "invalid_recovery")
        key = secrets.token_urlsafe(32)
        # Another key for the same player: the device that had the name
        # before keeps working.
        conn.execute(
            "INSERT INTO player_keys (key_hash, player_id) VALUES (%s, %s)",
            (key_hash(key), player_id),
        )
    return {"id": str(player_id), "name": name, "key": key}


@app.post("/shots", status_code=201)
def record_shot(
    body: NewShot, request: Request, authorization: str | None = Header(None)
):
    if not shots_by_ip.allow(client_ip(request)):
        return error(429, "rate_limited")
    with request.app.state.pool.connection() as conn:
        # The row lock makes the five-shot count safe against parallel requests.
        player = conn.execute(
            "SELECT id FROM players WHERE key_hash = %(key)s OR id ="
            " (SELECT player_id FROM player_keys WHERE key_hash = %(key)s)"
            " FOR UPDATE",
            {"key": key_hash(bearer(authorization))},
        ).fetchone()
        if not player:
            return error(401, "unauthorized")
        if not shots_by_player.allow(player[0]):
            return error(429, "rate_limited")
        # A resend of a shot whose answer was lost is not a second shot.
        if body.shotId and conn.execute(
            "SELECT 1 FROM shots WHERE player_id = %s AND client_id = %s",
            (player[0], body.shotId),
        ).fetchone():
            return {"ok": True}
        (count,) = conn.execute(
            "SELECT count(*) FROM shots WHERE player_id = %s AND game_id = %s",
            (player[0], body.gameId),
        ).fetchone()
        if count >= SHOTS_PER_GAME:
            return error(409, "game_full")
        conn.execute(
            # Shots queued offline keep the time they were played, within a week.
            "INSERT INTO shots (player_id, game_id, mode, club, target_yards, hit,"
            " client_id, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s,"
            " greatest(least(coalesce(%s, now()), now()), now() - interval '7 days'))",
            (
                player[0],
                body.gameId,
                body.mode,
                body.club,
                body.targetYards,
                body.hit,
                body.shotId,
                body.playedAt,
            ),
        )
    return {"ok": True}


@app.get("/leaderboard")
def get_leaderboard(
    request: Request,
    mode: Literal["normal", "advanced"] = "normal",
    period: Literal["week", "all"] = "all",
    player: uuid.UUID | None = None,
):
    with request.app.state.pool.connection() as conn:
        return leaderboard(conn, mode, period, player)


@app.get("/stats")
def get_stats(request: Request, authorization: str | None = Header(None)):
    if not is_admin(authorization):
        return error(401, "unauthorized")
    with request.app.state.pool.connection() as conn:
        return stats(conn)


@app.delete("/admin/players/{player_id}")
def delete_player(
    player_id: uuid.UUID, request: Request, authorization: str | None = Header(None)
):
    if not is_admin(authorization):
        return error(401, "unauthorized")
    with request.app.state.pool.connection() as conn:
        deleted = conn.execute(
            "DELETE FROM players WHERE id = %s", (player_id,)
        ).rowcount
    return {"ok": True} if deleted else error(404, "not_found")
