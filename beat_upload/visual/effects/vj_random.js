// VJ Cut · random: the five treatments at full strength, switched not on the beat but at random
// moments (0.35–1.6 s apart, seeded, so a Beat renders the same twice), never the same one twice
// in a row. No negative flash. Helpers: BeatVisual.vj from vjcut.js, read at draw time.
BeatVisual.register({
  id: 'vj_random', fam: 'cut', name: 'VJ Cut · вразнобой', how: 'headless', clip: 'live',
  blurb: 'Те же пять трактовок в полную силу, но смена не по биту: случайные моменты с паузой 0,35–1,6 с, подряд одна и та же не повторяется. Без негатива.',
  init() { this.i = 0; this.left = 0; this.off = null; },
  draw(c, A, E) {
    const vj = BeatVisual.vj, ORDER = vj.ORDER;
    if (this.left <= 0) { let n; do n = Math.floor(Math.random() * ORDER.length); while (n === this.i); this.i = n; this.left = Math.round(30 * (0.35 + Math.random() * 1.25)); }
    this.left--;
    vj.layer(this, c, A, E, ORDER[this.i], 1, 'source-over'); E.cutHeader(c, E.pal);
  },
});
