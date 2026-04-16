/* ═══════════════════════════════════════════════════════════════════
   TurnstileSolver — Frontend App
   ═══════════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────────
let lastStats = {};
let sseSource = null;
let lastToken = '';
let lastCookies = {};
let sparkDataSolved = [];
let sparkDataFailed = [];

// ── DOM Ready ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  connectSSE();
  updateUptimeDisplay();
  setInterval(updateUptimeDisplay, 1000);
  // Prefill example
  document.getElementById('solveSitekey').value = '0x4AAAAAAAQn-wN8S1gi-nJa';
  document.getElementById('solveUrl').value = 'https://app.gologin.com/sign_up';
});

// ── Background Particles ──────────────────────────────────────────
function initParticles() {
  const container = document.getElementById('bgParticles');
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${Math.random() * 3 + 1}px;
      height: ${Math.random() * 3 + 1}px;
      animation-duration: ${Math.random() * 20 + 15}s;
      animation-delay: ${Math.random() * 15}s;
      opacity: ${Math.random() * 0.5 + 0.1};
    `;
    container.appendChild(p);
  }
}

// ── SSE Connection ────────────────────────────────────────────────
function connectSSE() {
  if (sseSource) sseSource.close();

  setConnectionState('connecting');
  sseSource = new EventSource('/api/stats/stream');

  sseSource.onopen = () => setConnectionState('connected');

  sseSource.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'stats') updateStats(msg.data);
    } catch (_) {}
  };

  sseSource.onerror = () => {
    setConnectionState('error');
    sseSource.close();
    setTimeout(connectSSE, 3000);
  };
}

function setConnectionState(state) {
  const dot   = document.getElementById('connectionDot');
  const label = document.getElementById('connectionLabel');
  dot.className = 'status-dot ' + state;
  label.textContent = state === 'connected'   ? 'Live'
                    : state === 'error'        ? 'Disconnected'
                    :                           'Connecting...';
}

// ── Stats Update ──────────────────────────────────────────────────
function updateStats(data) {
  lastStats = data;

  animateValue('statSolved',   data.totalSolved);
  animateValue('statFailed',   data.totalFailed);
  animateValue('statActive',   data.activeSolvers);
  animateValue('statProxies',  data.proxiesLoaded);
  animateValue('statAccounts', data.accountsCreated);

  const avg = parseFloat(data.avgElapsedTime || 0);
  document.getElementById('statAvg').textContent = avg.toFixed(3) + 's';

  // Success rate
  const total   = (data.totalSolved || 0) + (data.totalFailed || 0);
  const rate    = total > 0 ? Math.round((data.totalSolved / total) * 100) : 0;
  document.getElementById('successRatePct').textContent = rate + '%';
  document.getElementById('rateBarFill').style.width    = rate + '%';

  // Download counts
  document.getElementById('dlProxyCount').textContent   = data.proxiesSaved  || 0;
  document.getElementById('dlAccountCount').textContent = data.accountsCreated || 0;

  // Sparklines
  updateSparkline('sparkSolved', sparkDataSolved, data.totalSolved, '#22c55e');
  updateSparkline('sparkFailed', sparkDataFailed, data.totalFailed, '#ef4444');

  // Recent solves table
  if (data.recentSolves && data.recentSolves.length > 0) {
    renderLogTable(data.recentSolves);
  }

  // Update uptime
  if (data.startTime) window.__serverStart = data.startTime;
}

// ── Sparklines ────────────────────────────────────────────────────
function updateSparkline(containerId, dataArr, newVal, color) {
  dataArr.push(newVal || 0);
  if (dataArr.length > 12) dataArr.shift();

  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const max = Math.max(...dataArr, 1);
  for (const v of dataArr) {
    const bar = document.createElement('div');
    bar.className = 'spark-bar';
    const pct = Math.max((v / max) * 100, 4);
    bar.style.cssText = `height:${pct}%; background:${color}; opacity:0.7;`;
    container.appendChild(bar);
  }
}

// ── Animated Number ───────────────────────────────────────────────
const _prevVals = {};
function animateValue(id, newVal) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = _prevVals[id] || 0;
  if (prev !== newVal) {
    el.textContent = newVal;
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
    _prevVals[id] = newVal;
  }
}

// ── Uptime ────────────────────────────────────────────────────────
function updateUptimeDisplay() {
  const el = document.getElementById('uptimeDisplay');
  if (!el) return;
  const secs = lastStats.uptime || 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  el.textContent = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Log Table ─────────────────────────────────────────────────────
function renderLogTable(rows) {
  const tbody = document.getElementById('logTableBody');
  if (!tbody) return;

  tbody.innerHTML = rows.map(r => {
    const age = r.ts ? timeAgo(r.ts) : '';
    const key = r.sitekey ? r.sitekey.slice(0, 18) + '…' : '—';
    const tok = r.token  ? `<span class="mono text-dim">${r.token}</span>` : '<span class="text-dim">—</span>';
    const badge = r.status === 'success'
      ? '<span class="badge success">✓ Success</span>'
      : '<span class="badge failed">✗ Failed</span>';
    return `
      <tr>
        <td class="mono text-dim">${r.id || '—'}</td>
        <td>${badge}</td>
        <td class="mono" style="font-size:11px">${key}</td>
        <td class="mono">${r.elapsed || '—'}s</td>
        <td>${tok}</td>
        <td class="text-dim">${age}</td>
      </tr>`;
  }).join('');
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)  return 'just now';
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
}

function clearLog() {
  const tbody = document.getElementById('logTableBody');
  tbody.innerHTML = '<tr class="log-empty"><td colspan="6">Cleared</td></tr>';
}

// ── Solve Handler ─────────────────────────────────────────────────
async function runSolve() {
  const url     = document.getElementById('solveUrl').value.trim();
  const sitekey = document.getElementById('solveSitekey').value.trim();
  const action  = document.getElementById('solveAction').value.trim();
  const cdata   = document.getElementById('solveCdata').value.trim();
  const proxy   = document.getElementById('useProxy').checked;

  if (!url || !sitekey) {
    showToast('URL and Site Key are required', 'error');
    return;
  }

  const btn = document.getElementById('solveBtn');
  setButtonLoading(btn, true, 'Solving…');

  const params = new URLSearchParams({ url, sitekey });
  if (action) params.set('action', action);
  if (cdata)  params.set('cdata', cdata);
  if (proxy)  params.set('proxy', 'true');

  const apiUrl = `/turnstile?${params.toString()}`;

  // Show API URL
  document.getElementById('apiUrlText').textContent = window.location.origin + apiUrl;
  document.getElementById('apiUrlBox').style.display = 'flex';

  showResponse(null, 'loading');

  try {
    const resp = await fetch(apiUrl);
    const data = await resp.json();

    showResponse(data, resp.ok ? 'success' : 'error');

    if (data.status === 'success') {
      lastToken   = data.token   || '';
      lastCookies = data.cookies || {};
      document.getElementById('tokenActions').style.display = 'flex';
      showToast('Turnstile solved! 🎉', 'success');
    } else {
      showToast(data.error || 'Solve failed', 'error');
    }
  } catch (err) {
    showResponse({ error: err.message }, 'error');
    showToast('Network error: ' + err.message, 'error');
  } finally {
    setButtonLoading(btn, false, 'Solve Turnstile');
  }
}

// ── Go Handler ────────────────────────────────────────────────────
async function runGo() {
  const btn = document.getElementById('goBtn');
  const resultBox = document.getElementById('goResult');

  setButtonLoading(btn, true, 'Running…');
  resultBox.style.display = 'block';
  resultBox.className     = 'result-box';
  resultBox.innerHTML     = '<span style="color:var(--text2)">⏳ Solving Turnstile for GoLogin...</span>';

  try {
    const resp = await fetch('/api/go', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await resp.json();

    if (data.status === 'success') {
      resultBox.className = 'result-box success';
      resultBox.innerHTML = `
        <div style="color:var(--green);font-weight:700;margin-bottom:8px">✓ Account Created & Proxies Harvested</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.8;color:var(--text2)">
          <div>📧 Email: <span style="color:var(--text)">${data.email}</span></div>
          <div>🔑 Password: <span style="color:var(--text)">${data.password}</span></div>
          <div>📦 Proxies saved: <span style="color:var(--orange)">${data.proxies_saved || 0}</span></div>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <a href="/api/proxies/download" class="btn btn-sm btn-outline" download>⬇ Download proxies.txt</a>
          <a href="/api/accounts/download" class="btn btn-sm btn-outline" download>⬇ Download accounts.txt</a>
        </div>`;
      showToast('GoLogin account created! Proxies saved.', 'success');
    } else {
      resultBox.className = 'result-box error';
      resultBox.innerHTML = `<div style="color:var(--red)">✗ ${data.error || 'Failed'}</div>`;
      showToast(data.error || 'GoLogin flow failed', 'error');
    }
  } catch (err) {
    resultBox.className = 'result-box error';
    resultBox.innerHTML = `<div style="color:var(--red)">✗ Network error: ${err.message}</div>`;
    showToast('Network error', 'error');
  } finally {
    setButtonLoading(btn, false, 'Run GoLogin Harvester');
  }
}

// ── Response Renderer ─────────────────────────────────────────────
function showResponse(data, state) {
  const area = document.getElementById('responseArea');

  if (state === 'loading') {
    area.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;height:160px;justify-content:center;color:var(--text2)">
        <div class="spinner"></div>
        <span>Solving Turnstile challenge…</span>
      </div>`;
    return;
  }

  if (!data) { area.innerHTML = ''; return; }

  const json    = JSON.stringify(data, null, 2);
  const colored = syntaxHighlight(json);
  area.innerHTML = `<div class="response-json">${colored}</div>`;
}

function syntaxHighlight(json) {
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
    let cls = 'num';
    if (/^"/.test(match)) {
      cls = /:$/.test(match) ? 'key' : 'str';
    } else if (/true|false/.test(match)) {
      cls = 'bool';
    } else if (/null/.test(match)) {
      cls = 'null';
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

// ── Copy Helpers ──────────────────────────────────────────────────
function copyToken() {
  if (!lastToken) { showToast('No token available', 'error'); return; }
  navigator.clipboard.writeText(lastToken).then(() => showToast('Token copied!', 'success'));
}

function copyCookies() {
  if (!Object.keys(lastCookies).length) { showToast('No cookies available', 'error'); return; }
  navigator.clipboard.writeText(JSON.stringify(lastCookies, null, 2)).then(() => showToast('Cookies copied!', 'success'));
}

function copyApiUrl() {
  const text = document.getElementById('apiUrlText').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('API URL copied!', 'info'));
}

// ── Button Loading State ──────────────────────────────────────────
function setButtonLoading(btn, loading, text) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div>${text}`;
  } else {
    btn.disabled = false;
    const icon = btn.id === 'goBtn'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    btn.innerHTML = `${icon}${text}`;
  }
}

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  if (toastTimer) clearTimeout(toastTimer);
  t.textContent  = msg;
  t.className    = `toast ${type} show`;
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3000);
}