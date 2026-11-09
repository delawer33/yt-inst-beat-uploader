/* Tunnel: the title runs along the four sides of frames receding into a vanishing point, one
 * frame per beat flies past the camera, the tunnel bends slowly as the vanishing point drifts.
 * The cover waits at the far end, the kick pushes the camera forward, the snare flashes a ring. */
(function () {
  'use strict';
  const ACC = '#ff2d55';
  const st = { push: 0, flash: -1 };
  BeatVisual.register({
    id: 'tunnel', name: 'Tunnel', fam: 'gen',
    blurb: 'Название бежит по четырём сторонам рамок, уходящих в точку схода; каждую долю одна рамка пролетает мимо камеры, тоннель медленно изгибается. В конце тоннеля свет, без обложки; кик толкает камеру вперёд, снэр вспыхивает одной рамкой.',
    init() { st.push = 0; st.flash = -1; },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt', t = A.t, N = 9, title = meta.title.toUpperCase() + '   ';
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') st.push = 1; st.push *= 0.9; if (A.snareHit) st.flash = Math.floor(Math.random() * 4) + 2;
      const u = (A.playing ? A.beats : t * 1.1) + 0.35 * (1 - st.push) * 0, vx = W / 2 + Math.sin(t * 0.4) * W * 0.09, vy = H * 0.5 + Math.cos(t * 0.3) * H * 0.05, frac = (u % 1 + 1) % 1 + 0.25 * st.push;
      const sOf = z => 2.6 / (1 + z * 1.15);
      // the light at the far end
      const gr = W * (0.16 + 0.08 * A.kick), lg = c.createRadialGradient(vx, vy, 0, vx, vy, gr); lg.addColorStop(0, 'rgba(255,255,255,0.95)'); lg.addColorStop(0.25, E.rgba(ACC, 0.7)); lg.addColorStop(1, 'rgba(0,0,0,0)'); c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = lg; c.fillRect(vx - gr, vy - gr, 2 * gr, 2 * gr); c.restore();
      c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      for (let i = N - 1; i >= 0; i--) {
        const z = i + 1 - frac, s = sOf(z); if (s > 2.6) continue; const w = W * s, h = H * s, x0 = vx + (W / 2 - vx) * s - w / 2, y0 = vy + (H / 2 - vy) * s - h / 2, fs = (yt ? 46 : 42) * S * s;
        const alpha = E.clamp(1.15 - z / N, 0.1, 1) * (s > 1.6 ? E.clamp((2.6 - s) / 1.0, 0, 1) : 1), ring = Math.floor(u) + i, col = st.flash === i ? '#fff' : (ring % 2 ? ACC : '#fff');
        c.globalAlpha = alpha; c.fillStyle = col; c.font = '400 ' + fs + 'px "League Gothic"'; const tw = Math.max(1, c.measureText(title).width), off = ((t * 40 * S * s + ring * 97 * S) % tw);
        const run = (len) => { for (let x = -off; x < len; x += tw) c.fillText(title, x, fs * 0.74); };
        c.save(); c.translate(x0, y0); run(w); c.restore();
        c.save(); c.translate(x0 + w, y0 + h); c.rotate(Math.PI); run(w); c.restore();
        c.save(); c.translate(x0, y0 + h); c.rotate(-Math.PI / 2); run(h); c.restore();
        c.save(); c.translate(x0 + w, y0); c.rotate(Math.PI / 2); run(h); c.restore();
      }
      c.globalAlpha = 1; if (st.flash >= 0) st.flash = -1;
      const who = meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  ');
      c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(18 * S, (yt ? 104 : 190) * S, Math.max(who.length, facts.length) * 8.2 * S + 24 * S, 50 * S); c.save(); E.mono(c, who, 30 * S, (yt ? 120 : 206) * S, 13 * S, '#fff'); if (facts) E.mono(c, facts, 30 * S, (yt ? 142 : 230) * S, 13 * S, 'rgba(255,255,255,0.7)'); c.restore();
    },
  });
})();
