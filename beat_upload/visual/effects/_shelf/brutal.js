/* Neo-brutalism: flat tiles with thick black strokes and hard offset shadows, each word in its
 * own tile, the cover in the big one. The kick throws the shadows further, the snare recolours a
 * tile, every bar the tiles re-flow. */
(function () {
  'use strict';
  const INKS = ['#fdee00', '#e0b0ff', '#00ffff', '#ffffff', '#ff6b6b', '#7CFC00'];
  const st = { tiles: [], layout: 0, cols: [] };
  function build(E) {
    const { W, H, S } = E, yt = E.FMT === 'yt', m = 22 * S, g = 14 * S, iw = W - 2 * m, top = (yt ? 40 : 120) * S, ih = H - top - (yt ? 40 : 60) * S;
    const L = st.layout % 2, t = [];
    if (yt) { const cw = iw * 0.42; if (L === 0) { t.push({ k: 'cover', x: m, y: top, w: cw, h: ih }); t.push({ k: 'title', x: m + cw + g, y: top, w: iw - cw - g, h: ih * 0.5 }); t.push({ k: 'who', x: m + cw + g, y: top + ih * 0.5 + g, w: (iw - cw - g) * 0.6 - g, h: ih * 0.5 - g }); t.push({ k: 'bpm', x: m + cw + g + (iw - cw - g) * 0.6, y: top + ih * 0.5 + g, w: (iw - cw - g) * 0.4, h: (ih * 0.5 - g) / 2 - g / 2 }); t.push({ k: 'key', x: m + cw + g + (iw - cw - g) * 0.6, y: top + ih * 0.75 + g / 2, w: (iw - cw - g) * 0.4, h: (ih * 0.5 - g) / 2 - g / 2 }); }
      else { t.push({ k: 'title', x: m, y: top, w: iw, h: ih * 0.3 }); t.push({ k: 'cover', x: m + iw * 0.58, y: top + ih * 0.3 + g, w: iw * 0.42, h: ih * 0.7 - g }); t.push({ k: 'who', x: m, y: top + ih * 0.3 + g, w: iw * 0.58 - g, h: ih * 0.3 }); t.push({ k: 'bpm', x: m, y: top + ih * 0.6 + 2 * g, w: (iw * 0.58 - 2 * g) / 2, h: ih * 0.4 - 2 * g }); t.push({ k: 'key', x: m + (iw * 0.58) / 2, y: top + ih * 0.6 + 2 * g, w: (iw * 0.58 - 2 * g) / 2, h: ih * 0.4 - 2 * g }); } }
    else if (L === 0) { t.push({ k: 'title', x: m, y: top, w: iw, h: ih * 0.22 }); t.push({ k: 'cover', x: m, y: top + ih * 0.22 + g, w: iw, h: ih * 0.52 - g }); t.push({ k: 'who', x: m, y: top + ih * 0.74 + g, w: iw * 0.56 - g, h: ih * 0.26 - g }); t.push({ k: 'bpm', x: m + iw * 0.56, y: top + ih * 0.74 + g, w: iw * 0.44, h: (ih * 0.26 - 2 * g) / 2 }); t.push({ k: 'key', x: m + iw * 0.56, y: top + ih * 0.87 + g / 2, w: iw * 0.44, h: (ih * 0.26 - 2 * g) / 2 }); }
    else { t.push({ k: 'cover', x: m, y: top, w: iw * 0.62 - g, h: ih * 0.45 }); t.push({ k: 'bpm', x: m + iw * 0.62, y: top, w: iw * 0.38, h: ih * 0.22 - g }); t.push({ k: 'key', x: m + iw * 0.62, y: top + ih * 0.22, w: iw * 0.38, h: ih * 0.23 }); t.push({ k: 'title', x: m, y: top + ih * 0.45 + g, w: iw, h: ih * 0.3 }); t.push({ k: 'who', x: m, y: top + ih * 0.75 + 2 * g, w: iw, h: ih * 0.25 - 2 * g }); }
    if (!st.cols.length) st.cols = ['title', 'who', 'bpm', 'key'].map((_, i) => INKS[i % INKS.length]);
    st.tiles = t; st.key = E.FMT + '|' + W;
  }
  BeatVisual.register({
    id: 'brutal', name: 'Neo-brutal', fam: 'poster',
    blurb: 'Плоские плитки с толстой чёрной обводкой и жёсткой смещённой тенью: обложка в большой, каждое слово в своей. Кик отбрасывает тени дальше, снэр перекрашивает плитку, каждый такт плитки перестраиваются.',
    init(E) { st.layout = 0; st.cols = []; build(E); },
    draw(c, A, E) {
      const { W, H, S, meta } = E; if (st.key !== E.FMT + '|' + W) build(E);
      c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, W, H);
      if (A.barHit && A.playing) { st.layout++; build(E); } if (A.cut && A.cutKind === 'snare') { const i = Math.floor(Math.random() * 4); st.cols[i] = INKS[Math.floor(Math.random() * INKS.length)]; }
      const off = (7 + 9 * A.kick) * S, lw = 3.5 * S, texts = { title: meta.title.toUpperCase(), who: meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', bpm: meta.bpm ? meta.bpm + ' BPM' : '— BPM', key: meta.key ? meta.key.toUpperCase() : '—' };
      st.tiles.forEach(t => {
        c.fillStyle = '#000'; c.fillRect(t.x + off, t.y + off, t.w, t.h);
        if (t.k === 'cover') { const cv = E.cover.src, k = Math.max(t.w / cv.width, t.h / cv.height); c.drawImage(cv, (cv.width - t.w / k) / 2, (cv.height - t.h / k) / 2, t.w / k, t.h / k, t.x, t.y, t.w, t.h); }
        else { const ci = ['title', 'who', 'bpm', 'key'].indexOf(t.k); c.fillStyle = st.cols[ci]; c.fillRect(t.x, t.y, t.w, t.h); const txt = texts[t.k], pad = 14 * S; let fs = t.h * 0.72; c.font = '400 ' + fs + 'px "League Gothic"'; const tw = c.measureText(txt).width; if (tw > t.w - 2 * pad) fs *= (t.w - 2 * pad) / tw; E.gothic(c, txt, t.x + pad, t.y + t.h / 2 + fs * 0.34, fs, '#000'); }
        c.lineWidth = lw; c.strokeStyle = '#000'; c.strokeRect(t.x, t.y, t.w, t.h);
      });
    },
  });
})();
