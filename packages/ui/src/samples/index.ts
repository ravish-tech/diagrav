import { createEmptyDocument, type DiagramDocument } from '@diagrav/core';
import { SAMPLE_DIAGRAM } from '../sample-diagram';

export interface SampleEntry {
  id: string;
  name: string;
  description: string;
  document: DiagramDocument;
}

export const PIPELINE_SAMPLE: DiagramDocument = {
  schemaVersion: 1,
  meta: { title: 'CI/CD Release Pipeline' },
  viewport: { x: 30, y: 40, zoom: 1 },
  nodes: [
    {
      id: 'p_push',
      type: 'rounded-rect',
      geometry: { x: 40, y: 140, width: 130, height: 56, rotation: 0 },
      style: {
        fill: {
          type: 'linear-gradient',
          angle: 180,
          stops: [
            { color: '#f8fafc', offset: 0 },
            { color: '#e2e8f0', offset: 1 },
          ],
        },
        border: { color: '#475569', width: 1.5, radius: 10 },
        shadow: true,
      },
      labels: [
        {
          id: 'pl_1',
          text: 'Git Push',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#0f172a' },
        },
      ],
    },
    {
      id: 'p_build',
      type: 'rect',
      geometry: { x: 230, y: 140, width: 150, height: 56, rotation: 0 },
      style: {
        fill: {
          type: 'linear-gradient',
          angle: 135,
          stops: [
            { color: '#eff6ff', offset: 0 },
            { color: '#dbeafe', offset: 1 },
          ],
        },
        border: { color: '#2563eb', width: 1.75, radius: 4 },
        shadow: true,
      },
      labels: [
        {
          id: 'pl_2',
          text: 'Typecheck & Build',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#1e3a8a' },
        },
      ],
    },
    {
      id: 'p_gate',
      type: 'diamond',
      geometry: { x: 450, y: 118, width: 120, height: 100, rotation: 0 },
      style: {
        fill: { type: 'solid', color: '#fefce8' },
        border: { color: '#ca8a04', width: 1.75 },
        shadow: true,
      },
      labels: [
        {
          id: 'pl_3',
          text: 'Tests Pass?',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 12, fontWeight: 600, color: '#713f12' },
        },
      ],
    },
    {
      id: 'p_deploy',
      type: 'rounded-rect',
      geometry: { x: 650, y: 60, width: 155, height: 56, rotation: 0 },
      style: {
        fill: {
          type: 'linear-gradient',
          angle: 135,
          stops: [
            { color: '#f0fdf4', offset: 0 },
            { color: '#bbf7d0', offset: 1 },
          ],
        },
        border: { color: '#16a34a', width: 1.75, radius: 12 },
        shadow: true,
      },
      labels: [
        {
          id: 'pl_4',
          text: 'Deploy Pages',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#14532d' },
        },
      ],
    },
    {
      id: 'p_notify',
      type: 'parallelogram',
      geometry: { x: 645, y: 220, width: 165, height: 56, rotation: 0 },
      style: {
        fill: { type: 'solid', color: '#fef2f2' },
        border: { color: '#dc2626', width: 1.75, dash: [6, 4] },
      },
      labels: [
        {
          id: 'pl_5',
          text: 'Notify Author',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#991b1b' },
        },
      ],
    },
  ],
  edges: [
    {
      id: 'pe_1',
      source: { nodeId: 'p_push' },
      target: { nodeId: 'p_build' },
      routing: 'straight',
      bends: [],
      style: { stroke: '#475569', width: 1.75, sourceArrow: 'none', targetArrow: 'standard' },
      labels: [],
    },
    {
      id: 'pe_2',
      source: { nodeId: 'p_build' },
      target: { nodeId: 'p_gate' },
      routing: 'straight',
      bends: [],
      style: { stroke: '#475569', width: 1.75, sourceArrow: 'none', targetArrow: 'standard' },
      labels: [],
    },
    {
      id: 'pe_3',
      source: { nodeId: 'p_gate' },
      target: { nodeId: 'p_deploy' },
      routing: 'orthogonal',
      bends: [{ x: 510, y: 88 }],
      style: { stroke: '#16a34a', width: 2, sourceArrow: 'none', targetArrow: 'standard' },
      labels: [
        {
          id: 'pel_1',
          text: 'Affirm',
          placement: { model: 'center', distance: -12 },
          style: { fontSize: 11, fontWeight: 600, color: '#15803d', background: '#f8fafc', padding: 3 },
        },
      ],
    },
    {
      id: 'pe_4',
      source: { nodeId: 'p_gate' },
      target: { nodeId: 'p_notify' },
      routing: 'orthogonal',
      bends: [{ x: 510, y: 248 }],
      style: { stroke: '#dc2626', width: 1.75, dash: [5, 4], sourceArrow: 'none', targetArrow: 'open' },
      labels: [
        {
          id: 'pel_2',
          text: 'Fail',
          placement: { model: 'center', distance: 14 },
          style: { fontSize: 11, fontWeight: 600, color: '#b91c1c', background: '#f8fafc', padding: 3 },
        },
      ],
    },
  ],
};

