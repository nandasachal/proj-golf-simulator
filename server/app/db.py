from pathlib import Path

from psycopg_pool import ConnectionPool

MIGRATIONS = Path(__file__).parent.parent / "migrations"


def connect(url):
    pool = ConnectionPool(url, min_size=1, max_size=5, open=True)
    with pool.connection() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)"
        )
        applied = {
            name for (name,) in conn.execute("SELECT name FROM schema_migrations")
        }
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if path.name in applied:
                continue
            conn.execute(path.read_text())
            conn.execute(
                "INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,)
            )
    return pool
