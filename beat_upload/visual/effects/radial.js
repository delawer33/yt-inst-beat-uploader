/* Radial: a polar beat clock, white on black. A hand sweeps once per bar and paints the spectrum
 * onto seven rings, one per note of the beat's own scale, leaving a trail that fades over the
 * bar; a spray of points fans behind the hand. Bar numbers around, the key's notes down the
 * middle. Kick: the centre pulses; snare: the outer ring flashes. No cover. */
(function () {
  'use strict';
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], FLAT = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#', CB: 'B', FB: 'E' };
  function scale(key) { const m = /^([A-G])([#b]?)\s*(.*)$/i.exec((key || '').trim()); if (!m) return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']; let root = m[1].toUpperCase() + (m[2] || ''); root = FLAT[root.toUpperCase()] || root.replace('b', ''); const i0 = Math.max(0, NOTES.indexOf(root)), minor = /min|^m$|^m\s|aeol|dor|phr/i.test(m[3]); return (minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map(k => NOTES[(i0 + k) % 12]); }
  const st = { trail: null, key: '', notes: [], pulse: 0, flash: 0 };
  function build(E) { st.trail = E.mkCanvas(E.W, E.H); const g = st.trail.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, E.W, E.H); st.notes = scale(E.meta.key); st.key = E.W + '|' + E.meta.key; }
  function tiny(c, E, col, muted) { const { W, S, meta } = E, yt = E.FMT === 'yt', y = (yt ? 44 : 160) * S; c.save(); c.letterSpacing = 2.5 * S + 'px'; E.mono(c, meta.title.toUpperCase(), 28 * S, y, 12 * S, col); E.mono(c, meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 28 * S, y + 20 * S, 10 * S, muted); const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '); if (facts) E.mono(c, facts, W - 28 * S, y, 12 * S, col, 'right'); c.restore(); }
  BeatVisual.register({
    id: 'radial', name: 'Radial', fam: 'gen',
    blurb: 'Полярные часы бита, белым по чёрному. Стрелка делает оборот за такт и рисует спектр на семи кольцах, по одному на ноту тональности бита; след гаснет за такт, за стрелкой веером летят точки. Номера тактов по кругу, ноты тональности посередине. Кик — пульс центра, снэр — вспышка внешнего кольца. Без обложки.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== W + '|' + E.meta.key) build(E); const t = A.t, g = st.trail.getContext('2d');
      const cx = W / 2, cy = yt ? H * 0.52 : H * 0.52, R = Math.min(W, H) * (yt ? 0.36 : 0.38), r0 = R * 0.3, ring = i => r0 + (R - r0) * i / 6;
      const barPh = A.playing ? (A.beats / 4) % 1 : (t * 0.25) % 1, a = barPh * 6.2832 - 1.5708, barNo = A.playing ? Math.floor(A.beats / 4) % 8 : Math.floor(t * 0.25) % 8;
      if (A.cut && A.cutKind === 'kick') st.pulse = 1; st.pulse *= 0.86; if (A.snareHit) st.flash = 1; st.flash *= 0.8;
      g.fillStyle = 'rgba(0,0,0,0.035)'; g.fillRect(0, 0, W, H); g.lineCap = 'butt';
      for (let i = 0; i < 7; i++) { const v = i < 6 ? A.bands[i] : A.level; if (v < 0.06) continue; g.strokeStyle = `rgba(255,255,255,${0.25 + 0.75 * v})`; g.lineWidth = (1.5 + 7 * v) * S; g.beginPath(); g.arc(cx, cy, ring(i), a - 0.03, a + 0.012); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.55)'; const tot = A.bands.reduce((s, v) => s + v, 0) + 1e-3;
      for (let k = 0; k < 160; k++) { let pick = Math.random() * tot, i = 0; while (i < 5 && pick > A.bands[i]) { pick -= A.bands[i]; i++; } const ang = a - Math.random() * Math.random() * 0.9, rr = ring(i) + (Math.random() - 0.5) * (R - r0) / 6 * 0.8; g.fillRect(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 1.3 * S, 1.3 * S); }
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.drawImage(st.trail, 0, 0);
      c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = S; for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(cx, cy, ring(i), 0, 6.2832); c.stroke(); }
      c.strokeStyle = `rgba(255,255,255,${0.25 + 0.6 * st.flash})`; c.beginPath(); c.arc(cx, cy, R + 14 * S, 0, 6.2832); c.stroke();
      for (let k = 0; k < 8; k++) { const ang = k / 8 * 6.2832 - 1.5708, on = k === barNo; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(cx + Math.cos(ang) * (R + 10 * S), cy + Math.sin(ang) * (R + 10 * S)); c.lineTo(cx + Math.cos(ang) * (R + 18 * S), cy + Math.sin(ang) * (R + 18 * S)); c.stroke(); E.mono(c, String(k + 1), cx + Math.cos(ang) * (R + 32 * S), cy + Math.sin(ang) * (R + 32 * S) + 4 * S, 10 * S, on ? '#fff' : 'rgba(255,255,255,0.4)', 'center'); }
      c.save(); c.letterSpacing = S + 'px'; st.notes.forEach((n, i) => E.mono(c, n, cx + 7 * S, cy + ring(i) - 4 * S, 9 * S, 'rgba(255,255,255,0.55)')); c.restore();
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = S; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R + 8 * S), cy + Math.sin(a) * (R + 8 * S)); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, (2.5 + 3 * A.kick) * S, 0, 6.2832); c.fill(); c.beginPath(); c.arc(cx, cy, (3 + 9 * st.pulse) * S, 0, 6.2832); c.fill();
      tiny(c, E, '#fff', 'rgba(255,255,255,0.55)');
    },
  });
})();
