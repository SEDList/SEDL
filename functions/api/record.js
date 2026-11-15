import { jsonResponse, readJSON } from '../../lib/record-utils.js';

function validCredentials(rank, id, token) {
  return /^(?:0|[1-9]|1\d|2[0-5])$/.test(rank) && /^[0-9]{10}$/.test(id) && /^[A-Za-z0-9_~!@$*\-]{20}$/.test(token);
}

async function authorizedRecord(kv, rank, id, token) {
  if (!validCredentials(rank, id, token)) return null;
  const record = await kv.get(`${rank}:${id}`, 'json');
  const stored = typeof record?.token === 'string' ? record.token : '';
  let difference = stored.length ^ token.length;
  for (let i = 0; i < token.length; i++) difference |= token.charCodeAt(i) ^ (stored.charCodeAt(i) || 0);
  return record && difference === 0 && (!record.status || record.status === 'pending') ? record : null;
}

function levelSlug(record) {
  // Older submissions store levelFile; never allow a path from KV into a GitHub URL.
  const slug = typeof record.levelSlug === 'string' ? record.levelSlug :
    typeof record.levelFile === 'string' ? record.levelFile.replace(/\.json$/i, '') : '';
  return /^[\w-]+$/.test(slug) ? slug : '';
}

export async function onRequestGet({ request, env }) {
  if (!env.RECORDS_KV) return jsonResponse({ error: 'Review service is not configured.' }, 503);
  const params = new URL(request.url).searchParams;
  // Prefer the header to keep review tokens out of request URLs; keep old links/API clients working.
  const rank = params.get('rank') || '', id = params.get('id') || '', token = request.headers.get('X-Review-Token') || params.get('token') || '';
  try {
    const record = await authorizedRecord(env.RECORDS_KV, rank, id, token);
    if (!record) return jsonResponse({ error: 'Unauthorized.' }, 401);
    const { token: _secret, ...publicRecord } = record;
    return jsonResponse({ ...publicRecord, levelSlug: levelSlug(record) });
  } catch (_) {
    console.error('Record lookup failed; check the KV binding.');
    return jsonResponse({ error: 'Unable to load record.' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.RECORDS_KV || !env.DISCORD_WEBHOOK_URL) return jsonResponse({ error: 'Review service is not configured.' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return jsonResponse({ error: 'Invalid request origin.' }, 403);
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return jsonResponse({ error: 'Expected JSON.' }, 415);
  let input;
  try { input = await readJSON(request); } catch (_) { return jsonResponse({ error: 'Invalid request body.' }, 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return jsonResponse({ error: 'Invalid request body.' }, 400);
  const rank = String(input.rank ?? ''), id = String(input.id ?? ''), token = typeof input.token === 'string' ? input.token : '';
  let record;
  try { record = await authorizedRecord(env.RECORDS_KV, rank, id, token); }
  catch (_) { return jsonResponse({ error: 'Unable to load record.' }, 503); }
  if (!record) return jsonResponse({ error: 'Unauthorized.' }, 401);
  if (!['accept', 'reject'].includes(input.action)) return jsonResponse({ error: 'Invalid action.' }, 400);
  if (input.reason != null && typeof input.reason !== 'string') return jsonResponse({ error: 'Invalid reason.' }, 400);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(reason)) return jsonResponse({ error: 'Reason must be 500 characters or fewer.' }, 400);

  const accepted = input.action === 'accept';
  const { token: _secret, ...updated } = record;
  updated.status = accepted ? 'accepted' : 'rejected';
  if (!accepted) updated.reason = reason;
  updated.reviewedAt = new Date().toISOString();
  try {
    // KV has no compare-and-swap. Concurrent reviews and cross-region stale reads
    // cannot be made strictly single-use without a strongly consistent store.
    await env.RECORDS_KV.put(`${rank}:${id}`, JSON.stringify(updated));
  } catch (_) {
    console.error('Record decision could not be saved.');
    return jsonResponse({ error: 'Could not save the decision. Reload the review page before trying again.' }, 503);
  }

  let notificationSent = false;
  try {
    const label = accepted ? 'Record Accepted' : 'Record Rejected';
    const description = `${label}: #${rank} ${record.levelName} by ${record.player}${accepted ? '' : ` — Reason: ${reason || 'Not provided'}`}`;
    const response = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [{ description, color: accepted ? 0x43b581 : 0xe05252 }] })
    });
    notificationSent = response.ok;
  } catch (_) { /* The decision is already saved; report the notification failure separately. */ }
  if (!notificationSent) console.error('Record decision saved, but Discord notification failed.');
  return jsonResponse({ success: true, status: updated.status, notificationSent });
}
