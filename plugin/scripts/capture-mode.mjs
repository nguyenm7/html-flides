/**
 * Shared slide isolation logic for html-flides.
 * Used both in the browser (inlined by prepare) and in selfTest (imported directly).
 *
 * @param {Document} document - DOM document (real browser or linkedom)
 * @param {number} slideIndex - 0-based index by DOM order
 * @param {string} selector - CSS selector that identifies slide elements
 */
export function captureMode(document, slideIndex, selector) {
  // 1. Find target slide by selector and DOM order
  var slides = Array.from(document.querySelectorAll(selector));
  var target = slides[slideIndex];
  if (!target) return;

  // 2. Clone the target slide
  var clone = target.cloneNode(true);

  // 3. Nuke the entire body — remove ALL children
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);

  // 4. Create a clean wrapper at exactly 1920x1080
  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:1920px;height:1080px;overflow:hidden;position:relative;margin:0;padding:0;';

  // 5. Force slide dimensions and clip
  clone.style.cssText = 'position:relative;width:1920px;height:1080px;overflow:hidden;clip-path:inset(0);opacity:1;transform:none;display:block;';

  // 6. Assemble: wrapper > slide
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  // 7. Force document dimensions
  document.documentElement.style.cssText = 'width:1920px;height:1080px;overflow:hidden;margin:0;padding:0;';
  document.body.style.cssText = 'width:1920px;height:1080px;overflow:hidden;margin:0;padding:0;';
}
