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
