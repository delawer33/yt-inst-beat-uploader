// VJ Cut · alternate: the plain picture (a new plan) on every other cut, a treatment at 70 % in between.
// Helpers: BeatVisual.vj from vjcut.js, read at draw time (that file loads after this one).
BeatVisual.register({
  id: 'vj_alt', fam: 'cut', name: 'VJ Cut · через раз', how: 'headless', clip: 'live',
  blurb: 'Чистая картинка через одну склейку: видео → ASCII → видео → Riso → … На склейке с картинкой меняется план (кроп по точкам контраста), трактовки лежат поверх на 70 %. Половина времени — просто картинка.',
  init() { this.i = -1; this.flash = 0; this.off = null; this.cr = null; },
  draw(c, A, E) {
    const vj = BeatVisual.vj, ORDER = vj.ORDER;
    if (A.cut || !this.cr) { this.i++; if (this.i % 2 === 0) this.cr = vj.plan(E, 1.5); } if (A.snareHit) this.flash = 2;
    const onPhoto = this.i % 2 === 0, t = ORDER[Math.floor(this.i / 2) % ORDER.length];
    if (onPhoto) vj.photo(c, E, this.cr); else { vj.photo(c, E); vj.layer(this, c, A, E, t, 0.7, vj.blendFor(t)); }
    E.cutHeader(c, E.pal); if (this.flash > 0) { this.flash--; vj.negative(c, E); }
  },
});
