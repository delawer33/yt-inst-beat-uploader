/* Ferro: a living blob of black ferrofluid frames the cover disc on a light sheet. Spikes
 * grow out of it with the bands, satellites of ink orbit and merge back, the kick swells the
 * core and it settles, the snare throws a satellite out. Glossy, slow, almost alive. */
(function () {
  'use strict';
  const BG = '#e7e5e0', INK = '#111';
  const st = { low: null, mask: null, img: null, key: '', sat: [], spikes: [], core: 1 };
  function build(E) {
    const { W, H, S } = E, cols = Math.round(W / (4 * S)), rows = Math.round(H / (4 * S)); st.low = E.mkCanvas(cols, rows); st.img = st.low.getContext('2d').createImageData(cols, rows); st.mask = E.mkCanvas(W, H);
    st.sat = []; for (let i = 0; i < 4; i++) st.sat.push({ a: Math.random() * 6.28, d: 1.1 + Math.random() * 0.5, sp: (0.18 + Math.random() * 0.25) * (Math.random() < 0.5 ? -1 : 1), r: 0.16 + Math.random() * 0.1, j: 0 });
    st.spikes = []; for (let i = 0; i < 16; i++) st.spikes.push({ a: i / 16 * 6.2832, band: i % 6, len: 0.8 + Math.random() * 0.6 }); st.core = 1; st.key = E.cover.version + '|' + W;
  }
  BeatVisual.register({
    id: 'ferro', name: 'Ferro', fam: 'gen',
    blurb: 'Живая капля чёрной феррожидкости на светлом листе, внутри неё название. Шипы растут от полос спектра, капли-спутники кружат и сливаются обратно, кик раздувает ядро, снэр выбрасывает спутник. Глянцево, медленно, почти живое.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== E.cover.version + '|' + W) build(E); const t = A.t;
      const cx = yt ? W * 0.64 : W / 2, cy = yt ? H * 0.5 : H * 0.56, R = yt ? H * 0.22 : W * 0.24, f = 1 / (4 * S);
      if (A.cut && A.cutKind === 'kick') st.core = 1.2; st.core += (1 - st.core) * 0.1; if (A.snareHit) st.sat[Math.floor(Math.random() * st.sat.length)].j = 1;
      const blobs = [{ x: cx * f, y: cy * f, r: R * 1.08 * st.core * f }];
      for (const s of st.spikes) { const L = (0.3 + 1.0 * A.bands[s.band]) * s.len; for (let q = 0; q < 7; q++) { const dist = R * (0.95 + L * q / 6); blobs.push({ x: (cx + Math.cos(s.a + t * 0.05) * dist) * f, y: (cy + Math.sin(s.a + t * 0.05) * dist) * f, r: R * (0.21 - 0.13 * q / 6) * f }); } }
      for (const s of st.sat) { s.j *= 0.9; const a = s.a + t * s.sp, dist = R * (s.d + 0.7 * s.j); blobs.push({ x: (cx + Math.cos(a) * dist) * f, y: (cy + Math.sin(a) * dist * 0.9) * f, r: R * s.r * f }); }
      const cols = st.low.width, rows = st.low.height, d = st.img.data, R2 = blobs.map(b => (b.r * 1.6) * (b.r * 1.6)); // a compact kernel: a blob pulls only within 1.6 of its radius, so far blobs do not fatten the core
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let F = 0; for (let b = 0; b < blobs.length; b++) { const dx = x - blobs[b].x, dy = y - blobs[b].y, q = (dx * dx + dy * dy) / R2[b]; if (q < 1) { const w = 1 - q; F += w * w; } } const i = (y * cols + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = E.clamp((F - 0.25) * 6 + 0.5, 0, 1) * 255; }
      st.low.getContext('2d').putImageData(st.img, 0, 0);
      const mg = st.mask.getContext('2d'); mg.globalCompositeOperation = 'source-over'; mg.clearRect(0, 0, W, H); mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = 'high'; mg.drawImage(st.low, 0, 0, W, H);
      mg.globalCompositeOperation = 'source-in'; mg.fillStyle = INK; mg.fillRect(0, 0, W, H);
      mg.globalCompositeOperation = 'source-atop'; const gl = mg.createRadialGradient(cx - R * 0.6, cy - R * 0.9, R * 0.1, cx - R * 0.2, cy - R * 0.3, R * 1.9); gl.addColorStop(0, 'rgba(255,255,255,0.3)'); gl.addColorStop(0.4, 'rgba(255,255,255,0.03)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); mg.fillStyle = gl; mg.fillRect(0, 0, W, H);
      const rim = mg.createRadialGradient(cx, cy + R * 0.6, R * 0.8, cx, cy + R * 0.3, R * 2.2); rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(1, 'rgba(255,255,255,0.18)'); mg.fillStyle = rim; mg.fillRect(0, 0, W, H);
      c.fillStyle = BG; c.fillRect(0, 0, W, H); const vg = c.createRadialGradient(cx, cy, R, cx, cy, H * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.14)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 36 * S; c.shadowOffsetY = 18 * S; c.drawImage(st.mask, 0, 0); c.restore();
      const title = E.meta.title.toUpperCase(); c.font = '400 100px "League Gothic"'; const w100 = Math.max(1, c.measureText(title).width), fs = Math.min(100 * (R * 1.5) / w100, R * 0.6); E.gothic(c, title, cx, cy + fs * 0.34, fs, BG, 'center');
      const who = E.meta.artists ? E.meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', facts = [E.meta.bpm ? E.meta.bpm + ' BPM' : '', E.meta.key ? E.meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  ');
      E.mono(c, who, 30 * S, (yt ? 60 : 150) * S, 13 * S, INK); if (facts) E.mono(c, facts, 30 * S, (yt ? 82 : 172) * S, 13 * S, 'rgba(17,17,17,0.6)');
    },
  });
})();
