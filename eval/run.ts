// Reproducible evaluation of missing-skill detection.
//
//   npm run eval                       developer fixtures + judge cases in eval/judge (if any)
//   npm run eval -- --judge <dir>      judge cases from <dir>
//   npm run eval -- --fixtures-only
//   npm run eval -- --json out.json    also write a machine-readable report
//
// A case is a folder containing:  resume.pdf | resume.txt,  jd.txt,  expected.json {"missing": [...]}.
// The answer key (expected.json) is read only AFTER the prediction for that case is made, and nothing
// from it is passed to the analysis. If the judge folder has scoring.mjs exporting
// `score(predictedNames: string[], expectedNames: string[]) => number` (0–1), that rule is used instead
// of the default Jaccard agreement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyze } from '../src/engine/analyze.ts';
import { SKILL_BY_ID, SKILL_DICTIONARY_VERSION } from '../src/engine/skills.ts';
import type { ResumePage } from '../src/engine/resume.ts';
import { extractPdf } from '../src/server/extract.ts';
import { jaccard, resolveSkill } from './score.ts';

process.env.ROLEPROOF_OCR_TIMEOUT_MS ??= '10000';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

interface CaseResult {
  name: string; agreement: number; predicted: string[]; expected: string[];
  tp: string[]; fp: string[]; fn: string[]; unknownExpected: string[]; ms: number; error?: string;
}

async function readResume(dir: string): Promise<ResumePage[]> {
  const pdf = path.join(dir, 'resume.pdf');
  if (fs.existsSync(pdf)) return (await extractPdf(fs.readFileSync(pdf))).pages;
  const txt = path.join(dir, 'resume.txt');
  if (fs.existsSync(txt)) return [{ page: 1, text: fs.readFileSync(txt, 'utf8'), source: 'text', confidence: 100 }];
  throw new Error('missing resume.pdf or resume.txt');
}

async function runSuite(root: string, label: string) {
  const dirs = fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'jd.txt'))).map((d) => d.name).sort()
    : [];
  if (!dirs.length) return null;
  const scoringFile = path.join(root, 'scoring.mjs');
  const custom = fs.existsSync(scoringFile) ? (await import(pathToFileURL(scoringFile).href)).score as (p: string[], e: string[]) => number : null;
  const results: CaseResult[] = [];
  for (const name of dirs) {
    const dir = path.join(root, name);
    const t0 = Date.now();
    try {
      // 1. Predict (no access to the answer key).
      const jd = fs.readFileSync(path.join(dir, 'jd.txt'), 'utf8');
      const pages = await readResume(dir);
      const predicted = analyze(jd, pages).missingSkillIds;
      // 2. Only now read the answer key.
      const key = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
      const resolved = (key.missing as string[]).map((n) => ({ n, ...resolveSkill(n) }));
      const expected = resolved.map((r) => r.id);
      const s = jaccard(predicted, expected);
      const agreement = custom ? custom(predicted.map((id) => SKILL_BY_ID[id]?.name ?? id), key.missing) : s.agreement;
      results.push({ name, agreement, predicted, expected, tp: s.tp, fp: s.fp, fn: s.fn, unknownExpected: resolved.filter((r) => !r.known).map((r) => r.n), ms: Date.now() - t0 });
    } catch (e) {
      results.push({ name, agreement: 0, predicted: [], expected: [], tp: [], fp: [], fn: [], unknownExpected: [], ms: Date.now() - t0, error: (e as Error).message });
    }
  }
  const tp = results.reduce((a, r) => a + r.tp.length, 0);
  const fp = results.reduce((a, r) => a + r.fp.length, 0);
  const fn = results.reduce((a, r) => a + r.fn.length, 0);
  const mean = results.reduce((a, r) => a + r.agreement, 0) / results.length;
  return {
    label, root, rule: custom ? 'judge-supplied scoring.mjs' : 'mean per-case Jaccard on canonical missing-skill sets (two empty sets = 1)',
    cases: results.length, agreement: mean, precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 1,
    falsePositives: fp, falseNegatives: fn, results,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const nm = (ids: string[]) => ids.map((i) => SKILL_BY_ID[i]?.name ?? i).join(', ') || '—';

function print(s: NonNullable<Awaited<ReturnType<typeof runSuite>>>) {
  console.log(`\n${s.label}  (${s.cases} cases, ${path.relative(process.cwd(), s.root) || '.'})`);
  console.log('-'.repeat(78));
  for (const r of s.results) {
    const flag = r.error ? 'ERROR' : r.agreement === 1 ? 'ok   ' : 'DIFF ';
    console.log(`${flag} ${r.name.padEnd(28)} agreement ${pct(r.agreement).padStart(6)}  ${r.ms}ms`);
    if (r.error) console.log(`      error: ${r.error}`);
    if (r.fp.length) console.log(`      false positives (we said missing, key did not): ${nm(r.fp)}`);
    if (r.fn.length) console.log(`      false negatives (key said missing, we did not): ${nm(r.fn)}`);
    if (r.unknownExpected.length) console.log(`      answer-key names not in the skill dictionary: ${r.unknownExpected.join(', ')}`);
  }
  console.log('-'.repeat(78));
  console.log(`Scoring rule: ${s.rule}`);
  console.log(`Agreement ${pct(s.agreement)} · precision ${pct(s.precision)} · recall ${pct(s.recall)} · false positives ${s.falsePositives} · false negatives ${s.falseNegatives}`);
}

console.log(`RoleProof evaluation · skill dictionary v${SKILL_DICTIONARY_VERSION}`);
const fixtures = args.includes('--judge-only') ? null : await runSuite(path.join(here, 'cases'), 'DEVELOPER FIXTURES (measured fixture score, not a judge score)');
if (fixtures) print(fixtures);

const judgeDir = opt('--judge') ? path.resolve(opt('--judge')!) : path.join(here, 'judge');
const judge = args.includes('--fixtures-only') ? null : await runSuite(judgeDir, 'JUDGE EVALUATION');
if (judge) {
  print(judge);
  console.log(`Judge target: at least 70% agreement → ${judge.agreement >= 0.7 ? 'met' : 'NOT met'} on these ${judge.cases} cases.`);
} else {
  console.log('\nJUDGE EVALUATION\nJudge score not evaluated (no judge cases found' + (opt('--judge') ? ` in ${judgeDir}` : ' in eval/judge') + ').');
}

const out = opt('--json');
if (out) fs.writeFileSync(out, JSON.stringify({ dictionaryVersion: SKILL_DICTIONARY_VERSION, fixtures, judge }, null, 2));
