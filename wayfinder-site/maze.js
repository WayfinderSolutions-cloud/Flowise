const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

const COLS = 21, ROWS = 21;

// Size canvas to fit screen nicely
const maxSize = Math.min(window.innerWidth, window.innerHeight) * 0.78;
const SIZE = Math.floor(maxSize / COLS) * COLS;
canvas.width = SIZE;
canvas.height = SIZE;
const CELL = SIZE / COLS;
const WALL = Math.max(3, Math.floor(CELL * 0.28));

const C_BG   = "#000000";
const C_WALL = "#00BB33";
const C_GLOW = "rgba(0,187,51,0.55)";
const C_PLAYER = "#00FF41";

// Build grid
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
  return [{dir:'N',nr:r-1,nc:c},{dir:'S',nr:r+1,nc:c},
          {dir:'E',nr:r,nc:c+1},{dir:'W',nr:r,nc:c-1}]
    .filter(n=>cell(n.nr,n.nc)&&!cell(n.nr,n.nc).visited);
}

// Iterative backtracker (avoids stack overflow on large grids)
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

const MID=Math.floor(COLS/2);
buildMaze(MID,MID);

// Open three exits
const exitBrowseR=0,  exitBrowseC=MID;
const exitLateralR=ROWS-1, exitLateralC=1;
const exitDragonR=ROWS-1,  exitDragonC=COLS-2;
grid[exitBrowseR][exitBrowseC].walls.N=false;
grid[exitLateralR][exitLateralC].walls.S=false;
grid[exitDragonR][exitDragonC].walls.S=false;

// Player
let player={
  r:MID, c:MID,
  x:(MID+0.5)*CELL,
  y:(MID+0.5)*CELL
};
let dragging=false;
let flickerT=0;

function drawWallSegment(x1,y1,x2,y2){
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.lineTo(x2,y2);
  ctx.stroke();
}

function draw(){
  ctx.fillStyle=C_BG;
  ctx.fillRect(0,0,SIZE,SIZE);

  // Walls
  ctx.strokeStyle=C_WALL;
  ctx.lineWidth=WALL;
  ctx.lineCap="square";
  ctx.shadowColor=C_GLOW;
  ctx.shadowBlur=WALL*1.8;

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

  // Exit markers
  ctx.strokeStyle="rgba(0,255,65,0.85)";
  ctx.lineWidth=WALL+1;
  ctx.shadowBlur=12;
  // Top
  const bx=exitBrowseC*CELL, by=0;
  ctx.clearRect(bx+WALL,by,CELL-WALL*2,WALL+2);
  // Bottom-left
  const lx=exitLateralC*CELL, ly=SIZE-WALL-1;
  ctx.clearRect(lx+WALL,ly,CELL-WALL*2,WALL+2);
  // Bottom-right
  const dx=exitDragonC*CELL;
  ctx.clearRect(dx+WALL,ly,CELL-WALL*2,WALL+2);

  // Player dot — classic arcade style
  flickerT+=0.07;
  const flicker=0.85+Math.sin(flickerT)*0.15;
  ctx.shadowColor=C_PLAYER;
  ctx.shadowBlur=CELL*0.9*flicker;
  ctx.fillStyle=`rgba(0,255,65,${flicker})`;
  ctx.beginPath();
  ctx.arc(player.x,player.y,CELL*0.25,0,Math.PI*2);
  ctx.fill();

  ctx.shadowBlur=0;
  requestAnimationFrame(draw);
}

function canPass(r,c,dir){
  return grid[r]?.[c] && !grid[r][c].walls[dir];
}

function tryMove(newX,newY){
  const cr=Math.floor(player.y/CELL);
  const cc=Math.floor(player.x/CELL);
  const nr=Math.floor(newY/CELL);
  const nc=Math.floor(newX/CELL);

  if(nr===cr && nc===cc){
    player.x=newX; player.y=newY; return;
  }

  const dr=nr-cr, dc=nc-cc;
  let r=cr,c=cc,ok=true;

  if(dr<0&&!canPass(r,c,'N')) ok=false;
  else if(dr>0&&!canPass(r,c,'S')) ok=false;
  if(dc<0&&!canPass(r,c,'W')) ok=false;
  else if(dc>0&&!canPass(r,c,'E')) ok=false;

  if(ok){ player.x=newX; player.y=newY; }
}

function checkExits(){
  const r=Math.floor(player.y/CELL);
  const c=Math.floor(player.x/CELL);

  if(player.y<CELL*0.5 && c===exitBrowseC)
    document.getElementById("exitBrowse").classList.add("visible");
  if(player.y>SIZE-CELL*0.6 && c===exitLateralC)
    document.getElementById("exitLateral").classList.add("visible");
  if(player.y>SIZE-CELL*0.6 && c===exitDragonC)
    document.getElementById("exitDragon").classList.add("visible");
}

// Mouse
canvas.addEventListener("mousedown",e=>{
  const r=canvas.getBoundingClientRect();
  const mx=(e.clientX-r.left)*(SIZE/r.width);
  const my=(e.clientY-r.top)*(SIZE/r.height);
  const dx=mx-player.x, dy=my-player.y;
  if(Math.sqrt(dx*dx+dy*dy)<CELL*0.5) dragging=true;
});

canvas.addEventListener("mousemove",e=>{
  if(!dragging)return;
  const r=canvas.getBoundingClientRect();
  const mx=(e.clientX-r.left)*(SIZE/r.width);
  const my=(e.clientY-r.top)*(SIZE/r.height);
  tryMove(
    Math.max(0,Math.min(SIZE,mx)),
    Math.max(0,Math.min(SIZE,my))
  );
  checkExits();
});

canvas.addEventListener("mouseup",()=>dragging=false);
canvas.addEventListener("mouseleave",()=>dragging=false);

// Touch support
canvas.addEventListener("touchstart",e=>{
  e.preventDefault();
  const r=canvas.getBoundingClientRect();
  const t=e.touches[0];
  const mx=(t.clientX-r.left)*(SIZE/r.width);
  const my=(t.clientY-r.top)*(SIZE/r.height);
  const dx=mx-player.x, dy=my-player.y;
  if(Math.sqrt(dx*dx+dy*dy)<CELL*0.7) dragging=true;
},{passive:false});

canvas.addEventListener("touchmove",e=>{
  e.preventDefault();
  if(!dragging)return;
  const r=canvas.getBoundingClientRect();
  const t=e.touches[0];
  tryMove(
    Math.max(0,Math.min(SIZE,(t.clientX-r.left)*(SIZE/r.width))),
    Math.max(0,Math.min(SIZE,(t.clientY-r.top)*(SIZE/r.height)))
  );
  checkExits();
},{passive:false});

canvas.addEventListener("touchend",()=>dragging=false);

draw();