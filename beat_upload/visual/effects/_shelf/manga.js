/* Manga: the cover as one panel on white paper, inked grey; speed lines burst from behind it on
 * the kick; the snare tilts the panel. The title shouts from a jagged balloon. */
(function () {
  'use strict';
  const PAPER = '#f7f5f0', INK = '#111';
  const st = { lines: [], tilt: -0.035, tiltTo: -0.035, tone: null };
  function roll() { st.lines = []; for (let i = 0; i < 110; i++) st.lines.push({ a: Math.random() * 6.2832, len: 0.4 + Math.random() * 0.6, w: 0.6 + Math.random() * 2.2 }); }
  function tone(E) { const { S } = E, cell = 7 * S, c = E.mkCanvas(cell, cell), g = c.getContext('2d'); g.fillStyle = INK; g.beginPath(); g.arc(cell / 2, cell / 2, 1.4 * S, 0, 6.2832); g.fill(); return c; }
  function burst(c, x, y, w, h, text, E) { // a jagged balloon around text at (x, y) top-left
    const { S } = E, n = 18, rx = w / 2 + 26 * S, ry = h / 2 + 18 * S, cx = x + w / 2, cy = y + h / 2; c.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * 6.2832, k = i % 2 ? 1 : 1.28 + ((i * 7) % 3) * 0.06; const px = cx + Math.cos(a) * rx * k, py = cy + Math.sin(a) * ry * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
    c.closePath(); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3 * S; c.strokeStyle = INK; c.lineJoin = 'miter'; c.stroke();
    E.gothic(c, text, cx, cy + h * 0.36, h, INK, 'center');
  }
  BeatVisual.register({
    id: 'manga', name: 'Manga', fam: 'comic',
    blurb: 'Обложка — одна панель на белой бумаге, в сером туше; из-за панели на кике вырываются линии скорости, снэр наклоняет панель в другую сторону. Название кричит из зубчатого пузыря, под ним чёрная плашка с фактами.',
    init(E) { roll(); st.tone = tone(E); },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt';
      c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') roll(); if (A.cut && A.cutKind === 'snare') st.tiltTo = -st.tiltTo; st.tilt += (st.tiltTo - st.tilt) * 0.3;
      const size = yt ? H * 0.72 : W * 0.84, cx = yt ? W * 0.62 : W / 2, cy = yt ? H / 2 : H * 0.52;
      // speed lines: thin black triangles from behind the panel to the frame edge, fading with the kick
      if (A.kick > 0.03) { c.save(); c.globalAlpha = Math.min(1, A.kick * 1.3); c.fillStyle = INK; const R = Math.hypot(W, H), r0 = size * 0.6;
        for (const l of st.lines) { const cs = Math.cos(l.a), sn = Math.sin(l.a), r1 = r0 + (R - r0) * l.len, hw = l.w * S; c.beginPath(); c.moveTo(cx + cs * r1, cy + sn * r1); c.lineTo(cx + cs * r0 - sn * hw, cy + sn * r0 + cs * hw); c.lineTo(cx + cs * r0 + sn * hw, cy + sn * r0 - cs * hw); c.closePath(); c.fill(); }
        c.restore(); }
      // the screentone shadow, then the panel
      c.save(); c.translate(cx, cy); c.rotate(st.tilt); const pt = c.createPattern(st.tone, 'repeat'); c.fillStyle = pt; c.fillRect(-size / 2 + 18 * S, -size / 2 + 18 * S, size, size);
      c.fillStyle = '#fff'; c.fillRect(-size / 2, -size / 2, size, size); const cv = E.cover.src, k = Math.max(size / cv.width, size / cv.height);
      c.filter = 'grayscale(1) contrast(1.3)'; c.drawImage(cv, (cv.width - size / k) / 2, (cv.height - size / k) / 2, size / k, size / k, -size / 2, -size / 2, size, size); c.filter = 'none';
      c.lineWidth = 6 * S; c.strokeStyle = INK; c.strokeRect(-size / 2, -size / 2, size, size); c.restore();
      // the balloon with the title, the caption box with the facts
      const title = meta.title.toUpperCase(), th = (yt ? 64 : 60) * S; c.font = '400 ' + th + 'px "League Gothic"'; const tw = Math.min(c.measureText(title).width, W * 0.6), fs = th * tw / Math.max(1, c.measureText(title).width);
      c.font = '400 ' + fs + 'px "League Gothic"'; burst(c, 40 * S, (yt ? 60 : 130) * S, tw, fs, title, E);
      const who = (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT'), facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join(' · ');
      c.font = '600 ' + 13 * S + 'px "IBM Plex Mono"'; const cap = who + (facts ? '   ' + facts : ''), cw = c.measureText(cap).width + 24 * S, cy0 = (yt ? 60 : 130) * S + fs + 36 * S;
      c.fillStyle = INK; c.fillRect(24 * S, cy0, cw, 28 * S); E.mono(c, cap, 36 * S, cy0 + 19 * S, 13 * S, '#fff', 'left');
    },
  });
})();
