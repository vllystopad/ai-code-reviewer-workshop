// READY — `npm run ui`: a tiny local UI on the same engine as the CLI. node:http only, no build step.
// Binds to 127.0.0.1 (PORT, HOST override it). It never posts to GitHub.
import '../src/env.ts';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { config, parseRequest, review } from './api.ts';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const send = (res: ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 100_000) reject(new Error('request too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') return send(res, 200, readFileSync('ui/index.html', 'utf8'), 'text/html');
    if (req.method === 'GET' && req.url === '/api/config') return send(res, 200, config());
    if (req.method === 'POST' && req.url === '/api/review') {
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'send application/json' });
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: 'invalid JSON' });
      }
      const parsed = parseRequest(body);
      if (!parsed.ok) return send(res, 400, { error: parsed.error });
      try {
        return send(res, 200, await review(parsed.req));
      } catch (e) {
        return send(res, 500, { error: (e as Error).message });
      }
    }
    // Saved reports: GET /api/report?name=<file>&format=<pdf|txt>
    if (req.method === 'GET' && req.url?.startsWith('/api/report')) {
      const q = new URL(req.url, 'http://localhost').searchParams;
      const name = q.get('name') ?? '';
      const format = q.get('format') ?? 'txt';
      try {
        const text = readFileSync(`reports/${name}`, 'utf8');
        if (format === 'pdf') return send(res, 200, execSync(`pandoc reports/${name} -t plain`).toString(), 'text/plain');
        return send(res, 200, text, 'text/html');
      } catch {
        return send(res, 404, `<h1>Report ${name} not found</h1>`, 'text/html');
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: (e as Error).message });
  }
}).listen(PORT, HOST, () => console.log(`Reviewer UI: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
