// Builds the browser bundle (esbuild) and the stylesheet (Tailwind CSS v4 compile API).
// Usage: node scripts/build.mjs [--watch]
import { build, context } from 'esbuild';
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist');
const require = createRequire(import.meta.url);
fs.mkdirSync(outDir, { recursive: true });

function walk(dir, exts, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, acc);
    else if (exts.some((x) => p.endsWith(x))) acc.push(p);
  }
  return acc;
}

// Tailwind v4 normally scans with @tailwindcss/oxide; we scan class candidates ourselves.
async function buildCss() {
  const twDir = path.dirname(require.resolve('tailwindcss/package.json'));
  const input = fs.readFileSync(path.join(root, 'src/client/styles.css'), 'utf8');
  const compiler = await compile(input, {
    base: root,
    loadStylesheet: async (id, base) => {
      let p;
      if (id === 'tailwindcss') p = path.join(twDir, 'index.css');
      else if (id.startsWith('tailwindcss/')) p = path.join(twDir, id.slice('tailwindcss/'.length));
      else p = path.resolve(base, id);
      return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
    },
  });
  const candidates = new Set();
  for (const file of walk(path.join(root, 'src/client'), ['.tsx', '.ts', '.html'])) {
    const src = fs.readFileSync(file, 'utf8');
    for (const tok of src.split(/[\s"'`{}<>;=]+/)) {
      if (tok && tok.length < 120 && /^[!a-z0-9\-:[\]#./%_@&>*(),]+$/i.test(tok)) candidates.add(tok);
      // Also try the token with trailing punctuation from JS expressions removed.
      const t2 = tok.replace(/[),]+$/, '');
      if (t2 && t2 !== tok && /^[!a-z0-9\-:[\]#./%_@&>*(),]+$/i.test(t2)) candidates.add(t2);
    }
  }
  const css = compiler.build([...candidates]);
  fs.writeFileSync(path.join(outDir, 'app.css'), css);
  return css.length;
}

const jsOptions = {
  entryPoints: [path.join(root, 'src/client/main.tsx')],
  bundle: true,
  format: 'esm',
  outfile: path.join(outDir, 'app.js'),
  minify: !process.argv.includes('--watch'),
  sourcemap: true,
  target: ['es2020', 'safari15'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
};

fs.copyFileSync(path.join(root, 'src/client/index.html'), path.join(outDir, 'index.html'));

if (process.argv.includes('--watch')) {
  const ctx = await context(jsOptions);
  await ctx.watch();
  await buildCss();
  console.log('Watching client sources (CSS rebuilds on restart).');
} else {
  await build(jsOptions);
  const n = await buildCss();
  const js = fs.statSync(path.join(outDir, 'app.js')).size;
  console.log(`Built dist/app.js (${(js / 1024).toFixed(0)} KB) and dist/app.css (${(n / 1024).toFixed(0)} KB)`);
}
