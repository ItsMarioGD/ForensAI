/*
 * ForensIA 3D — React + Three.js Application
 * ============================================
 * Arquitectura:
 *   - App               : layout principal + estado global
 *   - Sidebar           : config Ollama + relato + botones
 *   - Viewer3D          : canvas Three.js con simulacion animada
 *   - PlaybackControls  : reproducir/pausar/slider/velocidad
 *   - DictamenPanel     : resultado de la IA
 *   - DataPanel         : grid con valores numericos del frame actual
 *   - RawDataExpander   : JSON crudo colapsable
 */

// ──────────────────────────────────────────────────────────────
//  Constantes
// ──────────────────────────────────────────────────────────────
const RECOMMENDED_MODELS = [
  'llama3.1:8b', 'llama3.1:70b', 'qwen2.5:14b', 'qwen2.5:7b',
  'mistral:7b', 'gemma2:9b', 'phi3:14b', 'llama3.2:3b'
];
const DEFAULT_MODEL = 'llama3.1:8b';
const DEFAULT_RELATO = `Eran las 19:30 en una intersección con semáforo en el cruce de Av. Libertador y Calle 5. El Vehículo 1 (sedán rojo) circulaba de sur a norte por Av. Libertador a unos 70 km/h. El Vehículo 2 (camioneta negra) circulaba de oeste a este por Calle 5 a unos 50 km/h. El Vehículo 1 ignoró el semáforo en rojo e impactó de lleno el lateral derecho del Vehículo 2. Tras el impacto, el Vehículo 2 fue empujado hacia el noreste unos 6 metros y el Vehículo 1 quedó detenido en la intersección con daños frontales severos.`;

const SYSTEM_PROMPT = `Eres el Núcleo de Inferencia Cinemática y Reconstrucción Forense (NIC-RF).
Tu función es procesar relatos de accidentes viales y transformarlos en un
gemelo digital paramétrico estructurado en JSON.

Debes calcular un plano (X, Y) donde el punto de impacto inicial sea (0,0).
Deduce vectores, velocidades aproximadas, trayectorias antes y después del
impacto basándote en las leyes de la física de Newton y la conservación del movimiento.

REGLAS DE ORO:
1. El impacto ocurre SIEMPRE en (0,0) en el frame del segundo crítico.
2. Antes del impacto, los vehículos se aproximan desde sus posiciones
   pre-impacto (valores coherentes con su vector de aproximación).
3. Después del impacto, las posiciones reflejan la dispersión de energía
   y la fricción hasta el reposo final.
4. El campo "angulo" representa la orientación del vehículo en grados
   (0 = norte, 90 = este, 180 = sur, 270 = oeste).
5. Mínimo 3 frames en la animación: pre-impacto, impacto, reposo.
6. Si el relato es ambiguo, infiere el peor escenario plausible y
   menciónalo en el dictamen técnico.

IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido, sin texto
adicional, sin bloques de código markdown, sin explicaciones fuera del JSON.

El JSON debe tener EXACTAMENTE esta estructura:

{
  "infraestructura": "interseccion_cruciforme | recta | curva | rotonda",
  "dictamen_tecnico": "Explicación forense sintetizada de cómo ocurrió el hecho.",
  "animacion_actores": [
    {
      "segundo": 0.0,
      "v1_x": -20.0, "v1_y": 0.0, "v1_angulo": 90,
      "v2_x": 0.0, "v2_y": -20.0, "v2_angulo": 0
    },
    {
      "segundo": 1.0,
      "v1_x": 0.0, "v1_y": 0.0, "v1_angulo": 90,
      "v2_x": 0.0, "v2_y": 0.0, "v2_angulo": 0
    },
    {
      "segundo": 2.5,
      "v1_x": 5.0, "v1_y": -2.0, "v1_angulo": 45,
      "v2_x": 2.0, "v2_y": 8.0, "v2_angulo": 15
    }
  ]
}`;

// ──────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function lerpAngle(a, b, t) {
  let diff = ((b - a) % 360 + 360) % 360;
  if (diff > 180) diff -= 360;
  return a + diff * t;
}

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

function getPhase(frames, tCurrent) {
  if (!frames || frames.length < 2) return 'pre';
  const tImpact = frames[Math.floor(frames.length / 2)].segundo;
  if (tCurrent < tImpact - 0.05) return 'pre';
  if (tCurrent <= tImpact + 0.05) return 'impact';
  return 'post';
}

