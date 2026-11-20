#!/usr/bin/env node
import type { DiagramCommand, EdgePatch, FillStyle, NodePatch } from '@diagrav/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DiagravBridgeServer } from './bridge.js';
import { DiagravMcpSession } from './session.js';

function jsonText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

async function main() {
  const session = new DiagravMcpSession();

  const initialFile = process.env.DIAGRAV_FILE;
  if (initialFile) {
    try {
      session.loadDiagram(initialFile);
    } catch (err) {
      process.stderr.write(
        `[diagrav-mcp] Could not load DIAGRAV_FILE (${initialFile}): ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  const bridgePort = Number(process.env.DIAGRAV_BRIDGE_PORT ?? 4175);
  const bridge = new DiagravBridgeServer(bridgePort, {
    onStudioSync: (doc) => session.syncFromStudio(doc),
    getCurrentDocument: () => session.engine.getDocument(),
  });
  session.attachBridge(bridge);
  await bridge.start();

  const server = new McpServer({
    name: 'diagrav',
    version: '0.1.0',
  });

  server.tool(
    'get_diagram',
    'Inspect the current Diagrav diagram (summary or full .diagrav.json document).',
    { summaryOnly: z.boolean().optional().describe('Return compact node/edge summary only') },
    async ({ summaryOnly }) => jsonText(session.getDiagram(Boolean(summaryOnly))),
  );

  server.tool(
    'list_shapes',
    'List all available shape types and their default dimensions.',
    {},
    async () => jsonText(session.listShapes()),
  );

  server.tool(
    'create_diagram',
    'Create a fresh empty diagram with the given title.',
    { title: z.string().optional().describe('Diagram title') },
    async ({ title }) => jsonText(session.createDiagram(title)),
  );

  server.tool(
    'load_diagram',
    'Load a canonical .diagrav.json file from disk.',
    { filePath: z.string().describe('Absolute or relative path to a .diagrav.json file') },
    async ({ filePath }) => jsonText(session.loadDiagram(filePath)),
  );

  server.tool(
    'save_diagram',
    'Save the current diagram to a .diagrav.json file on disk.',
    { filePath: z.string().describe('Destination path for the .diagrav.json file') },
    async ({ filePath }) => jsonText(session.saveDiagram(filePath)),
  );

  server.tool(
    'add_node',
    'Add a new shape node to the diagram.',
    {
      id: z.string().optional().describe('Optional explicit node ID'),
      type: z
        .string()
        .optional()
        .describe('Shape type: rect, rounded-rect, ellipse, diamond, hexagon, parallelogram'),
      label: z.string().optional().describe('Primary node label text'),
      x: z.number().optional().describe('X coordinate in world pixels'),
      y: z.number().optional().describe('Y coordinate in world pixels'),
      width: z.number().optional().describe('Node width in world pixels'),
      height: z.number().optional().describe('Node height in world pixels'),
      fillColor: z.string().optional().describe('Solid fill hex color (e.g. #eff6ff)'),
      fill: z.unknown().optional().describe('Full FillStyle object (solid, linear-gradient, radial-gradient, none)'),
      borderColor: z.string().optional().describe('Border stroke hex color'),
      borderWidth: z.number().optional().describe('Border stroke width'),
      borderRadius: z.number().optional().describe('Corner radius for rectangles'),
      shadow: z.boolean().optional().describe('Enable subtle drop shadow'),
    },
    async (args) =>
      jsonText(
        session.addNode({
          ...args,
          fill: args.fill as FillStyle | undefined,
        }),
      ),
  );

  server.tool(
    'update_node',
    'Patch an existing node (geometry, style, type, labels, data).',
    {
      id: z.string().describe('Node ID to update'),
      patch: z.record(z.unknown()).describe('NodePatch object'),
    },
    async ({ id, patch }) => jsonText(session.updateNode(id, patch as NodePatch)),
  );

  server.tool(
    'delete_node',
    'Delete a node and all edges connected to it.',
    { id: z.string().describe('Node ID to delete') },
    async ({ id }) => jsonText(session.deleteNode(id)),
  );

  server.tool(
    'connect_nodes',
    'Create a connection edge between two nodes.',
    {
      id: z.string().optional().describe('Optional explicit edge ID'),
      sourceNodeId: z.string().describe('Source node ID'),
      targetNodeId: z.string().describe('Target node ID'),
      routing: z.enum(['straight', 'polyline', 'orthogonal', 'bezier']).optional(),
      label: z.string().optional().describe('Optional edge label text'),
      bends: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
      stroke: z.string().optional().describe('Stroke hex color'),
      width: z.number().optional().describe('Stroke width'),
      dash: z.array(z.number()).optional().describe('Dash pattern e.g. [6, 4]'),
      sourceArrow: z.enum(['none', 'standard', 'triangle', 'open', 'diamond', 'circle']).optional(),
      targetArrow: z.enum(['none', 'standard', 'triangle', 'open', 'diamond', 'circle']).optional(),
    },
    async (args) => jsonText(session.connectNodes(args)),
  );

  server.tool(
    'update_edge',
    'Patch an existing edge (routing, bends, style, labels).',
    {
      id: z.string().describe('Edge ID to update'),
      patch: z.record(z.unknown()).describe('EdgePatch object'),
    },
    async ({ id, patch }) => jsonText(session.updateEdge(id, patch as EdgePatch)),
  );

  server.tool(
    'delete_edge',
    'Delete an edge by ID.',
    { id: z.string().describe('Edge ID to delete') },
    async ({ id }) => jsonText(session.deleteEdge(id)),
  );

  server.tool(
    'set_label',
    'Set or update the primary label text on a node or edge.',
    {
      targetKind: z.enum(['node', 'edge']),
      targetId: z.string(),
      text: z.string(),
    },
    async ({ targetKind, targetId, text }) => jsonText(session.setLabel(targetKind, targetId, text)),
  );

  server.tool(
    'align_nodes',
    'Align 2 or more nodes along a shared edge or center axis.',
    {
      nodeIds: z.array(z.string()).min(2),
      alignment: z.enum(['left', 'center-x', 'right', 'top', 'middle-y', 'bottom']),
    },
    async ({ nodeIds, alignment }) => jsonText(session.alignNodes(nodeIds, alignment)),
  );

  server.tool(
    'distribute_nodes',
    'Distribute 3 or more nodes with equal gaps or equal center spacing.',
    {
      nodeIds: z.array(z.string()).min(3),
      mode: z.enum(['horizontal-gaps', 'vertical-gaps', 'horizontal-centers', 'vertical-centers']),
    },
    async ({ nodeIds, mode }) => jsonText(session.distributeNodes(nodeIds, mode)),
  );

  server.tool(
    'match_size',
    'Match width, height, or both of 2+ nodes to the first node in nodeIds.',
    {
      nodeIds: z.array(z.string()).min(2),
      mode: z.enum(['width', 'height', 'both']),
    },
    async ({ nodeIds, mode }) => jsonText(session.matchSize(nodeIds, mode)),
  );

  server.tool(
    'apply_batch',
    'Execute multiple typed @diagrav/core DiagramCommands as a single atomic Undo step.',
    {
      commands: z.array(z.record(z.unknown())).describe('Array of DiagramCommand objects'),
      label: z.string().optional().describe('Optional human-readable batch description'),
    },
    async ({ commands, label }) =>
      jsonText(session.applyBatch(commands as unknown as DiagramCommand[], label)),
  );

  server.tool('undo', 'Undo the last diagram change.', {}, async () => jsonText(session.undo()));

  server.tool('redo', 'Redo the last undone diagram change.', {}, async () => jsonText(session.redo()));

  server.tool(
    'export_svg',
    'Export the current diagram as a standalone SVG string (and optionally write to a .svg file).',
    {
      filePath: z.string().optional().describe('Optional path to write the exported .svg file'),
    },
    async ({ filePath }) => jsonText(session.exportSvg(filePath)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', async () => {
    await bridge.close();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`[diagrav-mcp] Fatal error: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
