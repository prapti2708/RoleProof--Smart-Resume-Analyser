import { useEffect, useMemo, useState } from 'react';
import type { Analysis } from '../../engine/analyze.ts';
import type { Plan, PlanDay } from '../../engine/plan.ts';
import { Icon } from './Icons.tsx';

const MARKS = ['◆', '●', '▲'];
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useProgress(signature: string) {
  const storageKey = `roleproof:plan:${signature}`;
  const [done, setDone] = useState<Record<number, boolean>>({});
  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(storageKey) ?? '{}')); } catch { setDone({}); }
  }, [storageKey]);
  const toggle = (d: number) => setDone((prev) => {
    const next = { ...prev, [d]: !prev[d] };
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage unavailable: keep in memory */ }
    return next;
  });
  return [done, toggle] as const;
}

export function PlanView({ plan, analysis, onEvidence }: { plan: Plan | null; analysis: Analysis; onEvidence: (key: string) => void }) {
  const signature = useMemo(() => (plan ? plan.gaps.map((g) => g.skillId).join('+') : 'none'), [plan]);
  const [done, toggle] = useProgress(signature);
  const nextDay = plan?.days.find((d) => !done[d.day])?.day ?? 1;
  const [open, setOpen] = useState<Record<number, boolean>>({});
  useEffect(() => setOpen({ [nextDay]: true }), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan || plan.mode === 'none') {
    const review = analysis.counts.review;
    return (
      <div className="mt-6 border-t rule pt-6 max-w-2xl">
        <p className="font-serif text-2xl flex items-center gap-3"><Icon name="matched" className="w-6 h-6 text-teal" /> No verified gaps to plan for</p>
        <p className="mt-3 text-ink-2">Your resume shows evidence for every requirement we could verify in this JD.{review ? ` ${review} item${review > 1 ? 's need' : ' needs'} your review above; once you confirm them, the plan updates.` : ' Use the time to turn your strongest projects into clear resume bullets with results.'}</p>
      </div>
    );
  }

  const gapIndex = (key: string) => plan.gaps.findIndex((g) => g.key === key);
  const markFor = (d: PlanDay) => (d.kind === 'learn' ? MARKS[gapIndex(d.gapKeys[0])] : '★');
  const doneCount = plan.days.filter((d) => done[d.day]).length;
  const range = (ds: number[]) => (ds.length ? `Days ${ds[0]}–${ds[ds.length - 1]}` : '');

  const openDay = (n: number) => {
    setOpen((o) => ({ ...o, [n]: true }));
    requestAnimationFrame(() => {
      const el = document.getElementById(`day-${n}`);
      el?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      el?.querySelector<HTMLButtonElement>('button[data-toggle]')?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="mt-4">
      <p className="text-ink-2 max-w-3xl">
        {plan.gaps.length === 1 ? 'One verified gap' : `The top ${plan.gaps.length} verified gaps`}, about 30–45 minutes a day ({Math.round(plan.totalMinutes / 60)} hours in total).{' '}
        {plan.mode === 'project' ? <>It ends with one small project: <em className="font-serif">{plan.projectTitle}</em>.</> : 'These skills don’t share one natural project, so each ends with its own practical checkpoint.'}
      </p>

      <ul className="mt-6 grid sm:grid-cols-3 gap-0 border-t rule" aria-label="Gaps covered by the plan">
        {plan.gaps.map((g, i) => {
          const item = analysis.items.find((x) => x.key === g.key);
          const learn = g.days.filter((d) => plan.days[d - 1].kind === 'learn');
          return (
            <li key={g.key} className={`py-4 sm:pr-6 border-b sm:border-b-0 rule ${i > 0 ? 'sm:border-l sm:pl-6' : ''}`}>
              <p className="text-ember text-sm" aria-hidden>{MARKS[i]} <span className="eyebrow text-ember!">Gap {item?.gapRank} · {item?.strength === 'preferred' ? 'Preferred' : 'Required'}</span></p>
              <p className="font-serif text-xl mt-1">{g.name}</p>
              <p className="text-sm text-ink-3">{range(learn)}{plan.mode === 'project' ? ' + project' : ' + checkpoint'}</p>
              <button className="mt-1 text-sm link" onClick={() => onEvidence(g.key)}>See JD evidence (line {item?.jd.line})</button>
            </li>
          );
        })}
      </ul>

      {/* Compact two-week view */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="eyebrow">Two weeks at a glance</h3>
          <p className="text-sm text-ink-2" aria-live="polite">{doneCount} of {plan.days.length} days done</p>
        </div>
        <div className="mt-2 h-[3px] bg-paper-3 rounded-full overflow-hidden" aria-hidden>
          <div className="h-full bg-teal transition-[width] duration-300" style={{ width: `${(doneCount / plan.days.length) * 100}%` }} />
        </div>
        {[0, 1].map((w) => (
          <div key={w} className="mt-3 grid grid-cols-[3.2rem_repeat(7,minmax(0,1fr))] sm:grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] gap-1 items-stretch">
            <span className="text-xs text-ink-3 self-center">Week {w + 1}</span>
            {plan.days.slice(w * 7, w * 7 + 7).map((d) => (
              <button key={d.day} onClick={() => openDay(d.day)}
                aria-label={`Day ${d.day}: ${d.title}${done[d.day] ? ', done' : ''}`}
                className={`text-left rounded-md border px-1.5 sm:px-2 py-1.5 min-h-[3.4rem] transition-colors ${done[d.day] ? 'bg-teal-soft border-teal/40' : d.kind === 'learn' ? 'bg-white/50 rule hover:border-ink' : 'bg-paper-2 rule hover:border-ink'}`}>
                <span className="flex items-center justify-between text-[0.7rem] text-ink-3">
                  <span>{d.day}</span>
                  {done[d.day] ? <Icon name="check" className="w-3.5 h-3.5 text-teal" /> : <span className="text-ember" aria-hidden>{markFor(d)}</span>}
                </span>
                <span className="hidden lg:block text-[0.72rem] leading-snug mt-0.5 line-clamp-2 text-ink-2">{d.title}</span>
              </button>
            ))}
          </div>
        ))}
        <p className="mt-2 text-xs text-ink-3">{plan.gaps.map((g, i) => `${MARKS[i]} ${g.name}`).join('   ')}   ★ {plan.mode === 'project' ? 'Project' : 'Checkpoint'}</p>
      </div>

      {/* Daily view */}
      <div className="mt-8 flex items-baseline justify-between">
        <h3 className="eyebrow">Day by day</h3>
        <div className="text-sm flex gap-4">
          <button className="link" onClick={() => setOpen(Object.fromEntries(plan.days.map((d) => [d.day, true])))}>Expand all</button>
          <button className="link" onClick={() => setOpen({})}>Collapse all</button>
        </div>
      </div>
      <ol className="mt-2 border-t rule">
        {plan.days.map((d) => {
          const isOpen = !!open[d.day];
          const gapNames = d.gapKeys.map((k) => plan.gaps.find((g) => g.key === k)!);
          return (
            <li key={d.day} id={`day-${d.day}`} className="border-b rule scroll-mt-4">
              <div className="flex items-start gap-3 py-3">
                <input type="checkbox" id={`done-${d.day}`} checked={!!done[d.day]} onChange={() => toggle(d.day)}
                  className="mt-1.5 w-4 h-4 accent-[#1d6b66]" aria-label={`Mark day ${d.day} done: ${d.title}`} />
                <button data-toggle className="flex-1 text-left flex items-start gap-3 min-w-0" aria-expanded={isOpen} aria-controls={`day-body-${d.day}`} onClick={() => setOpen((o) => ({ ...o, [d.day]: !o[d.day] }))}>
                  <span className="font-mono text-xs text-ink-3 pt-1 w-12 shrink-0">Day {d.day}</span>
                  <span className="flex-1 min-w-0">
                    <span className={`block font-serif text-lg leading-snug ${done[d.day] ? 'line-through decoration-ink-3/50 text-ink-3' : ''}`}>{d.title}</span>
                    <span className="block text-xs text-ink-3 mt-0.5">
                      <span className="text-ember" aria-hidden>{markFor(d)}</span> {gapNames.map((g) => g.name).join(' + ')} · {d.minutes} min{d.kind !== 'learn' ? ` · ${d.kind === 'project' ? 'Project' : 'Checkpoint'}` : ''}
                    </span>
                  </span>
                  <Icon name={isOpen ? 'down' : 'chevron'} className="w-4 h-4 text-ink-3 mt-1.5" />
                </button>
              </div>
              {isOpen && (
                <div id={`day-body-${d.day}`} className="pb-5 pl-7 sm:pl-[5.75rem] pr-2 grid sm:grid-cols-3 gap-4 text-sm fade-in">
                  <div className="sm:col-span-3"><p className="eyebrow">Task</p><p className="mt-1 text-ink">{d.task}</p></div>
                  <div><p className="eyebrow">You’ll have</p><p className="mt-1 text-ink-2">{d.output}</p></div>
                  <div><p className="eyebrow">Self-check</p><p className="mt-1 text-ink-2">{d.selfCheck}</p></div>
                  <div>
                    <p className="eyebrow">Why this day</p>
                    <p className="mt-1 text-ink-2">
                      {d.dependsOn.length ? `Builds on Day ${d.dependsOn.join(', ')}. ` : 'No prerequisites. '}
                      {gapNames.map((g, i) => (
                        <span key={g.key}>{i > 0 && ' · '}<button className="link" onClick={() => onEvidence(g.key)}>{g.name}: see JD evidence</button></span>
                      ))}
                    </p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
