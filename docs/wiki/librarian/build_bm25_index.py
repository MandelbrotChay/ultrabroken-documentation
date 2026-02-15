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
    return Path(__file__).resolve().parents[1]


ROOT = find_repo_root()
DOCS = ROOT / 'docs'


def extract_text(md_path: Path) -> str:
    # read with utf-8-sig to remove any BOM present
    text = md_path.read_text(encoding='utf-8-sig')
    # strip YAML frontmatter
    text = re.sub(r'^---[\s\S]*?---\s*', '', text)
    # remove leading ATX headings (e.g. "# Title" or "## Subtitle") to keep excerpts clean
    text = re.sub(r'^[ \t]*#{1,6}\s+.*?\n', '', text)
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


def extract_title(md_path: Path) -> str:
    """Extract a human-friendly title for the page.

    Strategy (in order):
    1. YAML frontmatter `title` key (if present)
    2. First ATX H1 (`# Title`) or H2 (`## Title`)
    3. Setext-style H1/H2 (underlines with === or ---)
    4. Fallback to filename stem (caller can handle that)
    """
    try:
        raw = md_path.read_text(encoding='utf-8')
    except Exception:
        return None

    # 1) YAML frontmatter title
    m = re.match(r'^---[\s\S]*?---', raw)
    if m:
        fm = m.group(0)
        mm = re.search(r'^title:\s*(?:"([^"]+)"|\'([^\']+)\'|(.+))', fm, flags=re.IGNORECASE | re.MULTILINE)
        if mm:
            for g in mm.groups():
                if g:
                    return g.strip().strip('"').strip("'")

    # strip frontmatter for further searches
    body = re.sub(r'^---[\s\S]*?---\s*', '', raw)

    # 2) ATX headings: look for H1 then H2
    m = re.search(r'^[ \t]*#\s+(.+)$', body, flags=re.MULTILINE)
    if m:
        return m.group(1).strip()
    m = re.search(r'^[ \t]*##\s+(.+)$', body, flags=re.MULTILINE)
    if m:
        return m.group(1).strip()

    # 3) Setext-style headings (underlines)
    # find a line followed by a line of === or ---
    m = re.search(r'^(?P<title>.+?)\r?\n(?P<underline>[-=]{3,})\r?\n', body, flags=re.MULTILINE)
    if m:
        return m.group('title').strip()

    return None


def walk_docs(chunk: bool = True):
    items = []
    for p in sorted(DOCS.rglob('*.md')):
        rel = p.relative_to(DOCS)
        # skip hidden or dot folders
        if rel.parts and str(rel.parts[0]).startswith('.'):
            continue
        # prefer an extracted title (YAML frontmatter, H1/H2, Setext), fall back to filename stem
        title = extract_title(p) or rel.stem
        full_text = extract_text(p)
        text = full_text
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
    p.add_argument('--docs-dir', default='docs', help='Path under the repo root to read markdown from (e.g. docs/wiki)')
    args = p.parse_args()
    # allow overriding which docs subtree to index (default 'docs')
    global DOCS
    DOCS = ROOT / args.docs_dir
    build_index(args.output, gzip_output=args.gzip, chunk=args.chunk)


if __name__ == '__main__':
    main()
