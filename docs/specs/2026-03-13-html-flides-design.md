# html-flides Design Spec

**Date:** 2026-03-13
**Status:** Approved
**Repo:** github.com/nguyemm7/html-flides

## Purpose

A Claude Code plugin that reliably imports multi-slide HTML decks into Figma Design as individual editable 1920x1080 frames, using the Figma MCP capture pipeline. Works with any HTML slide deck — not just a specific template.

Compatible with both Claude Code (CLI) and Claude Cowork (marketplace).

**Target audience:** Anyone who generates HTML slides with Claude Code, Reveal.js, Marp, Remark, or any custom HTML deck generator, and wants editable frames in Figma.

## Background & Lessons Learned

This design is based on a hands-on session importing a 12-slide Zoom business case deck into Figma. Three attempts failed before a working approach was found. The failures and their root causes directly informed every design decision below.

### Failure 1: Single-page capture got only 1 of 12 slides
- **What happened:** Captured the full page. Only the `.active` slide was visible; the other 11 had `opacity: 0; position: absolute`.
- **Root cause:** The Figma capture script captures the visible DOM. Hidden slides are invisible to it.
- **Fix:** Capture one slide at a time using a URL parameter (`?slide=N`) that isolates the target slide.

### Failure 2: Wrong frame size (not 1920x1080)
- **What happened:** The captured frame inherited the browser's window size, not 1920x1080.
- **Root cause:** No CSS constraint forced the document to 1920x1080. The capture script reads computed styles from the DOM.
- **Fix:** Inject CSS that forces `html`, `body`, deck container, and the target slide to exactly 1920x1080.

### Failure 3: Tried Playwright when it wasn't needed
- **What happened:** Attempted to use Playwright to control the viewport. User correctly pushed back.
- **Root cause:** Misunderstanding the capture pipeline. The Figma capture.js reads DOM layout/computed styles, so CSS-forced dimensions are sufficient.
- **Fix:** Use the Figma MCP's native approach — inject capture script, open URL in browser, let the script handle submission.

### Failure 4: CSS opacity toggle left all slides in DOM
- **What happened:** The existing plugin's capture mode kept all slides in DOM and toggled opacity. This could cause layout interference.
- **Root cause:** Hidden slides (even with `opacity: 0`) still occupy DOM space and can affect rendering.
- **Fix:** Remove non-target slides from DOM entirely, not just hide them.

### What worked (the happy path)
1. Add a `?slide=N` parameter handler to the HTML
2. When triggered: kill all animations/transitions, remove all slides from DOM except target, force 1920x1080 dimensions, remove nav/toolbar/progress
3. Inject the Figma capture script
4. For each slide: generate a capture ID, open the URL with hash params, poll until complete
5. Verify via Figma MCP metadata that frames are 1920x1080

**Key insight:** All failures occurred at the preparation stage. Once clean HTML reached the Figma capture pipeline, every capture succeeded on the first try. This design front-loads validation into preparation.

## Architecture

```
User's HTML deck + slide selector
       ↓
  prepare()        ← transforms into capture-safe HTML
       ↓
  selfTest()       ← imports captureMode() directly, runs against linkedom DOM
       ↓
  serve()          ← local static server on port 4173
       ↓
  import loop      ← for each slide: generate captureId → open URL → poll → auto-close tab → next
       ↓
  qa()             ← verify frame metadata + screenshots in Figma via MCP
```

## Slide Selector: Supporting Any HTML Deck

Different deck generators use different HTML structures. Rather than auto-detecting (fragile), the user specifies a CSS selector that identifies slide elements.

**Default:** `[data-slide]` (matches Claude-generated decks from enterpret-slides and similar)

**Override via argument:** `--selector 'section.slide'`

**Examples for common formats:**

| Deck format | Selector |
|-------------|----------|
| Claude/enterpret-slides | `[data-slide]` (default) |
| Reveal.js | `.reveal .slides > section` |
| Remark | `.remark-slide-container` |
| Marp | `section` |
| Custom | User provides |

The selector is used consistently across all components:
- `prepare()` — detection and DOM removal
- `captureMode()` — runtime slide isolation
- `selfTest()` — validation assertions

