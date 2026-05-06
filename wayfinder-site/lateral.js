const canvas = document.getElementById("lateralCanvas");
const ctx = canvas.getContext("2d");

const heartsEl = document.getElementById("hearts");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySub = document.getElementById("overlaySub");

function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const W = () => window.innerWidth;
const H = () => window.innerHeight;

let running = false;
let lastMs = 0;

const GAME_W = 1200;
const GAME_H = 720;

// camera maps world->screen with scaling
function view() {
  const sx = W() / GAME_W;
  const sy = H() / GAME_H;
  const s = Math.min(sx, sy);
  const ox = (W() - GAME_W * s) / 2;
  const oy = (H() - GAME_H * s) / 2;
  return { s, ox, oy };
}

// helpers
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function rect(x, y, w, h) {
  return { x, y, w, h };
}
function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
  const px = clamp(cx, rx, rx + rw);
  const py = clamp(cy, ry, ry + rh);
  const dx = cx - px,
    dy = cy - py;
  return dx * dx + dy * dy <= cr * cr;
}

// player
const player = {
  x: 70,
  y: GAME_H / 2,
  r: 12,
  speed: 240,
  hearts: 3,
  invulnMs: 0,
};

// obstacles
const walls = [];
const tents = []; // tents are obstacles only in this version

// ---- Wyrm hazard tuning (mechanics unchanged) ----
const WyrmConfig = {
  intervalMs: 2600, // how often a new emergence is scheduled
  warnMs: 900, // target marker time
  surfaceMs: 2000, // roam duration
  radius: 18, // collision radius vs player
  roamSpeed: 90, // world units/sec
  arenaRadius: 85, // roam distance from emergence point
};

let nextSpawnMs = 0;

// Entities
let targets = []; // {x,y,emergeMs,active}
let wyrms = []; // {x,y,x0,y0,vx,vy,spawnMs,despawnMs,alive,phase}
let effects = []; // {x,y,lifeMs,kind} kind: "dust" | "hit"

// input
const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key)) {
    e.preventDefault();
  }
  keys.add(e.key);
  if (!running && e.key === "Enter") startGame();
});
window.addEventListener("keyup", (e) => keys.delete(e.key));

function buildCamp() {
  walls.length = 0;
  tents.length = 0;

  // broad “labyrinth” fences (roomy)
  walls.push(rect(250, 60, 22, 240));
  walls.push(rect(250, 420, 22, 240));

  walls.push(rect(520, 0, 22, 210));
  walls.push(rect(520, 300, 22, 420));

  walls.push(rect(780, 60, 22, 260));
  walls.push(rect(780, 420, 22, 240));

  walls.push(rect(980, 0, 22, 290));
  walls.push(rect(980, 380, 22, 340));

  // tents
  const tentData = [
    [120, 110],
    [120, 500],
    [340, 330],
    [340, 110],
    [600, 150],
    [600, 520],
    [710, 330],
    [870, 140],
    [870, 540],
    [1060, 210],
    [1060, 480],
  ];
  for (const [x, y] of tentData) {
    tents.push({ x, y, w: 86, h: 64 });
  }
}
buildCamp();

function updateHearts() {
  heartsEl.textContent = "♥".repeat(Math.max(0, player.hearts));
}

function setOverlay(visible, title, sub) {
  overlay.style.display = visible ? "grid" : "none";
  overlayTitle.textContent = title || "";
  overlaySub.textContent = sub || "";
}

function resetGame() {
  player.x = 70;
  player.y = GAME_H / 2;
  player.hearts = 3;
  player.invulnMs = 0;

  targets = [];
  wyrms = [];
  effects = [];

  updateHearts();
}

function startGame() {
  resetGame();
  running = true;
  lastMs = performance.now();
  nextSpawnMs = lastMs + 700;
  setOverlay(false);
  requestAnimationFrame(loop);
}

function endLoss(msg) {
  running = false;
  setOverlay(true, "LATERAL MOVEMENT", msg + " Press Enter to retry.");
}

function endWin() {
  running = false;
  localStorage.setItem("wayfinder_key_lateral", "1");
  setOverlay(true, "LATERAL MOVEMENT", "WIN. LATERAL KEY ACQUIRED. Returning…");
  setTimeout(() => (window.location.href = "/labyrinth"), 1200);
}

function tryMove(nx, ny) {
  nx = clamp(nx, player.r, GAME_W - player.r);
  ny = clamp(ny, player.r, GAME_H - player.r);

  for (const w of walls) if (circleRectHit(nx, ny, player.r, w.x, w.y, w.w, w.h)) return;
  for (const t of tents) if (circleRectHit(nx, ny, player.r, t.x, t.y, t.w, t.h)) return;

  player.x = nx;
  player.y = ny;
}

