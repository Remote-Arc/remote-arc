import json,sqlite3,sys
try:
    expected=json.load(sys.stdin)
    connection=sqlite3.connect(":memory:")
    connection.executescript(open(sys.argv[1],encoding="utf-8").read())
    if connection.execute("PRAGMA integrity_check").fetchall()!=[("ok",)]:
        raise ValueError("integrity")
    restored=[row[0] for row in connection.execute("SELECT name FROM d1_migrations ORDER BY id ASC")]
    if restored!=expected:
        raise ValueError("history")
    print(json.dumps({"verified":True}))
except Exception:
    print("Backup verification failed",file=sys.stderr)
    sys.exit(1)
