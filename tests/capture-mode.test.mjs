import { describe, it, expect, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureMode } from '../plugin/scripts/capture-mode.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFile(join(__dirname, 'fixtures', name), 'utf8');
function dom(html) { return parseHTML(html).document; }

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
      expect(doc.querySelector('[data-slide]').getAttribute('data-slide')).toBe('0');
    });

    it('keeps last slide when index is last', () => {
      const doc = dom(html);
      captureMode(doc, 2, '[data-slide]');
      expect(doc.querySelector('[data-slide]').getAttribute('data-slide')).toBe('2');
    });
  });

  describe('custom selector', () => {
    it('works with section selector for revealjs', async () => {
      const html = await fixture('revealjs-deck.html');
      const doc = dom(html);
      captureMode(doc, 1, '.reveal .slides > section');
      expect(doc.querySelectorAll('.reveal .slides > section').length).toBe(1);
    });

    it('works with .page selector', async () => {
      const html = await fixture('custom-selector-deck.html');
      const doc = dom(html);
      captureMode(doc, 2, '.page');
      expect(doc.querySelectorAll('.page').length).toBe(1);
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
