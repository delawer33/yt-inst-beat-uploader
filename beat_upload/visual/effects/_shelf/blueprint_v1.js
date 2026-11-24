/* Blueprint: the cover as a part on a cyanotype sheet, with dimension lines, leader callouts and
 * a title block. A kick draws the next dimension in, a snare pops a callout, a bar turns the sheet. */
(function () {
  'use strict';
  const BLUE = '#0b3d91', LINE = '#eaf0ff', FAINT = 'rgba(234,240,255,0.22)';
  const st = { dims: [], dim: 0, t0: -9, calls: [], pop: -1, popT: -9, rev: 1 };
  function build(E) {
    const { W, H, S } = E, yt = E.FMT === 'yt', size = yt ? H * 0.54 : W * 0.72, x = yt ? W * 0.6 - size / 2 : (W - size) / 2, y = yt ? H * 0.56 - size / 2 + 20 * S : H * 0.52 - size / 2;
    st.part = { x, y, size }; const g = 34 * S;
    st.dims = [{ x0: x, y0: y - g, x1: x + size, y1: y - g, label: '1080' }, { x0: x + size + g, y0: y, x1: x + size + g, y1: y + size, label: '1080' }, { x0: x, y0: y + size + g, x1: x + size * 0.5, y1: y + size + g, label: '540' }, { x0: x - g, y0: y + size * 0.3, x1: x - g, y1: y + size, label: '756' }];
    const pts = E.interest().slice(0, 3); st.calls = pts.map((p, i) => ({ px: x + p.x * size, py: y + p.y * size, lx: i % 2 ? x + size + g * 1.6 : x - g * 1.6, ly: y + size * (0.15 + i * 0.3), tag: 'ABC'[i] }));
    st.dim = 0; st.t0 = -9; st.pop = -1; st.key = E.cover.version + '|' + W;
  }
  function arrow(c, x0, y0, x1, y1, S) { const a = Math.atan2(y1 - y0, x1 - x0), L = 9 * S; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); for (const [x, y, d] of [[x0, y0, 1], [x1, y1, -1]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + d * Math.cos(a + 0.4) * L, y + d * Math.sin(a + 0.4) * L); c.moveTo(x, y); c.lineTo(x + d * Math.cos(a - 0.4) * L, y + d * Math.sin(a - 0.4) * L); c.stroke(); } }
  BeatVisual.register({
    id: 'blueprint', name: 'Blueprint', fam: 'hud',
    blurb: 'Обложка — деталь на синьке: сетка, размерные линии со стрелками, выноски A/B/C к интересным местам, штамп с названием, артистами, BPM и тональностью. Кик дорисовывает следующий размер, снэр выталкивает выноску, такт меняет ревизию.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt'; if (st.key !== E.cover.version + '|' + W) build(E);
      c.fillStyle = BLUE; c.fillRect(0, 0, W, H);
      c.strokeStyle = FAINT; c.lineWidth = 1 * S; c.beginPath(); for (let x = 0; x < W; x += 20 * S) { c.moveTo(x, 0); c.lineTo(x, H); } for (let y = 0; y < H; y += 20 * S) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke();
      c.strokeStyle = 'rgba(234,240,255,0.4)'; c.beginPath(); for (let x = 0; x < W; x += 100 * S) { c.moveTo(x, 0); c.lineTo(x, H); } for (let y = 0; y < H; y += 100 * S) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke();
      if (A.cut && A.cutKind === 'kick') { st.dim = (st.dim + 1) % st.dims.length; st.t0 = A.t; } if (A.cut && A.cutKind === 'snare') { st.pop = Math.floor(Math.random() * st.calls.length); st.popT = A.t; } if (A.barHit && A.playing) st.rev++;
      // the part: the cover in cyanotype
      const p = st.part, cv = E.cover.src, k = Math.max(p.size / cv.width, p.size / cv.height); c.save(); c.filter = 'grayscale(1) contrast(1.25)'; c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.9; c.drawImage(cv, (cv.width - p.size / k) / 2, (cv.height - p.size / k) / 2, p.size / k, p.size / k, p.x, p.y, p.size, p.size); c.restore();
      c.strokeStyle = LINE; c.lineWidth = 2 * S; c.strokeRect(p.x, p.y, p.size, p.size); c.setLineDash([6 * S, 6 * S]); c.lineWidth = 1 * S; c.beginPath(); c.moveTo(p.x + p.size / 2, p.y - 20 * S); c.lineTo(p.x + p.size / 2, p.y + p.size + 20 * S); c.moveTo(p.x - 20 * S, p.y + p.size / 2); c.lineTo(p.x + p.size + 20 * S, p.y + p.size / 2); c.stroke(); c.setLineDash([]);
      // dimensions: all drawn, the current one growing in
      c.lineWidth = 1.5 * S; c.strokeStyle = LINE;
      st.dims.forEach((d, i) => { const f = i === st.dim ? E.clamp((A.t - st.t0) / 0.3, 0, 1) : 1; const x1 = d.x0 + (d.x1 - d.x0) * f, y1 = d.y0 + (d.y1 - d.y0) * f; arrow(c, d.x0, d.y0, x1, y1, S); if (f === 1) { const vert = d.x0 === d.x1; E.mono(c, d.label, vert ? d.x0 + 8 * S : (d.x0 + d.x1) / 2, vert ? (d.y0 + d.y1) / 2 + 4 * S : d.y0 - 6 * S, 11 * S, LINE, vert ? 'left' : 'center'); } });
      // callouts: leader lines to points of interest
      st.calls.forEach((q, i) => { const pop = i === st.pop ? 1 + 0.5 * Math.max(0, 1 - (A.t - st.popT) / 0.25) : 1; c.beginPath(); c.moveTo(q.px, q.py); c.lineTo(q.lx, q.ly); c.stroke(); c.beginPath(); c.arc(q.px, q.py, 3 * S, 0, 6.2832); c.fillStyle = LINE; c.fill(); c.beginPath(); c.arc(q.lx, q.ly, 12 * S * pop, 0, 6.2832); c.stroke(); E.mono(c, q.tag, q.lx, q.ly + 4 * S * pop, 12 * S * pop, LINE, 'center'); });
      // the title block at the top
      const bx = 20 * S, by = (yt ? 20 : 110) * S, bw = W - 40 * S, bh = (yt ? 70 : 90) * S; c.lineWidth = 1.5 * S; c.strokeRect(bx, by, bw, bh);
      const title = meta.title.toUpperCase(), fs = bh * 0.62; c.font = '400 ' + fs + 'px "League Gothic"'; const tw = c.measureText(title).width, tcol = Math.min(bw * 0.5, tw + 24 * S); c.beginPath(); c.moveTo(bx + tcol, by); c.lineTo(bx + tcol, by + bh); c.stroke();
      E.gothic(c, title, bx + 12 * S, by + bh * 0.78, tw + 24 * S > tcol ? fs * (tcol - 24 * S) / tw : fs, LINE);
      const cells = [['DRAWN BY', meta.artists ? meta.artists.toUpperCase() : 'DELAWER'], ['TEMPO', meta.bpm ? meta.bpm + ' BPM' : '—'], ['KEY', meta.key ? meta.key.toUpperCase() : '—'], ['REV', String(st.rev).padStart(2, '0')]];
      const cw = (bw - tcol) / 2, ch = bh / 2; cells.forEach(([k, v], i) => { const x = bx + tcol + (i % 2) * cw, y = by + Math.floor(i / 2) * ch; c.strokeRect(x, y, cw, ch); E.mono(c, k, x + 8 * S, y + 13 * S, 9 * S, 'rgba(234,240,255,0.7)'); c.font = '600 ' + 12 * S + 'px "IBM Plex Mono"'; c.fillStyle = LINE; c.textAlign = 'left'; c.fillText(v, x + 8 * S, y + ch - 9 * S, cw - 16 * S); });
    },
  });
})();
