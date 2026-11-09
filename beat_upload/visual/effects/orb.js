/* Orb: a glass sphere ray-traced in a WebGL fragment shader with a burning core inside and three
 * bright motes orbiting it, seen through real refraction and internal reflections, Fresnel
 * reflections of a dark studio, bloom on top. The core breathes with the level and flares on the
 * kick, the snare throws a glint on the glass. Blue, magenta, gold or white per Beat. No cover. */
(function () {
  'use strict';
  const CORES = [[0.4, 0.7, 1.0], [1.0, 0.4, 0.8], [1.0, 0.8, 0.4], [0.95, 0.95, 1.0]];
  const VS = '#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv = p; gl_Position = vec4(p, 0., 1.); }';
  const FS = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform vec2 res; uniform float t, kick, level, zoom; uniform vec3 core, key;
vec3 env(vec3 d) {
  float k = pow(max(0., dot(d, key)), 6.), r = pow(max(0., dot(d, normalize(vec3(0.7, -0.4, -0.5)))), 14.), h = exp(-abs(d.y + 0.1) * 12.) * 0.5, s = pow(max(0., dot(d, normalize(vec3(0.2, 0.9, -0.4)))), 40.);
  return vec3(0.035, 0.035, 0.05) + vec3(1.0, 0.96, 0.9) * k * (1.3 + kick * 1.2) + vec3(0.45, 0.65, 1.0) * r * 1.1 + vec3(1.0, 0.8, 0.6) * pow(max(0., dot(d, normalize(vec3(-0.8, 0.1, 0.6)))), 10.) * 0.7 + vec3(1.0) * h * 0.3 + vec3(1.0) * s * 4.0;
}
float fres(float c, float r0) { return r0 + (1. - r0) * pow(1. - clamp(c, 0., 1.), 5.); }
vec3 emis(vec3 q, vec3 d, float tmax) { // light gathered along a segment inside the glass: the core and three motes
  float tc = clamp(-dot(q, d), 0., tmax), dm = length(q + d * tc); vec3 e = core * (2.2 + 2.0 * kick + 1.0 * level) * exp(-dm * dm * 34.) + vec3(1.0) * (0.8 + kick) * exp(-dm * dm * 120.) + core * 0.1 * exp(-dm * dm * 4.);
  for (int i = 0; i < 3; i++) { float a = t * (0.5 + 0.22 * float(i)) + float(i) * 2.1; vec3 m = vec3(cos(a) * 0.62, sin(a * 0.7 + float(i)) * 0.32, sin(a) * 0.62); float tm = clamp(dot(m - q, d), 0., tmax), dd = length(q + d * tm - m); e += vec3(1.0, 0.97, 0.92) * 1.2 * exp(-dd * dd * 500.) + vec3(0.8, 0.9, 1.0) * 0.12 * exp(-dd * dd * 40.); }
  return e;
}
void main() {
  vec2 p = uv * vec2(res.x / res.y, 1.0); vec3 ro = vec3(0., 0., 4.5), rd = normalize(vec3(p * 0.62 * zoom, -1.6));
  float b = dot(ro, rd), cc = dot(ro, ro) - 1., hh = b * b - cc; if (hh < 0.) { o = vec4(0.); return; }
  float t0 = -b - sqrt(hh); vec3 hp = ro + rd * t0, n = hp; float ior = 1.5, r0 = (ior - 1.) / (ior + 1.); r0 *= r0; float F = fres(dot(-rd, n), r0);
  vec3 col = F * env(reflect(rd, n)); float th = 1. - F; vec3 d = refract(rd, n, 1. / ior), q = hp;
  for (int k = 0; k < 3; k++) { float te = -2. * dot(q, d); col += th * emis(q, d, te); q += d * te; vec3 nn = normalize(q); vec3 rr = refract(d, -nn, ior); if (dot(rr, rr) < 1e-6) { d = reflect(d, nn); continue; } float F2 = fres(dot(d, nn), r0); col += th * (1. - F2) * env(rr); th *= F2; d = reflect(d, nn); if (th < 0.02) break; }
  col += vec3(1.) * pow(max(0., dot(reflect(rd, n), key)), 400.) * 3. * (1. + kick);
  col = 1. - exp(-col * 1.25); o = vec4(col, 1.);
}`;
  const st = { gl: null, key: '', core: CORES[0], dust: [], flare: 0, pulse: 0 };
  function mkGL(E, w, h) {
    const cv = E.mkCanvas(w, h), gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true }); if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; for (const n of ['res', 't', 'kick', 'level', 'zoom', 'core', 'key']) U[n] = gl.getUniformLocation(pr, n); return { cv, gl, U };
  }
  function build(E) {
    const q = window.__render ? 2 : 1, w = /* the Render traces through SwiftShader: half size, the bloom hides it */ Math.round(E.W / (E.S * q)), h = Math.round(E.H / (E.S * q)); try { st.gl = mkGL(E, w, h); } catch (e) { st.gl = null; st.err = e.message; }
    st.core = CORES[Math.floor(Math.random() * CORES.length)]; st.dust = []; for (let i = 0; i < 90; i++) st.dust.push({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random(), ph: Math.random() * 6.28 });
    if (st.gl) st.gl.gl.uniform2f(st.gl.U.res, w, h); st.key = E.W + '';
  }
  function tiny(c, E, col, muted) { const { W, S, meta } = E, yt = E.FMT === 'yt', y = (yt ? 44 : 160) * S; c.save(); c.letterSpacing = 2.5 * S + 'px'; E.mono(c, meta.title.toUpperCase(), 28 * S, y, 12 * S, col); E.mono(c, meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 28 * S, y + 20 * S, 10 * S, muted); const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '); if (facts) E.mono(c, facts, W - 28 * S, y, 12 * S, col, 'right'); c.restore(); }
  BeatVisual.register({
    id: 'orb', name: 'Orb', fam: 'gen',
    blurb: 'Стеклянная сфера, просчитанная лучами в шейдере: внутри горящее ядро и три яркие искры на орбите, видимые сквозь настоящее преломление и внутренние отражения, френелевские блики тёмной студии, блюм. Ядро дышит уровнем и вспыхивает на кике, снэр бросает блик по стеклу. Синее, маджента, золото или белое на каждый бит. Без обложки.',
    init(E) { build(E); st.flare = 0; st.pulse = 0; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== W + '') build(E); const t = A.t, [cr, cg, cb] = st.core;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const vg = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.6); vg.addColorStop(0, `rgba(${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)},${0.12 + 0.08 * A.kick})`); vg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') { st.pulse = 1; st.flare = 1; } st.pulse *= 0.88; st.flare *= 0.86; if (A.snareHit) st.flare = Math.max(st.flare, 0.7);
      c.fillStyle = 'rgba(255,255,255,0.35)'; for (const d of st.dust) { d.y -= 0.0004 * d.s; if (d.y < -0.05) d.y = 1.05; const sz = (0.6 + d.s) * S; c.globalAlpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.5 + d.ph)); c.fillRect(d.x * W + Math.sin(t * 0.3 + d.ph) * 10 * S, d.y * H, sz, sz); } c.globalAlpha = 1;
      if (!st.gl) { E.mono(c, 'WEBGL OFF ' + (st.err || ''), 28 * S, H / 2, 11 * S, '#f55'); tiny(c, E, '#fff', 'rgba(255,255,255,0.55)'); return; }
      const { gl, U, cv } = st.gl, ka = t * 0.45, key = [Math.cos(ka) * 0.6, 0.75, Math.sin(ka) * 0.6 + 0.3], kl = Math.hypot(...key);
      gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.t, t); gl.uniform1f(U.kick, Math.min(1.5, A.kick + 0.5 * st.flare)); gl.uniform1f(U.level, A.level); gl.uniform1f(U.zoom, (yt ? 1.15 : 1.5) / (1 + 0.03 * st.pulse)); gl.uniform3f(U.core, cr, cg, cb); gl.uniform3f(U.key, key[0] / kl, key[1] / kl, key[2] / kl);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.globalCompositeOperation = 'lighter'; c.filter = `blur(${22 * S}px)`; c.globalAlpha = 0.6 + 0.3 * st.flare; c.drawImage(cv, 0, 0, W, H); c.restore();
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, W, H);
      tiny(c, E, '#fff', 'rgba(255,255,255,0.55)');
    },
  });
})();
