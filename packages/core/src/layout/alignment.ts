import type { DiagramCommand } from '../commands/types.js';
import type { DiagramDocument, DiagramNode } from '../schema/types.js';

export type NodeAlignment = 'left' | 'center-x' | 'right' | 'top' | 'middle-y' | 'bottom';
export type NodeDistribution =
  | 'horizontal-gaps'
  | 'vertical-gaps'
  | 'horizontal-centers'
  | 'vertical-centers';
export type NodeMatchSize = 'width' | 'height' | 'both';

export interface RectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignGuide {
  orientation: 'vertical' | 'horizontal';
  /** Coordinate along the perpendicular axis (x for vertical line, y for horizontal line). */
  value: number;
  /** Visual start coordinate along the line axis. */
  from: number;
  /** Visual end coordinate along the line axis. */
  to: number;
  /** Anchor coordinates along the line axis where yEd-style cross ticks are drawn. */
  marks: number[];
}

export interface SpacingGuide {
  orientation: 'horizontal' | 'vertical';
  /** Perpendicular axis coordinate (y for horizontal spacing, x for vertical spacing). */
  axis: number;
  /** Gap size in world pixels. */
  gap: number;
  /** Adjacent gap segments that share this equal spacing. */
  segments: Array<{ start: number; end: number }>;
}

export interface SmartSnapResult {
  dx: number;
  dy: number;
  alignLines: AlignGuide[];
  spacingGuides: SpacingGuide[];
}

/**
 * Computes yEd-style smart alignment guides (left/center/right, top/middle/bottom)
 * and equal-spacing distance guides (trailing, leading, and midpoint equal gaps).
 */
