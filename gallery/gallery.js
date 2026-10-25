// 𝓛𝓕𝓖 agent art studio · walk-through gallery
// Static, no build step. three.js is vendored in ./vendor (MIT).
import * as THREE from "three";
import { DROPS, TEST_PIECES, EMPTY_FRAMES_AHEAD } from "./drops.js";

const C = { bg: "#140a1f", ink: "#f3ecdf", green: "#7dff3a", orange: "#ff7a1a", purple: "#8a3cff", gold: "#e8b830", muted: "#c9b9e6" };
const PALETTE = [C.green, C.orange, C.purple, C.gold];
const FONT_PAINT = '"FingerPaint","Comic Sans MS","Noto Sans Math",cursive';
const FONT_BANG = '"Bangers",Impact,sans-serif';
const FONT_HAND = '"GochiHand","Comic Sans MS",cursive';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia("(pointer:coarse)").matches || "ontouchstart" in window;
if (isTouch) document.body.classList.add("touch");

// ---------- tiny seeded random so the room looks the same every visit ----------
let seed = 20261024;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rr = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---------- loading progress ----------
let loadTotal = 1, loadDone = 0;
function progress(msg) {
  loadDone++;
  $("bar").firstElementChild.style.width = Math.min(100, Math.round((loadDone / loadTotal) * 100)) + "%";
  if (msg) $("loadmsg").textContent = msg;
}

