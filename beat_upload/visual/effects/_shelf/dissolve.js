/* Dissolve: the cover burns in and out of a dark sheet through drifting noise, like ink in water
 * or a photo developing. A bright rim glows along the edge of the reveal. The visibility
 * breathes with the bar, the kick opens it wide, then it closes again. */
(function () {
  'use strict';
  const st = { key: '', low: null, rim: null, mask: null, G1: null, G2: null, imp: 0, bg: '#000', rimRGB: [255, 255, 255] };
  const lerp = (a, b, t) => a + (b - a) * t, sm = t => t * t * (3 - 2 * t);
  function grid(n, m) { const g = new Float32Array(n * m); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return { g, n, m }; }
  function sample(G, u, v) { const { g, n, m } = G, x0 = Math.floor(u), y0 = Math.floor(v), fx = sm(u - x0), fy = sm(v - y0), xa = ((x0 % n) + n) % n, xb = (xa + 1) % n, ya = ((y0 % m) + m) % m, yb = (ya + 1) % m; return lerp(lerp(g[ya * n + xa], g[ya * n + xb], fx), lerp(g[yb * n + xa], g[yb * n + xb], fx), fy); }
  function tone(E) { // the cover's most saturated hue: a deep sheet of it, a bright rim next to it
    const t = E.mkCanvas(16, 16), g = t.getContext('2d'); g.drawImage(E.cover.src, 0, 0, 16, 16); const d = g.getImageData(0, 0, 16, 16).data; let best = 0.6, bs = -1;
    for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); if (s > bs && mx !== mn) { bs = s; let h = mx === r ? (gg - b) / (mx - mn) + (gg < b ? 6 : 0) : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4; best = h / 6; } }
    const h = Math.round(best * 360), p = E.mkCanvas(1, 1).getContext('2d'); p.fillStyle = `hsl(${(h + 30) % 360},95%,72%)`; p.fillRect(0, 0, 1, 1); return { bg: `hsl(${h},45%,9%)`, rimRGB: [...p.getImageData(0, 0, 1, 1).data].slice(0, 3) };
  }
  function build(E) { const { W, H, S } = E, cols = Math.round(W / (6 * S)), rows = Math.round(H / (6 * S)); st.low = E.mkCanvas(cols, rows); st.rim = E.mkCanvas(cols, rows); st.mask = E.mkCanvas(W, H); st.G1 = grid(7, 12); st.G2 = grid(21, 36); Object.assign(st, tone(E)); st.key = E.cover.version + '|' + W; }
  BeatVisual.register({
    id: 'dissolve', name: 'Dissolve', fam: 'liquid',
    blurb: 'Обложка проявляется и растворяется в тёмном листе сквозь плывущий шум, как чернила в воде; по краю проявления светится яркая кромка. Видимость дышит с тактом, кик раскрывает картинку целиком, потом она снова затягивается.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E; if (st.key !== E.cover.version + '|' + W) build(E); const t = A.t, cols = st.low.width, rows = st.low.height;
      if (A.cut && A.cutKind === 'kick') st.imp = 1; st.imp *= 0.93;
      const barPh = A.playing ? (A.beats / 4) % 1 : (t * 0.2) % 1, vis = 0.45 + 0.2 * Math.sin(barPh * 6.2832 - 1.57) + 0.4 * st.imp, th = 0.78 - 0.55 * vis;
      const g = st.low.getContext('2d'), im = g.createImageData(cols, rows), d = im.data, gr = st.rim.getContext('2d'), imr = gr.createImageData(cols, rows), dr = imr.data, [rr, rg, rb] = st.rimRGB;
      const o1x = t * 0.22, o1y = t * 0.15, o2x = -t * 0.45, o2y = t * 0.3;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const u = x / cols, v = y / rows, n = 0.62 * sample(st.G1, u * st.G1.n + o1x, v * st.G1.m + o1y) + 0.38 * sample(st.G2, u * st.G2.n + o2x, v * st.G2.m + o2y), i = (y * cols + x) * 4;
        const a = E.clamp((n - th) / 0.08 + 0.5, 0, 1), e = (n - th) / 0.04, rim = Math.exp(-e * e);
        d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255; dr[i] = rr; dr[i + 1] = rg; dr[i + 2] = rb; dr[i + 3] = rim * 255;
      }
      g.putImageData(im, 0, 0); gr.putImageData(imr, 0, 0);
      const mg = st.mask.getContext('2d'); mg.globalCompositeOperation = 'source-over'; mg.clearRect(0, 0, W, H); mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = 'high'; mg.drawImage(st.low, 0, 0, W, H);
      const cv = E.cover.src, k = Math.max(W / cv.width, H / cv.height); mg.globalCompositeOperation = 'source-in'; mg.drawImage(cv, (cv.width - W / k) / 2, (cv.height - H / k) / 2, W / k, H / k, 0, 0, W, H);
      c.fillStyle = st.bg; c.fillRect(0, 0, W, H);
      c.save(); c.globalAlpha = 0.1; c.filter = 'grayscale(1)'; c.drawImage(cv, (cv.width - W / k) / 2, (cv.height - H / k) / 2, W / k, H / k, 0, 0, W, H); c.restore();
      c.drawImage(st.mask, 0, 0);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.85; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(st.rim, 0, 0, W, H); c.restore();
      c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 12 * S; E.header(c, '#fff', 'rgba(255,255,255,0.6)'); c.restore();
    },
  });
})();
