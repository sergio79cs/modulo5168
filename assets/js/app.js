/* Lógica de la web. Las fechas se cambian en calendario.js, no aquí. */
(function () {
  "use strict";

  const BASE = (window.BASE || "").replace(/\/$/, "");
  const url = (ruta) => BASE + "/" + ruta.replace(/^\//, "");

  /* ---------- Fechas ---------- */
  const aFecha = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const clave = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const largo = (d) => DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES[d.getMonth()];
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- Construcción del calendario ---------- */
  const noLectivo = {};
  (typeof NO_LECTIVOS !== "undefined" ? NO_LECTIVOS : []).forEach((p) => {
    const [a, b, txt] = Array.isArray(p) ? p : [p, p, "No lectivo"];
    for (let d = aFecha(a); d <= aFecha(b || a); d.setDate(d.getDate() + 1)) noLectivo[clave(d)] = txt || "No lectivo";
  });
  const eventos = {};
  (typeof EVENTOS !== "undefined" ? EVENTOS : []).forEach((e) => { eventos[e.fecha] = e.texto; });

  const clases = {};      // "2026-09-15" -> { s, parte, de }
  const rango = {};       // "1-3" -> { primero, ultimo }
  (function repartir() {
    let d = aFecha(CONFIG.inicio);
    const fin = aFecha(CONFIG.fin);
    const siguiente = () => {
      while (d <= fin) {
        const k = clave(d);
        const ok = CONFIG.diasClase.includes(d.getDay()) && !noLectivo[k];
        const actual = new Date(d); d.setDate(d.getDate() + 1);
        if (ok) return actual;
      }
      return null;
    };
    for (const s of SESIONES) {
      if (s.desde && aFecha(s.desde) > d) d = aFecha(s.desde);
      const n = Math.max(1, s.dias || 1);
      for (let i = 1; i <= n; i++) {
        const f = siguiente();
        if (!f) return;
        clases[clave(f)] = { s, parte: i, de: n };
        const id = s.ut + "-" + s.n;
        rango[id] = rango[id] || { primero: f };
        rango[id].ultimo = f;
      }
    }
  })();

  const fechasClase = Object.keys(clases).sort();
  const estado = (s) => {
    const r = rango[s.ut + "-" + s.n];
    if (!r) return "pendiente";
    if (r.ultimo < hoy) return "hecha";
    if (r.primero <= hoy) return "encurso";
    return "pendiente";
  };

  /* ---------- Portada: hoy / próxima clase ---------- */
  function pintarHoy() {
    const caja = document.getElementById("hoy-tarjeta");
    if (!caja) return;
    const kHoy = clave(hoy);
    const pasadas = fechasClase.filter((k) => k < kHoy);
    const futuras = fechasClase.filter((k) => k > kHoy);
    let html = "";

    const tarjeta = (k, etiqueta) => {
      const c = clases[k]; const s = c.s; const f = aFecha(k);
      const parte = c.de > 1 ? `<span class="parte">Parte ${c.parte} de ${c.de}</span>` : "";
      return `<p class="hoy-cuando">${etiqueta}${etiqueta.startsWith("Hoy") ? "" : ", " + largo(f)}</p>
        <a class="hoy-enlace ut${s.ut}" href="${url(s.url)}">
          <span class="hoy-num">Sesión ${s.n}</span>
          <span class="hoy-titulo">${esc(s.titulo)}</span>
          <span class="hoy-meta">UT0${s.ut} · ${esc(s.criterio)} ${parte}</span>
          <span class="hoy-boton">Abrir la sesión</span>
        </a>`;
    };

    if (clases[kHoy]) html = tarjeta(kHoy, "Hoy, " + largo(hoy));
    else if (futuras.length) {
      html = (noLectivo[kHoy] ? `<p class="hoy-aviso">Hoy no hay clase: ${esc(noLectivo[kHoy])}.</p>` : "") +
             tarjeta(futuras[0], "Próxima clase");
    } else html = `<p class="hoy-cuando">No quedan clases en el calendario.</p>`;

    if (pasadas.length) {
      const k = pasadas[pasadas.length - 1]; const s = clases[k].s;
      html += `<p class="hoy-anterior">¿Faltaste el ${largo(aFecha(k))}? <a href="${url(s.url)}">Repasa la sesión ${s.n}: ${esc(s.titulo)}</a></p>`;
    }
    if (CONFIG.provisional) html += `<p class="provisional">Las fechas son provisionales y pueden cambiar.</p>`;
    caja.innerHTML = html;
  }

  /* ---------- Pipeline de una unidad ---------- */
  function pipeline(ut, actual) {
    const ses = SESIONES.filter((s) => s.ut === ut);
    const iconos = { hecha: "✓", encurso: "", pendiente: "" };
    const nombres = { hecha: "hecha", encurso: "en curso", pendiente: "pendiente" };
    return `<ol class="pipe" aria-label="Sesiones de la UT0${ut}">` + ses.map((s) => {
      const e = estado(s);
      const r = rango[s.ut + "-" + s.n];
      const fecha = r ? r.primero.getDate() + " " + MESES[r.primero.getMonth()].slice(0, 3) : "";
      const esta = actual && actual.n === s.n ? ' aria-current="page"' : "";
      return `<li class="etapa ${e}${esta ? " actual" : ""}">
        <a href="${url(s.url)}"${esta} title="Sesión ${s.n}: ${esc(s.titulo)} (${nombres[e]})">
          <span class="etapa-punto" aria-hidden="true">${iconos[e]}</span>
          <span class="etapa-n">S${s.n}</span>
          <span class="etapa-nombre">${esc(s.corto)}</span>
          <span class="etapa-fecha">${fecha}</span>
        </a></li>`;
    }).join("") + "</ol>";
  }

  function pintarPipelinePortada() {
    const caja = document.getElementById("pipe-portada");
    if (!caja) return;
    const kHoy = clave(hoy);
    const prox = fechasClase.find((k) => k >= kHoy) || fechasClase[fechasClase.length - 1];
    const ut = prox ? clases[prox].s.ut : 1;
    const u = UNIDADES.find((x) => x.ut === ut);
    document.getElementById("pipe-titulo").textContent = `UT0${ut}: ${u ? u.titulo : ""}`;
    caja.innerHTML = pipeline(ut);
    centrarPipe(caja);
  }

  // En pantallas estrechas, desplaza la tubería hasta la etapa que toca
  function centrarPipe(caja) {
    const ol = caja.querySelector(".pipe");
    const el = caja.querySelector(".etapa.actual, .etapa.encurso, .etapa.pendiente");
    if (ol && el && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = el.offsetLeft - ol.offsetLeft - 60;
  }

  /* ---------- Calendario mensual ---------- */
  function pintarCalendario() {
    const caja = document.getElementById("cal");
    if (!caja) return;
    const ini = aFecha(CONFIG.inicio), fin = aFecha(CONFIG.fin);
    let mes = new Date(Math.min(Math.max(hoy, ini), fin)); mes.setDate(1);
    const titulo = document.getElementById("cal-mes");
    const btnAnt = document.getElementById("cal-ant"), btnSig = document.getElementById("cal-sig"), btnHoy = document.getElementById("cal-hoy");

    function dibujar() {
      titulo.textContent = MESES[mes.getMonth()].replace(/^./, (c) => c.toUpperCase()) + " " + mes.getFullYear();
      btnAnt.disabled = mes <= new Date(ini.getFullYear(), ini.getMonth(), 1);
      btnSig.disabled = mes >= new Date(fin.getFullYear(), fin.getMonth(), 1);
      const primero = new Date(mes);
      const hueco = (primero.getDay() + 6) % 7;
      const nDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      let html = ["L", "M", "X", "J", "V", "S", "D"].map((d) => `<div class="cal-cab" aria-hidden="true">${d}</div>`).join("");
      for (let i = 0; i < hueco; i++) html += `<div class="cal-dia vacio"></div>`;
      for (let n = 1; n <= nDias; n++) {
        const f = new Date(mes.getFullYear(), mes.getMonth(), n);
        const k = clave(f);
        const cls = ["cal-dia"];
        if (k === clave(hoy)) cls.push("es-hoy");
        if (f < hoy) cls.push("pasado");
        if (f.getDay() === 0 || f.getDay() === 6) cls.push("finde");
        const ev = eventos[k] ? `<span class="cal-evento">${esc(eventos[k])}</span>` : "";
        const hoyTxt = k === clave(hoy) ? " (hoy)" : "";
        if (clases[k]) {
          const c = clases[k], s = c.s;
          const parte = c.de > 1 ? ` <span class="cal-parte">${c.parte}/${c.de}</span>` : "";
          html += `<a class="${cls.join(" ")} clase ut${s.ut}" href="${url(s.url)}" aria-label="${largo(f)}${hoyTxt}: sesión ${s.n}, ${esc(s.titulo)}">
            <span class="cal-num">${n}</span>
            <span class="cal-ses">S${s.n}${parte}</span>
            <span class="cal-nombre">${esc(s.corto)}</span>${ev}</a>`;
        } else if (noLectivo[k] && !cls.includes("finde")) {
          html += `<div class="${cls.join(" ")} nolectivo" title="${esc(noLectivo[k])}"><span class="cal-num">${n}</span><span class="cal-nombre">${esc(noLectivo[k])}</span>${ev}</div>`;
        } else {
          html += `<div class="${cls.join(" ")}${ev ? " con-evento" : ""}"><span class="cal-num">${n}</span>${ev}</div>`;
        }
      }
      const resto = (7 - ((hueco + nDias) % 7)) % 7;
      for (let i = 0; i < resto; i++) html += `<div class="cal-dia vacio"></div>`;
      caja.innerHTML = html;
    }
    btnAnt.onclick = () => { mes.setMonth(mes.getMonth() - 1); dibujar(); };
    btnSig.onclick = () => { mes.setMonth(mes.getMonth() + 1); dibujar(); };
    btnHoy.onclick = () => { mes = new Date(Math.min(Math.max(hoy, ini), fin)); mes.setDate(1); dibujar(); };
    dibujar();
  }

  /* ---------- Lista de unidades ---------- */
  function pintarUnidades() {
    const caja = document.getElementById("uts");
    if (!caja) return;
    caja.innerHTML = UNIDADES.map((u) => {
      const ses = SESIONES.filter((s) => s.ut === u.ut);
      const lista = ses.length ? `<ol class="ut-sesiones">` + ses.map((s) => {
        const r = rango[s.ut + "-" + s.n];
        const f = r ? `<span class="ut-fecha">${r.primero.getDate()} ${MESES[r.primero.getMonth()].slice(0, 3)}</span>` : "";
        return `<li class="${estado(s)}"><a href="${url(s.url)}"><span class="ut-sn">${s.n}</span><span>${esc(s.titulo)}</span>${f}</a></li>`;
      }).join("") + "</ol>" : `<p class="ut-vacia">El material se publicará cuando empiece la unidad.</p>`;
      const cab = u.url ? `<a href="${url(u.url)}">UT0${u.ut}</a>` : `UT0${u.ut}`;
      return `<article class="ut ut${u.ut}${u.url ? "" : " pronto"}">
        <h3><span class="ut-cod">${cab}</span> <span class="ut-nom">${esc(u.titulo)}</span></h3>
        <p class="ut-ra">${u.ra}</p>${lista}</article>`;
    }).join("");
  }

  /* ---------- Bloques de código ---------- */
  const COMANDOS = /^(sudo |git|docker|kubectl|minikube|helm|cd|ls|cat|echo|curl|wget|npm|npx|node|mkdir|rm|cp|mv|chmod|chown|sysctl|export|source|ab|ssh|touch|grep|tail|head|jq|java|python3?|pip|apt|systemctl|watch|find|tar|unzip|sed|awk|\.\/|[A-Z_][A-Z0-9_]*=)/;
  function tipoBloque(txt) {
    const lineas = txt.split("\n").map((l) => l.trim()).filter(Boolean);
    const primera = lineas[0] || "";
    const util = lineas.find((l) => !l.startsWith("#")) || "";
    if (/^#!.*(bash|sh)/.test(primera)) return { titulo: "Script bash" };
    if (/^(FROM|ARG) /.test(util)) return { titulo: "Dockerfile" };
    if (/^(pipeline\s*\{|stage\(|node\s*\{)/.test(util)) return { titulo: "Jenkinsfile" };
    if (/^(const|let|var|function|import|module\.|\/\/|require\()/.test(util)) return { titulo: "JavaScript" };
    if (/^[{\[]/.test(util)) return { titulo: "JSON" };
    if (/^\[[\w.-]+\]$/.test(util) || /^[\w.-]+\s*=\s*\S/.test(util) && !COMANDOS.test(util)) return { titulo: "Configuración" };
    if (COMANDOS.test(util)) return { titulo: "alumno@lab5168: ~", terminal: true };
    return { titulo: "Texto" };
  }
  function pintarTerminal(txt) {
    let sigue = false, heredoc = null;
    return txt.split("\n").map((l) => {
      const e = esc(l);
      if (heredoc) { if (l.trim() === heredoc) heredoc = null; return `<span class="t-salida">${e}</span>`; }
      const hd = l.match(/<<-?\s*['"]?(\w+)['"]?/);
      let html;
      if (!l.trim()) html = e;
      else if (sigue || /^\s/.test(l)) html = `<span class="t-cont">${e}</span>`;
      else if (l.trim().startsWith("#")) html = `<span class="t-com">${e}</span>`;
      else if (COMANDOS.test(l.trim())) {
        const partes = e.match(/^(.*?)(\s{2,}#.*)?$/);
        html = `<span class="t-prompt" aria-hidden="true"><span class="t-user">alumno@lab5168</span>:<span class="t-ruta">~</span>$ </span><span class="t-cmd">${partes[1]}</span>${partes[2] ? `<span class="t-com">${partes[2]}</span>` : ""}`;
      } else html = `<span class="t-salida">${e}</span>`;
      sigue = /\\\s*$/.test(l);
      if (hd) heredoc = hd[1];
      return html;
    }).join("\n");
  }

  /* ---------- Páginas de sesión ---------- */
  function mejorarSesion() {
    const main = document.querySelector("main.contenido");
    if (!main) return;
    const m = location.pathname.match(/ut0?(\d+)\/sesion(\d+)/);

    // Línea de navegación "← Sesión 1 · Índice · Sesión 3 →"
    const p1 = main.querySelector(":scope > p");
    if (p1 && p1.querySelectorAll("a").length && /Sesión|Índice/.test(p1.textContent) && p1.textContent.length < 120) p1.classList.add("nav-ses");

    // Título largo: separar "Módulo 5168 ..." de "Sesión N — ..."
    const h1 = main.querySelector("h1");
    if (h1) {
      const t = h1.textContent.match(/^(.*?)\s·\s(Sesión.*)$/);
      if (t) h1.innerHTML = `<span class="h1-mod">${esc(t[1])}</span>${esc(t[2])}`;
    }

    if (m) {
      const ut = Number(m[1]), n = Number(m[2]);
      const s = SESIONES.find((x) => x.ut === ut && x.n === n);
      if (s) {
        const r = rango[ut + "-" + n];
        const dias = fechasClase.filter((k) => clases[k].s === s).map((k) => largo(aFecha(k)));
        const cab = document.createElement("div");
        cab.className = "ses-cab";
        cab.innerHTML = `<p class="ses-fecha">${dias.length ? "Se trabaja el " + dias.join(" y el ") : "Sin fecha asignada"} · ${esc(s.criterio)}</p>` + pipeline(ut, s);
        (h1 || main.firstChild).after(cab);
        centrarPipe(cab);
        document.title = `Sesión ${n}: ${s.titulo} | 5168`;
      }
    }

    // Bloques de código como ventanas de terminal o de editor
    main.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code") || pre;
      const txt = code.textContent.replace(/\n$/, "");
      const limpio = txt.trim();
      const caja = pre.closest(".highlighter-rouge") || pre;
      if (/^(flowchart|graph|sequenceDiagram|gitGraph|stateDiagram|classDiagram)\b/.test(limpio)) {
        const d = document.createElement("div");
        d.className = "mermaid"; d.textContent = limpio;
        caja.replaceWith(d);
        return;
      }
      const tipo = tipoBloque(txt);
      if (tipo.terminal) code.innerHTML = pintarTerminal(txt);
      const ventana = document.createElement("figure");
      ventana.className = "term" + (tipo.terminal ? " es-terminal" : " es-archivo");
      const barra = document.createElement("figcaption");
      barra.className = "term-barra";
      barra.innerHTML = `<span class="term-botones" aria-hidden="true"><i></i><i></i><i></i></span><span class="term-titulo">${esc(tipo.titulo)}</span>`;
      const b = document.createElement("button");
      b.className = "copiar"; b.type = "button"; b.textContent = "Copiar";
      b.onclick = async () => {
        try { await navigator.clipboard.writeText(txt); b.textContent = "Copiado"; }
        catch (e) { b.textContent = "Selecciónalo y copia"; }
        setTimeout(() => (b.textContent = "Copiar"), 1600);
      };
      barra.appendChild(b);
      caja.before(ventana);
      ventana.append(barra, pre);
      if (caja !== pre) caja.remove();
    });

    // Tablas anchas con scroll propio
    main.querySelectorAll("table").forEach((t) => {
      const w = document.createElement("div"); w.className = "tabla"; t.before(w); w.appendChild(t);
    });

    // Diagramas Mermaid
    if (main.querySelector(".mermaid")) {
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js";
      sc.onload = () => {
        const oscuro = matchMedia("(prefers-color-scheme: dark)").matches;
        window.mermaid.initialize({ startOnLoad: false, theme: oscuro ? "dark" : "neutral" });
        window.mermaid.run({ querySelector: ".mermaid" });
      };
      document.body.appendChild(sc);
    }
  }

  pintarHoy();
  pintarPipelinePortada();
  pintarCalendario();
  pintarUnidades();
  mejorarSesion();
})();
