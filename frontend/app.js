/*
 * ForensIA 3D — React + Three.js Application
 * Provider: Pollinations (IA en la nube)
 */

// ──────────────────────────────────────────────────────────────
//  Constantes
// ──────────────────────────────────────────────────────────────
const RECOMMENDED_MODELS = [
  'openai', 'gpt-5.4', 'gpt-5.4-mini', 'llama', 'llama-maverick',
  'qwen-coder', 'mistral', 'deepseek', 'gemini', 'claude'
];
const DEFAULT_MODEL = 'openai';
const POLLINATIONS_URL = 'https://gen.pollinations.ai';

const DEFAULT_RELATO = `Eran las 19:30 en una intersección con semáforo en el cruce de Av. Libertador y Calle 5. El Vehículo 1 (sedán rojo) circulaba de sur a norte por Av. Libertador a unos 70 km/h. El Vehículo 2 (camioneta negra) circulaba de oeste a este por Calle 5 a unos 50 km/h. El Vehículo 1 ignoró el semáforo en rojo e impactó de lleno el lateral derecho del Vehículo 2. Tras el impacto, el Vehículo 2 fue empujado hacia el noreste unos 6 metros y el Vehículo 1 quedó detenido en la intersección con daños frontales severos.`;

// Tipos que entiende el visor. Deben coincidir con el SYSTEM_PROMPT (lib/SystemPrompt.php).
const VEHICLE_TYPES = ['motocicleta', 'sedan', 'hatchback', 'deportivo', 'suv', 'pickup', 'camion'];
// [largo, ancho] en metros de cada modelo 3D (mismos valores que el SYSTEM_PROMPT).
const VEHICLE_DIMS = {
  motocicleta: [2.1, 0.8], sedan: [4.5, 1.8], hatchback: [4.0, 1.8], deportivo: [3.8, 1.9],
  suv: [4.6, 1.9], pickup: [5.2, 1.9], camion: [6.0, 2.2],
};
const VEHICLE_ICONS = { motocicleta: '🏍️', pickup: '🛻', camion: '🚚', suv: '🚙' };
// El orden importa: "camioneta" contiene "camion".
const VEHICLE_SYNONYMS = [
  [/moto|scooter|motoneta|motorista/, 'motocicleta'],
  [/pick|picop|palangana/, 'pickup'],
  [/camionet/, 'suv'],
  [/camion|bus|trailer|furgon|cabezal|rastra/, 'camion'],
  [/suv|jeep|todoterreno/, 'suv'],
  [/hatch/, 'hatchback'],
  [/deport|coupe/, 'deportivo'],
  [/sedan|carro|auto|turismo/, 'sedan'],
];
const COLOR_MAP = {
  rojo: 0xcc1111, azul: 0x1144aa, blanco: 0xdddddd, negro: 0x0a0a0a,
  plata: 0xaaaaaa, plateado: 0xaaaaaa, gris: 0x666666, verde: 0x11aa44, amarillo: 0xddcc00,
  naranja: 0xdd6622, anaranjado: 0xdd6622, marron: 0x663322, cafe: 0x663322, beige: 0xccbb99,
  violeta: 0x8833aa, morado: 0x6a2c91, celeste: 0x4488cc, borgona: 0x661122, vino: 0x661122,
  dorado: 0xccaa33, champan: 0xddccbb, turquesa: 0x22aaaa, rosado: 0xdd6699,
};

// ──────────────────────────────────────────────────────────────
//  Base de la API (relativa para funcionar en raíz o subcarpeta de XAMPP)
// ──────────────────────────────────────────────────────────────
const API_BASE = (() => {
  const p = window.location.pathname;
  return p.replace(/\/index\.php$/, '').replace(/\/+$/, '');
})();

// ──────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function deg2rad(d) { return d * Math.PI / 180; }
function normAngle(a) { return ((a % 360) + 360) % 360; }
// Diferencia con signo b − a en (−180, 180].
function angDiff(a, b) { let d = normAngle(b - a); if (d > 180) d -= 360; return d; }
// Rumbo tipo brújula (0 = norte/+Y, 90 = este/+X) de un desplazamiento.
function bearingOf(dx, dy) { return normAngle(Math.atan2(dx, dy) * 180 / Math.PI); }

function lerpAngle(a, b, t) {
  let diff = ((b - a) % 360 + 360) % 360;
  if (diff > 180) diff -= 360;
  return a + diff * t;
}

function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function parseColor(colorStr, defaultHex) {
  if (typeof colorStr === 'number') return colorStr;
  if (!colorStr || typeof colorStr !== 'string') return defaultHex;
  const raw = colorStr.trim();
  if (/^#?[0-9a-f]{6}$/i.test(raw)) return parseInt(raw.replace('#', ''), 16);
  for (const word of stripAccents(raw.toLowerCase()).split(/[^a-z]+/)) {
    if (!word) continue;
    if (COLOR_MAP[word] !== undefined) return COLOR_MAP[word];
    // Formas femeninas: "roja", "blanca", "negra"...
    if (word.endsWith('a') && COLOR_MAP[word.slice(0, -1) + 'o'] !== undefined) return COLOR_MAP[word.slice(0, -1) + 'o'];
    if (word.endsWith('s') && COLOR_MAP[word.slice(0, -1)] !== undefined) return COLOR_MAP[word.slice(0, -1)];
  }
  return defaultHex;
}

function parseVehicleType(typeStr, defaultType) {
  if (!typeStr || typeof typeStr !== 'string') return defaultType;
  const t = stripAccents(typeStr.toLowerCase().trim());
  if (VEHICLE_TYPES.includes(t)) return t;
  for (const [re, type] of VEHICLE_SYNONYMS) if (re.test(t)) return type;
  return defaultType;
}

function vehicleIcon(type) { return VEHICLE_ICONS[type] || '🚗'; }

function extractJSON(text) {
  text = text.trim();
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.substring(start, i + 1); }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
//  Cinemática: preparación de la simulación que devuelve la IA
// ──────────────────────────────────────────────────────────────
const ACTORS = ['v1', 'v2'];

// Tangentes monótonas (PCHIP) por eje: la trayectoria pasa por todos los
// frames sin "pasarse" (no hay retrocesos ni ondulaciones entre frames).
// En breakIdx (el frame del impacto) se usan tangentes laterales para que
// el cambio brusco de velocidad del choque no se suavice.
function pchipTangents(ts, vs, breakIdx) {
  const n = ts.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    const h = ts[i + 1] - ts[i];
    d.push(h > 1e-6 ? (vs[i + 1] - vs[i]) / h : 0);
  }
  const mL = new Array(n), mR = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i === 0) { mL[i] = mR[i] = d[0]; continue; }
    if (i === n - 1) { mL[i] = mR[i] = d[n - 2]; continue; }
    if (i === breakIdx) { mL[i] = d[i - 1]; mR[i] = d[i]; continue; }
    let m = 0;
    if (d[i - 1] * d[i] > 0) {
      const h0 = ts[i] - ts[i - 1], h1 = ts[i + 1] - ts[i];
      const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
      m = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
    mL[i] = mR[i] = m;
  }
  return { mL, mR };
}

function makeTrack(frames, p, breakT) {
  const ts = frames.map(f => f.segundo);
  const xs = frames.map(f => f[p + '_x']);
  const ys = frames.map(f => f[p + '_y']);
  const as = frames.map(f => f[p + '_angulo']);
  const incl = frames.map(f => f[p + '_inclinacion'] || 0);
  let breakIdx = -1;
  if (breakT !== null && breakT !== undefined) {
    let best = Infinity;
    ts.forEach((t, i) => { const dd = Math.abs(t - breakT); if (dd < best) { best = dd; breakIdx = i; } });
    if (best > 0.3) breakIdx = -1;
  }
  return {
    ts, xs, ys, as, incl, breakIdx,
    mx: pchipTangents(ts, xs, breakIdx), my: pchipTangents(ts, ys, breakIdx),
    hasIncl: incl.some(v => Math.abs(v) > 0.5),
  };
}

// Posición, velocidad (m/s), rumbo declarado e inclinación en el instante t.
function evalTrack(tr, t) {
  const { ts } = tr;
  const n = ts.length;
  if (t <= ts[0]) return { x: tr.xs[0], y: tr.ys[0], vx: tr.mx.mR[0], vy: tr.my.mR[0], a: tr.as[0], incl: tr.incl[0] };
  if (t >= ts[n - 1]) return { x: tr.xs[n - 1], y: tr.ys[n - 1], vx: tr.mx.mL[n - 1], vy: tr.my.mL[n - 1], a: tr.as[n - 1], incl: tr.incl[n - 1] };
  let k = 0;
  while (k < n - 2 && t > ts[k + 1]) k++;
  const h = ts[k + 1] - ts[k];
  if (h < 1e-6) return { x: tr.xs[k + 1], y: tr.ys[k + 1], vx: 0, vy: 0, a: tr.as[k + 1], incl: tr.incl[k + 1] };
  const s = (t - ts[k]) / h, s2 = s * s, s3 = s2 * s;
  const herm = (v0, v1, m0, m1) => ({
    v: (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1,
    dv: ((6 * s2 - 6 * s) * v0 + (-6 * s2 + 6 * s) * v1) / h + (3 * s2 - 4 * s + 1) * m0 + (3 * s2 - 2 * s) * m1,
  });
  const X = herm(tr.xs[k], tr.xs[k + 1], tr.mx.mR[k], tr.mx.mL[k + 1]);
  const Y = herm(tr.ys[k], tr.ys[k + 1], tr.my.mR[k], tr.my.mL[k + 1]);
  return {
    x: X.v, y: Y.v, vx: X.dv, vy: Y.dv,
    a: lerpAngle(tr.as[k], tr.as[k + 1], s),
    incl: lerp(tr.incl[k], tr.incl[k + 1], s),
  };
}

// Separación entre dos rectángulos orientados (teorema del eje separador).
// > 0: separados al menos esa distancia; <= 0: se tocan o se superponen.
function obbGap(a, b) {
  const axes = [];
  for (const o of [a, b]) {
    const r = deg2rad(o.a);
    axes.push([Math.sin(r), Math.cos(r)], [Math.cos(r), -Math.sin(r)]);
  }
  const ext = (o, u) => {
    const r = deg2rad(o.a);
    const f = [Math.sin(r), Math.cos(r)], rt = [Math.cos(r), -Math.sin(r)];
    return o.L / 2 * Math.abs(f[0] * u[0] + f[1] * u[1]) + o.W / 2 * Math.abs(rt[0] * u[0] + rt[1] * u[1]);
  };
  let gap = -Infinity;
  for (const u of axes) {
    const d = Math.abs((b.x - a.x) * u[0] + (b.y - a.y) * u[1]);
    gap = Math.max(gap, d - ext(a, u) - ext(b, u));
  }
  return gap;
}

// Punto de contacto: el centro del vehículo pequeño proyectado sobre la
// carrocería del grande (p. ej. el costado izquierdo del pickup en un roce).
function contactPoint(a, b) {
  const [big, small] = (a.L * a.W >= b.L * b.W) ? [a, b] : [b, a];
  const r = deg2rad(big.a);
  const f = [Math.sin(r), Math.cos(r)], rt = [Math.cos(r), -Math.sin(r)];
  const rx = small.x - big.x, ry = small.y - big.y;
  let lf = rx * f[0] + ry * f[1], lr = rx * rt[0] + ry * rt[1];
  const hl = big.L / 2, hw = big.W / 2;
  if (Math.abs(lf) < hl && Math.abs(lr) < hw) {
    if (hw - Math.abs(lr) < hl - Math.abs(lf)) lr = Math.sign(lr || 1) * hw;
    else lf = Math.sign(lf || 1) * hl;
  } else {
    lf = clamp(lf, -hl, hl); lr = clamp(lr, -hw, hw);
  }
  return { x: big.x + f[0] * lf + rt[0] * lr, y: big.y + f[1] * lf + rt[1] * lr };
}

// Si los rumbos declarados no acompañan al movimiento antes del impacto
// (p. ej. el modelo usó 0° = este en lugar de 0° = norte), se busca la
// conversión (giro de 90° o espejo) que los hace coincidir.
function detectHeadingTransform(frames, tGuess) {
  const samples = [];
  for (const p of ACTORS) {
    for (let i = 0; i < frames.length - 1; i++) {
      const f0 = frames[i], f1 = frames[i + 1];
      if (f1.segundo > tGuess + 1e-6) break;
      const dx = f1[p + '_x'] - f0[p + '_x'], dy = f1[p + '_y'] - f0[p + '_y'];
      if (Math.hypot(dx, dy) < 0.5) continue;
      const a = f0[p + '_angulo'] + angDiff(f0[p + '_angulo'], f1[p + '_angulo']) / 2;
      samples.push({ a, b: bearingOf(dx, dy) });
    }
  }
  if (samples.length < 2) return null;
  const err = fn => samples.reduce((acc, s) => acc + Math.abs(angDiff(fn(s.a), s.b)), 0) / samples.length;
  const idErr = err(a => a);
  if (idErr <= 30) return null;
  const candidates = [];
  for (const k of [90, 180, 270]) candidates.push(a => a + k);
  for (const k of [0, 90, 180, 270]) candidates.push(a => k - a);
  let best = null, bestErr = Infinity;
  for (const fn of candidates) { const e = err(fn); if (e < bestErr) { bestErr = e; best = fn; } }
  return (bestErr < 20 && bestErr < idErr - 30) ? best : null;
}

function detectRoadAxis(sim, frames) {
  let ax = 0, ay = 0;
  for (const p of ACTORS) {
    for (let i = 0; i < frames.length - 1; i++) {
      ax += Math.abs(frames[i + 1][p + '_x'] - frames[i][p + '_x']);
      ay += Math.abs(frames[i + 1][p + '_y'] - frames[i][p + '_y']);
    }
  }
  if (ax > ay * 1.5) return 'este_oeste';
  if (ay > ax * 1.5) return 'norte_sur';
  const decl = stripAccents(String(sim.eje_via || '').toLowerCase());
  return /este|oeste/.test(decl) ? 'este_oeste' : 'norte_sur';
}

function numOr(v, def) { const n = parseFloat(v); return Number.isFinite(n) ? n : def; }

// Normaliza el JSON de la IA y precalcula trayectorias suaves, el instante
// real de contacto y el punto de impacto. Lo derivado queda en `_d` (no
// enumerable: no aparece en el JSON crudo ni se envía al backend).
function prepareSimulation(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Respuesta vacía.');
  if (!raw.infraestructura || !Array.isArray(raw.animacion_actores)) throw new Error('El JSON no cumple el esquema esperado.');
  const sim = { ...raw };

  let frames = raw.animacion_actores.map(f => {
    const o = { segundo: numOr(f.segundo, NaN) };
    for (const p of ACTORS) {
      o[p + '_x'] = numOr(f[p + '_x'], NaN);
      o[p + '_y'] = numOr(f[p + '_y'], NaN);
      o[p + '_angulo'] = numOr(f[p + '_angulo'], 0);
      o[p + '_inclinacion'] = numOr(f[p + '_inclinacion'], 0);
    }
    return o;
  }).filter(f => [f.segundo, f.v1_x, f.v1_y, f.v2_x, f.v2_y].every(Number.isFinite));
  frames.sort((a, b) => a.segundo - b.segundo);
  frames = frames.filter((f, i) => i === frames.length - 1 || frames[i + 1].segundo - f.segundo > 1e-6);
  if (frames.length < 2) throw new Error('La IA devolvió menos de 2 frames válidos.');

  const types = { v1: parseVehicleType(raw.v1_tipo, 'sedan'), v2: parseVehicleType(raw.v2_tipo, 'sedan') };
  const dims = {};
  for (const p of ACTORS) { const [L, W] = VEHICLE_DIMS[types[p]]; dims[p] = { L, W }; }

  const t0 = frames[0].segundo, tN = frames[frames.length - 1].segundo;
  const declared = Number.isFinite(parseFloat(raw.t_impacto)) ? clamp(parseFloat(raw.t_impacto), t0, tN) : null;
  let tGuess = declared;
  if (tGuess === null) {
    let best = Infinity;
    for (const f of frames) {
      const dd = Math.hypot(f.v1_x - f.v2_x, f.v1_y - f.v2_y);
      if (dd < best) { best = dd; tGuess = f.segundo; }
    }
  }

  const fix = detectHeadingTransform(frames, tGuess);
  frames = frames.map(f => {
    const o = { ...f };
    for (const p of ACTORS) o[p + '_angulo'] = normAngle(fix ? fix(f[p + '_angulo']) : f[p + '_angulo']);
    return o;
  });

  // Instante en que las carrocerías se tocan de verdad (con las trayectorias
  // suavizadas que se van a dibujar).
  const state = (tracks, t) => {
    const o = {};
    for (const p of ACTORS) { const s = evalTrack(tracks[p], t); o[p] = { x: s.x, y: s.y, a: s.a, L: dims[p].L, W: dims[p].W }; }
    return o;
  };
  let tracks = { v1: makeTrack(frames, 'v1', tGuess), v2: makeTrack(frames, 'v2', tGuess) };
  const entries = [];
  let prevGap = null, minGap = Infinity, tMin = tGuess;
  for (let t = t0; t <= tN + 1e-9; t += 0.01) {
    const s = state(tracks, t);
    const g = obbGap(s.v1, s.v2);
    if (g < minGap) { minGap = g; tMin = t; }
    if (g <= 0.05 && (prevGap === null || prevGap > 0.05)) entries.push(t);
    prevGap = g;
  }
  let tImpact;
  if (declared !== null) {
    const near = entries.filter(t => Math.abs(t - declared) <= 1.5);
    tImpact = near.length ? near.reduce((a, b) => (Math.abs(b - declared) < Math.abs(a - declared) ? b : a)) : declared;
  } else {
    tImpact = entries.length ? entries[0] : tMin;
  }
  tracks = { v1: makeTrack(frames, 'v1', tImpact), v2: makeTrack(frames, 'v2', tImpact) };

  const atImpact = state(tracks, tImpact);
  const point = contactPoint(atImpact.v1, atImpact.v2);

  // Lado hacia el que cae una moto si la IA no dio "inclinacion":
  // al lado contrario del vehículo con el que choca.
  const fall = {};
  for (const p of ACTORS) {
    const me = atImpact[p], other = atImpact[p === 'v1' ? 'v2' : 'v1'];
    const r = deg2rad(me.a);
    const side = (other.x - me.x) * Math.cos(r) + (other.y - me.y) * -Math.sin(r);
    fall[p] = side > 0 ? -85 : 85;
  }

  sim.animacion_actores = frames;
  sim.t_impacto = Math.round(tImpact * 100) / 100;
  sim.v1_tipo = types.v1;
  sim.v2_tipo = types.v2;
  Object.defineProperty(sim, '_d', {
    enumerable: false,
    value: {
      tracks, types, dims, t0, tN, tImpact, point, fall,
      headingFixed: !!fix,
      roadAxis: detectRoadAxis(sim, frames),
      lanes: parseInt(raw.carriles_por_sentido, 10) === 1 ? 1 : 2,
    },
  });
  return sim;
}

// Estado de ambos vehículos en el instante t (lo que dibuja el visor).
function sampleSim(sim, t) {
  if (!sim || !sim._d) return null;
  const d = sim._d;
  const out = { segundo: t };
  for (const p of ACTORS) {
    const tr = d.tracks[p];
    const s = evalTrack(tr, t);
    const speed = Math.hypot(s.vx, s.vy);
    let ang = s.a;
    // Antes del choque el frente sigue a la trayectoria (cambios de carril
    // suaves); si el rumbo declarado discrepa mucho (reversa, derrape) se respeta.
    if (t < d.tImpact - 1e-3 && speed > 1) {
      const tb = bearingOf(s.vx, s.vy);
      const w = clamp((40 - Math.abs(angDiff(ang, tb))) / 15, 0, 1) * clamp((speed - 1) / 2, 0, 1);
      ang = lerpAngle(ang, tb, w);
    }
    let incl = 0;
    if (d.types[p] === 'motocicleta') {
      if (tr.hasIncl) {
        incl = s.incl;
      } else if (t < d.tImpact) {
        // Inclinación en curva: tan(φ) = v·ω / g
        if (speed > 3) {
          const sA = evalTrack(tr, t - 0.05), sB = evalTrack(tr, t + 0.05);
          const omega = deg2rad(angDiff(bearingOf(sA.vx, sA.vy), bearingOf(sB.vx, sB.vy))) / 0.1;
          incl = clamp(Math.atan(speed * omega / 9.81) * 180 / Math.PI, -40, 40);
        }
      } else {
        const k = clamp((t - d.tImpact) / 0.8, 0, 1);
        incl = d.fall[p] * k * k;
      }
    }
    out[p + '_x'] = s.x;
    out[p + '_y'] = s.y;
    out[p + '_angulo'] = normAngle(ang);
    out[p + '_inclinacion'] = incl;
    out[p + '_vel'] = speed * 3.6;
  }
  return out;
}

function getPhase(sim, tCurrent) {
  if (!sim || !sim._d) return 'pre';
  const tI = sim._d.tImpact;
  if (tCurrent < tI - 0.02) return 'pre';
  if (tCurrent <= tI + 0.25) return 'impact';
  return 'post';
}

// Trayectoria muestreada (para líneas, marcas y encuadre de cámara).
function sampleTrackPoints(sim, p, from, to, step) {
  const pts = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    const s = evalTrack(sim._d.tracks[p], t);
    pts.push({ t, x: s.x, y: s.y, a: s.a, speed: Math.hypot(s.vx, s.vy) });
  }
  return pts;
}

