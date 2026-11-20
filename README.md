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
  - Floating & dockable Left/Right control panels (Properties, Palette, Review Notes), live smart alignment/spacing guides, color-coded JSON viewer, sample switcher, AI Bridge toggle, and Embed Demo page.
- **`packages/mcp` (`@diagrav/mcp`)** — MCP server + live WebSocket bridge for Claude & Google agents.
  - 19 stdio MCP tools (`get_diagram`, `add_node`, `connect_nodes`, `align_nodes`, `distribute_nodes`, `apply_batch`, `undo`, `redo`, `export_svg`, etc.) supporting both headless file generation and real-time Studio editing.

## Quick Start

```bash
npm install
npm run dev        # Start studio at http://localhost:5174
npm run typecheck  # Typecheck core, mcp, and UI
npm run build      # Build core, mcp, and static UI bundle
npm run test       # Run core & MCP unit tests
```

## MCP Configuration (Claude / Google Agents)

```json
{
  "mcpServers": {
    "diagrav": {
      "command": "node",
      "args": ["/path/to/diagrav/packages/mcp/dist/index.js"],
      "env": { "DIAGRAV_BRIDGE_PORT": "4175" }
    }
  }
}
```
