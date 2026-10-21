/* ==========================================================================
   Encuentro de Tesistas · Lógica de interfaz
   (menú, aparición progresiva, indicador de sección, programa interactivo)
   ========================================================================== */
(function () {
  'use strict';

  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- Año en el pie de página ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Menú móvil ---------- */
  var menu = document.getElementById('menu');
  var navlinks = document.getElementById('navlinks');

  function setMenu(open) {
    navlinks.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
    menu.textContent = open ? '\u00D7' : '\u2630';
  }
  if (menu && navlinks) {
    menu.addEventListener('click', function () {
      setMenu(!navlinks.classList.contains('open'));
    });
    navlinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMenu(false);
    });
  }

  /* ---------- Aparición progresiva (respeta reduced-motion) ---------- */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Indicador de sección activa ---------- */
  var navLinks = Array.prototype.slice.call(navlinks.querySelectorAll('a[href^="#"]'));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  function onScroll() {
    var y = window.scrollY + 130;
    var currentId = null;
    sections.forEach(function (sec) {
      if (sec.offsetTop <= y) currentId = sec.getAttribute('id');
    });
    navLinks.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + currentId);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* ---------- Programa interactivo ---------- */
  // Datos ilustrativos por defecto (mismos que datos_evento.json) para poder
  // abrir el sitio directamente desde el sistema de archivos (file://).
  var PROGRAMA_PREDETERMINADO = [
    {
      dia: 1, etiqueta: 'Día 1',
      sesiones: [
        { hora: '09:00 – 09:30', titulo: 'Registro y bienvenida', eje: 'General', descripcion: 'Recepción de participantes y palabras de apertura a cargo del comité organizador.' },
        { hora: '09:30 – 10:30', titulo: 'Conferencia inaugural', eje: 'General', descripcion: 'Perspectiva sobre la investigación interdisciplinaria entre ambiente y ciudad.' },
        { hora: '10:45 – 12:30', titulo: 'Mesas temáticas de investigación', eje: 'General', descripcion: 'Presentación y discusión de avances organizados por eje temático.' },
        { hora: '12:30 – 13:30', titulo: 'Receso', eje: 'General', descripcion: 'Pausa para el intercambio informal entre participantes.' },
        { hora: '13:30 – 15:00', titulo: 'Presentación de avances de tesis · Bloque I', eje: 'Ambiente y territorio', descripcion: 'Avances de investigación sobre servicios ambientales y resiliencia territorial.' },
        { hora: '15:15 – 16:45', titulo: 'Retroalimentación entre pares y docentes', eje: 'Gestión socioambiental', descripcion: 'Diálogo constructivo sobre metodologías y resultados preliminares.' }
      ]
    },
    {
      dia: 2, etiqueta: 'Día 2',
      sesiones: [
        { hora: '09:00 – 10:30', titulo: 'Presentación de avances de tesis · Bloque II', eje: 'Ordenamiento urbano', descripcion: 'Planeación, diseño urbano y usos del suelo.' },
        { hora: '10:45 – 12:15', titulo: 'Taller metodológico', eje: 'Cartografía y SIG', descripcion: 'Herramientas de análisis espacial y representación territorial.' },
        { hora: '12:15 – 13:15', titulo: 'Receso', eje: 'General', descripcion: 'Pausa para el intercambio informal entre participantes.' },
        { hora: '13:15 – 14:30', titulo: 'Panel de tesistas y docentes', eje: 'Cambio climático', descripcion: 'Adaptación, mitigación y riesgos en las ciudades.' },
        { hora: '14:30 – 15:30', titulo: 'Conclusiones y cierre', eje: 'General', descripcion: 'Síntesis del encuentro y acuerdos para las siguientes etapas.' }
      ]
    }
  ];

  var diaActivo = 1;
  var filtroActivo = '*';

  function construirSesion(s) {
    var li = document.createElement('li');
    li.dataset.eje = s.eje;

    var det = document.createElement('details');
    var sum = document.createElement('summary');
    sum.className = 'event-summary';
    sum.innerHTML =
      '<time>' + esc(s.hora) + '</time>' +
      '<span class="ev-title">' + esc(s.titulo) + '<small>' + esc(s.eje) + '</small></span>' +
      '<span class="ev-arrow" aria-hidden="true">\u203A</span>';

    var body = document.createElement('div');
    body.className = 'event-body';
    body.innerHTML =
      '<p>' + esc(s.descripcion) + '</p>' +
      '<span class="eje-tag">Eje: ' + esc(s.eje) + '</span>';

    det.appendChild(sum);
    det.appendChild(body);
    li.appendChild(det);
    return li;
  }

  function renderPrograma(programa) {
    (programa || []).forEach(function (dia) {
      var panel = document.getElementById('panel-dia' + dia.dia);
      if (!panel) return;
      panel.textContent = '';
      var ol = document.createElement('ol');
      ol.className = 'timeline-list';
      dia.sesiones.forEach(function (s) { ol.appendChild(construirSesion(s)); });
      panel.appendChild(ol);
    });
    aplicarFiltro();
  }

  function aplicarFiltro() {
    document.querySelectorAll('.timeline li[data-eje]').forEach(function (li) {
      var enPanelActivo = li.closest('.timeline').id === 'panel-dia' + diaActivo;
      var coincide = filtroActivo === '*' || li.dataset.eje === filtroActivo;
      li.hidden = !(enPanelActivo && coincide);
    });
    var panelActivo = document.getElementById('panel-dia' + diaActivo);
    var visibles = panelActivo ? panelActivo.querySelectorAll('li[data-eje]:not([hidden])') : [];
    var empty = document.getElementById('programaEmpty');
    if (empty) empty.hidden = visibles.length > 0;
  }

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      diaActivo = Number(tab.getAttribute('aria-controls').replace('panel-dia', ''));
      document.querySelectorAll('.tab').forEach(function (t) {
        var sel = t === tab;
        t.classList.toggle('active', sel);
        t.setAttribute('aria-selected', String(sel));
        t.setAttribute('tabindex', sel ? '0' : '-1');
      });
      document.querySelectorAll('.timeline').forEach(function (p) {
        p.hidden = p.id !== 'panel-dia' + diaActivo;
      });
      aplicarFiltro();
    });
    tab.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
      var idx = tabs.indexOf(tab);
      var next = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
      e.preventDefault();
    });
  });

  document.querySelectorAll('.filter').forEach(function (f) {
    f.addEventListener('click', function () {
      filtroActivo = f.dataset.filter;
      document.querySelectorAll('.filter').forEach(function (x) {
        var on = x === f;
        x.classList.toggle('active', on);
        x.setAttribute('aria-pressed', String(on));
      });
      aplicarFiltro();
    });
  });

  (function iniciarPrograma() {
    var widget = document.getElementById('programaWidget');
    if (!widget) return;
    fetch('datos_evento.json', { cache: 'no-cache' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (datos) { renderPrograma(datos.programa || PROGRAMA_PREDETERMINADO); })
      .catch(function () { renderPrograma(PROGRAMA_PREDETERMINADO); });
  })();
})();
