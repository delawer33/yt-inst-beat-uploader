/* The Effect engine: what the Visual Lab and the Render share (ADR 0011).
 *
 * One 2D canvas at the Lab's size (Reel 540x960, YouTube 960x540) times S, the scale the
 * driver asks for in setFormat(f, s): the Lab draws at S = 1, the Render at S = 2, so the file
 * is painted 1920x1080 / 1080x1920 straight, with crisp text and dots. Every pixel constant
 * in here and in effects/ is written in Lab pixels and multiplied by S. The engine owns the Cover Style palettes, the cover and its Photoshop-like
 * composite, the static treatments every Effect cuts between, the Label and the header, and
 * the cut clock that turns hits into cuts. An Effect is one file in effects/ that calls
 * BeatVisual.register({id, name, fam, blurb, init(E), draw(c, A, E)}); E is this engine,
 * so a draw starts with `const {W, H, pal} = E;` and calls E.ext(pal, false) and friends.
 *
 * Who fills A (the per-frame analysis) is the driver's business: the Lab runs Web Audio and
 * calls E.analyseLive(); the Render gets features from Python and calls E.renderFrame(f).
 */
(function () {
  'use strict';
  const E = {};
  let W = 540, H = 960, FMT = 'reel', S = 1;
  const FORMATS = { reel: [540, 960], yt: [960, 540] };
  let stage = null, ctx = null;

  // ---- the Cover Styles with a palette: colours shadows -> highlights, as in beat_upload/cover_style.py; film_grain has none and falls back to the first
  const PALETTES = [
    { id: 'purple_yellow_5tone', c: ['#1c0838', '#6b1c9e', '#e0287a', '#ffc61a', '#d8fbff'], cuts: [45, 95, 150, 205] },
    { id: 'purple_yellow_thick_ink', c: ['#230a46', '#c81e8c', '#ffcd28', '#c8ffff'], cuts: [60, 120, 190] },
    { id: 'golden_wind', c: ['#1a0a2e', '#b0153a', '#f5c518', '#fff6d5'], cuts: [60, 120, 190] },
    { id: 'dio_green', c: ['#0d2b1a', '#6a1fa0', '#c8e632', '#fdfbd0'], cuts: [60, 120, 190] },
    { id: 'diamond_pink_cyan', c: ['#14123a', '#ff3d9a', '#39d5e6', '#ffffff'], cuts: [60, 120, 190] },
    { id: 'stone_ocean', c: ['#06204a', '#1a8f9e', '#a6e22e', '#f0fff0'], cuts: [60, 120, 190] },
    { id: 'blood_3tone', c: ['#0a0a0a', '#c1121f', '#ffe8c2'], cuts: [80, 170] },
  ];
  let pal = PALETTES[0];
  const LOG2S_OF = () => Math.round(Math.log2(S)); // extra blur halvings so the composite blurs as wide at S = 2
  const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };
  // grey 0-255 -> the band colour of the palette, like the gradient map in the Render
  function bandColour(p, g) { let i = 0; while (i < p.cuts.length && g >= p.cuts[i]) i++; return p.c[i]; }
  function bandIndex(p, g) { let i = 0; while (i < p.cuts.length && g >= p.cuts[i]) i++; return i; }
  const last = p => p.c[p.c.length - 1];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- what the header and the type treatments say; the driver sets it
  const meta = { title: 'Untitled', artists: '', bpm: 0, key: '', no: 0 };
  // ---- the knobs of the Lab; the Render uses the defaults
  const knobs = { intensity: 1, cutRate: 'kick', pump: 0, label: false }; // pump: the whole-frame zoom on the kick, off since 2026-11-08; label: the black Label box top right, off since 2026-10-31 (the owner dropped both)

  // ---- analysis state, filled once per frame
  const A = {
    bands: [0, 0, 0, 0, 0, 0], level: 0, kick: 0, snare: 0, hat: 0, kickHit: false, snareHit: false, hatHit: false,
    phase: 0, bar: 0, beatHit: false, freq: new Uint8Array(1024), timeL: new Float32Array(1024), timeR: new Float32Array(1024),
    peaks: null, t: 0, playing: false, kicks: 0, beats: 0, secs: 0, cut: false, cutKind: null, barHit: false,
  };
  // ---- spectrum history: one row of 64 log-spaced bins (40 Hz .. 12 kHz) per frame, newest last
  const spec = { rows: [] };
  function pushSpec(row) { spec.rows.push(row || new Float32Array(64)); if (spec.rows.length > 64) spec.rows.shift(); }
  function fmt(s) { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

  // ---- the cover. Everything derived from it is cached per cover and palette.
  const cover = { src: null, img: null, w: 540, h: 540, version: 0, top: 0, left: 0, cache: new Map() };
  // A video as the source: `el` is a playing <video> (the Lab), `next` the frame the Render hands in per call (render.html).
  const video = { el: null, next: null, lastNext: null, mode: 'cuts', lastT: -1, frames: 0 };
  const LIVE = () => !!(video.el || video.next) && video.mode === 'live';
  function syncVideo() { // the current video frame becomes the cover: every new frame when live, only on a cut when stop-motion
    const el = video.el || video.next; if (!el || (video.el && el.readyState < 2) || !cover.src) return;
    const fresh = video.el ? el.currentTime !== video.lastT : el !== video.lastNext;
    if (video.mode === 'live' ? fresh : A.cut) { video.lastT = video.el ? el.currentTime : -1; video.lastNext = video.next; cover.src.getContext('2d').drawImage(el, 0, 0, cover.w, cover.h); cover.version++; cover.cache.clear(); video.frames++; }
  }
  function setClipFrame(img) { video.next = img; } // the Render: the clip's frame for this call, adopted by syncVideo as `video.mode` says
  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function makeDefaultCover() {
    const D = 540 * S, c = mkCanvas(D, D), g = c.getContext('2d');
    const rg = g.createRadialGradient(D * 0.62, D * 0.38, 20 * S, D * 0.5, D * 0.5, D * 0.75); rg.addColorStop(0, '#d9d9e2'); rg.addColorStop(0.45, '#5a5a6a'); rg.addColorStop(1, '#07070a');
    g.fillStyle = rg; g.fillRect(0, 0, D, D);
    g.save(); g.translate(D * 0.5, D * 0.56); g.rotate(-0.08); g.font = '400 ' + 560 * S + 'px "League Gothic"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#17171c'; g.fillText((meta.title[0] || 'D').toUpperCase(), 8 * S, 8 * S); g.fillStyle = '#f2f2f5'; g.fillText((meta.title[0] || 'D').toUpperCase(), 0, 0); g.restore();
    g.globalAlpha = 0.35; g.fillStyle = '#fff'; for (let i = 0; i < 900 * S * S; i++) { g.fillRect(Math.random() * D, Math.random() * D, 1.5 * S, 1.5 * S); }
    g.globalAlpha = 0.5; const lg = g.createLinearGradient(0, 0, D, D); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.35)'); lg.addColorStop(0.52, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(0, 0, D, D);
    g.globalAlpha = 1; setCover(c);
  }
  function setCover(img) { // the Reel: the cover as wide as the frame, lifted above the centre (REEL_LIFT); YouTube: as tall as the frame, centred
    cover.img = img; const iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height; let w, h;
    if (FMT === 'yt') { h = H; w = Math.round(H * iw / ih); if (w > W) { w = W; h = Math.round(W * ih / iw); } } else { w = W; h = ih / iw >= 1.6 ? H : Math.min(720 * S, Math.round(W * ih / iw)); } // a 9:16 source fills the Reel; anything squarer sits above the caption
    const c = mkCanvas(w, h); c.getContext('2d').drawImage(img, 0, 0, w, h); cover.src = c; cover.w = w; cover.h = h; cover.version++; cover.cache.clear();
    cover.left = Math.round((W - w) / 2); cover.top = FMT === 'yt' || h >= H ? Math.round((H - h) / 2) : Math.round(H / 2 - 60 * S - h / 2);
  }
  function setFormat(f, s) { FMT = f; S = s || S; [W, H] = FORMATS[f].map(v => v * S); cover.cache.clear(); if (stage) { stage.width = W; stage.height = H; } layout(); atlases.clear(); if (cover.img) setCover(cover.img); else makeDefaultCover(); if (current && current.init) current.init(E); }
  function attach(canvas) { stage = canvas; ctx = canvas.getContext('2d'); stage.width = W; stage.height = H; }

  // ---- the cover laid into the frame like a Photoshop composite: a blurred copy fills the frame, the cover
  // continues beyond its edges as a fading mirror, its own edges are feathered, the frame edges get a vignette.
  function blurCanvas(src, levels) { // halve `levels` times and scale back: a cheap, wide, smooth blur
    let cur = src, w = src.width, h = src.height;
    for (let i = 0; i < levels; i++) { w = Math.max(1, Math.round(w / 2)); h = Math.max(1, Math.round(h / 2)); const n = mkCanvas(w, h), g = n.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(cur, 0, 0, w, h); cur = n; }
    const out = mkCanvas(src.width, src.height), g = out.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, src.width, src.height); return out;
  }
  function fadeBand(img, side, fadeLen) { // the cover mirrored towards `side` (up, down, left, right), fading out away from the seam
    const w = cover.w, h = cover.h, t = mkCanvas(w, h), g = t.getContext('2d'); g.save();
    if (side === 'up' || side === 'down') { g.translate(0, h); g.scale(1, -1); } else { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(img, 0, 0, w, h); g.restore(); g.globalCompositeOperation = 'destination-out';
    const gr = side === 'up' ? g.createLinearGradient(0, h, 0, h - fadeLen) : side === 'down' ? g.createLinearGradient(0, 0, 0, fadeLen) : side === 'left' ? g.createLinearGradient(w, 0, w - fadeLen, 0) : g.createLinearGradient(0, 0, fadeLen, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); return t;
  }
  function ext(p, light) {
    const key = 'ext' + p.id + (light ? 'L' : 'D') + FMT + 'v' + cover.version; if (cover.cache.has(key)) return cover.cache.get(key);
    const c = mkCanvas(W, H), g = c.getContext('2d'), base = light ? last(p) : p.c[0], top = cover.top, left = cover.left, w = cover.w, h = cover.h, vert = FMT !== 'yt';
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    const far = blurCanvas(cover.src, 5 + LOG2S_OF()), s = Math.max(W / w, H / h), dw = w * s, dh = h * s;
    g.globalAlpha = light ? 0.3 : 0.85; g.drawImage(far, (W - dw) / 2, (H - dh) / 2, dw, dh); g.globalAlpha = 1;
    const near = blurCanvas(cover.src, 2 + LOG2S_OF()), fade = Math.min(vert ? h : w, 210 * S); g.globalAlpha = 0.72;
    if (vert) { g.drawImage(fadeBand(near, 'up', fade), left, top - h); g.drawImage(fadeBand(near, 'down', fade), left, top + h); }
    else { g.drawImage(fadeBand(near, 'left', fade), left - w, top); g.drawImage(fadeBand(near, 'right', fade), left + w, top); }
    g.globalAlpha = 1;
    const F = 28 * S, t = mkCanvas(w, h), tg = t.getContext('2d'); tg.drawImage(cover.src, 0, 0); tg.globalCompositeOperation = 'destination-out';
    const feather = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = tg.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); tg.fillStyle = gr; tg.fillRect(rx, ry, rw, rh); };
    if (vert) { feather(0, 0, 0, F, 0, 0, w, F); feather(0, h, 0, h - F, 0, h - F, w, F); } else { feather(0, 0, F, 0, 0, 0, F, h); feather(w, 0, w - F, 0, w - F, 0, F, h); }
    g.drawImage(t, left, top);
    const a = light ? 0.75 : 0.65, v = vert ? g.createLinearGradient(0, 0, 0, H) : g.createLinearGradient(0, 0, W, 0), span = vert ? H : W, c0 = vert ? top : left, c1 = vert ? top + h : left + w;
    const s0 = Math.max(0, Math.min(1, c0 / span)), s1 = Math.max(s0, Math.min(1, c1 / span));
    v.addColorStop(0, rgba(base, a)); v.addColorStop(s0, rgba(base, 0)); v.addColorStop(s1, rgba(base, 0)); v.addColorStop(1, rgba(base, a));
    g.fillStyle = v; g.fillRect(0, 0, W, H); cover.cache.set(key, c); return c;
  }
  function greyLevels(g, cols, rows) { // auto-levelled greys (2-98 percentile, span >= 24) so dark covers keep their shading
    const d = g.getImageData(0, 0, cols, rows).data, out = new Float32Array(cols * rows);
    for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const sorted = Float32Array.from(out).sort(), lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.98)], span = Math.max(24, hi - lo);
    for (let i = 0; i < out.length; i++) out[i] = clamp((out[i] - lo) / span * 255, 0, 255); return out;
  }
  function extGrey(p, light, cols, rows) { // grey of the composite at cols x rows
    const key = 'eg' + p.id + (light ? 'L' : 'D') + cols + 'x' + rows + 'v' + cover.version; if (cover.cache.has(key)) return cover.cache.get(key);
    const t = mkCanvas(cols, rows), g = t.getContext('2d'); g.drawImage(ext(p, light), 0, 0, cols, rows); const out = greyLevels(g, cols, rows);
    cover.cache.set(key, out); return out;
  }
  function posterize(g, w, h, p) { // grey, contrast 1.3, one colour per band: the gradient map of the Render
    const im = g.getImageData(0, 0, w, h), d = im.data, cols = p.c.map(hex2rgb);
    for (let i = 0; i < d.length; i += 4) { const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], gr = clamp((v - 128) * 1.3 + 128, 0, 255), rgb = cols[bandIndex(p, gr)]; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; }
    g.putImageData(im, 0, 0);
  }
  function extPoster(p) { // the composite painted in the Cover Style; at half size while a video runs live
    const key = 'ep' + p.id + 'v' + cover.version; if (cover.cache.has(key)) return cover.cache.get(key);
    const s = LIVE() ? 2 : 1, w = Math.round(W / s), h = Math.round(H / s), t = mkCanvas(w, h), g = t.getContext('2d'); g.drawImage(ext(p, false), 0, 0, w, h); posterize(g, w, h, p);
    let c = t; if (s !== 1) { c = mkCanvas(W, H); const cg = c.getContext('2d'); cg.imageSmoothingEnabled = true; cg.drawImage(t, 0, 0, W, H); } cover.cache.set(key, c); return c;
  }

  // ---- text helpers
  function fitText(c, text, x, y, w, h, colour, align) { // text stretched to exactly w x h, League Gothic
    c.save(); c.font = '400 100px "League Gothic"'; c.textBaseline = 'alphabetic'; const m = c.measureText(text); const tw = m.width || 1;
    const capH = 72; // League Gothic caps are about 0.72 em
    c.fillStyle = colour; c.translate(align === 'right' ? x + w : x, y + h); c.scale(w / tw, h / capH); c.textAlign = align === 'right' ? 'right' : 'left'; c.fillText(text, 0, 0); c.restore();
  }
  function gothic(c, text, x, y, size, colour, align) { c.font = '400 ' + size + 'px "League Gothic"'; c.fillStyle = colour; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic'; c.fillText(text, x, y); }
  function mono(c, text, x, y, size, colour, align) { c.font = '600 ' + size + 'px "IBM Plex Mono"'; c.fillStyle = colour; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic'; c.fillText(text, x, y); }

  // ---- the Label: PRODUCED BY / DELAWER / YOU BETTER RUN, the proportions of beat_upload/label.py
  function drawLabel(c, x, y, w, scale) {
    if (!knobs.label) return; const s = scale || 1; w *= s; const pad = 0.07 * w, inner = w - 2 * pad, l1 = 0.095 * w, g1 = 0.055 * w, big = 0.24 * w, band = big + 0.06 * w, g2 = 0.047 * w, l3 = 0.13 * w;
    const h = 2 * pad + l1 + g1 + band + g2 + l3; c.fillStyle = '#000'; c.fillRect(x, y, w, h); let yy = y + pad;
    fitText(c, 'PRODUCED BY', x + pad, yy, inner, l1, '#fff'); yy += l1 + g1;
    c.fillStyle = '#fff'; c.fillRect(x + pad, yy, inner, band); fitText(c, 'DELAWER', x + pad + inner * 0.03, yy + 0.03 * w, inner * 0.94, big, '#000'); yy += band + g2;
    fitText(c, 'YOU BETTER RUN', x + pad, yy, inner, l3, '#fff'); return h;
  }
  // ---- the header: title, artists and the facts at the top, clear of the Reel caption; the Label top right
  let LABEL_W, LABEL_X, LABEL_Y;
  function layout() { if (FMT === 'yt') { LABEL_W = W * 0.155; LABEL_X = W - LABEL_W - W * 0.03; LABEL_Y = Math.round(H * 0.06); } else { LABEL_W = W * 0.27; LABEL_X = W - LABEL_W - W * 0.04; LABEL_Y = 112 * S; } }
  layout();
  function header(c, fg, muted) {
    const title = meta.title.toUpperCase(), yt = FMT === 'yt', big = (yt ? 80 : 72) * S, maxW = yt ? W * 0.38 : LABEL_X - 44 * S; c.font = '400 ' + big + 'px "League Gothic"'; const tw = c.measureText(title).width; const size = tw > maxW ? Math.max(28 * S, Math.floor(big * maxW / tw)) : big;
    gothic(c, title, 28 * S, (yt ? 96 : 180) * S, size, fg);
    mono(c, (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT'), 30 * S, (yt ? 120 : 206) * S, (yt ? 13 : 14) * S, muted);
    const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : '', meta.no ? 'No.' + String(meta.no).padStart(3, '0') : ''].filter(Boolean).join('  ·  ');
    if (facts) mono(c, facts, 30 * S, (yt ? 142 : 230) * S, (yt ? 13 : 14) * S, muted);
    drawLabel(c, LABEL_X, LABEL_Y, LABEL_W);
  }
  function headerShade(c, p) { const y0 = FMT === 'yt' ? 0 : 90 * S, y1 = FMT === 'yt' ? Math.round(H * 0.34) : 280 * S; const gr = c.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, rgba(p.c[0], 0.92)); gr.addColorStop(1, rgba(p.c[0], 0)); c.fillStyle = gr; c.fillRect(0, y0, W, y1 - y0); }
  const cutHeader = (c, p) => { headerShade(c, p); header(c, last(p), rgba(last(p), 0.7)); };
  // glyph atlas for the ASCII family: every ramp character in every palette colour, one cell each
  const atlases = new Map(); const RAMP = " .'`^:;-~=+*#%@";
  function atlas(p, cw, rh) {
    const key = p.id + '|' + cw.toFixed(2); if (atlases.has(key)) return atlases.get(key);
    const at = mkCanvas(Math.ceil(RAMP.length * cw), Math.ceil(p.c.length * rh)), g = at.getContext('2d'); g.font = '600 ' + (cw * 1.7).toFixed(1) + 'px "IBM Plex Mono"'; g.textBaseline = 'top'; g.textAlign = 'center';
    p.c.forEach((col, b) => { g.fillStyle = col; for (let i = 0; i < RAMP.length; i++) g.fillText(RAMP[i], i * cw + cw / 2, b * rh + S); }); atlases.set(key, at); return at;
  }

  // ---- the cut clock turns hits (or the beat grid) into A.cut / A.cutKind / A.barHit
  const cut = { lastStep: -1, lastBar: -1, kicks: 0, n: 0 };
  function cutClock() {
    A.cut = false; A.cutKind = null; const r = knobs.cutRate;
    if (r === 'kick') { if (A.kickHit) { A.cut = true; A.cutKind = 'kick'; } else if (A.snareHit) { A.cut = true; A.cutKind = 'snare'; } }
    else if (r === 'kick2') { if (A.kickHit) { cut.kicks++; if (cut.kicks % 2 === 0) { A.cut = true; A.cutKind = 'kick'; } } }
    else { const div = r === 'beat' ? 1 : 2, step = Math.floor(A.beats * div); if (A.playing && step !== cut.lastStep) { cut.lastStep = step; A.cut = true; const s = step % (4 * div); A.cutKind = (s === div || s === 3 * div) ? 'snare' : 'kick'; } }
    const bar = A.playing ? Math.floor(A.beats / 4) : -1; A.barHit = bar !== cut.lastBar; cut.lastBar = bar; if (A.cut) cut.n++;
  }
  function cropRect(z, ax, ay, aw, ah) { // the largest aw:ah window of the composite at zoom z around (ax,ay) in frame fractions; a zoomed window stays on the real cover
    const sw = Math.min(W, H * aw / ah) / z, sh = sw * ah / aw, inY = sh <= cover.h, y0 = inY ? cover.top : 0, y1 = inY ? cover.top + cover.h : H, inX = sw <= cover.w, x0 = inX ? cover.left : 0, x1 = inX ? cover.left + cover.w : W;
    return { sx: clamp(ax * W - sw / 2, x0, Math.max(x0, x1 - sw)), sy: clamp(ay * H - sh / 2, y0, Math.max(y0, y1 - sh)), sw, sh };
  }
  function interest() { // cover cells ranked by local contrast: plans aim at eyes and letters, not at flat background
    const key = 'int' + cover.version; if (cover.cache.has(key)) return cover.cache.get(key);
    const N = 12, t = mkCanvas(N * 4, N * 4), g = t.getContext('2d'); g.drawImage(cover.src, 0, 0, N * 4, N * 4); const d = g.getImageData(0, 0, N * 4, N * 4).data, cells = [];
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
      let s = 0, s2 = 0; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const i = ((cy * 4 + y) * N * 4 + cx * 4 + x) * 4, v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; s += v; s2 += v * v; }
      const m = s / 16; cells.push({ x: (cx + 0.5) / N, y: (cy + 0.5) / N, sd: Math.sqrt(Math.max(0, s2 / 16 - m * m)) });
    }
    cells.sort((a, b) => b.sd - a.sd); const out = cells.slice(0, 10); cover.cache.set(key, out); return out;
  }
  function anchor() { const q = interest()[Math.floor(Math.random() * 10)]; return { x: (cover.left + q.x * cover.w) / W, y: (cover.top + q.y * cover.h) / H }; }
  function cropGrey(p, cr, cols, rows) { const t = mkCanvas(cols, rows), g = t.getContext('2d'); g.drawImage(ext(p, false), cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, cols, rows); return greyLevels(g, cols, rows); }
  function glyphs(g, p, cols, grey, shift) {
    const cw = W / cols, rh = cw * 1.9, rows = Math.ceil(H / rh), at = atlas(p, cw, rh);
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) { const gv = clamp(grey[r * cols + i] + shift, 0, 255), idx = Math.min(RAMP.length - 1, Math.floor(gv / 256 * RAMP.length)); if (idx === 0) continue; g.drawImage(at, idx * cw, bandIndex(p, gv) * rh, cw, rh, i * cw, r * rh, cw, rh); }
  }
  function halftone(g, p, ink, ang, dx, dy, lo, cell) { // one Riso screen of the composite in one ink; transparent where there is no dot
    const COLS = 180, ROWS = 320, gr = extGrey(p, false, COLS, ROWS), D = Math.hypot(W, H) / 2, cs = Math.cos(ang), sn = Math.sin(ang);
    g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = ink; g.beginPath();
    for (let v = -D; v < D; v += cell) for (let u = -D; u < D; u += cell) {
      const x = W / 2 + u * cs - v * sn + dx, y = H / 2 + u * sn + v * cs + dy; if (x < -cell || y < -cell || x > W + cell || y > H + cell) continue;
      const gi = clamp((y / H * ROWS) | 0, 0, ROWS - 1) * COLS + clamp((x / W * COLS) | 0, 0, COLS - 1); let d = gr[gi] / 255; if (lo) d = (d - lo) / (1 - lo); if (d <= 0.02) continue;
      const r = cell * 0.74 * Math.sqrt(d); g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832);
    }
    g.fill(); g.restore();
  }
  function plate(p, k) { // one Cover Style band as a printing plate: its ink on a transparent sheet, own screen angle
    const key = 'pl' + k + p.id + 'v' + cover.version; if (cover.cache.has(key)) return cover.cache.get(key);
    const c = mkCanvas(W, H), g = c.getContext('2d'), COLS = 180, ROWS = 320, gr = extGrey(p, false, COLS, ROWS), cell = 9 * S, D = Math.hypot(W, H) / 2, angles = [0.2618, 1.309, 0, 0.785], cuts = [0, ...p.cuts, 256];
    const lo = cuts[k - 1] / 255, hi = cuts[k] / 255, ang = angles[(k - 1) % 4], cs = Math.cos(ang), sn = Math.sin(ang); g.fillStyle = p.c[k]; g.beginPath();
    for (let v = -D; v < D; v += cell) for (let u = -D; u < D; u += cell) {
      const x = W / 2 + u * cs - v * sn, y = H / 2 + u * sn + v * cs; if (x < -cell || y < -cell || x > W + cell || y > H + cell) continue;
      const gi = clamp((y / H * ROWS) | 0, 0, ROWS - 1) * COLS + clamp((x / W * COLS) | 0, 0, COLS - 1), d = clamp((gr[gi] / 255 - lo) / (hi - lo), 0, 1); if (d <= 0.03) continue;
      const r = cell * 0.7 * Math.sqrt(d); g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832);
    }
    g.fill(); cover.cache.set(key, c); return c;
  }
  function edges(p) { // Sobel of the composite: a line drawing on a transparent sheet, strong edges in the light ink
    const key = 'edge' + p.id + 'v' + cover.version; if (cover.cache.has(key)) return cover.cache.get(key);
    const s = LIVE() ? 2 : 1, w = Math.round(W / s), h = Math.round(H / s), t = mkCanvas(w, h), g = t.getContext('2d'); g.drawImage(ext(p, false), 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const out = g.createImageData(w, h), o = out.data, cols = p.c.map(hex2rgb), K = p.c.length, th = 24 / s / S;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1], gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      const m = Math.hypot(gx, gy); if (m < th) continue; const a = clamp((m - th) * S / 120, 0, 1), rgb = cols[clamp(1 + Math.round(a * (K - 2)), 1, K - 1)]; o[i * 4] = rgb[0]; o[i * 4 + 1] = rgb[1]; o[i * 4 + 2] = rgb[2]; o[i * 4 + 3] = Math.round((0.35 + 0.65 * a) * 255);
    }
    g.putImageData(out, 0, 0); let c = t; if (s !== 1) { c = mkCanvas(W, H); c.getContext('2d').drawImage(t, 0, 0, W, H); } cover.cache.set(key, c); return c;
  }
  function treat(p, name) { // static treatments of the whole composite, cached per palette and cover: what the cut variants cut between
    const key = 'tr' + name + p.id + 'v' + cover.version; if (cover.cache.has(key)) return cover.cache.get(key); let c;
    if (name === 'photo') c = ext(p, false); else if (name === 'poster') c = extPoster(p);
    else {
      c = mkCanvas(W, H); const g = c.getContext('2d'); g.fillStyle = p.c[0]; g.fillRect(0, 0, W, H);
      if (name === 'ascii') { const cols = 96, rows = Math.ceil(H / (W / cols * 1.9)); g.globalAlpha = 0.32; g.drawImage(extPoster(p), 0, 0); g.globalAlpha = 1; glyphs(g, p, cols, extGrey(p, false, cols, rows), 0); }
      else if (name === 'riso') { halftone(g, p, p.c.length === 5 ? p.c[2] : p.c[1], 0.2618, 0, 0, 0, 8 * S); halftone(g, p, last(p), 1.309, 2 * S, 1.5 * S, 0.45, 8 * S); }
      else if (name === 'edge') g.drawImage(edges(p), 0, 0);
    }
    cover.cache.set(key, c); return c;
  }
  function pixelSort(img, vertical, lo, hi) { // runs of pixels inside a luminance window are sorted along the line, bright sinks to the far end
    const d = img.data, w = img.width, h = img.height, n = w * h, lum = new Uint8Array(n); for (let i = 0; i < n; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) | 0;
    const px = new Uint32Array(d.buffer), L = vertical ? h : w, lines = vertical ? w : h, keys = new Uint32Array(L), tmp = new Uint32Array(L);
    for (let l = 0; l < lines; l++) {
      const at = k => vertical ? k * w + l : l * w + k; let k = 0; while (k < L) {
        while (k < L && (lum[at(k)] < lo || lum[at(k)] > hi)) k++; const s = k; while (k < L && lum[at(k)] >= lo && lum[at(k)] <= hi) k++; const len = k - s; if (len < 6 * S) continue;
        for (let j = 0; j < len; j++) { const i = at(s + j); keys[j] = (lum[i] << 16) | j; tmp[j] = px[i]; } const sub = keys.subarray(0, len); sub.sort(); for (let j = 0; j < len; j++) px[at(s + j)] = tmp[sub[j] & 0xffff];
      }
    }
    return img;
  }

  // ---- the Effect registry and the frame
  const STYLES = [];
  let current = null;
  function register(style) { const i = STYLES.findIndex(s => s.id === style.id); if (i >= 0) STYLES[i] = style; else STYLES.push(style); return style; }
  function pick(id) { current = STYLES.find(s => s.id === id) || STYLES[0]; if (current && current.init) current.init(E); return current; }
  function setPal(p) { pal = typeof p === 'string' ? (PALETTES.find(x => x.id === p) || PALETTES[0]) : p; if (current && current.init) current.init(E); }
  function drawFrame() {
    if (!current || !ctx) return; const k = knobs.pump * A.kick; ctx.save(); if (k > 0) { ctx.translate(W / 2, H / 2); ctx.scale(1 + k, 1 + k); ctx.translate(-W / 2, -H / 2); }
    try { current.draw(ctx, A, E); } finally { ctx.restore(); }
  }
  // The Render's frame: `f` is one row of features from Python (beat_upload/visual/analysis.py).
  function renderFrame(f) {
    for (let i = 0; i < 6; i++) A.bands[i] = Math.min(1, f.bands[i] * knobs.intensity);
    A.level = f.level; A.kickHit = f.kickHit; A.snareHit = f.snareHit; A.hatHit = f.hatHit;
    A.kick = Math.max(A.kick * 0.86, A.kickHit ? 1 : 0); A.snare = Math.max(A.snare * 0.84, A.snareHit ? 1 : 0); A.hat = Math.max(A.hat * 0.75, A.hatHit ? 1 : 0);
    if (A.kickHit) A.kicks++;
    A.t = f.t; A.secs = f.t; A.playing = true; A.beats = f.beats; A.phase = f.phase; A.bar = f.bar; A.beatHit = f.beatHit;
    if (f.timeL) A.timeL.set(f.timeL); pushSpec(f.spec ? Float32Array.from(f.spec, v => Math.min(1, v * knobs.intensity)) : null);
    cutClock(); syncVideo(); drawFrame();
  }
  function forceCut(kind) { A.cut = true; A.cutKind = kind || 'kick'; syncVideo(); drawFrame(); A.cut = false; }

  Object.defineProperties(E, {
    W: { get: () => W }, H: { get: () => H }, S: { get: () => S }, FMT: { get: () => FMT }, pal: { get: () => pal }, current: { get: () => current },
    LABEL_W: { get: () => LABEL_W }, LABEL_X: { get: () => LABEL_X }, LABEL_Y: { get: () => LABEL_Y }, stage: { get: () => stage }, ctx: { get: () => ctx },
  });
  Object.assign(E, {
    PALETTES, FORMATS, A, spec, meta, knobs, cover, video, STYLES, RAMP, LIVE,
    hex2rgb, rgba, bandColour, bandIndex, last, clamp, fmt, mkCanvas, pushSpec,
    attach, setFormat, setCover, setClipFrame, makeDefaultCover, syncVideo, blurCanvas, ext, extGrey, greyLevels, posterize, extPoster,
    fitText, gothic, mono, drawLabel, header, headerShade, cutHeader, atlas,
    cutClock, cropRect, interest, anchor, cropGrey, glyphs, halftone, plate, edges, treat, pixelSort,
    register, pick, setPal, drawFrame, renderFrame, forceCut,
  });
  window.BeatVisual = E;
})();
