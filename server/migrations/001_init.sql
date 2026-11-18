CREATE TABLE players (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    name_key text NOT NULL UNIQUE,
    key_hash text NOT NULL UNIQUE,
    recovery_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shots (
    id bigserial PRIMARY KEY,
    player_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    game_id text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('normal', 'advanced')),
    club text NOT NULL,
    target_yards real NOT NULL,
    hit boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shots_player_game ON shots (player_id, game_id);
CREATE INDEX shots_mode_created ON shots (mode, created_at);
