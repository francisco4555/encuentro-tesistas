# Informe técnico — Viabilidad de integrar datos geoespaciales abiertos de México (INEGI) en una aplicación web 3D (Three.js)

**Fecha de consulta/verificación:** 2026-10-21
**Ámbito:** sitio universitario de investigación urbana/ambiental.
**Conclusión general (en una línea):** la integración es **viable y recomendable**: INEGI publica los datos necesarios en formatos abiertos (Shapefile descargable y —vía GeoServicios/WFS— también GeoJSON, KML y CSV), bajo "Términos de Libre Uso" que permiten uso académico e incluso comercial con simple atribución; el único trabajo real es el preproceso (proyección, simplificación y diezmado) para que Three.js rinda sin degradarse.

> Clasificación de confianza usada a lo largo del informe: **[Verificado]** = comprobado directamente en la fuente oficial en esta sesión (HTTP 200 + contenido leído); **[Probable]** = avalado por fuente oficial/secundaria confiable pero no leído en detalle; **[Pendiente]** = requiere verificación adicional antes de citar como dato firme.

---

## 1. Fuentes oficiales de datos abiertos geoespaciales (INEGI)

| Producto | Relevancia urbanismo/ambiente | URL oficial de entrada | Formato principal | Confianza |
|---|---|---|---|---|
| **Marco Geoestadístico** (nacional/estatal/municipal, localidades, AGEB, manzana) | Base cartográfica de referencia y límites | https://www.inegi.org.mx/temas/mg/ | SHP; WFS (`pi_mgn`) | [Verificado] (página) |
| **DENUE** (Directorio Estadístico Nacional de Unidades Económicas) | Actividad económica, comercio, empleo, equipamiento urbano | https://www.inegi.org.mx/temas/directorio/ · API: https://www.inegi.org.mx/servicios/api_denue.html | API JSON (token); descarga; WFS (`denue`) | [Verificado] (API leída) |
| **Uso de Suelo y Vegetación** (Serie VII y anteriores) | Cobertura vegetal, uso de suelo, deforestación, suelo urbano | https://www.inegi.org.mx/temas/usosuelo/ | SHP/vector; WFS (`pi_usv_7`) | [Verificado] (página + WFS) |
| **Continuo de Elevaciones Mexicano (CEM) / MDE** | Relieve, modelos de elevación para terrenos 3D | https://www.inegi.org.mx/app/geo2/elevacionesmex/ | Ráster/SHP; CEM (15/30/60/90/120 m) y MDE LiDAR (5 m, 1.5 m) | [Verificado] (página leída) |
| **Red Nacional de Caminos (RNC) / Vías de comunicación** | Red vial, conectividad, accesibilidad | https://www.inegi.org.mx/temas/viascomunicacion/ | SHP; WFS (`pi_rnc`) | [Verificado] (página + WFS) |
| **Áreas verdes urbanas** | Verde urbano, islas de calor, calidad ambiental | Sin capa nacional única de INEGI; aproximación vía **Uso de Suelo y Vegetación** y portales locales (p. ej. CDMX) | SHP / portales locales | [Pendiente] (ver nota abajo) |
| **Hidrografía** (red hidrográfica: arroyos, ríos, lagos, lagunas) | Riesgo hídrico, drenaje, ecosistemas | Vía GeoServicios WFS (`swl`) | WFS (GeoJSON/SHP-ZIP) | [Verificado] (capas en WFS) |

