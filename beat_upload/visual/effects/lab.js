/* Lab: an analysis console in red mono on black: a spectrogram waterfall of the last seconds,
 * a waveform window, a spectrum curve, level meters with dB readouts, a timecode, thin frames
 * and dashed connectors. Everything shown is the real signal. The kick brightens the frames,
 * the snare flashes the playhead. No cover. */
(function () {
  'use strict';
  const RED = '#ff2b1a';
  const st = { glow: 0, flash: 0, hist: [] };
  const rgba = a => `rgba(255,43,26,${a})`;
  function frame(c, x, y, w, h, S, a) { c.strokeStyle = rgba(a); c.lineWidth = S; c.strokeRect(x, y, w, h); c.fillStyle = rgba(a); c.fillRect(x + w - 14 * S, y + 4 * S, 4 * S, 4 * S); c.strokeRect(x + w - 8 * S + 0.5, y + 4 * S + 0.5, 3 * S, 3 * S); }
  function label(c, E, text, x, y, a) { E.mono(c, text, x, y, 9 * E.S, rgba(a)); }
  function meter(c, E, name, v, x, y, w) { const S = E.S, n = 24, seg = (w - 60 * S) / n; label(c, E, name, x, y + 8 * S, 0.7); for (let i = 0; i < n; i++) { const on = i / n < v; c.fillStyle = on ? rgba(0.95) : rgba(0.18); c.fillRect(x + 60 * S + i * seg, y, seg * 0.6, 9 * S); } label(c, E, (20 * Math.log10(Math.max(1e-3, v))).toFixed(1) + ' dB', x + w + 10 * S, y + 8 * S, 0.8); }
  BeatVisual.register({
    id: 'lab', name: 'Lab', fam: 'gen',
    blurb: 'Консоль анализа красным моно по чёрному: спектрограмма последних секунд, окно волны, кривая спектра, измерители уровня с dB, таймкод, тонкие рамки и пунктирные связи. Всё по реальному сигналу. Кик подсвечивает рамки, снэр вспыхивает курсором. Без обложки.',
    init() { st.glow = 0; st.flash = 0; st.hist = []; },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt', t = A.t;
      c.fillStyle = '#050302'; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') st.glow = 1; st.glow *= 0.86; if (A.snareHit) st.flash = 1; st.flash *= 0.8; const fa = 0.55 + 0.45 * st.glow;
      const m = 24 * S, top = (yt ? 40 : 150) * S;
      c.save(); c.letterSpacing = 2 * S + 'px'; label(c, E, 'LAB 001  ·  ' + meta.title.toUpperCase(), m, top, 0.95); label(c, E, (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT') + '  ·  ' + (meta.bpm || '—') + ' .WAV  ·  ' + (meta.key || '').toUpperCase(), m, top + 16 * S, 0.6); c.restore();
      const secs = A.secs || 0, tc = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(Math.floor(secs % 60)).padStart(2, '0') + '.' + String(Math.floor((secs % 1) * 100)).padStart(2, '0');
      c.strokeStyle = rgba(0.9); c.lineWidth = S; c.strokeRect(W - m - 78 * S, top - 12 * S, 78 * S, 18 * S); label(c, E, tc, W - m - 70 * S, top + 1 * S, 0.95);
      // the windows
      let sx, sy, sw, sh, wx, wy, ww, wh, fx, fy, fw, fh, mx, my, mw;
      if (yt) { sx = m; sy = H * 0.2; sw = W * 0.56; sh = H * 0.58; wx = W * 0.64; wy = H * 0.2; ww = W - m - wx; wh = H * 0.24; fx = wx; fy = H * 0.5; fw = ww; fh = H * 0.2; mx = wx; my = H * 0.76; mw = ww - 70 * S; }
      else { sx = m; sy = H * 0.26; sw = W - 2 * m; sh = H * 0.3; wx = m; wy = H * 0.6; ww = W - 2 * m; wh = H * 0.11; fx = W * 0.56; fy = H * 0.75; fw = W * 0.4; fh = H * 0.08; mx = m; my = H * 0.75; mw = W * 0.4; }
      // spectrogram: time left to right, frequency bottom to top
      const rows = E.spec.rows, n = rows.length; frame(c, sx, sy, sw, sh, S, fa); label(c, E, 'SPECTROGRAM_VIEW.EXE', sx + 6 * S, sy - 6 * S, 0.7);
      if (n) { const cw = sw / 64, ch = sh / 64; for (let i = 0; i < n; i++) { const row = rows[i], x = sx + (64 - n + i) * cw; for (let b = 0; b < 64; b++) { const v = row[b]; if (v < 0.04) continue; c.fillStyle = v > 0.7 ? `rgba(255,${Math.round(120 + 135 * (v - 0.7) / 0.3)},${Math.round(100 + 155 * (v - 0.7) / 0.3)},1)` : rgba(0.15 + 1.2 * v); c.fillRect(x, sy + sh - (b + 1) * ch, cw + 0.5, ch + 0.5); } } }
      ['20', '200', '2K', '20K'].forEach((s, i) => label(c, E, s + ' —', sx - 22 * S, sy + sh - sh * (i / 3) + 3 * S - (i === 0 ? 4 * S : i === 3 ? -4 * S : 0), 0.5));
      // waveform: the level of the last seconds, newest at the playhead
      frame(c, wx, wy, ww, wh, S, fa); label(c, E, 'WAVEFORM_VIEW.EXE', wx + 6 * S, wy - 6 * S, 0.7); const cols = Math.floor(ww / (2 * S)), mid = wy + wh / 2; st.hist.push(Math.min(1, A.level * 0.6 + A.bands[0] * 0.5 + A.kick * 0.3)); while (st.hist.length > cols) st.hist.shift();
      st.hist.forEach((v, i) => { const pk = v * (0.75 + 0.25 * Math.sin(i * 1.7)), h = Math.max(S, pk * wh * 0.46); c.fillStyle = pk > 0.55 ? rgba(0.95) : 'rgba(255,255,255,0.8)'; c.fillRect(wx + ww - (st.hist.length - i) * 2 * S, mid - h, S, 2 * h); });
      const px = wx + ww - 2 * S; c.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * st.flash})`; c.lineWidth = S; c.setLineDash([3 * S, 3 * S]); c.beginPath(); c.moveTo(px, sy); c.lineTo(px, wy + wh); c.stroke(); c.setLineDash([]);
      // the spectrum curve: the newest row
      frame(c, fx, fy, fw, fh, S, fa); label(c, E, 'FREQ', fx + 6 * S, fy - 6 * S, 0.7); if (n) { const row = rows[n - 1]; c.strokeStyle = rgba(0.95); c.lineWidth = 1.2 * S; c.beginPath(); for (let b = 0; b < 64; b++) { const x = fx + 6 * S + (fw - 12 * S) * b / 63, y = fy + fh - 6 * S - (fh - 12 * S) * Math.min(1, row[b]); if (b) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
      // meters
      meter(c, E, 'AMP', A.level, mx, my, mw); meter(c, E, 'BASS', (A.bands[0] + A.bands[1]) / 2, mx, my + 18 * S, mw); meter(c, E, 'TREBLE', (A.bands[4] + A.bands[5]) / 2, mx, my + 36 * S, mw);
      // dashed connectors
      c.strokeStyle = rgba(0.35); c.setLineDash([2 * S, 4 * S]); c.beginPath(); if (yt) { c.moveTo(sx + sw, sy + sh * 0.5); c.lineTo(wx, sy + sh * 0.5); c.moveTo(wx + ww * 0.5, wy + wh); c.lineTo(wx + ww * 0.5, fy); } else { c.moveTo(sx + sw * 0.5, sy + sh); c.lineTo(sx + sw * 0.5, wy); c.moveTo(fx + fw * 0.5, wy + wh); c.lineTo(fx + fw * 0.5, fy); } c.stroke(); c.setLineDash([]);
      c.fillStyle = rgba(0.9); c.fillRect(W - m - 6 * S, top + 24 * S + 6 * S * Math.sin(t * 2), 3 * S, 3 * S);
    },
  });
})();
