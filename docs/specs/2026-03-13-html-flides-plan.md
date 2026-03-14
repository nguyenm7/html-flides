# html-flides Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that imports any HTML slide deck into Figma Design as individual editable 1920x1080 frames.

**Architecture:** HTML deck → `prepare()` transforms into capture-safe single-slide-per-URL HTML → `selfTest()` validates via linkedom + shared `captureMode()` function → local static server serves prepared HTML → sequential Figma MCP capture loop with auto-close tabs → QA verification via Figma metadata + screenshots.

**Tech Stack:** Node.js ESM, linkedom, vitest, Figma MCP (`generate_figma_design`, `get_metadata`, `get_screenshot`)

**Spec:** `docs/superpowers/specs/2026-03-13-html-flides-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `plugin/.claude-plugin/plugin.json` | Plugin identity, version, repo link |
| `plugin/.claude-plugin/marketplace.json` | Cowork marketplace distribution manifest |
| `plugin/.mcp.json` | Bundled Figma MCP server config |
| `plugin/scripts/capture-mode.mjs` | Shared slide isolation function (browser + test) |
| `plugin/scripts/prepare.mjs` | Deck transformer: read HTML, inject capture mode, write prepared output |
| `plugin/scripts/self-test.mjs` | Validates prepared HTML via static checks + captureMode() call |
| `plugin/scripts/serve.mjs` | Static file server for `runtime/` on port 4173 |
| `plugin/commands/import.md` | `/html-flides:import` — orchestrates the full pipeline |
| `plugin/commands/qa.md` | `/html-flides:qa` — post-import Figma verification |
| `tests/fixtures/minimal-deck.html` | 3-slide test fixture with `data-slide` attributes |
| `tests/fixtures/complex-deck.html` | 12-slide fixture with nav, watermarks, animations |
| `tests/fixtures/revealjs-deck.html` | Reveal.js structure fixture |
| `tests/fixtures/custom-selector-deck.html` | Non-standard `div.page` fixture |
| `tests/capture-mode.test.mjs` | Tests for shared captureMode() function |
| `tests/prepare.test.mjs` | Tests for prepare + selfTest pipeline |

---

## Chunk 1: Repo Scaffold + captureMode()

### Task 1: Initialize the repo and install dev dependencies

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `plugin/.claude-plugin/plugin.json`
- Create: `plugin/.claude-plugin/marketplace.json`
- Create: `plugin/.mcp.json`

- [ ] **Step 1: Create GitHub repo and clone**

```bash
gh repo create nguyemm7/html-flides --public --license mit --clone
cd html-flides
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "html-flides",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "linkedom": "^0.16.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
plugin/runtime/
.DS_Store
```

- [ ] **Step 4: Create plugin manifests**

Create `plugin/.claude-plugin/plugin.json`:
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

Create `plugin/.claude-plugin/marketplace.json`:
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

Create `plugin/.mcp.json`:
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

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

- [ ] **Step 6: Commit scaffold**

```bash
git add package.json .gitignore plugin/.claude-plugin/ plugin/.mcp.json
git commit -m "chore: scaffold repo with plugin manifests and dev deps"
```

---

### Task 2: Write test fixtures

**Files:**
- Create: `tests/fixtures/minimal-deck.html`
- Create: `tests/fixtures/complex-deck.html`
- Create: `tests/fixtures/revealjs-deck.html`
- Create: `tests/fixtures/custom-selector-deck.html`

- [ ] **Step 1: Create minimal-deck.html**

3 slides, `data-slide` attributes, bare minimum. No nav, no animations.

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Minimal Deck</title></head>
<body>
<div id="deck">
  <div class="slide" data-slide="0"><h1>Slide One</h1></div>
  <div class="slide" data-slide="1"><h2>Slide Two</h2><p>Content here.</p></div>
  <div class="slide" data-slide="2"><h2>Slide Three</h2><p>Final slide.</p></div>
</div>
</body>
</html>
```

- [ ] **Step 2: Create complex-deck.html**

12 slides with nav, watermarks, animations, format toolbar, progress bar. Mimics a real enterpret-slides deck.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Complex Deck</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'">
<style>
  .slide { position: absolute; inset: 0; opacity: 0; transition: opacity 0.5s ease; }
  .slide.active { opacity: 1; }
  @keyframes fadeUp { from { opacity: 0; } to { opacity: 1; } }
