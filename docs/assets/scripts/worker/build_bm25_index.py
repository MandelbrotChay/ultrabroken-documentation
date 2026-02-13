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


def find_repo_root(start: Path = None) -> Path:
    p = (start or Path(__file__)).resolve()
    for parent in [p] + list(p.parents):
        if (parent / 'mkdocs.yml').exists():
            return parent
    return Path(__file__).resolve().parents[3]


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
    # collapse multiple whitespace
    text = re.sub(r'\s+', ' ', text)
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


def walk_docs(chunk: bool = True):
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
            chunks = chunk_text_words(text)
            for i, c in enumerate(chunks):
                items.append({'id': str(rel), 'title': title, 'path': path, 'text': c, 'chunk_index': i})
        else:
            items.append({'id': str(rel), 'title': title, 'path': path, 'text': text})
    return items


def build_index(output: str, gzip_output: bool = False, chunk: bool = True):
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
    args = p.parse_args()
    build_index(args.output, gzip_output=args.gzip, chunk=args.chunk)


if __name__ == '__main__':
    main()
