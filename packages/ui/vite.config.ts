import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-only middleware that syncs the in-app Review Notes dock with `docs/REVIEW_NOTES.md`
 * so the user's notes can be read directly by coding agents without copy-pasting.
 */
function diagravNotesPlugin(): Plugin {
  const notesPath = path.resolve(__dirname, '../../docs/REVIEW_NOTES.md');
  return {
    name: 'diagrav-review-notes',
    configureServer(server) {
      server.middlewares.use('/__diagrav_notes', (req, res) => {
        if (req.method === 'GET') {
          const content = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : '';
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ content, file: 'docs/REVIEW_NOTES.md' }));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += String(chunk);
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body) as { content?: string };
              const next = typeof parsed.content === 'string' ? parsed.content : '';
              fs.mkdirSync(path.dirname(notesPath), { recursive: true });
              fs.writeFileSync(notesPath, next, 'utf8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false }));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), diagravNotesPlugin()],
  resolve: {
    alias: {
      '@diagrav/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  server: {
    port: 5174,
  },
});
