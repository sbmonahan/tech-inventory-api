#!/usr/bin/env node
import assert from 'assert';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  return res;
}

async function json(res) {
  const t = await res.text();
  try { return JSON.parse(t); } catch { return t; }
}

async function run() {
  console.log('Regression test: resetting DB');
  let r = await req('POST', '/reset');
  assert.strictEqual(r.status, 204, 'POST /reset should return 204');

  console.log('Regression test: listing items');
  r = await req('GET', '/items?limit=1000&offset=0');
  assert.strictEqual(r.status, 200, 'GET /items 200');
  const list = await json(r);
  assert.ok(Array.isArray(list.items), 'items should be array');

  console.log('Regression test: creating an item');
  const uniqueName = `contract-item-${Date.now()}`;
  const createBody = { name: uniqueName, type: 'accessory', price: 1.23, inStock: true };
  r = await req('POST', '/items', createBody);
  assert.strictEqual(r.status, 201, 'POST /items should create');
  const created = await json(r);
  assert.ok(Number.isInteger(created.id), 'created.id must be integer');

  const id = created.id;

  console.log('Regression test: GET /items/:id');
  r = await req('GET', `/items/${id}`);
  assert.strictEqual(r.status, 200);
  const got = await json(r);
  assert.strictEqual(got.name, uniqueName);

  console.log('Regression test: PATCH /items/:id');
  r = await req('PATCH', `/items/${id}`, { price: 2.5 });
  assert.strictEqual(r.status, 200);
  const patched = await json(r);
  assert.strictEqual(patched.price, 2.5);

  console.log('Regression test: PUT /items/:id (replace)');
  const putBody = { name: uniqueName + '-v2', type: 'accessory', price: 3.5, inStock: false };
  r = await req('PUT', `/items/${id}`, putBody);
  assert.strictEqual(r.status, 200);
  const putRes = await json(r);
  assert.strictEqual(putRes.name, putBody.name);

  console.log('Regression test: DELETE /items/:id');
  r = await req('DELETE', `/items/${id}`);
  assert.strictEqual(r.status, 204);

  console.log('Regression test: verify item deleted');
  r = await req('GET', `/items/${id}`);
  assert.strictEqual(r.status, 404);

  console.log('Regression test: invalid create should 400');
  r = await req('POST', '/items', { name: '', type: 'unknown', price: -5, inStock: 'maybe' });
  assert.strictEqual(r.status, 400);

  console.log('All regression tests passed');
}

run().then(() => process.exit(0)).catch((err) => { console.error('Test failed:', err); process.exit(2); });
