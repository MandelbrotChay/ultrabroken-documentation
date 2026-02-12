"""
Generate `wiki_index.json` for RAG.

Produces an array of { id, title, path, text, embedding }

If an embedding provider is configured via environment variables, embeddings will be computed.
Otherwise `embedding` will be null. This script is intentionally provider-agnostic and documents where to plug in.
"""
import os
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'

def extract_text(md_path):
    txt = md_path.read_text(encoding='utf-8')
    # remove YAML frontmatter
    txt = re.sub(r"^---[\s\S]*?---\s*", '', txt)
    # remove markdown links/images
    txt = re.sub(r"!\[[^\]]*\]\([^\)]*\)", '', txt)
    txt = re.sub(r"\[[^\]]*\]\([^\)]*\)", '', txt)
    return txt.strip()

def walk_docs():
    items = []
    for p in DOCS.rglob('*.md'):
        rel = p.relative_to(DOCS)
        if rel.parts[0].startswith('.'):
            continue
        title = rel.stem
        text = extract_text(p)
        path = '/' + '/'.join(['ultrabroken-documentation', str(rel.with_suffix(''))]) + '/' if str(rel) != 'index.md' else '/ultrabroken-documentation/'
        items.append({'id': str(rel), 'title': title, 'path': path, 'text': text, 'embedding': None})
    return items

def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--output', '-o', default='wiki_index.json')
    p.add_argument('--no-embeddings', action='store_true')
    args = p.parse_args()

    items = walk_docs()

    # Placeholder: if EMBEDDING_PROVIDER env var present, compute embeddings here.
    # e.g. use OpenAI, Hugging Face, or Cloudflare AI. For now we write embedding:null
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
    print('WROTE', out)

if __name__ == '__main__':
    main()
