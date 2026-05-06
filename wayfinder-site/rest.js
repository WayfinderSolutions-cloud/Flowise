const canvas = document.getElementById("restCanvas");
const ctx = canvas.getContext("2d");

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

const ARRIVAL_MESSAGE =
  "Hello, Danj. You have arrived at the Wayfarer’s Rest—a place between places: beyond life, yet before death. Find peace here at the Rest as you pause your journey within Chronos, ever-sojourning between the worlds your light and shadow have created. Blood is the bond, but spirit is the forge. Be welcome, ancient comrade…\n\n—Steorweard, Wayfinder of the Hidden Path";

// --- background image ---
const bg = new Image();
bg.src = "/rest-tavern.png";

// Image size (your tavern)
const WORLD_W = 1216;
const WORLD_H = 672;

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

function view() {
  const s = Math.min(W() / WORLD_W, H() / WORLD_H);
  const ox = (W() - WORLD_W * s) / 2;
  const oy = (H() - WORLD_H * s) / 2;
  return { s, ox, oy };
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function rectHitCircle(cx, cy, r, rx, ry, rw, rh) {
  const px = clamp(cx, rx, rx + rw);
  const py = clamp(cy, ry, ry + rh);
  const dx = cx - px, dy = cy - py;
  return dx * dx + dy * dy <= r * r;
}

// ---------- Colliders (approx for your image) ----------
const colliders = [];
function addRect(x, y, w, h) { colliders.push({ x, y, w, h }); }

addRect(0, 0, WORLD_W, 90);
addRect(220, 120, 760, 120);
addRect(390, 240, 80, 60);
addRect(540, 240, 80, 60);
addRect(690, 240, 80, 60);
addRect(935, 80, 240, 250);

addRect(40, 250, 210, 200);
addRect(820, 290, 260, 210);
addRect(170, 500, 260, 200);
addRect(650, 520, 260, 180);

addRect(1030, 560, 170, 110);
addRect(10, 110, 90, 120);
addRect(10, 500, 90, 120);

// ---------- Player ----------
const player = {
  x: 610,
  y: 520,
  r: 18,
  speed: 210,
  dir: "down",
  moving: false
};

function isFreeSpot(x, y) {
  for (const c of colliders) {
    if (rectHitCircle(x, y, player.r, c.x, c.y, c.w, c.h)) return false;
  }
  return true;
}
function spawnPlayer() {
  const preferred = [
    { x: 610, y: 520 },
    { x: 610, y: 440 },
    { x: 520, y: 520 },
    { x: 740, y: 520 },
    { x: 610, y: 590 },
  ];
  for (const p of preferred) if (isFreeSpot(p.x, p.y)) { player.x = p.x; player.y = p.y; return; }
  for (let i = 0; i < 2000; i++) {
    const x = 60 + Math.random() * (WORLD_W - 120);
    const y = 120 + Math.random() * (WORLD_H - 180);
    if (isFreeSpot(x, y)) { player.x = x; player.y = y; return; }
  }
}
spawnPlayer();

// ---------- Chat bubble state (persistent until click) ----------
let bubble = null;
// bubble = { text, lines, persist, box:{x,y,w,h} }

function wrapTextToLines(text, maxWidthPx) {
  const paras = text.split("\n");
  const lines = [];
  for (const para of paras) {
    if (para.trim() === "") { lines.push(""); continue; }
    const words = para.split(" ");
    let cur = "";
    for (const w of words) {
      const test = cur ? (cur + " " + w) : w;
      if (ctx.measureText(test).width <= maxWidthPx) cur = test;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function showBubble(text, persist = false) {
  ctx.save();
  ctx.font = "14px 'Share Tech Mono', monospace";
  const maxWidth = Math.min(720, W() * 0.62);
  const lines = wrapTextToLines(text, maxWidth);
  ctx.restore();

  bubble = { text, lines, persist, box: null };
}

// Show arrival message every time after 3 seconds, persist until clicked
setTimeout(() => showBubble(ARRIVAL_MESSAGE, true), 3000);

function drawBubble() {
  if (!bubble) return;

  const { s, ox, oy } = view();
  const sx = ox + player.x * s;
  const sy = oy + player.y * s;

  ctx.save();
  ctx.font = "14px 'Share Tech Mono', monospace";

  const padX = 14;
  const padY = 12;
  const lineH = 18;

  const lines = bubble.lines;
  const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const w = Math.min(860, maxLineW + padX * 2);
  const h = padY * 2 + lines.length * lineH;

  let bx = sx - w / 2;
  let by = sy - (h + 64);

  const margin = 12;
  bx = clamp(bx, margin, W() - w - margin);
  by = clamp(by, margin, H() - h - margin);

  bubble.box = { x: bx, y: by, w, h };

  ctx.fillStyle = "rgba(0,0,0,0.76)";
  ctx.strokeStyle = "rgba(255,210,77,0.32)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 10);
  ctx.fill();
  ctx.stroke();

  // Tail
  if (by < sy - 24) {
    ctx.fillStyle = "rgba(0,0,0,0.76)";
    ctx.beginPath();
    ctx.moveTo(sx - 8, by + h);
    ctx.lineTo(sx + 8, by + h);
    ctx.lineTo(sx, by + h + 10);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  let ty = by + padY + 14;
  for (const line of lines) {
    ctx.fillText(line, bx + padX, ty);
    ty += lineH;
  }

  if (bubble.persist) {
    ctx.fillStyle = "rgba(0,255,65,0.35)";
    ctx.font = "12px 'Share Tech Mono', monospace";
    ctx.fillText("[click to dismiss]", bx + padX, by + h - 10);
  }

  ctx.restore();
}

// Click to dismiss persistent bubble if clicked inside it
canvas.addEventListener("mousedown", (e) => {
  if (!bubble || !bubble.persist || !bubble.box) return;
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;

  const { x, y, w, h } = bubble.box;
  if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
    bubble = null;
  }
});

// ---------- Chat UI ----------
let chatActive = false;

function openChat() {
  chatActive = true;
  keys.left = keys.right = keys.up = keys.down = false;
  chatForm.classList.add("active");
  chatInput.value = "";
  chatInput.focus();
}
function closeChat() {
  chatActive = false;
  chatForm.classList.remove("active");
  canvas.focus();
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) showBubble(text, false);
  closeChat();
});

// ---------- Keyboard movement (arrow keys) ----------
const keys = { left: false, right: false, up: false, down: false };

function setKey(e, down) {
  if (e.key === "ArrowLeft") keys.left = down;
  if (e.key === "ArrowRight") keys.right = down;
  if (e.key === "ArrowUp") keys.up = down;
  if (e.key === "ArrowDown") keys.down = down;
}

function handleKeyDown(e) {
  if (e.key.startsWith("Arrow")) e.preventDefault();

  if (e.key === "Enter") {
    if (!chatActive) { openChat(); e.preventDefault(); }
    return;
  }
  if (chatActive && e.key === "Escape") {
    closeChat(); e.preventDefault(); return;
  }

  if (!chatActive) setKey(e, true);
}

function handleKeyUp(e) {
  if (e.key.startsWith("Arrow")) e.preventDefault();
  if (!chatActive) setKey(e, false);
}

canvas.addEventListener("keydown", handleKeyDown);
canvas.addEventListener("keyup", handleKeyUp);
window.addEventListener("keydown", handleKeyDown, { passive: false });
window.addEventListener("keyup", handleKeyUp, { passive: false });

// focus so keys always work
setTimeout(() => canvas.focus(), 0);
window.addEventListener("pointerdown", () => { if (!chatActive) canvas.focus(); });

// ---------- Movement ----------
function canMoveTo(nx, ny) {
  nx = clamp(nx, player.r, WORLD_W - player.r);
  ny = clamp(ny, player.r, WORLD_H - player.r);

  for (const c of colliders) {
    if (rectHitCircle(nx, ny, player.r, c.x, c.y, c.w, c.h)) return false;
  }
  return true;
}

function update(dt) {
  if (chatActive) return;

  let vx = 0, vy = 0;
  if (keys.left)  { vx -= 1; player.dir = "left"; }
  if (keys.right) { vx += 1; player.dir = "right"; }
  if (keys.up)    { vy -= 1; player.dir = "up"; }
  if (keys.down)  { vy += 1; player.dir = "down"; }

  player.moving = !!(vx || vy);

  if (vx && vy) { vx *= 0.707; vy *= 0.707; }

  const nx = player.x + vx * player.speed * dt;
  const ny = player.y + vy * player.speed * dt;

  if (canMoveTo(nx, ny)) {
    player.x = nx; player.y = ny;
  } else {
    if (canMoveTo(nx, player.y)) player.x = nx;
    if (canMoveTo(player.x, ny)) player.y = ny;
  }
}

// ---------- Background ----------
function drawBackground() {
  const { s, ox, oy } = view();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W(), H());

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);

  if (bg.complete) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, WORLD_W, WORLD_H);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = "rgba(0,255,65,0.6)";
    ctx.font = "14px 'Share Tech Mono', monospace";
    ctx.fillText("LOADING TAVERN…", 24, 40);
  }

  ctx.restore();
}

