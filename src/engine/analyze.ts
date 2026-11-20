import { parseJD, STRENGTH_RANK, type Mention, type ParsedJD, type Requirement, type Strength } from './jd.ts';
import { resumeEvidence, usageLabel, type ResumeEvidence, type ResumePage } from './resume.ts';
import { SKILL_BY_ID, SKILL_DICTIONARY_VERSION } from './skills.ts';

export type Status = 'matched' | 'missing' | 'review';

export interface JDQuote {
  line: number;
  anchorId: string;
  /** Exact substring of the original JD (quoteStart..quoteEnd). */
  quote: string;
  quoteStart: number;
  quoteEnd: number;
  /** Highlight offsets relative to `quote`. */
  hlStart: number;
  hlEnd: number;
  wording: string;
}

export interface ResultItem {
  key: string;
  skillIds: string[];
  /** "React.js or Vue" — written as the JD wrote it. */
  label: string;
  canonical: string;
  status: Status;
  strength: Strength;
  strengthReason: string;
  jd: JDQuote;
  otherMentions: number;
  resume?: ResumeEvidence & { usage: string | null };
  /** Plain-language explanation of an alias or alternative match. */
  explanation?: string;
  reviewReason?: string;
  /** Set for ranked gaps. */
  gapRank?: number;
  gapReason?: string;
}

export interface Analysis {
  dictionaryVersion: string;
  items: ResultItem[];
  notRequired: { skillId: string; name: string; jd: JDQuote }[];
  counts: {
    counted: number; matched: number;
    required: number; requiredMatched: number;
    preferred: number; preferredMatched: number;
    review: number; notRequired: number;
  };
  summary: string;
  denominator: string;
  topGaps: ResultItem[];
  /** Canonical skill ids of missing requirements (alternatives → first one named). Used for evaluation. */
  missingSkillIds: string[];
  extraction: { blocked: boolean; message?: string; unreadablePages: number[] };
}

const MIN_RESUME_WORDS = 5;
const LOW_RESUME_WORDS = 40;
const differs = (a: string, b: string) => a.trim().toLowerCase() !== b.trim().toLowerCase();

function quoteOf(jd: ParsedJD, m: Mention, alt?: Mention[]): JDQuote {
  const quote = jd.text.slice(m.quoteStart, m.quoteEnd);
  const ms = alt && alt.length ? alt : [m];
  const hlStart = Math.min(...ms.map((x) => x.hitStart)) - m.quoteStart;
  const hlEnd = Math.max(...ms.map((x) => x.hitEnd)) - m.quoteStart;
  return { line: m.line, anchorId: m.anchorId, quote, quoteStart: m.quoteStart, quoteEnd: m.quoteEnd, hlStart, hlEnd, wording: jd.text.slice(m.quoteStart + hlStart, m.quoteStart + hlEnd) };
}

function primaryMentions(r: Requirement): Mention[] {
  // The quote shown is the first mention with the requirement's final (strongest) strength.
  const first = r.mentions.find((m) => m.strength === r.strength) ?? r.mentions[0];
  return r.mentions.filter((m) => m.anchorId === first.anchorId && m.quoteStart === first.quoteStart);
}

const name = (id: string) => SKILL_BY_ID[id]?.name ?? id;

