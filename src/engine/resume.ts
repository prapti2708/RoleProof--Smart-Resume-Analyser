import { findSkills } from './matcher.ts';

export type PageSource = 'text' | 'ocr' | 'mixed' | 'edited' | 'unreadable';

export interface ResumePage {
  page: number;
  text: string;
  source: PageSource;
  /** 0–100. OCR mean word confidence, or 100 for a clean text layer. */
  confidence: number;
}

export interface ResumeEvidence {
  skillId: string;
  page: number;
  /** Line of resume text containing the hit (exact substring of the page text). */
  quote: string;
  hitText: string;
  /** Offsets of hitText inside quote. */
  hitStart: number;
  hitEnd: number;
  /** Nearest resume heading above the hit, e.g. "Projects" or "Skills". */
  section: string | null;
}

const HEADING = /^(technical\s+)?(skills?|projects?|experience|work experience|internships?|education|certifications?|achievements|summary|profile|objective|tools|technologies|tech stack|languages|coursework|activities|positions? of responsibility|extracurriculars?|publications)\b/i;

function headingOf(line: string): string | null {
  const t = line.trim().replace(/[:•|\-–]+$/, '').trim();
  if (!t || t.length > 40) return null;
  const m = t.match(HEADING);
  if (m) return t.replace(/\s+/g, ' ');
  return null;
}

export function resumeEvidence(pages: ResumePage[]): Map<string, ResumeEvidence[]> {
  const out = new Map<string, ResumeEvidence[]>();
  for (const p of pages) {
    if (p.source === 'unreadable') continue;
    // Line starts and the heading in force at each line.
    const starts: number[] = [];
    const sections: (string | null)[] = [];
    let pos = 0;
    let section: string | null = null;
    for (const line of p.text.split('\n')) {
      const h = headingOf(line);
      if (h) section = h;
      starts.push(pos);
      sections.push(section);
      pos += line.length + 1;
    }
    const lineAt = (off: number) => {
      let i = starts.length - 1;
      while (i > 0 && starts[i] > off) i--;
      return i;
    };
    // Search the whole page so a name wrapped across lines ("GitHub\nActions") still matches.
    for (const hit of findSkills(p.text)) {
      let a = lineAt(hit.start);
      let b = lineAt(hit.end - 1);
      // Widen to the surrounding wrapped sentence (at most one line each way) so the excerpt reads naturally.
      const lines = p.text.split('\n');
      const open = (i: number) => !/[.!?:;|]\s*$/.test(lines[i]) && !headingOf(lines[i]);
      if (a > 0 && open(a - 1) && (/^[a-z(]/.test(lines[a].trim()) || /\b[a-z]+,?\s*$/.test(lines[a - 1]))) a--;
      if (b + 1 < lines.length && open(b) && /^[a-z(]/.test(lines[b + 1].trim())) b++;
      const qs = starts[a];
      const qe = b + 1 < starts.length ? starts[b + 1] - 1 : p.text.length;
      const quote = p.text.slice(qs, qe);
      const list = out.get(hit.skillId) ?? [];
      list.push({ skillId: hit.skillId, page: p.page, quote, hitText: hit.text, hitStart: hit.start - qs, hitEnd: hit.end - qs, section: sections[a] });
      out.set(hit.skillId, list);
    }
  }
  // Prefer evidence from projects / experience over a bare skills list: it shows use, not just a claim.
  for (const list of out.values()) {
    list.sort((a, b) => score(b) - score(a) || a.page - b.page);
  }
  return out;
}

function score(e: ResumeEvidence): number {
  if (!e.section) return 1;
  return /project|experience|intern|work|position/i.test(e.section) ? 2 : /skill|tool|tech|language/i.test(e.section) ? 0 : 1;
}

export function usageLabel(e: ResumeEvidence): string | null {
  if (!e.section) return null;
  if (/project|experience|intern|work|position/i.test(e.section)) return `Used in ${e.section}`;
  if (/skill|tool|tech|language/i.test(e.section)) return `Listed in ${e.section}`;
  return `In ${e.section}`;
}
