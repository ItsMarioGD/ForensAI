/*
 * ForensIA · Generador procedural de mapas (modo "Mapa automático")
 * =================================================================
 * Construye en Three.js el LUGAR del siniestro que la IA describe en el campo
 * "escenario" (vías, zonas, elementos, iluminación, clima), en lugar de usar
 * uno de los 4 mapas modelados.
 *
 * Convenciones (las mismas que usan los vehículos en app.js):
 *   - Mundo de la IA: metros, +x = este, +y = norte.
 *   - Escena Three.js: X = x, Z = -y, Y = altura.
 *   - Rumbo: 0 = norte, 90 = este. Un objeto con el frente en -Z local se
 *     orienta con rotation.y = -rumbo (en radianes).
 *
 * API pública (window.ForensMap):
 *   computeFocus(frames)                         → { x, y, r, impact }
 *   build(sm, escenario, frames, opts)           → layout (Group agregado a sm.scene)
 *   placeAmbientTraffic(sm, layout)              → agrega autos de relleno a sm.fillerVehicles
 *   applyAtmosphere(sm, iluminacion, clima, focus)
 */
(function (global) {
  'use strict';

  const DEG = Math.PI / 180;

  // ──────────────────────────────────────────────────────────────
  //  Utilidades
  // ──────────────────────────────────────────────────────────────
  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Azar determinista: la misma simulación siempre produce el mismo mapa.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const headingOf = (dx, dy) => ((Math.atan2(dx, dy) / DEG) + 360) % 360;

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
  }

  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
    }
    return inside;
  }

  function polygonArea(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      a += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    return Math.abs(a) / 2;
  }

  /** Centro de interés de la escena: impacto + caja de las trayectorias. */
  function computeFocus(frames) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    (frames || []).forEach(f => {
      for (const k of ['v1', 'v2']) {
        const x = f[k + '_x'], y = f[k + '_y'];
        if (!isFinite(x) || !isFinite(y)) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    });
    if (!isFinite(minX)) return { x: 0, y: 0, r: 60, impact: { x: 0, y: 0 } };
    const mid = frames[Math.floor(frames.length / 2)];
    const impact = { x: (mid.v1_x + mid.v2_x) / 2, y: (mid.v1_y + mid.v2_y) / 2 };
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const r = Math.max(35, Math.hypot(maxX - minX, maxY - minY) / 2 + 15);
    return { x: (impact.x + cx) / 2, y: (impact.y + cy) / 2, r, impact };
  }

  // ──────────────────────────────────────────────────────────────
  //  Texturas procedurales (cacheadas: se comparten entre simulaciones)
  // ──────────────────────────────────────────────────────────────
  const TEX = {};

  function canvasTexture(key, size, draw) {
    if (TEX[key]) return TEX[key];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.encoding = THREE.sRGBEncoding; // el renderer trabaja con salida sRGB
    TEX[key] = t;
    return t;
  }

  function speckle(ctx, s, n, colors, wMax, hMax) {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
      ctx.fillRect(Math.random() * s, Math.random() * s, 0.6 + Math.random() * wMax, 0.6 + Math.random() * hMax);
    }
  }

  function tiles(ctx, s, base, joint, cols, rows, offsetRows) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = joint; ctx.lineWidth = 2;
    const cw = s / cols, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = offsetRows && (r % 2) ? cw / 2 : 0;
      for (let c = -1; c <= cols; c++) ctx.strokeRect(c * cw + off, r * rh, cw, rh);
    }
  }

  // Cada textura representa 4 × 4 m de superficie.
  const SURFACES = {
    asfalto: () => canvasTexture('asfalto', 256, (c, s) => {
      c.fillStyle = '#2e3136'; c.fillRect(0, 0, s, s);
      speckle(c, s, 6000, ['#26282c', '#383b40', '#44474c', '#202225', '#3d3a37'], 2.2, 1.8);
      c.strokeStyle = 'rgba(15,15,17,0.45)'; c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        c.beginPath(); let x = Math.random() * s, y = Math.random() * s; c.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; c.lineTo(x, y); }
        c.stroke();
      }
    }),
    concreto: () => canvasTexture('concreto', 256, (c, s) => {
      c.fillStyle = '#7d7c77'; c.fillRect(0, 0, s, s);
      speckle(c, s, 3500, ['#73726d', '#86857f', '#6b6a66', '#8e8c86'], 2, 2);
      c.strokeStyle = 'rgba(40,40,40,0.55)'; c.lineWidth = 2;
      c.strokeRect(0, 0, s, s); c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s); c.stroke();
    }),
    adoquin: () => canvasTexture('adoquin', 256, (c, s) => {
      tiles(c, s, '#6e6155', '#3a332d', 8, 16, true);
      speckle(c, s, 2500, ['#5f5348', '#7c6e60', '#665a4e'], 2, 2);
    }),
    tierra: () => canvasTexture('tierra', 256, (c, s) => {
      c.fillStyle = '#5e4630'; c.fillRect(0, 0, s, s);
      speckle(c, s, 5000, ['#4f3a27', '#6d5339', '#7a6045', '#47331f', '#806a50'], 3, 3);
    }),
    grava: () => canvasTexture('grava', 256, (c, s) => {
      c.fillStyle = '#6e685e'; c.fillRect(0, 0, s, s);
      speckle(c, s, 9000, ['#5c574f', '#837c71', '#9a9286', '#4c4842', '#a8a194'], 2.5, 2.5);
    }),
    cesped: () => canvasTexture('cesped', 256, (c, s) => {
      c.fillStyle = '#334d22'; c.fillRect(0, 0, s, s);
      speckle(c, s, 9000, ['#2b421c', '#3d5a29', '#46652f', '#28391a', '#52703a', '#3a4f24'], 1.2, 4);
    }),
    arena: () => canvasTexture('arena', 256, (c, s) => {
      c.fillStyle = '#b09a72'; c.fillRect(0, 0, s, s);
      speckle(c, s, 6000, ['#a38d66', '#bda881', '#c8b38c', '#97815c'], 1.5, 1.5);
    }),
    nieve: () => canvasTexture('nieve', 256, (c, s) => {
      c.fillStyle = '#d9e1e8'; c.fillRect(0, 0, s, s);
      speckle(c, s, 3000, ['#cfd8e0', '#e6ecf1', '#c4ced8', '#f0f4f7'], 3, 3);
    }),
    cultivo: () => canvasTexture('cultivo', 256, (c, s) => {
      c.fillStyle = '#4b3a26'; c.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 32) { c.fillStyle = '#3f6a2a'; c.fillRect(x + 6, 0, 18, s); }
      speckle(c, s, 4000, ['#35591f', '#4f7d35', '#3a2c1c'], 1.5, 4);
    }),
    agua: () => canvasTexture('agua', 256, (c, s) => {
      c.fillStyle = '#163650'; c.fillRect(0, 0, s, s);
      c.strokeStyle = 'rgba(120,170,210,0.25)'; c.lineWidth = 1.5;
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * s, y = Math.random() * s;
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 10, y - 4, x + 22, y); c.stroke();
      }
    }),
    plaza: () => canvasTexture('plaza', 256, (c, s) => {
      tiles(c, s, '#8f877a', '#5f584f', 4, 4, false);
      speckle(c, s, 1500, ['#857d70', '#9a9285'], 2, 2);
    }),
    acera: () => canvasTexture('acera', 256, (c, s) => {
      tiles(c, s, '#86837b', '#55524c', 6, 6, false);
      speckle(c, s, 1500, ['#7c7972', '#908d85'], 2, 2);
    }),
  };

  // Fachadas: textura de ventanas (map) + ventanas encendidas (emissiveMap).
  function facadeTextures(style) {
    const key = 'fachada-' + style;
    if (TEX[key]) return TEX[key];
    const lit = [];
    const map = canvasTexture(key + '-map', 256, (c, s) => {
      c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, s, s);
      const cols = 4, rows = 4, cw = s / cols, rh = s / rows;
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          const on = Math.random() < (style === 'industrial' ? 0.15 : 0.45);
          lit.push(on);
          if (style === 'industrial') {
            c.fillStyle = '#9c9c9c'; c.fillRect(k * cw, r * rh, cw, 4);
            if (r === 1) { c.fillStyle = '#2a3440'; c.fillRect(k * cw + 8, r * rh + 18, cw - 16, rh * 0.35); }
          } else {
            c.fillStyle = '#2b3a4a'; c.fillRect(k * cw + 12, r * rh + 14, cw - 24, rh - 26);
            c.fillStyle = 'rgba(180,210,235,0.35)'; c.fillRect(k * cw + 12, r * rh + 14, (cw - 24) / 2, rh - 26);
          }
        }
      }
    });
    let i = 0;
    const emissive = canvasTexture(key + '-emi', 256, (c, s) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, s, s);
      const cols = 4, rows = 4, cw = s / cols, rh = s / rows;
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          if (!lit[i++]) continue;
          c.fillStyle = Math.random() < 0.7 ? '#ffd9a0' : '#bfe0ff';
          if (style === 'industrial') { if (r === 1) c.fillRect(k * cw + 8, r * rh + 18, cw - 16, rh * 0.35); }
          else c.fillRect(k * cw + 12, r * rh + 14, cw - 24, rh - 26);
        }
      }
    });
    TEX[key] = { map, emissive };
    return TEX[key];
  }

  function textTexture(text, opts) {
    opts = opts || {};
    const font = opts.font || 'bold 64px Outfit, Arial, sans-serif';
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    c.width = Math.max(64, w); c.height = opts.height || 96;
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, c.width, c.height); }
    if (opts.stroke) { ctx.lineWidth = 8; ctx.strokeStyle = opts.stroke; ctx.strokeText(text, c.width / 2, c.height / 2); }
    ctx.fillStyle = opts.color || '#ffffff';
    ctx.fillText(text, c.width / 2, c.height / 2);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.__own = true;
    return { tex: t, aspect: c.width / c.height };
  }

  function gradientTexture(stops) {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256);
    return new THREE.CanvasTexture(c);
  }

  // ──────────────────────────────────────────────────────────────
  //  Atmósfera: iluminación + clima
  // ──────────────────────────────────────────────────────────────
  // "noche" = valores originales de SceneManager (se capturan la primera vez).
  const PRESETS = {
    noche: { tone: 0.35, lampsOn: true },
    dia: {
      sky: ['#2f5f99', '#5d8cc4', '#9cc0e2', '#cfe1ee'], fog: 0xbdd2e3, density: 0.0018,
      amb: [0xffffff, 0.3], hemi: [0xd6e8ff, 0x50483a, 0.6], sun: [0xfff3e0, 2.2], sunDir: [-0.45, 0.8, 0.35],
      fill: [0xa8bcd0, 0.3], rim: [0xffffff, 0.15], exposure: 0.95, stars: false, grid: 0.08, tone: 1.0, lampsOn: false,
    },
    amanecer: {
      sky: ['#1c2a4f', '#58608a', '#d99372', '#f3c690'], fog: 0x9a8290, density: 0.0026,
      amb: [0x6a5a70, 0.45], hemi: [0xffcfa8, 0x262030, 0.55], sun: [0xffb27a, 1.8], sunDir: [0.85, 0.3, -0.3],
      fill: [0x6a7aa0, 0.35], rim: [0xffc090, 0.3], exposure: 1.0, stars: false, grid: 0.18, tone: 0.85, lampsOn: true,
    },
    atardecer: {
      sky: ['#151d3b', '#4b3b68', '#cf6a3d', '#f2a65a'], fog: 0x7a5652, density: 0.0028,
      amb: [0x5a4458, 0.45], hemi: [0xffa877, 0x1d1224, 0.55], sun: [0xff8f52, 1.9], sunDir: [-0.85, 0.3, 0.25],
      fill: [0x5a6a98, 0.35], rim: [0xffa070, 0.35], exposure: 1.0, stars: false, grid: 0.18, tone: 0.85, lampsOn: true,
    },
    nublado: {
      sky: ['#4f5761', '#6d7580', '#8e96a0', '#a7aeb7'], fog: 0x8e969f, density: 0.0042,
      amb: [0xd6dce4, 0.35], hemi: [0xbcc6d0, 0x34342f, 0.7], sun: [0xe2e8ef, 1.0], sunDir: [-0.3, 0.9, 0.2],
      fill: [0x9aa6b4, 0.3], rim: [0xffffff, 0.1], exposure: 0.95, stars: false, grid: 0.1, tone: 1.0, lampsOn: false,
    },
  };

  function captureDefaults(sm) {
    if (sm._atmosDefaults) return sm._atmosDefaults;
    const L = sm.lights;
    const snap = l => ({ color: l.color.getHex(), intensity: l.intensity, position: l.position.clone() });
    sm._atmosDefaults = {
      background: sm.scene.background,
      fogColor: sm.scene.fog.color.getHex(), density: sm.scene.fog.density,
      exposure: sm.renderer.toneMappingExposure,
      ambient: snap(L.ambient), moon: snap(L.moon), fill: snap(L.fill), rim: snap(L.rim),
      hemi: { color: L.hemi.color.getHex(), ground: L.hemi.groundColor.getHex(), intensity: L.hemi.intensity },
      grid: sm.gridHelper ? sm.gridHelper.material.opacity : 0.6,
    };
    return sm._atmosDefaults;
  }

  function stopWeather(sm) {
    if (sm.weather) {
      sm.scene.remove(sm.weather.object);
      sm.weather.object.geometry.dispose();
      sm.weather.object.material.dispose();
      sm.weather = null;
    }
  }

  function startWeather(sm, clima, focus, night) {
    stopWeather(sm);
    if (clima !== 'lluvia' && clima !== 'nieve') return;
    const rain = clima === 'lluvia';
    const count = rain ? 2600 : 1800;
    const span = 140, height = 45;
    const cx = focus.x, cz = -focus.y;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * (rain ? 6 : 3));
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = cx + (Math.random() - 0.5) * span, y = Math.random() * height, z = cz + (Math.random() - 0.5) * span;
      seeds[i] = Math.random();
      if (rain) { pos.set([x, y, z, x + 0.08, y + 0.7, z + 0.04], i * 6); }
      else pos.set([x, y, z], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    let object;
    if (rain) {
      object = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: night ? 0x8fa8c8 : 0xc8d6e6, transparent: true, opacity: night ? 0.35 : 0.45, depthWrite: false,
      }));
    } else {
      object = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffffff, size: 0.22, transparent: true, opacity: 0.85, depthWrite: false,
      }));
    }
    object.frustumCulled = false;
    sm.scene.add(object);
    let last = performance.now();
    sm.weather = {
      object,
      tick() {
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const p = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
          if (rain) {
            const o = i * 6; const dy = 26 * dt;
            p[o + 1] -= dy; p[o + 4] -= dy; p[o] -= 1.2 * dt; p[o + 3] -= 1.2 * dt;
            if (p[o + 1] < 0) { p[o + 1] = height; p[o + 4] = height + 0.7; p[o] = cx + (seeds[i] - 0.5) * span; p[o + 3] = p[o] + 0.08; }
          } else {
            const o = i * 3;
            p[o + 1] -= 1.6 * dt;
            p[o] += Math.sin(now * 0.001 + seeds[i] * 20) * 0.6 * dt;
            if (p[o + 1] < 0) p[o + 1] = height;
          }
        }
        geo.attributes.position.needsUpdate = true;
      },
    };
  }

  function applyAtmosphere(sm, iluminacion, clima, focus) {
    const d = captureDefaults(sm);
    const L = sm.lights;
    const p = PRESETS[iluminacion] || PRESETS.noche;
    focus = focus || { x: 0, y: 0 };
    const fx = focus.x, fz = -focus.y;
    const night = !p.sky;

    if (night) {
      sm.scene.background = d.background;
      sm.scene.fog.color.setHex(d.fogColor); sm.scene.fog.density = d.density;
      sm.renderer.toneMappingExposure = d.exposure;
      L.ambient.color.setHex(d.ambient.color); L.ambient.intensity = d.ambient.intensity;
      L.hemi.color.setHex(d.hemi.color); L.hemi.groundColor.setHex(d.hemi.ground); L.hemi.intensity = d.hemi.intensity;
      L.moon.color.setHex(d.moon.color); L.moon.intensity = d.moon.intensity;
      L.moon.position.copy(d.moon.position).add(new THREE.Vector3(fx, 0, fz));
      L.fill.color.setHex(d.fill.color); L.fill.intensity = d.fill.intensity;
      L.rim.color.setHex(d.rim.color); L.rim.intensity = d.rim.intensity;
      if (sm.stars) sm.stars.visible = true;
      if (sm.gridHelper) sm.gridHelper.material.opacity = d.grid;
    } else {
      if (sm._skyTex) sm._skyTex.dispose();
      sm._skyTex = gradientTexture(p.sky);
      sm.scene.background = sm._skyTex;
      sm.scene.fog.color.setHex(p.fog); sm.scene.fog.density = p.density;
      sm.renderer.toneMappingExposure = p.exposure;
      L.ambient.color.setHex(p.amb[0]); L.ambient.intensity = p.amb[1];
      L.hemi.color.setHex(p.hemi[0]); L.hemi.groundColor.setHex(p.hemi[1]); L.hemi.intensity = p.hemi[2];
      L.moon.color.setHex(p.sun[0]); L.moon.intensity = p.sun[1];
      L.moon.position.set(fx + p.sunDir[0] * 120, p.sunDir[1] * 120, fz + p.sunDir[2] * 120);
      L.fill.color.setHex(p.fill[0]); L.fill.intensity = p.fill[1];
      L.rim.color.setHex(p.rim[0]); L.rim.intensity = p.rim[1];
      if (sm.stars) sm.stars.visible = false;
      if (sm.gridHelper) sm.gridHelper.material.opacity = p.grid;
    }
    // La luz principal (luna/sol) proyecta sombras alrededor del foco.
    L.moon.target.position.set(fx, 0, fz);
    if (!L.moon.target.parent) sm.scene.add(L.moon.target);

    if (clima === 'lluvia') {
      sm.scene.fog.density = sm.scene.fog.density * 1.7 + 0.002;
      sm.scene.fog.color.multiplyScalar(0.75);
      L.moon.intensity *= 0.55; L.ambient.intensity *= 0.85;
    } else if (clima === 'niebla') {
      sm.scene.fog.density = Math.max(sm.scene.fog.density, 0.011);
      sm.scene.fog.color.lerp(new THREE.Color(night ? 0x2a3138 : 0x9aa3ab), 0.6);
      L.moon.intensity *= 0.7;
    } else if (clima === 'nieve') {
      sm.scene.fog.density *= 1.4;
    }
    startWeather(sm, clima, focus, night);
  }

  // ──────────────────────────────────────────────────────────────
  //  Geometría de vías
  // ──────────────────────────────────────────────────────────────
  /** Muestrea el eje de una vía cada ~1 m (suavizado Catmull-Rom). */
  function sampleRoad(via, layer) {
    const P = via.puntos.map(p => new THREE.Vector3(p[0], p[1], 0));
    const closed = !!via.cerrada && P.length >= 3;
    let approx = 0;
    for (let i = 1; i < P.length; i++) approx += P[i].distanceTo(P[i - 1]);
    if (closed) approx += P[0].distanceTo(P[P.length - 1]);
    const n = clamp(Math.ceil(approx), 2, 700);
    let pts;
    if (P.length === 2) {
      pts = [];
      for (let i = 0; i <= n; i++) pts.push(P[0].clone().lerp(P[1], i / n));
    } else {
      const curve = new THREE.CatmullRomCurve3(P, closed, 'centripetal', 0.5);
      pts = curve.getSpacedPoints(n);
      if (closed) pts.pop();
    }
    const m = pts.length;
    const S = [];
    let s = 0;
    for (let i = 0; i < m; i++) {
      if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const a = closed ? pts[(i - 1 + m) % m] : pts[Math.max(0, i - 1)];
      const b = closed ? pts[(i + 1) % m] : pts[Math.min(m - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      S.push({ x: pts[i].x, y: pts[i].y, tx, ty, nx: -ty, ny: tx, s });
    }
    const length = closed ? s + Math.hypot(S[0].x - S[m - 1].x, S[0].y - S[m - 1].y) : s;

    // Índice por tramos para acelerar las consultas de distancia.
    const segCount = closed ? m : m - 1;
    const chunks = [];
    for (let i0 = 0; i0 < segCount; i0 += 16) {
      const i1 = Math.min(segCount, i0 + 16);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = i0; i <= i1; i++) {
        const q = S[i % m];
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
        minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
      }
      chunks.push({ i0, i1, minX, maxX, minY, maxY });
    }
    const via2 = via;
    return {
      via: via2, S, closed, length, chunks, segCount, layer,
      half: via.ancho / 2,
      y: 0.02 + layer * 0.01,
      paved: via.superficie !== 'tierra' && via.superficie !== 'grava',
      skipCenter: [],   // tramos [s0, s1] sin marcas centrales (cruces)
    };
  }

  /** Punto más cercano de una vía: { d, i, t, x, y, s, side }. */
  function nearestOnRoad(R, x, y, maxD) {
    maxD = maxD === undefined ? Infinity : maxD;
    const m = R.S.length;
    let best = { d: Infinity, i: -1, t: 0 };
    for (const c of R.chunks) {
      if (x < c.minX - maxD || x > c.maxX + maxD || y < c.minY - maxD || y > c.maxY + maxD) continue;
      for (let i = c.i0; i < c.i1; i++) {
        const a = R.S[i], b = R.S[(i + 1) % m];
        const r = segDist(x, y, a.x, a.y, b.x, b.y);
        if (r.d < best.d) best = { d: r.d, i, t: r.t };
      }
    }
    if (best.i < 0) return best;
    const a = R.S[best.i], b = R.S[(best.i + 1) % m];
    best.x = a.x + (b.x - a.x) * best.t;
    best.y = a.y + (b.y - a.y) * best.t;
    best.s = a.s + Math.hypot(b.x - a.x, b.y - a.y) * best.t;
    best.tx = a.tx; best.ty = a.ty; best.nx = a.nx; best.ny = a.ny;
    best.side = Math.sign((x - best.x) * a.nx + (y - best.y) * a.ny) || 1; // +1 = izquierda del eje
    return best;
  }

  /** Muestra interpolada a la distancia s del inicio de la vía. */
  function sampleAt(R, s) {
    const S = R.S, m = S.length;
    s = R.closed ? ((s % R.length) + R.length) % R.length : clamp(s, 0, R.length);
    let lo = 0, hi = m - 1;
    if (s >= S[m - 1].s) lo = m - 1;
    else while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid].s <= s) lo = mid; else hi = mid; }
    const a = S[lo];
    let b = a, segLen = 0;
    if (lo < m - 1) { b = S[lo + 1]; segLen = b.s - a.s; }
    else if (R.closed) { b = S[0]; segLen = R.length - a.s; }
    const t = segLen > 0 ? clamp((s - a.s) / segLen, 0, 1) : 0;
    return {
      x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
      tx: a.tx, ty: a.ty, nx: a.nx, ny: a.ny, s,
    };
  }

  /**
   * Franja a lo largo de una vía, entre los desplazamientos laterales
   * [from, to] (positivo = izquierda del eje). include(i, sMid, px, py)
   * decide qué tramos se dibujan (líneas discontinuas, cruces...).
   */
  function stripGeometry(R, from, to, y, include, uvScale, raise) {
    const S = R.S, m = S.length;
    const pos = [], uv = [];
    uvScale = uvScale || 4;
    for (let i = 0; i < R.segCount; i++) {
      const a = S[i], b = S[(i + 1) % m];
      const sA = a.s, sB = (i + 1 === m) ? R.length : b.s;
      const mid = (from + to) / 2;
      if (include && !include(i, (sA + sB) / 2, (a.x + b.x) / 2 + (a.nx + b.nx) / 2 * mid, (a.y + b.y) / 2 + (a.ny + b.ny) / 2 * mid)) continue;
      const A0 = [a.x + a.nx * from, -(a.y + a.ny * from)], A1 = [a.x + a.nx * to, -(a.y + a.ny * to)];
      const B0 = [b.x + b.nx * from, -(b.y + b.ny * from)], B1 = [b.x + b.nx * to, -(b.y + b.ny * to)];
      const top = y + (raise || 0);
      pos.push(A0[0], top, A0[1], B0[0], top, B0[1], A1[0], top, A1[1],
               A1[0], top, A1[1], B0[0], top, B0[1], B1[0], top, B1[1]);
      const u0 = from / uvScale, u1 = to / uvScale, v0 = sA / uvScale, v1 = sB / uvScale;
      uv.push(u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1);
      if (raise) {
        // Cara lateral (bordillo) del lado más cercano al eje.
        const inner = Math.abs(from) < Math.abs(to) ? [A0, B0] : [A1, B1];
        const [P, Q] = inner;
        pos.push(P[0], y, P[1], Q[0], y, Q[1], P[0], top, P[1],
                 P[0], top, P[1], Q[0], y, Q[1], Q[0], top, Q[1]);
        uv.push(0, 0, 0, 1, 0.05, 0, 0.05, 0, 0, 1, 0.05, 1);
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  // ──────────────────────────────────────────────────────────────
  //  Constructor del mapa
  // ──────────────────────────────────────────────────────────────
  const PARKED_MODELS = ['hilux', 'l200', 'civic', 'mazda3', 'crv', 'rav4', 'yaris', 'accent', 'kia_furgon'];
  const PARKED_COLORS = [0xffffff, 0x808080, 0x4f4f4f, 0x003366, 0x1c3b2b, 0x6f4e37, 0xcc0000, 0x001f3f, 0x0a0a0a, 0xd3d3d3, 0x005a9c];
  const HOUSE_COLORS = [0xd9c7a3, 0xc98f6b, 0x9fb7c9, 0xd6a8a0, 0xb8c99a, 0xe0d2b0, 0xc4c4c4, 0xe3b75d, 0x8fb3a8];
  const BUILDING_COLORS = [0x8a8f96, 0xa39a8c, 0x7d8790, 0xb5aa98, 0x6f7780, 0x9c8f80, 0x8c8478];

  // Radio de ocupación aproximado (para no superponer objetos).
  const FOOTPRINT = {
    edificio: 8, casa: 5.5, tienda: 5, gasolinera: 9, arbol: 2, palmera: 1.5, pino: 1.8, arbusto: 1,
    poste_luz: 0.4, poste_electrico: 0.4, semaforo: 0.4, senal_pare: 0.3, senal_ceda: 0.3, senal_velocidad: 0.3,
    senal: 0.4, cono: 0.3, barril: 0.4, parada_bus: 2.2, vehiculo_estacionado: 2.4, hidrante: 0.3, banca: 1,
    contenedor: 1.3, roca: 1.2, poste_km: 0.3, generico: 0.6,
  };

  class MapBuilder {
    constructor(sm, esc, frames, opts) {
      this.sm = sm;
      this.esc = esc;
      this.frames = frames || [];
      this.opts = opts || {};
      this.group = new THREE.Group();
      this.group.name = 'mapa-ia';
      this.rng = makeRng(hashString(JSON.stringify(esc).slice(0, 6000) + '|' + this.frames.length));
      this.focus = computeFocus(this.frames);
      this.preset = PRESETS[esc.iluminacion] || PRESETS.noche;
      this.night = !this.preset.sky;
      this.lampsOn = this.preset.lampsOn;
      this.tone = this.preset.tone * (esc.clima === 'lluvia' ? 0.9 : 1);
      this.wet = esc.clima === 'lluvia';
      this.urbanLike = ['urbana', 'residencial', 'suburbana', 'industrial', 'estacionamiento'].includes(esc.zona);
      this.occupied = [];
      this.lamps = [];
      this.parkedCars = [];
      this.roads = (esc.vias || []).map((v, i) => sampleRoad(v, i));
      this.maxRoadY = this.roads.reduce((m, R) => Math.max(m, R.y), 0.02);
      this.trajSegs = [];
      for (const k of ['v1', 'v2']) {
        for (let i = 1; i < this.frames.length; i++) {
          const a = this.frames[i - 1], b = this.frames[i];
          this.trajSegs.push([a[k + '_x'], a[k + '_y'], b[k + '_x'], b[k + '_y']]);
        }
      }
      this.junctions = [];
    }

    // ── Helpers de materiales y montaje ──
    shade(hex) { return new THREE.Color(hex).convertSRGBToLinear().multiplyScalar(this.tone); }

    mat(hex, extra) {
      return new THREE.MeshStandardMaterial(Object.assign({ color: this.shade(hex), roughness: 0.85, metalness: 0.05 }, extra || {}));
    }

    surfaceMat(kind, extra) {
      const tex = (SURFACES[kind] || SURFACES.concreto)();
      const wetRoad = this.wet && ['asfalto', 'concreto', 'adoquin'].includes(kind);
      return new THREE.MeshStandardMaterial(Object.assign({
        map: tex, color: this.shade(0xffffff),
        roughness: wetRoad ? 0.35 : 0.92, metalness: wetRoad ? 0.25 : 0.02,
        envMap: wetRoad ? this.sm.envMap : null, envMapIntensity: wetRoad ? 0.6 : 1,
      }, extra || {}));
    }

    add(obj) { this.group.add(obj); return obj; }

    mesh(geo, mat, x, y, z, shadows) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (shadows !== false) { m.castShadow = true; m.receiveShadow = true; }
      return m;
    }

    /** Ubica un objeto en coordenadas del mundo (x, y, rumbo). Frente local = -Z. */
    place(obj, x, y, heading) {
      obj.position.set(x, obj.position.y, -y);
      obj.rotation.y = -(heading || 0) * DEG;
      return this.add(obj);
    }

    occupy(x, y, r) { this.occupied.push({ x, y, r }); }

    isFree(x, y, r) {
      for (const o of this.occupied) if (Math.hypot(x - o.x, y - o.y) < r + o.r) return false;
      return true;
    }

    distToTraj(x, y) {
      let d = Infinity;
      for (const s of this.trajSegs) d = Math.min(d, segDist(x, y, s[0], s[1], s[2], s[3]).d);
      return d;
    }

    /** Distancia al borde de la calzada más cercana (negativa = dentro). */
    roadClearance(x, y, except) {
      let best = Infinity;
      for (const R of this.roads) {
        if (R === except) continue;
        const n = nearestOnRoad(R, x, y, R.half + 30);
        if (n.i >= 0) best = Math.min(best, n.d - R.half);
      }
      return best;
    }

    nearestRoad(x, y, maxD) {
      let best = null;
      for (const R of this.roads) {
        const n = nearestOnRoad(R, x, y, maxD + R.half);
        if (n.i >= 0 && (!best || n.d - R.half < best.n.d - best.R.half)) best = { R, n };
      }
      return best && best.n.d - best.R.half <= maxD ? best : null;
    }

    inZone(x, y, types) {
      for (const z of this.esc.zonas || []) {
        if (types.includes(z.tipo) && pointInPolygon(x, y, z.poligono)) return true;
      }
      return false;
    }

    /** ¿Se puede decorar en (x, y) con radio r? */
    canDecorate(x, y, r, roadMargin) {
      if (Math.hypot(x - this.focus.x, y - this.focus.y) > this.focus.r + 140) return false;
      if (this.roadClearance(x, y) < r + (roadMargin || 1)) return false;
      if (this.distToTraj(x, y) < r + 3) return false;
      if (this.inZone(x, y, ['agua', 'plaza', 'estacionamiento', 'isla'])) return false;
      return this.isFree(x, y, r);
    }

    // ── Construcción ──
    build() {
      this.buildTerrain();
      this.buildZones();
      this.buildRoads();
      this.findJunctions();
      this.buildMarkings();
      this.buildJunctionMarkings();
      this.buildElements();
      this.decorate();
      this.buildRoadLabels();
      this.finalizeLamps();
      return {
        group: this.group, roads: this.roads, focus: this.focus, builder: this,
        trafico: this.esc.trafico_ambiente,
      };
    }

    buildTerrain() {
      const kind = this.esc.clima === 'nieve' ? 'nieve' : (this.esc.terreno || 'cesped');
      const map = { cesped: 'cesped', tierra: 'tierra', arena: 'arena', grava: 'grava', concreto: 'concreto', nieve: 'nieve' }[kind] || 'cesped';
      const mat = this.surfaceMat(map);
      mat.map = mat.map.clone(); mat.map.needsUpdate = true; mat.map.__own = true;
      const size = 900;
      mat.map.repeat.set(size / 6, size / 6);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(this.focus.x, -0.12, -this.focus.y);
      ground.receiveShadow = true;
      this.add(ground);
    }

    buildZones() {
      const styles = {
        parque: 'cesped', cesped: 'cesped', bosque: 'cesped', cultivo: 'cultivo', agua: 'agua', plaza: 'plaza',
        estacionamiento: 'asfalto', tierra: 'tierra', arena: 'arena', isla: 'cesped',
      };
      (this.esc.zonas || []).forEach((z, idx) => {
        const shape = new THREE.Shape(z.poligono.map(p => new THREE.Vector2(p[0], p[1])));
        const geo = new THREE.ShapeGeometry(shape);
        // UV en metros / 4 para que la textura no se estire.
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 4);
        const extra = z.tipo === 'agua'
          ? { roughness: 0.08, metalness: 0.35, envMap: this.sm.envMap, envMapIntensity: 1.2 }
          : {};
        const mat = this.surfaceMat(styles[z.tipo] || 'cesped', Object.assign({
          side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        }, extra));
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = -0.1 + idx * 0.004 + (z.tipo === 'isla' ? 0.25 : 0.005);
        m.receiveShadow = true;
        this.add(m);

        const area = polygonArea(z.poligono);
        if (z.tipo === 'bosque') this.scatterInZone(z, Math.min(45, Math.round(area / 55)), ['arbol', 'pino', 'arbol', 'arbusto']);
        else if (z.tipo === 'parque') {
          this.scatterInZone(z, Math.min(18, Math.round(area / 180)), ['arbol', 'arbol', 'arbusto', 'palmera']);
          this.scatterInZone(z, Math.min(4, Math.round(area / 400)), ['banca']);
        } else if (z.tipo === 'isla' && area > 30) {
          this.scatterInZone(z, Math.min(5, Math.round(area / 120)), ['palmera', 'arbusto']);
        }
      });
    }

    scatterInZone(z, count, types) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      z.poligono.forEach(p => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
      let placed = 0;
      for (let tries = 0; tries < count * 8 && placed < count; tries++) {
        const x = minX + this.rng() * (maxX - minX), y = minY + this.rng() * (maxY - minY);
        if (!pointInPolygon(x, y, z.poligono)) continue;
        const tipo = types[(this.rng() * types.length) | 0];
        const r = FOOTPRINT[tipo] || 1;
        if (this.roadClearance(x, y) < r + 0.5 || this.distToTraj(x, y) < r + 2 || !this.isFree(x, y, r)) continue;
        this.placeElement({ tipo, x, y, angulo: this.rng() * 360 }, true);
        placed++;
      }
    }

    buildRoads() {
      for (const R of this.roads) {
        const v = R.via;
        const mat = this.surfaceMat(v.superficie, {
          polygonOffset: true, polygonOffsetFactor: -1 - R.layer, polygonOffsetUnits: -2 - 2 * R.layer,
        });
        const geo = stripGeometry(R, -R.half, R.half, R.y, null, 4);
        if (geo) { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; this.add(m); }

        // Bermas (hombro de grava/tierra) en zonas rurales y autopistas.
        if (v.berma) {
          const bw = v.ancho >= 14 ? 2.5 : 1.5;
          const bMat = this.surfaceMat('grava', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
          for (const side of [-1, 1]) {
            const from = side > 0 ? R.half : -R.half - bw, to = side > 0 ? R.half + bw : -R.half;
            const g = stripGeometry(R, from, to, R.y - 0.01, (i, s, px, py) => this.roadClearance(px, py, R) > 0.2, 4);
            if (g) { const m = new THREE.Mesh(g, bMat); m.receiveShadow = true; this.add(m); }
          }
          R.shoulder = bw;
        }

        // Aceras elevadas con bordillo.
        if (v.acera) {
          const aw = v.ancho >= 12 ? 3.5 : 2.5;
          const aMat = this.surfaceMat('acera', { side: THREE.DoubleSide });
          for (const side of [-1, 1]) {
            const from = side > 0 ? R.half : -R.half - aw, to = side > 0 ? R.half + aw : -R.half;
            const g = stripGeometry(R, from, to, R.y, (i, s, px, py) => this.roadClearance(px, py, R) > 0.3, 4, 0.16);
            if (g) { const m = new THREE.Mesh(g, aMat); m.receiveShadow = true; m.castShadow = false; this.add(m); }
          }
          R.sidewalk = aw;
        }

        // Rotonda: isla central con césped y bordillo.
        if (v.forma === 'circular' && v.centro && v.radio) {
          const r = Math.max(2, v.radio - R.half - 0.3);
          const island = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 48), this.surfaceMat('cesped'));
          island.material.map = island.material.map.clone(); island.material.map.__own = true;
          island.material.map.repeat.set(r / 2, r / 2); island.material.map.needsUpdate = true;
          island.position.set(v.centro[0], 0.15, -v.centro[1]);
          island.receiveShadow = true;
          this.add(island);
          const curb = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 6, 64), this.mat(0xb0b0a8));
          curb.rotation.x = Math.PI / 2; curb.position.set(v.centro[0], 0.22, -v.centro[1]);
          this.add(curb);
          this.occupy(v.centro[0], v.centro[1], r);
          if (r > 4) this.placeElement({ tipo: 'palmera', x: v.centro[0], y: v.centro[1], angulo: 0 }, true);
        }
      }
    }

    /** Cruces entre ejes y finales de vía que desembocan en otra (intersección en T). */
    findJunctions() {
      const roads = this.roads;
      const addJ = (x, y, items) => {
        for (const J of this.junctions) {
          if (Math.hypot(J.x - x, J.y - y) < 4) {
            items.forEach(it => { if (!J.items.some(o => o.R === it.R)) J.items.push(it); });
            return;
          }
        }
        this.junctions.push({ x, y, items });
      };
      for (let a = 0; a < roads.length; a++) {
        for (let b = a + 1; b < roads.length; b++) {
          const A = roads[a], B = roads[b];
          for (const ca of A.chunks) {
            for (const cb of B.chunks) {
              if (ca.maxX < cb.minX || cb.maxX < ca.minX || ca.maxY < cb.minY || cb.maxY < ca.minY) continue;
              for (let i = ca.i0; i < ca.i1; i++) {
                const p1 = A.S[i], p2 = A.S[(i + 1) % A.S.length];
                for (let j = cb.i0; j < cb.i1; j++) {
                  const q1 = B.S[j], q2 = B.S[(j + 1) % B.S.length];
                  const rx = p2.x - p1.x, ry = p2.y - p1.y, sx = q2.x - q1.x, sy = q2.y - q1.y;
                  const den = rx * sy - ry * sx;
                  if (Math.abs(den) < 1e-9) continue;
                  const t = ((q1.x - p1.x) * sy - (q1.y - p1.y) * sx) / den;
                  const u = ((q1.x - p1.x) * ry - (q1.y - p1.y) * rx) / den;
                  if (t < 0 || t > 1 || u < 0 || u > 1) continue;
                  const x = p1.x + t * rx, y = p1.y + t * ry;
                  addJ(x, y, [
                    { R: A, s: p1.s + t * Math.hypot(rx, ry), arms: [-1, 1] },
                    { R: B, s: q1.s + u * Math.hypot(sx, sy), arms: [-1, 1] },
                  ]);
                }
              }
            }
          }
        }
      }
      // Extremos que terminan sobre otra vía.
      for (const R of roads) {
        if (R.closed) continue;
        for (const end of [0, 1]) {
          const p = end === 0 ? R.S[0] : R.S[R.S.length - 1];
          for (const O of roads) {
            if (O === R) continue;
            const n = nearestOnRoad(O, p.x, p.y, O.half + 3);
            if (n.i < 0 || n.d > O.half + 2) continue;
            addJ(n.x, n.y, [
              { R, s: end === 0 ? 0 : R.length, arms: [end === 0 ? 1 : -1] },
              { R: O, s: n.s, arms: [-1, 1] },
            ]);
          }
        }
      }
      // Recortar brazos que salen fuera de la vía y marcar tramos sin líneas centrales.
      for (const J of this.junctions) {
        for (const it of J.items) {
          const others = J.items.filter(o => o.R !== it.R);
          it.clear = others.reduce((m, o) => Math.max(m, o.R.half + (o.R.sidewalk || 0) * 0.3), 0) + 1;
          if (!it.R.closed) it.arms = it.arms.filter(dir => it.s + dir * (it.clear + 3) >= 0 && it.s + dir * (it.clear + 3) <= it.R.length);
          it.R.skipCenter.push([it.s - it.clear - 4.5, it.s + it.clear + 4.5]);
        }
      }
    }

    insideOtherRoad(R, px, py, margin) {
      for (const O of this.roads) {
        if (O === R) continue;
        const n = nearestOnRoad(O, px, py, O.half + margin + 1);
        if (n.i >= 0 && n.d < O.half + margin) return true;
      }
      return false;
    }

    centerSkipped(R, s) {
      for (const [a, b] of R.skipCenter) {
        if (s >= a && s <= b) return true;
        if (R.closed && (s + R.length >= a && s + R.length <= b || s - R.length >= a && s - R.length <= b)) return true;
      }
      return false;
    }

    buildMarkings() {
      const white = this.mat(0xe8e8e0, { roughness: 0.6, emissive: 0x2a2a28, emissiveIntensity: this.night ? 0.6 : 0.1, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
      const yellow = this.mat(0xe0b832, { roughness: 0.6, emissive: 0x2a2200, emissiveIntensity: this.night ? 0.6 : 0.1, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
      const line = (R, offset, width, material, dash, centerLike) => {
        const y = R.y + 0.012;
        const g = stripGeometry(R, offset - width / 2, offset + width / 2, y, (i, s, px, py) => {
          if (dash && (s % dash[0] + dash[0]) % dash[0] > dash[1]) return false;
          if (centerLike && this.centerSkipped(R, s)) return false;
          return !this.insideOtherRoad(R, px, py, 0.4);
        }, 4);
        if (g) this.add(new THREE.Mesh(g, material));
      };
      for (const R of this.roads) {
        const v = R.via;
        if (!R.paved || v.linea_central === 'ninguna' && v.carriles <= 1) {
          if (R.paved && v.ancho >= 6) for (const s of [-1, 1]) line(R, s * (R.half - 0.3), 0.15, white, null, false);
          continue;
        }
        // Bordes
        if (v.ancho >= 6) for (const s of [-1, 1]) line(R, s * (R.half - 0.3), 0.15, white, null, false);
        // Línea central (solo doble sentido)
        if (v.sentido === 'doble') {
          switch (v.linea_central) {
            case 'doble_amarilla': line(R, 0.12, 0.1, yellow, null, true); line(R, -0.12, 0.1, yellow, null, true); break;
            case 'amarilla': line(R, 0, 0.14, yellow, null, true); break;
            case 'discontinua': line(R, 0, 0.14, yellow, [8, 3], true); break;
            case 'continua': line(R, 0, 0.14, white, null, true); break;
          }
        }
        // Divisiones de carril
        const n = v.carriles;
        if (v.sentido === 'doble') {
          const per = Math.max(1, Math.floor(n / 2));
          const lw = R.half / per;
          for (let k = 1; k < per; k++) for (const s of [-1, 1]) line(R, s * k * lw, 0.12, white, [8, 3], true);
        } else {
          const lw = v.ancho / n;
          for (let k = 1; k < n; k++) line(R, -R.half + k * lw, 0.12, white, [8, 3], true);
        }
      }
    }

    /** Paso de cebra transversal a la vía R, centrado a la distancia s del inicio. */
    crosswalk(R, s, depth) {
      const p = sampleAt(R, s);
      const mat = this.mat(0xf2f2ee, { roughness: 0.6, emissive: 0x333333, emissiveIntensity: this.night ? 0.5 : 0.05, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 });
      const g = new THREE.Group();
      const stripes = Math.max(3, Math.floor((R.via.ancho - 0.6) / 1.0));
      // Con el frente a lo largo de la vía, +X local = derecha del eje.
      for (let k = 0; k < stripes; k++) {
        const off = -R.half + 0.5 + (k + 0.5) * ((R.via.ancho - 1) / stripes);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, depth), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(-off, 0, 0);
        g.add(m);
      }
      g.position.y = R.y + 0.014;
      this.place(g, p.x, p.y, headingOf(p.tx, p.ty));
    }

    stopLine(R, s, from, to) {
      const p = sampleAt(R, s);
      const mat = this.mat(0xf2f2ee, { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(to - from, 0.45), mat);
      m.rotation.x = -Math.PI / 2;
      // Frente local -Z a lo largo de la vía: +X local = derecha = -normal.
      m.position.set(-(from + to) / 2, 0, 0);
      const g = new THREE.Group(); g.add(m); g.position.y = R.y + 0.014;
      this.place(g, p.x, p.y, headingOf(p.tx, p.ty));
    }

    buildJunctionMarkings() {
      for (const J of this.junctions) {
        for (const it of J.items) {
          const R = it.R;
          if (!R.paved || R.closed) continue;
          for (const dir of it.arms) {
            if (this.urbanLike) this.crosswalk(R, it.s + dir * (it.clear + 1.8), 3);
            if (R.via.linea_central === 'ninguna' && R.via.sentido === 'doble') continue;
            // Línea de PARE del lado por el que se llega al cruce.
            const sl = it.s + dir * (it.clear + (this.urbanLike ? 3.8 : 1.5));
            if (R.via.sentido === 'unico') { if (dir < 0) this.stopLine(R, sl, -R.half + 0.3, R.half - 0.3); }
            else if (dir < 0) this.stopLine(R, sl, -R.half + 0.3, -0.25);
            else this.stopLine(R, sl, 0.25, R.half - 0.3);
          }
        }
      }
    }

    // ── Elementos ──
    buildElements() {
      for (const el of this.esc.elementos || []) this.placeElement(el, false);
    }

    /** Orienta automáticamente elementos sin rumbo explícito (rumbo 0) según la vía más cercana. */
    autoHeading(el) {
      const tipo = el.tipo;
      const facesRoad = ['edificio', 'casa', 'tienda', 'gasolinera', 'parada_bus', 'poste_luz', 'banca'];
      const facesTraffic = ['semaforo', 'senal_pare', 'senal_ceda', 'senal_velocidad', 'senal', 'poste_km'];
      const alongRoad = ['muro', 'valla', 'guardarrail', 'barrera', 'vehiculo_estacionado'];
      if (num(el.angulo, 0) !== 0) return num(el.angulo, 0);
      if (![...facesRoad, ...facesTraffic, ...alongRoad].includes(tipo)) return 0;
      const near = this.nearestRoad(el.x, el.y, 25);
      if (!near) return 0;
      const n = near.n;
      if (facesRoad.includes(tipo)) return headingOf(n.x - el.x, n.y - el.y);
      if (facesTraffic.includes(tipo)) {
        // Circulación por la derecha: del lado derecho (side < 0) el tráfico avanza en +t.
        return n.side < 0 || near.R.via.sentido === 'unico' ? headingOf(-n.tx, -n.ty) : headingOf(n.tx, n.ty);
      }
      // A lo largo de la vía (autos estacionados en el sentido de su carril).
      return n.side < 0 ? headingOf(n.tx, n.ty) : headingOf(-n.tx, -n.ty);
    }

    placeElement(el, isDecoration) {
      const tipo = el.tipo;
      const heading = isDecoration ? num(el.angulo, 0) : this.autoHeading(el);
      let x = el.x, y = el.y;
      // Edificaciones de la IA que invaden la calzada: se corren hasta el borde (acera incluida).
      if (!isDecoration && ['edificio', 'casa', 'tienda', 'gasolinera'].includes(tipo)) {
        const half = num(el.largo, tipo === 'edificio' ? 14 : (tipo === 'gasolinera' ? 18 : 9)) / 2;
        const near = this.nearestRoad(x, y, half + 6);
        if (near) {
          const need = near.R.half + (near.R.sidewalk || 0) + (near.R.shoulder || 0) + half + 0.5;
          if (near.n.d < need) {
            const push = need - near.n.d;
            x += near.n.nx * near.n.side * push;
            y += near.n.ny * near.n.side * push;
            el = Object.assign({}, el, { x, y });
          }
        }
      }
      const fn = this['prop_' + tipo] || this.prop_generico;
      const obj = fn.call(this, el, heading);
      if (!obj) return null;
      if (obj.isRoadMarking) {
        // Ya colocado (pasos peatonales, topes...).
      } else {
        this.place(obj, x, y, heading);
        // El visor vuelve transparentes los objetos altos que tapan la vista.
        if (obj.userData.height > 4) obj.userData.occluder = true;
      }
      const r = FOOTPRINT[tipo] !== undefined ? FOOTPRINT[tipo] : Math.max(num(el.ancho, 1), num(el.largo, 1)) / 2;
      if (tipo === 'edificio' || tipo === 'casa' || tipo === 'tienda') {
        this.occupy(x, y, Math.max(num(el.ancho, 2 * r), num(el.largo, 2 * r)) / 2);
      } else if (!['muro', 'valla', 'guardarrail', 'barrera', 'paso_peatonal', 'tope', 'bache', 'charco', 'mancha_aceite'].includes(tipo)) {
        this.occupy(x, y, r);
      }
      return obj;
    }

    prop_edificio(el) {
      const industrial = el.estilo === 'industrial';
      const w = num(el.ancho, industrial ? 30 : 12 + this.rng() * 10);
      const d = num(el.largo, industrial ? 20 : 12 + this.rng() * 10);
      const h = num(el.alto, el.pisos ? el.pisos * 3.2 : (industrial ? 8 : 9 + this.rng() * 24));
      const tx = facadeTextures(industrial ? 'industrial' : (this.rng() < 0.5 ? 'a' : 'b'));
      const map = tx.map.clone(); map.needsUpdate = true; map.__own = true;
      map.repeat.set(Math.max(1, Math.round(w / 3.5)) / 4, Math.max(1, Math.round(h / 3.2)) / 4);
      const sideMap = map.clone(); sideMap.needsUpdate = true; sideMap.__own = true;
      sideMap.repeat.set(Math.max(1, Math.round(d / 3.5)) / 4, map.repeat.y);
      const colorHex = industrial ? 0x8d9196 : BUILDING_COLORS[(this.rng() * BUILDING_COLORS.length) | 0];
      const facade = (m) => {
        const mm = new THREE.MeshStandardMaterial({ map: m, color: this.shade(colorHex), roughness: 0.8, metalness: 0.1 });
        if (this.night || this.lampsOn) {
          const e = tx.emissive.clone(); e.needsUpdate = true; e.__own = true; e.repeat.copy(m.repeat);
          mm.emissiveMap = e; mm.emissive = new THREE.Color(0xffffff); mm.emissiveIntensity = this.night ? 0.9 : 0.35;
        }
        return mm;
      };
      const roof = this.mat(0x3a3d42, { roughness: 0.9 });
      const front = facade(map), side = facade(sideMap);
      const box = this.mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, front, front], 0, h / 2, 0);
      const g = new THREE.Group(); g.add(box);
      g.userData.height = h;
      if (!industrial && h > 12) {
        const ac = this.mesh(new THREE.BoxGeometry(Math.min(4, w * 0.3), 1.6, Math.min(3, d * 0.3)), this.mat(0x6a6d70), w * 0.2, h + 0.8, d * 0.15);
        g.add(ac);
      }
      return g;
    }

    prop_casa(el) {
      const w = num(el.ancho, 7 + this.rng() * 3), d = num(el.largo, 8 + this.rng() * 4), h = num(el.alto, 3 + this.rng() * 0.6);
      const g = new THREE.Group();
      const color = el.color ? (this.opts.colorOf ? this.opts.colorOf(el.color, HOUSE_COLORS[0]) : HOUSE_COLORS[0]) : HOUSE_COLORS[(this.rng() * HOUSE_COLORS.length) | 0];
      g.add(this.mesh(new THREE.BoxGeometry(w, h, d), this.mat(color), 0, h / 2, 0));
      const roofH = 1.4 + this.rng() * 0.6;
      const roof = this.mesh(new THREE.ConeGeometry(Math.SQRT1_2, roofH, 4, 1), this.mat(this.rng() < 0.6 ? 0x8f4a32 : 0x6f757b, { roughness: 0.75, flatShading: true }), 0, h + roofH / 2, 0);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(w + 0.8, 1, d + 0.8);
      g.add(roof);
      g.userData.height = h + roofH;
      // Puerta y ventanas al frente (-Z)
      const door = this.mesh(new THREE.PlaneGeometry(1, 2.1), this.mat(0x4a3020), 0, 1.05, -d / 2 - 0.02, false);
      door.rotation.y = Math.PI; g.add(door);
      const winMat = this.night
        ? new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffc078, emissiveIntensity: this.rng() < 0.6 ? 1.2 : 0.05 })
        : this.mat(0x2b3a4a, { roughness: 0.2, metalness: 0.3 });
      for (const sx of [-1, 1]) {
        const win = this.mesh(new THREE.PlaneGeometry(1.2, 1), winMat, sx * w * 0.28, 1.7, -d / 2 - 0.02, false);
        win.rotation.y = Math.PI; g.add(win);
      }
      return g;
    }

    prop_tienda(el) {
      const w = num(el.ancho, 8 + this.rng() * 4), d = num(el.largo, 7 + this.rng() * 3), h = num(el.alto, 4.2);
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.BoxGeometry(w, h, d), this.mat(HOUSE_COLORS[(this.rng() * HOUSE_COLORS.length) | 0]), 0, h / 2, 0));
      const awningColor = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910][(this.rng() * 4) | 0];
      const awn = this.mesh(new THREE.BoxGeometry(w * 0.9, 0.12, 1.6), this.mat(awningColor), 0, 2.9, -d / 2 - 0.8);
      awn.rotation.x = -0.25; g.add(awn);
      const glass = this.night
        ? new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff0c8, emissiveIntensity: 1.0 })
        : this.mat(0x29404f, { roughness: 0.15, metalness: 0.4 });
      const vit = this.mesh(new THREE.PlaneGeometry(w * 0.7, 1.8), glass, 0, 1.4, -d / 2 - 0.02, false);
      vit.rotation.y = Math.PI; g.add(vit);
      const label = el.etiqueta || el.nombre;
      if (label) {
        const t = textTexture(label.slice(0, 18), { color: '#ffffff', bg: '#1d2b3a' });
        const sign = this.mesh(new THREE.PlaneGeometry(Math.min(w * 0.8, 1.2 * t.aspect), 1.2), new THREE.MeshBasicMaterial({ map: t.tex }), 0, h - 0.4, -d / 2 - 0.05, false);
        sign.rotation.y = Math.PI; g.add(sign);
      }
      return g;
    }

    prop_gasolinera() {
      const g = new THREE.Group();
      const canopyMat = this.night
        ? new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0.25 })
        : this.mat(0xe6e6e6);
      g.add(this.mesh(new THREE.BoxGeometry(14, 0.7, 9), canopyMat, 0, 5.3, 0));
      g.add(this.mesh(new THREE.BoxGeometry(14.2, 0.35, 9.2), this.mat(0xc0392b), 0, 5.0, 0));
      for (const sx of [-5, 5]) for (const sz of [-3, 3]) g.add(this.mesh(new THREE.CylinderGeometry(0.2, 0.2, 5, 10), this.mat(0xcccccc), sx, 2.5, sz));
      for (const sx of [-3.5, 3.5]) {
        g.add(this.mesh(new THREE.BoxGeometry(1.2, 0.2, 4), this.mat(0x999999), sx, 0.1, 0));
        g.add(this.mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), this.mat(0x2e86c1), sx, 1, 0));
      }
      g.add(this.mesh(new THREE.BoxGeometry(9, 3.6, 6), this.mat(0xe8e2d0), 0, 1.8, 9));
      if (this.lampsOn) this.registerLamp(g, 0, 4.8, 0);
      return g;
    }

    prop_arbol(el) {
      const h = num(el.alto, 6 + this.rng() * 4);
      const s = h / 7;
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.CylinderGeometry(0.22 * s, 0.35 * s, h * 0.45, 8), this.mat(0x4a3424), 0, h * 0.225, 0));
      const greens = [0x2f5a24, 0x3a6b2a, 0x2a4d1f, 0x47753a];
      const crown = this.mesh(new THREE.IcosahedronGeometry(2.4 * s, 1), this.mat(greens[(this.rng() * greens.length) | 0], { flatShading: true }), 0, h * 0.68, 0);
      crown.scale.y = 0.85 + this.rng() * 0.25;
      g.add(crown);
      if (this.sm.treeCanopies) this.sm.treeCanopies.push(crown);
      g.userData.height = h;
      return g;
    }

    prop_pino(el) {
      const h = num(el.alto, 7 + this.rng() * 5);
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.CylinderGeometry(0.18, 0.28, h * 0.3, 8), this.mat(0x4a3424), 0, h * 0.15, 0));
      const mat = this.mat(0x1f4a2a, { flatShading: true });
      for (let k = 0; k < 3; k++) {
        const r = (1.9 - k * 0.5) * h / 9;
        g.add(this.mesh(new THREE.ConeGeometry(r, h * 0.42, 8), mat, 0, h * (0.38 + k * 0.2), 0));
      }
      return g;
    }

    prop_palmera(el) {
      const h = num(el.alto, 7 + this.rng() * 3);
      const g = new THREE.Group();
      const trunk = this.mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 8), this.mat(0x7a6248), 0, h / 2, 0);
      trunk.rotation.z = 0.06; g.add(trunk);
      const leafMat = this.mat(0x3f7a2e, { side: THREE.DoubleSide, flatShading: true });
      for (let k = 0; k < 7; k++) {
        const leaf = this.mesh(new THREE.PlaneGeometry(0.7, 3.2), leafMat, 0, h, 0);
        leaf.geometry.translate(0, 1.6, 0);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = k / 7 * Math.PI * 2;
        leaf.rotation.x = 1.15;
        g.add(leaf);
      }
      return g;
    }

    prop_arbusto(el) {
      const s = num(el.alto, 1 + this.rng() * 0.6);
      const g = new THREE.Group();
      const b = this.mesh(new THREE.IcosahedronGeometry(0.9 * s, 1), this.mat(0x35612a, { flatShading: true }), 0, 0.6 * s, 0);
      b.scale.set(1.3, 0.8, 1.1); g.add(b);
      return g;
    }

    registerLamp(group, lx, ly, lz) {
      this.lamps.push({ group, lx, ly, lz });
    }

    prop_poste_luz(el) {
      const h = num(el.alto, 8.5);
      const g = new THREE.Group();
      const metal = this.mat(0x5a6068, { metalness: 0.6, roughness: 0.4 });
      g.add(this.mesh(new THREE.CylinderGeometry(0.09, 0.15, h, 10), metal, 0, h / 2, 0));
      const arm = this.mesh(new THREE.BoxGeometry(0.12, 0.12, 2.2), metal, 0, h - 0.1, -1.0);
      g.add(arm);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: this.lampsOn ? 2.5 : 0.0 });
      g.add(this.mesh(new THREE.BoxGeometry(0.4, 0.15, 0.9), headMat, 0, h - 0.2, -1.9, false));
      if (this.lampsOn) this.registerLamp(g, 0, h - 0.5, -1.9);
      return g;
    }

    prop_poste_electrico(el) {
      const h = num(el.alto, 9);
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.CylinderGeometry(0.13, 0.18, h, 8), this.mat(0x8a8a84), 0, h / 2, 0));
      g.add(this.mesh(new THREE.BoxGeometry(2.2, 0.14, 0.14), this.mat(0x5a4a38), 0, h - 0.6, 0));
      for (const sx of [-0.9, 0, 0.9]) g.add(this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), this.mat(0x6a8a9a), sx, h - 0.4, 0, false));
      g.add(this.mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 10), this.mat(0x6d7378), 0.3, h - 1.8, 0.25));
      return g;
    }

    prop_semaforo(el) {
      const g = new THREE.Group();
      const dark = this.mat(0x1c1c1c, { metalness: 0.4, roughness: 0.6 });
      g.add(this.mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.6, 10), dark, 0, 2.3, 0));
      g.add(this.mesh(new THREE.BoxGeometry(0.45, 1.2, 0.35), dark, 0, 4.8, 0));
      const estado = el.estado || 'rojo';
      const cols = [['rojo', 0xff2020], ['amarillo', 0xffb000], ['verde', 0x20ff60]];
      cols.forEach(([name, c], i) => {
        const on = name === estado;
        const m = new THREE.MeshStandardMaterial({ color: on ? c : 0x222222, emissive: c, emissiveIntensity: on ? 3 : 0.05 });
        g.add(this.mesh(new THREE.SphereGeometry(0.12, 12, 12), m, 0, 5.2 - i * 0.37, -0.19, false));
      });
      return g;
    }

    signBoard(geo, texture, backColor, height) {
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.CylinderGeometry(0.04, 0.05, height, 8), this.mat(0x8a8f94, { metalness: 0.5 }), 0, height / 2, 0));
      const face = this.mesh(geo, new THREE.MeshStandardMaterial({ map: texture, color: this.shade(0xffffff), emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: this.night ? 0.25 : 0 }), 0, height + 0.15, -0.04, false);
      face.rotation.y = Math.PI; g.add(face);
      const back = this.mesh(geo.clone(), this.mat(backColor), 0, height + 0.15, 0.0, false);
      g.add(back);
      return g;
    }

    prop_senal_pare() {
      const t = canvasTexture('senal-pare', 128, (c, s) => {
        c.fillStyle = '#c0141c'; c.fillRect(0, 0, s, s);
        c.fillStyle = '#fff'; c.font = 'bold 40px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('PARE', s / 2, s / 2);
      });
      const geo = new THREE.CircleGeometry(0.42, 8);
      geo.rotateZ(Math.PI / 8);
      return this.signBoard(geo, t, 0x777777, 2.2);
    }

    prop_senal_ceda() {
      const t = canvasTexture('senal-ceda', 128, (c, s) => {
        c.fillStyle = '#c0141c'; c.fillRect(0, 0, s, s);
        c.fillStyle = '#fff';
        c.beginPath(); c.moveTo(s * 0.22, s * 0.34); c.lineTo(s * 0.78, s * 0.34); c.lineTo(s * 0.5, s * 0.84); c.closePath(); c.fill();
      });
      const geo = new THREE.CircleGeometry(0.55, 3);
      geo.rotateZ(-Math.PI / 2);
      return this.signBoard(geo, t, 0x777777, 2.2);
    }

    prop_senal_velocidad(el) {
      const v = String(el.valor || 60);
      const t = canvasTexture('senal-vel-' + v, 128, (c, s) => {
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, s, s);
        c.lineWidth = 14; c.strokeStyle = '#c0141c'; c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#111'; c.font = 'bold 54px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(v, s / 2, s / 2 + 3);
      });
      return this.signBoard(new THREE.CircleGeometry(0.4, 24), t, 0x777777, 2.2);
    }

    prop_senal(el) {
      const label = (el.etiqueta || '').slice(0, 22);
      const t = label ? textTexture(label, { color: '#ffffff', bg: '#1557a0', font: 'bold 44px Arial', height: 96 }) : null;
      const w = t ? Math.min(3, 0.7 * t.aspect) : 1.0;
      const tex = t ? t.tex : canvasTexture('senal-azul', 64, (c, s) => { c.fillStyle = '#1557a0'; c.fillRect(0, 0, s, s); c.strokeStyle = '#fff'; c.lineWidth = 4; c.strokeRect(6, 6, s - 12, s - 12); });
      return this.signBoard(new THREE.PlaneGeometry(w, 0.7), tex, 0x777777, 2.3);
    }

    prop_poste_km() {
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.BoxGeometry(0.35, 0.9, 0.15), this.mat(0xeeeeee), 0, 0.45, 0));
      g.add(this.mesh(new THREE.BoxGeometry(0.36, 0.2, 0.16), this.mat(0x1e7a3c), 0, 0.8, 0));
      return g;
    }

    linear(el, height, build) {
      const len = num(el.largo, 10);
      const g = new THREE.Group();
      build(g, len, height);
      return g;
    }

    prop_muro(el) {
      const h = num(el.alto, 2.2), t = num(el.ancho, 0.3);
      return this.linear(el, h, (g, len) => {
        g.add(this.mesh(new THREE.BoxGeometry(t, h, len), this.mat(el.color ? 0x9a5a40 : 0x8e8a82, { roughness: 0.95 }), 0, h / 2, 0));
        g.add(this.mesh(new THREE.BoxGeometry(t + 0.08, 0.1, len), this.mat(0x6e6a64), 0, h + 0.05, 0));
      });
    }

    prop_valla(el) {
      const h = num(el.alto, 1.5);
      return this.linear(el, h, (g, len) => {
        const wood = this.mat(0x6b5038);
        const posts = Math.max(2, Math.round(len / 2.5) + 1);
        for (let k = 0; k < posts; k++) g.add(this.mesh(new THREE.BoxGeometry(0.12, h, 0.12), wood, 0, h / 2, -len / 2 + k * len / (posts - 1)));
        for (const ry of [h * 0.4, h * 0.85]) g.add(this.mesh(new THREE.BoxGeometry(0.05, 0.1, len), wood, 0, ry, 0));
      });
    }

    prop_guardarrail(el) {
      const h = num(el.alto, 0.75);
      return this.linear(el, h, (g, len) => {
        const steel = this.mat(0xb8bec4, { metalness: 0.8, roughness: 0.35, envMap: this.sm.envMap });
        const posts = Math.max(2, Math.round(len / 2) + 1);
        for (let k = 0; k < posts; k++) g.add(this.mesh(new THREE.BoxGeometry(0.12, h, 0.12), this.mat(0x777c80), 0, h / 2, -len / 2 + k * len / (posts - 1)));
        g.add(this.mesh(new THREE.BoxGeometry(0.06, 0.32, len), steel, -0.1, h - 0.15, 0));
      });
    }

    prop_barrera(el) {
      const h = num(el.alto, 0.85);
      return this.linear(el, h, (g, len) => {
        const conc = this.mat(0xb5b2aa, { roughness: 0.95 });
        g.add(this.mesh(new THREE.BoxGeometry(0.6, h * 0.35, len), conc, 0, h * 0.175, 0));
        g.add(this.mesh(new THREE.BoxGeometry(0.28, h * 0.65, len), conc, 0, h * 0.35 + h * 0.325, 0));
      });
    }

    prop_cono() {
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), this.mat(0x222222), 0, 0.02, 0));
      g.add(this.mesh(new THREE.ConeGeometry(0.16, 0.7, 12), this.mat(0xff5a00, { emissive: 0x401500, emissiveIntensity: 0.5 }), 0, 0.39, 0));
      g.add(this.mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.12, 12), this.mat(0xf2f2f2), 0, 0.45, 0, false));
      return g;
    }

    prop_barril() {
      const t = canvasTexture('barril', 64, (c, s) => { for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? '#f2f2f2' : '#ff5a00'; c.fillRect(0, k * s / 4, s, s / 4); } });
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.95, 16), new THREE.MeshStandardMaterial({ map: t, color: this.shade(0xffffff) }), 0, 0.48, 0));
      return g;
    }

    prop_parada_bus() {
      const g = new THREE.Group();
      const metal = this.mat(0x4a5560, { metalness: 0.5 });
      for (const sx of [-1.8, 1.8]) g.add(this.mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), metal, sx, 1.25, 0.6));
      g.add(this.mesh(new THREE.BoxGeometry(4.2, 0.1, 1.8), metal, 0, 2.55, 0.1));
      const glass = new THREE.MeshStandardMaterial({ color: 0x8fb4c8, transparent: true, opacity: 0.35, roughness: 0.1 });
      g.add(this.mesh(new THREE.BoxGeometry(3.6, 1.8, 0.05), glass, 0, 1.4, 0.7, false));
      g.add(this.mesh(new THREE.BoxGeometry(2.8, 0.08, 0.45), this.mat(0x7a6048), 0, 0.5, 0.4));
      return g;
    }

    prop_vehiculo_estacionado(el, heading) {
      const sm = this.sm;
      if (typeof sm._makeFillerVehicle !== 'function') return this.prop_generico(el);
      const model = PARKED_MODELS[(this.rng() * PARKED_MODELS.length) | 0];
      const col = el.color && this.opts.colorOf ? this.opts.colorOf(el.color, PARKED_COLORS[0]) : PARKED_COLORS[(this.rng() * PARKED_COLORS.length) | 0];
      const v = sm._makeFillerVehicle(model, col);
      v.position.y = v.userData.wheelBottomY !== undefined ? -v.userData.wheelBottomY : 0;
      // Los modelos de relleno tienen el frente en +X: se gira -90° para que miren a -Z.
      const g = new THREE.Group();
      v.rotation.y = Math.PI / 2;
      g.add(v);
      this.parkedCars.push({ x: el.x, y: el.y });
      return g;
    }

    /** Elemento pintado/colocado sobre la calzada más cercana, transversal a ella. */
    acrossRoad(el, build) {
      const near = this.nearestRoad(el.x, el.y, 6);
      const g = new THREE.Group();
      g.isRoadMarking = true;
      if (near) {
        const n = near.n;
        build(g, near.R.via.ancho, near.R.y);
        this.place(g, n.x, n.y, headingOf(n.tx, n.ty));
      } else {
        build(g, num(el.ancho, 8), this.maxRoadY);
        this.place(g, el.x, el.y, num(el.angulo, 0));
      }
      return g;
    }

    prop_paso_peatonal(el) {
      const near = this.nearestRoad(el.x, el.y, 6);
      if (near) {
        this.crosswalk(near.R, near.n.s, 3);
        const g = new THREE.Group(); g.isRoadMarking = true; return g;
      }
      return this.acrossRoad(el, (g, w, y) => {
        const mat = this.mat(0xf2f2ee, { polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 });
        const n = Math.max(3, Math.floor(w));
        for (let k = 0; k < n; k++) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3), mat);
          m.rotation.x = -Math.PI / 2; m.position.set(-w / 2 + (k + 0.5) * w / n, y + 0.014, 0); g.add(m);
        }
      });
    }

    prop_tope(el) {
      return this.acrossRoad(el, (g, w, y) => {
        const t = canvasTexture('tope', 64, (c, s) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#111' : '#f2c200'; c.fillRect(0, k * s / 8, s, s / 8); } });
        const tt = t.clone(); tt.needsUpdate = true; tt.__own = true; tt.repeat.set(1, w / 2);
        const geo = new THREE.CylinderGeometry(0.4, 0.4, w, 16);
        geo.rotateZ(Math.PI / 2); // eje transversal a la vía (X local)
        const m = this.mesh(geo, new THREE.MeshStandardMaterial({ map: tt, color: this.shade(0xffffff) }), 0, y, 0);
        m.scale.y = 0.25;
        g.add(m);
      });
    }

    decal(el, radius, material) {
      const g = new THREE.Group();
      g.isRoadMarking = true;
      const geo = new THREE.CircleGeometry(radius, 16);
      const pos = geo.attributes.position;
      for (let i = 1; i < pos.count; i++) {
        const k = 0.75 + this.rng() * 0.45;
        pos.setXY(i, pos.getX(i) * k, pos.getY(i) * k);
      }
      const m = new THREE.Mesh(geo, material);
      m.rotation.x = -Math.PI / 2;
      m.position.y = this.maxRoadY + 0.03;
      m.receiveShadow = true;
      g.add(m);
      this.place(g, el.x, el.y, this.rng() * 360);
      return g;
    }

    prop_bache(el) {
      return this.decal(el, num(el.ancho, 1.2) / 2 + 0.3, this.mat(0x141414, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 }));
    }

    prop_charco(el) {
      return this.decal(el, num(el.ancho, 2.5) / 2 + 0.5, new THREE.MeshStandardMaterial({
        color: this.shade(0x3a4a5a), roughness: 0.05, metalness: 0.6, envMap: this.sm.envMap, envMapIntensity: 1.5,
        polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12,
      }));
    }

    prop_mancha_aceite(el) {
      return this.decal(el, num(el.ancho, 1.8) / 2 + 0.3, new THREE.MeshStandardMaterial({
        color: 0x0a0a0c, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85,
        polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12,
      }));
    }

    prop_hidrante() {
      const g = new THREE.Group();
      const red = this.mat(0xc0201c, { roughness: 0.5 });
      g.add(this.mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.75, 12), red, 0, 0.38, 0));
      g.add(this.mesh(new THREE.SphereGeometry(0.15, 12, 8), red, 0, 0.78, 0));
      const nozzle = this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), red, 0, 0.55, 0);
      nozzle.rotation.z = Math.PI / 2;
      g.add(nozzle);
      return g;
    }

    prop_banca() {
      const g = new THREE.Group();
      const wood = this.mat(0x7a5a3a), metal = this.mat(0x333333);
      g.add(this.mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), wood, 0, 0.45, 0));
      g.add(this.mesh(new THREE.BoxGeometry(1.8, 0.4, 0.05), wood, 0, 0.75, 0.22));
      for (const sx of [-0.8, 0.8]) g.add(this.mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), metal, sx, 0.22, 0));
      return g;
    }

    prop_contenedor() {
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.BoxGeometry(2, 1.3, 1.2), this.mat(0x2d6a3e, { metalness: 0.4 }), 0, 0.75, 0));
      g.add(this.mesh(new THREE.BoxGeometry(2.05, 0.08, 1.25), this.mat(0x1f4a2b), 0, 1.44, 0));
      return g;
    }

    prop_roca(el) {
      const s = num(el.ancho, 1.2 + this.rng() * 1.4);
      const g = new THREE.Group();
      const r = this.mesh(new THREE.DodecahedronGeometry(s / 2, 0), this.mat(0x6e6a64, { flatShading: true }), 0, s * 0.3, 0);
      r.scale.set(1, 0.7 + this.rng() * 0.3, 0.8 + this.rng() * 0.4);
      r.rotation.set(this.rng() * 3, this.rng() * 3, this.rng() * 3);
      g.add(r);
      return g;
    }

    prop_generico(el) {
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 10), this.mat(0xd4a017, { emissive: 0x332200, emissiveIntensity: 0.4 }), 0, 0.55, 0));
      const label = el.etiqueta || el.tipo;
      if (label) {
        const t = textTexture(String(label).slice(0, 24), { color: '#ffe9a8', stroke: '#000000', font: 'bold 52px Arial' });
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthWrite: false }));
        sp.scale.set(0.8 * t.aspect, 0.8, 1);
        sp.position.y = 1.9;
        g.add(sp);
      }
      return g;
    }

    // ── Decoración automática según la zona ──
    decorate() {
      const zona = this.esc.zona;
      const aiCount = (this.esc.elementos || []).length;
      if (aiCount >= 30) return; // La IA ya describió el entorno con detalle.
      const rng = this.rng;
      let budget = 160;

      const profiles = {
        urbana: { side: ['edificio'], gap: [15, 24], setback: 3, lamp: 28, tree: 0.25, depth: 14 },
        residencial: { side: ['casa', 'casa', 'casa', 'tienda'], gap: [11, 16], setback: 4, lamp: 34, tree: 0.45, depth: 9 },
        suburbana: { side: ['casa', 'tienda', 'casa'], gap: [13, 20], setback: 5, lamp: 40, tree: 0.5, depth: 9 },
        industrial: { side: ['bodega'], gap: [34, 42], setback: 8, lamp: 40, tree: 0.1, depth: 20 },
        estacionamiento: { side: ['tienda'], gap: [30, 40], setback: 10, lamp: 25, tree: 0.3, depth: 9 },
        rural: { side: ['arbol', 'arbol', 'pino', 'arbusto', 'casa'], gap: [7, 16], setback: 4, lamp: 0, pole: 45, tree: 1, depth: 3 },
        montana: { side: ['pino', 'pino', 'roca', 'arbol', 'arbusto'], gap: [6, 12], setback: 3, lamp: 0, tree: 1, depth: 3 },
        autopista: { side: ['arbol', 'arbusto', 'pino'], gap: [18, 30], setback: 10, lamp: 45, tree: 1, depth: 3 },
      };
      const P = profiles[zona] || profiles.urbana;

      for (const R of this.roads) {
        if (budget <= 0) break;
        const v = R.via;
        const edge = R.half + (R.sidewalk || 0) + (R.shoulder || 0);

        // Postes de luz / postes eléctricos a lo largo de la vía.
        const lampGap = P.lamp || P.pole || 0;
        if (lampGap && !R.closed) {
          let k = 0;
          for (let s = lampGap / 2; s < R.length && budget > 0; s += lampGap, k++) {
            const side = (k % 2 === 0) ? -1 : 1;
            const p = sampleAt(R, s);
            const off = side * (R.half + (R.sidewalk ? 0.6 : (R.shoulder || 0) + 1.2));
            const x = p.x + p.nx * off, y = p.y + p.ny * off;
            if (this.insideOtherRoad(R, x, y, 1.2) || this.distToTraj(x, y) < 2 || !this.isFree(x, y, 0.6)) continue;
            const tipo = P.lamp ? 'poste_luz' : 'poste_electrico';
            this.placeElement({ tipo, x, y, angulo: headingOf(-p.nx * side, -p.ny * side) }, true);
            budget--;
          }
        }

        // Guardarraíles en autopistas y montaña (en los tramos rectos alejados de cruces).
        if ((zona === 'autopista' || zona === 'montana') && !R.closed && R.length > 20) {
          for (const side of zona === 'montana' ? [this.rng() < 0.5 ? -1 : 1] : [-1, 1]) {
            const off = side * (R.half + (R.shoulder || 0) + 0.6);
            const step = 12;
            for (let s = 4; s + step < R.length; s += step) {
              const a = sampleAt(R, s), b = sampleAt(R, s + step);
              const ax = a.x + a.nx * off, ay = a.y + a.ny * off, bx = b.x + b.nx * off, by = b.y + b.ny * off;
              const mx = (ax + bx) / 2, my = (ay + by) / 2;
              if (this.insideOtherRoad(R, mx, my, 3) || this.distToTraj(mx, my) < 1.5) continue;
              this.placeElement({ tipo: 'guardarrail', x: mx, y: my, angulo: headingOf(bx - ax, by - ay), largo: Math.hypot(bx - ax, by - ay) }, true);
            }
          }
        }

        // Edificaciones / vegetación a ambos lados.
        if (R.closed && zona !== 'rural' && zona !== 'montana') continue;
        for (const side of [-1, 1]) {
          let s = rng() * P.gap[0];
          while (s < R.length && budget > 0) {
            const gap = P.gap[0] + rng() * (P.gap[1] - P.gap[0]);
            let tipo = P.side[(rng() * P.side.length) | 0];
            const isBuilding = tipo === 'edificio' || tipo === 'casa' || tipo === 'tienda' || tipo === 'bodega';
            const depth = tipo === 'edificio' || tipo === 'bodega' ? P.depth : (isBuilding ? 9 : 3);
            const extra = (zona === 'rural' || zona === 'montana' || zona === 'autopista') ? rng() * 18 : 0;
            const off = side * (edge + P.setback + depth / 2 + extra);
            const p = sampleAt(R, s);
            const x = p.x + p.nx * off, y = p.y + p.ny * off;
            const facing = headingOf(-p.nx * side, -p.ny * side);
            const width = isBuilding ? Math.min(gap - 2, tipo === 'bodega' ? 32 : 9 + rng() * 10) : 2;
            const r = isBuilding ? Math.max(width, depth) / 2 : (FOOTPRINT[tipo] || 1.5);
            if (this.canDecorate(x, y, r, isBuilding ? 1.5 : 0.8)) {
              const el = { tipo, x, y, angulo: facing };
              if (tipo === 'edificio') { el.ancho = width; el.largo = depth; }
              if (tipo === 'bodega') { el.tipo = 'edificio'; el.estilo = 'industrial'; el.ancho = width; el.largo = depth; }
              if (tipo === 'casa') { el.ancho = Math.min(width, 9); el.largo = depth; }
              this.placeElement(el, true);
              budget--;
              // Árbol en la acera entre edificaciones.
              if (P.tree < 1 && rng() < P.tree && R.sidewalk) {
                const q = sampleAt(R, s + gap / 2);
                const toff = side * (R.half + R.sidewalk - 0.8);
                const tx = q.x + q.nx * toff, ty = q.y + q.ny * toff;
                if (!this.insideOtherRoad(R, tx, ty, 1.5) && this.distToTraj(tx, ty) > 2.5 && this.isFree(tx, ty, 1.2)) {
                  this.placeElement({ tipo: 'arbol', x: tx, y: ty, angulo: 0, alto: 5 + rng() * 2 }, true);
                  budget--;
                }
              }
            }
            s += gap;
          }
        }
      }
    }

    // Nombres de las vías pintados junto a la calzada (estilo croquis forense).
    buildRoadLabels() {
      for (const R of this.roads) {
        const name = R.via.nombre;
        if (!name || R.length < 25) continue;
        // Buscar un tramo lejos de cruces y de las trayectorias.
        let best = null;
        for (let f = 0.2; f <= 0.8; f += 0.1) {
          const s = R.length * f;
          if (this.centerSkipped(R, s)) continue;
          const p = sampleAt(R, s);
          const score = this.distToTraj(p.x, p.y) - Math.abs(f - 0.35) * 20;
          if (!best || score > best.score) best = { p, score };
        }
        if (!best) continue;
        const p = best.p;
        const t = textTexture(name, { color: R.via.auto ? '#ffcf7a' : '#bdeeff', stroke: 'rgba(0,0,0,0.85)', font: 'bold 56px Outfit, Arial, sans-serif' });
        const h = clamp(R.via.ancho * 0.22, 1.4, 3);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(h * t.aspect, h), new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, fog: false }));
        const off = R.half + (R.sidewalk || 0) + (R.shoulder || 0) + h * 0.7;
        const x = p.x - p.nx * off, y = p.y - p.ny * off;
        let ang = Math.atan2(p.ty, p.tx);
        if (p.tx < -0.01) ang += Math.PI;
        m.rotation.order = 'YXZ';
        m.rotation.y = ang;
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.35, -y);
        m.renderOrder = 2;
        this.add(m);
      }
    }

    /** Solo las luminarias más cercanas al impacto emiten luz real (presupuesto de GPU). */
    finalizeLamps() {
      if (!this.lampsOn) return;
      const fx = this.focus.impact.x, fy = this.focus.impact.y;
      const withPos = this.lamps.map(L => {
        const wp = new THREE.Vector3(L.lx, L.ly, L.lz);
        L.group.updateMatrixWorld(true);
        L.group.localToWorld(wp);
        return { L, wp, d: Math.hypot(wp.x - fx, -wp.z - fy) };
      }).sort((a, b) => a.d - b.d);
      const glowTex = canvasTexture('lamp-glow', 64, (c, s) => {
        const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,245,220,0.9)'); g.addColorStop(0.25, 'rgba(255,230,180,0.35)'); g.addColorStop(1, 'rgba(255,220,160,0)');
        c.fillStyle = g; c.fillRect(0, 0, s, s);
      });
      withPos.forEach((item, idx) => {
        const { L } = item;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: this.night ? 0.7 : 0.4 }));
        glow.position.set(L.lx, L.ly, L.lz); glow.scale.set(5, 5, 1);
        L.group.add(glow);
        if (idx < 10) {
          const light = new THREE.PointLight(0xffe2b0, this.night ? 2.2 : 1.2, 32, 1.8);
          light.position.set(L.lx, L.ly - 0.3, L.lz);
          L.group.add(light);
        }
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Tráfico ambiente (autos detenidos en sus carriles)
  // ──────────────────────────────────────────────────────────────
  function placeAmbientTraffic(sm, layout) {
    if (!layout || typeof sm._makeFillerVehicle !== 'function') return;
    const B = layout.builder;
    const density = { ninguno: 0, bajo: 1.2, medio: 2.5, alto: 4.5 }[layout.trafico] || 0;
    if (!density) return;
    const rng = makeRng(hashString('trafico|' + layout.roads.length + '|' + B.frames.length));
    const placed = [];
    let total = 0;
    for (const R of layout.roads) {
      if (!R.paved && R.via.superficie !== 'tierra') continue;
      const v = R.via;
      const want = Math.round(R.length / 100 * density);
      let ok = 0;
      for (let tries = 0; tries < want * 6 && ok < want && total < 26; tries++) {
        const s = rng() * R.length;
        const p = sampleAt(R, s);
        let off, forward;
        if (v.sentido === 'doble') {
          const per = Math.max(1, Math.floor(v.carriles / 2));
          const lw = R.half / per;
          const k = (rng() * per) | 0;
          forward = rng() < 0.5;
          off = (forward ? -1 : 1) * (k + 0.5) * lw;   // derecha del sentido de marcha
        } else {
          const lw = v.ancho / v.carriles;
          off = -R.half + (((rng() * v.carriles) | 0) + 0.5) * lw;
          forward = true;
        }
        const x = p.x + p.nx * off, y = p.y + p.ny * off;
        if (B.insideOtherRoad(R, x, y, 4)) continue;
        if (B.distToTraj(x, y) < 7) continue;
        if (placed.some(q => Math.hypot(q.x - x, q.y - y) < 9)) continue;
        if (B.parkedCars.some(q => Math.hypot(q.x - x, q.y - y) < 6)) continue;
        if (!B.isFree(x, y, 1.5)) continue;
        const heading = forward ? headingOf(p.tx, p.ty) : headingOf(-p.tx, -p.ty);
        const model = PARKED_MODELS[(rng() * PARKED_MODELS.length) | 0];
        const veh = sm._makeFillerVehicle(model, PARKED_COLORS[(rng() * PARKED_COLORS.length) | 0]);
        const vy = veh.userData.wheelBottomY !== undefined ? -veh.userData.wheelBottomY : 0;
        veh.position.set(x, vy + R.y, -y);
        // Frente del modelo de relleno en +X local.
        veh.rotation.y = Math.PI / 2 - heading * DEG;
        sm.scene.add(veh);
        sm.fillerVehicles.push(veh);
        placed.push({ x, y });
        ok++; total++;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  API
  // ──────────────────────────────────────────────────────────────
  function build(sm, escenario, frames, opts) {
    const builder = new MapBuilder(sm, escenario || {}, frames || [], opts);
    const layout = builder.build();
    sm.scene.add(layout.group);
    return layout;
  }

  function disposeObject(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(m => {
        ['map', 'emissiveMap'].forEach(k => { if (m[k] && m[k].__own) m[k].dispose(); });
        m.dispose();
      });
    });
  }

  global.ForensMap = { computeFocus, build, placeAmbientTraffic, applyAtmosphere, disposeObject, stopWeather };
})(window);