**Slide indexing:** Slides are indexed by DOM order (0-based), not by attribute values. The selector finds all matching elements, and `?slide=N` refers to the Nth element in DOM order. This avoids issues with non-sequential or non-numeric `data-slide` values.

## Component 1: `prepare(sourcePath, options)`

**Input:** Absolute path to any HTML slide deck, plus options `{ selector }`.
**Output:** Capture-safe HTML written to `plugin/runtime/imports/<slug>.html`, plus metadata JSON.

### Transformation steps (in order)

1. **Read source HTML**
2. **Detect slides** — find all elements matching `selector` (default: `[data-slide]`). Count them by DOM order. If none found, abort with error: `"No slides detected with selector '<selector>'. Try a different --selector value."`
3. **Inject animation kill CSS:**
   ```css
   *, *::before, *::after {
     transition: none !important;
     animation: none !important;
     animation-delay: 0s !important;
   }
   ```
4. **Strip Content-Security-Policy** — remove any `<meta http-equiv="Content-Security-Policy">` tags that could block the Figma capture script from loading cross-origin
5. **Inject capture mode** — inserts a `<script>` tag that imports and calls `captureMode()` (see Component 1a below). The injected script reads `?slide=N` from the URL and the selector from a data attribute on the script tag itself: `<script data-slide-selector="<selector>" src="...">`.
6. **Inject auto-close** — after the Figma capture script submits, close the browser tab:
   ```js
   // Auto-close tab 2s after capture submits
   const _origFetch = window.fetch;
   window.fetch = function(...args) {
     const result = _origFetch.apply(this, args);
     if (args[0] && String(args[0]).includes('/submit')) {
       setTimeout(() => window.close(), 2000);
     }
     return result;
   };
   ```
7. **Inject Figma capture script:**
   ```html
   <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
   ```
8. **Write to `plugin/runtime/imports/<slug>.html`**
9. **Return metadata:**
   ```json
   { "outputPath": "...", "relativeUrl": "/imports/<slug>.html", "slideCount": 12, "selector": "[data-slide]" }
   ```

### Idempotency
If the source HTML already contains the capture mode block (detected by a marker comment `/* html-flides capture mode */`), skip injection to avoid duplication.

## Component 1a: `captureMode(document, slideIndex, selector)` — shared module

**This is the core isolation logic, extracted into a standalone function** so both the browser and selfTest can use it directly. No regex extraction, no eval of inline scripts.

**File:** `plugin/scripts/capture-mode.mjs`

```js
export function captureMode(document, slideIndex, selector) {
  // 1. Find all slides by selector
  const slides = Array.from(document.querySelectorAll(selector));

  // 2. Remove all except target (by DOM order index)
  slides.forEach((slide, i) => {
    if (i !== slideIndex) slide.remove();
  });

  // 3. Force target dimensions
  const target = document.querySelector(selector);
  if (target) {
    target.style.cssText = 'position:relative!important;width:1920px!important;height:1080px!important;opacity:1!important;transform:none!important;overflow:hidden!important;';
    // Force parent container
    if (target.parentElement) {
      target.parentElement.style.cssText = 'width:1920px!important;height:1080px!important;overflow:hidden!important;';
    }
  }

  // 4. Force document dimensions
  document.documentElement.style.cssText = 'width:1920px!important;height:1080px!important;overflow:hidden!important;';
  document.body.style.cssText = 'width:1920px!important;height:1080px!important;overflow:hidden!important;margin:0!important;padding:0!important;';

  // 5. Remove UI chrome
  const removeSelectors = ['.nav', '.format-toolbar', '#progress', '.watermark', '[data-watermark]', '[data-fixed-brand]'];
  removeSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => el.remove());
  });
}
```

**How it's used in the browser:** The injected `<script>` tag in the prepared HTML inlines a copy of this function (serialized by `prepare()`). It reads the slide index from `?slide=N` and the selector from `data-slide-selector` attribute, then calls the function.

**How it's used in selfTest:** The test file directly imports `captureMode` from `capture-mode.mjs` and calls it against a linkedom document. No extraction, no eval. Same function, same behavior.

## Component 2: `selfTest(preparedHtml, slideCount, selector)`

Validates the prepared HTML in two phases: static structural checks (linkedom parse) and dynamic execution checks (direct function call).

