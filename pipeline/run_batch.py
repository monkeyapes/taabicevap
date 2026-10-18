"""Generate per-page answers for MEB lise books, resumably.

Reads the book catalog from data/books.json (the site's high-school-only list),
downloads each book's public PDF, extracts question pages, asks the free
opencode model to answer them, and writes data/qa_full/{id}.json.

Designed to run in short bursts (e.g. a GitHub Actions job): it stops when the
time budget is exhausted and resumes on the next run.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.request
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
BOOKS = json.loads((ROOT / "data" / "books.json").read_text(encoding="utf-8"))
OUT = ROOT / "data" / "qa_full"
OUT.mkdir(parents=True, exist_ok=True)

OPENCODE = os.environ.get("OPENCODE_BIN", "opencode")
MODEL = os.environ.get("OPencode_MODEL", "opencode/deepseek-v4.1-flash-free")
MODEL = os.environ.get("OPENCODE_MODEL", MODEL)
BUDGET = int(os.environ.get("BUDGET_MIN", "330")) * 60
MAX_BOOKS = int(os.environ.get("MAX_BOOKS", "0"))

GRADE_ORDER = ["Hazırlık", "9.Sınıf", "10.Sınıf", "11.Sınıf", "12.Sınıf"]

QWORDS = ("yazınız", "doldurunuz", "işaretleyiniz", "eşleştiriniz", "cevaplayınız",
          "söyleyiniz", "aşağıdaki", "aşağıda", "hesaplayınız", "bulunuz",
          "belirtiniz", "açıklayınız", "tartışınız", "çözünüz", "tamamlayınız",
          "nedir", "nasıl", "neden", "kaç")

PROMPT = """Bir Türk lise ders kitabının {page}. sayfasının metni aşağıdadır.
Bu sayfadaki TÜM soruları ve etkinlikleri Türkçe, kısa ve doğru şekilde yanıtla.
Biçim: her madde için bir satır "S: <soru>" ve altında "C: <kısa cevap>".
Sadece bu maddeleri yaz, başka açıklama ekleme.

--- SAYFA METNİ ---
{text}
--- SON ---"""


def norm(s):
    s = unicodedata.normalize("NFKC", s)
    s = "".join(c for c in s if c not in "\u0307\u0308\u0304\u0300\u0301\u0327\u0323")
    return s.replace("\xad", "").replace("\u00a0", " ")


def page_text(doc, i):
    t = norm(doc[i].get_text())
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in t.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def is_question_page(text):
    if "?" in text:
        return True
    low = text.lower()
    return sum(1 for w in QWORDS if w in low) >= 2


def ask_model(prompt, timeout=300):
    for attempt in range(3):
        try:
            p = subprocess.run(
                [OPENCODE, "run", "-m", MODEL, "--format", "json", prompt],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            continue
        out = []
        for line in p.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except Exception:
                continue
            if ev.get("type") == "text":
                out.append(ev.get("part", {}).get("text", ""))
        txt = "".join(out).strip()
        if txt:
            return txt
    return ""


def parse_items(raw):
    items, cur = [], None
    for ln in raw.splitlines():
        ln = ln.strip()
        m = re.match(r"^S\s*[:\-]\s*(.+)", ln)
        if m:
            cur = {"q": m.group(1).strip(), "a": ""}
            items.append(cur)
            continue
        m = re.match(r"^C\s*[:\-]\s*(.+)", ln)
        if m and cur is not None:
            cur["a"] = m.group(1).strip()
    return [it for it in items if it["q"]]


def load_state(bid):
    f = OUT / f"{bid}.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"bookId": int(bid), "done": False, "pages": {}}


def save_state(state):
    (OUT / f"{state['bookId']}.json").write_text(
        json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)


def process_book(book):
    bid = str(book["id"])
    state = load_state(bid)
    if state.get("done"):
        return 0
    if not book.get("pdf"):
        return 0
    tmp = Path(tempfile.gettempdir()) / f"book_{bid}.pdf"
    if not tmp.exists():
        print(f"  {bid}: downloading", flush=True)
        download(book["pdf"], tmp)
    doc = pymupdf.open(tmp)
    t0 = time.time()
    n = 0
    for i in range(doc.page_count):
        pg = str(i + 1)
        if pg in state["pages"]:
            continue
        text = page_text(doc, i)
        if len(text) < 40 or not is_question_page(text):
            continue
        raw = ask_model(PROMPT.format(page=i + 1, text=text[:6000]))
        state["pages"][pg] = parse_items(raw)
        save_state(state)
        n += 1
        if n % 5 == 0:
            print(f"  {bid}: p{pg} ({n} pages, {round(time.time()-t0)}s)", flush=True)
        if time.time() - t0 > BUDGET:
            print(f"  {bid}: budget hit mid-book, saving partial", flush=True)
            doc.close()
            try:
                tmp.unlink()
            except OSError:
                pass
            return n
    state["done"] = True
    save_state(state)
    doc.close()
    try:
        tmp.unlink()
    except OSError:
        pass
    print(f"{bid}: DONE {len(state['pages'])} pages, {round(time.time()-t0)}s", flush=True)
    return n


def queue():
    def gorder(b):
        s = b.get("sinif") or ""
        return GRADE_ORDER.index(s) if s in GRADE_ORDER else 99
    books = [b for b in BOOKS if b.get("pdf")]
    books.sort(key=lambda b: (gorder(b), str(b.get("ders") or ""), b["id"]))
    return [b for b in books if not load_state(str(b["id"])).get("done")]


def main():
    start = time.time()
    q = queue()
    print(f"queue: {len(q)} books pending; budget {BUDGET//60} min", flush=True)
    done = 0
    for b in q:
        if time.time() - start > BUDGET:
            print("global budget reached, stopping", flush=True)
            break
        if MAX_BOOKS and done >= MAX_BOOKS:
            print(f"max books ({MAX_BOOKS}) reached", flush=True)
            break
        try:
            process_book(b)
        except Exception as e:
            print(f"{b['id']}: ERROR {e}", flush=True)
        done += 1
    print(f"run finished: {done} books processed", flush=True)


if __name__ == "__main__":
    main()
