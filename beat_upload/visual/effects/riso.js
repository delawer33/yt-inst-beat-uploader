// Riso: light inks on dark paper, two screens at 15 and 75 degrees; the second plate slips on hats and snares, the kick shakes the sheet.
BeatVisual.register({
  id: 'riso', fam: 'riso', name: 'Riso', how: 'headless',
  blurb: 'База семейства: тёмная бумага цвета Cover Style, две светлые краски, сетки под 15° и 75°, точки растут от яркости. Бас чуть растискивает точки, вторая форма сползает на хэтах и снэре, как сбитая приводка, кик встряхивает весь лист.',
  draw(c, A, E) {
    const { W, H, S, pal: p } = E, paper = p.c[0], ink1 = p.c.length === 5 ? p.c[2] : p.c[1], ink2 = E.last(p); c.fillStyle = paper; c.fillRect(0, 0, W, H);
    c.save(); c.translate((Math.random() - 0.5) * A.kick * 7 * S, (Math.random() - 0.5) * A.kick * 7 * S);
    const COLS = 180, ROWS = 320, g = E.extGrey(p, false, COLS, ROWS), cell = 8 * S, D = Math.hypot(W, H) / 2, grow = 1 + A.bands[1] * 0.18;
    const pass = (ink, ang, dx, dy, lo) => {
      const cs = Math.cos(ang), sn = Math.sin(ang); c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = ink; c.beginPath();
      for (let v = -D; v < D; v += cell) for (let u = -D; u < D; u += cell) {
        const x = W / 2 + u * cs - v * sn + dx, y = H / 2 + u * sn + v * cs + dy; if (x < -cell || y < -cell || x > W + cell || y > H + cell) continue;
        const gi = Math.min(ROWS - 1, Math.max(0, (y / H * ROWS) | 0)) * COLS + Math.min(COLS - 1, Math.max(0, (x / W * COLS) | 0)); let d = g[gi] / 255; if (lo) d = (d - lo) / (1 - lo); if (d <= 0.02) continue;
        const r = cell * 0.74 * Math.sqrt(d) * grow; c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.2832);
      }
      c.fill(); c.restore();
    };
    pass(ink1, 0.2618, 0, 0, 0); pass(ink2, 1.309, (2 + A.hat * 12 * (Math.random() - 0.5)) * S, (1.5 + A.snare * 7) * S, 0.45);
    c.restore(); E.headerShade(c, p); E.header(c, ink2, E.rgba(ink2, 0.7));
  },
});
