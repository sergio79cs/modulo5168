[← Índice de la UT01](./)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Resumen de la UT01

Vale, vamos a poner un poco de orden. Sé que a estas alturas muchos andáis pensando «¿qué hemos hecho hasta ahora?». Es normal: hemos tocado Git, SonarQube, Docker, scripts, pruebas, Jenkins… y todo en pocas semanas. Este documento es para que veáis el **mapa completo** y entendáis por qué hicimos cada cosa. Leedlo de arriba abajo, con calma, y luego volved a las sesiones concretas cuando os haga falta.

## 1. Lo primero: ¿qué estamos montando?

En **despliegue continuo** (CD), cuando alguien sube código a la rama principal, ese código **llega a producción solo**, sin que nadie lo revise a mano. Suena a locura, ¿verdad? Pues funciona, **siempre que todo lo que haría una persona lo haga una máquina**: revisar el código, construirlo, probarlo, ponerle número de versión y publicarlo.

Eso es la UT01: ir construyendo, pieza a pieza, esa **cadena automática**. Y en la última sesión la juntamos entera en un único pipeline de Jenkins.

**El resultado de aprendizaje (RA1), traducido:** saber crear el paquete de software que se va a desplegar, partiendo de una versión estable del código, y asegurarnos de que cumple unos mínimos de calidad y seguridad y que podemos **rastrear** de dónde ha salido.

> **Trazabilidad** = poder contestar siempre a «esto que está funcionando en producción, ¿de qué código sale y quién lo ha probado?».

### El mapa de las 9 sesiones

| Sesión | Tema | Qué se trabaja | RA |
|---|---|---|---|
| 1 | Git avanzado | Ramas, merge, rebase, tags y commits convencionales | RA1.a |
| 2 | Calidad de código | SonarQube y Quality Gate | RA1.b |
| 3 | Docker I | Imágenes, contenedores, Dockerfile y caché de capas | RA1.c |
| 4 | Docker II | Builds multietapa e imagen mínima | RA1.c |
| 5 | Comprobación del paquete | Registry, install.sh, migración de datos y rollback | RA1.d |
| 6 | Pruebas funcionales y no funcionales | Códigos de salida, pruebas de API y de carga | RA1.e |
| 7 | Almacenamiento de resultados | Guardar, comparar y decidir si se publica | RA1.f |
| 8 | Versionado semántico y registro | SemVer, tags y publicación desde Jenkins | RA1.g |
| 9 | Práctica integradora | El pipeline completo | RA1.a–g |

Hemos trabajado siempre con **la misma aplicación**: una API sencilla en Node.js con Express (`saludo-app`, que luego pasa a llamarse `modulo5168-app`). Así no os distraéis con el código y os centráis en el proceso.

## 2. Sesión 1 · Git avanzado

### Qué problema resuelve

El repositorio es la **única fuente de verdad**: lo que esté en la rama principal acabará en producción. Así que hay que ser muy ordenados: cómo creamos ramas, cómo juntamos cambios sin romper nada, cómo marcamos una versión y cómo describimos cada cambio **para que lo entienda una máquina**.

### Lo que tenéis que tener claro

- **Rama:** ojo, no es una copia del código. Es un **puntero** que señala un commit. Crearla es instantáneo y no cuesta nada. `HEAD` es «dónde estoy yo ahora».
- **Tipos de rama según para qué sirven:**
  - `main`: siempre tiene que funcionar. Nadie toca directamente ahí.
  - `feature/...`: para desarrollar algo nuevo sin molestar a nadie.
  - `release/...`: para dejar a punto una versión antes de publicarla.
  - `hotfix/...`: para un arreglo urgente de algo que ya está en producción.
- **Estrategias de ramas:**
  - **Git Flow:** muchas ramas que viven mucho tiempo. Muy ordenado, pero lento y con fusiones enormes. Va justo en contra del despliegue continuo.
  - **GitHub Flow:** solo `main` y ramas cortas que se integran con Pull Request. Sencillo y encaja bien con CD.
  - **Trunk-based:** todo el mundo integra en `main` como mínimo una vez al día. Es la que mejor encaja con CD, pero exige muy buenas pruebas automáticas y *feature flags* (interruptores para esconder lo que está a medio hacer).
- **Merge:** une dos ramas con un **commit de fusión**. Conserva lo que pasó de verdad. Con `--no-ff` obligas a que siempre quede ese commit y se vea que hubo una rama.
- **Rebase:** en vez de unir, **recoloca tus commits encima del último de `main`**. Queda una línea recta muy limpia, pero **reescribes la historia**.
  - **Regla de oro:** nunca hagas rebase de commits que ya hayan visto otras personas.
  - Si después el `push` normal te lo rechaza, usa `git push --force-with-lease`. **Nunca `--force` a secas**, que te puedes cargar el trabajo de un compañero.
- **Conflicto:** pasa cuando dos ramas tocan **las mismas líneas** de forma distinta. Git te marca el fichero con `<<<<<<<`, `=======` y `>>>>>>>`. Tú decides qué se queda, borras las marcas, haces `git add` y continúas (`git rebase --continue` o `git merge --continue`). Si te lías: `--abort` y vuelves al principio.
- **Etiqueta (tag):** un nombre fijo para un commit, normalmente una versión (`git tag -a v1.1.0 -m "..."`). **Ojo:** `git push` no sube las etiquetas si no pones `--tags`. Es el error más típico.

