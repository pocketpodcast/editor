const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  'dist',
  'build',
  '.next',
  '.vite',
  'coverage',
  'out',
  'target',
]);

const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.html',
]);

const SEARCH_GROUPS = {
  'AUTHENTICATION': [
    'LoginPage',
    'AuthProvider',
    'useAuth',
    'isAuthenticated',
    'isLoading',
    'SIGNED_IN',
    'SIGNED_OUT',
    'session',
    'supabase.auth',
  ],

  'LOGIN': [
    '/login',
    'login',
    'signIn',
    'signInWithOAuth',
    'signInWithOtp',
  ],

  'REDIRECT / NAVIGATION': [
    'navigate(',
    'Navigate',
    'redirect',
    'redirectTo',
    'window.location',
    'location.href',
    'location.origin',
  ],

  'ROUTING': [
    '<Router',
    '<Route',
    'Router',
    'Route',
    'path=',
    '/editor',
    '/auth',
  ],

  'EDITOR': [
    'EditorPage',
    'editor.tsx',
    '/editor',
    '<Editor',
  ],

  'SUPABASE': [
    'supabase.auth',
    'getSession',
    'getUser',
    'exchangeCodeForSession',
    'signInWithOAuth',
    'signInWithOtp',
  ],
};

const allKeywords = [
  ...new Set(Object.values(SEARCH_GROUPS).flat()),
];

const results = [];
const filesScanned = [];

function isIgnored(relativePath) {
  const parts = relativePath.split(path.sep);

  return parts.some((part) => IGNORE_DIRS.has(part));
}

function walk(dir) {
  let entries;

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(ROOT, fullPath);

    if (isIgnored(relativePath)) continue;

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();

    if (!EXTENSIONS.has(ext)) continue;

    scanFile(fullPath, relativePath);
  }
}

function scanFile(fullPath, relativePath) {
  let content;

  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return;
  }

  filesScanned.push(relativePath);

  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    for (const keyword of allKeywords) {
      if (!line.toLowerCase().includes(keyword.toLowerCase())) {
        continue;
      }

      results.push({
        keyword,
        file: relativePath,
        line: lineIndex + 1,
        source: line.trim(),
        context: getContext(lines, lineIndex),
      });
    }
  }
}

function getContext(lines, index) {
  const start = Math.max(0, index - 4);
  const end = Math.min(lines.length, index + 5);

  return lines
    .slice(start, end)
    .map((line, i) => {
      const number = start + i + 1;
      return `${String(number).padStart(5, ' ')} | ${line}`;
    })
    .join('\n');
}

function getGroupResults(keywords) {
  return results.filter((result) =>
    keywords.some(
      (keyword) =>
        result.keyword.toLowerCase() === keyword.toLowerCase()
    )
  );
}

function getRelativeLink(file, line) {
  return `${file.replace(/\\/g, '/')}: ${line}`;
}

/*
|--------------------------------------------------------------------------
| AUTH GATE HEURISTIC
|--------------------------------------------------------------------------
*/

const likelyAuthGates = results.filter((result) => {
  const text = result.context.toLowerCase();

  const hasAuth =
    text.includes('isauthenticated') ||
    text.includes('is authenticated') ||
    text.includes('session()') ||
    text.includes('session?.') ||
    text.includes('user()');

  const hasLogin =
    text.includes('loginpage') ||
    text.includes('/login') ||
    text.includes('login');

  const hasEditor =
    text.includes('editorpage') ||
    text.includes('/editor') ||
    text.includes('<editor');

  return hasAuth && (hasLogin || hasEditor);
});

/*
|--------------------------------------------------------------------------
| TEXT REPORT
|--------------------------------------------------------------------------
*/

let txt = '';

txt += '============================================================\n';
txt += '       DIFFUSION STUDIO AUTH / EDITOR SCANNER\n';
txt += '============================================================\n\n';

txt += `Repository root:\n${ROOT}\n\n`;

txt += `Files scanned: ${filesScanned.length}\n`;
txt += `Total keyword matches: ${results.length}\n\n`;

txt += '============================================================\n';
txt += '                    SEARCH RESULTS\n';
txt += '============================================================\n\n';

for (const [group, keywords] of Object.entries(SEARCH_GROUPS)) {
  const groupResults = getGroupResults(keywords);

  txt += `\n### ${group} ###\n`;
  txt += `Matches: ${groupResults.length}\n\n`;

  if (groupResults.length === 0) {
    txt += 'No matches found.\n\n';
    continue;
  }

  for (const result of groupResults) {
    txt += '------------------------------------------------------------\n';
    txt += `KEYWORD : ${result.keyword}\n`;
    txt += `FILE    : ${result.file}\n`;
    txt += `LINE    : ${result.line}\n`;
    txt += `CODE    : ${result.source}\n\n`;
    txt += 'CONTEXT :\n';
    txt += `${result.context}\n\n`;
  }
}

txt += '\n============================================================\n';
txt += '                 LIKELY AUTH GATES\n';
txt += '============================================================\n\n';

if (likelyAuthGates.length === 0) {
  txt += 'No obvious auth gate detected automatically.\n';
  txt += 'This does NOT mean there is no auth gate.\n';
} else {
  for (const result of likelyAuthGates) {
    txt += '############################################################\n';
    txt += 'POSSIBLE AUTH GATE\n';
    txt += '############################################################\n';
    txt += `FILE : ${result.file}\n`;
    txt += `LINE : ${result.line}\n`;
    txt += `CODE : ${result.source}\n\n`;
    txt += `${result.context}\n\n`;
  }
}

