/* Dagger: a brushed steel blade with a fuller and a central ridge, gold crossguard with curled quillons and a
 * boss, leather grip with a twisted gold wire wrap between two ferrules, gold pommel; ray-marched in a WebGL
 * shader with soft shadows, turning slowly in grey smoke over black, sparks falling from the point. The kick throws sparks; the light and the camera do not react to the beat. No cover. */
(function () {
  'use strict';
  const VS = '#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv = p; gl_Position = vec4(p, 0., 1.); }';
  const FS = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform vec2 res; uniform float t, kick, zoom, level, phase, dir; uniform mat3 rot; uniform vec3 key, cam, eTop, eL, eR, eH;
float sdBox(vec3 p, vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float sdSphere(vec3 p,float r){return length(p)-r;}
float sdEll(vec3 p,vec3 r){float k0=length(p/r);float k1=length(p/(r*r));return k0*(k0-1.)/k1;}
float sdTorus(vec3 p,vec2 tt){vec2 q=vec2(length(p.xz)-tt.x,p.y);return length(q)-tt.y;}
float sdCyl(vec3 p,float h,float r){vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float sdLink(vec3 p,float le,float r1,float r2){vec3 q=vec3(p.x,max(abs(p.y)-le,0.),p.z);return length(vec2(length(q.xy)-r1,q.z))-r2;}
float sdCone(vec3 p,float h,float r1,float r2){vec2 q=vec2(length(p.xz),p.y);vec2 k1=vec2(r2,h);vec2 k2=vec2(r2-r1,2.*h);vec2 ca=vec2(q.x-min(q.x,(q.y<0.)?r1:r2),abs(q.y)-h);vec2 cb=q-k1+k2*clamp(dot(k1-q,k2)/dot(k2,k2),0.,1.);float s=(cb.x<0.&&ca.y<0.)?-1.:1.;return s*sqrt(min(dot(ca,ca),dot(cb,cb)));}
float sdPyramid(vec3 p,float h){float m2=h*h+0.25;p.xz=abs(p.xz);p.xz=(p.z>p.x)?p.zx:p.xz;p.xz-=0.5;vec3 q=vec3(p.z,h*p.y-0.5*p.x,h*p.x+0.5*p.y);float s=max(-q.x,0.);float tt=clamp((q.y-0.5*p.z)/(m2+0.25),0.,1.);float a=m2*(q.x+s)*(q.x+s)+q.y*q.y;float b=m2*(q.x+0.5*tt)*(q.x+0.5*tt)+(q.y-m2*tt)*(q.y-m2*tt);float d2=min(q.y,-q.x*m2-q.y*0.5)>0.?0.:min(a,b);return sqrt((d2+q.z*q.z)/m2)*sign(max(q.z,-p.y));}
float smin(float a,float b,float k){float h=clamp(0.5+0.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
vec2 U(vec2 a,vec2 b){return a.x<b.x?a:b;}
mat2 r2(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hash31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=0.,w=0.5;for(int i=0;i<3;i++){a+=w*noise(p);p=p*2.07+vec3(1.7);w*=0.5;}return a;}
vec3 bumpN(vec3 n,vec3 p,vec3 sc,float amt){vec3 q=p*sc;float e=0.02;vec3 g=vec3(fbm(q+vec3(e,0,0))-fbm(q-vec3(e,0,0)),fbm(q+vec3(0,e,0))-fbm(q-vec3(0,e,0)),fbm(q+vec3(0,0,e))-fbm(q-vec3(0,0,e)))/(2.*e);g-=n*dot(g,n);return normalize(n-amt*g);}
float adiff(float a,float b){return mod(a-b+3.14159,6.28318)-3.14159;}
float panel(vec3 d,float az0,float el0,float w,float h,float s){float az=atan(d.x,d.z);vec2 q=vec2(adiff(az,az0)/w,(d.y-el0)/h);vec2 e=abs(q)-1.;return 1.-smoothstep(-s,s,max(e.x,e.y));}
vec3 env(vec3 d,float ro){float s=0.1+0.9*ro;float az=atan(d.x,d.z);
  float sb=panel(d,0.,0.6,0.8,0.22,s)*(0.72+0.28*smoothstep(-0.2,0.2,sin(az*22.)));
  float dome=smoothstep(0.2,1.,d.y)*0.25;
  float l=panel(d,-1.7,0.1,0.3,0.75,s)*(0.8+0.2*smoothstep(-0.3,0.3,sin(d.y*30.)));
  float r=panel(d,1.9,-0.1,0.22,0.6,s);
  float bk=panel(d,3.14159,0.3,0.5,0.35,s)*0.35;
  float h=exp(-abs(d.y+0.1)*(16.-12.*ro))*0.35;
  float k=pow(max(0.,dot(d,key)),mix(12.,2.,ro))*(1.+1.2*kick)*mix(1.,0.4,ro);
  return eTop*(sb*1.3+dome)+eL*l*1.1+eR*r*0.9+eH*(h+bk)+vec3(1.)*k*1.2+vec3(0.012);}
vec2 map(vec3 p){p.y+=0.6;float yy=clamp((p.y-0.3)/1.7,0.,1.);float hw=mix(0.15,0.0,pow(yy,1.25));float ax=abs(p.x);
  float ridge=0.034*(1.-ax/max(hw,1e-3));float ful=0.016*smoothstep(0.05,0.012,ax)*smoothstep(0.42,0.6,p.y)*smoothstep(1.75,1.45,p.y);float th=max(ridge-ful,0.)+0.005;float blade=sdBox(p-vec3(0,1.15,0),vec3(hw,0.85,th));
  float bar=sdBox(p-vec3(0,0.25,0),vec3(0.3,0.04,0.05))-0.015;vec3 g=vec3(ax,p.y,p.z);float quil=sdTorus(vec3(g.x-0.3,g.z,g.y-0.42),vec2(0.2,0.03));quil=max(quil,max(0.3-g.x,g.y-0.42));float qb=sdSphere(g-vec3(0.5,0.42,0.),0.05);
  float boss=sdEll(p-vec3(0,0.25,0),vec3(0.09,0.1,0.075));
  float grip=sdCyl(p-vec3(0,-0.2,0),0.33,0.07);float an=atan(p.z,p.x);float rr=length(p.xz);float wire=length(vec2(rr-0.072,mod(p.y+0.2+an*0.0191,0.12)-0.06))-0.013;wire=max(wire,abs(p.y+0.2)-0.33);
  float fer=min(sdCyl(p-vec3(0,0.16,0),0.03,0.09),sdCyl(p-vec3(0,-0.56,0),0.03,0.09))-0.01;float pom=sdEll(p-vec3(0,-0.7,0),vec3(0.13,0.1,0.09));float pomRing=sdTorus(p-vec3(0,-0.62,0),vec2(0.1,0.025));
  float gold=min(min(bar,min(quil,qb)),min(min(boss,fer),min(pom,pomRing)));
  vec2 r=vec2(blade,1.);r=U(r,vec2(gold,2.));r=U(r,vec2(grip,3.));return U(r,vec2(wire,7.));}
vec3 albedoOf(int m,vec3 p){return m==1?vec3(0.92,0.93,0.95):m==3?vec3(0.14,0.08,0.05):vec3(1.0,0.78,0.36);}
float metalOf(int m){return m==3?0.0:1.0;}
float roughOf(int m,vec3 p){return m==1?0.07:m==3?0.75:m==7?0.2:0.15;}
vec3 bumpOf(int m,vec3 p,vec3 n){return m==1?bumpN(n,p,vec3(120.,3.,120.),0.012):m==3?bumpN(n,p,vec3(45.),0.3):m==2?bumpN(n,p,vec3(30.),0.03):n;}
vec3 emisOf(int m,vec3 p){return vec3(0.);}

float sdf(vec3 p){return map(p).x;}
vec3 nrm(vec3 p){vec2 e=vec2(1.5e-3,0.);return normalize(vec3(sdf(p+e.xyy)-sdf(p-e.xyy),sdf(p+e.yxy)-sdf(p-e.yxy),sdf(p+e.yyx)-sdf(p-e.yyx)));}
bool march(vec3 ro,vec3 rd,out vec3 p,out int m,out float tt){tt=0.;for(int i=0;i<128;i++){p=ro+rd*tt;vec2 h=map(p);if(h.x<0.001*tt+0.0005){m=int(h.y+0.5);return true;}tt+=h.x*0.85;if(tt>18.)break;}return false;}
float shadow(vec3 p,vec3 l){float res=1.,tt=0.03;for(int i=0;i<36;i++){float h=sdf(p+l*tt);res=min(res,10.*h/tt);if(res<0.005||tt>5.)break;tt+=clamp(h,0.01,0.25);}return clamp(res,0.,1.);}
float calcAO(vec3 p,vec3 n){float occ=0.,sca=1.;for(int i=0;i<5;i++){float h=0.012+0.09*float(i);occ+=(h-sdf(p+n*h))*sca;sca*=0.75;}return clamp(1.-1.6*occ,0.,1.);}
float fres(float c,float r0){return r0+(1.-r0)*pow(1.-clamp(c,0.,1.),5.);}
vec3 direct(vec3 p,vec3 n,vec3 v,vec3 alb,float met,float ro){vec3 l=key;float ndl=max(0.,dot(n,l));if(ndl<=0.)return vec3(0.);float sh=shadow(p+n*0.01,l);vec3 hv=normalize(l+v);float ndh=max(0.,dot(n,hv));float a=max(0.02,ro*ro);float D=a*a/(3.1416*pow(ndh*ndh*(a*a-1.)+1.,2.));vec3 F0=mix(vec3(0.04),alb,met);vec3 F=F0+(1.-F0)*pow(1.-max(0.,dot(hv,v)),5.);return ((1.-met)*alb*0.32+D*F*0.25)*ndl*sh*vec3(1.,0.97,0.92)*(2.0+2.2*kick);}
vec3 shadeAt(vec3 p,vec3 rd,int m,bool bounce){vec3 n=bumpOf(m,p,nrm(p));vec3 alb=albedoOf(m,p);float met=metalOf(m);float ro=roughOf(m,p);vec3 v=-rd;vec3 r=reflect(rd,n);vec3 F0=mix(vec3(0.04),alb,met);vec3 F=F0+(1.-F0)*pow(1.-clamp(dot(v,n),0.,1.),5.)*(1.-0.6*ro);float ao=calcAO(p,n);
  vec3 refl=env(r,ro);if(bounce){vec3 p2;int m2;float t2;if(march(p+n*0.008,r,p2,m2,t2)){vec3 n2=bumpOf(m2,p2,nrm(p2));vec3 a2=albedoOf(m2,p2);float me2=metalOf(m2),ro2=roughOf(m2,p2);vec3 F02=mix(vec3(0.04),a2,me2);vec3 c2=F02*env(reflect(r,n2),ro2)+(1.-me2)*a2*env(n2,1.)*0.5+emisOf(m2,p2)+direct(p2,n2,-r,a2,me2,ro2);refl=mix(c2,refl,clamp(t2*0.08,0.,0.6));}}
  return F*refl*ao+(1.-met)*alb*env(n,1.)*0.55*ao+direct(p,n,v,alb,met,ro)*(0.4+0.6*ao)+emisOf(m,p);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);}
void main(){vec2 q=uv*vec2(res.x/res.y,1.);vec3 ro=rot*cam,rd=rot*normalize(vec3(q*0.62*zoom,-1.6));vec3 p;int m;float tt;if(!march(ro,rd,p,m,tt)){o=vec4(0.);return;}
  vec3 col;float a=1.;
  
  {col=shadeAt(p,rd,m,true);if(m==5)a=clamp(1.6-tt*0.14,0.,1.);}
  col=pow(aces(col*1.0),vec3(0.4545));o=vec4(col*a,a);}
`;
  const st = { gl: null, key: '', flare: 0, pulse: 0, motes: [], extra: null };
  function mkGL(E, w, h) {
    const cv = E.mkCanvas(w, h), gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true }); if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; for (const n of ['res', 't', 'kick', 'zoom', 'level', 'phase', 'dir', 'rot', 'key', 'cam', 'eTop', 'eL', 'eR', 'eH']) U[n] = gl.getUniformLocation(pr, n); return { cv, gl, U };
  }
  const rotX = a => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]], rotY = a => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]], rotZ = a => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const mul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j])), colMajor = M => [M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]];
  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  function build(E) {
    const q = window.__hq ? 0.5 : window.__render ? 2 : 1, w = Math.round(E.W / (E.S * q)), h = Math.round(E.H / (E.S * q)); /* half size through SwiftShader, twice the size (2x2 supersampling) under __hq */ try { st.gl = mkGL(E, w, h); } catch (e) { st.gl = null; st.err = e.message; }
    if (st.gl) { const { gl, U } = st.gl; gl.uniform2f(U.res, w, h); gl.uniform3f(U.eTop, 0.95, 0.93, 0.9); gl.uniform3f(U.eL, 0.8, 0.7, 0.6); gl.uniform3f(U.eR, 0.6, 0.65, 0.75); gl.uniform3f(U.eH, 0.7, 0.6, 0.55); }
    st.motes = []; for (let i = 0; i < 90; i++) st.motes.push({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random(), ph: Math.random() * 6.28 }); st.extra = null;
    st.key = E.W + '';
  }
  function tiny(c, E, col, muted) { const { W, S, meta } = E, yt = E.FMT === 'yt', y = (yt ? 44 : 160) * S; c.save(); c.letterSpacing = 2.5 * S + 'px'; E.mono(c, meta.title.toUpperCase(), 28 * S, y, 12 * S, col); E.mono(c, meta.artists ? meta.artists.toUpperCase() + ' TYPE BEAT' : 'TYPE BEAT', 28 * S, y + 20 * S, 10 * S, muted); const facts = [meta.bpm ? meta.bpm + ' BPM' : '', meta.key ? meta.key.toUpperCase() : ''].filter(Boolean).join('  ·  '); if (facts) E.mono(c, facts, W - 28 * S, y, 12 * S, col, 'right'); c.restore(); }
  function motes(c, E, t, col, a0) { const { W, H, S } = E; c.fillStyle = col; for (const d of st.motes) { d.y -= 0.0004 * d.s; if (d.y < -0.05) d.y = 1.05; const sz = (0.6 + d.s) * S; c.globalAlpha = a0 * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.5 + d.ph))); c.fillRect(d.x * W + Math.sin(t * 0.3 + d.ph) * 10 * S, d.y * H, sz, sz); } c.globalAlpha = 1; }
  function vignette(c, E, rgb, a) { const { W, H } = E; const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.62); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  BeatVisual.register({
    id: 'dagger', name: 'Dagger', fam: 'gen',
    blurb: 'Кинжал, просчитанный лучами в шейдере: шлифованный стальной клинок с долом и ребром, золотая гарда с загнутыми концами и навершием, кожаная рукоять с витой золотой проволокой между двумя кольцами, золотое яблоко. Мягкие тени, медленно поворачивается в сером дыму над чёрным, с острия сыплются искры. Кик бросает искры; свет и камера не реагируют на бит. Без обложки.',
    init(E) { build(E); st.flare = 0; st.pulse = 0; },
    draw(c, A, E) {
      const { W, H, S } = E, yt = E.FMT === 'yt'; if (st.key !== W + '') build(E); const t = A.t;
      if (A.cut && A.cutKind === 'kick') { st.pulse = 1; st.flare = 1; } st.pulse *= 0.88; st.flare *= 0.86; if (A.snareHit) st.flare = Math.max(st.flare, 0.6);
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 6; i++) { const fx = W * (0.5 + 0.35 * Math.sin(t * 0.17 + i * 1.3)), fy = H * (0.5 + 0.3 * Math.cos(t * 0.13 + i * 2.1)), fr = W * (0.35 + 0.1 * Math.sin(t * 0.3 + i)); const fg = c.createRadialGradient(fx, fy, 0, fx, fy, fr); fg.addColorStop(0, 'rgba(60,62,70,0.16)'); fg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = fg; c.fillRect(fx - fr, fy - fr, 2 * fr, 2 * fr); } c.restore();
      motes(c, E, t, 'rgb(230,230,240)', 0.2);
      if (!st.gl) { E.mono(c, 'WEBGL OFF ' + (st.err || ''), 28 * S, H / 2, 11 * S, '#f55'); tiny(c, E, '#fff', 'rgba(255,255,255,0.55)'); return; }
      const { gl, U, cv } = st.gl; const mo = (() => { const spin = t * 0.4, lean = (yt ? 1.0 : 0.5) + 0.1 * Math.sin(t * 0.3), tilt = 0.2 * Math.sin(t * 0.23); return { Minv: mul(rotY(-spin), mul(rotZ(-lean), rotX(-tilt))), zoom: yt ? 1.4 : 1.5, cam: [0, 0, 5.2], key: [Math.cos(t * 0.5) * 0.6, 0.7, Math.sin(t * 0.5) * 0.6 + 0.4] }; })(); const kl = Math.hypot(...mo.key);
      gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.t, t); gl.uniform1f(U.kick, 0); /* steady light: the kick never reaches the shader */ gl.uniform1f(U.level, A.level); gl.uniform1f(U.zoom, mo.zoom); gl.uniform1f(U.phase, mo.phase || 0); gl.uniform1f(U.dir, mo.dir || 1);
      gl.uniformMatrix3fv(U.rot, false, new Float32Array(colMajor(mo.Minv))); gl.uniform3f(U.cam, mo.cam[0], mo.cam[1], mo.cam[2]); gl.uniform3f(U.key, mo.key[0] / kl, mo.key[1] / kl, mo.key[2] / kl);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.globalCompositeOperation = 'lighter'; c.filter = `blur(${14 * S}px)`; c.globalAlpha = 0.4; c.drawImage(cv, 0, 0, W, H); c.restore();
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, W, H);
      if (!st.extra) st.extra = { sparks: [] }; if (A.cut && A.cutKind === 'kick') for (let i = 0; i < 24; i++) st.extra.sparks.push({ x: W * 0.5 + (Math.random() - 0.5) * W * 0.3, y: H * (yt ? 0.37 : 0.38) + (Math.random() - 0.5) * H * 0.1, vx: (Math.random() - 0.5) * 6 * S, vy: (Math.random() * 2 - 0.5) * S, a: 1 });
      c.save(); c.globalCompositeOperation = 'lighter'; for (const s of st.extra.sparks) { s.vy += 0.25 * S; s.x += s.vx; s.y += s.vy; s.a *= 0.95; c.strokeStyle = `rgba(255,200,120,${s.a})`; c.lineWidth = 1.2 * S; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 2, s.y - s.vy * 2); c.stroke(); } c.restore(); st.extra.sparks = st.extra.sparks.filter(s => s.a > 0.05 && s.y < H);
      if (!window.__bake) tiny(c, E, '#fff', 'rgba(255,255,255,0.55)'); /* a bake has no header: the Reel gets it from header.py */
    },
  });
})();