### Phase 1: Static checks (linkedom parse only)

1. **Capture script is present** — `capture.js` script tag exists in the document
2. **Animation kill is present** — a `<style>` element contains `transition: none` and `animation: none`
3. **Capture mode block exists** — the marker comment `/* html-flides capture mode */` is present
4. **Auto-close script present** — the `window.close()` hook is present

### Phase 2: Dynamic checks (direct function call, run for slide 0 and slide N-1)

Constructs a linkedom document from the prepared HTML, then calls the imported `captureMode(document, slideIndex, selector)` function directly.

5. **Only 1 slide in DOM** — after `captureMode()`, `querySelectorAll(selector)` returns exactly 1 element
6. **Target slide has correct index** — the remaining slide is the Nth element from the original DOM order
7. **No forbidden elements** — `.nav`, `.format-toolbar`, `#progress`, `.watermark`, `[data-watermark]`, `[data-fixed-brand]` selectors return null

### Behavior
- All pass → `{ valid: true, slideCount }`
- Any fail → `{ valid: false, errors: ["Slide 0: found 3 slides in DOM, expected 1", ...] }`

### `--dry-run` flag
When `prepare.mjs` is called with `--dry-run`, it runs prepare + selfTest but skips writing the file. Outputs validation result to stdout.

## Component 3: `serve()`

Static file server for `plugin/runtime/` on port 4173.

- **Idempotent start:** Check if port 4173 is already bound. If so, hit `GET /health` to verify it's ours. Reuse if it returns `html-flides`, error if occupied by something else.
- **Health endpoint:** `GET /health` → `{ "plugin": "html-flides", "status": "ok" }`
- **MIME types:** `.html`, `.css`, `.js`, `.json`, `.svg`, `.png`, `.jpg`, `.gif`, `.woff`, `.woff2`
- **Path traversal protection:** Normalize paths, reject `..` traversal.

## Component 4: `import` command (`/html-flides:import`)

**Usage:** `/html-flides:import /absolute/path/to/deck.html [--selector 'CSS selector']`

### Steps

1. **Prepare** — run `prepare(sourcePath, { selector })`, get `{ relativeUrl, slideCount, selector }`
2. **Self-test** — run `selfTest()`. If it fails, print errors and stop. Don't touch Figma.
3. **Start server** — ensure `localhost:4173` is serving (verify via `GET /health`)
4. **Ask destination** — prompt user: new file (which team?) or existing file?
5. **Capture loop (sequential, one ID per slide just-in-time):**
   - For slide 0:
     - Generate capture ID via `generate_figma_design` with `newFile` or `existingFile` per step 4
     - `open` the URL: `http://localhost:4173<relativeUrl>?slide=0#figmacapture=<id>&figmaendpoint=<encoded-endpoint>&figmadelay=3000`
     - Tab auto-closes after capture submits (via injected auto-close script)
     - Wait 5s, then poll with captureId. Poll up to 10 times (5s between) until completed.
     - Extract `fileKey` from the completed response.
     - Log: `Slide 1/12 captured (node 156:2)`
   - For each remaining slide 1 to N-1:
     - Generate capture ID via `generate_figma_design` with `existingFile` and the `fileKey` from slide 0
     - Open, auto-close, poll, log — same as above
   - **On per-slide failure (10 polls exhausted):** Log the failure, skip to the next slide, continue the loop. Do not abort the entire import. Collect failed slide indices for the final report.
6. **Inline verification** — after all slides, check metadata on first and last frame via `get_metadata`. Confirm both are 1920x1080.
7. **Report** — print Figma file URL, slide count, frame sizes, any failed slides, any issues found.

### Rules
- One slide per capture. Never capture the entire page at once.
- Sequential capture — generate each capture ID immediately before use (avoids potential session expiry on pre-generated IDs).
- `figmadelay=3000` gives Chart.js and fonts time to render. This is conservative; decks without charts could use 1000ms. For v1, use 3000ms universally.
- If top-level frame is larger than 1920x1080, identify the inner body frame as canonical and report the wrapper.
- Browser tabs auto-close after capture submission. User should not end up with orphan tabs.

## Component 5: `qa` command (`/html-flides:qa`)

**Usage:** `/html-flides:qa <figma-file-url>`