txt += '\n============================================================\n';
txt += '                      NEXT STEP\n';
txt += '============================================================\n\n';

txt +=
  'Look first at the files marked POSSIBLE AUTH GATE.\n' +
  'Do NOT modify anything based only on this report.\n' +
  'Inspect the complete function/component before changing auth.\n';

fs.writeFileSync(
  path.join(ROOT, 'auth-report.txt'),
  txt,
  'utf8'
);

/*
|--------------------------------------------------------------------------
| HTML REPORT
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Auth / Editor Diagnostic Report</title>

<style>
body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 30px;
  background: #f5f5f5;
  color: #222;
}

h1 {
  margin-top: 0;
}

.summary {
  background: white;
  padding: 20px;
  border-radius: 10px;
  margin-bottom: 25px;
}

.group {
  background: white;
  margin-bottom: 20px;
  padding: 20px;
  border-radius: 10px;
}

.result {
  border: 1px solid #ddd;
  border-radius: 8px;
  margin: 15px 0;
  padding: 15px;
}

.file {
  font-weight: bold;
}

.line {
  color: #555;
}

pre {
  background: #111;
  color: #eee;
  padding: 15px;
  overflow-x: auto;
  border-radius: 6px;
  line-height: 1.5;
}

.auth-gate {
  border: 3px solid #d33;
}

.badge {
  display: inline-block;
  padding: 5px 8px;
  border-radius: 5px;
  background: #eee;
  margin-right: 5px;
}

</style>
</head>

<body>

<h1>Diffusion Studio Auth / Editor Diagnostic Report</h1>

<div class="summary">
  <p><strong>Repository:</strong> ${escapeHtml(ROOT)}</p>
  <p><strong>Files scanned:</strong> ${filesScanned.length}</p>
  <p><strong>Total matches:</strong> ${results.length}</p>
  <p><strong>Possible auth gates:</strong> ${likelyAuthGates.length}</p>
</div>

<h2>🚨 Possible Auth Gates</h2>
`;

if (likelyAuthGates.length === 0) {
  html += `
  <div class="group">
    No obvious auth gate detected automatically.
  </div>
  `;
} else {
  for (const result of likelyAuthGates) {
    html += `
    <div class="result auth-gate">
      <h3>⚠ POSSIBLE AUTH GATE</h3>

      <p>
        <span class="badge">FILE</span>
        <span class="file">${escapeHtml(result.file)}</span>
      </p>

      <p>
        <span class="badge">LINE</span>
        <span class="line">${result.line}</span>
      </p>

      <p>
        <strong>Matched code:</strong><br>
        <code>${escapeHtml(result.source)}</code>
      </p>

      <pre>${escapeHtml(result.context)}</pre>
    </div>
    `;
  }
}

html += `<h2>🔎 Detailed Search Results</h2>`;

for (const [group, keywords] of Object.entries(SEARCH_GROUPS)) {
  const groupResults = getGroupResults(keywords);

  html += `
  <div class="group">
    <h2>${escapeHtml(group)}</h2>
    <p>Matches: ${groupResults.length}</p>
  `;

  if (groupResults.length === 0) {
    html += `<p>No matches found.</p>`;
  }

  for (const result of groupResults) {
    html += `
      <div class="result">

        <p>
          <strong>Keyword:</strong>
          ${escapeHtml(result.keyword)}
        </p>

        <p>
          <strong>File:</strong>
          <span class="file">${escapeHtml(result.file)}</span>
        </p>

        <p>
          <strong>Line:</strong>
          ${result.line}
        </p>

        <p>
          <strong>Code:</strong>
          <code>${escapeHtml(result.source)}</code>
        </p>

        <pre>${escapeHtml(result.context)}</pre>

      </div>
    `;
  }

  html += `</div>`;
}

html += `
</body>
</html>
`;

fs.writeFileSync(
  path.join(ROOT, 'auth-report.html'),
  html,
  'utf8'
);

/*
|--------------------------------------------------------------------------
| TERMINAL SUMMARY
|--------------------------------------------------------------------------
*/

console.log('');
console.log('============================================================');
console.log('       DIFFUSION STUDIO AUTH / EDITOR SCANNER');
console.log('============================================================');
console.log('');

console.log(`Files scanned       : ${filesScanned.length}`);
console.log(`Keyword matches     : ${results.length}`);
console.log(`Possible auth gates : ${likelyAuthGates.length}`);

console.log('');
console.log('------------------------------------------------------------');
console.log('POSSIBLE AUTH GATES');
console.log('------------------------------------------------------------');

if (likelyAuthGates.length === 0) {
  console.log('No obvious auth gate detected.');
} else {
  for (const result of likelyAuthGates) {
    console.log('');
    console.log(`⚠ ${result.file}:${result.line}`);
    console.log(`  ${result.source}`);
  }
}

console.log('');
console.log('------------------------------------------------------------');
console.log('REPORTS CREATED');
console.log('------------------------------------------------------------');

console.log('✓ auth-report.txt');
console.log('✓ auth-report.html');

console.log('');
console.log('Open auth-report.html in Chrome for the full report.');
console.log('');
console.log('IMPORTANT: This scanner does NOT modify source files.');
console.log('');