export function computeSmartSnap(
  moving: RectBox,
  others: DiagramNode[],
  threshold = 6,
): SmartSnapResult {
  let bestDx: number | null = null;
  let bestAbsDx = threshold + 0.001;
  let bestDy: number | null = null;
  let bestAbsDy = threshold + 0.001;

  const mLeft = moving.x;
  const mCx = moving.x + moving.width / 2;
  const mRight = moving.x + moving.width;
  const mTop = moving.y;
  const mCy = moving.y + moving.height / 2;
  const mBottom = moving.y + moving.height;

  const mXAnchors = [mLeft, mCx, mRight];
  const mYAnchors = [mTop, mCy, mBottom];

  // 1. Find closest alignment snap for X and Y independently
  for (const o of others) {
    const oLeft = o.geometry.x;
    const oCx = o.geometry.x + o.geometry.width / 2;
    const oRight = o.geometry.x + o.geometry.width;
    const oTop = o.geometry.y;
    const oCy = o.geometry.y + o.geometry.height / 2;
    const oBottom = o.geometry.y + o.geometry.height;

    for (const ma of mXAnchors) {
      for (const oa of [oLeft, oCx, oRight]) {
        const d = oa - ma;
        const abs = Math.abs(d);
        if (abs < bestAbsDx) {
          bestAbsDx = abs;
          bestDx = d;
        }
      }
    }

    for (const ma of mYAnchors) {
      for (const oa of [oTop, oCy, oBottom]) {
        const d = oa - ma;
        const abs = Math.abs(d);
        if (abs < bestAbsDy) {
          bestAbsDy = abs;
          bestDy = d;
        }
      }
    }
  }

  // 2. Check equal-spacing candidates (can snap X or Y if no tighter alignment snap exists, or complement alignment)
  const snappedForSpacingX = bestDx ?? 0;
  const snappedForSpacingY = bestDy ?? 0;

  let spacingDx: number | null = null;
  let bestSpacingAbsDx = threshold + 0.001;
  let bestHSpacing: SpacingGuide | null = null;

  let spacingDy: number | null = null;
  let bestSpacingAbsDy = threshold + 0.001;
  let bestVSpacing: SpacingGuide | null = null;

  // Vertical equal-spacing (nodes overlapping horizontally with moving box)
  const hOverlapNodes = others
    .filter((o) => {
      const mx1 = moving.x + snappedForSpacingX;
      const mx2 = mx1 + moving.width;
      return Math.min(mx2, o.geometry.x + o.geometry.width) - Math.max(mx1, o.geometry.x) > -16;
    })
    .sort((a, b) => a.geometry.y - b.geometry.y);

  for (let i = 0; i < hOverlapNodes.length - 1; i++) {
    const a = hOverlapNodes[i];
    const b = hOverlapNodes[i + 1];
    const aBot = a.geometry.y + a.geometry.height;
    const bTop = b.geometry.y;
    const bBot = b.geometry.y + b.geometry.height;
    const gapAB = bTop - aBot;

    const axisX = moving.x + snappedForSpacingX + moving.width / 2;

    if (gapAB > 2) {
      // Pattern 1: Moving is below B with same gap as A..B
      const targetTopBelow = bBot + gapAB;
      const dBelow = targetTopBelow - mTop;
      if (Math.abs(dBelow) < bestSpacingAbsDy) {
        bestSpacingAbsDy = Math.abs(dBelow);
        spacingDy = dBelow;
        bestVSpacing = {
          orientation: 'vertical',
          axis: axisX,
          gap: Math.round(gapAB),
          segments: [
            { start: aBot, end: bTop },
            { start: bBot, end: targetTopBelow },
          ],
        };
      }

      // Pattern 2: Moving is above A with same gap as A..B
      const targetTopAbove = a.geometry.y - gapAB - moving.height;
      const dAbove = targetTopAbove - mTop;
      if (Math.abs(dAbove) < bestSpacingAbsDy) {
        bestSpacingAbsDy = Math.abs(dAbove);
        spacingDy = dAbove;
        bestVSpacing = {
          orientation: 'vertical',
          axis: axisX,
          gap: Math.round(gapAB),
          segments: [
            { start: targetTopAbove + moving.height, end: a.geometry.y },
            { start: aBot, end: bTop },
          ],
        };
      }
    }

    // Pattern 3: Moving is centered equally between A and B
    const availBetween = bTop - aBot - moving.height;
    if (availBetween > 4) {
      const equalGap = availBetween / 2;
      const targetTopMid = aBot + equalGap;
      const dMid = targetTopMid - mTop;
      if (Math.abs(dMid) < bestSpacingAbsDy) {
        bestSpacingAbsDy = Math.abs(dMid);
        spacingDy = dMid;
        bestVSpacing = {
          orientation: 'vertical',
          axis: axisX,
          gap: Math.round(equalGap),
          segments: [
            { start: aBot, end: targetTopMid },
            { start: targetTopMid + moving.height, end: bTop },
          ],
        };
      }
    }
  }

  // Horizontal equal-spacing (nodes overlapping vertically with moving box)
  const vOverlapNodes = others
    .filter((o) => {
      const my1 = moving.y + snappedForSpacingY;
      const my2 = my1 + moving.height;
      return Math.min(my2, o.geometry.y + o.geometry.height) - Math.max(my1, o.geometry.y) > -16;
    })
    .sort((a, b) => a.geometry.x - b.geometry.x);

  for (let i = 0; i < vOverlapNodes.length - 1; i++) {
    const a = vOverlapNodes[i];
    const b = vOverlapNodes[i + 1];
    const aRight = a.geometry.x + a.geometry.width;
    const bLeft = b.geometry.x;
    const bRight = b.geometry.x + b.geometry.width;
    const gapAB = bLeft - aRight;

    const axisY = moving.y + snappedForSpacingY + moving.height / 2;

    if (gapAB > 2) {
      // Pattern 1: Moving is right of B with same gap as A..B
      const targetLeftRight = bRight + gapAB;
      const dRight = targetLeftRight - mLeft;
      if (Math.abs(dRight) < bestSpacingAbsDx) {
        bestSpacingAbsDx = Math.abs(dRight);
        spacingDx = dRight;
        bestHSpacing = {
          orientation: 'horizontal',
          axis: axisY,
          gap: Math.round(gapAB),
          segments: [
            { start: aRight, end: bLeft },
            { start: bRight, end: targetLeftRight },
          ],
        };
      }

      // Pattern 2: Moving is left of A with same gap as A..B
      const targetLeftBefore = a.geometry.x - gapAB - moving.width;
      const dBefore = targetLeftBefore - mLeft;
      if (Math.abs(dBefore) < bestSpacingAbsDx) {
        bestSpacingAbsDx = Math.abs(dBefore);
        spacingDx = dBefore;
        bestHSpacing = {
          orientation: 'horizontal',
          axis: axisY,
          gap: Math.round(gapAB),
          segments: [
            { start: targetLeftBefore + moving.width, end: a.geometry.x },
            { start: aRight, end: bLeft },
          ],
        };
      }
    }

    // Pattern 3: Moving is centered equally between A and B
    const availBetween = bLeft - aRight - moving.width;
    if (availBetween > 4) {
      const equalGap = availBetween / 2;
      const targetLeftMid = aRight + equalGap;
      const dMid = targetLeftMid - mLeft;
      if (Math.abs(dMid) < bestSpacingAbsDx) {
        bestSpacingAbsDx = Math.abs(dMid);
        spacingDx = dMid;
        bestHSpacing = {
          orientation: 'horizontal',
          axis: axisY,
          gap: Math.round(equalGap),
          segments: [
            { start: aRight, end: targetLeftMid },
            { start: targetLeftMid + moving.width, end: bLeft },
          ],
        };
      }
    }
  }

  // Prefer tighter delta between alignment and spacing snaps
  const finalDx =
    bestDx !== null && (spacingDx === null || bestAbsDx <= bestSpacingAbsDx)
      ? bestDx
      : spacingDx ?? 0;
  const finalDy =
    bestDy !== null && (spacingDy === null || bestAbsDy <= bestSpacingAbsDy)
      ? bestDy
      : spacingDy ?? 0;

  // 3. Collect all active alignment guide lines at the final snapped position
  const sLeft = mLeft + finalDx;
  const sCx = mCx + finalDx;
  const sRight = mRight + finalDx;
  const sTop = mTop + finalDy;
  const sCy = mCy + finalDy;
  const sBottom = mBottom + finalDy;

  const alignLines: AlignGuide[] = [];
  const vMap = new Map<number, { from: number; to: number; marks: Set<number> }>();
  const hMap = new Map<number, { from: number; to: number; marks: Set<number> }>();

  const recordV = (val: number, y1: number, y2: number, markA: number, markB: number) => {
    const key = Math.round(val * 2) / 2;
    const existing = vMap.get(key);
    if (existing) {
      existing.from = Math.min(existing.from, y1, y2);
      existing.to = Math.max(existing.to, y1, y2);
      existing.marks.add(markA);
      existing.marks.add(markB);
    } else {
      vMap.set(key, {
        from: Math.min(y1, y2),
        to: Math.max(y1, y2),
        marks: new Set([markA, markB]),
      });
    }
  };

  const recordH = (val: number, x1: number, x2: number, markA: number, markB: number) => {
    const key = Math.round(val * 2) / 2;
    const existing = hMap.get(key);
    if (existing) {
      existing.from = Math.min(existing.from, x1, x2);
      existing.to = Math.max(existing.to, x1, x2);
      existing.marks.add(markA);
      existing.marks.add(markB);
    } else {
      hMap.set(key, {
        from: Math.min(x1, x2),
        to: Math.max(x1, x2),
        marks: new Set([markA, markB]),
      });
    }
  };

  const eps = 0.75;
  for (const o of others) {
    const oLeft = o.geometry.x;
    const oCx = o.geometry.x + o.geometry.width / 2;
    const oRight = o.geometry.x + o.geometry.width;
    const oTop = o.geometry.y;
    const oCy = o.geometry.y + o.geometry.height / 2;
    const oBottom = o.geometry.y + o.geometry.height;

    for (const sx of [sLeft, sCx, sRight]) {
      for (const ox of [oLeft, oCx, oRight]) {
        if (Math.abs(sx - ox) <= eps) {
          recordV(ox, Math.min(sTop, oTop), Math.max(sBottom, oBottom), sCy, oCy);
        }
      }
    }

    for (const sy of [sTop, sCy, sBottom]) {
      for (const oy of [oTop, oCy, oBottom]) {
        if (Math.abs(sy - oy) <= eps) {
          recordH(oy, Math.min(sLeft, oLeft), Math.max(sRight, oRight), sCx, oCx);
        }
      }
    }
  }

  for (const [value, info] of vMap.entries()) {
    alignLines.push({
      orientation: 'vertical',
      value,
      from: info.from - 14,
      to: info.to + 14,
      marks: Array.from(info.marks),
    });
  }
  for (const [value, info] of hMap.entries()) {
    alignLines.push({
      orientation: 'horizontal',
      value,
      from: info.from - 14,
      to: info.to + 14,
      marks: Array.from(info.marks),
    });
  }

  const spacingGuides: SpacingGuide[] = [];
  if (bestVSpacing && spacingDy !== null && Math.abs(finalDy - spacingDy) <= eps) {
    spacingGuides.push({
      ...bestVSpacing,
      axis: sCx,
    });
  }
  if (bestHSpacing && spacingDx !== null && Math.abs(finalDx - spacingDx) <= eps) {
    spacingGuides.push({
      ...bestHSpacing,
      axis: sCy,
    });
  }

  return { dx: finalDx, dy: finalDy, alignLines, spacingGuides };
}