// ──────────────────────────────────────────────────────────────
//  Cámara orbital libre
//    · arrastrar (clic izq. / 1 dedo)          → girar alrededor del objetivo
//    · clic der. / medio / Shift+arrastrar      → desplazar sobre el suelo
//    · rueda / pellizco (2 dedos)               → zoom hacia el cursor
//    · doble clic                               → centrar en ese punto
// ──────────────────────────────────────────────────────────────
class OrbitCameraControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = true;
    this.target = new THREE.Vector3();
    this.goalTarget = new THREE.Vector3();
    this.sph = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 80 };
    this.goal = { ...this.sph };
    this.minRadius = 2;
    this.maxRadius = 600;
    this.minPhi = 0.001;
    this.maxPhi = Math.PI / 2 - 0.04;   // no bajar del suelo
    this.home = null;
    this.follow = null;                 // () => THREE.Vector3 | null
    this.onUserPan = null;              // al desplazar mientras se sigue a un vehículo
    this.pointers = new Map();
    this.drag = null;
    this.pinch = null;
    this._raycaster = new THREE.Raycaster();
    this._ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    dom.style.touchAction = 'none';
    dom.style.cursor = 'grab';
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onDbl = this._onDbl.bind(this);
    this._onCtx = e => e.preventDefault();
    dom.addEventListener('pointerdown', this._onDown);
    dom.addEventListener('pointermove', this._onMove);
    dom.addEventListener('pointerup', this._onUp);
    dom.addEventListener('pointercancel', this._onUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('dblclick', this._onDbl);
    dom.addEventListener('contextmenu', this._onCtx);
    this.update(1);
  }

  dispose() {
    const dom = this.dom;
    dom.removeEventListener('pointerdown', this._onDown);
    dom.removeEventListener('pointermove', this._onMove);
    dom.removeEventListener('pointerup', this._onUp);
    dom.removeEventListener('pointercancel', this._onUp);
    dom.removeEventListener('wheel', this._onWheel);
    dom.removeEventListener('dblclick', this._onDbl);
    dom.removeEventListener('contextmenu', this._onCtx);
  }

  _height() { return this.dom.getBoundingClientRect().height || 1; }

  groundPointAt(clientX, clientY) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this._raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(this._ground, p) ? p : null;
  }

  _rotate(dx, dy) {
    const h = this._height();
    this.goal.theta -= 2 * Math.PI * dx / h;
    this.goal.phi = clamp(this.goal.phi - 1.2 * Math.PI * dy / h, this.minPhi, this.maxPhi);
  }

  _pan(dx, dy) {
    const wpp = 2 * this.goal.radius * Math.tan(deg2rad(this.camera.fov / 2)) / this._height();
    const th = this.goal.theta;
    const tilt = 1 / Math.max(0.35, Math.cos(this.goal.phi));
    this.goalTarget.x += -dx * wpp * Math.cos(th) - dy * wpp * tilt * Math.sin(th);
    this.goalTarget.z += dx * wpp * Math.sin(th) - dy * wpp * tilt * Math.cos(th);
    if (this.follow && this.onUserPan) this.onUserPan();
  }

  _zoom(factor, clientX, clientY) {
    const newR = clamp(this.goal.radius * factor, this.minRadius, this.maxRadius);
    const k = 1 - newR / this.goal.radius;
    if (!this.follow && clientX !== undefined && k !== 0) {
      const p = this.groundPointAt(clientX, clientY);
      if (p && p.distanceTo(this.goalTarget) < this.goal.radius * 4) {
        this.goalTarget.addScaledVector(p.sub(this.goalTarget), k);
      }
    }
    this.goal.radius = newR;
  }

  _pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  _onDown(e) {
    if (!this.enabled) return;
    try { this.dom.setPointerCapture(e.pointerId); } catch (_) { /* puntero sintético */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      const pan = e.button === 1 || e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey;
      this.drag = pan ? 'pan' : 'orbit';
      this.dom.style.cursor = pan ? 'move' : 'grabbing';
    } else if (this.pointers.size === 2) {
      this.drag = 'pinch';
      this.pinch = this._pinchState();
    }
    e.preventDefault();
  }

  _onMove(e) {
    const prev = this.pointers.get(e.pointerId);
    if (!prev || !this.enabled) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    if (this.drag === 'pinch' && this.pointers.size >= 2) {
      const s = this._pinchState();
      if (this.pinch) {
        this._zoom(this.pinch.dist / s.dist, s.cx, s.cy);
        this._pan(s.cx - this.pinch.cx, s.cy - this.pinch.cy);
      }
      this.pinch = s;
    } else if (this.drag === 'pan') {
      this._pan(dx, dy);
    } else if (this.drag === 'orbit') {
      this._rotate(dx, dy);
    }
  }

  _onUp(e) {
    this.pointers.delete(e.pointerId);
    try { this.dom.releasePointerCapture(e.pointerId); } catch (_) { /* ya liberado */ }
    this.pinch = null;
    this.drag = this.pointers.size === 1 ? 'orbit' : null;
    if (!this.drag) this.dom.style.cursor = 'grab';
  }

  _onWheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 400;
    // Pellizco en touchpad: llega como rueda con ctrlKey y deltas pequeños.
    this._zoom(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0012)), e.clientX, e.clientY);
  }

  _onDbl(e) {
    if (!this.enabled) return;
    const p = this.groundPointAt(e.clientX, e.clientY);
    if (!p) return;
    if (this.follow && this.onUserPan) this.onUserPan();
    this.goalTarget.copy(p);
    this.goal.radius = Math.min(this.goal.radius, 35);
  }

  // Ángulo equivalente a `a` más cercano al theta actual (evita vueltas completas).
  _nearTheta(a) {
    const cur = this.goal.theta;
    return cur + Math.atan2(Math.sin(a - cur), Math.cos(a - cur));
  }

  setView(view, immediate) {
    if (view.target) this.goalTarget.copy(view.target);
    if (view.theta !== undefined) this.goal.theta = this._nearTheta(view.theta);
    if (view.phi !== undefined) this.goal.phi = clamp(view.phi, this.minPhi, this.maxPhi);
    if (view.radius !== undefined) this.goal.radius = clamp(view.radius, this.minRadius, this.maxRadius);
    if (immediate) { this.target.copy(this.goalTarget); this.sph = { ...this.goal }; this.update(0); }
  }

  saveHome(view) { this.home = { ...view, target: view.target.clone() }; }

  reset() {
    this.follow = null;
    if (this.home) this.setView(this.home);
  }

  update(dt) {
    if (this.follow) {
      const p = this.follow();
      if (p) this.goalTarget.copy(p);
    }
    const k = 1 - Math.exp(-dt * 10);
    this.target.lerp(this.goalTarget, k);
    this.sph.theta += (this.goal.theta - this.sph.theta) * k;
    this.sph.phi += (this.goal.phi - this.sph.phi) * k;
    this.sph.radius += (this.goal.radius - this.sph.radius) * k;
    const { theta, phi, radius } = this.sph;
    this.camera.position.set(
      this.target.x + radius * Math.sin(phi) * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(this.target);
  }
}

