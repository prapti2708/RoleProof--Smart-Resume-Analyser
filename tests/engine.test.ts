import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSkills } from '../src/engine/matcher.ts';
import { parseJD } from '../src/engine/jd.ts';
import { analyze } from '../src/engine/analyze.ts';
import { buildPlan } from '../src/engine/plan.ts';
import type { ResumePage } from '../src/engine/resume.ts';
import { jaccard, resolveSkill } from '../eval/score.ts';

const ids = (t: string) => findSkills(t).map((h) => h.skillId);
const page = (text: string): ResumePage[] => [{ page: 1, text, source: 'text', confidence: 100 }];

const ACCEPTANCE_JD = [
  'Experience with React.js or Vue is required.',
  'Docker is required for packaging services.',
  'GitHub Actions experience is preferred.',
  'No prior AWS experience is needed.',
].join('\n');
const ACCEPTANCE_RESUME = 'Built a placement portal using ReactJS.';

test('aliases normalise case, spacing and punctuation', () => {
  for (const t of ['ReactJS', 'React.js', 'react js', 'React-JS', 'React']) assert.deepEqual(ids(t), ['react'], t);
  for (const t of ['NodeJS', 'Node.js', 'node js']) assert.deepEqual(ids(t), ['nodejs'], t);
  assert.deepEqual(ids('Postgres and K8s'), ['postgresql', 'kubernetes']);
});

test('meaningful distinctions are preserved', () => {
  assert.deepEqual(ids('C, C++, C#'), ['c', 'cpp', 'csharp']);
  assert.deepEqual(ids('Java'), ['java']);
  assert.deepEqual(ids('JavaScript'), ['javascript']);
  assert.deepEqual(ids('React Native'), ['react-native']);
  assert.deepEqual(ids('GitHub Actions'), ['github-actions']);
  assert.deepEqual(ids('GitHub'), ['github']);
  assert.deepEqual(ids('ASP.NET and .NET'), ['dotnet', 'dotnet']);
});

test('everyday words are not skills', () => {
  assert.deepEqual(ids('react quickly, go through code, in the spring, the rest of it, excel at work, C-suite, R&D'), []);
});

test('JD lines and quotes always resolve to the original text', () => {
  const jd = 'Intro line\r\nWe need Docker. Kubernetes is a plus; GraphQL is not required.\r\n\r\nLast: Python is required.';
  const p = parseJD(jd);
  assert.equal(p.lines.length, 4);
  for (const r of p.requirements) for (const m of r.mentions) {
    assert.ok(jd.slice(m.quoteStart, m.quoteEnd).includes(m.hitText));
    assert.equal(jd.slice(m.hitStart, m.hitEnd), m.hitText);
  }
  // Two sentences on line 2 get separate anchors.
  const docker = p.requirements.find((r) => r.skillIds[0] === 'docker')!;
  const k8s = p.requirements.find((r) => r.skillIds[0] === 'kubernetes')!;
  assert.equal(docker.mentions[0].anchorId, 'L2.S1');
  assert.equal(k8s.mentions[0].anchorId, 'L2.S2');
  assert.equal(k8s.strength, 'preferred');
  assert.deepEqual(p.notRequired.map((m) => m.skillId), ['graphql']);
});

test('required, preferred, negation and alternatives', () => {
  const p = parseJD(ACCEPTANCE_JD);
  const byFirst = Object.fromEntries(p.requirements.map((r) => [r.skillIds.join('|'), r.strength]));
  assert.deepEqual(byFirst, { 'react|vue': 'required', docker: 'required', 'github-actions': 'preferred' });
  assert.deepEqual(p.notRequired.map((m) => m.skillId), ['aws']);
});

test('section headings and label prefixes set strength', () => {
  const p = parseJD('Requirements:\n• Python\nNice to have:\n• Docker\nMust have: Git\nAbout us\nWe use Kafka.');
  const s = Object.fromEntries(p.requirements.map((r) => [r.skillIds[0], r.strength]));
  assert.deepEqual(s, { python: 'required', docker: 'preferred', git: 'required' });
});

test('slash means "either" for peers and "both" for companions', () => {
  const p = parseJD('Java/Kotlin required.\nReact/Redux required.\nMySQL/PostgreSQL required.');
  assert.deepEqual(p.requirements.map((r) => r.skillIds.join('|')), ['java|kotlin', 'react', 'redux', 'mysql|postgresql']);
});

test('"or similar" goes to review; ambiguous short names outside a list go to review', () => {
  const p = parseJD('Jenkins or a similar CI tool is a bonus.\nGo is required.\nSkills: Python, Go, SQL');
  const jenkins = p.requirements.find((r) => r.skillIds[0] === 'jenkins')!;
  assert.ok(jenkins.review);
  const go = p.requirements.find((r) => r.skillIds[0] === 'go')!;
  assert.equal(go.review, undefined, 'the list mention resolves the doubtful one');
  assert.ok(parseJD('Go is required.').requirements[0].review);
});