function scheduleWyrm(nowMs) {
  if (nowMs < nextSpawnMs) return;
  nextSpawnMs = nowMs + WyrmConfig.intervalMs;

  const x = 140 + Math.random() * (GAME_W - 280);
  const y = 120 + Math.random() * (GAME_H - 240);

  targets.push({ x, y, emergeMs: nowMs + WyrmConfig.warnMs, active: true });

  const angle = Math.random() * Math.PI * 2;
  wyrms.push({
    x,
    y,
    x0: x,
    y0: y,
    vx: Math.cos(angle) * WyrmConfig.roamSpeed,
    vy: Math.sin(angle) * WyrmConfig.roamSpeed,
    spawnMs: nowMs + WyrmConfig.warnMs,
    despawnMs: nowMs + WyrmConfig.warnMs + WyrmConfig.surfaceMs,
    alive: true,
    phase: "emerging",
  });
}

function spawnDust(x, y) {
  effects.push({ x, y, lifeMs: 260, kind: "dust" });
}

function spawnHit(x, y) {
  effects.push({ x, y, lifeMs: 220, kind: "hit" });
}

function updateWyrms(nowMs, dtMs) {
  // targets -> dust on emergence
  for (const tg of targets) {
    if (!tg.active) continue;
    if (nowMs >= tg.emergeMs) {
      tg.active = false;
      spawnDust(tg.x, tg.y);
    }
  }
  targets = targets.filter((t) => t.active);

  for (const w of wyrms) {
    if (!w.alive) continue;

    if (nowMs < w.spawnMs) continue; // not yet emerged

    if (nowMs >= w.despawnMs) {
      if (w.phase !== "tunneling") {
        w.phase = "tunneling";
        spawnDust(w.x, w.y);
      }
      w.alive = false;
      continue;
    }

    w.phase = "roaming";

    const dt = dtMs / 1000;
    w.x += w.vx * dt;
    w.y += w.vy * dt;

    // steer inside local arena
    const dx = w.x - w.x0;
    const dy = w.y - w.y0;
    const dist = Math.hypot(dx, dy);

    if (dist > WyrmConfig.arenaRadius) {
      const ux = dx / dist;
      const uy = dy / dist;
      w.vx += -ux * 120 * dt;
      w.vy += -uy * 120 * dt;
    }

    // bounce off world bounds
    if (w.x < 40) {
      w.x = 40;
      w.vx *= -1;
    }
    if (w.x > GAME_W - 40) {
      w.x = GAME_W - 40;
      w.vx *= -1;
    }
    if (w.y < 60) {
      w.y = 60;
      w.vy *= -1;
    }
    if (w.y > GAME_H - 60) {
      w.y = GAME_H - 60;
      w.vy *= -1;
    }
  }

  // keep not-yet-emerged, remove tunneled
  wyrms = wyrms.filter((w) => w.alive || nowMs < w.spawnMs);
}

function checkPlayerWyrmDamage(nowMs) {
  if (player.invulnMs > 0) return;

  for (const w of wyrms) {
    if (nowMs < w.spawnMs) continue;
    if (w.phase !== "roaming") continue;

    const d = Math.hypot(player.x - w.x, player.y - w.y);
    if (d <= player.r + WyrmConfig.radius) {
      player.hearts -= 1;
      player.invulnMs = 900;
      updateHearts();
      spawnHit(player.x, player.y);

      if (player.hearts <= 0) {
        endLoss("YOU WERE DRAGGED UNDER.");
      }
      return;
    }
  }
}

// --------------------
// Rendering (32-bit)
// --------------------
function drawBackground() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W(), H());

  const { s, ox, oy } = view();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);

  // rich ground gradient + haze + vignette
  const g = ctx.createLinearGradient(0, 0, 0, GAME_H);
  g.addColorStop(0, "rgba(12,16,22,1)");
  g.addColorStop(0.55, "rgba(6,10,12,1)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  ctx.fillStyle = "rgba(0,255,65,0.03)";
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // subtle grid
  ctx.strokeStyle = "rgba(0,255,65,0.025)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= GAME_W; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GAME_H);
    ctx.stroke();
  }
  for (let y = 0; y <= GAME_H; y += 96) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(GAME_W, y);
    ctx.stroke();
  }

  // start/goal zones
  ctx.fillStyle = "rgba(77,252,255,0.07)";
  ctx.fillRect(0, 0, 90, GAME_H);

  ctx.fillStyle = "rgba(255,210,77,0.06)";
  ctx.fillRect(GAME_W - 90, 0, 90, GAME_H);

  const vg = ctx.createRadialGradient(
    GAME_W * 0.55,
    GAME_H * 0.55,
    120,
    GAME_W * 0.55,
    GAME_H * 0.55,
    Math.max(GAME_W, GAME_H) * 0.75
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  ctx.restore();
}

