import { findSkills, type SkillHit } from './matcher.ts';
import { SKILL_BY_ID } from './skills.ts';

export type Strength = 'required' | 'implicit' | 'preferred';

export interface JDLine { n: number; text: string; start: number; end: number }

/** A sentence-level anchor inside one JD line. Offsets index into the original JD string. */
export interface Anchor { id: string; line: number; sentence: number; start: number; end: number }

export interface Mention {
  skillId: string;
  anchorId: string;
  line: number;
  /** Offsets of the full sentence quote in the original JD. */
  quoteStart: number;
  quoteEnd: number;
  /** Offsets of the matched words (e.g. "React.js") in the original JD. */
  hitStart: number;
  hitEnd: number;
  hitText: string;
  strength: Strength | 'negated';
  /** Why the strength was chosen, in plain words. */
  cue: string;
}

export interface Requirement {
  key: string;
  /** Alternatives in JD order. One entry for a normal requirement; several for "React or Vue". */
  skillIds: string[];
  strength: Strength;
  mentions: Mention[];
  firstOffset: number;
  review?: string;
}

export interface ParsedJD {
  text: string;
  lines: JDLine[];
  anchors: Anchor[];
  requirements: Requirement[];
  /** Skills the JD explicitly says are not needed. */
  notRequired: Mention[];
}

type Section = 'required' | 'preferred' | 'responsibilities' | 'ignore' | 'none';

