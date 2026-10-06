[← Sesión 3](sesion3.md) · [Índice de la UT01](./) · [Sesión 5 →](sesion5.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 4 - Docker II

**Objetivo:** entender por qué una imagen de producción debe contener solo lo necesario para ejecutar, y comprobarlo midiendo dos versiones de la misma app.

**Supuesto:** `modulo5168-app` es una app Node.js/Express con tests en Jest.

## Recordatorio

Preguntas rápidas para enlazar con la sesión 3:

- ¿Qué genera cada instrucción de un Dockerfile?
- ¿Por qué copiamos `package*.json` antes que el resto del código?
- ¿Qué diferencia hay entre imagen y contenedor?

## 6.1 Teoría

### El problema

Para *construir* y *probar* una aplicación necesitamos compiladores, herramientas de test, linters y dependencias de desarrollo. Para *ejecutarla* solo necesitamos el runtime y las dependencias de producción. Si todo va en la misma imagen, la imagen final pesa más, tarda más en subirse al registro y desplegarse, y tiene más superficie de ataque.

### Multi-stage builds

Un Dockerfile puede tener varios `FROM`. Cada uno inicia una etapa nueva y solo la última forma la imagen final. Con `COPY --from=<etapa>` traemos a la etapa final únicamente los artefactos necesarios; herramientas, caché y devDependencies se quedan en las etapas intermedias.

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
- `.dockerignore`**.** Evita meter `node_modules`, `.git`, etc. en el contexto de build.
- **Solo dependencias de producción** (`npm ci --omit=dev`) y versiones de imagen fijadas (`node:20-alpine`, nunca `latest`).

## 6.2 Práctica — Comparativa single-stage vs multi-stage

### Paso 1. Preparar la app (si no la tienen de sesiones anteriores)

`package.json`

```
{
  "name": "modulo5168-app",
  "version": "1.1.0",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

`src/app.js`

```
const express = require('express');
const app = express();

app.get('/', (req, res) => res.json({ app: 'modulo5168-app', version: '1.1.0' }));
app.get('/health', (req, res) => res.status(200).send('OK'));

module.exports = app;
```

`src/index.js`

```
const app = require('./app');
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Escuchando en ${PORT}`));
```

`test/app.test.js`

```
const request = require('supertest');
const app = require('../src/app');

test('GET /health devuelve 200', async () => {
  const res = await request(app).get('/health');
  expect(res.statusCode).toBe(200);
});
```

`.dockerignore`

```
node_modules
npm-debug.log
.git
.gitignore
*.md
```

### Paso 2. Versión single-stage

`Dockerfile.singlestage`

```
FROM node:20
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["node", "src/index.js"]
```

Antes de construir, debéis detectar al menos tres problemas: imagen base completa, ejecución como root, instala devDependencies, `COPY . .` antes de instalar rompe la caché y no hay healthcheck.

```
docker build -f Dockerfile.singlestage -t modulo5168-app:singlestage .
```

### Paso 3. Versión multi-stage

`Dockerfile`

```
# ---------- Etapa 1: build y test ----------
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm test

# ---------- Etapa 2: imagen final ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/index.js"]
```

Punto a destacar: si un test falla, `RUN npm test` hace fallar el build y no se genera imagen. Esto enlaza con el pipeline de Jenkins de las próximas unidades.

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

# Número de paquetes en node_modules
docker run --rm modulo5168-app:singlestage ls node_modules | wc -l
docker run --rm modulo5168-app:v1.1.0 ls node_modules | wc -l

# Usuario de ejecución
docker run --rm modulo5168-app:singlestage whoami
docker run --rm modulo5168-app:v1.1.0 whoami
```

### Paso 5. Comprobar el HEALTHCHECK

```
docker rm -f test-app 2>/dev/null     # el contenedor de la sesión 3, si sigue en marcha
docker run -d --name app-single -p 3002:3000 modulo5168-app:singlestage
docker run -d --name app-multi  -p 3003:3000 modulo5168-app:v1.1.0
# esperar ~15 segundos
docker ps
```

En la columna STATUS, `app-multi` debe mostrar `(healthy)` y `app-single` no mostrará estado de salud. Para limpiar: `docker rm -f app-single app-multi`.

### Paso 6. Caché

Modificar una línea de `src/app.js`, reconstruir ambas imágenes con `time docker build ...` y comparar cuánto tarda cada una y qué capas se reaprovechan (`CACHED`). En la single-stage se reinstala todo; en la multi-stage, no.

Si el repositorio ya está en Gitea, es buen momento para hacer `git commit` y `git tag v1.1.0`, de modo que la etiqueta de la imagen coincida con la del código.

## Entregable

Tabla comparativa rellenada con los datos reales obtenidos:

|                                                  | `singlestage` | `v1.1.0` (multi-stage) |
|--------------------------------------------------|---------------|------------------------|
| Imagen base                                      |               |                        |
| Tamaño (`docker images`)                         |               |                        |
| Nº de capas (`docker history`)                   |               |                        |
| Paquetes en `node_modules`                       |               |                        |
| Usuario de ejecución                             |               |                        |
| ¿Tiene HEALTHCHECK?                              |               |                        |
| ¿Ejecuta tests en el build?                      |               |                        |
| (Opcional) Tiempo de rebuild tras cambiar `src/` |               |                        |

A la tabla se añade una **conclusión razonada** (10-15 líneas) que responda a:

1. ¿Cuál es la reducción de tamaño en porcentaje y a qué se debe principalmente?
2. ¿Qué impacto tiene el tamaño en un flujo de despliegue continuo (push/pull al registro, tiempo de despliegue, almacenamiento)?
3. ¿Qué riesgos de seguridad elimina la versión multi-stage?
4. ¿Hay algún inconveniente o caso en que no usarías alpine?

## 6.3 Puesta en común

Dos o tres grupos comparten su tabla en pantalla y se contrastan cifras. Si hay diferencias grandes, suele ser por no haber usado  .dockerignore o por haber copiado `node_modules` local.

Preguntas:

- Si desplegamos 20 veces al día en 5 servidores, ¿cuántos GB se transfieren con cada versión?
- ¿Por qué es buena idea que los tests se ejecuten dentro del build? ¿Qué pasaría en Jenkins si fallan?
- ¿Qué haría Kubernetes con la información del HEALTHCHECK? (adelanto de liveness/readiness probes)
- ¿Dónde quedan las etapas intermedias? (`docker images -a`, imágenes `<none>`; limpiar con `docker image prune`)

### Criterios de evaluación del entregable (RA1.c)

| Aspecto                                                                | Peso |
|------------------------------------------------------------------------|------|
| Tabla completa y con datos reales                                      | 40 % |
| Conclusión que relaciona tamaño y seguridad con el despliegue continuo | 40 % |
| Dockerfile multi-stage funcional, con usuario no root y healthcheck    | 20 % |

---

[← Sesión 3](sesion3.md) · [Índice de la UT01](./) · [Sesión 5 →](sesion5.md)
