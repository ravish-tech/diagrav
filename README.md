# Diagrav

Extensible diagram engine (`@diagrav/core`) and yEd-inspired diagram studio (`@diagrav/ui`) built with [Jenni UI](https://github.com/ravish-tech/Jenni), designed to be AI-ready from day one.

- **Live Demo & Samples:** https://ravish-tech.github.io/diagrav/
- **Repository:** https://github.com/ravish-tech/diagrav

## Architecture

- **`packages/core` (`@diagrav/core`)** — Zero-framework TypeScript diagram engine.
  - Supports `readonly` (embeddable viewer) and `editor` (full yEd-style editor) modes.
  - Undoable Command Bus (shared by human UI and future AI/MCP agents).
  - Extensible `ShapeRegistry`, `EdgeRouterRegistry`, and `LabelPlacementRegistry`.
  - Canonical `.diagrav.json` (v1) storage format + standalone SVG export.
- **`packages/ui` (`@diagrav/ui`)** — React 19 + Jenni UI studio app.
  - Drag-and-drop shape palette, live properties inspector, sample switcher, and Embed Demo page.

## Quick Start

```bash
npm install
npm run dev        # Start studio at http://localhost:5174
npm run typecheck  # Typecheck core and UI
npm run build      # Build core and static UI bundle
npm run test       # Run headless core engine tests
```