### Versionado semántico (SemVer): `MAYOR.MENOR.PARCHE`

| Parte | Sube cuando… | Ejemplo |
|---|---|---|
| MAYOR | Rompes la compatibilidad (quien lo usaba tiene que cambiar cosas) | 1.4.7 pasa a 2.0.0 |
| MENOR | Añades funcionalidad que sigue siendo compatible | 1.4.7 pasa a 1.5.0 |
| PARCHE | Arreglas un error sin cambiar lo que se espera | 1.4.7 pasa a 1.4.8 |

Cuando sube un número, **los de su derecha vuelven a cero**.

### Commits convencionales

Formato: `tipo(ámbito opcional): descripción`. Por ejemplo, `feat(api): añade endpoint de búsqueda`.

| Tipo | Significa | Efecto en la versión |
|---|---|---|
| `feat` | Funcionalidad nueva | Sube MENOR |
| `fix` | Arreglo de un error | Sube PARCHE |
| `docs`, `style`, `refactor`, `test`, `chore`, `ci` | Documentación, formato, reestructurar, pruebas, mantenimiento, pipeline | No cambian la versión |
| `!` tras el tipo, o `BREAKING CHANGE:` | Cambio incompatible | Sube MAYOR |

**¿Para qué tanto lío con los mensajes?** Porque herramientas como *semantic-release* leen los commits y **calculan solas la siguiente versión**. Un mensaje tipo «cambios» o «arreglos» no sirve para automatizar nada.

### Lo que hicimos en la práctica

1. Levantamos **Gitea** (nuestro Git local) en un contenedor Docker.
2. **Práctica 1:** rama `feature/saludo-personalizado`, merge con `--no-ff`, etiquetas `v1.0.0` y `v1.1.0` y el grafo con `git log --oneline --graph --all`.
3. **Práctica 2:** provocamos un **conflicto de verdad** entre dos personas y lo resolvimos con un rebase.
4. **Práctica 3:** cuatro commits convencionales (`feat`, `fix`, `chore`, `docs`) y la pregunta de qué versión sale. Respuesta: **v1.2.0**.
5. **Debate:** ¿qué estrategia de ramas elegir? Para un equipo pequeño y un solo entorno, GitHub Flow.

### Errores típicos

- Hacer commits directamente en `main` sin darte cuenta.
- Olvidar `--tags` al subir.
- Dejar las marcas `<<<<<<<` dentro del fichero tras resolver un conflicto.
- Usar `--force` en vez de `--force-with-lease`.
- Clonar desde el Gitea de otro compañero con `localhost` en vez de con su IP.

## 3. Sesión 2 · Calidad de código (SonarQube)

### Qué problema resuelve

Si nadie revisa el código a mano, necesitamos que **lo revise una herramienta**. Las pruebas comprueban *qué hace* el código; el análisis estático comprueba *cómo está escrito*.

### Lo que tenéis que tener claro

- **Análisis estático:** mirar el código **sin ejecutarlo**. Pilla variables sin usar, contraseñas escritas a pelo, condiciones que nunca se cumplen…
- **Shift left:** detectar los problemas lo antes posible. Un fallo que pillas al escribirlo cuesta nada; en producción cuesta un montón.
- **SonarQube** tiene dos partes:
  - **El servidor:** la web (puerto 9000) donde se ven los resultados.
  - **El escáner (`sonar-scanner`):** el programa que analiza tu código y manda el resultado al servidor.
  - **El token:** la «contraseña» con la que el escáner se identifica. **Solo se muestra una vez y nunca se sube al repositorio ni sale en capturas.**

### Tipos de problema (*issues*)

| Tipo | Afecta a | Ejemplo |
|---|---|---|
| **Bug** | Fiabilidad | Comparar un valor consigo mismo |
| **Vulnerabilidad** | Seguridad | Montar una consulta SQL pegando datos del usuario |
| **Code smell** | Mantenibilidad | Variables sin usar, código muerto |
| **Security hotspot** | Seguridad (a revisar) | Contraseña en el código, uso de `Math.random()` |

Un **hotspot** no es un error seguro: es un punto delicado que **una persona tiene que revisar y decidir**.

### Otras ideas importantes

- **Quality Profile:** las reglas que se aplican (**qué se comprueba**).
- **Quality Gate:** las condiciones mínimas para aprobar (**qué se exige**). Solo hay dos resultados: **Passed** o **Failed**. Es la puerta que para el pipeline si el código no llega al mínimo.
- **Clean as You Code:** no te obligan a arreglar todo lo antiguo de golpe, pero **lo nuevo que escribas tiene que estar limpio**.
- **Qué hacer con un issue:** corregirlo, aceptarlo (justificándolo) o marcarlo como falso positivo (justificándolo). Marcar todo como falso positivo solo para aprobar es **hacer trampa**, y en un equipo real se nota.

### Lo que hicimos en la práctica

1. Arrancamos SonarQube en un contenedor, dentro de la red Docker `lab5168`.
2. Añadimos un `utils.js` con **defectos a propósito** (contraseña escrita, `Math.random()`, comparación absurda…).
3. Configuramos `sonar-project.properties` y lanzamos el escáner desde su imagen Docker (con la URL `http://sonarqube:9000`, **no** `localhost`).
4. Creamos un Quality Gate propio, `Aula 5168`, que **suspendió** el proyecto.
5. Corregimos los bugs y los hotspots (la contraseña desde `process.env`, `crypto.randomUUID()`), justificamos lo que aceptamos y volvimos a analizar hasta **aprobar**.

