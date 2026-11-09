/* Depth: the cover sliced into six layers by brightness, like a hologram or a 2.5D photo. The
 * layers drift apart on a slow orbit so the picture gains false depth; the kick pulls them wide
 * apart and they slide back, the snare reverses the orbit, hats flicker the brightest slice. */
(function () {
  'use strict';
  const st = { layers: [], base: null, key: '', sep: 0, dir: 1, flick: 0 };
  function build(E) {
    const { W, H } = E, w = Math.round(W / 2), h = Math.round(H / 2), base = E.mkCanvas(w, h), g = base.getContext('2d'), cv = E.cover.src, k = Math.max(w / cv.width, h / cv.height); g.drawImage(cv, (cv.width - w / k) / 2, (cv.height - h / k) / 2, w / k, h / k, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, N = 6, e = 0.05; st.layers = [];
    for (let L = 0; L < N; L++) {
      const cnv = E.mkCanvas(w, h), gg = cnv.getContext('2d'), im = gg.createImageData(w, h), o = im.data, lo = L / N, hi = (L + 1) / N;
      for (let i = 0; i < d.length; i += 4) { const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; let a = E.clamp(Math.min((lum - (lo - e)) / e, (hi + e - lum) / e), 0, 1); if (L === 0 && lum < lo) a = 1; if (L === N - 1 && lum >= hi) a = 1; o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; o[i + 3] = a * 255; }
      gg.putImageData(im, 0, 0); st.layers.push(cnv);
    }
    st.base = base; st.key = E.cover.version + '|' + W;
  }
  BeatVisual.register({
    id: 'depth', name: 'Depth', fam: 'future',
    blurb: 'Обложка разрезана на шесть слоёв по яркости, как голограмма. Слои медленно расходятся по орбите и картинка получает ложную глубину; кик раздвигает их широко и они съезжаются обратно, снэр разворачивает орбиту, хэты мерцают самым светлым слоем.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E; if (st.key !== E.cover.version + '|' + W) build(E); const t = A.t, N = st.layers.length;
      if (A.cut && A.cutKind === 'kick') st.sep = 1; st.sep *= 0.9; if (A.snareHit) st.dir = -st.dir; if (A.hatHit) st.flick = 1; st.flick *= 0.7;
      const amp = (5 + 4 * A.bands[1]) * S + 24 * S * st.sep, ang = t * 0.6 * st.dir, dx = Math.cos(ang) * amp, dy = Math.sin(ang * 0.7) * amp * 0.6;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.save(); c.filter = 'brightness(0.3) saturate(0.6)'; c.drawImage(st.base, 0, 0, W, H); c.restore(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      for (let L = 0; L < N; L++) { const k = L - (N - 1) / 2, sc = 1 + 0.012 * k * (1 + 2 * st.sep); c.save(); c.translate(W / 2 + dx * k, H / 2 + dy * k); c.scale(sc, sc); c.globalAlpha = L === N - 1 ? 1 - 0.5 * st.flick : 1; c.drawImage(st.layers[L], -W / 2, -H / 2, W, H); c.restore(); }
      if (st.sep > 0.15) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25 * st.sep; c.filter = 'hue-rotate(180deg)'; c.drawImage(st.layers[N - 1], dx * (N - 1) / 2 * 1.6, dy * (N - 1) / 2 * 1.6, W, H); c.restore(); }
      const vg = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 12 * S; E.header(c, '#fff', 'rgba(255,255,255,0.6)'); c.restore();
    },
  });
})();
