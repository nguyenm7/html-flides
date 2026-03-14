# Getting into Figma Slides

html-flides imports into Figma Design. To get your slides into Figma Slides:

## Manual workflow

1. Open the imported Figma Design file
2. Select all frames (Cmd+A / Ctrl+A)
3. Copy (Cmd+C / Ctrl+C)
4. Open or create a new Figma Slides file
5. Paste (Cmd+V / Ctrl+V) — frames become individual slides
6. Adjust slide order if needed

## Tips

- Make sure all frames are 1920x1080 before pasting (run `/html-flides:qa` to verify)
- If frames have wrapper drift, resize the outer frame to 1920x1080 first
- Figma Slides may adjust text styling slightly — review after pasting

## Future automation

If Figma releases a Slides API or MCP tool, html-flides will automate this step.
