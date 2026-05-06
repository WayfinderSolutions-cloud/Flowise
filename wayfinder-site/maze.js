const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

const COLS = 21, ROWS = 21;

function sizeCanvas() {
  const maxSize = Math.min(window.innerWidth, window.innerHeight) * 0.78;
  const SIZE = Math.floor(maxSize / COLS) * COLS;
  canvas.width = SIZE;
  canvas.height = SIZE;
  return SIZE;
}

let SIZE = sizeCanvas();
let CELL = SIZE / COLS;
let WALL = Math.max(3, Math.floor(CELL * 0.28));

const C_BG   = "#000000";
const C_WALL = "#00BB33";
const C_GLOW = "rgba(0,187,51,0.55)";
const C_PLAYER = "#00FF41";

// Grid
const grid = Array.from({length:ROWS},(_,r)=>
  Array.from({length:COLS},(_,c)=>({
    r,c,
    walls:{N:true,S:true,E:true,W:true},
    visited:false
  }))
);

const OPPOSITE={N:'S',S:'N',E:'W',W:'E'};
function cell(r,c){return grid[r]?.[c];}
function unvisitedNeighbors(r,c){
  return [
    {dir:'N',nr:r-1,nc:c},
    {dir:'S',nr:r+1,nc:c},
    {dir:'E',nr:r,nc:c+1},
    {dir:'W',nr:r,nc:c-1}
  ].filter(n=>cell(n.nr,n.nc)&&!cell(n.nr,n.nc).visited);
}

function buildMaze(sr,sc){
  const stack=[];
  cell(sr,sc).visited=true;
  stack.push({r:sr,c:sc});
  while(stack.length){
    const cur=stack[stack.length-1];
    const ns=unvisitedNeighbors(cur.r,cur.c).sort(()=>Math.random()-0.5);
    if(ns.length===0){stack.pop();continue;}
    const {dir,nr,nc}=ns[0];
    cell(cur.r,cur.c).walls[dir]=false;
    cell(nr,nc).walls[OPPOSITE[dir]]=false;
    cell(nr,nc).visited=true;
    stack.push({r:nr,c:nc});
  }
}

const MID = Math.floor(COLS/2);
buildMaze(MID, MID);

// Bottom exits
const exitLateralR = ROWS - 1, exitLateralC = 1;
const exitDragonR  = ROWS - 1, exitDragonC  = COLS - 2;
grid[exitLateralR][exitLateralC].walls.S = false;
grid[exitDragonR][exitDragonC].walls.S = false;

// Player
let player = {
  x: (MID + 0.5) * CELL,
  y: (MID + 0.5) * CELL
};

let dragging = false;
let flickerT = 0;

// Wayfinder’s Rest door placement data (canvas-local)
let restDoorRect = null; // {x,y,w,h} in canvas coords
let restDoorPlaced = false;

function drawWallSegment(x1,y1,x2,y2){
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.lineTo(x2,y2);
  ctx.stroke();
}

function drawFrame(){
  ctx.fillStyle = C_BG;
  ctx.fillRect(0,0,SIZE,SIZE);

  ctx.strokeStyle = C_WALL;
  ctx.lineWidth = WALL;
  ctx.lineCap = "square";
  ctx.shadowColor = C_GLOW;
  ctx.shadowBlur = WALL * 1.8;

  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const x=c*CELL, y=r*CELL;
      const w=grid[r][c].walls;
      if(w.N) drawWallSegment(x,y,x+CELL,y);
      if(w.S) drawWallSegment(x,y+CELL,x+CELL,y+CELL);
      if(w.W) drawWallSegment(x,y,x,y+CELL);
      if(w.E) drawWallSegment(x+CELL,y,x+CELL,y+CELL);
    }
  }

  // bottom gaps
  ctx.shadowBlur = 12;
  const ly = SIZE - WALL - 1;
  const lx = exitLateralC * CELL;
  ctx.clearRect(lx + WALL, ly, CELL - WALL*2, WALL + 2);

  const dx = exitDragonC * CELL;
  ctx.clearRect(dx + WALL, ly, CELL - WALL*2, WALL + 2);

  // player
  flickerT += 0.07;
  const flicker = 0.85 + Math.sin(flickerT) * 0.15;
  ctx.shadowColor = C_PLAYER;
  ctx.shadowBlur = CELL * 0.9 * flicker;
  ctx.fillStyle = `rgba(0,255,65,${flicker})`;
  ctx.beginPath();
  ctx.arc(player.x, player.y, CELL * 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
}

function canPass(r,c,dir){
  return grid[r]?.[c] && !grid[r][c].walls[dir];
}

