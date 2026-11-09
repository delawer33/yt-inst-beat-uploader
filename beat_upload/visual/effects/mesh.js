/* Mesh: a dim grainy haze in the cover's own colours breathing with the bands on near black, the
 * cover as a clean card with a hairline frame in the middle, tiny mono words in the corners.
 * The kick barely lifts the card. A player screen in the dark, not a poster. */
(function () {
  'use strict';
  const st = { cols: [], blobs: [], low: null, grain: null, key: '' };
  function dominant(E) { // the cover's colours: the most saturated quarter of its pixels, grouped by hue, dimmed for the dark
    const t = E.mkCanvas(32, 32), g = t.getContext('2d'); g.drawImage(E.cover.src, 0, 0, 32, 32); const d = g.getImageData(0, 0, 32, 32).data, px = [];
    for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); let h = 0; if (mx !== mn) { h = mx === r ? (gg - b) / (mx - mn) + (gg < b ? 6 : 0) : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4; h /= 6; } px.push({ h, s, l }); }
    px.sort((a, b) => b.s - a.s); const top = px.slice(0, 256), bins = new Array(12).fill(0).map(() => ({ n: 0, h: 0, s: 0, l: 0 }));
    for (const p of top) { const b = bins[Math.floor(p.h * 12) % 12]; b.n++; b.h += p.h; b.s += p.s; b.l += p.l; }
    const picked = bins.filter(b => b.n > 4).sort((a, b) => b.n - a.n).slice(0, 4).map(b => `hsl(${Math.round(b.h / b.n * 360)},${Math.round(E.clamp(b.s / b.n, 0.5, 0.85) * 100)}%,${Math.round(E.clamp(b.l / b.n, 0.26, 0.34) * 100)}%)`);
    while (picked.length < 4) picked.push(['hsl(260,70%,30%)', 'hsl(330,80%,32%)', 'hsl(200,80%,30%)', 'hsl(40,90%,32%)'][picked.length]);
    return picked;
  }
  function grain(E) { const n = 200, c = E.mkCanvas(n, n), g = c.getContext('2d'), im = g.createImageData(n, n), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } g.putImageData(im, 0, 0); return c; }
  function build(E) {
    st.cols = dominant(E); st.blobs = []; for (let i = 0; i < 5; i++) st.blobs.push({ col: st.cols[i % 4], ax: 0.3 + Math.random() * 0.4, ay: 0.3 + Math.random() * 0.4, fx: 0.05 + Math.random() * 0.08, fy: 0.04 + Math.random() * 0.07, ph: Math.random() * 6.28, band: [1, 3, 4, 2, 5][i] });
    st.low = E.mkCanvas(Math.round(E.W / 8), Math.round(E.H / 8)); st.grain = st.grain || grain(E); st.key = E.cover.version + '|' + E.W;
  }
  function tiny(c, E, col, muted) { const { W, S, meta } = E, yt = E.FMT === 'yt', y = (yt ? 44 : 160) * S; c.save(); c.letterSpacing = 2.5 * S + 'px'; E.mono(c, meta.title.toUpperCase(), 28 * S, y, 12 * S, col); E.mono(c, meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 28 * S, y + 20 * S, 10 * S, muted); const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '); if (facts) E.mono(c, facts, W - 28 * S, y, 12 * S, col, 'right'); c.restore(); }
  BeatVisual.register({
    id: 'mesh', name: 'Mesh', fam: 'soft',
    blurb: 'Тусклая зернистая дымка в цветах самой обложки дышит полосами спектра на почти чёрном; обложка — чистая карточка с волосяной рамкой посередине, мелкие моно-подписи по углам. Кик едва приподнимает карточку. Экран плеера в темноте, не плакат.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E; if (st.key !== E.cover.version + '|' + W) build(E);
      const g = st.low.getContext('2d'), w = st.low.width, h = st.low.height, t = A.t;
      g.globalCompositeOperation = 'source-over'; g.fillStyle = '#030306'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'lighter';
      for (const b of st.blobs) {
        const x = (b.ax + 0.25 * Math.sin(t * b.fx * 6.28 + b.ph)) * w, y = (b.ay + 0.25 * Math.cos(t * b.fy * 6.28 + b.ph)) * h, r = (0.5 + 0.35 * A.bands[b.band]) * w * 0.9;
        const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, b.col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.globalAlpha = 0.45; g.fillRect(0, 0, w, h);
      }
      g.globalAlpha = 1; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(st.low, 0, 0, W, H);
      c.save(); c.globalAlpha = 0.14; c.globalCompositeOperation = 'overlay'; const gs = st.grain.width * S, ox = Math.floor(Math.random() * gs), oy = Math.floor(Math.random() * gs); for (let y = -oy; y < H; y += gs) for (let x = -ox; x < W; x += gs) c.drawImage(st.grain, x, y, gs, gs); c.restore();
      // the card
      const yt = E.FMT === 'yt', size = yt ? H * 0.5 : W * 0.54, cx = W / 2, cy = yt ? H * 0.54 : H * 0.5, sc = 1 + 0.015 * A.kick, cv = E.cover.src, k = Math.max(size / cv.width, size / cv.height);
      c.save(); c.translate(cx, cy); c.scale(sc, sc); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 60 * S; c.shadowOffsetY = 24 * S; c.fillStyle = '#000'; c.fillRect(-size / 2, -size / 2, size, size); c.shadowColor = 'transparent';
      c.drawImage(cv, (cv.width - size / k) / 2, (cv.height - size / k) / 2, size / k, size / k, -size / 2, -size / 2, size, size); c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = S; c.strokeRect(-size / 2 - 6 * S, -size / 2 - 6 * S, size + 12 * S, size + 12 * S); c.restore();
      tiny(c, E, '#fff', 'rgba(255,255,255,0.55)');
    },
  });
})();