</style>
</head>
<body>
<div id="deck">
  <div class="slide active" data-slide="0"><h1>Title Slide</h1></div>
  <div class="slide" data-slide="1"><h2>Executive Summary</h2></div>
  <div class="slide" data-slide="2"><h2>Introduction</h2></div>
  <div class="slide" data-slide="3"><h2>Problem</h2></div>
  <div class="slide" data-slide="4"><h2>Impact</h2></div>
  <div class="slide" data-slide="5"><h2>Blind Spots</h2></div>
  <div class="slide" data-slide="6"><h2>Root Cause</h2></div>
  <div class="slide" data-slide="7"><h2>Solution</h2></div>
  <div class="slide" data-slide="8"><h2>Platform</h2></div>
  <div class="slide" data-slide="9"><h2>Validation</h2><canvas id="chart-1" data-chart="{}"></canvas></div>
  <div class="slide" data-slide="10"><h2>Recommendation</h2></div>
  <div class="slide" data-slide="11"><h2>Appendix</h2></div>
</div>
<nav class="nav"><button>Prev</button><span id="counter">1/12</span><button>Next</button></nav>
<div class="format-toolbar" id="formatToolbar"><button>B</button></div>
<div id="progress" style="width:8%"></div>
<div class="watermark">Draft</div>
<div data-watermark>Watermark</div>
<div data-fixed-brand>Brand</div>
</body>
</html>
```

- [ ] **Step 3: Create revealjs-deck.html**

Reveal.js-style structure. No `data-slide` attributes — uses `<section>` elements.

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Reveal Deck</title></head>
<body>
<div class="reveal">
  <div class="slides">
    <section><h1>Intro</h1></section>
    <section><h2>Middle</h2></section>
    <section><h2>End</h2></section>
  </div>
</div>
</body>
</html>
```

- [ ] **Step 4: Create custom-selector-deck.html**

Non-standard structure using `<div class="page">`.

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Custom Deck</title></head>
<body>
<div class="container">
  <div class="page"><h1>Page 1</h1></div>
  <div class="page"><h2>Page 2</h2></div>
  <div class="page"><h2>Page 3</h2></div>
  <div class="page"><h2>Page 4</h2></div>
