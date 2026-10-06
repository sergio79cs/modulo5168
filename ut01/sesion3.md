[← Sesión 2](sesion2.md) · [Índice de la UT01](./) · [Sesión 4 →](sesion4.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 3 — Docker I

## Objetivos de aprendizaje

Al acabar la sesión, el alumnado será capaz de:

1. Distinguir imagen, contenedor, capa y registro, y explicar la relación entre ellos.
2. Escribir un Dockerfile para una aplicación Node.js que aproveche la caché de capas.
3. Construir, etiquetar, ejecutar, inspeccionar y eliminar imágenes y contenedores desde la CLI.
4. Comprobar de forma objetiva que un contenedor está sano (`/health`, `HEALTHCHECK`).

## Requisitos previos

Docker instalado y funcionando en cada equipo (`docker version` responde con cliente y servidor), el repositorio del laboratorio clonado desde Gitea y la aplicación en la versión v1.1.0.

# 2. Teoría

## Bloque 1 — ¿Por qué contenedores?

Para arrancar, pregunta al grupo cuántas veces les ha pasado que algo funcionaba en su ordenador y no en el de un compañero. Las causas típicas son otra versión de Node, una dependencia global que falta, variables de entorno distintas o incluso otro sistema operativo. En un pipeline de despliegue continuo este problema se multiplica, porque el código pasa por el equipo del desarrollador, el servidor de integración (Jenkins), preproducción y producción. Si cada entorno es distinto, no podemos garantizar que lo que probamos sea lo que desplegamos.

Un contenedor empaqueta la aplicación junto con todo lo que necesita para ejecutarse: runtime, librerías, configuración y sistema de ficheros. El mismo artefacto recorre todo el pipeline sin cambios.

Conviene compararlo con una máquina virtual:

|                | Máquina virtual               | Contenedor                        |
|----------------|-------------------------------|-----------------------------------|
| Qué virtualiza | Hardware completo             | Procesos aislados del SO          |
| Kernel         | Propio (SO invitado completo) | Comparte el del anfitrión         |
| Tamaño típico  | GB                            | MB                                |
| Arranque       | Minutos                       | Segundos o menos                  |
| Aislamiento    | Muy fuerte                    | Fuerte, pero menor (mismo kernel) |

un contenedor no es una máquina pequeña, es un proceso aislado. Cuando el proceso principal termina, el contenedor se para.

## Bloque 2 — Imagen, contenedor, capas y registro

Los cuatro conceptos se entienden mejor con una analogía de programación orientada a objetos, que el alumnado ya domina:

- **Imagen**: plantilla de solo lectura, como una *clase*. Contiene el sistema de ficheros y los metadatos (comando de arranque, puertos, variables de entorno).
- **Contenedor**: instancia en ejecución de una imagen, como un *objeto*. De una misma imagen pueden salir muchos contenedores.
- **Capa**: cada instrucción del Dockerfile que modifica el sistema de ficheros (`FROM`, `COPY`, `RUN`…) genera una capa. Una imagen es una pila de capas de solo lectura.
- **Registro**: almacén de imágenes (Docker Hub, el registro de Gitea, uno privado de empresa). Es el equivalente a Gitea, pero para imágenes en vez de código.

```
 ┌─────────────────────────────────┐
 │ Capa de escritura (contenedor)  │  <- se pierde al borrar el contenedor
 ├─────────────────────────────────┤
 │ COPY . .          (código)      │  ┐
 │ RUN npm ci        (node_modules)│  │ capas de solo lectura
 │ COPY package*.json              │  │ = la IMAGEN
 │ WORKDIR /app                    │  │ (compartidas entre contenedores)
 │ FROM node:24-alpine             │  ┘
 └─────────────────────────────────┘
```

1. **Las capas se comparten.** Si diez imágenes parten de `node:24-alpine`, esa capa base se descarga y almacena una sola vez.
2. **Los contenedores son efímeros.** Todo lo que se escribe dentro va a la capa de escritura y desaparece con `docker rm`. Los datos persistentes se guardan en volúmenes (se verá en Docker II).
3. **Las capas son inmutables.** Borrar un fichero en una capa posterior no reduce el tamaño de la imagen, porque el fichero sigue existiendo en la capa anterior. Esto justificará más adelante las builds multietapa.
4. **Etiquetas (tags).** `modulo5168-app:v1.1.0` enlaza con el versionado semántico de las sesiones anteriores. Evitad `latest` en despliegues, porque no dice qué versión se está ejecutando y rompe la trazabilidad del pipeline.

## Bloque 3 — Anatomía de un Dockerfile

| Instrucción | Qué hace                                           | ¿Crea capa de ficheros? |
|-------------|----------------------------------------------------|-------------------------|
| `FROM`      | Imagen base de partida                             | Sí (las de la base)     |
| `WORKDIR`   | Directorio de trabajo (lo crea si no existe)       | Sí, mínima              |
| `COPY`      | Copia ficheros del contexto de build a la imagen   | Sí                      |
| `RUN`       | Ejecuta un comando durante la construcción         | Sí                      |
| `ENV`       | Define variables de entorno                        | Solo metadatos          |
| `EXPOSE`    | Documenta el puerto (no lo publica)                | Solo metadatos          |
| `USER`      | Usuario con el que se ejecuta lo que viene después | Solo metadatos          |
| `CMD`       | Comando por defecto al arrancar el contenedor      | Solo metadatos          |

Dos confusiones típicas que conviene atacar ya:

- **\`RUN\` frente a \`CMD\`**: `RUN` se ejecuta al *construir* la imagen (instalar dependencias), mientras que `CMD` se ejecuta al *arrancar* el contenedor (lanzar la app).
- **\`EXPOSE\` frente a \`-p\`**: `EXPOSE` solo documenta. Lo que realmente abre el puerto hacia el anfitrión es `docker run -p 3001:3000`, con el formato `puerto_anfitrión:puerto_contenedor`. En nuestro laboratorio el 3000 del anfitrión lo ocupa Gitea, así que la aplicación se publica en el 3001.

También hay que presentar el **contexto de build**: el punto final de `docker build -t ... .` indica la carpeta que se envía al motor de Docker. Todo lo que hay en ella puede copiarse a la imagen, y por eso existe `.dockerignore`, que funciona como un `.gitignore` para las builds.

## Bloque 4 — Caché de capas y orden de instrucciones

La regla que usa Docker es sencilla: **al reconstruir, reutiliza cada capa mientras ni la instrucción ni los ficheros que usa hayan cambiado. En cuanto una capa se invalida, todas las posteriores se reconstruyen.**

`Dockerfile MALO`

```
FROM node:24-alpine
WORKDIR /app
COPY . .            # cualquier cambio en el código invalida esta capa...
RUN npm ci          # ...y obliga a reinstalar TODAS las dependencias
CMD ["node", "server.js"]
```

`Dockerfile BUENO`

```
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./   # solo cambia cuando cambian las dependencias
RUN npm ci              # se reutiliza de caché casi siempre
COPY . .                # el código cambia a menudo, pero va al final
CMD ["node", "server.js"]
```

**Principio general:** ordenar de lo que menos cambia a lo que más cambia. La imagen base casi nunca cambia, las dependencias de vez en cuando y el código en cada commit.

¿Por qué importa en despliegue continuo? Porque Jenkins construirá la imagen en cada push. Con el orden correcto, una build pasa de tardar un minuto a tardar segundos. Multiplicado por decenas de builds diarias en un equipo real, el ahorro es de horas de CPU y de tiempo de espera del desarrollador.

**Prueba en vivo.**

Construye la versión mala, cambia un texto de `server.js` y reconstruye: se verá `npm ci` ejecutándose otra vez. Después haz lo mismo con la versión buena y enseña el `CACHED` en ese paso. Es el mismo experimento que haréis en la práctica C.

# 3. Práctica

## Parte A — Preparar la aplicación

Comprobad que `lab/app` contiene estos ficheros. Si falta alguno, cread los que falten.

`package.json`

```
{
  "name": "modulo5168-app",
  "version": "1.1.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.21.0"
  }
}
```

`server.js`

```
const express = require('express');
const { version } = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`Hola desde modulo5168-app v${version}`);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version, uptime: process.uptime() });
});

