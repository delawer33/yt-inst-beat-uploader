/* Kaleidoscope: eight mirrored wedges of a zoomed piece of the cover, turning slowly; the kick
 * spins it harder, the snare picks another piece. The cover's own colours, nothing added. */
(function () {
  'use strict';
  const N = 8;
  function near(E) { const a = E.anchor(), cx = (E.cover.left + E.cover.w / 2) / E.W, cy = (E.cover.top + E.cover.h / 2) / E.H; return { x: cx + (a.x - cx) * 0.5, y: cy + (a.y - cy) * 0.5 }; }
  const st = { rot: 0, vel: 0, a: { x: 0.5, y: 0.5 }, zoom: 1.6 };
  BeatVisual.register({
    id: 'kaleido', name: 'Kaleidoscope', fam: 'mirror',
    blurb: 'Восемь зеркальных секторов из увеличенного куска обложки, медленно вращаются; кик раскручивает сильнее, снэр берёт другой кусок. Цвета только обложки.',
    init(E) { st.rot = 0; st.vel = 0; st.a = near(E); st.zoom = 0.9 + Math.random() * 0.5; },
    draw(c, A, E) {
      const { W, H, S } = E, step = 6.2832 / N, R = Math.hypot(W, H) / 2 + 2, cx = W / 2, cy = H / 2;
      if (A.cut && A.cutKind === 'kick') st.vel += 0.06 * (Math.random() < 0.5 ? -1 : 1); if (A.cut && A.cutKind === 'snare') { st.a = near(E); st.zoom = 0.8 + Math.random() * 0.6; }
      st.vel *= 0.93; st.rot += 0.004 + st.vel;
      const cv = E.cover.src, k = st.zoom * Math.max(W, H) / Math.min(cv.width, cv.height), ax = (st.a.x * W - E.cover.left) / E.cover.w * cv.width, ay = (st.a.y * H - E.cover.top) / E.cover.h * cv.height;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < N; i++) {
        c.save(); c.translate(cx, cy); if (i % 2) { c.rotate((i + 1) * step); c.scale(1, -1); } else c.rotate(i * step);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(R, 0); c.lineTo(R * Math.cos(step), R * Math.sin(step)); c.closePath(); c.clip();
        c.rotate(st.rot); c.scale(k, k); c.drawImage(cv, -ax, -ay); c.restore();
      }
      const sh = c.createLinearGradient(0, 0, 0, (E.FMT === 'yt' ? 0.34 * H : 300 * S)); sh.addColorStop(0, 'rgba(0,0,0,0.85)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = sh; c.fillRect(0, 0, W, E.FMT === 'yt' ? 0.34 * H : 300 * S);
      E.header(c, '#fff', 'rgba(255,255,255,0.7)');
    },
  });
})();