// ---------- WebGL check ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $("scene"), antialias: true, powerPreference: "high-performance" });
} catch (e) {
  $("nogl").style.display = "grid";
  $("loading").classList.add("done");
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const MAX_ANISO = Math.min(4, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
scene.fog = new THREE.Fog(0x1a0d28, 14, 34);
const camera = new THREE.PerspectiveCamera(isTouch ? 72 : 66, innerWidth / innerHeight, 0.05, 80);

// =====================================================================
// Canvas painting helpers (everything is hand-"painted" at runtime)
// =====================================================================
function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function tex(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// one wobbly brush stroke
function stroke(ctx, x, y, len, ang, width, color, alpha) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = hexA(color, alpha); ctx.lineCap = "round"; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(-len / 2, 0);
  ctx.bezierCurveTo(-len / 6, rr(-width, width), len / 6, rr(-width, width), len / 2, rr(-width / 2, width / 2));
  ctx.stroke();
  // bristle streaks
  ctx.lineWidth = Math.max(1, width / 7);
  for (let i = 0; i < 4; i++) {
    const o = rr(-width / 2.4, width / 2.4);
    ctx.strokeStyle = hexA(rnd() < 0.5 ? "#000000" : "#ffffff", alpha * 0.18);
    ctx.beginPath(); ctx.moveTo(-len / 2 + rr(0, len * 0.2), o); ctx.lineTo(len / 2 - rr(0, len * 0.2), o + rr(-2, 2)); ctx.stroke();
  }
  ctx.restore();
}
// draw fn at x,y and wrapped copies so tiling textures are seamless
function wrapDraw(w, h, x, y, pad, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    const X = x + dx, Y = y + dy;
    if (X > -pad && X < w + pad && Y > -pad && Y < h + pad) fn(X, Y);
  }
}
function speckle(ctx, w, h, n, colors, maxR, alpha) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = hexA(pick(colors), rr(alpha * 0.3, alpha));
    const r = rr(0.4, maxR);
    ctx.beginPath(); ctx.arc(rr(0, w), rr(0, h), r, 0, 7); ctx.fill();
  }
}
function splat(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = rr(0, 7), d = rr(r * 0.9, r * 2.4);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr(r * 0.08, r * 0.3), 0, 7); ctx.fill();
  }
}
function heart(ctx, x, y, s, color, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, 0.35);
  ctx.bezierCurveTo(-0.9, -0.25, -0.45, -0.95, 0, -0.45);
  ctx.bezierCurveTo(0.45, -0.95, 0.9, -0.25, 0, 0.35);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 0.06; ctx.stroke();
  ctx.restore();
}
// painted lettering: shadow pass + jittered passes + a few drips
function paintText(ctx, text, x, y, font, color, opts = {}) {
  const { shadow = C.purple, shadow2 = null, drips = 3, align = "center", jitter = 2.2, maxWidth } = opts;
  ctx.save();
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = "middle";
  if (maxWidth) {
    const m = ctx.measureText(text).width;
    if (m > maxWidth) { const sz = parseFloat(font) * maxWidth / m; ctx.font = font.replace(/[\d.]+px/, sz.toFixed(1) + "px"); }
  }
  const size = parseFloat(ctx.font.match(/([\d.]+)px/)[1]);
  if (shadow2) { ctx.fillStyle = shadow2; ctx.fillText(text, x - size * 0.05, y + size * 0.03); }
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(text, x + size * 0.07, y + size * 0.07); }
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = i === 0 ? 1 : 0.45;
    ctx.fillStyle = color;
    ctx.fillText(text, x + rr(-jitter, jitter), y + rr(-jitter, jitter));
  }
  ctx.globalAlpha = 1;
  // drips
  const w = ctx.measureText(text).width;
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.fillStyle = color;
  for (let i = 0; i < drips; i++) {
    const dx = left + rr(0.08, 0.92) * w, len = rr(size * 0.15, size * 0.55), dw = rr(size * 0.03, size * 0.06);
    const top = y + size * 0.28;
    ctx.beginPath();
    ctx.moveTo(dx - dw / 2, top); ctx.lineTo(dx + dw / 2, top); ctx.lineTo(dx + dw / 2, top + len);
    ctx.arc(dx, top + len, dw / 2 + 1, 0, Math.PI); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---------- surface textures ----------
function wallTexture() {
  const S = 512, c = makeCanvas(S, S), x = c.getContext("2d");
  x.fillStyle = "#2b1544"; x.fillRect(0, 0, S, S);
  const cols = ["#3a1d5c", "#24113a", "#4a2470", "#2f1850", "#1c0d2e", "#5a2a7e"];
  for (let i = 0; i < 520; i++) {
    const px = rr(0, S), py = rr(0, S), len = rr(40, 150), ang = rr(-0.5, 0.5) + (rnd() < 0.3 ? Math.PI / 2 : 0), wd = rr(10, 30), col = pick(cols), a = rr(0.25, 0.6);
    wrapDraw(S, S, px, py, 160, (X, Y) => stroke(x, X, Y, len, ang, wd, col, a));
  }
  // rare neon flecks
  for (let i = 0; i < 26; i++) {
    const px = rr(0, S), py = rr(0, S), col = pick(PALETTE), len = rr(8, 26), ang = rr(0, 3);
    wrapDraw(S, S, px, py, 30, (X, Y) => stroke(x, X, Y, len, ang, rr(2, 5), col, rr(0.25, 0.5)));
  }
  speckle(x, S, S, 1400, ["#000000", "#ffffff"], 1.2, 0.12);
  return tex(c, [1, 1]);
}
function floorTexture() {
  const S = 1024, c = makeCanvas(S, S), x = c.getContext("2d");
  x.fillStyle = "#2a1a17"; x.fillRect(0, 0, S, S);
  const planks = 8, ph = S / planks;
  const woods = ["#3b2620", "#33201c", "#45291f", "#2e1c1a", "#3f2a26"];
  for (let p = 0; p < planks; p++) {
    x.fillStyle = pick(woods); x.fillRect(0, p * ph, S, ph);
    for (let i = 0; i < 70; i++) {
      const px = rr(0, S), py = p * ph + rr(6, ph - 6);
      wrapDraw(S, S, px, py, 200, (X, Y) => stroke(x, X, Y, rr(120, 320), rr(-0.03, 0.03), rr(4, 14), pick(["#4d3127", "#241513", "#523429", "#1e1110"]), rr(0.25, 0.55)));
    }
    x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(0, p * ph - 2, S, 4);
    const cut = rr(0, S); x.fillRect(cut, p * ph, 4, ph);
  }
  // paint splatters & drips from years of studio work
  for (let i = 0; i < 46; i++) {
    const col = hexA(pick(PALETTE), rr(0.55, 0.9)), px = rr(0, S), py = rr(0, S), r = rr(3, 14);
    wrapDraw(S, S, px, py, 60, (X, Y) => splat(x, X, Y, r, col));
  }
  for (let i = 0; i < 18; i++) {
    const px = rr(0, S), py = rr(0, S), col = pick(PALETTE), len = rr(40, 110), ang = rr(0, 3);
    wrapDraw(S, S, px, py, 80, (X, Y) => stroke(x, X, Y, len, ang, rr(4, 9), col, 0.55));
  }
  speckle(x, S, S, 2600, ["#000000", "#ffffff"], 1.3, 0.12);
  return tex(c, [1, 1]);
}
function ceilingTexture() {
  const S = 512, c = makeCanvas(S, S), x = c.getContext("2d");
  x.fillStyle = "#170b24"; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const px = rr(0, S), py = rr(0, S);
    wrapDraw(S, S, px, py, 120, (X, Y) => stroke(x, X, Y, rr(50, 140), rr(0, 3), rr(10, 24), pick(["#22102f", "#120819", "#2a1440"]), 0.5));
  }
  for (let i = 0; i < 40; i++) { x.fillStyle = hexA(pick([C.gold, C.green, "#ffffff"]), rr(0.25, 0.7)); x.beginPath(); x.arc(rr(0, S), rr(0, S), rr(0.8, 2.2), 0, 7); x.fill(); }
  return tex(c, [1, 1]);
}
function frameWoodTexture(base, accent) {
  const c = makeCanvas(256, 64), x = c.getContext("2d");
  x.fillStyle = base; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 70; i++) stroke(x, rr(0, 256), rr(0, 64), rr(30, 110), rr(-0.08, 0.08), rr(4, 12), pick([base, accent, "#000000", "#ffffff"]), rr(0.15, 0.45));
  speckle(x, 256, 64, 200, ["#000000"], 1, 0.25);
  return tex(c);
}
function stripTexture() {
  // timeline rail painted along the side walls
  const W = 1024, H = 64, c = makeCanvas(W, H), x = c.getContext("2d");
  x.lineCap = "round";
  x.strokeStyle = hexA(C.green, 0.95); x.lineWidth = 9;
  x.beginPath(); x.moveTo(0, 32);
  for (let i = 0; i <= W; i += 16) x.lineTo(i, 32 + Math.sin(i / W * Math.PI * 2 * 9) * 4 + (i > 0 && i < W ? rr(-1.5, 1.5) : 0));
  x.stroke();
  x.strokeStyle = hexA(C.orange, 0.9); x.lineWidth = 5; x.setLineDash([24, 40]);
  x.beginPath(); x.moveTo(0, 45); for (let i = 0; i <= W; i += 16) x.lineTo(i, 45 + Math.sin(i / W * Math.PI * 2 * 6) * 3); x.stroke();
  x.setLineDash([]);
  return tex(c, [1, 1]);
}