export const TOPOLOGY_SAMPLE: DiagramDocument = {
  schemaVersion: 1,
  meta: { title: 'Microservices Topology' },
  viewport: { x: 40, y: 30, zoom: 1 },
  nodes: [
    {
      id: 't_cdn',
      type: 'ellipse',
      geometry: { x: 60, y: 150, width: 130, height: 68, rotation: 0 },
      style: {
        fill: {
          type: 'radial-gradient',
          cx: 0.5,
          cy: 0.5,
          r: 0.7,
          stops: [
            { color: '#ffffff', offset: 0 },
            { color: '#e0f2fe', offset: 1 },
          ],
        },
        border: { color: '#0284c7', width: 1.75 },
        shadow: true,
      },
      labels: [
        {
          id: 'tl_1',
          text: 'Edge Gateway',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#0c4a6e' },
        },
      ],
    },
    {
      id: 't_api',
      type: 'hexagon',
      geometry: { x: 280, y: 150, width: 150, height: 68, rotation: 0 },
      style: {
        fill: {
          type: 'linear-gradient',
          angle: 135,
          stops: [
            { color: '#eef2ff', offset: 0 },
            { color: '#c7d2fe', offset: 1 },
          ],
        },
        border: { color: '#4f46e5', width: 1.75 },
        shadow: true,
      },
      labels: [
        {
          id: 'tl_2',
          text: 'API Router',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#312e81' },
        },
      ],
    },
    {
      id: 't_auth',
      type: 'rounded-rect',
      geometry: { x: 520, y: 50, width: 150, height: 60, rotation: 0 },
      style: {
        fill: { type: 'solid', color: '#f0fdf4' },
        border: { color: '#15803d', width: 1.5, radius: 8 },
        shadow: true,
      },
      labels: [
        {
          id: 'tl_3',
          text: 'Auth Service',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#14532d' },
        },
      ],
    },
    {
      id: 't_ai',
      type: 'rounded-rect',
      geometry: { x: 520, y: 154, width: 150, height: 60, rotation: 0 },
      style: {
        fill: {
          type: 'linear-gradient',
          angle: 135,
          stops: [
            { color: '#faf5ff', offset: 0 },
            { color: '#e9d5ff', offset: 1 },
          ],
        },
        border: { color: '#7e22ce', width: 1.75, radius: 8 },
        shadow: true,
      },
      labels: [
        {
          id: 'tl_4',
          text: 'AI Agent Worker',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#581c87' },
        },
      ],
    },
    {
      id: 't_db',
      type: 'ellipse',
      geometry: { x: 520, y: 260, width: 150, height: 64, rotation: 0 },
      style: {
        fill: { type: 'solid', color: '#fff7ed' },
        border: { color: '#c2410c', width: 1.75 },
      },
      labels: [
        {
          id: 'tl_5',
          text: 'Postgres DB',
          placement: { model: 'internal', position: 'center' },
          style: { fontSize: 13, fontWeight: 600, color: '#7c2d12' },
        },
      ],
    },
  ],
  edges: [
    {
      id: 'te_1',
      source: { nodeId: 't_cdn' },
      target: { nodeId: 't_api' },
      routing: 'straight',
      bends: [],
      style: { stroke: '#0284c7', width: 2, sourceArrow: 'circle', targetArrow: 'standard' },
      labels: [
        {
          id: 'tel_1',
          text: 'HTTPS',
          placement: { model: 'center', distance: -12 },
          style: { fontSize: 11, fontWeight: 500, color: '#0369a1', background: '#f8fafc', padding: 2 },
        },
      ],
    },
    {
      id: 'te_2',
      source: { nodeId: 't_api' },
      target: { nodeId: 't_auth' },
      routing: 'bezier',
      bends: [{ x: 460, y: 80 }],
      style: { stroke: '#4f46e5', width: 1.75, sourceArrow: 'none', targetArrow: 'triangle' },
      labels: [],
    },
    {
      id: 'te_3',
      source: { nodeId: 't_api' },
      target: { nodeId: 't_ai' },
      routing: 'straight',
      bends: [],
      style: { stroke: '#7e22ce', width: 1.75, dash: [5, 4], sourceArrow: 'none', targetArrow: 'standard' },
      labels: [
        {
          id: 'tel_3',
          text: 'MCP',
          placement: { model: 'center', distance: -11 },
          style: { fontSize: 11, fontWeight: 600, color: '#6b21a8', background: '#f8fafc', padding: 2 },
        },
      ],
    },
    {
      id: 'te_4',
      source: { nodeId: 't_api' },
      target: { nodeId: 't_db' },
      routing: 'bezier',
      bends: [{ x: 460, y: 290 }],
      style: { stroke: '#c2410c', width: 1.75, sourceArrow: 'diamond', targetArrow: 'standard' },
      labels: [],
    },
  ],
};

export const SAMPLES: SampleEntry[] = [
  {
    id: 'architecture',
    name: 'Diagrav Architecture',
    description: 'Core, Jenni UI, MCP AI bridge, and canonical JSON',
    document: SAMPLE_DIAGRAM,
  },
  {
    id: 'pipeline',
    name: 'CI/CD Pipeline',
    description: 'Flowchart with diamond decision, orthogonal routing, and bends',
    document: PIPELINE_SAMPLE,
  },
  {
    id: 'topology',
    name: 'Microservices Topology',
    description: 'Bezier curves, radial gradients, and custom arrowheads',
    document: TOPOLOGY_SAMPLE,
  },
  {
    id: 'blank',
    name: 'Blank Canvas',
    description: 'Start a new diagram from scratch',
    document: createEmptyDocument('Blank Diagram'),
  },
];
