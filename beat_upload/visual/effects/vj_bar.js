// VJ Cut · bar accent: the picture with a new plan on every cut; a full-strength treatment only on the
// first cut of a bar, for one cut.
// Helpers: BeatVisual.vj from vjcut.js, read at draw time (that file loads after this one).
BeatVisual.register({
  id: 'vj_bar', fam: 'cut', name: 'VJ Cut · акцент на такт', how: 'headless', clip: 'live',
  blurb: 'Картинка и смена плана на каждой склейке, трактовка в полную силу только на первой склейке такта и живёт одну склейку. Три четверти времени — чистая картинка, раз в такт — удар стилем.',
  init() { this.i = 0; this.on = false; this.armed = true; this.off = null; this.cr = null; },
  draw(c, A, E) {
    const vj = BeatVisual.vj, ORDER = vj.ORDER;
    if (A.barHit) this.armed = true;
    if (A.cut || !this.cr) { this.cr = vj.plan(E, 1.5); if (this.armed) { this.on = true; this.armed = false; this.i = (this.i + 1) % ORDER.length; } else this.on = false; }
    const t = ORDER[this.i]; vj.photo(c, E, this.cr); if (this.on) vj.layer(this, c, A, E, t, 1, 'source-over'); E.cutHeader(c, E.pal);
   
  },
});
