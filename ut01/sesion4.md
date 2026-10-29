[← Sesión 3](sesion3.md) · [Índice de la UT01](./) · [Sesión 5 →](sesion5.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 4 - Docker II

**Objetivo:** entender por qué una imagen de producción debe contener solo lo necesario para ejecutar, y comprobarlo midiendo dos versiones de la misma app.

**Material:** la app del laboratorio (`lab/app` del zip `modulo5168-lab.zip`), la misma que usasteis en la sesión 3.

## Recordatorio

Preguntas rápidas para enlazar con la sesión 3:

- ¿Qué genera cada instrucción de un Dockerfile?
- ¿Por qué copiamos `package.json` y `package-lock.json` antes que el resto del código?
- ¿Qué diferencia hay entre imagen y contenedor?

## 6.1 Teoría

### El problema

Para *construir* y *probar* una aplicación necesitamos compiladores, herramientas de test, linters y dependencias de desarrollo. Para *ejecutarla* solo necesitamos el runtime y las dependencias de producción. Si todo va en la misma imagen, la imagen final pesa más, tarda más en subirse al registro y desplegarse, y tiene más superficie de ataque.

### Multi-stage builds

Un Dockerfile puede tener varios `FROM`. Cada uno inicia una etapa nueva y solo la última forma la imagen final. Con `COPY --from=<etapa>` traemos a la etapa final únicamente los artefactos necesarios; herramientas, caché y dependencias de desarrollo se quedan en las etapas intermedias.

```
FROM imagen-pesada AS build     # etapa 1: construir y testear
...
FROM imagen-minima              # etapa 2: solo ejecutar
COPY --from=build /ruta/artefacto ./
```

### Buenas prácticas

- **Imágenes base mínimas (alpine).** `node:20` pesa en torno a 1 GB; `node:20-alpine`, alrededor de 130 MB. Ojo: alpine usa `musl` en lugar de `glibc` y algunos módulos nativos pueden dar problemas. Alternativas: variantes `-slim` o imágenes distroless.
- **Usuario no root.** Si alguien compromete la aplicación, no debe tener privilegios de root dentro del contenedor. Las imágenes oficiales de Node incluyen el usuario `node`.
- **HEALTHCHECK.** Docker (y más adelante Kubernetes, con sus probes) puede saber si la app responde de verdad, no solo si el proceso está vivo.
- **`.dockerignore`.** Evita meter `node_modules`, `.git`, etc. en el contexto de build.
- **Solo dependencias de producción** (`npm ci --omit=dev`) y versiones de imagen fijadas (`node:20-alpine`, nunca `latest`).

## 6.2 Práctica — Comparativa single-stage vs multi-stage

### Paso 1. Situarse en el proyecto

Trabajamos sobre la app del laboratorio (o el repositorio de Gitea donde la subisteis en la sesión 3):

```
cd lab/app
ls -la
```

Debe contener `server.js`, `package.json`, `package-lock.json`, `.dockerignore`, `Dockerfile` (multi-stage) y `Dockerfile.singlestage`. Las dos versiones del Dockerfile ya vienen en el laboratorio: hoy se trata sobre todo de analizarlas y medirlas (en el paso 6 crearéis un tercer Dockerfile para el experimento de caché).

### Paso 2. Analizar y construir la versión single-stage

`Dockerfile.singlestage`

```
FROM node:20
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
ENV PORT=3000
ENV APP_VERSION=1.2.0
EXPOSE 3000
CMD ["node", "server.js"]
```

Antes de construir, comparadlo con el `Dockerfile` y detectad qué le falta: usa la imagen `node:20` completa, se ejecuta como root y no tiene healthcheck.

```
docker build -f Dockerfile.singlestage -t modulo5168-app:singlestage .
```

### Paso 3. Analizar y construir la versión multi-stage

`Dockerfile`

```
# Etapa 1: instalar dependencias (con el package-lock.json, para builds reproducibles)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Etapa 2: imagen final, mínima
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY server.js package.json ./
ENV PORT=3000
ENV APP_VERSION=1.2.0
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
```

Fijaos en qué hace cada etapa, qué copia `COPY --from=builder` y para qué sirven `USER node` y `HEALTHCHECK`.

```
docker build -t modulo5168-app:v1.1.0 .
```

### Paso 4. Medir y comparar

```
# Tamaños
docker images | grep modulo5168-app

# Capas de cada imagen
docker history modulo5168-app:singlestage
docker history modulo5168-app:v1.1.0

# Usuario de ejecución
docker run --rm modulo5168-app:singlestage whoami
docker run --rm modulo5168-app:v1.1.0 whoami
```

La single-stage debe responder `root`; la multi-stage, `node`.

### Paso 5. Comprobar el HEALTHCHECK

```
docker rm -f test-app 2>/dev/null     # el contenedor de la sesión 3, si sigue en marcha
docker run -d --name app-single -p 3002:3000 modulo5168-app:singlestage
docker run -d --name app-multi  -p 3003:3000 modulo5168-app:v1.1.0
# esperar unos segundos
docker ps
curl http://localhost:3003/health
```

En la columna STATUS, `app-multi` debe mostrar `(healthy)` y `app-single` no mostrará estado de salud. Para limpiar: `docker rm -f app-single app-multi`.

### Paso 6. Caché: el orden de las instrucciones importa

Los dos Dockerfiles del laboratorio copian `package.json` y `package-lock.json` antes que `server.js`, así que los dos aprovechan bien la caché. Para ver qué pasa cuando el orden es incorrecto, cread un tercer fichero, `Dockerfile.mal`, que copia todo el código antes de instalar las dependencias:

```
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

Construid las dos versiones una primera vez para que quede todo en caché:

```
docker build -f Dockerfile.mal -t modulo5168-app:mal .
docker build -t modulo5168-app:v1.1.0 .
```

Ahora cambiad el texto de la ruta `/` en `server.js` (por ejemplo, `Hola desde el módulo 5168` → `Hola desde la sesión 4`), guardad el fichero y reconstruid las dos midiendo el tiempo:

```
time docker build -f Dockerfile.mal -t modulo5168-app:mal .
time docker build -t modulo5168-app:v1.1.0 .
```

Comparad la salida de los dos builds:

- En `Dockerfile.mal`, `COPY . .` ya no sale de caché porque ha cambiado un fichero, y por eso **`RUN npm ci` se vuelve a ejecutar entero** y se descargan otra vez todas las dependencias.
- En `Dockerfile`, la etapa `builder` sale completa como `CACHED` (incluido `RUN npm ci`) y solo se rehace `COPY server.js package.json ./`.

Conclusión: una instrucción que cambia invalida la caché de todas las que vienen detrás. Por eso se copian primero los ficheros que cambian poco (dependencias) y al final los que cambian mucho (código).

Si todo os sale `CACHED` después de editar, comprobad que habéis guardado `server.js` y que estáis construyendo en la misma carpeta donde lo habéis editado.

Si algún build falla con `EAI_AGAIN` o `Temporary failure resolving`, es el DNS de la red del centro: fija el DNS de Docker como indica el paso 1 de la guía de instalación (clave `dns` en `/etc/docker/daemon.json`, sin borrar el resto) y reinicia Docker.

Si el repositorio ya está en Gitea, es buen momento para hacer `git commit` y `git tag v1.1.0`, de modo que la etiqueta de la imagen coincida con la del código.

## Entregable

Tabla comparativa rellenada con los datos reales obtenidos:

|                                                         | `singlestage` | `v1.1.0` (multi-stage) |
|---------------------------------------------------------|---------------|------------------------|
| Imagen base de la imagen final                          |               |                        |
| Tamaño (`docker images`)                                |               |                        |
| Nº de capas (`docker history`)                          |               |                        |
| Usuario de ejecución                                    |               |                        |
| ¿Tiene HEALTHCHECK?                                     |               |                        |

Y una segunda tabla con el resultado del paso 6:

|                                                  | `Dockerfile.mal` | `Dockerfile` (multi-stage) |
|--------------------------------------------------|------------------|----------------------------|
| ¿Se vuelve a ejecutar `npm ci` al cambiar `server.js`? |            |                            |
| Tiempo del rebuild (`time`)                      |                  |                            |

A la tabla se añade una **conclusión razonada** (10-15 líneas) que responda a:

1. ¿Cuál es la reducción de tamaño en porcentaje y a qué se debe principalmente?
2. ¿Qué impacto tiene el tamaño en un flujo de despliegue continuo (push/pull al registro, tiempo de despliegue, almacenamiento)?
3. ¿Qué riesgos de seguridad elimina la versión multi-stage?
4. ¿Hay algún inconveniente o caso en que no usarías alpine?

## 6.3 Puesta en común

Dos o tres grupos comparten su tabla en pantalla y se contrastan cifras. Si hay diferencias grandes, suele ser por no tener `.dockerignore` y haber copiado `node_modules` local.

Preguntas:

- Si desplegamos 20 veces al día en 5 servidores, ¿cuántos GB se transfieren con cada versión?
- ¿Qué otras tareas (tests, linter, compilación) podríamos hacer en la etapa de build sin que lleguen a la imagen final? ¿Qué pasaría en Jenkins si fallan?
- ¿Qué haría Kubernetes con la información del HEALTHCHECK? (adelanto de liveness/readiness probes, ya presentes en `lab/k8s/deployment.yaml`)
- ¿Dónde quedan las etapas intermedias? (`docker images -a`, imágenes `<none>`; limpiar con `docker image prune`)

### Criterios de evaluación del entregable (RA1.c)

| Aspecto                                                                | Peso |
|------------------------------------------------------------------------|------|
| Tabla completa y con datos reales                                      | 40 % |
| Conclusión que relaciona tamaño y seguridad con el despliegue continuo | 40 % |
| Dockerfile multi-stage funcional, con usuario no root y healthcheck    | 20 % |

---

[← Sesión 3](sesion3.md) · [Índice de la UT01](./) · [Sesión 5 →](sesion5.md)
