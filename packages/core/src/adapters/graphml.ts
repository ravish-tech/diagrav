import {
  createDefaultEdge,
  createDefaultEdgeLabel,
  createDefaultNode,
  createEmptyDocument,
  type DiagramDocument,
  type Point,
} from '../schema/types.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function mapShapeToYed(type: string): string {
  switch (type) {
    case 'rounded-rect':
    case 'pill':
    case 'fc-terminator':
    case 'fc-process':
    case 'container-group':
    case 'container-dashed':
      return 'roundrectangle';
    case 'ellipse':
    case 'uml-interface':
    case 'uml-usecase':
      return 'ellipse';
    case 'diamond':
    case 'fc-decision':
      return 'diamond';
    case 'hexagon':
      return 'hexagon';
    case 'octagon':
      return 'octagon';
    case 'parallelogram':
    case 'fc-data':
      return 'parallelogram';
    case 'trapezoid':
      return 'trapezoid';
    case 'triangle':
      return 'triangle';
    default:
      return 'rectangle';
  }
}

function mapYedToShape(yedShape: string): string {
  switch (yedShape.toLowerCase()) {
    case 'roundrectangle':
      return 'rounded-rect';
    case 'ellipse':
      return 'ellipse';
    case 'diamond':
      return 'diamond';
    case 'hexagon':
      return 'hexagon';
    case 'octagon':
      return 'octagon';
    case 'parallelogram':
      return 'parallelogram';
    case 'trapezoid':
    case 'trapezoid2':
      return 'trapezoid';
    case 'triangle':
      return 'triangle';
    default:
      return 'rect';
  }
}

/**
 * Exports a canonical Diagrav document to yEd-compatible GraphML XML.
 */
export function exportDocumentToGraphMl(doc: DiagramDocument): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:y="http://www.yworks.com/xml/graphml">',
    '  <key for="node" id="d_node" yfiles.type="nodegraphics"/>',
    '  <key for="edge" id="d_edge" yfiles.type="edgegraphics"/>',
    `  <graph edgedefault="directed" id="${escapeXml(doc.meta.title || 'G')}">`,
  ];

  for (const n of doc.nodes) {
    const fillColor =
      n.style.fill.type === 'solid'
        ? n.style.fill.color
        : n.style.fill.type === 'linear-gradient' || n.style.fill.type === 'radial-gradient'
          ? n.style.fill.stops[0]?.color ?? '#f8fafc'
          : '#ffffff';
    const labelText = n.labels[0]?.text ?? '';
    const lineType = n.style.border.dash?.length ? 'dashed' : 'line';
    lines.push(`    <node id="${escapeXml(n.id)}">`);
    lines.push('      <data key="d_node">');
    lines.push('        <y:ShapeNode>');
    lines.push(
      `          <y:Geometry height="${n.geometry.height}" width="${n.geometry.width}" x="${n.geometry.x}" y="${n.geometry.y}"/>`,
    );
    lines.push(
      `          <y:Fill color="${escapeXml(fillColor)}" transparent="${n.style.fill.type === 'none' ? 'true' : 'false'}"/>`,
    );
    lines.push(
      `          <y:BorderStyle color="${escapeXml(n.style.border.color)}" type="${lineType}" width="${n.style.border.width}"/>`,
    );
    if (labelText) {
      lines.push(`          <y:NodeLabel>${escapeXml(labelText)}</y:NodeLabel>`);
    }
    lines.push(`          <y:Shape type="${mapShapeToYed(n.type)}"/>`);
    lines.push('        </y:ShapeNode>');
    lines.push('      </data>');
    lines.push('    </node>');
  }

  for (const e of doc.edges) {
    const labelText = e.labels[0]?.text ?? '';
    const lineType = e.style.dash?.length ? 'dashed' : 'line';
    lines.push(
      `    <edge id="${escapeXml(e.id)}" source="${escapeXml(e.source.nodeId)}" target="${escapeXml(e.target.nodeId)}">`,
    );
    lines.push('      <data key="d_edge">');
    lines.push('        <y:PolyLineEdge>');
    if (e.bends.length > 0) {
      lines.push('          <y:Path sx="0.0" sy="0.0" tx="0.0" ty="0.0">');
      for (const b of e.bends) {
        lines.push(`            <y:Point x="${b.x}" y="${b.y}"/>`);
      }
      lines.push('          </y:Path>');
    }
    lines.push(
      `          <y:LineStyle color="${escapeXml(e.style.stroke)}" type="${lineType}" width="${e.style.width}"/>`,
    );
    lines.push(
      `          <y:Arrows source="${escapeXml(e.style.sourceArrow)}" target="${escapeXml(e.style.targetArrow)}"/>`,
    );
    if (labelText) {
      lines.push(`          <y:EdgeLabel>${escapeXml(labelText)}</y:EdgeLabel>`);
    }
    lines.push('        </y:PolyLineEdge>');
    lines.push('      </data>');
    lines.push('    </edge>');
  }

  lines.push('  </graph>');
  lines.push('</graphml>');
  return lines.join('\n');
}

function getAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}="([^"]*)"`);
  const m = tag.match(re);
  return m ? unescapeXml(m[1]) : undefined;
}

/**
 * Pure, DOM-free GraphML (including yEd `<y:ShapeNode>` / `<y:PolyLineEdge>`) importer.
 * Works identically in Node.js and browsers.
 */
