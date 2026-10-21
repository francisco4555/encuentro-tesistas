# Encuentro de Tesistas · UNRC — Micrositio web

Micrositio universitario del **Encuentro de Tesistas**, impulsado por la
**Licenciatura en Ciencias Ambientales para Zonas Urbanas (LCAZU)** y la
**Licenciatura en Urbanismo y Desarrollo Metropolitano (LUDM)** de la
**Universidad Nacional Rosario Castellanos (UNRC)**.

Su elemento distintivo es un **laboratorio territorial 3D interactivo**
(maqueta urbana) construido con [Three.js](https://threejs.org/), junto con un
programa interactivo, ejes temáticos y secciones institucionales.

> **Estado:** borrador académico. La información institucional (fecha, sede,
> horario, comité y convocatoria) está **por confirmar** y se muestra con
> marcadores explícitos. El modelo 3D es **demostrativo** y **no** representa
> cartografía ni datos georreferenciados oficiales.

---

## 1. Cómo ejecutar el sitio

El sitio es **100 % estático** y no requiere dependencias de servidor ni paso de
compilación.

### Opción A — Abrir directamente (doble clic)

Abre `index.html` en cualquier navegador moderno (Chrome, Safari, Firefox o
Edge). Todo funciona sin servidor: el modelo 3D se carga con Three.js vendido
localmente (script clásico) y el programa usa datos embebidos de respaldo.

### Opción B — Servidor local (recomendado para desarrollo)

```bash
python3 -m http.server 8123
# Abre http://127.0.0.1:8123/index.html
```

Con un servidor HTTP, el sitio además lee `datos_evento.json` por `fetch()` para
mantener el programa en un único archivo editable.

### Opción C — Publicar en GitHub Pages

1. Sube el contenido del proyecto a un repositorio de GitHub.
2. En **Settings → Pages**, selecciona la rama y la carpeta raíz (`/`).
3. El sitio se publica en `https://<usuario>.github.io/<repositorio>/`.

No se usan rutas absolutas de máquina local, por lo que la publicación es directa.

---

## 2. Estructura del proyecto

```
├── index.html               # Página principal (12 secciones)
├── css/
│   └── styles.css           # Identidad visual, layout y responsive
├── js/
│   ├── app.js               # Menú, scrollspy, reveal, programa interactivo
│   └── urban-model.js       # Maqueta 3D (Three.js): capas, selección, fichas
├── vendor/
│   └── three.min.js         # Three.js r158 (vendido localmente)
├── assets/
│   └── logo-unrc.jpg        # Logotipo de la UNRC
├── datos_evento.json        # Información estructurada del evento
├── informe_inegi_threejs.md # Viabilidad de integrar datos abiertos INEGI/SIG
├── respaldo/
│   └── encuentro_tesistas_index_v1.html  # Copia de seguridad de la versión anterior
├── README.md
├── CHANGELOG.md
└── REPORTE_PRUEBAS.md
```

---

## 3. Dependencias

| Dependencia | Versión | Licencia | Uso |
|---|---|---|---|
| [Three.js](https://threejs.org/) | **r158** (build UMD `three.min.js`) | MIT | Motor de renderizado 3D de la maqueta urbana |

- Three.js está **vendido localmente** en `vendor/three.min.js` (no se usa CDN),
  por lo que el sitio funciona sin conexión y con versión fija.
- Se retiró la única llamada `console.warn(...)` de advertencia de deprecación del
  build UMD (se documenta aquí por transparencia; el resto de la librería queda
  intacto, incluyendo su cabecera de licencia).
- No hay fuentes externas (se usa tipografía del sistema) ni imágenes de terceros.
- El resto del código es propio (HTML, CSS y JavaScript sin librerías adicionales).

Para actualizar Three.js: descarga el build deseado de
`https://cdn.jsdelivr.net/npm/three@<versión>/build/three.min.js`, colócalo en
`vendor/three.min.js` y actualiza esta tabla y el `CHANGELOG.md`.

---

## 4. Modelo 3D — Laboratorio territorial

Implementado en `js/urban-model.js`. Características:

- **Rotación 360°** (arrastrar / un dedo), **acercar/alejar** (rueda / pellizco) y
  **desplazamiento** (clic derecho o `Shift`+arrastre / dos dedos).
- **7 capas temáticas** activables/desactivables: edificaciones y alturas, red
  vial, áreas verdes, usos de suelo, relieve, infraestructura urbana y puntos de
  investigación.
- **Selección de elementos** (raycasting): al seleccionar un edificio, un área
  verde o un punto de investigación se muestra una **ficha informativa** accesible
  (`aria-live`).
- **Restablecer vista** y controles por **teclado** (flechas para rotar, `+`/`-`
  para acercar/alejar, `r`/`0` para reiniciar, `Escape` para cerrar la ficha).
- **Accesible**: el lienzo tiene `role="img"` y descripción textual; las capas y
  controles exponen `aria-pressed`/`aria-label`.
- **Respeto de `prefers-reduced-motion`**: se desactiva la animación de entrada.

### API de integración SIG (GeoJSON / export de QGIS)

El modelo expone `window.__modelo3D.cargarGeoJSON(geojson, opciones)` para
incorporar polígonos y puntos exportados desde QGIS/INEGI:

```js
// geojson: FeatureCollection con Polygon y/o Point
window.__modelo3D.cargarGeoJSON(geojson, {
  color: 0x9bafb9,      // color de los elementos
  origen: [-99.13, 19.4], // [lon, lat] de referencia para centrar localmente
  escala: 1             // factor de escala (grados → unidades del modelo)
});
```

La viabilidad de usar datos abiertos de INEGI (Marco Geoestadístico, DENUE, Uso
de Suelo y Vegetación, CEM/MDE, Red Nacional de Caminos, etc.) está documentada en
[`informe_inegi_threejs.md`](informe_inegi_threejs.md).

---

## 5. Cómo actualizar la información del evento

Edita **`datos_evento.json`** para centralizar los cambios:

- `evento`: fecha, horario, sede y modalidad (hoy en `null` = por confirmar).
- `ejes_tematicos`: los cinco ejes propuestos.
- `programa`: días y sesiones (la interfaz se genera automáticamente).
- `registro`: gestión de la asignación (coordinada por las y los docentes).
- `comite`: integrantes y correos (hoy en `null`).

El sitio lee este archivo por `fetch()` cuando se sirve por HTTP. Si se abre por
doble clic, usa una copia embebida de respaldo en `js/app.js`
(`PROGRAMA_PREDETERMINADO`); mantén ambos sincronizados cuando edites el programa.

---

## 6. Identidad visual

- Paleta: vino institucional `#690E31`, dorado `#B58A32`, verde ambiental
  `#2F7654`, gris urbano `#667780` y blanco cálido `#F8F7F3`.
- Tipografía del sistema (serif para títulos, sans para cuerpo), sin fuentes
  externas.
- Logotipo: se usa el logotipo de la **UNRC** (`assets/logo-unrc.jpg`). **LCAZU** y
  **LUDM** se citan por su nombre completo, sin logotipos ficticios.

---

## 7. Accesibilidad, SEO y rendimiento

- HTML semántico, navegación por teclado, `skip-link`, `aria-*`, contraste AA y
  `prefers-reduced-motion`.
- Metaetiquetas Open Graph/Twitter y datos estructurados JSON-LD.
- Renderizado 3D bajo demanda y DPR limitado a 2× para ahorrar GPU.
- Ver detalles en [`REPORTE_PRUEBAS.md`](REPORTE_PRUEBAS.md).

---

## 8. Notas de integridad institucional

- No se inventa información institucional ni tesis/autores/resultados.
- Los puntos de investigación del modelo son **ejemplos ilustrativos** claramente
  etiquetados; los datos reales se incorporarán al confirmarse.
- La asignación del registro la coordinan las y los docentes de cada licenciatura;
  el sitio no expone formulario público de inscripción.
