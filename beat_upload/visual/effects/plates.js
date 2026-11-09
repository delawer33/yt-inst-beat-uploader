// Plates: one screen per palette band at its own angle, like a four-plate print; bass is dot gain, snare slips a plate, hats drop dust.
BeatVisual.register({
  id: 'plates', fam: 'riso', name: 'Plates', how: 'headless',
  blurb: 'Полноценная печать: каждая полоса Cover Style — своя форма со своим углом сетки (15°, 75°, 0°, 45°) и своей краской, как CMYK. Картинка собирается из наложения форм и читается как настоящий ризограф. Бас — растискивание точек, снэр сдвигает одну форму, хэты сыплют пыль (пропавшие точки).',
  draw(c, A, E) {
    const { W, H, S, pal: p } = E; c.fillStyle = p.c[0]; c.fillRect(0, 0, W, H);
    const COLS = 180, ROWS = 320, g = E.extGrey(p, false, COLS, ROWS), cell = 9 * S, D = Math.hypot(W, H) / 2, grow = 1 + A.bands[1] * 0.14 + A.kick * 0.08, dust = A.hat * 0.2, angles = [0.2618, 1.309, 0, 0.785];
    const cuts = [0, ...p.cuts, 256];
    for (let k = 1; k < p.c.length; k++) {
      const lo = cuts[k - 1] / 255, hi = cuts[k] / 255, ink = p.c[k], ang = angles[(k - 1) % 4], cs = Math.cos(ang), sn = Math.sin(ang);
      const dx = k === 2 ? A.snare * 4 * S : 0, dy = k === 2 ? A.snare * 2.5 * S : 0;
      c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = ink; c.beginPath();
      for (let v = -D; v < D; v += cell) for (let u = -D; u < D; u += cell) {
        const x = W / 2 + u * cs - v * sn + dx, y = H / 2 + u * sn + v * cs + dy; if (x < -cell || y < -cell || x > W + cell || y > H + cell) continue;
        if (dust && Math.random() < dust) continue;
        const gi = Math.min(ROWS - 1, Math.max(0, (y / H * ROWS) | 0)) * COLS + Math.min(COLS - 1, Math.max(0, (x / W * COLS) | 0)); const d = Math.max(0, Math.min(1, (g[gi] / 255 - lo) / (hi - lo))); if (d <= 0.03) continue;
        const r = cell * 0.7 * Math.sqrt(d) * grow; c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.2832);
      }
      c.fill(); c.restore();
    }
    E.cutHeader(c, p);
  },
});
