/* Quietly Loud: a neutral sheet, one word set so large the frame crops it, the cover under it.
 * Where the word crosses the cover it inverts the picture. Every bar the word changes by
 * sliding up and the next one slides in from below; the word sways slowly, the kick stretches
 * it and it springs back, the snare moves the accent bar to another edge. */
(function () {
  'use strict';
  const PAPER = '#ecebe6', ACC = '#2b2bff';
  const st = { words: [], i: 0, t0: -9, sx: 1, sv: 0, bar: 0, barX: 0, barY: 0 };
  function build(E) { const m = E.meta; st.words = [...m.title.toUpperCase().split(/\s+/).filter(Boolean), ...(m.artists ? m.artists.toUpperCase().split(/\s+x\s+|\s*,\s*/i).filter(Boolean) : []), m.bpm ? m.bpm + '' : null, m.key ? m.key.toUpperCase() : null].filter(Boolean); st.i = 0; st.t0 = -9; }
  function word(c, E, w, x, y, maxFs) { c.font = '400 100px "League Gothic"'; const w100 = Math.max(1, c.measureText(w).width), fs = Math.min(100 * (E.W * 1.3) / w100, maxFs); c.save(); c.translate(x, y); c.scale(st.sx, 1); c.font = '400 ' + fs + 'px "League Gothic"'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = '#fff'; c.fillText(w, 0, fs * 0.36); c.restore(); }
  BeatVisual.register({
    id: 'quiet', name: 'Quietly Loud', fam: 'poster',
    blurb: 'Нейтральный лист, одно слово так крупно, что кадр его обрезает, под ним обложка: там, где слово ложится на картинку, оно её инвертирует. Каждый такт слово уезжает вверх и снизу въезжает следующее (название, артисты, BPM, тональность); слово медленно качается, кик растягивает его и оно пружинит назад, снэр переставляет синюю полосу.',
    init(E) { build(E); st.sx = 1; st.sv = 0; },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt'; if (!st.words.length) build(E); const t = A.t;
      c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
      if (A.barHit && A.playing && t - st.t0 > 0.6) { st.i = (st.i + 1) % st.words.length; st.t0 = t; }
      if (A.cut && A.cutKind === 'kick') st.sx = 1.09; st.sv = (st.sv + (1 - st.sx) * 0.22) * 0.72; st.sx += st.sv;
      if (A.snareHit) st.bar = (st.bar + 1 + Math.floor(Math.random() * 2)) % 4;
      // the cover, top right in the Reel, left in YouTube
      const cs = yt ? H * 0.62 : W * 0.6, cx = yt ? W * 0.07 : W - cs - 26 * S, cy = yt ? (H - cs) / 2 : H * 0.3, cv = E.cover.src, k = Math.max(cs / cv.width, cs / cv.height);
      c.drawImage(cv, (cv.width - cs / k) / 2, (cv.height - cs / k) / 2, cs / k, cs / k, cx, cy, cs, cs);
      // the words: white in 'difference' reads as ink on paper and as a negative over the cover
      const p = E.clamp((t - st.t0) / 0.5, 0, 1), e = 1 - Math.pow(1 - p, 3), wx = W * 0.5 + Math.sin(t * 0.22) * W * 0.1, wy = yt ? H * 0.66 : H * 0.7, maxFs = yt ? H * 0.72 : H * 0.5, lift = H * 0.55;
      c.save(); c.globalCompositeOperation = 'difference';
      if (p < 1) word(c, E, st.words[(st.i + st.words.length - 1) % st.words.length], wx, wy - e * lift, maxFs);
      word(c, E, st.words[st.i], wx, wy + (1 - e) * lift, maxFs); c.restore();
      // the accent bar eases to one of four homes
      const homes = yt ? [[W * 0.5, 44 * S], [W * 0.5, H - 44 * S], [W - 40 * S, H * 0.5], [W * 0.5, H * 0.5]] : [[W * 0.5, H * 0.14], [40 * S, H * 0.5], [W - 40 * S, H * 0.64], [W * 0.5, H * 0.9]];
      const vert = st.bar === 1 || st.bar === 2, [hx, hy] = homes[st.bar]; st.barX += (hx - st.barX) * 0.12; st.barY += (hy - st.barY) * 0.12; const bl = (yt ? W : H) * 0.26, bw = 9 * S;
      c.fillStyle = ACC; if (vert) c.fillRect(st.barX - bw / 2, st.barY - bl / 2, bw, bl); else c.fillRect(st.barX - bl / 2, st.barY - bw / 2, bl, bw);
      const who = meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '), INK = '#111';
      E.mono(c, '"' + meta.title.toUpperCase() + '"', 28 * S, (yt ? 56 : 150) * S, 13 * S, INK); E.mono(c, who, 28 * S, (yt ? 78 : 172) * S, 13 * S, INK); if (facts) E.mono(c, facts, 28 * S, (yt ? 100 : 194) * S, 13 * S, 'rgba(17,17,17,0.55)');
    },
  });
})();
