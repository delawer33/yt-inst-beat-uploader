// VJ Cut · flash: the picture is the base; every cut flashes the next treatment at full strength and
// fades it back into the picture over half a second while the plan changes.
// Helpers: BeatVisual.vj from vjcut.js, read at draw time (that file loads after this one).
BeatVisual.register({
  id: 'vj_flash', fam: 'cut', name: 'VJ Cut · вспышка', how: 'headless', clip: 'live',
  blurb: 'Картинка — база. Каждая склейка вспыхивает следующей трактовкой в полную силу и за полсекунды растворяется обратно, одновременно меняя план. Удар виден как вспышка, картинка возвращается всегда.',
  init() { this.i = 0; this.age = 99; this.off = null; this.cr = null; },
  draw(c, A, E) {
    const vj = BeatVisual.vj, ORDER = vj.ORDER;
    if (A.cut || !this.cr) { this.i = (this.i + 1) % ORDER.length; this.age = 0; this.cr = vj.plan(E, 1.4); }
    const t = ORDER[this.i], alpha = Math.max(0, 1 - this.age / 15); this.age++;
    vj.photo(c, E, this.cr); if (alpha > 0) vj.layer(this, c, A, E, t, alpha, 'source-over'); E.cutHeader(c, E.pal);
   
  },
});
