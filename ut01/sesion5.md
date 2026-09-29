{% raw %}
[← Sesión 4](sesion4.md) · [Índice de la UT01](./) · [Sesión 6 →](sesion6.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 5 - Comprobación del paquete

**Objetivo de la sesión:** que el alumnado entienda que desplegar no es solo publicar una imagen nueva. Un paquete de despliegue completo debe permitir tres cosas: instalar la versión nueva, adaptar los datos existentes a ella y volver atrás si algo falla.

## 7.1 Teoría

### Qué entendemos por "paquete"

En este módulo, el paquete es el conjunto de artefactos necesarios para poner una versión en producción de forma repetible. En nuestro laboratorio lo forman:

| **Componente**                                | **Dónde vive**         | **Para qué sirve**                                           |
|-----------------------------------------------|------------------------|--------------------------------------------------------------|
| Imagen nueva (v1.1.0)                         | Registry               | El software que se despliega                                 |
| Imagen anterior (previous + su tag semántico) | Registry               | Comparar comportamiento y revertir                           |
| install.sh                                    | Repositorio (scripts/) | Poner en marcha la versión de forma automática y verificable |
| migrate-data.sh                               | Repositorio (scripts/) | Adaptar datos y configuración existentes al formato nuevo    |
| VERSION / CHANGELOG.md                        | Repositorio            | Saber qué se despliega y qué cambia                          |

Una idea para lanzar al grupo: "Si mañana la v1.1.0 falla en producción, ¿qué necesitáis tener a mano para volver a la v1.0.0 en cinco minutos?" Las respuestas suelen justificar solas la existencia de cada componente.

### La versión anterior y las etiquetas

Conviene distinguir dos tipos de etiqueta:

- **Etiquetas inmutables** (v1.0.0, v1.1.0): identifican una versión concreta y nunca deberían reasignarse. Son la referencia fiable para revertir.

- **Etiquetas móviles** (latest, previous, stable): apuntan a distintas versiones con el tiempo. Resultan cómodas para los scripts, pero no sirven como registro histórico.

Por eso previous es un alias de conveniencia. La garantía real de poder revertir es que v1.0.0 siga existiendo en el registry. Hay que remarcar un error frecuente: docker tag solo actúa en local. Si la etiqueta no se sube con docker push, en el registry no existe.

### El script de instalación

Un buen script de instalación cumple estas propiedades:

- **Parametrizado:** recibe la versión como argumento y no lleva valores fijos en el código.

- **Falla pronto y de forma visible:** usa set -euo pipefail y comprueba las dependencias antes de tocar nada.

- **Idempotente:** ejecutarlo dos veces seguidas deja el sistema en el mismo estado, sin errores.

- **Verificable:** al terminar comprueba que la aplicación responde, en lugar de dar por hecho que funciona.

El Dockerfile ya cubre la construcción. install.sh cubre lo que ocurre fuera del contenedor: directorios de datos, configuración inicial, sustituir el contenedor anterior y hacer el healthcheck.

### El script de ajuste de datos

Cuando una versión nueva cambia el formato de los datos (esquema de BD, ficheros de configuración, estructura de carpetas), los datos existentes tienen que adaptarse. En el mundo real se usan herramientas específicas como Flyway, Liquibase, Alembic o las migraciones de Django y Laravel. Todas comparten estos principios:

- **Versionado del esquema:** los datos indican en qué versión de formato están. Así el script sabe qué pasos aplicar.

- **Copia de seguridad previa:** nunca se migra sin backup.

- **Idempotencia:** si los datos ya están migrados, el script no hace nada.

- **Orden:** primero se migra y después se arranca la versión nueva. También puede hacerse al revés si la migración es compatible hacia atrás; este matiz sirve para debatir.

Hay una pregunta clave para cerrar la teoría: si revertimos la imagen a previous pero los datos ya están migrados, ¿funciona la aplicación? Normalmente no. Por eso revertir implica también restaurar el backup de datos, o bien diseñar migraciones compatibles con ambas versiones. La práctica lo comprueba.

## 7.2 Práctica

En el laboratorio simulamos el cambio de formato con un fichero de configuración. En la v1.1.0, la clave DB_HOST pasa a llamarse DATABASE_HOST y se añade LOG_LEVEL.

### Paso 0 — Registry local

Si aún no está en marcha:

```
docker run -d --name registry -p 5000:5000 --restart unless-stopped registry:2
```

> *Alternativa: el registry de paquetes de Gitea (localhost:3000/\<usuario\>/modulo5168-app). Requiere docker login localhost:3000. Si se accede por un nombre distinto de localhost, además hay que declararlo en insecure-registries del demonio Docker.*

### Paso 1 — Estructura del repositorio

```
modulo5168-app/
├── Dockerfile
├── VERSION                  # contiene: v1.1.0
├── CHANGELOG.md
├── config/
│   └── app.conf.example     # plantilla en formato de la versión actual
└── scripts/
    ├── install.sh
    └── migrate-data.sh
```

Para simular un sistema con datos de la versión anterior, se crea la configuración "de producción" en formato v1:

```
mkdir -p ~/modulo5168/data
cat > ~/modulo5168/data/app.conf <<'EOF'
CONFIG_VERSION=1
APP_NAME=modulo5168
DB_HOST=localhost
EOF
```

### Paso 2 — install.sh

```
#!/usr/bin/env bash
# install.sh — instala o actualiza modulo5168-app a la versión indicada
# Uso: ./scripts/install.sh <version>     (ej.: ./scripts/install.sh v1.1.0)
set -euo pipefail

VERSION="${1:?Uso: $0 <version>}"
REGISTRY="${REGISTRY:-localhost:5000}"
IMAGEN="${REGISTRY}/modulo5168-app:${VERSION}"
CONTENEDOR="modulo5168-app"
PUERTO="${PUERTO:-8080}"
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
  -p "${PUERTO}:8080" \
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
```

> *Hay que adaptar el puerto interno (8080) y la ruta de datos (/app/data) a lo que use la aplicación del módulo.*

### Paso 3 — migrate-data.sh

```
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
```

Después se actualiza config/app.conf.example al formato 2. Las instalaciones nuevas ya parten del formato nuevo.

### Paso 4 — Publicar la versión nueva conservando la anterior

El orden importa: primero se preserva la versión actual y después se publica la nueva.

```
REG=localhost:5000

# 1. La versión actual pasa a ser 'previous' (en local y en el registry)
docker pull $REG/modulo5168-app:v1.0.0
docker tag  $REG/modulo5168-app:v1.0.0 $REG/modulo5168-app:previous
docker push $REG/modulo5168-app:previous

# 2. Construir y publicar la nueva
docker build -t $REG/modulo5168-app:v1.1.0 .
docker push $REG/modulo5168-app:v1.1.0

# 3. Comprobar
docker images | grep modulo5168-app
curl -s http://localhost:5000/v2/modulo5168-app/tags/list
```

La última orden debería devolver algo como {"name":"modulo5168-app","tags":\["v1.0.0","previous","v1.1.0"\]}.

### Paso 5 — Ensayo completo: actualizar y revertir

```
chmod +x scripts/*.sh

# Estado de partida: v1.0.0 funcionando con configuración v1
./scripts/install.sh v1.0.0

# Actualización: primero datos, luego imagen
./scripts/migrate-data.sh v1.1.0
./scripts/install.sh v1.1.0
cat ~/modulo5168/data/app.conf        # comprobar formato 2

# Idempotencia: repetir no debe romper nada
./scripts/migrate-data.sh v1.1.0

# Reversión: imagen anterior + restaurar datos
./scripts/install.sh previous
cp ~/modulo5168/data/app.conf.bak.* ~/modulo5168/data/app.conf
```

Hay que pedir al alumnado que anote qué pasaría si revierte la imagen sin restaurar el backup. Enlaza con la pregunta de la teoría y con la sesión de rollback del RA3.

### Ampliación (para quien termine antes)

- **\`rollback.sh\`:** automatiza la reversión (instalar previous y restaurar el backup más reciente).

- **Manifiesto del paquete:** generar un release-v1.1.0.tar.gz con los scripts, VERSION, CHANGELOG.md y un MANIFEST.txt que liste las imágenes y sus digests (docker inspect --format '{{index .RepoDigests 0}}').

- **Instalación sin registry:** docker save de ambas imágenes dentro del paquete, para entornos sin acceso a red.

## 7.3 Revisión

**Puesta en común :** dos o tres alumnos muestran su ensayo completo. El resto contrasta con estas preguntas:

- ¿Qué pasa si ejecutáis install.sh sin argumento? ¿Y dos veces seguidas?

- ¿Dónde está la garantía real de poder volver a la v1.0.0: en previous o en v1.0.0?

- ¿Por qué la migración hace backup si "solo" cambia un fichero de texto?

- En la próxima UT, ¿qué etapas del pipeline de Jenkins llamarían a cada script?

**Errores típicos a revisar :**

- Scripts escritos en Windows con saltos de línea CRLF: aparece el error bad interpreter. Se soluciona con sed -i 's/\r\$//' scripts/\*.sh.

- Olvidar chmod +x, o no hacer git add --chmod=+x al subirlos a Gitea.

- Hacer docker tag ... previous sin docker push: la etiqueta no existe en el registry.

- Publicar la v1.1.0 antes de etiquetar previous, o sobrescribir v1.0.0 al reconstruir.

**Cierre (5'):** enlazar con la sesión siguiente, donde estos scripts se integrarán en el pipeline.

## Entregable y evaluación (RA1.d)

**Entregable:**

- Los dos scripts en scripts/ del repositorio de Gitea, con commit propio.

- config/app.conf.example actualizado.

- Una captura de docker images que muestre la imagen nueva junto a previous.

- Una captura del tags/list del registry.

- Un párrafo que responda qué ocurre al revertir la imagen sin restaurar los datos.

| **Indicador**                                                                     | **Peso** |
|-----------------------------------------------------------------------------------|----------|
| La versión anterior se conserva en el registry (tag semántico + previous subidos) | 25 %     |
| install.sh parametrizado, comprueba dependencias y verifica el arranque           | 30 %     |
| migrate-data.sh hace backup, es idempotente y detecta la versión de formato       | 30 %     |
| Ensayo de actualización y reversión documentado, con la respuesta razonada        | 15 %     |

---

[← Sesión 4](sesion4.md) · [Índice de la UT01](./) · [Sesión 6 →](sesion6.md)
{% endraw %}