/** Creates an undoable batch command to align 2+ selected nodes. */
export function createAlignNodesCommand(
  doc: DiagramDocument,
  nodeIds: string[],
  alignment: NodeAlignment,
): DiagramCommand | null {
  const nodes = nodeIds
    .map((id) => doc.nodes.find((n) => n.id === id))
    .filter((n): n is DiagramNode => Boolean(n));
  if (nodes.length < 2) return null;

  const minX = Math.min(...nodes.map((n) => n.geometry.x));
  const maxX = Math.max(...nodes.map((n) => n.geometry.x + n.geometry.width));
  const midX = (minX + maxX) / 2;
  const minY = Math.min(...nodes.map((n) => n.geometry.y));
  const maxY = Math.max(...nodes.map((n) => n.geometry.y + n.geometry.height));
  const midY = (minY + maxY) / 2;

  const commands: DiagramCommand[] = [];
  for (const n of nodes) {
    let nextX = n.geometry.x;
    let nextY = n.geometry.y;
    switch (alignment) {
      case 'left':
        nextX = minX;
        break;
      case 'center-x':
        nextX = Math.round(midX - n.geometry.width / 2);
        break;
      case 'right':
        nextX = maxX - n.geometry.width;
        break;
      case 'top':
        nextY = minY;
        break;
      case 'middle-y':
        nextY = Math.round(midY - n.geometry.height / 2);
        break;
      case 'bottom':
        nextY = maxY - n.geometry.height;
        break;
    }
    if (nextX !== n.geometry.x || nextY !== n.geometry.y) {
      commands.push({
        type: 'node.update',
        id: n.id,
        patch: { geometry: { x: nextX, y: nextY } },
      });
    }
  }

  if (commands.length === 0) return null;
  return { type: 'batch', commands, label: `Align ${alignment}` };
}

