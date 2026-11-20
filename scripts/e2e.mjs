// Browser end-to-end check of the full experience on desktop and mobile viewports.
// Usage: npm run build && npm start   (in another terminal)
//        node scripts/e2e.mjs [http://localhost:3000] [--shots dir]
// Needs Playwright and a Chromium/Chrome (set CHROME_PATH to use an installed Chrome).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3000';
const shotsArg = process.argv.indexOf('--shots');
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
const failures = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failures.push(name); console.log(`FAIL ${name}\n     ${e.message.split('\n')[0]}`); }
};
const shot = async (page, name) => { if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true }); } };

for (const [label, viewport] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: label === 'mobile' ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);

  await step(`${label}: Try a sample runs the whole flow`, async () => {
    await shot(page, `${label}-1-input`);
    await page.getByRole('button', { name: 'Try a sample' }).click();
    await page.getByRole('heading', { level: 1, name: /Your resume shows evidence for \d+ of \d+ requirements/ }).waitFor({ timeout: 30000 });
    await shot(page, `${label}-2-results`);
  });

  await step(`${label}: summary numbers match the Evidence Lens`, async () => {
    const h1 = await page.getByRole('heading', { level: 1 }).innerText();
    const [, shown, total] = h1.match(/for (\d+) of (\d+)/).map(Number);
    const matchedRows = await page.locator('button[data-row]').filter({ hasText: /page \d/ }).count();
    assert.equal(shown, matchedRows);
    const gapRows = await page.locator('button[data-row]').filter({ hasText: /^(?!.*page \d).*(Required|Preferred)/ }).count();
    assert.ok(total >= shown && gapRows >= total - shown);
  });

  await step(`${label}: alias match is explained`, async () => {
    await page.locator('button[data-row]').filter({ hasText: 'React.js or Vue' }).click();
    const panel = label === 'desktop' ? page.locator('#lens-panel') : page.locator('[id^="detail-"]').first();
    await panel.getByText('Your resume says “ReactJS”. This matches “React.js” in the JD').waitFor();
    await panel.getByText(/Job description · line \d+/).waitFor();
    await shot(page, `${label}-3-alias`);
  });

  await step(`${label}: missing skill uses neutral wording and links to the plan`, async () => {
    await page.locator('button[data-row]').filter({ hasText: 'Docker' }).click();
    const panel = label === 'desktop' ? page.locator('#lens-panel') : page.locator('[id^="detail-"]').first();
    await panel.getByText('No evidence found in your resume').first().waitFor();
    await panel.getByRole('button', { name: /In your plan: Days/ }).click();
  });

  await step(`${label}: keyboard moves through the skill list`, async () => {
    const first = page.locator('button[data-row]').first();
    await first.focus();
    await page.keyboard.press('ArrowDown');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-row'));
    const second = await page.locator('button[data-row]').nth(1).getAttribute('data-row');
    assert.equal(focused, second);
    assert.equal(await page.locator('button[data-row]').nth(1).getAttribute('aria-expanded'), 'true');
  });

  await step(`${label}: plan has 14 days, checkboxes track progress`, async () => {
    assert.equal(await page.locator('ol > li[id^="day-"]').count(), 14);
    await page.getByRole('checkbox', { name: /Mark day 1 done/ }).check();
    await page.getByText('1 of 14 days done').waitFor();
    await page.getByRole('button', { name: /^Day 9:/ }).click();
    await page.locator('#day-body-9').waitFor();
    await page.locator('#day-9').getByRole('button', { name: /see JD evidence/ }).first().click();
  });

  await step(`${label}: correcting extracted text reruns everything together`, async () => {
    await page.getByRole('button', { name: 'Review extracted text' }).first().click();
    await page.getByRole('heading', { name: 'Review extracted text' }).waitFor();
    await shot(page, `${label}-4-review`);
    const box = page.getByLabel('Text we read from page 1');
    await box.fill((await box.inputValue()) + '\nPackaged services with Docker and Docker Compose.');
    await page.getByRole('button', { name: 'Rerun analysis' }).click();
    await page.getByRole('heading', { level: 1, name: /Your resume shows evidence for 7 of 9 requirements/ }).waitFor();
    assert.equal(await page.locator('button[data-row]').filter({ hasText: 'Docker' }).filter({ hasText: 'page 1' }).count(), 1);
    const planGaps = await page.locator('[aria-label="Gaps covered by the plan"] li').allInnerTexts();
    assert.ok(!planGaps.some((t) => t.includes('Docker')), 'Docker left the plan');
  });

  await step(`${label}: no page errors`, async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// Unreadable page flow (desktop): upload a PDF with an unreadable page.
await step('unreadable page sends the student to review and never shows false gaps', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base);
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles(path.join(root, 'fixtures/pdfs/unreadable.pdf'));
  await page.getByLabel('Job description text', { exact: true }).fill('Python is required.\nDocker is required.');
  await page.getByRole('button', { name: /Analyse resume/ }).click();
  await page.getByRole('heading', { name: 'Review extracted text' }).waitFor({ timeout: 60000 });
  await page.getByText('Page 2 could not be read.').waitFor();
  await shot(page, 'unreadable-review');
  await page.getByRole('button', { name: 'Continue to results' }).click();
  await page.getByText(/Page 2 could not be read\. Skills we didn’t find are marked “Needs review”/).waitFor();
  assert.equal(await page.locator('button[data-row]').filter({ hasText: 'Docker' }).filter({ hasText: 'Required' }).count(), 1);
  await page.getByText('Needs your review · not counted').waitFor();
  await page.close();
});

await step('pasted resume text works without a PDF', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await page.getByRole('button', { name: /Paste your resume text instead/ }).click();
  await page.locator('#resume-text').fill('Built a placement portal using ReactJS.');
  await page.getByLabel('Job description text', { exact: true }).fill('Experience with React.js or Vue is required.\nDocker is required for packaging services.\nGitHub Actions experience is preferred.\nNo prior AWS experience is needed.');
  await page.getByRole('button', { name: /Analyse resume/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Your resume shows evidence for 1 of 3 requirements.' }).waitFor();
  const gaps = await page.locator('[aria-label="Gaps covered by the plan"] li').allInnerTexts();
  assert.equal(gaps.length, 2);
  assert.ok(gaps[0].includes('Docker') && gaps[1].includes('GitHub Actions'));
  await shot(page, 'acceptance-results');
  await page.close();
});

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll browser checks passed');
process.exit(failures.length ? 1 : 0);
