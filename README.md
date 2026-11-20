# RoleProof

RoleProof compares a student’s resume PDF with a job description (JD). For every skill the JD asks for, it shows whether the resume has evidence for it, quoting the exact JD line and the place in the resume it came from. It then builds a 14-day learning plan for the top three gaps.

The main flow needs no API key and no paid service.

## Quick start

Requirements:

- Node.js 20 or newer.
- For scanned pages: `tesseract` and `pdftoppm`. Both are free.
  - macOS: `brew install tesseract poppler`
  - Ubuntu/Debian: `sudo apt install tesseract-ocr poppler-utils`
  - Windows: use WSL or Docker.

```bash
npm install
npm run build          # bundles the client (esbuild) and CSS (Tailwind v4)
npm start              # http://localhost:3000  (PORT=8080 npm start to change)
```

Open the app and click **Try a sample** to run the whole flow with a bundled resume and JD.

Docker (OCR tools included):

```bash
docker build -t roleproof . && docker run -p 3000:3000 roleproof
```

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Builds `dist/app.js` and `dist/app.css` |
| `npm start` | Starts the server (serves the app and `/api/extract`) |
| `npm test` | Unit tests plus PDF upload and extraction tests on real fixture PDFs (`node:test`) |
| `npm run eval` | Measured fixture score, plus the judge score if judge cases exist |
| `npm run eval -- --judge path/to/cases` | Evaluates a judge’s cases from any folder |
| `npm run eval -- --json report.json` | Also writes a machine-readable report |
| `npm run e2e -- http://localhost:3000` | Browser checks of the full flow on desktop and mobile. Needs Playwright with a browser; set `CHROME_PATH` to use an installed Chrome. |
| `npm run typecheck` | TypeScript check of the whole project (needs `@types/react` from `npm install`) |
| `npm run fixtures` | Regenerates the fixture PDFs and the sample resume (Python with reportlab, Pillow and fontTools) |

## Architecture

```
src/
  engine/            Pure TypeScript. Runs in the browser and in tests/eval.
    skills.ts        Versioned skill dictionary (canonical names, aliases, categories)
    matcher.ts       Alias regexes, word boundaries, longest-match resolution
    jd.ts            JD lines, sentence anchors, sections, required/preferred/negation, alternatives
    resume.ts        Resume evidence search (whole page, across line breaks), resume section labels
    analyze.ts       Statuses, counts, summary sentence, gap ranking with reasons
    plan.ts          14-day plan: curated and category tracks, prerequisites, project or checkpoints
  server/
    extract.ts       PDF → pages: pdfjs text layer with coordinates, column and table recovery,
                     icon stripping, per-page OCR (pdftoppm + tesseract), page previews
    index.ts         node:http server: static files, POST /api/extract (NDJSON progress stream)
  client/            React UI: upload, review extracted text, results (Evidence Lens), plan
eval/                Evaluation runner, scoring, developer fixture cases, judge folder
tests/               engine.test.ts, pdf.test.ts (fixture PDFs through the real extraction + HTTP path)
fixtures/pdfs/       Two-column, table, icons, scanned, mixed-page, mixed-region and unreadable PDFs
public/samples/      “Try a sample” resume PDF and JD
```

**Where processing happens.** The PDF is sent to the server once. It is parsed in memory and in a private temp folder that is deleted when the request ends. Nothing is stored. Server logs record only the method, path, status and timing, never file names or contents. Skill matching, counting and the plan all run in the browser, so corrections and reruns never leave the tab. The only thing saved locally is plan checkbox progress (in `localStorage`, keyed by the gap names, with no resume content).

**Why not Next.js?** This project was built in an environment where packages could not be installed, and Next.js was not available offline. It uses React, TypeScript and Tailwind CSS with esbuild and a small Node server instead. The engine and components are framework-independent, so moving to Next.js means moving `src/client` into an app route and `/api/extract` into a route handler (Node runtime, because it calls tesseract and pdftoppm).

## Matching rules

- **Aliases.** Each alias is split into parts on spaces, dots, hyphens and underscores. One optional separator is allowed between parts, so `react.js` matches ReactJS, React.js, react js and React-JS, and `node.js` matches NodeJS.
- **Distinctions kept.** `+` and `#` are literal, and an alias cannot be followed by a letter, digit, `+` or `#`. So C, C++ and C# never match each other, and Java never matches JavaScript.
- **Overlaps.** When matches overlap, the longest one wins: GitHub Actions beats GitHub, React Native beats React.
- **No implied skills.** Related skills stay distinct: Next.js does not imply React, and Django does not imply Python. The only equivalences are the aliases in `skills.ts`.
- **Ordinary words.** React, Go, Swift, Spring, Excel and similar names are matched case-sensitively. Very short names (C, R, Go) also need strict word edges, so “react quickly”, “go through”, “C-suite” and “R&D” are not skills.
- **Ambiguous short names.** Go, C and R in a JD go to *Needs review* unless they appear in a list next to other skills.
- **Strength.** Applied per clause. A clause splits at `;` and at “, but”, so “Docker is required, but no AWS experience is needed” is handled correctly. Checks run in this order:
  1. Negation (“no prior … needed”, “not required”, “you don’t need”).
  2. Preferred wording (“preferred”, “a plus”, “nice to have”, “bonus”, “added advantage”).
  3. Required wording (“required”, “must”, “experience with”, “proficiency”).
  4. The section heading (Requirements / Preferred / Responsibilities).
  5. Otherwise, the skill counts as required by context.

  Skills in “About us” and “Benefits” sections are ignored.
