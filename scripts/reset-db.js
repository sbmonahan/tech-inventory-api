#!/usr/bin/env node
import process from 'process';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  try {
    const r = await fetch(`${BASE}/reset`, { method: 'POST' });
    if (r.status === 204) {
      console.log('Database reset via API (204).');
      return 0;
    }
    console.error(`Unexpected response: ${r.status} ${r.statusText}`);
    const txt = await r.text();
    console.error(txt);
    return 2;
  } catch (e) {
    console.error('reset-db failed:', e);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('reset-db.js')) {
  main().then((code) => process.exit(code));
}
