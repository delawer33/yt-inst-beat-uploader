// VJ Cut · hard: the VJ Cut cycle at full strength, the treatment replaces the picture (the first VJ Cut).
// Helpers: BeatVisual.vj from vjcut.js, read at draw time (that file loads after this one).
BeatVisual.register({
  id: 'vj_hard', fam: 'cut', name: 'VJ Cut · жёсткий', how: 'headless', clip: 'live',
  blurb: 'Тот же цикл ASCII → Riso → Plates → Type Screen → Cover Style в полную силу: трактовка заменяет картинку целиком, видны только знаки, точки и плашки. Первый VJ Cut.',
  init() { this.i = 0; this.off = null; },
  draw(c, A, E) {
    const vj = BeatVisual.vj, ORDER = vj.ORDER;
    if (A.cut) this.i = (this.i + 1) % ORDER.length; const t = ORDER[this.i];
    vj.layer(this, c, A, E, t, 1, 'source-over'); E.cutHeader(c, E.pal);
  },
});
