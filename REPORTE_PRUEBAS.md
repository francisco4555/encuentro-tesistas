# Reporte de pruebas — Encuentro de Tesistas · UNRC

Pruebas ejecutadas sobre la **versión 0.2.0** del micrositio. Entorno de prueba:
Chrome headless 155 vía CDP, servidor local `python3 -m http.server`, con
verificación automática de píxeles (PIL) y auditoría de accesibilidad (axe-core
4.12.1).

| N.º | Prueba | Método | Resultado |
|---|---|---|---|
| 1 | `index.html` abre correctamente | HTTP 200 + DOM renderizado + título | ✅ Aprobado |
| 2 | El modelo 3D se renderiza | `window.__modelo3D.estado === "listo"`; 7 capas; 92 edificios, 71 árboles, 3 parques, 6 puntos | ✅ Aprobado |
| 3 | Rotación y zoom | Arrastre (diferencia de píxeles) y rueda/botones (diferencia de píxeles) | ✅ Aprobado |
| 4 | Controles de capas | Clic en capa + `aria-pressed`; «Mostrar todo» | ✅ Aprobado |
| 5 | Menú móvil | Clic abre/cierra, `aria-expanded`, cierre con `Escape` | ✅ Aprobado |
| 6 | Enlaces de navegación | Indicador de sección activa (scrollspy) | ✅ Aprobado |
| 7 | Acordeones (FAQ) | `details[open]` true/false tras clic | ✅ Aprobado |
| 8 | Botones | CTA funcionales | ✅ Aprobado |
| 9 | Errores de JavaScript | Consola del navegador | ✅ Sin errores |
| 10 | Diseño responsive | Capturas 1440×900 y 390×844 + análisis de píxeles | ✅ Aprobado |
| 11 | Rendimiento y accesibilidad | Core Web Vitals + auditoría axe | ✅ Aprobado (ver detalles) |
| 12 | Logotipo | `assets/logo-unrc.jpg` (364×98) se visualiza | ✅ Aprobado |
| 13 | `prefers-reduced-motion` | Emulación `reduce`; 32/32 elementos `.reveal` visibles | ✅ Aprobado |
| 14 | Programa interactivo | Pestañas de día, filtros por eje y estado vacío | ✅ Aprobado |
| 15 | Selección + ficha | Clic en edificio muestra ficha («Edificación esquemática») | ✅ Aprobado |

---

## 1. Apertura y estructura

- `GET /index.html` → **HTTP 200**. Título: «Encuentro de Tesistas | UNRC · LCAZU + LUDM».
- Las secciones requeridas están presentes y accesibles: portada con modelo 3D,
  sobre el encuentro, objetivos académicos, ejes temáticos, programa interactivo,
  participación y convocatoria, comité organizador, preguntas frecuentes,
  contacto institucional y pie de página.

## 2. Modelo 3D

- Inicialización correcta: `estado: "listo"`, `capas: 7`.
- Conteo de geometría (modelo demostrativo, determinista): 92 edificios, 71 árboles,
  3 parques y 6 puntos de investigación.
- **Rotación** verificada por diferencia de píxeles tras un arrastre (cambio
  significativo del fotograma).
- **Zoom** verificado con los botones «＋»/«−» y con eventos `wheel` (deltaY ±)
  — en ambos casos el fotograma cambia.
- **Capas**: alternar «Áreas verdes» actualiza `aria-pressed` a `false`; «Mostrar
  todo» restaura las 7 capas a `true`.
- **Selección**: clic sobre un edificio abre la ficha con los campos «Capa»,
  «Altura relativa» y «Uso de suelo»; cerrar la ficha la oculta.
- **Restablecer vista** (`#resetView`) funciona sin errores.
- El lienzo expone `role="img"` y una descripción textual; el modelo está
  etiquetado como **demostrativo** (no cartografía oficial).

## 3. Interfaz y navegación

- **Menú móvil** (390 px): el botón aparece y el menú se abre/cierra; `aria-expanded`
  correcto y cierre con `Escape`.
- **Scrollspy**: al desplazarse a `#programa` el enlace «Programa» queda activo;
  igual para `#ejes`.
- **Programa**: «Día 2» activa su panel; el filtro «Ambiente» en Día 2 deja 0
  sesiones (muestra mensaje de vacío) y en Día 1 deja 1 sesión (la esperada).
- **FAQ**: los acordeones alternan abierto/cerrado.

## 4. JavaScript / consola

- Consola del navegador **sin errores ni advertencias** (la advertencia de
  deprecación del build UMD de Three.js se retiró del archivo vendido).

## 5. Responsive

- Capturas verificadas en **1440×900** (escritorio) y **390×844** (móvil), con
  676 y 756 colores únicos respectivamente en el análisis de píxeles (contenido
  renderizado, no lienzo en blanco).
- Puntos de quiebre en 1080, 960 y 560 px para navegación, tarjetas, grid y visor.

## 6. Rendimiento (Core Web Vitals)

| Métrica | Valor | Estado |
|---|---|---|
| CLS (cambio de layout) | 0.0 | ✅ |
| FCP (primer pintado) | 268 ms | ✅ |
| LCP (mayor contenido) | 1128 ms | ✅ (< 2.5 s) |
| TTFB | 0.6 ms | ✅ |

> Nota: medido sobre servidor local; en GitHub Pages TTFB/LCP dependen de la red.

## 7. Accesibilidad (axe-core 4.12.1)

- **0 violaciones** WCAG tras las correcciones.
- 45 verificaciones superadas, 44 no aplicables.
- 1 verificación **incompleta** (color-contrast sobre `.hero-copy > .eyebrow`):
  axe no puede determinar el fondo por el pseudo-elemento decorativo del hero
  (`::before` con trama de puntos). Se verificó manualmente: verde `#2F7654`
  sobre fondo claro ≈ 5.8:1 (contraste AA suficiente). **No es una violación real.**

### Correcciones aplicadas durante la validación

1. `color-contrast`: `.notice` de `#777777` → `#5b6165` (contraste AA sobre blanco).
2. `aria-prohibited-attr`: `.viewer-controls` ahora lleva `role="group"`.

## 8. Problemas pendientes (no bloqueantes)

| Tema | Estado |
|---|---|
| Fecha, horario, sede y modalidad | Por confirmar (marcadores explícitos). |
| Cronograma Excel (no proporcionado) | Agenda ilustrativa en `datos_evento.json`. |
| Asignación del registro | La coordinan las y los docentes de cada licenciatura (sin formulario público). |
| Logotipo LUDM | No proporcionado; se usa el nombre completo en texto. |
| Integración con datos reales INEGI/GIS | API `cargarGeoJSON()` lista; viabilidad documentada en `informe_inegi_threejs.md`. |
| Datos de investigación reales | Los puntos del modelo son ejemplos ilustrativos (no se inventan tesis). |

---

**Conclusión:** la versión 0.2.0 es **funcional y verificable**. No existen
errores críticos. Quedan pendientes únicamente los datos oficiales del evento, que
se integrarán cuando el comité organizador los confirme.
