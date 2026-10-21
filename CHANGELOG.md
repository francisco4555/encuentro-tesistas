# Registro de cambios (CHANGELOG)

Todas las mejoras relevantes del proyecto, en orden cronológico inverso.

## [0.2.1] — Retiro de la sección de registro (versión actual)

- Se eliminó la sección «Registro de participantes» y el botón de navegación
  «Registro», ya que **la asignación del registro la coordinan las y los docentes**
  de cada licenciatura.
- La sección «Participa» ahora describe un **proceso de participación** (no de
  registro) e indica que el registro lo asignan los docentes.
- Se actualizaron `datos_evento.json`, `README.md`, `REPORTE_PRUEBAS.md` y se
  retiró el CSS específico de la sección eliminada.

## [0.2.0] — Rediseño integral y modelo 3D real

### Modelo 3D (prioridad alta)
- Se sustituyó el lienzo 2D con proyección isométrica por una **maqueta urbana 3D
  real con Three.js r158** (`js/urban-model.js`).
- Rotación 360°, acercar/alejar (rueda y pellizco), desplazamiento (clic derecho /
  `Shift` / dos dedos), restablecer vista y controles por teclado.
- **7 capas temáticas** independientes: edificaciones y alturas, red vial, áreas
  verdes, usos de suelo, relieve, infraestructura urbana y puntos de investigación.
- **Selección de elementos** por raycasting con resaltado y **ficha informativa**
  accesible (`aria-live`), para edificios, áreas verdes y puntos de investigación.
- Integración SIG: API `window.__modelo3D.cargarGeoJSON()` para incorporar
  polígonos/puntos exportados desde QGIS/INEGI.
- El modelo se etiqueta explícitamente como **demostrativo** (no cartografía
  oficial).

### Diseño e identidad
- Paleta institucional aplicada (vino `#690E31`, dorado `#B58A32`, verde
  `#2F7654`, gris urbano `#667780`, blanco cálido `#F8F7F3`).
- Tipografía del sistema (serif para títulos, sans para cuerpo), sin fuentes
  externas.
- Reestructuración en secciones (portada, sobre, objetivos, ejes, programa,
  participación, comité, FAQ, contacto, pie).
- Iconografía SVG propia para los ejes temáticos (sustituye a los glifos de texto).
- Tarjetas con elevación al pasar el cursor y aparición progresiva (`reveal`).

### Programa y datos
- **Programa interactivo**: pestañas por día, filtros por eje temático y sesiones
  expandibles, generado a partir de `datos_evento.json`.
- Nuevo `datos_evento.json` con la información estructurada del evento.

### Accesibilidad, SEO y rendimiento
- HTML semántico, `skip-link`, navegación por teclado, `aria-*`, contraste AA y
  soporte de `prefers-reduced-motion`.
- Metaetiquetas Open Graph/Twitter y datos estructurados JSON-LD.
- Renderizado 3D bajo demanda y DPR limitado a 2×.
- Sin dependencias externas en tiempo de ejecución (Three.js vendido localmente).

### Documentación
- Añadidos `README.md`, `CHANGELOG.md`, `REPORTE_PRUEBAS.md` e
  `informe_inegi_threejs.md` (viabilidad de datos abiertos INEGI/SIG).

## [0.1.0] — Versión anterior

- Archivo único `encuentro_tesistas_index.html` con secciones básicas (portada,
  sobre, ejes, programa/participación, comité/contacto, FAQ).
- "Modelo 3D" implementado como **canvas 2D** con proyección isométrica (no era
  un modelo 3D real) y tres capas fijas (general/verde/edificios/vialidades).
- Logotipo UNRC incrustado en base64.

> La versión anterior se conserva en
> `respaldo/encuentro_tesistas_index_v1.html`.
