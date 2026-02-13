"""
Build a simple BM25-compatible index from the `docs/` markdown tree.

This script walks `docs/`, extracts plain text from markdown, optionally
chunks long pages, and writes `site/wiki_index.json` (or gzipped) containing
an array of objects with at least `title`, `text`, and `path` (and `id`).

Usage:
  python build_bm25_index.py --output site/wiki_index.json --gzip

This is intended to be lightweight and run in CI or locally. It does NOT
produce embeddings — the Worker uses BM25 lexical retrieval over this index.
"""
from pathlib import Path
import argparse
import re
import json
import gzip


CHUNK_SIZE_WORDS = 400
CHUNK_OVERLAP_WORDS = 50


def split_into_h2_sections(text: str):
    """Split text by level-2 headings (lines starting with '## ').
    Returns list of (heading, content) where heading is the text after '## ' or
    None for content before the first H2.
    """
    lines = text.splitlines()
    sections = []
    cur_head = None
    cur_lines = []
    for line in lines:
        m = re.match(r'^##\s+(.*)', line)
        if m:
            if cur_lines:
                sections.append((cur_head, '\n'.join(cur_lines).strip()))
            cur_head = m.group(1).strip()
            cur_lines = []
        else:
            cur_lines.append(line)
    if cur_lines:
        sections.append((cur_head, '\n'.join(cur_lines).strip()))
    return sections


def find_repo_root(start: Path = None) -> Path:
    p = (start or Path(__file__)).resolve()
    for parent in [p] + list(p.parents):
        if (parent / 'mkdocs.yml').exists():
            return parent
    return Path(__file__).resolve().parents[1]


ROOT = find_repo_root()
DOCS = ROOT / 'docs'


def extract_text(md_path: Path) -> str:
    text = md_path.read_text(encoding='utf-8')
    # strip YAML frontmatter
    text = re.sub(r'^---[\s\S]*?---\s*', '', text)
    # remove images and links
    text = re.sub(r'!\[[^\]]*\]\([^\)]*\)', '', text)
    text = re.sub(r'\[[^\]]*\]\([^\)]*\)', '', text)
    # remove code fences
    text = re.sub(r'```[\s\S]*?```', '', text)
    # normalize newlines, preserve line breaks so we can detect H2 headings
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    # strip leading/trailing space on each line
    lines = [ln.strip() for ln in text.splitlines()]
    # collapse multiple blank lines
    out_lines = []
    prev_blank = False
    for ln in lines:
        if not ln:
            if not prev_blank:
                out_lines.append('')
            prev_blank = True
        else:
            out_lines.append(ln)
            prev_blank = False
    # join with single newlines and finally collapse remaining multiple spaces within lines
    text = '\n'.join(out_lines)
    text = '\n'.join(re.sub(r'\s{2,}', ' ', ln) for ln in text.splitlines())
    return text.strip()


def chunk_text_words(text: str, size: int = CHUNK_SIZE_WORDS, overlap: int = CHUNK_OVERLAP_WORDS):
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + size, len(words))
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        if end == len(words):
            break
        start = end - overlap
    return chunks


def walk_docs(chunk: bool = True, section_headings=None, chunk_size: int = CHUNK_SIZE_WORDS, overlap: int = CHUNK_OVERLAP_WORDS):
    items = []
    for p in sorted(DOCS.rglob('*.md')):
        rel = p.relative_to(DOCS)
        # skip hidden or dot folders
        if rel.parts and str(rel.parts[0]).startswith('.'):
            continue
        title = rel.stem
        text = extract_text(p)
        if not text:
            continue
        if rel == Path('index.md'):
            path = '/'
        else:
            parts = list(rel.with_suffix('').parts)
            path = '/' + '/'.join(['ultrabroken-documentation'] + parts) + '/'

        if chunk:
            # split into H2 sections and honor section_headings as whole chunks
            sections = split_into_h2_sections(text)
            if not sections:
                sections = [(None, text)]
            sec_index = 0
            for head, sec_text in sections:
                if not sec_text:
                    continue
                if section_headings and head and head.strip().lower() in section_headings:
                    items.append({'id': f"{rel}::section::{sec_index}", 'title': title, 'path': path, 'text': sec_text, 'section': head})
                else:
                    chunks = chunk_text_words(sec_text, size=chunk_size, overlap=overlap)
                    for i, c in enumerate(chunks):
                        items.append({'id': f"{rel}::section::{sec_index}", 'title': title, 'path': path, 'text': c, 'chunk_index': i, 'section': head})
                sec_index += 1
        else:
            items.append({'id': str(rel), 'title': title, 'path': path, 'text': text})
    return items


def build_index(output: str, gzip_output: bool = False, chunk: bool = True):
    # section_headings is a set of lowercased H2 headings to pack fully
    items = walk_docs(chunk=chunk)
    out = Path(output)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(items, ensure_ascii=False)
    if gzip_output:
        if not str(out).endswith('.gz'):
            out = Path(str(out) + '.gz')
        with gzip.open(out, 'wt', encoding='utf-8') as fh:
            fh.write(payload)
    else:
        out.write_text(payload, encoding='utf-8')
    print('WROTE', out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--output', '-o', default='site/wiki_index.json')
    p.add_argument('--gzip', action='store_true')
    p.add_argument('--no-chunk', dest='chunk', action='store_false', help='Do not chunk pages; emit one item per page')
    p.add_argument('--chunk-size', type=int, default=CHUNK_SIZE_WORDS, help='Words per chunk')
    p.add_argument('--overlap', type=int, default=CHUNK_OVERLAP_WORDS, help='Chunk overlap in words')
    p.add_argument('--section-headings', type=str, default='Summary,Instructions,Notes',
                   help='Comma-separated list of level-2 headings to emit as full sections')
    args = p.parse_args()
    sh = {s.strip().lower() for s in args.section_headings.split(',') if s.strip()}
    # pass section headings and chunk params through to walker
    items = walk_docs(chunk=args.chunk, section_headings=sh, chunk_size=args.chunk_size, overlap=args.overlap)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(items, ensure_ascii=False)
    if args.gzip:
        if not str(out).endswith('.gz'):
            out = Path(str(out) + '.gz')
        with gzip.open(out, 'wt', encoding='utf-8') as fh:
            fh.write(payload)
    else:
        out.write_text(payload, encoding='utf-8')
    print('WROTE', out)


if __name__ == '__main__':
    main()
