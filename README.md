# 🛡️ Turnstile Solver

A high-performance Cloudflare Turnstile bypass API built with Node.js + Playwright. Features a live-stats dashboard, GoLogin account harvester, cookie extraction, proxy support, and rate limiting.

## 🚀 Quick Start

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers (for local development only)
npx playwright install chromium

# 3. Copy env file
cp .env.example .env

# 4. Start server
npm start
```

Open `http://localhost:3000` in your browser.

---

## 🌐 API Reference

### `GET /turnstile`
Solve a Cloudflare Turnstile challenge.

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `url`     | ✅ Yes  | Target URL where Turnstile is rendered |
| `sitekey` | ✅ Yes  | Cloudflare site key |
| `action`  | ❌ No   | Optional Turnstile action string |
| `cdata`   | ❌ No   | Optional custom data string |
| `proxy`   | ❌ No   | Set `true` to use a proxy from proxies.txt |

**Example:**
```
GET /turnstile?url=https://example.com&sitekey=0x4AAAAAAAQn-wN8S1gi-nJa
```

**Response:**
```json
{
  "status": "success",
  "token": "0.abc123...",
  "elapsed_time": "3.412",
  "cookies": {
    "cf_clearance": "...",
    "__cf_bm": "..."
  }
}
```

---

### `POST /api/go`
Solve GoLogin Turnstile → create free account → harvest proxies → save to `proxies.txt`.

**Response:**
```json
{
  "status": "success",
  "email": "user_abc123@ixcyon.top",
  "password": "tg@ixcynigga1234",
  "proxies_saved": 12
}
```

---

### `GET /api/proxies/download`
Download the harvested `proxies.txt` file.

### `GET /api/accounts/download`
Download the harvested `accounts.txt` file.

### `GET /api/stats`
Get real-time statistics as JSON.

### `GET /api/stats/stream`
Server-Sent Events (SSE) stream for live statistics updates.

### `GET /api/health`
Health check endpoint with environment info.

---

## 🔧 Proxy Format (`proxies.txt`)
One proxy per line. Supported formats:
```
host:port
http://host:port
user:pass:host:port
http://user:pass@host:port
scheme://user:pass@host:port
```

---

## ⚙️ Environment Variables

| Variable     | Default   | Description |
|--------------|-----------|-------------|
| `PORT`       | `3000`    | Server port |
| `HEADLESS`   | `true`    | Run browsers headlessly |
| `USER_AGENT` | Chrome 124| Custom user agent string |
| `RATE_LIMIT_MAX` | `30`  | Max requests per minute per IP |

---

## 🌍 Hosting Recommendations

### ⚠️ Important Note About Vercel

**Vercel has significant limitations for browser automation:**

| Limitation | Free Tier | Pro Tier |
|------------|-----------|----------|
| Function Timeout | 10-60 seconds | 60-900 seconds |
| Memory | 1024 MB | Up to 3008 MB |
| Function Size | 50 MB | 50 MB |
| Cold Starts | Yes | Yes |

**The main issues with Vercel:**
1. **Chromium binary size** - The `@sparticuz/chromium` package is optimized for Lambda, but still tight on Vercel
2. **Timeout** - Turnstile solving can take 10-30 seconds, leaving little room for error
3. **No persistent storage** - Stats reset on each cold start
4. **Cold starts** - Browser initialization adds 3-5 seconds to each request

### 🏆 Best Free Hosting Options

| Platform | Free Tier | Pros | Cons | Best For |
|----------|-----------|------|------|----------|
| **Render** | 750 hrs/month | Docker support, persistent disk, no cold starts | 512MB RAM limit, sleeps after inactivity | Small projects, testing |
| **Railway** | $5 credit/month | Easy deployment, good performance | Limited free credits | Development, prototyping |
| **Fly.io** | 3 VMs free | Global regions, persistent storage | Complex setup | Production apps |
| **Koyeb** | Free tier | Global deployment, Docker | Limited resources | Testing |
| **Northflank** | Free tier | Good for services | Complex UI | Microservices |