const HEADER_RULES: [RegExp, Section][] = [
  [/\b(nice|good)[\s-]+to[\s-]+have|preferred|bonus|desirable|plus points?|added advantage/i, 'preferred'],
  [/\b(about (us|the company|the team)|who we are|benefits|perks|what we offer|why join|compensation|salary|equal opportunity|how to apply|location)\b/i, 'ignore'],
  [/\b(requirements?|required|must[\s-]have|qualifications?|what you('ll)? need|who you are|skills|eligibility|tech(nical)? stack|you have|what we('re| are) looking for)\b/i, 'required'],
  [/\b(responsibilities|what you('ll| will) do|the role|about the role|job description|your day|duties|key tasks)\b/i, 'responsibilities'],
];

function classifyHeader(label: string): Section | null {
  for (const [re, s] of HEADER_RULES) if (re.test(label)) return s;
  return null;
}

const NEG = [
  /\b(no|not|without|don'?t|do not|doesn'?t|does not|never)\b[^.;]{0,60}?\b(required|needed|necessary|mandatory|expected|a requirement|a must|need)\b/i,
  /\bno (prior |previous |professional )?([\w.#+/-]+ ){0,4}(experience|knowledge|background)\b/i,
  /\b(not required|not needed|not necessary|not mandatory|no need|isn'?t required|aren'?t required)\b/i,
  /\bwe('ll| will) (teach|train)\b/i,
];
const PREF = /\b(preferred|preferably|nice[\s-]to[\s-]have|good[\s-]to[\s-]have|(is|are|a|big|huge) plus|plus point|bonus|desirable|advantageous|added advantage|an advantage|ideally|would be great|optional)\b/i;
const REQ = /\b(required|requires?|must|mandatory|essential|need to|needs to|you need|you will need|you'll need|should (have|know|be)|proficien\w*|expertise|strong|solid|hands[\s-]on|minimum|at least|experience (with|in|using)|knowledge of|familiar\w*|working knowledge|understanding of|expert in|skilled in|ability to)\b/i;

function cueFor(clause: string, section: Section, lineMarker: Section | null): { strength: Strength | 'negated' | 'ignored'; cue: string } {
  const m = (re: RegExp) => clause.match(re)?.[0];
  for (const re of NEG) {
    const hit = m(re);
    if (hit) return { strength: 'negated', cue: `the JD says “${hit.trim()}”` };
  }
  const pref = m(PREF);
  if (pref) return { strength: 'preferred', cue: `marked “${pref}”` };
  if (lineMarker === 'preferred') return { strength: 'preferred', cue: 'listed after a “preferred / nice to have” label' };
  const req = m(REQ);
  if (req) return { strength: 'required', cue: `stated with “${req}”` };
  if (lineMarker === 'required') return { strength: 'required', cue: 'listed after a “required / must have” label' };
  if (section === 'preferred') return { strength: 'preferred', cue: 'listed under a preferred / nice-to-have heading' };
  if (section === 'required') return { strength: 'required', cue: 'listed under a requirements heading' };
  if (section === 'ignore') return { strength: 'ignored', cue: 'company description, not a requirement' };
  if (section === 'responsibilities') return { strength: 'implicit', cue: 'named in the responsibilities, without “preferred” wording' };
  return { strength: 'implicit', cue: 'named in the JD without “required” or “preferred” wording' };
}

const ABBREV = /\b(e\.g|i\.e|etc|vs|incl|approx|min|max)\.$/i;

function splitSentences(line: JDLine): Anchor[] {
  const out: Anchor[] = [];
  const t = line.text;
  let s = 0;
  const re = /([.!?;])\s+(?=[A-Z0-9"“(•\-–*])|\s+[•|]\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const cut = m.index + (m[1] ? 1 : 0);
    if (m[1] === '.' && ABBREV.test(t.slice(0, cut))) continue;
    pushTrimmed(out, line, s, cut);
    s = m.index + m[0].length;
  }
  pushTrimmed(out, line, s, t.length);
  return out;
}

function pushTrimmed(out: Anchor[], line: JDLine, a: number, b: number) {
  const seg = line.text.slice(a, b);
  const lead = seg.length - seg.trimStart().length;
  const trail = seg.length - seg.trimEnd().length;
  if (seg.trim().replace(/^[•\-–*]\s*/, '').length === 0) return;
  const n = out.length + 1;
  out.push({ id: `L${line.n}.S${n}`, line: line.n, sentence: n, start: line.start + a + lead, end: line.start + b - trail });
}

/** Clause boundaries for scoping cues: "Docker is required, but no AWS experience is needed". */
function clauses(text: string, start: number, end: number): [number, number][] {
  const seg = text.slice(start, end);
  const out: [number, number][] = [];
  const re = /;|,\s*(?=(but|however|though|although|while|whereas)\b)|\s+(?=but\b)/gi;
  let s = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    if (m.index > s) out.push([start + s, start + m.index]);
    s = m.index + Math.max(1, m[0].length);
  }
  if (s < seg.length) out.push([start + s, end]);
  return out;
}

// Pairs used together rather than instead of each other ("React/Redux", "Node.js/Express").
const COMPANIONS = new Set([
  'redux>react', 'react>redux', 'express>nodejs', 'nodejs>express', 'nextjs>react', 'react>nextjs',
  'spring-boot>java', 'java>spring-boot', 'django>python', 'python>django', 'flask>python', 'python>flask',
  'html>css', 'css>html', 'docker>kubernetes', 'kubernetes>docker', 'pandas>numpy', 'numpy>pandas',
  'git>github', 'github>git',
]);

const OR_WORDS = /^\s*,?\s*(or|and\/or|or even)\s+$/i;
const COMMA = /^\s*,\s*$/;
const SLASH = /^\s*\/\s*$/;
const AND_WORDS = /^\s*,?\s*(and|&|as well as|plus)\s+$/i;
const ANY_OF = /\b(any of|one of|one or more of|at least one of|either|such as)\b/i;
const OR_SIMILAR = /^\s*(,?\s*or\s+((a|an|any|some)\s+)?(similar|equivalent|comparable|related|other|another)\b)/i;

interface Group { hits: SkillHit[]; orSimilar: boolean; review?: string }

function groupHits(text: string, clauseStart: number, hits: SkillHit[]): Group[] {
  const groups: Group[] = [];
  const anyOf = ANY_OF.test(text.slice(clauseStart, hits[0]?.start ?? clauseStart));
  let cur: SkillHit[] = [];
  let kinds: ('or' | 'comma' | 'slash')[] = [];
  const flush = () => {
    if (!cur.length) return;
    const isAlt = kinds.includes('or') || (anyOf && kinds.length > 0);
    if (isAlt) groups.push({ hits: cur, orSimilar: false });
    else if (kinds.length && kinds.every((k) => k === 'slash')) {
      // "Java/Python" (same kind of thing) means either; "React/Redux" (different kinds) means both.
      const cats = new Set(cur.map((h) => SKILL_BY_ID[h.skillId].category));
      const ids = cur.map((h) => h.skillId);
      const companions = ids.some((a) => ids.some((b) => COMPANIONS.has(`${a}>${b}`)));
      if (cats.size === 1 && !companions) groups.push({ hits: cur, orSimilar: false });
      else cur.forEach((h) => groups.push({ hits: [h], orSimilar: false }));
    } else cur.forEach((h) => groups.push({ hits: [h], orSimilar: false }));
    cur = [];
    kinds = [];
  };
  hits.forEach((h, i) => {
    if (i === 0) { cur = [h]; return; }
    const between = text.slice(hits[i - 1].end, h.start);
    if (OR_WORDS.test(between)) { cur.push(h); kinds.push('or'); }
    else if (COMMA.test(between)) { cur.push(h); kinds.push('comma'); }
    else if (SLASH.test(between)) { cur.push(h); kinds.push('slash'); }
    else if (AND_WORDS.test(between)) { flush(); cur = [h]; }
    else { flush(); cur = [h]; }
  });
  flush();
  // A comma list that ends in "or" ("React, Angular, or Vue") is one set of alternatives: handled above.
  for (const g of groups) {
    const last = g.hits[g.hits.length - 1];
    if (OR_SIMILAR.test(text.slice(last.end))) {
      g.orSimilar = true;
      g.review = `The JD accepts “${last.text}” or a similar tool. Check whether something on your resume counts.`;
    }
  }
  return groups;
}

function inList(text: string, hits: SkillHit[], i: number): boolean {
  const near = (a: SkillHit, b: SkillHit) => /^\s*(,|\/|or|and|&)\s*$/i.test(text.slice(a.end, b.start)) || /^\s*,\s*(or|and)\s+$/i.test(text.slice(a.end, b.start));
  return (i > 0 && near(hits[i - 1], hits[i])) || (i < hits.length - 1 && near(hits[i], hits[i + 1]));
}

const RANK: Record<Strength, number> = { required: 0, implicit: 1, preferred: 2 };

export function parseJD(text: string): ParsedJD {
  const lines: JDLine[] = [];
  let pos = 0;
  text.split('\n').forEach((raw, i) => {
    const t = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    lines.push({ n: i + 1, text: t, start: pos, end: pos + t.length });
    pos += raw.length + 1;
  });

  const anchors: Anchor[] = [];
  const units = new Map<string, Requirement>();
  const negated: Mention[] = [];
  const positiveSkills = new Set<string>();
  let section: Section = 'none';

  for (const line of lines) {
    if (!line.text.trim()) continue;
    // "Requirements:" on its own sets a section; "Must have: React, Docker" marks just this line.
    let lineMarker: Section | null = null;
    const label = line.text.match(/^\s*[•\-–*]?\s*([A-Za-z][A-Za-z'’ /&-]{1,45}?)\s*[:：]\s*(.*)$/);
    const plainHeader = line.text.trim().length <= 50 && !/[.]$/.test(line.text.trim()) && findSkills(line.text).length === 0;
    if (label) {
      const s = classifyHeader(label[1]);
      if (s && !label[2].trim()) { section = s; continue; }
      if (s === 'required' || s === 'preferred') lineMarker = s;
      else if (s) section = s;
    } else if (plainHeader) {
      const s = classifyHeader(line.text);
      if (s) { section = s; continue; }
    }

    for (const a of splitSentences(line)) {
      anchors.push(a);
      for (const [cs, ce] of clauses(text, a.start, a.end)) {
        const clauseText = text.slice(cs, ce);
        const hits = findSkills(clauseText).map((h) => ({ ...h, start: h.start + cs, end: h.end + cs }));
        if (!hits.length) continue;
        const { strength, cue } = cueFor(clauseText, section, lineMarker);
        if (strength === 'ignored') continue;
        const mention = (h: SkillHit): Mention => ({
          skillId: h.skillId, anchorId: a.id, line: a.line, quoteStart: a.start, quoteEnd: a.end,
          hitStart: h.start, hitEnd: h.end, hitText: h.text, strength, cue,
        });
        if (strength === 'negated') { hits.forEach((h) => negated.push(mention(h))); continue; }
        for (const g of groupHits(text, cs, hits)) {
          const ids = [...new Set(g.hits.map((h) => h.skillId))];
          const key = [...ids].sort().join('|');
          const ms = g.hits.map(mention);
          let review = g.review;
          if (!review && g.hits.length === 1 && g.hits[0].ambiguous && !inList(text, hits, hits.indexOf(g.hits[0]))) {
            review = `“${g.hits[0].text}” is a short name that can also be an ordinary word. Confirm the JD means the skill.`;
          }
          ids.forEach((id) => positiveSkills.add(id));
          const existing = units.get(key);
          if (!existing) {
            units.set(key, { key, skillIds: ids, strength, mentions: ms, firstOffset: g.hits[0].start, review });
          } else {
            existing.mentions.push(...ms);
            if (RANK[strength] < RANK[existing.strength]) existing.strength = strength;
            if (!review) existing.review = undefined; // a clear mention resolves an earlier doubtful one
          }
        }
      }
    }
  }

  // A skill named on its own already counts; drop single-skill duplicates that were also alternatives? No:
  // they are different requirements ("React or Vue" vs a later "React is a must"). Keep both.
  const requirements = [...units.values()].sort((a, b) => a.firstOffset - b.firstOffset);
  const seen = new Set<string>();
  const notRequired = negated.filter((m) => {
    if (positiveSkills.has(m.skillId) || seen.has(m.skillId)) return false;
    seen.add(m.skillId);
    return true;
  });
  return { text, lines, anchors, requirements, notRequired };
}

export const STRENGTH_RANK = RANK;
