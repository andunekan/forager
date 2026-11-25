import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function foragerServerPlugin(): Plugin {
  return {
    name: 'forager-server-middleware',
    configureServer(server) {
      // Serve static recipe photos with long-lived immutable caching so tab/modal switches are instant
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/images/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        next();
      });

      server.middlewares.use('/api/fetch-recipe', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { url?: string };
          const targetUrl = body.url?.trim();

          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing recipe URL' }));
            return;
          }

          let parsed: URL;
          try {
            parsed = new URL(targetUrl);
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid URL format' }));
            return;
          }

          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Only http and https URLs are supported' }));
            return;
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          try {
            const response = await fetch(parsed.toString(), {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ForagerRecipeImporter/1.0)',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              },
            });
            clearTimeout(timeout);

            if (!response.ok) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: `Could not reach recipe page (${response.status})` }));
              return;
            }

            const html = await response.text();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ html, url: response.url || targetUrl }));
          } catch (fetchErr) {
            clearTimeout(timeout);
            const message =
              fetchErr instanceof Error && fetchErr.name === 'AbortError'
                ? 'Request timed out while fetching recipe'
                : 'Unable to fetch that URL directly';
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: message }));
          }
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON request body' }));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), foragerServerPlugin()],
});