function labelFor(r: Requirement, ms: Mention[]): string {
  if (r.skillIds.length === 1) return ms[0].hitText.trim();
  const words = r.skillIds.map((id) => ms.find((m) => m.skillId === id)?.hitText ?? name(id));
  return words.length === 2 ? `${words[0]} or ${words[1]}` : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

function strengthReason(r: Requirement, ms: Mention[]): string {
  const cue = ms[0].cue;
  if (r.strength === 'required') return `Required: ${cue} (line ${ms[0].line}).`;
  if (r.strength === 'preferred') return `Preferred: ${cue} (line ${ms[0].line}).`;
  return `Counted as required: ${cue} (line ${ms[0].line}).`;
}

export function analyze(jdText: string, pages: ResumePage[]): Analysis {
  const jd = parseJD(jdText);
  const evidence = resumeEvidence(pages);
  const readable = pages.filter((p) => p.source !== 'unreadable');
  const words = readable.map((p) => p.text).join(' ').split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length;
  const unreadablePages = pages.filter((p) => p.source === 'unreadable').map((p) => p.page);
  const blocked = words < MIN_RESUME_WORDS;
  const extraction = {
    blocked,
    unreadablePages,
    message: blocked
      ? `We could only read ${words} words from your resume, so we won’t guess at gaps. Review the extracted text, paste or correct it, then run the analysis again.`
      : unreadablePages.length
        ? `Page ${unreadablePages.join(', ')} could not be read. Skills we didn’t find are marked “Needs review” until you correct that page.`
        : words < LOW_RESUME_WORDS
          ? `We read only ${words} words from your resume. If that looks short, review the extracted text.`
          : undefined,
  };

  const items: ResultItem[] = jd.requirements.map((r) => {
    const ms = primaryMentions(r);
    const groupMs = ms.filter((m) => r.skillIds.includes(m.skillId));
    const jdq = quoteOf(jd, ms[0], groupMs);
    const label = labelFor(r, groupMs);
    const found = r.skillIds.map((id) => evidence.get(id)?.[0]).find(Boolean);
    const item: ResultItem = {
      key: r.key, skillIds: r.skillIds, label, canonical: r.skillIds.map(name).join(' or '),
      status: 'missing', strength: r.strength, strengthReason: strengthReason(r, ms), jd: jdq,
      otherMentions: new Set(r.mentions.map((m) => m.anchorId)).size - 1,
    };
    if (found) {
      item.status = 'matched';
      item.resume = { ...found, usage: usageLabel(found) };
      const jdWord = groupMs.find((m) => m.skillId === found.skillId)?.hitText;
      if (r.skillIds.length > 1 && !jdWord) {
        item.explanation = `The JD accepts ${label}. Your resume shows ${found.hitText}, which satisfies this requirement.`;
      } else if (r.skillIds.length > 1) {
        item.explanation = `The JD accepts ${label}. Your resume shows ${found.hitText}.`;
        if (differs(found.hitText, jdWord!)) item.explanation = `The JD accepts ${label}. Your resume says “${found.hitText}”. This matches “${jdWord}” in the JD: both are names for ${name(found.skillId)}.`;
      } else if (jdWord && differs(found.hitText, jdWord)) {
        item.explanation = `Your resume says “${found.hitText}”. This matches “${jdWord}” in the JD: both are names for ${name(found.skillId)}.`;
      }
    } else if (blocked) {
      item.status = 'review';
      item.reviewReason = 'Resume text could not be read, so this is not judged yet.';
    } else if (r.review) {
      item.status = 'review';
      item.reviewReason = r.review;
    } else if (unreadablePages.length) {
      item.status = 'review';
      item.reviewReason = `No evidence found in the readable pages. Page ${unreadablePages.join(', ')} could not be read and may mention it.`;
    }
    return item;
  });

  // Rank gaps: explicit required → required by context → preferred; JD order breaks ties.
  const gaps = items
    .filter((i) => i.status === 'missing')
    .sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength] || a.jd.quoteStart - b.jd.quoteStart);
  const requiredGaps = gaps.filter((g) => g.strength !== 'preferred').length;
  gaps.forEach((g, i) => {
    g.gapRank = i + 1;
    const order = g.strength === 'preferred'
      ? requiredGaps ? (requiredGaps === 1 ? 'ranked after the 1 required gap' : `ranked after all ${requiredGaps} required gaps`) : 'there are no required gaps'
      : g.strength === 'required' ? 'explicit requirements come first' : 'ranked after explicitly required skills';
    const pos = i === 0 ? 'It is the first gap in JD order' : `JD order then puts it at position ${i + 1}`;
    g.gapReason = `${g.strengthReason} ${order[0].toUpperCase() + order.slice(1)}. ${pos}.${g.otherMentions ? ` Mentioned ${g.otherMentions + 1} times.` : ''}`;
  });

  const counted = items.filter((i) => i.status !== 'review');
  const req = counted.filter((i) => i.strength !== 'preferred');
  const pref = counted.filter((i) => i.strength === 'preferred');
  const counts = {
    counted: counted.length,
    matched: counted.filter((i) => i.status === 'matched').length,
    required: req.length,
    requiredMatched: req.filter((i) => i.status === 'matched').length,
    preferred: pref.length,
    preferredMatched: pref.filter((i) => i.status === 'matched').length,
    review: items.length - counted.length,
    notRequired: jd.notRequired.length,
  };

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let summary: string;
  if (blocked) summary = 'We need readable resume text before we can compare it with this job description.';
  else if (!items.length) summary = 'We did not find any skills from our dictionary in this job description.';
  else if (!counts.counted) summary = 'Every requirement we found needs your review before we can count it.';
  else summary = `Your resume shows evidence for ${counts.matched} of ${plural(counts.counted, 'requirement')}.`;

  const parts = [`${counts.required} required and ${counts.preferred} preferred`];
  const denomBits: string[] = [];
  if (items.some((i) => i.skillIds.length > 1)) denomBits.push('alternatives such as “' + items.find((i) => i.skillIds.length > 1)!.label + '” count once');
  denomBits.push('repeated mentions count once');
  if (counts.review) denomBits.push(`${plural(counts.review, 'item')} needing your review ${counts.review === 1 ? 'is' : 'are'} not counted`);
  if (counts.notRequired) denomBits.push(`${plural(counts.notRequired, 'skill')} the JD says ${counts.notRequired === 1 ? 'is' : 'are'} not needed ${counts.notRequired === 1 ? 'is' : 'are'} left out`);
  const denominator = `We count ${plural(counts.counted, 'requirement')} named in the JD: ${parts[0]}. ${denomBits.map((b, i) => (i === 0 ? b[0].toUpperCase() + b.slice(1) : b)).join('; ')}.`;

  return {
    dictionaryVersion: SKILL_DICTIONARY_VERSION,
    items,
    notRequired: jd.notRequired.map((m) => ({ skillId: m.skillId, name: name(m.skillId), jd: quoteOf(jd, m) })),
    counts,
    summary,
    denominator,
    topGaps: gaps.slice(0, 3),
    missingSkillIds: gaps.map((g) => g.skillIds[0]),
    extraction,
  };
}

export { parseJD };