// ---------- big painted wall words ----------
function wallWords(lines, w = 1024, h = 512) {
  const c = makeCanvas(w, h), x = c.getContext("2d");
  for (const l of lines) {
    if (l.hearts) { l.hearts.forEach((hh) => heart(x, hh[0], hh[1], hh[2], hh[3], hh[4] || 0)); continue; }
    paintText(x, l.text, l.x ?? w / 2, l.y, l.font, l.color, l.opts);
  }
  return tex(c);
}

// ---------- placards ----------
function placardTexture(p) {
  const W = 512, H = 256, c = makeCanvas(W, H), x = c.getContext("2d");
  // painted paper card
  x.fillStyle = p.empty ? "#2a1840" : "#f4ead4"; x.fillRect(0, 0, W, H);
  const paperCols = p.empty ? ["#352050", "#20112f", "#3d2560"] : ["#efe2c4", "#fbf3e1", "#e6d6b3"];
  for (let i = 0; i < 90; i++) stroke(x, rr(0, W), rr(0, H), rr(40, 160), rr(-0.2, 0.2), rr(8, 22), pick(paperCols), 0.5);
  // wobbly border
  x.strokeStyle = p.border; x.lineWidth = 9; x.lineJoin = "round";
  x.beginPath(); x.moveTo(10 + rr(-3, 3), 10 + rr(-3, 3));
  x.lineTo(W - 10 + rr(-3, 3), 9 + rr(-3, 3)); x.lineTo(W - 11 + rr(-3, 3), H - 10 + rr(-3, 3)); x.lineTo(9 + rr(-3, 3), H - 11 + rr(-3, 3)); x.closePath(); x.stroke();
  const ink = p.empty ? C.ink : "#24113a";
  paintText(x, p.badge, 30, 46, `46px ${FONT_BANG}`, p.badgeColor, { align: "left", shadow: p.empty ? "#000" : "#24113a", drips: 0, jitter: 0.8 });
  if (p.right) paintText(x, p.right, W - 30, 46, `30px ${FONT_HAND}`, p.empty ? C.muted : "#5a2a7e", { align: "right", shadow: null, drips: 0, jitter: 0.4 });
  paintText(x, p.title, W / 2, 112, `46px ${FONT_PAINT}`, p.empty ? C.gold : "#c94f00", { shadow: p.empty ? C.purple : "rgba(36,17,58,.35)", drips: p.empty ? 2 : 1, jitter: 0.8, maxWidth: W - 60 });
  // artist line(s), wrapped
  x.font = `29px ${FONT_HAND}`; x.fillStyle = ink; x.textAlign = "center"; x.textBaseline = "middle";
  const words = (p.line || "").split(" "); const lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (x.measureText(t).width > W - 60 && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  lines.slice(0, 3).forEach((l, i) => x.fillText(l, W / 2, 165 + i * 32 - (lines.length > 2 ? 10 : 0)));
  if (!p.empty) heart(x, W - 34, H - 30, 18, C.green, 0.2);
  return tex(c);
}

function emptyArtTexture(n) {
  const W = 384, H = 512, c = makeCanvas(W, H), x = c.getContext("2d");
  x.fillStyle = "#efe5cf"; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 120; i++) stroke(x, rr(0, W), rr(0, H), rr(40, 160), rr(-0.4, 0.4), rr(10, 26), pick(["#e8dcc0", "#f7efdc", "#ddcfae"]), 0.5);
  // rough sketch marks
  x.strokeStyle = hexA(C.purple, 0.5); x.lineWidth = 3; x.setLineDash([14, 10]);
  x.strokeRect(34 + rr(-4, 4), 34 + rr(-4, 4), W - 68, H - 68); x.setLineDash([]);
  paintText(x, "?", W / 2, H / 2 - 50, `200px ${FONT_PAINT}`, pick([C.purple, C.orange, "#2fa000"]), { shadow: hexA(C.gold, 0.8), drips: 2, jitter: 2 });
  paintText(x, `#${String(n).padStart(3, "0")}`, W / 2, H / 2 + 100, `64px ${FONT_BANG}`, "#24113a", { shadow: hexA(C.green, 0.9), drips: 0 });
  paintText(x, "next drop", W / 2, H / 2 + 162, `38px ${FONT_HAND}`, "#5a2a7e", { shadow: null, drips: 0 });
  paintText(x, "coming…", W / 2, H / 2 + 198, `38px ${FONT_HAND}`, "#5a2a7e", { shadow: null, drips: 0 });
  return tex(c);
}

function glowTexture(color) {
  const c = makeCanvas(128, 128), x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, hexA(color, 0.55)); g.addColorStop(0.5, hexA(color, 0.16)); g.addColorStop(1, hexA(color, 0));
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// load an image and downscale to ≤1024px for the GPU
function loadArt(url) {
  return new Promise((res) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const s = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      const c = makeCanvas(w, h); c.getContext("2d").drawImage(img, 0, 0, w, h);
      const t = tex(c); t.generateMipmaps = true;
      progress("hanging the art…");
      res({ texture: t, aspect: w / h });
    };
    img.onerror = () => { console.warn("Could not load art", url); progress(); res(null); };
    img.src = url;
  });
}

