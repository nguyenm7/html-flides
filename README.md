# html-flides

Turn any HTML slide deck into editable Figma Slides.

A Claude Code plugin that imports HTML presentations into Figma Design as pixel-perfect 1920x1080 frames — ready to copy into Figma Slides.

## Compatibility

| Platform | Status | Notes |
|----------|--------|-------|
| Claude Code | Works | Full support via Figma MCP |
| Claude Cowork | Not yet | Figma MCP OAuth not supported in Cowork ([tracking](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)) |

The plugin structure is Cowork-ready (skills format, marketplace manifest). It will work in Cowork as soon as the Figma MCP server supports Cowork's auth flow — no code changes needed.

## Quick Start (Claude Code)

```
1. claude --plugin-dir /path/to/html-flides/plugin
2. /mcp  → authenticate Figma
3. /html-flides:import /path/to/deck.html
4. /html-flides:qa <figma-url>
```

## Supported Formats

| Format | Selector |
|--------|----------|
| Claude / enterpret-slides | `[data-slide]` (default) |
| Reveal.js | `--selector '.reveal .slides > section'` |
| Remark | `--selector '.remark-slide-container'` |
| Marp | `--selector 'section'` |
| Custom | `--selector 'your-selector'` |

## How It Works

1. **`prepare()`** transforms the deck HTML before capture:
   - Kills animations and transitions
   - Strips Content Security Policy headers
   - Injects capture mode — isolates one slide per URL param at 1920x1080
   - Injects the Figma capture script

2. **`selfTest()`** validates the prepared HTML before touching Figma, catching selector mismatches and slide count issues early.

3. **Sequential capture loop** — one slide per browser tab, auto-closed after capture, keeping Figma's import pipeline clean.

4. **QA command** — verifies all imported frame dimensions in Figma are exactly 1920x1080.

## Getting into Figma Slides

html-flides imports into Figma Design. See [docs/figma-slides-guide.md](docs/figma-slides-guide.md) for instructions on moving your frames into a Figma Slides presentation.

## Known Limitations

- **Claude Cowork not supported yet** — the Figma MCP server's OAuth flow doesn't work in Cowork. Plugin is structurally ready; blocked on Figma/Cowork MCP auth support.
- Imports into Figma Design (not Figma Slides directly)
- Charts render as raster images
- External assets (relative CSS/images) are not copied — decks should be self-contained
- `window.close()` may be blocked by some browsers

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
