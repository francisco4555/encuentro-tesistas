/* ==========================================================================
   Encuentro de Tesistas · Laboratorio territorial 3D
   Maqueta urbana interactiva construida con Three.js (r160, vendida localmente).

   Características:
   - Rotación 360°, acercamiento/alejamiento, desplazamiento (ratón y táctil).
   - 7 capas temáticas activables/desactivables.
   - Selección de elementos (edificios, áreas verdes, puntos de investigación).
   - Fichas informativas (DOM accesible, aria-live).
   - Restablecimiento de vista y accesibilidad por teclado.
   - Modelo DEMOSTRATIVO: no representa cartografía ni datos georreferenciados.

   Integración SIG: `window.__modelo3D.cargarGeoJSON(geojson, opciones)` permite
   incorporar datos exportados desde QGIS (ver README.md).
   ========================================================================== */
/* THREE se carga como script clásico (vendor/three.min.js, UMD r158) antes de
   este archivo; la librería queda disponible en la variable global THREE. */
(function () {
  'use strict';

  var canvas = document.getElementById('city');
  if (!canvas) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Utilidades ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------- Constantes del modelo ---------- */
  var CITY = 6.4;                          // media extensión de la ciudad
  var ROAD_W = 0.6;                        // ancho de calle
  var ROAD_LINES = [-5, -2.5, 0, 2.5, 5];  // ejes de calles
  var R_MIN = 7, R_MAX = 26;
  var rng = mulberry32(20251021);

  var USO_COLOR = {
    'Residencial': 0xcfe0c0,
    'Comercial': 0xf0d9b5,
    'Mixto': 0xe8c9a0,
    'Equipamiento': 0xc3d4e0,
    'Industrial': 0xd9d2c5,
    'Área verde': 0x9cc89a
  };

  function asignarUso(bx, bz) {
    var usos = ['Residencial', 'Comercial', 'Mixto', 'Equipamiento', 'Industrial'];
    return usos[(bx * 7 + bz * 11) % usos.length];
  }

  /* ---------- Renderer / escena / cámara ---------- */
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (err) {
    fallback('Tu navegador no pudo iniciar el modelo 3D (WebGL no disponible).');
    return;
  }
  if (!renderer.getContext()) {
    fallback('Tu navegador no pudo iniciar el modelo 3D (contexto WebGL no disponible).');
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);

  var hemi = new THREE.HemisphereLight(0xf8fbf7, 0x8a9aa4, 1.05);
  var dir = new THREE.DirectionalLight(0xffffff, 1.55);
  dir.position.set(8, 14, 6);
  scene.add(hemi, dir);

  /* ---------- Estado de vista (órbita personalizada) ---------- */
  var DEFAULT = { theta: 0.72, phi: 1.02, radius: 15.5 };
  var view = {
    theta: DEFAULT.theta, phi: DEFAULT.phi, radius: DEFAULT.radius,
    target: new THREE.Vector3(0, 0, 0)
  };

  function updateCamera() {
    var sp = Math.sin(view.phi);
    camera.position.set(
      view.target.x + view.radius * sp * Math.sin(view.theta),
      view.target.y + view.radius * Math.cos(view.phi),
      view.target.z + view.radius * sp * Math.cos(view.theta)
    );
    camera.lookAt(view.target);
    camera.updateMatrixWorld();
  }

  /* ---------- Generación de la ciudad (procedural, determinista) ---------- */
  var groupBase, groupRelief, groupRoads, groupLandUse, groupGreen, groupBuildings, groupInfra, groupResearch;
  var selectables = [];
  var contador = { edificios: 0, arboles: 0, parques: 0, pines: 0 };

  var trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  var foliageMat = new THREE.MeshLambertMaterial({ color: 0x3f7d58 });

  function makeTree(x, z, s) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.055 * s, 0.22 * s, 6), trunkMat);
    trunk.position.y = 0.11 * s;
    var fol = new THREE.Mesh(new THREE.ConeGeometry(0.17 * s, 0.44 * s, 7), foliageMat);
    fol.position.y = 0.38 * s;
    g.add(trunk, fol);
    g.position.set(x, 0, z);
    contador.arboles++;
    return g;
  }

  function terrainHeight(x, z) {
    return 0.26 * Math.sin(x * 0.55) * Math.cos(z * 0.45)
      + 0.16 * Math.sin(x * 0.9 + 1.3) * Math.cos(z * 1.1 - 0.6)
      + 0.1 * Math.cos((x + z) * 0.35);
  }

  function buildCity() {
    var buildings = [], parks = [], blocks = [];
    var parques = { '0-1': true, '3-2': true, '1-3': true };

    for (var bx = 0; bx < 4; bx++) {
      for (var bz = 0; bz < 4; bz++) {
        var x0 = ROAD_LINES[bx] + ROAD_W / 2 + 0.1;
        var x1 = ROAD_LINES[bx + 1] - ROAD_W / 2 - 0.1;
        var z0 = ROAD_LINES[bz] + ROAD_W / 2 + 0.1;
        var z1 = ROAD_LINES[bz + 1] - ROAD_W / 2 - 0.1;
        var uso = parques[bx + '-' + bz] ? 'Área verde' : asignarUso(bx, bz);
        blocks.push({ x0: x0, x1: x1, z0: z0, z1: z1, uso: uso });

        if (parques[bx + '-' + bz]) {
          parks.push({ x0: x0, x1: x1, z0: z0, z1: z1, uso: uso });
          continue;
        }
        var N = 3;
        for (var li = 0; li < N; li++) {
          for (var lj = 0; lj < N; lj++) {
            if (rng() < 0.22) continue; // patio / plaza
            var lx0 = x0 + (x1 - x0) * (li / N) + 0.04;
            var lx1 = x0 + (x1 - x0) * ((li + 1) / N) - 0.04;
            var lz0 = z0 + (z1 - z0) * (lj / N) + 0.04;
            var lz1 = z0 + (z1 - z0) * ((lj + 1) / N) - 0.04;
            var w = (lx1 - lx0) * (0.7 + rng() * 0.3);
            var d = (lz1 - lz0) * (0.7 + rng() * 0.3);
            var cx = (lx0 + lx1) / 2 + (rng() - 0.5) * 0.08;
            var cz = (lz0 + lz1) / 2 + (rng() - 0.5) * 0.08;
            var h = 0.5 + Math.pow(rng(), 1.6) * 3.4;
            buildings.push({ x: cx, z: cz, w: w, d: d, h: h, uso: uso });
          }
        }
      }
    }
    return { buildings: buildings, parks: parks, blocks: blocks };
  }

  var city = buildCity();

  /* Base (siempre visible) */
  groupBase = new THREE.Group();
  var baseMat = new THREE.MeshLambertMaterial({ color: 0xc9d6c4 });
  var base = new THREE.Mesh(new THREE.PlaneGeometry(CITY * 2 + 2.4, CITY * 2 + 2.4), baseMat);
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.03;
  groupBase.add(base);

  /* Relieve */
  groupRelief = new THREE.Group();
  groupRelief.userData.layer = 'relieve';
  groupRelief.visible = false;
  (function buildRelief() {
    var geo = new THREE.PlaneGeometry(CITY * 2, CITY * 2, 40, 40);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var hs = [], minH = Infinity, maxH = -Infinity;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var h = terrainHeight(x, z);
      pos.setY(i, h + 0.03);
      hs.push(h);
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
    var cLo = new THREE.Color(0x6f9a72), cHi = new THREE.Color(0xc8b48a);
    var cols = new Float32Array(pos.count * 3);
    for (var j = 0; j < pos.count; j++) {
      var t = (hs[j] - minH) / (maxH - minH || 1);
      var c = cLo.clone().lerp(cHi, t);
      cols[j * 3] = c.r; cols[j * 3 + 1] = c.g; cols[j * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    groupRelief.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  })();

  /* Red vial */
  groupRoads = new THREE.Group();
  groupRoads.userData.layer = 'vial';
  (function buildRoads() {
    var mat = new THREE.MeshLambertMaterial({ color: 0xc9b68f });
    var matMain = new THREE.MeshLambertMaterial({ color: 0xbfa87e });
    ROAD_LINES.forEach(function (x) {
      var w = x === 0 ? ROAD_W * 1.5 : ROAD_W;
      var road = new THREE.Mesh(new THREE.PlaneGeometry(w, CITY * 2), x === 0 ? matMain : mat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.015, 0);
      groupRoads.add(road);
    });
    ROAD_LINES.forEach(function (z) {
      var w = z === 0 ? ROAD_W * 1.5 : ROAD_W;
      var road = new THREE.Mesh(new THREE.PlaneGeometry(CITY * 2, w), z === 0 ? matMain : mat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.015, z);
      groupRoads.add(road);
    });
  })();

  /* Usos de suelo */
  groupLandUse = new THREE.Group();
  groupLandUse.userData.layer = 'usos';
  groupLandUse.visible = false;
  (function buildLandUse() {
    city.blocks.forEach(function (b) {
      var w = b.x1 - b.x0, d = b.z1 - b.z0;
      var mat = new THREE.MeshBasicMaterial({
        color: USO_COLOR[b.uso] || 0xcccccc, transparent: true, opacity: 0.5, depthWrite: false
      });
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((b.x0 + b.x1) / 2, 0.02, (b.z0 + b.z1) / 2);
      groupLandUse.add(plane);
    });
  })();

  /* Áreas verdes (parques + arbolado) */
  groupGreen = new THREE.Group();
  groupGreen.userData.layer = 'verdes';
  (function buildGreen() {
    city.parks.forEach(function (p) {
      var w = p.x1 - p.x0, d = p.z1 - p.z0;
      var mat = new THREE.MeshLambertMaterial({ color: 0x4f8f68 });
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((p.x0 + p.x1) / 2, 0.012, (p.z0 + p.z1) / 2);
      plane.userData = {
        kind: 'verde', ficha: {
          kicker: 'Área verde',
          titulo: 'Parque urbano (esquemático)',
          filas: [
            ['Capa', 'Áreas verdes'],
            ['Descripción', 'Espacio de vegetación y recreación representado de forma esquemática.']
          ]
        }
      };
      groupGreen.add(plane);
      selectables.push(plane);
      contador.parques++;

      // árboles dentro del parque
      var n = 3;
      for (var a = 0; a < n; a++) {
        for (var b = 0; b < n; b++) {
          var tx = p.x0 + (p.x1 - p.x0) * (a + 0.5) / n + (rng() - 0.5) * 0.18;
          var tz = p.z0 + (p.z1 - p.z0) * (b + 0.5) / n + (rng() - 0.5) * 0.18;
          groupGreen.add(makeTree(tx, tz, 0.75 + rng() * 0.5));
        }
      }
    });
    // arbolado de alineación en las avenidas principales
    for (var k = -5; k <= 5; k += 1) {
      var s = 0.7 + rng() * 0.3;
      groupGreen.add(makeTree(k * 1.15 - 0.25, 0.62, s));
      groupGreen.add(makeTree(k * 1.15 + 0.25, -0.62, s));
      groupGreen.add(makeTree(0.62, k * 1.15 - 0.25, s));
      groupGreen.add(makeTree(-0.62, k * 1.15 + 0.25, s));
    }
  })();

  /* Edificaciones y alturas */
  groupBuildings = new THREE.Group();
  groupBuildings.userData.layer = 'edificaciones';
  (function buildBuildings() {
    var cLo = new THREE.Color(0xbcc8cc), cHi = new THREE.Color(0x5f7076);
    city.buildings.forEach(function (b) {
      var hNorm = clamp((b.h - 0.4) / 3.4, 0, 1);
      var mat = new THREE.MeshLambertMaterial({ color: cLo.clone().lerp(cHi, hNorm) });
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.userData = {
        kind: 'edificacion', w: b.w, h: b.h, d: b.d, uso: b.uso,
        ficha: {
          kicker: 'Edificación',
          titulo: 'Edificación esquemática',
          filas: [
            ['Capa', 'Edificaciones y alturas'],
            ['Altura relativa', b.h.toFixed(2) + ' unidades (esquemático)'],
            ['Uso de suelo', b.uso]
          ]
        }
      };
      groupBuildings.add(mesh);
      selectables.push(mesh);
      contador.edificios++;
    });
  })();

  /* Infraestructura urbana */
  groupInfra = new THREE.Group();
  groupInfra.userData.layer = 'infraestructura';
  groupInfra.visible = false;
  (function buildInfra() {
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x55606a });
    var lampMat = new THREE.MeshLambertMaterial({ color: 0xf0d98a, emissive: 0x3a2a00, emissiveIntensity: 0.35 });
    function light(x, z) {
      var g = new THREE.Group();
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.55, 6), poleMat);
      pole.position.y = 0.275;
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lampMat);
      lamp.position.y = 0.58;
      g.add(pole, lamp);
      g.position.set(x, 0, z);
      groupInfra.add(g);
    }
    for (var k = -4; k <= 4; k += 2) {
      light(k, 0.42); light(k, -0.42); light(0.42, k); light(-0.42, k);
    }
    // Nodos de servicio (equipamiento ilustrativo)
    var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x8b98a0 }));
    tank.position.set(-4.2, 0.25, -4.2); groupInfra.add(tank);
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.4), new THREE.MeshLambertMaterial({ color: 0x9aa7ad }));
    box.position.set(4.3, 0.14, 4.3); groupInfra.add(box);
  })();

  /* Puntos de investigación */
  groupResearch = new THREE.Group();
  groupResearch.userData.layer = 'investigacion';
  groupResearch.visible = false;
  (function buildResearch() {
    var pinBase = new THREE.Color(0x690e31);
    var pins = [
      { x: -3.4, z: -3.4, ejemplo: true, lic: 'LCAZU', eje: 'Ambiente y territorio' },
      { x: 3.4, z: 2.3, ejemplo: true, lic: 'LUDM', eje: 'Ordenamiento urbano' },
      { x: -1.2, z: 1.15, ejemplo: false },
      { x: 2.1, z: -2.6, ejemplo: false },
      { x: -4.2, z: 3.3, ejemplo: false },
      { x: 4.35, z: -1.0, ejemplo: false }
    ];
    pins.forEach(function (p) {
      var g = new THREE.Group();
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.42, 6),
        new THREE.MeshLambertMaterial({ color: pinBase }));
      pole.position.y = 0.21;
      var ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10),
        new THREE.MeshLambertMaterial({ color: pinBase }));
      ball.position.y = 0.5;
      g.add(pole, ball);
      g.position.set(p.x, 0, p.z);
      g.userData = {
        kind: 'pin',
        ficha: p.ejemplo
          ? {
              kicker: 'Punto de investigación · ejemplo ilustrativo',
              titulo: 'Proyecto demostrativo (ilustrativo)',
              filas: [
                ['Proyecto', 'Proyecto demostrativo (ilustrativo)'],
                ['Autor/a', '—'],
                ['Licenciatura', p.lic],
                ['Eje temático', p.eje],
                ['Objetivo', 'Ejemplificar el formato de la ficha; no representa una investigación real.'],
                ['Localización', 'Zona urbana esquemática (por confirmar)']
              ]
            }
          : {
              kicker: 'Punto de investigación',
              titulo: 'Por asignar',
              filas: [
                ['Proyecto', 'Por asignar'],
                ['Autor/a', '—'],
                ['Licenciatura', 'Por asignar'],
                ['Eje temático', 'Por asignar'],
                ['Objetivo', 'Los datos reales se incorporarán al confirmarse.'],
                ['Localización', 'Por confirmar']
              ]
            }
      };
      groupResearch.add(g);
      selectables.push(g);
      contador.pines++;
    });
  })();

  /* ---------- Contorno de selección (edificios) ---------- */
  var outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xb58a32 })
  );
  outline.visible = false;
  scene.add(outline);

  /* ---------- Capas ---------- */
  var layerGroups = {
    edificaciones: groupBuildings,
    vial: groupRoads,
    verdes: groupGreen,
    usos: groupLandUse,
    relieve: groupRelief,
    infraestructura: groupInfra,
    investigacion: groupResearch
  };
  [groupBase, groupRelief, groupRoads, groupLandUse, groupGreen, groupBuildings, groupInfra, groupResearch]
    .forEach(function (g) { scene.add(g); });

  function layerVisible(obj) {
    var o = obj;
    while (o) {
      if (o.userData && o.userData.layer) return o.visible;
      o = o.parent;
    }
    return true;
  }
  function carrierOf(obj) {
    var o = obj;
    while (o) {
      if (o.userData && o.userData.ficha) return o;
      o = o.parent;
    }
    return null;
  }
  function setEmissive(obj, on) {
    if (obj.isMesh) {
      obj.material.emissive.setHex(on ? 0x8a6a1a : 0x000000);
      obj.material.emissiveIntensity = on ? 0.55 : 0;
    } else if (obj.isGroup) {
      obj.children.forEach(function (c) { setEmissive(c, on); });
    }
  }

  /* ---------- Selección y ficha ---------- */
  var raycaster = new THREE.Raycaster();
  var selected = null;

  var card = document.getElementById('infoCard');
  var kickerEl = document.getElementById('infoKicker');
  var titleEl = document.getElementById('infoTitle');
  var bodyEl = document.getElementById('infoBody');

  function mostrarFicha(f) {
    kickerEl.textContent = f.kicker;
    titleEl.textContent = f.titulo;
    bodyEl.textContent = '';
    f.filas.forEach(function (par) {
      var row = document.createElement('div');
      row.className = 'row';
      var dt = document.createElement('dt'); dt.textContent = par[0];
      var dd = document.createElement('dd'); dd.textContent = par[1];
      row.appendChild(dt); row.appendChild(dd);
      bodyEl.appendChild(row);
    });
    card.hidden = false;
  }

  function deselect() {
    if (selected) setEmissive(selected, false);
    selected = null;
    outline.visible = false;
    card.hidden = true;
  }

  function select(obj) {
    var carrier = carrierOf(obj);
    if (!carrier) return;
    deselect();
    selected = carrier;
    setEmissive(carrier, true);
    if (carrier.userData.kind === 'edificacion') {
      outline.scale.set(carrier.userData.w, carrier.userData.h, carrier.userData.d);
      outline.position.copy(carrier.position);
      outline.visible = true;
    }
    mostrarFicha(carrier.userData.ficha);
    requestRender();
  }

  function pick(e) {
    var rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    var ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(selectables, true);
    var hit = hits.find(function (h) { return layerVisible(h.object); });
    if (hit) select(hit.object);
    else deselect();
  }

  /* ---------- Controles de vista ---------- */
  var pointers = new Map();
  var gesture = null;
  var lastPinchDist = 0;
  var moved = 0;
  var last = { x: 0, y: 0 };

  function pan(dx, dy) {
    updateCamera();
    var right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    var scale = view.radius * 0.0014;
    view.target.addScaledVector(right, -dx * scale);
    view.target.y = clamp(view.target.y + dy * scale, -3, 6);
    updateCamera();
    requestRender();
  }

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pointers.size === 1) {
      var isPan = e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || e.shiftKey);
      gesture = isPan ? 'pan' : 'rotate';
      last.x = e.clientX; last.y = e.clientY;
    } else if (pointers.size === 2) {
      gesture = 'pinch';
      var pts = Array.from(pointers.values());
      lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      last.x = (pts[0].x + pts[1].x) / 2;
      last.y = (pts[0].y + pts[1].y) / 2;
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    var dx = e.clientX - last.x, dy = e.clientY - last.y;
    moved += Math.abs(dx) + Math.abs(dy);

    if (gesture === 'rotate') {
      view.theta -= dx * 0.006;
      view.phi = clamp(view.phi - dy * 0.005, 0.35, 1.5);
      last.x = e.clientX; last.y = e.clientY;
      updateCamera(); requestRender();
    } else if (gesture === 'pan') {
      pan(dx, dy);
      last.x = e.clientX; last.y = e.clientY;
    } else if (gesture === 'pinch' && pointers.size === 2) {
      var pts = Array.from(pointers.values());
      var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDist > 0) {
        view.radius = clamp(view.radius * (lastPinchDist / dist), R_MIN, R_MAX);
      }
      lastPinchDist = dist;
      var cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
      pan(cx - last.x, cy - last.y);
      last.x = cx; last.y = cy;
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    if (pointers.size === 0) {
      if (moved < 6 && gesture === 'rotate') pick(e);
      gesture = null;
    } else if (pointers.size === 1) {
      var p = Array.from(pointers.values())[0];
      last.x = p.x; last.y = p.y;
      gesture = 'rotate';
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    view.radius = clamp(view.radius * Math.exp(e.deltaY * 0.0012), R_MIN, R_MAX);
    updateCamera(); requestRender();
  }, { passive: false });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('keydown', function (e) {
    var handled = true;
    switch (e.key) {
      case 'ArrowLeft': view.theta -= 0.09; break;
      case 'ArrowRight': view.theta += 0.09; break;
      case 'ArrowUp': view.phi = clamp(view.phi + 0.05, 0.35, 1.5); break;
      case 'ArrowDown': view.phi = clamp(view.phi - 0.05, 0.35, 1.5); break;
      case '+': case '=': view.radius = clamp(view.radius - 0.8, R_MIN, R_MAX); break;
      case '-': case '_': view.radius = clamp(view.radius + 0.8, R_MIN, R_MAX); break;
      case 'r': case 'R': case '0': resetView(); handled = true; return;
      case 'Escape': deselect(); handled = true; return;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); updateCamera(); requestRender(); }
  });

  function resetView() {
    view.theta = DEFAULT.theta;
    view.phi = DEFAULT.phi;
    view.radius = DEFAULT.radius;
    view.target.set(0, 0, 0);
    deselect();
    updateCamera();
    requestRender();
  }

  function selectedLayer() {
    if (!selected) return null;
    var o = selected;
    while (o) { if (o.userData && o.userData.layer) return o.userData.layer; o = o.parent; }
    return null;
  }
  function setLayer(name, visible) {
    var g = layerGroups[name];
    if (!g) return;
    g.visible = visible;
    var btn = document.querySelector('[data-layer="' + name + '"]');
    if (btn) btn.setAttribute('aria-pressed', String(visible));
    if (!visible && selectedLayer() === name) deselect();
    requestRender();
  }

  document.querySelectorAll('[data-layer]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var name = btn.dataset.layer;
      var g = layerGroups[name];
      if (!g) return;
      setLayer(name, !g.visible);
    });
  });

  var layersAll = document.getElementById('layersAll');
  if (layersAll) {
    layersAll.addEventListener('click', function () {
      Object.keys(layerGroups).forEach(function (name) { setLayer(name, true); });
    });
  }

  document.getElementById('resetView').addEventListener('click', resetView);
  document.getElementById('zoomIn').addEventListener('click', function () {
    view.radius = clamp(view.radius - 1.2, R_MIN, R_MAX); updateCamera(); requestRender();
  });
  document.getElementById('zoomOut').addEventListener('click', function () {
    view.radius = clamp(view.radius + 1.2, R_MIN, R_MAX); updateCamera(); requestRender();
  });
  document.getElementById('infoClose').addEventListener('click', deselect);

  /* ---------- Renderizado (bajo demanda + intro animada) ---------- */
  var needsRender = true;
  function requestRender() { needsRender = true; }

  var intro = { active: !reduceMotion, start: 0, dur: 1200 };
  var introFrom = { theta: DEFAULT.theta - 0.7, phi: DEFAULT.phi + 0.2, radius: DEFAULT.radius + 5 };

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (intro.active) {
      if (!intro.start) intro.start = now;
      var t = clamp((now - intro.start) / intro.dur, 0, 1);
      var k = easeInOutCubic(t);
      view.theta = introFrom.theta + (DEFAULT.theta - introFrom.theta) * k;
      view.phi = introFrom.phi + (DEFAULT.phi - introFrom.phi) * k;
      view.radius = introFrom.radius + (DEFAULT.radius - introFrom.radius) * k;
      if (t >= 1) intro.active = false;
      needsRender = true;
    }
    if (needsRender) {
      updateCamera();
      renderer.render(scene, camera);
      needsRender = false;
    }
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    requestRender();
  }
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);

  function fallback(msg) {
    var div = document.createElement('div');
    div.className = 'viewer-fallback';
    div.textContent = msg;
    canvas.replaceWith(div);
    window.__modelo3D = { estado: 'error', motivo: msg };
  }

  /* ---------- Integración SIG (GeoJSON / export de QGIS) ---------- */
  function cargarGeoJSON(geojson, opciones) {
    opciones = opciones || {};
    if (!geojson || geojson.type !== 'FeatureCollection') {
      throw new Error('cargarGeoJSON espera un FeatureCollection de GeoJSON.');
    }
    var grupo = new THREE.Group();
    grupo.userData.layer = 'gis';
    var mat = new THREE.MeshLambertMaterial({ color: (opciones.color || 0x9bafb9) });
    var origen = opciones.origen || null; // [lon, lat] para restar y centrar localmente

    geojson.features.forEach(function (ft) {
      var g = ft.geometry;
      if (!g) return;
      var coords = g.type === 'Polygon' ? g.coordinates[0] : (g.type === 'Point' ? [g.coordinates] : null);
      if (!coords) return;
      var pts = [];
      coords.forEach(function (c) {
        var x = c[0] - (origen ? origen[0] : 0);
        var z = c[1] - (origen ? origen[1] : 0);
        pts.push(new THREE.Vector2(x * (opciones.escala || 1), -z * (opciones.escala || 1)));
      });
      if (g.type === 'Polygon') {
        var shape = new THREE.Shape(pts);
        var geo = new THREE.ShapeGeometry(shape);
        var mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.03;
        grupo.add(mesh);
      } else if (g.type === 'Point') {
        var m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat);
        m.position.set(pts[0].x, 0.15, pts[0].y);
        grupo.add(m);
      }
    });
    scene.add(grupo);
    requestRender();
    return grupo;
  }

  /* ---------- Inicialización ---------- */
  updateCamera();
  resize();
  requestAnimationFrame(loop);

  window.__modelo3D = {
    estado: 'listo',
    capas: Object.keys(layerGroups),
    contar: function () { return { edificios: contador.edificios, arboles: contador.arboles, parques: contador.parques, pines: contador.pines }; },
    cargarGeoJSON: cargarGeoJSON,
    resetView: resetView
  };
})();
