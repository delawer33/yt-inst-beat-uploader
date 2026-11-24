/* Ribbons: three silk ribbons flow along 3D Lissajous paths that slowly turn in space, drawn
 * thick near the camera and thin far away, each in a two-colour gradient with a glow. No cover.
 * Kick: the ribbons rush forward and widen; snare: the space jolts to a new angle. */
(function () {
  'use strict';
  const SETS = [[['#ff6b6b', '#ffd93d'], ['#6bcBff', '#ffffff'], ['#c77dff', '#ff9ad5']], [['#ffffff', '#9ad8ff'], ['#ffd6a5', '#ff8fab'], ['#b8ffcf', '#4ecdc4']]];
  const st = { ribbons: [], rush: 0, jolt: 0, ay: 0, ax: 0, tay: 0, tax: 0 };
  function build() { const set = SETS[Math.floor(Math.random() * SETS.length)]; st.ribbons = set.map((cols, i) => ({ cols, a: 1 + i * 0.5 + Math.random() * 0.3, b: 2 + Math.random() * 0.6, c: 1.5 + Math.random() * 0.8, p1: Math.random() * 6.28, p2: Math.random() * 6.28, p3: Math.random() * 6.28, s0: Math.random() * 20, len: 2.6 + Math.random() * 1.2 })); st.tay = Math.random() * 6.28; st.tax = (Math.random() - 0.5) * 0.8; }
  BeatVisual.register({
    id: 'ribbons', name: 'Ribbons', fam: 'gen',
    blurb: 'Три шёлковые ленты текут по трёхмерным кривым Лиссажу, которые медленно поворачиваются в пространстве: толстые у камеры, тонкие вдали, каждая в своём двухцветном градиенте со свечением. Без обложки. Кик — ленты рвутся вперёд и ширятся, снэр — пространство рывком меняет угол.',
    init() { build(); st.ay = st.tay; st.ax = st.tax; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt', t = A.t;
      c.fillStyle = '#06070d'; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') st.rush = 1; st.rush *= 0.9; if (A.snareHit) { st.tay += (Math.random() - 0.5) * 1.2; st.tax = (Math.random() - 0.5) * 0.9; }
      st.ay += (st.tay + t * 0.12 - st.ay) * 0.08; st.ax += (st.tax - st.ax) * 0.08;
      const cx = yt ? W * 0.62 : W / 2, cy = yt ? H * 0.52 : H * 0.56, R = yt ? H * 0.34 : W * 0.4, cay = Math.cos(st.ay), say = Math.sin(st.ay), cax = Math.cos(st.ax), sax = Math.sin(st.ax);
      const project = (x, y, z) => { const x1 = x * cay - z * say, z1 = x * say + z * cay, y1 = y * cax - z1 * sax, z2 = y * sax + z1 * cax, pz = 1 / (1 + z2 * 0.35); return [cx + x1 * R * pz, cy + y1 * R * pz, pz]; };
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const rb of st.ribbons) {
        rb.s0 += (0.012 + 0.03 * st.rush + 0.006 * A.bands[1]); const N = 120, pts = [];
        for (let i = 0; i <= N; i++) { const s = rb.s0 + rb.len * i / N; pts.push(project(Math.sin(rb.a * s + rb.p1), Math.sin(rb.b * s + rb.p2) * 0.8, Math.sin(rb.c * s + rb.p3))); }
        c.save(); c.shadowColor = rb.cols[0]; c.shadowBlur = 14 * S;
        for (let i = 1; i <= N; i++) { const [x0, y0, z0] = pts[i - 1], [x1, y1, z1] = pts[i], f = i / N, z = (z0 + z1) / 2; c.strokeStyle = f < 0.5 ? rb.cols[0] : rb.cols[1]; c.globalAlpha = (0.25 + 0.75 * f) * E.clamp(z * 1.2, 0.3, 1); c.lineWidth = (2 + 16 * f * (1 + 0.5 * st.rush)) * S * z; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
        c.restore();
      }
      c.globalAlpha = 1; c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 12 * S; E.header(c, '#fff', 'rgba(255,255,255,0.6)'); c.restore();
    },
  });
})();