## 4. Sesión 3 · Docker I: imágenes, contenedores y caché

### Qué problema resuelve

El clásico «en mi ordenador funciona». Cada máquina tiene su versión de Node, sus variables, su sistema operativo… Un **contenedor empaqueta la aplicación con todo lo que necesita**, y esa misma caja viaja sin cambios por todo el pipeline.

### Contenedor frente a máquina virtual

| | Máquina virtual | Contenedor |
|---|---|---|
| Qué virtualiza | Todo el hardware | Solo procesos aislados |
| Núcleo (kernel) | El suyo | Comparte el del equipo |
| Tamaño | GB | MB |
| Arranque | Lento | Casi instantáneo |

Un contenedor **no es una mini-máquina, es un proceso aislado**. Cuando termina su proceso principal, el contenedor se para.

### Los cuatro conceptos que hay que tener claros

- **Imagen:** plantilla de solo lectura con todo lo necesario para ejecutar la app.
- **Contenedor:** una instancia en marcha de una imagen. De una imagen salen tantos contenedores como quieras.
- **Capa (layer):** cada instrucción del Dockerfile que toca ficheros crea una capa. La imagen es una pila de capas.
- **Registry:** el almacén donde se guardan las imágenes (Docker Hub, el de Gitea…).

Y cuatro propiedades que conviene grabarse:

1. Las capas se **comparten** entre imágenes.
2. Los contenedores son **efímeros**: lo que escribas dentro desaparece al borrarlos (para datos permanentes, volúmenes).
3. Las capas son **inmutables**: borrar un fichero en una capa posterior no reduce el tamaño.
4. Los **tags** identifican versiones (`modulo5168-app:v1.2.0`). **Evita `latest`**: no sabes qué versión estás ejecutando.

### El Dockerfile, línea a línea

```
FROM node:20                            # parto de una imagen que ya trae Node
WORKDIR /app                            # carpeta de trabajo
COPY package.json package-lock.json ./  # copio solo la lista de dependencias
RUN npm ci --omit=dev                   # instalo dependencias (al CONSTRUIR)
COPY server.js ./                       # copio mi código
ENV PORT=3000                           # variable de entorno
EXPOSE 3000                             # documento el puerto
CMD ["node", "server.js"]               # comando al ARRANCAR el contenedor
```

- Las que **añaden contenido** (y crean capas): `FROM`, `WORKDIR`, `COPY`, `RUN`.
- Las que **solo apuntan metadatos**: `ENV`, `EXPOSE`, `USER`, `CMD`.

**Dos confusiones que siempre se repiten:**

| Confusión | La diferencia |
|---|---|
| `RUN` frente a `CMD` | `RUN` se ejecuta **al construir** la imagen (una vez). `CMD` se ejecuta **al arrancar** el contenedor (cada vez). |
| `EXPOSE` frente a `-p` | `EXPOSE 3000` es solo **una nota**. `docker run -p 3001:3000` es lo que **abre el puerto**: el 3001 de tu equipo reenvía al 3000 del contenedor. |

- **Contexto de build:** el `.` final de `docker build -t nombre .` es la carpeta que se manda a Docker. Con **`.dockerignore`** dejas fuera lo que no debe entrar (`node_modules`, `.git`, secretos…).

### La caché de capas (esto es oro para CD)

**Regla:** Docker reutiliza una capa mientras no cambie ni su instrucción ni sus ficheros. **En cuanto una capa cambia, se reconstruyen todas las siguientes.**

- **Mal:** `COPY . .` antes de `RUN npm ci`. Cada cambio de código reinstala todas las dependencias.
- **Bien:** `COPY package*.json` y `RUN npm ci` primero, `COPY . .` al final.
- **Principio general:** ordena **de lo que menos cambia a lo que más cambia** (base, dependencias, código).

Como Jenkins construye la imagen en cada push, hacerlo bien ahorra muchísimo tiempo de espera.

### Lo que hicimos en la práctica

- Construimos y ejecutamos la imagen (`docker build`, `docker run -d -p 3001:3000`, `curl /health`).
- **Experimento de caché:** `Dockerfile.malo` frente a `Dockerfile.singlestage`.
- Inspeccionamos con `docker history`, `docker logs`, `docker exec -it ... sh` y `docker stats`.
- **Mini-reto:** escribir un fichero dentro del contenedor y ver cómo desaparece al borrarlo.
- Usamos el `Dockerfile` mejorado, con `USER node` (no ejecutar como root) y **`HEALTHCHECK`** (Docker pregunta a `/health` si la app está sana). Versión resultante: **v1.2.1**.

## 5. Sesión 4 · Docker II: builds multietapa

### Qué problema resuelve

Para **construir** hacen falta compiladores, herramientas de test, dependencias de desarrollo. Para **ejecutar** solo hace falta el runtime y lo imprescindible. Si lo metes todo en una imagen, esta pesa más, tarda más en subirse y bajarse y tiene **más superficie de ataque**.

### La solución: multi-stage build

Un Dockerfile con **varios `FROM`**. Cada uno abre una etapa nueva y **solo la última forma la imagen final**. Con `COPY --from=builder` te traes únicamente lo necesario.

```
FROM node:20-alpine AS builder      # etapa 1: instalar dependencias
...
FROM node:20-alpine                 # etapa 2: imagen final, mínima
COPY --from=builder /app/node_modules ./node_modules
USER node
HEALTHCHECK ...
```

