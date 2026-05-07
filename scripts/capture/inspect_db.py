import sqlite3
import os

db_path = os.path.join(os.environ.get('APPDATA', ''), 'Trae', 'ModularData', 'ai-agent', 'database.db')
print(f"DB Path: {db_path}")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print(f"Tables: {[t[0] for t in tables]}")
    
    for table in tables:
        tname = table[0]
        cursor.execute(f"SELECT count(*) FROM [{tname}]")
        count = cursor.fetchone()[0]
        cursor.execute(f"PRAGMA table_info([{tname}])")
        cols = cursor.fetchall()
        col_names = [c[1] for c in cols]
        print(f"\n--- {tname} ({count} rows) ---")
        print(f"Columns: {col_names}")
        if count > 0:
            cursor.execute(f"SELECT * FROM [{tname}] LIMIT 2")
            rows = cursor.fetchall()
            for row in rows:
                print(f"  {row}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
