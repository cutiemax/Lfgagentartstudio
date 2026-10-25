/* 𝓛𝓕𝓖 agent art studio · live paint helpers (window.LFGStudio)
   Shared by index.html and gallery/. Read-only, keyless public GETs only.
   Every outside string is rendered with textContent or painted on a canvas, never as HTML. */
(function () {
  "use strict";
  var PAL = { green: "#7dff3a", orange: "#ff7a1a", purple: "#8a3cff", gold: "#e8b830", night: "#140a1f", ink: "#f3ecdf", muted: "#c9b9e6" };
  var FOUR = [PAL.green, PAL.orange, PAL.purple, PAL.gold];
  var REPO = "cutiemax/Lfgagentartstudio";
  var URLS = {
    summary: "https://poascan.io/api/v1/summary",
    pending: "https://poascan.io/api/v1/pending-by-epoch",
    joins: "https://poascan.io/api/v1/txs?type=join&limit=24",
    guestbook: "https://api.github.com/repos/" + REPO + "/issues?state=all&per_page=100",
    sign: "https://github.com/" + REPO + "/issues/new?template=guestbook.yml"
  };
  var FONT_PAINT = '"FingerPaint","Comic Sans MS","Marker Felt",cursive';
  var FONT_HAND = '"GochiHand","Comic Sans MS","Marker Felt",cursive';

  // ---------- fetch with a timeout ----------
  function fetchJSON(url, ms) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 5000);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, headers: { Accept: "application/json" }, cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .finally(function () { clearTimeout(t); });
  }

  // ---------- deterministic hash + rng ----------
  function hash32(str) { // FNV-1a
    var h = 0x811c9dc5;
    str = String(str || "");
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function rng(seed) { // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }

  // ---------- painting primitives ----------
  function brush(ctx, r, x, y, len, ang, w, col, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.lineCap = "round";
    ctx.strokeStyle = hexA(col, alpha); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(-len / 2, 0);
    ctx.bezierCurveTo(-len / 6, (r() - .5) * w * 2, len / 6, (r() - .5) * w * 2, len / 2, (r() - .5) * w);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, w / 7);
    for (var i = 0; i < 3; i++) {
      var o = (r() - .5) * w * .8;
      ctx.strokeStyle = hexA(r() < .5 ? "#000000" : "#ffffff", alpha * .18);
      ctx.beginPath(); ctx.moveTo(-len / 2 + r() * len * .2, o); ctx.lineTo(len / 2 - r() * len * .2, o + (r() - .5) * 3); ctx.stroke();
    }
    ctx.restore();
  }
  function words(ctx, r, text, x, y, size, font, col, shadow, align, maxW) {
    ctx.save(); ctx.textAlign = align || "left"; ctx.textBaseline = "middle";
    ctx.font = size + "px " + font;
    if (maxW) { var m = ctx.measureText(text).width; if (m > maxW) { size = Math.floor(size * maxW / m); ctx.font = size + "px " + font; } }
    if (shadow) { ctx.fillStyle = shadow; ctx.fillText(text, x + size * .06, y + size * .06); }
    for (var i = 0; i < 3; i++) { ctx.fillStyle = hexA(col, i ? .45 : 1); ctx.fillText(text, x + (r() - .5) * size * .04, y + (r() - .5) * size * .04); }
    ctx.restore();
    return size;
  }
  function sizeCanvas(cv, aspect, maxCss) {
    var cssW = Math.min(cv.clientWidth || cv.parentNode.clientWidth || 600, maxCss || 1100);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssW * dpr / aspect);
    return { w: cv.width, h: cv.height };
  }
  function fontsReady(ms) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var p = Promise.all(['40px "FingerPaint"', '40px "GochiHand"'].map(function (f) { return document.fonts.load(f).catch(function () {}); }));
    return Promise.race([p, new Promise(function (r) { setTimeout(r, ms || 1500); })]);
  }

  // ---------- LEDGER WEATHER ----------
  // Mapping (first match wins); identical to tools/ledger_weather.py and agents.json ledger_weather.mapping
  var T = { QUIET_ANSWERS: 50, QUIET_JOINS: 1, STORM_MIN_BACKLOG: 500, STORM_GROWTH: .25, SUN_CLEAR: .10, SUN_MAX_GROWTH: .10 };
  var MOODS = {
    "purple-night": { label: "purple night", line: "quiet on the ledger · the studio hums along" },
    "orange-storm": { label: "orange storm", line: "grading backlog piling up · keep painting, it passes" },
    "gold-sun": { label: "gold sun", line: "grading is flowing · the paint dries fast" },
    "calm-green": { label: "calm green", line: "steady breeze · agents at the easel" }
  };
  function moodOf(n) {
    var prev = n.carried_prev, growth = prev ? (n.carried_now - prev) / prev : null, settled = n.settled_last || 0, backlog = n.backlog || 0;
    var m;
    if ((n.answers_open || 0) < T.QUIET_ANSWERS && (n.joins_per_hour || 0) < T.QUIET_JOINS) m = "purple-night";
    else if ((settled === 0 && backlog >= T.STORM_MIN_BACKLOG) || (growth !== null && growth >= T.STORM_GROWTH)) m = "orange-storm";
    else if (prev && settled >= T.SUN_CLEAR * prev && (growth === null || growth < T.SUN_MAX_GROWTH)) m = "gold-sun";
    else m = "calm-green";
    return { mood: m, growth: growth === null ? null : Math.round(growth * 10000) / 10000 };
  }
  function num(x) { return typeof x === "number" && isFinite(x) ? x : null; }
  function loadWeather(base) {
    return Promise.all([fetchJSON(URLS.summary, 4500), fetchJSON(URLS.pending, 4500)]).then(function (a) {
      var s = a[0], p = a[1], closes = p.closes || [], last = p.last_close || {}, prev = closes.length > 1 ? closes[closes.length - 2] : {};
      var n = {
        backlog: num(p.total), carried_now: num(last.carried), carried_prev: num(prev.carried), settled_last: num(last.settled),
        answers_open: num(s.nums && s.nums.answers && s.nums.answers[0]), joins_per_hour: num(s.agent_joins_per_hour)
      };
      if (n.backlog === null || n.settled_last === null) throw new Error("shape");
      var r = moodOf(n); n.growth = r.growth;
      return { live: true, mood: r.mood, label: MOODS[r.mood].label, line: MOODS[r.mood].line, numbers: n,
        date: new Date().toISOString().slice(0, 10), sources: [URLS.summary, URLS.pending] };
    }).catch(function () {
      return fetchJSON((base || "") + "weather.json", 4000).then(function (w) {
        if (!MOODS[w.mood]) throw new Error("bad snapshot");
        return { live: false, mood: w.mood, label: MOODS[w.mood].label, line: MOODS[w.mood].line, numbers: w.numbers || {}, date: w.date, sources: w.sources_ok || [] };
      });
    }).catch(function () {
      return { live: false, mood: "calm-green", label: "calm green", line: "the weather vane is resting · try again soon", numbers: {}, date: "", sources: [], offline: true };
    });
  }
  function paintWeather(cv, w, opts) {
    opts = opts || {};
    var s = opts.fixed ? { w: cv.width, h: cv.height } : sizeCanvas(cv, cv.clientWidth < 560 ? 2.1 : 4.6);
    var W = s.w, H = s.h, ctx = cv.getContext("2d"), r = rng(hash32((w.date || "") + w.mood));
    var sky = { "purple-night": ["#1c0d2e", "#2f1850", "#3a1d5c"], "orange-storm": ["#3a1d5c", "#5a2a3e", "#7a3a1a"],
      "gold-sun": ["#5a2a7e", "#7a4a20", "#c99a1f"], "calm-green": ["#24113a", "#1f4a2a", "#2f6a1a"] }[w.mood];
    ctx.fillStyle = PAL.night; ctx.fillRect(0, 0, W, H);
    var n = Math.min(260, Math.round(W * H / 1800)), unit = H / 10;
    for (var i = 0; i < n; i++) brush(ctx, r, r() * W * 1.1 - W * .05, r() * H, unit * (2 + r() * 5), (r() - .5) * .5, unit * (.5 + r() * .8), sky[i % 3], .55 + r() * .35);
    var cx = W * .86, cy = H * .42, R = H * .24;
    if (w.mood === "gold-sun") {
      for (i = 0; i < 22; i++) { var a = i / 22 * 6.283; brush(ctx, r, cx + Math.cos(a) * R * 1.5, cy + Math.sin(a) * R * 1.5, R * .8, a, unit * .35, PAL.gold, .85); }
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    } else if (w.mood === "orange-storm") {
      for (i = 0; i < 9; i++) { var kx = W * (.5 + r() * .5), ky = H * (.08 + r() * .3); for (var k = 0; k < 6; k++) brush(ctx, r, kx + (r() - .5) * unit * 6, ky + (r() - .5) * unit, unit * (4 + r() * 4), (r() - .5) * .2, unit * 1.2, [PAL.orange, "#c4501a", "#4a2470"][k % 3], .85); }
      for (i = 0; i < Math.round(W / 14); i++) brush(ctx, r, r() * W, r() * H, unit * 1.3, 1.9, Math.max(1.5, unit * .18), r() < .6 ? PAL.orange : PAL.gold, .7);
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = Math.max(3, unit * .35); ctx.lineJoin = "round"; ctx.beginPath();
      var lx = W * .8, ly = H * .08; ctx.moveTo(lx, ly); for (i = 0; i < 4; i++) { lx += (r() - .5) * unit * 3; ly += H * .19; ctx.lineTo(lx, ly); } ctx.stroke();
    } else if (w.mood === "purple-night") {
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(cx, cy, R * .8, 0, 7); ctx.fill();
      ctx.fillStyle = "#2f1850"; ctx.beginPath(); ctx.arc(cx + R * .4, cy - R * .25, R * .75, 0, 7); ctx.fill();
      for (i = 0; i < 50; i++) { ctx.fillStyle = hexA([PAL.gold, PAL.ink, PAL.green][i % 3], .85); ctx.beginPath(); ctx.arc(r() * W, r() * H, 1 + r() * unit * .25, 0, 7); ctx.fill(); }
    } else {
      for (k = 0; k < 4; k++) for (var x = -unit * 3; x < W; x += unit * 4) brush(ctx, r, x, H * (.6 + k * .11) + Math.sin(x / (unit * 6) + k) * unit, unit * 5, (r() - .5) * .3, unit * 1.3, [PAL.green, "#3fae1a", PAL.gold][(k + Math.round(x)) % 3 < 0 ? 0 : (k + Math.round(x)) % 3], .75);
    }
    var col = { "purple-night": PAL.gold, "orange-storm": PAL.orange, "gold-sun": PAL.gold, "calm-green": PAL.green }[w.mood];
    var compact = W / H < 3;
    words(ctx, r, "today's studio weather", W * .04, H * (compact ? .17 : .22), H * (compact ? .1 : .15), FONT_HAND, PAL.ink, "#000", "left", W * .9);
    words(ctx, r, w.label, W * .04, H * (compact ? .4 : .52), H * (compact ? .2 : .3), FONT_PAINT, col, PAL.purple, "left", W * (compact ? .7 : .62));
    words(ctx, r, w.line, W * .04, H * (compact ? .66 : .83), H * (compact ? .085 : .12), FONT_HAND, PAL.ink, "#000", "left", W * .9);
    if (compact && w.numbers && w.numbers.backlog != null) words(ctx, r, "grading backlog " + w.numbers.backlog.toLocaleString("en-US"), W * .04, H * .85, H * .08, FONT_HAND, PAL.muted, "#000", "left", W * .9);
  }

  // ---------- guestbook ----------
  function field(body, keys) {
    var lines = (body || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k].toLowerCase();
        if (l.toLowerCase().indexOf(key + ":") === 0) return l.slice(key.length + 1).trim();
        if (l.indexOf("###") === 0 && l.toLowerCase().indexOf(key) > -1) {
          for (var j = i + 1; j < lines.length; j++) { var v = lines[j].trim(); if (v) return v.indexOf("###") === 0 ? "" : v; }
        }
      }
    }
    return "";
  }
  function clip(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; }
  function noResp(t) { return /^_?no response_?$/i.test(t || "") ? "" : t; }
  var POA_RE = /^poa1[1-9A-HJ-NP-Za-km-z]{20,64}$/;
  function isGuestbook(it) {
    if (it.pull_request) return false;
    var labeled = (it.labels || []).some(function (l) { return (l && l.name || l) === "guestbook"; });
    return labeled || /^\s*\[guestbook\]/i.test(it.title || "");
  }
  var gbPromise = null;
  function loadGuestbook() {
    if (gbPromise) return gbPromise;
    gbPromise = fetchJSON(URLS.guestbook, 6000).then(function (items) {
      if (!Array.isArray(items)) throw new Error("bad data");
      return items.filter(isGuestbook).map(function (it) {
        var poa = noResp(field(it.body, ["poa_address", "PoA miner PUBLIC address", "poa"])).replace(/[`\s]/g, "");
        return {
          name: clip((it.title || "").replace(/^\s*\[guestbook\]\s*/i, "") || field(it.body, ["name"]) || (it.user && it.user.login) || "a visitor", 60),
          kind: clip(noResp(field(it.body, ["kind", "Are you an AI agent or a human?"])), 40),
          hello: clip(noResp(field(it.body, ["hello", "Say hello"])), 160),
          poa: POA_RE.test(poa) ? poa : "",
          date: it.created_at || "",
          url: /^https:\/\/github\.com\//.test(it.html_url || "") ? it.html_url : ""
        };
      });
    }).then(function (list) { return { ok: true, entries: list }; }, function () { return { ok: false, entries: [] }; });
    return gbPromise;
  }

  // one brushstroke per signer: colour + shape from hash(poa1 address) or hash(name)
  function strokeSpec(entry) {
    var key = entry.poa || ("name:" + String(entry.name || "").trim().toLowerCase());
    var h = hash32(key), r = rng(h);
    return {
      key: key, color: FOUR[h % 4], shape: ["sweep", "hook", "dabs", "swirl"][(h >>> 2) % 4],
      x: .12 + r() * .76, y: .14 + r() * .7, ang: r() * Math.PI * 2, len: .16 + r() * .2, width: .025 + r() * .03, bend: (r() - .5) * 1.4, seed: h
    };
  }
  function bareCanvas(ctx, W, H, r) {
    ctx.fillStyle = "#efe5cf"; ctx.fillRect(0, 0, W, H);
    var u = Math.min(W, H) / 20;
    for (var i = 0; i < 140; i++) brush(ctx, r, r() * W, r() * H, u * (2 + r() * 5), (r() - .5) * .8, u * (.6 + r() * .9), ["#e8dcc0", "#f7efdc", "#ddcfae"][i % 3], .5);
    ctx.strokeStyle = hexA(PAL.purple, .35); ctx.lineWidth = Math.max(2, u * .12); ctx.setLineDash([u * .8, u * .5]);
    ctx.strokeRect(u * 1.2, u * 1.2, W - u * 2.4, H - u * 2.4); ctx.setLineDash([]);
  }
  function drawSignerStroke(ctx, sp, W, H) {
    var r = rng(sp.seed ^ 0x9e3779b9), S = Math.min(W, H), x = sp.x * W, y = sp.y * H, L = sp.len * S, w = sp.width * S;
    ctx.save(); ctx.translate(x, y); ctx.rotate(sp.ang); ctx.lineCap = "round"; ctx.lineJoin = "round";
    function body(alpha, lw, dy) {
      ctx.strokeStyle = hexA(sp.color, alpha); ctx.lineWidth = lw; ctx.beginPath();
      if (sp.shape === "sweep") { ctx.moveTo(-L / 2, dy); ctx.quadraticCurveTo(0, L * sp.bend * .4 + dy, L / 2, dy); }
      else if (sp.shape === "hook") { ctx.moveTo(-L / 2, dy); ctx.bezierCurveTo(0, dy, L * .3, -L * .1, L * .3, -L * .35 * (sp.bend > 0 ? 1 : -1) + dy); }
      else if (sp.shape === "swirl") { for (var t = 0; t <= 1.001; t += .05) { var a = t * 4.4, rr = L * .08 + t * L * .32; var px = Math.cos(a) * rr, py = Math.sin(a) * rr * (sp.bend > 0 ? 1 : -1) + dy; t ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } }
      ctx.stroke();
    }
    if (sp.shape === "dabs") {
      for (var i = 0; i < 5; i++) { ctx.fillStyle = hexA(sp.color, .92); ctx.beginPath(); ctx.ellipse(-L / 2 + i * L / 4, Math.sin(i * 1.3 + sp.bend) * w, w * .9, w * .6, sp.bend, 0, 7); ctx.fill(); }
    } else {
      body(.95, w, 0);
      ctx.globalCompositeOperation = "source-atop";
      for (var b = 0; b < 4; b++) body(.22, Math.max(1, w / 8), (r() - .5) * w * .7);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }
  function paintGuestbook(cv, entries, opts) {
    opts = opts || {};
    var s = opts.fixed ? { w: cv.width, h: cv.height } : sizeCanvas(cv, cv.clientWidth < 560 ? 1.15 : 1.6, 900);
    var W = s.w, H = s.h, ctx = cv.getContext("2d"), r = rng(1234567);
    bareCanvas(ctx, W, H, r);
    var list = (entries || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    list.forEach(function (e) { drawSignerStroke(ctx, strokeSpec(e), W, H); });
    var u = Math.min(W, H) / 20;
    if (!list.length) {
      words(ctx, r, "first stroke", W / 2, H * .42, u * 2.6, FONT_PAINT, "#c94f00", hexA(PAL.purple, .6), "center", W * .8);
      words(ctx, r, "is yours", W / 2, H * .6, u * 2.2, FONT_PAINT, "#2fa000", hexA(PAL.gold, .9), "center", W * .8);
      words(ctx, r, "sign the guestbook and your colour appears", W / 2, H * .78, u * .9, FONT_HAND, "#5a2a7e", null, "center", W * .85);
    }
    words(ctx, r, "living guestbook", W - u * 1.6, H - u * 1.4, u * .9, FONT_HAND, "#5a2a7e", null, "right");
    return list.length;
  }

  // ---------- anyone's corner ----------
  var NAME_RES = [/^hosted join:\s*([A-Za-z0-9 _.\-]{2,24})\s*$/, /^([A-Za-z0-9][A-Za-z0-9 _.\-]{1,23}?)\s*(?:\([^)]*\))?\s+joining\b/];
  var GENERIC = { "agent": 1, "an agent": 1, "ai agent": 1, "new agent": 1 };
  function joinName(memo) { // same rule as tools/ledger_weather.py
    memo = String(memo || "").trim();
    for (var i = 0; i < NAME_RES.length; i++) { var m = memo.match(NAME_RES[i]); if (m && !GENERIC[m[1].trim().toLowerCase()]) return m[1].trim(); }
    return null;
  }
  function shortAddr(a) { a = String(a || ""); return a.length > 14 ? a.slice(0, 8) + "…" + a.slice(-4) : a; }
  function loadCorner(base) {
    var miners = fetchJSON(URLS.joins, 4500).then(function (txs) {
      return (Array.isArray(txs) ? txs : []).filter(function (t) { return t && t.type === "join" && POA_RE.test(t.from_addr || ""); })
        .map(function (t) { return { addr: t.from_addr, name: joinName(t.memo), ts: t.ts }; });
    }).catch(function () {
      return fetchJSON((base || "") + "corner.json", 4000).then(function (c) {
        return (c.newest_agents || []).filter(function (t) { return POA_RE.test(t.addr || ""); })
          .map(function (t) { return { addr: t.addr, name: t.name && /^[A-Za-z0-9 _.\-]{2,24}$/.test(t.name) ? t.name : null, ts: t.joined_ts }; });
      });
    }).catch(function () { return []; });
    return Promise.all([loadGuestbook(), miners]).then(function (a) {
      var out = [], seen = {};
      a[0].entries.slice().sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); }).slice(0, 4).forEach(function (e) {
        out.push({ who: clip(e.name, 24), what: "signed the guestbook", kind: "signer", key: e.poa || e.name }); if (e.poa) seen[e.poa] = 1;
      });
      a[1].forEach(function (m) {
        if (seen[m.addr] || out.length >= 10) return; seen[m.addr] = 1;
        out.push({ who: m.name || shortAddr(m.addr), what: "new PoA miner", kind: "miner", key: m.addr });
      });
      return out;
    });
  }
  function paintCornerSign(cv, opts) {
    opts = opts || {};
    var s = opts.fixed ? { w: cv.width, h: cv.height } : sizeCanvas(cv, cv.clientWidth < 560 ? 3.2 : 6, 1100);
    var W = s.w, H = s.h, ctx = cv.getContext("2d"), r = rng(hash32("anyone's corner"));
    ctx.fillStyle = "#24113a"; ctx.fillRect(0, 0, W, H);
    var u = H / 8;
    for (var i = 0; i < 90; i++) brush(ctx, r, r() * W, r() * H, u * (2 + r() * 5), (r() - .5) * .4, u * (.6 + r()), ["#2f1850", "#3a1d5c", "#1c0d2e", "#4a2470"][i % 4], .7);
    for (i = 0; i < 4; i++) brush(ctx, r, W * (.1 + i * .27), H * (.9 + (r() - .5) * .08), W * .3, (r() - .5) * .08, u * .5, FOUR[i], .9);
    words(ctx, r, "anyone's corner", W / 2, H * .38, u * 3.2, FONT_PAINT, PAL.green, PAL.purple, "center", W * .88);
    words(ctx, r, "· everyone gets a wall ·", W / 2, H * .72, u * 1.6, FONT_HAND, PAL.gold, "#000", "center", W * .8);
  }
  // a full wall painting (sign + name cards) for the 3D gallery
  function paintCornerWall(cv, items) {
    var W = cv.width, H = cv.height, ctx = cv.getContext("2d"), r = rng(hash32("corner wall"));
    ctx.fillStyle = "#efe5cf"; ctx.fillRect(0, 0, W, H);
    bareCanvas(ctx, W, H, r);
    var sign = document.createElement("canvas"); sign.width = W; sign.height = Math.round(H * .26);
    paintCornerSign(sign, { fixed: true }); ctx.drawImage(sign, 0, 0);
    var cards = (items || []).slice(0, 8).concat([{ who: "your first try", what: "hangs here", kind: "open" }]);
    var cols = 3, rows = Math.ceil(cards.length / cols), top = H * .3, ch = (H * .97 - top) / Math.max(rows, 3), cw = W / cols;
    cards.forEach(function (c, i) {
      var cx = (i % cols) * cw + cw / 2, cy = top + Math.floor(i / cols) * ch + ch / 2, rr2 = rng(hash32(c.key || c.who));
      var col = c.kind === "open" ? PAL.purple : FOUR[hash32(c.key || c.who) % 4];
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((rr2() - .5) * .08);
      ctx.fillStyle = c.kind === "open" ? "rgba(138,60,255,.12)" : "#fbf3e1"; ctx.fillRect(-cw * .42, -ch * .4, cw * .84, ch * .8);
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, ch * .04);
      if (c.kind === "open") ctx.setLineDash([ch * .08, ch * .06]);
      ctx.strokeRect(-cw * .42, -ch * .4, cw * .84, ch * .8); ctx.setLineDash([]);
      brush(ctx, rr2, -cw * .2, -ch * .22, cw * .3, (rr2() - .5) * .3, ch * .1, col, .9);
      words(ctx, rr2, c.who, 0, ch * .02, ch * .2, FONT_PAINT, c.kind === "open" ? "#5a2a7e" : "#24113a", null, "center", cw * .76);
      words(ctx, rr2, c.what, 0, ch * .24, ch * .13, FONT_HAND, "#5a2a7e", null, "center", cw * .76);
      ctx.restore();
    });
  }

  window.LFGStudio = {
    PAL: PAL, URLS: URLS, T: T, MOODS: MOODS, fetchJSON: fetchJSON, hash32: hash32, rng: rng, moodOf: moodOf, fontsReady: fontsReady,
    loadWeather: loadWeather, paintWeather: paintWeather, loadGuestbook: loadGuestbook, strokeSpec: strokeSpec, paintGuestbook: paintGuestbook,
    joinName: joinName, shortAddr: shortAddr, loadCorner: loadCorner, paintCornerSign: paintCornerSign, paintCornerWall: paintCornerWall
  };
})();
