/* Holo: the cover as a holographic trading card tilting slowly in the dark; a rainbow foil
 * shifts across it as it turns, a specular sweep follows the tilt, a faded reflection below.
 * The kick nudges the tilt, hats drop sparkles, the title carries the same foil. */
(function () {
  'use strict';
  const st = { nudge: 0, sparks: [] };
  function star(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.28 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); }
  BeatVisual.register({
    id: 'holo', name: 'Holo', fam: 'future',
    blurb: 'Обложка — голографическая карточка, медленно покачивается в темноте; по ней гуляет радужная фольга и блик, снизу тусклое отражение. Кик толкает наклон, хэты роняют искры, название залито той же фольгой.',
    init() { st.sparks = []; st.nudge = 0; },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt', t = A.t;
      c.fillStyle = '#07080f'; c.fillRect(0, 0, W, H);
      const size = yt ? H * 0.62 : W * 0.68, cx = yt ? W * 0.66 : W / 2, cy = yt ? H * 0.5 : H * 0.55;
      if (A.cut && A.cutKind === 'kick') st.nudge += (Math.random() < 0.5 ? -1 : 1) * 0.3; st.nudge *= 0.92;
      const ang = 0.3 * Math.sin(t * 0.55) + st.nudge, cs = Math.cos(ang), sn = Math.sin(ang), hue = (t * 30) % 360;
      // floor glow in the moving foil colour
      c.save(); c.translate(cx, cy + size * 0.6); c.scale(1, 0.3); const fg = c.createRadialGradient(0, 0, 0, 0, 0, size * 0.8); fg.addColorStop(0, `hsla(${hue},85%,60%,${0.3 + 0.2 * A.kick})`); fg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = fg; c.fillRect(-W, -H, 2 * W, 2 * H); c.restore();
      const card = (alpha) => {
        c.save(); c.translate(cx, cy); c.transform(cs, 0.12 * sn, 0, 1, 0, 0); c.globalAlpha = alpha; c.beginPath(); c.roundRect(-size / 2, -size / 2, size, size, 26 * S); c.save(); c.clip();
        const cv = E.cover.src, k = Math.max(size / cv.width, size / cv.height); c.drawImage(cv, (cv.width - size / k) / 2, (cv.height - size / k) / 2, size / k, size / k, -size / 2, -size / 2, size, size);
        const cg = c.createConicGradient(ang * 2 + t * 0.3, 0, 0); for (let i = 0; i <= 12; i++) cg.addColorStop(i / 12, `hsl(${i * 30},100%,65%)`); c.globalCompositeOperation = 'color-dodge'; c.globalAlpha = alpha * (0.2 + 0.28 * Math.abs(sn) + 0.1 * A.kick); c.fillStyle = cg; c.fillRect(-size / 2, -size / 2, size, size);
        const px = sn * size * 1.3, lg = c.createLinearGradient(px - size * 0.5, -size / 2, px + size * 0.5, size / 2); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.5)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); c.globalCompositeOperation = 'screen'; c.globalAlpha = alpha * 0.6; c.fillStyle = lg; c.fillRect(-size / 2, -size / 2, size, size);
        c.restore(); c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha; c.lineWidth = 2 * S; c.strokeStyle = 'rgba(255,255,255,0.45)'; c.stroke(); c.restore();
      };
      // the reflection: the card flipped under itself, faded into the floor
      const gap = 14 * S; c.save(); c.translate(0, 2 * (cy + size / 2) + gap); c.scale(1, -1); card(0.3); c.restore();
      const fade = c.createLinearGradient(0, cy + size / 2 + gap, 0, cy + size / 2 + gap + size * 0.45); fade.addColorStop(0, 'rgba(7,8,15,0.5)'); fade.addColorStop(1, 'rgba(7,8,15,1)'); c.fillStyle = fade; c.fillRect(0, cy + size / 2 + gap, W, size * 0.45 + 1);
      card(1);
      if (A.hatHit) for (let i = 0; i < 3; i++) st.sparks.push({ x: cx + (Math.random() - 0.5) * size * 0.9, y: cy + (Math.random() - 0.5) * size * 0.9, a: 1, r: (7 + 9 * Math.random()) * S });
      for (const s of st.sparks) { s.a *= 0.86; star(c, s.x, s.y, s.r * (1.7 - s.a * 0.7), `rgba(255,255,255,${s.a})`); } st.sparks = st.sparks.filter(s => s.a > 0.04);
      // the words: the title in foil, the rest in quiet mono
      const title = meta.title.toUpperCase(), big = (yt ? 84 : 76) * S, maxW = yt ? W * 0.4 : W - 56 * S; c.font = '400 ' + big + 'px "League Gothic"'; const tw = c.measureText(title).width, fs = tw > maxW ? big * maxW / tw : big, tx = 28 * S, ty = (yt ? 110 : 180) * S;
      const tg = c.createLinearGradient(tx, 0, tx + Math.min(tw, maxW), 0); for (let i = 0; i <= 6; i++) tg.addColorStop(i / 6, `hsl(${(hue + i * 40) % 360},90%,78%)`);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 12 * S; c.font = '400 ' + fs + 'px "League Gothic"'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = tg; c.fillText(title, tx, ty); c.restore();
      const who = meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  ');
      E.mono(c, who, 30 * S, ty + 28 * S, 13 * S, 'rgba(255,255,255,0.75)'); if (facts) E.mono(c, facts, 30 * S, ty + 50 * S, 13 * S, 'rgba(255,255,255,0.5)');
    },
  });
})();
