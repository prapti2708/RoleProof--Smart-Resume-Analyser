import { useRef, type KeyboardEvent } from 'react';
import type { Analysis, JDQuote, ResultItem } from '../../engine/analyze.ts';
import type { Plan } from '../../engine/plan.ts';
import type { ExtractedPage } from '../api.ts';
import { Icon } from './Icons.tsx';

export type RowStatus = 'missing' | 'matched' | 'review' | 'notneeded';
export interface LensRow {
  key: string;
  label: string;
  status: RowStatus;
  group: string;
  tag: string;
  line: number;
  item?: ResultItem;
  jd: JDQuote;
  name?: string;
}

export function buildRows(a: Analysis): LensRow[] {
  const rows: LensRow[] = [];
  const tag = (i: ResultItem) => (i.strength === 'preferred' ? 'Preferred' : 'Required');
  const req = a.items.filter((i) => i.status === 'missing' && i.strength !== 'preferred').sort((x, y) => (x.gapRank ?? 0) - (y.gapRank ?? 0));
  const pref = a.items.filter((i) => i.status === 'missing' && i.strength === 'preferred').sort((x, y) => (x.gapRank ?? 0) - (y.gapRank ?? 0));
  const review = a.items.filter((i) => i.status === 'review');
  const matched = a.items.filter((i) => i.status === 'matched');
  req.forEach((i) => rows.push({ key: i.key, label: i.label, status: 'missing', group: 'Required · no evidence found', tag: tag(i), line: i.jd.line, item: i, jd: i.jd }));
  pref.forEach((i) => rows.push({ key: i.key, label: i.label, status: 'missing', group: 'Preferred · no evidence found', tag: tag(i), line: i.jd.line, item: i, jd: i.jd }));
  review.forEach((i) => rows.push({ key: i.key, label: i.label, status: 'review', group: 'Needs your review · not counted', tag: tag(i), line: i.jd.line, item: i, jd: i.jd }));
  matched.forEach((i) => rows.push({ key: i.key, label: i.label, status: 'matched', group: 'Evidence found', tag: tag(i), line: i.jd.line, item: i, jd: i.jd }));
  a.notRequired.forEach((n) => rows.push({ key: `nr:${n.skillId}`, label: n.jd.wording, name: n.name, status: 'notneeded', group: 'Mentioned as not needed · not counted', tag: 'Not needed', line: n.jd.line, jd: n.jd }));
  return rows;
}

const STATUS: Record<RowStatus, { icon: string; text: string; tone: string; hl: string }> = {
  missing: { icon: 'gap', text: 'No evidence found in your resume', tone: 'text-ember', hl: 'hl-gap' },
  matched: { icon: 'matched', text: 'Evidence found in your resume', tone: 'text-teal', hl: 'hl-match' },
  review: { icon: 'review', text: 'Needs your review', tone: 'text-ochre', hl: 'hl-review' },
  notneeded: { icon: 'minus', text: 'The JD says this is not needed', tone: 'text-ink-3', hl: 'sentence' },
};

interface Props {
  analysis: Analysis;
  rows: LensRow[];
  jd: string;
  pages: ExtractedPage[];
  previews: string[];
  plan: Plan | null;
  selected: string | null;
  onSelect: (key: string) => void;
  onJumpToPlan: (key: string) => void;
}

