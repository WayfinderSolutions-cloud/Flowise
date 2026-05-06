const canvas = document.getElementById("jumpCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const phaseEl = document.getElementById("phase");

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

function rand(min, max) { return min + Math.random() * (max - min); }

let t = 0;
const streaks = Array.from({ length: 520 }, () => ({
  a: rand(0, Math.PI * 2),
  r: rand(0, 1),
  w: rand(0.5, 1.8),
  sp: rand(0.6, 2.2),
  hue: Math.random() < 0.12 ? "blue" : "green"
}));

function draw() {
  t += 0.016;

  // fade background for trailing effect
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, W(), H());

  const cx = W() / 2;
  const cy = H() / 2;

  // subtle vortex ring / gate
  ctx.save();
  ctx.translate(cx, cy);
  const gate = 120 + Math.sin(t * 2) * 6;
  ctx.strokeStyle = "rgba(0,255,65,0.18)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(0,255,65,0.25)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(0, 0, gate, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(0,255,65,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, gate * 1.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // streaks (warp tunnel)
  for (const s of streaks) {
    s.r += 0.012 * s.sp; // accelerate outward
    if (s.r > 1.15) {
      s.r = rand(0, 0.10);
      s.a = rand(0, Math.PI * 2);
      s.sp = rand(0.6, 2.2);
      s.w = rand(0.5, 1.8);
      s.hue = Math.random() < 0.12 ? "blue" : "green";
    }

    const maxR = Math.min(W(), H()) * 0.72;
    const r1 = s.r * maxR;
    const r0 = Math.max(0, r1 - (30 + s.sp * 120) * s.r);

    const x0 = cx + Math.cos(s.a) * r0;
    const y0 = cy + Math.sin(s.a) * r0;
    const x1 = cx + Math.cos(s.a) * r1;
    const y1 = cy + Math.sin(s.a) * r1;

    const alpha = Math.min(1, s.r * 1.2);
    const col =
      s.hue === "blue"
        ? `rgba(190,210,255,${0.10 * alpha})`
        : `rgba(0,255,65,${0.22 * alpha})`;

    ctx.strokeStyle = col;
    ctx.lineWidth = s.w;
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  // center “pin” star
  ctx.fillStyle = "rgba(0,255,65,0.9)";
  ctx.shadowColor = "rgba(0,255,65,0.9)";
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.2 + Math.sin(t * 10) * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  requestAnimationFrame(draw);
}

function start() {
  // start with a solid black frame
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W(), H());
  draw();
}
start();

// progress text + redirect
const DURATION_MS = 2600;
const startMs = performance.now();

function tickProgress(now) {
  const p = Math.min(1, (now - startMs) / DURATION_MS);
  phaseEl.textContent = `CHARGE: ${String(Math.floor(p * 100)).padStart(2, "0")}%`;

  if (p < 1) requestAnimationFrame(tickProgress);
  else window.location.href = "/labyrinth";
}
requestAnimationFrame(tickProgress);