</div>
</body>
</html>
```

- [ ] **Step 5: Commit fixtures**

```bash
git add tests/fixtures/
git commit -m "test: add HTML deck fixtures for minimal, complex, revealjs, and custom selector"
```

---

### Task 3: Build and test `captureMode()`

**Files:**
- Create: `plugin/scripts/capture-mode.mjs`
- Create: `tests/capture-mode.test.mjs`

- [ ] **Step 1: Write the failing tests for captureMode**

Create `tests/capture-mode.test.mjs`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureMode } from '../plugin/scripts/capture-mode.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFile(join(__dirname, 'fixtures', name), 'utf8');

function dom(html) {
  return parseHTML(html).document;
}

describe('captureMode', () => {
  describe('default selector [data-slide]', () => {
    let html;
    beforeEach(async () => { html = await fixture('minimal-deck.html'); });

    it('leaves only 1 slide in DOM', () => {
      const doc = dom(html);
      captureMode(doc, 1, '[data-slide]');
      expect(doc.querySelectorAll('[data-slide]').length).toBe(1);
    });

    it('keeps the correct slide by DOM order', () => {
      const doc = dom(html);
      captureMode(doc, 1, '[data-slide]');
      const remaining = doc.querySelector('[data-slide]');
      expect(remaining.getAttribute('data-slide')).toBe('1');
    });

    it('keeps slide 0 when index is 0', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      const remaining = doc.querySelector('[data-slide]');
      expect(remaining.getAttribute('data-slide')).toBe('0');
    });

    it('keeps last slide when index is last', () => {
      const doc = dom(html);
      captureMode(doc, 2, '[data-slide]');
      const remaining = doc.querySelector('[data-slide]');
      expect(remaining.getAttribute('data-slide')).toBe('2');
    });
  });

  describe('custom selector', () => {
    let html;
    beforeEach(async () => { html = await fixture('revealjs-deck.html'); });

    it('works with section selector', () => {
      const doc = dom(html);
      captureMode(doc, 1, '.reveal .slides > section');
      expect(doc.querySelectorAll('.reveal .slides > section').length).toBe(1);
    });
  });

  describe('UI chrome removal', () => {
    let html;
    beforeEach(async () => { html = await fixture('complex-deck.html'); });

    it('removes .nav', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      expect(doc.querySelector('.nav')).toBeNull();
    });

    it('removes .format-toolbar', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      expect(doc.querySelector('.format-toolbar')).toBeNull();
    });

    it('removes #progress', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      expect(doc.querySelector('#progress')).toBeNull();
    });

    it('removes .watermark', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      expect(doc.querySelector('.watermark')).toBeNull();
    });

    it('removes [data-watermark]', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      expect(doc.querySelector('[data-watermark]')).toBeNull();
    });

    it('removes [data-fixed-brand]', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      expect(doc.querySelector('[data-fixed-brand]')).toBeNull();
    });
  });

  describe('dimension forcing', () => {
    let html;
    beforeEach(async () => { html = await fixture('minimal-deck.html'); });

    it('forces body to 1920x1080', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      expect(doc.body.style.cssText).toContain('width:1920px');
      expect(doc.body.style.cssText).toContain('height:1080px');
    });

    it('forces html to 1920x1080', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      expect(doc.documentElement.style.cssText).toContain('width:1920px');
      expect(doc.documentElement.style.cssText).toContain('height:1080px');
    });

    it('forces target slide to 1920x1080', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      const target = doc.querySelector('[data-slide]');
      expect(target.style.cssText).toContain('width:1920px');
      expect(target.style.cssText).toContain('height:1080px');
    });

    it('forces parent container to 1920x1080', () => {
      const doc = dom(html);
      captureMode(doc, 0, '[data-slide]');
      const target = doc.querySelector('[data-slide]');
      expect(target.parentElement.style.cssText).toContain('width:1920px');
      expect(target.parentElement.style.cssText).toContain('height:1080px');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/capture-mode.test.mjs
```

Expected: FAIL — `captureMode` module not found.

- [ ] **Step 3: Implement captureMode**

Create `plugin/scripts/capture-mode.mjs`:

```js
/**
 * Shared slide isolation logic for html-flides.
 * Used both in the browser (inlined by prepare) and in selfTest (imported directly).
 *
 * @param {Document} document - DOM document (real browser or linkedom)
 * @param {number} slideIndex - 0-based index by DOM order
 * @param {string} selector - CSS selector that identifies slide elements
 */
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/capture-mode.test.mjs
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/scripts/capture-mode.mjs tests/capture-mode.test.mjs
git commit -m "feat: add captureMode() shared slide isolation with tests"
```

---

## Chunk 2: prepare() + selfTest()

### Task 4: Build and test `prepare()`

**Files:**
- Create: `plugin/scripts/prepare.mjs`
- Create: `tests/prepare.test.mjs`

- [ ] **Step 1: Write failing tests for prepare**

