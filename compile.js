/**
 * PCW JSX Pre-compiler
 * Extracts the <script type="text/babel"> block from index.html,
 * compiles it to plain JS with Babel, and writes the result back.
 * The compiled file has no Babel dependency and loads ~600ms faster.
 */

const fs    = require('fs');
const path  = require('path');
const babel = require('@babel/core');

const INPUT  = path.join(__dirname, 'index.html');
const OUTPUT = path.join(__dirname, 'index.html');

console.log('Reading index.html...');
let html = fs.readFileSync(INPUT, 'utf8');

// ── 1. Already compiled? ──────────────────────────────────────────────────────
if (html.includes('data-compiled="true"')) {
  console.log('Already compiled. Skipping.');
  process.exit(0);
}

// ── 2. Find the Babel script block ───────────────────────────────────────────
const OPEN_TAG  = '<script type="text/babel">';
const CLOSE_TAG = '</script>';

// Match the actual opening tag on its own line (not inside a comment)
const babelTagMatch = html.match(/^<script type="text\/babel">$/m);
if (!babelTagMatch) {
  console.error('ERROR: Could not find <script type="text/babel"> block.');
  process.exit(1);
}

const babelStart = babelTagMatch.index;
const jsxStart   = babelStart + OPEN_TAG.length;
const closeIndex = html.indexOf(CLOSE_TAG, jsxStart);
if (closeIndex === -1) {
  console.error('ERROR: Could not find closing </script> for Babel block.');
  process.exit(1);
}

const jsxSource = html.slice(jsxStart, closeIndex);
console.log('Found JSX block: ' + jsxSource.split('\n').length.toLocaleString() + ' lines');

// ── 3. Compile with Babel (JSX only — leave all JS untouched) ────────────────
console.log('Compiling JSX...');
let compiled;
try {
  const result = babel.transformSync(jsxSource, {
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'classic' }],
      ['@babel/plugin-transform-block-scoping'],
    ],
    filename: 'pcw.jsx',
    sourceType: 'script',
  });
  compiled = result.code;
} catch (err) {
  console.error('COMPILE ERROR:', err.message);
  process.exit(1);
}
console.log('Compiled: ' + compiled.split('\n').length.toLocaleString() + ' lines');

// ── 4. Replace the babel script block with compiled plain JS ─────────────────
const before = html.slice(0, babelStart);
const after  = html.slice(closeIndex + CLOSE_TAG.length);

html = before
  + '<script data-compiled="true">\n'
  + compiled
  + '\n</script>'
  + after;

// ── 5. Remove the Babel CDN script tag ───────────────────────────────────────
const BABEL_CDN = /\s*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/babel-standalone\/[^"]+"><\/script>/;
if (BABEL_CDN.test(html)) {
  html = html.replace(BABEL_CDN, '');
  console.log('Removed Babel CDN script tag');
} else {
  console.warn('Warning: Babel CDN script tag not found');
}

// ── 6. Fix TDZ: convert const→var inside PartsWorksheet function body ────────
// The original Babel-in-browser transpiler hoisted declarations, avoiding temporal
// dead zone (TDZ) issues with forward references. We replicate that by converting
// const→var inside the component body, which is hoisted by the JS engine.
const pwMarker = 'function PartsWorksheet()';
const pwStart  = html.indexOf(pwMarker);
// Find the next top-level function after PartsWorksheet (may be minified, no leading newline)
const pwSearchArea = html.slice(pwStart + 100);
const pwNextFn = pwSearchArea.search(/function [A-Z]\w*\(|^function [a-z]\w*\(/m);
const pwEnd    = pwNextFn !== -1 ? (pwStart + 100 + pwNextFn) : -1;

if (pwStart !== -1 && pwEnd !== -1) {
  const hBefore = html.slice(0, pwStart);
  const pwBody  = html.slice(pwStart, pwEnd);
  const hAfter  = html.slice(pwEnd);
  const pwFixed = pwBody.replace(/\bconst\b(?=\s+\w+\s*=)/g, 'var');
  const count   = (pwBody.match(/\bconst\b(?=\s+\w+\s*=)/g) || []).length;
  html = hBefore + pwFixed + hAfter;
  console.log('Converted ' + count + ' const→var in PartsWorksheet (TDZ fix)');
} else {
  console.warn('Warning: PartsWorksheet function not found for TDZ fix');
}

// ── 7. Write output ───────────────────────────────────────────────────────────
fs.writeFileSync(OUTPUT, html, 'utf8');

const sizeKB = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
console.log('\nDone — index.html rewritten (' + sizeKB + ' KB)');
console.log('  Babel CDN removed, JSX compiled, TDZ fixed');
