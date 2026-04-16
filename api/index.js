const express    = require('express');
const cors       = require('cors');
const { v4: uuidv4 } = require('uuid');
const axios      = require('axios');
const fs         = require('fs');
const path       = require('path');

// Detect environment
const IS_VERCEL = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ||
                     process.env.VERCEL_REGION || process.env.NOW_REGION);
const IS_RENDER = !!(process.env.RENDER_SERVICE_ID);
const IS_RAILWAY = !!(process.env.RAILWAY_SERVICE_ID);
const IS_FLY = !!(process.env.FLY_REGION);
const IS_REPLIT = !!(process.env.REPLIT_ID || process.env.REPLIT_USER || fs.existsSync('/home/runner/.replit'));

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('json spaces', 2);

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = {
  MAGENTA: '\x1b[35m', BLUE: '\x1b[34m', GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',  RED: '\x1b[31m',  RESET: '\x1b[0m',
};
function log(level, color, msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] [${COLORS[color]}${level}${COLORS.RESET}] -> ${msg}`);
}
function logInfo(m)    { log('INFO',    'BLUE',    m); }
function logSuccess(m) { log('SUCCESS', 'GREEN',   m); }
function logError(m)   { log('ERROR',   'RED',     m); }
function logWarn(m)    { log('WARN',    'YELLOW',  m); }

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Stats
// ─────────────────────────────────────────────────────────────────────────────
const stats = {
  totalSolved: 0,
  totalFailed: 0,
  totalRequests: 0,
  activeSolvers: 0,
  startTime: Date.now(),
  recentSolves: [],
  elapsedTimes: [],
};

function getStats() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const avg = stats.elapsedTimes.length
    ? (stats.elapsedTimes.reduce((a, b) => a + b, 0) / stats.elapsedTimes.length).toFixed(3)
    : '0.000';
  return { ...stats, uptime, avgElapsedTime: avg };
}

function addRecentSolve(entry) {
  stats.recentSolves.unshift(entry);
  if (stats.recentSolves.length > 20) stats.recentSolves.pop();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting (Simple in-memory for serverless)
// ─────────────────────────────────────────────────────────────────────────────
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Clean old entries
  for (const [key, data] of requestCounts.entries()) {
    if (data.firstRequest < windowStart) {
      requestCounts.delete(key);
    }
  }
  
  const record = requestCounts.get(ip);
  if (!record) {
    requestCounts.set(ip, { count: 1, firstRequest: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  
  if (record.firstRequest < windowStart) {
    requestCounts.set(ip, { count: 1, firstRequest: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.firstRequest + RATE_LIMIT_WINDOW - now) / 1000) };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

// Rate limit middleware
function rateLimitMiddleware(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const result = checkRateLimit(ip);
  
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  
  if (!result.allowed) {
    return res.status(429).json({
      status: 'error',
      error: 'Rate limit exceeded',
      retryAfter: result.retryAfter
    });
  }
  next();
}

const USER_AGENT = process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────────────────────────────────────
// HTML Template
// ─────────────────────────────────────────────────────────────────────────────
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Turnstile Solver</title>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body style="background:#fff;">
  <!-- cf turnstile -->
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// Browser Management with Lazy Initialization
// ─────────────────────────────────────────────────────────────────────────────
let cachedBrowser = null;
let browserPromise = null;
let browserReady = false;

async function getBrowser() {
  // Return cached browser if available and connected
  if (cachedBrowser && cachedBrowser.isConnected()) {
    return cachedBrowser;
  }
  
  // If already launching, wait for it
  if (browserPromise) {
    return browserPromise;
  }
  
  browserPromise = (async () => {
    try {
      if (IS_VERCEL) {
        logInfo('Launching browser for Vercel environment...');
        
        const chromium = require('@sparticuz/chromium');
        const { chromium: pw } = require('playwright-core');
        
        const executablePath = await chromium.executablePath();
        logInfo(`Chromium path: ${executablePath || 'not found'}`);
        
        if (!executablePath) {
          throw new Error('Chromium executable path not found. Make sure @sparticuz/chromium is installed.');
        }
        
        const browser = await pw.launch({
          args: [
            ...chromium.args,
            '--hide-scrollbars',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
          ],
          executablePath,
          headless: true,
        });
        
        logSuccess('Browser launched successfully on Vercel');
        cachedBrowser = browser;
        browserReady = true;
        return browser;
      } else if (IS_REPLIT) {
        // Replit environment - use Playwright with system Chromium
        logInfo('Launching browser for Replit environment...');
        const { chromium } = require('playwright');
        
        // Use system Chromium or Playwright's bundled Chromium
        const executablePath = process.env.CHROME_BIN || process.env.CHROMIUM_PATH || undefined;
        logInfo(`Chromium path: ${executablePath || 'using Playwright bundled'}`);
        
        const browser = await chromium.launch({
          headless: true,
          executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-default-apps',
            '--no-first-run',
            '--disable-background-networking',
            '--disable-sync',
            '--metrics-recording-only',
            '--disable-default-browser-check',
            '--mute-audio',
            '--hide-scrollbars',
            '--ignore-certificate-errors',
            `--user-agent=${USER_AGENT}`,
          ],
        });
        
        cachedBrowser = browser;
        browserReady = true;
        logSuccess('Browser launched successfully on Replit');
        return browser;
      } else {
        // Local / self-hosted — use full playwright
        logInfo('Launching browser for local/self-hosted environment...');
        const { chromium } = require('playwright');
        const browser = await chromium.launch({
          headless: process.env.HEADLESS !== 'false',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--ignore-certificate-errors',
            `--user-agent=${USER_AGENT}`,
          ],
        });
        cachedBrowser = browser;
        browserReady = true;
        logSuccess('Browser launched successfully');
        return browser;
      }
    } finally {
      browserPromise = null;
    }
  })();
  
  return browserPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Turnstile Solver
// ─────────────────────────────────────────────────────────────────────────────
async function solveTurnstile({ url, sitekey, action, cdata, useProxy }) {
  const start = Date.now();
  let context = null;
  let page = null;
  
  stats.activeSolvers++;
  
  try {
    logInfo(`Attempting to solve Turnstile for sitekey: ${sitekey ? sitekey.slice(0, 12) + '...' : 'undefined'}`);
    
    const browser = await getBrowser();
    
    const ctxOpts = { userAgent: USER_AGENT };
    
    if (useProxy) {
      const proxies = loadProxies();
      if (proxies.length > 0) {
        const raw = proxies[Math.floor(Math.random() * proxies.length)];
        const p = parseProxy(raw);
        if (p) ctxOpts.proxy = p;
      }
    }
    
    context = await browser.newContext(ctxOpts);
    page = await context.newPage();
    
    // Set reasonable timeouts
    page.setDefaultTimeout(30000);
    
    const urlWithSlash = url.endsWith('/') ? url : url + '/';
    const turnstileDiv = `<div class="cf-turnstile" style="background:white;" data-sitekey="${sitekey}"${action ? ` data-action="${action}"` : ''}${cdata ? ` data-cdata="${cdata}"` : ''}></div>`;
    const pageData = HTML_TEMPLATE.replace('<!-- cf turnstile -->', turnstileDiv);
    
    await page.route(urlWithSlash, route =>
      route.fulfill({ body: pageData, status: 200, contentType: 'text/html' })
    );
    
    await page.goto(urlWithSlash, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    try {
      await page.evalOnSelector('div.cf-turnstile', "el => el.style.width = '70px'");
    } catch (_) {}
    
    let token = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const val = await page.inputValue('[name=cf-turnstile-response]', { timeout: 2000 });
        if (val && val.length > 0) {
          token = val;
          break;
        }
        try {
          await page.locator('div.cf-turnstile').click({ timeout: 1000 });
        } catch (_) {}
        await new Promise(r => setTimeout(r, 700));
      } catch (_) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(3);
    
    if (!token) {
      stats.totalFailed++;
      stats.totalRequests++;
      addRecentSolve({ id: uuidv4().slice(0, 8), status: 'failed', sitekey, elapsed, ts: Date.now() });
      return { success: false, elapsed, cookies: [] };
    }
    
    // Navigate to real URL to capture cookies
    let cookies = [];
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      cookies = await context.cookies();
    } catch (_) {}
    
    stats.totalSolved++;
    stats.totalRequests++;
    stats.elapsedTimes.push(parseFloat(elapsed));
    if (stats.elapsedTimes.length > 100) stats.elapsedTimes.shift();
    addRecentSolve({
      id: uuidv4().slice(0, 8), status: 'success',
      sitekey, elapsed, token: token.slice(0, 16) + '...', ts: Date.now(),
    });
    
    logSuccess(`Solved ${sitekey.slice(0, 12)}... in ${elapsed}s | token: ${token.slice(0, 20)}...`);
    return { success: true, token, elapsed, cookies };
    
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(3);
    stats.totalFailed++;
    stats.totalRequests++;
    addRecentSolve({ id: uuidv4().slice(0, 8), status: 'failed', sitekey, elapsed, ts: Date.now() });
    logError(`Solve error: ${err.message}`);
    return { success: false, elapsed, error: err.message, cookies: [] };
    
  } finally {
    stats.activeSolvers = Math.max(0, stats.activeSolvers - 1);
    try { if (page) await page.close(); } catch (_) {}
    try { if (context) await context.close(); } catch (_) {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Proxy Helpers
// ─────────────────────────────────────────────────────────────────────────────
function loadProxies() {
  const fp = IS_VERCEL ? '/tmp/proxies.txt' : path.join(__dirname, '..', 'proxies.txt');
  if (!fs.existsSync(fp)) return [];
  return fs.readFileSync(fp, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
}

function parseProxy(raw) {
  if (!raw) return null;
  try {
    if (raw.includes('://')) {
      const u = new URL(raw);
      return {
        server: `${u.protocol}//${u.hostname}:${u.port}`,
        username: u.username || undefined,
        password: u.password || undefined
      };
    }
    const p = raw.split(':');
    if (p.length === 2) return { server: `http://${p[0]}:${p[1]}` };
    if (p.length === 4) return { server: `http://${p[2]}:${p[3]}`, username: p[0], password: p[1] };
    if (p.length === 5) return { server: `${p[0]}://${p[1]}:${p[2]}`, username: p[3], password: p[4] };
  } catch (_) {}
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GoLogin Helpers
// ─────────────────────────────────────────────────────────────────────────────
const GOLOGIN_API = 'https://api.gologin.com';
const GOLOGIN_SIGNUP_URL = 'https://app.gologin.com/sign_up';
const GOLOGIN_SITEKEY = '0x4AAAAAAAQn-wN8S1gi-nJa';
const FP = {
  fontsHash: 'a1b2c3d4e5f6g7h8', canvasHash: '1234567890',
  canvasAndFontsHash: 'x9y8z7w6v5u4t3s2', os: 'win', osSpec: 'win11',
};

