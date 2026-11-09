/* Water: the cover above its own reflection on dark water; the bass ripples the reflection, a
 * hat throws a glint of light across it. Quiet, nothing cuts. */
(function () {
  'use strict';
  const st = { glints: [] };
  BeatVisual.register({
    id: 'water', name: 'Water', fam: 'soft',
    blurb: 'Обложка над собственным отражением в тёмной воде; бас рябит отражение, хэт бросает по воде блик. Тихо, без склеек.',
    init() { st.glints = []; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt';
      const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d1226'); bg.addColorStop(0.55, '#05070f'); bg.addColorStop(1, '#000'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
      const size = yt ? H * 0.5 : W * 0.78, cx = yt ? W * 0.5 : W / 2, top = yt ? H * 0.06 : H * 0.17, cv = E.cover.src, k = Math.max(size / cv.width, size / cv.height), sw = size / k, sh = size / k, sx = (cv.width - sw) / 2, sy = (cv.height - sh) / 2;
      c.drawImage(cv, sx, sy, sw, sh, cx - size / 2, top, size, size);
      // the reflection: the cover upside down, row by row, each row pushed sideways by a wave
      const y0 = top + size + 6 * S, rows = Math.round(size * 0.9), amp = (1.5 + 14 * A.kick + 4 * A.bands[1]) * S, t = A.t;
      const step = 2 * S; c.save();
      for (let y = 0; y < rows; y += step) {
        const f = y / rows, dx = Math.sin(y / (18 * S) + t * 3.2) * amp * (0.3 + f) + Math.sin(y / (41 * S) - t * 1.7) * amp * 0.5, stretch = 1 + f * 0.06;
        const srcY = sy + sh - (y / size) * sh - (step / size) * sh; c.globalAlpha = 0.55 * (1 - f) * (1 - f) + 0.04;
        c.drawImage(cv, sx, Math.max(sy, srcY), sw, (step / size) * sh + 1, cx - size * stretch / 2 + dx, y0 + y, size * stretch, step + 1);
      }
      c.restore();
      if (A.hatHit) st.glints.push({ y: y0 + Math.random() * rows * 0.7, x: cx + (Math.random() - 0.5) * size, w: (40 + Math.random() * 90) * S, t0: t });
      st.glints = st.glints.filter(g => t - g.t0 < 0.5);
      for (const g of st.glints) { const a = 1 - (t - g.t0) / 0.5; const lg = c.createLinearGradient(g.x - g.w, 0, g.x + g.w, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,' + (0.8 * a).toFixed(3) + ')'); lg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = lg; c.fillRect(g.x - g.w, g.y, g.w * 2, 1.5 * S); }
      E.header(c, '#fff', 'rgba(255,255,255,0.7)');
    },
  });
})();
