import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandEngine,
  EdgeRouterRegistry,
  ShapeRegistry,
  createDefaultEdge,
  createDefaultNode,
} from '../index.js';

test('CommandEngine executes node/edge commands with undo and redo', () => {
  const engine = new CommandEngine();
  const n1 = createDefaultNode({ id: 'n1', labelText: 'Start', geometry: { x: 0, y: 0 } });
  const n2 = createDefaultNode({ id: 'n2', labelText: 'End', geometry: { x: 300, y: 0 } });
  const e1 = createDefaultEdge('n1', 'n2', { id: 'e1' });

  assert.equal(
    engine.execute({
      type: 'batch',
      commands: [
        { type: 'node.create', node: n1 },
        { type: 'node.create', node: n2 },
        { type: 'edge.create', edge: e1 },
      ],
    }).ok,
    true,
  );

  assert.equal(engine.getDocument().nodes.length, 2);
  assert.equal(engine.getDocument().edges.length, 1);

  // Deleting a node removes its connected edges
  assert.equal(engine.execute({ type: 'node.delete', id: 'n1' }).ok, true);
  assert.equal(engine.getDocument().nodes.length, 1);
  assert.equal(engine.getDocument().edges.length, 0);

  // Undo restores node and edge
  assert.equal(engine.undo(), true);
  assert.equal(engine.getDocument().nodes.length, 2);
  assert.equal(engine.getDocument().edges.length, 1);

  // Redo deletes again
  assert.equal(engine.redo(), true);
  assert.equal(engine.getDocument().nodes.length, 1);
});

test('ShapeRegistry and EdgeRouterRegistry route polyline and orthogonal edges', () => {
  const shapes = new ShapeRegistry();
  const routers = new EdgeRouterRegistry();
  const n1 = createDefaultNode({ id: 'a', type: 'diamond', geometry: { x: 0, y: 0, width: 100, height: 100 } });
  const n2 = createDefaultNode({ id: 'b', type: 'ellipse', geometry: { x: 300, y: 100, width: 100, height: 100 } });
  const edge = createDefaultEdge('a', 'b', { routing: 'orthogonal' });

  const routed = routers.get('orthogonal').route(n1, n2, edge, shapes);
  assert.ok(routed.points.length >= 4);
  assert.ok(routed.pathD.startsWith('M '));
});
