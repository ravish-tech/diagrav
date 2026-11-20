import { Diagrav, type DiagramDocument } from '@diagrav/core';
import { Badge, Button, Card, Container, Grid, GridItem, Inline, Stack } from 'jenni-react';
import { useEffect, useRef } from 'react';
import { PIPELINE_SAMPLE, TOPOLOGY_SAMPLE } from '../samples';

function EmbeddedViewerCard({
  title,
  subtitle,
  document,
}: {
  title: string;
  subtitle: string;
  document: DiagramDocument;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<Diagrav | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const viewer = new Diagrav({
      container: hostRef.current,
      document,
      mode: 'readonly',
    });
    instanceRef.current = viewer;
    viewer.fitToView(24);

    return () => {
      viewer.destroy();
      instanceRef.current = null;
    };
  }, [document]);

  return (
    <Card variant="outline" style={{ padding: 16 }}>
      <Stack gap="related">
        <Inline justify="between" align="center">
          <div>
            <strong style={{ fontSize: 14 }}>{title}</strong>
            <div style={{ fontSize: 12, color: 'var(--j-fg-muted, #64748b)' }}>{subtitle}</div>
          </div>
          <Inline gap="inline" align="center">
            <Badge variant="soft" tone="neutral" size="sm">
              readonly
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => instanceRef.current?.fitToView(24)}>
              Fit
            </Button>
          </Inline>
        </Inline>
        <div
          ref={hostRef}
          style={{
            height: 300,
            borderRadius: 8,
            border: '1px solid var(--j-border, #e2e8f0)',
            background: 'var(--j-bg, #f8fafc)',
            overflow: 'hidden',
          }}
        />
      </Stack>
    </Card>
  );
}

const EMBED_SNIPPET = `import { Diagrav } from '@diagrav/core';

const viewer = new Diagrav({
  container: document.getElementById('diagram'),
  document: myDiagramJson,
  mode: 'readonly', // pan, zoom, inspect — zero UI framework needed
});
viewer.fitToView();`;

export function EmbedDemo() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 0' }}>
      <Container size="lg">
        <Stack gap="group">
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>Embeddable Core Engine</h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--j-fg-muted, #64748b)' }}>
              Each card below mounts an independent <code>@diagrav/core</code> instance in{' '}
              <code>readonly</code> mode. Drag to pan, scroll to zoom.
            </p>
          </div>

          <Grid cols={2} gap="item">
            <GridItem>
              <EmbeddedViewerCard
                title="CI/CD Release Pipeline"
                subtitle="Orthogonal routing, bends, decision diamond"
                document={PIPELINE_SAMPLE}
              />
            </GridItem>
            <GridItem>
              <EmbeddedViewerCard
                title="Microservices Topology"
                subtitle="Bezier curves, radial gradients, custom arrows"
                document={TOPOLOGY_SAMPLE}
              />
            </GridItem>
          </Grid>

          <Card variant="surface" style={{ padding: 16 }}>
            <Stack gap="related">
              <strong style={{ fontSize: 13 }}>Minimal Embed Code (Plain HTML / Any Framework)</strong>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 8,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontSize: 12,
                  overflowX: 'auto',
                }}
              >
                <code>{EMBED_SNIPPET}</code>
              </pre>
            </Stack>
          </Card>
        </Stack>
      </Container>
    </div>
  );
}