// 0.0.0.0 es obligatorio: si escucha en 127.0.0.1,
// no es accesible desde fuera del contenedor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`modulo5168-app v${version} escuchando en el puerto ${PORT}`);
});
```

`.dockerignore`

```
node_modules
npm-debug.log
.git
.gitignore
Dockerfile*
.dockerignore
*.md
```

Generad el `package-lock.json`, que es imprescindible para `npm ci`:

```
cd lab/app
npm install
```

Si algún equipo no tiene Node instalado en el anfitrión, puede generarlo con Docker sin instalar nada:

```
docker run --rm -v "$PWD":/app -w /app node:24-alpine npm install
```

## Parte B — Construir y ejecutar

`Dockerfile (versión correcta)`

```
FROM node:24-alpine

WORKDIR /app

# 1) Dependencias: capa que casi nunca cambia
COPY package*.json ./
RUN npm ci --omit=dev

# 2) Código: capa que cambia en cada commit
COPY . .

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
```

Construcción y ejecución:

```
docker build -t modulo5168-app:v1.1.0 .
docker images modulo5168-app
docker run -d -p 3001:3000 --name test-app modulo5168-app:v1.1.0
docker ps
curl http://localhost:3001/health
```

La respuesta esperada es algo como `{"status":"ok","version":"1.1.0","uptime":3.21}`.

**Aviso para Windows:** en PowerShell, `curl` es un alias de `Invoke-WebRequest`. Usad `curl.exe http://localhost:3001/health` o abrid la URL en el navegador.

