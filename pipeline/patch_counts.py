"""Refresh fullCount in data/books.json from the generated data/qa_full files."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS_F = ROOT / "data" / "books.json"
FULL = ROOT / "data" / "qa_full"

books = json.loads(BOOKS_F.read_text(encoding="utf-8"))
counts = {}
if FULL.exists():
    for f in FULL.glob("*.json"):
        try:
            obj = json.loads(f.read_text(encoding="utf-8"))
            n = sum(len(v or []) for v in (obj.get("pages") or {}).values())
        except Exception:
            n = 0
        if n:
            counts[str(obj.get("bookId"))] = n

changed = 0
for b in books:
    n = counts.get(str(b["id"]), 0)
    if b.get("fullCount") != n:
        b["fullCount"] = n
        changed += 1
BOOKS_F.write_text(json.dumps(books, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"patched fullCount for {changed} books ({len(counts)} with answers)")
