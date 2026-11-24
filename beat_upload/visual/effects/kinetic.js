/* Kinetic Type: the title set in rows that fill the frame and slide left and right in time, the
 * letters of every other row cut out of the cover, the rest outlined. Black, one acid colour on
 * the kick, nothing else. */
(function () {
  'use strict';
  const BG = '#050505', ACID = '#d4ff00', LINE = 'rgba(255,255,255,0.85)';
  const st = { rows: [], text: '', stamp: '', mask: null };
  function build(E) {
    const { W, H, S, meta } = E, yt = E.FMT === 'yt', n = yt ? 4 : 7, top = (yt ? 150 : 250) * S, rh = (H - top - 20 * S) / n;
    st.text = (meta.title || 'UNTITLED').toUpperCase() + '   ';
    st.rows = []; for (let i = 0; i < n; i++) st.rows.push({ y: top + i * rh, h: rh, dir: i % 2 ? 1 : -1, speed: 0.6 + (i % 3) * 0.3, fill: i % 2 === 0, off: Math.random() });
    st.mask = E.mkCanvas(W, Math.ceil(rh)); st.stamp = meta.title + '|' + E.FMT + '|' + W;
  }
  BeatVisual.register({
    id: 'kinetic', name: 'Kinetic Type', fam: 'type',
    blurb: 'Название строками во весь кадр, строки едут влево-вправо в темпе; буквы через строку вырезаны из обложки, остальные контуром. На кике залитые строки вспыхивают кислотным. Чёрный фон, один цвет.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S, meta } = E; if (st.stamp !== meta.title + '|' + E.FMT + '|' + W) build(E);
      c.fillStyle = BG; c.fillRect(0, 0, W, H);
      const cv = E.cover.src, sc = Math.max(W / cv.width, H / cv.height), cw = cv.width * sc, ch = cv.height * sc, cx = (W - cw) / 2, cy = (H - ch) / 2;
      const beats = A.playing ? A.beats : A.t * 1.8, hot = A.kick > 0.55, mg = st.mask.getContext('2d');
      for (const r of st.rows) {
        const size = r.h * 1.1, font = '400 ' + size + 'px "League Gothic"'; c.font = font; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
        const per = Math.max(1, c.measureText(st.text).width), x0 = -(((beats * r.speed * 0.22 * W * r.dir + r.off * per) % per) + per) % per, by = r.h * 0.9;
        if (r.fill) {
          mg.clearRect(0, 0, W, st.mask.height); mg.globalCompositeOperation = 'source-over'; mg.font = font; mg.textBaseline = 'alphabetic'; mg.textAlign = 'left'; mg.fillStyle = '#fff';
          for (let x = x0 - per; x < W + per; x += per) mg.fillText(st.text, x, by);
          mg.globalCompositeOperation = 'source-in';
          if (hot) { mg.fillStyle = ACID; mg.fillRect(0, 0, W, st.mask.height); } else mg.drawImage(cv, cx, cy - r.y, cw, ch);
          c.drawImage(st.mask, 0, r.y);
        } else {
          c.strokeStyle = hot ? ACID : LINE; c.lineWidth = 1.5 * S;
          for (let x = x0 - per; x < W + per; x += per) c.strokeText(st.text, x, r.y + by);
        }
      }
      // the facts at the top in mono: who, BPM and key left, the title small on the right
      c.fillStyle = ACID; c.font = '600 ' + 14 * S + 'px "IBM Plex Mono"'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      const who = (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT'), facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  ');
      const ty = (E.FMT === 'yt' ? 96 : 180) * S; c.fillText(who, 28 * S, ty); if (facts) c.fillText(facts, 28 * S, ty + 22 * S);
      c.textAlign = 'right'; c.fillText('"' + meta.title.toUpperCase() + '"', W - 28 * S, ty);
    },
  });
})();
