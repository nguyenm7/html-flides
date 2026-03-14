---
description: Import a local HTML slide deck into Figma Design as editable 1920x1080 frames. Usage: /html-flides:import /path/to/deck.html [--selector 'CSS selector']
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
