[← Sesión 6](sesion6.md) · [Índice de la UT01](./) · [Sesión 8 →](sesion8.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 7 - Almacenamiento de resultados de pruebas

## 1. Teoría

### 1.1 Para qué sirve guardar resultados

Un resultado que no se guarda solo dice si algo pasa hoy. Un resultado guardado permite comparar versiones, detectar regresiones y justificar una decisión de versionado. Ejemplo: no publicar una versión cuyo test de carga empeora claramente frente a la anterior.

En la sesión 6 las pruebas respondían a «¿pasa o no pasa?». En esta sesión la pregunta cambia a «¿es mejor o peor que la versión anterior?». Para responderla hace falta memoria: los resultados de versiones anteriores tienen que estar guardados y ser comparables.

**Usos de los resultados guardados:**

| Uso                         | Pregunta que responde                                      | Ejemplo                                                         |
|-----------------------------|------------------------------------------------------------|-----------------------------------------------------------------|
| Detectar regresiones        | ¿Esta versión ha empeorado algo que antes iba bien?        | v1.3.1 responde un 40 % más lento que v1.3.0                    |
| Decidir si se publica       | ¿Es apta esta versión para producción? (*go/no-go*)        | No se etiqueta como release hasta que la comparación sale APTA  |
| Ver tendencias              | ¿El rendimiento se degrada poco a poco, versión a versión? | Cada versión pierde un 3 %: ninguna salta la alarma, todas juntas sí |
| Diagnosticar incidencias    | ¿Desde qué versión aparece el problema?                    | Buscar la primera versión cuyos resultados empeoran             |
| Auditoría y trazabilidad    | ¿Qué se probó antes de desplegar y con qué resultado?      | Demostrar ante un cliente que la versión pasó las pruebas       |
| Planificar capacidad        | ¿Cuántos usuarios aguanta el servicio con estos recursos?  | Decidir si hacen falta más réplicas antes de una campaña        |

**Regresión** es todo empeoramiento respecto a una versión anterior: una funcionalidad que deja de funcionar (regresión funcional) o una aplicación que se vuelve más lenta o consume más recursos (regresión de rendimiento). Las regresiones de rendimiento son traicioneras porque la aplicación sigue funcionando y ninguna prueba funcional falla.

### 1.2 Qué hay que guardar además de la salida

Una salida sin contexto no se puede comparar. Si mañana encuentras un fichero que dice «850 peticiones por segundo», no sabes de qué versión es, en qué equipo se midió ni con qué parámetros. Un resultado útil responde a las preguntas qué, cuándo, dónde y cómo.

| Metadato              | Por qué es necesario                                                 | Cómo se obtiene en bash        |
|-----------------------|----------------------------------------------------------------------|--------------------------------|
| Versión               | Saber a qué versión pertenece el resultado                           | Parámetro del script o `VERSION` |
| Commit                | Identificar el código exacto probado, aunque la etiqueta se mueva    | `git rev-parse --short HEAD`   |
| Fecha y hora          | Ordenar resultados y relacionarlos con otros eventos                 | `date -Iseconds` (formato ISO 8601) |
| Máquina               | Los resultados de equipos distintos no son comparables               | `hostname`                     |
| Parámetros            | `-n 100 -c 10` y `-n 1000 -c 50` miden cosas distintas               | Escribirlos en la cabecera     |
| URL o endpoint        | `/` y `/health` pueden tener rendimientos muy diferentes            | Variable `URL` del script      |

**Reproducibilidad.** Una medición es reproducible cuando otra persona, con los mismos metadatos, puede repetirla y obtener resultados parecidos. Si falta un metadato, el resultado deja de ser reproducible y pierde casi todo su valor.

**Convención de nombres.** Si cada persona nombra los ficheros a su manera, ningún script puede encontrarlos. Se fija una convención y se respeta siempre: `tipo-version.txt`, por ejemplo `carga-v1.3.0.txt` o `funcional-v1.3.0.txt`. Una buena convención es predecible (se puede construir el nombre sin mirar el directorio), ordenable (los ficheros salen agrupados al listar) y sin espacios ni caracteres especiales.

**La salida completa, no solo el resumen.** Conviene guardar la salida entera de la herramienta, no solo las cifras que interesan hoy. Mañana puede interesar otra métrica, y la salida original es la evidencia de que la cifra no se ha inventado.

### 1.3 Formatos de los resultados

Un resultado se puede guardar en texto libre o en un formato estructurado. La diferencia está en lo fácil que es procesarlo después con un programa.

| Formato               | Ejemplo                                     | Ventajas                                        | Inconvenientes                                    |
|-----------------------|---------------------------------------------|-------------------------------------------------|---------------------------------------------------|
| Texto libre           | Salida normal de `ab`                       | Legible por personas, es lo que da la herramienta | Hay que extraer las cifras con `grep` y `awk`; frágil si cambia el formato |
| CSV / TSV             | `ab -e percentiles.csv`, `ab -g datos.tsv`  | Se abre en una hoja de cálculo, fácil de graficar | Solo datos tabulares, sin contexto               |
| JSON                  | Salida de k6 o de muchas APIs               | Estructurado, con campos con nombre             | Menos legible a simple vista                      |
| JUnit XML             | Informes de pruebas de Jest, pytest, Maven  | Estándar que entienden Jenkins y casi todos los CI | Pensado para pasa/falla, no para métricas         |

En esta sesión se guarda texto libre porque es lo que produce `ab` y así se ve todo el proceso. Los scripts extraen las cifras con `awk`, que busca la línea por su texto y toma la columna correspondiente. Es la técnica que usan muchos scripts reales, pero conviene saber que se rompe si la herramienta cambia el formato de su salida.

### 1.4 Las métricas que se comparan

Las métricas de `ab` se vieron en la sesión 6. Para comparar versiones se usan estas cuatro:

| Métrica de `ab`            | Qué mide                               | Cuándo empeora    |
|----------------------------|----------------------------------------|-------------------|
| Requests per second        | Rendimiento (throughput)               | Si baja           |
| Time per request (mean)    | Latencia media (ms)                    | Si sube           |
| Percentil 95 (tabla final) | Latencia de las peticiones lentas (ms) | Si sube           |
| Failed requests            | Peticiones fallidas                    | Si es mayor que 0 |

Fíjate en que no todas empeoran en la misma dirección: más peticiones por segundo es mejor, más milisegundos es peor. Un script de comparación tiene que tenerlo en cuenta para cada métrica.

**Variación relativa.** Para comparar dos valores se usa el porcentaje de cambio respecto al anterior:

**variación (%) = (nuevo − anterior) / anterior × 100**

Ejemplo: si v1.2.2 da 900 req/s y v1.3.0 da 810 req/s, la variación es (810 − 900) / 900 × 100 = −10 %. Se usa el porcentaje y no la diferencia absoluta porque 5 ms de diferencia son mucho sobre 10 ms y casi nada sobre 500 ms.

### 1.5 Ruido, variabilidad y umbrales

Si ejecutas la misma prueba tres veces sobre la misma versión, obtendrás tres resultados distintos. A esa variación sin causa en el código se le llama **ruido**, y tiene muchas fuentes:

- Otros procesos del equipo que compiten por la CPU (el navegador, Docker, Jenkins).
- La gestión de energía del procesador, que sube y baja la frecuencia.
- Las cachés del sistema operativo y de la aplicación, vacías en la primera ejecución.
- El recolector de basura de Node.js, que se activa en momentos imprevisibles.
- En `localhost` los tiempos son de pocos milisegundos, así que cualquier interferencia pesa mucho en proporción.

**Cómo se reduce el ruido:**

1. **Calentamiento** (*warm-up*): lanzar una tanda de peticiones que no se guarda antes de medir, para que la aplicación y las cachés estén en régimen normal.
2. **Más peticiones**: con 1000 peticiones un valor extraño pesa menos que con 100.
3. **Repetir y resumir**: ejecutar la prueba varias veces y quedarse con la mediana de las ejecuciones.
4. **Mismas condiciones**: mismo equipo, mismos parámetros y el menor número posible de programas abiertos.

**Umbral de tolerancia.** Como dos mediciones nunca dan lo mismo, exigir que la nueva versión sea «igual o mejor» haría fallar la comparación por puro ruido. Se fija un umbral, por ejemplo un 10 %: si el rendimiento cae menos de eso se considera ruido; si cae más, se considera una regresión.

Elegir el umbral es un equilibrio:

| Umbral          | Ventaja                                   | Riesgo                                                       |
|-----------------|-------------------------------------------|--------------------------------------------------------------|
| Muy estricto (2 %)  | Detecta regresiones pequeñas           | Falsas alarmas constantes por ruido; el equipo deja de hacer caso |
| Razonable (5-15 %)  | Equilibrio entre sensibilidad y ruido  | Puede dejar pasar degradaciones lentas acumuladas            |
| Muy laxo (50 %) | Nunca da falsas alarmas                   | Solo detecta desastres; la prueba casi no sirve              |

Una forma práctica de fijarlo es medir varias veces la misma versión, ver cuánto varía y poner el umbral algo por encima de esa variación natural. Este umbral es lo que después convierte la comparación en una puerta de calidad dentro del pipeline.

**La línea base** (*baseline*) es el resultado de referencia con el que se compara. Normalmente es la última versión publicada. Si la nueva versión se aprueba, pasa a ser la nueva línea base.

### 1.6 De la comparación a la decisión

El objetivo final no es una tabla de cifras, sino una decisión: **go** (se publica) o **no-go** (no se publica). Una decisión bien tomada tiene tres partes:

1. **Criterio fijado de antemano**: qué métricas se miran y con qué umbral. Si el criterio se decide después de ver los datos, es fácil acabar justificando lo que se quería hacer.
2. **Datos**: la tabla de comparación con las cifras de las dos versiones y su variación.
3. **Justificación escrita**: una frase con cifras que cualquiera pueda revisar después, por ejemplo «v1.3.0 es apta: el p95 empeora un 4 %, dentro del umbral del 10 %, y no hay peticiones fallidas».

**Automatizar la decisión.** Si un script hace la comparación y termina con código 0 (apta) o 1 (no apta), la decisión puede formar parte del pipeline igual que las pruebas de la sesión 6. Es lo que hará `comparar-carga.sh`. Aun así, la persona responsable puede revisar el resultado: un NO APTA puede estar justificado si la nueva versión añade una funcionalidad importante que cuesta algo de rendimiento.

**Relación con el versionado semántico.** Los resultados guardados también ayudan a decidir el número de versión. Una corrección de una regresión de rendimiento es un PATCH; si para recuperar el rendimiento hay que hacer un cambio incompatible en la API, eso ya es un MAJOR.

### 1.7 Dónde se guardan en la vida real

En esta sesión los resultados se guardan en el repositorio Git, junto al código. En la industria hay más opciones, y cada una encaja en una escala distinta:

| Dónde                         | Cómo                                                      | Ventajas                                              | Inconvenientes                                          |
|-------------------------------|-----------------------------------------------------------|-------------------------------------------------------|---------------------------------------------------------|
| Repositorio Git               | Carpeta `test-results/` versionada                        | Trazable, va junto al código probado, sin herramientas extra | El repositorio crece; resultados de máquinas distintas mezclados |
| Artefactos del servidor de CI | En Jenkins, `archiveArtifacts` guarda ficheros de cada build | Cada resultado queda asociado al build que lo generó  | Se pierden si se borran builds antiguos; difícil comparar entre builds |
| Informes de pruebas del CI    | Plugin JUnit de Jenkins con ficheros JUnit XML            | Gráficas de pruebas pasadas y fallidas por build      | Pensado para pasa/falla, no para métricas de rendimiento |
| Sistema de métricas           | Prometheus, InfluxDB y paneles en Grafana                 | Series temporales, gráficas, alertas automáticas      | Hay que montar y mantener otra infraestructura          |
| Almacenamiento de objetos     | Buckets S3 o MinIO                                        | Barato, sin límite práctico de tamaño                 | Hay que organizar y buscar los ficheros a mano          |

**Retención.** Guardar todo para siempre no es gratis. Se suele definir una política de retención: por ejemplo, conservar los resultados de todas las versiones publicadas y solo los de los últimos 30 builds de desarrollo.

`ab` también exporta formatos estructurados que facilitan llevar los datos a otros sistemas: `-e fichero.csv` guarda el tiempo para cada percentil del 0 al 100, y `-g fichero.tsv` guarda los tiempos de cada petición, listos para graficar.

### 1.8 Comprueba que lo has entendido

1. Encuentras un fichero que solo dice «Requests per second: 812». ¿Qué cuatro datos te faltan para poder compararlo con otro?
2. ¿Por qué se guarda el commit si ya se guarda el número de versión?
3. v1.3.0 da un p95 de 18 ms y v1.3.1 da 21 ms. Calcula la variación. Con un umbral del 10 %, ¿es apta?
4. Tu compañero mide v1.3.0 en su portátil y tú mides v1.3.1 en el tuyo. ¿Podéis comparar los resultados? ¿Por qué?
5. ¿Para qué sirve la tanda de calentamiento y por qué no se guarda su resultado?
6. ¿Qué pasa si se elige un umbral del 1 %? ¿Y uno del 80 %?
7. ¿Por qué el criterio de decisión debe fijarse antes de ver los resultados?

## 2. Práctica

### Paso 0. Comprobaciones previas

- `ab` está instalado: `ab -V`. Si no lo está, sigue el paso 2 de la sesión 6 (`sudo apt-get install -y apache2-utils`).
- Trabajas en la carpeta `lab/app` del repositorio, donde están `test-funcional.sh` y `test-carga.sh` de la sesión 6. Si los creaste en otra carpeta, cópialos aquí.
- La aplicación responde en `http://localhost:3001/` (contenedor `app` de la sesión 6).
- Existen las etiquetas de versión de sesiones anteriores: `git tag` debe mostrar al menos `v1.2.2` y `v1.3.0`.
- Las imágenes de esas dos versiones están en el registry desde la sesión 5: `curl -s http://${REG:-localhost:5000}/v2/modulo5168-app/tags/list`. Si en la sesión 5 usaste el registry temporal, ejecuta antes `export REG=localhost:5001`.

### Paso 1. Script para guardar resultados con metadatos

Redirigir la salida sin más pierde stderr y no deja constancia del commit probado. El script `guardar-resultados.sh` añade una cabecera con metadatos y un calentamiento previo a la prueba de carga:

```
#!/usr/bin/env bash
# Uso: ./guardar-resultados.sh v1.3.0
set -euo pipefail
V=${1:?Uso: $0 <version>}
URL=http://localhost:3001/
COMMIT=$(git rev-parse --short "$V^{commit}")    # commit de la etiqueta que se mide
mkdir -p test-results

{
  echo "# version=$V commit=$COMMIT fecha=$(date -Iseconds) host=$(hostname)"
  VERSION_ESPERADA="${V#v}" ./test-funcional.sh   # v1.2.2 -> espera 1.2.2
} > "test-results/funcional-$V.txt" 2>&1

ab -n 200 -c 10 "$URL" > /dev/null 2>&1          # calentamiento, no se guarda
{
  echo "# version=$V commit=$COMMIT fecha=$(date -Iseconds) params=-n1000,-c10"
  ab -n 1000 -c 10 "$URL"
} > "test-results/carga-$V.txt"
```

Por el `set -e`, si el test funcional falla el script se detiene y no se hace la prueba de carga: no tiene sentido medir el rendimiento de una versión rota.

Dos detalles del script:

- `VERSION_ESPERADA="${V#v}"` quita la `v` del principio (`v1.2.2` pasa a `1.2.2`) y se la pasa a `test-funcional.sh`. Sin esto, el test esperaría siempre `1.3.0`, su valor por defecto, y fallaría al medir la v1.2.2.
- `git rev-parse --short "$V^{commit}"` guarda el commit de la etiqueta que se mide, no el commit en el que estás trabajando. Así la cabecera dice exactamente qué código se ha probado.

### Paso 2. Resultados de v1.2.2 y v1.3.0

El entregable pide al menos dos versiones. Las imágenes de v1.2.2 y v1.3.0 ya están en el registry desde la sesión 5, así que no hace falta cambiar de rama ni reconstruir nada: basta con arrancar cada versión en el contenedor `app` y medirla.

```
REG="${REG:-localhost:5000}"

# Versión anterior: v1.2.2
docker rm -f app 2>/dev/null
docker run -d --name app --network lab5168 -p 3001:3000 $REG/modulo5168-app:v1.2.2
sleep 3
curl http://localhost:3001/health         # debe incluir "version":"1.2.2"
./guardar-resultados.sh v1.2.2

# Versión actual: v1.3.0
docker rm -f app
docker run -d --name app --network lab5168 -p 3001:3000 $REG/modulo5168-app:v1.3.0
sleep 3
curl http://localhost:3001/health         # debe incluir "version":"1.3.0"
./guardar-resultados.sh v1.3.0
```

Si la v1.2.2 indica `"version":"1.2.1"`, la imagen se etiquetó en la sesión 4 antes de subir la versión en `package.json` y en el Dockerfile, y el test funcional fallará. Reconstrúyela desde su etiqueta de Git, que sí tiene la versión correcta, y vuelve a subirla:

```
git switch --detach v1.2.2
docker build -t $REG/modulo5168-app:v1.2.2 .
docker push $REG/modulo5168-app:v1.2.2
git switch main
```

Después repite los comandos de la v1.2.2 del bloque anterior.

### Paso 3. Script de comparación

Este paso es el núcleo de RA1.f. `comparar-carga.sh` muestra una tabla con las cuatro métricas y termina con código 1 si la versión no es apta. Así, en sesiones posteriores se podrá usar como paso del pipeline de Jenkins.

```
#!/usr/bin/env bash
# Uso: ./comparar-carga.sh test-results/carga-v1.2.2.txt test-results/carga-v1.3.0.txt [umbral_%]
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
git commit -m "chore(test-results): resultados de v1.2.2 y v1.3.0 y script de comparación"
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

El entregable es la carpeta `test-results/` versionada en Git con resultados de al menos dos versiones, los dos scripts y un fichero `test-results/DECISION-v1.3.0.md`. Ese fichero contiene la tabla que genera `comparar-carga.sh` y la decisión justificada en 3-5 líneas; es lo que demuestra que se ha comparado, no solo guardado.

| Indicador (RA1.f)                                           | Evidencia                                             |
|-------------------------------------------------------------|-------------------------------------------------------|
| Guarda los resultados con convención de nombres y metadatos | `test-results/*.txt` con cabecera de versión y commit |
| Conserva resultados de al menos dos versiones en Git        | `git log -- test-results/`                            |
| Compara las métricas relevantes de forma reproducible       | `comparar-carga.sh` funcionando                       |
| Toma una decisión de versionado justificada con datos       | `DECISION-v1.3.0.md`                                  |

## Anexo: versión con regresión intencionada

Si v1.2.2 y v1.3.0 rinden casi igual, el script dirá APTA y la discusión tendrá poco recorrido. Para que haya algo que detectar, se crea una versión v1.3.1 que hace la aplicación más lenta a propósito.

El cambio se añade al principio del manejador de la ruta `/` de la aplicación:

```
// Regresión intencionada: bloquea el event loop unos 20 ms por petición
const fin = Date.now() + 20; while (Date.now() < fin) {}
```

Además de añadir esas dos líneas en `server.js`, cambia la versión a `1.3.1` en `package.json` y en la línea `ENV APP_VERSION` del `Dockerfile`. Si no, `/health` seguiría respondiendo `1.3.0` y el test funcional de `guardar-resultados.sh` fallaría.

Como tienes tu propio laboratorio, crea la versión en tu repositorio:

```
REG="${REG:-localhost:5000}"
git switch -c regresion
# añadir las dos líneas anteriores en la ruta / de server.js
# y cambiar la versión a 1.3.1 en package.json y en el Dockerfile
git commit -am "feat: cambio en la ruta principal"
git tag v1.3.1
docker build -t $REG/modulo5168-app:v1.3.1 .
docker rm -f app
docker run -d --name app --network lab5168 -p 3001:3000 $REG/modulo5168-app:v1.3.1
sleep 3
./guardar-resultados.sh v1.3.1
./comparar-carga.sh test-results/carga-v1.3.0.txt test-results/carga-v1.3.1.txt
```

El resultado esperado es NO APTA. Después se pide localizar la causa con `git diff v1.3.0 v1.3.1`, volver a `main` con `git switch main` y arrancar de nuevo la v1.3.0 en el contenedor `app`. Para que el efecto sorprenda más, puedes repartir el cambio como fichero `.patch` (se aplica con `git apply`) sin decir qué contiene.

---

[← Sesión 6](sesion6.md) · [Índice de la UT01](./) · [Sesión 8 →](sesion8.md)
