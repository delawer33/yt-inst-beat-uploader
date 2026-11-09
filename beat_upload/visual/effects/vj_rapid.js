// VJ Cut · rapid: the five treatments at full strength, switched far more often and less evenly
// than vj_random: a hold is 0.12–0.55 s drawn from a skewed distribution (most holds short, a
// few long), every switch also re-plans the crop (a random zoom and anchor on the real cover),
// and now and then a burst fires three or four switches in a row within half a second. Never
// the same treatment twice in a row. Seeded, so a Beat renders the same twice.
// Helpers: BeatVisual.vj from vjcut.js, read at draw time.
BeatVisual.register({
  id: 'vj_rapid', fam: 'cut', name: 'VJ Cut · частый', how: 'headless', clip: 'live',
  blurb: 'Те же пять трактовок в полную силу, но смена в 3–4 раза чаще и неровнее: пауза 0,12–0,55 с (чаще короткая, изредка длинная), с каждой сменой новый план на обложке, иногда очередь из трёх-четырёх смен за полсекунды. Подряд одна и та же не повторяется.',
  init() { this.i = 0; this.left = 0; this.burst = 0; this.off = null; this.cr = null; },
  draw(c, A, E) {
    const vj = BeatVisual.vj, ORDER = vj.ORDER, fps = 30;
    if (this.left <= 0) {
      let n; do n = Math.floor(Math.random() * ORDER.length); while (n === this.i); this.i = n;
      this.cr = vj.plan(E, 1.8);
      if (this.burst > 0) { this.burst--; this.left = Math.round(fps * (0.1 + Math.random() * 0.07)); }
      else if (Math.random() < 0.18) { this.burst = 2 + Math.floor(Math.random() * 2); this.left = Math.round(fps * 0.12); }
      else { const u = Math.random(); this.left = Math.round(fps * (0.12 + 0.43 * u * u)); }
    }
    this.left--;
    const t = ORDER[this.i];
    vj.photo(c, E, this.cr); vj.layer(this, c, A, E, t, 1, 'source-over'); E.cutHeader(c, E.pal);
  },
});
