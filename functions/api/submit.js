import { jsonResponse, unusedId, randomToken, reviewURL, sendWebhook, safeHttpURL, youtubeURL, readJSON } from '../../lib/record-utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.RECORDS_KV || !env.DISCORD_WEBHOOK_URL || !env.ASSETS) return jsonResponse({ error: 'Submission service is not configured.' }, 503);
  const originHeader = request.headers.get('Origin');
  if (originHeader && originHeader !== new URL(request.url).origin) return jsonResponse({ error: 'Invalid request origin.' }, 403);
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return jsonResponse({ error: 'Expected JSON.' }, 415);

  let input;
  try { input = await readJSON(request); } catch (_) { return jsonResponse({ error: 'Invalid submission body.' }, 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return jsonResponse({ error: 'Invalid submission.' }, 400);
  const rank = String(input.rank ?? '');
  const player = typeof input.player === 'string' ? input.player.trim() : '';
  const video = youtubeURL(input.video);
  const rawInput = typeof input.rawFootage === 'string' ? input.rawFootage.trim() : '';
  const rawFootage = rawInput ? safeHttpURL(rawInput) : '';
  if (!/^(?:[1-9]|1\d|2[0-5])$/.test(rank) || !player || player.length > 64 || /[\x00-\x1f\x7f]/.test(player) || !video || (rawInput && !rawFootage)) {
    return jsonResponse({ error: 'Enter a valid level, player name, YouTube video, and optional raw footage URL.' }, 400);
  }

  try {
    // Derive level details from the deployed list, never from client-supplied labels.
    const manifestResponse = await env.ASSETS.fetch(new URL('/data/_list.json', request.url));
    if (!manifestResponse.ok) throw new Error('Manifest unavailable');
    const manifest = await manifestResponse.json();
    const filename = Array.isArray(manifest) ? manifest[Number(rank) - 1] : null;
    if (typeof filename !== 'string' || !/^[\w-]+(?:\.json)?$/i.test(filename)) return jsonResponse({ error: 'This level is no longer on the list. Reload and try again.' }, 400);
    const jsonFilename = /\.json$/i.test(filename) ? filename : `${filename}.json`;
    if (input.levelFile !== jsonFilename) return jsonResponse({ error: 'The list has changed. Reload and choose the level again.' }, 409);
    let levelResponse = await env.ASSETS.fetch(new URL(`/data/${encodeURIComponent(jsonFilename)}`, request.url));
    if (levelResponse.status === 404 || levelResponse.headers?.get('content-type')?.includes('text/html')) levelResponse = await env.ASSETS.fetch(new URL(`/data/levels/${encodeURIComponent(jsonFilename)}`, request.url));
    if (!levelResponse.ok) throw new Error('Level unavailable');
    const level = await levelResponse.json();
    if (typeof level.name !== 'string' || !level.name || typeof level.speed !== 'string' || !level.speed) throw new Error('Invalid level data');

    const id = await unusedId(env.RECORDS_KV, rank);
    const token = randomToken();
    const record = { rank, id, levelName: level.name, speed: level.speed, levelFile: jsonFilename, levelSlug: jsonFilename.replace(/\.json$/i, ''), player, video, rawFootage, isTest: false, status: 'pending', submittedAt: new Date().toISOString(), token };
    const key = `${rank}:${id}`;
    await env.RECORDS_KV.put(key, JSON.stringify(record));
    try { await sendWebhook(env.DISCORD_WEBHOOK_URL, record, reviewURL(request, rank, id, token)); }
    catch (error) { try { await env.RECORDS_KV.delete(key); } catch (_) {} throw error; }
    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Record submission failed; check bindings, assets, and webhook configuration.');
    return jsonResponse({ error: 'Unable to submit your record right now. Please try again later.' }, 502);
  }
}
