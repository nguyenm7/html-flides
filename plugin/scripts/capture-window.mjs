/**
 * Single-window browser capture helper for html-flides.
 * Opens one off-screen Chrome window and reuses it for all slides,
 * eliminating the tab storm that occurs with `open` per slide.
 *
 * Usage (from skill workflow):
 *   node capture-window.mjs open  <url>   — open a new off-screen Chrome window
 *   node capture-window.mjs nav   <url>   — navigate the existing window to a new URL
 *   node capture-window.mjs close          — close the capture window
 *
 * macOS: uses AppleScript for window management (zero dependencies).
 * Other platforms: falls back to `open`/`xdg-open` (tab-per-slide behavior).
 */

import { execFile as execFileCb } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);
const isMac = platform() === 'darwin';

async function openWindow(url) {
  if (isMac) {
    // Open a new Chrome window, sized to 1920x1080, positioned off-screen
    await execFile('open', [
      '-na', 'Google Chrome', '--args',
      '--new-window',
      '--window-size=1920,1080',
      '--window-position=9999,0',
      url,
    ]);
    // Give Chrome a moment to create the window
    await new Promise(r => setTimeout(r, 1500));
    console.log(JSON.stringify({ action: 'open', url, platform: 'darwin' }));
  } else {
    // Fallback: standard open (will create a new tab)
    const opener = platform() === 'win32' ? 'start' : 'xdg-open';
    await execFile(opener, [url]);
    console.log(JSON.stringify({ action: 'open', url, platform: platform(), fallback: true }));
  }
}

async function navigateWindow(url) {
  if (isMac) {
    // Reuse the frontmost Chrome window — navigate its active tab
    const script = `
      tell application "Google Chrome"
        if (count of windows) > 0 then
          set URL of active tab of front window to "${url}"
        else
          open location "${url}"
        end if
      end tell
    `;
    await execFile('osascript', ['-e', script]);
    console.log(JSON.stringify({ action: 'nav', url, platform: 'darwin' }));
  } else {
    // Fallback: open a new tab (no cross-platform way to reuse)
    const opener = platform() === 'win32' ? 'start' : 'xdg-open';
    await execFile(opener, [url]);
    console.log(JSON.stringify({ action: 'nav', url, platform: platform(), fallback: true }));
  }
}

async function closeWindow() {
  if (isMac) {
    const script = `
      tell application "Google Chrome"
        if (count of windows) > 0 then
          close front window
        end if
      end tell
    `;
    await execFile('osascript', ['-e', script]);
    console.log(JSON.stringify({ action: 'close', platform: 'darwin' }));
  } else {
    console.log(JSON.stringify({ action: 'close', platform: platform(), note: 'manual close required' }));
  }
}

// CLI entry point
const [,, action, url] = process.argv;

if (!action || !['open', 'nav', 'close'].includes(action)) {
  console.error('Usage: node capture-window.mjs <open|nav|close> [url]');
  process.exit(1);
}

if (action !== 'close' && !url) {
  console.error(`Usage: node capture-window.mjs ${action} <url>`);
  process.exit(1);
}

try {
  if (action === 'open') await openWindow(url);
  else if (action === 'nav') await navigateWindow(url);
  else await closeWindow();
} catch (err) {
  console.error(JSON.stringify({ action, error: err.message }));
  process.exit(1);
}
