import { useState } from 'react';
import type { Analysis } from '../../engine/analyze.ts';
import type { ExtractResult, ExtractedPage } from '../api.ts';
import { Icon } from './Icons.tsx';

interface Props {
  pages: ExtractedPage[];
  extraction: ExtractResult | null;
  pdf: { url: string; name: string } | null;
  analysis: Analysis;
  onApply: (pages: ExtractedPage[]) => void;
  onCancel: () => void;
  retry: (page: number, opts: { dpi?: number; psm?: number }) => Promise<ExtractResult>;
}

export function sourceLabel(p: Pick<ExtractedPage, 'source' | 'confidence'>): { text: string; tone: string } {
  switch (p.source) {
    case 'text': return { text: 'Text layer', tone: 'text-teal' };
    case 'ocr': return { text: `OCR · ${p.confidence}% confidence`, tone: p.confidence < 70 ? 'text-ochre' : 'text-ink-2' };
    case 'mixed': return { text: `Text layer + OCR of scanned section`, tone: 'text-ink-2' };
    case 'edited': return { text: 'Edited by you', tone: 'text-ink-2' };
    default: return { text: 'Unreadable', tone: 'text-ember' };
  }
}

export function Review({ pages, extraction, pdf, analysis, onApply, onCancel, retry }: Props) {
  const [current, setCurrent] = useState<ExtractedPage[]>(pages);
  const [drafts, setDrafts] = useState<string[]>(pages.map((p) => p.text));
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const previews = extraction?.previews ?? [];
  const unreadable = current.filter((p, i) => p.source === 'unreadable' && !drafts[i].trim());
  const changed = drafts.some((d, i) => d !== pages[i]?.text) || current.some((p, i) => p !== pages[i]);

  async function doRetry(i: number, sharper: boolean) {
    const p = current[i];
    setBusy(p.page);
    setMsg((m) => ({ ...m, [p.page]: '' }));
    try {
      const r = await retry(p.page, sharper ? { dpi: 400, psm: 6 } : { dpi: 300, psm: 3 });
      const np = r.pages[0];
      setCurrent((c) => c.map((x, j) => (j === i ? np : x)));
      setDrafts((d) => d.map((x, j) => (j === i ? np.text : x)));
      setMsg((m) => ({ ...m, [p.page]: np.source === 'unreadable' ? 'OCR still could not read this page. You can type or paste its text below.' : `OCR finished with ${np.confidence}% confidence. Check the text below.` }));
    } catch (e) {
      setMsg((m) => ({ ...m, [p.page]: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  }

  function apply() {
    onApply(current.map((p, i) => {
      if (drafts[i] === p.text) return p;
      return { ...p, text: drafts[i], source: drafts[i].trim() ? 'edited' : p.source, confidence: 100, lines: [] };
    }));
  }

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10">
      <p className="eyebrow">Step 2 of 3 · Check what we read</p>
      <h1 className="font-serif text-3xl sm:text-4xl mt-2">Review extracted text</h1>
      <p className="mt-3 text-ink-2 max-w-3xl">
        This is the text we will search for evidence. Compare it with your original pages, fix anything we misread, then run the analysis. Your edits stay in this browser tab.
      </p>

      {(analysis.extraction.blocked || unreadable.length > 0) && (
        <div role="alert" className="mt-6 border-l-4 border-ember bg-ember-soft/60 px-4 py-3 text-sm max-w-3xl">
          <p className="font-semibold flex items-center gap-2"><Icon name="alert" className="w-4 h-4 text-ember" />
            {analysis.extraction.blocked ? 'We need readable text before we compare skills.' : `Page ${unreadable.map((p) => p.page).join(', ')} could not be read.`}
          </p>
          <p className="mt-1 text-ink-2">
            We won’t mark skills as missing just because a page couldn’t be read. Retry OCR on that page, or type or paste its text into the box.
          </p>
        </div>
      )}
      {pdf && (
        <p className="mt-4 text-sm"><a className="link inline-flex items-center gap-1" href={pdf.url} target="_blank" rel="noreferrer">Open the original PDF <Icon name="external" className="w-3.5 h-3.5" /></a></p>
      )}

      <div className="mt-8 space-y-12">
        {current.map((p, i) => {
          const src = sourceLabel(p);
          const dirty = drafts[i] !== p.text;
          return (
            <section key={p.page} aria-labelledby={`page-h-${p.page}`} className="border-t rule pt-6 grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 md:gap-10">
              <div>
                <h2 id={`page-h-${p.page}`} className="font-serif text-xl">Page {p.page}{current.length > 1 ? ` of ${current.length}` : ''}</h2>
                <p className={`mt-1 text-sm font-semibold ${src.tone}`}>{src.text}</p>
                {previews[p.page - 1] ? (
                  <figure className="mt-4">
                    <img src={previews[p.page - 1]} alt={`Original page ${p.page} of your resume`} className="w-full max-w-sm border rule bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]" />
                    <figcaption className="mt-2 text-xs text-ink-3">Original page {p.page}</figcaption>
                  </figure>
                ) : (
                  <p className="mt-4 text-sm text-ink-3">{pdf ? 'Preview unavailable. Use “Open the original PDF”.' : 'Pasted text has no original page.'}</p>
                )}
              </div>
              <div>
                {p.note && <p className="text-sm text-ink-2 mb-3">{p.note}</p>}
                <label htmlFor={`page-text-${p.page}`} className="text-sm font-semibold">Text we read from page {p.page}</label>
                <textarea id={`page-text-${p.page}`} value={drafts[i]} rows={Math.min(24, Math.max(10, drafts[i].split('\n').length + 2))}
                  onChange={(e) => setDrafts((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={p.source === 'unreadable' ? 'Type or paste the text of this page here.' : ''}
                  className="mt-2 w-full rounded-lg border rule bg-white/70 p-3 font-mono text-[0.82rem] leading-relaxed focus:border-ink" />
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  {pdf && (
                    <>
                      <button className="link inline-flex items-center gap-1" disabled={busy !== null} onClick={() => doRetry(i, false)}>
                        <Icon name="refresh" className="w-3.5 h-3.5" /> {busy === p.page ? 'Running OCR…' : 'Retry with OCR'}
                      </button>
                      <button className="link" disabled={busy !== null} onClick={() => doRetry(i, true)}>Sharper OCR (slower)</button>
                    </>
                  )}
                  {dirty && <button className="link" onClick={() => setDrafts((d) => d.map((x, j) => (j === i ? p.text : x)))}>Undo my edits</button>}
                  <span className="text-ink-3 text-xs">{drafts[i].split(/\s+/).filter(Boolean).length} words</span>
                </div>
                <p className="mt-2 text-sm text-ink-2" aria-live="polite">{msg[p.page]}</p>
              </div>
            </section>
          );
        })}
      </div>

      <div className="sticky bottom-0 mt-10 -mx-5 sm:-mx-8 px-5 sm:px-8 py-4 bg-paper/95 backdrop-blur border-t rule flex flex-wrap items-center gap-3 justify-between">
        <p className="text-sm text-ink-3">{changed ? 'You have changes. Evidence, counts and the plan will update together.' : 'No changes yet.'}</p>
        <div className="flex gap-3">
          <button className="btn btn-line" onClick={onCancel}>Cancel</button>
          <button className="btn btn-ink" onClick={apply} disabled={drafts.every((d) => !d.trim())}>
            {changed ? 'Rerun analysis' : 'Continue to results'} <Icon name="arrow" />
          </button>
        </div>
      </div>
    </div>
  );
}
