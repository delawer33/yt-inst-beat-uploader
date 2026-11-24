/* Collage: the cover torn into paper strips on a sheet of coloured paper, white torn edges,
 * shadows; the kick pushes the strips apart, the snare re-pastes one. The title in cut-out letters. */
(function () {
  'use strict';
  const SHEETS = ['#ff6b35', '#2d5bff', '#ffd23f', '#1b1b1b', '#e9e2d3', '#2e8b57', '#c2185b'];
  const st = { sheet: SHEETS[0], strips: [], letters: [], key: '' };
  function edge(n, amp) { const a = []; for (let i = 0; i <= n; i++) a.push((Math.random() - 0.5) * amp); return a; }
  function build(E) {
    const { W, H, S } = E, yt = E.FMT === 'yt', n = 6, size = yt ? H * 0.78 : W * 0.86, x0 = yt ? W * 0.56 - size / 2 : (W - size) / 2, y0 = yt ? (H - size) / 2 : H * 0.5 - size / 2;
    st.sheet = SHEETS[Math.floor(Math.random() * SHEETS.length)]; st.strips = [];
    for (let i = 0; i < n; i++) st.strips.push({ i, x0, y: y0 + i * size / n, h: size / n, size, base: (Math.random() - 0.5) * 36 * S, dir: i % 2 ? 1 : -1, top: edge(22, 7 * S), bot: edge(22, 7 * S), rot: (Math.random() - 0.5) * 0.03 });
    st.letters = []; for (const ch of (E.meta.title || '').toUpperCase()) st.letters.push({ ch, rot: (Math.random() - 0.5) * 0.25, style: Math.floor(Math.random() * 3), dy: (Math.random() - 0.5) * 8 * S });
    st.key = E.cover.version + '|' + E.meta.title + '|' + W;
  }
  function strip(c, s, E) {
    const { S } = E, n = s.top.length - 1, cv = E.cover.src, k = Math.max(s.size / cv.width, s.size / cv.height), sw = s.size / k, sh = s.size / k, sx = (cv.width - sw) / 2, sy = (cv.height - sh) / 2;
    const path = () => { c.beginPath(); for (let i = 0; i <= n; i++) c.lineTo(s.x0 + i / n * s.size, s.y + s.top[i]); for (let i = n; i >= 0; i--) c.lineTo(s.x0 + i / n * s.size, s.y + s.h + s.bot[i]); c.closePath(); };
    c.save(); c.translate(s.x0 + s.size / 2, s.y + s.h / 2); c.rotate(s.rot); c.translate(-s.x0 - s.size / 2, -s.y - s.h / 2);
    c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 14 * S; c.shadowOffsetY = 6 * S; path(); c.fillStyle = '#fff'; c.lineWidth = 7 * S; c.strokeStyle = '#fff'; c.lineJoin = 'round'; c.stroke(); c.fill(); c.shadowColor = 'transparent';
    path(); c.clip(); c.drawImage(cv, sx, sy, sw, sh, s.x0, s.y - s.i * s.h, s.size, s.size); c.restore();
  }
  BeatVisual.register({
    id: 'collage', name: 'Collage', fam: 'paper',
    blurb: 'Обложка разорвана на бумажные полосы с белыми рваными краями и лежит на листе цветной бумаги. Кик раздвигает полосы в стороны, снэр переклеивает одну. Название — вырезанные буквы, факты — на скотче.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt'; if (st.key !== E.cover.version + '|' + meta.title + '|' + W) build(E);
      c.fillStyle = st.sheet; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'snare') { const s = st.strips[Math.floor(Math.random() * st.strips.length)]; s.base = (Math.random() - 0.5) * 60 * S; s.rot = (Math.random() - 0.5) * 0.05; }
      for (const s of st.strips) { const dx = s.base + s.dir * A.kick * 26 * S; c.save(); c.translate(dx, 0); strip(c, s, E); c.restore(); }
      // cut-out letters
      let x = 28 * S, y = (yt ? 110 : 160) * S; const fs = (yt ? 64 : 58) * S; c.font = '400 ' + fs + 'px "League Gothic"';
      for (const L of st.letters) { if (L.ch === ' ') { x += fs * 0.3; continue; } const w = c.measureText(L.ch).width + 12 * S; if (x + w > W - 20 * S) { x = 28 * S; y += fs * 1.05; }
        c.save(); c.translate(x + w / 2, y - fs * 0.36 + L.dy); c.rotate(L.rot); c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 6 * S; c.shadowOffsetY = 3 * S;
        c.fillStyle = ['#fff', '#111', '#ffd23f'][L.style]; c.fillRect(-w / 2, -fs * 0.5, w, fs * 0.98); c.shadowColor = 'transparent'; c.font = '400 ' + fs + 'px "League Gothic"'; E.gothic(c, L.ch, 0, fs * 0.36, fs, L.style === 1 ? '#fff' : '#111', 'center'); c.restore(); x += w + 3 * S; }
      // the tape with the facts
      const who = (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT'), facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join(' · '), cap = who + (facts ? '  ·  ' + facts : '');
      c.font = '600 ' + 13 * S + 'px "IBM Plex Mono"'; const tw = c.measureText(cap).width + 36 * S, ty = y + 26 * S; c.save(); c.translate(24 * S + tw / 2, ty); c.rotate(-0.025); c.fillStyle = 'rgba(255,245,200,0.82)'; c.fillRect(-tw / 2, -14 * S, tw, 28 * S); E.mono(c, cap, 0, 5 * S, 13 * S, '#1b1b1b', 'center'); c.restore();
    },
  });
})();
