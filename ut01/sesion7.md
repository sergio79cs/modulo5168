[← Sesión 6](sesion6.md) · [Índice de la UT01](./) · [Sesión 8 →](sesion8.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 7 - Almacenamiento de resultados de pruebas

## 1. Teoría

### Para qué sirve guardar resultados

Un resultado que no se guarda solo dice si algo pasa hoy. Un resultado guardado permite comparar versiones, detectar regresiones y justificar una decisión de versionado. Ejemplo: no publicar una versión cuyo test de carga empeora claramente frente a la anterior.

### Qué hay que guardar además de la salida

Una salida sin contexto no se puede comparar. Junto a la salida se guarda la versión, el commit, la fecha, la máquina y los parámetros de la prueba (`-n`, `-c`, URL). Se fija una convención de nombres: `tipo-version.txt`, por ejemplo `carga-v1.1.0.txt`.

### Cómo leer la salida de `ab`

Proyectad una salida real y marcad las cuatro métricas que se compararán:

| Métrica de `ab`            | Qué mide                               | Cuándo empeora    |
|----------------------------|----------------------------------------|-------------------|
| Requests per second        | Rendimiento                            | Si baja           |
| Time per request (mean)    | Latencia media (ms)                    | Si sube           |
| Percentil 95 (tabla final) | Latencia de las peticiones lentas (ms) | Si sube           |
| Failed requests            | Peticiones fallidas                    | Si es mayor que 0 |

El percentil 95 suele revelar más que la media.

### Ruido y umbrales

En `localhost` los tiempos son de pocos milisegundos y varían mucho entre ejecuciones. Por eso se calienta la aplicación antes de medir, se usan más peticiones y se compara con un umbral (por ejemplo, 10 %) en vez de exigir que la nueva versión sea igual o mejor. Este umbral es lo que después convierte la comparación en una puerta de calidad dentro del pipeline.

### Dónde se guardan en la vida real

Se plantea como pregunta abierta para el cierre. Hay tres opciones: el repositorio Git (lo que se hace hoy), los artefactos del servidor de CI (en Jenkins, `archiveArtifacts`) o un sistema de métricas. `ab` también exporta formatos estructurados: `-e` para CSV de percentiles y `-g` para TSV.

## 2. Práctica

### Paso 0. Comprobaciones previas

- `ab` está instalado: `ab -V`. En Debian/Ubuntu viene en el paquete `apache2-utils`.
- La aplicación responde en `http://localhost:3001/` (contenedor app de la sesión 6).
- Existen las etiquetas de versión de sesiones anteriores: `git tag`.

### Paso 1. Script para guardar resultados con metadatos

Redirigir la salida sin más pierde stderr y no deja constancia del commit probado. El script `guardar-resultados.sh` añade una cabecera con metadatos y un calentamiento previo a la prueba de carga:

```
#!/usr/bin/env bash
# Uso: ./guardar-resultados.sh v1.1.0
set -euo pipefail
V=${1:?Uso: $0 <version>}
URL=http://localhost:3001/
mkdir -p test-results

{
  echo "# version=$V commit=$(git rev-parse --short HEAD) fecha=$(date -Iseconds) host=$(hostname)"
  ./test-funcional.sh
} > "test-results/funcional-$V.txt" 2>&1

ab -n 200 -c 10 "$URL" > /dev/null 2>&1          # calentamiento, no se guarda
{
  echo "# version=$V commit=$(git rev-parse --short HEAD) fecha=$(date -Iseconds) params=-n1000,-c10"
  ab -n 1000 -c 10 "$URL"
} > "test-results/carga-$V.txt"
```

Por el `set -e`, si el test funcional falla el script se detiene y no se hace la prueba de carga. Conviene comentarlo en clase: no tiene sentido medir el rendimiento de una versión rota.

### Paso 2. Resultados de v1.0.0 y v1.1.0

El entregable pide al menos dos versiones. Si no hay resultados guardados de v1.0.0, se generan ahora. Hay que medir v1.0.0 antes de hacer commit de los scripts, porque al cambiar a esa etiqueta desaparecerían del directorio de trabajo:

```
git switch --detach v1.0.0
# arrancar la aplicación como en sesiones anteriores
./guardar-resultados.sh v1.0.0
git switch main
# volver a arrancar la aplicación con la versión actual
./guardar-resultados.sh v1.1.0
```

### Paso 3. Script de comparación

Este paso es el núcleo de RA1.f. `comparar-carga.sh` muestra una tabla con las cuatro métricas y termina con código 1 si la versión no es apta. Así, en sesiones posteriores se podrá usar como paso del pipeline de Jenkins.

```
#!/usr/bin/env bash
# Uso: ./comparar-carga.sh test-results/carga-v1.0.0.txt test-results/carga-v1.1.0.txt [umbral_%]
set -euo pipefail
ANT=$1; NUE=$2; UMBRAL=${3:-10}

rps()    { awk '/^Requests per second/ {print $4}' "$1"; }
tmedia() { awk '/^Time per request/ && /\(mean\)$/ {print $4}' "$1"; }
p95()    { awk '$1=="95%" {print $2}' "$1"; }
fallos() { awk '/^Failed requests/ {print $3}' "$1"; }
var()    { awk -v a="$1" -v b="$2" 'BEGIN { if (a==0) print "n/a"; else printf "%+.1f", (b-a)/a*100 }'; }

printf "%-20s %10s %10s %9s\n" "Métrica" "Anterior" "Nueva" "Var %"
for m in rps tmedia p95 fallos; do
  a=$($m "$ANT"); b=$($m "$NUE")
  printf "%-20s %10s %10s %9s\n" "$m" "$a" "$b" "$(var "$a" "$b")"
done

APTA=1
if awk -v v="$(var "$(rps "$ANT")" "$(rps "$NUE")")" -v u="$UMBRAL" 'BEGIN{exit !(v < -u)}'; then
  echo "✗ Las peticiones por segundo caen más de un $UMBRAL %"; APTA=0; fi
if awk -v v="$(var "$(p95 "$ANT")" "$(p95 "$NUE")")" -v u="$UMBRAL" 'BEGIN{exit !(v > u)}'; then
  echo "✗ El percentil 95 empeora más de un $UMBRAL %"; APTA=0; fi
if [ "$(fallos "$NUE")" -gt 0 ]; then
  echo "✗ Hay peticiones fallidas"; APTA=0; fi

if [ $APTA -eq 1 ]; then echo "✓ APTA para publicar"; else echo "✗ NO APTA"; exit 1; fi
```

Reto para quien acabe antes: usar umbrales distintos para latencia y rendimiento, o incluir también el resultado del test funcional en la decisión.

### Paso 4. Versionar en Git

```
git add guardar-resultados.sh comparar-carga.sh test-results/
git commit -m "chore(test-results): resultados de v1.0.0 y v1.1.0 y script de comparación"
```

En Conventional Commits, el tipo `test:` se reserva para añadir o modificar pruebas; para guardar resultados encaja mejor `chore:`. Si en sesiones anteriores se usó `test:`, basta con mantener un criterio coherente.

### Paso 5. Margen

Para quien vaya retrasado o quiera repetir mediciones y ver cuánto varían entre ejecuciones.

## 3. Cierre

### Discusión go/no-go por grupos

Cada grupo presenta la tabla que genera `comparar-carga.sh` y responde:

1. ¿Publicaríais la nueva versión? ¿Por qué?
2. ¿La diferencia es real o es ruido? ¿Qué pasaría si repetís la medición?
3. ¿Qué umbral es razonable y quién debería decidirlo?

### Debate: ¿deben ir los resultados en Git?

A favor: es trazable y va junto al código que se ha probado. En contra: el repositorio crece y los resultados dependen de la máquina en la que se ejecutan. Pregunta final: ¿quién debería ejecutar y guardar estas pruebas, cada desarrollador o el servidor de CI? Es el puente hacia Jenkins en las sesiones siguientes.

Escribe una frase: "Mi versión es / no es apta porque…", con al menos una cifra.

## 4. Entregable y evaluación

El entregable es la carpeta `test-results/` versionada en Git con resultados de al menos dos versiones, los dos scripts y un fichero `test-results/DECISION-v1.1.0.md`. Ese fichero contiene la tabla que genera `comparar-carga.sh` y la decisión justificada en 3-5 líneas; es lo que demuestra que se ha comparado, no solo guardado.

| Indicador (RA1.f)                                           | Evidencia                                             |
|-------------------------------------------------------------|-------------------------------------------------------|
| Guarda los resultados con convención de nombres y metadatos | `test-results/*.txt` con cabecera de versión y commit |
| Conserva resultados de al menos dos versiones en Git        | `git log -- test-results/`                            |
| Compara las métricas relevantes de forma reproducible       | `comparar-carga.sh` funcionando                       |
| Toma una decisión de versionado justificada con datos       | `DECISION-v1.1.0.md`                                  |

## Anexo: versión con regresión intencionada

Si v1.0.0 y v1.1.0 rinden casi igual, el script dirá APTA y la discusión tendrá poco recorrido. Para que haya algo que detectar, se crea una versión v1.1.1 que hace la aplicación más lenta a propósito.

El cambio se añade al principio del manejador de la ruta `/` de la aplicación:

```
// Regresión intencionada: bloquea el event loop unos 20 ms por petición
const fin = Date.now() + 20; while (Date.now() < fin) {}
```

Como tienes tu propio laboratorio, crea la versión en tu repositorio:

```
git switch -c regresion
# añadir las dos líneas anteriores en la ruta /
git commit -am "feat: cambio en la ruta principal"
git tag v1.1.1
# arrancar la aplicación con este código
./guardar-resultados.sh v1.1.1
./comparar-carga.sh test-results/carga-v1.1.0.txt test-results/carga-v1.1.1.txt
```

El resultado esperado es NO APTA. Después se pide localizar la causa con `git diff v1.1.0 v1.1.1` y volver a `main` con `git switch main`. Para que el efecto sorprenda más, puedes repartir el cambio como fichero `.patch` (se aplica con `git apply`) sin decir qué contiene.

---

[← Sesión 6](sesion6.md) · [Índice de la UT01](./) · [Sesión 8 →](sesion8.md)
