'use strict';

// The manifest order is the source of truth for rank. Score each completion once.
const state = { levels: [], selected: null, players: [] };
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const pointsForRank = rank => Math.round(1000 * Math.exp(-0.05 * (rank - 1)) * 100) / 100;
const formatPoints = points => points.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rankLabel = rank => `#${String(rank).padStart(2, '0')}`;

function safeURL(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; }
}
function youtubeId(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      id = url.searchParams.get('v') || (/^\/(?:embed|shorts)\/([^/]+)/.exec(url.pathname) || [])[1] || '';
    }
    return /^[\w-]{11}$/.test(id) ? id : '';
  } catch (_) { return ''; }
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2400);
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = $('#theme-toggle');
  button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  try { localStorage.setItem('sedl-theme', theme); } catch (_) { /* The site still works when storage is unavailable. */ }
}
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function navigate() {
  const tab = location.hash.slice(1).toLowerCase();
  const current = ['list', 'leaderboard', 'rules'].includes(tab) ? tab : 'list';
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== `view-${current}`; });
  document.querySelectorAll('.nav-link').forEach(link => {
    const active = link.dataset.tab === current; link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', navigate); navigate();

function buildLeaderboard() {
  const players = new Map();
  state.levels.forEach(level => {
    const seen = new Set();
    [level.verifier, ...level.records.map(record => record.player)].forEach(name => {
      name = String(name || '').trim();
      const key = name.toLocaleLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (!players.has(key)) players.set(key, { name, completions: [], points: 0 });
      const player = players.get(key);
      player.completions.push(level);
      player.points += pointsForRank(level.rank);
    });
  });
  state.players = [...players.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}
function renderLeaderboard() {
  $('#player-count').textContent = String(state.players.length).padStart(2, '0');
  $('#leaderboard-body').innerHTML = state.players.length ? state.players.map((player, index) => `<tr data-player="${index}" tabindex="0" role="button" aria-label="View ${escapeHTML(player.name)}'s completions"><td>${rankLabel(index + 1)}</td><td>${escapeHTML(player.name)}</td><td>${player.completions.length}</td><td>${formatPoints(player.points)} <span class="detail-label">PTS</span></td><td>↗</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No player completions yet.</td></tr>';
}
function openPlayer(index) {
  const player = state.players[index]; if (!player) return;
  $('#dialog-title').textContent = player.name;
  $('#dialog-summary').textContent = `${player.completions.length} completed ${player.completions.length === 1 ? 'level' : 'levels'} · ${formatPoints(player.points)} points`;
  $('#player-completions').innerHTML = player.completions.map(level => `<div class="completion-row"><span class="detail-rank">${rankLabel(level.rank)}</span><span class="completion-name">${escapeHTML(level.name)} <span class="speed-badge">${escapeHTML(level.speed)}</span></span><span class="completion-points">${formatPoints(pointsForRank(level.rank))} PTS</span></div>`).join('');
  $('#player-dialog').showModal();
}
$('#leaderboard-body').addEventListener('click', event => { const row = event.target.closest('[data-player]'); if (row) openPlayer(Number(row.dataset.player)); });
$('#leaderboard-body').addEventListener('keydown', event => { const row = event.target.closest('[data-player]'); if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openPlayer(Number(row.dataset.player)); } });
$('#close-dialog').addEventListener('click', () => $('#player-dialog').close());
$('#player-dialog').addEventListener('click', event => { if (event.target === $('#player-dialog')) $('#player-dialog').close(); });

function filteredLevels() {
  const query = $('#search').value.trim().toLocaleLowerCase();
  return state.levels.filter(level => [level.name, level.creator, level.verifier].some(value => String(value).toLocaleLowerCase().includes(query)));
}
function renderList() {
  const filtered = filteredLevels();
  $('#sidebar-count').textContent = filtered.length;
  $('#level-list').innerHTML = filtered.length ? filtered.map(level => `<button type="button" class="level-item ${state.selected === level.rank ? 'active' : ''}" data-rank="${level.rank}" ${state.selected === level.rank ? 'aria-current="true"' : ''}><span class="level-rank">${rankLabel(level.rank)}</span><span class="level-info"><span class="level-name">${escapeHTML(level.name)} <span class="speed-badge">${escapeHTML(level.speed)}</span></span><span class="level-creator">by ${escapeHTML(level.creator)}</span></span><span class="level-arrow">↗</span></button>`).join('') : `<div class="empty-state">${state.levels.length ? 'No levels match your search.' : 'No levels have been added yet.'}</div>`;
  if (!filtered.some(level => level.rank === state.selected)) state.selected = filtered.length ? filtered[0].rank : null;
  // Update selection after filtering without rebuilding the list again.
  document.querySelectorAll('.level-item').forEach(item => { const active = Number(item.dataset.rank) === state.selected; item.classList.toggle('active', active); if (active) item.setAttribute('aria-current', 'true'); else item.removeAttribute('aria-current'); });
  renderDetail();
}
function renderDetail() {
  const level = state.levels.find(item => item.rank === state.selected);
  if (!level) { $('#level-detail').innerHTML = '<div class="empty-state empty-detail">Select a level to see its details.</div>'; return; }
  const id = youtubeId(level.youtube);
  const video = id ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${escapeHTML(level.name)} verification video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>` : '<div class="video-placeholder"><div class="video-emblem">SEDL / PLAY</div><span class="video-label">VERIFICATION VIDEO NOT PROVIDED</span><span class="video-corner">// AWAITING FOOTAGE</span></div>';
  const records = [{ player: level.verifier, video: level.youtube, verifier: true }, ...level.records.filter(record => String(record.player).toLocaleLowerCase() !== level.verifier.toLocaleLowerCase())];
  const recordRows = records.filter(record => record.player).map(record => { const link = safeURL(record.video) || (youtubeId(record.video) ? `https://www.youtube.com/watch?v=${youtubeId(record.video)}` : ''); return `<tr><td>${escapeHTML(record.player)}</td><td>${record.verifier ? 'Verifier' : '100%'}</td><td>${link ? `<a class="record-link" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">Watch ↗</a>` : '<span class="detail-label">—</span>'}</td></tr>`; }).join('');
  $('#level-detail').innerHTML = `<div class="detail-head"><div><div class="detail-rank">${rankLabel(level.rank)} / THE LIST</div><h3 class="detail-title">${escapeHTML(level.name)} <span class="speed-badge">${escapeHTML(level.speed)}</span></h3><div class="detail-subtitle">An extreme challenge at a different pace.</div></div><div class="points-box"><span class="detail-label">POINTS AWARDED</span><strong>${formatPoints(pointsForRank(level.rank))}</strong><span class="detail-label">POINTS</span></div></div><div class="detail-body"><div class="video-wrap">${video}</div><div class="details-grid"><div class="detail-stat"><span class="detail-label">CREATOR</span><span class="detail-value">${escapeHTML(level.creator)}</span></div><div class="detail-stat"><span class="detail-label">VERIFIER</span><span class="detail-value">${escapeHTML(level.verifier)}</span></div><div class="detail-stat"><span class="detail-label">LEVEL ID</span><span class="detail-value">${escapeHTML(level.levelId || 'Not provided')} ${level.levelId ? '<button class="copy-button" type="button" aria-label="Copy level ID">⧉ Copy</button>' : ''}</span></div></div><div class="records-header"><h3>Verified records<span class="accent-period">.</span></h3><span>${String(records.filter(r => r.player).length).padStart(2, '0')} COMPLETIONS</span></div><div class="table-scroll"><table class="records-table"><thead><tr><th>PLAYER</th><th>PROGRESS</th><th>FOOTAGE</th></tr></thead><tbody>${recordRows || '<tr><td colspan="3">No records yet.</td></tr>'}</tbody></table></div></div>`;
}
$('#level-list').addEventListener('click', event => { const button = event.target.closest('[data-rank]'); if (!button) return; state.selected = Number(button.dataset.rank); renderList(); });
$('#search').addEventListener('input', renderList);
document.addEventListener('keydown', event => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !$('#view-list').hidden && !$('#player-dialog').open) { event.preventDefault(); $('#search').focus(); } });
$('#level-detail').addEventListener('click', async event => {
  if (!event.target.closest('.copy-button')) return;
  const level = state.levels.find(item => item.rank === state.selected); if (!level) return;
  try { await navigator.clipboard.writeText(String(level.levelId)); showToast('Level ID copied to clipboard'); }
  catch (_) { showToast('Could not copy. Please copy the ID manually.'); }
});

async function loadLevels() {
  try {
    const response = await fetch('data/_list.json');
    if (!response.ok) throw new Error(`Manifest returned ${response.status}`);
    const manifest = await response.json();
    if (!Array.isArray(manifest)) throw new Error('Manifest must be an array');
    const results = await Promise.all(manifest.map(async (filename, index) => {
      // Accept filenames only, not paths or URLs.
      if (typeof filename !== 'string' || !/^[\w.-]+\.json$/i.test(filename) || filename.startsWith('.')) throw new Error(`Invalid filename at rank ${index + 1}`);
      const levelResponse = await fetch(`data/levels/${encodeURIComponent(filename)}`);
      if (!levelResponse.ok) throw new Error(`${filename} returned ${levelResponse.status}`);
      const level = await levelResponse.json();
      if (!level || typeof level !== 'object' || Array.isArray(level) || !level.name) throw new Error(`${filename} has no level name`);
      return { rank: index + 1, name: String(level.name), speed: String(level.speed || 'Speed TBD'), creator: String(level.creator || 'Unknown'), verifier: String(level.verifier || ''), levelId: String(level.levelId || ''), youtube: String(level.youtube || ''), demo: level.demo === true, records: Array.isArray(level.records) ? level.records.filter(record => record && typeof record === 'object' && record.player).map(record => ({ player: String(record.player), video: String(record.video || '') })) : [] };
    }));
    state.levels = results; state.selected = results[0]?.rank || null;
    $('#demo-notice').hidden = !results.some(level => level.demo);
    $('#level-count').textContent = String(results.length).padStart(2, '0');
    buildLeaderboard(); renderLeaderboard(); renderList();
  } catch (error) {
    console.error('Unable to load list:', error);
    $('#demo-notice').hidden = true;
    $('#level-list').innerHTML = '<div class="empty-state">Could not load the list. Check the data files and try again.</div>';
    $('#level-detail').innerHTML = '<div class="empty-state empty-detail">List data unavailable.</div>';
    $('#leaderboard-body').innerHTML = '<tr><td colspan="5" class="empty-state">Could not load leaderboard data.</td></tr>';
  }
}
loadLevels();
