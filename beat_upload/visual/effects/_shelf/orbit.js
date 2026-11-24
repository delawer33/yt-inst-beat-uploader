/* Orbit: a painted planet, no cover. Cloud bands from noise turn slowly on a sphere, a terminator
 * shades it, an atmosphere glows at the rim, three rings of dust circle it in perspective and
 * breathe with their bands, a star field turns behind. Kick: a shockwave ring and a pulse of the
 * planet; snare: the dust flares; hats: the stars twinkle. The palette is drawn per Beat. */
(function () {
  'use strict';
  const PALS = [
    { bands: ['#3b2a1e', '#a86f3c', '#e9c79a', '#f6ead6'], glow: '#f0c080', sky: '#05060f' },
    { bands: ['#0e1f3d', '#2b5c9e', '#7fb3e6', '#e4f1ff'], glow: '#8ac6ff', sky: '#03040c' },
    { bands: ['#2a0f2e', '#7a2a6a', '#d46aa4', '#ffd3e8'], glow: '#ff9ad5', sky: '#070410' },
    { bands: ['#102a22', '#1f6b55', '#6fc9a2', '#e2fff1'], glow: '#9af0c8', sky: '#030a08' },
  ];
  const TW = 768, TH = 384;
  const st = { key: '', pal: PALS[0], tex: null, stars: [], rings: [], waves: [], pulse: 0, flare: 0 };
  const lerp = (a, b, t) => a + (b - a) * t, sm = t => t * t * (3 - 2 * t);
  function grid(n, m) { const g = new Float32Array(n * m); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return { g, n, m }; }
  function sample(G, u, v) { const { g, n, m } = G, x0 = Math.floor(u), y0 = Math.floor(v), fx = sm(u - x0), fy = sm(v - y0), xa = ((x0 % n) + n) % n, xb = (xa + 1) % n, ya = ((y0 % m) + m) % m, yb = (ya + 1) % m; return lerp(lerp(g[ya * n + xa], g[ya * n + xb], fx), lerp(g[yb * n + xa], g[yb * n + xb], fx), fy); }
  function texture(E, pal) { // cloud bands: a 1D band profile bent by a swirl field, plus fine detail; seamless in x
    const t = E.mkCanvas(TW, TH), g = t.getContext('2d'), im = g.createImageData(TW, TH), d = im.data, Gb = grid(5, 28), Gs = grid(20, 10), Gd = grid(40, 20), cols = pal.bands.map(E.hex2rgb);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const u = x / TW, v = y / TH, sw = sample(Gs, u * 20, v * 10) - 0.5, n = sample(Gb, u * 5, v * 28 + sw * 1.3), det = sample(Gd, u * 40, v * 20) - 0.5;
      const val = E.clamp((n - 0.5) * 2.2 + 0.5 + det * 0.12, 0, 0.999) * 3, i0 = Math.floor(val), f = val - i0, ca = cols[i0], cb = cols[i0 + 1], k = (y * TW + x) * 4;
      d[k] = ca[0] + (cb[0] - ca[0]) * f; d[k + 1] = ca[1] + (cb[1] - ca[1]) * f; d[k + 2] = ca[2] + (cb[2] - ca[2]) * f; d[k + 3] = 255;
    }
    g.putImageData(im, 0, 0); return t;
  }
  function build(E) {
    st.pal = PALS[Math.floor(Math.random() * PALS.length)]; st.tex = texture(E, st.pal);
    st.stars = []; for (let i = 0; i < 260; i++) st.stars.push({ x: Math.random() * 2 - 0.5, y: Math.random() * 2 - 0.5, r: Math.random(), ph: Math.random() * 6.28 });
    st.rings = [{ r: 1.5, tilt: 0.26, n: 180, sp: 0.1, band: 1, w: 3.2 }, { r: 1.85, tilt: 0.24, n: 260, sp: -0.07, band: 2, w: 2.3 }, { r: 2.3, tilt: 0.3, n: 120, sp: 0.045, band: 4, w: 4 }]
      .map(r => ({ ...r, dots: new Array(r.n).fill(0).map((_, j) => ({ a0: j / r.n * 6.2832 + (Math.random() - 0.5) * 0.06, dr: (Math.random() - 0.5) * 0.1, k: 0.6 + Math.random() * 0.8 })) }));
    st.waves = []; st.key = E.W + '';
  }
  BeatVisual.register({
    id: 'orbit', name: 'Orbit', fam: 'gen',
    blurb: 'Нарисованная планета, без обложки. Облачные полосы медленно вращаются по сфере, тень терминатора, свечение атмосферы, три кольца пыли в перспективе дышат полосами спектра, сзади поворачиваются звёзды. Кик — ударная волна и пульс планеты, снэр — вспышка пыли, хэты — мерцание звёзд. Палитра своя на каждый бит.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== W + '') build(E); const t = A.t, pal = st.pal;
      const cx = yt ? W * 0.66 : W / 2, cy = yt ? H * 0.5 : H * 0.56, R = yt ? H * 0.25 : W * 0.26;
      c.fillStyle = pal.sky; c.fillRect(0, 0, W, H);
      const neb = c.createRadialGradient(cx, cy, R, cx, cy, R * 3.2); neb.addColorStop(0, E.rgba(pal.glow, 0.16)); neb.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = neb; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') { st.pulse = 1; st.waves.push({ r: R * 1.05, a: 0.9 }); } st.pulse *= 0.88; if (A.snareHit) st.flare = 1; st.flare *= 0.85; const tw = A.hatHit ? 1 : 0;
      c.save(); c.translate(cx, cy); c.rotate(t * 0.012); c.fillStyle = '#fff'; for (const s of st.stars) { c.globalAlpha = Math.min(1, 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.4 + s.ph)) + 0.4 * tw * s.r); const sz = (0.6 + 1.5 * s.r) * S; c.fillRect((s.x - 0.5) * W * 1.4, (s.y - 0.5) * H * 1.4, sz, sz); } c.restore();
      const inc = -0.4, ci = Math.cos(inc), si = Math.sin(inc), proj = (px, py) => [cx + px * ci - py * si, cy + px * si + py * ci];
      for (const w of st.waves) { w.r += 7 * S; w.a *= 0.94; c.save(); c.strokeStyle = pal.glow; c.globalAlpha = w.a; c.lineWidth = 1.5 * S; c.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * 6.2832, [x, y] = proj(w.r * Math.cos(a), w.r * Math.sin(a) * 0.27); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); c.restore(); } st.waves = st.waves.filter(w => w.a > 0.03);
      const dots = (front) => { for (const rg of st.rings) { const rr = R * rg.r * (1 + 0.08 * A.bands[rg.band]); for (const d of rg.dots) { const a = d.a0 + t * rg.sp * 6.2832, z = Math.sin(a); if ((z >= 0) !== front) continue; const [x, y] = proj(rr * (1 + d.dr) * Math.cos(a), rr * (1 + d.dr) * z * rg.tilt), f = (z + 1) / 2; c.globalAlpha = Math.min(1, (0.45 + 0.55 * f) * (1 + 0.5 * st.flare)); c.fillStyle = f > 0.6 ? '#fff' : pal.glow; const sz = rg.w * S * d.k * (0.55 + 0.7 * f) * (1 + 0.6 * st.flare); c.fillRect(x - sz / 2, y - sz / 2, sz, sz); } } c.globalAlpha = 1; };
      dots(false);
      // the planet: the texture wrapped on a sphere, one strip per two pixels, the visible latitudes shrink towards the limb
      const Rp = R * (1 + 0.04 * st.pulse), rot = t * 0.015, step = 2 * S;
      c.save(); c.shadowColor = pal.glow; c.shadowBlur = 34 * S; c.fillStyle = pal.glow; c.globalAlpha = 0.55; c.beginPath(); c.arc(cx, cy, Rp + 1.5 * S, 0, 6.2832); c.fill(); c.restore();
      c.save(); c.beginPath(); c.arc(cx, cy, Rp, 0, 6.2832); c.clip(); c.imageSmoothingEnabled = true;
      for (let x = -Rp; x < Rp; x += step) { const u = E.clamp((x + step / 2) / Rp, -1, 1), half = Math.sqrt(Math.max(0, 1 - u * u)) * Rp, lon = Math.asin(u), tx = Math.min(TW - 2, (((lon / Math.PI + 0.5 + rot) % 1) + 1) % 1 * TW), lat = Math.asin(Math.min(1, half / Rp)), sy = TH * (0.5 - lat / Math.PI), sh = Math.max(1, TH * 2 * lat / Math.PI); c.drawImage(st.tex, tx, sy, 1.2, sh, cx + x, cy - half, step + 0.6, 2 * half); }
      const sh = c.createRadialGradient(cx - Rp * 0.45, cy - Rp * 0.45, Rp * 0.1, cx, cy, Rp * 1.05); sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(0.45, 'rgba(0,0,0,0.0)'); sh.addColorStop(0.75, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0.9)'); c.fillStyle = sh; c.fillRect(cx - Rp, cy - Rp, 2 * Rp, 2 * Rp); c.restore();
      dots(true);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 12 * S; E.header(c, '#fff', 'rgba(255,255,255,0.6)'); c.restore();
    },
  });
})();
