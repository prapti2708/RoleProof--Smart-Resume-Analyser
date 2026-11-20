import { findSkills, skillKey } from '../src/engine/matcher.ts';
import { SKILLS } from '../src/engine/skills.ts';

/** Maps a judge-written skill name ("ReactJS", "k8s", "GitHub Actions") to a canonical skill id. */
export function resolveSkill(name: string): { id: string; known: boolean } {
  const k = skillKey(name);
  for (const s of SKILLS) {
    if (skillKey(s.id) === k || skillKey(s.name) === k || s.aliases.some((a) => skillKey(a) === k) || (s.cs ?? []).some((a) => a === name.trim())) {
      return { id: s.id, known: true };
    }
  }
  const hits = findSkills(name);
  if (hits.length === 1 && hits[0].end - hits[0].start >= name.trim().length - 2) return { id: hits[0].skillId, known: true };
  return { id: `unknown:${k}`, known: false };
}

export interface CaseScore {
  agreement: number;
  tp: string[];
  fp: string[];
  fn: string[];
}

/**
 * Default scoring rule (used when the judges supply none): per-case Jaccard agreement on canonical
 * missing-skill sets, |predicted ∩ expected| / |predicted ∪ expected|, with two empty sets scoring 1.
 */
export function jaccard(predicted: string[], expected: string[]): CaseScore {
  const p = new Set(predicted);
  const e = new Set(expected);
  const tp = [...p].filter((x) => e.has(x));
  const fp = [...p].filter((x) => !e.has(x));
  const fn = [...e].filter((x) => !p.has(x));
  const union = new Set([...p, ...e]).size;
  return { agreement: union === 0 ? 1 : tp.length / union, tp, fp, fn };
}
