/* Swiss Poster: paper, a hairline grid, the title set huge in black, the cover as one block on
 * the grid. A kick moves the block to another cell; a red dot walks the beats like a metronome.
 * International Typographic Style, nothing else moving. */
(function () {
  'use strict';
  const PAPER = '#f4f1ea', INK = '#141414', RED = '#e63312', RULE = 'rgba(20,20,20,0.10)';
  const st = { slot: 0, prev: -1, slots: [] };
  function slots(E) { // where the cover block may sit: (col, row, span) on a 6x? grid, Reel and YouTube each
    const { W, H, S } = E, yt = E.FMT === 'yt', cols = yt ? 12 : 6, u = W / cols;
    const out = [];
    if (yt) { for (const [c, r, span] of [[6, 1, 4], [7, 0, 5], [8, 2, 3], [5, 1, 3], [9, 1, 3]]) out.push({ x: c * u, y: r * u + 40 * S, s: span * u }); }
    else { for (const [c, r, span] of [[0, 6, 4], [2, 5, 4], [1, 7, 3], [3, 8, 3], [0, 8, 3], [2, 6, 2]]) out.push({ x: c * u, y: r * u, s: span * u }); }
    return out.filter(b => b.y + b.s <= H - 24 * S && b.x + b.s <= W);
  }
  function wrap(c, text, maxW) { const words = text.split(' '), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
  BeatVisual.register({
    id: 'swiss', name: 'Swiss Poster', fam: 'poster',
    blurb: 'Бумага, сетка-волосок, название огромным чёрным. Обложка — один блок на сетке: кик переставляет его в другую ячейку, красная точка отбивает доли. Больше ничего не двигается.',
    init(E) { st.slots = slots(E); st.slot = 0; st.prev = -1; },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt', cols = yt ? 12 : 6, u = W / cols;
      if (!st.slots.length) st.slots = slots(E);
      c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
      c.strokeStyle = RULE; c.lineWidth = 1 * S; c.beginPath();
      for (let i = 1; i < cols; i++) { c.moveTo(i * u, 0); c.lineTo(i * u, H); }
      for (let y = u; y < H; y += u) { c.moveTo(0, y); c.lineTo(W, y); }
      c.stroke();
      if (A.cut && A.cutKind === 'kick' && st.slots.length > 1) { let n; do { n = Math.floor(Math.random() * st.slots.length); } while (n === st.slot); st.slot = n; }
      const b = st.slots[st.slot], cv = E.cover.src, sc = Math.max(b.s / cv.width, b.s / cv.height), sw = b.s / sc, sh = b.s / sc;
      c.drawImage(cv, (cv.width - sw) / 2, (cv.height - sh) / 2, sw, sh, b.x, b.y, b.s, b.s);
      // the title: as many lines as it needs, black, flush left on the first column
      const big = (yt ? 150 : 132) * S, maxW = yt ? W * 0.46 : W - 2 * u * 0.5 - 16 * S;
      c.font = '400 ' + big + 'px "League Gothic"'; c.fillStyle = INK; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      const lines = wrap(c, meta.title.toUpperCase(), maxW); let y = (yt ? 150 : 170) * S;
      for (const ln of lines) { c.fillText(ln, 16 * S, y); y += big * 0.86; }
      c.font = '600 ' + 13 * S + 'px "IBM Plex Mono"';
      const who = (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT'), facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  ');
      c.fillText(who, 16 * S, y + 6 * S); if (facts) c.fillText(facts, 16 * S, y + 26 * S);
      // the metronome: one red dot per beat, four across the bottom rule
      if (A.playing) { const beat = Math.floor(A.beats) % 4, by = yt ? H - u * 0.5 : H - 44 * S, r = 9 * S, x0 = yt ? u * 0.5 : u * 0.5; c.fillStyle = RED; c.beginPath(); c.arc(x0 + beat * u, by, r, 0, 6.2832); c.fill(); }
    },
  });
})();