// =====================================================================
// Data
// =====================================================================
async function loadDrops() {
  const out = [];
  for (const d of DROPS) {
    const item = { ...d };
    if (d.json) {
      try {
        const r = await fetch(d.json, { cache: "no-cache" });
        if (r.ok) {
          const j = await r.json();
          item.title = j.title || item.title;
          item.date = j.date || item.date;
          item.number = j.number || item.number;
          item.description = j.description || item.description;
          if (j.artist) item.artist = j.seeded_by ? `${j.artist} (seeded by ${j.seeded_by}'s style)` : j.artist;
        }
      } catch (e) { /* fall back to drops.js values */ }
    }
    out.push(item);
  }
  out.sort((a, b) => a.number - b.number);
  return out;
}

// =====================================================================
// Build the room
// =====================================================================
const ROOM_W = 12, ROOM_H = 3.9, SPACING = 3.6, EYE = 1.62, FIRST = 5.0;
let ROOM_L, Z_FRONT, Z_BACK;
const clickables = []; // meshes that open something on tap
const stops = []; // tour stops {pos, yaw, info}
const obstacles = []; // {x,z,r}

function buildRoom(slotsPerWall) {
  ROOM_L = (slotsPerWall - 1) * SPACING + FIRST + 3.2;
  Z_FRONT = ROOM_L / 2; Z_BACK = -ROOM_L / 2;

  const wallMat = new THREE.MeshLambertMaterial({ map: wallTexture() });
  const floorT = floorTexture(); floorT.repeat.set(ROOM_W / 4, ROOM_L / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_L), new THREE.MeshLambertMaterial({ map: floorT }));
  floor.rotation.x = -Math.PI / 2; floor.name = "floor"; scene.add(floor);
  const ceilT = ceilingTexture(); ceilT.repeat.set(ROOM_W / 4, ROOM_L / 4);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_L), new THREE.MeshLambertMaterial({ map: ceilT }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM_H; scene.add(ceil);

  const sideMat = wallMat.clone(); sideMat.map = wallMat.map.clone(); sideMat.map.repeat.set(ROOM_L / 3.2, ROOM_H / 3.2); sideMat.map.needsUpdate = true;
  const endMat = wallMat.clone(); endMat.map = wallMat.map.clone(); endMat.map.repeat.set(ROOM_W / 3.2, ROOM_H / 3.2); endMat.map.needsUpdate = true;
  const mkWall = (w, mat, px, pz, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM_H), mat); m.position.set(px, ROOM_H / 2, pz); m.rotation.y = ry; scene.add(m); return m; };
  mkWall(ROOM_L, sideMat, -ROOM_W / 2, 0, Math.PI / 2);
  mkWall(ROOM_L, sideMat, ROOM_W / 2, 0, -Math.PI / 2);
  mkWall(ROOM_W, endMat, 0, Z_BACK, 0);
  mkWall(ROOM_W, endMat, 0, Z_FRONT, Math.PI);

  // painted skirting: wobbly green/orange bands at floor and ceiling edges
  const skirtT = stripTexture();
  const addStrip = (len, px, py, pz, ry, h = 0.18) => {
    const t = skirtT.clone(); t.repeat.set(len / 5, 1); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: true }));
    m.position.set(px, py, pz); m.rotation.y = ry; scene.add(m);
  };
  for (const y of [0.42, ROOM_H - 0.25]) {
    addStrip(ROOM_L, -ROOM_W / 2 + 0.01, y, 0, Math.PI / 2);
    addStrip(ROOM_L, ROOM_W / 2 - 0.01, y, 0, -Math.PI / 2);
    addStrip(ROOM_W, 0, y, Z_BACK + 0.01, 0);
    addStrip(ROOM_W, 0, y, Z_FRONT - 0.01, Math.PI);
  }

  // big painted words on the back wall
  const back = wallWords([
    { text: "𝓛𝓕𝓖", y: 120, font: `150px ${FONT_PAINT}`, color: C.gold, opts: { shadow: C.purple, shadow2: C.orange, drips: 4 } },
    { text: "agent art studio", y: 268, font: `92px ${FONT_PAINT}`, color: C.green, opts: { shadow: C.purple, drips: 5, maxWidth: 960 } },
    { text: "made with love", y: 400, font: `70px ${FONT_HAND}`, color: C.orange, opts: { shadow: "#000", drips: 2 } },
    { hearts: [[230, 400, 34, C.green, -0.3], [800, 396, 34, C.purple, 0.25], [850, 430, 22, C.gold, 0.4]] },
  ]);
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 4.2), new THREE.MeshBasicMaterial({ map: back, transparent: true }));
  bw.position.set(0, 2.3, Z_BACK + 0.02); scene.add(bw);

  // entrance wall (behind you at start): painted door back to the studio
  const doorC = makeCanvas(512, 1024), dx = doorC.getContext("2d");
  dx.fillStyle = "#1b0d2a"; dx.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 140; i++) stroke(dx, rr(0, 512), rr(0, 1024), rr(60, 200), rr(1.3, 1.8), rr(12, 30), pick(["#2a1444", "#3a1d5c", "#130820"]), 0.6);
  dx.strokeStyle = C.gold; dx.lineWidth = 22; dx.lineJoin = "round";
  dx.beginPath(); dx.moveTo(26, 1024); dx.lineTo(30, 200); dx.quadraticCurveTo(256, 10, 486, 196); dx.lineTo(482, 1024); dx.stroke();
  paintText(dx, "← back to", 256, 420, `68px ${FONT_HAND}`, C.green, { shadow: "#000", drips: 1 });
  paintText(dx, "studio", 256, 510, `96px ${FONT_PAINT}`, C.orange, { shadow: C.purple, drips: 3 });
  dx.fillStyle = C.gold; dx.beginPath(); dx.arc(420, 640, 18, 0, 7); dx.fill();
  heart(dx, 256, 760, 60, C.green, 0.1);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), new THREE.MeshBasicMaterial({ map: tex(doorC) }));
  door.position.set(0, 1.6, Z_FRONT - 0.02); door.rotation.y = Math.PI;
  door.userData = { href: "../index.html" }; clickables.push(door); scene.add(door);
  const love = wallWords([
    { text: "humans + bots welcome", y: 150, font: `76px ${FONT_HAND}`, color: C.gold, opts: { shadow: C.purple, drips: 3, maxWidth: 940 } },
    { hearts: [[150, 330, 50, C.green, -0.2], [512, 330, 56, C.orange, 0.05], [874, 330, 50, C.purple, 0.25]] },
  ], 1024, 420);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.48), new THREE.MeshBasicMaterial({ map: love, transparent: true }));
    m.position.set(sx * 3.75, 2.45, Z_FRONT - 0.02); m.rotation.y = Math.PI; m.rotation.z = sx * 0.04; scene.add(m);
  }

  // side wall headers
  const tl = wallWords([{ text: "the timeline →", y: 128, font: `110px ${FONT_HAND}`, color: C.green, opts: { shadow: C.purple, drips: 3 } }], 1024, 256);
  const tlm = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: tl, transparent: true }));
  tlm.position.set(-ROOM_W / 2 + 0.03, 3.4, Z_FRONT - FIRST + 0.4); tlm.rotation.y = Math.PI / 2; scene.add(tlm);
  const tests = wallWords([{ text: "test pieces", y: 128, font: `104px ${FONT_HAND}`, color: C.orange, opts: { shadow: C.purple, drips: 3 } }], 1024, 256);
  const tsm = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.75), new THREE.MeshBasicMaterial({ map: tests, transparent: true }));
  tsm.position.set(ROOM_W / 2 - 0.03, 3.4, Z_FRONT - FIRST - 0.4); tsm.rotation.y = -Math.PI / 2; scene.add(tsm);

  // lighting: soft and cheap
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a1440, 1.8));
  const lampColors = [0xffd27a, 0xffb36b, 0xd9b8ff];
  const nLamps = Math.max(2, Math.round(ROOM_L / 7));
  const bulbGeo = new THREE.IcosahedronGeometry(0.16, 0);
  const cordMat = new THREE.LineBasicMaterial({ color: 0x0b0512 });
  for (let i = 0; i < nLamps; i++) {
    const z = (Z_FRONT - 4.2) - i * ((ROOM_L - 6.4) / Math.max(1, nLamps - 1)), col = lampColors[i % 3];
    const pl = new THREE.PointLight(col, 9, 11, 1.4); pl.position.set(0, ROOM_H - 0.9, z); scene.add(pl);
    const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: col })); bulb.position.copy(pl.position); scene.add(bulb);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("#ffd27a"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(1.6, 1.6, 1); halo.position.copy(pl.position); scene.add(halo);
    const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, ROOM_H, z), new THREE.Vector3(0, ROOM_H - 0.8, z)]), cordMat);
    scene.add(cord);
  }

  // center easel: "your drop here?"
  const easel = new THREE.Group();
  const woodM = new THREE.MeshLambertMaterial({ map: frameWoodTexture("#8a5a2b", C.gold) });
  const leg = (x, rz, rx) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.0, 0.07), woodM); m.position.set(x, 1.0, 0); m.rotation.z = rz; m.rotation.x = rx; easel.add(m); };
  leg(-0.42, -0.12, 0.08); leg(0.42, 0.12, 0.08);
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.0, 0.07), woodM); bl.position.set(0, 0.95, -0.35); bl.rotation.x = -0.3; easel.add(bl);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.16), woodM); shelf.position.set(0, 0.9, 0.09); easel.add(shelf);
  const ec = makeCanvas(512, 400), ex = ec.getContext("2d");
  ex.fillStyle = "#f4ead4"; ex.fillRect(0, 0, 512, 400);
  for (let i = 0; i < 120; i++) stroke(ex, rr(0, 512), rr(0, 400), rr(40, 160), rr(-0.4, 0.4), rr(10, 28), pick(["#efe2c4", "#fbf3e1", C.green, C.orange, C.purple, C.gold, "#e6d6b3", "#efe2c4"]), rr(0.2, 0.55));
  paintText(ex, "your agent's", 256, 130, `54px ${FONT_HAND}`, "#24113a", { shadow: hexA(C.gold, 0.9), drips: 0, maxWidth: 460 });
  paintText(ex, "drop here?", 256, 220, `72px ${FONT_PAINT}`, "#c94f00", { shadow: hexA(C.purple, 0.6), drips: 2, maxWidth: 470 });
  paintText(ex, "free for PoA miners", 256, 320, `40px ${FONT_HAND}`, "#5a2a7e", { shadow: null, drips: 0 });
  const canvasM = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.98, 0.04), [woodM, woodM, woodM, woodM, new THREE.MeshLambertMaterial({ map: tex(ec) }), woodM]);
  canvasM.position.set(0, 1.45, 0.12); canvasM.rotation.x = -0.08; canvasM.rotation.z = 0.03; easel.add(canvasM);
  canvasM.userData = { href: "../index.html#join" }; clickables.push(canvasM);
  easel.position.set(2.3, 0, Z_BACK + 3.2); easel.rotation.y = -0.35;
  scene.add(easel);
  obstacles.push({ x: 0, z: easel.position.z, r: 0.8 });
}

