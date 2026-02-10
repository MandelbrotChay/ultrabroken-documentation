#!/usr/bin/env python3
"""
Scan markdown files, extract H1 titles, compute abbreviations and emit JSONL.

Writes one JSON object per line with fields: file, title, abbrev

Usage:
  python resources/scripts/export_title_abbrevs.py --glob "docs/glitchcraft/*.md" --out docs/reports/title_abbrevs.jsonl

"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
from typing import List, Optional


def find_frontmatter_end(lines: List[str]) -> int:
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return i + 1
    return 0


def find_h1_line(lines: List[str]) -> Optional[str]:
    fm_end = find_frontmatter_end(lines)
    for i in range(fm_end, len(lines)):
        m = re.match(r'^#\s+(.*)$', lines[i])
        if m:
            return m.group(1).strip()
    return None


def make_abbrev(title: str) -> str:
    parts = re.split(r'\s+', title.strip())
    tokens: List[str] = []
    cleans: List[str] = []
    for p in parts:
        clean = re.sub(r'[^A-Za-z0-9]', '', p)
        if clean:
            cleans.append(clean)

    for clean in cleans:
        if clean.isupper() and len(clean) > 1:
            tokens.append(clean)
            continue

        runs = re.findall(r'[A-Z]{2,}', clean)
        if runs:
            if not tokens:
                tokens.append(clean[0].upper() + runs[0])
            else:
                tokens.append(runs[0])
            continue

        tokens.append(clean[0].upper())

    abbrev = ''.join(tokens)

    if len(abbrev) < 2 and cleans:
        first = cleans[0]
        runs = re.findall(r'[A-Z]{2,}', first)
        if runs:
            abbrev = (abbrev + runs[0])[:]
        elif len(first) >= 2:
            abbrev = (abbrev + first[1].upper())

    return abbrev


def process_file(path: str) -> Optional[dict]:
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.read().splitlines()
    h1 = find_h1_line(lines)
    if not h1:
        return None
    # if an existing backticked abbrev is present (trailing), preserve it
    m = re.search(r'\s*`([^`]+)`\s*$', h1)
    if m:
        abbrev = m.group(1).strip()
        title_text = re.sub(r'\s*`[^`]+`\s*$', '', h1).strip()
    else:
        # remove any inline code elsewhere before computing
        title_text = re.sub(r'`[^`]+`', '', h1).strip()
        abbrev = make_abbrev(title_text)
    return {"file": os.path.relpath(path).replace('\\', '/'), "title": title_text, "abbrev": abbrev}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--glob', required=True)
    p.add_argument('--out', default='docs/reports/title_abbrevs.jsonl')
    args = p.parse_args()

    files = sorted(glob.glob(args.glob, recursive=True))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as out:
        for path in files:
            res = process_file(path)
            if res:
                out.write(json.dumps(res, ensure_ascii=False) + '\n')

    print(f'Wrote {args.out} ({len(files)} scanned)')


if __name__ == '__main__':
    main()