function genStr(n = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function createGoLoginAccount(captchaToken) {
  const email = `user_${genStr()}@ixcyon.top`;
  const pwd = `tg@ixcynigga${Math.floor(Math.random() * 9000) + 1000}`;
  const headers = {
    'accept': '*/*', 'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'gologin-meta-header': `site-${FP.os}-10.0`,
    'origin': 'https://app.gologin.com', 'referer': 'https://app.gologin.com/',
    'user-agent': USER_AGENT,
  };
  const body = {
    email, password: pwd, passwordConfirm: pwd, captchaToken, fromApp: false,
    canvasAndFontsHash: FP.canvasAndFontsHash, fontsHash: FP.fontsHash,
    canvasHash: FP.canvasHash, userOs: FP.os, osSpec: FP.osSpec, resolution: '1920x1080',
  };
  try {
    const resp = await axios.post(
      `${GOLOGIN_API}/user?free-plan=true&registerAs=workspaces`, body,
      { headers, timeout: 30000, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
    );
    if ([200, 201].includes(resp.status)) {
      const authToken = resp.data?.token;
      stats.accountsCreated = (stats.accountsCreated || 0) + 1;
      logSuccess(`Account created: ${email}`);
      if (authToken) await fetchAndSaveProxies(authToken);
      return { success: true, email, password: pwd, token: authToken };
    }
    return { success: false, error: `HTTP ${resp.status}` };
  } catch (err) {
    logError(`Account creation failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function fetchAndSaveProxies(authToken) {
  const headers = {
    'accept': '*/*', 'authorization': `Bearer ${authToken}`,
    'gologin-meta-header': `site-${FP.os}-10.0`, 'user-agent': USER_AGENT,
  };
  try {
    const resp = await axios.get(`${GOLOGIN_API}/proxy/v2?page=1`, {
      headers, timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
    });
    const proxies = resp.data?.proxies || [];
    if (!proxies.length) return false;
    let saved = 0;
    const lines = proxies
      .filter(p => p.username && p.password && p.host && p.port)
      .map(p => { saved++; return `${p.username}:${p.password}:${p.host}:${p.port}`; })
      .join('\n') + '\n';
    const fp = IS_VERCEL ? '/tmp/proxies.txt' : path.join(__dirname, '..', 'proxies.txt');
    fs.appendFileSync(fp, lines);
    logSuccess(`Saved ${saved} proxies`);
    return true;
  } catch (err) {
    logError(`Fetch proxies failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// Root — serve HTML dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Static file routes
app.get('/style.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(path.join(__dirname, '..', 'public', 'style.css'));
});

app.get('/app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, '..', 'public', 'app.js'));
});

// Health check - returns OK immediately for Railway healthcheck
app.get('/api/health', (req, res) => {
  let environment = 'self-hosted';
  if (IS_VERCEL) environment = 'vercel';
  else if (IS_RENDER) environment = 'render';
  else if (IS_RAILWAY) environment = 'railway';
  else if (IS_FLY) environment = 'fly';
  else if (IS_REPLIT) environment = 'replit';
  
  res.json({
    status: 'ok',
    environment,
    uptime_seconds: Math.floor((Date.now() - stats.startTime) / 1000),
    node_version: process.version,
    browser_ready: browserReady,
    browser_connected: cachedBrowser ? cachedBrowser.isConnected() : false,
  });
});

// Stats
app.get('/api/stats', (req, res) => res.json(getStats()));

// SSE stats stream
app.get('/api/stats/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const payload = JSON.stringify({ type: 'stats', data: getStats() });
  res.write(`data: ${payload}\n\n`);
  // Single snapshot on Vercel (no persistent connection)
  if (IS_VERCEL) { res.end(); return; }
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(hb); }
  }, 15000);
  req.on('close', () => clearInterval(hb));
});

