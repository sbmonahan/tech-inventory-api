#!/usr/bin/env node
import process from 'process';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  try {
    const res = await fetch(`${BASE}/items?limit=1000&offset=0`);
    if (!res.ok) throw new Error(`GET /items failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    const items = Array.isArray(body.items) ? body.items : body;

    console.log('Item Report');
    console.log('============');
    console.log(`Total items: ${body.total ?? items.length}`);

    const byType = items.reduce((acc, it) => {
      acc[it.type] = (acc[it.type] || 0) + 1;
      return acc;
    }, {});
    console.log('Count by type:');
    for (const [t, c] of Object.entries(byType)) console.log(`  ${t}: ${c}`);

    const avgPrice = items.length ? (items.reduce((s, i) => s + Number(i.price || 0), 0) / items.length) : 0;
    console.log(`Average price: ${avgPrice.toFixed(2)}`);

    const outOfStock = items.filter((i) => !i.in_stock).length;
    console.log(`Out of stock: ${outOfStock}`);

    console.log('Sample items (up to 10):');
    items.slice(0, 10).forEach((i) => {
      console.log(`  ${i.id} - ${i.name} (${i.type}) $${i.price} ${i.in_stock ? '' : '(out)'} tags:${(i.tags||[]).join(',')}`);
    });

    return 0;
  } catch (err) {
    console.error('Failed to build item report:', err);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('report.js')) {
  main().then((code) => process.exit(code));
}
