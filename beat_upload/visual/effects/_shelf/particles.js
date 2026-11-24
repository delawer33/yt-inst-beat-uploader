/* Particles: the cover as a cloud of coloured points resting in a grid in deep night. The kick
 * blasts them away from a point and they spring back into the picture, the snare swirls the
 * cloud, hats make a few points sparkle. No frame, no card: the picture itself is the motion. */
(function () {
  'use strict';
  const st = { pts: [], key: '', cell: 0, side: 0, cx: 0, cy: 0, swirl: 0 };
  function build(E) {
    const { W, H } = E, yt = E.FMT === 'yt', side = yt ? H * 0.76 : W * 0.86, n = 56, cell = side / n, ox = yt ? W * 0.62 - side / 2 : (W - side) / 2, oy = yt ? (H - side) / 2 : H * 0.29;
    const t = E.mkCanvas(n, n), g = t.getContext('2d'), cv = E.cover.src, k = Math.max(n / cv.width, n / cv.height); g.drawImage(cv, (cv.width - n / k) / 2, (cv.height - n / k) / 2, n / k, n / k, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data; st.pts = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = (y * n + x) * 4, lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255, px = ox + (x + 0.5) * cell, py = oy + (y + 0.5) * cell; st.pts.push({ x0: px, y0: py, x: px, y: py, vx: 0, vy: 0, col: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`, lum, ph: Math.random() * 6.28, spark: 0 }); }
    st.cell = cell; st.side = side; st.cx = ox + side / 2; st.cy = oy + side / 2; st.key = E.cover.version + '|' + W;
  }
  BeatVisual.register({
    id: 'particles', name: 'Particles', fam: 'future',
    blurb: 'Обложка — облако цветных точек на тёмной ночи. Кик взрывает облако от случайной точки, точки на пружине возвращаются в картинку; снэр закручивает облако; хэты зажигают искры.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E; if (st.key !== E.cover.version + '|' + W) build(E); const t = A.t;
      c.fillStyle = '#04050a'; c.fillRect(0, 0, W, H);
      const bgG = c.createRadialGradient(st.cx, st.cy, 0, st.cx, st.cy, st.side * 0.85); bgG.addColorStop(0, 'rgba(60,70,120,0.35)'); bgG.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = bgG; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') { const o = st.pts[Math.floor(Math.random() * st.pts.length)], bx = o.x0, by = o.y0, f0 = (22 + 26 * Math.random()) * S, rad = st.side * 0.28; for (const p of st.pts) { const dx = p.x0 - bx, dy = p.y0 - by, d = Math.hypot(dx, dy) + 1e-3, f = f0 * Math.exp(-d / rad); p.vx += dx / d * f; p.vy += dy / d * f; } }
      if (A.snareHit) st.swirl = 1; st.swirl *= 0.9;
      if (A.hatHit) for (let i = 0; i < 60; i++) st.pts[Math.floor(Math.random() * st.pts.length)].spark = 1;
      const sw = st.swirl * 2.2 * S;
      for (const p of st.pts) {
        if (sw > 0.02) { const dx = p.x - st.cx, dy = p.y - st.cy, d = Math.hypot(dx, dy) + 1e-3; p.vx += -dy / d * sw; p.vy += dx / d * sw; }
        p.vx = (p.vx + (p.x0 - p.x) * 0.07) * 0.88; p.vy = (p.vy + (p.y0 - p.y) * 0.07) * 0.88; p.x += p.vx; p.y += p.vy;
        const sp = Math.min(1.5, Math.hypot(p.vx, p.vy) / (8 * S)), r = st.cell * 0.38 * (0.75 + 0.5 * p.lum) * (1 + 0.5 * sp), x = p.x + Math.sin(t * 1.3 + p.ph) * 0.8 * S, y = p.y + Math.cos(t * 1.1 + p.ph) * 0.8 * S;
        c.fillStyle = p.col; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
        if (p.spark > 0.05) { c.fillStyle = `rgba(255,255,255,${p.spark})`; c.beginPath(); c.arc(x, y, r * (0.6 + p.spark), 0, 6.2832); c.fill(); p.spark *= 0.78; }
      }
      c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 10 * S; E.header(c, '#fff', 'rgba(255,255,255,0.6)'); c.restore();
    },
  });
})();
