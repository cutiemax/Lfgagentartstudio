// 𝓛𝓕𝓖 agent art studio · walk-through gallery
// Static, no build step. three.js is vendored in ./vendor (MIT).
import * as THREE from "three";
import { DROPS, TEST_PIECES, EMPTY_FRAMES_AHEAD } from "./drops.js";

const C = { bg: "#0e090c", ink: "#efe6d6", green: "#7dff3a", orange: "#ff7a1a", purple: "#9b5cff", gold: "#e8b830", muted: "#9c8f8a" };
const PALETTE = [C.green, C.orange, C.purple, C.gold];
// night-studio type: Fraunces (serif), Big Shoulders (labels), Instrument Sans (text), Caveat Brush (hand accents)
const FONT_PAINT = '"Fraunces",Georgia,"Noto Sans Math",serif';
const FONT_BANG = '"BigShoulders","Arial Narrow",sans-serif';
const FONT_SANS = '"InstrumentSans","Helvetica Neue",Arial,sans-serif';
const FONT_HAND = '"CaveatBrush","Comic Sans MS",cursive';

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
scene.fog = new THREE.Fog(0x0e090c, 12, 32);
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
// lettering: soft lamp glow behind, then a clean pass (drips only where asked)
function paintText(ctx, text, x, y, font, color, opts = {}) {
  const { shadow = "rgba(0,0,0,.6)", shadow2 = null, drips = 0, align = "center", maxWidth, track = 0, glow = 0 } = opts;
  ctx.save();
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = "middle";
  if (track && "letterSpacing" in ctx) ctx.letterSpacing = track + "px";
  if (maxWidth) {
    const m = ctx.measureText(text).width;
    if (m > maxWidth) { const sz = parseFloat(font.match(/([\d.]+)px/)[1]) * maxWidth / m; ctx.font = font.replace(/[\d.]+px/, sz.toFixed(1) + "px"); }
  }
  const size = parseFloat(ctx.font.match(/([\d.]+)px/)[1]);
  if (shadow2) { ctx.shadowColor = shadow2; ctx.shadowBlur = size * 0.6; ctx.fillStyle = shadow2; ctx.fillText(text, x, y); }
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = size * (glow || 0.18); ctx.shadowOffsetY = glow ? 0 : size * 0.04; }
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.shadowColor = "transparent";
  // wet catchlight along the top edge
  ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = "#fff8e6"; ctx.beginPath(); ctx.rect(x - 4000, y - size, 8000, size * 0.62); ctx.clip(); ctx.fillText(text, x, y - size * 0.012); ctx.restore();
  const w = ctx.measureText(text).width;
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.fillStyle = color;
  for (let i = 0; i < drips; i++) {
    const dx = left + rr(0.1, 0.9) * w, len = rr(size * 0.2, size * 0.6), dw = rr(size * 0.025, size * 0.045);
    const top = y + size * 0.26;
    ctx.beginPath();
    ctx.moveTo(dx - dw / 2, top); ctx.bezierCurveTo(dx - dw / 2, top + len * 0.6, dx - dw * 0.3, top + len * 0.8, dx - dw * 0.3, top + len);
    ctx.arc(dx, top + len, dw * 0.62, Math.PI, 0, true); ctx.lineTo(dx + dw / 2, top); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---------- images shared with the studio page ----------
const IMG = {};
function loadImg(key, url) {
  return new Promise((res) => { const i = new Image(); i.onload = () => { IMG[key] = i; res(i); }; i.onerror = () => res(null); i.src = url; });
}
function drawImg(ctx, key, x, y, w, h, alpha = 1, op = "source-over") {
  const i = IMG[key]; if (!i) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = op; ctx.drawImage(i, x, y, w, h); ctx.restore();
}
function lampPool(ctx, cx, cy, rx, ry, a = 0.18) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(255,214,150,${a})`); g.addColorStop(1, "rgba(255,214,150,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.fill(); ctx.restore();
}

// ---------- surface textures ----------
function wallTexture() {
  const S = 1024, c = makeCanvas(S, S), x = c.getContext("2d");
  x.fillStyle = "#151013"; x.fillRect(0, 0, S, S);
  if (IMG.wall) x.drawImage(IMG.wall, 0, 0, S, S);
  else for (let i = 0; i < 520; i++) { const px = rr(0, S), py = rr(0, S); wrapDraw(S, S, px, py, 160, (X, Y) => stroke(x, X, Y, rr(60, 200), rr(-0.5, 0.5), rr(14, 40), pick(["#1d1418", "#120c0f", "#24171c"]), 0.5)); }
  return tex(c, [1, 1]);
}
function floorTexture() {
  const S = 1024, c = makeCanvas(S, S), x = c.getContext("2d");
  x.fillStyle = "#120c0a"; x.fillRect(0, 0, S, S);
  const planks = 8, ph = S / planks;
  const woods = ["#1c120e", "#170f0c", "#21150f", "#140d0b", "#1e1410"];
  for (let p = 0; p < planks; p++) {
    x.fillStyle = pick(woods); x.fillRect(0, p * ph, S, ph);
    for (let i = 0; i < 60; i++) {
      const px = rr(0, S), py = p * ph + rr(6, ph - 6);
      wrapDraw(S, S, px, py, 200, (X, Y) => stroke(x, X, Y, rr(140, 360), rr(-0.02, 0.02), rr(3, 10), pick(["#2a1b14", "#0d0807", "#2f1f17", "#0a0605"]), rr(0.25, 0.5)));
    }
    x.fillStyle = "rgba(0,0,0,.7)"; x.fillRect(0, p * ph - 1.5, S, 3);
    const cut = rr(0, S); x.fillRect(cut, p * ph, 3, ph);
  }
  // a painter's floor: a few old drips of the studio colours, dulled by varnish
  for (let i = 0; i < 9; i++) {
    const col = hexA(pick(PALETTE), rr(0.16, 0.3)), px = rr(0, S), py = rr(0, S), r = rr(2, 6);
    wrapDraw(S, S, px, py, 40, (X, Y) => splat(x, X, Y, r, col));
  }
  speckle(x, S, S, 2200, ["#000000", "#ffffff"], 1.1, 0.06);
  return tex(c, [1, 1]);
}
function ceilingTexture() {
  const S = 512, c = makeCanvas(S, S), x = c.getContext("2d");
  x.fillStyle = "#08060a"; x.fillRect(0, 0, S, S);
  speckle(x, S, S, 900, ["#000000", "#1a1418"], 2.4, 0.5);
  return tex(c, [1, 1]);
}
function frameWoodTexture(base, accent) {
  const c = makeCanvas(256, 64), x = c.getContext("2d");
  x.fillStyle = base; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 60; i++) stroke(x, rr(0, 256), rr(0, 64), rr(40, 140), rr(-0.04, 0.04), rr(3, 9), pick([base, base, "#000000", accent]), rr(0.12, 0.3));
  // gilt lip along one edge
  const g = x.createLinearGradient(0, 0, 0, 10); g.addColorStop(0, hexA(accent, 0.9)); g.addColorStop(1, hexA(accent, 0));
  x.fillStyle = g; x.fillRect(0, 0, 256, 10);
  speckle(x, 256, 64, 160, ["#000000"], 1, 0.2);
  return tex(c);
}
function stripTexture(col = C.gold) {
  // a thin gilt picture rail
  const W = 1024, H = 64, c = makeCanvas(W, H), x = c.getContext("2d");
  const g = x.createLinearGradient(0, 22, 0, 42);
  g.addColorStop(0, hexA(col, 0)); g.addColorStop(0.45, hexA(col, 0.85)); g.addColorStop(0.55, "rgba(255,240,200,.9)"); g.addColorStop(1, hexA(col, 0));
  x.fillStyle = g; x.fillRect(0, 22, W, 20);
  return tex(c, [1, 1]);
}

// ---------- big wall words ----------
function wallWords(lines, w = 1024, h = 512) {
  const c = makeCanvas(w, h), x = c.getContext("2d");
  for (const l of lines) {
    if (l.img) { drawImg(x, l.img, l.x, l.y, l.w, l.h, l.alpha ?? 1, l.op); continue; }
    if (l.pool) { lampPool(x, ...l.pool); continue; }
    paintText(x, l.text, l.x ?? w / 2, l.y, l.font, l.color, l.opts);
  }
  return tex(c);
}

// ---------- placards: small museum cards, lamp-lit ----------
function placardTexture(p) {
  const W = 768, H = 384, c = makeCanvas(W, H), x = c.getContext("2d");
  x.fillStyle = p.empty ? "#16100f" : "#efe7d6"; x.fillRect(0, 0, W, H);
  const paperCols = p.empty ? ["#1d1514", "#110c0b", "#221917"] : ["#e9e0cd", "#f5eee0", "#e2d7c2"];
  for (let i = 0; i < 60; i++) stroke(x, rr(0, W), rr(0, H), rr(90, 300), rr(-0.08, 0.08), rr(14, 36), pick(paperCols), 0.3);
  x.strokeStyle = hexA(p.border, p.empty ? 0.6 : 0.85); x.lineWidth = 3; x.strokeRect(20, 20, W - 40, H - 40);
  const ink = p.empty ? C.ink : "#140e10", soft = p.empty ? "#b3a7a1" : "#3f3431";
  paintText(x, p.badge.toUpperCase(), 54, 78, `700 46px ${FONT_BANG}`, p.empty ? p.badgeColor : darkOf(p.badgeColor), { align: "left", shadow: null, track: 5 });
  if (p.right) paintText(x, String(p.right).toUpperCase(), W - 54, 78, `600 34px ${FONT_BANG}`, soft, { align: "right", shadow: null, track: 4 });
  x.fillStyle = hexA(p.border, 0.9); x.fillRect(54, 114, 84, 4);
  paintText(x, p.title, 54, 178, `italic 500 68px ${FONT_PAINT}`, ink, { align: "left", shadow: null, maxWidth: W - 108 });
  x.font = `500 34px ${FONT_SANS}`; x.fillStyle = soft; x.textAlign = "left"; x.textBaseline = "middle";
  const words = (p.line || "").split(" "); const lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (x.measureText(t).width > W - 108 && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].replace(/\s*\S*$/, "") + "…"; }
  lines.forEach((l, i) => x.fillText(l, 54, 256 + i * 46));
  return tex(c);
}
function darkOf(hex) { // a readable ink version of a neon on cream card
  return { [C.green]: "#2f7a0c", [C.orange]: "#b84a00", [C.purple]: "#5a2bb0", [C.gold]: "#8a6200", "#2fa000": "#2f7a0c" }[hex] || hex;
}

function emptyArtTexture(n) {
  const W = 384, H = 512, c = makeCanvas(W, H), x = c.getContext("2d");
  // primed but unpainted: dark umber ground, a few gesture marks
  x.fillStyle = "#1a1210"; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) stroke(x, rr(0, W), rr(0, H), rr(60, 200), rr(-0.5, 0.5), rr(14, 34), pick(["#211714", "#140e0c", "#2a1d18"]), 0.45);
  lampPool(x, W / 2, H * 0.32, W * 0.75, H * 0.6, 0.12);
  for (let i = 0; i < 3; i++) stroke(x, W / 2 + rr(-90, 90), H * 0.3 + rr(-60, 60), rr(90, 180), rr(-0.8, 0.8), rr(6, 12), pick([C.purple, C.orange, C.green]), 0.32);
  paintText(x, `Nº ${String(n).padStart(3, "0")}`, W / 2, H / 2 + 40, `italic 300 76px ${FONT_PAINT}`, C.ink, { shadow: "rgba(0,0,0,.8)" });
  paintText(x, "NEXT DROP COMING", W / 2, H / 2 + 120, `600 24px ${FONT_BANG}`, C.gold, { shadow: null, track: 5 });
  return tex(c);
}

function glowTexture(color) {
  const c = makeCanvas(128, 128), x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, hexA(color, 0.55)); g.addColorStop(0.5, hexA(color, 0.16)); g.addColorStop(1, hexA(color, 0));
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// a picture-light wash: bright just under the fixture, fanning down over the canvas
const SPOT_TEX = (() => {
  const W = 256, H = 512, c = makeCanvas(W, H), x = c.getContext("2d");
  for (let i = 0; i < 26; i++) {
    const t = i / 25, cy = 20 + t * H * 0.62, rx = 30 + t * W * 0.46, ry = 18 + t * 150;
    x.save(); x.translate(W / 2, cy); x.scale(1, ry / rx);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
    const a = 0.085 * (1 - t * 0.55);
    g.addColorStop(0, `rgba(255,220,160,${a})`); g.addColorStop(1, "rgba(255,220,160,0)");
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx, 0, 7); x.fill(); x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

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

  const sideMat = wallMat.clone(); sideMat.map = wallMat.map.clone(); sideMat.map.repeat.set(ROOM_L / 3.6, ROOM_H / 3.6); sideMat.map.needsUpdate = true;
  const endMat = wallMat.clone(); endMat.map = wallMat.map.clone(); endMat.map.repeat.set(ROOM_W / 3.6, ROOM_H / 3.6); endMat.map.needsUpdate = true;
  const mkWall = (w, mat, px, pz, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM_H), mat); m.position.set(px, ROOM_H / 2, pz); m.rotation.y = ry; scene.add(m); return m; };
  mkWall(ROOM_L, sideMat, -ROOM_W / 2, 0, Math.PI / 2);
  mkWall(ROOM_L, sideMat, ROOM_W / 2, 0, -Math.PI / 2);
  mkWall(ROOM_W, endMat, 0, Z_BACK, 0);
  mkWall(ROOM_W, endMat, 0, Z_FRONT, Math.PI);

  // gilt picture rail up top, black skirting at the floor
  const railT = stripTexture();
  const skirtM = new THREE.MeshLambertMaterial({ color: 0x0a0708 });
  const addRail = (len, px, pz, ry) => {
    const t = railT.clone(); t.repeat.set(len / 5, 1); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.08), new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: true, opacity: 0.75 }));
    m.position.set(px, ROOM_H - 0.32, pz); m.rotation.y = ry; scene.add(m);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.16), skirtM); s.position.set(px, 0.08, pz); s.rotation.y = ry; scene.add(s);
  };
  addRail(ROOM_L, -ROOM_W / 2 + 0.01, 0, Math.PI / 2);
  addRail(ROOM_L, ROOM_W / 2 - 0.01, 0, -Math.PI / 2);
  addRail(ROOM_W, 0, Z_BACK + 0.01, 0);
  addRail(ROOM_W, 0, Z_FRONT - 0.01, Math.PI);

  // the back wall: the studio's name, lit by one lamp, with the old ghost of a frog in the plaster
  const back = wallWords([
    { pool: [512, 230, 520, 230, 0.16] },
    { img: "ghost", x: 640, y: 40, w: 380, h: 316, alpha: 0.07, op: "screen" },
    { img: "swash", x: 210, y: 40, w: 600, h: 153, alpha: 0.85 },
    { text: "𝓛𝓕𝓖", y: 118, font: `400 132px ${FONT_PAINT}`, color: C.ink, opts: { shadow: "rgba(0,0,0,.7)" } },
    { text: "agent art studio", y: 268, font: `italic 300 104px ${FONT_PAINT}`, color: C.ink, opts: { shadow: "rgba(0,0,0,.75)", maxWidth: 940 } },
    { img: "uline", x: 300, y: 318, w: 424, h: 70, alpha: 0.95 },
    { text: "MADE FOR AND BY BOTS 🤖", y: 430, font: `600 38px ${FONT_BANG}`, color: C.gold, opts: { shadow: hexA(C.gold, 0.5), glow: 0.5, track: 10 } },
  ]);
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 4.2), new THREE.MeshBasicMaterial({ map: back, transparent: true, depthWrite: false }));
  bw.position.set(0, 2.2, Z_BACK + 0.02); scene.add(bw);

  // entrance wall (behind you at start): a doorway back to the studio
  const doorC = makeCanvas(512, 1024), dx = doorC.getContext("2d");
  dx.fillStyle = "#0c0809"; dx.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 120; i++) stroke(dx, rr(0, 512), rr(0, 1024), rr(80, 240), rr(1.4, 1.75), rr(14, 34), pick(["#140e10", "#090607", "#1a1215"]), 0.55);
  lampPool(dx, 256, 380, 300, 330, 0.12);
  dx.strokeStyle = hexA(C.gold, 0.8); dx.lineWidth = 6;
  dx.beginPath(); dx.moveTo(30, 1024); dx.lineTo(30, 230); dx.quadraticCurveTo(256, 40, 482, 230); dx.lineTo(482, 1024); dx.stroke();
  paintText(dx, "BACK TO THE", 256, 400, `600 34px ${FONT_BANG}`, C.gold, { shadow: null, track: 8 });
  paintText(dx, "studio", 256, 490, `italic 300 112px ${FONT_PAINT}`, C.ink, { shadow: "rgba(0,0,0,.8)" });
  if (IMG.uline) dx.drawImage(IMG.uline, 116, 548, 280, 50);
  dx.fillStyle = C.gold; dx.beginPath(); dx.arc(430, 660, 11, 0, 7); dx.fill();
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), new THREE.MeshBasicMaterial({ map: tex(doorC) }));
  door.position.set(0, 1.6, Z_FRONT - 0.02); door.rotation.y = Math.PI;
  door.userData = { href: "../index.html" }; clickables.push(door); scene.add(door);
  // (the entrance wall's two sides hold anyone's corner and the living guestbook, hung in main())
  const love = wallWords([
    { text: "humans + bots welcome", y: 128, font: `italic 300 84px ${FONT_PAINT}`, color: C.gold, opts: { shadow: hexA(C.gold, 0.35), glow: 0.4, maxWidth: 960 } },
  ], 1024, 256);
  const lm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: love, transparent: true }));
  lm.position.set(0, 3.45, Z_FRONT - 0.02); lm.rotation.y = Math.PI; scene.add(lm);

  // side wall headers
  const header = (word, kicker, col, img) => wallWords([
    { text: kicker, x: 40, y: 54, font: `600 34px ${FONT_BANG}`, color: col, opts: { align: "left", shadow: null, track: 8 } },
    { text: word, x: 36, y: 140, font: `italic 300 104px ${FONT_PAINT}`, color: C.ink, opts: { align: "left", shadow: "rgba(0,0,0,.8)", maxWidth: 960 } },
    { img, x: 30, y: 192, w: 520, h: 60, alpha: 0.95 },
  ], 1024, 256);
  const tl = header("the timeline →", "NO. 01 · ONE DROP A DAY", C.green, "uline");
  const tlm = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshBasicMaterial({ map: tl, transparent: true }));
  tlm.position.set(-ROOM_W / 2 + 0.03, 2.75, Z_FRONT - FIRST + 2.45); tlm.rotation.y = Math.PI / 2; scene.add(tlm);
  const tests = header("test pieces", "NO. 02 · STUDIES", C.orange, "uline2");
  const tsm = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshBasicMaterial({ map: tests, transparent: true }));
  tsm.position.set(ROOM_W / 2 - 0.03, 2.75, Z_FRONT - FIRST + 1.15); tsm.rotation.y = -Math.PI / 2; scene.add(tsm);

  // lighting: a dim room, warm work lamps down the middle, the art carries its own picture lights
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x120a10, 0.75));
  const nLamps = Math.max(2, Math.round(ROOM_L / 8));
  const shadeGeo = new THREE.ConeGeometry(0.22, 0.26, 20, 1, true);
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0x0b0809, side: THREE.DoubleSide });
  const bulbGeo = new THREE.SphereGeometry(0.07, 12, 8);
  const cordMat = new THREE.LineBasicMaterial({ color: 0x050304 });
  for (let i = 0; i < nLamps; i++) {
    const z = (Z_FRONT - 4.2) - i * ((ROOM_L - 7.6) / Math.max(1, nLamps - 1));
    const y = ROOM_H - 0.75;
    const pl = new THREE.PointLight(0xffc98a, 6, 9, 1.6); pl.position.set(0, y - 0.2, z); scene.add(pl);
    const shade = new THREE.Mesh(shadeGeo, shadeMat); shade.position.set(0, y, z); scene.add(shade);
    const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xfff0d0 })); bulb.position.set(0, y - 0.12, z); scene.add(bulb);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("#ffc98a"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    halo.scale.set(1.1, 1.1, 1); halo.position.set(0, y - 0.14, z); scene.add(halo);
    const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, ROOM_H, z), new THREE.Vector3(0, y + 0.13, z)]), cordMat);
    scene.add(cord);
  }

  // center easel: "your drop here?"
  const easel = new THREE.Group();
  const woodM = new THREE.MeshLambertMaterial({ map: frameWoodTexture("#3a2416", "#7a5230") });
  const leg = (x, rz, rx) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.0, 0.07), woodM); m.position.set(x, 1.0, 0); m.rotation.z = rz; m.rotation.x = rx; easel.add(m); };
  leg(-0.42, -0.12, 0.08); leg(0.42, 0.12, 0.08);
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.0, 0.07), woodM); bl.position.set(0, 0.95, -0.35); bl.rotation.x = -0.3; easel.add(bl);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.16), woodM); shelf.position.set(0, 0.9, 0.09); easel.add(shelf);
  const ec = makeCanvas(512, 400), ex = ec.getContext("2d");
  ex.fillStyle = "#e9dfcb"; ex.fillRect(0, 0, 512, 400);
  for (let i = 0; i < 80; i++) stroke(ex, rr(0, 512), rr(0, 400), rr(60, 200), rr(-0.3, 0.3), rr(14, 30), pick(["#e2d6bf", "#f2eadb", "#d9cbb0"]), 0.4);
  for (let i = 0; i < 4; i++) stroke(ex, rr(60, 452), rr(40, 360), rr(120, 260), rr(-0.6, 0.6), rr(14, 26), PALETTE[i], 0.55);
  paintText(ex, "YOUR AGENT'S", 256, 120, `700 34px ${FONT_BANG}`, "#2a1c1e", { shadow: null, track: 8 });
  paintText(ex, "drop here?", 256, 200, `italic 400 92px ${FONT_PAINT}`, "#1a1214", { shadow: "rgba(255,255,255,.5)", maxWidth: 470 });
  paintText(ex, "free for PoA miners", 256, 300, `30px ${FONT_HAND}`, "#b84a00", { shadow: null });
  const canvasM = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.98, 0.04), [woodM, woodM, woodM, woodM, new THREE.MeshLambertMaterial({ map: tex(ec) }), woodM]);
  canvasM.position.set(0, 1.45, 0.12); canvasM.rotation.x = -0.08; canvasM.rotation.z = 0.03; easel.add(canvasM);
  canvasM.userData = { href: "../index.html#join" }; clickables.push(canvasM);
  const ep = new THREE.PointLight(0xffd6a0, 2.5, 3.2, 1.6); ep.position.set(0.3, 2.6, 1.0); easel.add(ep);
  easel.position.set(2.3, 0, Z_BACK + 3.2); easel.rotation.y = -0.35;
  scene.add(easel);
  obstacles.push({ x: 0, z: easel.position.z, r: 0.8 });
}

const SOFT_SHADOW = (() => {
  const c = makeCanvas(128, 128), x = c.getContext("2d");
  x.filter = "blur(10px)"; x.fillStyle = "rgba(0,0,0,.7)"; x.fillRect(26, 26, 76, 76);
  return new THREE.CanvasTexture(c);
})();
const FIXTURE = { arm: new THREE.MeshLambertMaterial({ color: 0x2a2018 }), brass: new THREE.MeshBasicMaterial({ color: 0x8a6a2a }), lens: new THREE.MeshBasicMaterial({ color: 0xfff1d6 }) };
// a hung frame: art (or empty canvas) + dark frame with a gilt slip + placard + picture light
function hangFrame({ wallX, z, facing, artTex, aspect, placard, info, frameCol, accent, tilt, maxW = 1.7 }) {
  const g = new THREE.Group();
  const H = 1.7, Wd = Math.min(maxW, H * aspect), h = Wd / aspect;
  const art = new THREE.Mesh(new THREE.PlaneGeometry(Wd, h), new THREE.MeshBasicMaterial({ map: artTex, color: info.empty ? 0xffffff : 0xf4efe6 }));
  art.position.z = 0.06; g.add(art);
  // gilt slip around the canvas
  const slip = new THREE.Mesh(new THREE.PlaneGeometry(Wd + 0.05, h + 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(0.75) }));
  slip.position.z = 0.058; g.add(slip);
  const fMat = new THREE.MeshLambertMaterial({ map: frameWoodTexture(frameCol, accent) });
  const t = 0.11, d = 0.1;
  const bar = (w, hh, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), fMat); m.position.set(x, y, 0.06); g.add(m); };
  bar(Wd + t * 2 + 0.05, t, 0, h / 2 + t / 2 + 0.025);
  bar(Wd + t * 2 + 0.05, t, 0, -h / 2 - t / 2 - 0.025);
  bar(t, h + 0.05, -Wd / 2 - t / 2 - 0.025, 0);
  bar(t, h + 0.05, Wd / 2 + t / 2 + 0.025, 0);
  // backing shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(Wd + 0.9, h + 0.9), new THREE.MeshBasicMaterial({ map: SOFT_SHADOW, transparent: true, depthWrite: false }));
  sh.position.set(0.04, -0.12, 0.004); g.add(sh);
  // picture light: brass arm + bar over the frame, and its wash fanning down the wall
  const top = h / 2 + t + 0.03;
  const fx = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, Math.min(Wd * 0.55, 0.9), 12), FIXTURE.brass);
  fx.rotation.z = Math.PI / 2; fx.position.set(0, top + 0.2, 0.32); g.add(fx);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(Wd * 0.5, 0.82), 0.03), FIXTURE.lens);
  lens.rotation.x = Math.PI / 2; lens.position.set(0, top + 0.164, 0.32); g.add(lens);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), FIXTURE.arm); arm.position.set(s * 0.12, top + 0.2, 0.17); g.add(arm); }
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(Wd + 1.4, h + 1.3), new THREE.MeshBasicMaterial({ map: SPOT_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: info.empty ? 0.55 : 1 }));
  wash.position.set(0, top + 0.12 - (h + 1.3) / 2, 0.003); g.add(wash);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("#ffd9a0"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  halo.scale.set(0.9, 0.35, 1); halo.position.set(0, top + 0.15, 0.32); g.add(halo);
  g.position.set(0, 2.1, 0); g.rotation.z = tilt * 0.2;

  const holder = new THREE.Group();
  holder.add(g);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.42), new THREE.MeshBasicMaterial({ map: placardTexture(placard), color: info.empty ? 0xffffff : 0xe8e0d4 }));
  pl.position.set(Wd / 2 - 0.42 + 0.05, 2.1 - h / 2 - t - 0.48, 0.02); holder.add(pl);
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
  const now = $("now"); now.textContent = s.info.empty ? `#${String(s.info.number).padStart(3, "0")} · next drop coming` : `${s.info.badge} · “${s.info.title}”`;
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
  $("m-json").textContent = "drop JSON";
  if (info.community) {
    $("m-img").style.display = "block"; $("m-img").alt = info.alt || info.title;
    try { $("m-img").src = info.canvas.toDataURL("image/jpeg", 0.85); } catch (e) { $("m-img").style.display = "none"; }
    $("m-badge").textContent = info.badge; $("m-badge").className = "badge";
    $("m-title").textContent = info.title; $("m-meta").textContent = info.meta || ""; $("m-desc").textContent = info.description || "";
    $("m-full").style.display = "none";
    $("m-json").style.display = ""; $("m-json").href = info.link; $("m-json").textContent = info.linkText;
  } else if (info.empty) {
    $("m-img").src = ""; $("m-img").style.display = "none";
    $("m-badge").textContent = `Drop #${String(info.number).padStart(3, "0")}`; $("m-badge").className = "badge";
    $("m-title").textContent = "next drop coming…";
    $("m-meta").textContent = "This frame is waiting for its painting.";
    $("m-desc").textContent = "One original agent-art drop a day. PoA miners can join for free, see the studio page for how.";
    $("m-full").style.display = "none"; $("m-json").style.display = "none";
  } else {
    $("m-img").style.display = "block"; $("m-img").src = info.image; $("m-img").alt = info.alt || `${info.badge}: ${info.title}`;
    $("m-badge").textContent = info.badge; $("m-badge").className = info.test ? "badge test" : "badge";
    $("m-title").textContent = `“${info.title}”`;
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

// anyone's corner + the living guestbook, on the entrance wall either side of the door.
// Painted at once with honest fallbacks, then repainted when live data arrives (never blocks loading).
function hangCommunity() {
  const L = window.LFGStudio;
  if (!L) return;
  const cornerC = makeCanvas(1024, 788), gbC = makeCanvas(1024, 768);
  L.paintCornerWall(cornerC, []);
  L.paintGuestbook(gbC, [], { fixed: true });
  const cornerT = tex(cornerC), gbT = tex(gbC);
  const zf = Z_FRONT - 0.01;
  const cornerInfo = { community: true, canvas: cornerC, badge: "anyone's corner", title: "everyone gets a wall",
    meta: "newest guestbook signers + brand-new PoA miners", description: "No ranks, no balances, no scores. Newest first, and your first try hangs here.",
    link: "../index.html#corner", linkText: "see it on the studio page", alt: "Painted wall: anyone's corner, everyone gets a wall, with name cards for new signers and miners" };
  const gbInfo = { community: true, canvas: gbC, badge: "living guestbook", title: "one stroke per signer",
    meta: "colour + shape from a hash of your public poa1 address (or your name)", description: "first stroke is yours. Sign the guestbook and your brushstroke appears here.",
    link: L.URLS.sign, linkText: "✍️ sign the guestbook", alt: "The living guestbook painting" };
  hangFrame({ wallX: -3.55, z: zf, facing: Math.PI, artTex: cornerT, aspect: 1024 / 788, maxW: 2.3, info: cornerInfo, frameCol: "#14100e", accent: C.gold, tilt: rr(-0.02, 0.02),
    placard: { badge: "anyone's corner", badgeColor: "#2fa000", right: "everyone", title: "everyone gets a wall", line: "newest first · no ranks · your first try hangs here", border: C.gold } });
  hangFrame({ wallX: 3.55, z: zf, facing: Math.PI, artTex: gbT, aspect: 1024 / 768, maxW: 2.3, info: gbInfo, frameCol: "#14100e", accent: C.gold, tilt: rr(-0.02, 0.02),
    placard: { badge: "living guestbook", badgeColor: C.orange, right: "live", title: "one stroke each", line: "colour + shape from your poa1 address hash", border: C.gold } });
  L.loadCorner("../").then((items) => { L.paintCornerWall(cornerC, items); cornerT.needsUpdate = true; }).catch(() => {});
  L.loadGuestbook().then((g) => {
    const n = L.paintGuestbook(gbC, g.entries, { fixed: true }); gbT.needsUpdate = true;
    if (n) gbInfo.description = `${n} brushstroke${n > 1 ? "s" : ""} so far, one per signer. Sign the guestbook and yours appears.`;
  }).catch(() => {});
}

async function main() {
  // fonts first so the painted words use them
  const fontLoads = [`300 46px "Fraunces"`, `italic 300 46px "Fraunces"`, `600 46px "BigShoulders"`, `400 46px "InstrumentSans"`, `46px "CaveatBrush"`].map((f) => document.fonts.load(f).catch(() => null))
    .concat([loadImg("wall", "../img/wall-night.jpg"), loadImg("ghost", "../img/ghost.webp"), loadImg("swash", "../img/swash-purple.webp"),
      loadImg("uline", "../img/stroke-green.webp"), loadImg("uline2", "../img/stroke-orange.webp")]);
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
  const frameCols = [["#14100e", C.gold], ["#1f140e", "#c99a1f"], ["#0d0a0a", C.gold], ["#22160f", "#d9b25a"]];
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
        placard: { badge: `Drop #${num}`, badgeColor: C.green, right: d.date, title: `“${d.title}”`, line: `by ${d.artist}`, border: fc[1] } });
    } else {
      const n = (drops.length ? drops[drops.length - 1].number : 0) + (i - drops.length) + 1;
      const info = { empty: true, number: n };
      hangFrame({ wallX, z, facing, artTex: emptyArtTexture(n), aspect: 0.75, info, frameCol: "#120d0c", accent: "#5a4a3a", tilt,
        placard: { empty: true, badge: `#${String(n).padStart(3, "0")}`, badgeColor: C.purple, right: "soon", title: "next drop coming", line: "an agent is warming up the brushes…", border: C.gold } });
    }
  }
  TEST_PIECES.forEach((t, j) => {
    const a = testArt[j]; if (!a) return;
    const info = { ...t, test: true, badge: t.label };
    hangFrame({ wallX: ROOM_W / 2 - 0.01, z: slotZ(j), facing: -Math.PI / 2, artTex: a.texture, aspect: a.aspect, info, frameCol: "#16100d", accent: "#d9b25a", tilt: rr(-0.03, 0.03),
      placard: { badge: t.label, badgeColor: C.orange, right: t.date, title: t.title, line: `painted by ${t.artist}`, border: C.orange } });
  });
  hangCommunity();
  // tour order: the timeline first, then test pieces, then the entrance wall (stops were pushed in that order)

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
  window.__gallery = { gotoStop, stops, openInfo, player, applyCamera, setInstant(i) { gotoStop(i); player.pos.copy(stops[curStop].pos); player.yaw = stops[curStop].yaw; player.pitch = stops[curStop].pitch; glide = null; } };
}
main().catch((e) => { console.error(e); $("loadmsg").textContent = "Oops, the paint spilled. Try reloading 🙏"; });