**Notas puntuales:**
- **Áreas verdes urbanas:** no localicé una capa nacional de INEGI dedicada y de descarga directa con ese nombre. La ruta oficial más sólida es derivarlas del **Uso de Suelo y Vegetación** (clase de asentamientos humanos / cobertura) o de portales de datos abiertos locales (p. ej. CDMX: https://datos.cdmx.gob.mx ). **[Pendiente]** confirmar el diccionario de datos exacto de USV Serie VII para el nombre de la clase "área verde urbana". Existe además el indicador de SEMARNAT "Superficie de áreas verdes urbanas per cápita" (indicador, no capa geoespacial descargable).
- **Marco Geoestadístico** se publica por componentes (estatal, municipal, localidades, AGEB, manzana) y se sirve también por WFS con las capas `areas_geoestadisticas_municipales`, `poligonos_de_manzana`, `ejes_de_vialidad`, `localidades_geoestadisticas_amanzanadas`, etc. **[Verificado]**.

---

## 2. Formatos disponibles y conversión

**[Verificado]** ¿Ofrecen GeoJSON directamente? **Sí, vía WFS**, no como archivo .geojson de descarga masiva en todos los productos. La respuesta `GetCapabilities` del WFS de INEGI (`https://gaia.inegi.org.mx/geoserver/ows?service=WFS...`) declara explícitamente estos `outputFormat` para `GetFeature`:

- `application/json` / `json` → **GeoJSON**
- `SHAPE-ZIP` → **Shapefile empaquetado**
- `KML` / `application/vnd.google-earth.kml+xml`
- `csv` / `text/csv`
- `GML2`, `GML3`, `gml32`

Es decir, el mismo servicio puede entregar la capa en **GeoJSON, Shapefile, KML o CSV**, según el parámetro `outputFormat` (sujeto a límites de `count`/`maxFeatures` y paginación — el servicio tiene `CountDefault=1000000`).

**Descarga masiva tradicional:** la mayoría de los productos vectoriales se descargan en **Shapefile (.shp/.dbf/.shx)** y, para ráster (CEM/MDE), en **GeoTIFF/GRID/ASCII**. Los portales de entrada son las páginas de "tema" indicadas arriba y la sección **Datos abiertos** (https://www.inegi.org.mx/datosabiertos/), que distribuye conforme a la "Norma Técnica para el Acceso y Publicación de Datos Abiertos de la Información Estadística y Geográfica de Interés Nacional".

**Conversión Shapefile → GeoJSON:**

- **GDAL/OGR** (línea de comandos, [Probable] sintaxis estándar):
  ```bash
  ogr2ogr -f GeoJSON salida.geojson entrada.shp -t_srs EPSG:4326
  # o, para proyectar a UTM local (zona 14N p. ej.):
  ogr2ogr -f GeoJSON salida.geojson entrada.shp -t_srs EPSG:32614
  ```
- **QGIS** (GUI): clic derecho sobre la capa → *Exportar* → *Guardar entidades como…* → formato *GeoJSON* → elegir SRC de salida (p. ej. EPSG:4326 o la zona UTM local).
- **mapshaper** (CLI/web): útil para **simplificar** polígonos pesados antes de llevarlos al navegador (`mapshaper entrada.shp -simplify 10% -o format=geojson`). [Probable]

---

## 3. Licencias y condiciones de uso

**[Verificado]** Los datos de INEGI son de **libre uso**, incluido el uso comercial, bajo los **"Términos de Libre Uso de la Información del INEGI"**:

- URL de la página de términos: https://www.inegi.org.mx/inegi/terminos.html
- PDF oficial: https://www.inegi.org.mx/contenidos/inegi/doc/terminos_info.pdf

Condiciones clave (leídas directamente):
1. El usuario **puede** hacer y distribuir copias, difundir y publicar, adaptar y reordenar, **extraer total o parcialmente**, y **explotar comercialmente** la información (como insumo de otros productos o servicios).
2. **Debe** otorgar crédito al INEGI como autor y, cuando sea técnicamente posible, citar la fuente con el formato: **"Fuente: INEGI, [nombre del producto]"** (y fecha de actualización si aplica).
3. Debe **notificar al usuario final** de cualquier análisis o transformación hecha, sin presentarlo como si fuera elaborado por INEGI.
4. **No debe** aparentar que su uso representa una postura oficial del INEGI ni que está avalado por él.
5. No alterar ni suprimir los **metadatos** al redistribuir copias.

**Base legal:** los términos se rigen por la **Ley del Sistema Nacional de Información Estadística y Geográfica (LSNIEG)** y la normatividad aplicable. La "información de interés nacional" del INEGI es de uso público conforme a esta ley. [Verificado en cuanto a la remisión a la LSNIEG; la cita del articulado concreto de la LSNIEG queda como [Pendiente] si se requiere referencia jurídica precisa en un artículo académico].

---

## 4. Viabilidad técnica para Three.js

*(Esta sección es análisis técnico del autor a partir de los datos verificados; no son "afirmaciones" de INEGI.)*

**¿Es razonable? Sí.** GeoJSON es JSON plano, trivial de consumir en JavaScript (`fetch` → `JSON.parse`). Las coordenadas vienen en grados geográficos (longitud/latitud), que hay que convertir a un plano en metros para una escena 3D.

**Proyecciones — lo esencial:**
- **Datum de INEGI:** las capas del Marco Geoestadístico en el WFS se sirven con `DefaultCRS` **EPSG:6365 = "Mexico ITRF2008"** (coordenadas **geográficas** en grados, elipsoide GRS80). **[Verificado]** La diferencia ITRF2008 ↔ WGS84 es del orden de ~1 m, **despreciable para visualización urbana**: puedes tratarlas como WGS84 (EPSG:4326) sin corrección apreciable.
- **Proyección proyectada oficial:** **Cónica Conforme de Lambert (CCL)**, EPSG:6372 "Mexico ITRF2008 / LCC". [Probable/Verificado por ontología EPSG]
- **Para una maqueta local** (campus/barrio/ciudad): proyecta a un sistema plano en **metros**. Dos opciones prácticas:
  1. **UTM** (zonas 11N–16N para México; p. ej. EPSG:32613/32614 en WGS84) usando **proj4js** (`proj4(from, to, [lon, lat])`) — ideal para extensiones municipales/regionales.
  2. **Equirectangular local** (aproximación): `x = (lon − lon0)·111320·cos(lat0)`, `y = (lat − lat0)·110540` — suficiente para áreas pequeñas (< ~50 km) y sin dependencias.
- **Truco de precisión en Three.js:** define un **origen local** (resta las coordenadas del centro del área) para evitar errores de punto flotante de JS con coordenadas UTM grandes. La escena queda en metros relativos.

**Relieve/3D:** usa el **CEM/MDE** (GeoTIFF) como *heightmap* sobre un `PlaneGeometry` (desplazamiento por vértice) o vía WCS para recortar al área de interés; los edificios pueden extrudirse a partir de las **manzanas** del Marco Geoestadístico o representarse como puntos/extrusiones desde DENUE. Para triangular polígonos con huecos usa **Earcut** (incluido en `ShapeGeometry` de Three.js).

**Tamaño de datos y rendimiento (alerta):**
- **DENUE:** > **5 millones de establecimientos** a nivel nacional [Verificado]. **No cargarlo completo.** Usa la API con `Buscar`/`BuscarAreaAct` filtrado por radio (máx. 5 000 m), municipio o actividad; renderiza con *points/instancing* (`THREE.Points` o `InstancedMesh`) y agrega por colonia/AGEB para vistas lejanas.
- **Marco Geoestadístico (manzanas/AGEB):** puede tener decenas de miles de polígonos por ciudad; **simplifica** geometría (Douglas-Peucker vía mapshaper/turf) y diezma antes de cargar.
- **Uso de Suelo y Vegetación (Serie VII nacional):** pesado; **recorta al área de estudio** antes de convertir.
- **Buenas prácticas de producción:** preprocesar a GeoJSON simplificado o a GLB/GLTF (con **Draco**), LOD (nivel de detalle), y mover la conversión a un *Web Worker* para no bloquear el hilo de UI.

**Flujo recomendado (resumen):**
`SHP (descarga) → GDAL/QGIS → GeoJSON (EPSG:4326) → simplificar (mapshaper) → proyectar a metros locales (proj4js/ogr2ogr) → cargar en Three.js (extrusión + heightmap del MDE)`. Alternativa en línea: consumir el **WFS** con `outputFormat=application/json` + `bbox`/`count` acotados.

---

## 5. URLs oficiales de referencia (lista corta)

1. **INEGI — Términos de uso / Libre Uso de la Información:** https://www.inegi.org.mx/inegi/terminos.html
2. **INEGI — API del DENUE (documentación para desarrolladores):** https://www.inegi.org.mx/servicios/api_denue.html
3. **INEGI — GeoServicios WFS (GetCapabilities del servidor GeoServer):** https://gaia.inegi.org.mx/geoserver/ows?service=WFS&acceptversions=2.0.0&request=GetCapabilities
4. **INEGI — Continuo de Elevaciones Mexicano y MDE (descarga):** https://www.inegi.org.mx/app/geo2/elevacionesmex/
5. **INEGI — Espacio y Datos de México (visor + geoservicios):** https://www.inegi.org.mx/app/mapa/espacioydatos/
6. **INEGI — Datos abiertos:** https://www.inegi.org.mx/datosabiertos/
7. **INEGI — Tema "Uso de suelo y vegetación":** https://www.inegi.org.mx/temas/usosuelo/
8. **INEGI — Tema "Marco Geoestadístico":** https://www.inegi.org.mx/temas/mg/

---

## 6. Fuentes

- INEGI, *Términos de uso — Del libre uso de la información del INEGI*. https://www.inegi.org.mx/inegi/terminos.html (y PDF https://www.inegi.org.mx/contenidos/inegi/doc/terminos_info.pdf) — consultado 2026-10-21.
- INEGI, *API del DENUE*. https://www.inegi.org.mx/servicios/api_denue.html — consultado 2026-10-21.
- INEGI, *Continuo de elevaciones mexicano y modelos digitales de elevación*. https://www.inegi.org.mx/app/geo2/elevacionesmex/ — consultado 2026-10-21.
- INEGI GeoServer, *WFS GetCapabilities* (workspaces `pi_mgn`, `pi_rnc`, `pi_usv_7`, `denue`, `cem30`, `cem40`, `swl`, etc.). https://gaia.inegi.org.mx/geoserver/ows?service=WFS&acceptversions=2.0.0&request=GetCapabilities — consultado 2026-10-21.
- INEGI, páginas de tema (HTTP 200): *Marco Geoestadístico* https://www.inegi.org.mx/temas/mg/ · *Uso de suelo y vegetación* https://www.inegi.org.mx/temas/usosuelo/ · *Directorio de empresas y establecimientos (DENUE)* https://www.inegi.org.mx/temas/directorio/ · *Vías de comunicación* https://www.inegi.org.mx/temas/viascomunicacion/ · *Datos abiertos* https://www.inegi.org.mx/datosabiertos/ · *Espacio y Datos de México* https://www.inegi.org.mx/app/mapa/espacioydatos/ — consultado 2026-10-21.
- EPSG.io, *EPSG:6365 — Mexico ITRF2008* (CRS geográfico, grados, GRS80). https://epsg.io/6365 — consultado 2026-10-21.
- OGC CRS ontology, *Mexico ITRF2008 / LCC* (EPSG:6372). https://opengeospatial.github.io/ontology-crs/data/def/crs/EPSG/0/6372/index.html — consultado 2026-10-21 (vía búsqueda).

---

## 7. Afirmaciones confirmadas vs. pendientes de verificación

**Confirmadas (verificadas en fuente oficial esta sesión):**
- Libre uso (incluso comercial) de la información de INEGI con atribución "Fuente: INEGI, …" (leído en términos oficiales).
- API del DENUE existe, requiere token, devuelve JSON con latitud/longitud y cubre > 5 millones de establecimientos.
- El WFS de INEGI entrega GeoJSON (`application/json`), Shapefile (`SHAPE-ZIP`), KML y CSV como `outputFormat`.
- El WFS publica capas de Marco Geoestadístico (`pi_mgn`), Red Nacional de Caminos (`pi_rnc`), Uso de Suelo y Vegetación Serie VII (`pi_usv_7`), DENUE (`denue`), hidrografía (`swl`) y elevación (`cem30`/`cem40`).
- El CRS por defecto de las capas del Marco Geoestadístico en el WFS es EPSG:6365 (Mexico ITRF2008, geográfico).
- El CEM/MDE se descarga con resoluciones de 15–120 m (CEM) y 1.5/5 m (MDE LiDAR/fotogrametría), con opción Shapefile/ráster.

**Pendientes de verificación (antes de citar como dato firme en un documento formal):**
- URL exacta de "ficha de descarga" (con `upc=…`) de cada producto en el sistema de descargas masivas de INEGI (estas URL son poco estables; se recomienda entrar por las páginas de tema o el WFS).
- Nombre/clave exacta de la clase "área verde urbana" en el diccionario de datos de Uso de Suelo y Vegetación Serie VII; y existencia de una capa nacional INEGI específica de áreas verdes urbanas (no localizada como tal).
- Articulado concreto de la LSNIEG que fundamenta el uso público de la información (se confirma la remisión a la ley, no el número de artículo).
- Confirmación directa del endpoint WMS (el mismo servidor GeoServer `gaia.inegi.org.mx` sirve WMS; aquí se verificó WFS directamente).

---

*Nota editorial (cumplimiento AGENTS.md): este documento se entrega como **borrador**. La revisión de **detección externa de IA y de similitud textual** no se ejecutó en este entorno (no hay detector/credencial disponible), por lo que se marca **"Detección de IA pendiente"**. No se certifica autoría humana ni se reportan porcentajes de IA.*
