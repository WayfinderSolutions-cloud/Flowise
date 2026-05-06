const canvas = document.getElementById("starCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

const coordsEl = document.getElementById("coords");
const clueList = document.getElementById("clueList");
const counterEl = document.getElementById("clueCounter");

// The 9 acrostic fragments (unchanged wording)
const clues = [
  { letter: "N", rest: "ight fades but one point holds" },
  { letter: "O", rest: "rigin of every ancient map" },
  { letter: "R", rest: "oamers fix their eyes upon it" },
  { letter: "T", rest: "rue even when all torches die" },
  { letter: "H", rest: "idden only to those who never look up" },
  { letter: "S", rest: "ilent guide of ten thousand crossings" },
  { letter: "T", rest: "ravellers name it without speaking" },
  { letter: "A", rest: "bove the tree line, it waits" },
  { letter: "R", rest: "eady for the one who knows to ask" },
];

let revealedCount = 0;

// Build clue panel rows (persist in DOM). Hidden by CSS until ".revealed".
const clueRows = clues.map((c) => {
  const row = document.createElement("div");
  row.className = "clue-line";
  row.textContent = `${c.letter}${c.rest}`; // no bolding / no special span
  clueList.appendChild(row);
  return row;
});

function updateCounter() {
  counterEl.textContent = String(revealedCount).padStart(2, "0");
}
updateCounter();

// --- Sizing ---
function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// --- Helpers ---
function rand(min, max) {
  return min + Math.random() * (max - min);
}
const W = () => window.innerWidth;
const H = () => window.innerHeight;

// --- Starting beacon star (bright, must click first) ---
const START = {
  x: () => W() * 0.18,
  y: () => H() * 0.38,
  r: 4.2,
  found: false,
};

// --- Procedural star chart content ---
const DECOY_COUNT = 220;
const DUST_COUNT = 380;

let dust = [];
let decoys = [];
let realStars = []; // 9 real clickable stars

function rebuildField() {
  dust = Array.from({ length: DUST_COUNT }, () => ({
    x: rand(0, W()),
    y: rand(0, H()),
    r: rand(0.4, 1.2),
    a: rand(0.05, 0.18),
  }));

  decoys = Array.from({ length: DECOY_COUNT }, () => ({
    x: rand(0, W()),
    y: rand(0, H()),
    r: rand(0.6, 1.8),
    a: rand(0.10, 0.55),
    tint: Math.random() < 0.8 ? "bluewhite" : "white",
  }));

  // Place 9 real stars with some spacing
  realStars = [];
  const minDist = Math.min(W(), H()) * 0.12;

  for (let i = 0; i < clues.length; i++) {
    let tries = 0;
    while (tries++ < 600) {
      const x = rand(W() * 0.12, W() * 0.88);
      const y = rand(H() * 0.12, H() * 0.78); // keep away from bottom UI
      const ok = realStars.every((s) => Math.hypot(s.x - x, s.y - y) > minDist);

      // Also keep real stars away from the START beacon a bit
      const awayFromStart = Math.hypot(x - START.x(), y - START.y()) > minDist * 0.85;

      if (ok && awayFromStart) {
        realStars.push({
          x,
          y,
          r: rand(2.2, 3.4),
          found: false,
          idx: i,
        });
        break;
      }
    }
  }
}

rebuildField();

// --- Interaction ---
let mouse = { x: 0, y: 0 };

window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  coordsEl.textContent = `X:${String(Math.floor(mouse.x)).padStart(3, "0")} Y:${String(
    Math.floor(mouse.y)
  ).padStart(3, "0")}`;
});

function nextUnfoundIndex() {
  const s = realStars.find((st) => !st.found);
  return s ? s.idx : null;
}

function canRevealStar(star) {
  if (!START.found) return false; // must click start first
  const next = nextUnfoundIndex();
  return next === star.idx; // enforce N->O->R... order
}

function starAtPoint(x, y) {
  // START beacon hit
  {
    const sx = START.x();
    const sy = START.y();
    if (Math.hypot(sx - x, sy - y) <= 18) return { kind: "start" };
  }

  // Real star hit
  for (const s of realStars) {
    if (Math.hypot(s.x - x, s.y - y) <= 14) return { kind: "real", star: s };
  }

  return null;
}

window.addEventListener("click", (e) => {
  const hit = starAtPoint(e.clientX, e.clientY);
  if (!hit) return;

  if (hit.kind === "start") {
    START.found = true;
    return;
  }

  if (hit.kind === "real") {
    const s = hit.star;
    if (s.found) return;
    if (!canRevealStar(s)) return;

    s.found = true;
    clueRows[s.idx].classList.add("revealed");
    revealedCount++;
    updateCounter();
  }
});