// Solve turnstile (with rate limiting)
app.get('/turnstile', rateLimitMiddleware, handleSolve);
app.post('/turnstile', rateLimitMiddleware, handleSolve);

async function handleSolve(req, res) {
  const params = Object.assign({}, req.query, req.body);
  const { url, sitekey, action, cdata, proxy } = params;
  
  if (!url || !sitekey) {
    return res.status(400).json({
      status: 'error',
      error: "Both 'url' and 'sitekey' query parameters are required",
      example: '/turnstile?url=https://example.com&sitekey=0x4AAAAAAA...',
    });
  }
  
  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({
      status: 'error',
      error: 'Invalid URL format',
    });
  }
  
  logInfo(`Solve request: sitekey=${sitekey.slice(0, 12)}... url=${url}`);
  
  try {
    const result = await solveTurnstile({ url, sitekey, action, cdata, useProxy: proxy === 'true' });
    
    if (!result.success) {
      return res.status(422).json({
        status: 'error',
        error: result.error || 'Failed to solve Turnstile',
        elapsed_time: result.elapsed,
      });
    }
    
    const cookieMap = {};
    for (const c of result.cookies) {
      cookieMap[c.name] = c.value;
      try {
        res.cookie(c.name, c.value, {
          domain: c.domain || undefined, path: c.path || '/',
          secure: c.secure || false, httpOnly: c.httpOnly || false,
          sameSite: c.sameSite || 'Lax',
        });
      } catch (_) {}
    }
    
    res.setHeader('X-Turnstile-Token', result.token);
    return res.json({
      status: 'success',
      token: result.token,
      elapsed_time: result.elapsed,
      cookies: cookieMap,
    });
    
  } catch (err) {
    logError(`Unexpected error: ${err.message}`);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

// GoLogin account creation
app.post('/api/go', rateLimitMiddleware, async (req, res) => {
  try {
    logInfo('Starting GoLogin account creation flow...');
    const captchaResult = await solveTurnstile({ url: GOLOGIN_SIGNUP_URL, sitekey: GOLOGIN_SITEKEY, useProxy: false });
    if (!captchaResult.success) {
      return res.status(422).json({ status: 'error', error: 'Failed to solve captcha for GoLogin: ' + (captchaResult.error || 'Unknown error') });
    }
    const account = await createGoLoginAccount(captchaResult.token);
    if (!account.success) {
      return res.status(500).json({ status: 'error', error: account.error });
    }
    return res.json({ status: 'success', email: account.email, password: account.password });
  } catch (err) {
    logError(`/api/go error: ${err.message}`);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// Download proxies
app.get('/api/proxies/download', (req, res) => {
  const fp = IS_VERCEL ? '/tmp/proxies.txt' : path.join(__dirname, '..', 'proxies.txt');
  if (!fs.existsSync(fp) || fs.statSync(fp).size === 0) {
    return res.status(404).json({ status: 'error', error: 'No proxies file found. Run /api/go first.' });
  }
  res.download(fp, 'proxies.txt');
});

// Download accounts
app.get('/api/accounts/download', (req, res) => {
  const fp = IS_VERCEL ? '/tmp/accounts.txt' : path.join(__dirname, '..', 'accounts.txt');
  if (!fs.existsSync(fp) || fs.statSync(fp).size === 0) {
    return res.status(404).json({ status: 'error', error: 'No accounts file found.' });
  }
  res.download(fp, 'accounts.txt');
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Handlers
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    error: `Route not found: ${req.method} ${req.path}`,
    available_routes: [
      'GET  /',
      'GET  /api/health',
      'GET  /api/stats',
      'GET  /turnstile?url=...&sitekey=...',
      'POST /turnstile',
      'POST /api/go',
      'GET  /api/proxies/download',
      'GET  /api/accounts/download',
    ],
  });
});

app.use((err, req, res, next) => {
  logError(`Unhandled error: ${err.message}`);
  res.status(500).json({ status: 'error', error: err.message || 'Internal server error' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Local Server
// ─────────────────────────────────────────────────────────────────────────────
if (!IS_VERCEL && require.main === module) {
  const PORT = process.env.PORT || 3000;
  const http = require('http');
  http.createServer(app).listen(PORT, '0.0.0.0', () => {
    logSuccess(`🚀 Turnstile Solver running on http://0.0.0.0:${PORT}`);
    logInfo(`❤️  Health: http://0.0.0.0:${PORT}/api/health`);
    logInfo(`🔍 Solve:  http://0.0.0.0:${PORT}/turnstile?url=...&sitekey=...`);
  });
}

// Export for Vercel
module.exports = app;