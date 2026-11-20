import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import { DiagravBridgeServer } from './bridge.js';
import { DiagravMcpSession } from './session.js';

test('DiagravMcpSession builds, aligns, exports SVG, and persists .diagrav.json headlessly', () => {
  const session = new DiagravMcpSession();
  session.createDiagram('MCP Test Flow');

  const a = session.addNode({ id: 'a', type: 'rounded-rect', label: 'Client', x: 0, y: 10 });
  const b = session.addNode({ id: 'b', type: 'hexagon', label: 'API', x: 200, y: 40 });
  const c = session.addNode({ id: 'c', type: 'ellipse', label: 'DB', x: 500, y: 90 });
  assert.equal(a.ok && b.ok && c.ok, true);

  const e1 = session.connectNodes({ sourceNodeId: 'a', targetNodeId: 'b', label: 'HTTPS', routing: 'orthogonal' });
  const e2 = session.connectNodes({ sourceNodeId: 'b', targetNodeId: 'c', label: 'SQL' });
  assert.equal(e1.ok && e2.ok, true);

  assert.equal(session.alignNodes(['a', 'b', 'c'], 'top').ok, true);
  assert.equal(session.engine.getNode('c')?.geometry.y, 10);

  assert.equal(session.distributeNodes(['a', 'b', 'c'], 'horizontal-gaps').ok, true);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagrav-mcp-'));
  const jsonPath = path.join(tmpDir, 'flow.diagrav.json');
  const svgPath = path.join(tmpDir, 'flow.svg');

  const saved = session.saveDiagram(jsonPath);
  assert.equal(saved.ok, true);
  assert.ok(fs.existsSync(jsonPath));

  const exported = session.exportSvg(svgPath);
  assert.equal(exported.ok, true);
  const svgText = fs.readFileSync(svgPath, 'utf8');
  assert.ok(svgText.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svgText.includes('Client') && svgText.includes('HTTPS'));

  // Reload into a fresh session
  const session2 = new DiagravMcpSession();
  const loaded = session2.loadDiagram(jsonPath);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.nodeCount, 3);
  assert.equal(loaded.edgeCount, 2);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('DiagravBridgeServer syncs with Studio client and broadcasts MCP commands live', async () => {
  const session = new DiagravMcpSession();
  const port = 4199;
  const bridge = new DiagravBridgeServer(port, {
    onStudioSync: (doc) => session.syncFromStudio(doc),
    getCurrentDocument: () => session.engine.getDocument(),
  });
  session.attachBridge(bridge);
  const started = await bridge.start();
  assert.equal(started, true);

  const client = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve, reject) => {
    client.once('open', () => resolve());
    client.once('error', reject);
  });

  const received: unknown[] = [];
  client.on('message', (data) => received.push(JSON.parse(String(data))));

  session.addNode({ id: 'live_1', label: 'AI Created Node', x: 50, y: 50 });

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(received.length, 1);
  assert.equal((received[0] as { type: string }).type, 'command');

  client.close();
  await bridge.close();
});
