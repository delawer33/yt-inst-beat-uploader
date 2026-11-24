/* Lattice: a sphere of fifteen hundred points of light turning in the dark. Each latitude listens
 * to its own band and lifts off the surface; the kick sends a wave rolling from pole to pole,
 * the snare flashes the lattice white, hats light random points. One colour per Beat. No cover. */
(function () {
  'use strict';
  const COLS = [[255, 255, 255], [120, 255, 170], [255, 90, 70], [130, 200, 255]];
  const st = { pts: [], col: COLS[0], waves: [], flash: 0 };
  function build() { const N = 1500; st.pts = []; for (let i = 0; i < N; i++) { const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), ph = i * 2.39996; st.pts.push({ x: r * Math.cos(ph), y, z: r * Math.sin(ph), s: Math.random() }); } st.col = COLS[Math.floor(Math.random() * COLS.length)]; st.waves = []; }
  function tiny(c, E, col, muted) { const { W, S, meta } = E, yt = E.FMT === 'yt', y = (yt ? 44 : 160) * S; c.save(); c.letterSpacing = 2.5 * S + 'px'; E.mono(c, meta.title.toUpperCase(), 28 * S, y, 12 * S, col); E.mono(c, meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 28 * S, y + 20 * S, 10 * S, muted); const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '); if (facts) E.mono(c, facts, W - 28 * S, y, 12 * S, col, 'right'); c.restore(); }
  BeatVisual.register({
    id: 'lattice', name: 'Lattice', fam: 'gen',
    blurb: 'Сфера из полутора тысяч точек света вращается в темноте. Каждая широта слушает свою полосу спектра и приподнимается над поверхностью; кик пускает волну от полюса к полюсу, снэр вспыхивает решёткой, хэты зажигают случайные точки. Один цвет на бит. Без обложки.',
    init() { build(); st.flash = 0; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt', t = A.t, [r, g, b] = st.col;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') st.waves.push({ age: 0 }); for (const w of st.waves) w.age += 1 / 30; st.waves = st.waves.filter(w => w.age < 0.7); if (A.snareHit) st.flash = 1; st.flash *= 0.8; const hat = A.hatHit;
      const cx = W / 2, cy = yt ? H * 0.52 : H * 0.5, R = Math.min(W, H) * (yt ? 0.3 : 0.3), ay = t * 0.25, ax = 0.25 + 0.3 * Math.sin(t * 0.2), cya = Math.cos(ay), sya = Math.sin(ay), cxa = Math.cos(ax), sxa = Math.sin(ax);
      const vg = c.createRadialGradient(cx, cy, 0, cx, cy, R * 2); vg.addColorStop(0, `rgba(${r},${g},${b},0.07)`); vg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'lighter';
      for (const p of st.pts) {
        const bi = (p.y + 1) / 2 * 5, i0 = Math.min(4, Math.floor(bi)), f = bi - i0, band = A.bands[i0] * (1 - f) + A.bands[i0 + 1] * f; let lift = 0.2 * band * (0.6 + 0.8 * A.level);
        for (const w of st.waves) { const front = 1 - 2 * w.age / 0.6, d = (p.y - front) / 0.14; lift += 0.3 * Math.exp(-d * d) * (1 - w.age / 0.7); }
        const k = 1 + lift, x = p.x * k, y = p.y * k, z = p.z * k, x1 = x * cya + z * sya, z1 = -x * sya + z * cya, y1 = y * cxa - z1 * sxa, z2 = y * sxa + z1 * cxa, pz = 1 / (1 + z2 * 0.3), dp = (z2 + 1) / 2;
        const sz = (0.9 + 1.6 * dp + 2 * lift) * S, a = Math.min(1, (0.2 + 0.7 * dp) * (1 + lift * 2) + st.flash * 0.5 + (hat && p.s > 0.97 ? 0.8 : 0));
        c.fillStyle = st.flash > 0.3 || lift > 0.25 ? `rgba(255,255,255,${a})` : `rgba(${r},${g},${b},${a})`; c.fillRect(cx + x1 * R * pz - sz / 2, cy - y1 * R * pz - sz / 2, sz, sz);
      }
      c.globalCompositeOperation = 'source-over'; tiny(c, E, '#fff', 'rgba(255,255,255,0.55)');
    },
  });
})();
