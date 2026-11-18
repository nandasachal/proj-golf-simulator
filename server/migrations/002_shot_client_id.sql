ALTER TABLE shots ADD COLUMN client_id text;
CREATE UNIQUE INDEX shots_player_client_id ON shots (player_id, client_id);