export function EvidenceLens({ rows, jd, pages, previews, plan, selected, onSelect, onJumpToPlan, analysis }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const current = rows.find((r) => r.key === selected) ?? rows[0];

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-row]') ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : Math.min(btns.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
    btns[next].focus();
    onSelect(btns[next].dataset.row!);
  }

  if (!rows.length) {
    return <p className="mt-6 text-ink-2">We didn’t find any skills from our dictionary in this job description, so there is nothing to compare yet. Check that you pasted the full JD.</p>;
  }

  let lastGroup = '';
  return (
    <div className="mt-6 grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-0 md:gap-10">
      <div ref={listRef} onKeyDown={onKey} aria-label="Skills found in the job description" role="group">
        {rows.map((r) => {
          const header = r.group !== lastGroup ? r.group : null;
          lastGroup = r.group;
          const isSel = current?.key === r.key;
          const s = STATUS[r.status];
          return (
            <div key={r.key}>
              {header && <h3 className={`eyebrow pt-6 pb-2 border-b rule ${r.status === 'missing' ? 'text-ember!' : r.status === 'matched' ? 'text-teal!' : ''}`}>{header} <span className="font-normal">({rows.filter((x) => x.group === header).length})</span></h3>}
              <button
                data-row={r.key}
                onClick={() => onSelect(r.key)}
                aria-expanded={isSel}
                aria-controls={isSel ? `detail-${r.key} lens-panel` : 'lens-panel'}
                className={`w-full text-left flex items-center gap-3 py-3 pl-3 pr-2 border-b rule border-l-2 transition-colors ${isSel ? 'bg-paper-2 border-l-ink' : 'border-l-transparent hover:bg-paper-2/60'}`}
              >
                <span className={s.tone}><Icon name={s.icon} className="w-[18px] h-[18px]" label={s.text} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{r.name ?? r.label}</span>
                  <span className="block text-xs text-ink-3">
                    {r.tag}{r.item?.gapRank && r.item.gapRank <= 3 && plan?.gaps.length ? ` · Gap ${r.item.gapRank} in plan` : ''}{r.status === 'matched' && r.item?.resume ? ` · page ${r.item.resume.page}` : ''}
                  </span>
                </span>
                <span className="font-mono text-xs text-ink-3" aria-label={`JD line ${r.line}`}>L{r.line}</span>
                <Icon name={isSel ? 'down' : 'chevron'} className="w-4 h-4 text-ink-3 md:hidden" />
              </button>
              {isSel && (
                <div className="md:hidden border-b rule px-3 py-5 bg-paper-2/50 fade-in" id={`detail-${r.key}`}>
                  <Detail row={r} jd={jd} pages={pages} previews={previews} plan={plan} onJumpToPlan={onJumpToPlan} analysis={analysis} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <aside className="hidden md:block" aria-label="Evidence for the selected skill">
        <div className="sticky top-6 pt-6" id="lens-panel" aria-live="polite">
          {current && <Detail key={current.key} row={current} jd={jd} pages={pages} previews={previews} plan={plan} onJumpToPlan={onJumpToPlan} analysis={analysis} />}
        </div>
      </aside>
    </div>
  );
}

function JDLineView({ jd, q, hl }: { jd: string; q: JDQuote; hl: string }) {
  const ls = jd.lastIndexOf('\n', q.quoteStart - 1) + 1;
  let le = jd.indexOf('\n', q.quoteEnd);
  if (le < 0) le = jd.length;
  const line = jd.slice(ls, le).replace(/\r$/, '');
  const a = q.quoteStart - ls, b = q.quoteEnd - ls;
  const h0 = a + q.hlStart, h1 = a + q.hlEnd;
  const multi = line.trim() !== q.quote.trim();
  return (
    <blockquote className="mt-2 flex gap-4 font-serif text-[1.08rem] leading-relaxed">
      <span className="font-mono text-xs text-ink-3 pt-1.5 select-none w-6 text-right" aria-hidden>{q.line}</span>
      <span className="flex-1">
        <span className="text-ink-3">{line.slice(0, a)}</span>
        <span className={multi ? 'sentence' : ''}>
          {line.slice(a, h0)}<mark className={hl}>{line.slice(h0, h1)}</mark>{line.slice(h1, b)}
        </span>
        <span className="text-ink-3">{line.slice(b)}</span>
      </span>
    </blockquote>
  );
}

function Detail({ row, jd, pages, previews, plan, onJumpToPlan, analysis }: { row: LensRow; jd: string; pages: ExtractedPage[]; previews: string[]; plan: Plan | null; onJumpToPlan: (k: string) => void; analysis: Analysis }) {
  const s = STATUS[row.status];
  const it = row.item;
  const gap = plan?.gaps.find((g) => g.key === row.key);
  const days = gap?.days.filter((d) => plan!.days[d - 1]?.kind === 'learn') ?? [];
  const sentenceNo = Number(row.jd.anchorId.split('.S')[1]);
  const lineHasMany = jd.split('\n')[row.jd.line - 1]?.trim() !== row.jd.quote.trim();
  const ev = it?.resume;
  const page = ev ? pages.find((p) => p.page === ev.page) : undefined;
  const firstLine = ev?.quote.split('\n')[0] ?? '';
  const box = page && page.lines.length && previews[page.page - 1] ? page.lines.find((l) => l.text === firstLine)?.box : undefined;
  const totalGaps = analysis.items.filter((i) => i.status === 'missing').length;

  return (
    <div className="fade-in">
      <p className={`text-sm font-semibold flex items-center gap-2 ${s.tone}`}><Icon name={s.icon} className="w-4 h-4" /> {s.text}</p>
      <h3 className="font-serif text-[1.9rem] leading-tight mt-2">{row.name ?? it?.canonical}</h3>
      {it && it.label.toLowerCase() !== it.canonical.toLowerCase() && <p className="text-sm text-ink-3 mt-1">The JD says “{it.label}”.</p>}

      <figure className="mt-6">
        <figcaption className="eyebrow">Job description · line {row.jd.line}{lineHasMany ? ` · sentence ${sentenceNo}` : ''}</figcaption>
        <JDLineView jd={jd} q={row.jd} hl={s.hl} />
        {it && <p className="mt-2 text-sm text-ink-2 pl-10">{it.strengthReason}{it.otherMentions ? ` Also mentioned ${it.otherMentions} more time${it.otherMentions > 1 ? 's' : ''}.` : ''}</p>}
      </figure>

      {row.status === 'matched' && ev && (
        <figure className="mt-6 border-t rule pt-5">
          <figcaption className="eyebrow">Your resume · page {ev.page}{ev.usage ? ` · ${ev.usage}` : ''}</figcaption>
          <div className="mt-2 flex gap-4 items-start">
            <blockquote className="flex-1 font-serif text-[1.05rem] leading-relaxed whitespace-pre-line">
              {ev.quote.slice(0, ev.hitStart)}<mark className="hl-match">{ev.quote.slice(ev.hitStart, ev.hitEnd)}</mark>{ev.quote.slice(ev.hitEnd)}
            </blockquote>
            {box && page && (
              <div className="relative w-24 shrink-0 border rule bg-white hidden sm:block" aria-hidden>
                <img src={previews[page.page - 1]} alt="" className="w-full" />
                <span className="absolute border-2 border-teal rounded-sm" style={{ left: `${(box.x / page.width) * 100 - 1}%`, top: `${(box.y / page.height) * 100 - 0.6}%`, width: `${(box.w / page.width) * 100 + 2}%`, height: `${Math.max(1.5, (box.h / page.height) * 100 + 1.2)}%` }} />
              </div>
            )}
          </div>
          {it?.explanation && (
            <p className="mt-3 text-sm bg-teal-soft/60 border-l-2 border-teal px-3 py-2 flex gap-2"><Icon name="check" className="w-4 h-4 text-teal mt-0.5" /> <span>{it.explanation}</span></p>
          )}
        </figure>
      )}

      {row.status === 'missing' && it && (
        <div className="mt-6 border-t rule pt-5 text-sm text-ink-2 space-y-3">
          <p>
            We searched every page of your resume, including projects, internships and table cells, and found no mention of {it.canonical}. That says nothing about your ability. If you have used it, name it where you used it, then rerun the analysis.
          </p>
          {it.gapRank && (
            <div>
              <p className="eyebrow text-ember!">Gap {it.gapRank} of {totalGaps}{it.gapRank > 3 ? ' · not in this plan' : ''}</p>
              <p className="mt-1">{it.gapReason}</p>
              {it.gapRank > 3 && <p className="mt-1 text-ink-3">The plan covers the top three gaps so that each gets real practice time.</p>}
            </div>
          )}
          {gap && days.length > 0 && (
            <button className="btn btn-line py-1.5! text-sm!" onClick={() => onJumpToPlan(row.key)}>
              In your plan: Days {days[0]}–{days[days.length - 1]} <Icon name="arrow" />
            </button>
          )}
        </div>
      )}

      {row.status === 'review' && it && (
        <div className="mt-6 border-t rule pt-5 text-sm text-ink-2">
          <p>{it.reviewReason}</p>
          <p className="mt-2 text-ink-3">Items needing review are not counted as matched or missing, and are not added to the plan.</p>
        </div>
      )}
      {row.status === 'notneeded' && (
        <p className="mt-6 border-t rule pt-5 text-sm text-ink-2">The JD says {row.name} isn’t needed, so it is not counted and won’t appear as a gap.</p>
      )}
    </div>
  );
}
