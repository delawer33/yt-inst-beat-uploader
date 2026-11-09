/* Bauhaus: cream paper, the cover in a circle, a black bar, a yellow triangle, a blue half-disc
 * and a red dot that circles the cover once a bar. Primary colours and snapping geometry, the
 * title running up the left edge. */
(function () {
  'use strict';
  const CREAM = '#f1e9d2', RED = '#d62828', BLUE = '#1d3557', YELLOW = '#f4d35e', BLACK = '#111';
  const st = { tri: 0, triTo: 0, flip: 1, flipTo: 1 };
  BeatVisual.register({
    id: 'bauhaus', name: 'Bauhaus', fam: 'poster',
    blurb: 'Крем, обложка в круге, чёрная балка, жёлтый треугольник, синий полукруг и красная точка, которая обходит круг за такт. Кик поворачивает треугольник на четверть, снэр переворачивает полукруг. Название — вверх по левому краю.',
    init() { st.tri = st.triTo = 0; st.flip = st.flipTo = 1; },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt';
      c.fillStyle = CREAM; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') st.triTo += Math.PI / 2; if (A.cut && A.cutKind === 'snare') st.flipTo = -st.flipTo;
      st.tri += (st.triTo - st.tri) * 0.35; st.flip += (st.flipTo - st.flip) * 0.35;
      const R = yt ? H * 0.34 : W * 0.33, cx = yt ? W * 0.58 : W * 0.6, cy = yt ? H * 0.5 : H * 0.46;
      // the black bar behind, the blue half-disc at the edge, the yellow triangle below
      c.fillStyle = BLACK; c.fillRect(118 * S, cy + R * 0.55, W, R * 0.26);
      c.save(); c.translate(yt ? W * 0.9 : W, cy - R * 0.9); c.scale(st.flip, 1); c.fillStyle = BLUE; c.beginPath(); c.arc(0, 0, R * 0.55, Math.PI / 2, Math.PI * 1.5); c.fill(); c.restore();
      c.save(); c.translate(yt ? W * 0.3 : W * 0.2, yt ? H * 0.76 : H * 0.8); c.rotate(st.tri); c.fillStyle = YELLOW; c.beginPath(); const t = R * 0.42; c.moveTo(0, -t); c.lineTo(t * 0.95, t * 0.6); c.lineTo(-t * 0.95, t * 0.6); c.closePath(); c.fill(); c.restore();
      // the cover in the circle
      c.save(); c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.clip(); const cv = E.cover.src, k = Math.max(2 * R / cv.width, 2 * R / cv.height); c.drawImage(cv, (cv.width - 2 * R / k) / 2, (cv.height - 2 * R / k) / 2, 2 * R / k, 2 * R / k, cx - R, cy - R, 2 * R, 2 * R); c.restore();
      c.lineWidth = 3 * S; c.strokeStyle = BLACK; c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.stroke();
      // the red dot: one lap per bar
      const ang = (A.playing ? A.bar : (A.t * 0.25) % 1) * 6.2832 - Math.PI / 2, orbit = R + 26 * S; c.fillStyle = RED; c.beginPath(); c.arc(cx + Math.cos(ang) * orbit, cy + Math.sin(ang) * orbit, 16 * S, 0, 6.2832); c.fill();
      // the title up the left edge, the facts top right
      c.save(); const title = meta.title.toUpperCase(), fs = (yt ? 96 : 104) * S; c.translate(24 * S + fs * 0.72, H - 40 * S); c.rotate(-Math.PI / 2); c.font = '400 ' + fs + 'px "League Gothic"'; const tw = c.measureText(title).width, maxW = H - 80 * S; E.gothic(c, title, 0, 0, tw > maxW ? fs * maxW / tw : fs, BLACK, 'left'); c.restore();
      const who = (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT'), facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  ');
      E.mono(c, who, W - 28 * S, (yt ? 60 : 150) * S, 14 * S, BLACK, 'right'); if (facts) E.mono(c, facts, W - 28 * S, (yt ? 82 : 172) * S, 14 * S, BLACK, 'right');
    },
  });
})();
