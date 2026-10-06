[← Sesión 1](sesion1.md) · [Índice de la UT01](./) · [Sesión 3 →](sesion3.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 2 — Calidad de código

**Objetivo.** Al terminar, sabrás qué es el análisis estático de código, instalarás SonarQube en tu equipo y analizarás con él la aplicación de la sesión 1. Sabrás interpretar los issues que detecta, decidir de forma razonada si se corrigen o se aceptan, y entenderás qué es un Quality Gate. Es la pieza que, más adelante, el pipeline de Jenkins usará para impedir que llegue a producción código que no cumpla unos mínimos de calidad.

**Entorno de trabajo.** Se continúa con el laboratorio local de la sesión 1 (Docker y Gitea en tu ordenador, red `lab5168`) y con el repositorio `saludo-app`. Hoy se añade un contenedor de SonarQube a la misma red.

### Preparación previa

**1. Descargar las imágenes.** La de SonarQube pesa bastante; la del escáner se usa en la práctica.

```
docker pull sonarqube:community
docker pull sonarsource/sonar-scanner-cli
```

**Sobre la etiqueta de la imagen.** La etiqueta `sonarqube:lts-community` corresponde a la versión 9.9, que ya no recibe actualizaciones: SonarSource dejó de publicarla al cambiar su modelo de versiones. La versión gratuita actual se llama *SonarQube Community Build* y su etiqueta es `sonarqube:community`.

**2. Comprobar la memoria.** SonarQube lleva dentro un motor de búsqueda (Elasticsearch) y necesita unos 2 GB de RAM libres para el contenedor. En Docker Desktop (Windows y macOS) hay que revisar que la memoria asignada a Docker sea de al menos 4 GB.

**3. Solo en Linux: límite de memoria virtual.** Elasticsearch exige que el sistema permita un número alto de áreas de memoria mapeada. Si no, el contenedor se para a los pocos segundos. Se comprueba y se ajusta así:

```
sysctl vm.max_map_count          # debe ser 524288 o más
sudo sysctl -w vm.max_map_count=524288
```

El cambio con `sysctl -w` se pierde al reiniciar. Para hacerlo permanente, añade la línea

`vm.max_map_count=524288` a `/etc/sysctl.conf`.

## 4.1 Teoría

## Por qué la calidad de código forma parte del despliegue continuo

En la sesión 1 vimos que, en despliegue continuo, lo que llega a la rama principal acaba en producción sin que nadie lo revise a mano antes de publicarlo. Eso obliga a que las comprobaciones de calidad también sean automáticas. Las pruebas comprueban que el código *hace lo que debe*. El análisis estático comprueba *cómo está escrito*: si tiene errores probables, riesgos de seguridad o partes difíciles de mantener.

El objetivo es detectar los problemas lo antes posible. Un defecto encontrado mientras se escribe el código cuesta minutos; el mismo defecto encontrado en producción puede costar días y clientes. A esta idea se le llama *shift left*: mover las comprobaciones hacia el principio del proceso.

### Análisis estático frente a análisis dinámico

El **análisis estático** examina el código fuente **sin ejecutarlo**. La herramienta lee el código, construye una representación de su estructura y le aplica un conjunto de reglas. Por ejemplo: "una variable declarada y nunca usada", "una condición que siempre es verdadera", "una contraseña escrita directamente en el código".

El **análisis dinámico** observa el programa **mientras se ejecuta**: pruebas unitarias, pruebas de integración o herramientas que atacan una aplicación en marcha. Los dos se complementan. El estático es rápido y revisa todo el código, incluidas ramas que las pruebas nunca recorren; pero no sabe qué debería hacer el programa, y a veces avisa de cosas que no son problemas reales (falsos positivos).

### Qué es SonarQube

SonarQube es una plataforma de análisis estático que admite una treintena de lenguajes. Tiene dos piezas:

- **El servidor**, con interfaz web en el puerto 9000. Guarda los resultados de cada análisis, las reglas y la configuración, y muestra los problemas encontrados.
- **El escáner** (`sonar-scanner`), que se ejecuta donde está el código: en el ordenador del desarrollador o, más adelante, en Jenkins. Analiza los ficheros y envía los resultados al servidor.

El escáner se identifica ante el servidor con un **token**, una clave generada desde la interfaz web. Así no hace falta escribir usuario y contraseña en los scripts.

### Qué detecta: los tipos de issue

Cada problema encontrado se llama *issue*. SonarQube los clasifica según la cualidad del software a la que afectan:

| Tipo                 | Cualidad afectada     | Ejemplo                                                            |
|----------------------|-----------------------|--------------------------------------------------------------------|
| **Bug**              | Fiabilidad            | Comparar un valor consigo mismo, una condición que nunca se cumple |
| **Vulnerabilidad**   | Seguridad             | Construir una consulta SQL concatenando datos del usuario          |
| **Code smell**       | Mantenibilidad        | Variables sin usar, funciones demasiado complejas, código muerto   |
| **Security hotspot** | Seguridad (a revisar) | Una contraseña en el código, uso de `Math.random()`                |

Los **security hotspots** merecen una aclaración: no son errores seguros, sino fragmentos sensibles que una persona debe revisar. Usar `Math.random()` para un sorteo en un juego es correcto; usarlo para generar un token de sesión, no. La herramienta no puede saberlo, así que marca el punto y pide una decisión.

Cada issue lleva además una **severidad** (de mayor a menor impacto: *blocker*, *high/critical*, *medium/major*, *low/minor*, *info*). Las versiones recientes muestran estas categorías con nombres algo distintos según el modo de la interfaz, pero la idea es la misma.

Aparte de los issues, SonarQube mide:

- **Duplicación**: porcentaje de líneas repetidas en varios sitios. El código duplicado obliga a corregir el mismo error varias veces.
- **Cobertura**: porcentaje del código que recorren las pruebas automáticas. SonarQube no ejecuta las pruebas; lee el informe que generan otras herramientas. Hoy no tendremos cobertura: lo veremos cuando el pipeline ejecute pruebas.
- **Deuda técnica**: estimación del tiempo necesario para corregir todos los *code smells*. Se traduce en una nota de mantenibilidad de A a E.

### Quality Profile y Quality Gate

Dos conceptos que se confunden a menudo:

- El **Quality Profile** es el **conjunto de reglas** que se aplica a un lenguaje: qué se comprueba. SonarQube trae uno por defecto para cada lenguaje, llamado *Sonar way*.
- El **Quality Gate** es el **conjunto de condiciones mínimas** que debe cumplir el resultado del análisis: qué se exige. El resultado es binario: *Passed* (aprobado) o *Failed* (suspendido).

Una condición típica de Quality Gate sería: "ningún bug nuevo", "cobertura del código nuevo de al menos el 80 %" o "duplicación del código nuevo por debajo del 3 %". Es la pieza que conecta con el despliegue continuo: en unas semanas, Jenkins consultará el Quality Gate y **detendrá el pipeline si sale suspendido**, igual que lo detendría una prueba fallida.

### Código nuevo frente a código existente

El Quality Gate por defecto (*Sonar way*) se fija sobre todo en el **código nuevo**: lo que ha cambiado desde la versión anterior o en los últimos días, según se configure. La filosofía se conoce como *Clean as You Code*: no se exige arreglar de golpe todos los problemas heredados de un proyecto antiguo, pero sí que todo lo que se escriba a partir de ahora esté limpio. Así la calidad mejora poco a poco sin paralizar al equipo.

Consecuencia práctica, que veremos hoy: en el **primer análisis** de un proyecto no hay versión anterior con la que comparar, así que es habitual que el gate *Sonar way* salga aprobado aunque haya issues. Por eso en la práctica crearemos un Quality Gate propio con condiciones sobre el código total.

### Qué hacer con un issue

No todo issue se corrige sin pensar. Ante cada uno hay tres opciones, y la decisión debe quedar justificada en un comentario:

- **Corregirlo** en el código. Es lo normal para bugs y vulnerabilidades.
- **Aceptarlo**: es real, pero se decide no corregirlo por ahora (por ejemplo, código que se va a eliminar en breve). Queda registrado como deuda asumida.
- **Marcarlo como falso positivo**: la regla no aplica en este caso concreto y se explica por qué.

Marcar issues como falsos positivos para aprobar el Quality Gate es hacer trampa, y en un equipo real se detecta en la revisión. La justificación es lo que se evalúa en el entregable.

## 4.2 Arranque de SonarQube

### Paso 1. Lanzar el contenedor

```
docker run -d --name sonarqube \
  -p 9000:9000 \
  --network lab5168 \
  -v sonarqube_data:/opt/sonarqube/data \
  -v sonarqube_extensions:/opt/sonarqube/extensions \
  --restart unless-stopped \
  sonarqube:community
```

Como en la sesión 1 con Gitea, los volúmenes conservan los proyectos y la configuración, aunque se borre el contenedor, y la red `lab5168` permitirá que el escáner (y más adelante Jenkins) encuentren el servidor por su nombre, `sonarqube`. La imagen usa una base de datos interna (H2) que no sirve para producción, pero es suficiente para el aula.

### Paso 2. Esperar a que arranque

El primer arranque tarda entre uno y tres minutos. Para seguirlo:

```
docker logs -f sonarqube
```

Cuando aparezca la línea `SonarQube is operational`, sal con `Ctrl+C` (el contenedor sigue funcionando). Si el contenedor se detiene solo, revisa la memoria y, en Linux, `vm.max_map_count` (ver *Preparación previa*).

### Paso 3. Primer acceso

Abre `http://localhost:9000` y entra con el usuario `admin` y la contraseña `admin`. SonarQube obliga a cambiarla en el primer acceso; apúntala, porque la necesitaréis en las próximas sesiones.

### Paso 4. Crear el proyecto y el token

1. En la página inicial, elige crear un **proyecto local** (*Create a local project*).
2. Nombre y clave del proyecto: `modulo5168-app`. Rama principal: `main`.
3. En la definición de código nuevo, deja la opción global por defecto.
4. Como método de análisis, elige **Localmente** (*Locally*) y genera un **token**. Copia el valor en un sitio seguro: **solo se muestra una vez**.

El token es una credencial: no se sube al repositorio ni se pega en capturas. Si se pierde, se revoca y se genera otro desde *My Account → Security*.

## 4.3 Práctica — Análisis y revisión de issues

**Objetivo:** analizar `saludo-app` con SonarQube, provocar que un Quality Gate salga suspendido, revisar los issues de forma justificada y volver a analizar hasta aprobarlo.

### Paso 1. Añadir código con defectos

El `server.js` de la sesión 1 es tan pequeño que SonarQube apenas encontrará nada. Para tener material que revisar, añadimos un fichero con defectos puestos a propósito. En una rama nueva:

```
cd saludo-app
git checkout main && git pull
git checkout -b feature/utilidades
```

Crea el fichero `utils.js`:

```
// Funciones auxiliares. Contiene defectos a propósito para la práctica.
const DB_PASSWORD = "admin1234";

function formatearNombre(nombre) {
  var resultado = nombre.trim();
  const sinUsar = 42;
  if (resultado.length > 0) {
    return resultado.charAt(0).toUpperCase() + resultado.slice(1);
  } else if (resultado.length > 0) {
    return resultado;
  }
  return resultado;
}

function generarIdSesion() {
  return Math.random().toString(36).substring(2);
}

function esNombreValido(nombre) {
  if (nombre == null) return false;
  return nombre === nombre;
}

module.exports = { formatearNombre, generarIdSesion, esNombreValido, DB_PASSWORD };
```

Haz el commit con formato convencional:

```
git add utils.js
git commit -m "feat: añade funciones auxiliares de nombres y sesión"
```

### Paso 2. Configurar el análisis

En lugar de escribir todos los parámetros en la línea de comandos, se guardan en un fichero `sonar-project.properties` en la raíz del repositorio:

```
sonar.projectKey=modulo5168-app
sonar.projectName=modulo5168-app
sonar.sources=.
sonar.exclusions=node_modules/**,.scannerwork/**
sonar.sourceEncoding=UTF-8
```

El token **no** va en este fichero, porque se va a subir al repositorio. Se pasa aparte al lanzar el análisis.

Añade también al `.gitignore` la carpeta temporal que crea el escáner:

```
echo ".scannerwork/" >> .gitignore
git add sonar-project.properties .gitignore
git commit -m "ci: añade configuración de análisis de SonarQube"
```

### Paso 3. Lanzar el análisis

Para no tener que instalar `sonar-scanner` en cada equipo, lo ejecutamos desde su imagen de Docker, conectada a la red del laboratorio. Desde la carpeta del repositorio:

```
docker run --rm \
  --network lab5168 \
  -v "$(pwd):/usr/src" \
  sonarsource/sonar-scanner-cli \
  -Dsonar.host.url=http://sonarqube:9000 \
  -Dsonar.token=<TOKEN>
```

En PowerShell (Windows), sustituye `$(pwd)` por `${PWD}` y las barras invertidas del final de línea por el acento grave (`` ` ``), o escribe el comando en una sola línea.

- La URL es `http://sonarqube:9000` y no `localhost`. Dentro de un contenedor, `localhost` es el propio contenedor, no tu ordenador; por eso el escáner encuentra el servidor por su nombre en la red `lab5168`.
- El token se pasa con `sonar.token`. El parámetro antiguo `sonar.login` está obsoleto desde SonarQube 10.

Si preferís instalar `sonar-scanner` en local, el comando es el mismo sin la parte de Docker y con `sonar.host.url=http://localhost:9000`.

El análisis termina con `EXECUTION SUCCESS` y un enlace al panel del proyecto.

### Paso 4. Explorar los resultados

En `http://localhost:9000`, abre el proyecto `modulo5168-app` y recorre:

- **Overview**: estado del Quality Gate y resumen por cualidad (fiabilidad, seguridad, mantenibilidad), duplicación y cobertura.
- **Issues**: la lista de problemas. Al abrir uno, SonarQube muestra la línea afectada, explica por qué la regla existe y cómo corregirlo.
- **Security Hotspots**: los puntos sensibles pendientes de revisar.
- **Code**: el código con los issues marcados en su línea.

¿Qué dice el Quality Gate? Lo más probable es que *Sonar way* aparezca **aprobado** a pesar de los issues. Es lo que vimos en la teoría: en el primer análisis no hay código nuevo con el que comparar.

### Paso 5. Crear un Quality Gate propio

Para que el gate controle también el código existente, cread uno nuevo:

1. Menú **Quality Gates → Create**. Nombre: `Aula 5168`.
2. Añadid condiciones sobre el **código total** (*Overall Code*):
   - Nota de fiabilidad (*Reliability Rating*) peor que **A**.
   - Porcentaje de *Security Hotspots* revisados menor que **100 %**.
3. Asignadlo al proyecto: en el proyecto, **Project Settings → Quality Gate**, elegid `Aula 5168`.

Volved a lanzar el análisis (mismo comando del paso 3). Ahora el Quality Gate debe salir **suspendido** (*Failed*), indicando qué condiciones no se cumplen.

### Paso 6. Revisar issues y volver a analizar

Ahora hay que conseguir que el gate apruebe, pero **decidiendo con criterio** qué se hace con cada problema:

1. **Bugs**: corregidlos en `utils.js`. Son errores reales; no tiene sentido aceptarlos.
2. **Security Hotspots**: revisad cada uno y elegid su estado con un comentario que lo justifique. Por ejemplo, la contraseña debe salir del código (leerla con `process.env.DB_PASSWORD`) y marcarse como corregida; `Math.random()` para un identificador de sesión no es seguro y debe sustituirse por `crypto.randomUUID()`.
3. **Code smells**: corregid los que sean fáciles. Si decidís aceptar alguno, dejadlo marcado como **aceptado** con un comentario que explique por qué.

Para cambiar el estado de un issue, abridlo y usad el desplegable de estado; el comentario se añade en el propio issue.

Tras las correcciones, haced commit y volved a analizar:

```
git commit -am "fix: corrige defectos detectados por SonarQube en utils"
```

El Quality Gate debería salir **aprobado** (*Passed*). Para terminar, fusionad la rama en `main` como en la sesión 1 (con `--no-ff`) y subidla a Gitea.

**Entregable:** captura del Quality Gate aprobado y captura de al menos un issue o hotspot revisado donde se vea su estado y el comentario con la justificación. Se valora también la captura del gate suspendido del paso 5. El token no debe aparecer en ninguna captura.

**Para pensar:** ¿qué pasaría si, para aprobar el gate, alguien marcara todos los issues como falsos positivos? ¿Cómo lo detectaría el equipo?

---

[← Sesión 1](sesion1.md) · [Índice de la UT01](./) · [Sesión 3 →](sesion3.md)
