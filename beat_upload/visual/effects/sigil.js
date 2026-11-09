/* Sigil: a glowing glyph of light drawn by thousands of trembling particles on black, rays
 * spraying out of its strokes. The glyph turns slowly and breathes with the mids; the kick
 * flashes it white and blows the rays out, the snare throws sparks. No cover. */
(function () {
  'use strict';
  const COLS = [[120, 200, 255], [170, 120, 255], [255, 215, 140], [235, 240, 255]];
  const st = { pts: [], segs: [], col: COLS[0], key: '', flash: 0, jolt: 0, spark: 0 };
  function circle(s, r, n) { for (let i = 0; i < n; i++) { const a0 = i / n * 6.2832, a1 = (i + 1) / n * 6.2832; s.push([r * Math.cos(a0), r * Math.sin(a0), r * Math.cos(a1), r * Math.sin(a1)]); } }
  function poly(s, r, n, rot) { for (let i = 0; i < n; i++) { const a0 = rot + i / n * 6.2832, a1 = rot + (i + 1) / n * 6.2832; s.push([r * Math.cos(a0), r * Math.sin(a0), r * Math.cos(a1), r * Math.sin(a1)]); } }
  function glyph() {
    const s = [], k = Math.floor(Math.random() * 4);
    if (k === 0) { circle(s, 1, 64); poly(s, 0.85, 3, -1.5708); poly(s, 0.85, 3, 1.5708); }
    else if (k === 1) { circle(s, 0.9, 64); s.push([-1.3, 0.1, 1.3, -0.1], [0.15, -1.35, -0.15, 1.35]); circle(s, 0.45, 32); }
    else if (k === 2) { poly(s, 1, 3, -1.5708); poly(s, 0.55, 3, 1.5708); circle(s, 1.15, 64); s.push([0, -1, 0, 0.5]); }
    else { circle(s, 1, 64); poly(s, 1, 4, 0.785); poly(s, 0.7, 4, 0); s.push([-1.2, 0, 1.2, 0]); }
    return s;
  }
  function build(E) {
    st.segs = glyph(); st.col = COLS[Math.floor(Math.random() * COLS.length)]; const total = st.segs.reduce((a, s) => a + Math.hypot(s[2] - s[0], s[3] - s[1]), 0); st.pts = [];
    for (const s of st.segs) { const L = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.max(2, Math.round(2600 * L / total)), nx = -(s[3] - s[1]) / L, ny = (s[2] - s[0]) / L; for (let i = 0; i < n; i++) { const u = Math.random(); st.pts.push({ x: s[0] + (s[2] - s[0]) * u, y: s[1] + (s[3] - s[1]) * u, nx, ny, w: Math.random() }); } }
    st.key = E.W + '';
  }
  function tiny(c, E, col, muted) { const { W, S, meta } = E, yt = E.FMT === 'yt', y = (yt ? 44 : 160) * S; c.save(); c.letterSpacing = 2.5 * S + 'px'; E.mono(c, meta.title.toUpperCase(), 28 * S, y, 12 * S, col); E.mono(c, meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 28 * S, y + 20 * S, 10 * S, muted); const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '); if (facts) E.mono(c, facts, W - 28 * S, y, 12 * S, col, 'right'); c.restore(); }
  BeatVisual.register({
    id: 'sigil', name: 'Sigil', fam: 'gen',
    blurb: 'Светящийся знак из тысяч дрожащих частиц на чёрном, из его линий бьют лучи. Знак медленно поворачивается и дышит серединой спектра; кик вспыхивает его белым и выдувает лучи, снэр бросает искры. Без обложки; форма и цвет свои на каждый бит.',
    init(E) { build(E); st.flash = 0; st.jolt = 0; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== W + '') build(E); const t = A.t, [r, g, b] = st.col, rgba = a => `rgba(${r},${g},${b},${a})`;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') { st.flash = 1; st.jolt += (Math.random() - 0.5) * 0.3; } st.flash *= 0.85; st.jolt *= 0.9; if (A.snareHit) st.spark = 1; st.spark *= 0.8;
      const cx = W / 2, cy = yt ? H * 0.5 : H * 0.5, R = Math.min(W, H) * (yt ? 0.3 : 0.3) * (1 + 0.03 * A.kick), rot = t * 0.06 + st.jolt, cs = Math.cos(rot), sn = Math.sin(rot), P = (x, y) => [cx + (x * cs - y * sn) * R, cy + (x * sn + y * cs) * R];
      c.globalCompositeOperation = 'lighter';
      c.save(); c.shadowColor = rgba(1); c.shadowBlur = 36 * S; c.strokeStyle = rgba(0.3 + 0.4 * st.flash); c.lineWidth = 2.5 * S; c.beginPath(); for (const s of st.segs) { const [x0, y0] = P(s[0], s[1]), [x1, y1] = P(s[2], s[3]); c.moveTo(x0, y0); c.lineTo(x1, y1); } c.stroke(); c.restore();
      const jit = (1.5 + 4 * A.bands[2] + 6 * st.flash) * S, white = 'rgba(255,255,255,0.9)', tint = rgba(0.75), sz = 1.4 * S;
      for (const p of st.pts) { const [x, y] = P(p.x, p.y); c.fillStyle = p.w > 0.7 ? white : tint; c.fillRect(x + (Math.random() + Math.random() - 1) * jit, y + (Math.random() + Math.random() - 1) * jit, sz, sz); }
      const len = (8 + 70 * A.kick + 25 * A.bands[4] + 40 * st.spark) * S; c.strokeStyle = rgba(0.22); c.lineWidth = S; c.beginPath();
      for (let i = 0; i < 260; i++) { const p = st.pts[Math.floor(Math.random() * st.pts.length)], [x, y] = P(p.x, p.y), nx = p.nx * cs - p.ny * sn, ny = p.nx * sn + p.ny * cs, side = Math.random() < 0.5 ? 1 : -1, L = len * Math.random(); c.moveTo(x, y); c.lineTo(x + nx * L * side, y + ny * L * side); } c.stroke();
      if (st.flash > 0.05) { c.globalAlpha = st.flash * 0.6; c.strokeStyle = '#fff'; c.lineWidth = 1.5 * S; c.beginPath(); for (const s of st.segs) { const [x0, y0] = P(s[0], s[1]), [x1, y1] = P(s[2], s[3]); c.moveTo(x0, y0); c.lineTo(x1, y1); } c.stroke(); c.globalAlpha = 1; }
      c.globalCompositeOperation = 'source-over'; tiny(c, E, '#fff', 'rgba(255,255,255,0.55)');
    },
  });
})();
