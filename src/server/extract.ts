// Resume PDF extraction.
// 1. Text layer via pdfjs-dist: every text run keeps its page coordinates.
// 2. Layout recovery: runs → lines → segments; a consistent vertical gutter splits two-column pages;
//    table rows keep their cells separated by " | ".
// 3. Decorative icons (Font Awesome private-use glyphs, dingbats, emoji) are stripped.
// 4. OCR per page (poppler pdftoppm + tesseract CLI) when the text layer is missing or unusable, and for
//    scanned regions on pages that also have selectable text. OCR words that overlap text-layer lines are
//    dropped so nothing is duplicated.
// Documents are processed in memory and a private temp directory that is deleted afterwards.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import type { ResumePage } from '../engine/resume.ts';

const run = promisify(execFile);

export interface Box { x: number; y: number; w: number; h: number }
export interface ExtractedLine { text: string; box: Box; source: 'text' | 'ocr' }
export interface ExtractedPage extends ResumePage {
  width: number;
  height: number;
  lines: ExtractedLine[];
  /** Plain-language note shown in the review screen. */
  note?: string;
}
export interface ExtractResult {
  pages: ExtractedPage[];
  previews: string[];
  warnings: string[];
  ms: number;
}
export type Progress = (p: { message: string; page?: number; pages?: number; pct: number }) => void;

export const LIMITS = { maxBytes: 10 * 1024 * 1024, maxPages: 12 };
const ocrTimeout = () => Number(process.env.ROLEPROOF_OCR_TIMEOUT_MS ?? 25_000);

// ---------- text cleaning ----------

const ICONS = /[-\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}☀-➿\u{1F000}-\u{1FAFF}⬀-⯿�■-◿​-‏️]/gu;
const BULLETS = /^[\s•●▪■◆♦►▶➤✓✔·*\-–]+/;

export function cleanText(s: string): string {
  return s
    .replace(/[●▪■◆♦►▶➤✓✔]/g, '•')
    .replace(ICONS, ' ')
    .replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ')
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
    .replace(/[ \t ]+/g, ' ');
}

function usableText(text: string): { usable: boolean; alnum: number } {
  const compact = text.replace(/\s+/g, '');
  const alnum = (compact.match(/[A-Za-z0-9]/g) ?? []).length;
  const words = (text.match(/[A-Za-z]{3,}/g) ?? []).length;
  // Broken font encodings produce symbol soup with few real words.
  const usable = alnum >= 25 && words >= 4 && alnum / Math.max(1, compact.length) > 0.55;
  return { usable, alnum };
}

// ---------- layout ----------

interface Run { str: string; x: number; y: number; w: number; h: number }
interface Seg { runs: Run[]; x0: number; x1: number; y: number; h: number }

function toLines(runs: Run[]): Run[][] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Run[][] = [];
  for (const r of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y - r.y) <= Math.max(2, 0.45 * Math.min(l[0].h, r.h)));
    if (line) line.push(r);
    else lines.push([r]);
  }
  lines.forEach((l) => l.sort((a, b) => a.x - b.x));
  return lines.sort((a, b) => a[0].y - b[0].y);
}

function toSegments(line: Run[]): Seg[] {
  const segs: Seg[] = [];
  for (const r of line) {
    const last = segs[segs.length - 1];
    const gap = last ? r.x - last.x1 : Infinity;
    // A gap wider than ~1.8 em separates table cells or columns.
    if (last && gap < Math.max(10, 1.8 * r.h)) {
      last.runs.push(r);
      last.x1 = Math.max(last.x1, r.x + r.w);
    } else {
      segs.push({ runs: [r], x0: r.x, x1: r.x + r.w, y: r.y, h: r.h });
    }
  }
  return segs;
}