function tryMove(newX,newY){
  const cr = Math.floor(player.y / CELL);
  const cc = Math.floor(player.x / CELL);
  const nr = Math.floor(newY / CELL);
  const nc = Math.floor(newX / CELL);

  if (nr === cr && nc === cc) { player.x = newX; player.y = newY; return; }

  const dr = nr - cr;
  const dc = nc - cc;

  let ok = true;
  if (dr < 0 && !canPass(cr, cc, 'N')) ok = false;
  if (dr > 0 && !canPass(cr, cc, 'S')) ok = false;
  if (dc < 0 && !canPass(cr, cc, 'W')) ok = false;
  if (dc > 0 && !canPass(cr, cc, 'E')) ok = false;

  if (ok) { player.x = newX; player.y = newY; }
}

function checkExits(){
  const c = Math.floor(player.x / CELL);

  if (player.y > SIZE - CELL*0.6 && c === exitLateralC) {
    document.getElementById("exitLateral")?.classList.add("visible");
  }
  if (player.y > SIZE - CELL*0.6 && c === exitDragonC) {
    document.getElementById("exitDragon")?.classList.add("visible");
  }
}

function farthestCellFromStart() {
  const startR = MID, startC = MID;

  const dist = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity));
  const q = [{ r: startR, c: startC }];
  dist[startR][startC] = 0;

  while (q.length) {
    const { r, c } = q.shift();
    const d = dist[r][c];
    const w = grid[r][c].walls;

    if (!w.N && dist[r-1]?.[c] > d+1) { dist[r-1][c] = d+1; q.push({ r:r-1, c }); }
    if (!w.S && dist[r+1]?.[c] > d+1) { dist[r+1][c] = d+1; q.push({ r:r+1, c }); }
    if (!w.W && dist[r]?.[c-1] > d+1) { dist[r][c-1] = d+1; q.push({ r, c:c-1 }); }
    if (!w.E && dist[r]?.[c+1] > d+1) { dist[r][c+1] = d+1; q.push({ r, c:c+1 }); }
  }

  let best = { r: startR, c: startC, d: 0 };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (dist[r][c] !== Infinity && dist[r][c] > best.d) best = { r, c, d: dist[r][c] };
    }
  }
  return best;
}

function placeRestDoorIfUnlocked() {
  const hasDragonKey = localStorage.getItem("wayfinder_key_dragon") === "1";
  const hasLateralKey = localStorage.getItem("wayfinder_key_lateral") === "1";
  const door = document.getElementById("restDoor");
  if (!door) return;

  // Reset activation each load (player must touch again each time)
  door.classList.remove("activated");

  if (!(hasDragonKey && hasLateralKey)) {
    restDoorRect = null;
    restDoorPlaced = false;
    return;
  }

  const best = farthestCellFromStart();
  const r = best.r, c = best.c;

  // place small door inside the cell, not touching walls
  const doorW = 18;
  const doorH = 24;

  const pad = Math.max(8, Math.floor(CELL * 0.22)); // keeps it away from walls
  const px = c * CELL + pad + Math.random() * (CELL - 2*pad - doorW);
  const py = r * CELL + pad + Math.random() * (CELL - 2*pad - doorH);

  restDoorRect = { x: px, y: py, w: doorW, h: doorH };
  restDoorPlaced = true;

  // convert to page coords
  const br = canvas.getBoundingClientRect();
  const sx = br.width / SIZE;
  const sy = br.height / SIZE;

  door.style.left = `${Math.round(br.left + px * sx)}px`;
  door.style.top  = `${Math.round(br.top  + py * sy)}px`;
}

function playerTouchesDoor() {
  const door = document.getElementById("restDoor");
  if (!door || !restDoorRect) return;

  // distance from player circle to door rect (AABB)
  const cx = player.x, cy = player.y;
  const rx = restDoorRect.x, ry = restDoorRect.y, rw = restDoorRect.w, rh = restDoorRect.h;

  const px = clamp(cx, rx, rx + rw);
  const py = clamp(cy, ry, ry + rh);
  const dx = cx - px, dy = cy - py;
  const hit = (dx*dx + dy*dy) <= (CELL*0.25) * (CELL*0.25);

  if (hit) {
    door.classList.add("activated");
  }
}

// clamp helper for touch test
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// Mouse controls
canvas.addEventListener("mousedown", (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (SIZE / r.width);
  const my = (e.clientY - r.top) * (SIZE / r.height);
  const dx = mx - player.x, dy = my - player.y;
  if (Math.sqrt(dx*dx + dy*dy) < CELL * 0.55) dragging = true;
});

canvas.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (SIZE / r.width);
  const my = (e.clientY - r.top) * (SIZE / r.height);

  tryMove(
    Math.max(0, Math.min(SIZE, mx)),
    Math.max(0, Math.min(SIZE, my))
  );
  checkExits();
});

canvas.addEventListener("mouseup", () => dragging = false);
canvas.addEventListener("mouseleave", () => dragging = false);

function loop(){
  drawFrame();
  // check door activation each frame (only matters if unlocked/placed)
  if (restDoorPlaced) playerTouchesDoor();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  SIZE = sizeCanvas();
  CELL = SIZE / COLS;
  WALL = Math.max(3, Math.floor(CELL * 0.28));
  placeRestDoorIfUnlocked();
});

setTimeout(placeRestDoorIfUnlocked, 80);
loop();