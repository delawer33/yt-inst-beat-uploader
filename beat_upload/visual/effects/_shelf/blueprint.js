/* Blueprint: the cover as a part on a cyanotype sheet that draws itself. Over two bars a plotter
 * head sweeps down and inks the line drawing of the cover, dimension lines appear as the head
 * passes them; over the next bar the print develops under the lines, holds, fades, and the sheet
 * starts over with the next revision. The kick flashes the ink, the snare jitters the head. */
(function () {
  'use strict';
  const BLUE = '#0b3d91', LINE = '#eaf0ff', FAINT = 'rgba(234,240,255,0.2)';
  const st = { key: '', edges: null, part: null, dims: [], pulse: 0, jit: 0 };
  function sobel(E, size) { // the cover's lines: Sobel of the grey cover, white on a transparent sheet, half resolution
    const n = Math.round(size / 2), t = E.mkCanvas(n, n), g = t.getContext('2d'), cv = E.cover.src, k = Math.max(n / cv.width, n / cv.height); g.drawImage(cv, (cv.width - n / k) / 2, (cv.height - n / k) / 2, n / k, n / k, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data, L = new Float32Array(n * n); for (let i = 0; i < n * n; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    const out = g.createImageData(n, n), o = out.data;
    for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) { const i = y * n + x, gx = -L[i - n - 1] - 2 * L[i - 1] - L[i + n - 1] + L[i - n + 1] + 2 * L[i + 1] + L[i + n + 1], gy = -L[i - n - 1] - 2 * L[i - n] - L[i - n + 1] + L[i + n - 1] + 2 * L[i + n] + L[i + n + 1], m = Math.min(1, Math.hypot(gx, gy) * 2.2); o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = 255; o[i * 4 + 3] = m > 0.18 ? m * 255 : 0; }
    g.putImageData(out, 0, 0); return t;
  }
  function build(E) {
    const { W, H, S } = E, yt = E.FMT === 'yt', size = yt ? H * 0.6 : W * 0.72, x = yt ? W * 0.62 - size / 2 : (W - size) / 2, y = yt ? H * 0.56 - size / 2 + 10 * S : H * 0.53 - size / 2, g = 34 * S;
    st.part = { x, y, size }; st.edges = sobel(E, size);
    st.dims = [{ x0: x, y0: y - g, x1: x + size, y1: y - g, label: '1080', at: y - g }, { x0: x + size + g, y0: y, x1: x + size + g, y1: y + size, label: '1080', at: y + size }, { x0: x - g, y0: y + size * 0.3, x1: x - g, y1: y + size, label: '756', at: y + size }, { x0: x, y0: y + size + g, x1: x + size * 0.5, y1: y + size + g, label: '540', at: y + size + g }];
    st.key = E.cover.version + '|' + W;
  }
  function arrow(c, x0, y0, x1, y1, S) { const a = Math.atan2(y1 - y0, x1 - x0), L = 9 * S; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); for (const [x, y, d] of [[x0, y0, 1], [x1, y1, -1]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + d * Math.cos(a + 0.4) * L, y + d * Math.sin(a + 0.4) * L); c.moveTo(x, y); c.lineTo(x + d * Math.cos(a - 0.4) * L, y + d * Math.sin(a - 0.4) * L); c.stroke(); } }
  BeatVisual.register({
    id: 'blueprint', name: 'Blueprint', fam: 'hud',
    blurb: 'Синька, которая чертит сама себя. Два такта плоттерная головка идёт сверху вниз и тушью выводит контурный рисунок обложки, по пути появляются размерные линии; следующий такт под линиями проявляется отпечаток, держится, гаснет, и лист начинается заново со следующей ревизией. Кик вспыхивает тушью, снэр дёргает головку.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt'; if (st.key !== E.cover.version + '|' + W) build(E); const t = A.t;
      const cyc = A.playing ? A.beats / 16 : t / 7.5, ph = ((cyc % 1) + 1) % 1, rev = Math.floor(cyc) + 1;
      if (A.cut && A.cutKind === 'kick') st.pulse = 1; st.pulse *= 0.86; if (A.snareHit) st.jit = 1; st.jit *= 0.8;
      c.fillStyle = BLUE; c.fillRect(0, 0, W, H);
      const px = Math.sin(t * 0.17) * 6 * S, py = Math.cos(t * 0.13) * 6 * S; c.save(); c.translate(px, py);
      c.strokeStyle = FAINT; c.lineWidth = 1 * S; c.beginPath(); for (let x = -40 * S; x < W + 40 * S; x += 20 * S) { c.moveTo(x, -40 * S); c.lineTo(x, H + 40 * S); } for (let y = -40 * S; y < H + 40 * S; y += 20 * S) { c.moveTo(-40 * S, y); c.lineTo(W + 40 * S, y); } c.stroke();
      c.strokeStyle = 'rgba(234,240,255,0.38)'; c.beginPath(); for (let x = -100 * S; x < W + 100 * S; x += 100 * S) { c.moveTo(x, -100 * S); c.lineTo(x, H + 100 * S); } for (let y = -100 * S; y < H + 100 * S; y += 100 * S) { c.moveTo(-100 * S, y); c.lineTo(W + 100 * S, y); } c.stroke();
      // the plot: the head sweeps from above the part to below it over the first half of the cycle
      const p = st.part, g = 34 * S, top = p.y - g * 1.6, bot = p.y + p.size + g * 1.6, q = E.clamp(ph / 0.5, 0, 1), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2, scanY = top + (bot - top) * e, done = q >= 1;
      const fillA = ph < 0.5 ? 0 : ph < 0.75 ? (ph - 0.5) / 0.25 : ph < 0.9 ? 1 : (1 - ph) / 0.1, ink = 0.85 + 0.15 * st.pulse;
      if (fillA > 0) { const cv = E.cover.src, k = Math.max(p.size / cv.width, p.size / cv.height); c.save(); c.filter = 'grayscale(1) contrast(1.2)'; c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.85 * fillA; c.drawImage(cv, (cv.width - p.size / k) / 2, (cv.height - p.size / k) / 2, p.size / k, p.size / k, p.x, p.y, p.size, p.size); c.restore(); }
      c.save(); c.beginPath(); c.rect(p.x - g * 2, top, p.size + g * 4, Math.max(0, scanY - top)); c.clip();
      c.globalAlpha = ink; c.imageSmoothingEnabled = true; c.drawImage(st.edges, p.x, p.y, p.size, p.size); c.globalAlpha = 1;
      c.strokeStyle = LINE; c.lineWidth = 2 * S; c.strokeRect(p.x, p.y, p.size, p.size); c.setLineDash([6 * S, 6 * S]); c.lineWidth = 1 * S; c.beginPath(); c.moveTo(p.x + p.size / 2, p.y - 20 * S); c.lineTo(p.x + p.size / 2, p.y + p.size + 20 * S); c.moveTo(p.x - 20 * S, p.y + p.size / 2); c.lineTo(p.x + p.size + 20 * S, p.y + p.size / 2); c.stroke(); c.setLineDash([]);
      c.restore();
      // dimensions ink in as the head passes them
      c.lineWidth = 1.5 * S; c.strokeStyle = LINE; c.globalAlpha = ink;
      for (const d of st.dims) { const f = E.clamp((scanY - d.at) / (g * 0.8) + (done ? 1 : 0), 0, 1); if (f <= 0) continue; const x1 = d.x0 + (d.x1 - d.x0) * f, y1 = d.y0 + (d.y1 - d.y0) * f; arrow(c, d.x0, d.y0, x1, y1, S); if (f >= 1) { const vert = d.x0 === d.x1; E.mono(c, d.label, vert ? d.x0 + 8 * S : (d.x0 + d.x1) / 2, vert ? (d.y0 + d.y1) / 2 + 4 * S : d.y0 - 6 * S, 11 * S, LINE, vert ? 'left' : 'center'); } }
      c.globalAlpha = 1;
      // the head: a bright line across the sheet and a crosshair zipping along it
      if (!done) { const hx = p.x + p.size * (0.5 + 0.5 * Math.sin(t * 7)) + (Math.random() - 0.5) * 14 * S * st.jit, r = (10 + 8 * st.pulse) * S;
        c.strokeStyle = 'rgba(234,240,255,0.5)'; c.lineWidth = 1 * S; c.beginPath(); c.moveTo(0, scanY); c.lineTo(W, scanY); c.stroke();
        c.strokeStyle = LINE; c.lineWidth = 1.5 * S; c.beginPath(); c.arc(hx, scanY, r, 0, 6.2832); c.stroke(); c.beginPath(); c.moveTo(hx - r * 1.6, scanY); c.lineTo(hx + r * 1.6, scanY); c.moveTo(hx, scanY - r * 1.6); c.lineTo(hx, scanY + r * 1.6); c.stroke();
        c.fillStyle = `rgba(234,240,255,${0.5 + 0.5 * st.pulse})`; c.beginPath(); c.arc(hx, scanY, 2.5 * S, 0, 6.2832); c.fill(); }
      c.restore();
      // the title block at the top: title, who, facts, revision
      const bx = 20 * S, by = (yt ? 20 : 110) * S, bw = W - 40 * S, bh = (yt ? 70 : 90) * S; c.strokeStyle = LINE; c.lineWidth = 1.5 * S; c.strokeRect(bx, by, bw, bh);
      const title = meta.title.toUpperCase(), fs = bh * 0.62; c.font = '400 ' + fs + 'px "League Gothic"'; const tw = c.measureText(title).width, tcol = Math.min(bw * 0.5, tw + 24 * S); c.beginPath(); c.moveTo(bx + tcol, by); c.lineTo(bx + tcol, by + bh); c.stroke();
      E.gothic(c, title, bx + 12 * S, by + bh * 0.78, tw + 24 * S > tcol ? fs * (tcol - 24 * S) / tw : fs, LINE);
      const cells = [['DRAWN BY', meta.artists ? meta.artists.toUpperCase() : 'DELAWER'], ['TEMPO', meta.bpm ? meta.bpm + ' BPM' : '—'], ['KEY', meta.key ? meta.key.toUpperCase() : '—'], ['REV', String(rev).padStart(2, '0')]];
      const cw = (bw - tcol) / 2, ch = bh / 2; cells.forEach(([k, v], i) => { const x = bx + tcol + (i % 2) * cw, y = by + Math.floor(i / 2) * ch; c.strokeRect(x, y, cw, ch); E.mono(c, k, x + 8 * S, y + 13 * S, 9 * S, 'rgba(234,240,255,0.7)'); c.font = '600 ' + 12 * S + 'px "IBM Plex Mono"'; c.fillStyle = LINE; c.textAlign = 'left'; c.fillText(v, x + 8 * S, y + ch - 9 * S, cw - 16 * S); });
    },
  });
})();
