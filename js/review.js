'use strict';
const $ = selector => document.querySelector(selector);
let recordJSON = '';
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
async function loadRecord() {
  const match = /^#(0|[1-9]|1\d|2[0-5])\/(\d{10})\?(.+)$/.exec(location.hash);
  const token = match ? new URLSearchParams(match[3]).get('token') : null;
  if (!match || !token) { $('#review-status').textContent = 'This review link is incomplete or invalid.'; return; }
  const params = new URLSearchParams({ rank: match[1], id: match[2], token });
  try {
    const response = await fetch(`/api/record?${params}`, { cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (response.status === 401) throw new Error('This link is invalid, expired, or the record is not available yet. If it was just submitted, wait a moment and reload.');
    if (!response.ok) throw new Error('The review service is unavailable. Please try again later.');
    const record = await response.json();
    $('#review-level').textContent = record.levelName || 'Unknown level';
    $('#review-subtitle').textContent = `Submission #${record.id || match[2]}`;
    $('#review-player').textContent = record.player || 'Not provided';
    $('#review-rank').textContent = `#${record.rank}`;
    $('#review-speed').textContent = record.speed || 'Not provided';
    $('#review-file').textContent = record.levelFile || 'Not provided';
    $('#review-id').textContent = record.id || match[2];
    const date = new Date(record.submittedAt);
    $('#review-date').textContent = Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
    const video = setEvidence('#review-video', record.video);
    const raw = setEvidence('#review-raw', record.rawFootage);
    $('#no-evidence').hidden = video || raw;
    recordJSON = JSON.stringify({ player: record.player || '', video: record.video || '' }, null, 2);
    $('#record-json').textContent = recordJSON;
    $('#test-banner').hidden = record.isTest !== true;
    $('#review-status').hidden = true;
    $('#review-content').hidden = false;
  } catch (error) { $('#review-status').textContent = error.message || 'Unable to load this record.'; }
}
$('#copy-json').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(recordJSON); $('#copy-status').textContent = 'JSON copied to clipboard.'; }
  catch (_) { $('#copy-status').textContent = 'Could not copy automatically. Select and copy the JSON above.'; }
});
loadRecord();
