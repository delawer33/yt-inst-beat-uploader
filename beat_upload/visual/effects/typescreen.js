// Type Screen: a typographic screen: every cell is a letter of the title and artists, sized by brightness; the picture is made of its own name.
BeatVisual.register({
  id: 'typescreen', fam: 'riso', name: 'Type Screen', how: 'headless',
  blurb: 'Riso × ASCII × Type Crush: растр из букв. Сетка 40×71, в каждой клетке буква из названия и артистов по порядку, размер буквы — яркость обложки в этой точке, цвет — полоса Cover Style. Портрет собран из собственного названия. Кик увеличивает все буквы, хэты вспыхивают случайными, по тексту бежит курсор в такт.',
  draw(c, A, E) {
    const { W, H, pal: p, meta } = E, COLS = 40, cell = W / COLS, ROWS = Math.ceil(H / cell), g = E.extGrey(p, false, COLS, ROWS);
    c.fillStyle = p.c[0]; c.fillRect(0, 0, W, H);
    const text = ((meta.artists ? meta.artists + ' x ' : '') + meta.title + ' type beat ').toUpperCase().replace(/\s+/g, ' '); const L = text.length;
    const grow = 1 + A.kick * 0.3 + A.bands[1] * 0.1, levels = 8, buckets = Array.from({ length: levels }, () => []);
    for (let r = 0; r < ROWS; r++) for (let i = 0; i < COLS; i++) {
      const ch = text[(r * COLS + i) % L]; if (ch === ' ') continue; const gv = g[r * COLS + i], s = 0.16 + 0.84 * Math.pow(gv / 255, 1.1);
      const lvl = Math.min(levels - 1, Math.floor(s * levels)); buckets[lvl].push(r * COLS + i);
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let lvl = 0; lvl < levels; lvl++) {
      const size = ((lvl + 1) / levels) * cell * 1.9 * grow; if (!buckets[lvl].length) continue; c.font = '400 ' + size.toFixed(1) + 'px "League Gothic"';
      for (const idx of buckets[lvl]) { const r = (idx / COLS) | 0, i = idx % COLS; c.fillStyle = E.bandColour(p, g[idx]); c.fillText(text[idx % L], i * cell + cell / 2, r * cell + cell / 2); }
    }
    const cur = (Math.floor(A.beats * 2) * 7) % (COLS * ROWS); const cr = (cur / COLS) | 0, ci = cur % COLS; c.fillStyle = E.last(p); c.fillRect(ci * cell, cr * cell, cell, cell); c.fillStyle = p.c[0]; c.font = '400 ' + (cell * 1.5).toFixed(1) + 'px "League Gothic"'; c.fillText(text[cur % L], ci * cell + cell / 2, cr * cell + cell / 2);
    const n = Math.floor(A.hat * 12); c.fillStyle = E.last(p); c.font = '400 ' + (cell * 1.7).toFixed(1) + 'px "League Gothic"'; for (let k = 0; k < n; k++) { const idx = Math.floor(Math.random() * COLS * ROWS); c.fillText(text[idx % L], (idx % COLS) * cell + cell / 2, ((idx / COLS) | 0) * cell + cell / 2); }
    E.cutHeader(c, p);
  },
});
