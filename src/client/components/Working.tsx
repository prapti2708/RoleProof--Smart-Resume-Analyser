import type { ProgressState } from '../App.tsx';
import { Icon } from './Icons.tsx';

export function Working({ progress, onBack, onPasteInstead }: { progress: ProgressState; onBack: () => void; onPasteInstead: () => void }) {
  const done = progress.log.slice(0, -1);
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-8 pt-16">
      <p className="eyebrow">Reading your resume</p>
      {!progress.error ? (
        <>
          <h1 className="font-serif text-3xl mt-2" aria-live="polite">{progress.message || 'Starting…'}</h1>
          <div className="mt-6 h-[3px] bg-paper-3 rounded-full overflow-hidden" role="progressbar" aria-label="Extraction progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct}>
            <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${Math.max(3, progress.pct)}%` }} />
          </div>
          <ol className="mt-6 space-y-2 text-sm text-ink-2">
            {done.map((m, i) => (
              <li key={i} className="flex items-center gap-2 fade-in"><Icon name="check" className="w-4 h-4 text-teal" /> {m}</li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-ink-3">
            We read the text layer of each page, recover columns and table rows from text positions, and run OCR only on pages (or scanned sections) without usable text. Scanned pages can take up to half a minute.
          </p>
        </>
      ) : (
        <div role="alert" className="mt-3">
          <h1 className="font-serif text-3xl flex items-start gap-3"><Icon name="alert" className="w-7 h-7 text-ember mt-1" /> We couldn’t read this PDF</h1>
          <p className="mt-3 text-ink-2">{progress.error}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn btn-ink" onClick={onBack}><Icon name="back" /> Choose another file</button>
            <button className="btn btn-line" onClick={onPasteInstead}>Paste resume text instead</button>
          </div>
        </div>
      )}
    </div>
  );
}