### Buenas prácticas

- **Imágenes base mínimas (alpine):** `node:20` pesa en torno a 1 GB y `node:20-alpine`, unos 130 MB. Ojo, alpine usa `musl` en vez de `glibc` y algún módulo nativo puede dar guerra.
- **Usuario no root:** si alguien compromete la app, no tiene permisos de administrador dentro del contenedor.
- **HEALTHCHECK:** comprobar que la app **responde**, no solo que el proceso está vivo (luego Kubernetes lo usa con sus *probes*).
- **`.dockerignore`** y **dependencias solo de producción** (`npm ci --omit=dev`).
- **Versiones fijadas** (`node:20-alpine`, nunca `latest`).

### Lo que hicimos en la práctica

- Construimos las dos versiones (`singlestage` y `multistage`) y las **medimos**: tamaño, número de capas, usuario (`root` frente a `node`) y si tienen healthcheck.
- Repetimos el experimento de caché y vimos que las dos etapas **no la rompen**.
- Subimos a **v1.2.2** (un parche, sin funcionalidad nueva).
- Entregable: dos tablas comparativas y una conclusión razonada sobre tamaño, velocidad de despliegue y seguridad.

## 6. Sesión 5 · Comprobación del paquete

### Qué problema resuelve

Desplegar **no es solo publicar una imagen nueva**. Un paquete de despliegue completo tiene que permitirte tres cosas: **instalar** la versión, **adaptar los datos** que ya existen y **volver atrás** si algo sale mal.

### Lo que tenéis que tener claro

- **Artefacto frente a paquete:** el artefacto es lo que sale de construir (la imagen Docker). El **paquete** es el artefacto **más** todo lo necesario para instalarlo, adaptar el entorno y deshacerlo. Una imagen sin scripts ni documentación obliga a que alguien se acuerde de cómo se despliega, y eso no es repetible.
- **Build once, deploy many:** la imagen se construye **una sola vez** y esa misma pasa por pruebas, preproducción y producción. Si la reconstruyes en cada entorno, lo que probaste puede no ser lo que despliegas.
- **La configuración de cada entorno va fuera de la imagen** (variables o ficheros montados), para que una sola imagen sirva para todos.
- **El paquete de la práctica:** imagen nueva (`v1.3.0`), imagen anterior (`previous`), `install.sh`, `migrate-data.sh`, `VERSION` y `CHANGELOG.md`.

### El registry

| Concepto | Qué es | Ejemplo |
|---|---|---|
| Registry | El servidor entero | `localhost:5000`, Docker Hub |
| Repositorio | Las versiones de una imagen | `modulo5168-app` |
| Tag | Nombre legible de una versión | `v1.3.0`, `previous` |
| Digest | Huella SHA-256 del contenido, **inequívoca** | `sha256:3f2a…` |

- **Tags inmutables** (`v1.2.2`): identifican una versión y **nunca se reasignan**. Son los que te salvan si hay que volver atrás.
- **Tags móviles** (`latest`, `previous`): se van moviendo. Cómodos, pero no son un historial.
- **Un tag no garantiza el contenido; el digest sí.**
- `docker tag` solo funciona en local. Si no haces `docker push`, ese tag **no existe en el registry**.

### El script de instalación (`install.sh`)

Un buen script de instalación es:

- **Parametrizado:** recibe la versión como argumento, nada escrito a mano.
- **Falla pronto y a la vista:** `set -euo pipefail` (para al primer error, error si usas una variable sin definir, y error si falla cualquier parte de una tubería).
- **Idempotente:** ejecutarlo dos veces deja el sistema igual, sin errores. Ejemplo: `mkdir -p` en vez de `mkdir`.
- **Verificable:** al final **comprueba que la app responde**, y si no, termina con `exit 1`. Que `docker run` funcione solo significa que el contenedor arrancó, no que la app esté bien.

### El script de migración de datos (`migrate-data.sh`)

El código se **sustituye**; los datos se **transforman**. Cambiar de imagen es instantáneo y reversible, pero los datos no los puedes tirar y volver a crear. Por eso la migración es la parte más delicada de un despliegue.

Principios: guardar la **versión del formato** de los datos, hacer **copia de seguridad antes**, ser **idempotente** y migrar **antes** de arrancar la versión nueva.

- En la práctica, `DB_HOST` pasa a llamarse `DATABASE_HOST` y se añade `LOG_LEVEL` (el formato 1 de la configuración pasa a formato 2).
- **Patrón expand and contract:** primero *añades* lo nuevo sin quitar lo viejo (las dos versiones funcionan), luego migras el código y, al final, *quitas* lo viejo cuando ya no hace falta volver atrás.

### Volver atrás (rollback)

| Estrategia | Qué haces | Cuándo |
|---|---|---|
| **Rollback** | Redespliegas la versión anterior | Fallo grave sin arreglo rápido |
| **Roll forward** | Arreglas y publicas un parche nuevo | Arreglo pequeño y el rollback es arriesgado (por los datos, por ejemplo) |

**Lo complicado son los datos:** si vuelves a la imagen anterior pero los datos ya están migrados, normalmente **no funciona**. Hay que restaurar la copia de seguridad (con el riesgo de perder lo que se haya creado después). Por eso **el rollback se ensaya antes de necesitarlo**, no en mitad del incendio.

### VERSION y CHANGELOG