function drawFence(w) {
  ctx.save();

  const g = ctx.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
  g.addColorStop(0, "rgba(0,255,65,0.06)");
  g.addColorStop(1, "rgba(0,255,65,0.12)");
  ctx.fillStyle = g;
  ctx.fillRect(w.x, w.y, w.w, w.h);

  ctx.shadowColor = "rgba(0,255,65,0.18)";
  ctx.shadowBlur = 16;

  ctx.strokeStyle = "rgba(0,255,65,0.40)";
  ctx.lineWidth = 2;
  ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);

  ctx.restore();
}

function drawTent(t, nowMs) {
  const x = t.x,
    y = t.y,
    w = t.w,
    h = t.h;

  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, "rgba(0,255,65,0.10)");
  body.addColorStop(1, "rgba(0,255,65,0.05)");
  ctx.fillStyle = body;
  ctx.fillRect(x, y, w, h);

  const roof = ctx.createLinearGradient(x, y, x, y + h);
  roof.addColorStop(0, "rgba(0,255,65,0.14)");
  roof.addColorStop(1, "rgba(0,255,65,0.04)");

  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fillStyle = roof;
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(0,255,65,0.12)";
  ctx.shadowBlur = 10;

  ctx.strokeStyle = "rgba(0,255,65,0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();

  // door
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x + w * 0.43, y + h * 0.52, w * 0.14, h * 0.40);

  // stakes
  ctx.strokeStyle = "rgba(255,210,77,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + h + 6);
  ctx.lineTo(x + 8, y + h - 8);
  ctx.moveTo(x + w - 8, y + h + 6);
  ctx.lineTo(x + w - 8, y + h - 8);
  ctx.stroke();

  ctx.restore();
}