Create `tests/prepare.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from '../plugin/scripts/prepare.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => join(__dirname, 'fixtures', name);

describe('prepare', () => {
  describe('slide detection', () => {
    it('detects 3 slides in minimal deck', async () => {
      const result = await prepare(fixture('minimal-deck.html'));
      expect(result.slideCount).toBe(3);
    });

    it('detects 12 slides in complex deck', async () => {
      const result = await prepare(fixture('complex-deck.html'));
      expect(result.slideCount).toBe(12);
    });

    it('detects slides with custom selector', async () => {
      const result = await prepare(fixture('revealjs-deck.html'), { selector: '.reveal .slides > section' });
      expect(result.slideCount).toBe(3);
    });

    it('detects slides with div.page selector', async () => {
      const result = await prepare(fixture('custom-selector-deck.html'), { selector: '.page' });
      expect(result.slideCount).toBe(4);
    });

    it('throws when no slides found with default selector', async () => {
      await expect(prepare(fixture('revealjs-deck.html'))).rejects.toThrow('No slides detected');
    });

    it('error message includes the selector used', async () => {
      await expect(prepare(fixture('revealjs-deck.html'), { selector: '.nonexistent' }))
        .rejects.toThrow('.nonexistent');
    });
  });

  describe('injections', () => {
    it('injects capture.js script tag', async () => {
      const result = await prepare(fixture('minimal-deck.html'));
      expect(result.html).toContain('mcp.figma.com/mcp/html-to-design/capture.js');
    });

    it('injects capture mode marker comment', async () => {
      const result = await prepare(fixture('minimal-deck.html'));
      expect(result.html).toContain('/* html-flides capture mode */');
    });

    it('injects animation kill CSS', async () => {
      const result = await prepare(fixture('minimal-deck.html'));
      expect(result.html).toContain('transition: none !important');
      expect(result.html).toContain('animation: none !important');
    });

    it('injects auto-close script', async () => {
      const result = await prepare(fixture('minimal-deck.html'));
      expect(result.html).toContain('window.close()');
    });

    it('strips CSP meta tags', async () => {
      const result = await prepare(fixture('complex-deck.html'));
      expect(result.html).not.toContain('Content-Security-Policy');
    });
  });

  describe('idempotency', () => {
    it('does not double-inject on second prepare', async () => {
      const first = await prepare(fixture('minimal-deck.html'));
      // Write first result to temp, re-prepare
      const { tmpdir } = await import('node:os');
      const { writeFile } = await import('node:fs/promises');
      const tmpPath = join(tmpdir(), 'html-flides-test-idempotent.html');
      await writeFile(tmpPath, first.html);
      const second = await prepare(tmpPath);
      const markerCount = (second.html.match(/html-flides capture mode/g) || []).length;
      expect(markerCount).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/prepare.test.mjs
```

Expected: FAIL — `prepare` module not found.

- [ ] **Step 3: Implement prepare()**

Create `plugin/scripts/prepare.mjs`:

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { captureMode } from './capture-mode.mjs';

const MARKER = '/* html-flides capture mode */';

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Prepare an HTML deck for Figma capture.
 *
 * @param {string} sourcePath - Absolute path to the HTML file
 * @param {object} [options]
 * @param {string} [options.selector='[data-slide]'] - CSS selector for slide elements
 * @param {boolean} [options.dryRun=false] - If true, skip writing the file
 * @param {string} [options.outputDir] - Override output directory
 * @returns {{ html: string, outputPath: string, relativeUrl: string, slideCount: number, selector: string }}
 */