Standalone post-import verification for thorough audits or decks imported in previous sessions.

### Checks
1. **Frame count** — number of top-level frames
2. **Frame dimensions** — is every frame exactly 1920x1080?
3. **Wrapper drift** — if a frame is oversized, report which wrapper elements caused it
4. **Visual spot-check** — screenshot first, middle, and last slide via `get_screenshot`
5. **Font check** — sample 2-3 slides via `get_metadata`, look for expected font family names

### Output
```
html-flides QA — 12 slides imported

| Slide | Node    | Size      | Status |
|-------|---------|-----------|--------|
| 0     | 156:2   | 1920x1080 | ok     |
| 1     | 157:2   | 1920x1080 | ok     |
| ...   | ...     | ...       | ...    |
| 11    | 167:2   | 1920x1080 | ok     |

Fonts found: Geist, Geist Mono
Wrapper drift: none

[screenshot: slide 0] [screenshot: slide 6] [screenshot: slide 11]
```

## Component 6: Repo Structure

```
html-flides/
├── README.md                          # Install, usage, supported formats, Figma Slides guide
├── CONTRIBUTING.md
├── LICENSE                            # MIT
├── package.json                       # Dev deps: linkedom, vitest
├── .gitignore
│
├── plugin/                            # The Claude Code plugin
│   ├── .claude-plugin/
│   │   ├── plugin.json
│   │   └── marketplace.json           # Cowork distribution
│   ├── .mcp.json                      # Bundled Figma MCP server
│   ├── commands/
│   │   ├── import.md                  # /html-flides:import
│   │   └── qa.md                      # /html-flides:qa
│   ├── scripts/
│   │   ├── capture-mode.mjs           # Shared slide isolation logic (browser + test)
│   │   ├── prepare.mjs                # Deck transformer + self-test
│   │   └── serve.mjs                  # Static server
│   └── runtime/                       # .gitignored — generated at runtime
│       └── imports/
│
├── tests/
│   ├── fixtures/
│   │   ├── minimal-deck.html          # 3 slides with data-slide, bare minimum
│   │   ├── complex-deck.html          # Charts, animations, watermarks, nav
│   │   ├── revealjs-deck.html         # Reveal.js structure (section elements)
│   │   └── custom-selector-deck.html  # Non-standard slide structure
│   ├── prepare.test.mjs
│   ├── capture-mode.test.mjs
│   └── setup.mjs
│
└── docs/
    ├── figma-slides-guide.md          # How to move frames into Figma Slides
    └── specs/
        └── 2026-03-13-html-flides-design.md
```

### Distribution manifests

**`plugin/.claude-plugin/plugin.json`:**
```json
{
  "name": "html-flides",
  "description": "Import HTML slide decks into Figma Design as editable 1920x1080 frames via Figma MCP.",
  "version": "1.0.0",
  "author": { "name": "Michael Nguyen" },
  "homepage": "https://github.com/nguyemm7/html-flides",
  "repository": "https://github.com/nguyemm7/html-flides",
  "license": "MIT",
  "keywords": ["figma", "slides", "html", "mcp", "import", "claude-code"]
}
```

**`plugin/.claude-plugin/marketplace.json`:**
```json
{
  "name": "html-flides-marketplace",
  "owner": { "name": "Michael Nguyen" },
  "plugins": [{
    "name": "html-flides",
    "source": {
      "source": "github",
      "repo": "nguyemm7/html-flides",
      "path": "plugin",
      "ref": "main"
    },
    "version": "1.0.0",
    "description": "Import HTML slide decks into Figma Design as editable 1920x1080 frames via Figma MCP."
  }]
}
```

