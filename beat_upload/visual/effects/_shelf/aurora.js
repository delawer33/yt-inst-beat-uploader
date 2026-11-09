/* Aurora: northern lights over a dark ridge, no cover. Three curtains of light drift across the
 * sky, their height and brightness follow the mid bands; stars above, a black ridge below. Kick:
 * the curtains flare; snare: a ripple runs through them. Soft and slow, drawn at quarter size. */
(function () {
  'use strict';
  const st = { key: '', low: null, G: null, stars: [], ridge: [], pulse: 0, rip: 0 };
  const lerp = (a, b, t) => a + (b - a) * t, sm = t => t * t * (3 - 2 * t);
  function grid(n, m) { const g = new Float32Array(n * m); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return { g, n, m }; }
  function sample(G, u, v) { const { g, n, m } = G, x0 = Math.floor(u), y0 = Math.floor(v), fx = sm(u - x0), fy = sm(v - y0), xa = ((x0 % n) + n) % n, xb = (xa + 1) % n, ya = ((y0 % m) + m) % m, yb = (ya + 1) % m; return lerp(lerp(g[ya * n + xa], g[ya * n + xb], fx), lerp(g[yb * n + xa], g[yb * n + xb], fx), fy); }
  function build(E) {
    const { W, H, S } = E; st.low = E.mkCanvas(Math.round(W / (4 * S)), Math.round(H / (4 * S))); st.G = grid(16, 16);
    st.stars = []; for (let i = 0; i < 180; i++) st.stars.push({ x: Math.random(), y: Math.random() * 0.7, r: Math.random(), ph: Math.random() * 6.28 });
    const Gr = grid(9, 2); st.ridge = []; for (let i = 0; i <= 60; i++) st.ridge.push(0.86 + 0.09 * (sample(Gr, i / 60 * 9, 0.5) - 0.5) * 2 - 0.03 * Math.abs(Math.sin(i * 1.7)));
    st.key = E.W + '';
  }
  BeatVisual.register({
    id: 'aurora', name: 'Aurora', fam: 'gen',
    blurb: 'Северное сияние над тёмным хребтом, без обложки. Три занавеса света плывут по небу, их высота и яркость идут за средними полосами спектра; сверху звёзды, снизу чёрный гребень. Кик — занавесы вспыхивают, снэр — по ним пробегает рябь. Мягко и медленно.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== W + '') build(E); const t = A.t, g = st.low.getContext('2d'), w = st.low.width, h = st.low.height;
      if (A.cut && A.cutKind === 'kick') st.pulse = 1; st.pulse *= 0.9; if (A.snareHit) st.rip = 1; st.rip *= 0.93;
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#02030a'); sky.addColorStop(0.7, '#061522'); sky.addColorStop(1, '#0a2433'); g.globalCompositeOperation = 'source-over'; g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const layers = [{ col: [93, 255, 176], band: 2, sp: 0.035, off: 0 }, { col: [70, 220, 230], band: 3, sp: -0.025, off: 5.1 }, { col: [150, 90, 255], band: 4, sp: 0.02, off: 9.7 }];
      layers.forEach((L, li) => {
        const bright = (0.45 + 0.55 * A.bands[L.band]) * (1 + 0.6 * st.pulse);
        for (let x = 0; x < w; x++) {
          const u = x / w, rip = st.rip * 0.6 * Math.sin(u * 40 - t * 30), n = sample(st.G, u * 6 + t * L.sp * 6 + L.off + rip, L.off + t * 0.04), n2 = sample(st.G, u * 3 + L.off * 2 - t * 0.02, L.off + 3.3);
          const base = h * (yt ? 0.62 : 0.6) + h * 0.12 * (n2 - 0.5), height = h * (0.22 + 0.38 * n) * (0.6 + 0.6 * A.bands[L.band]) * (1 + 0.25 * st.pulse), a = bright * (0.35 + 0.65 * n);
          const gr = g.createLinearGradient(0, base, 0, base - height); gr.addColorStop(0, `rgba(${L.col[0]},${L.col[1]},${L.col[2]},${0.9 * a})`); gr.addColorStop(0.35, `rgba(${L.col[0]},${L.col[1]},${L.col[2]},${0.45 * a})`); gr.addColorStop(1, `rgba(${L.col[0]},${L.col[1]},${L.col[2]},0)`);
          g.fillStyle = gr; g.fillRect(x, base - height, 1, height);
        }
      });
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(st.low, 0, 0, W, H);
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = '#fff'; for (const s of st.stars) { c.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + s.ph)) + (A.hatHit ? 0.3 * s.r : 0); const sz = (0.6 + 1.3 * s.r) * S; c.fillRect(s.x * W, s.y * H, sz, sz); } c.restore();
      c.fillStyle = '#020306'; c.beginPath(); c.moveTo(0, H); st.ridge.forEach((r, i) => c.lineTo(i / 60 * W, r * H)); c.lineTo(W, H); c.closePath(); c.fill();
      c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 10 * S; E.header(c, '#fff', 'rgba(255,255,255,0.6)'); c.restore();
    },
  });
})();
