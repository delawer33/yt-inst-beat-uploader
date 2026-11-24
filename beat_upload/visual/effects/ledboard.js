/* LED Board: an amber dot-matrix sign. The words run as a marquee in time with the beat, the
 * cover glows underneath in the same dots. The kick brightens the board, the snare inverts the text. */
(function () {
  'use strict';
  const AMBER = [255, 176, 0];
  const st = { buf: null, cols: 0, rows: 0, key: '' };
  function build(E) { const { W, H, S } = E, cell = 6 * S; st.cols = Math.round(W / cell); st.rows = Math.round(H / cell); st.buf = E.mkCanvas(st.cols, st.rows); st.key = E.cover.version + '|' + W; }
  BeatVisual.register({
    id: 'ledboard', name: 'LED Board', fam: 'retro',
    blurb: 'Янтарное табло из точек. Название, артисты и факты бегут строкой в темп бита, обложка светится теми же точками ниже. Кик делает табло ярче, снэр на миг инвертирует бегущую строку.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt'; if (st.key !== E.cover.version + '|' + W) build(E);
      const g = st.buf.getContext('2d'), cols = st.cols, rows = st.rows, textRows = yt ? 12 : 14, top = yt ? 4 : 18;
      g.fillStyle = '#000'; g.fillRect(0, 0, cols, rows);
      // the cover below the text, as a grey picture at board resolution
      const cv = E.cover.src, ph = rows - top - textRows - 4, pw = cols, k = Math.max(pw / cv.width, ph / cv.height); g.save(); g.filter = 'grayscale(1) contrast(1.15)'; g.drawImage(cv, (cv.width - pw / k) / 2, (cv.height - ph / k) / 2, pw / k, ph / k, 0, top + textRows + 4, pw, ph); g.restore();
      // the marquee: one long line, pixels per beat
      const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join(' · '), line = meta.title.toUpperCase() + '  ·  ' + (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT') + (facts ? '  ·  ' + facts : '') + '      ';
      g.font = '400 ' + textRows * 1.25 + 'px "League Gothic"'; g.textBaseline = 'alphabetic'; const tw = Math.max(1, g.measureText(line).width), beats = A.playing ? A.beats : A.t * 1.5, x0 = cols - ((beats * cols * 0.5) % (tw + cols));
      const inv = A.snare > 0.6; if (inv) { g.fillStyle = '#fff'; g.fillRect(0, top - 1, cols, textRows + 2); } g.fillStyle = inv ? '#000' : '#fff'; g.fillText(line, x0, top + textRows * 0.92); g.fillText(line, x0 + tw + cols, top + textRows * 0.92);
      const d = g.getImageData(0, 0, cols, rows).data, cell = W / cols, gain = 0.85 + 0.35 * A.kick, r = cell * 0.36;
      c.fillStyle = '#0a0806'; c.fillRect(0, 0, W, H);
      c.fillStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},0.08)`; c.beginPath(); for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { c.moveTo(x * cell + cell / 2 + r * 0.8, y * cell + cell / 2); c.arc(x * cell + cell / 2, y * cell + cell / 2, r * 0.8, 0, 6.2832); } c.fill(); // the unlit dots
      for (let pass = 0; pass < 2; pass++) { // the glow, then the dot
        c.globalCompositeOperation = pass ? 'source-over' : 'lighter';
        for (let b = 1; b <= 4; b++) { const lo = b / 4 - 0.25, hi = b / 4, a = pass ? hi : hi * 0.35, rr = pass ? r : r * 1.9;
          c.fillStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${E.clamp(a * gain, 0, 1).toFixed(3)})`; c.beginPath();
          for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const v = d[(y * cols + x) * 4] / 255; if (v <= lo || v > hi) continue; const px = x * cell + cell / 2, py = y * cell + cell / 2; c.moveTo(px + rr, py); c.arc(px, py, rr, 0, 6.2832); }
          c.fill(); }
      }
      c.globalCompositeOperation = 'source-over';
    },
  });
})();
