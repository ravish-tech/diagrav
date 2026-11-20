import type { DiagramDocument } from '@diagrav/core';
import { Badge, Button, Dialog, Inline, toast } from 'jenni-react';
import { useMemo, type ReactNode } from 'react';

export interface JsonViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: DiagramDocument;
  onDownload: () => void;
}

const JSON_TOKEN_RE =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:])/g;

function highlightJson(jsonText: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  JSON_TOKEN_RE.lastIndex = 0;
  while ((match = JSON_TOKEN_RE.exec(jsonText)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(jsonText.slice(lastIdx, match.index));
    }
    const token = match[0];
    let className = 'diagrav-json-punct';
    if (token.startsWith('"')) {
      className = token.endsWith(':') ? 'diagrav-json-key' : 'diagrav-json-str';
    } else if (token === 'true' || token === 'false') {
      className = 'diagrav-json-bool';
    } else if (token === 'null') {
      className = 'diagrav-json-null';
    } else if (/^-?\d/.test(token)) {
      className = 'diagrav-json-num';
    }
    nodes.push(
      <span key={keyIdx++} className={className}>
        {token}
      </span>,
    );
    lastIdx = match.index + token.length;
  }

  if (lastIdx < jsonText.length) {
    nodes.push(jsonText.slice(lastIdx));
  }
  return nodes;
}

export function JsonViewerModal({
  open,
  onOpenChange,
  doc,
  onDownload,
}: JsonViewerModalProps) {
  const formatted = useMemo(() => (open ? JSON.stringify(doc, null, 2) : ''), [open, doc]);
  const highlighted = useMemo(() => (open ? highlightJson(formatted) : []), [open, formatted]);
  const lineCount = useMemo(() => (formatted ? formatted.split('\n').length : 0), [formatted]);
  const sizeKb = (new Blob([formatted]).size / 1024).toFixed(1);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      toast.success('Copied diagram JSON');
    } catch {
      toast.error('Unable to copy JSON');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={
        <Inline gap="inline" align="center">
          <span>Diagram JSON</span>
          <Badge variant="soft" tone="accent" size="sm">
            schema v{doc.schemaVersion}
          </Badge>
          <Badge variant="soft" tone="neutral" size="sm">
            {doc.nodes.length} nodes · {doc.edges.length} edges
          </Badge>
          <Badge variant="soft" tone="neutral" size="sm">
            {lineCount} lines · {sizeKb} KB
          </Badge>
        </Inline>
      }
      footer={({ close }) => (
        <Inline justify="between" align="center" style={{ width: '100%' }}>
          <span style={{ fontSize: 12, color: 'var(--j-fg-muted, #64748b)' }}>
            Canonical <code>.diagrav.json</code> format
          </span>
          <Inline gap="inline" align="center">
            <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
              Copy JSON
            </Button>
            <Button size="sm" variant="outline" onClick={onDownload}>
              Download .diagrav.json
            </Button>
            <Button size="sm" variant="solid" onClick={close}>
              Close
            </Button>
          </Inline>
        </Inline>
      )}
    >
      <pre className="diagrav-json-viewer">
        <code>{highlighted}</code>
      </pre>
    </Dialog>
  );
}
