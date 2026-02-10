#!/usr/bin/env python3
"""
Generate and append an abbreviation for H1 titles if missing.

For a title like "Mineru PSLOT" the script will produce the abbreviation
`MPSLOT` and append it to the H1 as: `# Mineru PSLOT `MPSLOT``.

Rules:
- For each word in the title:
  - If the word is all-uppercase and length > 1, include the whole word.
  - Otherwise include the first character (uppercased).
- Concatenate parts without separators.

Usage:
  python resources/scripts/add_title_abbrev.py --glob "docs/glitchcraft/*.md" [--apply]

Dry-run (default) prints unified diffs; use `--apply` to update files and create `.bak` backups.
"""

from __future__ import annotations

import argparse
import difflib
import glob
import re
from typing import List, Optional, Tuple


def find_frontmatter_end(lines: List[str]) -> int:
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return i + 1
    return 0


def find_h1_line(lines: List[str]) -> Optional[int]:
    fm_end = find_frontmatter_end(lines)
    for i in range(fm_end, len(lines)):
        if re.match(r'^#\s+', lines[i]):
            return i
    return None


def has_abbrev(h1: str) -> bool:
    # checks for a trailing backticked token e.g. # Title `ABC`
    return bool(re.search(r'`[^`]+`\s*$', h1))


def make_abbrev(title: str) -> str:
    parts = re.split(r'\s+', title.strip())
    tokens: List[str] = []
    cleans: List[str] = []
    for p in parts:
        clean = re.sub(r'[^A-Za-z0-9]', '', p)
        if clean:
            cleans.append(clean)

    for clean in cleans:
        # prefer full uppercase words (e.g. "PSLOT")
        if clean.isupper() and len(clean) > 1:
            tokens.append(clean)
            continue

        # look for an uppercase run of 2+ letters inside the word (e.g. "UltraSLOT")
        runs = re.findall(r'[A-Z]{2,}', clean)
        if runs:
            # if this is the first token, make abbreviation like U + SLOT => USLOT
            if not tokens:
                tokens.append(clean[0].upper() + runs[0])
            else:
                tokens.append(runs[0])
            continue

        # fallback: first letter
        tokens.append(clean[0].upper())

    abbrev = ''.join(tokens)

    # ensure abbreviation is at least 2 characters; if too short, try to extend
    if len(abbrev) < 2 and cleans:
        first = cleans[0]
        # prefer appending an uppercase run if present
        runs = re.findall(r'[A-Z]{2,}', first)
        if runs:
            abbrev = (abbrev + runs[0])[:]
        elif len(first) >= 2:
            abbrev = (abbrev + first[1].upper())

    return abbrev


def process_content(text: str) -> Tuple[str, bool]:
    lines = text.splitlines()
    h1_idx = find_h1_line(lines)
    if h1_idx is None:
        return text, False

    h1 = lines[h1_idx]
    if has_abbrev(h1):
        return text, False

    # extract the title text after '# '
    m = re.match(r'^#\s+(.*)$', h1)
    if not m:
        return text, False
    title_text = m.group(1).strip()
    # if there's already inline code elsewhere, strip it before computing
    title_text = re.sub(r'`[^`]+`', '', title_text).strip()
    abbrev = make_abbrev(title_text)
    if not abbrev:
        return text, False

    new_h1 = h1.rstrip() + ' `' + abbrev + '`'
    lines[h1_idx] = new_h1
    new_text = '\n'.join(lines) + '\n'
    return new_text, True


def unified_diff(old: str, new: str, path: str) -> str:
    old_lines = old.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)
    return ''.join(difflib.unified_diff(old_lines, new_lines, fromfile=path, tofile=path + '.new'))


def process_file(path: str, apply: bool) -> Tuple[bool, Optional[str]]:
    with open(path, 'r', encoding='utf-8') as f:
        old = f.read()
    new, changed = process_content(old)
    if not changed:
        return False, None
    if apply:
        with open(path + '.bak', 'w', encoding='utf-8') as b:
            b.write(old)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new)
        return True, None
    else:
        return True, unified_diff(old, new, path)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--glob', required=True)
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()

    files = sorted(glob.glob(args.glob, recursive=True))
    total = 0
    changed = 0
    for path in files:
        total += 1
        ok, diff_or_none = process_file(path, apply=args.apply)
        if ok:
            changed += 1
            if args.apply:
                print(f'Applied: {path} (backup: {path}.bak)')
            else:
                print('--- ' + path)
                if diff_or_none:
                    print(diff_or_none)
    print(f'Processed {total} files, {changed} would be/was changed.')


if __name__ == '__main__':
    main()
