---
description: QA an imported Figma deck for frame sizes, wrapper drift, and visual fidelity. Usage: /html-flides:qa <figma-file-url>
---

# QA Imported Deck

Verify a Figma Design file produced by the HTML import workflow.

## Inputs

- `$ARGUMENTS` must contain the Figma file URL.

## Workflow

1. If no URL provided, ask for the imported Figma file URL and stop.
2. Extract `fileKey` from the URL.
3. Call `get_metadata` on the root of the file to enumerate top-level frame nodes.
4. For each top-level frame:
   - Record node ID, name, width, height.
   - If width or height differs from 1920x1080, flag as drift.
   - If drifted, check for an immediate child frame at 1920x1080 (wrapper drift pattern).
5. Call `get_screenshot` on the first, middle, and last slides. Display inline.
6. Sample 2-3 slides via `get_metadata` and check for font family names in text nodes.
7. Print report:

```
html-flides QA — <N> slides imported

| Slide | Node    | Size      | Status |
|-------|---------|-----------|--------|
| 0     | 156:2   | 1920x1080 | ok     |
| ...   | ...     | ...       | ...    |

Fonts found: <list>
Wrapper drift: <none or details>

[screenshots]
```
