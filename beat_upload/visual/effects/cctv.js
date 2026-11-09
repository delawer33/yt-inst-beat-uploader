/* CCTV: the cover as a surveillance feed, desaturated, scanlines, a timestamp and a REC dot; a
 * recognition box hunts over the picture on the kick, the snare tears the signal for a frame,
 * every bar is another camera and another zoom step. */
(function () {
  'use strict';
  const st = { box: null, cam: 1, zoom: 1, tear: 0 };
  function pickBox(E) { const a = E.anchor(), w = (90 + Math.random() * 120) * E.S; st.box = { x: a.x * E.W - w / 2, y: a.y * E.H - w * 0.6, w, h: w * 1.2, id: Math.floor(Math.random() * 0xfff).toString(16).toUpperCase().padStart(3, '0') }; }
  function tc(s) { const f = Math.floor((s % 1) * 25); s = Math.floor(s); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, f].map(v => String(v).padStart(2, '0')).join(':'); }
  BeatVisual.register({
    id: 'cctv', name: 'CCTV', fam: 'hud',
    blurb: 'Обложка как запись с камеры наблюдения: обесцвечена, строчная развёртка, таймкод и точка REC. Рамка распознавания прыгает по картинке на кике, снэр рвёт сигнал на кадр, каждый такт — другая камера и другой зум.',
    init(E) { pickBox(E); st.cam = 1; st.zoom = 1; },
    draw(c, A, E) {
      const { W, H, S, meta } = E, yt = E.FMT === 'yt';
      if (A.cut && A.cutKind === 'kick') pickBox(E); if (A.barHit && A.playing) { st.cam = st.cam % 4 + 1; st.zoom = [1, 1.18, 1.36, 1.1][st.cam - 1]; } if (A.snareHit) st.tear = 3;
      const cv = E.cover.src, k = st.zoom * Math.max(W / cv.width, H / cv.height), dw = cv.width * k, dh = cv.height * k;
      c.save(); c.filter = 'grayscale(0.9) contrast(1.15) brightness(0.9)';
      if (st.tear > 0) { st.tear--; const bands = 6; for (let i = 0; i < bands; i++) { const y = i * H / bands, dx = (Math.random() - 0.5) * 60 * S; c.drawImage(cv, 0, (y - (H - dh) / 2) / k, cv.width, H / bands / k, (W - dw) / 2 + dx, y, dw, H / bands + 1); } }
      else c.drawImage(cv, (W - dw) / 2, (H - dh) / 2, dw, dh);
      c.restore();
      c.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < H; y += 3 * S) c.fillRect(0, y, W, 1 * S);
      const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      // the recognition box with corner brackets and its id
      const b = st.box, L = 14 * S; c.strokeStyle = '#fff'; c.lineWidth = 2 * S; c.beginPath();
      for (const [x, y, sx, sy] of [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]]) { c.moveTo(x, y + sy * L); c.lineTo(x, y); c.lineTo(x + sx * L, y); }
      c.stroke(); E.mono(c, 'ID ' + b.id + '  ' + Math.round(60 + A.level * 39) + '%', b.x, b.y - 8 * S, 11 * S, '#fff');
      // the HUD: camera and REC top left with the words, the timecode top right
      const x0 = 28 * S, y0 = (yt ? 60 : 130) * S; c.fillStyle = '#ff2a2a'; if (Math.floor(A.t * 2) % 2 === 0) { c.beginPath(); c.arc(x0 + 6 * S, y0 - 5 * S, 6 * S, 0, 6.2832); c.fill(); }
      E.mono(c, 'REC   CAM 0' + st.cam + '   x' + st.zoom.toFixed(2), x0 + 20 * S, y0, 13 * S, '#fff');
      const title = meta.title.toUpperCase(), fs = (yt ? 72 : 64) * S; c.font = '400 ' + fs + 'px "League Gothic"'; const tw = c.measureText(title).width, maxW = yt ? W * 0.5 : W - 56 * S;
      E.gothic(c, title, x0, y0 + fs * 0.95, tw > maxW ? fs * maxW / tw : fs, '#fff');
      const who = (meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT'), facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join(' · ');
      E.mono(c, who + (facts ? '   ' + facts : ''), x0, y0 + fs * 0.95 + 24 * S, 13 * S, 'rgba(255,255,255,0.85)');
      E.mono(c, tc(A.secs || 0), W - 28 * S, y0, 13 * S, '#fff', 'right'); E.mono(c, '2026-11-08', W - 28 * S, y0 + 18 * S, 11 * S, 'rgba(255,255,255,0.7)', 'right');
    },
  });
})();