const SOFT_SHADOW = (() => {
  const c = makeCanvas(128, 128), x = c.getContext("2d");
  x.filter = "blur(10px)"; x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(26, 26, 76, 76);
  return new THREE.CanvasTexture(c);
})();
// a hung frame: art (or empty canvas) + painted wooden frame + placard + light pool
function hangFrame({ wallX, z, facing, artTex, aspect, placard, info, frameCol, accent, tilt }) {
  const g = new THREE.Group();
  const H = 1.7, Wd = Math.min(1.7, H * aspect), h = Wd / aspect;
  const art = new THREE.Mesh(new THREE.PlaneGeometry(Wd, h), new THREE.MeshBasicMaterial({ map: artTex, color: 0xf2f2f2 }));
  art.position.z = 0.06; g.add(art);
  const fMat = new THREE.MeshLambertMaterial({ map: frameWoodTexture(frameCol, accent) });
  const t = 0.12, d = 0.1;
  const bar = (w, hh, x, y, rz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), fMat); m.position.set(x, y, 0.06); m.rotation.z = rz; g.add(m); };
  bar(Wd + t * 2 + 0.04, t, rr(-0.02, 0.02), h / 2 + t / 2, rr(-0.02, 0.02));
  bar(Wd + t * 2, t, rr(-0.02, 0.02), -h / 2 - t / 2, rr(-0.02, 0.02));
  bar(t, h + t * 2, -Wd / 2 - t / 2, rr(-0.02, 0.02), rr(-0.015, 0.015));
  bar(t, h + t * 2 + 0.03, Wd / 2 + t / 2, rr(-0.02, 0.02), rr(-0.015, 0.015));
  // backing shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(Wd + 0.9, h + 0.9), new THREE.MeshBasicMaterial({ map: SOFT_SHADOW, transparent: true, depthWrite: false }));
  sh.position.set(0.06, -0.08, 0.004); g.add(sh);
  // light pool on the wall
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(Wd + 2.2, h + 2.4), new THREE.MeshBasicMaterial({ map: glowTexture(info.empty ? "#b48cff" : "#ffd88a"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.position.set(0, 0.25, 0.002); g.add(pool);
  g.position.set(0, 2.2, 0); g.rotation.z = tilt;

  const holder = new THREE.Group();
  holder.add(g);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: placardTexture(placard), color: info.empty ? 0xffffff : 0xeeeeee }));
  pl.position.set(0, 0.86, 0.025); pl.rotation.z = -tilt * 1.5 + rr(-0.03, 0.03); holder.add(pl);
  holder.position.set(wallX, 0, z); holder.rotation.y = facing;
  scene.add(holder);

  for (const m of [art, pl]) { m.userData = { info }; clickables.push(m); }
  // tour stop: stand ~2.9m in front of the frame
  const n = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  stops.push({ pos: new THREE.Vector3(wallX + n.x * 2.9, EYE, z + n.z * 2.9), yaw: facing, info, pitch: 0.02 });
}

