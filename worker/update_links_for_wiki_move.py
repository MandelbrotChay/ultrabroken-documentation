#!/usr/bin/env python3
"""
Update markdown links after moving top-level doc folders into `docs/wiki/`.

This script adjusts absolute links that point at top-level doc folders so they
include the additional `wiki/` path segment. It is safe to run after you move
folders (docs/glitchcraft -> docs/wiki/glitchcraft etc.).

It updates two kinds of targets inside Markdown files:
 - inline links/images:  [text](<url>) or ![alt](<url>)
 - reference-style definitions: [id]: <url>

Usage examples:
  # dry-run, show changes but don't write
  python update_links_for_wiki_move.py --root ../.. --dry-run

  # apply changes in-place and create backups with .bak suffix
  python update_links_for_wiki_move.py --root ../.. --apply --backup

By default it processes these folders (you can override):
  glitchcraft, desync, entanglement, oob, mnf, overload, ultrabroken, zuggling, void

"""
from pathlib import Path
import re
import argparse
import sys
import shutil

DEFAULT_DIRS = [
    'zuggling', 'void', 'ultrabroken', 'overload', 'oob', 'mnf',
    'glitchcraft', 'entanglement', 'desync'
]

INLINE_LINK_RE = re.compile(r'(!?\[[^\]]*\]\()(?P<url>[^)]+)(\))')
REF_DEF_RE = re.compile(r'^(?P<prefix>\s*\[[^\]]+\]:\s*)(?P<url>\S+)(?P<suffix>\s*)$', re.MULTILINE)


def adjust_url(url: str, dirs):
    # Only adjust site-root absolute paths like: /glitchcraft/... or /project/glitchcraft/...
    # Leave http(s):, mailto:, anchor-only (#...), relative paths (./, ../, no leading /) alone.
    if not url or not url.startswith('/'):
        return url
    if url.startswith('//'):
        return url
    if re.match(r'^/[^\s]*://', url):
        return url

    # separate path from query/fragment
    path = url
    query = ''
    frag = ''
    if '#' in path:
        path, frag = path.split('#', 1)
        frag = '#' + frag
    if '?' in path:
        path, query = path.split('?', 1)
        query = '?' + query

    parts = [p for p in path.split('/') if p != '']  # drop empty leading
    if not parts:
        return url

    # if first segment is one of the dirs -> insert 'wiki' before it
    if parts[0] in dirs:
        new_parts = ['wiki'] + parts
        new_path = '/' + '/'.join(new_parts)
        return new_path + query + frag

    # if first segment is a project/site base (unknown) and second is in dirs -> insert wiki between
    if len(parts) >= 2 and parts[1] in dirs:
        new_parts = [parts[0], 'wiki'] + parts[1:]
        new_path = '/' + '/'.join(new_parts)
        return new_path + query + frag

    return url


def process_text(text: str, dirs, changed_files_report=None):
    changed = False

    def repl_inline(m):
        nonlocal changed
        before, url, after = m.group(1), m.group('url'), m.group(3)
        new_url = adjust_url(url, dirs)
        if new_url != url:
            changed = True
            return before + new_url + after
        return m.group(0)

    new_text = INLINE_LINK_RE.sub(repl_inline, text)

    def repl_ref(m):
        nonlocal changed
        prefix, url, suffix = m.group('prefix'), m.group('url'), m.group('suffix')
        new_url = adjust_url(url, dirs)
        if new_url != url:
            changed = True
            return prefix + new_url + suffix
        return m.group(0)

    new_text = REF_DEF_RE.sub(repl_ref, new_text)

    return new_text, changed


def process_files(root: Path, dirs, apply=False, backup=False, verbose=False):
    md_files = list(root.rglob('*.md'))
    total = 0
    modified = 0
    for p in md_files:
        total += 1
        text = p.read_text(encoding='utf-8')
        new_text, changed = process_text(text, dirs)
        if changed:
            modified += 1
            print(f"MODIFIED: {p}")
            if apply:
                if backup:
                    bak = p.with_suffix(p.suffix + '.bak')
                    shutil.copy2(p, bak)
                p.write_text(new_text, encoding='utf-8')
    print(f"Processed {total} files, modified {modified} files.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', '-r', default='..', help='Path to repository root or docs directory (default: ..)')
    parser.add_argument('--dirs', '-d', help='Comma-separated list of top-level doc dirs to insert wiki/ for', default=','.join(DEFAULT_DIRS))
    parser.add_argument('--apply', action='store_true', help='Apply changes in-place')
    parser.add_argument('--backup', action='store_true', help='Create .bak backups when applying')
    parser.add_argument('--dry-run', action='store_true', help='Alias for --root + show changes without writing')
    parser.add_argument('--verbose', '-v', action='store_true')
    args = parser.parse_args()

    # normalize root
    root = Path(args.root).resolve()
    if (root / 'mkdocs.yml').exists():
        docs_root = root / 'docs'
    elif (root / 'docs').exists():
        docs_root = root / 'docs'
    else:
        # if user passed docs/ explicitly
        docs_root = root

    dirs = [d.strip() for d in args.dirs.split(',') if d.strip()]

    if args.dry_run:
        args.apply = False

    print(f"Scanning markdown under: {docs_root}")
    print(f"Target dirs: {dirs}")
    print(f"Apply changes: {args.apply}, Backup: {args.backup}")

    process_files(docs_root, dirs, apply=args.apply, backup=args.backup, verbose=args.verbose)
