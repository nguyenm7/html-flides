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

    const chrome = ['.nav', '.format-toolbar', '#progress', '.watermark', '[data-watermark]', '[data-fixed-brand]'];
    for (const sel of chrome) {
      if (document.querySelector(sel)) {
        errors.push(`Slide ${idx}: UI element '${sel}' still present after captureMode`);
      }
    }
  }

  return { valid: errors.length === 0, slideCount, errors };
}