test('acceptance example: analysis', () => {
  const a = analyze(ACCEPTANCE_JD, page(ACCEPTANCE_RESUME));
  const react = a.items.find((i) => i.skillIds.includes('react'))!;
  assert.equal(react.status, 'matched');
  assert.match(react.explanation!, /Your resume says “ReactJS”\. This matches “React\.js” in the JD/);
  const docker = a.items.find((i) => i.skillIds[0] === 'docker')!;
  assert.equal(docker.status, 'missing');
  assert.equal(docker.strength, 'required');
  assert.equal(docker.jd.line, 2);
  assert.equal(docker.jd.quote, 'Docker is required for packaging services.');
  const gha = a.items.find((i) => i.skillIds[0] === 'github-actions')!;
  assert.equal(gha.status, 'missing');
  assert.equal(gha.strength, 'preferred');
  assert.equal(gha.jd.line, 3);
  assert.deepEqual(a.missingSkillIds, ['docker', 'github-actions']);
  assert.ok(!a.items.some((i) => i.status === 'missing' && (i.skillIds[0] === 'vue' || i.skillIds[0] === 'aws')));
  assert.equal(a.summary, 'Your resume shows evidence for 1 of 3 requirements.');
  assert.deepEqual(a.topGaps.map((g) => g.skillIds[0]), ['docker', 'github-actions']);
  assert.match(a.topGaps[0].gapReason!, /Required/);
  assert.match(a.topGaps[1].gapReason!, /after the 1 required gap/);
});

test('acceptance example: plan covers only Docker and GitHub Actions within 14 days', () => {
  const plan = buildPlan(analyze(ACCEPTANCE_JD, page(ACCEPTANCE_RESUME)).topGaps);
  assert.equal(plan.days.length, 14);
  assert.deepEqual(plan.gaps.map((g) => g.skillId), ['docker', 'github-actions']);
  assert.ok(plan.days.every((d) => d.skillIds.every((s) => ['docker', 'github-actions'].includes(s))));
  assert.ok(plan.days.every((d) => d.minutes >= 30 && d.minutes <= 45), 'each day 30–45 minutes');
  assert.equal(new Set(plan.days.map((d) => d.title)).size, 14, 'no repeated generic entries');
  assert.ok(plan.days.every((d) => d.task && d.output && d.selfCheck && d.gapKeys.length));
  assert.ok(plan.days.every((d) => d.dependsOn.every((x) => x < d.day)), 'dependencies point backwards');
  assert.equal(plan.mode, 'project');
  assert.equal(plan.days[13].kind, 'project');
});

test('plan: prerequisites first, unrelated skills get checkpoints, none when no gaps', () => {
  const a = analyze('Kubernetes is required.\nDocker is required.\nData structures are required.', page('I write Python every day for my coursework projects and assignments.'));
  const plan = buildPlan(a.topGaps);
  assert.deepEqual(plan.gaps.map((g) => g.skillId), ['kubernetes', 'docker', 'dsa']);
  assert.ok(Math.min(...plan.gaps[1].days) < Math.min(...plan.gaps[0].days), 'Docker before Kubernetes');
  assert.equal(plan.mode, 'checkpoints');
  assert.equal(plan.days.length, 14);
  assert.equal(buildPlan([]).mode, 'none');
});

test('extraction failure never reports everything as missing', () => {
  const blocked = analyze(ACCEPTANCE_JD, [{ page: 1, text: '', source: 'unreadable', confidence: 0 }]);
  assert.equal(blocked.extraction.blocked, true);
  assert.equal(blocked.missingSkillIds.length, 0);
  assert.ok(blocked.items.every((i) => i.status === 'review'));
  const partial = analyze(ACCEPTANCE_JD, [
    { page: 1, text: ACCEPTANCE_RESUME + ' Also wrote many unit tests and docs for the portal over two semesters.', source: 'text', confidence: 100 },
    { page: 2, text: '', source: 'unreadable', confidence: 0 },
  ]);
  assert.deepEqual(partial.extraction.unreadablePages, [2]);
  assert.equal(partial.items.find((i) => i.skillIds[0] === 'docker')!.status, 'review');
});

test('resume evidence spans line breaks and table cells', () => {
  const a = analyze('GitHub Actions is required.\nDocker is required.', page('Skills\nCI | GitHub\nActions, Docker'));
  assert.equal(a.items.every((i) => i.status === 'matched'), true);
});

test('scoring: Jaccard with empty sets = 1, and name resolution', () => {
  assert.equal(jaccard([], []).agreement, 1);
  assert.equal(jaccard(['docker'], ['docker', 'aws']).agreement, 0.5);
  assert.equal(resolveSkill('ReactJS').id, 'react');
  assert.equal(resolveSkill('k8s').id, 'kubernetes');
  assert.equal(resolveSkill('C#').id, 'csharp');
  assert.equal(resolveSkill('Shell scripting').id, 'bash');
  assert.equal(resolveSkill('Underwater basket weaving').known, false);
});