function interpolateFrame(frames, tCurrent) {
  if (!frames || frames.length === 0) return null;
  if (tCurrent <= frames[0].segundo) return { ...frames[0] };
  if (tCurrent >= frames[frames.length - 1].segundo) return { ...frames[frames.length - 1] };

  for (let i = 0; i < frames.length - 1; i++) {
    const f0 = frames[i];
    const f1 = frames[i + 1];
    if (tCurrent >= f0.segundo && tCurrent <= f1.segundo) {
      const alpha = (f1.segundo - f0.segundo < 0.001)
        ? 1
        : (tCurrent - f0.segundo) / (f1.segundo - f0.segundo);
      return {
        segundo: tCurrent,
        v1_x: lerp(f0.v1_x, f1.v1_x, alpha),
        v1_y: lerp(f0.v1_y, f1.v1_y, alpha),
        v1_angulo: lerpAngle(f0.v1_angulo, f1.v1_angulo, alpha),
        v2_x: lerp(f0.v2_x, f1.v2_x, alpha),
        v2_y: lerp(f0.v2_y, f1.v2_y, alpha),
        v2_angulo: lerpAngle(f0.v2_angulo, f1.v2_angulo, alpha),
      };
    }
  }
  return { ...frames[frames.length - 1] };
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020609);
    this.scene.fog = new THREE.Fog(0x020609, 120, 300);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    this.camera.position.set(30, 50, 60);
    this.camera.lookAt(0, 0, 0);

    // Orbit Controls
    this.controls = new window.SimpleOrbitControls(this.camera, canvas);
    this.cameraMode = 'free';

    this._buildLights();
    this._buildGrid();

    this.v1Mesh = null;
    this.v2Mesh = null;
    this.impactMarker = null;
    this.roadMeshes = [];
    this.trajLine1 = null;
    this.trajLine2 = null;
    this.particles = [];
    this.particleTime = 0;

    this.animFrameId = null;
    this._render();
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0x0a1628, 2.5);
    this.scene.add(ambient);

    const moonLight = new THREE.DirectionalLight(0x4488cc, 1.8);
    moonLight.position.set(-30, 60, 20);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.camera.near = 0.5;
    moonLight.shadow.camera.far = 200;
    moonLight.shadow.camera.left = -80;
    moonLight.shadow.camera.right = 80;
    moonLight.shadow.camera.top = 80;
    moonLight.shadow.camera.bottom = -80;
    this.scene.add(moonLight);

    const fillLight = new THREE.PointLight(0x223355, 0.8, 150);
    fillLight.position.set(20, 30, -20);
    this.scene.add(fillLight);

    // Impact point light (initially off)
    this.impactLight = new THREE.PointLight(0xff3333, 0, 25, 2);
    this.impactLight.position.set(0, 2, 0);
    this.scene.add(this.impactLight);
  }

  _buildGrid() {
    const gridHelper = new THREE.GridHelper(200, 40, 0x112244, 0x0a1830);
    this.scene.add(gridHelper);
  }

  buildRoad(infraestructura) {
    // Clear old road meshes
    this.roadMeshes.forEach(m => this.scene.remove(m));
    this.roadMeshes = [];

    const asphalt = new THREE.MeshStandardMaterial({
      color: 0x151a28, roughness: 0.95, metalness: 0.1
    });
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeaa, roughness: 0.7, emissive: 0x333300, emissiveIntensity: 0.5
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc, roughness: 0.8, emissive: 0x111111
    });
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x2a3245, roughness: 0.9, metalness: 0.1
    });
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x0f1524, roughness: 0.8, metalness: 0.4
    });

    const addBox = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      mesh.castShadow = (mat === buildingMat);
      this.scene.add(mesh);
      this.roadMeshes.push(mesh);
    };

    // Ground Base
    addBox(400, 0.05, 400, 0, -0.1, 0, new THREE.MeshStandardMaterial({color: 0x050810, roughness: 1}));

    const addDashedCenterLine = (axis, length, y = 0.06) => {
      const dashLen = 4, gap = 4, total = length;
      let pos = -total / 2;
      while (pos < total / 2) {
        const end = Math.min(pos + dashLen, total / 2);
        const cx = axis === 'x' ? (pos + end) / 2 : 0;
        const cz = axis === 'z' ? (pos + end) / 2 : 0;
        const len = end - pos;
        const w = axis === 'x' ? len : 0.35;
        const d = axis === 'z' ? len : 0.35;
        addBox(w, 0.02, d, cx, y, cz, lineMat);
        pos += dashLen + gap;
      }
    };

    // Street Lamps generator
    const addLamp = (x, z, angle) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = angle;
      
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 12, 8), buildingMat);
      pole.position.y = 6;
      pole.castShadow = true;
      group.add(pole);

      const head = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 0.6), buildingMat);
      head.position.set(1.0, 12, 0); 
      group.add(head);

      const bulb = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.4), new THREE.MeshBasicMaterial({color: 0xffffff}));
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(1.0, 11.84, 0);
      group.add(bulb);

      const light = new THREE.SpotLight(0xffffee, 1.2, 80, Math.PI/4, 0.5, 1);
      light.position.set(1.0, 11.5, 0);
      light.target.position.set(6.0, 0, 0); // pointing outwards into the road
      light.castShadow = true;
      light.shadow.bias = -0.001;
      group.add(light);
      group.add(light.target);

      this.scene.add(group);
      this.roadMeshes.push(group);
    };

    if (infraestructura === 'interseccion_cruciforme' || infraestructura === 'interseccion') {
      addBox(140, 0.1, 16, 0, 0, 0, asphalt);   // EW
      addBox(16, 0.1, 140, 0, 0, 0, asphalt);    // NS
      
      // Sidewalks
      addBox(62, 0.2, 62, -39, 0, -39, sidewalkMat); // NW
      addBox(62, 0.2, 62, 39, 0, -39, sidewalkMat);  // NE
      addBox(62, 0.2, 62, -39, 0, 39, sidewalkMat);  // SW
      addBox(62, 0.2, 62, 39, 0, 39, sidewalkMat);   // SE

      // Decorative Buildings (blocks)
      addBox(40, 30, 40, -40, 15, -40, buildingMat);
      addBox(30, 45, 50, 45, 22.5, -45, buildingMat);
      addBox(50, 20, 35, -45, 10, 45, buildingMat);
      addBox(35, 60, 35, 45, 30, 45, buildingMat);

      // Lamps at corners
      addLamp(-12, -12, Math.PI/4);
      addLamp(12, -12, 3*Math.PI/4);
      addLamp(-12, 12, -Math.PI/4);
      addLamp(12, 12, -3*Math.PI/4);

      // Edge lines
      for (const z of [-8, 8]) addBox(140, 0.05, 0.3, 0, 0.06, z, edgeMat);
      for (const x of [-8, 8]) addBox(0.3, 0.05, 140, x, 0.06, 0, edgeMat);
      // Center dashes
      addDashedCenterLine('x', 140);
      addDashedCenterLine('z', 140);

    } else if (infraestructura === 'recta') {
      addBox(180, 0.1, 16, 0, 0, 0, asphalt);
      addBox(180, 0.2, 30, 0, 0, -23, sidewalkMat);
      addBox(180, 0.2, 30, 0, 0, 23, sidewalkMat);
      for (const z of [-8, 8]) addBox(180, 0.05, 0.3, 0, 0.06, z, edgeMat);
      addDashedCenterLine('x', 180);
      
      // Buildings & Lamps
      for(let bx = -70; bx <= 70; bx+= 45) {
        addBox(35, 20 + Math.random()*30, 25, bx, 10, -25, buildingMat);
        addBox(35, 20 + Math.random()*30, 25, bx, 10, 25, buildingMat);
        addLamp(bx, -10, Math.PI/2);
        addLamp(bx, 10, -Math.PI/2);
      }

    } else if (infraestructura === 'rotonda') {
      const rInner = 12, rOuter = 24;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
      const ring = new THREE.Mesh(geo, asphalt);
      ring.rotation.x = -Math.PI / 2;
      ring.receiveShadow = true;
      this.scene.add(ring);
      this.roadMeshes.push(ring);
      
      // Center island
      addBox(24, 0.2, 24, 0, 0.05, 0, sidewalkMat);
      
      for (const angle of [0, 90, 180, 270]) {
        const rad = angle * Math.PI / 180;
        const cx = Math.cos(rad) * 42;
        const cz = Math.sin(rad) * 42;
        const isHoriz = angle === 0 || angle === 180;
        addBox(isHoriz ? 40 : 16, 0.1, isHoriz ? 16 : 40, cx, 0, cz, asphalt);
      }
    } else { // curva
      addBox(80, 0.1, 16, -25, 0, 0, asphalt);
      addBox(16, 0.1, 80, 25, 0, 25, asphalt);
      const curveGeo = new THREE.CylinderGeometry(33, 33, 0.1, 32, 1, false, 0, Math.PI / 2);
      const curve = new THREE.Mesh(curveGeo, asphalt);
      curve.position.set(25, 0, -33);
      this.scene.add(curve);
      this.roadMeshes.push(curve);
    }
  }

  _makeVehicle(colorHex, emissiveHex) {
    const group = new THREE.Group();

    // --- Materials ---
    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.2, metalness: 0.7, clearcoat: 1.0 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.85 });
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.1 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.1, metalness: 0.95 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 });

    // --- Chassis (Side Profile on XY, extruded to Z) ---
    const chShape = new THREE.Shape();
    chShape.moveTo(-2.8, 0.4);
    chShape.lineTo(-2.8, 1.0);
    chShape.quadraticCurveTo(-2.8, 1.2, -2.6, 1.2);
    chShape.lineTo(2.7, 1.2);
    chShape.quadraticCurveTo(3.0, 1.2, 3.0, 0.9);
    chShape.lineTo(3.0, 0.4);
    chShape.lineTo(-2.8, 0.4);
    
    const chExtrude = { depth: 3.0, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 0.15, bevelThickness: 0.15 };
    const chassisGeo = new THREE.ExtrudeGeometry(chShape, chExtrude);
    chassisGeo.center();
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.rotation.y = -Math.PI / 2;
    chassis.position.y = 0.8;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // --- Cabin (Glass Greenhouse) ---
    const cabShape = new THREE.Shape();
    cabShape.moveTo(-1.2, 1.2);
    cabShape.lineTo(-0.6, 2.1);
    cabShape.lineTo(0.5, 2.1);
    cabShape.lineTo(1.4, 1.2);
    cabShape.lineTo(-1.2, 1.2);

    const cabExtrude = { depth: 2.6, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 0.1, bevelThickness: 0.1 };
    const cabinGeo = new THREE.ExtrudeGeometry(cabShape, cabExtrude);
    cabinGeo.center();
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.rotation.y = -Math.PI / 2;
    cabin.position.set(0, 1.65, 0);
    cabin.castShadow = true;
    group.add(cabin);
    
    // Roof solid panel
    const roofGeo = new THREE.BoxGeometry(2.6, 0.05, 1.2);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 2.125, -0.05);
    roof.castShadow = true;
    group.add(roof);

    // --- Wheels ---
    const tireGeo = new THREE.TorusGeometry(0.35, 0.16, 16, 32);
    const rimGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 16);
    
    const wheelPositions = [
      [-1.6, 0.5, 1.8], [1.6, 0.5, 1.8], 
      [-1.6, 0.5, -1.8], [1.6, 0.5, -1.8]
    ];
    wheelPositions.forEach(([wx, wy, wz]) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, wy, wz);
      wGroup.rotation.y = Math.PI / 2;
      
      const tire = new THREE.Mesh(tireGeo, rubberMat);
      tire.castShadow = true;
      wGroup.add(tire);
      
      const rim = new THREE.Mesh(rimGeo, chromeMat);
      rim.rotation.x = Math.PI / 2;
      wGroup.add(rim);

      group.add(wGroup);
    });

    // --- Front Grille ---
    const grilleGeo = new THREE.BoxGeometry(2.0, 0.4, 0.1);
    const grille = new THREE.Mesh(grilleGeo, darkMat);
    grille.position.set(0, 0.8, 2.95);
    group.add(grille);

    // --- Headlights & Spotlights ---
    const hlGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 3 });
    [-0.8, 0.8].forEach(hx => {
      const hl = new THREE.Mesh(hlGeo, hlMat);
      hl.scale.z = 0.3;
      hl.position.set(hx, 0.9, 2.9);
      group.add(hl);
      
      const spot = new THREE.SpotLight(0xffffee, 3.0, 60, Math.PI/5, 0.5, 1);
      spot.position.set(hx, 0.9, 3.0);
      spot.target.position.set(hx, 0.9, 15);
      spot.castShadow = true;
      spot.shadow.mapSize.width = 1024;
      spot.shadow.mapSize.height = 1024;
      group.add(spot);
      group.add(spot.target);
    });

    // --- Tail lights ---
    const tlGeo = new THREE.BoxGeometry(0.5, 0.15, 0.1);
    const tlMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
    [-0.9, 0.9].forEach(hx => {
      const tl = new THREE.Mesh(tlGeo, tlMat);
      tl.position.set(hx, 0.95, -2.95);
      group.add(tl);
    });
    
    // --- Cyberpunk Underglow ---
    const neonGeo = new THREE.BoxGeometry(2.8, 0.05, 5.0);
    const neonMat = new THREE.MeshStandardMaterial({ color: emissiveHex, emissive: emissiveHex, emissiveIntensity: 1.5, transparent: true, opacity: 0.6 });
    const neon = new THREE.Mesh(neonGeo, neonMat);
    neon.position.set(0, 0.15, 0);
    group.add(neon);
    
    const underGlow = new THREE.PointLight(emissiveHex, 2.0, 8);
    underGlow.position.set(0, 0.2, 0);
    group.add(underGlow);

    return group;
  }

  buildVehicles() {
    if (this.v1Mesh) this.scene.remove(this.v1Mesh);
    if (this.v2Mesh) this.scene.remove(this.v2Mesh);

    this.v1Mesh = this._makeVehicle(0xcc1111, 0xff2222);
    this.scene.add(this.v1Mesh);

    this.v2Mesh = this._makeVehicle(0x1144aa, 0x2266ff);
    this.scene.add(this.v2Mesh);
  }

  buildImpactMarker() {
    if (this.impactMarker) this.scene.remove(this.impactMarker);
    const geo = new THREE.RingGeometry(0.8, 1.5, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff1111, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    this.impactMarker = new THREE.Mesh(geo, mat);
    this.impactMarker.rotation.x = -Math.PI / 2;
    this.impactMarker.position.y = 0.12;
    this.scene.add(this.impactMarker);
  }

  buildTrajectories(frames) {
    if (this.trajLine1) this.scene.remove(this.trajLine1);
    if (this.trajLine2) this.scene.remove(this.trajLine2);

    const makeLineMesh = (points, color) => {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45, linewidth: 1 });
      return new THREE.Line(geo, mat);
    };

    const pts1 = frames.map(f => new THREE.Vector3(f.v1_x, 1.5, -f.v1_y));
    const pts2 = frames.map(f => new THREE.Vector3(f.v2_x, 1.5, -f.v2_y));

    this.trajLine1 = makeLineMesh(pts1, 0xff3333);
    this.trajLine2 = makeLineMesh(pts2, 0x3366ff);
    this.scene.add(this.trajLine1);
    this.scene.add(this.trajLine2);
  }

  // ── Particle system for collision ──
  spawnImpactParticles() {
    for (let i = 0; i < 60; i++) {
      const geo = new THREE.SphereGeometry(Math.random() * 0.15 + 0.05, 4, 4);
      const hot = Math.random() > 0.5;
      const mat = new THREE.MeshBasicMaterial({ color: hot ? 0xff8800 : 0xffff00 });
      const p = new THREE.Mesh(geo, mat);
      p.position.set(
        (Math.random() - 0.5) * 2,
        Math.random() * 3,
        (Math.random() - 0.5) * 2
      );
      p.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        Math.random() * 0.35 + 0.1,
        (Math.random() - 0.5) * 0.5
      );
      p.userData.life = 1.0;
      this.scene.add(p);
      this.particles.push(p);
    }
    this.impactLight.intensity = 8;
    this.particleTime = 60;
  }

  updateParticles() {
    if (this.particles.length === 0) return;
    this.particles.forEach(p => {
      p.userData.life -= 0.025;
      p.position.addScaledVector(p.userData.vel, 1);
      p.userData.vel.y -= 0.015;
      p.material.opacity = p.userData.life;
      p.material.transparent = true;
      p.scale.setScalar(p.userData.life);
    });
    this.particles = this.particles.filter(p => p.userData.life > 0.01);
    this.impactLight.intensity *= 0.93;
  }

  // ── Update vehicle positions ──
  updateVehicles(frame, phase) {
    if (!this.v1Mesh || !this.v2Mesh || !frame) return;

    // V1: X stays, Y maps to Z (Three.js uses Z for depth)
    this.v1Mesh.position.set(frame.v1_x, 1.0, -frame.v1_y);
    // Angle: 0=north(+Z), 90=east(+X). In Three.js: rotation.y
    // Our convention: 0=north, 90=east → rotate by -(angle in rad)
    this.v1Mesh.rotation.y = -(frame.v1_angulo * Math.PI / 180);

    this.v2Mesh.position.set(frame.v2_x, 1.0, -frame.v2_y);
    this.v2Mesh.rotation.y = -(frame.v2_angulo * Math.PI / 180);

    // Impact marker pulse
    if (this.impactMarker) {
      const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.005);
      this.impactMarker.scale.setScalar(pulse);
      this.impactMarker.material.opacity = (phase === 'impact') ? 0.9 : 0.4;
    }
  }

  // ── Camera modes ──
  setCameraMode(mode, frame) {
    this.cameraMode = mode;
    this.controls.enabled = (mode === 'free');
    if (mode === 'free') {
      this.controls.reset();
    } else if (mode === 'top') {
      this.camera.position.set(0, 100, 0.01);
      this.camera.lookAt(0, 0, 0);
    } else if (mode === 'v1' && frame) {
      const x = frame.v1_x, z = -frame.v1_y;
      this.camera.position.set(x, 20, z + 25);
      this.camera.lookAt(x, 0, z);
    } else if (mode === 'v2' && frame) {
      const x = frame.v2_x, z = -frame.v2_y;
      this.camera.position.set(x, 20, z + 25);
      this.camera.lookAt(x, 0, z);
    }
  }

  updateCameraFollow(mode, frame) {
    if (!frame) return;
    if (mode === 'v1') {
      const x = frame.v1_x, z = -frame.v1_y;
      this.camera.position.lerp(new THREE.Vector3(x, 18, z + 22), 0.05);
      this.camera.lookAt(x, 0, z);
    } else if (mode === 'v2') {
      const x = frame.v2_x, z = -frame.v2_y;
      this.camera.position.lerp(new THREE.Vector3(x, 18, z + 22), 0.05);
      this.camera.lookAt(x, 0, z);
    }
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _render() {
    this.animFrameId = requestAnimationFrame(() => this._render());
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
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
  const prevPhaseRef = React.useRef(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    const sm = new SceneManager(canvasRef.current);
    sceneRef.current = sm;

    const resizeObs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        sm.resize(width, height);
      }
    });
    if (wrapperRef.current) resizeObs.observe(wrapperRef.current);

    return () => {
      resizeObs.disconnect();
      sm.destroy();
      sceneRef.current = null;
    };
  }, []);

  // When simulation data changes, rebuild scene
  React.useEffect(() => {
    if (!sceneRef.current || !simulationData) return;
    const sm = sceneRef.current;
    sm.buildRoad(simulationData.infraestructura);
    sm.buildVehicles();
    sm.buildImpactMarker();
    sm.buildTrajectories(simulationData.animacion_actores);
  }, [simulationData]);

  // Update vehicles each frame
  React.useEffect(() => {
    if (!sceneRef.current || !simulationData) return;
    const sm = sceneRef.current;
    const frame = interpolateFrame(simulationData.animacion_actores, tCurrent);

    // Spawn particles on impact
    if (phase === 'impact' && prevPhaseRef.current !== 'impact') {
      sm.spawnImpactParticles();
    }
    prevPhaseRef.current = phase;

    sm.updateParticles();
    sm.updateVehicles(frame, phase);
    if (cameraMode !== 'free') {
      sm.updateCameraFollow(cameraMode, frame);
    }
  }, [tCurrent, simulationData, phase, cameraMode]);

  // Camera mode change
  React.useEffect(() => {
    if (!sceneRef.current || !simulationData) return;
    const frame = interpolateFrame(simulationData.animacion_actores, tCurrent);
    sceneRef.current.setCameraMode(cameraMode, frame);
  }, [cameraMode]);

  const hasData = !!simulationData;

  return (
    <div className="viewer-wrapper" ref={wrapperRef}>
      <canvas ref={canvasRef} className="viewer-canvas" />
      {!hasData && (
        <div className="viewer-overlay">
          <div className="viewer-placeholder-icon">🚗</div>
          <p className="viewer-placeholder-text">
            Describe el siniestro y genera la simulación para ver la reconstrucción 3D aquí.
          </p>
        </div>
      )}
      {hasData && (
        <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 5 }}>
          {['free', 'top', 'v1', 'v2'].map(m => (
            <button
              key={m}
              className={`cam-btn${cameraMode === m ? ' active' : ''}`}
              onClick={() => onCameraModeChange(m)}
            >
              { m === 'free' ? '🎥 Libre' : m === 'top' ? '🛸 Cenital' : m === 'v1' ? '🚗 V1' : '🚙 V2' }
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Playback Controls Component
// ──────────────────────────────────────────────────────────────
const PlaybackControls = ({ frames, tCurrent, setTCurrent, isPlaying, setIsPlaying, speed, setSpeed }) => {
  const tMax = frames && frames.length > 0 ? frames[frames.length - 1].segundo : 10;
  const phase = getPhase(frames, tCurrent);

  const phaseLabel = { pre: '🔵 PRE-IMPACTO', impact: '💥 IMPACTO', post: '🟠 POST-IMPACTO' }[phase];
  const phaseClass = { pre: 'pre', impact: 'impact', post: 'post' }[phase];

  return (
    <div className="playback-controls">
      <button
        className={`btn btn-sm ${isPlaying ? 'btn-secondary' : 'btn-neon'}`}
        onClick={() => setIsPlaying(p => !p)}
        id="btn-playpause"
      >
        {isPlaying ? '⏸ Pausar' : '▶ Reproducir'}
      </button>

      <button
        className="btn btn-sm btn-secondary"
        onClick={() => { setTCurrent(0); setIsPlaying(false); }}
        id="btn-rewind"
      >
        ⏮ Reiniciar
      </button>

      <span className="time-display">t = {tCurrent.toFixed(2)}s</span>

      <input
        id="time-slider"
        className="time-slider"
        type="range"
        min="0"
        max={tMax}
        step="0.01"
        value={tCurrent}
        onChange={e => { setIsPlaying(false); setTCurrent(parseFloat(e.target.value)); }}
      />

      <span className="time-display" style={{ textAlign: 'right' }}>{tMax.toFixed(2)}s</span>

      <select
        id="speed-select"
        className="speed-select"
        value={speed}
        onChange={e => setSpeed(parseFloat(e.target.value))}
      >
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
  const cells = [
    { label: 'V1 — X', value: `${frame.v1_x.toFixed(1)} m`, cls: 'v1' },
    { label: 'V1 — Y', value: `${frame.v1_y.toFixed(1)} m`, cls: 'v1' },
    { label: 'V1 — Ángulo', value: `${frame.v1_angulo.toFixed(0)}°`, cls: 'v1' },
    { label: 'V2 — X', value: `${frame.v2_x.toFixed(1)} m`, cls: 'v2' },
    { label: 'V2 — Y', value: `${frame.v2_y.toFixed(1)} m`, cls: 'v2' },
    { label: 'V2 — Ángulo', value: `${frame.v2_angulo.toFixed(0)}°`, cls: 'v2' },
  ];
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
      {open && (
        <div className="expander-body">
          {JSON.stringify(data, null, 2)}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Turtle Script Generator (pure JS, no backend needed)
// ──────────────────────────────────────────────────────────────
function buildTurtleScript(simulationData) {
  const { animacion_actores: frames, infraestructura, dictamen_tecnico } = simulationData;
  const framesCode = frames.map(f =>
    `    {'t': ${f.segundo}, 'v1_x': ${f.v1_x}, 'v1_y': ${f.v1_y}, 'v1_a': ${f.v1_angulo}, 'v2_x': ${f.v2_x}, 'v2_y': ${f.v2_y}, 'v2_a': ${f.v2_angulo}},`
  ).join('\n');

  return `#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════╗
║         FORENSIA - Simulacion Forense 2D con Turtle     ║
║         Generado automaticamente con IA + Python        ║
╚══════════════════════════════════════════════════════════╝
Infraestructura: ${infraestructura}
Dictamen:
${dictamen_tecnico}

Uso: python forensia_simulacion.py
"""
import turtle, time, math

INFRAESTRUCTURA = "${infraestructura}"
FRAMES = [
${framesCode}
]
SCALE = 8
ANIM_DELAY = 0.04
INTERP_STEPS = 25
VEH_W, VEH_L = 10, 20

screen = turtle.Screen()
screen.title("FORENSIA - Simulacion 2D")
screen.bgcolor("#0a0e1a")
screen.setup(900, 700)
screen.tracer(0)

def lerp(a, b, t): return a + (b - a) * t
def lerp_ang(a, b, t):
    d = ((b - a) % 360 + 360) % 360
    if d > 180: d -= 360
    return a + d * t

def draw_road(t):
    t.speed(0)
    t.hideturtle()
    road = "#1c1c1c"
    edge = "#cccccc"
    center = "#eeee55"
    rw = 40
    if "interseccion" in INFRAESTRUCTURA:
        for bx, by, bw, bh in [(-300,-rw,600,rw*2),(- rw,-300,rw*2,600)]:
            t.penup(); t.goto(bx, by)
            t.fillcolor(road); t.begin_fill()
            for dx, dy in [(bw,0),(0,bh),(-bw,0),(0,-bh)]:
                t.goto(t.xcor()+dx, t.ycor()+dy)
            t.end_fill()
        for y in [-rw, rw]:
            for x1, x2 in [(-300,-rw),(rw,300)]:
                t.penup(); t.goto(x1,y); t.color(edge); t.width(2); t.pendown(); t.goto(x2,y); t.penup()
        for x in [-rw, rw]:
            for y1, y2 in [(-300,-rw),(rw,300)]:
                t.penup(); t.goto(x,y1); t.color(edge); t.width(2); t.pendown(); t.goto(x,y2); t.penup()
    else:
        t.penup(); t.goto(-400,-rw)
        t.fillcolor(road); t.begin_fill()
        for dx,dy in [(800,0),(0,rw*2),(-800,0),(0,-rw*2)]:
            t.goto(t.xcor()+dx,t.ycor()+dy)
        t.end_fill()
        for y in [-rw,rw]:
            t.penup(); t.goto(-400,y); t.color(edge); t.width(2); t.pendown(); t.goto(400,y); t.penup()

def draw_vehicle(t, x, y, angle, color, label):
    t.clear()
    px, py = x * SCALE, -y * SCALE
    heading = 90 - angle
    rad = math.radians(heading)
    ca, sa = math.cos(rad), math.sin(rad)
    corners = [(-VEH_W/2,-VEH_L/2),(VEH_W/2,-VEH_L/2),(VEH_W/2,VEH_L/2),(-VEH_W/2,VEH_L/2)]
    wc = [(px+cx*ca-cy*sa, py+cx*sa+cy*ca) for cx,cy in corners]
    t.penup(); t.goto(wc[0]); t.fillcolor(color); t.color(color)
    t.begin_fill(); t.pendown()
    for c in wc[1:]: t.goto(c)
    t.goto(wc[0]); t.end_fill(); t.penup()
    t.goto(px, py+VEH_L/2+8); t.color("#ffffff")
    t.write(label, align="center", font=("Arial",10,"bold")); t.penup()

def draw_hud(hud, t_now, t_max):
    hud.clear(); hud.penup()
    hud.goto(-430, 320); hud.color("#38bdf8")
    hud.write(f"FORENSIA | {INFRAESTRUCTURA} | t={t_now:.2f}s/{t_max:.2f}s", font=("Arial",11,"bold"))

road_t = turtle.Turtle(); v1_t = turtle.Turtle(); v2_t = turtle.Turtle(); hud_t = turtle.Turtle()
for t in [road_t, v1_t, v2_t, hud_t]: t.speed(0); t.hideturtle(); t.penup()
draw_road(road_t)
screen.update(); time.sleep(0.5)

t_max = FRAMES[-1]['t'] if FRAMES else 1
for i in range(len(FRAMES)-1):
    f0, f1 = FRAMES[i], FRAMES[i+1]
    for s in range(INTERP_STEPS+1):
        frac = s / INTERP_STEPS
        t_now = lerp(f0['t'], f1['t'], frac)
        v1x = lerp(f0['v1_x'], f1['v1_x'], frac); v1y = lerp(f0['v1_y'], f1['v1_y'], frac)
        v1a = lerp_ang(f0['v1_a'], f1['v1_a'], frac)
        v2x = lerp(f0['v2_x'], f1['v2_x'], frac); v2y = lerp(f0['v2_y'], f1['v2_y'], frac)
        v2a = lerp_ang(f0['v2_a'], f1['v2_a'], frac)
        draw_vehicle(v1_t, v1x, v1y, v1a, "#e74c3c", "V1")
        draw_vehicle(v2_t, v2x, v2y, v2a, "#2980b9", "V2")
        draw_hud(hud_t, t_now, t_max)
        screen.update(); time.sleep(ANIM_DELAY)

hud_t.clear(); hud_t.penup(); hud_t.goto(0, 0); hud_t.color("#10b981")
hud_t.write("Simulacion completa. Cierra la ventana para salir.", align="center", font=("Arial",12,"bold"))
screen.update(); turtle.done()
`;
}

// ──────────────────────────────────────────────────────────────
//  Main App Component
// ──────────────────────────────────────────────────────────────
const App = () => {
  // ── Ollama state ──
  const [ollamaOk, setOllamaOk] = React.useState(null);
  const [ollamaUrl, setOllamaUrl] = React.useState('http://localhost:11434');
  const [installedModels, setInstalledModels] = React.useState([]);
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_MODEL);

  // ── Input state ──
  const [relato, setRelato] = React.useState(DEFAULT_RELATO);

  // ── Loading/error ──
  const [loading, setLoading] = React.useState(false);
  const [loadingMsg, setLoadingMsg] = React.useState('');
  const [error, setError] = React.useState('');

  // ── Simulation result ──
  const [simulationData, setSimulationData] = React.useState(null);

  // ── Playback ──
  const [tCurrent, setTCurrent] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  const animRef = React.useRef(null);
  const lastTimeRef = React.useRef(null);

  // ── Camera ──
  const [cameraMode, setCameraMode] = React.useState('free');

  // ── Check Ollama ──
  const checkOllama = React.useCallback(async (url) => {
    const base = (url || ollamaUrl).replace(/\/$/, '');
    try {
      const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const data = await r.json();
        const models = (data.models || []).map(m => m.name);
        setInstalledModels(models);
        setOllamaOk(true);
        if (models.length > 0 && !models.includes(selectedModel)) {
          setSelectedModel(models[0]);
        }
      } else { setOllamaOk(false); }
    } catch { setOllamaOk(false); }
  }, [ollamaUrl, selectedModel]);

  React.useEffect(() => {
    checkOllama();
    const interval = setInterval(() => checkOllama(), 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Animation loop ──
  React.useEffect(() => {
    if (!isPlaying || !simulationData) return;
    const tMax = simulationData.animacion_actores[simulationData.animacion_actores.length - 1].segundo;
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
  const handleGenerate = async () => {
    if (!relato.trim()) { setError('Por favor escribe un relato del siniestro.'); return; }
    if (!ollamaOk) { setError('Ollama no está activo. Ejecuta `ollama serve` en una terminal.'); return; }

    setError('');
    setLoading(true);
    setSimulationData(null);
    setTCurrent(0);
    setIsPlaying(false);
    setLoadingMsg(`🧠 Procesando relato con ${selectedModel}...`);

    const base = ollamaUrl.replace(/\/$/, '');
    const userPrompt = `Analiza el siguiente relato de accidente de tránsito y genera la simulación forense en JSON estricto, respetando EXACTAMENTE la estructura indicada en las reglas.\n\nRELATO:\n${relato.trim()}`;

    const requestPayload = {
      model: selectedModel,
      prompt: userPrompt,
      system: SYSTEM_PROMPT,
      stream: false,
      options: { temperature: 0.1, top_p: 0.9, num_predict: 2048, format: 'json' }
    };

    try {
      setLoadingMsg(`⏳ Esperando respuesta de ${selectedModel} (esto puede tomar 15-60 seg)...`);
      const r = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      });

      if (!r.ok) {
        const err = await r.text();
        throw new Error(err || `HTTP ${r.status}`);
      }

      const data = await r.json();
      const rawText = (data.response || '').trim();
      if (!rawText) throw new Error('Ollama devolvió una respuesta vacía.');

      let result = null;
      try { result = JSON.parse(rawText); }
      catch {
        const block = extractJSON(rawText);
        if (block) result = JSON.parse(block);
        else throw new Error('No se encontró JSON válido en la respuesta.');
      }

      if (!result || !result.infraestructura || !result.animacion_actores || result.animacion_actores.length < 2) {
        throw new Error('El JSON no cumple el esquema esperado (faltan claves o frames insuficientes).');
      }

      // Coerce types
      result.animacion_actores = result.animacion_actores.map(f => ({
        segundo: parseFloat(f.segundo),
        v1_x: parseFloat(f.v1_x), v1_y: parseFloat(f.v1_y), v1_angulo: parseFloat(f.v1_angulo),
        v2_x: parseFloat(f.v2_x), v2_y: parseFloat(f.v2_y), v2_angulo: parseFloat(f.v2_angulo),
      }));

      setSimulationData(result);
      setTCurrent(0);
      setLoadingMsg('');
    } catch (e) {
      setError('❌ Error al generar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Download Turtle script ──
  const handleDownloadTurtle = () => {
    if (!simulationData) return;
    const script = buildTurtleScript(simulationData);
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forensia_simulacion.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  const tMax = simulationData ? simulationData.animacion_actores[simulationData.animacion_actores.length - 1].segundo : 10;
  const currentFrame = simulationData ? interpolateFrame(simulationData.animacion_actores, tCurrent) : null;
  const phase = simulationData ? getPhase(simulationData.animacion_actores, tCurrent) : 'pre';
  const modelOptions = installedModels.length > 0 ? installedModels : RECOMMENDED_MODELS;

  return (
    <div className="app-layout">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-icon">🚓</span>
          <div>
            <div className="topbar-title">ForensIA · Reconstrucción Forense 3D</div>
            <div className="topbar-subtitle">Motor NIC-RF · IA Local · Ollama</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn btn-sm btn-secondary" onClick={() => checkOllama()} id="btn-refresh-status">
            🔄 Verificar
          </button>
          <div className={`topbar-status ${ollamaOk === true ? 'ok' : 'err'}`}>
            <span className={`status-dot ${ollamaOk === true ? 'ok' : 'err'}`}></span>
            {ollamaOk === null ? 'Verificando...' : ollamaOk ? `Ollama ✓ (${installedModels.length} modelo${installedModels.length !== 1 ? 's' : ''})` : 'Ollama ✗ Inactivo'}
          </div>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        
        {/* Ollama Config (Compact/Collapsible) */}
        <details className="card" style={{ padding: '0.75rem 1rem' }}>
          <summary className="card-title" style={{ marginBottom: 0, cursor: 'pointer' }}>
            ⚙️ Configuración IA
          </summary>
          <div style={{ paddingTop: '1rem' }}>
            <div className="input-group">
              <label htmlFor="ollama-url">Servidor Ollama</label>
              <input id="ollama-url" type="text" value={ollamaUrl} onChange={e => { setOllamaUrl(e.target.value); checkOllama(e.target.value); }} />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label htmlFor="model-select">Modelo</label>
              <select id="model-select" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} disabled={!ollamaOk}>
                {installedModels.length > 0 && <optgroup label="✅ Instalados">{installedModels.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>}
                {installedModels.length === 0 && <optgroup label="Recomendados">{RECOMMENDED_MODELS.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>}
              </select>
            </div>
            {!ollamaOk && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>⚠️ Ollama inactivo</div>}
          </div>
        </details>

        {/* Relato Input */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '1rem' }}>
          <div className="card-title">📝 Relato del siniestro</div>
          <div className="input-group" style={{ flex: 1, marginBottom: '0.75rem' }}>
            <textarea
              id="relato-input"
              value={relato}
              onChange={e => setRelato(e.target.value)}
              placeholder="Describe el accidente..."
              style={{ flex: 1, minHeight: '180px', resize: 'none' }}
            />
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

          {loading && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div className="loading-bar"><div className="loading-bar-inner" /></div>
              <div className="loading-text"><div className="spinner" />{loadingMsg}</div>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 'auto' }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '0.75rem' }} onClick={handleGenerate} disabled={loading || !ollamaOk}>
              {loading ? '⏳ Procesando...' : '🚨 Generar Simulación'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setSimulationData(null); setError(''); setTCurrent(0); setIsPlaying(false); }} disabled={loading}>
              🧹
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">
        {/* 3D Viewer */}
        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title" style={{ marginBottom: '0.75rem' }}>
            🎬 Simulación Forense 3D
            {simulationData && (
              <span className="badge badge-neon" style={{ marginLeft: '0.75rem' }}>
                {simulationData.infraestructura}
              </span>
            )}
          </div>

          <Viewer3D
            simulationData={simulationData}
            tCurrent={tCurrent}
            phase={phase}
            cameraMode={cameraMode}
            onCameraModeChange={setCameraMode}
          />

          {simulationData && (
            <div style={{ marginTop: '0.75rem' }}>
              <PlaybackControls
                frames={simulationData.animacion_actores}
                tCurrent={tCurrent}
                setTCurrent={setTCurrent}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                speed={speed}
                setSpeed={setSpeed}
              />
            </div>
          )}
        </div>

        {/* Data Grid + Download */}
        {simulationData && currentFrame && (
          <div className="card fade-in-up">
            <div className="card-title" style={{ marginBottom: '0.75rem' }}>
              📊 Parámetros en t = {tCurrent.toFixed(2)}s
            </div>
            <DataPanel frame={currentFrame} />
            <div className="btn-row" style={{ marginTop: '1rem' }}>
              <button id="btn-download-turtle" className="btn btn-green" onClick={handleDownloadTurtle}>
                🐢 Descargar Script Python (Turtle)
              </button>
            </div>
          </div>
        )}

        {/* Dictamen Técnico */}
        {simulationData && (
          <div className="card fade-in-up">
            <div className="card-title">📋 Dictamen Técnico del Investigador IA</div>
            <div className="dictamen-box">
              {simulationData.dictamen_tecnico || 'Sin dictamen disponible.'}
            </div>
          </div>
        )}

        {/* Raw JSON */}
        {simulationData && (
          <div className="fade-in-up">
            <RawDataExpander data={simulationData} />
          </div>
        )}
      </main>
    </div>
  );
};

// ── Mount React ──
const rootEl = document.getElementById('root');
ReactDOM.createRoot(rootEl).render(React.createElement(App));
