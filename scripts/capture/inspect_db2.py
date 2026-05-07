import os

db_path = os.path.join(os.environ.get('APPDATA', ''), 'Trae', 'ModularData', 'ai-agent', 'database.db')
print(f"DB Path: {db_path}")
print(f"File exists: {os.path.exists(db_path)}")
print(f"File size: {os.path.getsize(db_path)} bytes")

with open(db_path, 'rb') as f:
    header = f.read(32)
    print(f"Header hex: {header.hex()}")
    print(f"Header ascii: {header}")
