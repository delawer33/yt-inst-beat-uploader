/* Polaroid: instant photos of the cover dropping onto a kraft table, one per bar, each a new
 * crop at a new angle. The kick is the camera flash. Nothing reacts otherwise. */
(function () {
  'use strict';
  const KRAFT = '#c9b18a', FRAME = '#f2ede4', INK = '#2b2118';
  const st = { shots: [], grain: null, key: '' };
  function words(E) { const m = E.meta; return [m.artists ? m.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', [m.bpm ? m.bpm + ' BPM' : '', m.key ? m.key.toUpperCase() : ''].filter(Boolean).join(' · ')]; }
  function grain(E) { const { S } = E, n = 256 * S, c = E.mkCanvas(n, n), g = c.getContext('2d'), im = g.createImageData(n, n), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 60; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } g.putImageData(im, 0, 0); return c; }
  function drop(E) {
    const { W, H, S } = E, yt = E.FMT === 'yt', w = yt ? H * 0.5 : W * 0.6, a = E.anchor(), z = 1 + Math.random() * 0.8, cr = E.cropRect(z, a.x, a.y, 1, 1);
    const x = yt ? W * 0.25 + Math.random() * W * 0.5 : W / 2 + (Math.random() - 0.5) * W * 0.16, y = yt ? H * 0.55 + (Math.random() - 0.5) * H * 0.12 : H * 0.55 + (Math.random() - 0.5) * H * 0.22;
    st.shots.push({ x, y, w, rot: (Math.random() - 0.5) * 0.5, cr, t0: E.A.t, src: E.ext(E.pal, false) }); if (st.shots.length > 7) st.shots.shift();
  }
  BeatVisual.register({
    id: 'polaroid', name: 'Polaroid', fam: 'film',
    blurb: 'Моментальные снимки обложки падают стопкой на крафтовый стол: по одному на такт, каждый — новый кроп под новым углом, подпись на поле. Кик — вспышка камеры. Больше ничего не дёргается.',
    init(E) { st.shots = []; st.grain = grain(E); drop(E); st.key = E.cover.version; },
    draw(c, A, E) {
      const { W, H, S, meta } = E; if (st.key !== E.cover.version) { st.shots = []; st.key = E.cover.version; drop(E); }
      c.fillStyle = KRAFT; c.fillRect(0, 0, W, H); c.save(); c.globalAlpha = 0.18; c.globalCompositeOperation = 'multiply'; for (let y = 0; y < H; y += st.grain.height) for (let x = 0; x < W; x += st.grain.width) c.drawImage(st.grain, x, y); c.restore();
      if (A.barHit && A.playing) drop(E);
      const [who, facts] = words(E);
      for (const s of st.shots) {
        const age = Math.min(1, (A.t - s.t0) / 0.28), ease = 1 - Math.pow(1 - age, 3), sc = 1.35 - 0.35 * ease, pad = s.w * 0.06, lip = s.w * 0.22, h = s.w + pad + lip, inner = s.w - 2 * pad;
        c.save(); c.translate(s.x, s.y); c.rotate(s.rot); c.scale(sc, sc); c.globalAlpha = 0.4 + 0.6 * ease;
        c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 24 * S * sc; c.shadowOffsetY = 10 * S; c.fillStyle = FRAME; c.fillRect(-s.w / 2, -h / 2, s.w, h); c.shadowColor = 'transparent';
        c.drawImage(s.src, s.cr.sx, s.cr.sy, s.cr.sw, s.cr.sh, -s.w / 2 + pad, -h / 2 + pad, inner, inner);
        c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(-s.w / 2 + pad, -h / 2 + pad, inner, inner); // the slight gloss of the print
        E.gothic(c, meta.title.toUpperCase(), -s.w / 2 + pad, h / 2 - lip * 0.36, lip * 0.5, INK, 'left');
        E.mono(c, facts, s.w / 2 - pad, h / 2 - lip * 0.38, lip * 0.17, INK, 'right');
        c.restore();
      }
      E.header(c, INK, 'rgba(43,33,24,0.75)');
      const flash = Math.max(0, (A.kick - 0.55) / 0.45); if (flash > 0) { c.fillStyle = 'rgba(255,250,235,' + (0.75 * flash).toFixed(3) + ')'; c.fillRect(0, 0, W, H); }
    },
  });
})();