- **`VERSION`:** un fichero de una línea con la versión actual, para que scripts y pipeline no la escriban a mano en veinte sitios.
- **`CHANGELOG.md`:** resumen legible de los cambios, pensado para quien instala la aplicación (formato *Keep a Changelog*: Added, Changed, Fixed, Removed). **No sustituye al historial de Git**.

### Lo que hicimos en la práctica

Montamos la estructura (`config/`, `scripts/`, `VERSION`, `CHANGELOG.md`), publicamos primero `v1.2.2` etiquetada como `previous`, después `v1.3.0`, y **ensayamos el ciclo completo**: migrar datos, instalar la nueva versión, repetir la migración para comprobar la idempotencia y volver atrás.

## 7. Sesión 6 · Pruebas funcionales y no funcionales

### Qué problema resuelve

En CD nadie revisa cada versión a mano: **las pruebas automáticas deciden** si una versión llega al usuario. Y el pipeline no lee lo que imprime tu script, solo mira **cómo termina**.

### El código de salida: el idioma del pipeline

| Código de salida | Significa | Qué pasa |
|---|---|---|
| `0` | La prueba ha pasado | Etapa en verde, el flujo sigue |
| Distinto de 0 (normalmente `1`) | La prueba ha fallado | Etapa en rojo, el flujo **se para** |

**El error clásico:** un script que imprime «FAIL» pero acaba con `exit 0`. Para Jenkins, esa prueba ha **pasado**. Acordaos de esto, que es la causa de muchos disgustos.

### Tipos de pruebas y la pirámide

| Nivel | Qué prueba | Velocidad |
|---|---|---|
| Unitarias | Una función aislada | Muy rápida |
| Integración | Varios componentes juntos | Rápida |
| Sistema / E2E | La aplicación desplegada, vista desde fuera | Más lenta |
| Aceptación | Un requisito del cliente | Variable |

**Pirámide de pruebas:** muchas unitarias abajo, menos de integración en medio y pocas E2E arriba. Al revés (el «cono de helado») te sale un pipeline lento y frágil.

**Orden en el pipeline:** commit, build, unitarias, despliegue en pruebas, funcionales, no funcionales y producción. Las unitarias van **antes** de desplegar porque no necesitan la app arrancada.

### Pruebas funcionales: ¿qué hace?

Comprueban **qué hace** el software: dada una entrada, ¿sale lo esperado? Variantes:

- **Smoke test (de humo):** ¿arranca y responde? Nuestro `/health` es uno.
- **Sanity test:** comprobación rápida después de un cambio pequeño.
- **Regresión:** repetir lo que ya funcionaba para ver que no se ha roto nada.
- **Aceptación** y **E2E**.

**Anatomía de una prueba (Arrange-Act-Assert):** preparas el estado y el resultado esperado, ejecutas la acción (`curl`) y comparas con lo esperado (el **oráculo**). El script original fallaba porque no tenía oráculo: comprobaba que *hubiera* respuesta, no que fuera *la correcta*.

### Pruebas no funcionales: ¿cómo lo hace?

Una app puede devolver la versión correcta (pasa la funcional) y tardar cinco segundos en hacerlo (suspende la no funcional).

| Tipo | Pregunta |
|---|---|
| Rendimiento | ¿Cuánto tarda en responder? |
| Carga | ¿Aguanta el tráfico esperado? |
| Estrés | ¿Dónde está el límite y cómo falla? |
| Picos | ¿Resiste una subida brusca? |
| Resistencia | ¿Se degrada con el tiempo? |
| Escalabilidad | ¿Mejora al añadir recursos? |
| Seguridad | ¿Hay vulnerabilidades conocidas? |
| Disponibilidad | ¿Sigue funcionando si cae un componente? |

### Métricas que hay que entender

- **Latencia:** lo que tarda una petición en responderse.
- **Throughput:** peticiones por segundo (mide capacidad, no rapidez).
- **Concurrencia:** peticiones simultáneas.
- **Tasa de errores** y **uso de recursos**.
- **Percentiles:** la **media engaña**. Con tiempos de 20, 21, 22, 22, 23, 24, 25, 26, 28 y 900 ms, la media sale 111 ms (no describe a nadie), la **mediana (p50)** es 23,5 ms (lo típico) y el máximo es 900 ms (la cola). Por eso los objetivos serios se escriben con percentiles: «el p95 de `/health` por debajo de 200 ms».

### Apache Bench (`ab`)

`ab -n 100 -c 10 http://localhost:3001/` lanza 100 peticiones en total (`-n`), con 10 a la vez (`-c`). Fijaos en `Failed requests`, `Requests per second`, `Time per request` y la tabla de percentiles. Sirve para **comparar** versiones en la misma máquina, no para saber la capacidad real.

### Criterios de aceptación y puertas de calidad

Sin umbral, una medición es solo un informe. Hay que convertir el criterio en `exit 0` o `exit 1`:

| Mal planteado | Bien planteado |
|---|---|
| «La app debe ser rápida» | «Con 10 peticiones concurrentes, el p95 de `/health` es menor de 200 ms» |
| «No debe fallar» | «Con 100 peticiones, `Failed requests` es 0» |

- **Quality gate:** etapa que solo deja pasar la versión si se cumplen los criterios.
- **Pruebas flaky (inestables):** fallan a veces sin que cambie el código. Son peligrosas porque el equipo acaba ignorando el rojo.
- **Falsos positivos:** la prueba pasa con software defectuoso. Por eso **hay que provocar fallos a propósito** para comprobar que se detectan.