**Preguntas de control** (a responder en el documento de evidencias):

1. ¿Qué significa cada parte de `-p 3001:3000`? ¿Qué pasaría con `-p 8080:3000`? Probadlo. ¿Y si intentáis publicar en el 3000?
2. ¿Qué hace `-d`? ¿Qué ocurre si lo quitáis?
3. ¿Cuánto ocupa la imagen? ¿De dónde sale la mayor parte de ese tamaño?

## Parte C — Experimento de caché

Este es el núcleo de la sesión: medir el efecto del orden de las instrucciones.

**Paso 1.** Cread `Dockerfile.malo`:

`Dockerfile.malo`

```
FROM node:24-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
CMD ["node", "server.js"]
```

**Paso 2.** Construid las dos versiones una vez para que la caché esté «caliente»:

```
docker build -f Dockerfile.malo -t modulo5168-app:malo .
docker build -t modulo5168-app:bueno .
```

**Paso 3.** Cambiad el mensaje de la ruta `/` en `server.js` (cualquier texto) y reconstruid ambas midiendo el tiempo y mostrando el detalle de cada paso:

```
# Linux / macOS / Git Bash
time docker build --progress=plain -f Dockerfile.malo -t modulo5168-app:malo .
time docker build --progress=plain -t modulo5168-app:bueno .
# PowerShell
Measure-Command { docker build -f Dockerfile.malo -t modulo5168-app:malo . }
Measure-Command { docker build -t modulo5168-app:bueno . }
```

**Paso 4.** Anotad los resultados en una tabla:

| Situación                                                | Dockerfile malo | Dockerfile bueno |
|----------------------------------------------------------|-----------------|------------------|
| Tiempo tras cambiar `server.js`                          |                 |                  |
| ¿`npm ci` sale como `CACHED`?                            |                 |                  |
| Tiempo tras añadir una dependencia (`npm install dayjs`) |                 |                  |

**Paso 5.** Responded: ¿en qué caso los dos Dockerfiles tardan lo mismo, y por qué?

## Parte D — Inspeccionar imágenes y contenedores

Ejecutad cada comando y explicad con vuestras palabras qué muestra:

```
# Capas de la imagen y tamaño de cada una
docker history modulo5168-app:v1.1.0

# Metadatos completos (CMD, ENV, puertos, capas)
docker image inspect modulo5168-app:v1.1.0

# Salida de la aplicación
docker logs test-app
docker logs -f test-app        # seguir en tiempo real (Ctrl+C para salir)

# Entrar dentro del contenedor en ejecución
docker exec -it test-app sh
  whoami        # ¿con qué usuario corre la app?
  ls -la        # ¿está node_modules? ¿está el Dockerfile? ¿por qué?
  ps aux        # ¿cuál es el proceso con PID 1?
  exit

# Consumo de recursos
docker stats test-app --no-stream
```

**Mini-reto de la capa de escritura:**

1. Entrad con `docker exec -it test-app sh` y cread un fichero: `echo hola > /tmp/prueba.txt`.
2. Parad y arrancad el contenedor (`docker stop test-app` y `docker start test-app`). ¿Sigue el fichero?
3. Borradlo y cread uno nuevo desde la imagen (`docker rm -f test-app` y otra vez el `docker run`). ¿Sigue el fichero?

## Parte E — Mejoras: seguridad, salud y nueva versión

Mejorad el Dockerfile con dos buenas prácticas y publicad una versión de parche.

`Dockerfile (mejorado)`

```
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# --chown para que el usuario node sea el propietario de los ficheros
COPY --chown=node:node . .

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

# No ejecutar como root: la imagen oficial de Node ya trae el usuario "node"
USER node

# Docker comprueba periódicamente que la app responde
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
```

Subid la versión a `1.1.1` en `package.json` (es un cambio que no añade funcionalidad, así que es un *patch* según SemVer) y desplegad:

```
docker build -t modulo5168-app:v1.1.1 .
docker rm -f test-app
docker run -d -p 3001:3000 --name test-app modulo5168-app:v1.1.1
docker ps          # esperad unos segundos: STATUS debe mostrar (healthy)
curl http://localhost:3001/health
docker exec test-app whoami     # debe devolver "node"
```

Para cerrar, commit y tag en Gitea:

```
git add .
git commit -m "feat: dockerizar la aplicación (v1.1.1)"
git tag v1.1.1
git push origin main --tags
```

## Reto de ampliación (para quien acabe antes)

