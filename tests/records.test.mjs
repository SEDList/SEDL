import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestPost } from '../functions/api/submit.js';
import { onRequestGet as lookup } from '../functions/api/record.js';
import { onRequestGet as runTest } from '../functions/record/submit/test.js';

function environment() {
  const values = new Map(), options = new Map();
  const kv = {
    async get(key, type) { const value = values.get(key); return value === undefined ? null : type === 'json' ? JSON.parse(value) : value; },
    async put(key, value, opts) { values.set(key, value); options.set(key, opts); },
    async delete(key) { values.delete(key); }
  };
  const assets = { async fetch(url) { try { return new Response(await readFile(new URL(url).pathname.slice(1))); } catch (_) { return new Response('Not found', { status: 404 }); } } };
  return { env: { RECORDS_KV: kv, ASSETS: assets, DISCORD_WEBHOOK_URL: 'https://discord.example/webhook' }, values, options };
}
function request(body, headers = {}) { return new Request('https://sedl.example/api/submit', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://sedl.example', ...headers }, body: JSON.stringify(body) }); }
const valid = { rank: 1, levelFile: 'trueffet.json', levelName: 'fake label', speed: '99x', player: 'A Player', video: 'https://youtu.be/khoORHh2M68', rawFootage: 'https://example.com/raw' };
function getReviewLink(payload) { return /\]\((https:\/\/[^)]+)\)/.exec(payload.embeds[0].fields.find(field => field.name === 'Private staff review').value)[1]; }
function reviewParts(link) { const [, rank, id, query] = /#(\d+)\/(\d{10})\?(.+)$/.exec(link); return { rank, id, token: new URLSearchParams(query).get('token') }; }
function lookupRequest(parts) { return new Request(`https://sedl.example/api/record?${new URLSearchParams(parts)}`); }

test('real submission stores server-validated data and sends only a private review link to Discord', async () => {
  const { env, values } = environment(); let payload;
  const original = globalThis.fetch; globalThis.fetch = async (_, init) => { payload = JSON.parse(init.body); return new Response(null, { status: 204 }); };
  try {
    const response = await onRequestPost({ request: request(valid), env });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    const parts = reviewParts(getReviewLink(payload));
    assert.equal(parts.rank, '1'); assert.match(parts.id, /^[1-9]\d{9}$/); assert.match(parts.token, /^[A-Za-z0-9_~!@$*\-]{20}$/);
    const stored = JSON.parse(values.get(`1:${parts.id}`));
    assert.equal(stored.levelName, 'Trueffet'); assert.equal(stored.speed, '1.3x'); assert.equal(stored.token, parts.token);
    const ok = await lookup({ request: lookupRequest(parts), env }); const record = await ok.json();
    assert.equal(ok.status, 200); assert.equal(record.player, 'A Player'); assert(!('token' in record));
    const bad = await lookup({ request: lookupRequest({ ...parts, token: 'a'.repeat(20) }), env }); assert.equal(bad.status, 401);
    const missing = await lookup({ request: lookupRequest({ ...parts, id: '9999999999' }), env }); assert.equal(missing.status, 401);
  } finally { globalThis.fetch = original; }
});

test('rejects invalid inputs and a stale list without sending a webhook', async () => {
  const { env, values } = environment();
  for (const body of [{ ...valid, video: 'https://evil.test/watch?v=khoORHh2M68' }, { ...valid, rawFootage: 'javascript:alert(1)' }, { ...valid, player: '' }, { ...valid, rank: 0 }]) {
    assert.equal((await onRequestPost({ request: request(body), env })).status, 400);
  }
  assert.equal((await onRequestPost({ request: request({ ...valid, levelFile: 'cobwebs.json' }), env })).status, 409);
  assert.equal((await onRequestPost({ request: request(valid, { origin: 'https://evil.test' }), env })).status, 403);
  assert.equal(values.size, 0);
});

test('system test uses a one-hour TTL and authorized lookup, without exposing a link publicly', async () => {
  const { env, values, options } = environment(); let payload;
  const original = globalThis.fetch; globalThis.fetch = async (_, init) => { payload = JSON.parse(init.body); return new Response(null, { status: 204 }); };
  try {
    const response = await runTest({ request: new Request('https://preview.sedl.example/record/submit/test/'), env });
    const body = await response.text(); assert.equal(response.status, 200); assert(body.includes('Test submission sent to Discord!'));
    const link = getReviewLink(payload), parts = reviewParts(link); assert(link.startsWith('https://preview.sedl.example/record/#0/')); assert(!body.includes(parts.token));
    assert.equal(options.get(`0:${parts.id}`).expirationTtl, 3600); assert(values.has(`0:${parts.id}`));
    const result = await (await lookup({ request: lookupRequest(parts), env })).json(); assert.equal(result.isTest, true); assert.equal(result.player, 'SystemTest'); assert(!('token' in result));
  } finally { globalThis.fetch = original; }
});

test('webhook failure does not report success and removes the saved record', async () => {
  const { env, values } = environment(); const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 500 });
  try {
    const response = await onRequestPost({ request: request(valid), env });
    assert.equal(response.status, 502); assert.equal(values.size, 0); assert(!JSON.stringify(await response.json()).includes('token'));
    const testResponse = await runTest({ request: new Request('https://sedl.example/record/submit/test/'), env });
    assert.equal(testResponse.status, 502); assert.equal(values.size, 0);
  } finally { globalThis.fetch = original; }
});