- **Alternatives.**
  - Skills joined by “or”, or listed after “any of / one of / either”, form one requirement, which any one of them satisfies.
  - With a slash, peers mean *either* (Java/Kotlin, MySQL/PostgreSQL), and companions mean *both* (React/Redux, Node.js/Express).
  - “X or a similar tool” goes to *Needs review*.
- **Evidence.** The whole resume is searched, including table cells and names wrapped across lines. Evidence from Projects or Experience is preferred over a bare Skills list, and the label says which (“Used in Projects” or “Listed in Skills”).
- **Counting.**
  - Alternatives and repeated mentions count once.
  - *Needs review* items and skills the JD says are not needed are left out of the denominator. The results screen says so.
- **Gap ranking.**
  1. Explicitly required.
  2. Required by context.
  3. Preferred.

  Ties keep JD order. Each top gap shows the reason it was ranked there.
- **Missing set for evaluation.** These are the canonical ids of requirements with status *missing*. An alternative group counts as its first-named skill. *Needs review* items are not counted as missing.

### Adding aliases or skills

Edit `ROWS` in `src/engine/skills.ts`:

`[id, name, category, aliases, caseSensitiveAliases?, ambiguous?]`

Then:

1. Bump `SKILL_DICTIONARY_VERSION`.
2. Add a test in `tests/engine.test.ts`.
3. Run `npm test && npm run eval`.

A skill without a curated track in `plan.ts` gets a plan from its category template automatically.

## Evaluation

```bash
npm run eval                         # fixtures + eval/judge (if it has cases)
npm run eval -- --judge ~/judge-set  # any folder of judge cases
```

**Case format.** One folder per case containing:

- `resume.pdf` or `resume.txt`
- `jd.txt`
- `expected.json`, for example `{"missing": ["Docker", "GitHub Actions"]}`

See `eval/judge-example/`. Judge names are mapped to canonical skills through the same alias rules, and names the dictionary doesn’t know are reported.

**Answer keys never reach inference.** For each case the runner first computes the prediction from `resume` and `jd`, and only then reads `expected.json`.

**Scoring.**

- If the judge folder contains `scoring.mjs` exporting `score(predictedNames, expectedNames) → 0..1`, that rule is used.
- Otherwise the runner uses the documented default: the **per-case Jaccard agreement** |predicted ∩ expected| / |predicted ∪ expected|, where two empty sets score 1, averaged across cases.
- Precision, recall, false positives and false negatives are printed for every case.

The **developer fixture score** is printed separately and is not a judge score. If no judge cases are found, the runner prints “Judge score not evaluated”.

**Developer fixtures (`eval/cases`).** These cover:

- the brief’s acceptance example
- aliases and look-alikes
- two-column PDF
- skills in tables
- decorative icons
- scanned (OCR) PDF
- text page plus scanned page
- scanned section inside a text page
- negation
- alternatives
- an unreadable page
- a realistic JD full of everyday words (react, go, spring, rest, excel)

All 12 pass. Because these fixtures were written alongside the code, they show the rules work. They do not predict the judges’ score.

## Extraction: what it handles and its limits

- **Text layer:** read with pdfjs, keeping each text run’s page coordinates.
- **Lines and table cells:** runs are grouped into lines, and gaps wider than about 1.8 em split a line into cells (table rows come out as `Cell | Cell`).
- **Two columns:** a vertical gutter is detected when both columns run down a large part of the page. Full-width lines split the page into bands; inside each band the left column is read, then the right.
- **Icons:** private-use glyphs (Font Awesome style), dingbats, emoji and geometric bullets are removed.
- **OCR:** runs per page when the text layer is missing or looks like symbol soup. On pages that mix text and scanned images, only the scanned image regions are OCR’d, and OCR lines overlapping text-layer lines are dropped to avoid duplicates.
- **Unreadable pages** are named in the review screen, with options to retry OCR (standard or sharper), edit, or paste the text. Until that page is fixed, skills not found elsewhere are *Needs review*, not missing. With almost no readable text, analysis is blocked instead of reporting false gaps.

Known limits:

- Layouts with three or more columns, rotated text, and text drawn as vector outlines are not specially handled.
- OCR quality depends on scan quality and on the tesseract English model. A noisy page can take up to the OCR timeout (`ROLEPROOF_OCR_TIMEOUT_MS`, default 25 s) before it is reported unreadable.
- Limits: 10 MB and 12 pages per PDF. Password-protected PDFs are rejected with a message.
- The dictionary covers about 140 common tech skills. A JD skill outside it is not detected, and the evaluation reports such names from answer keys.
- Static hosts such as Vercel or Netlify don’t provide tesseract or poppler. Deploy with the Dockerfile (Render, Railway, Fly.io) for OCR. On a host without them, text-layer PDFs still work and scanned pages tell the student to paste the text.