### 🚀 Recommended Deployment Platforms

#### 1. **Render (Best Free Option)**

```bash
# render.yaml - Place in your repo
services:
  - type: web
    name: turnstile-solver
    env: node
    plan: free
    buildCommand: npm install && npx playwright install chromium
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

**Pros:** Free, no cold starts, Docker support
**Cons:** 512MB RAM (tight for browser), sleeps after 15 min inactivity

#### 2. **Railway (Best for Development)**

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

**Pros:** Fast deployment, good performance, easy CLI
**Cons:** Limited free credits ($5/month)

#### 3. **Fly.io (Best for Production)**

```bash
npm install -g flyctl
flyctl launch
flyctl deploy
```

**Pros:** Global regions, persistent storage, good performance
**Cons:** Requires credit card verification

#### 4. **VPS (Best Overall Performance)**

For $4-6/month, you get:
- Full control over the environment
- No timeouts or memory limits
- Persistent storage
- No cold starts

**Recommended VPS providers:**
- [Hetzner Cloud](https://www.hetzner.com/cloud) - €4.15/month (CX22)
- [DigitalOcean](https://www.digitalocean.com) - $4-6/month
- [Linode/Akamai](https://www.linode.com) - $5/month

---

## 📁 File Structure

```
turnstile-solver/
├── api/
│   └── index.js       # Main Express app (Vercel entry point)
├── public/
│   ├── index.html     # Dashboard UI
│   ├── style.css      # Styles
│   └── app.js         # Frontend JavaScript
├── server.js          # Local development entry
├── package.json
├── vercel.json        # Vercel config
├── .env.example       # Environment template
├── .gitignore
└── README.md
```

---

## 🚀 Deployment Guides

### Deploy to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and create an account
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Configure:
   - **Build Command:** `npm install && npx playwright install chromium`
   - **Start Command:** `npm start`
   - **Environment:** Add variables from `.env.example`
6. Deploy!

### Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up

# Set environment variables
railway variables set HEADLESS=true
```

### Deploy to Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Launch (creates fly.toml)
flyctl launch

# Deploy
flyctl deploy
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Note:** Vercel has limitations for browser automation. Consider Render or Railway for better performance.

---

## ⚡ Features

- ✅ Cloudflare Turnstile bypass via headless Playwright
- ✅ Cookie extraction (`cf_clearance`, `__cf_bm`, etc.)
- ✅ Live statistics dashboard with SSE
- ✅ Rate limiting (30 requests/minute by default)
- ✅ Browser caching for improved performance
- ✅ Proxy support with multiple formats
- ✅ GoLogin account creator + proxy harvester
- ✅ Download proxies.txt / accounts.txt from UI
- ✅ Beautiful dark UI with real-time charts
- ✅ Works on Vercel, Render, Railway, Fly.io

---

## 🔒 Security Features

- Rate limiting per IP
- Input validation
- Error handling without exposing internals
- CORS enabled (configure as needed)

---

## 📊 Performance Tips

1. **Use a VPS** for best performance (no cold starts, more RAM)
2. **Enable browser caching** - Already implemented in the code
3. **Use proxies** to avoid rate limiting from Cloudflare
4. **Monitor memory usage** - Browser automation is memory-intensive
5. **Set appropriate timeouts** - Default 30s works for most cases

---

## 🐛 Troubleshooting

### "Chromium executable path not found"
- Run `npx playwright install chromium` locally
- On Vercel, ensure `@sparticuz/chromium` is in dependencies

### "Browser launch failed"
- Check memory limits (browser needs 512MB+)
- Try increasing function memory in vercel.json

### "Timeout exceeded"
- Increase timeout in `vercel.json` (max 60s on free tier)
- Consider a VPS for longer-running tasks

### "Rate limit exceeded"
- Wait 60 seconds or increase `RATE_LIMIT_MAX` in .env

---

## Credits

Inspired by [Turnaround](https://github.com/Body-Alhoha/turnaround), [Theyka](https://github.com/Theyka) & [Sexfrance](https://github.com/sexfrance).

---

## License

MIT License - Use at your own risk.