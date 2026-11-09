/* Burst: a shaft of light standing in the dark with a blinding core, streams of particles
 * pouring up and down along it and leaving fading trails. The kick flares the core and throws a
 * ring of particles out, the snare widens the beam and flashes a horizontal streak. No cover. */
(function () {
  'use strict';
  const st = { key: '', trail: null, pts: [], streak: 0, flare: 0 };
  function spawn(E, p, radial) { const cx = E.W / 2, cy = E.H * (E.FMT === 'yt' ? 0.52 : 0.5); p.x = cx + (Math.random() - 0.5) * 6 * E.S; p.y = cy + (Math.random() - 0.5) * 6 * E.S; p.life = 40 + Math.random() * 120; p.dir = Math.random() < 0.5 ? -1 : 1; p.ph = Math.random() * 6.28; p.col = Math.random() < 0.3 ? 'rgba(255,150,230,' : Math.random() < 0.5 ? 'rgba(255,255,255,' : 'rgba(140,230,255,';
    if (radial) { const a = Math.random() * 6.2832, v = (4 + 5 * Math.random()) * E.S; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; } else { p.vx = (Math.random() - 0.5) * 0.6 * E.S; p.vy = p.dir * (1.5 + 3 * Math.random()) * E.S; } }
  function build(E) { st.trail = E.mkCanvas(E.W, E.H); const g = st.trail.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, E.W, E.H); st.pts = []; for (let i = 0; i < 600; i++) { const p = {}; spawn(E, p, false); p.life *= Math.random(); p.y += p.vy * 30 * Math.random(); st.pts.push(p); } st.key = E.W + ''; }
  function tiny(c, E, col, muted) { const { W, S, meta } = E, yt = E.FMT === 'yt', y = (yt ? 44 : 160) * S; c.save(); c.letterSpacing = 2.5 * S + 'px'; E.mono(c, meta.title.toUpperCase(), 28 * S, y, 12 * S, col); E.mono(c, meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 28 * S, y + 20 * S, 10 * S, muted); const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '); if (facts) E.mono(c, facts, W - 28 * S, y, 12 * S, col, 'right'); c.restore(); }
  BeatVisual.register({
    id: 'burst', name: 'Burst', fam: 'gen',
    blurb: 'Столб света в темноте со слепящим ядром, вдоль него вверх и вниз льются потоки частиц с гаснущими следами. Кик вспыхивает ядром и выбрасывает кольцо частиц, снэр расширяет луч и бьёт горизонтальным бликом. Без обложки.',
    init(E) { build(E); st.streak = 0; st.flare = 0; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== W + '') build(E); const t = A.t, g = st.trail.getContext('2d'), cx = W / 2, cy = yt ? H * 0.52 : H * 0.5;
      if (A.cut && A.cutKind === 'kick') { st.flare = 1; for (let i = 0; i < 140; i++) spawn(E, st.pts[Math.floor(Math.random() * st.pts.length)], true); } st.flare *= 0.88; if (A.snareHit) st.streak = 1; st.streak *= 0.85;
      g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
      for (const p of st.pts) { p.vx = p.vx * 0.96 + Math.sin(t * 3 + p.ph) * 0.05 * S; p.vy += (p.dir * (1.5 + 2 * A.bands[1]) * S - p.vy) * 0.04; p.x += p.vx; p.y += p.vy; const a = Math.min(1, p.life / 40) * 0.9; g.fillStyle = p.col + a + ')'; const sz = (1 + Math.random()) * S; g.fillRect(p.x, p.y, sz, sz); if (--p.life <= 0 || p.y < -10 || p.y > H + 10 || p.x < -10 || p.x > W + 10) spawn(E, p, false); }
      g.globalCompositeOperation = 'source-over';
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const bw = (26 + 30 * A.kick + 60 * st.streak) * S, beam = c.createLinearGradient(cx - bw, 0, cx + bw, 0); beam.addColorStop(0, 'rgba(120,220,255,0)'); beam.addColorStop(0.42, 'rgba(140,230,255,0.45)'); beam.addColorStop(0.5, 'rgba(255,255,255,1)'); beam.addColorStop(0.58, 'rgba(140,230,255,0.45)'); beam.addColorStop(1, 'rgba(120,220,255,0)');
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = beam; c.fillRect(cx - bw, 0, 2 * bw, H);
      const fade = c.createLinearGradient(0, 0, 0, H); fade.addColorStop(0, 'rgba(0,0,0,0.9)'); fade.addColorStop(0.3, 'rgba(0,0,0,0)'); fade.addColorStop(0.7, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0.9)'); c.globalCompositeOperation = 'source-over'; c.fillStyle = fade; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'lighter'; c.drawImage(st.trail, 0, 0);
      const cr = (70 + 50 * A.kick + 60 * st.flare) * S, core = c.createRadialGradient(cx, cy, 0, cx, cy, cr); core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.25, 'rgba(200,245,255,0.8)'); core.addColorStop(0.6, 'rgba(120,200,255,0.25)'); core.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = core; c.fillRect(cx - cr, cy - cr, 2 * cr, 2 * cr);
      const sw = W * (0.3 + 0.5 * st.streak), sh = (1.5 + 3 * st.streak) * S, sg = c.createLinearGradient(cx - sw, 0, cx + sw, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, `rgba(255,255,255,${0.5 + 0.5 * st.streak})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sg; c.fillRect(cx - sw, cy - sh, 2 * sw, 2 * sh);
      c.restore();
      tiny(c, E, '#fff', 'rgba(255,255,255,0.55)');
    },
  });
})();
