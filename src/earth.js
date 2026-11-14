// The Earth look: a photoreal night-and-day globe behind the home screen, with a light on each country people use
// Flisk Chat from and an arc from the biggest one to each other. three.js and the textures load only in this look.

// Visitors by country from analytics.flisk.si, a dated snapshot (not live): [country, lat, lng, visitors].
export const USERS_DATE = '14 Nov 2026';
export const USERS = [
  ['United States', 39, -98, 32540],
  ['Netherlands', 52.1, 5.3, 5620],
  ['Belgium', 50.6, 4.5, 2080],
  ['Curaçao', 12.17, -68.99, 1900],
  ['United Kingdom', 53.5, -1.5, 1180],
  ['India', 22, 78.9, 1090],
  ['Italy', 42.8, 12.5, 1030],
  ['Thailand', 15, 101, 802],
  ['Germany', 51.1, 10.4, 735],
  ['Poland', 52, 19, 303],
  ['Israel', 31.5, 35, 277],
  ['South Korea', 36.4, 127.8, 191],
  ['China', 35, 104, 165],
];

// Where the page may load three.js and the textures from. index.js puts these in the CSP.
export const THREE_SRC = 'https://cdn.jsdelivr.net/npm/three@0.181.0/build/';
export const TEXTURES = ['https://cdn.jsdelivr.net/gh/mrdoob/three.js@r181/examples/textures/planets/', 'https://unpkg.com/three-globe@2.45.6/example/'];

