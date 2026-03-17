import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureMode } from './capture-mode.mjs';

let parseHTML;
try {
  ({ parseHTML } = await import('linkedom'));
} catch {
  console.error(
    'Error: Missing dependency "linkedom".\n' +
    'Run: cd "${CLAUDE_PLUGIN_ROOT}" && npm install linkedom\n' +
    'Or from the plugin cache: npm install linkedom --prefix "$(dirname "$(dirname "$(realpath "$0")")")"'
  );
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SELECTOR = '[data-slide]';
const MARKER = '/* html-flides capture mode */';

const ANIMATION_KILL_CSS = `<style>/* html-flides animation kill */
*, *::before, *::after {
  transition: none !important;
  animation: none !important;
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
}
/* hide known browser extension artifacts */
plasmo-csui, [id^="plasmo"], [class^="plasmo"] { display: none !important; }
</style>`;

const FIGMA_CAPTURE_SCRIPT = '<script src="https://mcp.figma.com/mcp/html-to-design/capture.js"></script>';

function buildCaptureModeScript(selector) {
  return `<script>
${MARKER}
(function() {
  var captureMode = ${captureMode.toString()};
  var params = new URLSearchParams(window.location.search);
  var slide = parseInt(params.get('slide') || '0', 10);
  captureMode(document, slide, ${JSON.stringify(selector)});
})();
</script>`;
}

const AUTO_CLOSE_SCRIPT = `<script>
(function() {
  var _origFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    return _origFetch.apply(this, args).then(function(resp) {
      if (typeof args[0] === 'string' && args[0].indexOf('/submit') !== -1) {
        setTimeout(function() { window.close(); }, 500);
      }
      return resp;
    });
  };
})();
</script>`;

/**
 * Transform a source HTML deck into a capture-safe version for Figma import.
 *
 * @param {string} sourcePath - Absolute path to source HTML file
 * @param {object} [options]
 * @param {string} [options.selector] - CSS selector for slides (default: '[data-slide]')
 * @param {boolean} [options.dryRun] - If true, skip file writing
 * @param {string} [options.outputDir] - Output directory (default: plugin/runtime/imports)
 * @returns {Promise<{html: string, outputPath: string, relativeUrl: string, slideCount: number, selector: string}>}
 */
export async function prepare(sourcePath, options = {}) {
  const selector = options.selector || DEFAULT_SELECTOR;
  const dryRun = options.dryRun || false;
  const outputDir = options.outputDir || join(__dirname, '..', 'runtime', 'imports');
  const slug = basename(sourcePath);

  // Read source HTML
  let html = await readFile(sourcePath, 'utf-8');

  // Parse with linkedom to count slides
  const { document } = parseHTML(html);
  const slides = document.querySelectorAll(selector);
  const slideCount = slides.length;

  if (slideCount === 0) {
    throw new Error(`No slides detected with selector "${selector}"`);
  }

  // Idempotency: if marker already present, skip injection
  if (!html.includes(MARKER)) {
    // Strip CSP meta tags
    html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');

    // Inject animation kill CSS before </head>
    html = html.replace('</head>', `${ANIMATION_KILL_CSS}\n</head>`);

    // Build scripts to inject before </body>
    const scripts = [
      buildCaptureModeScript(selector),
      AUTO_CLOSE_SCRIPT,
      FIGMA_CAPTURE_SCRIPT,
    ].join('\n');

    html = html.replace('</body>', `${scripts}\n</body>`);
  }

  // Compute output path
  const outputPath = join(outputDir, slug);
  const relativeUrl = `/imports/${slug}`;

  // Write file unless dryRun
  if (!dryRun) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, html, 'utf-8');
  }

  return { html, outputPath, relativeUrl, slideCount, selector };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const sourcePath = args.find(a => !a.startsWith('--'));
  const selectorFlag = args.indexOf('--selector');
  const selector = selectorFlag !== -1 ? args[selectorFlag + 1] : undefined;
  const dryRun = args.includes('--dry-run');

  if (!sourcePath) {
    console.error('Usage: node prepare.mjs <path-to-deck.html> [--selector "..."] [--dry-run]');
    process.exit(1);
  }

  import('./self-test.mjs').then(({ selfTest }) => {
    prepare(sourcePath, { selector, dryRun })
      .then(result => {
        const validation = selfTest(result.html, result.slideCount, result.selector);
        if (!validation.valid) {
          console.error('Self-test FAILED:');
          validation.errors.forEach(e => console.error(`  - ${e}`));
          process.exit(1);
        }
        console.log(JSON.stringify({
          slideCount: result.slideCount,
          relativeUrl: result.relativeUrl,
          selector: result.selector,
          selfTest: 'passed',
        }, null, 2));
        if (dryRun) console.log('(dry run — no file written)');
      })
      .catch(err => {
        console.error(err.message);
        process.exit(1);
      });
  });
}
