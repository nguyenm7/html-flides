import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { prepare } from '../plugin/scripts/prepare.mjs';
import { selfTest } from '../plugin/scripts/self-test.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => join(__dirname, 'fixtures', name);

describe('prepare', () => {
  describe('slide detection', () => {
    it('detects 3 slides in minimal deck', async () => {
      const result = await prepare(fixture('minimal-deck.html'), { dryRun: true });
      expect(result.slideCount).toBe(3);
    });

    it('detects 12 slides in complex deck', async () => {
      const result = await prepare(fixture('complex-deck.html'), { dryRun: true });
      expect(result.slideCount).toBe(12);
    });

    it('detects slides with custom selector', async () => {
      const result = await prepare(fixture('revealjs-deck.html'), { selector: '.reveal .slides > section', dryRun: true });
      expect(result.slideCount).toBe(3);
    });

    it('detects slides with div.page selector', async () => {
      const result = await prepare(fixture('custom-selector-deck.html'), { selector: '.page', dryRun: true });
      expect(result.slideCount).toBe(4);
    });

    it('throws when no slides found with default selector', async () => {
      await expect(prepare(fixture('revealjs-deck.html'), { dryRun: true })).rejects.toThrow('No slides detected');
    });

    it('error message includes the selector used', async () => {
      await expect(prepare(fixture('revealjs-deck.html'), { selector: '.nonexistent', dryRun: true }))
        .rejects.toThrow('.nonexistent');
    });
  });

  describe('injections', () => {
    it('injects capture.js script tag', async () => {
      const result = await prepare(fixture('minimal-deck.html'), { dryRun: true });
      expect(result.html).toContain('mcp.figma.com/mcp/html-to-design/capture.js');
    });

    it('injects capture mode marker comment', async () => {
      const result = await prepare(fixture('minimal-deck.html'), { dryRun: true });
      expect(result.html).toContain('/* html-flides capture mode */');
    });

    it('injects animation kill CSS', async () => {
      const result = await prepare(fixture('minimal-deck.html'), { dryRun: true });
      expect(result.html).toContain('transition: none !important');
      expect(result.html).toContain('animation: none !important');
    });

    it('injects auto-close script', async () => {
      const result = await prepare(fixture('minimal-deck.html'), { dryRun: true });
      expect(result.html).toContain('window.close()');
    });

    it('strips CSP meta tags', async () => {
      const result = await prepare(fixture('complex-deck.html'), { dryRun: true });
      expect(result.html).not.toContain('Content-Security-Policy');
    });

    it('embeds the selector in the capture mode script', async () => {
      const result = await prepare(fixture('revealjs-deck.html'), { selector: '.reveal .slides > section', dryRun: true });
      expect(result.html).toContain('.reveal .slides > section');
    });
  });

  describe('idempotency', () => {
    it('does not double-inject on second prepare', async () => {
      const first = await prepare(fixture('minimal-deck.html'), { dryRun: true });
      const tmpPath = join(tmpdir(), `html-flides-test-${Date.now()}.html`);
      await writeFile(tmpPath, first.html);
      const second = await prepare(tmpPath, { dryRun: true });
      const markerCount = (second.html.match(/html-flides capture mode/g) || []).length;
      expect(markerCount).toBe(1);
    });
  });

  describe('metadata', () => {
    it('returns relativeUrl with slug', async () => {
      const result = await prepare(fixture('minimal-deck.html'), { dryRun: true });
      expect(result.relativeUrl).toBe('/imports/minimal-deck.html');
    });

    it('returns the selector used', async () => {
      const result = await prepare(fixture('minimal-deck.html'), { dryRun: true });
      expect(result.selector).toBe('[data-slide]');
    });

    it('returns custom selector', async () => {
      const result = await prepare(fixture('revealjs-deck.html'), { selector: '.reveal .slides > section', dryRun: true });
      expect(result.selector).toBe('.reveal .slides > section');
    });
  });
});

describe('selfTest', () => {
  it('passes for valid prepared minimal deck', async () => {
    const { html, slideCount, selector } = await prepare(fixture('minimal-deck.html'), { dryRun: true });
    const result = selfTest(html, slideCount, selector);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes for valid prepared complex deck', async () => {
    const { html, slideCount, selector } = await prepare(fixture('complex-deck.html'), { dryRun: true });
    const result = selfTest(html, slideCount, selector);
    expect(result.valid).toBe(true);
  });

  it('passes for custom selector deck', async () => {
    const { html, slideCount, selector } = await prepare(
      fixture('revealjs-deck.html'),
      { selector: '.reveal .slides > section', dryRun: true }
    );
    const result = selfTest(html, slideCount, selector);
    expect(result.valid).toBe(true);
  });

  it('fails when capture script is missing', async () => {
    const { html, slideCount, selector } = await prepare(fixture('minimal-deck.html'), { dryRun: true });
    const broken = html.replace(/mcp\.figma\.com\/mcp\/html-to-design\/capture\.js/g, 'removed.js');
    const result = selfTest(broken, slideCount, selector);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('capture script'))).toBe(true);
  });

  it('fails when animation kill is missing', async () => {
    const { html, slideCount, selector } = await prepare(fixture('minimal-deck.html'), { dryRun: true });
    const broken = html.replace(/transition: none !important/g, '').replace(/animation: none !important/g, '');
    const result = selfTest(broken, slideCount, selector);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('animation'))).toBe(true);
  });

  it('returns slideCount in result', async () => {
    const { html, slideCount, selector } = await prepare(fixture('minimal-deck.html'), { dryRun: true });
    const result = selfTest(html, slideCount, selector);
    expect(result.slideCount).toBe(3);
  });
});
