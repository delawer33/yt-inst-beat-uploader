/* Strings: six glowing strings across a dark room, one per band, labelled SUB to AIR. Each is
 * plucked by its own hit and rings down as a standing wave with three modes. Nothing else moves.
 * No cover. Kick plucks the low strings, snare the middle, hats the high ones. */
(function () {
  'use strict';
  const NAMES = ['SUB', 'KICK', 'LOW', 'MID', 'HI', 'AIR'], COLS = ['#ffb86b', '#ff8f6b', '#ffffff', '#ffffff', '#9ad8ff', '#c9b8ff'];
  const st = { amp: [0, 0, 0, 0, 0, 0], ph: [0, 0, 0, 0, 0, 0] };
  BeatVisual.register({
    id: 'strings', name: 'Strings', fam: 'gen',
    blurb: 'Шесть светящихся струн в тёмной комнате, по одной на полосу спектра, подписаны SUB … AIR. Каждую дёргает свой удар, и она звенит стоячей волной из трёх мод, затухая. Больше ничего не движется. Без обложки.',
    init() { st.amp.fill(0); st.ph = st.ph.map(() => Math.random() * 6.28); },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt', t = A.t;
      const bg = c.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, H * 0.75); bg.addColorStop(0, '#13131a'); bg.addColorStop(1, '#050507'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
      const hits = [A.kickHit, A.kickHit, A.snareHit, A.snareHit, A.hatHit, A.hatHit];
      for (let i = 0; i < 6; i++) { if (hits[i]) st.amp[i] = Math.max(st.amp[i], 0.6 + 0.4 * A.bands[i]); st.amp[i] *= i < 2 ? 0.97 : i < 4 ? 0.955 : 0.92; }
      const x0 = (yt ? 60 : 36) * S, x1 = W - (yt ? 60 : 36) * S, L = x1 - x0, y0 = H * (yt ? 0.38 : 0.34), y1 = H * (yt ? 0.88 : 0.84), N = 90;
      for (let i = 0; i < 6; i++) {
        const y = y0 + (y1 - y0) * i / 5, amp = st.amp[i] * (yt ? 70 : 64) * S, f = 2.2 + i * 1.1, col = COLS[i], a = 0.35 + 0.65 * Math.min(1, st.amp[i] * 2);
        c.save(); c.strokeStyle = col; c.globalAlpha = a; c.lineWidth = (1.2 + 1.2 * st.amp[i]) * S; c.shadowColor = col; c.shadowBlur = (6 + 22 * st.amp[i]) * S; c.beginPath();
        for (let k = 0; k <= N; k++) { const u = k / N, x = x0 + L * u, d = amp * (Math.sin(Math.PI * u) * Math.sin(t * f * 6.2832 + st.ph[i]) + 0.45 * Math.sin(2 * Math.PI * u) * Math.sin(t * f * 2.01 * 6.2832 + st.ph[i] * 2) + 0.2 * Math.sin(3 * Math.PI * u) * Math.sin(t * f * 3.02 * 6.2832)); if (k) c.lineTo(x, y + d); else c.moveTo(x, y + d); }
        c.stroke(); c.restore();
        c.fillStyle = col; c.globalAlpha = 0.9; c.fillRect(x0 - 3 * S, y - 3 * S, 6 * S, 6 * S); c.fillRect(x1 - 3 * S, y - 3 * S, 6 * S, 6 * S); c.globalAlpha = 1;
        E.mono(c, NAMES[i], x0, y - 10 * S, 10 * S, E.rgba(col, 0.75));
      }
      E.header(c, '#fff', 'rgba(255,255,255,0.6)');
    },
  });
})();
