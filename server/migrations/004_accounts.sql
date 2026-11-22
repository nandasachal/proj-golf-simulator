-- Recovery codes are gone; the column stays so nothing saved is destroyed.
ALTER TABLE players ALTER COLUMN recovery_hash DROP NOT NULL;
ALTER TABLE players ADD COLUMN password_hash text;
