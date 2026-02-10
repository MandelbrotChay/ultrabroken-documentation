#!/usr/bin/env python3
"""Revert the version-line relocation performed by restructure_glitchcraft_versions.py.

This script finds a versions line placed after the Overview block and moves it
back to immediately after the H1 title (preserving a single separating blank
line). Use `--apply` to modify files; by default it's a dry-run.
"""
from pathlib import Path
import re
import argparse
import sys

VERSIONS_RE = re.compile(r"^(`[^`]+`(?:\s+`[^`]+`)*)\s*$")


def process_file(p: Path, dry_run=True):
    text = p.read_text(encoding='utf-8')
    lines = text.splitlines()

    # locate frontmatter end
    i = 0
    if lines and lines[0].strip() == '---':
        for j in range(1, len(lines)):
            if lines[j].strip() == '---':
                i = j + 1
                break
        else:
            return False, 'no-frontmatter-end'

    # locate H1
    h1_idx = None
    for j in range(i, len(lines)):
        if lines[j].lstrip().startswith('# '):
            h1_idx = j
            break
    if h1_idx is None:
        return False, 'no-h1'

    # find the first versions line after the H1 (anywhere)
    versions_idx = None
    for j in range(h1_idx + 1, len(lines)):
        if VERSIONS_RE.match(lines[j]):
            versions_idx = j
            break
    if versions_idx is None:
        return False, 'no-versions-found-after-h1'

    # If the versions line is already immediately after H1 (allowing one blank), skip
    # find the first non-empty line after H1
    next_idx = h1_idx + 1
    while next_idx < len(lines) and lines[next_idx].strip() == '':
        next_idx += 1
    if versions_idx == next_idx:
        return False, 'versions-already-after-h1'

    versions_line = lines[versions_idx]

    # Build new content using slices to avoid index-shift bugs
    before = lines[:h1_idx + 1]
    # Ensure single blank line after H1
    if not before or before[-1].strip() != '':
        before.append('')

    # everything between after H1 up to versions_idx (exclusive), then remainder after versions_idx
    after_h1 = lines[h1_idx + 1:versions_idx] + lines[versions_idx + 1:]

    # Insert versions immediately after H1
    new_lines = before + [versions_line, ''] + after_h1

    new_text = '\n'.join(new_lines) + ('\n' if text.endswith('\n') else '')

    if dry_run:
        return True, {'action': 'would-revert', 'file': str(p), 'versions': versions_line}
    else:
        p.write_text(new_text, encoding='utf-8')
        return True, {'action': 'reverted', 'file': str(p), 'versions': versions_line}


def main():
    ap = argparse.ArgumentParser(description='Revert version-line relocation')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('path', nargs='?', default='docs/glitchcraft')
    args = ap.parse_args()

    base = Path(args.path)
    if not base.exists() or not base.is_dir():
        print('Path not found or not a directory:', base, file=sys.stderr)
        sys.exit(2)

    files = sorted(base.glob('*.md'))
    acted = []
    skipped = []

    for f in files:
        ok, info = process_file(f, dry_run=not args.apply)
        if ok:
            acted.append(info)
            print(f"[OK] {info['action']}: {f.name} -> {info['versions']}")
        else:
            skipped.append((f.name, info))
            print(f"[SKIP] {f.name}: {info}")

    print('\nSummary:')
    print(f'  files considered: {len(files)}')
    print(f'  acted: {len(acted)}')
    print(f'  skipped: {len(skipped)}')


if __name__ == '__main__':
    main()