### Lo que hicimos en la práctica

Escribimos dos scripts: `test-funcional.sh` (comprueba el código HTTP **y** la versión) y `test-carga.sh` (usa `ab` y falla si hay peticiones fallidas). Rellenamos una tabla de concurrencia (1, 10 y 50) y **provocamos fallos** (`VERSION_ESPERADA=9.9.9`, app parada) para ver que salía `exit 1`.

## 8. Sesión 7 · Almacenamiento de resultados de pruebas

### Qué problema resuelve

Un resultado que no se guarda solo te dice si algo pasa **hoy**. Uno guardado te permite **comparar versiones**, detectar regresiones y justificar decisiones. La pregunta ya no es «¿pasa?» sino **«¿es esta versión mejor o peor que la anterior?»**.

### Lo que tenéis que tener claro

- **Regresión:** cualquier empeoramiento respecto a una versión anterior. La **regresión de rendimiento** es traicionera: ninguna prueba funcional falla, pero todo va más lento.
- **Metadatos obligatorios** (una salida sin contexto no se puede comparar): versión, **commit**, fecha y hora, máquina, parámetros de la prueba y URL probada.
- **Convención de nombres:** `tipo-version.txt` (por ejemplo, `carga-v1.3.0.txt`). Predecible, ordenable y sin espacios.
- **Formatos:** texto libre, CSV/TSV, JSON y JUnit XML (el estándar que entiende Jenkins).
- **Variación relativa:** `(nuevo − anterior) / anterior × 100`. De 900 a 810 peticiones por segundo es un **−10 %**.
- **Ruido:** variación que no tiene que ver con tu código (otros programas abiertos, caché vacía, gestión de energía…). Se reduce con **calentamiento** (peticiones previas que no se guardan), más peticiones, repetir y quedarse con la mediana, y las mismas condiciones en cada medición.
- **Umbral de tolerancia:** como dos mediciones nunca coinciden, se fija un margen (por ejemplo, 10 %). Si es muy estricto, falsas alarmas constantes; si es muy laxo, no detecta nada.
- **Línea base (baseline):** el resultado de referencia, normalmente la última versión publicada.
- **Decisión go / no-go:** criterio fijado **antes** de ver los datos, tabla comparativa y justificación con cifras. Por ejemplo: «v1.3.0 es apta: el p95 empeora un 4 %, dentro del umbral del 10 %, y no hay peticiones fallidas».

### Dónde se guardan

En el repositorio Git (`test-results/`), como artefactos de CI (`archiveArtifacts`), en informes JUnit, en sistemas de métricas (Prometheus, Grafana) o en almacenamiento de objetos (S3, MinIO). Cada opción tiene sus pros y sus contras.

### Lo que hicimos en la práctica

- Script `guardar-resultados.sh`: ejecuta el test funcional, calienta y guarda la salida de `ab` con una cabecera de metadatos.
- Medimos **v1.2.2 y v1.3.0**.
- Script `comparar-carga.sh`: saca req/s, latencia, p95 y fallos, calcula la variación y termina con **APTA** (`exit 0`) o **NO APTA** (`exit 1`).
- Anexo: una **v1.3.1 con regresión intencionada** (bloquea unos 20 ms por petición) para ver cómo la comparación la pilla.
- Entregable: `test-results/` versionado y un `DECISION-v1.3.0.md` justificado con cifras.

## 9. Sesión 8 · Versionado semántico y registro

### Qué problema resuelve

Ya sabéis construir y probar. Ahora toca **publicar con el número correcto y de forma automática**. La idea clave: **la persona que crea el tag de Git decide la versión. El pipeline hace el resto.**

### Lo que tenéis que tener claro

- **SemVer** (ya lo vimos): MAYOR si rompe compatibilidad, MENOR si añade algo compatible, PARCHE si corrige.
  - **Pre-release:** `1.2.0-rc.1` (versión candidata, todavía no definitiva).
  - **Serie 0.x.y:** no se garantiza compatibilidad.
- **Tags de Git y tags de imagen:** la versión nace en Git (`git tag v1.1.0`) y la imagen la hereda. **Convención del módulo:** con `v` en el tag de Git (`v1.1.0`) y sin `v` en la imagen (`1.1.0`).
- **Tags fijos y móviles:** `1.1.0` es fijo; `1.1`, `1` y `latest` se mueven a la última versión que encaja. Lo único realmente inmutable es el **digest** (`sha256:...`).
- **Un tag publicado no se reescribe.** Si te equivocas, publicas una versión nueva. **Un número de versión no se reutiliza, ni aunque nunca llegara a publicarse** (por eso el parche de la práctica fue `v1.3.2` y no `v1.3.1`).
- **Registry de Gitea:** guarda las imágenes con el nombre `host:puerto/usuario/imagen:tag`.

### El flujo automatizado

```
git push tag v1.2.0
   -> Jenkins detecta el tag
   -> build + test
   -> stage "Publicar versión"
   -> registry de Gitea con las etiquetas 1.2.0, 1.2, 1 y latest
```

### Lo que hicimos en la práctica

