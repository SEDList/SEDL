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
      player.points = Math.round((player.points + pointsForRank(level.rank)) * 100) / 100;
    });
  });
  state.players = [...players.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}
function renderLeaderboard() {
  $('#player-count').textContent = String(state.players.length);
  const query = $('#player-search').value.trim().toLocaleLowerCase();
  const rows = state.players.map((player, index) => ({ player, index })).filter(({ player }) => player.name.toLocaleLowerCase().includes(query));
  $('#leaderboard-body').innerHTML = rows.length ? rows.map(({ player, index }) => `<tr><td><span class="standing-rank ${index < 3 ? 'top-rank' : ''}">${rankLabel(index + 1)}</span></td><td><button type="button" class="player-button" data-player="${index}" aria-label="View ${escapeHTML(player.name)}'s completions"><span class="player-avatar" aria-hidden="true">${escapeHTML([...player.name][0].toUpperCase())}</span>${escapeHTML(player.name)} <span class="player-arrow" aria-hidden="true">↗</span></button></td><td>${player.completions.length}</td><td class="standing-points">${formatPoints(player.points)} <span class="detail-label">PTS</span></td><td></td></tr>`).join('') : `<tr><td colspan="5" class="empty-state">${state.players.length ? 'No players match your search.' : 'No player completions yet.'}</td></tr>`;
}
$('#player-search').addEventListener('input', renderLeaderboard);
function openPlayer(index) {
  const player = state.players[index]; if (!player) return;
  $('#dialog-title').textContent = player.name;
  $('#dialog-summary').textContent = `${player.completions.length} completed ${player.completions.length === 1 ? 'level' : 'levels'} · ${formatPoints(player.points)} points`;
  $('#player-completions').innerHTML = player.completions.map(level => `<button class="completion-row" type="button" data-level-rank="${level.rank}" aria-label="View ${escapeHTML(level.name)} on the list"><span class="detail-rank">${rankLabel(level.rank)}</span><span class="completion-name">${escapeHTML(level.name)} <span class="speed-badge">${escapeHTML(level.speed)}</span></span><span class="completion-points">${formatPoints(pointsForRank(level.rank))} PTS</span><span aria-hidden="true">↗</span></button>`).join('');
  $('#player-dialog').showModal();
}
$('#leaderboard-body').addEventListener('click', event => { const row = event.target.closest('[data-player]'); if (row) openPlayer(Number(row.dataset.player)); });

