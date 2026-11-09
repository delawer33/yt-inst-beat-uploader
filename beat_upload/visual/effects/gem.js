/* Gem: a brilliant-cut stone ray-traced in a WebGL fragment shader: real refraction through the
 * facets with up to four internal bounces, Fresnel reflections of a dark studio, dispersion that
 * splits the light into colour, absorption that gives the stone its body colour, a bloom on top.
 * It turns slowly in the dark with dust around it; the kick flares the key light and pulses the
 * stone, the snare throws a glint. Ruby, diamond, sapphire, emerald or amber per Beat. No cover. */
(function () {
  'use strict';
  const STONES = [{ tint: [0.95, 0.3, 0.38], disp: 0.04 }, { tint: [0.985, 0.985, 0.985], disp: 0.08 }, { tint: [0.4, 0.55, 0.98], disp: 0.04 }, { tint: [0.4, 0.95, 0.6], disp: 0.035 }, { tint: [0.98, 0.75, 0.3], disp: 0.045 }];
  const VS = '#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv = p; gl_Position = vec4(p, 0., 1.); }';
  const FS = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform vec2 res; uniform float t, kick, ior, disp, zoom, glow; uniform mat3 rot; uniform vec3 tint, key; uniform int np; uniform vec4 planes[64];
vec3 env(vec3 d) { // a bright studio, steady: a slatted dome, two soft panels, a horizon, the key and a hot spot; the kick does not light the stone
  float k = pow(max(0., dot(d, key)), 6.), top = smoothstep(0.1, 0.9, d.y), l = pow(max(0., dot(d, normalize(vec3(-0.8, 0.3, 0.4)))), 3.), r = pow(max(0., dot(d, normalize(vec3(0.7, -0.4, -0.5)))), 4.), h = exp(-abs(d.y + 0.1) * 8.) * 0.5, s = pow(max(0., dot(d, normalize(vec3(0.2, 0.9, -0.4)))), 40.), slats = 0.75 + 0.25 * smoothstep(-0.2, 0.2, sin(atan(d.x, d.z) * 16.));
  return vec3(0.12, 0.12, 0.15) + vec3(1.0, 0.96, 0.9) * k * (2.4 + kick * 1.2) + vec3(1.0, 0.97, 0.92) * top * 0.9 * slats + vec3(0.9, 0.85, 0.8) * l * 0.8 + vec3(0.45, 0.65, 1.0) * r * 1.2 + vec3(1.0) * h * 0.5 + vec3(1.0) * s * 6.0;
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
  vec2 p = uv * vec2(res.x / res.y, 1.0); vec3 ro = rot * vec3(0., 0., 4.5), rd = rot * normalize(vec3(p * 0.62 * zoom, -1.6));
  float t0; int i0; if (!enter(ro, rd, t0, i0)) { o = vec4(0.); return; }
  vec3 hp = ro + rd * t0, n = planes[i0].xyz; float r0 = (ior - 1.) / (ior + 1.); r0 *= r0; float F = fres(dot(-rd, n), r0);
  vec3 col = F * env(reflect(rd, n));
  col.r += (1. - F) * inside(hp, rd, n, ior * (1. - disp)).r; col.g += (1. - F) * inside(hp, rd, n, ior).g; col.b += (1. - F) * inside(hp, rd, n, ior * (1. + disp)).b;
  col += vec3(1.) * pow(max(0., dot(reflect(rd, n), key)), 300.) * 2.5 * (1. + kick) + tint * glow * 0.12;
  col = 1. - exp(-col * 1.5); o = vec4(col, 1.);
}`;
  const st = { gl: null, key: '', stone: STONES[0], planes: [], dust: [], flare: 0, pulse: 0 };
  function mkGL(E, w, h) {
    const cv = E.mkCanvas(w, h), gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true }); if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; for (const n of ['res', 't', 'kick', 'ior', 'disp', 'zoom', 'glow', 'rot', 'tint', 'key', 'np', 'planes']) U[n] = gl.getUniformLocation(pr, n); return { cv, gl, U };
  }
  function brilliant() { // the planes of a brilliant cut: table, bezel and star facets, girdle, two rows of pavilion facets
    const P = [], add = (n, pt) => { const l = Math.hypot(...n), u = n.map(v => v / l); P.push([u[0], u[1], u[2], u[0] * pt[0] + u[1] * pt[1] + u[2] * pt[2]]); };
    add([0, 1, 0], [0, 0.5, 0]);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832, a2 = (i + 0.5) / 8 * 6.2832; add([0.5 * Math.cos(a), 0.45, 0.5 * Math.sin(a)], [Math.cos(a), 0, Math.sin(a)]); add([0.5 * Math.cos(a2), 0.38, 0.5 * Math.sin(a2)], [Math.cos(a2), 0, Math.sin(a2)]); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.2832; add([Math.cos(a), 0, Math.sin(a)], [Math.cos(a), 0, Math.sin(a)]); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832, a2 = (i + 0.5) / 8 * 6.2832; add([1.3 * Math.cos(a), -1, 1.3 * Math.sin(a)], [0, -1.3, 0]); add([1.25 * Math.cos(a2), -1, 1.25 * Math.sin(a2)], [0, -1.25, 0]); }
    return P;
  }
  const rotX = a => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]], rotY = a => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const mul = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j])), colMajor = M => [M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]];
  function build(E) {
    const q = window.__hq ? 0.5 : window.__render ? 2 : 1, w = /* the Render traces through SwiftShader: half size, the bloom hides it; twice the size (2x2 supersampling) under __hq */ Math.round(E.W / (E.S * q)), h = Math.round(E.H / (E.S * q)); try { st.gl = mkGL(E, w, h); } catch (e) { st.gl = null; st.err = e.message; }
    const pick = window.__bake && window.__bake.stone !== undefined ? window.__bake.stone : window.__stone; st.stone = STONES[pick !== undefined ? pick : Math.floor(Math.random() * STONES.length)]; /* the Render names the stone (bake.py: the Beat's seed), the Lab draws lots */ st.planes = brilliant(); st.dust = []; for (let i = 0; i < 90; i++) st.dust.push({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random(), ph: Math.random() * 6.28 });
    if (st.gl) { const { gl, U } = st.gl; gl.uniform4fv(U.planes, new Float32Array(st.planes.flat())); gl.uniform1i(U.np, st.planes.length); gl.uniform2f(U.res, w, h); }
    st.key = E.W + '';
  }
  function tiny(c, E, col, muted) { const { W, S, meta } = E, yt = E.FMT === 'yt', y = (yt ? 44 : 160) * S; c.save(); c.letterSpacing = 2.5 * S + 'px'; E.mono(c, meta.title.toUpperCase(), 28 * S, y, 12 * S, col); E.mono(c, meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 28 * S, y + 20 * S, 10 * S, muted); const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '); if (facts) E.mono(c, facts, W - 28 * S, y, 12 * S, col, 'right'); c.restore(); }
  BeatVisual.register({
    id: 'gem', name: 'Gem', fam: 'gen',
    blurb: 'Бриллиантовая огранка, просчитанная лучами в шейдере: настоящее преломление сквозь грани с внутренними отражениями, френелевские блики тёмной студии, дисперсия раскладывает свет на цвета, поглощение даёт камню цвет, сверху блюм. Медленно вращается в темноте среди пыли; свет и камера не реагируют на бит. Рубин, бриллиант, сапфир, изумруд или янтарь на каждый бит. Без обложки.',
    init(E) { build(E); st.flare = 0; st.pulse = 0; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== W + '') build(E); const t = A.t, [tr, tg, tb] = st.stone.tint;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const vg = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.6); vg.addColorStop(0, `rgba(${Math.round(tr * 255)},${Math.round(tg * 255)},${Math.round(tb * 255)},0.14)`); vg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      if (A.cut && A.cutKind === 'kick') { st.pulse = 1; st.flare = 1; } st.pulse *= 0.88; st.flare *= 0.86; if (A.snareHit) st.flare = Math.max(st.flare, 0.7);
      c.fillStyle = 'rgba(255,255,255,0.35)'; for (const d of st.dust) { d.y -= 0.0004 * d.s; if (d.y < -0.05) d.y = 1.05; const sz = (0.6 + d.s) * S; c.globalAlpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.5 + d.ph)); c.fillRect(d.x * W + Math.sin(t * 0.3 + d.ph) * 10 * S, d.y * H, sz, sz); } c.globalAlpha = 1;
      if (!st.gl) { E.mono(c, 'WEBGL OFF ' + (st.err || ''), 28 * S, H / 2, 11 * S, '#f55'); tiny(c, E, '#fff', 'rgba(255,255,255,0.55)'); return; }
      const w0 = 2 * Math.PI / 24, bk = !!window.__bake; /* a bake loops every 24 s: every rate is then a multiple of w0 */ const { gl, U, cv } = st.gl, spin = t * (bk ? w0 : 0.32), tilt = 0.42 + 0.15 * Math.sin(t * (bk ? 2 * w0 : 0.4)), Minv = mul(rotX(-tilt), rotY(-spin)), ka = t * (bk ? 2 * w0 : 0.5), key = [Math.cos(ka) * 0.6, 0.75, Math.sin(ka) * 0.6 + 0.3], kl = Math.hypot(...key);
      gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.t, t); gl.uniform1f(U.kick, 0); /* steady light and camera: the kick never reaches the shader */ gl.uniform1f(U.ior, 2.4); gl.uniform1f(U.disp, st.stone.disp); gl.uniform1f(U.zoom, yt ? 1.65 : 2.3); gl.uniform1f(U.glow, 0.7);
      gl.uniformMatrix3fv(U.rot, false, new Float32Array(colMajor(Minv))); gl.uniform3f(U.tint, tr, tg, tb); gl.uniform3f(U.key, key[0] / kl, key[1] / kl, key[2] / kl);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.globalCompositeOperation = 'lighter'; c.filter = `blur(${18 * S}px)`; c.globalAlpha = 0.6; c.drawImage(cv, 0, 0, W, H); c.restore();
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, W, H);
      if (!window.__bake) tiny(c, E, '#fff', 'rgba(255,255,255,0.55)'); /* a bake has no header: the Reel gets it from header.py */
    },
  });
})();
