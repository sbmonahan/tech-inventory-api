#!/usr/bin/env node
import process from 'process';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const CANDIDATES = [
  { name: 'Demo Laptop', type: 'laptop', price: 999.0, in_stock: true, tags: ['demo','laptop'] },
  { name: 'Demo Phone', type: 'phone', price: 499.0, in_stock: true, tags: ['demo','phone'] },
  { name: 'Demo Cable', type: 'accessory', price: 9.99, in_stock: true, tags: ['demo','cable'] },
  { name: 'Demo Component', type: 'component', price: 29.99, in_stock: false, tags: ['demo','component'] },
  { name: 'Demo Service', type: 'service', price: 199.0, in_stock: true, tags: ['demo','service'] },
];

async function main() {
  try {
    const res = await fetch(`${BASE}/items?limit=1000&offset=0`);
    if (!res.ok) throw new Error(`GET /items failed: ${res.status}`);
    const body = await res.json();
    const items = body.items || [];

    // Use name+type as a dedupe key
    const existingKeys = new Set(items.map((i) => `${i.name}::${i.type}`));

    let created = 0;
    for (const cand of CANDIDATES) {
      const key = `${cand.name}::${cand.type}`;
      if (existingKeys.has(key)) {
        console.log(`Skipping existing: ${cand.name}`);
        continue;
      }
      const r = await fetch(`${BASE}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cand) });
      if (!r.ok) {
        console.error(`Failed to create ${cand.name}: ${r.status} ${r.statusText}`);
        continue;
      }
      const createdBody = await r.json();
      console.log(`Created: ${createdBody.id} ${createdBody.name}`);
      created++;
    }

    console.log(`Done: created ${created} items (skipped ${CANDIDATES.length - created})`);
    return 0;
  } catch (err) {
    console.error('add-items failed:', err);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('add-items.js')) {
  main().then((code) => process.exit(code));
}
