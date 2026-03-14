# Contributing to html-flides

## Setup

1. Clone the repo
2. `npm install`
3. `npm test` to run the test suite

## Testing locally

Test the plugin in Claude Code:

```bash
claude --plugin-dir ./plugin
```

Then authenticate Figma MCP and try importing a deck.

## Running tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
```

Tests use vitest + linkedom (no browser required).

## Adding test fixtures

Add HTML files to `tests/fixtures/`. Each fixture should be a self-contained HTML file with a known slide structure.

## Project structure

```
plugin/                 # The Claude Code plugin
  scripts/
    capture-mode.mjs    # Shared slide isolation function
    prepare.mjs         # Deck transformer + self-test
    self-test.mjs       # Preparation validator
    serve.mjs           # Static file server
  commands/
    import.md           # /html-flides:import command
    qa.md               # /html-flides:qa command
tests/                  # Test suite
  fixtures/             # HTML deck fixtures
  capture-mode.test.mjs
  prepare.test.mjs
```

## Pull requests

- Write tests for new functionality
- Run `npm test` before submitting
- Keep PRs focused on a single change
