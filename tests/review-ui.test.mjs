import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../js/review.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function review({ verifier = 'Someone else', records = [], fallback = false, clipboardFails = false, notificationSent = true, rank = '1' } = {}) {
  const elements = new Map(), requests = [], timers = [];
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      textContent: '', value: '', hidden: true, disabled: false, dataset: {},
      classList: { add() {}, remove() {} },
      addEventListener(type, fn) { this[`on${type}`] = fn; }, setAttribute() {}
    });
    return elements.get(selector);
  }
  const token = '12345678901234567890';
  const document = { querySelector: element, documentElement: { dataset: { theme: 'dark' } } };
  const location = { hash: `#${rank}/1234567890?token=${token}`, pathname: '/record/', search: '' };
  let copied, replacement;
  const context = {
    document, location, history: { replaceState(_state, _unused, path) { replacement = path; } },
    navigator: { clipboard: { writeText(text) { copied = text; return clipboardFails ? Promise.reject(Error('denied')) : Promise.resolve(); } } },
    localStorage: { setItem() {} }, URL, URLSearchParams, Date,
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).startsWith('/api/record?')) return { ok: true, json: async () => ({ rank, id: '1234567890', levelName: 'Trueffet', levelFile: 'trueffet.json', levelSlug: 'trueffet', speed: '1.3x', player: 'Player', video: 'https://youtu.be/khoORHh2M68' }) };
      if (String(url) === '/api/record') return { ok: true, json: async () => ({ success: true, notificationSent }) };
      if (String(url).startsWith('https://raw.')) {
        if (fallback && !String(url).includes('/data/levels/')) return { ok: false, status: 404 };
        return { ok: true, json: async () => ({ name: 'Trueffet', verifier, records }) };
      }
      throw Error(`Unexpected request: ${url}`);
    },
    console
  };
  vm.runInNewContext(script, context);
  for (let i = 0; i < 4; i++) await flush();
  return { element, requests, timers, token, getCopied: () => copied, getReplacement: () => replacement };
}

test('review uses token header, merges full JSON, and copies on acceptance', async () => {
  const r = await review();
  const lookup = r.requests.find(item => item.url.startsWith('/api/record?'));
  assert(!lookup.url.includes(r.token)); assert.equal(lookup.options.headers['X-Review-Token'], r.token);
  assert.deepEqual(JSON.parse(r.element('#record-json').textContent).records, [{ player: 'Player', video: 'https://youtu.be/khoORHh2M68' }]);
  assert.equal(r.element('#accept-record').disabled, false);
  await r.element('#accept-record').onclick();
  assert.equal(r.getCopied(), r.element('#record-json').textContent);
  assert.match(r.element('#decision-status').textContent, /Accepted & Full JSON Copied!/);
  assert.equal(r.element('#accept-record').disabled, true); assert.equal(r.element('#reject-record').disabled, true);
  assert.equal(r.getReplacement(), '/record/');
});

test('verifier and existing record are not duplicated', async () => {
  for (const options of [{ verifier: ' PLAYER ' }, { records: [{ player: 'player', video: 'existing' }] }]) {
    const r = await review(options);
    assert.equal(JSON.parse(r.element('#record-json').textContent).records.length, options.records ? 1 : 0);
    assert.match(r.element('#json-status').textContent, /already/);
  }
});

test('fallback folder, stale previews, and notification/clipboard failures are handled', async () => {
  const r = await review({ fallback: true, clipboardFails: true, notificationSent: false });
  assert.match(r.element('#edit-github').href, /\/data\/levels\/trueffet\.json$/);
  r.timers.at(-1)();
  assert.equal(r.element('#accept-record').disabled, true); assert.equal(r.element('#copy-json').disabled, true);
  assert.match(r.element('#json-status').textContent, /Refresh/);
  await r.element('#refresh-json').onclick();
  await r.element('#accept-record').onclick();
  assert.match(r.element('#decision-status').textContent, /clipboard copy failed/);
  assert.match(r.element('#decision-status').textContent, /Discord notification failed/);
});

 test('review links support ranks beyond 25', async () => {
  const r = await review({ rank: '101' });
  assert.equal(r.element('#review-rank').textContent, '#101');
  assert.equal(r.element('#accept-record').disabled, false);
  assert.match(r.requests.find(item => item.url.startsWith('/api/record?')).url, /rank=101/);
});
