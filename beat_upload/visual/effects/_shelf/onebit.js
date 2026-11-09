/* 1-bit: the cover dithered into two colours with a Bayer matrix, chunky cells, a bitmap-era
 * screen. The snare moves the threshold, the kick swaps ink and paper for a moment. */
(function () {
  'use strict';
  const INK = [26, 26, 46], PAPER = [232, 228, 216]; // navy on cream
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const st = { grey: null, cols: 0, rows: 0, img: null, low: null, key: '' };
  function prep(E) {
    const { W, H, S } = E, cell = 3 * S, cols = Math.round(W / cell), rows = Math.round(H / cell);
    const t = E.mkCanvas(cols, rows), g = t.getContext('2d'); const cv = E.cover.src, sc = Math.max(cols / cv.width, rows / cv.height), cw = cv.width * sc, ch = cv.height * sc;
    g.fillStyle = '#000'; g.fillRect(0, 0, cols, rows); g.drawImage(cv, (cols - cw) / 2, (rows - ch) / 2, cw, ch);
    st.grey = E.greyLevels(g, cols, rows); st.cols = cols; st.rows = rows; st.low = t; st.img = g.createImageData(cols, rows); st.key = E.cover.version + '|' + W;
  }
  BeatVisual.register({
    id: 'onebit', name: '1-bit', fam: 'retro',
    blurb: 'Обложка в два цвета ордерным дизерингом, крупная клетка, экран первого Макинтоша. Снэр сдвигает порог (картинка то выгорает, то темнеет), кик на миг меняет чернила и бумагу местами.',
    init(E) { prep(E); },
    draw(c, A, E) {
      const { W, H, S, meta } = E; if (st.key !== E.cover.version + '|' + W) prep(E);
      const inv = A.kick > 0.6, shift = (A.snare - 0.25) * 90, d = st.img.data, g = st.grey, n = st.cols * st.rows, cols = st.cols;
      const a = inv ? PAPER : INK, b = inv ? INK : PAPER;
      for (let i = 0; i < n; i++) {
        const x = i % cols, y = (i / cols) | 0, th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 * 255;
        const on = g[i] + shift < th, rgb = on ? a : b; d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255;
      }
      st.low.getContext('2d').putImageData(st.img, 0, 0);
      c.imageSmoothingEnabled = false; c.drawImage(st.low, 0, 0, W, H); c.imageSmoothingEnabled = true;
      // the header on a paper strip, like a window title bar
      const fg = `rgb(${a.join(',')})`, bg = `rgb(${b.join(',')})`, yt = E.FMT === 'yt', y0 = (yt ? 56 : 130) * S, hh = (yt ? 100 : 118) * S;
      c.fillStyle = bg; c.fillRect(0, y0, W, hh); c.fillStyle = fg; c.fillRect(0, y0, W, 2 * S); c.fillRect(0, y0 + hh - 2 * S, W, 2 * S);
      for (let i = 0; i < 5; i++) c.fillRect(0, y0 + 10 * S + i * 5 * S, W, 1 * S);
      c.fillStyle = bg; const title = meta.title.toUpperCase(); c.font = '400 ' + 64 * S + 'px "League Gothic"'; const tw = c.measureText(title).width + 32 * S; c.fillRect((W - tw) / 2, y0 + 6 * S, tw, 34 * S);
      E.gothic(c, title, W / 2, y0 + 70 * S, 64 * S, fg, 'center');
      const who = (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT'), facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  ');
      E.mono(c, who + (facts ? '  ·  ' + facts : ''), W / 2, y0 + hh - 14 * S, 13 * S, fg, 'center');
    },
  });
})();