// ──────────────────────────────────────────────────────────────
//  Three.js Scene Manager
// ──────────────────────────────────────────────────────────────
class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene = new THREE.Scene();

    // Procedural sky gradient
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 2; skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext('2d');
    const grad = sCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#02060c');
    grad.addColorStop(0.3, '#050e1a');
    grad.addColorStop(0.6, '#081828');
    grad.addColorStop(0.85, '#0a1e30');
    grad.addColorStop(1, '#040a14');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 2, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    this.scene.background = skyTex;

    this.scene.fog = new THREE.FogExp2(0x02060c, 0.0032);

    // Reflection cubemap for vehicles (procedural)
    this.envMap = this._generateEnvMap();

    // Starfield
    this._buildStars();

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    this.camera.position.set(30, 50, 60);
    this.camera.lookAt(0, 0, 0);

    // Screen shake state
    this.shakeIntensity = 0;
    this.shakeDecay = 0.92;

    // Cámara libre (girar / desplazar / zoom) en todos los modos
    this.controls = new OrbitCameraControls(this.camera, canvas);
    this.cameraMode = 'free';
    this._followPoint = new THREE.Vector3();
    this.occluders = [];
    this._occRay = new THREE.Ray();
    this._occTmp = new THREE.Vector3();
    this._occDir = new THREE.Vector3();
    this.impact = null;
    this._lastSimT = null;
    this._lastFrameTs = null;

    this._buildLights();
    this._buildGround();
    this._buildAmbientDust();
    this._buildClouds();

    this.treeCanopies = [];
    this.cloudTime = 0;

    this.v1Mesh = null;
    this.v2Mesh = null;
    this.fillerVehicles = [];
    this.impactMarker = null;
    this.roadMeshes = [];
    this.trajLine1 = null;
    this.trajLine2 = null;
    this.particles = [];
    this.particleTime = 0;

    this.animFrameId = null;
    this._render();
  }

  _generateEnvMap() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, '#88bbff');
    grad.addColorStop(0.15, '#4466aa');
    grad.addColorStop(0.4, '#1a2a44');
    grad.addColorStop(0.7, '#0a1220');
    grad.addColorStop(1, '#020408');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `hsla(${200 + Math.random()*40}, 80%, ${70 + Math.random()*30}%, ${Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(Math.random()*size, Math.random()*size, Math.random()*3+1, 0, Math.PI*2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  _buildStars() {
    const count = 800;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 250 + Math.random() * 100;
      positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i*3+1] = Math.abs(r * Math.cos(phi));
      positions[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = 0.5 + Math.random() * 1.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.6, transparent: true, opacity: 0.8,
      sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  _buildClouds() {
    this.clouds = [];
    const cloudTexCanvas = document.createElement('canvas');
    cloudTexCanvas.width = 128; cloudTexCanvas.height = 64;
    const ctx = cloudTexCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 32, 0, 64, 32, 64);
    grad.addColorStop(0, 'rgba(200,210,230,0.5)');
    grad.addColorStop(0.3, 'rgba(180,195,220,0.25)');
    grad.addColorStop(0.6, 'rgba(160,175,200,0.1)');
    grad.addColorStop(1, 'rgba(100,120,150,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 64);
    const cloudTex = new THREE.CanvasTexture(cloudTexCanvas);

    const cloudPositions = [
      [-120, 55, -80], [-80, 60, -60], [-30, 50, -100], [20, 65, -70], [70, 55, -90],
      [110, 60, -50], [-100, 70, -30], [-50, 55, -40], [0, 65, -50], [50, 50, -60],
      [100, 70, -40], [-70, 60, -110], [40, 55, -110], [-40, 65, -80], [80, 60, -100]
    ];
    cloudPositions.forEach(([x, y, z]) => {
      const scale = 8 + Math.random() * 12;
      const mat = new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.4 + Math.random() * 0.2,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(x, y, z);
      sprite.scale.set(scale * (1 + Math.random() * 0.5), scale * 0.3, 1);
      sprite.userData = { speed: 0.2 + Math.random() * 0.4, startX: x };
      this.scene.add(sprite);
      this.clouds.push(sprite);
    });
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0x0a1628, 1.2);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x4488cc, 0x050810, 0.8);
    this.scene.add(hemi);
    const moonLight = new THREE.DirectionalLight(0x6688bb, 2.0);
    moonLight.position.set(-40, 70, 30); moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(4096, 4096);
    moonLight.shadow.camera.near = 0.5; moonLight.shadow.camera.far = 300;
    moonLight.shadow.camera.left = -120; moonLight.shadow.camera.right = 120;
    moonLight.shadow.camera.top = 120; moonLight.shadow.camera.bottom = -120;
    moonLight.shadow.bias = -0.0005;
    this.scene.add(moonLight);
    const fillLight = new THREE.DirectionalLight(0x223355, 1.0);
    fillLight.position.set(30, 40, -30); this.scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x8866aa, 0.6);
    rimLight.position.set(0, 10, -80); this.scene.add(rimLight);
    this.impactLight = new THREE.PointLight(0xff6622, 0, 35, 2);
    this.impactLight.position.set(0, 3, 0); this.scene.add(this.impactLight);
  }

  _buildGround() {
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x050a14, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.15;
    ground.receiveShadow = true; this.scene.add(ground);
    const gridHelper = new THREE.GridHelper(400, 80, 0x0a1a30, 0x061020);
    gridHelper.position.y = -0.1; gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.6; this.scene.add(gridHelper);
  }

  _buildAmbientDust() {
    this.dustParticles = [];
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i*3] = (Math.random() - 0.5) * 160;
      positions[i*3+1] = Math.random() * 20 + 1;
      positions[i*3+2] = (Math.random() - 0.5) * 160;
      sizes[i] = Math.random() * 3 + 1;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: 0x666688, size: 0.3, transparent: true, opacity: 0.25,
      sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.dustSystem = new THREE.Points(geo, mat);
    this.dustSystem.position.y = 0; this.scene.add(this.dustSystem);
  }

  // opts.axis: 'norte_sur' | 'este_oeste' (solo "recta"); opts.lanes: carriles por sentido (1 | 2).
  // Los centros de carril coinciden con los que describe el SYSTEM_PROMPT.
  buildRoad(infraestructura, opts = {}) {
    this.roadMeshes.forEach(m => this.scene.remove(m));
    this.roadMeshes = [];
    this.treeCanopies = [];
    this.occluders = [];
    const root = new THREE.Group();
    this.scene.add(root);
    this.roadMeshes.push(root);
    const add = obj => { root.add(obj); return obj; };

    const aspCanvas = document.createElement('canvas');
    aspCanvas.width = 256; aspCanvas.height = 256;
    const actx = aspCanvas.getContext('2d');
    actx.fillStyle = '#151a28'; actx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      const g = Math.floor(20 + Math.random() * 20);
      actx.fillStyle = `rgb(${g+10},${g+15},${g+30})`;
      actx.fillRect(Math.random()*256, Math.random()*256, Math.random()*3+1, Math.random()*2+0.5);
    }
    const aspTex = new THREE.CanvasTexture(aspCanvas);
    aspTex.wrapS = aspTex.wrapT = THREE.RepeatWrapping;
    aspTex.repeat.set(12, 12);

    const asphalt = new THREE.MeshStandardMaterial({
      map: aspTex, color: 0x8a9aaa, roughness: 0.92, metalness: 0.08,
    });
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x2a3245, roughness: 0.92, metalness: 0.05,
    });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x0f2414, roughness: 1.0 });
    const buildingColors = [0x0f1524, 0x1a1520, 0x151a28, 0x12181f, 0x0e1a1e, 0x1a1a1a];
    const buildingMat = new THREE.MeshStandardMaterial({
      color: buildingColors[0], roughness: 0.85, metalness: 0.3,
    });
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xeeeecc, roughness: 0.5, side: THREE.DoubleSide });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xddcc44, roughness: 0.5, side: THREE.DoubleSide });
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x444444, emissiveIntensity: 0.3, side: THREE.DoubleSide });

    const addBox = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), mat);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true; mesh.castShadow = (mat === buildingMat);
      return add(mesh);
    };

    // Pintura sobre el asfalto: rectángulo largo `len` en dirección X (rotY gira sobre el suelo).
    const paint = (len, wid, x, z, mat, rotY = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, wid), mat);
      m.rotation.set(-Math.PI / 2, 0, rotY);
      m.position.set(x, 0.12, z);
      return add(m);
    };
    const dashX = (x, z, len, mat = dashMat) => paint(len, 0.15, x, z, mat);
    const dashZ = (z, x, len, mat = dashMat) => paint(len, 0.15, x, z, mat, Math.PI / 2);

    const makeBuilding = (w, h, d, x, z) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const bColor = buildingColors[Math.floor(Math.random() * buildingColors.length)];
      const bMat = new THREE.MeshStandardMaterial({ color: bColor, roughness: 0.85, metalness: 0.3 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMat);
      body.position.y = h/2; body.castShadow = true; body.receiveShadow = true;
      group.add(body);
      const cols = Math.max(4, Math.floor(w / 2.5));
      const rows = Math.max(4, Math.floor(h / 3));
      const spacingW = w / (cols + 1);
      const winBaseHue = Math.random() > 0.5 ? 0.08 : 0.6;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.3) {
            const winMat = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color().setHSL(winBaseHue + Math.random()*0.05, 0.8, 0.5 + Math.random()*0.3),
              emissive: new THREE.Color().setHSL(winBaseHue, 0.9, 0.4),
              emissiveIntensity: 0.3 + Math.random() * 1.2,
              transparent: true, opacity: 0.3 + Math.random() * 0.5,
              roughness: 0.1, metalness: 0.2,
            });
            const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8, 2, 2), winMat);
            win.position.set(
              (c - (cols-1)/2) * spacingW,
              h * 0.15 + (r / (rows-1 || 1)) * h * 0.7,
              d/2 + 0.01
            );
            group.add(win);
            const win2 = win.clone();
            win2.position.z = -d/2 - 0.01; win2.rotation.y = Math.PI;
            group.add(win2);
          }
        }
      }
      add(group);
      // Se registra para volverse transparente si tapa la vista.
      const mats = [];
      group.traverse(c => {
        if (c.material && !mats.includes(c.material)) {
          c.material.userData.baseOpacity = c.material.opacity;
          c.material.userData.baseTransparent = c.material.transparent;
          mats.push(c.material);
        }
      });
      this.occluders.push({ obj: group, mats, faded: false, box: null });
    };

    const treeMat = new THREE.MeshPhysicalMaterial({ color: 0x0d1a10, roughness: 0.9, metalness: 0.0 });
    const trunkMat = new THREE.MeshPhysicalMaterial({ color: 0x1a1210, roughness: 1.0, metalness: 0.0 });
    const addTree = (x, z, scale) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3*scale, 0.5*scale, 3*scale, 12, 1), trunkMat);
      trunk.position.y = 1.5*scale; trunk.castShadow = true; group.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2*scale, 12, 12), treeMat);
      crown.position.y = 3.5*scale + 1.2*scale; crown.castShadow = true;
      crown.scale.y = 0.8 + Math.random() * 0.2; group.add(crown);
      this.treeCanopies.push(crown);
      add(group);
    };

    // El brazo de la lámpara apunta hacia +X local; angle lo orienta hacia la vía.
    const addLamp = (x, z, angle) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z); group.rotation.y = angle;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 12, 16, 3), buildingMat);
      pole.position.y = 6; pole.castShadow = true; group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 0.6, 1, 1, 1), buildingMat);
      head.position.set(1.0, 12, 0); group.add(head);
      const bulb = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.4, 1, 1), new THREE.MeshBasicMaterial({color: 0xffffff}));
      bulb.rotation.x = Math.PI / 2; bulb.position.set(1.0, 11.84, 0); group.add(bulb);
      const light = new THREE.PointLight(0xfff5e0, 2.0, 45, 1.8);
      light.position.set(1.0, 11.5, 0);
      light.shadow.bias = -0.001; group.add(light);
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 64; glowCanvas.height = 64;
      const ctx = glowCanvas.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,240,0.8)'); grad.addColorStop(0.2, 'rgba(255,255,200,0.3)');
      grad.addColorStop(0.5, 'rgba(200,200,255,0.08)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 });
      const glow = new THREE.Sprite(glowMat);
      glow.position.set(1.0, 11.0, 0); glow.scale.set(8, 8, 1); group.add(glow);
      add(group);
    };
    // Ángulo de lámpara para que el brazo apunte hacia el punto (tx, tz).
    const lampToward = (x, z, tx, tz) => Math.atan2(-(tz - z), tx - x);

    const signMat = new THREE.MeshPhysicalMaterial({ color: 0xcc2222, roughness: 0.3, metalness: 0.1, emissive: 0x881111, emissiveIntensity: 0.3 });
    const signPoleMat = new THREE.MeshPhysicalMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.4 });
    const textMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0 });
    const addSign = (x, z, angle, type) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z); group.rotation.y = angle;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.5, 8, 1), signPoleMat);
      pole.position.y = 1.25; group.add(pole);
      if (type === 'stop') {
        const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 8), signMat);
        sign.position.y = 2.8; group.add(sign);
        const text = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), textMat);
        text.position.set(0, 2.8, 0.36); group.add(text);
      } else {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05, 1, 1, 1), new THREE.MeshPhysicalMaterial({ color: 0x1166aa, roughness: 0.4 }));
        sign.position.y = 2.8; group.add(sign);
        const text = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), textMat);
        text.position.set(0, 2.8, 0.04); group.add(text);
      }
      add(group);
    };

    if (infraestructura === 'interseccion_cruciforme' || infraestructura === 'interseccion') {
      addBox(140, 0.1, 16, 0, 0, 0, asphalt);
      addBox(16, 0.1, 140, 0, 0, 0, asphalt);
      addBox(62, 0.2, 62, -39, 0, -39, sidewalkMat);
      addBox(62, 0.2, 62, 39, 0, -39, sidewalkMat);
      addBox(62, 0.2, 62, -39, 0, 39, sidewalkMat);
      addBox(62, 0.2, 62, 39, 0, 39, sidewalkMat);
      makeBuilding(40, 30, 40, -40, -40);
      makeBuilding(30, 45, 50, 45, -45);
      makeBuilding(50, 20, 35, -45, 45);
      makeBuilding(35, 60, 35, 45, 45);
      addTree(-32, -32, 0.8); addTree(32, -32, 1.0); addTree(-32, 32, 0.9); addTree(32, 32, 1.1);
      addTree(-55, -55, 1.2); addTree(55, -55, 0.7); addTree(-55, 55, 1.0); addTree(55, 55, 0.9);
      addTree(-45, -45, 0.9); addTree(45, -45, 1.1); addTree(-45, 45, 1.0); addTree(45, 45, 0.8);
      addLamp(-12, -12, Math.PI/4); addLamp(12, -12, 3*Math.PI/4);
      addLamp(-12, 12, -Math.PI/4); addLamp(12, 12, -3*Math.PI/4);
      addLamp(-26, 0, Math.PI/2); addLamp(26, 0, -Math.PI/2);
      addLamp(0, -26, 0); addLamp(0, 26, Math.PI);

      const addTrafficLight = (x, z, rotY) => {
        const tGroup = new THREE.Group();
        tGroup.position.set(x, 0, z); tGroup.rotation.y = rotY;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5, 12, 3),
          new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.5 }));
        pole.position.y = 2.5; pole.castShadow = true; tGroup.add(pole);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.4),
          new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.3 }));
        housing.position.y = 5.2; tGroup.add(housing);
        const colors = [0xff0000, 0xffaa00, 0x00ff00];
        for (let i = 0; i < 3; i++) {
          const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16),
            new THREE.MeshPhysicalMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: i === 0 ? 2.5 : 0.4, roughness: 0.1, metalness: 0.1 }));
          light.position.set(0, 5.55 - i * 0.28, 0.23); tGroup.add(light);
        }
        add(tGroup);
      };
      addTrafficLight(-18, -18, Math.PI/4); addTrafficLight(18, -18, 3*Math.PI/4);
      addTrafficLight(-18, 18, -Math.PI/4); addTrafficLight(18, 18, -3*Math.PI/4);

      addSign(-22, -22, Math.PI/4, 'stop'); addSign(22, -22, 3*Math.PI/4, 'stop');
      addSign(-22, 22, -Math.PI/4, 'stop'); addSign(22, 22, -3*Math.PI/4, 'stop');

      // Carriles de 3.5 m: divisorias a ±3.5, doble amarilla en el eje, bordes a ±7.4
      for (let x = -68; x <= 68; x += 3.2) {
        if (Math.abs(x) < 11.5) continue;
        dashX(x, -3.5, 1.8); dashX(x, 3.5, 1.8);
        paint(1.8, 0.1, x, 0.14, yellowMat); paint(1.8, 0.1, x, -0.14, yellowMat);
      }
      for (let x = -69; x <= 69; x += 2) {
        if (Math.abs(x) < 9) continue;
        dashX(x, 7.4, 1.0); dashX(x, -7.4, 1.0);
      }
      for (let z = -68; z <= 68; z += 3.2) {
        if (Math.abs(z) < 11.5) continue;
        dashZ(z, -3.5, 1.8); dashZ(z, 3.5, 1.8);
        paint(1.8, 0.1, 0.14, z, yellowMat, Math.PI / 2); paint(1.8, 0.1, -0.14, z, yellowMat, Math.PI / 2);
      }
      for (let z = -69; z <= 69; z += 2) {
        if (Math.abs(z) < 9) continue;
        dashZ(z, 7.4, 1.0); dashZ(z, -7.4, 1.0);
      }

      // Pasos de cebra en cada acceso
      const crosswalk = (cx, cz, isX) => {
        for (let i = 0; i < 12; i++) {
          const off = -6.6 + i * 1.2;
          if (isX) paint(3.0, 0.6, cx, cz + off, crossMat);
          else paint(3.0, 0.6, cx + off, cz, crossMat, Math.PI / 2);
        }
      };
      crosswalk(-9.5, 0, true); crosswalk(9.5, 0, true);
      crosswalk(0, -9.5, false); crosswalk(0, 9.5, false);
    } else if (infraestructura === 'recta') {
      // Se construye a lo largo de X y luego se gira si la vía es norte-sur.
      const lanes = opts.lanes === 1 ? 1 : 2;
      const half = lanes * 3.5;
      const L = 400, shoulder = 0.6, swW = 4;
      addBox(L, 0.1, (half + shoulder) * 2, 0, 0, 0, asphalt);
      for (const s of [-1, 1]) {
        addBox(L, 0.25, swW, 0, 0.05, s * (half + shoulder + swW / 2), sidewalkMat);
        paint(L, 0.15, 0, s * (half + 0.1), dashMat);                          // línea de borde
        if (lanes === 2) for (let x = -L / 2 + 2; x <= L / 2 - 2; x += 6) dashX(x, s * 3.5, 3);
      }
      for (let x = -L / 2 + 2; x <= L / 2 - 2; x += 4) {                         // eje central
        paint(2.4, 0.1, x, 0.14, yellowMat); paint(2.4, 0.1, x, -0.14, yellowMat);
      }
      const edge = half + shoulder + swW;
      for (let x = -180; x <= 180; x += 15) for (const s of [-1, 1]) addTree(x + 3, s * (edge - 1), 0.8 + Math.random() * 0.4);
      for (let x = -180; x <= 180; x += 30) for (const s of [-1, 1]) addLamp(x, s * (half + shoulder + 0.8), lampToward(x, s * (half + shoulder + 0.8), x, 0));
      for (let x = -180; x <= 180; x += 24) {
        for (const s of [-1, 1]) {
          if (Math.random() < 0.25) continue;
          const d = 10 + Math.random() * 8;
          makeBuilding(16 + Math.random() * 5, 10 + Math.random() * 30, d, x + (Math.random() - 0.5) * 4, s * (edge + 3 + d / 2));
        }
      }
      if (opts.axis !== 'este_oeste') root.rotation.y = Math.PI / 2;   // +X local → norte
    } else if (infraestructura === 'rotonda') {
      const rInner = 18, rOuter = 30;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false, curveSegments: 96 });
      const ring = new THREE.Mesh(geo, asphalt);
      ring.rotation.x = -Math.PI / 2; ring.receiveShadow = true;
      add(ring);
      const island = new THREE.Mesh(new THREE.CylinderGeometry(rInner - 0.3, rInner, 0.4, 64), grassMat);
      island.position.y = 0.2; island.receiveShadow = true; add(island);
      for (let i = 0; i < 64; i += 2) {   // divisoria entre los dos carriles del anillo (r = 24)
        const a = (i / 64) * Math.PI * 2;
        paint(1.6, 0.15, 24 * Math.cos(a), -24 * Math.sin(a), dashMat, a + Math.PI / 2);
      }
      for (const angle of [0, 90, 180, 270]) {
        const rad = angle * Math.PI / 180;
        const length = 70, width = 14;
        const c = rOuter - 1 + length / 2;
        const box = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, width, 4, 1, 2), asphalt);
        box.position.set(Math.cos(rad) * c, 0.05, Math.sin(rad) * c); box.rotation.y = -rad;
        box.receiveShadow = true; add(box);
      }
      for (let i = 0; i < 12; i++) {
        if (i % 3 === 0) continue;   // no sobre los accesos
        const angle = (i / 12) * Math.PI * 2;
        makeBuilding(18 + Math.random() * 14, 15 + Math.random() * 25, 18 + Math.random() * 14, Math.cos(angle) * 62, Math.sin(angle) * 62);
        addLamp(Math.cos(angle) * 33, Math.sin(angle) * 33, lampToward(Math.cos(angle) * 33, Math.sin(angle) * 33, 0, 0));
      }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; addTree(Math.cos(a) * 9, Math.sin(a) * 9, 1.0); }
    } else { // curva: recta por x = 40 (sur), arco de 90° con centro (0,0) y recta por y = 40 (oeste)
      const R = 40, halfW = 4, L = 120;
      const arc = new THREE.Mesh(new THREE.RingGeometry(R - halfW, R + halfW, 96, 1, 0, Math.PI / 2), asphalt);
      arc.rotation.x = -Math.PI / 2; arc.position.y = 0.06; arc.receiveShadow = true; add(arc);
      addBox(halfW * 2, 0.1, L, R, 0, L / 2, asphalt);      // tramo sur  (y de −L a 0)
      addBox(L, 0.1, halfW * 2, -L / 2, 0, -R, asphalt);    // tramo oeste (x de −L a 0)
      for (let i = 0; i < 30; i += 2) {
        const a = ((i + 0.5) / 30) * Math.PI / 2;
        paint(1.8, 0.12, R * Math.cos(a), -R * Math.sin(a), yellowMat, a + Math.PI / 2);
      }
      for (let z = 2; z < L; z += 3.2) dashZ(z, R, 1.8, yellowMat);
      for (let x = -2; x > -L; x -= 3.2) dashX(x, -R, 1.8, yellowMat);
      for (let i = 1; i < 6; i++) {
        const a = (i / 6) * Math.PI / 2;
        makeBuilding(14 + Math.random() * 10, 10 + Math.random() * 18, 14 + Math.random() * 10, Math.cos(a) * (R + 22), -Math.sin(a) * (R + 22));
        addTree(Math.cos(a) * (R - 12), -Math.sin(a) * (R - 12), 1.0);
        addLamp(Math.cos(a) * (R + halfW + 1), -Math.sin(a) * (R + halfW + 1), lampToward(Math.cos(a) * (R + halfW + 1), -Math.sin(a) * (R + halfW + 1), 0, 0));
      }
      for (let z = 20; z < L; z += 25) { makeBuilding(14, 12 + Math.random() * 20, 16, R + 18, z); addTree(R - 10, z, 0.9); }
      for (let x = -20; x > -L; x -= 25) { makeBuilding(16, 12 + Math.random() * 20, 14, x, -R - 18); addTree(x, -R + 10, 0.9); }
    }

    root.updateMatrixWorld(true);
    this.occluders.forEach(o => { o.box = new THREE.Box3().setFromObject(o.obj); });
  }

  // Vuelve casi transparentes los edificios que se interponen entre la
  // cámara y lo que se está mirando: los que cortan la parte central del
  // cono de visión hacia el objetivo y los que tapan a los vehículos.
  _updateOcclusion() {
    if (!this.occluders.length) return;
    const cam = this.camera.position;
    const target = this.controls.target;
    const pts = [target];
    for (const m of [this.v1Mesh, this.v2Mesh]) if (m) pts.push(new THREE.Vector3(m.position.x, 1, m.position.z));
    const viewDist = cam.distanceTo(target);
    const coneK = Math.tan(deg2rad(this.camera.fov / 2)) * 0.95;
    for (const o of this.occluders) {
      if (!o.box) continue;
      let hide = o.box.containsPoint(cam);
      for (let i = 1; !hide && i < 12; i++) {
        const f = i / 12;
        this._occTmp.lerpVectors(cam, target, f);
        if (o.box.distanceToPoint(this._occTmp) < f * viewDist * coneK) hide = true;
      }
      for (let i = 0; !hide && i < pts.length; i++) {
        this._occDir.subVectors(pts[i], cam);
        const dist = this._occDir.length();
        if (dist < 1e-3) continue;
        this._occRay.set(cam, this._occDir.normalize());
        const hit = this._occRay.intersectBox(o.box, this._occTmp);
        if (hit && cam.distanceTo(hit) < dist - 0.5) hide = true;
      }
      if (hide === o.faded) continue;
      o.faded = hide;
      o.mats.forEach(m => {
        m.transparent = hide ? true : m.userData.baseTransparent;
        m.opacity = hide ? m.userData.baseOpacity * 0.12 : m.userData.baseOpacity;
        m.depthWrite = !hide;
        m.needsUpdate = true;
      });
    }
  }

  _makeVehicle(colorHex, emissiveHex, type) {
    const group = new THREE.Group();
    group.userData.wheels = [];

    // ═══════════════════════════════════════════════════════════
    //  COORDINATE SYSTEM (strict)
    //    X = lateral (LEFT / RIGHT), symmetric about X = 0
    //    Y = vertical (UP),          ground at Y = 0
    //    Z = longitudinal,           FRONT = −Z, REAR = +Z
    // ═══════════════════════════════════════════════════════════

    const isSUV    = type === 'suv';
    const isPickup = type === 'pickup';
    const isHatch  = type === 'hatchback';
    const isSport  = type === 'deportivo';

    // ─── PROPORTIONAL DIMENSIONS ──────────────────────────────
    // Largo y ancho = VEHICLE_DIMS (los mismos que conoce la IA)
    const bodyLen  = isPickup ? 5.2 : (isSUV ? 4.6 : (isSport ? 3.8 : (isHatch ? 4.0 : 4.5)));
    const bodyWid  = isPickup ? 1.9 : (isSUV ? 1.9 : (isSport ? 1.9 : 1.8));
    const bodyH    = isPickup ? 0.75 : (isSUV ? 0.8 : (isSport ? 0.5 : 0.6));
    const cabinLen = isPickup ? 1.8 : (isSUV ? 3.2 : (isSport ? 1.8 : 2.2));
    const cabinW   = bodyWid - 0.2;
    const cabinH   = isSUV ? 1.0 : (isPickup ? 0.9 : (isSport ? 0.7 : 0.8));
    const wheelR   = isSUV ? 0.35 : (isSport ? 0.28 : 0.30);
    const wheelW   = 0.22;
    const axleHalf = bodyLen / 2.8;
    const hoodLen  = bodyLen * 0.25;

    // ─── MATERIALS ────────────────────────────────────────────
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: colorHex, roughness: 0.15, metalness: 0.85,
      clearcoat: 1.0, clearcoatRoughness: 0.1,
      envMap: this.envMap, envMapIntensity: 2.5, reflectivity: 1.0, ior: 1.5,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x020c18, roughness: 0.05, metalness: 0.0,
      transparent: true, opacity: 0.4, envMap: this.envMap, envMapIntensity: 1.2,
      clearcoat: 1.0, ior: 1.45, transmission: 0.9, thickness: 0.3,
    });
    const rubberMat = new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.0 });
    const chromeMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0e0e0, roughness: 0.008, metalness: 1.0,
      envMap: this.envMap, envMapIntensity: 3.0, clearcoat: 1.5, clearcoatRoughness: 0.005,
    });
    const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x020202, roughness: 0.3, metalness: 0.1 });
    const lightMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 12, roughness: 0.02, metalness: 0.0,
    });
    const tailMat = new THREE.MeshPhysicalMaterial({
      color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 10, roughness: 0.05, metalness: 0.0,
    });
    const redGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xff0000, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.7,
      transmission: 0.8, thickness: 0.2,
    });
    const seatMat = new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.0 });
    const bumperMat = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.2 });

    const box = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      group.add(m); return m;
    };

    // ═══════════════════════════════════════════════════════════
    //  1. CHASSIS BASE  (full-length box, centred at origin)
    // ═══════════════════════════════════════════════════════════
    box(bodyWid, bodyH, bodyLen, 0, bodyH / 2, 0, bodyMat);

    // ═══════════════════════════════════════════════════════════
    //  2. HOOD  (front section, −Z)
    // ═══════════════════════════════════════════════════════════
    const hoodH = bodyH * 0.65;
    box(bodyWid * 0.92, hoodH, hoodLen, 0, hoodH / 2, -(bodyLen / 2 - hoodLen / 2), bodyMat);

    // ═══════════════════════════════════════════════════════════
    //  3. TRUNK  (rear section, +Z) — sedan / hatch / sport
    // ═══════════════════════════════════════════════════════════
    if (!isPickup) {
      const trunkLen = bodyLen * 0.2, trunkH = bodyH * 0.65;
      box(bodyWid * 0.88, trunkH, trunkLen, 0, trunkH / 2, bodyLen / 2 - trunkLen / 2, bodyMat);
    }

    // ═══════════════════════════════════════════════════════════
    //  4. CABIN  (centred on chassis; pickup offset forward)
    // ═══════════════════════════════════════════════════════════
    const cabinY = bodyH + cabinH / 2;
    const cabinZ = isPickup ? -(bodyLen / 2 - hoodLen - cabinLen / 2) : 0;
    box(cabinW, cabinH, cabinLen, 0, cabinY, cabinZ, bodyMat);

    // ═══════════════════════════════════════════════════════════
    //  5. PICKUP CARGO BED  (rear, +Z)
    // ═══════════════════════════════════════════════════════════
    if (isPickup) {
      const bedLen = bodyLen - hoodLen - cabinLen - 0.1;
      const bedZ   = bodyLen / 2 - bedLen / 2;
      const bedMat = new THREE.MeshPhysicalMaterial({ color: 0x332222, roughness: 0.85, metalness: 0.1 });
      const wallH = 0.45;
      box(bodyWid * 0.9, 0.04, bedLen, 0, bodyH + 0.02, bedZ, bedMat);                       // piso de la palangana
      for (const s of [-1, 1])
        box(0.06, wallH, bedLen, s * (bodyWid / 2 - 0.03), bodyH + wallH / 2, bedZ, bodyMat);   // laterales
      box(bodyWid, wallH, 0.06, 0, bodyH + wallH / 2, bodyLen / 2 - 0.03, bodyMat);            // compuerta trasera
      box(bodyWid, wallH, 0.06, 0, bodyH + wallH / 2, bedZ - bedLen / 2 + 0.03, bodyMat);      // frente de la palangana
      // Side steps (cylindrical chrome)
      for (const s of [-1, 1]) {
        const step = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, cabinLen * 0.6, 12), chromeMat);
        step.rotation.x = Math.PI / 2;
        step.position.set(s * (bodyWid / 2 + 0.05), bodyH * 0.35, cabinZ);
        group.add(step);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  6. WHEELS  — CylinderGeometry, axle along X, bottom at Y = 0
    // ═══════════════════════════════════════════════════════════
    const makeWheel = (x, z) => {
      const wg = new THREE.Group();
      wg.position.set(x, wheelR, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 32), rubberMat);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true; wg.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.65, wheelR * 0.65, wheelW * 0.8, 32), chromeMat);
      rim.rotation.z = Math.PI / 2; wg.add(rim);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelR * 0.08, wheelR * 0.25, wheelW * 0.55), chromeMat);
        spoke.position.set(Math.sin(a) * wheelR * 0.35, Math.cos(a) * wheelR * 0.35, 0);
        wg.add(spoke);
      }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.18, wheelR * 0.2, wheelW * 0.12, 16), chromeMat);
      cap.rotation.z = Math.PI / 2; wg.add(cap);
      const caliper = new THREE.Mesh(new THREE.BoxGeometry(wheelR * 0.08, wheelR * 0.18, wheelW * 0.25),
        new THREE.MeshPhysicalMaterial({ color: 0xcc1111, roughness: 0.3, metalness: 0.6 }));
      caliper.position.set(0, 0, wheelW * 0.45); wg.add(caliper);
      group.add(wg); return wg;
    };
    group.userData.wheels.push(makeWheel(-bodyWid / 2, -axleHalf));
    group.userData.wheels.push(makeWheel( bodyWid / 2, -axleHalf));
    group.userData.wheels.push(makeWheel(-bodyWid / 2,  axleHalf));
    group.userData.wheels.push(makeWheel( bodyWid / 2,  axleHalf));

    for (const s of [-1, 1]) {
      for (const z of [-axleHalf, axleHalf]) {
        const archR = bodyWid * 0.22;
        const arch = new THREE.Mesh(new THREE.CylinderGeometry(archR, archR, 0.15, 16, 1, true, 0, Math.PI), bodyMat);
        arch.rotation.z = Math.PI / 2;
        arch.position.set(s * bodyWid * 0.46, bodyH * 0.15, z);
        arch.scale.set(0.6, 1, 1.1); group.add(arch);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  7. GLASS  — windshield (−Z), rear (+Z), sides (±X)
    // ═══════════════════════════════════════════════════════════
    const glassH = cabinH * 0.8;
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(cabinW, glassH), glassMat);
    windshield.position.set(0, cabinY, cabinZ - cabinLen / 2);
    windshield.rotation.y = Math.PI; windshield.rotation.x = 0.15;
    group.add(windshield);
    const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(cabinW, cabinH * 0.7), glassMat);
    rearGlass.position.set(0, cabinY, cabinZ + cabinLen / 2);
    rearGlass.rotation.x = -0.15;
    group.add(rearGlass);
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(cabinLen * 0.8, cabinH * 0.7), glassMat);
      sw.position.set(s * (cabinW / 2 + 0.01), cabinY, cabinZ);
      sw.rotation.y = Math.PI / 2; group.add(sw);
    }

    // ═══════════════════════════════════════════════════════════
    //  8. HEADLIGHTS  — front (−Z), symmetric in X
    // ═══════════════════════════════════════════════════════════
    const hlMat = new THREE.MeshPhysicalMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 16, roughness: 0.02, metalness: 0.0 });
    const hlGlowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(32,32,0,32,32,32); g.addColorStop(0,'rgba(255,255,200,1)'); g.addColorStop(0.3,'rgba(255,255,200,0.6)'); g.addColorStop(1,'rgba(255,255,200,0)'); ctx.fillStyle = g; ctx.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
    const hlGlowMat = new THREE.SpriteMaterial({ map: hlGlowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const s of [-1, 1]) {
      box(0.15, 0.14, 0.08, s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.04), darkMat);
      const hlBulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), hlMat);
      hlBulb.position.set(s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.05));
      group.add(hlBulb);
      const glow = new THREE.Sprite(hlGlowMat);
      glow.position.set(s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.3));
      glow.scale.set(2.5, 1.5, 1); group.add(glow);
      const hlSpot = new THREE.PointLight(0xffffcc, 2.5, 18, 1.8);
      hlSpot.position.set(s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.5));
      group.add(hlSpot);
    }

    // ═══════════════════════════════════════════════════════════
    //  9. TAILLIGHTS  — rear (+Z), symmetric in X
    // ═══════════════════════════════════════════════════════════
    for (const s of [-1, 1]) {
      box(0.15, 0.14, 0.06, s * bodyWid * 0.42, bodyH * 0.55, bodyLen / 2 + 0.04, redGlassMat);
      const tlBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), tailMat);
      tlBulb.position.set(s * bodyWid * 0.42, bodyH * 0.55, bodyLen / 2 + 0.05);
      group.add(tlBulb);
    }

    // ═══════════════════════════════════════════════════════════
    //  10. BUMPERS & GRILLE
    // ═══════════════════════════════════════════════════════════
    box(bodyWid * 0.55, 0.25, 0.12, 0, bodyH * 0.2, -(bodyLen / 2 + 0.06), bumperMat); // front
    box(bodyWid * 0.55, 0.3,  0.12, 0, bodyH * 0.15, bodyLen / 2 + 0.06, bumperMat);     // rear
    box(bodyWid * 0.35, bodyH * 0.4, 0.02, 0, bodyH * 0.55, -(bodyLen / 2 + 0.06), darkMat);
    for (let i = -3; i <= 3; i++)
      box(bodyWid * 0.28, 0.015, 0.01, 0, bodyH * 0.55 + i * 0.04, -(bodyLen / 2 + 0.07), chromeMat);
    if (isSport) {
      for (const s of [-0.15, 0.15]) {
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 16, 1), chromeMat);
        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(s * bodyWid * 0.2, bodyH * 0.3, bodyLen / 2 + 0.08);
        group.add(exhaust);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  11. SIDE MIRRORS  — symmetric in X
    // ═══════════════════════════════════════════════════════════
    for (const s of [-1, 1]) {
      const mg = new THREE.Group();
      mg.position.set(s * (cabinW / 2 + 0.15), cabinY + cabinH * 0.4, cabinZ + cabinLen * 0.3);
      const mb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.15), bodyMat);
      mb.position.z = 0.05; mg.add(mb);
      const mf = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.03), chromeMat);
      mf.position.z = -0.05; mg.add(mf);
      group.add(mg);
    }

    // ═══════════════════════════════════════════════════════════
    //  12. DOOR LINES  — symmetric in X
    // ═══════════════════════════════════════════════════════════
    for (const s of [-1, 1]) {
      const dl = new THREE.Mesh(new THREE.BoxGeometry(0.005, bodyH * 0.5, bodyLen * 0.45), darkMat);
      dl.position.set(s * (bodyWid / 2 + 0.001), bodyH * 0.6, 0); group.add(dl);
    }

    // ═══════════════════════════════════════════════════════════
    //  13. INTERIOR  — dashboard, steering, seats (symmetric X)
    // ═══════════════════════════════════════════════════════════
    box(cabinW * 0.8, 0.12, cabinLen * 0.35, 0, bodyH + 0.12, cabinZ + cabinLen * 0.25, darkMat);
    const stg = new THREE.Group();
    stg.position.set(0, bodyH + 0.45, cabinZ + cabinLen * 0.2);
    const sr = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 12, 24), new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.1 }));
    sr.rotation.x = Math.PI / 3; stg.add(sr); group.add(stg);
    for (const s of [-1, 1]) {
      const sg = new THREE.Group();
      sg.position.set(s * cabinW * 0.2, bodyH + 0.05, cabinZ - cabinLen * 0.05);
      const sb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.25), seatMat);
      sb.position.y = 0.04; sg.add(sb);
      const sback = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.04), seatMat);
      sback.position.set(0, 0.2, -0.05); sback.rotation.x = 0.15; sg.add(sback);
      const hr = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.04), seatMat);
      hr.position.set(0, 0.4, -0.05); sg.add(hr);
      group.add(sg);
    }

    // ═══════════════════════════════════════════════════════════
    //  14. WIPERS, ANTENNA, HOOD LINE
    // ═══════════════════════════════════════════════════════════
    for (const s of [-0.15, 0.15]) {
      const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.01, cabinW * 0.35), darkMat);
      wiper.position.set(s * cabinW * 0.2, bodyH + cabinH + 0.12, cabinZ - cabinLen / 2 + 0.1);
      wiper.rotation.x = 0.2; group.add(wiper);
    }
    if (!isSport) {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 0.25, 8), darkMat);
      antenna.position.set(0, bodyH + cabinH + 0.25, cabinZ - cabinLen * 0.2);
      group.add(antenna);
    }

    // ═══════════════════════════════════════════════════════════
    //  15. SPORT SPOILER  (rear, +Z)
    // ═══════════════════════════════════════════════════════════
    if (isSport) {
      box(0.01, 0.06, bodyWid * 0.45, 0, bodyH + cabinH + 0.05, bodyLen / 2 - 0.1, darkMat);
    }

    // ═══════════════════════════════════════════════════════════
    //  16. NEON UNDERGLOW
    // ═══════════════════════════════════════════════════════════
    const neonMat = new THREE.MeshPhysicalMaterial({
      color: emissiveHex, emissive: emissiveHex, emissiveIntensity: 4.0,
      transparent: true, opacity: 0.9, roughness: 0.1, metalness: 0.2,
    });
    const neon = new THREE.Mesh(new THREE.BoxGeometry(bodyWid * 0.7, 0.04, bodyLen * 0.7, 2, 1, 1), neonMat);
    neon.position.set(0, 0.12, 0); group.add(neon);
    const underGlow = new THREE.PointLight(emissiveHex, 4.0, 15);
    underGlow.position.set(0, 0.15, 0); group.add(underGlow);

    // ═══════════════════════════════════════════════════════════
    //  17. GROUND OFFSET  — ruedas apoyadas en Y = 0, carrocería elevada
    // ═══════════════════════════════════════════════════════════
    const clearance = wheelR * 0.55;
    group.children.forEach(c => { if (!group.userData.wheels.includes(c)) c.position.y += clearance; });
    group.userData.wheelBottomY = 0;
    group.userData.wheelR = wheelR;

    return group;
  }

  // ─────── MOTOCICLETA + MOTORISTA ───────
  // Mismo sistema que _makeVehicle: X lateral, Y arriba, frente hacia −Z.
  // Largo ≈ 2.1 m, ancho (manubrio) ≈ 0.8 m; ruedas apoyadas en Y = 0.
  _makeMotorcycle(colorHex, emissiveHex) {
    const group = new THREE.Group();
    group.userData.wheels = [];
    group.userData.isMoto = true;

    const paint = new THREE.MeshPhysicalMaterial({
      color: colorHex, roughness: 0.2, metalness: 0.7, clearcoat: 1.0, clearcoatRoughness: 0.1,
      envMap: this.envMap, envMapIntensity: 2.0,
    });
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.3 });
    const chrome = new THREE.MeshPhysicalMaterial({ color: 0xdddddd, roughness: 0.05, metalness: 1.0, envMap: this.envMap, envMapIntensity: 3.0 });
    const rubber = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.0 });
    const seatMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.85, metalness: 0.0 });
    const jacket = new THREE.MeshPhysicalMaterial({ color: 0x2b313d, roughness: 0.8, metalness: 0.05 });
    const pants = new THREE.MeshPhysicalMaterial({ color: 0x1b2230, roughness: 0.85, metalness: 0.0 });
    const helmet = new THREE.MeshPhysicalMaterial({ color: 0xeeeeee, roughness: 0.2, metalness: 0.3, clearcoat: 1.0, envMap: this.envMap });
    const visor = new THREE.MeshPhysicalMaterial({ color: 0x050a12, roughness: 0.05, metalness: 0.6, envMap: this.envMap, envMapIntensity: 2.0 });

    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m); return m;
    };
    // Cilindro entre dos puntos (tubos del chasis y extremidades del motorista).
    const limb = (a, b, r, mat) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const dir = B.clone().sub(A);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 10), mat);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      m.castShadow = true; group.add(m); return m;
    };

    const R = 0.31, zF = -0.72, zR = 0.70;
    const makeWheel = (z) => {
      const wg = new THREE.Group();
      wg.position.set(0, R, z);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(R - 0.06, 0.06, 12, 32), rubber);
      tire.rotation.y = Math.PI / 2; tire.castShadow = true; wg.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.1, R - 0.1, 0.04, 24), chrome);
      rim.rotation.z = Math.PI / 2; wg.add(rim);
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, R * 1.5, 0.03), dark);
        spoke.rotation.x = (i / 5) * Math.PI; wg.add(spoke);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 16), dark);
      hub.rotation.z = Math.PI / 2; wg.add(hub);
      group.add(wg); group.userData.wheels.push(wg);
    };
    makeWheel(zF); makeWheel(zR);

    // Horquilla, manubrio, faro y guardafango delantero
    for (const s of [-1, 1]) limb([s * 0.09, R, zF], [s * 0.09, R + 0.72, zF + 0.24], 0.025, chrome);
    limb([-0.4, 1.06, zF + 0.27], [0.4, 1.06, zF + 0.27], 0.018, dark);
    for (const s of [-1, 1]) limb([s * 0.3, 1.06, zF + 0.27], [s * 0.4, 1.06, zF + 0.27], 0.026, rubber);
    add(new THREE.BoxGeometry(0.22, 0.2, 0.16), paint, 0, 0.98, zF + 0.16);                       // carenado
    const hl = add(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshPhysicalMaterial({
      color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 14, roughness: 0.02,
    }), 0, 0.93, zF + 0.07);
    hl.castShadow = false;
    const hlLight = new THREE.PointLight(0xffffcc, 2.0, 14, 1.8);
    hlLight.position.set(0, 0.93, zF - 0.4); group.add(hlLight);
    add(new THREE.BoxGeometry(0.14, 0.03, 0.5), paint, 0, 2 * R + 0.05, zF + 0.02, 0.15, 0, 0);    // guardafango

    // Chasis, motor, tanque, asiento, colín
    limb([0, 1.0, zF + 0.24], [0, 0.55, 0.05], 0.035, dark);
    limb([0, 0.55, 0.05], [0, 0.82, 0.45], 0.03, dark);
    add(new THREE.BoxGeometry(0.3, 0.3, 0.46), dark, 0, 0.45, -0.05);                              // motor
    add(new THREE.BoxGeometry(0.33, 0.12, 0.3), chrome, 0, 0.32, -0.08);                           // cárter
    const tank = add(new THREE.SphereGeometry(0.2, 20, 14), paint, 0, 0.86, -0.22);
    tank.scale.set(0.95, 0.62, 1.45);
    add(new THREE.BoxGeometry(0.28, 0.09, 0.62), seatMat, 0, 0.86, 0.28);                         // asiento
    add(new THREE.BoxGeometry(0.26, 0.16, 0.42), paint, 0, 0.78, 0.6, -0.12, 0, 0);               // colín
    add(new THREE.BoxGeometry(0.14, 0.03, 0.42), paint, 0, 2 * R + 0.04, zR + 0.12, -0.2, 0, 0);  // guardafango trasero
    add(new THREE.BoxGeometry(0.14, 0.05, 0.03), new THREE.MeshPhysicalMaterial({
      color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 8,
    }), 0, 0.78, 0.83);                                                                            // calavera
    for (const s of [-1, 1]) limb([s * 0.1, 0.45, 0.1], [s * 0.1, R, zR], 0.03, dark);            // basculante
    const exhaust = add(new THREE.CylinderGeometry(0.045, 0.055, 0.62, 14), chrome, 0.19, 0.38, 0.42);
    exhaust.rotation.x = Math.PI / 2 - 0.12;

    // Motorista
    const hipY = 0.98, hipZ = 0.26;
    for (const s of [-1, 1]) {
      limb([s * 0.12, hipY, hipZ], [s * 0.2, 0.86, -0.12], 0.065, pants);   // muslo
      limb([s * 0.2, 0.86, -0.12], [s * 0.2, 0.42, 0.02], 0.055, pants);    // pierna
      add(new THREE.BoxGeometry(0.1, 0.08, 0.22), dark, s * 0.2, 0.4, -0.03); // bota
    }
    const torso = add(new THREE.BoxGeometry(0.36, 0.56, 0.24), jacket, 0, hipY + 0.24, hipZ - 0.12, -0.45, 0, 0);
    torso.castShadow = true;
    for (const s of [-1, 1]) {
      limb([s * 0.2, 1.42, 0.0], [s * 0.3, 1.2, -0.3], 0.05, jacket);       // brazo
      limb([s * 0.3, 1.2, -0.3], [s * 0.36, 1.07, zF + 0.27], 0.045, jacket); // antebrazo
    }
    add(new THREE.SphereGeometry(0.15, 20, 16), helmet, 0, 1.6, -0.08);
    add(new THREE.SphereGeometry(0.152, 20, 12, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.35, Math.PI * 0.3), visor, 0, 1.6, -0.08);

    // Luz inferior de identificación (rojo V1 / azul V2, como los autos)
    const neon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 1.2), new THREE.MeshPhysicalMaterial({
      color: emissiveHex, emissive: emissiveHex, emissiveIntensity: 4.0, transparent: true, opacity: 0.9,
    }));
    neon.position.set(0, 0.12, 0); group.add(neon);
    const glow = new THREE.PointLight(emissiveHex, 3.0, 8);
    glow.position.set(0, 0.15, 0); group.add(glow);

    group.userData.wheelBottomY = 0;
    group.userData.wheelR = R;
    return group;
  }

  // ─────── TRUCK — PETERBILT 579 / KENWORTH T880 (V1) ───────
  _makeTruck(colorHex) {
    const group = new THREE.Group();
    group.userData.wheels = [];
    const col = colorHex || 0xcc2222;

    // ── Materials (roughness:0.2 / metalness:0.8 for paint) ──
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.2, metalness: 0.8, clearcoat: 0.5, clearcoatRoughness: 0.15, envMap: this.envMap, envMapIntensity: 2.0 });
    const grayMat = new THREE.MeshPhysicalMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.7 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x020c18, roughness: 0.005, metalness: 0.0, transparent: true, opacity: 0.65, envMap: this.envMap, envMapIntensity: 1.0, ior: 1.45 });
    const rubberMat = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.9, metalness: 0.0 });
    const rimMat = new THREE.MeshPhysicalMaterial({ color: 0xaaaaaa, roughness: 0.15, metalness: 0.9 });
    const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.8, metalness: 0.2 });
    const intMat = new THREE.MeshPhysicalMaterial({ color: 0x151515, roughness: 0.6, metalness: 0.05 });
    const hlMat = new THREE.MeshPhysicalMaterial({ color: 0xffffdd, emissive: 0xffffdd, emissiveIntensity: 22, roughness: 0.02, metalness: 0.0 });

    const box = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      group.add(m); return m;
    };

    const tLen = 6.0, tWid = 2.2, fH = 0.55, cabH = 1.6, hoodLen = 1.3, cabLen = 1.4, slLen = 0.5, bedLen = 2.6;

    // Chasis base largo
    for (const side of [-1, 1]) {
      box(tLen - 0.4, 0.15, 0.06, 0, fH - 0.08, side * 0.35, darkMat);
      for (let i = -2.6; i <= 2.6; i += 1.0) box(0.06, 0.15, 0.7, i, fH - 0.08, 0, darkMat);
    }

    // Motor delantero angular (chato pero angular)
    const hoodH = 1.0;
    box(hoodLen, hoodH, tWid * 0.55, tLen/2 - hoodLen/2 - 0.15, fH + hoodH/2, 0, bodyMat);
    // Angulo frontal del capó (plano inclinado)
    const hoodFace = new THREE.Mesh(new THREE.PlaneGeometry(tWid * 0.55, hoodH * 0.8), bodyMat);
    hoodFace.position.set(tLen/2 - 0.1, fH + hoodH * 0.6, 0);
    hoodFace.rotation.y = -0.3; group.add(hoodFace);

    // Parrilla frontal — rejilla procedimental (líneas grises)
    const grilleBack = new THREE.Mesh(new THREE.PlaneGeometry(tWid * 0.4, 1.1), darkMat);
    grilleBack.position.set(tLen/2, fH + 0.65, 0); group.add(grilleBack);
    for (let i = -4; i <= 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.018, tWid * 0.34), grayMat);
      bar.position.set(tLen/2 + 0.01, fH + 0.65 + i * 0.1, 0); group.add(bar);
    }
    box(0.03, 1.15, tWid * 0.42, tLen/2, fH + 0.65, 0, grayMat);

    // Parachoques delantero
    box(0.12, 0.28, tWid * 0.55, tLen/2 + 0.06, fH + 0.1, 0, darkMat);

    // Cabina dividida: motor angular + parabrisas 45° + dormitorio 15% más alto
    const cabX = tLen/2 - hoodLen - 0.15 - cabLen/2;
    const sleeperH = cabH * 1.15;
    box(cabLen, cabH, tWid * 0.62, cabX, fH + cabH/2, 0, bodyMat);

    // Parabrisas inclinado a 45° (planos)
    const wsW = tWid * 0.55, wsH = cabH * 0.55;
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(wsW, wsH), glassMat);
    windshield.position.set(cabX + cabLen/2 - 0.03, fH + cabH * 0.45, 0);
    windshield.rotation.y = -Math.PI / 4; group.add(windshield);

    // Dormitorio trasero 15% más alto que la cabina de conducción
    box(slLen, sleeperH, tWid * 0.62, cabX - cabLen/2 - slLen/2, fH + sleeperH/2, 0, bodyMat);
    // Ventana dormitorio
    const slWin = new THREE.Mesh(new THREE.PlaneGeometry(tWid * 0.4, sleeperH * 0.4), glassMat);
    slWin.position.set(cabX - cabLen/2 - slLen/2, fH + sleeperH * 0.4, tWid * 0.31); slWin.rotation.y = Math.PI / 2; group.add(slWin);
    // Ventanas laterales cabina
    for (const zOff of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(cabLen * 0.6, wsH * 0.7), glassMat);
      sw.position.set(cabX, fH + cabH * 0.4, zOff * (tWid * 0.31)); sw.rotation.y = Math.PI / 2; group.add(sw);
    }

    // Flatbed / Cargo
    const bedX = cabX - cabLen/2 - slLen - bedLen/2;
    box(bedLen, 0.06, tWid * 0.65, bedX, fH + 0.03, 0, darkMat);
    for (const s of [-1, 1]) box(bedLen, 0.5, 0.04, bedX, fH + 0.3, s * tWid * 0.33, bodyMat);
    box(0.04, 0.6, tWid * 0.6, bedX + bedLen/2 + 0.02, fH + 0.35, 0, bodyMat);

    // 2 espejos retrovisores verticales
    for (const zOff of [-1, 1]) {
      const mg = new THREE.Group();
      mg.position.set(cabX + cabLen * 0.1, fH + cabH * 0.5, zOff * (tWid * 0.62 / 2 + 0.05));
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8), grayMat);
      arm.rotation.z = Math.PI / 2; mg.add(arm);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.02), grayMat);
      mirror.position.set(0, 0.05, 0); mg.add(mirror);
      const mirrorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.005), new THREE.MeshPhysicalMaterial({ color: 0x88bbee, roughness: 0.05, metalness: 0.9 }));
      mirrorGlass.position.set(0, 0.05, 0.01); mg.add(mirrorGlass);
      group.add(mg);
    }

    // ─── 10 LLANTAS TOTALES (cilindros negros + rines gris claro) ───
    const tR = 0.34, rimR = 0.22;
    const makeWheel = (x, z, dual) => {
      const wg = new THREE.Group();
      wg.position.set(x, tR * 0.5, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.9, 0.3, 20), rubberMat);
      tire.rotation.x = Math.PI / 2; wg.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.95, 0.32, 20), rimMat);
      rim.rotation.x = Math.PI / 2; wg.add(rim);
      if (dual) {
        const t2 = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.9, 0.3, 20), rubberMat);
        t2.rotation.x = Math.PI / 2; t2.position.x = 0.2; wg.add(t2);
        const r2 = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.95, 0.32, 20), rimMat);
        r2.rotation.x = Math.PI / 2; r2.position.x = 0.2; wg.add(r2);
      }
      group.add(wg); return wg;
    };
    // 2 frontales simples + 4 traseras dobles = 2+(4×2)=10 llantas
    group.userData.wheels.push(makeWheel(tLen/2 - 0.9, tWid * 0.42, false));
    group.userData.wheels.push(makeWheel(tLen/2 - 0.9, -tWid * 0.42, false));
    for (const axle of [-1, 1]) {
      const ax = -tLen/2 + 0.5 + axle * 0.55;
      group.userData.wheels.push(makeWheel(ax, tWid * 0.48, true));
      group.userData.wheels.push(makeWheel(ax, -tWid * 0.48, true));
    }

    // ─── 2 FOCOS SPOTLIGHT (castShadow) ───
    for (const zOff of [-0.35, 0.35]) {
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.4), hlMat);
      fl.position.set(tLen/2 + 0.04, fH + 0.8, zOff * tWid * 0.2); group.add(fl);
      const spot = new THREE.SpotLight(0xffffee, 4.0, 40, Math.PI / 6, 0.5, 2.0);
      spot.position.set(tLen/2 + 0.3, fH + 0.35, zOff * tWid * 0.25);
      spot.target.position.set(tLen/2 + 25, -3, zOff * tWid * 0.4);
      spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0008;
      group.add(spot); group.add(spot.target);
    }

    // ─── 2 CALAVERAS TRASERAS (MeshBasicMaterial, alta emisividad) ───
    for (const zOff of [-0.35, 0.35]) {
      const tlMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.35), tlMat);
      tl.position.set(-tLen/2, fH + 0.55, zOff); group.add(tl);
      const tlGlow = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2200 }));
      tlGlow.position.set(-tLen/2 - 0.01, fH + 0.55, zOff); group.add(tlGlow);
    }

    // Interior de cabina
    box(cabLen * 0.2, 0.06, tWid * 0.4, cabX + cabLen * 0.15, fH + cabH * 0.25, 0, intMat);
    box(0.25, 0.2, 0.3, cabX - cabLen * 0.1, fH + cabH * 0.15, 0, intMat);

    // Neón inferior
    const nm = new THREE.MeshPhysicalMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.0, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.2 });
    const neon = new THREE.Mesh(new THREE.BoxGeometry(tLen * 0.6, 0.03, tWid * 0.5), nm);
    neon.position.set(0, 0.04, 0); group.add(neon);
    group.userData.bbox = { l: tLen, w: tWid, h: fH + sleeperH };

    // El camión se modeló con el frente hacia +X: se envuelve y gira para
    // que, como el resto de vehículos, el frente quede hacia −Z.
    group.rotation.y = Math.PI / 2;
    group.position.y = tR * 0.5;
    const outer = new THREE.Group();
    outer.add(group);
    outer.userData.wheels = group.userData.wheels;
    outer.userData.spinAxis = 'z';
    outer.userData.wheelR = tR;
    outer.userData.wheelBottomY = 0;
    return outer;
  }

  // ─────── FILLER TRAFFIC — CATÁLOGO EXCLUSIVO GUATEMALA (switch-case) ───────
  _makeFillerVehicle(modelKey, colorHex) {
    const group = new THREE.Group();
    const bm = new THREE.MeshPhysicalMaterial({ color: colorHex, roughness: 0.2, metalness: 0.8, clearcoat: 0.6, clearcoatRoughness: 0.1, envMap: this.envMap, envMapIntensity: 2.0 });
    const bm2 = new THREE.MeshPhysicalMaterial({ color: 0x181818, roughness: 0.2, metalness: 0.8, clearcoat: 0.5 });
    const gm = new THREE.MeshPhysicalMaterial({ color: 0x020c18, roughness: 0.005, metalness: 0.0, transparent: true, opacity: 0.55, envMap: this.envMap, envMapIntensity: 1.0, ior: 1.45 });
    const cm = new THREE.MeshPhysicalMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.9, envMap: this.envMap, envMapIntensity: 2.0 });
    const dm = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.8, metalness: 0.2 });
    const rm = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.9, metalness: 0.0 });
    const rmGray = new THREE.MeshPhysicalMaterial({ color: 0xaaaaaa, roughness: 0.15, metalness: 0.9 });
    const lm = new THREE.MeshPhysicalMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 10, roughness: 0.02, metalness: 0.0 });
    const tm = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    const box = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
    };
    const cyl = (rT, rB, h, x, y, z, mat, rot) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, 16), mat);
      m.position.set(x, y, z); if (rot) m.rotation.x = rot; m.castShadow = true; group.add(m); return m;
    };
    const wheel = (x, y, z, r, rimR) => {
      const wg = new THREE.Group(); wg.position.set(x, y, z);
      wg.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, 0.2, 16), rm));
      wg.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.22, 16), rmGray));
      group.add(wg);
    };

    switch (modelKey) {
      // ── 1. TOYOTA HILUX (Doble Cabina) ──
      case 'hilux': {
        const l = 3.8, w = 2.0, ch = 0.65, cabH = 1.7, tR = 0.36, rimR = 0.24;
        // Chasis elevado (despeje alto)
        box(l, ch, w, 0, ch/2 + 0.3, 0, bm);
        // Cabina dividida en dos filas de asientos
        const cabLen = 1.5;
        box(cabLen, cabH, w * 0.62, 0.6, ch + cabH/2 + 0.3, 0, bm);
        // Parabrisas
        const ws = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.45), gm);
        ws.position.set(1.3, ch + cabH * 0.45 + 0.3, 0); ws.rotation.y = -0.25; group.add(ws);
        // Ventana trasera cabina
        const rw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.35), gm);
        rw.position.set(-0.1, ch + cabH * 0.38 + 0.3, 0); rw.rotation.y = 0.25; group.add(rw);
        // Palangana trasera: 30% más baja que el techo de la cabina
        const bedH = cabH * 0.7, bedLen = 1.7;
        box(bedLen, 0.04, w * 0.52, -0.75, ch + 0.38, 0, dm);
        for (const s of [-1, 1]) box(bedLen, bedH * 0.5, 0.035, -0.75, ch + bedH * 0.3 + 0.3, s * w * 0.27, bm);
        box(0.035, bedH * 0.5, w * 0.5, -1.6, ch + bedH * 0.3 + 0.3, 0, bm);
        // Defensa delantera (burrera) — tubos cilíndricos delgados negro mate
        for (const s of [-0.4, 0, 0.4]) {
          cyl(0.025, 0.025, w * 0.35, 1.9, ch + 0.45 + s, 0, dm, Math.PI / 2);
        }
        // Llantas todoterreno anchas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 1.0, tR * 0.4, s * w * 0.4, tR, rimR);
        // Faros
        for (const s of [-0.2, 0.2]) box(0.02, 0.12, 0.35, 1.9, ch + 0.7, s * w * 0.22, lm);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.4 - 0.1;
        break;
      }
      // ── 2. MITSUBISHI L200 / NISSAN FRONTIER ──
      case 'l200': {
        const l = 3.7, w = 2.0, ch = 0.6, cabH = 1.65, tR = 0.35, rimR = 0.23;
        box(l, ch, w, 0, ch/2 + 0.28, 0, bm);
        const cabLen = 1.45;
        box(cabLen, cabH, w * 0.62, 0.55, ch + cabH/2 + 0.28, 0, bm);
        // Capó delantero inclinado curvo (frontal más suave)
        const hood = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, 0.5), bm);
        hood.position.set(1.85, ch + 0.7 + 0.28, 0); hood.rotation.y = -0.2; group.add(hood);
        // Palangana
        const bedLen = 1.7, bedH = cabH * 0.7;
        box(bedLen, 0.04, w * 0.52, -0.75, ch + 0.35, 0, dm);
        for (const s of [-1, 1]) box(bedLen, bedH * 0.5, 0.035, -0.75, ch + bedH * 0.28 + 0.28, s * w * 0.27, bm);
        // Ruedas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.95, tR * 0.38, s * w * 0.4, tR, rimR);
        for (const s of [-0.2, 0.2]) box(0.02, 0.1, 0.3, 1.85, ch + 0.65 + 0.28, s * w * 0.22, lm);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.38 - 0.1;
        break;
      }
      // ── 3. HONDA CR-V / TOYOTA RAV4 (SUV un solo volumen) ──
      case 'crv': {
        const l = 3.3, w = 2.1, ch = 0.6, cabH = 1.75, tR = 0.34, rimR = 0.22;
        // Carrocería de un solo volumen cerrado de dos ejes
        box(l, ch, w, 0, ch/2 + 0.22, 0, bm);
        box(l * 0.7, cabH, w * 0.68, 0.15, ch + cabH/2 + 0.22, 0, bm);
        // Techo continuo hasta parte trasera — cae 90° exactos
        box(0.04, cabH * 0.9, w * 0.64, -1.25, ch + cabH * 0.45 + 0.22, 0, bm);
        // Barras de techo longitudinales negras
        for (const s of [-1, 1]) box(l * 0.4, 0.025, 0.025, 0.15, ch + cabH + 0.25, s * w * 0.3, dm);
        // Cristales
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, cabH * 0.45), gm);
        fw.position.set(1.25, ch + cabH * 0.42 + 0.22, 0); fw.rotation.y = -0.25; group.add(fw);
        const bw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, cabH * 0.4), gm);
        bw.position.set(-0.8, ch + cabH * 0.38 + 0.22, 0); bw.rotation.y = 0.3; group.add(bw);
        // Ruedas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.95, tR * 0.38, s * w * 0.4, tR, rimR);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.38 - 0.1;
        break;
      }
      // ── 4. TOYOTA RAV4 (con llanta de repuesto exterior) ──
      case 'rav4': {
        const l = 3.3, w = 2.1, ch = 0.6, cabH = 1.75, tR = 0.34, rimR = 0.22;
        box(l, ch, w, 0, ch/2 + 0.22, 0, bm);
        box(l * 0.7, cabH, w * 0.68, 0.15, ch + cabH/2 + 0.22, 0, bm);
        for (const s of [-1, 1]) box(l * 0.4, 0.025, 0.025, 0.15, ch + cabH + 0.25, s * w * 0.3, dm);
        // Llanta de repuesto exterior (cilindro negro en puerta trasera)
        cyl(0.2, 0.2, 0.15, -1.45, ch + cabH * 0.35 + 0.22, 0, dm, Math.PI / 2);
        // Cristales
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, cabH * 0.45), gm);
        fw.position.set(1.25, ch + cabH * 0.42 + 0.22, 0); fw.rotation.y = -0.25; group.add(fw);
        // Ruedas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.95, tR * 0.38, s * w * 0.4, tR, rimR);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.38 - 0.1;
        break;
      }
      // ── 5. HONDA CIVIC / MAZDA3 (sedán deportivo 'rodado') ──
      case 'civic': {
        const l = 3.4, w = 2.0, ch = 0.42, cabH = 1.3, tR = 0.3, rimR = 0.2;
        // Perfil extra bajo, pegado al asfalto
        box(l, ch, w, 0, ch/2 + 0.12, 0, bm);
        // Cabina con techo corto
        box(l * 0.45, cabH, w * 0.65, 0.15, ch + cabH/2 + 0.12, 0, bm2);
        // Parabrisas delantero extremadamente inclinado (60°)
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.58, cabH * 0.7), gm);
        fw.position.set(0.85, ch + cabH * 0.5 + 0.12, 0); fw.rotation.y = -0.55; group.add(fw);
        // Maletero plano y definido
        box(0.55, 0.3, w * 0.55, -1.35, ch + 0.25 + 0.12, 0, bm);
        // Spoiler / alerón trasero sutil
        box(0.01, 0.06, w * 0.45, -1.58, ch + 0.5 + 0.12, 0, bm2);
        // Rines cromo brillante
        for (const s of [-1, 1]) for (const f of [-1, 1]) {
          const wg = new THREE.Group();
          wg.position.set(f * 0.85, tR * 0.3, s * w * 0.42);
          wg.add(new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.85, 0.18, 16), rm));
          wg.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.2, 16), cm));
          group.add(wg);
        }
        // Faros afilados
        for (const s of [-0.18, 0.18]) box(0.02, 0.08, 0.3, 1.72, ch + 0.4 + 0.12, s * w * 0.22, lm);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.3 - 0.09;
        break;
      }
      // ── 6. MAZDA3 (variante deportiva) ──
      case 'mazda3': {
        // Misma base que civic pero con silueta más curvilínea
        const l = 3.3, w = 2.0, ch = 0.4, cabH = 1.35, tR = 0.3, rimR = 0.2;
        box(l, ch, w, 0, ch/2 + 0.12, 0, bm);
        box(l * 0.48, cabH, w * 0.65, 0.1, ch + cabH/2 + 0.12, 0, bm);
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.58, cabH * 0.65), gm);
        fw.position.set(0.8, ch + cabH * 0.48 + 0.12, 0); fw.rotation.y = -0.5; group.add(fw);
        box(0.5, 0.28, w * 0.55, -1.3, ch + 0.24 + 0.12, 0, bm);
        for (const s of [-1, 1]) for (const f of [-1, 1]) {
          const wg = new THREE.Group();
          wg.position.set(f * 0.85, tR * 0.3, s * w * 0.42);
          wg.add(new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.85, 0.18, 16), rm));
          wg.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.2, 16), cm));
          group.add(wg);
        }
        for (const s of [-0.18, 0.18]) box(0.02, 0.08, 0.3, 1.68, ch + 0.38 + 0.12, s * w * 0.22, lm);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.3 - 0.09;
        break;
      }
      // ── 7. TOYOTA YARIS (sedán subcompacto) ──
      case 'yaris': {
        const l = 2.7, w = 1.85, ch = 0.5, cabH = 1.45, tR = 0.28, rimR = 0.18;
        // Silueta subcompacta, cuerpo más corto y redondeado
        box(l, ch, w, 0, ch/2 + 0.15, 0, bm);
        // Cabina proporcionalmente más alta que el capó
        box(l * 0.5, cabH, w * 0.65, 0, ch + cabH/2 + 0.15, 0, bm);
        // Capó delantero corto
        box(0.5, 0.08, w * 0.5, 0.9, ch + 0.2 + 0.15, 0, bm);
        // Parabrisas
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.45), gm);
        fw.position.set(0.65, ch + cabH * 0.42 + 0.15, 0); fw.rotation.y = -0.25; group.add(fw);
        const bw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.4), gm);
        bw.position.set(-0.65, ch + cabH * 0.38 + 0.15, 0); bw.rotation.y = 0.25; group.add(bw);
        // Ruedas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.7, tR * 0.3, s * w * 0.4, tR, rimR);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.3 - 0.1;
        break;
      }
      // ── 8. HYUNDAI ACCENT (sedán económico) ──
      case 'accent': {
        const l = 2.8, w = 1.85, ch = 0.5, cabH = 1.45, tR = 0.28, rimR = 0.18;
        box(l, ch, w, 0, ch/2 + 0.15, 0, bm);
        box(l * 0.5, cabH, w * 0.65, 0.05, ch + cabH/2 + 0.15, 0, bm);
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.45), gm);
        fw.position.set(0.7, ch + cabH * 0.42 + 0.15, 0); fw.rotation.y = -0.25; group.add(fw);
        const bw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.4), gm);
        bw.position.set(-0.68, ch + cabH * 0.38 + 0.15, 0); bw.rotation.y = 0.25; group.add(bw);
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.72, tR * 0.3, s * w * 0.4, tR, rimR);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.3 - 0.1;
        break;
      }
      // ── 9. KIA FURGÓN / CAMIÓN DE VOLTEO (comercial ligero) ──
      case 'kia_furgon': {
        const l = 3.8, w = 1.9, ch = 0.45, cabH = 1.4, tR = 0.3, rimR = 0.2;
        // Cabina chata cúbica sin capó
        box(l, ch, w, 0, ch/2 + 0.12, 0, bm);
        box(0.6, cabH, w * 0.6, 1.65, ch + cabH/2 + 0.12, 0, bm);
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, cabH * 0.45), gm);
        fw.position.set(1.95, ch + cabH * 0.42 + 0.12, 0); fw.rotation.y = -0.05; group.add(fw);
        // Furgón cerrado trasero
        box(2.4, cabH * 0.8, w * 0.58, -0.35, ch + cabH * 0.4 + 0.12, 0, bm2);
        // Ruedas delanteras simples
        for (const s of [-1, 1]) wheel(1.4, tR * 0.35, s * w * 0.42, tR, rimR);
        // Ruedas traseras dobles (2 ejes)
        for (const axle of [-0.5, 0.5]) {
          for (const s of [-1, 1]) {
            const wg = new THREE.Group();
            wg.position.set(-0.45 + axle, tR * 0.35, s * w * 0.45);
            wg.add(new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.85, 0.18, 16), rm));
            wg.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.2, 16), rmGray));
            const t2 = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.85, 0.18, 16), rm);
            t2.position.x = 0.16; wg.add(t2);
            const r2 = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.2, 16), rmGray);
            r2.position.x = 0.16; wg.add(r2);
            group.add(wg);
          }
        }
        group.userData.bbox = { l, w, h: ch + cabH };
        break;
      }
    }

    // Las ruedas se crearon con el eje vertical (como discos acostados):
    // se giran para que el eje quede lateral y se apoyan en el suelo.
    group.children.forEach(c => {
      if (!c.isGroup || !c.children[0] || !c.children[0].geometry) return;
      c.rotation.x = Math.PI / 2;
      c.position.y = c.children[0].geometry.parameters.radiusTop;
    });
    group.userData.wheelBottomY = 0;

    return group;
  }

  _makeByType(type, colorHex, emissiveHex) {
    if (type === 'motocicleta') return this._makeMotorcycle(colorHex, emissiveHex);
    if (type === 'camion') return this._makeTruck(colorHex);
    return this._makeVehicle(colorHex, emissiveHex, type);
  }

  buildVehicles(v1Opts, v2Opts) {
    if (this.v1Mesh) this.scene.remove(this.v1Mesh);
    if (this.v2Mesh) this.scene.remove(this.v2Mesh);
    this.fillerVehicles.forEach(g => this.scene.remove(g));
    this.fillerVehicles = [];
    if (this.skidMarks) { this.skidMarks.forEach(m => this.scene.remove(m)); this.skidMarks = null; }
    if (this.shockwave) { this.scene.remove(this.shockwave); this.shockwave = null; }
    this.particles.forEach(p => this.scene.remove(p)); this.particles = [];
    this._collided = false;
    this._lastSimT = null;

    v1Opts = v1Opts || {}; v2Opts = v2Opts || {};
    // Luz inferior: roja para V1 y azul para V2 (igual que las trayectorias y el panel de datos).
    this.v1Mesh = this._makeByType(v1Opts.type || 'sedan', v1Opts.color || 0xcc1111, 0xff2222);
    this.v2Mesh = this._makeByType(v2Opts.type || 'sedan', v2Opts.color || 0x1144aa, 0x2266ff);
    this.scene.add(this.v1Mesh);
    this.scene.add(this.v2Mesh);
  }

  // Carga completa de una simulación preparada con prepareSimulation().
  loadSimulation(sim) {
    const d = sim._d;
    this.buildRoad(sim.infraestructura, { axis: d.roadAxis, lanes: d.lanes });
    this.buildVehicles(
      { type: d.types.v1, color: parseColor(sim.v1_color, 0xcc1111) },
      { type: d.types.v2, color: parseColor(sim.v2_color, 0x1144aa) }
    );
    this.impact = { t: d.tImpact, point: new THREE.Vector3(d.point.x, 0.6, -d.point.y) };
    const pts = {
      v1: sampleTrackPoints(sim, 'v1', d.t0, d.tN, 0.05),
      v2: sampleTrackPoints(sim, 'v2', d.t0, d.tN, 0.05),
    };
    this.buildFillerTraffic(sim.infraestructura, [...pts.v1, ...pts.v2]);
    this.buildImpactMarker();
    this.buildSkidMarks(sim, pts);
    this.buildTrajectories(pts);
    this.frameScene(sim, pts);
  }

  // Encuadre inicial: mirando al punto de impacto desde atrás y arriba del
  // recorrido de V1, con distancia suficiente para ver la aproximación.
  frameScene(sim, pts) {
    const p = this.impact.point;
    // Centro: entre el punto de impacto y el tramo de aproximación (incluye los
    // primeros metros después del choque).
    const used = [];
    for (const k of ACTORS) for (const q of pts[k]) if (q.t <= sim._d.tImpact + 1) used.push([q.x, -q.y]);
    const xs = used.map(u => u[0]), zs = used.map(u => u[1]);
    const cx = (Math.min(...xs) + Math.max(...xs) + 2 * p.x) / 4;
    const cz = (Math.min(...zs) + Math.max(...zs) + 2 * p.z) / 4;
    let ext = 10;
    for (const [x, z] of used) ext = Math.max(ext, Math.hypot(x - cx, z - cz));
    // Cámara detrás del punto de partida de V1, casi alineada con su recorrido
    // (así la vista corre a lo largo de la vía y no queda detrás de edificios).
    const start = pts.v1[0];
    const dx = start.x - cx, dz = -start.y - cz;
    const theta = Math.hypot(dx, dz) > 2 ? Math.atan2(dx, dz) + 0.22 : Math.PI / 4;
    const view = { target: new THREE.Vector3(cx, 0, cz), theta, phi: 0.9, radius: clamp(ext * 1.05, 18, 150) };
    this.controls.follow = null;
    this.controls.saveHome(view);
    this.controls.setView(view, true);
  }

  buildImpactMarker() {
    if (this.impactMarker) this.scene.remove(this.impactMarker);
    const geo = new THREE.RingGeometry(0.8, 1.5, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff1111, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false });
    this.impactMarker = new THREE.Mesh(geo, mat);
    this.impactMarker.rotation.x = -Math.PI / 2;
    this.impactMarker.position.set(this.impact ? this.impact.point.x : 0, 0.14, this.impact ? this.impact.point.z : 0);
    this.scene.add(this.impactMarker);
  }

  // Huellas: arrastre de la moto caída, derrape de autos después del impacto
  // (deslizamiento lateral o frenada fuerte) y, si la IA lo indica, frenada
  // en el último segundo y medio antes del choque.
  buildSkidMarks(sim, pts) {
    if (this.skidMarks) this.skidMarks.forEach(m => this.scene.remove(m));
    this.skidMarks = [];
    const d = sim._d;
    const tireMat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, depthWrite: false });
    const scrapeMat = new THREE.MeshBasicMaterial({ color: 0x8a8f99, transparent: true, opacity: 0.45, depthWrite: false });
    const strip = (a, b, off, width, mat) => {
      const ax = a.x + off.x, az = -a.y + off.z, bx = b.x + off.x, bz = -b.y + off.z;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.02) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mat);
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(bx - ax, bz - az));
      m.position.set((ax + bx) / 2, 0.13, (az + bz) / 2);
      this.scene.add(m); this.skidMarks.push(m);
    };
    for (const k of ACTORS) {
      const isMoto = d.types[k] === 'motocicleta';
      const halfW = d.dims[k].W / 2 * 0.8;
      const braking = sim[k + '_frenada_previa'] === true;
      const list = pts[k];
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], b = list[i + 1];
        const post = a.t >= d.tImpact;
        const preBrake = braking && a.t >= d.tImpact - 1.5 && a.t < d.tImpact;
        const slip = Math.abs(angDiff(a.a, bearingOf(b.x - a.x, b.y - a.y)));
        const c = list[Math.min(list.length - 1, i + 10)];   // ventana de 0.5 s
        const decel = (a.speed - c.speed) / Math.max(1e-3, c.t - a.t);
        const skidding = isMoto || slip > 8 || decel > 7;
        if ((!(post && skidding) && !preBrake) || a.speed < 0.3) continue;
        if (isMoto && post) { strip(a, b, { x: 0, z: 0 }, 0.35, scrapeMat); continue; }
        const r = deg2rad(a.a);
        for (const s of (isMoto ? [0] : [-1, 1])) {
          strip(a, b, { x: Math.cos(r) * s * halfW, z: Math.sin(r) * s * halfW }, 0.22, tireMat);
        }
      }
    }
  }

  buildTrajectories(pts) {
    if (this.trajLine1) this.scene.remove(this.trajLine1);
    if (this.trajLine2) this.scene.remove(this.trajLine2);
    const makeLineMesh = (points, color) => {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
      return new THREE.Line(geo, mat);
    };
    this.trajLine1 = makeLineMesh(pts.v1.map(q => new THREE.Vector3(q.x, 0.2, -q.y)), 0xff3333);
    this.trajLine2 = makeLineMesh(pts.v2.map(q => new THREE.Vector3(q.x, 0.2, -q.y)), 0x3366ff);
    this.scene.add(this.trajLine1); this.scene.add(this.trajLine2);
  }

  // ─────── FILLER TRAFFIC PLACEMENT (Guatemala street scene) ───────
  // avoid: puntos de las trayectorias de V1/V2 (no se estaciona tráfico encima).
  buildFillerTraffic(infraestructura, avoid = []) {
    this.fillerVehicles.forEach(g => this.scene.remove(g));
    this.fillerVehicles = [];
    if (infraestructura !== 'interseccion_cruciforme' && infraestructura !== 'interseccion') return;

    // Per-model color arrays (colores permitidos por modelo)
    const COLOR_SETS = {
      hilux: [0xFFFFFF, 0x808080, 0x4F4F4F],
      l200: [0xFFFFFF, 0x808080, 0x4F4F4F],
      crv: [0x003366, 0x1C3B2B, 0x6F4E37],
      rav4: [0x003366, 0x1C3B2B, 0x6F4E37],
      civic: [0xCC0000, 0x001F3F, 0x0A0A0A],
      mazda3: [0xCC0000, 0x001F3F, 0x0A0A0A],
      yaris: [0xD3D3D3, 0xFFFFFF, 0x005A9C],
      accent: [0xD3D3D3, 0xFFFFFF, 0x005A9C],
      kia_furgon: [0xFFFFFF, 0x005A9C, 0xCC0000],
    };
    // Model distribution: 35% pickup, 25% sedan deportivo, 15% SUV, 15% sedán económico, 10% comercial
    const MODEL_DIST = [
      'hilux', 'hilux', 'hilux', 'l200', 'l200', 'l200', 'l200',
      'civic', 'civic', 'civic', 'mazda3', 'mazda3',
      'crv', 'crv', 'rav4',
      'yaris', 'yaris', 'accent',
      'kia_furgon', 'kia_furgon',
    ];

    // Centros de carril (3.5 m): ±1.75 y ±5.25
    const laneZ = [-5.25, -1.75, 1.75, 5.25];
    const laneX = [-5.25, -1.75, 1.75, 5.25];
    const posX = [], posZ = [];
    for (let x = -62; x <= 62; x += 7) { if (Math.abs(x) < 14) continue; posX.push(x); }
    for (let z = -62; z <= 62; z += 7) { if (Math.abs(z) < 14) continue; posZ.push(z); }
    const blocked = (wx, wz) => avoid.some(q => Math.hypot(q.x - wx, -q.y - wz) < 7);

    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const place = (pos, lanes, angleFn, horizontal) => {
      const picks = shuffle(pos).slice(0, 5 + Math.floor(Math.random() * 3));
      picks.forEach(p => {
        const lane = lanes[Math.floor(Math.random() * lanes.length)];
        const wx = horizontal ? p : lane, wz = horizontal ? lane : p;
        if (blocked(wx, wz)) return;
        const mk = MODEL_DIST[Math.floor(Math.random() * MODEL_DIST.length)];
        const cols = COLOR_SETS[mk];
        const vehicle = this._makeFillerVehicle(mk, cols[Math.floor(Math.random() * cols.length)]);
        vehicle.position.set(wx, 0, wz);
        vehicle.rotation.y = angleFn(lane);
        this.scene.add(vehicle);
        this.fillerVehicles.push(vehicle);
      });
    };

    // Los modelos de relleno tienen el frente hacia +X. Se circula por la derecha:
    // vía este-oeste: z < 0 (lado norte) va al oeste, z > 0 va al este.
    place(posX, laneZ, l => (l < 0 ? Math.PI : 0), true);
    // vía norte-sur: x < 0 va al sur (+Z), x > 0 va al norte (−Z).
    place(posZ, laneX, l => (l < 0 ? -Math.PI / 2 : Math.PI / 2), false);
  }

  spawnImpactParticles(point) {
    const o = point || new THREE.Vector3(0, 0.6, 0);
    for (let i = 0; i < 80; i++) {
      const size = Math.random() * 0.2 + 0.03;
      const geo = new THREE.SphereGeometry(size, 4, 4);
      const colors = [0xff8800, 0xff4400, 0xffff00, 0xffcc00, 0xff2200];
      const mat = new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)] });
      const p = new THREE.Mesh(geo, mat);
      p.position.set(o.x + (Math.random() - 0.5) * 1.2, o.y + Math.random() * 0.8, o.z + (Math.random() - 0.5) * 1.2);
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.35, Math.random() * 0.25 + 0.08, (Math.random() - 0.5) * 0.35);
      p.userData.life = 1.0;
      this.scene.add(p); this.particles.push(p);
    }
    for (let i = 0; i < 30; i++) {
      const geo = new THREE.BoxGeometry(Math.random() * 0.2 + 0.05, Math.random() * 0.02 + 0.01, Math.random() * 0.2 + 0.05);
      const mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.3 ? 0xbbddff : 0xff4444, transparent: true, opacity: 0.8 });
      const p = new THREE.Mesh(geo, mat);
      p.position.set(o.x + (Math.random() - 0.5) * 1.2, o.y + Math.random() * 0.8, o.z + (Math.random() - 0.5) * 1.2);
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2 + 0.05, (Math.random() - 0.5) * 0.3);
      p.userData.rotVel = new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2);
      p.userData.life = 1.0;
      this.scene.add(p); this.particles.push(p);
    }
    const ringGeo = new THREE.RingGeometry(0.1, 1.5, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8844, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.shockwave = new THREE.Mesh(ringGeo, ringMat);
    this.shockwave.rotation.x = -Math.PI / 2; this.shockwave.position.set(o.x, 0.15, o.z);
    this.shockwave.userData.life = 1.0; this.scene.add(this.shockwave);
    this.shakeIntensity = 1.0;
    this.impactLight.position.set(o.x, 3, o.z);
    this.impactLight.intensity = 15; this.impactLight.color.set(0xff6622);
    this.particleTime = 100;
  }

  updateParticles() {
    if (this.particles.length === 0 && !this.shockwave) return;
    this.particles.forEach(p => {
      const decay = p.userData.life > 1.0 ? 0.012 : 0.025;
      p.userData.life -= decay;
      p.position.addScaledVector(p.userData.vel, 1);
      p.userData.vel.y -= 0.012;
      if (p.position.y < 0.05) { p.position.y = 0.05; p.userData.vel.set(p.userData.vel.x * 0.5, 0, p.userData.vel.z * 0.5); }
      p.material.opacity = Math.min(p.userData.life, 1);
      p.material.transparent = true;
      p.scale.setScalar(Math.min(p.userData.life, 1));
      if (p.userData.rotVel) { p.rotation.x += p.userData.rotVel.x; p.rotation.y += p.userData.rotVel.y; }
    });
    this.particles = this.particles.filter(p => {
      if (p.userData.life > 0.01) return true;
      this.scene.remove(p); return false;
    });
    if (this.shockwave) {
      this.shockwave.userData.life -= 0.015;
      if (this.shockwave.userData.life <= 0) { this.scene.remove(this.shockwave); this.shockwave = null; }
      else {
        const s = 1 + (1 - this.shockwave.userData.life) * 12;
        this.shockwave.scale.set(s, s, s);
        this.shockwave.material.opacity = this.shockwave.userData.life * 0.6;
      }
    }
    this.shakeIntensity *= this.shakeDecay;
    if (this.shakeIntensity < 0.001) this.shakeIntensity = 0;
    this.impactLight.intensity *= 0.92;
    this.impactLight.color.multiplyScalar(0.97);
  }

  // Abolla la carrocería alrededor del punto de contacto. Se guarda la
  // geometría original para poder deshacerlo al rebobinar antes del choque.
  deformVehicleAtImpact(vehicle, worldPoint, radius, strength) {
    vehicle.updateMatrixWorld(true);
    vehicle.traverse(child => {
      if (!child.isMesh || !child.geometry || !child.geometry.attributes.position) return;
      const geo = child.geometry;
      const pos = geo.attributes.position;
      const localPoint = child.worldToLocal(worldPoint.clone());
      if (!geo.userData.orig) geo.userData.orig = pos.array.slice();
      const v = new THREE.Vector3();
      let touched = false;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const dist = v.distanceTo(localPoint);
        if (dist < radius) {
          const factor = 1 - dist / radius;
          const deform = strength * factor * factor;
          const dir = new THREE.Vector3().subVectors(v, localPoint).normalize();
          v.addScaledVector(dir, -deform);
          pos.setXYZ(i, v.x, v.y, v.z);
          touched = true;
        }
      }
      if (!touched) return;
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    });
  }

  restoreDeformation(vehicle) {
    vehicle.traverse(child => {
      const geo = child.isMesh && child.geometry;
      if (!geo || !geo.userData.orig) return;
      geo.attributes.position.array.set(geo.userData.orig);
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    });
  }

  // s: resultado de sampleSim() para el instante actual.
  updateVehicles(s, phase) {
    if (!this.v1Mesh || !this.v2Mesh || !s) return;
    const dtSim = this._lastSimT === null ? 0 : s.segundo - this._lastSimT;
    this._lastSimT = s.segundo;
    for (const [k, mesh] of [['v1', this.v1Mesh], ['v2', this.v2Mesh]]) {
      const incl = s[k + '_inclinacion'] || 0;
      const lift = mesh.userData.isMoto ? Math.abs(Math.sin(deg2rad(incl))) * 0.3 : 0;
      mesh.position.set(s[k + '_x'], lift, -s[k + '_y']);
      // Euler XYZ: primero el alabeo (inclinación) sobre el eje longitudinal, luego el rumbo.
      mesh.rotation.set(0, -deg2rad(s[k + '_angulo']), -deg2rad(incl));
      // Giro de ruedas según la distancia recorrida
      const ds = (s[k + '_vel'] / 3.6) * dtSim;
      const r = mesh.userData.wheelR || 0.3;
      const axis = mesh.userData.spinAxis || 'x';
      if (mesh.userData.wheels && Math.abs(ds) > 0) mesh.userData.wheels.forEach(w => { w.rotation[axis] -= ds / r; });
    }

    if (this.impact) {
      if (s.segundo >= this.impact.t && !this._collided) {
        this._collided = true;
        this.spawnImpactParticles(this.impact.point);
        for (const mesh of [this.v1Mesh, this.v2Mesh]) {
          const moto = mesh.userData.isMoto;
          this.deformVehicleAtImpact(mesh, this.impact.point, moto ? 0.45 : 1.2, moto ? 0.06 : 0.12);
        }
      } else if (s.segundo < this.impact.t - 1e-3 && this._collided) {
        this._collided = false;
        this.restoreDeformation(this.v1Mesh);
        this.restoreDeformation(this.v2Mesh);
      }
    }

    if (this.impactMarker) {
      const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.005);
      this.impactMarker.scale.setScalar(pulse);
      this.impactMarker.material.opacity = (phase === 'impact') ? 0.9 : 0.4;
    }
  }

  // Todos los modos dejan la cámara manipulable: "top" solo cambia el
  // ángulo de partida y "v1"/"v2" mantienen el objetivo sobre el vehículo.
  setCameraMode(mode) {
    this.cameraMode = mode;
    const c = this.controls;
    if (mode === 'free') {
      c.follow = null;
    } else if (mode === 'top') {
      c.follow = null;
      c.setView({ theta: 0, phi: c.minPhi, radius: Math.max(c.goal.radius, 45) });
    } else if (mode === 'v1' || mode === 'v2') {
      const mesh = mode === 'v1' ? this.v1Mesh : this.v2Mesh;
      if (!mesh) return;
      c.follow = () => this._followPoint.set(mesh.position.x, 0.8, mesh.position.z);
      c.setView({ theta: mesh.rotation.y + 0.5, phi: 1.05, radius: mesh.userData.isMoto ? 9 : 14 });
    }
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _render() {
    this.animFrameId = requestAnimationFrame(() => this._render());
    try {
      const now = performance.now();
      const dt = this._lastFrameTs === null ? 0.016 : Math.min(0.1, (now - this._lastFrameTs) / 1000);
      this._lastFrameTs = now;
      this.controls.update(dt);
      this.updateParticles();
      this._updateOcclusion();
      if (this.dustSystem) {
        const pos = this.dustSystem.geometry.attributes.position.array;
        const t = Date.now();
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += Math.sin(t * 0.0003 + i) * 0.002;
          pos[i+1] += Math.cos(t * 0.0002 + i * 1.3) * 0.001;
          pos[i+2] += Math.sin(t * 0.00025 + i * 0.7) * 0.002;
          if (pos[i] > 80) pos[i] = -80;
          if (pos[i] < -80) pos[i] = 80;
          if (pos[i+1] > 22) pos[i+1] = 2;
          if (pos[i+1] < 2) pos[i+1] = 22;
          if (pos[i+2] > 80) pos[i+2] = -80;
          if (pos[i+2] < -80) pos[i+2] = 80;
        }
        this.dustSystem.geometry.attributes.position.needsUpdate = true;
      }
      if (this.shakeIntensity > 0.001) {
        this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 0.3;
        this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.3;
      }

      // Animate clouds drifting
      if (this.clouds) {
        this.cloudTime += 0.005;
        this.clouds.forEach((c, i) => {
          c.position.x = c.userData.startX + Math.sin(this.cloudTime * c.userData.speed + i * 2) * 30;
          c.position.z += Math.sin(this.cloudTime * 0.1 + i) * 0.008;
        });
      }

      // Tree canopy sway
      if (this.treeCanopies) {
        const sway = Date.now() * 0.0008;
        this.treeCanopies.forEach((canopy, i) => {
          if (canopy) {
            const s = 1 + Math.sin(sway + i * 1.7) * 0.015;
            canopy.scale.x = s;
            canopy.scale.z = s;
          }
        });
      }

      this.renderer.render(this.scene, this.camera);
    } catch (e) { console.error('Render error:', e); }
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.controls.dispose();
    this.renderer.dispose();
  }
}

// ──────────────────────────────────────────────────────────────
//  3D Viewer Component
// ──────────────────────────────────────────────────────────────
const Viewer3D = ({ simulationData, tCurrent, phase, cameraMode, onCameraModeChange }) => {
  const canvasRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const wrapperRef = React.useRef(null);
  const modeChangeRef = React.useRef(onCameraModeChange);
  modeChangeRef.current = onCameraModeChange;

  React.useEffect(() => {
    if (!canvasRef.current) return;
    const sm = new SceneManager(canvasRef.current);
    // Desplazar la vista mientras se sigue a un vehículo vuelve a cámara libre.
    sm.controls.onUserPan = () => modeChangeRef.current && modeChangeRef.current('free');
    sceneRef.current = sm;
    const resizeObs = new ResizeObserver(entries => {
      for (const entry of entries) { const { width, height } = entry.contentRect; sm.resize(width, height); }
    });
    if (wrapperRef.current) resizeObs.observe(wrapperRef.current);
    return () => { resizeObs.disconnect(); sm.destroy(); sceneRef.current = null; };
  }, []);

  React.useEffect(() => {
    if (!sceneRef.current || !simulationData) return;
    sceneRef.current.loadSimulation(simulationData);
  }, [simulationData]);

  React.useEffect(() => {
    if (!sceneRef.current || !simulationData) return;
    sceneRef.current.updateVehicles(sampleSim(simulationData, tCurrent), phase);
  }, [tCurrent, simulationData, phase]);

  React.useEffect(() => {
    if (!sceneRef.current || !simulationData) return;
    sceneRef.current.setCameraMode(cameraMode);
  }, [cameraMode, simulationData]);

  const hasData = !!simulationData;
  const types = hasData ? simulationData._d.types : null;
  const modes = hasData ? [
    ['free', '🎥 Libre'], ['top', '🛸 Cenital'],
    ['v1', `${vehicleIcon(types.v1)} V1`], ['v2', `${vehicleIcon(types.v2)} V2`],
  ] : [];

  return (
    <div className="viewer-wrapper" ref={wrapperRef}>
      <canvas ref={canvasRef} className="viewer-canvas" />
      {!hasData && (
        <div className="viewer-overlay">
          <div className="viewer-placeholder-icon">🚗</div>
          <p className="viewer-placeholder-text">Describe el siniestro y genera la simulación para ver la reconstrucción 3D aquí.</p>
        </div>
      )}
      {hasData && (
        <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {modes.map(([m, label]) => (
            <button key={m} className={`cam-btn${cameraMode === m ? ' active' : ''}`} onClick={() => onCameraModeChange(m)}>{label}</button>
          ))}
          <button className="cam-btn" title="Volver al encuadre inicial" onClick={() => {
            if (sceneRef.current) sceneRef.current.controls.reset();
            onCameraModeChange('free');
          }}>🎯 Encuadrar</button>
        </div>
      )}
      {hasData && (
        <div className="viewer-hint">
          Arrastrar: girar · Clic der. o Shift + arrastrar: mover · Rueda / pellizco: zoom · Doble clic: centrar
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Playback Controls Component
// ──────────────────────────────────────────────────────────────
const PlaybackControls = ({ sim, tCurrent, setTCurrent, isPlaying, setIsPlaying, speed, setSpeed }) => {
  const frames = sim.animacion_actores;
  const tMin = frames[0].segundo;
  const tMax = frames[frames.length - 1].segundo;
  const phase = getPhase(sim, tCurrent);
  const phaseLabel = { pre: '🔵 PRE-IMPACTO', impact: '💥 IMPACTO', post: '🟠 POST-IMPACTO' }[phase];
  const phaseClass = { pre: 'pre', impact: 'impact', post: 'post' }[phase];

  return (
    <div className="playback-controls">
      <button className={`btn btn-sm ${isPlaying ? 'btn-secondary' : 'btn-neon'}`} onClick={() => {
        if (!isPlaying && tCurrent >= tMax - 1e-3) setTCurrent(tMin);
        setIsPlaying(p => !p);
      }} id="btn-playpause">
        {isPlaying ? '⏸ Pausar' : '▶ Reproducir'}
      </button>
      <button className="btn btn-sm btn-secondary" onClick={() => { setTCurrent(tMin); setIsPlaying(false); }} id="btn-rewind">⏮ Reiniciar</button>
      <button className="btn btn-sm btn-secondary" title="Ir al instante del impacto" onClick={() => { setIsPlaying(false); setTCurrent(sim._d.tImpact); }}>💥 t = {sim._d.tImpact.toFixed(2)}s</button>
      <span className="time-display">t = {tCurrent.toFixed(2)}s</span>
      <input className="time-slider" type="range" min={tMin} max={tMax} step="0.01" value={tCurrent}
        onChange={e => { setIsPlaying(false); setTCurrent(parseFloat(e.target.value)); }} />
      <span className="time-display" style={{ textAlign: 'right' }}>{tMax.toFixed(2)}s</span>
      <select className="speed-select" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))}>
        <option value={0.1}>0.1×</option>
        <option value={0.25}>0.25×</option>
        <option value={0.5}>0.5×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
      </select>
      <span className={`phase-badge ${phaseClass}`}>{phaseLabel}</span>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Data Panel Component
// ──────────────────────────────────────────────────────────────
const DataPanel = ({ frame }) => {
  if (!frame) return null;
  const cells = [];
  for (const k of ACTORS) {
    const V = k.toUpperCase();
    cells.push(
      { label: `${V} — X`, value: `${frame[k + '_x'].toFixed(1)} m`, cls: k },
      { label: `${V} — Y`, value: `${frame[k + '_y'].toFixed(1)} m`, cls: k },
      { label: `${V} — Rumbo`, value: `${frame[k + '_angulo'].toFixed(0)}°`, cls: k },
      { label: `${V} — Velocidad`, value: `${frame[k + '_vel'].toFixed(0)} km/h`, cls: k },
    );
  }
  return (
    <div className="data-grid">
      {cells.map(c => (
        <div key={c.label} className="data-cell">
          <div className="data-cell-label">{c.label}</div>
          <div className={`data-cell-value ${c.cls}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
};

