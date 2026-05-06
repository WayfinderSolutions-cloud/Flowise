import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- Config -----
const ANSWER_PLAINTEXT = "northstar";
const ANSWER_HASH = crypto.createHash("sha256").update(ANSWER_PLAINTEXT).digest("hex");

// Render
const PORT = process.env.PORT || 8787;

// Access gate (set this in Render dashboard -> Environment)
const SITE_GATE_CODE = process.env.SITE_GATE_CODE || "";

// Rate limit for puzzle submit
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 60;
const attempts = new Map(); // ip -> { count, windowStart }

function getClientIp(req) {
  // If you later put behind a proxy, you may want to respect x-forwarded-for carefully.
  return req.socket.remoteAddress || "unknown";
}

function rateLimitOk(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return { ok: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const resetInMs = WINDOW_MS - (now - entry.windowStart);
    return { ok: false, resetInMs };
  }

  entry.count += 1;
  return { ok: true, remaining: MAX_ATTEMPTS - entry.count };
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  send(
    res,
    status,
    {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      ...extraHeaders,
    },
    body
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function serveFile(res, filename, contentType) {
  const filePath = path.join(__dirname, filename);
  const content = fs.readFileSync(filePath);
  send(res, 200, { "Content-Type": contentType }, content);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function needsGate(reqUrl) {
  // allow gate endpoints + health
  if (reqUrl === "/gate") return false;
  if (reqUrl === "/api/gate") return false;
  if (reqUrl === "/health") return false;
  // allow favicon (optional)
  if (reqUrl === "/favicon.ico") return false;
  return true;
}

function isGatedIn(req) {
  if (!SITE_GATE_CODE) return true; // if not set, no gate
  const cookies = parseCookies(req);
  return cookies.wf_gate === "1";
}

const gatePageHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Wayfinder Gate</title>
  <style>
    html,body{height:100%;margin:0;background:#000;color:#00ff41;font-family:ui-monospace,Consolas,monospace}
    .wrap{min-height:100%;display:grid;place-items:center;padding:24px}
    .card{width:min(520px,100%);border:1px solid rgba(0,255,65,.25);background:rgba(0,0,0,.6);padding:18px;border-radius:14px}
    h1{margin:0 0 10px;letter-spacing:.14em;font-size:16px}
    p{margin:0 0 14px;color:rgba(0,255,65,.6);font-size:13px;line-height:1.5}
    form{display:flex;gap:10px}
    input{flex:1;background:transparent;border:none;border-bottom:1px solid rgba(0,255,65,.5);color:#00ff41;padding:8px 4px;outline:none}
    button{background:transparent;border:1px solid rgba(0,255,65,.45);color:#00ff41;padding:8px 12px;cursor:pointer}
    .msg{margin-top:12px;min-height:20px;color:rgba(255,90,90,.9);font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>WAYFINDER ACCESS</h1>
      <p>Enter the passphrase to approach the threshold.</p>
      <form id="f">
        <input id="code" autocomplete="off" placeholder="passphrase"/>
        <button>ENTER</button>
      </form>
      <div class="msg" id="m"></div>
    </div>
  </div>
  <script>
    const f=document.getElementById('f');
    const m=document.getElementById('m');
    f.addEventListener('submit', async (e)=>{
      e.preventDefault();
      m.textContent='';
      const code=document.getElementById('code').value;
      const r=await fetch('/api/gate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
      const j=await r.json();
      if(!j.ok){m.textContent=j.message||'Denied';return;}
      window.location.href='/';
    });
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    // Gate enforcement
    if (needsGate(req.url) && !isGatedIn(req)) {
      // redirect to /gate
      res.writeHead(302, { Location: "/gate" });
      res.end();
      return;
    }

    // health
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    // gate page
    if (req.method === "GET" && req.url === "/gate") {
      return send(res, 200, { "Content-Type": "text/html; charset=utf-8" }, gatePageHtml);
    }

    // gate API
    if (req.method === "POST" && req.url === "/api/gate") {
      const raw = await readBody(req);
      let payload = {};
      try { payload = JSON.parse(raw || "{}"); } catch {}
      const code = String(payload.code || "").trim();

      if (!SITE_GATE_CODE) {
        return sendJson(res, 200, { ok: true });
      }

      if (code !== SITE_GATE_CODE) {
        return sendJson(res, 403, { ok: false, message: "Denied." });
      }

      // cookie: 7 days
      const cookie = `wf_gate=1; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookie });
    }

    // -------- Static routes --------
    if (req.method === "GET" && req.url === "/") {
      return serveFile(res, "index.html", "text/html; charset=utf-8");
    }

    // landing assets
    if (req.method === "GET" && req.url === "/style.css") {
      return serveFile(res, "style.css", "text/css; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/app.js") {
      return serveFile(res, "app.js", "application/javascript; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/starmap.js") {
      return serveFile(res, "starmap.js", "application/javascript; charset=utf-8");
    }

    // warp transition
    if (req.method === "GET" && req.url === "/jump") {
      return serveFile(res, "jump.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/jump.css") {
      return serveFile(res, "jump.css", "text/css; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/jump.js") {
      return serveFile(res, "jump.js", "application/javascript; charset=utf-8");
    }

    // labyrinth + maze
    if (req.method === "GET" && req.url === "/labyrinth") {
      return serveFile(res, "labyrinth.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/terminal.css") {
      return serveFile(res, "terminal.css", "text/css; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/maze.css") {
      return serveFile(res, "maze.css", "text/css; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/maze.js") {
      return serveFile(res, "maze.js", "application/javascript; charset=utf-8");
    }

    // destination pages
    if (req.method === "GET" && req.url === "/browse") {
      return serveFile(res, "browse.html", "text/html; charset=utf-8");
    }

    // lateral mini-game
    if (req.method === "GET" && req.url === "/lateral") {
      return serveFile(res, "lateral.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/lateral.css") {
      return serveFile(res, "lateral.css", "text/css; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/lateral.js") {
      return serveFile(res, "lateral.js", "application/javascript; charset=utf-8");
    }

    // dragon mini-game
    if (req.method === "GET" && req.url === "/dragon") {
      return serveFile(res, "dragon.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/dragon.css") {
      return serveFile(res, "dragon.css", "text/css; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/dragon.js") {
      return serveFile(res, "dragon.js", "application/javascript; charset=utf-8");
    }

    // dream pages
    if (req.method === "GET" && req.url === "/dream") {
      return serveFile(res, "dream.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/dream.css") {
      return serveFile(res, "dream.css", "text/css; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/dream-castle.png") {
      return serveFile(res, "dream-castle.png", "image/png");
    }

    if (req.method === "GET" && req.url === "/lateral-dream") {
      return serveFile(res, "lateral-dream.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/lateral-vignette.png") {
      return serveFile(res, "lateral-vignette.png", "image/png");
    }

    if (req.method === "GET" && req.url === "/rest") {
     return serveFile(res, "rest.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/rest") {
      return serveFile(res, "rest.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/rest.css") {
      return serveFile(res, "rest.css", "text/css; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/rest.js") {
      return serveFile(res, "rest.js", "application/javascript; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/rest-tavern.png") {
      return serveFile(res, "rest-tavern.png", "image/png");
    }
    if (req.method === "GET" && req.url === "/rest-player.png") {
      return serveFile(res, "rest-player.png", "image/png");
    }

    // -------- API: puzzle submit --------
    if (req.method === "POST" && req.url === "/api/submit") {
      const ip = getClientIp(req);
      const rl = rateLimitOk(ip);

      if (!rl.ok) {
        return sendJson(res, 429, {
          ok: false,
          message: "Too many attempts. Try again later.",
          resetInMs: rl.resetInMs,
        });
      }

      const raw = await readBody(req);
      let payload = {};
      try {
        payload = JSON.parse(raw || "{}");
      } catch {
        return sendJson(res, 400, { ok: false, message: "Invalid JSON." });
      }

      const answer = String(payload.answer || "").trim().toLowerCase();
      if (!answer) return sendJson(res, 400, { ok: false, message: "Enter an answer." });

      const hash = crypto.createHash("sha256").update(answer).digest("hex");
      const correct = hash === ANSWER_HASH;

      if (!correct) {
        return sendJson(res, 200, {
          ok: false,
          message: "The door does not open. (Incorrect.)",
          remainingAttempts: rl.remaining,
        });
      }

      return sendJson(res, 200, { ok: true });
    }

    // 404
    send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found.");
  } catch (err) {
    send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, String(err?.stack || err));
  }
});

server.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
  if (!process.env.PORT) console.log(`Local: http://localhost:${PORT}`);
});