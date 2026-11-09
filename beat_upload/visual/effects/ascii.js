// ASCII: the composite typed in a density ramp, coloured by the Cover Style bands, the title's letters as noise on hats.
// A treatment VJ Cut cuts to; also an Effect of its own in the Lab.
BeatVisual.register({
  id: 'ascii', fam: 'ascii', name: 'ASCII', how: 'headless',
  blurb: 'База семейства: 96 колонок, знак по плотности, цвет знака — полоса Cover Style, под знаками едва видна сама картинка. Бас сдвигает порог и картинка «дышит», хэты сыплют буквы названия в случайные клетки.',
  draw(c, A, E) {
    const { W, H, pal: p, RAMP, meta } = E, COLS = 96, cw = W / COLS, rh = cw * 1.9, ROWS = Math.ceil(H / rh), at = E.atlas(p, cw, rh), g = E.extGrey(p, false, COLS, ROWS);
    c.fillStyle = p.c[0]; c.fillRect(0, 0, W, H); c.save(); c.globalAlpha = 0.32; c.drawImage(E.extPoster(p), 0, 0); c.restore();
    const shift = A.kick * 34 - A.bands[0] * 16;
    for (let r = 0; r < ROWS; r++) for (let i = 0; i < COLS; i++) {
      const gv = Math.max(0, Math.min(255, g[r * COLS + i] + shift)), idx = Math.min(RAMP.length - 1, Math.floor(gv / 256 * RAMP.length)); if (idx === 0) continue;
      c.drawImage(at, idx * cw, E.bandIndex(p, gv) * rh, cw, rh, i * cw, r * rh, cw, rh);
    }
    const letters = meta.title.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DELAWER', n = Math.floor(A.hat * COLS * 1.5);
    c.font = '600 ' + (cw * 1.7).toFixed(1) + 'px "IBM Plex Mono"'; c.textBaseline = 'top'; c.textAlign = 'center'; c.fillStyle = E.last(p);
    for (let k = 0; k < n; k++) { const i = Math.floor(Math.random() * COLS), r = Math.floor(Math.random() * ROWS); c.fillText(letters[Math.floor(Math.random() * letters.length)], i * cw + cw / 2, r * rh + E.S); }
    E.cutHeader(c, p);
  },
});
