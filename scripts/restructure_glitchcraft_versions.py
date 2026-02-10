#!/usr/bin/env python3
"""Move version-line from after H1 into the body just after the Overview paragraph.

Usage:
  python scripts/restructure_glitchcraft_versions.py [--apply] [path]

By default the script does a dry-run and prints the planned edits. Use
`--apply` to write changes. `path` defaults to `docs/glitchcraft`.
"""
from pathlib import Path
import re
import argparse
import sys


VERSIONS_RE = re.compile(r"^(`[^`]+`(?:\s+`[^`]+`)*)\s*$")


def process_file(p: Path, dry_run=True):
    text = p.read_text(encoding="utf-8")
    lines = text.splitlines()

    # find end of YAML frontmatter (if any)
    i = 0
    if len(lines) >= 1 and lines[0].strip() == '---':
        # find closing ---
        for j in range(1, len(lines)):
            if lines[j].strip() == '---':
                i = j + 1
                break
        else:
            # no closing frontmatter; nothing to do
            return False, 'no-frontmatter-end'

    # find H1
    h1_idx = None
    for j in range(i, len(lines)):
        if lines[j].lstrip().startswith('# '):
            h1_idx = j
            break
    if h1_idx is None:
        return False, 'no-h1'

    # find the first versions line after H1 (anywhere)
    versions_idx = None
    for j in range(h1_idx + 1, len(lines)):
        if VERSIONS_RE.match(lines[j]):
            versions_idx = j
            break
    if versions_idx is None:
        return False, 'no-versions-after-h1'

    versions_line = lines[versions_idx]

    # Create a temporary copy with the versions line removed to avoid index-shift
    temp_lines = list(lines)
    del temp_lines[versions_idx]

    # find Overview heading in temp_lines
    overview_idx = None
    for j in range(h1_idx + 1, len(temp_lines)):
        if temp_lines[j].lstrip().startswith('## Overview'):
            overview_idx = j
            break
    if overview_idx is None:
        return False, 'no-overview'

    # define overview block end in temp_lines
    end_idx = overview_idx + 1
    while end_idx < len(temp_lines) and not temp_lines[end_idx].lstrip().startswith('## '):
        end_idx += 1

    # if versions line already present in overview block, skip
    for j in range(overview_idx + 1, end_idx):
        if VERSIONS_RE.match(temp_lines[j]):
            return False, 'versions-already-in-overview'

    # Insert versions_line at end_idx
    insert_at = end_idx
    if insert_at > 0 and temp_lines[insert_at - 1].strip() != '':
        temp_lines.insert(insert_at, '')
        insert_at += 1
    temp_lines.insert(insert_at, versions_line)
    insert_at += 1
    if insert_at < len(temp_lines) and temp_lines[insert_at].strip() != '':
        temp_lines.insert(insert_at, '')

    new_text = '\n'.join(temp_lines) + ('\n' if text.endswith('\n') else '')

    if dry_run:
        return True, {'action': 'would-move', 'file': str(p), 'versions': versions_line}
    else:
        p.write_text(new_text, encoding='utf-8')
        return True, {'action': 'moved', 'file': str(p), 'versions': versions_line}


def main():
    ap = argparse.ArgumentParser(description='Move version-line from after H1 into Overview block')
    ap.add_argument('--apply', action='store_true', help='Apply changes instead of dry-run')
    ap.add_argument('path', nargs='?', default='docs/glitchcraft', help='Path to glitchcraft directory')
    args = ap.parse_args()

    base = Path(args.path)
    if not base.exists() or not base.is_dir():
        print(f'Path not found or not a directory: {base}', file=sys.stderr)
        sys.exit(2)

    files = sorted(base.glob('*.md'))
    moved = []
    skipped = []

    for f in files:
        ok, info = process_file(f, dry_run=not args.apply)
        if ok:
            moved.append(info)
            print(f"[OK] {info['action']}: {f.name} -> {info['versions']}")
        else:
            skipped.append((f.name, info))
            print(f"[SKIP] {f.name}: {info}")

    print('\nSummary:')
    print(f'  files considered: {len(files)}')
    print(f'  moved/apparent moves: {len(moved)}')
    print(f'  skipped: {len(skipped)}')


if __name__ == '__main__':
    main()