export const shortCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 1 : 2).replace(/\.?0+$/, '')}k` : String(n));

// The users list under the box, shown only in the Earth look.
export const earthUsers = (esc) => {
  const top = USERS[0][3];
  // Little text on the page: each extra goes behind one short button (terafab style).
  return `<div class="ex"><nav class="excta" aria-label="More"><button type="button" data-ex="ideas" aria-expanded="false">Try an idea <span aria-hidden="true">›</span></button><button type="button" data-ex="users" aria-expanded="false">Who uses it <span aria-hidden="true">›</span></button><button type="button" data-ex="about" aria-expanded="false">How it works <span aria-hidden="true">›</span></button></nav><div class="expanel exusers"><p class="exfoot">Used in ${USERS.length} countries<i></i>Real websites<i></i>Real APIs</p><h5>Who uses Flisk Chat <small>visitors by country · analytics.flisk.si · ${USERS_DATE}</small></h5><ol class="exlist">${USERS.slice(0, 9)
    .map(([name, , , n]) => `<li><span>${esc(name)}</span><b><i style="width:${Math.max(1, Math.round((n / top) * 100))}%"></i></b><span>${shortCount(n)}</span></li>`)
    .join('')}</ol></div></div>`;
};

// Runs in the page. It must not use anything from this module: it is sent as text.
function earthClient(U, SRC, G, TG) {
  const ROOT = document.documentElement;
  // One open panel at a time; a second click on the same button closes it.
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-ex]');
    if (!b) return;
    const open = !ROOT.classList.contains(`ex-${b.dataset.ex}`);
    document.querySelectorAll('[data-ex]').forEach((x) => {
      ROOT.classList.remove(`ex-${x.dataset.ex}`);
      x.setAttribute('aria-expanded', 'false');
    });
    if (open) {
      ROOT.classList.add(`ex-${b.dataset.ex}`);
      b.setAttribute('aria-expanded', 'true');
    }
  });
  const cv = document.getElementById('earth');
  if (!cv) return;
  const want = () => ROOT.dataset.theme === 'earth' && ROOT.classList.contains('home') && !document.hidden;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let T = null;
  let started = false;
  let run = null;
  async function start() {
    started = true;
    try {
      T = await import(`${SRC}three.module.min.js`);
    } catch (e) {
      return;
    }
    let r;
    try {
      r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    } catch (e) {
      return;
    }
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(26, 1, 0.1, 100);
    cam.position.set(0, 0, 5.4);
    const L = new T.TextureLoader();
    L.setCrossOrigin('anonymous');
    const load = (u, srgb) =>
      new Promise((res, rej) =>
        L.load(
          u,
          (t) => {
            if (srgb) t.colorSpace = T.SRGBColorSpace;
            t.anisotropy = r.capabilities.getMaxAnisotropy();
            res(t);
          },
          undefined,
          rej,
        ),
      );
    let tex;
    try {
      tex = await Promise.all([load(`${TG}img/earth-blue-marble.jpg`, 1), load(`${G}earth_night_4096.jpg`, 1), load(`${G}earth_bump_roughness_clouds_4096.jpg`), load(`${TG}clouds/clouds.png`)]);
    } catch (e) {
      return;
    }
    const [day, night, brc, clouds] = tex;
    const small = innerWidth < 861;
    const seg = small ? 128 : 256;
    const sun = new T.Vector3(1.1, 0.55, 0.75).normalize();
    const earth = new T.Group();
    scene.add(earth);
    const spin = new T.Group();
    earth.add(spin);
    spin.rotation.order = 'XYZ';
    spin.rotation.y = Math.PI / 2 - ((-80 + 180) * Math.PI) / 180;
    spin.rotation.x = (30 * Math.PI) / 180;
    const VS = 'varying vec2 vUv;varying vec3 vN;varying vec3 vP;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
    const OUT = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
    spin.add(
      new T.Mesh(
        new T.SphereGeometry(1, seg, seg),
        new T.ShaderMaterial({
          uniforms: { day: { value: day }, night: { value: night }, brc: { value: brc }, sun: { value: sun } },
          vertexShader: VS,
          fragmentShader:
            'uniform sampler2D day,night,brc;uniform vec3 sun;varying vec2 vUv;varying vec3 vN;varying vec3 vP;void main(){vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vP);float d=dot(N,sun);' +
            'vec3 dc=texture2D(day,vUv).rgb;vec3 nc=texture2D(night,vUv).rgb;vec3 b=texture2D(brc,vUv).rgb;float ocean=smoothstep(.6,.9,b.g);float lit=smoothstep(-.06,.32,d);' +
            'vec3 col=dc*(max(d,0.)*1.55+.015);vec3 H=normalize(sun+V);float sp=pow(max(dot(N,H),0.),140.)*2.6+pow(max(dot(N,H),0.),14.)*.18;col+=vec3(1.,.95,.85)*sp*ocean*lit;' +
            'col=mix(nc*vec3(1.6,1.25,.85)*1.3,col,lit);float rim=pow(1.-max(dot(N,V),0.),2.6);col+=vec3(.25,.55,1.)*rim*smoothstep(-.25,.5,d)*1.1;gl_FragColor=vec4(col,1.);' +
            OUT,
        }),
      ),
    );
    const cloudShell = new T.Mesh(
      new T.SphereGeometry(1.008, seg, seg),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { clouds: { value: clouds }, sun: { value: sun } },
        vertexShader: VS,
        fragmentShader:
          'uniform sampler2D clouds;uniform vec3 sun;varying vec2 vUv;varying vec3 vN;varying vec3 vP;void main(){vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vP);float d=dot(N,sun);' +
          'vec4 t=texture2D(clouds,vUv);float c=smoothstep(.04,.7,t.a*max(max(t.r,t.g),t.b));float lit=smoothstep(-.1,.35,d);vec3 col=vec3(1.)*(max(d,0.)*1.5+.02);' +
          'float rim=pow(1.-max(dot(N,V),0.),3.);gl_FragColor=vec4(col,c*(.25+.75*lit)*(1.-rim*.6));' +
          OUT,
      }),
    );
    spin.add(cloudShell);
    earth.add(
      new T.Mesh(
        new T.SphereGeometry(1.1, 128, 128),
        new T.ShaderMaterial({
          transparent: true,
          side: T.BackSide,
          blending: T.AdditiveBlending,
          depthWrite: false,
          uniforms: { sun: { value: sun } },
          vertexShader: 'varying vec3 vN;varying vec3 vP;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
          fragmentShader:
            'uniform vec3 sun;varying vec3 vN;varying vec3 vP;void main(){vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vP);float e=dot(N,V);float g=pow(smoothstep(0.,-.42,e),3.2);float lit=smoothstep(-.35,.6,dot(N,sun));gl_FragColor=vec4(vec3(.30,.58,1.)*g*lit*1.25,1.);}',
        }),
      ),
    );
    const ll = (lat, lng, h) => {
      const p = ((lng + 180) * Math.PI) / 180;
      const t = ((90 - lat) * Math.PI) / 180;
      return new T.Vector3(-h * Math.cos(p) * Math.sin(t), h * Math.cos(t), h * Math.sin(p) * Math.sin(t));
    };
    const dot = document.createElement('canvas');
    dot.width = dot.height = 128;
    const x = dot.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, 'rgba(225,238,255,.95)');
    gr.addColorStop(0.35, 'rgba(140,190,255,.35)');
    gr.addColorStop(1, 'rgba(80,140,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
    const glow = new T.CanvasTexture(dot);
    for (const u of U) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: glow, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
      const k = 0.035 + Math.sqrt(u[3]) / 1500;
      s.scale.set(k, k, 1);
      s.position.copy(ll(u[1], u[2], 1.012));
      spin.add(s);
    }
    const lm = new T.LineBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
    for (const u of U.slice(1)) {
      const a = ll(U[0][1], U[0][2], 1.01);
      const b = ll(u[1], u[2], 1.01);
      const m = a.clone().add(b).normalize().multiplyScalar(1.01 + a.angleTo(b) * 0.12);
      spin.add(new T.Line(new T.BufferGeometry().setFromPoints(new T.QuadraticBezierCurve3(a, m, b).getPoints(96)), lm));
    }
    // The globe sits on the right on a wide screen and low in the middle on a phone; the text stays readable on the left.
    const fit = () => {
      const w = cv.clientWidth || innerWidth;
      const h = cv.clientHeight || innerHeight;
      r.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const half = Math.tan((13 * Math.PI) / 180) * 5.4;
      if (w < 861) {
        earth.position.set(0, -half * 0.98, 0);
        earth.scale.setScalar(0.85);
      } else {
        earth.position.set(half * cam.aspect * 0.8, -half * 0.22, 0);
        earth.scale.setScalar(1);
      }
    };
    fit();
    addEventListener('resize', () => {
      fit();
      r.render(scene, cam);
    });
    let last = 0;
    let raf = 0;
    const frame = (now) => {
      raf = 0;
      if (!want()) return;
      const dt = last ? Math.min(now - last, 100) : 0;
      last = now;
      if (!calm.matches) {
        spin.rotation.y += dt * 0.000035;
        cloudShell.rotation.y += dt * 0.000008;
      }
      r.render(scene, cam);
      if (!calm.matches) raf = requestAnimationFrame(frame);
    };
    run = () => {
      if (want() && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    ROOT.classList.add('earthon');
    run();
  }
  const check = () => {
    if (!want()) return;
    if (!started) start();
    else if (run) run();
  };
  new MutationObserver(check).observe(ROOT, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  document.addEventListener('visibilitychange', check);
  check();
}

// Wrangler bundles with keepNames, which puts __name(fn, 'x') calls inside earthClient's text;
// the page has no __name, so give it a do-nothing one in this function's own scope.
export const EARTH_JS = `\n;(function(){var __name=function(f){return f};(${earthClient.toString()})(${JSON.stringify(USERS)},${JSON.stringify(THREE_SRC)},${JSON.stringify(TEXTURES[0])},${JSON.stringify(TEXTURES[1])})})();\n`;
