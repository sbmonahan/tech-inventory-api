// scripts/verify-provider.js
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Verifier } from '@pact-foundation/pact';

// ───────────── helpers ─────────────
const nowIso = () => new Date().toISOString().replace(/[:.]/g, '-');
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const write = (file, data) => fs.writeFileSync(file, data);
const mask = (s) => (s ? s.slice(0, 4) + '…' + s.slice(-2) : '');
const bool = (v, d = false) => {
  if (v == null) return d;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return d;
};
const junitXml = ({ name, timeSec, ok, message }) => {
  const esc = (x) => String(x).replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${esc(name)}" tests="1" failures="${ok ? 0 : 1}" time="${timeSec.toFixed(3)}">
  <testcase classname="${esc(name)}" name="${esc(name)}" time="${timeSec.toFixed(3)}">
    ${ok ? '' : `<failure message="${esc(message || 'Verification failed')}"><![CDATA[${message || ''}]]></failure>`}
  </testcase>
</testsuite>`;
};

// Optional: tee console logs to file if VERIFIER_LOG_TO_FILE=true
function teeConsole(outDir) {
  if (!bool(process.env.VERIFIER_LOG_TO_FILE, false)) return;
  ensureDir(outDir);
  const log = fs.createWriteStream(path.join(outDir, 'verification.log'), { flags: 'a' });
  const wrap = (orig) => (...args) => {
    orig(...args);
    try { log.write(args.map(String).join(' ') + '\n'); } catch {}
  };
  console.log = wrap(console.log);
  console.error = wrap(console.error);
}

// ───────────── config (from .env) ─────────────
// Required broker creds (you already have these)
const brokerUrl   = process.env.PACT_BROKER_BASE_URL;
const brokerToken = process.env.PACT_BROKER_TOKEN;
if (!brokerUrl || !brokerToken) {
  console.error('❌ Missing PACT_BROKER_BASE_URL or PACT_BROKER_TOKEN in .env');
  process.exit(1);
}

// Provider identity & runtime
const provider        = process.env.PROVIDER_NAME     || 'tech-inventory-api';
const providerBaseUrl = process.env.PROVIDER_BASE_URL || 'http://localhost:3000';

// Version/branch metadata recorded with verification
const providerVersion = process.env.PROVIDER_APP_VERSION || `local-${Date.now()}`;
const providerBranch  = process.env.PACT_BRANCH || 'main';

// Consumer selectors (priority: JSON → branch/tag → default to providerBranch)
let consumerSelectors;
try {
  if (process.env.PACT_CONSUMER_SELECTOR_JSON) {
    const parsed = JSON.parse(process.env.PACT_CONSUMER_SELECTOR_JSON);
    if (Array.isArray(parsed) && parsed.length) consumerSelectors = parsed;
  }
} catch (e) {
  console.error('⚠️  Failed to parse PACT_CONSUMER_SELECTOR_JSON:', e.message);
}
if (!consumerSelectors) {
  const branch = process.env.PACT_CONSUMER_BRANCH || providerBranch;
  const tag    = process.env.PACT_CONSUMER_TAG || '';
  consumerSelectors = [];
  if (branch) consumerSelectors.push({ branch, latest: true });
  if (tag)    consumerSelectors.push({ tag, latest: true });
  if (!consumerSelectors.length) consumerSelectors = [{ branch: providerBranch, latest: true }];
}

// Broker features / logging / outputs
const publishResults  = bool(process.env.PUBLISH_VERIFICATION_RESULT, true);
const enablePending   = bool(process.env.PACT_ENABLE_PENDING, true);
const includeWipSince = process.env.PACT_INCLUDE_WIP_SINCE || undefined; // e.g. "2024-01-01"
const logLevel        = process.env.PACT_LOG_LEVEL || process.env.LOG_LEVEL || undefined;

// Output dir
const outRoot = process.env.PACT_OUT_DIR || path.join(process.cwd(), 'artifacts', 'pact-verification');
const OUT_DIR = path.join(outRoot, `${provider}-${providerVersion}-${nowIso()}`);
ensureDir(OUT_DIR);
teeConsole(OUT_DIR);

// Guard: only pass includeWipPactsSince when both enabled and valid ISO date
const wipDateLooksISO = !!includeWipSince && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(includeWipSince);

// ───────────── run verification ─────────────
const started = Date.now();
const meta = {
  provider, providerBaseUrl,
  providerVersion, providerBranch,
  brokerUrl, brokerTokenMasked: mask(brokerToken),
  consumerSelectors, publishResults, enablePending,
  includeWipPactsSince: enablePending && wipDateLooksISO ? includeWipSince : '(omitted)',
  logLevel,
  startedAt: new Date(started).toISOString(),
};

(async () => {
  try {
    const verifierOpts = {
      provider,
      providerBaseUrl,
      providerVersion,
      providerVersionBranch: providerBranch,
      publishVerificationResult: publishResults,
      pactBrokerUrl: brokerUrl,
      pactBrokerToken: brokerToken,
      consumerVersionSelectors: consumerSelectors,
      enablePending, // true/false is fine
    };
    if (logLevel) verifierOpts.logLevel = logLevel;
    if (enablePending && wipDateLooksISO) {
      verifierOpts.includeWipPactsSince = includeWipSince;
    }

    // Small visibility into what we’re sending (token masked)
    console.log('Verifier config:', {
      provider,
      providerBaseUrl,
      providerVersion,
      providerBranch,
      selectors: consumerSelectors,
      enablePending,
      includeWipPactsSince: verifierOpts.includeWipPactsSince ?? '(omitted)',
      brokerUrl,
    });

    const verifier = new Verifier(verifierOpts);
    const resultText = await verifier.verifyProvider();
    const durationMs = Date.now() - started;

    const summary = {
      ...meta,
      ok: true,
      finishedAt: new Date().toISOString(),
      durationMs,
      resultText,
    };

    write(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    write(path.join(OUT_DIR, 'summary.txt'), (resultText || 'Verification passed') + '\n');
    write(path.join(OUT_DIR, 'junit.xml'), junitXml({
      name: `pact-verification:${provider}`,
      timeSec: durationMs / 1000,
      ok: true,
    }));

    console.log('✅ Provider verified');
    console.log(`🗂️  Artifacts: ${OUT_DIR}`);
    process.exit(0);
  } catch (e) {
    const durationMs = Date.now() - started;
    const msg = e?.message || String(e);

    const summary = {
      ...meta,
      ok: false,
      finishedAt: new Date().toISOString(),
      durationMs,
      error: { message: msg, stack: e?.stack },
    };

    write(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    write(path.join(OUT_DIR, 'summary.txt'), `FAILED: ${msg}\n`);
    write(path.join(OUT_DIR, 'junit.xml'), junitXml({
      name: `pact-verification:${provider}`,
      timeSec: durationMs / 1000,
      ok: false,
      message: msg,
    }));

    console.error('❌ Provider verification failed:', msg);
    console.log(`🗂️  Artifacts: ${OUT_DIR}`);
    process.exit(1);
  }
})();