// Leyenda: qué es V1 y qué es V2 según el JSON de la IA.
const VehicleLegend = ({ sim }) => {
  const items = ACTORS.map(k => {
    const type = sim._d.types[k];
    const color = sim[k + '_color'] ? ` ${sim[k + '_color']}` : '';
    const desc = sim[k + '_descripcion'] ? ` — ${sim[k + '_descripcion']}` : '';
    return { k, text: `${k.toUpperCase()} · ${vehicleIcon(type)} ${type}${color}${desc}` };
  });
  return (
    <div className="vehicle-legend">
      {items.map(it => <span key={it.k} className={`veh-chip ${it.k}`}>{it.text}</span>)}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Raw Data Expander
// ──────────────────────────────────────────────────────────────
const RawDataExpander = ({ data }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <div className="expander-header" onClick={() => setOpen(o => !o)}>
        <span>🔍 Ver datos crudos (JSON de la IA)</span>
        <i className={`expander-icon${open ? ' open' : ''}`}>▼</i>
      </div>
      {open && <div className="expander-body">{JSON.stringify(data, null, 2)}</div>}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Turtle Script Generator (pure JS)
// ──────────────────────────────────────────────────────────────
function buildTurtleScript(simulationData) {
  const { animacion_actores: frames, infraestructura, dictamen_tecnico } = simulationData;
  const framesCode = frames.map(f =>
    `    {'t': ${f.segundo}, 'v1_x': ${f.v1_x}, 'v1_y': ${f.v1_y}, 'v1_a': ${f.v1_angulo}, 'v2_x': ${f.v2_x}, 'v2_y': ${f.v2_y}, 'v2_a': ${f.v2_angulo}},`
  ).join('\n');
  return `#!/usr/bin/env python3
""" ForensIA - Simulacion Forense 2D con Turtle
Infraestructura: ${infraestructura}
Dictamen:
${dictamen_tecnico}
"""
import turtle, time, math
FRAMES = [${framesCode}]
SCALE = 8; ANIM_DELAY = 0.04; INTERP_STEPS = 25; VEH_W, VEH_L = 10, 20
screen = turtle.Screen(); screen.title("FORENSIA - Simulacion 2D")
screen.bgcolor("#0a0e1a"); screen.setup(900, 700); screen.tracer(0)
def lerp(a,b,t): return a+(b-a)*t
def lerp_ang(a,b,t):
    d=((b-a)%360+360)%360
    if d>180: d-=360
    return a+d*t
def draw_road(t):
    t.speed(0); t.hideturtle()
    for bx,by,bw,bh in [(-300,-40,600,80),(-40,-300,80,600)]:
        t.penup(); t.goto(bx,by); t.fillcolor("#1c1c1c"); t.begin_fill()
        for dx,dy in [(bw,0),(0,bh),(-bw,0),(0,-bh)]: t.goto(t.xcor()+dx,t.ycor()+dy)
        t.end_fill()
def draw_vehicle(t,x,y,angle,color,label):
    t.clear(); px,py=x*SCALE,-y*SCALE; heading=90-angle
    rad=math.radians(heading); ca,sa=math.cos(rad),math.sin(rad)
    corners=[(-VEH_W/2,-VEH_L/2),(VEH_W/2,-VEH_L/2),(VEH_W/2,VEH_L/2),(-VEH_W/2,VEH_L/2)]
    wc=[(px+cx*ca-cy*sa,py+cx*sa+cy*ca) for cx,cy in corners]
    t.penup(); t.goto(wc[0]); t.fillcolor(color); t.color(color)
    t.begin_fill(); t.pendown()
    for c in wc[1:]: t.goto(c)
    t.goto(wc[0]); t.end_fill(); t.penup()
    t.goto(px,py+VEH_L/2+8); t.color("#ffffff")
    t.write(label,align="center",font=("Arial",10,"bold")); t.penup()
road_t=turtle.Turtle(); v1_t=turtle.Turtle(); v2_t=turtle.Turtle()
for t in[road_t,v1_t,v2_t]: t.speed(0); t.hideturtle(); t.penup()
draw_road(road_t); screen.update(); time.sleep(0.5)
for i in range(len(FRAMES)-1):
    f0,f1=FRAMES[i],FRAMES[i+1]
    for s in range(INTERP_STEPS+1):
        frac=s/INTERP_STEPS
        v1x=lerp(f0['v1_x'],f1['v1_x'],frac); v1y=lerp(f0['v1_y'],f1['v1_y'],frac); v1a=lerp_ang(f0['v1_a'],f1['v1_a'],frac)
        v2x=lerp(f0['v2_x'],f1['v2_x'],frac); v2y=lerp(f0['v2_y'],f1['v2_y'],frac); v2a=lerp_ang(f0['v2_a'],f1['v2_a'],frac)
        draw_vehicle(v1_t,v1x,v1y,v1a,"#e74c3c","V1")
        draw_vehicle(v2_t,v2x,v2y,v2a,"#2980b9","V2")
        screen.update(); time.sleep(ANIM_DELAY)
screen.update(); turtle.done()`;
}

// ──────────────────────────────────────────────────────────────
//  Main App Component
// ──────────────────────────────────────────────────────────────
const App = () => {
  const [pollinationsOk, setPollinationsOk] = React.useState(null);
  const [pollinationsErr, setPollinationsErr] = React.useState('');
  const [installedModels, setInstalledModels] = React.useState([]);
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_MODEL);
  const [relato, setRelato] = React.useState(DEFAULT_RELATO);
  const [loading, setLoading] = React.useState(false);
  const [loadingMsg, setLoadingMsg] = React.useState('');
  const [error, setError] = React.useState('');
  const [simulationData, setSimulationData] = React.useState(null);
  const [tCurrent, setTCurrent] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  const animRef = React.useRef(null);
  const lastTimeRef = React.useRef(null);
  const [cameraMode, setCameraMode] = React.useState('free');

  // ── Check Pollinations status ──
  const checkStatus = React.useCallback(async () => {
    try {
      const r = await fetch(API_BASE + '/api/status', { signal: AbortSignal.timeout(25000) });
      if (r.ok) {
        const data = await r.json();
        setPollinationsOk(!!data.ai_active);
        setPollinationsErr(data.error || '');
        const mr = await fetch(API_BASE + '/api/models');
        if (mr.ok) {
          const md = await mr.json();
          const models = md.installed || [];
          setInstalledModels(models);
          if (models.length > 0 && !models.includes(selectedModel)) setSelectedModel(models[0]);
        }
      } else {
        const errBody = await r.text().catch(() => '');
        setPollinationsOk(false);
        setPollinationsErr('HTTP ' + r.status + (errBody ? ': ' + errBody.slice(0,200) : ''));
      }
    } catch (e) {
      setPollinationsOk(false);
      setPollinationsErr('Error de red: ' + (e.message || e));
    }
  }, [selectedModel]);

  React.useEffect(() => { checkStatus(); const interval = setInterval(() => checkStatus(), 30000); return () => clearInterval(interval); }, []);

  // ── Animation loop ──
  React.useEffect(() => {
    if (!isPlaying || !simulationData) return;
    const tMax = simulationData._d.tN;
    lastTimeRef.current = null;
    const tick = (ts) => {
      if (lastTimeRef.current !== null) {
        const dt = (ts - lastTimeRef.current) / 1000;
        setTCurrent(prev => {
          const next = prev + dt * speed;
          if (next >= tMax) { setIsPlaying(false); return tMax; }
          return next;
        });
      }
      lastTimeRef.current = ts;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, simulationData, speed]);

  // ── Generate simulation ──
  const showSimulation = (raw) => {
    const sim = prepareSimulation(raw);
    setSimulationData(sim);
    setTCurrent(sim._d.t0);
    setCameraMode('free');
  };

  const handleGenerate = async () => {
    if (!relato.trim()) { setError('Por favor escribe un relato del siniestro.'); return; }

    setError(''); setLoading(true); setSimulationData(null);
    setTCurrent(0); setIsPlaying(false);
    setLoadingMsg('Procesando relato con ' + selectedModel + '...');

    try {
      // Si se pega directamente un JSON de simulación (con animacion_actores)
      // se reproduce tal cual, sin llamar a la IA.
      let direct = null;
      try { direct = JSON.parse(relato.trim()); } catch (_) { direct = null; }
      if (direct && Array.isArray(direct.animacion_actores)) {
        showSimulation(direct); setLoadingMsg('');
        return;
      }

      setLoadingMsg('Esperando respuesta de ' + selectedModel + ' (10-60 seg)...');
      const r = await fetch(API_BASE + '/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relato: relato.trim(), model: selectedModel, base_url: POLLINATIONS_URL })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));
        throw new Error(err.error || 'HTTP ' + r.status);
      }
      showSimulation(await r.json());
      setLoadingMsg('');
    } catch (e) { setError('Error al generar: ' + e.message); }
    finally { setLoading(false); }
  };

  // ── Download Turtle script ──
  const handleDownloadTurtle = async () => {
    if (!simulationData) return;
    try {
      const r = await fetch(API_BASE + '/api/turtle-script', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(simulationData),
      });
      if (!r.ok) throw new Error('No se pudo generar el script.');
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'forensia_simulacion.py'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      const script = buildTurtleScript(simulationData);
      const blob = new Blob([script], { type: 'text/plain' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'forensia_simulacion.py'; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const currentFrame = simulationData ? sampleSim(simulationData, tCurrent) : null;
  const phase = simulationData ? getPhase(simulationData, tCurrent) : 'pre';
  const modelOptions = installedModels.length > 0 ? installedModels : RECOMMENDED_MODELS;

  return (
    <div className="app-layout">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-icon">🚓</span>
          <div>
            <div className="topbar-title">ForensIA · Reconstrucción Forense 3D</div>
            <div className="topbar-subtitle">Motor NIC-RF · IA en la nube (Pollinations)</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn btn-sm btn-secondary" onClick={() => checkStatus()} id="btn-refresh-status">🔄 Verificar</button>
          <div className={`topbar-status ${pollinationsOk === true ? 'ok' : 'err'}`}>
            <span className={`status-dot ${pollinationsOk === true ? 'ok' : 'err'}`}></span>
            {pollinationsOk === null ? 'Verificando...' : pollinationsOk ? 'Pollinations ✓ (' + installedModels.length + ' modelo' + (installedModels.length !== 1 ? 's' : '') + ')' : 'Pollinations ✗ Inactivo' + (pollinationsErr ? ' — ' + pollinationsErr : '')}
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="sidebar">
        <details className="card" style={{ padding: '0.75rem 1rem' }}>
          <summary className="card-title" style={{ marginBottom: 0, cursor: 'pointer' }}>Configuración IA</summary>
          <div style={{ paddingTop: '1rem' }}>
            <div className="input-group">
              <label htmlFor="model-select">Modelo</label>
              <select id="model-select" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                {installedModels.length > 0 && <optgroup label="Disponibles">{installedModels.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>}
                {installedModels.length === 0 && <optgroup label="Recomendados">{RECOMMENDED_MODELS.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>}
              </select>
            </div>
            {!pollinationsOk && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>Pollinations inactivo{pollinationsErr ? ': ' + pollinationsErr : ''}</div>}
          </div>
        </details>

        {/* Relato Input */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '1rem' }}>
          <div className="card-title">Relato del siniestro</div>
          <div className="input-group" style={{ flex: 1, marginBottom: '0.75rem' }}>
            <textarea id="relato-input" value={relato} onChange={e => setRelato(e.target.value)} placeholder="Describe el accidente..." style={{ flex: 1, minHeight: '180px', resize: 'none' }} />
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

          {loading && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div className="loading-bar"><div className="loading-bar-inner" /></div>
              <div className="loading-text"><div className="spinner" />{loadingMsg}</div>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 'auto' }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '0.75rem' }} onClick={handleGenerate} disabled={loading}>
              {loading ? 'Procesando...' : 'Generar Simulación'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setSimulationData(null); setError(''); setTCurrent(0); setIsPlaying(false); }} disabled={loading}>🧹</button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title" style={{ marginBottom: '0.75rem' }}>
            Simulación Forense 3D
            {simulationData && <span className="badge badge-neon" style={{ marginLeft: '0.75rem' }}>{simulationData.infraestructura}</span>}
          </div>

          {simulationData && <VehicleLegend sim={simulationData} />}

          <Viewer3D simulationData={simulationData} tCurrent={tCurrent} phase={phase} cameraMode={cameraMode} onCameraModeChange={setCameraMode} />

          {simulationData && (
            <div style={{ marginTop: '0.75rem' }}>
              <PlaybackControls sim={simulationData} tCurrent={tCurrent} setTCurrent={setTCurrent}
                isPlaying={isPlaying} setIsPlaying={setIsPlaying} speed={speed} setSpeed={setSpeed} />
            </div>
          )}
        </div>

        {simulationData && currentFrame && (
          <div className="card fade-in-up">
            <div className="card-title" style={{ marginBottom: '0.75rem' }}>Parámetros en t = {tCurrent.toFixed(2)}s</div>
            <DataPanel frame={currentFrame} />
            <div className="btn-row" style={{ marginTop: '1rem' }}>
              <button id="btn-download-turtle" className="btn btn-green" onClick={handleDownloadTurtle}>
                🐢 Descargar Script Python (Turtle)
              </button>
            </div>
          </div>
        )}

        {simulationData && (
          <div className="card fade-in-up">
            <div className="card-title">Dictamen Técnico del Investigador IA</div>
            <div className="dictamen-box">{simulationData.dictamen_tecnico || 'Sin dictamen disponible.'}</div>
          </div>
        )}

        {simulationData && (
          <div className="fade-in-up"><RawDataExpander data={simulationData} /></div>
        )}
      </main>
    </div>
  );
};

// ── Mount React ──
const rootEl = document.getElementById('root');
ReactDOM.createRoot(rootEl).render(React.createElement(App));
