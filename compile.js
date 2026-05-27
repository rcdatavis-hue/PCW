/**
 * PCW JSX Pre-compiler
 * Extracts the <script type="text/babel"> block from index.html,
 * compiles it to plain JS with Babel, and writes the result back.
 * The compiled file has no Babel dependency and loads ~600ms faster.
 */

const fs   = require('fs');
const path = require('path');
const babel = require('@babel/core');

const INPUT  = path.join(__dirname, 'index.html');
const OUTPUT = path.join(__dirname, 'index.html');

console.log('Reading index.html...');
let html = fs.readFileSync(INPUT, 'utf8');

// ── 1. Find the Babel script block ───────────────────────────────────────────
const CLOSE_TAG = '</script>';

// Already compiled — check for marker
if (html.includes('data-compiled="true"')) {
  console.log('⚠️  index.html appears already compiled. Skipping.');
  process.exit(0);
}

// Match the actual <script type="text/babel"> opening tag (not inside a comment)
const babelTagMatch = html.match(/^<script type="text\/babel">$/m);
if (!babelTagMatch) {
  console.error('ERROR: Could not find <script type="text/babel"> block.');
  process.exit(1);
}

const OPEN_TAG   = '<script type="text/babel">';
const babelStart = babelTagMatch.index;
const jsxStart   = babelStart + OPEN_TAG.length;
const closeIndex = html.indexOf(CLOSE_TAG, jsxStart);
if (closeIndex === -1) {
  console.error('ERROR: Could not find closing </script> for Babel block.');
  process.exit(1);
}

const jsxSource = html.slice(jsxStart, closeIndex);
console.log(`Found JSX block: ${jsxSource.split('\n').length.toLocaleString()} lines`);

// ── 2. Compile with Babel ─────────────────────────────────────────────────────
console.log('Compiling JSX...');
let compiled;
try {
  const result = babel.transformSync(jsxSource, {
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'classic' }],
    ],
    filename: 'pcw.jsx',
    sourceType: 'script',
  });
  compiled = result.code;
} catch (err) {
  console.error('COMPILE ERROR:', err.message);
  process.exit(1);
}

console.log(`Compiled: ${compiled.split('\n').length.toLocaleString()} lines`);

// ── 3. Replace the babel script block with compiled plain JS ─────────────────
const before = html.slice(0, babelStart);
const after  = html.slice(closeIndex + CLOSE_TAG.length);

html = before
  + `<script data-compiled="true">\n`
  + compiled
  + `\n</script>`
  + after;

// ── 4. Remove the Babel CDN script tag (after replacement so positions are stable) ──
const BABEL_CDN = /\s*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/babel-standalone\/[^"]+"><\/script>/;
if (BABEL_CDN.test(html)) {
  html = html.replace(BABEL_CDN, '');
  console.log('Removed Babel CDN script tag');
} else {
  console.warn('Warning: Babel CDN script tag not found — may already be removed');
}

// ── 5. Write output ───────────────────────────────────────────────────────────
fs.writeFileSync(OUTPUT, html, 'utf8');

const sizeKB = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
console.log(`\n✓ Done — index.html rewritten (${sizeKB} KB)`);
console.log('  • Babel CDN dependency removed');
console.log('  • JSX compiled to plain JS');
console.log('  • Load time improvement: ~600ms CPU + 1.4MB download saved');
