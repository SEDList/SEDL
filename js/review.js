'use strict';
const $ = selector => document.querySelector(selector);
let recordJSON = '';
let credentials = null;
let submission = null;
let decisionComplete = false;
let decisionInFlight = false;
let decisionLocked = false;
const theme = $('#review-theme');
function updateThemeLabel() { theme.setAttribute('aria-label', `Switch to ${document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'} theme`); }
updateThemeLabel();
theme.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; updateThemeLabel();
  try { localStorage.setItem('sedl-theme', next); } catch (_) {}
});

function setEvidence(selector, value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    const link = $(selector); link.href = url.href; link.hidden = false; return true;
  } catch (_) { return false; }
}

async function loadFullLevelJSON() {
  const slug = submission?.levelSlug;
  recordJSON = '';
  $('#record-json').textContent = '';
  $('#copy-json').disabled = true;
  $('#refresh-json').disabled = true;
  if (!decisionComplete) $('#accept-record').disabled = true;
  if (!slug || !/^[\w-]+$/.test(slug)) {
    $('#json-status').textContent = 'No valid level filename is available for this submission. Acceptance is unavailable.';
    return;
  }
  const rawHost = ['raw', 'githubusercontent', 'com'].join('.');
  const ghHost = ['github', 'com'].join('.');
  const url = `https://${rawHost}/SEDList/SEDL/arena/873bae30-sedl/data/${slug}.json?t=${Date.now()}`;
  $('#edit-github').href = `https://${ghHost}/SEDList/SEDL/edit/arena/873bae30-sedl/data/${slug}.json`;
  $('#edit-github').hidden = false;
  $('#json-status').textContent = 'Loading the latest level file from GitHub…';
  try {
    const response = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('GitHub could not load the level file.');
    const level = await response.json();
    if (!level || typeof level !== 'object' || Array.isArray(level) || (level.records != null && !Array.isArray(level.records))) throw new Error('The level file is not in the expected format.');
    if (!Array.isArray(level.records)) level.records = [];
    const name = String(submission.player || '').trim().toLocaleLowerCase();
    const exists = level.records.some(record => typeof record?.player === 'string' && record.player.trim().toLocaleLowerCase() === name);
    if (!exists) level.records.push({ player: submission.player, video: submission.video });
    recordJSON = JSON.stringify(level, null, 2);
    $('#record-json').textContent = recordJSON;
    $('#json-status').textContent = exists ? 'This player is already listed; no duplicate was added. Verify the existing record before accepting.' : 'The submission has been added to the preview. Review it before copying.';
    $('#copy-json').disabled = false;
    if (!decisionComplete && !decisionInFlight && !decisionLocked) $('#accept-record').disabled = false;
  } catch (_) {
    $('#json-status').textContent = 'Could not load or parse the GitHub level file. Check the file and refresh before accepting.';
  } finally { $('#refresh-json').disabled = false; }
}

async function loadRecord() {
  const match = /^#(0|[1-9]|1\d|2[0-5])\/(\d{10})\?(.+)$/.exec(location.hash);
  const token = match ? new URLSearchParams(match[3]).get('token') : null;
  if (!match || !token) { $('#review-status').textContent = 'This review link is incomplete or invalid.'; return; }
  credentials = { rank: match[1], id: match[2], token };
  const params = new URLSearchParams(credentials);
  try {
    const response = await fetch(`/api/record?${params}`, { cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (response.status === 401) throw new Error('This link is invalid, already used, expired, or the record is not available yet. If it was just submitted, wait a moment and reload.');
    if (!response.ok) throw new Error('The review service is unavailable. Please try again later.');
    submission = await response.json();
    $('#review-level').textContent = submission.levelName || 'Unknown level';
    $('#review-subtitle').textContent = `Submission #${submission.id || match[2]}`;
    $('#review-player').textContent = submission.player || 'Not provided';
    $('#review-rank').textContent = `#${submission.rank}`;
    $('#review-speed').textContent = submission.speed || 'Not provided';
    $('#review-file').textContent = submission.levelFile || 'Not provided';
    $('#review-id').textContent = submission.id || match[2];
    const date = new Date(submission.submittedAt);
    $('#review-date').textContent = Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
    const video = setEvidence('#review-video', submission.video);
    const raw = setEvidence('#review-raw', submission.rawFootage);
    $('#no-evidence').hidden = video || raw;
    $('#test-banner').hidden = submission.isTest !== true;
    $('#review-status').hidden = true;
    $('#review-content').hidden = false;
    $('#reject-record').disabled = false;
    await loadFullLevelJSON();
  } catch (error) { $('#review-status').textContent = error.message || 'Unable to load this record.'; }
}

$('#refresh-json').addEventListener('click', loadFullLevelJSON);
$('#copy-json').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(recordJSON); $('#copy-status').textContent = 'Full level JSON copied to clipboard.'; }
  catch (_) { $('#copy-status').textContent = 'Could not copy automatically. Select and copy the full JSON above.'; }
});

async function decide(action) {
  if (!credentials || decisionComplete || decisionInFlight || decisionLocked || (action === 'accept' && !recordJSON)) return;
  decisionInFlight = true;
  $('#accept-record').disabled = true; $('#reject-record').disabled = true; $('#refresh-json').disabled = true;
  $('#decision-status').className = 'decision-status';
  $('#decision-status').textContent = 'Saving decision…';
  // Start the clipboard write within the click gesture before awaiting network requests.
  let copied = Promise.resolve(false);
  if (action === 'accept' && navigator.clipboard?.writeText) {
    try { copied = navigator.clipboard.writeText(recordJSON).then(() => true, () => false); } catch (_) {}
  }
  try {
    const response = await fetch('/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...credentials, action, reason: $('#reject-reason').value.trim() }) });
    const result = await response.json();
    if (!response.ok || !result.success) {
      if (response.status === 400) { $('#reject-record').disabled = false; $('#accept-record').disabled = !recordJSON; } else { decisionLocked = true; }
      throw new Error(result.error || 'Could not save the decision. Reload to check its status.');
    }
    decisionComplete = true; credentials = null;
    $('#reject-reason').disabled = true;
    $('#decision-status').classList.add('decision-success');
    const didCopy = await copied;
    const message = action === 'accept' ? (didCopy ? 'Accepted & Full JSON Copied!' : 'Accepted, but clipboard copy failed. Use Copy Full Level JSON below.') : 'Record rejected.';
    $('#decision-status').textContent = message + (result.notificationSent ? '' : ' Decision saved, but the Discord notification failed; notify staff manually.');
  } catch (error) {
    if ($('#reject-record').disabled) decisionLocked = true;
    $('#decision-status').textContent = `${error.message || 'The result is unknown.'} Reload the page to check before trying again.`;
  } finally { decisionInFlight = false; $('#refresh-json').disabled = false; }
}
$('#accept-record').addEventListener('click', () => decide('accept'));
$('#reject-record').addEventListener('click', () => decide('reject'));
loadRecord();
