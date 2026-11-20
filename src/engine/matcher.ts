import { SKILLS, type SkillDef } from './skills.ts';

export interface SkillHit {
  skillId: string;
  start: number;
  end: number;
  /** The exact text that matched, as written in the source. */
  text: string;
  /** True when the hit came from an alias flagged ambiguous (e.g. "Go", "C", "R"). */
  ambiguous: boolean;
}

interface CompiledAlias {
  skill: SkillDef;
  re: RegExp;
  short: boolean;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Normalised comparison key: case, spacing and punctuation folded; + and # kept (C vs C++ vs C#). */
export function skillKey(s: string): string {
  return s.toLowerCase().replace(/[\s.\-_]+/g, '');
}

function aliasPattern(alias: string): string {
  let lead = '';
  let body = alias;
  if (body.startsWith('.')) {
    lead = '\\.';
    body = body.slice(1);
  }
  const parts = body.split(/[\s.\-_]+/).filter(Boolean).map(escape);
  return lead + parts.join('[\\s.\\-_]?');
}

function compile(alias: string, skill: SkillDef, caseSensitive: boolean): CompiledAlias {
  const short = alias.replace(/[^A-Za-z0-9+#]/g, '').length <= 2;
  // Short names (C, R, Go, JS) need stricter edges: "C-suite", "R&D", "Objective-C" are not skills.
  const before = short ? '(?<![A-Za-z0-9+#\\-.&])' : '(?<![A-Za-z0-9+#])';
  const after = short ? '(?![A-Za-z0-9+#&]|-[A-Za-z]|\\.[A-Za-z0-9])' : '(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])';
  const flags = caseSensitive ? 'g' : 'gi';
  return { skill, re: new RegExp(before + aliasPattern(alias) + after, flags), short };
}

const COMPILED: CompiledAlias[] = SKILLS.flatMap((skill) => [
  ...skill.aliases.map((a) => compile(a, skill, false)),
  ...(skill.cs ?? []).map((a) => compile(a, skill, true)),
]);

/**
 * Finds every dictionary skill in `text`. Overlapping hits are resolved in favour of the longest
 * span, so "GitHub Actions" wins over "GitHub" and "React Native" wins over "React".
 */
export function findSkills(text: string): SkillHit[] {
  const raw: SkillHit[] = [];
  for (const c of COMPILED) {
    c.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = c.re.exec(text))) {
      raw.push({
        skillId: c.skill.id,
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        ambiguous: !!c.skill.ambiguous,
      });
      if (m[0].length === 0) c.re.lastIndex++;
    }
  }
  raw.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const kept: SkillHit[] = [];
  for (const h of raw) {
    if (kept.some((k) => h.start < k.end && k.start < h.end)) continue;
    kept.push(h);
  }
  return kept.sort((a, b) => a.start - b.start);
}
