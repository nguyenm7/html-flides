---
name: import
description: Import a local HTML slide deck into Figma Design as editable 1920x1080 frames. Use when the user says "import deck", "import slides to figma", "html to figma", or provides an HTML file path to import. Usage: /html-flides:import /path/to/deck.html [--selector 'CSS selector']
---

# HTML Deck Import

Import a local HTML slide deck into Figma Design through Figma MCP.

## Inputs

- `$ARGUMENTS` must contain the absolute path to the source HTML file.
- Optional `--selector 'CSS selector'` to specify how to identify slides. Default: `[data-slide]`.
- If the user includes a desired file name, use it; otherwise derive from deck basename.

## Supported formats

| Deck format | Selector |
|-------------|----------|
| Claude/enterpret-slides | `[data-slide]` (default) |
| Reveal.js | `--selector '.reveal .slides > section'` |
| Remark | `--selector '.remark-slide-container'` |
| Marp | `--selector 'section'` |

## Workflow

1. If `$ARGUMENTS` is empty, ask the user for the absolute HTML file path and stop.

2. Parse `--selector` from arguments if present. Default to `[data-slide]`.

3. **Ensure dependencies are installed.** Check that `linkedom` is available:
   ```bash
   node -e "require.resolve('linkedom')" 2>/dev/null || npm install linkedom --prefix "${CLAUDE_PLUGIN_ROOT}"
   ```

4. **Run the prepare script** (which automatically runs self-test):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/prepare.mjs" "$HTML_PATH" --selector "$SELECTOR"
   ```
   Parse the returned JSON for `outputPath`, `relativeUrl`, `slideCount`, `selector`.
   If it exits with a non-zero code, the prepare or self-test failed. Print the stderr output and stop. Do not touch Figma.

5. **Ensure the plugin static server is running and serving the correct directory:**
   ```bash
   curl -s http://localhost:4173/health 2>/dev/null
   ```
   Parse the JSON response. If it returns `"plugin":"html-flides"`, check that the `root` field in the response matches the expected runtime directory (the parent of `outputPath`). If `root` does not match, kill the stale server and restart:
   ```bash
   lsof -ti:4173 | xargs kill -9 2>/dev/null
   node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs" &
   ```
   If no server is running, start it:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs" &
   ```
   Wait 1 second for the server to start.

6. **Preflight check — verify the prepared file is accessible:**
   ```bash
   curl -sf "http://localhost:4173${relativeUrl}" -o /dev/null
   ```
   If this fails, the server is not serving the correct directory. Stop and report the error. Do NOT open the browser or generate a capture ID.

7. **Print progress header:**
   ```
   Importing <slideCount> slides to Figma...
   ```

8. **Destination selection.** Default to creating a new file (deck imports almost always want a new file). Call `generate_figma_design` with no arguments to get the user's Figma destination options. Suggest: "I'll create a new file in your Figma team. Which team should I use?" Only ask about existing file if the user explicitly requests it.

9. **Open a capture window** (macOS: single off-screen Chrome window):
   For slide 0:
   - Call `generate_figma_design` with `outputMode: "newFile"` (or `"existingFile"`) and the chosen plan/file.
   - Build the capture URL:
     ```
     http://localhost:4173<relativeUrl>?slide=0#figmacapture=<captureId>&figmaendpoint=<encoded-endpoint>&figmadelay=3000
     ```
   - Open the capture window:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/capture-window.mjs" open "<captureUrl>"
     ```
   - Wait 5 seconds, then poll `generate_figma_design` with the `captureId`. Poll up to 10 times (5s between) until status is `completed`.
   - **If 3 consecutive polls return `pending`:** auto-retry by re-navigating to the same URL:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/capture-window.mjs" nav "<captureUrl>"
     ```
     Then resume polling (up to 10 more polls).
   - Extract `fileKey` from the response.
   - Log: `[1/<slideCount>] Slide 1 captured ✓`

10. **For each remaining slide 1 to slideCount-1:**
    - Wait 2 seconds after the previous capture completes (prevents tab race conditions).
    - Call `generate_figma_design` with `outputMode: "existingFile"` and the `fileKey`.
    - Navigate the existing capture window:
      ```bash
      node "${CLAUDE_PLUGIN_ROOT}/scripts/capture-window.mjs" nav "<captureUrl>"
      ```
    - Poll — same as slide 0 (with auto-retry on 3 consecutive pending).
    - Log: `[N/<slideCount>] Slide N captured ✓`
    - On failure (10 polls + retry exhausted): log `[N/<slideCount>] Slide N FAILED — skipping`, continue to next slide. Do not abort.

11. **Close the capture window:**
    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/capture-window.mjs" close
    ```

12. After all slides: call `get_metadata` on the first and last imported frame nodes. Verify both are 1920x1080. Report any drift.

13. **Print final report:**
    ```
    Import complete — <figmaFileUrl>

    <successCount>/<slideCount> slides captured
    Frame sizes: 1920×1080 (first: ✓, last: ✓)
    Failed slides: <list or "none">
    Drifted frames: <list or "none">
    ```

## Rules

- One slide per capture. Never capture the entire page at once.
- Sequential capture — generate each capture ID immediately before use.
- Use `figmadelay=3000` universally.
- Always use `capture-window.mjs` instead of raw `open` commands to avoid tab storms.
- Wait 2 seconds between captures to avoid tab race conditions.
- If top-level frame exceeds 1920x1080, identify the inner body frame as canonical.
