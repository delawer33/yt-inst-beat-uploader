/* Sleeve: the cover as a record sleeve standing in a light studio; every bar it turns over,
 * the back carries the title, the artists and the facts like a tracklist. The kick lifts it. */
(function () {
  'use strict';
  const st = { ang: 0, from: 0, to: 0, t0: -9 };
  function back(E) {
    const key = 'sleeveBack' + E.meta.title + E.meta.artists + E.meta.bpm + E.meta.key + E.W; if (E.cover.cache.has(key)) return E.cover.cache.get(key);
    const { S } = E, D = 540 * S, c = E.mkCanvas(D, D), g = c.getContext('2d'); g.fillStyle = '#f3efe6'; g.fillRect(0, 0, D, D); g.fillStyle = '#111'; g.fillRect(0, 0, 26 * S, D);
    E.gothic(g, 'SIDE A', 60 * S, 70 * S, 30 * S, '#111'); E.mono(g, E.meta.artists ? E.meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 60 * S, 100 * S, 13 * S, '#444');
    const title = E.meta.title.toUpperCase(); g.font = '400 ' + 120 * S + 'px "League Gothic"'; const tw = g.measureText(title).width, fs = tw > D - 100 * S ? 120 * S * (D - 100 * S) / tw : 120 * S; E.gothic(g, title, 60 * S, 260 * S, fs, '#111');
    const facts = [['BPM', E.meta.bpm || '—'], ['KEY', E.meta.key ? E.meta.key.toUpperCase() : '—'], ['LENGTH', '—'], ['YEAR', String(new Date().getFullYear())]]; let y = 330 * S;
    for (const [k, v] of facts) { E.mono(g, k, 60 * S, y, 13 * S, '#444'); E.mono(g, String(v), D - 50 * S, y, 13 * S, '#111', 'right'); g.fillStyle = '#bbb'; g.fillRect(60 * S, y + 8 * S, D - 110 * S, 1 * S); y += 32 * S; }
    g.fillStyle = '#111'; for (let i = 0; i < 40; i++) g.fillRect(60 * S + i * 4 * S, D - 80 * S, (i % 3 ? 1.2 : 2.4) * S, 34 * S);
    E.cover.cache.set(key, c); return c;
  }
  BeatVisual.register({
    id: 'sleeve', name: 'Sleeve', fam: 'object',
    blurb: 'Обложка — конверт пластинки в светлой студии; каждый такт он переворачивается, на обороте — название, артисты и факты, как треклист. Кик чуть приподнимает конверт.',
    init() { st.ang = 0; st.from = 0; st.to = 0; st.t0 = -9; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt';
      const bg = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.8); bg.addColorStop(0, '#f2f2f4'); bg.addColorStop(1, '#cfcfd6'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
      if (A.barHit && A.playing) { st.from = st.to; st.to += Math.PI; st.t0 = A.t; }
      const p = E.clamp((A.t - st.t0) / 0.5, 0, 1), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; st.ang = st.from + (st.to - st.from) * e;
      const size = yt ? H * 0.66 : W * 0.78, cx = yt ? W * 0.62 : W / 2, cy = yt ? H / 2 : H * 0.5 - 20 * S, cs = Math.cos(st.ang), sn = Math.sin(st.ang), lift = 1 + 0.02 * A.kick;
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(cx, cy + size / 2 + 26 * S, size * 0.48 * Math.abs(cs) + size * 0.06, 14 * S, 0, 0, 6.2832); c.fill();
      c.save(); c.translate(cx, cy); c.scale(lift, lift); c.transform(cs, 0.12 * sn, 0, 1, 0, 0);
      const front = cs >= 0, img = front ? E.cover.src : back(E), k = Math.max(size / img.width, size / img.height);
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 30 * S; c.shadowOffsetY = 12 * S; c.fillStyle = '#eee'; c.fillRect(-size / 2, -size / 2, size, size); c.shadowColor = 'transparent';
      if (!front) { c.scale(-1, 1); } c.drawImage(img, (img.width - size / k) / 2, (img.height - size / k) / 2, size / k, size / k, -size / 2, -size / 2, size, size);
      c.fillStyle = 'rgba(0,0,0,' + (0.35 * Math.abs(sn)).toFixed(3) + ')'; c.fillRect(-size / 2, -size / 2, size, size); c.restore();
      E.header(c, '#111', 'rgba(17,17,17,0.7)');
    },
  });
})();
