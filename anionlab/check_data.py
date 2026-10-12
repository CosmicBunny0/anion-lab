"""Reaction data is frozen: the anion-data JSON of <new.html> must deep-equal <baseline.html>.

Usage:  python3 anionlab/check_data.py <baseline.html> <new.html>
Exits non-zero unless both pages hold exactly one anion-data block and every top-level key
(rows, colors, groups, anions, corrections, compare, explain) is deep-equal, list order included.
"""
import json
import re
import sys
from pathlib import Path

KEYS = ("rows", "colors", "groups", "anions", "corrections", "compare", "explain")
BLOCK = re.compile(r'<script id="anion-data" type="application/json">(.*?)</script>', re.S)


def load(path):
    text = Path(path).read_text(encoding="utf-8")
    blocks = BLOCK.findall(text)
    if len(blocks) != 1:
        sys.exit(f"FAIL: {path} has {len(blocks)} anion-data blocks (expected 1)")
    return json.loads(blocks[0])


def first_diff(a, b, where):
    if type(a) is not type(b):
        return f"{where}: type {type(a).__name__} != {type(b).__name__}"
    if isinstance(a, dict):
        if set(a) != set(b):
            return f"{where}: keys differ, only in baseline {sorted(set(a) - set(b))}, only in new {sorted(set(b) - set(a))}"
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
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    if len(sys.argv) != 3:
        sys.exit("usage: check_data.py <baseline.html> <new.html>")
    base, new = load(sys.argv[1]), load(sys.argv[2])
    bad = 0
    for k in KEYS:
        if k not in base or k not in new:
            print(f"FAIL {k}: missing in {'baseline' if k not in base else 'new'}")
            bad += 1
            continue
        d = first_diff(base[k], new[k], k)
        if d:
            print(f"FAIL {d}")
            bad += 1
        else:
            size = len(base[k]) if isinstance(base[k], (list, dict)) else 1
            print(f"ok   {k} ({size})")
    extra = sorted(set(base) ^ set(new))
    if extra:
        print(f"FAIL top-level keys differ: {extra}")
        bad += 1
    if bad:
        sys.exit(1)
    print("PASS: reaction data unchanged")


if __name__ == "__main__":
    main()
