# Diagrav — Project Vision & Architecture

## 1. Core Principles

- **Two-Part Framework:**
  1. **`@diagrav/core`** (`packages/core`) — Framework-free TypeScript rendering & editing engine. Runs in two modes:
     - `readonly`: Lightweight embeddable viewer (pan, zoom, inspect) for docs, blogs, and apps.
     - `editor`: Full interactive diagramming engine.
  2. **`@diagrav/ui`** (`packages/ui`) — Web studio app hosting `@diagrav/core` with toolbars, palette, and property inspectors.
- **Gradual, Indefinitely Extensible Foundation:** Start clean with core building blocks and clean registries so shapes, edge routers, label models, formats, and plugins can grow without rewrites.
- **yEd Graph Editor UI Philosophy:** Predictable, direct, and never "over-smart".
  - Explicit **Palette** (right dock) for drag-and-drop shapes.
  - Explicit **Properties View** (left dock) for live editing of selected elements.
  - **yEd-style connections:** Drag from a node/port to connect; click-drag an edge to insert bend points; double-click a bend to remove it; orthogonal mode is an explicit toggle, not forced magic.
  - **Direct label editing:** Double-click or `F2` edits labels inline.
- **Extensible Visual Properties:**
  - **Shapes:** Border options (color, width, dash, radius, opacity), fill options (solid, linear/radial gradients, none), drop shadow, label placement models (`internal`, `external`, `free`), and full label typography/color/background properties.
  - **Connections:** Routing (`polyline`, `orthogonal`, `straight`, `bezier`), manual bends, stroke color/width/dash/opacity, source & target arrowheads, and full edge label placement & styling.

## 2. Storage Format

- **Primary Format:** Canonical versioned JSON (`.diagrav.json`, `schemaVersion: 1`).
  - Fast in browser, clean Git diffs, strict validation, extensible `data` and `extensions` fields, ideal for AI/MCP edits.
- **Adapters (Planned):**
  - **SVG + embedded JSON** (implemented for export; re-open adapter planned).
  - **GraphML (XML)** import/export for interoperability with yEd.

## 3. UI Framework — Jenni UI

- `@diagrav/ui` is built with **Jenni UI** (`jenni-core` + `jenni-react`, React 19): https://github.com/ravish-tech/Jenni
- **Potential Jenni UI Enhancements** (to request from the Jenni maintainer as Diagrav matures):
  1. `Toolbar` / `MenuBar` with roving keyboard focus (File/Edit/View menus).
  2. `GradientPicker` (linear/radial stops + angle, extending `ColorPicker`).
  3. Compact `PropertyRow` / `InspectorSection` primitives for dense 2-column property panels.
  4. `SplitButton` (primary action + format dropdown).

## 4. AI-Ready Design (Claude & Google Agents)

- Every mutation flows through a typed, serializable, undoable **Command Bus** (`CommandEngine`) in `@diagrav/core`.
- `CommandEngine` runs identically in the browser and headless in Node.js.
- **Planned Phase 3 (`@diagrav/mcp`):**
  - MCP server exposing diagram inspection & editing tools (`get_diagram`, `add_node`, `update_node`, `connect_nodes`, `update_edge`, `set_label`, `apply_batch`, `export_svg`).
  - **Live WebSocket Bridge:** Lets Claude/Google agents edit an open diagram in real time while the user watches and can Undo/Redo any AI step.
  - **Headless Mode:** Create/edit `.diagrav.json` files and export SVGs directly on disk.

## 5. Roadmap

1. **Phase 1 (Done):** `@diagrav/core` JSON v1 schema, Command Bus + undo/redo, Shape/Edge/Label registries, SVG renderer (`readonly` & `editor`).
2. **Phase 2 (Done):** `@diagrav/ui` Jenni UI studio, Palette, Properties Inspector, 4 samples, Embed Demo, GitHub Actions CI & Pages.
3. **Phase 3 (Next):** UI verification & review polish, then `@diagrav/mcp` + live bridge for AI control.
4. **Phase 4 (Later):** Grouping/nesting, GraphML adapter, Overview minimap, Structure tree, Auto-layout, custom shape plugins.