1. Comparad el tamaño de la imagen usando `node:24` en vez de `node:24-alpine`. ¿Cuánto cambia? ¿Qué se pierde con Alpine? Pista: no trae `bash` y usa `musl` en lugar de `glibc`.
2. Levantad dos contenedores de la misma imagen a la vez, en los puertos 3002 y 3003. ¿Por qué no pueden usar ambos el mismo puerto del anfitrión?
3. Haced que la app falle a propósito (por ejemplo, que `/health` devuelva un error 500) y observad cómo `docker ps` pasa a mostrar `(unhealthy)`.

## Limpieza

```
docker rm -f test-app
docker image rm modulo5168-app:malo modulo5168-app:bueno
docker image prune        # elimina imágenes huérfanas (<none>)
```

# 4. Revisión

## Errores frecuentes y cómo resolverlos

| Síntoma                                               | Causa probable                                                  | Solución                                                                      |
|-------------------------------------------------------|-----------------------------------------------------------------|-------------------------------------------------------------------------------|
| `port is already allocated`                           | El puerto del anfitrión ya está en uso (el 3000 es el de Gitea) | `docker ps` y parar el que lo usa, o publicar en otro puerto (`-p 3001:3000`) |
| `Conflict... name "/test-app" is already in use`      | Existe un contenedor con ese nombre, aunque esté parado         | `docker rm -f test-app`                                                       |
| `curl: (52) Empty reply` o conexión rechazada         | La app escucha en `127.0.0.1` dentro del contenedor             | Escuchar en `0.0.0.0`                                                         |
| El contenedor aparece como `Exited` nada más arrancar | La app ha fallado al iniciar                                    | `docker logs test-app` para ver el error                                      |
| `npm ci` falla: package-lock.json not found           | No se generó el lock                                            | `npm install` en local y volver a construir                                   |
| La build es lenta y el contexto enorme                | Se está enviando `node_modules`                                 | Revisar `.dockerignore`                                                       |
| `curl` en PowerShell devuelve un objeto raro          | Alias de `Invoke-WebRequest`                                    | Usar `curl.exe`                                                               |
| `Cannot connect to the Docker daemon`                 | Docker Desktop o el servicio no están arrancados                | Arrancar Docker y repetir                                                     |

## Preguntas de repaso

Pueden lanzarse oralmente o en un formulario rápido:

1. ¿Qué diferencia hay entre una imagen y un contenedor?
2. Si cambias una línea de `server.js`, ¿qué capas se reconstruyen con el Dockerfile bueno? ¿Y con el malo?
3. ¿Por qué `COPY package*.json` va antes que `COPY . .`?
4. ¿Qué diferencia hay entre `RUN` y `CMD`?
5. ¿`EXPOSE 3000` hace accesible la app desde el navegador del anfitrión? ¿Qué lo hace?
6. ¿Qué pasa con los datos escritos dentro de un contenedor al eliminarlo?
7. ¿Por qué no conviene usar la etiqueta `latest` en un pipeline de despliegue?
8. ¿Qué ventaja de seguridad tiene la instrucción `USER node`?
9. ¿Por qué borrar un fichero en una capa posterior no reduce el tamaño de la imagen?

## Entrega y cierre

**Entregable** (en Aules):

- Dockerfile final y `.dockerignore`.
- Captura de `docker ps` con el contenedor `(healthy)` y de la respuesta de `/health` con la versión 1.1.1.
- Tabla del experimento de caché con la conclusión en dos o tres líneas.
- Respuestas a las preguntas de control de las partes B y D.
- Tag `v1.1.1` subido a Gitea.

**Enlace con la siguiente sesión:** hoy la imagen solo existe en el ordenador de cada alumno. En Docker II el siguiente paso natural es subirla a un registro, orquestar varios servicios y persistir datos con volúmenes, que es lo que luego necesitará Jenkins para construir y publicar la imagen automáticamente.

# 5. Lista de comprobación para evaluar (RA1.c)

| Indicador                                                | Evidencia                                                                 | ✓   |
|----------------------------------------------------------|---------------------------------------------------------------------------|-----|
| Construye una imagen funcional a partir de un Dockerfile | Imagen `v1.1.1` construida sin errores                                    |     |
| Ordena las instrucciones para aprovechar la caché        | Dependencias copiadas antes que el código y `CACHED` visible en la salida |     |
| Ejecuta y publica el contenedor correctamente            | `/health` responde desde el anfitrión                                     |     |
| Inspecciona y diagnostica contenedores                   | Uso correcto de `logs`, `exec`, `history` e `inspect`                     |     |
| Aplica buenas prácticas básicas                          | `.dockerignore`, usuario no root, `HEALTHCHECK`, etiqueta versionada      |     |
| Mantiene la trazabilidad de versiones                    | Commit y tag `v1.1.1` en Gitea coherentes con la imagen                   |     |

---

[← Sesión 2](sesion2.md) · [Índice de la UT01](./) · [Sesión 4 →](sesion4.md)