$('#player-completions').addEventListener('click', event => { const button = event.target.closest('[data-level-rank]'); if (!button) return; state.selected = Number(button.dataset.levelRank); $('#search').value = ''; $('#player-dialog').close(); location.hash = 'list'; navigate(); renderList(); if (window.matchMedia('(max-width: 750px)').matches) $('#level-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#close-dialog').addEventListener('click', () => $('#player-dialog').close());
$('#player-dialog').addEventListener('click', event => { if (event.target === $('#player-dialog')) $('#player-dialog').close(); });

function filteredLevels() {
  const query = $('#search').value.trim().toLocaleLowerCase();
  return state.levels.filter(level => [level.name, level.creator, level.verifier].some(value => String(value).toLocaleLowerCase().includes(query)));
}
function renderList() {
  const filtered = filteredLevels();
  $('#sidebar-count').textContent = filtered.length;
  if (!filtered.some(level => level.rank === state.selected)) state.selected = filtered.length ? filtered[0].rank : null;
  $('#level-list').innerHTML = filtered.length ? filtered.map(level => {
    const video = youtubeId(level.youtube);
    const thumb = video ? `<img src="https://i.ytimg.com/vi/${video}/default.jpg" loading="lazy" alt="">` : '';
    return `<button type="button" class="level-item ${state.selected === level.rank ? 'active' : ''}" data-rank="${level.rank}" ${state.selected === level.rank ? 'aria-current="true"' : ''}><span class="level-rank">${String(level.rank).padStart(2, '0')}</span><span class="level-thumb">${thumb}</span><span class="level-info"><span class="level-name">${escapeHTML(level.name)}</span><span class="level-creator">${escapeHTML(level.creator)}</span></span><span class="list-speed">${escapeHTML(level.speed)}</span></button>`;
  }).join('') : `<div class="empty-state">${state.levels.length ? 'No levels match your search.' : 'No levels have been added yet.'}</div>`;
  renderDetail();
}
function renderDetail() {
  const level = state.levels.find(item => item.rank === state.selected);
  if (!level) { delete $('#level-detail').dataset.renderedRank; $('#level-detail').innerHTML = `<div class="empty-state empty-detail">${state.levels.length ? 'Select a level to see its details.' : 'Level details will appear here once rankings are added.'}</div>`; return; }
  if ($('#level-detail').dataset.renderedRank === String(level.rank)) return;
  $('#level-detail').dataset.renderedRank = String(level.rank);
  const id = youtubeId(level.youtube);
  const video = id ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${escapeHTML(level.name)} verification video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>` : '<div class="video-placeholder"><div class="video-emblem">SEDL / PLAY</div><span class="video-label">Verification video not provided</span><span class="video-corner">// AWAITING FOOTAGE</span></div>';
  const seenRecords = new Set();
  const records = [{ player: level.verifier, video: level.youtube, verifier: true }, ...level.records].filter(record => { const key = record.player.trim().toLocaleLowerCase(); if (!key || seenRecords.has(key)) return false; seenRecords.add(key); return true; });
  const recordRows = records.filter(record => record.player).map(record => { const link = safeURL(record.video) || (youtubeId(record.video) ? `https://www.youtube.com/watch?v=${youtubeId(record.video)}` : ''); return `<tr><td>${escapeHTML(record.player)}</td><td>${record.verifier ? 'Verifier' : '100%'}</td><td>${link ? `<a class="record-link" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">Watch ↗</a>` : '<span class="detail-label">—</span>'}</td></tr>`; }).join('');
  $('#level-detail').innerHTML = `<div class="detail-topline"><span>LEVEL OVERVIEW</span><span>THE LIST / ${String(level.rank).padStart(2, '0')}</span></div><div class="detail-head"><div class="detail-heading-group"><span class="detail-rank-large">${rankLabel(level.rank)}</span><div><div class="detail-rank">RANKED LEVEL</div><h3 class="detail-title">${escapeHTML(level.name)} <span class="speed-badge">${escapeHTML(level.speed)}</span></h3><div class="detail-subtitle">Created by ${escapeHTML(level.creator)}</div></div></div><div class="points-box"><span class="detail-label">POINTS</span><strong>${formatPoints(pointsForRank(level.rank))}</strong><span class="points-caption">for a completion</span></div></div><div class="detail-body"><div class="video-wrap">${video}</div><div class="video-caption"><span><span class="caption-dot"></span> VERIFICATION VIDEO</span>${id ? `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer">WATCH ON YOUTUBE ↗</a>` : '<span>NOT PROVIDED</span>'}</div><div class="details-grid"><div class="detail-stat"><span class="detail-label">CREATOR</span><span class="detail-value">${escapeHTML(level.creator)}</span></div><div class="detail-stat"><span class="detail-label">VERIFIER</span><span class="detail-value">${escapeHTML(level.verifier || 'Not provided')}</span></div><div class="detail-stat"><span class="detail-label">LEVEL ID</span><span class="detail-value">${escapeHTML(level.levelId || 'Not provided')} ${level.levelId ? '<button class="copy-button" type="button" aria-label="Copy level ID">⧉ Copy</button>' : ''}</span></div></div><div class="records-header"><div><span class="detail-label">THE PLAYERS</span><h3>Verified records <span class="record-count">${records.length}</span></h3></div><span>100% COMPLETIONS</span></div><div class="table-scroll"><table class="records-table"><thead><tr><th>PLAYER</th><th>PROGRESS</th><th>FOOTAGE</th></tr></thead><tbody>${recordRows || '<tr><td colspan="3">No records yet.</td></tr>'}</tbody></table></div></div>`;
}
$('#level-list').addEventListener('click', event => { const button = event.target.closest('[data-rank]'); if (!button) return; state.selected = Number(button.dataset.rank); document.querySelectorAll('.level-item').forEach(item => { const active = item === button; item.classList.toggle('active', active); if (active) item.setAttribute('aria-current', 'true'); else item.removeAttribute('aria-current'); }); renderDetail(); if (window.matchMedia('(max-width: 750px)').matches) $('#level-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
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
    const results = await Promise.all(manifest.slice(0, 25).map(async (filename, index) => {
      // Accept filenames only, not paths or URLs.
      if (typeof filename !== 'string' || !/^[\w-]+(?:\.json)?$/i.test(filename)) throw new Error(`Invalid filename at rank ${index + 1}`);
      const jsonFilename = /\.json$/i.test(filename) ? filename : `${filename}.json`;
      let levelResponse = await fetch(`data/${encodeURIComponent(jsonFilename)}`);
      // Also support the data/levels layout used by earlier versions.
      if (levelResponse.status === 404) levelResponse = await fetch(`data/levels/${encodeURIComponent(jsonFilename)}`);
      if (!levelResponse.ok) throw new Error(`${jsonFilename} returned ${levelResponse.status}`);
      const level = await levelResponse.json();
      if (!level || typeof level !== 'object' || Array.isArray(level) || !level.name) throw new Error(`${filename} has no level name`);
      return { rank: index + 1, name: String(level.name), speed: String(level.speed || 'Speed TBD'), creator: String(level.creator || 'Unknown'), verifier: String(level.verifier || ''), levelId: String(level.levelId || ''), youtube: String(level.youtube || ''), demo: level.demo === true, records: Array.isArray(level.records) ? level.records.filter(record => record && typeof record === 'object' && record.player).map(record => ({ player: String(record.player), video: String(record.video || '') })) : [] };
    }));
    state.levels = results; state.selected = results[0]?.rank || null;
    $('#demo-notice').hidden = !results.some(level => level.demo);
    $('#level-count').textContent = String(results.length);
    buildLeaderboard(); $('#overview-levels').textContent = String(results.length).padStart(2, '0'); $('#overview-players').textContent = String(state.players.length).padStart(2, '0'); renderLeaderboard(); renderList();
  } catch (error) {
    console.error('Unable to load list:', error);
    $('#demo-notice').hidden = true;
    $('#level-list').innerHTML = '<div class="empty-state">Could not load the list. Check the data files and try again.</div>';
    $('#level-detail').innerHTML = '<div class="empty-state empty-detail">List data unavailable.</div>';
    $('#leaderboard-body').innerHTML = '<tr><td colspan="5" class="empty-state">Could not load leaderboard data.</td></tr>';
  }
}
loadLevels();
