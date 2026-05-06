const canvas = document.getElementById("dragonCanvas");
const ctx = canvas.getContext("2d");

const jumpCanvas = document.getElementById("wurmJump");
const jtx = jumpCanvas.getContext("2d");

const timeEl = document.getElementById("timeLeft");
const scoreEl = document.getElementById("score");
const cdEl = document.getElementById("cd");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySub = document.getElementById("overlaySub");

function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  jumpCanvas.width = Math.floor(window.innerWidth * dpr);
  jumpCanvas.height = Math.floor(window.innerHeight * dpr);
  jtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const W = () => window.innerWidth;
const H = () => window.innerHeight;

let running = false;
let startMs = 0;
let lastFrameMs = 0;

let score = 0;

// Archer at bottom following mouse
const archer = {
  x: W() / 2,
  y: () => H() - 80,
};

// Shooting cooldown: 1 arrow every 2 seconds
const FIRE_COOLDOWN_MS = 2000;
let lastShotMs = -Infinity;

// Enemy spawn: ~1 every 4 seconds
const SPAWN_INTERVAL_MS = 4000;
let lastSpawnMs = -Infinity;

// Entities
let arrows = []; // {x,y,vy,r,alive}
let wyrms = [];  // {x,y,vx,vy,alive,headR,bodyLen,segCount,hp}

function setOverlay(visible, title, sub) {
  overlay.style.display = visible ? "grid" : "none";
  overlayTitle.textContent = title || "";
  overlaySub.textContent = sub || "";
}

function resetGame() {
  score = 0;
  arrows = [];
  wyrms = [];
  lastShotMs = -Infinity;
  lastSpawnMs = -Infinity;

  scoreEl.textContent = "0";
  timeEl.textContent = "60";
  cdEl.textContent = "READY";
}

function startGame() {
  resetGame();
  running = true;
  startMs = performance.now();
  lastFrameMs = 0;
  setOverlay(false);
  requestAnimationFrame(gameLoop);
}

function endLoss(reason) {
  running = false;
  setOverlay(true, "RISING DRAGON", reason + " Click to retry.");
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// ----- Visual helpers (32-bit-ish) -----
function drawBackground(nowMs) {
  // fade + subtle trails
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, W(), H());

  // base gradient refresh every frame (but keep trails)
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  const g = ctx.createLinearGradient(0, 0, 0, H());
  g.addColorStop(0, "rgba(10,14,18,0.40)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W(), H());
  ctx.restore();

  // faint range lines
  ctx.strokeStyle = "rgba(0,255,65,0.05)";
  ctx.lineWidth = 1;
  for (let y = 70; y < H(); y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W(), y);
    ctx.stroke();
  }

  // breach line
  ctx.strokeStyle = "rgba(255,210,77,0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H() - 62);
  ctx.lineTo(W(), H() - 62);
  ctx.stroke();

  // vignette
  const vg = ctx.createRadialGradient(W()*0.5, H()*0.55, 120, W()*0.5, H()*0.55, Math.max(W(),H())*0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.60)");
  ctx.fillStyle = vg;
  ctx.fillRect(0,0,W(),H());
}

// 32-bit archer
function drawArcher(nowMs) {
  const x = archer.x;
  const y = archer.y();

  // cooldown UI
  const since = nowMs - lastShotMs;
  const ready = since >= FIRE_COOLDOWN_MS;
  const left = Math.max(0, FIRE_COOLDOWN_MS - since);
  cdEl.textContent = ready ? "READY" : `${Math.ceil(left / 1000)}s`;

  ctx.save();
  ctx.shadowColor = "rgba(0,255,65,0.55)";
  ctx.shadowBlur = 18;

  // body
  const bodyG = ctx.createLinearGradient(x, y - 26, x, y + 10);
  bodyG.addColorStop(0, "rgba(0,255,65,0.95)");
  bodyG.addColorStop(1, "rgba(0,255,65,0.55)");
  ctx.fillStyle = bodyG;
  ctx.fillRect(x - 7, y - 12, 14, 18);

  // head
  ctx.fillStyle = "rgba(0,255,65,0.75)";
  ctx.beginPath();
  ctx.arc(x, y - 22, 5, 0, Math.PI * 2);
  ctx.fill();

  // bow (metal under-stroke + green glow)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(220,255,235,0.30)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x + 12, y - 12, 12, Math.PI * 0.68, Math.PI * 1.32);
  ctx.stroke();

  ctx.strokeStyle = "rgba(0,255,65,0.9)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x + 12, y - 12, 12, Math.PI * 0.68, Math.PI * 1.32);
  ctx.stroke();

  ctx.restore();
}

// arrow render
function drawArrows() {
  ctx.save();
  ctx.strokeStyle = "rgba(0,255,65,0.9)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(0,255,65,0.5)";
  ctx.shadowBlur = 10;

  for (const a of arrows) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + 10);
    ctx.lineTo(a.x, a.y - 14);
    ctx.stroke();

    // arrow head
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 14);
    ctx.lineTo(a.x - 5, a.y - 7);
    ctx.moveTo(a.x, a.y - 14);
    ctx.lineTo(a.x + 5, a.y - 7);
    ctx.stroke();
  }
  ctx.restore();
}

