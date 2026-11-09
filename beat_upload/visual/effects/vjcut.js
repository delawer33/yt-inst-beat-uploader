// VJ Cut: every cut jumps to the next live treatment of the same cover (ASCII, Riso, Plates, Type
// Screen, Cover Style). No negative flash on the snare: the owner found it painful (2026-11-01). Needs ascii.js, riso.js, plates.js and
// typescreen.js loaded (the treatments it cuts between; looked up at draw time).
//
// The picture must stay readable under the treatments (owner, 2026-11-01), so the live photo is
// the base and the treatment lies over it at half strength. The siblings in vj_*.js vary the
// recipe (vj_hard full strength, vj_alt every other cut, vj_flash, vj_bar once a bar) and share the helpers below through
// BeatVisual.vj, which they read at draw time (this file loads after them alphabetically).
(function () {
  const ORDER = ['ascii', 'riso', 'plates', 'typescreen', 'poster'];
  const vj = BeatVisual.vj = {
    ORDER,
    blendFor: id => (id === 'poster' ? 'overlay' : 'screen'),
    // the treatment `id` drawn into `self.off` and laid over whatever is on `c`, at `alpha`
    layer(self, c, A, E, id, alpha, blend) {
      const { W, H, pal: p, STYLES } = E; if (!self.off || self.off.width !== W || self.off.height !== H) self.off = E.mkCanvas(W, H);
      const g = self.off.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H);
      if (id === 'poster') g.drawImage(E.extPoster(p), 0, 0); else STYLES.find(s => s.id === id).draw(g, A, E);
      c.save(); c.globalAlpha = alpha; c.globalCompositeOperation = blend || 'source-over'; c.drawImage(self.off, 0, 0); c.restore();
    },
    photo(c, E, cr) { const { W, H, pal: p } = E, img = E.ext(p, false); if (cr) c.drawImage(img, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, W, H); else c.drawImage(img, 0, 0); },
    plan(E, zmax) { const a = E.anchor(); return E.cropRect(1 + Math.random() * (zmax - 1), a.x, a.y, E.W, E.H); },
    negative(c, E) { c.save(); c.globalCompositeOperation = 'difference'; c.fillStyle = '#fff'; c.fillRect(0, 0, E.W, E.H); c.restore(); },
  };
  BeatVisual.register({
    id: 'vjcut', fam: 'cut', name: 'VJ Cut', how: 'headless', clip: 'live', // clip 'live': a Clip plays on under the treatments (vs 'cuts': a new still per cut)
    blurb: 'Одна обложка, пять живых трактовок: ASCII, Riso, Plates, Type Screen и чистый Cover Style. Каждая склейка — жёсткий переход на следующую; без негатива на снэре (он резал глаза). Трактовка лежит поверх живой картинки на 50 %, так что обложка (или видео) видна всегда.',
    init() { this.i = 0; this.off = null; },
    draw(c, A, E) {
      if (A.cut) this.i = (this.i + 1) % ORDER.length; const t = ORDER[this.i];
      vj.photo(c, E); vj.layer(this, c, A, E, t, 0.5, vj.blendFor(t)); E.cutHeader(c, E.pal);
    },
  });
})();
