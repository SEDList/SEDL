import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestPost } from '../functions/api/submit.js';
import { onRequestGet as lookup, onRequestPost as decide } from '../functions/api/record.js';

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
    const headerRequest = new Request(`https://sedl.example/api/record?${new URLSearchParams({ rank: parts.rank, id: parts.id })}`, { headers: { 'X-Review-Token': parts.token } });
    assert.equal((await lookup({ request: headerRequest, env })).status, 200);
    const conflicting = new Request(lookupRequest(parts), { headers: { 'X-Review-Token': 'x'.repeat(20) } });
    assert.equal((await lookup({ request: conflicting, env })).status, 401);
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

test('webhook failure does not report success and removes the saved record', async () => {
  const { env, values } = environment(); const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 500 });
  try {
    const response = await onRequestPost({ request: request(valid), env });
    assert.equal(response.status, 502); assert.equal(values.size, 0); assert(!JSON.stringify(await response.json()).includes('token'));
  } finally { globalThis.fetch = original; }
});

function decisionRequest(body) {
  return new Request('https://sedl.example/api/record', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://sedl.example' }, body: JSON.stringify(body) });
}
function seed(env, values, overrides = {}) {
  const record = { rank: '1', id: '1234567890', levelName: 'Trueffet', levelFile: 'trueffet.json', player: 'Player', video: 'https://youtu.be/khoORHh2M68', token: '12345678901234567890', ...overrides };
  values.set(`${record.rank}:${record.id}`, JSON.stringify(record));
  return { rank: record.rank, id: record.id, token: record.token };
}

test('accept derives slug for legacy records, removes token and posts green notification', async () => {
  const { env, values } = environment(); const parts = seed(env, values); let payload;
  const original = globalThis.fetch; globalThis.fetch = async (_, init) => { payload = JSON.parse(init.body); return new Response(null, { status: 204 }); };
  try {
    const before = await (await lookup({ request: lookupRequest(parts), env })).json(); assert.equal(before.levelSlug, 'trueffet'); assert(!('token' in before));
    const response = await decide({ request: decisionRequest({ ...parts, action: 'accept' }), env });
    assert.deepEqual(await response.json(), { success: true, status: 'accepted', notificationSent: true });
    const updated = JSON.parse(values.get('1:1234567890')); assert.equal(updated.status, 'accepted'); assert(!('token' in updated));
    assert.equal(payload.embeds[0].color, 0x43b581); assert.match(payload.embeds[0].description, /Record Accepted: #1 Trueffet by Player/);
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal((await lookup({ request: lookupRequest(parts), env })).status, 401);
    assert.equal((await decide({ request: decisionRequest({ ...parts, action: 'accept' }), env })).status, 401);
  } finally { globalThis.fetch = original; }
});

test('reject saves reason, removes token and posts red notification', async () => {
  const { env, values } = environment(); const parts = seed(env, values); let payload;
  const original = globalThis.fetch; globalThis.fetch = async (_, init) => { payload = JSON.parse(init.body); return new Response(null, { status: 204 }); };
  try {
    const response = await decide({ request: decisionRequest({ ...parts, action: 'reject', reason: 'Incomplete footage' }), env });
    assert.equal(response.status, 200);
    const updated = JSON.parse(values.get('1:1234567890')); assert.equal(updated.status, 'rejected'); assert.equal(updated.reason, 'Incomplete footage'); assert(!('token' in updated));
    assert.equal(payload.embeds[0].color, 0xe05252); assert.match(payload.embeds[0].description, /Reason: Incomplete footage/);
  } finally { globalThis.fetch = original; }
});

test('invalid or stale credentials cannot change records; bad actions do not consume tokens', async () => {
  const { env, values } = environment(); const parts = seed(env, values);
  assert.equal((await decide({ request: decisionRequest({ ...parts, token: 'x'.repeat(20), action: 'accept' }), env })).status, 401);
  assert.equal((await decide({ request: decisionRequest({ ...parts, action: 'other' }), env })).status, 400);
  assert.equal((await decide({ request: decisionRequest({ ...parts, action: 'reject', reason: 'x'.repeat(501) }), env })).status, 400);
  assert.equal(JSON.parse(values.get('1:1234567890')).token, parts.token);
});

test('webhook failure reports saved decision and never restores the consumed token', async () => {
  const { env, values } = environment(); const parts = seed(env, values); const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 500 });
  try {
    const result = await (await decide({ request: decisionRequest({ ...parts, action: 'accept' }), env })).json();
    assert.deepEqual(result, { success: true, status: 'accepted', notificationSent: false });
    assert.equal(JSON.parse(values.get('1:1234567890')).status, 'accepted');
    assert(!('token' in JSON.parse(values.get('1:1234567890'))));
  } finally { globalThis.fetch = original; }
});