// Wurm render: long body + tooth maw (same aesthetic as lateral)
function drawWyrm(w, nowMs) {
  const pulse = 0.70 + (Math.sin(nowMs / 90 + w.x * 0.01) + 1) * 0.12;

  const sp = Math.hypot(w.vx, w.vy) || 1;
  const ux = w.vx / sp;
  const uy = w.vy / sp;
  const px = -uy;
  const py = ux;

  const headR = w.headR;
  const bodyLen = w.bodyLen;
  const segCount = w.segCount;
  const segStep = bodyLen / segCount;

  const wig = Math.sin(nowMs / 80 + w.x * 0.01) * 6;

  ctx.save();
  ctx.shadowColor = "rgba(255,210,77,0.22)";
  ctx.shadowBlur = 16;

  // body segments
  for (let i = 0; i < segCount; i++) {
    const t = i / segCount;
    const r = (headR * 0.70) - t * (headR * 0.45);

    const bx = w.x - ux * (i * segStep) + px * Math.sin(nowMs / 110 + i * 0.55) * (3 + t * 6);
    const by = w.y - uy * (i * segStep) + py * Math.sin(nowMs / 110 + i * 0.55) * (3 + t * 6);

    const grad = ctx.createRadialGradient(bx - ux * 4, by - uy * 4, 4, bx, by, r * 1.6);
    grad.addColorStop(0, `rgba(255,140,80,${0.18 * pulse})`);
    grad.addColorStop(1, `rgba(70,20,10,${0.10 * pulse})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(255,210,77,${0.14 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // head
  const hx = w.x + px * (wig * 0.15);
  const hy = w.y + py * (wig * 0.15);

  ctx.strokeStyle = `rgba(255,210,77,${0.58 * pulse})`;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(hx, hy, headR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = `rgba(0,0,0,${0.38 * pulse})`;
  ctx.beginPath();
  ctx.arc(hx, hy, headR - 7, 0, Math.PI * 2);
  ctx.fill();

  // teeth
  const teeth = 14;
  for (let i = 0; i < teeth; i++) {
    const ang = (i / teeth) * Math.PI * 2;
    const tx0 = hx + Math.cos(ang) * (headR - 3);
    const ty0 = hy + Math.sin(ang) * (headR - 3);
    const tx1 = hx + Math.cos(ang + 0.10) * (headR - 3);
    const ty1 = hy + Math.sin(ang + 0.10) * (headR - 3);
    const tip = headR - 12;

    const ttipx = hx + Math.cos(ang + 0.05) * tip;
    const ttipy = hy + Math.sin(ang + 0.05) * tip;

    ctx.fillStyle = `rgba(255,245,230,${0.60 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(tx0, ty0);
    ctx.lineTo(tx1, ty1);
    ctx.lineTo(ttipx, ttipy);
    ctx.closePath();
    ctx.fill();
  }

  // eyes
  const ex = hx + ux * 10 + px * 10;
  const ey = hy + uy * 10 + py * 10;
  ctx.fillStyle = `rgba(255,210,77,${0.75 * pulse})`;
  ctx.shadowColor = "rgba(255,210,77,0.45)";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(ex, ey, 3.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ----- Gameplay mechanics (unchanged) -----
function fireArrow(nowMs) {
  if (nowMs - lastShotMs < FIRE_COOLDOWN_MS) return;
  lastShotMs = nowMs;

  arrows.push({
    x: archer.x,
    y: archer.y() - 28,
    vy: -780,
    r: 3,
    alive: true
  });
}

function spawnWyrm(nowMs) {
  if (nowMs - lastSpawnMs < SPAWN_INTERVAL_MS) return;
  lastSpawnMs = nowMs;

  const x = 60 + Math.random() * (W() - 120);
  const y = 90 + Math.random() * 90;

  wyrms.push({
    x, y,
    vx: (Math.random() - 0.5) * 85,
    vy: 70 + Math.random() * 55,
    alive: true,
    headR: 22 + Math.random() * 6,
    bodyLen: 210 + Math.random() * 60,
    segCount: 12,
    hp: 1
  });
}

function update(dt) {
  // arrows
  for (const a of arrows) {
    a.y += a.vy * dt;
    if (a.y < -40) a.alive = false;
  }
  arrows = arrows.filter(a => a.alive);

  // wyrms
  for (const w of wyrms) {
    w.x += w.vx * dt;
    w.y += w.vy * dt;

    if (w.x < 30) { w.x = 30; w.vx *= -1; }
    if (w.x > W() - 30) { w.x = W() - 30; w.vx *= -1; }

    // LOSS: breach line
    if (w.y >= H() - 62) {
      endLoss("BREACH DETECTED.");
      return;
    }
  }

  // collisions: one hit kill
  for (const w of wyrms) {
    for (const a of arrows) {
      const d = Math.hypot(w.x - a.x, w.y - a.y);
      if (d < (w.headR * 0.85) + a.r) {
        w.alive = false;
        a.alive = false;
        score += 1;
        scoreEl.textContent = String(score);
        break;
      }
    }
  }

  wyrms = wyrms.filter(w => w.alive);
  arrows = arrows.filter(a => a.alive);
}

// ----- WIN TRANSITION: wurm mouth rushing the camera -----
function playWurmMouthFlyIn() {
  jumpCanvas.classList.add("active");

  const start = performance.now();
  const D = 1700;

  function drawMouth(t) {
    const p = Math.min(1, (t - start) / D);
    const ease = p * p * (3 - 2 * p);

    // screen shake late
    const shake = p > 0.65 ? (p - 0.65) * 16 : 0;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;

    // smear fade
    jtx.fillStyle = "rgba(0,0,0,0.28)";
    jtx.fillRect(0, 0, W(), H());

    jtx.save();
    jtx.translate(W() / 2 + sx, H() / 2 + sy);

    const scale = 0.35 + ease * 7.5;
    jtx.scale(scale, scale);

    // rotation wobble
    jtx.rotate(Math.sin((t - start) / 180) * 0.05);

    jtx.shadowColor = "rgba(255,210,77,0.35)";
    jtx.shadowBlur = 26;

    // outer jaw ring
    jtx.strokeStyle = "rgba(255,210,77,0.85)";
    jtx.lineWidth = 5;
    jtx.beginPath();
    jtx.arc(0, 0, 56, 0, Math.PI * 2);
    jtx.stroke();

    // inner darkness
    jtx.fillStyle = "rgba(0,0,0,0.65)";
    jtx.beginPath();
    jtx.arc(0, 0, 40, 0, Math.PI * 2);
    jtx.fill();

    // teeth
    const teeth = 22;
    for (let i = 0; i < teeth; i++) {
      const ang = (i / teeth) * Math.PI * 2;
      const r0 = 52;
      const rTip = 34;

      const x0 = Math.cos(ang) * r0;
      const y0 = Math.sin(ang) * r0;
      const x1 = Math.cos(ang + 0.10) * r0;
      const y1 = Math.sin(ang + 0.10) * r0;

      const xt = Math.cos(ang + 0.05) * rTip;
      const yt = Math.sin(ang + 0.05) * rTip;

      jtx.fillStyle = "rgba(255,245,230,0.85)";
      jtx.beginPath();
      jtx.moveTo(x0, y0);
      jtx.lineTo(x1, y1);
      jtx.lineTo(xt, yt);
      jtx.closePath();
      jtx.fill();
    }

    // eye glints
    jtx.shadowBlur = 0;
    jtx.fillStyle = "rgba(255,210,77,0.90)";
    jtx.beginPath();
    jtx.arc(18, -14, 4, 0, Math.PI * 2);
    jtx.arc(30, -10, 3, 0, Math.PI * 2);
    jtx.fill();

    jtx.restore();

    // flash near end
    if (p > 0.92) {
      jtx.fillStyle = `rgba(255,255,255,${(p - 0.92) * 2.6})`;
      jtx.fillRect(0, 0, W(), H());
    }
  }

  function anim(t) {
    drawMouth(t);
    if (t - start < D) requestAnimationFrame(anim);
    else {
      localStorage.setItem("wayfinder_key_dragon", "1");
      window.location.href = "/labyrinth";
    }
  }

  jtx.fillStyle = "#000";
  jtx.fillRect(0, 0, W(), H());
  requestAnimationFrame(anim);
}

function gameLoop(nowMs) {
  if (!running) return;

  if (!lastFrameMs) lastFrameMs = nowMs;
  const dt = Math.min(0.033, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;

  const elapsed = (nowMs - startMs) / 1000;
  const remaining = Math.max(0, Math.ceil(60 - elapsed));
  timeEl.textContent = String(remaining);

  spawnWyrm(nowMs);
  update(dt);
  if (!running) return;

  drawBackground(nowMs);
  for (const w of wyrms) drawWyrm(w, nowMs);
  drawArrows();
  drawArcher(nowMs);

  if (elapsed >= 60) {
    running = false;
    // WIN transition
    playWurmMouthFlyIn();
    return;
  }

  requestAnimationFrame(gameLoop);
}

// Aim
window.addEventListener("mousemove", (e) => {
  archer.x = clamp(e.clientX, 30, W() - 30);
});

// Fire
window.addEventListener("click", () => {
  if (!running) return;
  fireArrow(performance.now());
});

// Start/retry by clicking overlay
overlay.addEventListener("click", () => {
  if (!running) startGame();
});

// Keyboard start fallback
window.addEventListener("keydown", (e) => {
  if ((e.key === " " || e.key === "Enter") && !running) startGame();
});