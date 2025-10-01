import process from 'process';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

function randInt(max) {
  return Math.floor(Math.random() * max);
}

async function main() {
  try {
    const res = await fetch(`${BASE}/items?limit=1000&offset=0`);
    if (!res.ok) throw new Error(`GET /items failed: ${res.status}`);

    const body = await res.json();
    const items = body.items || [];

    if (!items.length) {
      console.log('No items to delete.');
      return 0;
    }

    const pick = items[randInt(items.length)];
    console.log(`Deleting id=${pick.id} name=${pick.name}`);

    const r = await fetch(`${BASE}/items/${pick.id}`, { method: 'DELETE' });
    if (r.status === 204) {
      console.log('Deleted.');
      return 0;
    }

    console.error(`Delete returned ${r.status} ${r.statusText}`);
    const txt = await r.text();
    if (txt) console.error(txt);

    return 2;
  } catch (e) {
    console.error('delete-random failed:', e);
    return 2;
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith('delete-random.js')
) {
  main().then((code) => process.exit(code));
}