1. **Primero el ciclo a mano:** crear un token en Gitea, `docker tag`, `docker login`, `docker push`, `docker pull` y comprobar que el digest coincide.
2. **Preparar Jenkins:** plugin *Basic Branch Build Strategies*, credencial `gitea-registry` (usuario más token) y un **Multibranch Pipeline** que descubre y construye tags. Jenkins accede a Gitea como `http://gitea:3000`, **nunca `localhost`** (dentro de un contenedor, `localhost` es el propio contenedor).
3. **Publicación automática:** el stage *Publicar versión* solo se ejecuta si el tag cumple el patrón `vX.Y.Z` (con `when { tag pattern: ... }`).
4. **Errores provocados:** un pre-release (`v1.4.0-rc.1`) no mueve `latest`; reescribir una versión ya publicada **falla a propósito** (inmutabilidad); un tag que no es SemVer se construye pero no se publica.

## 10. Sesión 9 · Práctica integradora

### De qué va

Aquí **no hay contenido nuevo**. Se trata de **encadenar todo lo anterior en un solo pipeline de Jenkins**: pulsas un botón y el sistema descarga el código, lo analiza, construye la imagen, la prueba y la publica con su versión.

### Los dos parámetros

- `RAMA`: qué rama construir.
- `VERSION`: qué versión publicar (por ejemplo, `2.0.0`).

### Las siete etapas

```
a Checkout -> b Calidad -> c Imagen multi-stage -> d Versión anterior y scripts -> e Pruebas -> f Resultados -> g Publicar
```

| Etapa | Qué hace | Viene de la sesión |
|---|---|---|
| a · Checkout | Descarga el código de la rama indicada (con credencial, **nunca con usuario y contraseña escritos en el Jenkinsfile**) | 1 y 8 |
| b · Calidad | Analiza con SonarQube y espera el Quality Gate; si está rojo, el pipeline se para | 2 |
| c · Imagen | Construye la imagen multi-stage con la versión como tag y como `LABEL` | 3 y 4 |
| d · Anterior y scripts | Guarda la imagen actual de `latest` como `previous` y archiva los scripts de despliegue y rollback | 5 y 8 |
| e · Pruebas | Pruebas unitarias, prueba de carga con **k6** y análisis de vulnerabilidades con **Trivy** | 6 y 7 |
| f · Resultados | Publica los resultados en Jenkins (`junit`) y archiva los informes | 7 |
| g · Publicar | Valida que la versión es SemVer, sube la imagen con tres tags (`X.Y.Z`, `X.Y`, `latest`) y crea el tag `vX.Y.Z` | 8 |

### Cómo trabajarlo sin volveros locos

- Se crea un **fichero nuevo** (`Jenkinsfile.integradora`) y un **job nuevo** (`sesion9-integradora`). **No toquéis** el multibranch de la sesión 8.
- **Etapa a etapa:** haced la `a`, subidla, ejecutadla y comprobad que sale verde. Después la `b`, y así. **No escribáis las siete de golpe**: si falla, no sabréis dónde.
- Jenkins lee el Jenkinsfile **del repositorio**, no de vuestra carpeta: cada cambio necesita `commit` y `push`.
- Si os atascáis en una etapa, la desactiváis con `when { expression { false } }`, seguís con la siguiente y volvéis después.

### Qué hay que enseñar al final

- El job con las **siete etapas en verde**.
- Una ejecución con versión inválida (por ejemplo, `1.2`) que **falle en la etapa g**.
- En Gitea, Packages, la imagen con sus tres etiquetas.
- El tag `vX.Y.Z` en el repositorio.
- El gráfico de pruebas y los informes de carga y seguridad descargables.

## 11. Y ahora, todo junto

1. **Git** guarda el código y marca versiones con tags (sesión 1).
2. **SonarQube** revisa la calidad antes de seguir (sesión 2).
3. **Docker** empaqueta la aplicación en una imagen reproducible (sesiones 3 y 4).
4. El **paquete** añade instalación, migración de datos y vuelta atrás (sesión 5).
5. Las **pruebas** deciden si la versión vale; el **código de salida** es el idioma del pipeline (sesión 6).
6. Los **resultados guardados** permiten comparar con la versión anterior y decidir **go / no-go** (sesión 7).
7. El **versionado semántico** y el **registry** dan a cada imagen un número y un sitio donde vivir (sesión 8).
8. **Jenkins** lo ejecuta todo de principio a fin sin que nadie toque nada (sesión 9).

Si solo os quedáis con tres ideas, que sean estas:

- **Automatizar = que cada comprobación termine con un código de salida que el pipeline entienda.**
- **Trazabilidad = que el commit, el tag de Git y el tag de la imagen cuenten la misma historia.**
- **Una versión publicada no se toca: se publica otra.**

## 12. Glosario rápido

