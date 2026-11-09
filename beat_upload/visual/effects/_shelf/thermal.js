/* Thermal: the whole cover as a thermal camera image in the ironbow palette, with a drifting
 * crosshair, a temperature scale, and hot-spot readouts on the brightest places. The readouts
 * tick with the bands, the kick flashes the scale, the snare re-aims the hot spots. */
(function () {
  'use strict';
  const RAMP = [[0, 0, 0], [20, 0, 60], [110, 0, 140], [200, 20, 90], [240, 90, 20], [255, 170, 0], [255, 235, 120], [255, 255, 255]];
  const st = { key: '', img: null, spots: [], cx: 0.5, cy: 0.5, flash: 0 };
  function build(E) {
    const { W, H } = E, w = Math.round(W / 2), h = Math.round(H / 2), t = E.mkCanvas(w, h), g = t.getContext('2d'), cv = E.cover.src, k = Math.max(w / cv.width, h / cv.height); g.drawImage(cv, (cv.width - w / k) / 2, (cv.height - h / k) / 2, w / k, h / k, 0, 0, w, h);
    const im = g.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255 * (RAMP.length - 1), i0 = Math.min(RAMP.length - 2, Math.floor(l)), f = l - i0, a = RAMP[i0], b = RAMP[i0 + 1]; d[i] = a[0] + (b[0] - a[0]) * f; d[i + 1] = a[1] + (b[1] - a[1]) * f; d[i + 2] = a[2] + (b[2] - a[2]) * f; }
    g.putImageData(im, 0, 0); st.img = t; st.spots = E.interest().slice(0, 6).map(q => ({ x: (E.cover.left + q.x * E.cover.w) / W, y: (E.cover.top + q.y * E.cover.h) / H, base: 31 + Math.random() * 8 })); st.key = E.cover.version + '|' + W;
  }
  BeatVisual.register({
    id: 'thermal', name: 'Thermal', fam: 'hud',
    blurb: 'Вся обложка как кадр тепловизора в палитре ironbow: дрейфующее перекрестие, шкала температур, показания над самыми горячими местами. Цифры тикают от полос спектра, кик вспыхивает шкалой, снэр перенацеливает точки.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt'; if (st.key !== E.cover.version + '|' + W) build(E); const t = A.t, LINE = '#ffffff';
      c.save(); c.imageSmoothingEnabled = true; c.filter = `brightness(${1 + 0.12 * A.kick}) contrast(1.05)`; c.drawImage(st.img, 0, 0, W, H); c.restore();
      c.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < H; y += 3 * S) c.fillRect(0, y, W, S);
      if (A.cut && A.cutKind === 'kick') st.flash = 1; st.flash *= 0.85; if (A.snareHit) { const q = st.spots[Math.floor(Math.random() * st.spots.length)]; st.tx = q.x; st.ty = q.y; }
      if (st.tx === undefined) { st.tx = 0.5; st.ty = 0.5; } st.cx += (st.tx + 0.01 * Math.sin(t * 0.7) - st.cx) * 0.06; st.cy += (st.ty + 0.01 * Math.cos(t * 0.5) - st.cy) * 0.06;
      // the crosshair
      c.strokeStyle = LINE; c.lineWidth = 1.2 * S; const x = st.cx * W, y = st.cy * H, r = 26 * S; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.moveTo(x - r * 1.6, y); c.lineTo(x - r * 0.5, y); c.moveTo(x + r * 0.5, y); c.lineTo(x + r * 1.6, y); c.moveTo(x, y - r * 1.6); c.lineTo(x, y - r * 0.5); c.moveTo(x, y + r * 0.5); c.lineTo(x, y + r * 1.6); c.stroke();
      // hot spots: a small box and a reading
      st.spots.forEach((q, i) => { const px = q.x * W, py = q.y * H, v = (q.base + 1.5 * A.bands[i] + 0.3 * Math.sin(t * 3 + i)).toFixed(1); c.strokeRect(px - 8 * S, py - 8 * S, 16 * S, 16 * S); E.mono(c, v + '°', px + 12 * S, py - 10 * S, 10 * S, LINE); });
      // the scale on the right
      const sx = W - (yt ? 40 : 28) * S, sy = yt ? H * 0.3 : H * 0.36, sh = H * (yt ? 0.4 : 0.3), sw = 8 * S, gr = c.createLinearGradient(0, sy + sh, 0, sy); RAMP.forEach((col, i) => gr.addColorStop(i / (RAMP.length - 1), `rgb(${col.join(',')})`)); c.fillStyle = gr; c.fillRect(sx, sy, sw, sh); c.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * st.flash})`; c.lineWidth = (1 + 2 * st.flash) * S; c.strokeRect(sx, sy, sw, sh);
      E.mono(c, (38 + 2 * A.bands[0]).toFixed(1) + '°', sx + sw / 2, sy - 8 * S, 10 * S, LINE, 'center'); E.mono(c, '18.0°', sx + sw / 2, sy + sh + 16 * S, 10 * S, LINE, 'center');
      // the words
      c.save(); c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 10 * S; E.header(c, '#fff', 'rgba(255,255,255,0.7)'); c.restore();
      const tc = Math.floor(A.secs || 0), mm = String(Math.floor(tc / 60)).padStart(2, '0'), ss = String(tc % 60).padStart(2, '0'), ff = String(Math.floor(((A.secs || 0) % 1) * 25)).padStart(2, '0');
      E.mono(c, 'FLIR  ' + mm + ':' + ss + ':' + ff + '  e=0.95', yt ? W * 0.55 : 30 * S, yt ? H - 30 * S : H * 0.3, 10 * S, 'rgba(255,255,255,0.75)');
    },
  });
})();
