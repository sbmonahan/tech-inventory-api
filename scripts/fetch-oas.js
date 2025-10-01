// scripts/fetch-oas.js (ESM)
import 'dotenv/config';
import fs from 'node:fs/promises';

const {
  SH_OWNER,
  SH_API,
  SH_API_KEY,
  SH_BASE_URL = 'https://api.swaggerhub.com',
  SH_RESOLVED = 'false',
  SH_FLATTEN = 'false',
  SH_AUTH_HEADER = 'Authorization',
} = process.env;

// ---- debug config (from .env) ---------------------------------------------
function parseDebug(val) {
  if (val == null) return 0;
  const s = String(val).toLowerCase().trim();
  if (['2', 'full', 'verbose'].includes(s)) return 2;
  if (['1', 'true', 'yes', 'on', 'debug'].includes(s)) return 1;
  return 0;
}
const DEBUG_LEVEL = parseDebug(
  process.env.DEBUG_FETCH ??
  process.env.SH_DEBUG_FETCH ??
  process.env.OAS_DEBUG ??
  process.env.DEBUG
);
const DEBUG = DEBUG_LEVEL > 0;
const LEAKY = DEBUG_LEVEL >= 2; // print full token when 2

function redact(s) {
  if (!s || LEAKY) return s;
  const n = String(s).length;
  if (n <= 6) return s[0] + '…' + s.slice(-1);
  return s.slice(0, 4) + '…' + s.slice(-2);
}

function logConfig() {
  if (!DEBUG) return;
  console.log('⚙️  config:', {
    SH_BASE_URL,
    SH_OWNER,
    SH_API,
    SH_RESOLVED,
    SH_FLATTEN,
    SH_AUTH_HEADER,
    SH_API_KEY: redact(SH_API_KEY),
    DEBUG_LEVEL,
  });
}
// --------------------------------------------------------------------------

function normalizeVersion(v) {
  if (!v) return v;
  v = String(v).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function logReq(method, path, headers) {
  if (!DEBUG) return;
  console.log(`➡️  ${method} ${SH_BASE_URL}${path}`);
  const shown = Object.fromEntries(
    Object.entries(headers).map(([k, v]) =>
      k.toLowerCase() === SH_AUTH_HEADER.toLowerCase() ? [k, redact(v)] : [k, v]
    )
  );
  console.log('    headers:', shown);
}

async function doFetch(path, { method = 'GET', headers = {}, body } = {}) {
  const h = { [SH_AUTH_HEADER]: SH_API_KEY, ...headers };
  logReq(method, path, h);
  const res = await fetch(`${SH_BASE_URL}${path}`, { method, headers: h, body });

  if (DEBUG) {
    console.log(`⬅️  HTTP ${res.status}`);
    console.log('    content-type:', res.headers.get('content-type') || '(none)');
    try {
      const preview = await res.clone().text();
      if (preview) console.log('    body-preview:', preview.slice(0, 800));
    } catch {}
  }
  return res;
}

function curlHint(path) {
  const token = LEAKY ? SH_API_KEY : redact(SH_API_KEY);
  return `curl -sS -H "${SH_AUTH_HEADER}: ${token}" "${SH_BASE_URL}${path}"`;
}

try {
  if (!SH_OWNER || !SH_API || !SH_API_KEY) {
    throw new Error('Missing SH_OWNER, SH_API, or SH_API_KEY in .env');
  }

  logConfig();

  const owner = encodeURIComponent(SH_OWNER);
  const api = encodeURIComponent(SH_API);

  // 1) default version
  const defaultPath = `/apis/${owner}/${api}/settings/default`;
  const defRes = await doFetch(defaultPath);
  if (!defRes.ok) {
    console.error('\n❌ Failed to get default version.');
    console.error('Try manually:\n ', curlHint(defaultPath));
    process.exit(1);
  }
  let versionRaw = await defRes.text();
  let version;
  try {
    const parsed = JSON.parse(versionRaw);
    if (typeof parsed === 'string') version = parsed;
    else if (parsed && typeof parsed.version === 'string') version = parsed.version;
    else if (parsed && typeof parsed.default === 'string') version = parsed.default;
    else if (parsed && typeof parsed.defaultVersion === 'string') version = parsed.defaultVersion;
    else if (parsed && typeof parsed.value === 'string') version = parsed.value;
  } catch {
    version = versionRaw;
  }
  version = normalizeVersion(version);
  if (!version) throw new Error('Empty default version from SwaggerHub');

  // 2) download YAML of that version
  const yamlPath =
    `/apis/${owner}/${api}/${encodeURIComponent(version)}` +
    `/swagger.yaml?resolved=${SH_RESOLVED}&flatten=${SH_FLATTEN}`;
  const getRes = await doFetch(yamlPath);
  if (!getRes.ok) {
    console.error('\n❌ Failed to download OAS.');
    console.error('Check owner/API name casing, visibility, and header type.');
    console.error('Try manually:\n ', curlHint(yamlPath));
    process.exit(1);
  }
  const yaml = await getRes.text();

  // 3) write file
  await fs.writeFile('openapi.yaml', yaml, 'utf8');
  console.log(`\n✅ Wrote openapi.yaml for ${SH_OWNER}/${SH_API}@${version}`);
} catch (err) {
  console.error('❌ fetch:oas failed:', err.message);
  process.exit(1);
}
