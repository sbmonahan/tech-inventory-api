// scripts/run-pact-tests.js (ESM)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = process.cwd();
const NODE = process.execPath;

// where to look (comma-separated allowed via env)
const TEST_DIRS = (process.env.PACT_TEST_DIRS || 'tests')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// filename pattern: default "*-pact-test.js" (override with --pattern or PACT_TEST_PATTERN)
function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
const PATTERN =
  getArg('pattern') ||
  process.env.PACT_TEST_PATTERN ||
  '*-pact-test.js';

// basic glob-ish test for our simple pattern
function matchesPattern(filename, pattern) {
  // only support "*-pact-test.js" style
  if (pattern === '*-pact-test.js') return /-pact-test\.js$/i.test(filename);
  // fallback: substring
  return filename.toLowerCase().includes(pattern.toLowerCase());
}

function findTests(startDir) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (matchesPattern(entry.name, PATTERN)) out.push(full);
    }
  }
  if (fs.existsSync(startDir)) walk(startDir);
  return out;
}

// collect tests from all dirs
let tests = [];
for (const d of TEST_DIRS) {
  tests = tests.concat(findTests(path.isAbsolute(d) ? d : path.join(ROOT, d)));
}

// allow selecting a single test via --file
const onlyFile = getArg('file');
if (onlyFile) {
  const abs = path.isAbsolute(onlyFile) ? onlyFile : path.join(ROOT, onlyFile);
  tests = tests.filter(t => path.resolve(t) === path.resolve(abs));
}

if (tests.length === 0) {
  console.error(`No Pact tests found (dirs: ${TEST_DIRS.join(', ')}, pattern: ${PATTERN})`);
  process.exit(1);
}

console.log(`Found ${tests.length} Pact test(s):`);
tests.forEach(t => console.log('  •', path.relative(ROOT, t)));

let failures = 0;
for (const test of tests) {
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('▶ Running', path.relative(ROOT, test));
  console.log('──────────────────────────────────────────────────────────────');
  try {
    execFileSync(NODE, [test], {
      stdio: 'inherit',
      env: { ...process.env }, // pass through your .env
    });
    console.log('✔ Passed', path.relative(ROOT, test));
  } catch (err) {
    failures++;
    console.error('✖ Failed', path.relative(ROOT, test));
    // exit code & message already printed via stdio: 'inherit'
  }
}

console.log('\nSummary:', `${tests.length - failures} passed / ${failures} failed / ${tests.length} total`);
process.exit(failures ? 1 : 0);
