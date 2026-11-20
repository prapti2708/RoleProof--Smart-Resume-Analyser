// Exercises the real PDF upload and extraction path with fixture PDFs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import { extractPdf } from '../src/server/extract.ts';
import { createServer } from '../src/server/index.ts';
import { analyze } from '../src/engine/analyze.ts';

process.env.ROLEPROOF_OCR_TIMEOUT_MS = '8000';
process.env.ROLEPROOF_QUIET = '1';
const fx = (n: string) => fs.readFileSync(new URL(`../fixtures/pdfs/${n}`, import.meta.url));
const textOf = async (n: string) => (await extractPdf(fx(n))).pages;

test('two-column layout is read column by column', async () => {
  const [p] = await textOf('two_column.pdf');
  const lines = p.text.split('\n');
  const idx = (s: string) => lines.findIndex((l) => l.includes(s));
  assert.equal(p.source, 'text');
  // Left column (Skills … Languages) comes before the right column (Experience … Achievements).
  assert.ok(idx('English, Hindi') < idx('Experience'), 'left column finished before right column starts');
  // Wrapped sentence in the right column stays contiguous.
  assert.equal(idx('portal using ReactJS and NodeJS'), idx('Placement Portal: built a placement') + 1);
  assert.ok(!lines.some((l) => /Python, Java, SQL.*Backend/.test(l)), 'no line mixes both columns');
});

test('table rows keep their cells', async () => {
  const [p] = await textOf('table_skills.pdf');
  assert.ok(p.text.includes('DevOps | GitHub Actions, Docker'));
  assert.ok(p.text.includes('Databases | MongoDB, MySQL'));
});

test('decorative icons are removed', async () => {
  const [p] = await textOf('icons.pdf');
  assert.ok(!/[-☀-➿]|[\u{1F000}-\u{1FAFF}]/u.test(p.text), p.text);
  assert.ok(p.text.includes('meera@example.com'));
  assert.ok(p.text.includes('Skills: Kotlin, Android, Firebase'));
});

test('image-only page is read with OCR', async () => {
  const [p] = await textOf('scanned.pdf');
  assert.equal(p.source, 'ocr');
  assert.ok(p.confidence > 60);
  assert.match(p.text, /Spring Boot/);
  assert.match(p.text, /MySQL/);
});

test('mixed PDF: OCR only where the text layer is missing', async () => {
  const pages = await textOf('mixed_pages.pdf');
  assert.deepEqual(pages.map((p) => p.source), ['text', 'ocr']);
  assert.match(pages[1].text, /TensorFlow/);
});

test('scanned section on a text page is added without duplicating the text layer', async () => {
  const [p] = await textOf('mixed_region.pdf');
  assert.equal(p.source, 'mixed');
  assert.match(p.text, /Terraform/);
  assert.equal(p.text.split('Skills: Python, FastAPI').length - 1, 1, 'typed line appears once');
  assert.equal((p.text.match(/Vikram Rao/g) ?? []).length, 1);
});

test('unreadable page is identified and does not produce false gaps', async () => {
  const pages = await textOf('unreadable.pdf');
  assert.equal(pages[0].source, 'text');
  assert.equal(pages[1].source, 'unreadable');
  assert.match(pages[1].note!, /Page 2/);
  const a = analyze('Python is required.\nDocker is required.', pages);
  assert.deepEqual(a.extraction.unreadablePages, [2]);
  assert.equal(a.items.find((i) => i.skillIds[0] === 'docker')!.status, 'review');
  assert.deepEqual(a.missingSkillIds, []);
});

test('extracted lines carry page coordinates', async () => {
  const [p] = await textOf('two_column.pdf');
  const l = p.lines.find((x) => x.text.startsWith('Placement Portal'))!;
  assert.ok(l.box.x > p.width / 2, 'right-column line has x in the right half');
  assert.ok(l.box.y > 0 && l.box.y < p.height);
});

// ---- HTTP upload path ----
let base = '';
const server = createServer();
before(() => new Promise<void>((r) => server.listen(0, () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; r(); })));
after(() => new Promise<void>((r) => server.close(() => r())));

async function post(body: Buffer, qs = '') {
  const res = await fetch(`${base}/api/extract${qs}`, { method: "POST", body: new Uint8Array(body), headers: { 'Content-Type': 'application/pdf' } });
  return (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
}

test('POST /api/extract streams progress then a result', async () => {
  const msgs = await post(fx('table_skills.pdf'));
  assert.ok(msgs.filter((m) => m.type === 'progress').length >= 3);
  const result = msgs.at(-1);
  assert.equal(result.type, 'result');
  assert.equal(result.pages.length, 1);
  assert.equal(result.previews.length, 1);
  assert.match(result.previews[0], /^data:image\/png;base64,/);
});

test('POST /api/extract retries one page with OCR', async () => {
  const msgs = await post(fx('two_column.pdf'), '?page=1&ocr=1');
  const result = msgs.at(-1);
  assert.equal(result.pages[0].source, 'ocr');
  assert.match(result.pages[0].text, /Kubernetes/);
});

test('POST /api/extract rejects non-PDF files with an actionable message', async () => {
  const msgs = await post(Buffer.from('hello, this is not a pdf'));
  assert.equal(msgs.at(-1).type, 'error');
  assert.match(msgs.at(-1).message, /not a PDF/);
});

test('sample files are served for "Try a sample"', async () => {
  const pdf = await fetch(`${base}/samples/sample-resume.pdf`);
  assert.equal(pdf.status, 200);
  const jd = await (await fetch(`${base}/samples/sample-jd.txt`)).text();
  assert.match(jd, /Docker is required/);
});