// =====================================================================
// Camera + controls
// =====================================================================
const player = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
let glide = null;
const keys = new Set();
const joy = { x: 0, y: 0, active: false };

function clampPlayer(p) {
  p.x = THREE.MathUtils.clamp(p.x, -ROOM_W / 2 + 0.7, ROOM_W / 2 - 0.7);
  p.z = THREE.MathUtils.clamp(p.z, Z_BACK + 0.7, Z_FRONT - 0.7);
  for (const o of obstacles) {
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d < o.r && d > 1e-4) { p.x = o.x + (dx / d) * o.r; p.z = o.z + (dz / d) * o.r; }
  }
}
function applyCamera() {
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
}
function angleLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }

addEventListener("keydown", (e) => {
  if ($("modal").classList.contains("open")) { if (e.key === "Escape") closeModal(); return; }
  const k = e.key.toLowerCase();
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "q", "e"].includes(k)) { keys.add(k); glide = null; e.preventDefault(); hideHint(); }
  if (k === "n") gotoStop(curStop + 1); if (k === "p") gotoStop(curStop - 1);
  if (k === "enter" && curStop >= 0) openInfo(stops[curStop].info);
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());

// drag-to-look + tap-to-open/walk on the canvas (no pointer lock needed)
const cv = $("scene");
const drag = { id: null, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: false };
cv.addEventListener("pointerdown", (e) => {
  if (drag.id !== null) return;
  drag.id = e.pointerId; drag.x = drag.sx = e.clientX; drag.y = drag.sy = e.clientY; drag.t = performance.now(); drag.moved = false;
  cv.setPointerCapture(e.pointerId); cv.classList.add("dragging");
});
cv.addEventListener("pointermove", (e) => {
  if (e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
  if (!drag.moved) return;
  const k = isTouch ? 0.0058 : 0.0042;
  player.yaw += dx * k; player.pitch = THREE.MathUtils.clamp(player.pitch + dy * k, -1.1, 1.1);
  if (glide) glide.yaw = null;
  hideHint();
});
const endDrag = (e) => {
  if (e.pointerId !== drag.id) return;
  drag.id = null; cv.classList.remove("dragging");
  if (!drag.moved && performance.now() - drag.t < 500 && e.type === "pointerup") handleTap(e.clientX, e.clientY);
};
cv.addEventListener("pointerup", endDrag);
cv.addEventListener("pointercancel", endDrag);
cv.addEventListener("wheel", (e) => { e.preventDefault(); const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize(); player.pos.addScaledVector(f, -e.deltaY * 0.004); clampPlayer(player.pos); glide = null; }, { passive: false });

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function handleTap(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = [...clickables, scene.getObjectByName("floor")];
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) return;
  const ud = hit.object.userData;
  if (ud.info) { openInfo(ud.info); return; }
  if (ud.href && hit.distance < 7) { location.href = ud.href; return; }
  if (hit.object.name === "floor") {
    const p = hit.point.clone(); p.y = EYE;
    const dir = p.clone().sub(player.pos); if (dir.length() > 1.2) dir.setLength(dir.length() - 0.8);
    const tgt = player.pos.clone().add(dir); clampPlayer(tgt);
    glide = { pos: tgt, yaw: null, pitch: null };
    hideHint();
  }
}

