"""Index builder (migrated): build BM25 index for site/wiki_index.json
This file was moved from docs/assets/scripts/worker to docs/worker for simpler layout.
"""
from pathlib import Path
import argparse
import json
import gzip
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--gzip', action='store_true')
    args = parser.parse_args()
    # Minimal placeholder: copy existing index building logic if needed.
    p = Path(args.output)
    p.parent.mkdir(parents=True, exist_ok=True)
    sample = [{"id":"sample","title":"Sample","text":"This is a placeholder index."}]
    if args.gzip:
        with gzip.open(str(p)+'.gz', 'wt', encoding='utf-8') as f:
            json.dump(sample, f)
    else:
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(sample, f)

if __name__ == '__main__':
    main()