function segText(s: Seg): string {
  let out = '';
  let prevEnd = -1;
  for (const r of s.runs) {
    const t = r.str;
    if (!t) continue;
    if (out && prevEnd >= 0 && r.x - prevEnd > 0.18 * r.h && !out.endsWith(' ') && !t.startsWith(' ')) out += ' ';
    out += t;
    prevEnd = r.x + r.w;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Finds a vertical gutter that consistently separates two columns of text. */
export function findGutter(lines: Seg[][], width: number): number | null {
  const segs = lines.flat();
  if (segs.length < 8) return null;
  const top = Math.min(...segs.map((s) => s.y));
  const bottom = Math.max(...segs.map((s) => s.y));
  const height = Math.max(1, bottom - top);
  let best: { gx: number; cross: number } | null = null;
  for (let gx = width * 0.22; gx <= width * 0.78; gx += 2) {
    let left = 0, right = 0, cross = 0;
    const ly: number[] = [], ry: number[] = [];
    for (const s of segs) {
      if (s.x1 <= gx) { left++; ly.push(s.y); }
      else if (s.x0 >= gx) { right++; ry.push(s.y); }
      else cross++;
    }
    if (left < 4 || right < 4) continue;
    if (cross > Math.max(2, 0.15 * segs.length)) continue;
    // Both columns must run a good part of the page; a small table is not a column layout.
    const lSpan = Math.max(...ly) - Math.min(...ly);
    const rSpan = Math.max(...ry) - Math.min(...ry);
    const overlap = Math.min(Math.max(...ly), Math.max(...ry)) - Math.max(Math.min(...ly), Math.min(...ry));
    if (lSpan < 0.4 * height || rSpan < 0.4 * height || overlap < 0.3 * height) continue;
    if (!best || cross < best.cross) best = { gx, cross };
  }
  if (!best) return null;
  // Centre the gutter inside the empty band.
  let lo = best.gx, hi = best.gx;
  const free = (gx: number) => segs.filter((s) => s.x0 < gx && s.x1 > gx).length <= best!.cross;
  while (lo - 2 > width * 0.15 && free(lo - 2)) lo -= 2;
  while (hi + 2 < width * 0.85 && free(hi + 2)) hi += 2;
  return (lo + hi) / 2;
}

function boxOf(segs: Seg[]): Box {
  const x0 = Math.min(...segs.map((s) => s.x0));
  const x1 = Math.max(...segs.map((s) => s.x1));
  const y0 = Math.min(...segs.map((s) => s.y - s.h));
  const y1 = Math.max(...segs.map((s) => s.y));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Orders text runs into reading order and returns one entry per visual line or table row. */
export function layoutRuns(runs: Run[], width: number): ExtractedLine[] {
  const lines = toLines(runs.filter((r) => r.str.trim())).map(toSegments);
  const gx = findGutter(lines, width);
  const emit = (segs: Seg[]): ExtractedLine | null => {
    const text = segs.map(segText).filter(Boolean).join(' | ');
    return text ? { text, box: boxOf(segs), source: 'text' } : null;
  };
  if (gx === null) return lines.map(emit).filter((l): l is ExtractedLine => !!l);

  // Two columns: full-width lines split the page into bands; inside a band read left, then right.
  const out: ExtractedLine[] = [];
  let left: Seg[][] = [], right: Seg[][] = [];
  const flush = () => {
    for (const l of [...left, ...right]) { const e = emit(l); if (e) out.push(e); }
    left = []; right = [];
  };
  for (const line of lines) {
    const spans = line.some((s) => s.x0 < gx && s.x1 > gx);
    if (spans) { flush(); const e = emit(line); if (e) out.push(e); continue; }
    const l = line.filter((s) => s.x1 <= gx);
    const r = line.filter((s) => s.x0 >= gx);
    if (l.length) left.push(l);
    if (r.length) right.push(r);
  }
  flush();
  return out;
}

// ---------- images (for mixed pages) ----------

type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

async function imageBoxes(page: any, OPS: any, vh: number): Promise<Box[]> {
  const ops = await page.getOperatorList();
  const boxes: Box[] = [];
  let ctm: Mat = [1, 0, 0, 1, 0, 0];
  const stack: Mat[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, args as Mat);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
      const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      boxes.push({ x: x0, y: vh - y1, w: x1 - x0, h: y1 - y0 });
    }
  }
  return boxes;
}

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// ---------- OCR ----------

export interface OcrOptions { dpi?: number; psm?: number }

async function ocrPage(dir: string, pdfPath: string, pageNo: number, pageW: number, opts: OcrOptions = {}): Promise<{ lines: ExtractedLine[]; confidence: number }> {
  const dpi = opts.dpi ?? 300;
  const base = path.join(dir, `ocr-${pageNo}`);
  await run('pdftoppm', ['-r', String(dpi), '-f', String(pageNo), '-l', String(pageNo), '-png', '-singlefile', '-gray', pdfPath, base], { timeout: 60_000 });
  const { stdout } = await run('tesseract', [`${base}.png`, 'stdout', '-l', 'eng', '--psm', String(opts.psm ?? 3), 'tsv'], { timeout: ocrTimeout(), maxBuffer: 32 * 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
  await fs.rm(`${base}.png`, { force: true });
  const scale = 72 / dpi;
  const groups = new Map<string, { words: { t: string; x: number; y: number; w: number; h: number; c: number }[] }>();
  for (const row of stdout.split('\n').slice(1)) {
    const c = row.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const t = c[11]?.trim();
    const conf = Number(c[10]);
    if (!t || conf < 0) continue;
    const key = `${c[2]}-${c[3]}-${c[4]}`;
    const g = groups.get(key) ?? { words: [] };
    g.words.push({ t, x: +c[6] * scale, y: +c[7] * scale, w: +c[8] * scale, h: +c[9] * scale, c: conf });
    groups.set(key, g);
  }
  const lines: ExtractedLine[] = [];
  let confSum = 0, n = 0;
  for (const g of groups.values()) {
    const ws = g.words.sort((a, b) => a.x - b.x);
    // Split OCR lines at wide gaps too, so table cells stay separate.
    let text = '';
    ws.forEach((w, i) => {
      if (i > 0) text += w.x - (ws[i - 1].x + ws[i - 1].w) > Math.max(12, 2.2 * w.h) ? ' | ' : ' ';
      text += w.t;
      confSum += w.c; n++;
    });
    const x0 = Math.min(...ws.map((w) => w.x)), x1 = Math.max(...ws.map((w) => w.x + w.w));
    const y0 = Math.min(...ws.map((w) => w.y)), y1 = Math.max(...ws.map((w) => w.y + w.h));
    const clean = cleanText(text).trim();
    if (clean) lines.push({ text: clean, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, source: 'ocr' });
  }
  void pageW;
  return { lines, confidence: n ? Math.round(confSum / n) : 0 };
}

// ---------- main ----------

async function loadPdf(data: Uint8Array) {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const fontDir = path.join(path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
  const task = pdfjs.getDocument({ data, standardFontDataUrl: fontDir, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  return { doc, task, OPS: pdfjs.OPS };
}

export function isPdf(buf: Uint8Array): boolean {
  return buf.length > 5 && Buffer.from(buf.subarray(0, 1024)).toString('latin1').includes('%PDF-');
}

export async function extractPdf(buf: Buffer, onProgress: Progress = () => {}, only?: { page: number; forceOcr?: boolean; ocr?: OcrOptions }): Promise<ExtractResult> {
  const t0 = Date.now();
  if (!isPdf(buf)) throw new UserError('This file is not a PDF. Upload your resume as a .pdf file.');
  if (buf.length > LIMITS.maxBytes) throw new UserError('This PDF is larger than 10 MB. Export a smaller copy and try again.');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'roleproof-'));
  try {
    const pdfPath = path.join(dir, 'resume.pdf');
    await fs.writeFile(pdfPath, buf, { mode: 0o600 });
    let doc: any, OPS: any, task: any;
    try {
      ({ doc, OPS, task } = await loadPdf(new Uint8Array(buf)));
    } catch (e: any) {
      if (e?.name === 'PasswordException') throw new UserError('This PDF is password-protected. Remove the password and upload it again.');
      throw new UserError('We could not open this PDF. It may be damaged. Try exporting it again from your editor.');
    }
    const total = doc.numPages;
    if (total > LIMITS.maxPages && !only) throw new UserError(`This PDF has ${total} pages. Resumes are usually 1–2 pages; upload one with at most ${LIMITS.maxPages}.`);
    const warnings: string[] = [];
    const pages: ExtractedPage[] = [];
    const pageNos = only ? [only.page] : Array.from({ length: total }, (_, i) => i + 1);

    for (const n of pageNos) {
      const pct = (k: number) => Math.round(5 + ((pageNos.indexOf(n) + k) / pageNos.length) * 80);
      onProgress({ message: `Reading the text layer on page ${n}`, page: n, pages: total, pct: pct(0) });
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent({ includeMarkedContent: false });
      const runs: Run[] = [];
      for (const it of tc.items as any[]) {
        if (typeof it.str !== 'string') continue;
        const str = cleanText(it.str);
        if (!str.trim()) continue;
        const [, , , d, e, f] = it.transform as number[];
        const h = Math.abs(it.height || d) || 10;
        runs.push({ str, x: e, y: vp.height - f, w: it.width, h });
      }
      let lines = layoutRuns(runs, vp.width);
      const textJoined = lines.map((l) => l.text).join('\n');
      const { usable } = usableText(textJoined);
      let source: ExtractedPage['source'] = 'text';
      let confidence = 100;
      let note: string | undefined;

      const images = await imageBoxes(page, OPS, vp.height);
      const pageArea = vp.width * vp.height;
      // Large images with little text on top of them look like scanned content.
      const scannedRegions = images.filter((b) => area(b) > 0.04 * pageArea && b.w > 0.3 * vp.width && lines.filter((l) => overlapArea(l.box, b) > 0.5 * area(l.box)).reduce((a, l) => a + area(l.box), 0) < 0.05 * area(b));
      const needsOcr = only?.forceOcr || !usable;
      const mixed = !needsOcr && scannedRegions.length > 0;

      if (needsOcr || mixed) {
        onProgress({ message: `Running OCR on page ${n}${mixed ? ' (scanned section)' : ''}`, page: n, pages: total, pct: pct(0.4) });
        try {
          const ocr = await ocrPage(dir, pdfPath, n, vp.width, only?.ocr);
          if (needsOcr) {
            lines = ocr.lines;
            confidence = ocr.confidence;
            source = 'ocr';
            const ok = usableText(lines.map((l) => l.text).join('\n')).usable && confidence >= 35;
            if (!ok) {
              source = 'unreadable';
              note = `Page ${n} has no usable text layer and OCR could not read it reliably${confidence ? ` (confidence ${confidence}%)` : ''}. Retry OCR, or type or paste this page's text.`;
            } else {
              note = `Page ${n} had no usable text layer, so we read it with OCR (confidence ${confidence}%). Check names of tools for OCR slips.`;
            }
          } else {
            // Keep text-layer lines; add OCR lines from scanned regions that don't duplicate them.
            const extra = ocr.lines.filter((o) =>
              scannedRegions.some((r) => overlapArea(o.box, r) > 0.5 * area(o.box)) &&
              !lines.some((l) => overlapArea(o.box, l.box) > 0.3 * Math.min(area(o.box), area(l.box))));
            if (extra.length) {
              lines = [...lines, ...extra].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
              source = 'mixed';
              confidence = ocr.confidence;
              note = `Page ${n} mixes selectable text with a scanned section. We added ${extra.length} OCR line${extra.length > 1 ? 's' : ''} from the scanned part.`;
            }
          }
        } catch (e: any) {
          if (needsOcr) {
            source = 'unreadable';
            confidence = 0;
            lines = [];
            note = e?.code === 'ENOENT'
              ? `Page ${n} needs OCR, but the OCR tools (tesseract, pdftoppm) are not installed on this server. Paste this page's text instead.`
              : e?.killed
                ? `Page ${n} looks like an image, but OCR could not make sense of it in time (it may be a photo, a logo or very noisy). Retry OCR, or type or paste this page's text.`
                : `Page ${n} needs OCR, but OCR failed. Retry, or paste this page's text.`;
          } else warnings.push(`OCR of the scanned section on page ${n} failed; only its selectable text was used.`);
        }
      }
            pages.push({ page: n, width: vp.width, height: vp.height, lines, text: lines.map((l) => l.text).join('\n'), source, confidence, note });
      page.cleanup();
      onProgress({ message: `Finished page ${n}`, page: n, pages: total, pct: pct(1) });
    }

    onProgress({ message: 'Rendering page previews', pct: 90 });
    const previews: string[] = [];
    if (!only) {
      try {
        await run('pdftoppm', ['-r', '60', '-png', '-l', String(Math.min(total, LIMITS.maxPages)), pdfPath, path.join(dir, 'prev')], { timeout: 60_000 });
        const files = (await fs.readdir(dir)).filter((f) => f.startsWith('prev')).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));
        for (const f of files) previews.push('data:image/png;base64,' + (await fs.readFile(path.join(dir, f))).toString('base64'));
      } catch {
        warnings.push('Page previews are unavailable on this server (pdftoppm missing). The original PDF is still shown by your browser.');
      }
    }
    await task.destroy();
    for (const p of pages) if (p.source === 'unreadable') warnings.push(p.note!);
    return { pages, previews, warnings, ms: Date.now() - t0 };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export class UserError extends Error {}