// ---------- Procedural pixel character (the one you liked) ----------
function drawProceduralPlayer(t) {
  const { s, ox, oy } = view();
  const sx = ox + player.x * s;
  const sy = oy + player.y * s;

  const cloakA = "#31b85a";
  const cloakB = "#1f7a3a";
  const cloakC = "#155428";
  const skin = "#e7b78c";
  const hair = "#6b4b2a";
  const boots = "#2a1a10";
  const belt = "#7a5a34";

  const bob = player.moving ? (Math.sin(t / 110) * 1.2) : 0;

  ctx.save();
  ctx.translate(sx, sy + bob);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 22, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs
  ctx.fillStyle = cloakC;
  ctx.fillRect(-12, 8, 10, 12);
  ctx.fillRect(2, 8, 10, 12);

  // boots
  ctx.fillStyle = boots;
  ctx.fillRect(-13, 18, 12, 6);
  ctx.fillRect(1, 18, 12, 6);

  // cloak
  ctx.fillStyle = cloakB;
  ctx.fillRect(-14, -2, 28, 22);
  ctx.fillStyle = cloakA;
  ctx.fillRect(-13, -5, 26, 22);

  // belt
  ctx.fillStyle = belt;
  ctx.fillRect(-13, 6, 26, 3);

  // arms
  ctx.fillStyle = cloakB;
  ctx.fillRect(-20, -2, 6, 14);
  ctx.fillRect(14, -2, 6, 14);

  // head
  ctx.fillStyle = skin;
  ctx.fillRect(-8, -24, 16, 14);

  // hair fringe
  ctx.fillStyle = hair;
  ctx.fillRect(-8, -24, 16, 4);

  // hood
  ctx.fillStyle = cloakC;
  ctx.fillRect(-12, -30, 24, 8);
  ctx.fillStyle = cloakB;
  ctx.fillRect(-11, -29, 22, 6);

  // direction dot
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  if (player.dir === "left") ctx.fillRect(-11, -16, 3, 2);
  if (player.dir === "right") ctx.fillRect(8, -16, 3, 2);
  if (player.dir === "down") ctx.fillRect(-1, -12, 3, 2);

  ctx.restore();
}

// main loop
let last = performance.now();
function loop(t) {
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;

  update(dt);

  drawBackground();
  drawProceduralPlayer(t);
  drawBubble();

  requestAnimationFrame(loop);
}

bg.onload = () => {
  if (!isFreeSpot(player.x, player.y)) spawnPlayer();
};

requestAnimationFrame(loop);