function drawTargetMarker(tg, nowMs) {
  const pulse = 0.55 + (Math.sin(nowMs / 110) + 1) * 0.18;

  ctx.save();
  ctx.shadowColor = "rgba(255,210,77,0.35)";
  ctx.shadowBlur = 18;

  ctx.strokeStyle = `rgba(255,210,77,${0.65 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(tg.x, tg.y, 18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255,140,80,${0.45 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tg.x, tg.y, 9, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255,210,77,${0.40 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tg.x - 26, tg.y);
  ctx.lineTo(tg.x + 26, tg.y);
  ctx.moveTo(tg.x, tg.y - 26);
  ctx.lineTo(tg.x, tg.y + 26);
  ctx.stroke();

  ctx.restore();
}

function drawDust(e) {
  const a = clamp(e.lifeMs / 260, 0, 1);

  ctx.save();
  ctx.globalAlpha = a;

  ctx.strokeStyle = "rgba(255,210,77,0.25)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(e.x, e.y, 16 + (1 - a) * 34, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,140,80,0.08)";
  ctx.beginPath();
  ctx.arc(e.x, e.y, 18 + (1 - a) * 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHit(e) {
  const a = clamp(e.lifeMs / 220, 0, 1);

  ctx.save();
  ctx.globalAlpha = a;

  ctx.shadowColor = "rgba(255,60,60,0.45)";
  ctx.shadowBlur = 14;

  ctx.strokeStyle = "rgba(255,60,60,0.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(e.x, e.y, 10 + (1 - a) * 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// Wyrm: “teeth propelled” + long segmented body
function drawWyrm(w, nowMs) {
  if (nowMs < w.spawnMs) return;

  const pulse = 0.70 + (Math.sin(nowMs / 90 + w.x * 0.01) + 1) * 0.12;

  // direction from velocity
  const sp = Math.hypot(w.vx, w.vy) || 1;
  const ux = w.vx / sp;
  const uy = w.vy / sp;

  // perpendicular
  const px = -uy;
  const py = ux;

  // big maw + long body
  const headR = 26;
  const bodyLen = 220;
  const segCount = 12;
  const segStep = bodyLen / segCount;

  // quick motion wiggle
  const wig = Math.sin(nowMs / 80 + w.x0 * 0.01) * 6;

  ctx.save();
  ctx.shadowColor = "rgba(255,210,77,0.25)";
  ctx.shadowBlur = 16;

  // body segments
  for (let i = 0; i < segCount; i++) {
    const t = i / segCount;
    const r = 18 - t * 10;

    const bx =
      w.x - ux * (i * segStep) + px * Math.sin(nowMs / 110 + i * 0.6) * (3 + t * 6);
    const by =
      w.y - uy * (i * segStep) + py * Math.sin(nowMs / 110 + i * 0.6) * (3 + t * 6);

    const grad = ctx.createRadialGradient(bx - ux * 4, by - uy * 4, 4, bx, by, r * 1.4);
    grad.addColorStop(0, `rgba(255,140,80,${0.18 * pulse})`);
    grad.addColorStop(1, `rgba(70,20,10,${0.10 * pulse})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(255,210,77,${0.16 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // head center
  const hx = w.x + px * (wig * 0.15);
  const hy = w.y + py * (wig * 0.15);

  // outer jaw ring
  ctx.strokeStyle = `rgba(255,210,77,${0.55 * pulse})`;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(hx, hy, headR, 0, Math.PI * 2);
  ctx.stroke();

  // inner darkness
  ctx.fillStyle = `rgba(0,0,0,${0.35 * pulse})`;
  ctx.beginPath();
  ctx.arc(hx, hy, headR - 7, 0, Math.PI * 2);
  ctx.fill();

  // teeth ring
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

    ctx.fillStyle = `rgba(255,245,230,${0.55 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(tx0, ty0);
    ctx.lineTo(tx1, ty1);
    ctx.lineTo(ttipx, ttipy);
    ctx.closePath();
    ctx.fill();
  }

  // eyes
  const ex = hx + ux * 10 + px * 9;
  const ey = hy + uy * 10 + py * 9;
  ctx.fillStyle = `rgba(255,210,77,${0.70 * pulse})`;
  ctx.shadowColor = "rgba(255,210,77,0.45)";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(ex, ey, 3.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawPlayer(nowMs) {
  const inv = player.invulnMs > 0;
  const pulse = 0.70 + (Math.sin(nowMs / 90) + 1) * 0.12;

  ctx.save();
  ctx.shadowBlur = 18;

  ctx.fillStyle = inv ? `rgba(77,252,255,${0.55 * pulse})` : "rgba(0,255,65,0.92)";
  ctx.shadowColor = inv ? "rgba(77,252,255,0.55)" : "rgba(0,255,65,0.45)";

  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.fill();

  // spear (metal under-stroke + green over-stroke)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(220,255,235,0.35)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(player.x + 19, player.y - 15);
  ctx.lineTo(player.x - 19, player.y + 15);
  ctx.stroke();

  ctx.strokeStyle = inv ? "rgba(77,252,255,0.95)" : "rgba(0,255,65,0.85)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(player.x + 19, player.y - 15);
  ctx.lineTo(player.x - 19, player.y + 15);
  ctx.stroke();

  // spear tip
  ctx.fillStyle = "rgba(255,210,77,0.22)";
  ctx.beginPath();
  ctx.moveTo(player.x + 25, player.y - 21);
  ctx.lineTo(player.x + 33, player.y - 13);
  ctx.lineTo(player.x + 23, player.y - 7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawWorld(nowMs) {
  const { s, ox, oy } = view();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);

  for (const w of walls) drawFence(w);
  for (const t of tents) drawTent(t, nowMs);

  for (const tg of targets) if (tg.active) drawTargetMarker(tg, nowMs);

  for (const e of effects) if (e.kind === "dust") drawDust(e);

  for (const w of wyrms) drawWyrm(w, nowMs);

  for (const e of effects) if (e.kind === "hit") drawHit(e);

  drawPlayer(nowMs);

  ctx.fillStyle = "rgba(255,210,77,0.70)";
  ctx.font = "13px 'Share Tech Mono', monospace";
  ctx.fillText("EAST EXIT →", GAME_W - 150, 30);

  ctx.restore();
}

// main loop
function loop(nowMs) {
  if (!running) return;

  const dtMs = Math.min(33, nowMs - lastMs);
  const dt = dtMs / 1000;
  lastMs = nowMs;

  player.invulnMs = Math.max(0, player.invulnMs - dtMs);

  // movement
  let vx = 0,
    vy = 0;
  if (keys.has("ArrowLeft")) vx -= 1;
  if (keys.has("ArrowRight")) vx += 1;
  if (keys.has("ArrowUp")) vy -= 1;
  if (keys.has("ArrowDown")) vy += 1;
  if (vx && vy) {
    vx *= 0.707;
    vy *= 0.707;
  }
  tryMove(player.x + vx * player.speed * dt, player.y + vy * player.speed * dt);

  // schedule + update wyrms
  scheduleWyrm(nowMs);
  updateWyrms(nowMs, dtMs);

  // collisions
  checkPlayerWyrmDamage(nowMs);
  if (!running) return;

  // effects decay
  for (const e of effects) e.lifeMs -= dtMs;
  effects = effects.filter((e) => e.lifeMs > 0);

  // win condition
  if (player.x >= GAME_W - 90) endWin();

  drawBackground();
  drawWorld(nowMs);

  requestAnimationFrame(loop);
}

// overlay start
overlay.addEventListener("click", () => {
  if (!running) startGame();
});
setOverlay(true, "LATERAL MOVEMENT", "Arrow keys to run. Avoid emergence zones. Cross the camp.");
updateHearts();