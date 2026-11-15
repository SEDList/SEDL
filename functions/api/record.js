import { jsonResponse } from '../../lib/record-utils.js';

export async function onRequestGet({ request, env }) {
  if (!env.RECORDS_KV) return jsonResponse({ error: 'Review service is not configured.' }, 503);
  const params = new URL(request.url).searchParams;
  const rank = params.get('rank') || '', id = params.get('id') || '', token = params.get('token') || '';
  if (!/^(?:0|[1-9]|1\d|2[0-5])$/.test(rank) || !/^[0-9]{10}$/.test(id) || !/^[A-Za-z0-9_~!@$*\-]{20}$/.test(token)) return jsonResponse({ error: 'Unauthorized.' }, 401);
  try {
    const record = await env.RECORDS_KV.get(`${rank}:${id}`, 'json');
    // Check all characters to avoid short-circuiting on a partial token match.
    const stored = typeof record?.token === 'string' ? record.token : '';
    let difference = stored.length ^ token.length;
    for (let i = 0; i < token.length; i++) difference |= token.charCodeAt(i) ^ (stored.charCodeAt(i) || 0);
    if (!record || difference !== 0) return jsonResponse({ error: 'Unauthorized.' }, 401);
    const { token: _secret, ...publicRecord } = record;
    return jsonResponse(publicRecord);
  } catch (error) {
    console.error('Record lookup failed; check the KV binding.');
    return jsonResponse({ error: 'Unable to load record.' }, 503);
  }
}
