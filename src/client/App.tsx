import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyze } from '../engine/analyze.ts';
import { buildPlan } from '../engine/plan.ts';
import { extract, type ExtractResult, type ExtractedPage } from './api.ts';
import { InputScreen, type ResumeInput } from './components/InputScreen.tsx';
import { Working } from './components/Working.tsx';
import { Review } from './components/Review.tsx';
import { Results } from './components/Results.tsx';

type Screen = 'input' | 'working' | 'review' | 'results';
export interface ProgressState { pct: number; message: string; log: string[]; error?: string }

export function App() {
  const [screen, setScreen] = useState<Screen>('input');
  const [resume, setResume] = useState<ResumeInput | null>(null);
  const [jd, setJd] = useState('');
  const [extraction, setExtraction] = useState<ExtractResult | null>(null);
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ pct: 0, message: '', log: [] });
  const [announce, setAnnounce] = useState('');
  const mainRef = useRef<HTMLElement>(null);

  const analysis = useMemo(() => (pages.length && jd.trim() ? analyze(jd, pages) : null), [jd, pages]);
  const plan = useMemo(() => (analysis && !analysis.extraction.blocked ? buildPlan(analysis.topGaps) : null), [analysis]);

  const go = useCallback((s: Screen) => {
    setScreen(s);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      mainRef.current?.focus({ preventScroll: true });
    });
  }, []);

  // Revoke the object URL of the original PDF when it is replaced.
  useEffect(() => () => { if (resume?.kind === 'pdf') URL.revokeObjectURL(resume.url); }, [resume]);

  const run = useCallback(async (r: ResumeInput, jdText: string) => {
    setJd(jdText);
    if (r.kind === 'text') {
      setExtraction(null);
      setPages([{ page: 1, text: r.text, source: 'edited', confidence: 100, lines: [], width: 0, height: 0 }]);
      go('results');
      return;
    }
    setProgress({ pct: 1, message: 'Uploading your PDF', log: [] });
    go('working');
    try {
      const result = await extract(r.bytes, (p) =>
        setProgress((prev) => ({ pct: p.pct, message: p.message, log: prev.log[prev.log.length - 1] === p.message ? prev.log : [...prev.log, p.message] })),
      );
      setExtraction(result);
      setPages(result.pages);
      const a = analyze(jdText, result.pages);
      // If any page is unreadable, send the student to fix it before showing gaps.
      go(a.extraction.blocked || a.extraction.unreadablePages.length ? 'review' : 'results');
    } catch (e) {
      setProgress((p) => ({ ...p, error: (e as Error).message }));
    }
  }, [go]);

  const applyEdits = useCallback((next: ExtractedPage[]) => {
    setPages(next);
    setAnnounce('Analysis updated with your corrected text. Evidence, counts and the plan have been recalculated.');
    go('results');
  }, [go]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b rule">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-4 flex items-center justify-between gap-4">
          <button className="flex items-baseline gap-3 text-left" onClick={() => go('input')} aria-label="RoleProof home">
            <span className="font-serif text-2xl tracking-tight">RoleProof</span>
            <span className="hidden sm:inline text-sm text-ink-3">Evidence for every requirement</span>
          </button>
          <nav aria-label="Progress" className="text-xs text-ink-3 flex gap-2 sm:gap-4">
            {(['input', 'review', 'results'] as const).map((s, i) => (
              <span key={s} className={screen === s || (s === 'input' && screen === 'working') ? 'text-ink font-semibold' : ''} aria-current={screen === s ? 'step' : undefined}>
                {i + 1}. {s === 'input' ? 'Upload' : s === 'review' ? 'Review text' : 'Results'}
              </span>
            ))}
          </nav>
        </div>
      </header>

      <main ref={mainRef} tabIndex={-1} className="flex-1 outline-none">
        <p className="sr-only" aria-live="polite">{announce}</p>
        {screen === 'input' && (
          <InputScreen initialResume={resume} initialJd={jd} onResume={setResume} onSubmit={run} />
        )}
        {screen === 'working' && (
          <Working progress={progress} onBack={() => go('input')} onPasteInstead={() => { setResume({ kind: 'text', text: '' }); go('input'); }} />
        )}
        {screen === 'review' && analysis && (
          <Review
            pages={pages}
            extraction={extraction}
            pdf={resume?.kind === 'pdf' ? resume : null}
            analysis={analysis}
            onApply={applyEdits}
            onCancel={() => go(analysis.extraction.blocked ? 'input' : 'results')}
            retry={(page, opts) => (resume?.kind === 'pdf' ? extract(resume.bytes, () => {}, { page, ocr: true, ...opts }) : Promise.reject(new Error('No PDF to retry.')))}
          />
        )}
        {screen === 'results' && analysis && (
          <Results
            analysis={analysis}
            plan={plan}
            jd={jd}
            pages={pages}
            extraction={extraction}
            onReview={() => go('review')}
            onEditInputs={() => go('input')}
          />
        )}
      </main>

      <footer className="border-t rule mt-16">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-6 text-xs text-ink-3 flex flex-col sm:flex-row gap-2 sm:justify-between">
          <p>Your PDF is read on this server for this request only and is not stored. Matching and the plan run in your browser.</p>
          <p>Skill dictionary v{analysis?.dictionaryVersion ?? '2026.11.1'}</p>
        </div>
      </footer>
    </div>
  );
}