export async function prepare(sourcePath, options = {}) {
  const selector = options.selector || '[data-slide]';
  let html = await readFile(sourcePath, 'utf8');

  // 1. Detect slides
  const { document } = parseHTML(html);
  const slides = document.querySelectorAll(selector);
  if (slides.length === 0) {
    throw new Error(`No slides detected with selector '${selector}'. Try a different --selector value.`);
  }
  const slideCount = slides.length;

  // 2. Check idempotency — skip if already prepared
  if (html.includes(MARKER)) {
    const slug = slugify(basename(sourcePath, extname(sourcePath)));
    const relativeUrl = `/imports/${slug}.html`;
    return { html, outputPath: '', relativeUrl, slideCount, selector };
  }

  // 3. Strip CSP meta tags
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi, '');

  // 4. Inject animation kill CSS (before </head> or start of <body>)
  const animKill = `<style>${MARKER}
*, *::before, *::after {
  transition: none !important;
  animation: none !important;
  animation-delay: 0s !important;
}
</style>`;

  if (html.includes('</head>')) {
    html = html.replace('</head>', `${animKill}\n</head>`);
  } else {
    html = `${animKill}\n${html}`;
  }

  // 5. Serialize captureMode function for browser inline use
  const captureModeSource = captureMode.toString();
  const captureScript = `<script>
${MARKER}
(function() {
  var params = new URLSearchParams(window.location.search);
  var slideParam = params.get('slide');
  if (slideParam === null) return;
  var slideIndex = parseInt(slideParam, 10);
  var selector = ${JSON.stringify(selector)};

  // Inlined captureMode function
  var captureMode = ${captureModeSource};
  captureMode(document, slideIndex, selector);
})();
</script>`;

  // 6. Inject auto-close script
  const autoCloseScript = `<script>
/* html-flides auto-close */
(function() {
  var _origFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    var result = _origFetch.apply(this, args);
    if (args[0] && String(args[0]).includes('/submit')) {
      setTimeout(function() { window.close(); }, 2000);
    }
    return result;
  };
})();
</script>`;

  // 7. Inject Figma capture script
  const figmaScript = '<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>';

  // Inject all before </body> or at end
  const injection = `${captureScript}\n${autoCloseScript}\n${figmaScript}`;
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${injection}\n</body>`);
  } else {
    html = `${html}\n${injection}`;
  }

  // 8. Write output
  const slug = slugify(basename(sourcePath, extname(sourcePath)));
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const pluginRoot = options.outputDir || join(scriptDir, '..');
  const outputDir = join(pluginRoot, 'runtime', 'imports');
  const outputPath = join(outputDir, `${slug}.html`);
  const relativeUrl = `/imports/${slug}.html`;

  if (!options.dryRun) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, html, 'utf8');
  }

  return { html, outputPath, relativeUrl, slideCount, selector };
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('prepare.mjs')) {
  const { selfTest } = await import('./self-test.mjs');

  const sourcePath = process.argv[2];
  const selectorFlag = process.argv.indexOf('--selector');
  const selector = selectorFlag !== -1 ? process.argv[selectorFlag + 1] : undefined;
  const dryRun = process.argv.includes('--dry-run');

  if (!sourcePath) {
    console.error('Usage: node prepare.mjs /path/to/deck.html [--selector "CSS selector"] [--dry-run]');
    process.exit(1);
  }

  try {
    const result = await prepare(sourcePath, { selector, dryRun });

    // Always run self-test after prepare
    const validation = selfTest(result.html, result.slideCount, result.selector);
    if (!validation.valid) {
      console.error('Self-test FAILED:');
      validation.errors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }

    console.log(JSON.stringify({
      outputPath: result.outputPath,
      relativeUrl: result.relativeUrl,
      slideCount: result.slideCount,
      selector: result.selector,
      selfTest: 'passed',
    }, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/prepare.test.mjs
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/scripts/prepare.mjs tests/prepare.test.mjs
git commit -m "feat: add prepare() deck transformer with tests"
```

---

### Task 5: Build and test `selfTest()`

**Files:**
- Create: `plugin/scripts/self-test.mjs`
- Modify: `tests/prepare.test.mjs` (add selfTest tests)

- [ ] **Step 1: Write failing tests for selfTest**

Append to `tests/prepare.test.mjs`:

```js
import { selfTest } from '../plugin/scripts/self-test.mjs';

describe('selfTest', () => {
  it('passes for valid prepared minimal deck', async () => {
    const { html, slideCount, selector } = await prepare(fixture('minimal-deck.html'));
    const result = selfTest(html, slideCount, selector);
    expect(result.valid).toBe(true);
  });

  it('passes for valid prepared complex deck', async () => {
    const { html, slideCount, selector } = await prepare(fixture('complex-deck.html'));
    const result = selfTest(html, slideCount, selector);
    expect(result.valid).toBe(true);
  });

  it('passes for custom selector deck', async () => {
    const { html, slideCount, selector } = await prepare(
      fixture('revealjs-deck.html'),
      { selector: '.reveal .slides > section' }
    );
    const result = selfTest(html, slideCount, selector);
    expect(result.valid).toBe(true);
  });

  it('fails when capture script is missing', async () => {
    const { html, slideCount, selector } = await prepare(fixture('minimal-deck.html'));
    const broken = html.replace(/capture\.js/g, 'removed.js');
    const result = selfTest(broken, slideCount, selector);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('capture script'))).toBe(true);
  });

  it('fails when animation kill is missing', async () => {
    const { html, slideCount, selector } = await prepare(fixture('minimal-deck.html'));
    const broken = html.replace(/transition: none/g, '');
    const result = selfTest(broken, slideCount, selector);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('animation kill'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/prepare.test.mjs
```

Expected: FAIL — `selfTest` module not found.

- [ ] **Step 3: Implement selfTest()**

Create `plugin/scripts/self-test.mjs`:

