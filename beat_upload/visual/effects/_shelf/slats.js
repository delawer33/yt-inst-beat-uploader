/* Slats: a tri-vision billboard. The frame is cut into slats that flip in a wave every bar,
 * from the cover to a flat acid sheet with the artist set giant, to a duotone of the cover
 * and back. The kick makes the slats shiver. */
(function () {
  'use strict';
  const ACC = '#f0ff3d', DUO = '#ff4d6d';
  const st = { faces: [], key: '', face: 0, t0: -1, jig: 0, N: 0 };
  function full(g, E, src) { const { W, H } = E, k = Math.max(W / src.width, H / src.height); g.drawImage(src, (src.width - W / k) / 2, (src.height - H / k) / 2, W / k, H / k, 0, 0, W, H); }
  function build(E) {
    const { W, H, S, meta } = E, yt = E.FMT === 'yt'; st.N = yt ? 18 : 12; st.face = 0; st.t0 = -1;
    const f0 = E.mkCanvas(W, H); full(f0.getContext('2d'), E, E.cover.src);
    const f1 = E.mkCanvas(W, H), g1 = f1.getContext('2d'); g1.fillStyle = ACC; g1.fillRect(0, 0, W, H);
    const words = (meta.artists ? meta.artists.toUpperCase() : 'TYPE BEAT').split(/\s+x\s+|\s*,\s*|\s+/i).filter(Boolean).slice(0, 3); g1.font = '400 100px "League Gothic"';
    const sizes = words.map(w => Math.min(100 * (W * 0.96) / Math.max(1, g1.measureText(w).width), H * 0.42 / words.length)), total = sizes.reduce((a, b) => a + b * 0.78, 0); let y = H * 0.5 - total / 2;
    words.forEach((w, i) => { y += sizes[i] * 0.78; E.gothic(g1, w, W / 2, y - sizes[i] * 0.06, sizes[i], '#111', 'center'); });
    const f2 = E.mkCanvas(W, H), g2 = f2.getContext('2d'); g2.filter = 'grayscale(1) contrast(1.3)'; full(g2, E, E.cover.src); g2.filter = 'none'; g2.globalCompositeOperation = 'multiply'; g2.fillStyle = DUO; g2.fillRect(0, 0, W, H); g2.globalCompositeOperation = 'lighter'; g2.fillStyle = '#1a0010'; g2.fillRect(0, 0, W, H);
    st.faces = [f0, f1, f2]; st.key = E.cover.version + '|' + W;
  }
  BeatVisual.register({
    id: 'slats', name: 'Slats', fam: 'object',
    blurb: 'Рекламный щит из поворотных ламелей. Каждый такт ламели волной переворачиваются: обложка → кислотный лист с огромным именем артиста → дуотон обложки → снова обложка. Кик встряхивает ламели.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== E.cover.version + '|' + W) build(E); const t = A.t, N = st.N;
      if (A.barHit && A.playing && t - st.t0 > 1) { st.face = (st.face + 1) % 3; st.t0 = t; }
      if (A.cut && A.cutKind === 'kick') st.jig = 1; st.jig *= 0.84;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const prev = st.faces[(st.face + 2) % 3], cur = st.faces[st.face];
      for (let i = 0; i < N; i++) {
        const q = st.t0 < 0 ? 1 : E.clamp((t - st.t0 - i * 0.04) / 0.5, 0, 1), e = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2, th = e * Math.PI, face = th < Math.PI / 2 ? prev : cur;
        const sc = Math.max(0.02, Math.abs(Math.cos(th))) * (1 - 0.06 * st.jig * (0.5 + 0.5 * Math.sin(i * 1.7 + t * 9))), shade = 0.65 * Math.sin(th) + 0.08 * st.jig;
        c.save();
        if (yt) { const w = W / N, x = i * w; c.translate(x + w / 2, 0); c.scale(sc, 1); c.drawImage(face, x, 0, w, H, -w / 2, 0, w, H); c.fillStyle = `rgba(0,0,0,${shade})`; c.fillRect(-w / 2, 0, w, H); }
        else { const h = H / N, y = i * h; c.translate(0, y + h / 2); c.scale(1, sc); c.drawImage(face, 0, y, W, h, 0, -h / 2, W, h); c.fillStyle = `rgba(0,0,0,${shade})`; c.fillRect(0, -h / 2, W, h); }
        c.restore();
      }
      c.fillStyle = 'rgba(0,0,0,0.45)'; for (let i = 1; i < N; i++) { if (yt) c.fillRect(Math.round(i * W / N) - S / 2, 0, S, H); else c.fillRect(0, Math.round(i * H / N) - S / 2, W, S); }
      c.save(); c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = 14 * S; E.header(c, '#fff', 'rgba(255,255,255,0.7)'); c.restore();
    },
  });
})();