/** Creates an undoable batch command to distribute 3+ selected nodes evenly. */
export function createDistributeNodesCommand(
  doc: DiagramDocument,
  nodeIds: string[],
  mode: NodeDistribution,
): DiagramCommand | null {
  const nodes = nodeIds
    .map((id) => doc.nodes.find((n) => n.id === id))
    .filter((n): n is DiagramNode => Boolean(n));
  if (nodes.length < 3) return null;

  const commands: DiagramCommand[] = [];

  if (mode === 'horizontal-gaps' || mode === 'horizontal-centers') {
    const sorted = [...nodes].sort(
      (a, b) => a.geometry.x + a.geometry.width / 2 - (b.geometry.x + b.geometry.width / 2),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (mode === 'horizontal-gaps') {
      const totalSpan = last.geometry.x + last.geometry.width - first.geometry.x;
      const sumWidths = sorted.reduce((acc, n) => acc + n.geometry.width, 0);
      const gap = (totalSpan - sumWidths) / (sorted.length - 1);
      let cursor = first.geometry.x + first.geometry.width + gap;
      for (let i = 1; i < sorted.length - 1; i++) {
        const n = sorted[i];
        const nextX = Math.round(cursor);
        if (nextX !== n.geometry.x) {
          commands.push({ type: 'node.update', id: n.id, patch: { geometry: { x: nextX } } });
        }
        cursor += n.geometry.width + gap;
      }
    } else {
      const startCx = first.geometry.x + first.geometry.width / 2;
      const endCx = last.geometry.x + last.geometry.width / 2;
      const step = (endCx - startCx) / (sorted.length - 1);
      for (let i = 1; i < sorted.length - 1; i++) {
        const n = sorted[i];
        const nextX = Math.round(startCx + step * i - n.geometry.width / 2);
        if (nextX !== n.geometry.x) {
          commands.push({ type: 'node.update', id: n.id, patch: { geometry: { x: nextX } } });
        }
      }
    }
  } else {
    const sorted = [...nodes].sort(
      (a, b) => a.geometry.y + a.geometry.height / 2 - (b.geometry.y + b.geometry.height / 2),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (mode === 'vertical-gaps') {
      const totalSpan = last.geometry.y + last.geometry.height - first.geometry.y;
      const sumHeights = sorted.reduce((acc, n) => acc + n.geometry.height, 0);
      const gap = (totalSpan - sumHeights) / (sorted.length - 1);
      let cursor = first.geometry.y + first.geometry.height + gap;
      for (let i = 1; i < sorted.length - 1; i++) {
        const n = sorted[i];
        const nextY = Math.round(cursor);
        if (nextY !== n.geometry.y) {
          commands.push({ type: 'node.update', id: n.id, patch: { geometry: { y: nextY } } });
        }
        cursor += n.geometry.height + gap;
      }
    } else {
      const startCy = first.geometry.y + first.geometry.height / 2;
      const endCy = last.geometry.y + last.geometry.height / 2;
      const step = (endCy - startCy) / (sorted.length - 1);
      for (let i = 1; i < sorted.length - 1; i++) {
        const n = sorted[i];
        const nextY = Math.round(startCy + step * i - n.geometry.height / 2);
        if (nextY !== n.geometry.y) {
          commands.push({ type: 'node.update', id: n.id, patch: { geometry: { y: nextY } } });
        }
      }
    }
  }

  if (commands.length === 0) return null;
  return { type: 'batch', commands, label: `Distribute ${mode}` };
}

/** Creates an undoable batch command to match width/height of 2+ selected nodes to the first selected node. */
export function createMatchSizeCommand(
  doc: DiagramDocument,
  nodeIds: string[],
  mode: NodeMatchSize,
): DiagramCommand | null {
  const nodes = nodeIds
    .map((id) => doc.nodes.find((n) => n.id === id))
    .filter((n): n is DiagramNode => Boolean(n));
  if (nodes.length < 2) return null;

  const ref = nodes[0];
  const commands: DiagramCommand[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i];
    const nextW = mode === 'width' || mode === 'both' ? ref.geometry.width : n.geometry.width;
    const nextH = mode === 'height' || mode === 'both' ? ref.geometry.height : n.geometry.height;
    if (nextW !== n.geometry.width || nextH !== n.geometry.height) {
      commands.push({
        type: 'node.update',
        id: n.id,
        patch: { geometry: { width: nextW, height: nextH } },
      });
    }
  }

  if (commands.length === 0) return null;
  return { type: 'batch', commands, label: `Match ${mode}` };
}
