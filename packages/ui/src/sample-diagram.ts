import type { DiagramDocument } from '@diagrav/core';

export const SAMPLE_DIAGRAM: DiagramDocument = {
  schemaVersion: 1,
  meta: {
    title: 'Diagrav Architecture',
  },
  viewport: { x: 40, y: 40, zoom: 1 },
  nodes: [
    {
      id: 'node_ui',
      type: 'rounded-rect',
      geometry: { x: 80, y: 120, width: 170, height: 72, rotation: 0 },
      style: {
        fill: {
          type: 'linear-gradient',
          angle: 135,
          stops: [
            { color: '#eff6ff', offset: 0 },
            { color: '#dbeafe', offset: 1 },
          ],
        },
        border: { color: '#2563eb', width: 1.75, radius: 10, opacity: 1 },
        shadow: true,
      },
      labels: [
        {
          id: 'lbl_ui',
          text: '@diagrav/ui (Jenni)',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#1e3a8a', align: 'center' },
        },
      ],
    },
    {
      id: 'node_core',
      type: 'rounded-rect',
      geometry: { x: 350, y: 120, width: 180, height: 72, rotation: 0 },
      style: {
        fill: {
          type: 'linear-gradient',
          angle: 135,
          stops: [
            { color: '#f0fdf4', offset: 0 },
            { color: '#dcfce7', offset: 1 },
          ],
        },
        border: { color: '#16a34a', width: 1.75, radius: 10, opacity: 1 },
        shadow: true,
      },
      labels: [
        {
          id: 'lbl_core',
          text: '@diagrav/core Engine',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#14532d', align: 'center' },
        },
      ],
    },
    {
      id: 'node_mcp',
      type: 'hexagon',
      geometry: { x: 360, y: 270, width: 160, height: 72, rotation: 0 },
      style: {
        fill: {
          type: 'linear-gradient',
          angle: 135,
          stops: [
            { color: '#faf5ff', offset: 0 },
            { color: '#f3e8ff', offset: 1 },
          ],
        },
        border: { color: '#9333ea', width: 1.75, radius: 0, opacity: 1 },
        shadow: true,
      },
      labels: [
        {
          id: 'lbl_mcp',
          text: '@diagrav/mcp (AI)',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#581c87', align: 'center' },
        },
      ],
    },
    {
      id: 'node_json',
      type: 'ellipse',
      geometry: { x: 630, y: 120, width: 150, height: 72, rotation: 0 },
      style: {
        fill: { type: 'solid', color: '#fff7ed', opacity: 1 },
        border: { color: '#ea580c', width: 1.75, radius: 0, opacity: 1 },
        shadow: false,
      },
      labels: [
        {
          id: 'lbl_json',
          text: '.diagrav.json',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#7c2d12', align: 'center' },
        },
      ],
    },
  ],
  edges: [
    {
      id: 'edge_ui_core',
      source: { nodeId: 'node_ui' },
      target: { nodeId: 'node_core' },
      routing: 'polyline',
      bends: [],
      style: {
        stroke: '#475569',
        width: 1.75,
        sourceArrow: 'none',
        targetArrow: 'standard',
      },
      labels: [
        {
          id: 'lbl_e1',
          text: 'Commands',
          placement: { model: 'center', distance: -12 },
          style: { fontSize: 11, fontWeight: 500, color: '#334155', background: '#f8fafc', padding: 3 },
        },
      ],
    },
    {
      id: 'edge_mcp_core',
      source: { nodeId: 'node_mcp' },
      target: { nodeId: 'node_core' },
      routing: 'polyline',
      bends: [],
      style: {
        stroke: '#9333ea',
        width: 1.75,
        dash: [5, 4],
        sourceArrow: 'none',
        targetArrow: 'standard',
      },
      labels: [
        {
          id: 'lbl_e2',
          text: 'MCP / WS',
          placement: { model: 'center', distance: 34 },
          style: { fontSize: 11, fontWeight: 500, color: '#6b21a8', background: '#f8fafc', padding: 3 },
        },
      ],
    },
    {
      id: 'edge_core_json',
      source: { nodeId: 'node_core' },
      target: { nodeId: 'node_json' },
      routing: 'polyline',
      bends: [],
      style: {
        stroke: '#475569',
        width: 1.75,
        sourceArrow: 'none',
        targetArrow: 'standard',
      },
      labels: [
        {
          id: 'lbl_e3',
          text: 'State',
          placement: { model: 'center', distance: -12 },
          style: { fontSize: 11, fontWeight: 500, color: '#334155', background: '#f8fafc', padding: 3 },
        },
      ],
    },
  ],
};