| Término | En cristiano |
|---|---|
| **Pipeline** | La cadena automática de pasos desde el código hasta el paquete publicado |
| **CI / CD** | Integración continua / despliegue continuo |
| **Rama (branch)** | Puntero a un commit para trabajar en paralelo |
| **Merge / Rebase** | Dos formas de juntar ramas: uniendo o recolocando commits |
| **Conflicto** | Dos ramas cambian las mismas líneas y hay que decidir a mano |
| **Tag (etiqueta)** | Nombre fijo para un commit, usado para versiones |
| **SemVer** | Versión `MAYOR.MENOR.PARCHE` |
| **Conventional Commits** | Formato de mensajes que una máquina puede interpretar |
| **Análisis estático** | Revisar el código sin ejecutarlo |
| **Quality Gate** | Condiciones mínimas para aprobar un resultado |
| **Imagen / Contenedor** | Plantilla de solo lectura / instancia en marcha de esa plantilla |
| **Dockerfile** | La receta para construir una imagen |
| **Capa y caché** | Cada instrucción crea una capa; si no cambia, se reutiliza |
| **Multi-stage** | Varias etapas de construcción; solo la última forma la imagen final |
| **HEALTHCHECK** | Comprobación periódica de que la app responde |
| **Registry** | Almacén de imágenes |
| **Digest** | Huella única e inmutable del contenido de una imagen |
| **Idempotente** | Ejecutarlo varias veces deja el mismo resultado |
| **Rollback / Roll forward** | Volver a la versión anterior / arreglar hacia delante con un parche |
| **Smoke test** | Prueba mínima: ¿arranca y responde? |
| **Latencia / Throughput / p95** | Lo que tarda / peticiones por segundo / tiempo que no supera el 95 % de las peticiones |
| **Regresión** | Algo que antes iba bien y ahora va peor |
| **Línea base** | Resultado de referencia para comparar |
| **Go / No-go** | Decisión de publicar o no |
| **Jenkinsfile** | El fichero que define el pipeline como código |
| **Multibranch Pipeline** | Job de Jenkins que descubre y construye ramas y tags |
| **Trazabilidad** | Poder rastrear qué código hay detrás de lo que está en producción |

## 13. Chuleta de comandos

**Git**

```
git checkout -b feature/nombre        # crear rama y cambiar a ella
git merge --no-ff feature/nombre      # fusionar dejando commit de fusión
git fetch origin && git rebase origin/main
git rebase --continue   (o --abort)
git tag -a v1.1.0 -m "mensaje"        # etiqueta anotada
git push origin main --tags           # subir commits y etiquetas
git push --force-with-lease           # forzado seguro
git log --oneline --graph --all       # ver el grafo
```

**Docker**

```
docker build -t nombre:v1.2.0 .
docker run -d -p 3001:3000 --name app nombre:v1.2.0
docker ps / docker logs app / docker exec -it app sh
docker images / docker history nombre:v1.2.0
docker tag origen destino / docker push destino / docker pull destino
docker rm -f app
docker image prune                    # borrar imágenes huérfanas
```

**Pruebas y scripts**

```
set -euo pipefail                     # al principio de cada script
exit 1                                # indica fallo al pipeline
echo $?                               # ver el código de salida
ab -n 100 -c 10 http://localhost:3001/
```

## 14. Los errores de siempre (y cómo evitarlos)

| Error | Cómo evitarlo |
|---|---|
| Olvidar `--tags` al hacer push | `git push origin main --tags` |
| `localhost` dentro de un contenedor (Jenkins, escáner) | Usar el nombre del contenedor: `gitea:3000`, `sonarqube:9000`, `app` |
| Gitea ocupa el puerto 3000 | Publicar las apps en 3001, 3002, 3004… |
| Un script imprime FAIL pero termina con `exit 0` | Terminar siempre con `exit 1` cuando falla |
| `COPY . .` antes de `npm ci` | Copiar primero `package*.json` e instalar, y el código al final |
| Hacer `docker tag` y no `docker push` | Sin push, el tag no existe en el registry |
| Reutilizar un número de versión | Cada versión usa un número nuevo, siempre |
| Scripts con finales de línea de Windows (CRLF) | Usar VS Code y LF, o `sed -i 's/\r$//' scripts/*.sh` |
| Subir el token al repositorio o sacarlo en una captura | Pasarlo como parámetro o con credenciales de Jenkins |
| Escribir las siete etapas del pipeline de golpe | Una etapa, push, ejecutar y verde; después la siguiente |

## 15. Preguntas para ver si os lo sabéis

1. ¿Qué diferencia hay entre una rama y una copia del código?
2. ¿Cuándo usaríais merge y cuándo rebase? ¿Qué regla de oro hay con el rebase?
3. Tenéis la versión `1.4.7` y añadís un `feat` y un `fix`. ¿Qué versión sale? ¿Y si el `feat` lleva `!`?
4. ¿En qué se diferencian un bug, un code smell y un security hotspot?
5. ¿Qué es un Quality Gate y qué pasa en el pipeline si sale suspendido?
6. ¿Qué diferencia hay entre una imagen y un contenedor? ¿Y entre `RUN` y `CMD`?
7. Cambiáis una línea de `server.js`. ¿Qué capas se reconstruyen con un buen Dockerfile? ¿Y con uno malo?
8. ¿Por qué `EXPOSE 3000` no hace accesible la aplicación?
9. ¿Qué gana una imagen multi-stage frente a una de una sola etapa?
10. ¿Qué diferencia hay entre un artefacto y un paquete de despliegue?
11. ¿Por qué un tag no garantiza el contenido y un digest sí?
12. ¿Qué significa que un script de instalación sea idempotente? Poned un ejemplo.
13. Volvéis a la imagen anterior pero los datos ya estaban migrados. ¿Qué puede pasar?
14. ¿Por qué la media engaña y se usan percentiles?
15. ¿Qué debe guardar un resultado de pruebas para poder compararlo después?
16. Si el p95 pasa de 18 ms a 21 ms y el umbral es del 10 %, ¿es APTA o NO APTA?
17. ¿Por qué no se puede reutilizar el número de versión `v1.3.1` aunque nunca se publicara?
18. ¿Por qué Jenkins accede a Gitea como `gitea:3000` y no como `localhost:3000`?
19. ¿Qué hace la etapa `b` del pipeline si el Quality Gate sale rojo?
20. Explicad con vuestras palabras el camino completo de un `git push` de un tag hasta que la imagen aparece en el registry.