**`plugin/.mcp.json`:**
```json
{
  "mcpServers": {
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

## Component 7: Test Strategy

**Stack:** vitest + linkedom (Node-only, no browser)

### Test cases

| # | Phase | Test | Assertion |
|---|-------|------|-----------|
| 1 | prepare | detects slide count (minimal, default selector) | `slideCount === 3` |
| 2 | prepare | detects slide count (complex, default selector) | `slideCount === 12` |
| 3 | prepare | detects slides with custom selector | `selector='section'` finds slides in revealjs fixture |
| 4 | prepare | injects capture script | Output contains `capture.js` script tag |
| 5 | prepare | injects capture mode block | Output contains marker comment `/* html-flides capture mode */` |
| 6 | prepare | injects animation kill CSS | Output contains `transition: none` and `animation: none` |
| 7 | prepare | injects auto-close script | Output contains `window.close()` hook |
| 8 | prepare | strips CSP meta tags | Any `<meta http-equiv="Content-Security-Policy">` is removed |
| 9 | prepare | idempotent: double prepare | Running prepare twice doesn't duplicate injections |
| 10 | prepare | no slides: aborts with error | HTML without matching selector throws with descriptive message |
| 11 | prepare | error message includes selector | Error for custom selector includes the selector string used |
| 12 | captureMode | single slide in DOM (default selector) | After call, 1 `[data-slide]` element remains |
| 13 | captureMode | single slide in DOM (custom selector) | After call with `section`, 1 `section` element remains |
| 14 | captureMode | correct slide survives | Remaining element is the Nth by original DOM order |
| 15 | captureMode | nav removed | `.nav`, `.format-toolbar`, `#progress` return null |
| 16 | captureMode | watermark removed | `.watermark`, `[data-watermark]`, `[data-fixed-brand]` return null |
| 17 | captureMode | parent container forced to 1920x1080 | `target.parentElement.style` includes correct dimensions |
| 18 | captureMode | body forced to 1920x1080 | `document.body.style` includes correct dimensions |
| 19 | selfTest | passes valid output | `selfTest()` returns `{ valid: true }` for prepared deck |
| 20 | selfTest | fails broken output | Corrupted output returns `{ valid: false, errors: [...] }` |

### Test fixtures

- **`minimal-deck.html`** — 3 slides with `data-slide="0|1|2"`, bare minimum structure
- **`complex-deck.html`** — 12 slides with Chart.js, `.watermark`, `[data-fixed-brand]`, CSS animations, `.nav`, `.format-toolbar`
- **`revealjs-deck.html`** — Reveal.js structure with `<section>` slides inside `.reveal .slides`
- **`custom-selector-deck.html`** — Non-standard deck using `<div class="page">` elements

### Running
```bash
npm test           # from repo root
npx vitest run     # explicit
```

## Capture Parameter

Standardized on `?slide=N` (0-indexed by DOM order). This replaces both:
- The old plugin's `?capture=N`
- The ad-hoc `?captureSlide=N` from the manual session

N refers to DOM order position, not attribute values. This ensures consistent behavior regardless of how slides are numbered or labeled.

## Getting into Figma Slides

The Figma MCP imports into Figma Design, not directly into Figma Slides. After import, you need to move the frames:

### Manual workflow (current)
1. Open the imported Figma Design file
2. Select all frames (Cmd+A)
3. Copy (Cmd+C)
4. Open or create a Figma Slides file
5. Paste (Cmd+V) — frames become individual slides

### Future automation
If Figma releases a Slides API or MCP tool for programmatic slide creation, the plugin will automate this step. Track [issue link TBD] for updates.

See `docs/figma-slides-guide.md` for detailed walkthrough with screenshots.

## Known Limitations

- Figma MCP imports into Figma Design, not directly into Figma Slides (see above for manual workflow)
- Complex browser effects (WebGL, complex SVG filters) may not capture perfectly
- Users must authenticate Figma MCP via `/mcp` before first import
- Chart.js canvases render as rasterized images in Figma, not editable vectors
- External assets (CSS, images, fonts) referenced via relative paths will not be copied — decks should be self-contained single-file HTML. See Roadmap for `--copy-assets` flag.
- `window.close()` auto-close may be blocked by some browsers if the tab was not opened by script. In that case, tabs need manual closing.

## Roadmap (post-v1)

- **`--copy-assets` flag** — copy sibling CSS, images, and fonts to `runtime/imports/` alongside the prepared HTML, so decks with external assets work
- **Figma Slides automation** — if Figma ships a Slides API, automate the Design → Slides migration
- **Configurable `figmadelay`** — allow users to set a shorter delay for simple decks without charts
- **Preset selectors** — `/html-flides:import deck.html --preset revealjs` as a shorthand for common formats
- **Batch tab management** — explore single-page capture loop that advances slides via JS without opening new tabs