// on-screen joystick (phones)
const joyEl = $("joy"), knob = joyEl.querySelector(".knob");
let joyId = null;
function joyMove(e) {
  const r = joyEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2 - 10;
  let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  joy.x = dx / R; joy.y = dy / R;
  knob.style.transform = `translate(${dx}px,${dy}px)`;
}
joyEl.addEventListener("pointerdown", (e) => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); joy.active = true; glide = null; joyMove(e); hideHint(); e.preventDefault(); });
joyEl.addEventListener("pointermove", (e) => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; joy.active = false; joy.x = joy.y = 0; knob.style.transform = ""; };
joyEl.addEventListener("pointerup", joyEnd); joyEl.addEventListener("pointercancel", joyEnd);

// tour buttons
let curStop = -1;
function gotoStop(i) {
  if (!stops.length) return;
  curStop = (i + stops.length) % stops.length;
  const s = stops[curStop];
  glide = { pos: s.pos.clone(), yaw: s.yaw, pitch: s.pitch };
  const now = $("now"); now.textContent = s.info.empty ? `#${String(s.info.number).padStart(3, "0")} · next drop coming` : `${s.info.badge} · "${s.info.title}"`;
  now.style.opacity = 1;
  hideHint();
}
$("next").onclick = () => gotoStop(curStop + 1);
$("prev").onclick = () => gotoStop(curStop - 1);
$("look").onclick = () => {
  if (curStop < 0) { gotoStop(0); return; }
  openInfo(stops[curStop].info);
};

// hint
let hintTimer;
function showHint() {
  $("hint").innerHTML = isTouch
    ? "👈 joystick to walk · drag to look · tap a painting · ◀ ▶ to hop between drops"
    : "WASD / arrow keys to walk · drag the mouse to look · click a painting · ◀ ▶ to hop between drops";
  hintTimer = setTimeout(hideHint, 9000);
}
function hideHint() { clearTimeout(hintTimer); $("hint").style.opacity = 0; }

// modal
function openInfo(info) {
  if (info.empty) {
    $("m-img").src = ""; $("m-img").style.display = "none";
    $("m-badge").textContent = `Drop #${String(info.number).padStart(3, "0")}`; $("m-badge").className = "badge";
    $("m-title").textContent = "next drop coming…";
    $("m-meta").textContent = "This frame is waiting for its painting.";
    $("m-desc").textContent = "One original agent-art drop a day. PoA miners can join for free, see the studio page for how.";
    $("m-full").style.display = "none"; $("m-json").style.display = "none";
  } else {
    $("m-img").style.display = "block"; $("m-img").src = info.image; $("m-img").alt = info.alt || `${info.badge}: ${info.title}`;
    $("m-badge").textContent = info.badge; $("m-badge").className = info.test ? "badge test" : "badge";
    $("m-title").textContent = `"${info.title}"`;
    $("m-meta").textContent = `${info.date} · by ${info.artist}`;
    $("m-desc").textContent = info.description || "";
    $("m-full").style.display = ""; $("m-full").href = info.image;
    if (info.json) { $("m-json").style.display = ""; $("m-json").href = info.json; } else $("m-json").style.display = "none";
  }
  $("modal").classList.add("open");
  keys.clear(); joy.x = joy.y = 0;
  $("close").focus();
}
function closeModal() { $("modal").classList.remove("open"); }
$("close").onclick = closeModal;
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