```js
import { parseHTML } from 'linkedom';
import { captureMode } from './capture-mode.mjs';

/**
 * Validate prepared HTML before Figma import.
 *
 * @param {string} html - Prepared HTML string
 * @param {number} slideCount - Expected slide count
 * @param {string} selector - CSS selector for slides
 * @returns {{ valid: boolean, slideCount: number, errors: string[] }}
 */
export function selfTest(html, slideCount, selector) {
  const errors = [];

  // Phase 1: Static checks
  if (!html.includes('mcp.figma.com/mcp/html-to-design/capture.js')) {
    errors.push('Missing Figma capture script (capture.js)');
  }

  if (!html.includes('transition: none') || !html.includes('animation: none')) {
    errors.push('Missing animation kill CSS');
  }

  if (!html.includes('/* html-flides capture mode */')) {
    errors.push('Missing capture mode marker comment');
  }

  if (!html.includes('window.close()')) {
    errors.push('Missing auto-close script');
  }

  // Phase 2: Dynamic checks — test slide 0 and slide N-1
  const indicesToTest = [0];
  if (slideCount > 1) indicesToTest.push(slideCount - 1);

  for (const idx of indicesToTest) {
    const { document } = parseHTML(html);
    captureMode(document, idx, selector);

    const remaining = document.querySelectorAll(selector);
    if (remaining.length !== 1) {
      errors.push(`Slide ${idx}: found ${remaining.length} slides in DOM, expected 1`);
    }

    // Check UI chrome is gone
    const chrome = ['.nav', '.format-toolbar', '#progress', '.watermark', '[data-watermark]', '[data-fixed-brand]'];
    for (const sel of chrome) {
      if (document.querySelector(sel)) {
        errors.push(`Slide ${idx}: UI element '${sel}' still present after captureMode`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    slideCount,
    errors,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/prepare.test.mjs
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/scripts/self-test.mjs tests/prepare.test.mjs
git commit -m "feat: add selfTest() preparation validator with tests"
```

---

## Chunk 3: serve() + commands

### Task 6: Build `serve()`

**Files:**
- Create: `plugin/scripts/serve.mjs`

- [ ] **Step 1: Implement serve.mjs**

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || dirname(scriptDir);
const root = join(pluginRoot, 'runtime');
const port = process.env.PORT ? Number(process.env.PORT) : 4173;

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function safePath(urlPath) {
  const normalized = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  if (normalized.includes('..')) return null;
  return join(root, normalized);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ plugin: 'html-flides', status: 'ok' }));
    return;
  }

  const target = safePath(url.pathname);
  if (!target) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  try {
    const contents = await readFile(target);
    res.writeHead(200, {
      'content-type': mimeTypes[extname(target)] || 'application/octet-stream',
    });
    res.end(contents);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, () => {
  console.log(`html-flides server running at http://localhost:${port}/`);
});
```

- [ ] **Step 2: Commit**

```bash
git add plugin/scripts/serve.mjs
git commit -m "feat: add static server with health endpoint"
```

---

### Task 7: Write the import command

**Files:**
- Create: `plugin/commands/import.md`

- [ ] **Step 1: Write import.md**

```markdown
---
description: Import a local HTML slide deck into Figma Design as editable 1920x1080 frames. Usage: /html-flides:import /path/to/deck.html [--selector 'CSS selector']
---

# HTML Deck Import

Import a local HTML slide deck into Figma Design through Figma MCP.

## Inputs

- `$ARGUMENTS` must contain the absolute path to the source HTML file.
- Optional `--selector 'CSS selector'` to specify how to identify slides. Default: `[data-slide]`.
- If the user includes a desired file name, use it; otherwise derive from deck basename.

## Workflow

1. If `$ARGUMENTS` is empty, ask the user for the absolute HTML file path and stop.
2. Parse `--selector` from arguments if present. Default to `[data-slide]`.
3. Run the prepare script (which automatically runs self-test):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/prepare.mjs" "$HTML_PATH" --selector "$SELECTOR"
   ```
   Parse the returned JSON for `outputPath`, `relativeUrl`, `slideCount`, `selector`.
   If it exits with a non-zero code, the prepare or self-test failed. Print the stderr output and stop. Do not touch Figma.
4. Ensure the plugin static server is running:
   ```bash
   curl -s http://localhost:4173/health 2>/dev/null
   ```
   If it returns `html-flides`, reuse it. Otherwise start it:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs" &
   ```
