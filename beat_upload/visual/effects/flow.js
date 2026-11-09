/* Flow: smoke drawn by fourteen hundred particles riding a curl-noise field, leaving silk trails
 * that fade. No cover. Kick: a gust and a burst of new particles from one point; snare: the
 * field reverses and the smoke curls the other way. Two inks on near black, drawn per Beat. */
(function () {
  'use strict';
  const INKS = [['#ffffff', '#ffd6a5'], ['#9ad8ff', '#ffffff'], ['#ff9ad5', '#ffe08a'], ['#b8ffcf', '#ffffff']];
  const st = { key: '', trail: null, pts: [], G1: null, G2: null, inks: INKS[0], gust: 0, sign: 1 };
  const lerp = (a, b, t) => a + (b - a) * t, sm = t => t * t * (3 - 2 * t);
  function grid(n, m) { const g = new Float32Array(n * m); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return { g, n, m }; }
  function sample(G, u, v) { const { g, n, m } = G, x0 = Math.floor(u), y0 = Math.floor(v), fx = sm(u - x0), fy = sm(v - y0), xa = ((x0 % n) + n) % n, xb = (xa + 1) % n, ya = ((y0 % m) + m) % m, yb = (ya + 1) % m; return lerp(lerp(g[ya * n + xa], g[ya * n + xb], fx), lerp(g[yb * n + xa], g[yb * n + xb], fx), fy); }
  function spawn(E, p, x, y) { const g = () => (Math.random() + Math.random() + Math.random()) / 3 - 0.5; p.x = x !== undefined ? x : E.W * (0.5 + g() * 1.1); p.y = y !== undefined ? y : E.H * (0.58 + g() * 0.9); p.life = 60 + Math.random() * 160; p.ink = Math.random() < 0.7 ? 0 : 1; }
  function build(E) {
    const { W, H } = E; st.trail = E.mkCanvas(W, H); const g = st.trail.getContext('2d'); g.fillStyle = '#0a0a10'; g.fillRect(0, 0, W, H);
    st.G1 = grid(3, 5); st.G2 = grid(8, 14); st.inks = INKS[Math.floor(Math.random() * INKS.length)]; st.pts = []; for (let i = 0; i < 420; i++) { const p = {}; spawn(E, p); p.life *= Math.random(); st.pts.push(p); }
    st.key = W + '';
  }
  BeatVisual.register({
    id: 'flow', name: 'Flow', fam: 'gen',
    blurb: 'Дым из четырёх сотен частиц, которые несёт поле curl-шума и которые оставляют шёлковые гаснущие следы. Без обложки. Кик — порыв и выброс новых частиц из одной точки, снэр — поле разворачивается и дым закручивается в другую сторону. Две краски на почти чёрном, свои на каждый бит.',
    init(E) { build(E); },
    draw(c, A, E) {
      const { W, H, S } = E; if (st.key !== W + '') build(E); const t = A.t, g = st.trail.getContext('2d');
      if (A.cut && A.cutKind === 'kick') { st.gust = 1; const bx = W * (0.2 + 0.6 * Math.random()), by = H * (0.25 + 0.5 * Math.random()); for (let i = 0; i < 220; i++) { const p = st.pts[Math.floor(Math.random() * st.pts.length)]; const a = Math.random() * 6.2832, r = Math.random() * 30 * S; spawn(E, p, bx + Math.cos(a) * r, by + Math.sin(a) * r); } } st.gust *= 0.92;
      if (A.snareHit) st.sign = -st.sign;
      g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(10,10,16,0.07)'; g.fillRect(0, 0, W, H);
      const sc = 1 / (W * 0.55), eps = 2 * S, speed = (2.2 + 1.5 * A.bands[1] + 4 * st.gust) * S, tt = t * 0.06;
      const psi = (x, y) => sample(st.G1, x * sc * 3 + tt, y * sc * 3 - tt * 0.7) + 0.15 * sample(st.G2, x * sc * 8 - tt * 1.3, y * sc * 8 + tt);
      g.lineWidth = 2.8 * S; g.lineCap = 'round';
      for (let k = 0; k < 2; k++) { g.strokeStyle = E.rgba(st.inks[k], 0.2); g.beginPath();
        for (const p of st.pts) { if (p.ink !== k) continue; const vx = (psi(p.x, p.y + eps) - psi(p.x, p.y - eps)) / (2 * eps), vy = -(psi(p.x + eps, p.y) - psi(p.x - eps, p.y)) / (2 * eps), m = Math.hypot(vx, vy) + 1e-6, nx = p.x + st.sign * vx / m * speed, ny = p.y + st.sign * vy / m * speed - 0.35 * S;
          g.moveTo(p.x, p.y); g.lineTo(nx, ny); p.x = nx; p.y = ny; if (--p.life <= 0 || p.x < 0 || p.y < 0 || p.x > W || p.y > H) spawn(E, p); }
        g.stroke(); }
      c.drawImage(st.trail, 0, 0);
      const vg = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 12 * S; E.header(c, '#fff', 'rgba(255,255,255,0.6)'); c.restore();
    },
  });
})();