export function importGraphMlToDocument(xml: string, fallbackTitle = 'Imported GraphML'): DiagramDocument {
  if (!xml.includes('<graphml') && !xml.includes('<graph')) {
    throw new Error('Invalid GraphML: missing <graphml> or <graph> element');
  }

  const graphTagMatch = xml.match(/<graph\b[^>]*>/);
  const title = (graphTagMatch && getAttr(graphTagMatch[0], 'id')) || fallbackTitle;
  const doc = createEmptyDocument(title);

  // Parse <node ...>...</node> blocks
  const nodeRe = /<node\b([^>]*)>([\s\S]*?)<\/node>/g;
  let nm: RegExpExecArray | null;
  let autoIdx = 0;
  while ((nm = nodeRe.exec(xml)) !== null) {
    const id = getAttr(nm[1], 'id') || `n_${autoIdx}`;
    const body = nm[2];

    const geoMatch = body.match(/<y:Geometry\b([^>]*)\/>/);
    const fillMatch = body.match(/<y:Fill\b([^>]*)\/>/);
    const borderMatch = body.match(/<y:BorderStyle\b([^>]*)\/>/);
    const shapeMatch = body.match(/<y:Shape\b([^>]*)\/>/);
    const labelMatch = body.match(/<y:NodeLabel\b[^>]*>([\s\S]*?)<\/y:NodeLabel>/);

    const x = Number(geoMatch ? getAttr(geoMatch[1], 'x') : NaN);
    const y = Number(geoMatch ? getAttr(geoMatch[1], 'y') : NaN);
    const w = Number(geoMatch ? getAttr(geoMatch[1], 'width') : NaN);
    const h = Number(geoMatch ? getAttr(geoMatch[1], 'height') : NaN);

    const fillColor = (fillMatch && getAttr(fillMatch[1], 'color')) || '#f8fafc';
    const transparent = fillMatch && getAttr(fillMatch[1], 'transparent') === 'true';
    const borderColor = (borderMatch && getAttr(borderMatch[1], 'color')) || '#475569';
    const borderWidth = Number((borderMatch && getAttr(borderMatch[1], 'width')) || 1.5);
    const borderDashed = borderMatch && getAttr(borderMatch[1], 'type') === 'dashed';
    const shapeType = mapYedToShape((shapeMatch && getAttr(shapeMatch[1], 'type')) || 'roundrectangle');
    const labelText = labelMatch ? unescapeXml(labelMatch[1].trim()) : id;

    doc.nodes.push(
      createDefaultNode({
        id,
        type: shapeType,
        labelText,
        geometry: {
          x: Number.isFinite(x) ? x : 80 + (autoIdx % 4) * 180,
          y: Number.isFinite(y) ? y : 80 + Math.floor(autoIdx / 4) * 110,
          width: Number.isFinite(w) && w > 0 ? w : 140,
          height: Number.isFinite(h) && h > 0 ? h : 64,
        },
        style: {
          fill: transparent ? { type: 'none' } : { type: 'solid', color: fillColor, opacity: 1 },
          border: {
            color: borderColor,
            width: Number.isFinite(borderWidth) ? borderWidth : 1.5,
            dash: borderDashed ? [6, 4] : [],
            radius: shapeType === 'rounded-rect' ? 8 : 0,
            opacity: 1,
          },
        },
      }),
    );
    autoIdx += 1;
  }

  // Parse <edge ...>...</edge> blocks
  const edgeRe = /<edge\b([^>]*)>([\s\S]*?)<\/edge>/g;
  let em: RegExpExecArray | null;
  let edgeIdx = 0;
  const validNodeIds = new Set(doc.nodes.map((n) => n.id));
  while ((em = edgeRe.exec(xml)) !== null) {
    const attrs = em[1];
    const body = em[2];
    const id = getAttr(attrs, 'id') || `e_${edgeIdx++}`;
    const source = getAttr(attrs, 'source');
    const target = getAttr(attrs, 'target');
    if (!source || !target || !validNodeIds.has(source) || !validNodeIds.has(target)) continue;

    const lineMatch = body.match(/<y:LineStyle\b([^>]*)\/>/);
    const arrowsMatch = body.match(/<y:Arrows\b([^>]*)\/>/);
    const labelMatch = body.match(/<y:EdgeLabel\b[^>]*>([\s\S]*?)<\/y:EdgeLabel>/);

    const bends: Point[] = [];
    const ptRe = /<y:Point\b([^>]*)\/>/g;
    let pm: RegExpExecArray | null;
    while ((pm = ptRe.exec(body)) !== null) {
      const bx = Number(getAttr(pm[1], 'x'));
      const by = Number(getAttr(pm[1], 'y'));
      if (Number.isFinite(bx) && Number.isFinite(by)) bends.push({ x: bx, y: by });
    }

    const stroke = (lineMatch && getAttr(lineMatch[1], 'color')) || '#475569';
    const width = Number((lineMatch && getAttr(lineMatch[1], 'width')) || 1.75);
    const dashed = lineMatch && getAttr(lineMatch[1], 'type') === 'dashed';
    const srcArrow = (arrowsMatch && getAttr(arrowsMatch[1], 'source')) || 'none';
    const tgtArrow = (arrowsMatch && getAttr(arrowsMatch[1], 'target')) || 'standard';
    const labelText = labelMatch ? unescapeXml(labelMatch[1].trim()) : '';

    doc.edges.push(
      createDefaultEdge(source, target, {
        id,
        bends,
        style: {
          stroke,
          width: Number.isFinite(width) ? width : 1.75,
          dash: dashed ? [6, 4] : [],
          sourceArrow: (['none', 'standard', 'triangle', 'open', 'diamond', 'circle'].includes(srcArrow)
            ? srcArrow
            : 'none') as 'none',
          targetArrow: (['none', 'standard', 'triangle', 'open', 'diamond', 'circle'].includes(tgtArrow)
            ? tgtArrow
            : 'standard') as 'standard',
        },
        labels: labelText ? [createDefaultEdgeLabel(labelText)] : [],
      }),
    );
  }

  return doc;
}
