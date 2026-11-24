/* Chrome: the title in liquid Y2K chrome under the cover on a wet black floor. The chrome
 * horizon wobbles with the bass, letters bounce on the kick and settle like springs, a light
 * sweep runs across the letters every bar, a coloured glow from the cover's hue underneath. */
(function () {
  'use strict';
  const st = { letters: [], key: '', sweep: 2, glow: 'hsl(200,90%,60%)' };
  function tone(E) { const t = E.mkCanvas(16, 16), g = t.getContext('2d'); g.drawImage(E.cover.src, 0, 0, 16, 16); const d = g.getImageData(0, 0, 16, 16).data; let best = 0.55, bs = -1; for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); if (s > bs && mx !== mn) { bs = s; let h = mx === r ? (gg - b) / (mx - mn) + (gg < b ? 6 : 0) : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4; best = h / 6; } } return `hsl(${Math.round(best * 360)},90%,60%)`; }
  function build(E) { st.letters = [...E.meta.title.toUpperCase()].map(ch => ({ ch, y: 0, v: 0 })); st.glow = tone(E); st.key = E.meta.title + '|' + E.cover.version + '|' + E.W; }
  BeatVisual.register({
    id: 'chrome', name: 'Chrome', fam: 'liquid',
    blurb: 'Название жидким хромом Y2K под обложкой на мокром чёрном полу. Горизонт в хроме плывёт от баса, буквы подпрыгивают на кике и успокаиваются как пружины, каждый такт по буквам пробегает блик, снизу цветное свечение в тоне обложки.',
    init(E) { build(E); st.sweep = 2; },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt'; if (st.key !== meta.title + '|' + E.cover.version + '|' + W) build(E); const t = A.t;
      const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#15161d'); bg.addColorStop(1, '#030305'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
      const cs = yt ? H * 0.56 : W * 0.54, ccx = yt ? W * 0.24 : W / 2, ccy = yt ? H * 0.47 : H * 0.36, cv = E.cover.src, k = Math.max(cs / cv.width, cs / cv.height), sx = (cv.width - cs / k) / 2, sy = (cv.height - cs / k) / 2;
      // floor glow, the cover and its wet reflection
      c.save(); c.translate(ccx, ccy + cs / 2); c.scale(1, 0.25); const fg = c.createRadialGradient(0, 0, 0, 0, 0, cs * 0.9); fg.addColorStop(0, st.glow.replace('hsl', 'hsla').replace(')', `,${0.35 + 0.25 * A.kick})`)); fg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = fg; c.fillRect(-W, -H, 2 * W, 2 * H); c.restore();
      c.save(); c.globalAlpha = 0.28; c.translate(0, 2 * (ccy + cs / 2) + 4 * S); c.scale(1, -1); c.drawImage(cv, sx, sy, cs / k, cs / k, ccx - cs / 2, ccy - cs / 2, cs, cs); c.restore();
      const fade = c.createLinearGradient(0, ccy + cs / 2, 0, ccy + cs / 2 + cs * 0.5); fade.addColorStop(0, 'rgba(8,8,12,0.35)'); fade.addColorStop(1, 'rgba(8,8,12,1)'); c.fillStyle = fade; c.fillRect(0, ccy + cs / 2, W, cs * 0.5 + 1);
      c.drawImage(cv, sx, sy, cs / k, cs / k, ccx - cs / 2, ccy - cs / 2, cs, cs);
      // the letters
      if (A.cut && A.cutKind === 'kick') for (let n = 0; n < 3; n++) { const L = st.letters[Math.floor(Math.random() * st.letters.length)]; L.v -= (16 + 14 * Math.random()) * S; }
      if (A.barHit && A.playing) st.sweep = 0; st.sweep += 1 / 45;
      const title = st.letters.map(l => l.ch).join(''), maxW = yt ? W * 0.5 : W * 0.92; c.font = '400 100px "League Gothic"'; const w100 = Math.max(1, c.measureText(title).width), fs = Math.min(100 * maxW / w100, (yt ? 0.36 : 0.22) * H), x0 = yt ? W * 0.72 - fs * w100 / 200 : (W - fs * w100 / 100) / 2, base = yt ? H * 0.6 : H * 0.69;
      c.font = '400 ' + fs + 'px "League Gothic"'; c.textBaseline = 'alphabetic'; c.textAlign = 'left'; let x = x0; const cap = fs * 0.72, totalW = fs * w100 / 100, sweepX = x0 + (st.sweep - 0.3) * totalW * 1.4;
      c.save(); c.shadowColor = st.glow; c.shadowBlur = 30 * S; c.fillStyle = st.glow; c.globalAlpha = 0.55; for (const L of st.letters) { c.fillText(L.ch, x, base + L.y); x += c.measureText(L.ch).width; } c.restore(); x = x0;
      st.letters.forEach((L, i) => {
        L.v = (L.v - L.y * 0.18) * 0.8; L.y += L.v; const yy = base + L.y + Math.sin(t * 2.2 + i * 0.7) * 2.5 * S, top = yy - cap, hz = 0.5 + 0.07 * Math.sin(t * 1.6 + i * 0.5) + 0.12 * A.bands[1];
        const g = c.createLinearGradient(0, top, 0, yy); g.addColorStop(0, '#fbfdff'); g.addColorStop(Math.max(0.01, hz - 0.03), '#9aa6bd'); g.addColorStop(hz, '#0d1118'); g.addColorStop(Math.min(0.99, hz + 0.03), '#e3ebf5'); g.addColorStop(1, '#505a6b');
        c.fillStyle = g; c.fillText(L.ch, x, yy); c.lineWidth = 1.2 * S; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.strokeText(L.ch, x, yy);
        const w = c.measureText(L.ch).width; if (st.sweep < 1.2) { const sg = c.createLinearGradient(sweepX - totalW * 0.18, 0, sweepX + totalW * 0.18, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.75)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sg; c.fillText(L.ch, x, yy); }
        x += w;
      });
      const who = meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  ');
      E.mono(c, who, 30 * S, (yt ? 60 : 150) * S, 13 * S, 'rgba(255,255,255,0.8)'); if (facts) E.mono(c, facts, 30 * S, (yt ? 82 : 172) * S, 13 * S, 'rgba(255,255,255,0.5)');
    },
  });
})();
