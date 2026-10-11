"""Reaction data must not change: compare the `anion-data` JSON of a page against original.html.

Usage:  uv run --no-project python -I check_data.py <page.html> [<reference.html>]
Exits 1 if `rows` or `colors` differ in any way (deep equality, order included).
"""
import json
import re
import sys
from pathlib import Path

BLOCK = re.compile(r'<script id="anion-data" type="application/json">(.*?)</script>', re.S)


def load(path):
    text = Path(path).read_text(encoding="utf-8")
    m = BLOCK.search(text)
    if not m:
        sys.exit(f"FAIL: no anion-data block in {path}")
    return json.loads(m.group(1))


def first_diff(a, b, where="$"):
    if type(a) is not type(b):
        return f"{where}: type {type(a).__name__} != {type(b).__name__}"
    if isinstance(a, dict):
        if list(a.keys()) != list(b.keys()):
            return f"{where}: keys {list(a.keys())} != {list(b.keys())}"
        for k in a:
            d = first_diff(a[k], b[k], f"{where}.{k}")
            if d:
                return d
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{where}: length {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            d = first_diff(x, y, f"{where}[{i}]")
            if d:
                return d
        return None
    return None if a == b else f"{where}: {a!r} != {b!r}"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    page, ref = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "original.html")
    new, old = load(page), load(ref)
    problems = [d for key in ("rows", "colors") if (d := first_diff(old.get(key), new.get(key), key))]
    if problems:
        print("FAIL: reaction data changed")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print(f"PASS: rows ({len(new['rows'])}) and colors ({len(new['colors'])}) identical to {ref}")


if __name__ == "__main__":
    main()
