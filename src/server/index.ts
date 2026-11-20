// RoleProof HTTP server: serves the built client and one extraction API.
// Privacy: resume bytes live only in memory and a private temp directory removed after each request.
// Logs record method, path, status and timing only, never document contents or file names.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractPdf, LIMITS, UserError } from './extract.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(root, 'dist');
const PUBLIC = path.join(root, 'public');
const PORT = Number(process.env.PORT ?? 3000);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.map': 'application/json', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; object-src 'self' blob:; frame-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'",
};

function serveFile(res: http.ServerResponse, file: string) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, SECURITY); res.end('Not found'); return; }
    res.writeHead(200, { ...SECURITY, 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > LIMITS.maxBytes) { reject(new UserError('This PDF is larger than 10 MB. Export a smaller copy and try again.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

let ocrAvailable: boolean | null = null;
function checkOcr(): Promise<boolean> {
  if (ocrAvailable !== null) return Promise.resolve(ocrAvailable);
  return new Promise((r) => execFile('tesseract', ['--version'], (e) => {
    execFile('pdftoppm', ['-v'], (e2) => { ocrAvailable = !e && !e2; r(ocrAvailable); });
  }));
}

async function handleExtract(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  res.writeHead(200, { ...SECURITY, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  const send = (o: unknown) => res.write(JSON.stringify(o) + '\n');
  try {
    send({ type: 'progress', message: 'Receiving your PDF', pct: 2 });
    const body = await readBody(req);
    const page = url.searchParams.get('page');
    const only = page
      ? { page: Number(page), forceOcr: url.searchParams.get('ocr') === '1', ocr: { dpi: Number(url.searchParams.get('dpi') ?? 300), psm: Number(url.searchParams.get('psm') ?? 3) } }
      : undefined;
    if (only && (!Number.isInteger(only.page) || only.page < 1)) throw new UserError('Invalid page number.');
    const result = await extractPdf(body, (p) => send({ type: 'progress', ...p }), only);
    send({ type: 'result', ...result });
  } catch (e) {
    const message = e instanceof UserError ? e.message : 'Something went wrong while reading this PDF. Try again, or paste your resume text instead.';
    if (!(e instanceof UserError)) console.error('[extract] internal error:', (e as Error)?.name);
    send({ type: 'error', message });
  }
  res.end();
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const t0 = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.on('finish', () => {
      if (process.env.ROLEPROOF_QUIET) return;
      console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`);
    });
    try {
      if (req.method === 'POST' && url.pathname === '/api/extract') return await handleExtract(req, res, url);
      if (req.method === 'GET' && url.pathname === '/api/health') {
        res.writeHead(200, { ...SECURITY, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ok: true, ocr: await checkOcr() }));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SECURITY); return res.end(); }
      if (url.pathname.startsWith('/samples/')) {
        const f = path.join(PUBLIC, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
        if (!f.startsWith(path.join(PUBLIC, 'samples'))) { res.writeHead(403, SECURITY); return res.end(); }
        return serveFile(res, f);
      }
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (/^[\w.-]+$/.test(name) && fs.existsSync(path.join(DIST, name))) return serveFile(res, path.join(DIST, name));
      return serveFile(res, path.join(DIST, 'index.html'));
    } catch {
      if (!res.headersSent) res.writeHead(500, SECURITY);
      res.end();
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!fs.existsSync(path.join(DIST, 'app.js'))) {
    console.error('Client bundle missing. Run `npm run build` first.');
    process.exit(1);
  }
  createServer().listen(PORT, () => {
    console.log(`RoleProof running at http://localhost:${PORT}`);
    checkOcr().then((ok) => { if (!ok) console.warn('OCR tools not found: install tesseract-ocr and poppler-utils to read scanned pages.'); });
  });
}
