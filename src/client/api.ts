import type { ExtractResult, ExtractedPage } from '../server/extract.ts';

export type { ExtractResult, ExtractedPage };
export interface ProgressEvent { message: string; page?: number; pages?: number; pct: number }

/** Streams progress from the server while it reads the PDF. Throws an Error with a user-facing message. */
export async function extract(
  pdf: ArrayBuffer,
  onProgress: (p: ProgressEvent) => void,
  opts: { page?: number; ocr?: boolean; dpi?: number; psm?: number } = {},
): Promise<ExtractResult> {
  const qs = new URLSearchParams();
  if (opts.page) qs.set('page', String(opts.page));
  if (opts.ocr) qs.set('ocr', '1');
  if (opts.dpi) qs.set('dpi', String(opts.dpi));
  if (opts.psm) qs.set('psm', String(opts.psm));
  let res: Response;
  try {
    res = await fetch(`/api/extract${qs.size ? `?${qs}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf });
  } catch {
    throw new Error('We could not reach the RoleProof server. Check your connection and try again.');
  }
  if (!res.ok || !res.body) throw new Error(`The server could not read the PDF (HTTP ${res.status}). Try again.`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let result: ExtractResult | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === 'progress') onProgress(msg);
      else if (msg.type === 'error') throw new Error(msg.message);
      else if (msg.type === 'result') result = msg as ExtractResult;
    }
    if (done) break;
  }
  if (!result) throw new Error('The connection closed before the PDF was read. Try again.');
  return result;
}
