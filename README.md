# Ultrabroken Docs — Editor Guide

This repository holds the Ultrabroken documentation written in Markdown and published with MkDocs + Material.

This README is focused on editors who will make content changes directly on GitHub. Editors typically do not need to run or build the site locally — just edit, commit, and open a pull request.

## How editors should contribute

- Use the GitHub web editor or your normal GitHub workflow to edit Markdown files in the `docs/` folder.
- Make small, focused commits and include a clear title/description for the change.
- When ready, open a pull request against `main` (or push directly if you have permission).
- Keep changes scoped to documentation content: avoid editing `mkdocs.yml` or CI workflows unless requested by maintainers.

Quick tips for the GitHub web editor:

1. Navigate to the file you want to change (for example `docs/effects/wacko-boingo.md`).
2. Click the pencil ✏️ icon to edit the file in your browser.
3. Make your edits, add a concise commit message, and commit directly to `main`.
4. Open a pull request if you used a different branch than main.

## Recommended editing conventions

- Write in present tense and keep instructions concise.
- Use clear section headings and include example commands or code where useful.
- Prefer relative links for cross-references inside the docs (e.g. `../effects/index.md`).
- For images, put files in `docs/assets/images/` and reference them with relative paths.

Additional editor conveniences
- Use editor-friendly search links: write Markdown links that start with `search:` to create an editor-only trigger for the site's search overlay. Example:

```markdown
[Slugging](search:Slugging)
```

    These links are intercepted client-side and open the Material theme search with the provided query instead of navigating away; they are safe to edit in GitHub and make finding related content easier.

- Level-2 section separators: to keep `##` sections visually consistent, place a horizontal rule immediately after the H2 heading by adding a line with three dashes on the next line:

```markdown
## Instructions
---
```

    The repository includes a small script that can add these `---` separators across `docs/glitchcraft` files automatically; editors can run or ask maintainers to run it if many files need updating.

## Markdown quick reference (expanded)

Headings:

```markdown
# H1
## H2
### H3
```

Emphasis:

```markdown
**bold**  
_italic_  
`inline code`
```

Code blocks (fenced):

```markdown
```bash
echo "example"
```
```

Links and images:

```markdown
[Link text](path/to/file.md)
![Alt text](assets/images/example.png)
```

Lists:

```markdown
- Unordered item
- Another item

1. First
2. Second
```

Blockquote:

```markdown
> This is a quote
```

Tables:

```markdown
| Column A | Column B |
|---|---|
| Value 1 | Value 2 |
```

Task lists (useful in PRs):

```markdown
- [ ] Open review
- [x] Addressed comments
```

Admonitions (supported by MkDocs Material):

```markdown
!!! note
    This is a helpful note.
```

## Navigation & where to edit

- Top-level docs live in `docs/`.
- Edit pages directly; to reorganize navigation, ask a maintainer to update `mkdocs.yml`.

## Community

This is a community project — everyone is welcome to contribute. Join discussions and get help:

- **[The Hyrule Engineering Club](https://discord.gg/uZqvjnwqF3)** — Vanilla and glitched constructions ad absurdum
- **[Zelda: Tears of the Kingdom Speedrunning](https://discord.gg/xM8NnTetb2)** — Primary spreadsheet curation and glitch hunting

---

Thanks for contributing — keep changes focused, documented, and easy to review.