5. Call `generate_figma_design` with no arguments to get the user's Figma destination options. Ask: new file (which team?) or existing file?
6. For slide 0:
   - Call `generate_figma_design` with `outputMode: "newFile"` (or `"existingFile"`) and the chosen plan/file.
   - Open the capture URL in the browser:
     ```
     open "http://localhost:4173<relativeUrl>?slide=0#figmacapture=<captureId>&figmaendpoint=<encoded-endpoint>&figmadelay=3000"
     ```
   - Wait 5 seconds, then poll `generate_figma_design` with the `captureId`. Poll up to 10 times (5s between) until status is `completed`.
   - Extract `fileKey` from the response.
   - Log: `Slide 1/<slideCount> captured`
7. For each remaining slide 1 to slideCount-1:
   - Call `generate_figma_design` with `outputMode: "existingFile"` and the `fileKey`.
   - Open, poll, log — same as slide 0.
   - On failure (10 polls exhausted): log the failure, skip to next slide. Do not abort.
8. After all slides: call `get_metadata` on the first and last imported frame nodes. Verify both are 1920x1080. Report any drift.
9. Print final report: Figma file URL, slide count, frame sizes, any failed or drifted slides.

## Rules

- One slide per capture. Never capture the entire page at once.
- Sequential capture — generate each capture ID immediately before use.
- Use `figmadelay=3000` universally.
- Browser tabs auto-close after capture. If any remain, note it in the report.
- If top-level frame exceeds 1920x1080, identify the inner body frame as canonical.
```

- [ ] **Step 2: Commit**

```bash
git add plugin/commands/import.md
git commit -m "feat: add /html-flides:import command"
```

---

### Task 8: Write the QA command

**Files:**
- Create: `plugin/commands/qa.md`

- [ ] **Step 1: Write qa.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add plugin/commands/qa.md
git commit -m "feat: add /html-flides:qa command"
```

---

## Chunk 4: Documentation + Final

### Task 9: Write README and docs

**Files:**
- Create: `README.md`
- Create: `docs/figma-slides-guide.md`
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Write README.md**

Include: what it does, install instructions (Claude Code + Cowork), usage examples with default and custom selectors, supported deck formats table, link to Figma Slides guide, known limitations.

Key sections:
- **Quick start** — 4-step install + import flow
- **Supported formats** — table of deck generators and their selectors
- **How it works** — brief architecture explanation
- **Figma Slides** — link to guide
- **Contributing** — link to CONTRIBUTING.md

- [ ] **Step 2: Write docs/figma-slides-guide.md**

Document the manual workflow:
1. Open imported Figma Design file
2. Select all frames (Cmd+A)
3. Copy (Cmd+C)
4. Open/create Figma Slides file
5. Paste (Cmd+V)

Note: future automation pending Figma Slides API.

- [ ] **Step 3: Write CONTRIBUTING.md**

Cover: how to run tests, how to add test fixtures, how to test the plugin locally (`claude --plugin-dir ./plugin`), PR guidelines.

- [ ] **Step 4: Commit**

```bash
git add README.md CONTRIBUTING.md docs/
git commit -m "docs: add README, Figma Slides guide, and contributing guide"
```

---

### Task 10: End-to-end smoke test

**Files:** None (manual verification)

- [ ] **Step 1: Test the plugin locally**

```bash
claude --plugin-dir ./plugin
```

Inside Claude Code:
1. Authenticate Figma MCP via `/mcp`
2. Run `/html-flides:import /absolute/path/to/test-deck.html`
3. Verify slides appear in Figma at 1920x1080
4. Run `/html-flides:qa <figma-url>`
5. Verify QA report shows all slides ok

- [ ] **Step 2: Test with custom selector**

Use a Reveal.js deck:
```
/html-flides:import /path/to/reveal-deck.html --selector '.reveal .slides > section'
```

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 4: Tag v1.0.0**

```bash
git tag v1.0.0
git push origin v1.0.0
```