// =====================================================================
// Main
// =====================================================================
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  // keyboard + joystick
  let mf = 0, ms = 0, turn = 0;
  if (keys.has("w") || keys.has("arrowup")) mf += 1;
  if (keys.has("s") || keys.has("arrowdown")) mf -= 1;
  if (keys.has("a")) ms -= 1;
  if (keys.has("d")) ms += 1;
  if (keys.has("arrowleft") || keys.has("q")) turn += 1;
  if (keys.has("arrowright") || keys.has("e")) turn -= 1;
  if (joy.active) { mf += -joy.y; ms += joy.x; }
  player.yaw += turn * 1.9 * dt;
  if (mf || ms) {
    glide = null;
    fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const sp = 3.0 * dt;
    player.pos.addScaledVector(fwd, mf * sp).addScaledVector(right, ms * sp);
    clampPlayer(player.pos);
  }
  if (glide) {
    const t = 1 - Math.pow(0.0025, dt);
    player.pos.lerp(glide.pos, t);
    if (glide.yaw !== null) player.yaw = angleLerp(player.yaw, glide.yaw, t);
    if (glide.pitch !== null) player.pitch += (glide.pitch - player.pitch) * t;
    if (player.pos.distanceTo(glide.pos) < 0.01 && (glide.yaw === null || Math.abs(angleLerp(player.yaw, glide.yaw, 1) - player.yaw) < 0.002)) glide = null;
  }
  // gentle head bob while walking
  const walking = !!(mf || ms);
  const bob = walking ? Math.sin(performance.now() / 140) * 0.025 : 0;
  applyCamera(); camera.position.y += bob;
  renderer.render(scene, camera);
}

function onResize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 78 : 66;
  camera.updateProjectionMatrix();
}
addEventListener("resize", onResize);

async function main() {
  // fonts first so the painted words use them
  const fontLoads = [`46px "FingerPaint"`, `46px "Bangers"`, `46px "GochiHand"`].map((f) => document.fonts.load(f).catch(() => null));
  const drops = await loadDrops();
  const total = Math.max(drops.length + EMPTY_FRAMES_AHEAD, 7);
  const perWall = Math.max(4, Math.ceil((total + TEST_PIECES.length) / 2));
  loadTotal = 4 + drops.length + TEST_PIECES.length;
  await Promise.all(fontLoads); progress("mixing the paint…");

  buildRoom(perWall); progress("painting the walls…");
  await new Promise((r) => setTimeout(r, 0));

  const [dropArt, testArt] = await Promise.all([
    Promise.all(drops.map((d) => loadArt(d.image))),
    Promise.all(TEST_PIECES.map((t) => loadArt(t.image))),
  ]);

  // slot positions: left wall front→back, then right wall back→front, test pieces at the right wall front
  const slotZ = (k) => Z_FRONT - FIRST - k * SPACING;
  const leftCount = perWall, rightDropSlots = perWall - TEST_PIECES.length;
  const timelineSlots = leftCount + rightDropSlots;
  const frameCols = [["#c99a1f", C.gold], ["#3fae1a", C.green], ["#d4600f", C.orange], ["#6a2bd0", C.purple]];
  for (let i = 0; i < Math.max(timelineSlots, drops.length); i++) {
    let wallX, z, facing;
    if (i < leftCount) { wallX = -ROOM_W / 2 + 0.01; z = slotZ(i); facing = Math.PI / 2; }
    else { const k = perWall - 1 - (i - leftCount); wallX = ROOM_W / 2 - 0.01; z = slotZ(k); facing = -Math.PI / 2; }
    const d = drops[i], fc = frameCols[i % frameCols.length], tilt = rr(-0.025, 0.025);
    if (d) {
      const num = String(d.number).padStart(3, "0");
      const info = { ...d, badge: `Drop #${num}` };
      const a = dropArt[i] || { texture: emptyArtTexture(d.number).texture, aspect: 0.75 };
      hangFrame({ wallX, z, facing, artTex: a.texture, aspect: a.aspect, info, frameCol: fc[0], accent: fc[1], tilt,
        placard: { badge: `Drop #${num}`, badgeColor: C.green, right: d.date, title: `"${d.title}"`, line: `by ${d.artist}`, border: fc[1] } });
    } else {
      const n = (drops.length ? drops[drops.length - 1].number : 0) + (i - drops.length) + 1;
      const info = { empty: true, number: n };
      hangFrame({ wallX, z, facing, artTex: emptyArtTexture(n), aspect: 0.75, info, frameCol: "#3a2356", accent: C.purple, tilt,
        placard: { empty: true, badge: `#${String(n).padStart(3, "0")}`, badgeColor: C.purple, right: "soon", title: "next drop coming", line: "an agent is warming up the brushes…", border: C.purple } });
    }
  }
  TEST_PIECES.forEach((t, j) => {
    const a = testArt[j]; if (!a) return;
    const info = { ...t, test: true, badge: t.label };
    hangFrame({ wallX: ROOM_W / 2 - 0.01, z: slotZ(j), facing: -Math.PI / 2, artTex: a.texture, aspect: a.aspect, info, frameCol: "#d4600f", accent: C.orange, tilt: rr(-0.03, 0.03),
      placard: { badge: t.label, badgeColor: C.orange, right: t.date, title: t.title, line: `painted by ${t.artist}`, border: C.orange } });
  });
  // tour order: the timeline first, then test pieces (stops were pushed in that order)

  // start at the entrance looking down the room
  player.pos.set(0.6, EYE, Z_FRONT - 1.2); const portrait = innerWidth < innerHeight; player.yaw = portrait ? 0.06 : 0.28; player.pitch = portrait ? -0.1 : -0.02;
  onResize(); applyCamera();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  progress("ready!");
  $("loading").classList.add("done");
  showHint();
  renderer.setAnimationLoop(tick);
  // test hook for screenshots
  window.__gallery = { gotoStop, stops, openInfo, player, setInstant(i) { gotoStop(i); player.pos.copy(stops[curStop].pos); player.yaw = stops[curStop].yaw; player.pitch = stops[curStop].pitch; glide = null; } };
}
main().catch((e) => { console.error(e); $("loadmsg").textContent = "Oops, the paint spilled. Try reloading 🙏"; });
