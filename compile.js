/**
 * PCW Build Script
 * 1. Compiles JSX → plain JS (removes Babel runtime dependency)
 * 2. Inlines Tailwind CSS (removes 330KB CDN dependency)
 * 3. Fixes TDZ issues via block-scoping transform
 */

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const babel = require('@babel/core');
const { execSync } = require('child_process');

const INPUT  = path.join(__dirname, 'index.html');
const OUTPUT = path.join(__dirname, 'index.html');

console.log('Reading index.html...');
let html = fs.readFileSync(INPUT, 'utf8');

// ── Already compiled? ────────────────────────────────────────────────────────
if (html.includes('data-compiled="true"')) {
  console.log('Already compiled. Skipping.');
  process.exit(0);
}

// ── 1. Find the Babel script block ──────────────────────────────────────────
const OPEN_TAG  = '<script type="text/babel">';
const CLOSE_TAG = '</script>';

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

// ── 2. Compile with Babel ────────────────────────────────────────────────────
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

// ── 3. Replace babel script block with compiled JS ───────────────────────────
const before = html.slice(0, babelStart);
const after  = html.slice(closeIndex + CLOSE_TAG.length);
html = before + '<script data-compiled="true">\n' + compiled + '\n</script>' + after;

// ── 4. Remove Babel CDN tag ──────────────────────────────────────────────────
const BABEL_CDN = /\s*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/babel-standalone\/[^"]+"><\/script>/;
if (BABEL_CDN.test(html)) {
  html = html.replace(BABEL_CDN, '');
  console.log('Removed Babel CDN script tag');
}

// ── 5. Inline Tailwind CSS ───────────────────────────────────────────────────
const tmpDir     = os.tmpdir();
const scanFile   = path.join(tmpDir, 'pcw-scan.html');
const inputFile  = path.join(tmpDir, 'pcw-tw-input.css');
const outputFile = path.join(tmpDir, 'pcw-tw-output.css');
const configFile = path.join(tmpDir, 'pcw-tw-config.js');

try {
  // Scan the original source file for Tailwind classes (before compilation, catches all patterns)
  const sourceFile = INPUT.replace('index.html', 'index.html'); // use INPUT path
  const twInput = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';
  fs.writeFileSync(inputFile, twInput);

  const escapedSource = INPUT.replace(/\\/g, '\\\\');
  const twConfig = 'module.exports={content:["' + escapedSource + '"],theme:{extend:{}},plugins:[]};';
  fs.writeFileSync(configFile, twConfig);

  const twBin = path.join(__dirname, 'node_modules', '.bin', 'tailwindcss');
  execSync('node "' + twBin + '" -c "' + configFile + '" -i "' + inputFile + '" -o "' + outputFile + '" --minify', { stdio: 'pipe' });

  const twCSS = fs.readFileSync(outputFile, 'utf8');

  // Remove Tailwind CDN preconnect and script
  html = html.replace(/\s*<link rel="preconnect" href="https:\/\/cdn\.tailwindcss\.com"[^>]*>/g, '');
  html = html.replace(/\s*<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/g, '');

  // Inject before </head>
  html = html.replace('</head>', '<style>' + twCSS + '</style>\n</head>');

  console.log('Inlined Tailwind CSS: ' + (twCSS.length / 1024).toFixed(1) + 'KB (CDN was ~330KB)');
} catch (e) {
  console.warn('Warning: Tailwind inlining failed — CDN left in place:', e.message);
}

// ── 6. Write output ──────────────────────────────────────────────────────────
fs.writeFileSync(OUTPUT, html, 'utf8');

const sizeKB = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
console.log('\nDone — index.html rewritten (' + sizeKB + ' KB)');
console.log('  Babel CDN removed + JSX compiled + Tailwind inlined');
