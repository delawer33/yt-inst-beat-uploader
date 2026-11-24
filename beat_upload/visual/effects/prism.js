/* Prism: a long quartz crystal, a hexagonal prism with two pointed tips, ray-traced in a WebGL
 * fragment shader: refraction through the glass with internal bounces, strong dispersion that
 * paints rainbow fire along the edges, Fresnel reflections of a dark studio, bloom. It leans and
 * turns slowly; the kick flares the light, the snare throws a glint. Clear, smoky or amethyst
 * per Beat. No cover. */
(function () {
  'use strict';
  const GLASS = [{ tint: [0.97, 0.98, 0.995], disp: 0.06 }, { tint: [0.85, 0.72, 0.97], disp: 0.05 }, { tint: [0.8, 0.8, 0.82], disp: 0.045 }, { tint: [0.7, 0.95, 0.98], disp: 0.05 }];
  const VS = '#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv = p; gl_Position = vec4(p, 0., 1.); }';
  const FS = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform vec2 res; uniform float t, kick, ior, disp, zoom, glow; uniform mat3 rot; uniform vec3 tint, key; uniform int np; uniform vec4 planes[64];
vec3 env(vec3 d) {
  float k = pow(max(0., dot(d, key)), 5.), r = pow(max(0., dot(d, normalize(vec3(0.7, -0.4, -0.5)))), 12.), h = exp(-abs(d.y + 0.1) * 10.) * 0.5, s = pow(max(0., dot(d, normalize(vec3(-0.3, 0.9, 0.4)))), 50.);
  return vec3(0.035, 0.035, 0.05) + vec3(1.0, 0.96, 0.9) * k * (1.3 + kick * 1.2) + vec3(0.45, 0.65, 1.0) * r * 1.1 + vec3(1.0, 0.8, 0.6) * pow(max(0., dot(d, normalize(vec3(-0.8, 0.1, 0.6)))), 10.) * 0.7 + vec3(1.0) * h * 0.3 + vec3(1.0) * s * 4.0;
}
bool enter(vec3 ro, vec3 rd, out float t0, out int i0) { t0 = -1e9; float t1 = 1e9; i0 = -1; for (int i = 0; i < 64; i++) { if (i >= np) break; vec3 n = planes[i].xyz; float dn = dot(rd, n), tp = planes[i].w - dot(ro, n); if (abs(dn) < 1e-7) { if (tp < 0.) return false; continue; } float tt = tp / dn; if (dn < 0.) { if (tt > t0) { t0 = tt; i0 = i; } } else t1 = min(t1, tt); } return t1 > t0 && t0 > 0.; }
float leave(vec3 ro, vec3 rd, out int id) { float t1 = 1e9; id = 0; for (int i = 0; i < 64; i++) { if (i >= np) break; vec3 n = planes[i].xyz; float dn = dot(rd, n); if (dn > 1e-7) { float tt = (planes[i].w - dot(ro, n)) / dn; if (tt < t1) { t1 = tt; id = i; } } } return max(t1, 0.); }
float fres(float c, float r0) { return r0 + (1. - r0) * pow(1. - clamp(c, 0., 1.), 5.); }
vec3 inside(vec3 p, vec3 rd, vec3 n, float eta) {
  float r0 = (eta - 1.) / (eta + 1.); r0 *= r0; vec3 acc = vec3(0.), th = vec3(1.), d = refract(rd, n, 1. / eta), q = p + d * 1e-4;
  for (int b = 0; b < 4; b++) { int id; float te = leave(q, d, id); q += d * te; vec3 nn = planes[id].xyz; th *= pow(tint, vec3(te)); vec3 rr = refract(d, -nn, eta);
    if (dot(rr, rr) < 1e-6) { d = reflect(d, nn); q += d * 1e-4; continue; } float F = fres(dot(d, nn), r0); acc += th * (1. - F) * env(rr); th *= F; d = reflect(d, nn); q += d * 1e-4; if (max(th.r, max(th.g, th.b)) < 0.02) break; }
  return acc + th * env(d) * 0.6;
}
void main() {
  vec2 p = uv * vec2(res.x / res.y, 1.0); vec3 ro = rot * vec3(0., 0., 5.5), rd = rot * normalize(vec3(p * 0.62 * zoom, -1.6));
  float t0; int i0; if (!enter(ro, rd, t0, i0)) { o = vec4(0.); return; }
  vec3 hp = ro + rd * t0, n = planes[i0].xyz; float r0 = (ior - 1.) / (ior + 1.); r0 *= r0; float F = fres(dot(-rd, n), r0);
  vec3 col = F * env(reflect(rd, n));
  col.r += (1. - F) * inside(hp, rd, n, ior * (1. - disp)).r; col.g += (1. - F) * inside(hp, rd, n, ior).g; col.b += (1. - F) * inside(hp, rd, n, ior * (1. + disp)).b;
  col += vec3(1.) * pow(max(0., dot(reflect(rd, n), key)), 300.) * 2.5 * (1. + kick) + tint * glow * 0.06;
  col = 1. - exp(-col * 1.5); o = vec4(col, 1.);
}`;
  const st = { gl: null, key: '', glass: GLASS[0], planes: [], dust: [], flare: 0, pulse: 0 };
  function mkGL(E, w, h) {
    const cv = E.mkCanvas(w, h), gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true }); if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; for (const n of ['res', 't', 'kick', 'ior', 'disp', 'zoom', 'glow', 'rot', 'tint', 'key', 'np', 'planes']) U[n] = gl.getUniformLocation(pr, n); return { cv, gl, U };
  }
  function quartz() { // a hexagonal prism, radius 0.42, body from -1 to 1, tips to ±1.7
    const P = [], add = (n, pt) => { const l = Math.hypot(...n), u = n.map(v => v / l); P.push([u[0], u[1], u[2], u[0] * pt[0] + u[1] * pt[1] + u[2] * pt[2]]); };
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.2832; add([Math.cos(a), 0, Math.sin(a)], [0.42 * Math.cos(a), 0, 0.42 * Math.sin(a)]); add([0.7 * Math.cos(a), 0.42, 0.7 * Math.sin(a)], [0, 1.7, 0]); add([0.7 * Math.cos(a), -0.42, 0.7 * Math.sin(a)], [0, -1.7, 0]); }
    return P;
  }
  const rotY = a => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]], rotZ = a => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]], rotX = a => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const mul = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j])), colMajor = M => [M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]];
  function build(E) {
    const q = window.__render ? 2 : 1, w = /* the Render traces through SwiftShader: half size, the bloom hides it */ Math.round(E.W / (E.S * q)), h = Math.round(E.H / (E.S * q)); try { st.gl = mkGL(E, w, h); } catch (e) { st.gl = null; st.err = e.message; }
    st.glass = GLASS[Math.floor(Math.random() * GLASS.length)]; st.planes = quartz(); st.dust = []; for (let i = 0; i < 90; i++) st.dust.push({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random(), ph: Math.random() * 6.28 });
    if (st.gl) { const { gl, U } = st.gl; gl.uniform4fv(U.planes, new Float32Array(st.planes.flat())); gl.uniform1i(U.np, st.planes.length); gl.uniform2f(U.res, w, h); }
    st.key = E.W + '';
  }
  function tiny(c, E, col, muted) { const { W, S, meta } = E, yt = E.FMT === 'yt', y = (yt ? 44 : 160) * S; c.save(); c.letterSpacing = 2.5 * S + 'px'; E.mono(c, meta.title.toUpperCase(), 28 * S, y, 12 * S, col); E.mono(c, meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 28 * S, y + 20 * S, 10 * S, muted); const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '); if (facts) E.mono(c, facts, W - 28 * S, y, 12 * S, col, 'right'); c.restore(); }
  BeatVisual.register({
    id: 'prism', name: 'Prism', fam: 'gen',
    blurb: 'Длинный кристалл кварца, шестигранная призма с двумя остриями, просчитанный лучами в шейдере: преломление сквозь стекло с внутренними отражениями, сильная дисперсия рисует радужный огонь по рёбрам, френелевские блики тёмной студии, блюм. Наклонён и медленно вращается; кик вспыхивает светом, снэр бросает блик. Прозрачный, дымчатый или аметист на каждый бит. Без обложки.',
    init(E) { build(E); st.flare = 0; st.pulse = 0; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== W + '') build(E); const t = A.t, [tr, tg, tb] = st.glass.tint;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const vg = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.6); vg.addColorStop(0, `rgba(${Math.round(tr * 120)},${Math.round(tg * 120)},${Math.round(tb * 140)},0.14)`); vg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') { st.pulse = 1; st.flare = 1; } st.pulse *= 0.88; st.flare *= 0.86; if (A.snareHit) st.flare = Math.max(st.flare, 0.7);
      c.fillStyle = 'rgba(255,255,255,0.35)'; for (const d of st.dust) { d.y -= 0.0004 * d.s; if (d.y < -0.05) d.y = 1.05; const sz = (0.6 + d.s) * S; c.globalAlpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.5 + d.ph)); c.fillRect(d.x * W + Math.sin(t * 0.3 + d.ph) * 10 * S, d.y * H, sz, sz); } c.globalAlpha = 1;
      if (!st.gl) { E.mono(c, 'WEBGL OFF ' + (st.err || ''), 28 * S, H / 2, 11 * S, '#f55'); tiny(c, E, '#fff', 'rgba(255,255,255,0.55)'); return; }
      const { gl, U, cv } = st.gl, spin = t * 0.45, lean = (yt ? 1.1 : 0.55) + 0.12 * Math.sin(t * 0.3), tilt = 0.25 * Math.sin(t * 0.21), Minv = mul(rotY(-spin), mul(rotZ(-lean), rotX(-tilt))), ka = t * 0.4, key = [Math.cos(ka) * 0.6, 0.7, Math.sin(ka) * 0.6 + 0.3], kl = Math.hypot(...key);
      gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.t, t); gl.uniform1f(U.kick, Math.min(1.5, A.kick + st.flare)); gl.uniform1f(U.ior, 1.6); gl.uniform1f(U.disp, st.glass.disp); gl.uniform1f(U.zoom, (yt ? 1.25 : 1.4) / (1 + 0.03 * st.pulse)); gl.uniform1f(U.glow, 0.5 + 0.5 * A.bands[1]);
      gl.uniformMatrix3fv(U.rot, false, new Float32Array(colMajor(Minv))); gl.uniform3f(U.tint, tr, tg, tb); gl.uniform3f(U.key, key[0] / kl, key[1] / kl, key[2] / kl);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.globalCompositeOperation = 'lighter'; c.filter = `blur(${18 * S}px)`; c.globalAlpha = 0.55 + 0.3 * st.flare; c.drawImage(cv, 0, 0, W, H); c.restore();
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, W, H);
      tiny(c, E, '#fff', 'rgba(255,255,255,0.55)');
    },
  });
})();
