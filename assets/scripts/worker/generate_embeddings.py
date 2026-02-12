"""
Generate `wiki_index.json` for RAG using a local sentence-transformers model.

This script walks the `docs/` markdown, extracts text, chunks long pages,
and computes embeddings with a SentenceTransformer model. It is intended
to run in CI (or locally) so you do not incur per-request API costs.

Usage:
  python scripts/generate_embeddings.py --output site/wiki_index.json

Requirements (recommended):
  pip install sentence-transformers numpy beautifulsoup4 tqdm

Notes:
  - The default model is `all-MiniLM-L6-v2` (change with --model).
  - This runs on CPU in typical CI; it's slower but avoids paid APIs.
"""

import argparse
import json
import re
import os
from pathlib import Path
from bs4 import BeautifulSoup
import gzip
from sentence_transformers import SentenceTransformer
from tqdm import tqdm


def find_repo_root(start: Path = None) -> Path:
    p = (start or Path(__file__)).resolve()
    for parent in [p] + list(p.parents):
        if (parent / 'mkdocs.yml').exists():
            return parent
    return Path(__file__).resolve().parents[3]


ROOT = find_repo_root()
DOCS = ROOT / 'docs'


def extract_text(md_path: Path) -> str:
    txt = md_path.read_text(encoding='utf-8')
    txt = re.sub(r"^---[\s\S]*?---\s*", '', txt)
    txt = re.sub(r"!\[[^\]]*\]\([^\)]*\)", '', txt)
    txt = re.sub(r"\[[^\]]*\]\([^\)]*\)", '', txt)
    return txt.strip()


CHUNK_SIZE_WORDS = 400
CHUNK_OVERLAP_WORDS = 50


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


def walk_docs():
    items = []
    for p in DOCS.rglob('*.md'):
        rel = p.relative_to(DOCS)
        if rel.parts and str(rel.parts[0]).startswith('.'):
            continue
        title = rel.stem
        text = extract_text(p)
        if not text:
            continue
        if rel == Path('index.md'):
            path = '/ultrabroken-documentation/'
        else:
            parts = list(rel.with_suffix('').parts)
            path = '/' + '/'.join(['ultrabroken-documentation'] + parts) + '/'
        items.append({'id': str(rel), 'title': title, 'path': path, 'text': text})
    return items


def build_index(output: str, model_name: str, gzip_output: bool = False):
    items = walk_docs()
    model = SentenceTransformer(model_name)

    index = []
    for item in tqdm(items, desc='Docs'):
        text = item['text']
        chunks = chunk_text_words(text)
        if not chunks:
            continue
        embeddings = model.encode(chunks, normalize_embeddings=True)
        for i, chunk in enumerate(chunks):
            emb = embeddings[i].astype(float).tolist()
            index.append({
                'text': chunk,
                'title': item['title'],
                'url': item['path'],
                'source_id': item['id'],
                'chunk_index': i,
                'embedding': emb
            })

    out = Path(output)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(index, ensure_ascii=False)
    if gzip_output:
        # if user passed a filename without .gz, append .gz
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
    p.add_argument('--model', default='all-MiniLM-L6-v2')
    p.add_argument('--gzip', action='store_true', help='Write gzipped output (appends .gz if needed)')
    args = p.parse_args()
    build_index(args.output, args.model, gzip_output=args.gzip)


if __name__ == '__main__':
    main()
