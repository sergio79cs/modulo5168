{% raw %}
[← Sesión 4](sesion4.md) · [Índice de la UT01](./) · [Sesión 6 →](sesion6.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 5 - Comprobación del paquete

**Objetivo de la sesión:** entender que desplegar no es solo publicar una imagen nueva. Un paquete de despliegue completo debe permitir tres cosas: instalar la versión nueva, adaptar los datos existentes a ella y volver atrás si algo falla.

## 7.1 Teoría

### 7.1.1 Qué entendemos por "paquete"

En este módulo, el paquete es el conjunto de artefactos necesarios para poner una versión en producción de forma repetible. En nuestro laboratorio lo forman:

| **Componente**                                  | **Dónde vive**           | **Para qué sirve**                                           |
|-------------------------------------------------|--------------------------|--------------------------------------------------------------|
| Imagen nueva (`v1.3.0`)                         | Registry                 | El software que se despliega                                 |
| Imagen anterior (`previous` + su tag semántico) | Registry                 | Comparar comportamiento y revertir                           |
| `install.sh`                                    | Repositorio (`scripts/`) | Poner en marcha la versión de forma automática y verificable |
| `migrate-data.sh`                               | Repositorio (`scripts/`) | Adaptar datos y configuración existentes al formato nuevo    |
| `VERSION` / `CHANGELOG.md`                      | Repositorio              | Saber qué se despliega y qué cambia                          |

"Si mañana la v1.3.0 falla en producción, ¿qué necesitáis tener a mano para volver a la v1.2.2 en cinco minutos?" Las respuestas suelen justificar solas la existencia de cada componente.

**Artefacto y paquete no son lo mismo.** El artefacto es el resultado de construir el código: en nuestro caso, la imagen Docker. El paquete es el artefacto más todo lo necesario para instalarlo, adaptar el entorno y deshacer el cambio. Una imagen sin scripts ni documentación obliga a que alguien sepa de memoria cómo desplegarla, y eso no es repetible.

**Construir una vez, desplegar muchas.** La imagen se construye una sola vez y esa misma imagen pasa por pruebas, preproducción y producción. Si se reconstruyera en cada entorno, podría salir distinta (otra versión de una dependencia, otra imagen base) y lo que se probó no sería lo que se despliega. Por eso el paquete se publica en un registry y cada entorno lo descarga de allí.

**Lo que cambia entre entornos va fuera de la imagen.** La configuración (hosts de base de datos, nivel de log, contraseñas) no se mete dentro de la imagen, sino que se monta o se pasa como variables. Así la misma imagen sirve en todos los entornos. Es uno de los principios de las aplicaciones *twelve-factor*.

### 7.1.2 El registry de imágenes

Un registry es un servidor que almacena y distribuye imágenes de contenedor. Es al despliegue lo que Gitea es al código: el lugar central del que todos descargan.

| Concepto                | Qué es                                                          | Ejemplo                                    |
|-------------------------|-----------------------------------------------------------------|--------------------------------------------|
| Registry                | El servidor completo                                            | `localhost:5000`, Docker Hub, `ghcr.io`    |
| Repositorio             | Conjunto de versiones de una misma imagen                       | `modulo5168-app`                           |
| Etiqueta (*tag*)        | Nombre legible que apunta a una versión concreta                | `v1.3.0`, `previous`                       |
| Digest                  | Huella SHA-256 del contenido; identifica la imagen sin ambigüedad | `sha256:3f2a…`                             |

El nombre completo de una imagen junta las tres primeras piezas: `localhost:5000/modulo5168-app:v1.3.0`. Si no se indica registry, Docker asume Docker Hub; si no se indica etiqueta, asume `latest`.

**Registries habituales:** Docker Hub (público, el predeterminado), GitHub Container Registry y GitLab Container Registry (integrados con el repositorio), Harbor (registry privado de empresa con escaneo de vulnerabilidades), el registro de paquetes de Gitea y `registry:2`, la imagen oficial mínima que usamos en el laboratorio.

**La API del registry.** Los registries siguen un estándar (la *OCI Distribution Specification*) y ofrecen una API HTTP. Dos llamadas útiles para comprobar el estado:

- `GET /v2/_catalog`: lista los repositorios del registry.
- `GET /v2/<repositorio>/tags/list`: lista las etiquetas de un repositorio.

**Registries sin HTTPS.** Docker solo habla con registries por HTTPS, salvo con `localhost`, que acepta por HTTP. Si el registry está en otra máquina sin certificado, hay que declararlo en `insecure-registries` del demonio Docker. En producción eso no se hace: se usa HTTPS siempre.

### 7.1.3 La versión anterior y las etiquetas

Conviene distinguir dos tipos de etiqueta:

- **Etiquetas inmutables** (`v1.2.2`, `v1.3.0`): identifican una versión concreta y nunca deberían reasignarse. Son la referencia fiable para revertir.
- **Etiquetas móviles** (`latest`, `previous`, `stable`): apuntan a distintas versiones con el tiempo. Resultan cómodas para los scripts, pero no sirven como registro histórico.

Por eso `previous` es un alias de conveniencia. La garantía real de poder revertir es que `v1.2.2` siga existiendo en el registry. Hay que remarcar un error frecuente: `docker tag` solo actúa en local. Si la etiqueta no se sube con `docker push`, en el registry no existe.

**Versionado semántico.** Las etiquetas inmutables siguen el formato `MAJOR.MINOR.PATCH`, que ya conoces de las sesiones anteriores:

| Parte  | Se incrementa cuando…                                  | Ejemplo                                |
|--------|--------------------------------------------------------|----------------------------------------|
| MAJOR  | Hay cambios incompatibles con la versión anterior      | Se elimina un endpoint de la API       |
| MINOR  | Se añade funcionalidad compatible                      | Nuevo endpoint, nueva opción de configuración |
| PATCH  | Se corrigen errores sin cambiar el comportamiento esperado | Arreglar un fallo en `/version`     |

En esta sesión la v1.3.0 cambia el formato de la configuración, pero el script de migración lo adapta automáticamente; por eso se trata como un cambio MINOR. Si el cambio obligara a los usuarios a tocar algo a mano, sería un MAJOR.

**Una etiqueta no garantiza el contenido; el digest sí.** Técnicamente, cualquiera con permisos puede volver a subir `v1.2.2` con otro contenido. El digest, en cambio, se calcula a partir del contenido y no puede cambiar. Por eso en entornos exigentes se despliega por digest (`modulo5168-app@sha256:…`) y muchos registries permiten bloquear etiquetas para que no se puedan sobrescribir.

**Qué versiones conservar.** No hace falta guardar todas las imágenes para siempre, pero sí al menos la versión en producción y la anterior. Muchos registries permiten políticas de limpieza automática que borran imágenes antiguas sin borrar las etiquetas protegidas.

### 7.1.4 El script de instalación

Un buen script de instalación cumple estas propiedades:

- **Parametrizado:** recibe la versión como argumento y no lleva valores fijos en el código.
- **Falla pronto y de forma visible:** usa `set -euo pipefail` y comprueba las dependencias antes de tocar nada.
- **Idempotente:** ejecutarlo dos veces seguidas deja el sistema en el mismo estado, sin errores.
- **Verificable:** al terminar comprueba que la aplicación responde, en lugar de dar por hecho que funciona.

El Dockerfile ya cubre la construcción. `install.sh` cubre lo que ocurre fuera del contenedor: directorios de datos, configuración inicial, sustituir el contenedor anterior y hacer el healthcheck.

**Qué hace cada opción de `set -euo pipefail`:**

| Opción        | Efecto                                                                 | Sin ella…                                                       |
|---------------|------------------------------------------------------------------------|-----------------------------------------------------------------|
| `-e`          | El script se detiene en cuanto un comando falla                        | El script sigue ejecutando pasos sobre un sistema a medio instalar |
| `-u`          | Usar una variable no definida es un error                              | Una errata en un nombre de variable se convierte en una cadena vacía |
| `-o pipefail` | Una tubería falla si falla cualquiera de sus comandos, no solo el último | Si un comando falla y su salida pasa a `tee`, el error pasa desapercibido               |

**Valores por defecto y parámetros obligatorios.** En bash, `${VARIABLE:-valor}` usa `valor` si la variable no está definida, y `${1:?mensaje}` detiene el script con un mensaje si falta el primer argumento. Con esto el script se puede ajustar desde fuera (`PUERTO=3005 ./scripts/install.sh v1.3.0`) sin editarlo.

**Idempotencia en la práctica.** Una operación es idempotente cuando aplicarla una o varias veces da el mismo resultado. Algunos ejemplos:

| No idempotente                                  | Idempotente                                                    |
|-------------------------------------------------|----------------------------------------------------------------|
| `mkdir datos` (falla si ya existe)              | `mkdir -p datos`                                               |
| `docker run --name app …` (falla si ya existe)  | `docker rm -f app` y después `docker run --name app …`         |
| `echo LOG_LEVEL=info >> app.conf` (duplica la línea) | Añadir la línea solo si `grep` no la encuentra            |
| Copiar la configuración por defecto siempre     | Copiarla solo si no existe (no pisar la de producción)         |

La idempotencia importa porque las instalaciones fallan a medias: si el script se puede relanzar sin miedo, recuperarse de un fallo es tan fácil como volver a ejecutarlo.

**Verificar, no suponer.** Que `docker run` termine bien solo significa que el contenedor ha arrancado, no que la aplicación funcione. El script hace un *healthcheck*: pregunta a la aplicación varias veces, con una espera entre intentos, y solo da la instalación por buena si responde. Si no responde, termina con código 1 para que quien lo ejecute (una persona o Jenkins) sepa que ha fallado.

### 7.1.5 El script de ajuste de datos

Cuando una versión nueva cambia el formato de los datos (esquema de BD, ficheros de configuración, estructura de carpetas), los datos existentes tienen que adaptarse. En el mundo real se usan herramientas específicas como Flyway, Liquibase, Alembic o las migraciones de Django y Laravel. Todas comparten estos principios:

- **Versionado del esquema:** los datos indican en qué versión de formato están. Así el script sabe qué pasos aplicar.
- **Copia de seguridad previa:** nunca se migra sin backup.
- **Idempotencia:** si los datos ya están migrados, el script no hace nada.
- **Orden:** primero se migra y después se arranca la versión nueva. También puede hacerse al revés si la migración es compatible hacia atrás; este matiz sirve para debatir.

**El código se reemplaza; los datos se transforman.** Cambiar de imagen es instantáneo y reversible: se para un contenedor y se arranca otro. Los datos no se pueden tirar y volver a crear: hay que convertir los existentes. Por eso la migración de datos es la parte más delicada de un despliegue.

**Cómo funciona una herramienta de migraciones.** Cada cambio de formato es un fichero numerado (por ejemplo `V1__crear_tablas.sql`, `V2__renombrar_columna.sql`). La herramienta guarda en la propia base de datos cuál fue la última migración aplicada y, al ejecutarse, aplica solo las que faltan, en orden. Nuestro `CONFIG_VERSION` cumple el mismo papel a pequeña escala: es la marca que dice en qué formato están los datos.

| Tipo de cambio en los datos      | Ejemplo                                    | ¿Compatible con la versión anterior? |
|----------------------------------|--------------------------------------------|--------------------------------------|
| Añadir algo opcional             | Nueva clave `LOG_LEVEL` con valor por defecto | Sí: la versión anterior la ignora  |
| Renombrar                        | `DB_HOST` pasa a `DATABASE_HOST`           | No: la versión anterior no encuentra la clave |
| Eliminar                         | Se quita una columna                       | No, si la versión anterior la usaba  |
| Cambiar el tipo o el formato     | Fecha de texto a fecha ISO                 | Normalmente no                       |

**Migraciones compatibles: el patrón expandir y contraer.** Para poder revertir sin restaurar datos, los cambios incompatibles se dividen en pasos compatibles:

1. **Expandir:** se añade lo nuevo sin quitar lo viejo (por ejemplo, escribir tanto `DB_HOST` como `DATABASE_HOST`). Las dos versiones de la aplicación funcionan.
2. **Migrar el código:** la versión nueva pasa a usar solo lo nuevo.
3. **Contraer:** cuando ya no hay vuelta atrás posible, en una versión posterior se elimina lo viejo.

Es más trabajo, pero permite actualizar y revertir sin parar el servicio. En la práctica de hoy no se aplica: el renombrado es directo, para que veas qué ocurre al revertir.

### 7.1.6 Revertir una versión

Revertir (*rollback*) es volver a la versión anterior cuando la nueva falla. Hay dos estrategias:

| Estrategia                 | Qué se hace                                         | Cuándo conviene                                         |
|----------------------------|-----------------------------------------------------|---------------------------------------------------------|
| Revertir (*roll back*)     | Volver a desplegar la versión anterior              | El fallo es grave y no hay arreglo rápido               |
| Avanzar (*roll forward*)   | Corregir y desplegar una versión nueva (un PATCH)   | El arreglo es pequeño y revertir es arriesgado (por ejemplo, por los datos) |

Revertir la imagen es fácil: basta con instalar `previous` o `v1.2.2`. El problema son los datos. Hay una pregunta clave: si revertimos la imagen a `previous` pero los datos ya están migrados, ¿funciona la aplicación? Normalmente no. Por eso revertir implica también restaurar el backup de datos, o bien diseñar migraciones compatibles con ambas versiones. La práctica lo comprueba.

Ten en cuenta que restaurar el backup también deshace los datos que se hayan creado o modificado después de la migración. En una aplicación real con usuarios, eso puede significar perder información; es otro motivo para preferir migraciones compatibles.

**Un plan de reversión se ensaya antes de necesitarlo.** Descubrir en plena incidencia que la imagen anterior no está en el registry o que el backup no se restaura bien es demasiado tarde. Por eso la práctica de hoy incluye un ensayo completo: actualizar y revertir.

### 7.1.7 VERSION y CHANGELOG

`VERSION` es un fichero con una sola línea, la versión actual. Los scripts y el pipeline lo leen para saber qué versión construir y etiquetar, en lugar de llevarla escrita en varios sitios.

`CHANGELOG.md` es el registro de cambios para personas: qué cambia en cada versión, en orden de más reciente a más antigua. El formato más extendido es *Keep a Changelog*, que agrupa los cambios en secciones como *Added*, *Changed*, *Fixed* y *Removed*. Un buen CHANGELOG avisa de los cambios que afectan a quien despliega, como el nuevo formato de configuración de la v1.3.0.

El historial de Git no sustituye al CHANGELOG: los mensajes de commit están escritos para desarrolladores y hay muchos por versión. El CHANGELOG resume lo que importa a quien instala o usa la aplicación.

### 7.1.8 Comprueba que lo has entendido

1. ¿Por qué no se reconstruye la imagen en cada entorno en lugar de descargarla del registry?
2. Ejecutas `docker tag modulo5168-app:v1.2.2 localhost:5000/modulo5168-app:previous` y después consultas `tags/list`. `previous` no aparece. ¿Qué falta?
3. ¿Qué diferencia hay entre una etiqueta y un digest? ¿Cuál identifica la imagen sin ambigüedad?
4. Pon un ejemplo de un comando no idempotente y escribe su versión idempotente.
5. ¿Qué haría `install.sh` sin `set -e` si falla el `docker pull`?
6. Renombrar `DB_HOST` a `DATABASE_HOST`, ¿es un cambio compatible con la versión anterior? ¿Cómo lo harías con el patrón expandir y contraer?
7. ¿En qué situación preferirías corregir y avanzar (*roll forward*) en lugar de revertir?

## 7.2 Práctica

En el laboratorio simulamos el cambio de formato con un fichero de configuración. En la v1.3.0, la clave `DB_HOST` pasa a llamarse `DATABASE_HOST` y se añade `LOG_LEVEL`.

### Paso 0 — Registry local

Si tienes montado el laboratorio completo, el registry ya está en marcha en localhost:5000 (es el de Minikube, con el reenvío de puertos de la guía de instalación, paso 6). Compruébalo:

```
curl http://localhost:5000/v2/_catalog
```

Si responde {"repositories":\[...\]}, no hagas nada más: usa localhost:5000 en toda la sesión. Si no responde porque todavía no has montado Minikube, arranca un registry temporal en el puerto 5001 (el 5000 está reservado para el del laboratorio) y usa ese en su lugar:

```
docker run -d --name registry-temp -p 5001:5000 --restart unless-stopped registry:2
export REGISTRY=localhost:5001 REG=localhost:5001
```

No arranques un registry:2 en el 5000 si ya existe el del laboratorio: el puerto estaría ocupado y el reenvío de Minikube dejaría de funcionar.

> *Alternativa: el registry de paquetes de Gitea (*`localhost:3000/<usuario>/modulo5168-app`*). Requiere* `docker login localhost:3000`*. Si se accede por un nombre distinto de* `localhost`*, además hay que declararlo en* `insecure-registries` *del demonio Docker.*

### Paso 1 — Estructura del repositorio

La app del zip (`lab/app`) todavía no tiene `VERSION`, `CHANGELOG.md` ni las carpetas `config/` y `scripts/`: las creáis en esta sesión. Así queda la carpeta al terminar:

```
lab/app/
├── server.js, package.json, Dockerfile...   # ya estaban (sesiones 3 y 4)
├── VERSION                  # nuevo (paso 1): contiene v1.3.0
├── CHANGELOG.md             # nuevo (paso 1)
├── config/
│   └── app.conf.example     # nuevo (paso 1): plantilla de configuración
└── scripts/
    ├── install.sh           # nuevo (paso 2)
    └── migrate-data.sh      # nuevo (paso 3)
```

Crea ahora la plantilla de configuración, todavía en formato 1 (el de la v1.2.2), y los ficheros `VERSION` y `CHANGELOG.md`. Desde la carpeta `lab/app`:

```bash
mkdir -p config
cat > config/app.conf.example <<'EOF'
CONFIG_VERSION=1
APP_NAME=modulo5168
DB_HOST=localhost
EOF
echo "v1.3.0" > VERSION
cat > CHANGELOG.md <<'EOF'
# Changelog

## v1.3.0
- Nuevo formato de configuración (formato 2): `DB_HOST` pasa a llamarse `DATABASE_HOST` y se añade `LOG_LEVEL`.
- Se añaden `scripts/install.sh` y `scripts/migrate-data.sh`.

## v1.2.2
- Imagen optimizada de la sesión 4.
EOF
```

Para simular un sistema con datos de la versión anterior, se crea la configuración "de producción" en formato v1. Esta va fuera del repositorio, en `~/modulo5168/data`, que es la carpeta que `install.sh` monta en el contenedor:

```
mkdir -p ~/modulo5168/data
cat > ~/modulo5168/data/app.conf <<'EOF'
CONFIG_VERSION=1
APP_NAME=modulo5168
DB_HOST=localhost
EOF
```

### Paso 2 — install.sh

Copia y pega este bloque entero en la terminal, desde la carpeta `lab/app`. Crea el fichero `scripts/install.sh` con todo lo que hay entre `cat > ... <<'EOF'` y la línea `EOF`, y le da permiso de ejecución. No lanza el script: eso se hace en el paso 5.

```bash
mkdir -p scripts
cat > scripts/install.sh <<'EOF'
#!/usr/bin/env bash
# install.sh — instala o actualiza modulo5168-app a la versión indicada
# Uso: ./scripts/install.sh <version>     (ej.: ./scripts/install.sh v1.3.0)
set -euo pipefail

VERSION="${1:?Uso: $0 <version>}"
REGISTRY="${REGISTRY:-localhost:5000}"
IMAGEN="${REGISTRY}/modulo5168-app:${VERSION}"
CONTENEDOR="modulo5168-app"
PUERTO="${PUERTO:-3004}"
DIR_DATOS="${DIR_DATOS:-$HOME/modulo5168/data}"

echo "==> Comprobando dependencias del sistema..."
for cmd in docker curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: falta '$cmd'"; exit 1; }
done
docker info >/dev/null 2>&1 || { echo "ERROR: el demonio Docker no responde"; exit 1; }

echo "==> Preparando directorio de datos: $DIR_DATOS"
mkdir -p "$DIR_DATOS"
if [ ! -f "$DIR_DATOS/app.conf" ]; then
  echo "    Primera instalación: se copia la configuración por defecto"
  cp config/app.conf.example "$DIR_DATOS/app.conf"
fi

echo "==> Descargando $IMAGEN"
docker pull "$IMAGEN"

echo "==> Sustituyendo el contenedor anterior (si existe)"
docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
docker run -d --name "$CONTENEDOR" \
  -p "${PUERTO}:3000" \
  -v "$DIR_DATOS:/app/data" \
  --restart unless-stopped \
  "$IMAGEN"

echo "==> Verificando que la aplicación responde..."
for i in $(seq 1 10); do
  if curl -fs "http://localhost:${PUERTO}/" >/dev/null; then
    echo "Instalación completada para la versión $VERSION"
    exit 0
  fi
  sleep 2
done
echo "ERROR: la aplicación no responde tras la instalación"
exit 1
EOF
chmod +x scripts/install.sh
```

> *La app escucha en el puerto 3000 dentro del contenedor; en el equipo se publica en el 3004 para no chocar con Gitea (3000), los contenedores de prueba (3001-3003) ni Jenkins (8080). La carpeta* `/app/data` *y* `app.conf` *simulan los datos de producción: la app de ejemplo no los lee, pero el volumen permite comprobar que sobreviven al cambio de contenedor.*

### Paso 3 — migrate-data.sh

Igual que en el paso anterior: copia y pega este bloque entero en la terminal. Crea el fichero `scripts/migrate-data.sh` y le da permiso de ejecución.

```bash
cat > scripts/migrate-data.sh <<'EOF'
#!/usr/bin/env bash
# migrate-data.sh — adapta la configuración existente al formato de la versión indicada
# Uso: ./scripts/migrate-data.sh <version>
set -euo pipefail

VERSION="${1:?Uso: $0 <version>}"
DIR_DATOS="${DIR_DATOS:-$HOME/modulo5168/data}"
CONF="$DIR_DATOS/app.conf"

if [ ! -f "$CONF" ]; then
  echo "No hay configuración previa: nada que migrar"
  exit 0
fi

ACTUAL=$(grep -E '^CONFIG_VERSION=' "$CONF" | cut -d= -f2 || echo 1)
echo "==> Formato actual de la configuración: $ACTUAL"

if [ "$ACTUAL" -ge 2 ]; then
  echo "La configuración ya está en formato 2: no se hace nada"
  exit 0
fi

COPIA="$CONF.bak.$(date +%Y%m%d-%H%M%S)"
cp "$CONF" "$COPIA"
echo "==> Copia de seguridad creada: $COPIA"

echo "==> Adaptando configuración de la versión anterior a $VERSION..."
sed -i 's/^DB_HOST=/DATABASE_HOST=/' "$CONF"
grep -q '^LOG_LEVEL=' "$CONF" || echo 'LOG_LEVEL=info' >> "$CONF"
if grep -q '^CONFIG_VERSION=' "$CONF"; then
  sed -i 's/^CONFIG_VERSION=.*/CONFIG_VERSION=2/' "$CONF"
else
  echo 'CONFIG_VERSION=2' >> "$CONF"
fi

echo "Migración completada"
EOF
chmod +x scripts/migrate-data.sh
```

Por último, actualiza la plantilla del repositorio al formato 2, para que las instalaciones nuevas ya partan del formato nuevo:

```bash
cat > config/app.conf.example <<'EOF'
CONFIG_VERSION=2
APP_NAME=modulo5168
DATABASE_HOST=localhost
LOG_LEVEL=info
EOF
```

### Paso 4 — Publicar la versión nueva conservando la anterior

El orden importa: primero se preserva la versión actual y después se publica la nueva.

```
REG="${REG:-localhost:5000}"

# 1. Publicar la versión actual (v1.2.2, de la sesión 4) y marcarla como 'previous'
docker tag  modulo5168-app:v1.2.2 $REG/modulo5168-app:v1.2.2
docker push $REG/modulo5168-app:v1.2.2
docker tag  $REG/modulo5168-app:v1.2.2 $REG/modulo5168-app:previous
docker push $REG/modulo5168-app:previous
```

Si no tenéis la imagen `modulo5168-app:v1.2.2` en local, reconstruidla desde su etiqueta: `git switch --detach v1.2.2`, `docker build -t modulo5168-app:v1.2.2 .` y `git switch main`.

Antes de construir la nueva, subid la versión a `1.3.0` en `package.json` y en la línea `ENV APP_VERSION` del `Dockerfile`.

```
# 2. Construir y publicar la nueva
docker build -t $REG/modulo5168-app:v1.3.0 .
docker push $REG/modulo5168-app:v1.3.0

# 3. Etiquetar la versión en Git
git add .
git commit -m "feat: paquete de despliegue con instalación y migración (v1.3.0)"
git tag -a v1.3.0 -m "Versión 1.3.0: nuevo formato de configuración"
git push origin main --tags

# 4. Comprobar
docker images | grep modulo5168-app
curl -s http://$REG/v2/modulo5168-app/tags/list
```

La última orden debería devolver algo como `{"name":"modulo5168-app","tags":["v1.2.2","previous","v1.3.0"]}`.

### Paso 5 — Ensayo completo: actualizar y revertir

```
chmod +x scripts/*.sh

# Estado de partida: v1.2.2 funcionando con configuración v1
./scripts/install.sh v1.2.2

# Actualización: primero datos, luego imagen
./scripts/migrate-data.sh v1.3.0
./scripts/install.sh v1.3.0
cat ~/modulo5168/data/app.conf        # comprobar formato 2

# Idempotencia: repetir no debe romper nada
./scripts/migrate-data.sh v1.3.0

# Reversión: imagen anterior + restaurar datos
./scripts/install.sh previous
cp ~/modulo5168/data/app.conf.bak.* ~/modulo5168/data/app.conf
```

Anota qué pasaría si revirtieras la imagen sin restaurar el backup. Enlaza con la pregunta de la teoría y con la sesión de rollback del RA3.

### Ampliación (para quien termine antes)

- **\`rollback.sh\`:** automatiza la reversión (instalar `previous` y restaurar el backup más reciente).
- **Manifiesto del paquete:** generar un `release-v1.3.0.tar.gz` con los scripts, `VERSION`, `CHANGELOG.md` y un `MANIFEST.txt` que liste las imágenes y sus digests (`docker inspect --format '{{index .RepoDigests 0}}'`).
- **Instalación sin registry:** `docker save` de ambas imágenes dentro del paquete, para entornos sin acceso a red.

## 7.3 Revisión

**Puesta en común:** algunas personas muestran su ensayo completo y el resto lo contrasta con estas preguntas:

- ¿Qué pasa si ejecutáis `install.sh` sin argumento? ¿Y dos veces seguidas?
- ¿Dónde está la garantía real de poder volver a la v1.2.2: en `previous` o en `v1.2.2`?
- ¿Por qué la migración hace backup si "solo" cambia un fichero de texto?
- En la próxima UT, ¿qué etapas del pipeline de Jenkins llamarían a cada script?

**Errores típicos a revisar :**

- Scripts escritos en Windows con saltos de línea CRLF: aparece el error `bad interpreter`. Se soluciona con `sed -i 's/\r$//' scripts/*.sh`.
- Olvidar `chmod +x`, o no hacer `git add --chmod=+x` al subirlos a Gitea.
- Hacer `docker tag ... previous` sin `docker push`: la etiqueta no existe en el registry.
- Publicar la v1.3.0 antes de etiquetar `previous`, o sobrescribir `v1.2.2` al reconstruir.

## Entregable y evaluación (RA1.d)

**Entregable:**

- Los dos scripts en `scripts/` del repositorio de Gitea, con commit propio.
- `config/app.conf.example` actualizado.
- Una captura de `docker images` que muestre la imagen nueva junto a `previous`.
- Una captura del `tags/list` del registry.
- Un párrafo que responda qué ocurre al revertir la imagen sin restaurar los datos.

| **Indicador**                                                                       | **Peso** |
|-------------------------------------------------------------------------------------|----------|
| La versión anterior se conserva en el registry (tag semántico + `previous` subidos) | 25 %     |
| `install.sh` parametrizado, comprueba dependencias y verifica el arranque           | 30 %     |
| `migrate-data.sh` hace backup, es idempotente y detecta la versión de formato       | 30 %     |
| Ensayo de actualización y reversión documentado, con la respuesta razonada          | 15 %     |

---

[← Sesión 4](sesion4.md) · [Índice de la UT01](./) · [Sesión 6 →](sesion6.md)
{% endraw %}
