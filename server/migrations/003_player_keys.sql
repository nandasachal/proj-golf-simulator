CREATE TABLE player_keys (
    key_hash text PRIMARY KEY,
    player_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);
