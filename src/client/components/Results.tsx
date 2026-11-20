import { useMemo, useState } from 'react';
import type { Analysis } from '../../engine/analyze.ts';
import type { Plan } from '../../engine/plan.ts';
import type { ExtractResult, ExtractedPage } from '../api.ts';
import { EvidenceLens, buildRows } from './EvidenceLens.tsx';
import { PlanView } from './PlanView.tsx';
import { sourceLabel } from './Review.tsx';
import { Icon } from './Icons.tsx';

interface Props {
  analysis: Analysis;
  plan: Plan | null;
  jd: string;
  pages: ExtractedPage[];
  extraction: ExtractResult | null;
  onReview: () => void;
  onEditInputs: () => void;
}

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Results({ analysis, plan, jd, pages, extraction, onReview, onEditInputs }: Props) {
  const rows = useMemo(() => buildRows(analysis), [analysis]);
  const [selected, setSelected] = useState<string | null>(rows[0]?.key ?? null);
  const c = analysis.counts;
  const requiredGaps = analysis.items.filter((i) => i.status === 'missing' && i.strength !== 'preferred').sort((a, b) => (a.gapRank ?? 0) - (b.gapRank ?? 0));
  const preferredGaps = analysis.items.filter((i) => i.status === 'missing' && i.strength === 'preferred');
  const jdTitle = jd.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const sel = rows.some((r) => r.key === selected) ? selected : rows[0]?.key ?? null;

  const showEvidence = (key: string) => {
    setSelected(key);
    requestAnimationFrame(() => {
      const target = window.innerWidth >= 768 ? document.getElementById('lens') : document.querySelector(`[data-row="${CSS.escape(key)}"]`);
      target?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      document.querySelector<HTMLButtonElement>(`[data-row="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
    });
  };
  const jumpToPlan = (key: string) => {
    const g = plan?.gaps.find((x) => x.key === key);
    const first = g?.days[0] ?? 1;
    const el = document.getElementById(`day-${first}`);
    el?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    el?.querySelector<HTMLButtonElement>('button[data-toggle]')?.focus({ preventScroll: true });
  };

  const sources = pages.map((p) => `p.${p.page}: ${sourceLabel(p).text.toLowerCase()}`).join(' · ');

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10">
      {/* Summary */}
      <section aria-labelledby="summary-h">
        <p className="eyebrow truncate">Results{jdTitle ? ` · ${jdTitle}` : ''}</p>
        <h1 id="summary-h" className="font-serif text-[2rem] sm:text-[2.7rem] leading-[1.12] mt-3 max-w-4xl text-balance">{analysis.summary}</h1>
        {!analysis.extraction.blocked && c.counted > 0 && (
          <p className="mt-3 text-ink-2 max-w-3xl text-[0.95rem]">{analysis.denominator}</p>
        )}

        {analysis.extraction.message && (
          <div role="status" className={`mt-5 max-w-3xl border-l-4 px-4 py-3 text-sm ${analysis.extraction.blocked || analysis.extraction.unreadablePages.length ? 'border-ember bg-ember-soft/60' : 'border-ochre bg-ochre-soft/60'}`}>
            <p>{analysis.extraction.message}</p>
            <button className="link mt-1 font-semibold" onClick={onReview}>Review extracted text</button>
          </div>
        )}

        {!analysis.extraction.blocked && c.counted > 0 && (
          <dl className="mt-7 grid grid-cols-2 sm:grid-cols-4 border-y rule divide-x divide-[var(--color-rule)] text-sm">
            <div className="py-3 px-3"><dt className="text-ink-3">Required</dt><dd className="mt-0.5"><span className="font-serif text-xl">{c.requiredMatched}</span> of {c.required} shown</dd></div>
            <div className="py-3 px-3"><dt className="text-ink-3">Preferred</dt><dd className="mt-0.5"><span className="font-serif text-xl">{c.preferredMatched}</span> of {c.preferred} shown</dd></div>
            <div className="py-3 px-3 border-t sm:border-t-0 rule"><dt className="text-ink-3">Needs review</dt><dd className="mt-0.5"><span className="font-serif text-xl">{c.review}</span> not counted</dd></div>
            <div className="py-3 px-3 border-t sm:border-t-0 rule"><dt className="text-ink-3">Not needed</dt><dd className="mt-0.5">{analysis.notRequired.length ? analysis.notRequired.map((n) => n.name).join(', ') : '—'}</dd></div>
          </dl>
        )}

        {requiredGaps.length > 0 && (
          <p className="mt-5 text-[0.95rem]">
            <span className="font-semibold text-ember">Required gaps:</span>{' '}
            {requiredGaps.map((g, i) => (
              <span key={g.key}>{i > 0 && ', '}<button className="font-semibold underline decoration-ember decoration-2 underline-offset-4 hover:bg-ember-soft rounded-sm" onClick={() => showEvidence(g.key)}>{g.canonical}</button></span>
            ))}
            {preferredGaps.length > 0 && <span className="text-ink-3"> · plus {preferredGaps.length} preferred</span>}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <button className="link inline-flex items-center gap-1.5" onClick={onReview}><Icon name="edit" className="w-3.5 h-3.5" /> Review extracted text</button>
          <button className="link inline-flex items-center gap-1.5" onClick={onEditInputs}><Icon name="back" className="w-3.5 h-3.5" /> Change resume or JD</button>
          <span className="text-ink-3 text-xs self-center">Read from {sources}</span>
        </div>
      </section>

      {/* Evidence Lens */}
      <section id="lens" aria-labelledby="lens-h" className="mt-14 scroll-mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
          <h2 id="lens-h" className="font-serif text-3xl">Evidence Lens</h2>
          <p className="text-sm text-ink-3">Select a skill to see the exact JD line and resume excerpt. Use ↑ ↓ to move.</p>
        </div>
        <EvidenceLens analysis={analysis} rows={rows} jd={jd} pages={pages} previews={extraction?.previews ?? []} plan={plan} selected={sel} onSelect={setSelected} onJumpToPlan={jumpToPlan} />
      </section>

      {/* Plan */}
      {!analysis.extraction.blocked && (
        <section id="plan" aria-labelledby="plan-h" className="mt-16 scroll-mt-4">
          <div className="border-b-2 border-ink pb-2">
            <h2 id="plan-h" className="font-serif text-3xl">Your two-week plan</h2>
          </div>
          <PlanView plan={plan} analysis={analysis} onEvidence={showEvidence} />
        </section>
      )}
    </div>
  );
}
