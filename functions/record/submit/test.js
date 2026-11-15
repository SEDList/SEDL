import { unusedId, randomToken, reviewURL, sendWebhook } from '../../../lib/record-utils.js';

function page(message, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SEDL system test</title></head><body style="background:#101210;color:#f2f4ed;font:16px system-ui;padding:3rem;line-height:1.6"><h1>SEDL system test</h1><p>${message}</p><a href="/" style="color:#c5ed78">Back to the list</a></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.RECORDS_KV || !env.DISCORD_WEBHOOK_URL) return page('Test service is not configured.', 503);
  try {
    const rank = '0', id = await unusedId(env.RECORDS_KV, rank), token = randomToken();
    const record = { rank, id, levelName: 'Test Level', speed: '1.5x', levelFile: '', player: 'SystemTest', video: '', rawFootage: '', isTest: true, submittedAt: new Date().toISOString(), token };
    const key = `${rank}:${id}`;
    await env.RECORDS_KV.put(key, JSON.stringify(record), { expirationTtl: 3600 });
    try { await sendWebhook(env.DISCORD_WEBHOOK_URL, record, reviewURL(request, rank, id, token)); }
    catch (error) { try { await env.RECORDS_KV.delete(key); } catch (_) {} throw error; }
    return page('Test submission sent to Discord! Click the link in your Discord channel to verify KV + token lookup.');
  } catch (error) {
    console.error('Record test failed; check bindings and webhook configuration.');
    return page('Test submission could not be sent. Check the Cloudflare bindings and logs.', 502);
  }
}
