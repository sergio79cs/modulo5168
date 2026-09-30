/* =====================================================================
   CALENDARIO DEL MÓDULO 5168
   Este es el ÚNICO archivo que hay que tocar para cambiar fechas.
   El calendario coloca las sesiones solo, en orden, en los días de
   clase, saltándose los días no lectivos.
   ===================================================================== */

const CONFIG = {
  // Primer y último día en que puede haber clase (año-mes-día)
  // Inicio del curso de especialización y último día antes de la FE
  inicio: "2026-10-01",
  fin: "2027-04-16",

  // Días de la semana con clase: 1 = lunes, 2 = martes, 3 = miércoles,
  // 4 = jueves, 5 = viernes. Martes 3 h y jueves 2 h (114 h en el centro).
  diasClase: [2, 4],

  // Mientras sea true, la web muestra un aviso de "fechas provisionales".
  // Ponlo en false cuando las fechas sean las definitivas.
  provisional: false
};

// Días sin clase. Un día suelto: "2026-10-12".
// Un periodo: ["2026-12-23", "2027-01-06", "Vacaciones de Navidad"].
// Sacados del calendario oficial del centro 2026-2027 (pestaña CE).
const NO_LECTIVOS = [
  ["2026-10-09", "2026-10-09", "9 d'Octubre"],
  ["2026-10-12", "2026-10-12", "Festivo"],
  ["2026-12-08", "2026-12-08", "Festivo"],
  ["2026-12-22", "2027-01-06", "Navidad"],
  ["2027-03-01", "2027-03-05", "Magdalena"],
  ["2027-03-19", "2027-03-19", "San José"],
  ["2027-03-25", "2027-04-02", "Pascua"]
];

// Avisos que se marcan en el calendario (no quitan la clase de ese día)
const EVENTOS = [
  { fecha: "2026-10-01", texto: "Inicio del curso" },
  { fecha: "2027-04-19", texto: "Empiezan las prácticas en empresa" }
];

// Sesiones en el orden en que se dan.
//   dias:  cuántos días de clase ocupa la sesión (1, 2, 3...)
//   desde: (opcional) fecha a partir de la cual empieza esta sesión,
//          por si quieres dejar huecos o fijarla a un día concreto.
const UNIDADES = [
  { ut: 1, titulo: "Del código al artefacto", ra: "RA1", url: "ut01/" },
  { ut: 2, titulo: "Material en preparación", ra: "RA2", url: null },
  { ut: 3, titulo: "Material en preparación", ra: "RA3", url: null },
  { ut: 4, titulo: "Material en preparación", ra: "RA4", url: null }
];

const SESIONES = [
  { ut: 1, n: 1, corto: "Git",         titulo: "Git avanzado",                                    criterio: "RA1.a",   url: "ut01/sesion1.html", dias: 1 },
  { ut: 1, n: 2, corto: "Calidad",     titulo: "Calidad de código",                               criterio: "RA1.b",   url: "ut01/sesion2.html", dias: 1 },
  { ut: 1, n: 3, corto: "Docker I",    titulo: "Docker I: imágenes, contenedores y caché de capas", criterio: "RA1.c", url: "ut01/sesion3.html", dias: 1 },
  { ut: 1, n: 4, corto: "Docker II",   titulo: "Docker II: builds multietapa",                    criterio: "RA1.c",   url: "ut01/sesion4.html", dias: 1 },
  { ut: 1, n: 5, corto: "Paquete",     titulo: "Comprobación del paquete",                        criterio: "RA1.d",   url: "ut01/sesion5.html", dias: 1 },
  { ut: 1, n: 6, corto: "Pruebas",     titulo: "Pruebas funcionales y no funcionales",            criterio: "RA1.e",   url: "ut01/sesion6.html", dias: 1 },
  { ut: 1, n: 7, corto: "Resultados",  titulo: "Almacenamiento de resultados de pruebas",         criterio: "RA1.f",   url: "ut01/sesion7.html", dias: 1 },
  { ut: 1, n: 8, corto: "Registro",    titulo: "Versionado semántico y registro",                 criterio: "RA1.g",   url: "ut01/sesion8.html", dias: 1 },
  { ut: 1, n: 9, corto: "Integradora", titulo: "Práctica integradora",                            criterio: "RA1.a–g", url: "ut01/sesion9.html", dias: 1 }
];