// --- Drawing helpers ---
function drawGlowDot(x, y, r, color, alpha = 1, blur = 16) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawNebula() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  const g1 = ctx.createRadialGradient(W() * 0.25, H() * 0.35, 10, W() * 0.25, H() * 0.35, Math.max(W(), H()) * 0.55);
  g1.addColorStop(0, "rgba(0,255,65,0.05)");
  g1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W(), H());

  const g2 = ctx.createRadialGradient(W() * 0.75, H() * 0.25, 10, W() * 0.75, H() * 0.25, Math.max(W(), H()) * 0.45);
  g2.addColorStop(0, "rgba(120,180,255,0.05)");
  g2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W(), H());

  // Milky way band
  ctx.globalAlpha = 0.07;
  ctx.translate(W() * 0.1, H() * 0.3);
  ctx.rotate(-0.15);
  ctx.fillStyle = "rgba(200,220,255,0.25)";
  ctx.fillRect(0, 0, W() * 1.2, 70);

  ctx.restore();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(0,255,65,0.06)";
  ctx.lineWidth = 1;

  const step = 90;
  for (let x = 0; x < W(); x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H());
    ctx.stroke();
  }
  for (let y = 0; y < H(); y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W(), y);
    ctx.stroke();
  }

  // Concentric rings (chart overlay)
  ctx.strokeStyle = "rgba(0,255,65,0.05)";
  const cx = W() * 0.55,
    cy = H() * 0.52;
  for (let r = 140; r < Math.max(W(), H()); r += 160) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAura(fromX, fromY, toX, toY, t) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / dist;
  const uy = dy / dist;

  // Stronger: longer and wider
  const len = Math.min(380, dist);
  const w = 140;

  // Stronger pulse
  const pulse = 0.12 + (Math.sin(t * 1.6) + 1) * 0.06;

  ctx.save();
  ctx.translate(fromX, fromY);

  // rotate so +X points toward target
  const ang = Math.atan2(uy, ux);
  ctx.rotate(ang);

  const grad = ctx.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, `rgba(0,255,65,0.0)`);
  grad.addColorStop(0.08, `rgba(0,255,65,${pulse})`);
  grad.addColorStop(0.35, `rgba(0,255,65,${pulse * 0.7})`);
  grad.addColorStop(1, `rgba(0,255,65,0.0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.55, -w * 0.55, len, 0);
  ctx.quadraticCurveTo(len * 0.55, w * 0.55, 0, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// --- Animation loop ---
let t = 0;

function draw() {
  t += 0.016;

  // Background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W(), H());

  drawNebula();
  drawGrid();

  // Dust
  for (const s of dust) {
    ctx.fillStyle = `rgba(220,255,230,${s.a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Decoys
  for (const s of decoys) {
    const col = s.tint === "bluewhite" ? `rgba(190,210,255,${s.a})` : `rgba(240,255,245,${s.a})`;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Start beacon (very bright)
  {
    const sx = START.x();
    const sy = START.y();
    const pulse = 0.80 + (Math.sin(t * 2.4) + 1) * 0.10;
    drawGlowDot(sx, sy, START.r, "#00FF41", START.found ? 0.60 : 1.0, 22);

    // extra halo ring
    ctx.save();
    ctx.globalAlpha = (START.found ? 0.16 : 0.34) * pulse;
    ctx.strokeStyle = "rgba(0,255,65,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Directional aura:
  // - before START clicked: no aura
  // - after START and before any real found: START -> first real
  // - after some found: last found -> next
  const nextIdx = nextUnfoundIndex();
  if (START.found && nextIdx != null) {
    const found = realStars.filter((s) => s.found);
    const target = realStars[nextIdx];
    if (found.length) {
      const last = found[found.length - 1];
      drawAura(last.x, last.y, target.x, target.y, t);
    } else {
      drawAura(START.x(), START.y(), target.x, target.y, t);
    }
  }

  // Real stars (render slightly greener)
  for (const s of realStars) {
    const pulse = 0.65 + (Math.sin(t * 2.2 + s.idx) + 1) * 0.18;
    const baseAlpha = s.found ? 0.95 : 0.33;
    drawGlowDot(s.x, s.y, s.r, "#00FF41", baseAlpha * pulse, 16);

    // subtle halo even if unfound
    ctx.save();
    ctx.globalAlpha = baseAlpha * 0.30;
    ctx.strokeStyle = "rgba(0,255,65,0.35)";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 2.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  requestAnimationFrame(draw);
}

draw();