import { Badge, Button, Inline, Textarea, toast } from 'jenni-react';
import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'diagrav.reviewNotes';

export interface NotesDockProps {
  onClose: () => void;
  onHasContentChange?: (hasContent: boolean) => void;
}

export function NotesDock({ onClose, onHasContentChange }: NotesDockProps) {
  const [notes, setNotes] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [syncMode, setSyncMode] = useState<'checking' | 'file' | 'local'>('checking');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const saveTimerRef = useRef<number | null>(null);

  // Load from dev file sync (`docs/REVIEW_NOTES.md`) if running under Vite dev server
  useEffect(() => {
    let cancelled = false;
    fetch('/__diagrav_notes')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('not dev'))))
      .then((data: { content?: string }) => {
        if (cancelled) return;
        setSyncMode('file');
        if (typeof data.content === 'string') {
          setNotes((prev) => {
            // If file has content, prefer file; if file is empty but localStorage has content, sync it up
            if (data.content && data.content.length > 0) {
              try {
                localStorage.setItem(STORAGE_KEY, data.content);
              } catch {
                // ignore storage errors
              }
              return data.content;
            }
            if (prev.length > 0) {
              void fetch('/__diagrav_notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: prev }),
              });
            }
            return prev;
          });
        }
      })
      .catch(() => {
        if (!cancelled) setSyncMode('local');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onHasContentChange?.(notes.trim().length > 0);
  }, [notes, onHasContentChange]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const persistNotes = (next: string) => {
    setNotes(next);
    setSaveStatus('saving');
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      if (syncMode === 'file') {
        void fetch('/__diagrav_notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: next }),
        }).finally(() => setSaveStatus('saved'));
      } else {
        setSaveStatus('saved');
      }
    }, 300);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(notes);
      toast.success('Copied notes');
    } catch {
      toast.error('Unable to copy notes');
    }
  };

  return (
    <div className="diagrav-notes-dock">
      <div className="diagrav-notes-header">
        <Inline gap="inline" align="center">
          <strong style={{ fontSize: 12.5 }}>Review Notes</strong>
          <Badge variant="soft" tone={syncMode === 'file' ? 'accent' : 'neutral'} size="sm">
            {syncMode === 'file'
              ? saveStatus === 'saving'
                ? 'Saving to docs/REVIEW_NOTES.md…'
                : 'Synced: docs/REVIEW_NOTES.md'
              : saveStatus === 'saving'
                ? 'Saving…'
                : 'Saved locally'}
          </Badge>
        </Inline>
        <Inline gap="inline" align="center">
          <Button size="sm" variant="ghost" disabled={!notes.trim()} onClick={() => void handleCopy()}>
            Copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!notes}
            onClick={() => persistNotes('')}
          >
            Clear
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </Inline>
      </div>
      <div className="diagrav-notes-body">
        <Textarea
          size="sm"
          aria-label="Review notes"
          placeholder="Jot down UI bugs, UX ideas, or change requests here… Auto-saved to docs/REVIEW_NOTES.md so your agent can read them directly."
          value={notes}
          onValueChange={persistNotes}
          rows={5}
          style={{ width: '100%', height: '100%', resize: 'none' }}
        />
      </div>
    </div>
  );
}
