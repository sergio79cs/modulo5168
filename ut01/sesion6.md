[← Sesión 5](sesion5.md) · [Índice de la UT01](./) · [Sesión 7 →](sesion7.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 6 - Pruebas funcionales y no funcionales

## 1. Teoría

### 1.1 Por qué probar en un flujo de despliegue continuo

En despliegue continuo ninguna persona revisa a mano cada versión antes de que llegue a producción: las pruebas automáticas son las que deciden. Si las pruebas no detectan un fallo, el fallo llega al usuario.

**El coste de un defecto crece con el tiempo.** Un error detectado mientras se escribe el código cuesta minutos. El mismo error detectado en producción implica incidencia, diagnóstico, parche, nuevo despliegue y, a veces, pérdida de datos o de clientes. Por eso se habla de *shift-left*: desplazar las pruebas lo más a la izquierda posible del ciclo, es decir, lo más pronto posible.

**Las pruebas automáticas dan confianza para desplegar a menudo.** Un equipo sin pruebas despliega poco porque cada despliegue da miedo. Un equipo con buenas pruebas puede desplegar varias veces al día porque sabe que, si algo se rompe, el pipeline lo parará.

**El código de salida es el contrato entre la prueba y el pipeline.** Jenkins, GitLab CI o GitHub Actions no interpretan el texto que imprime un script. Solo miran cómo termina el proceso:

| Código de salida              | Significado para el pipeline | Consecuencia                                        |
|-------------------------------|------------------------------|-----------------------------------------------------|
| 0                             | La prueba ha pasado          | La etapa se marca en verde y el flujo continúa      |
| Distinto de 0 (normalmente 1) | La prueba ha fallado         | La etapa se marca en rojo y el flujo se detiene     |

En bash, el código de salida del último comando está en `$?`. Un script que imprime «FAIL» pero termina con `exit 0` es, para Jenkins, una prueba que ha pasado. Este error es muy habitual y lo verás en la práctica.

### 1.2 Tipos de pruebas y pirámide de pruebas

Las pruebas se clasifican de dos formas complementarias: por **lo que verifican** (funcionales frente a no funcionales) y por **el alcance** del código que ejercitan (unitarias, de integración, de sistema).

| Nivel                       | Qué prueba                                                         | Velocidad          | Ejemplo en nuestra app                                      |
|-----------------------------|--------------------------------------------------------------------|--------------------|-------------------------------------------------------------|
| Unitarias                   | Una función o clase aislada                                        | Milisegundos       | La función que formatea la versión devuelve `"1.3.0"`       |
| Integración                 | Varios componentes juntos (app + base de datos, app + API externa) | Segundos           | La app lee la versión del fichero `VERSION` real            |
| Sistema / extremo a extremo | La aplicación desplegada, desde fuera                              | Segundos a minutos | `curl` a `/version` sobre el contenedor arrancado           |
| Aceptación                  | Que se cumple un requisito del cliente                             | Variable           | «El endpoint de versión responde en menos de 200 ms»        |

**La pirámide de pruebas** (Mike Cohn) recomienda muchas pruebas unitarias en la base, menos de integración en medio y pocas de extremo a extremo arriba. Las de abajo son rápidas, baratas y precisas: cuando fallan indican exactamente qué se ha roto. Las de arriba son lentas y frágiles, pero son las únicas que comprueban que todo funciona junto.

**El antipatrón del cono de helado** es la pirámide invertida: pocas unitarias y casi todo probado a mano o con pruebas de interfaz. El pipeline se vuelve lento, las pruebas fallan por motivos ajenos al código y el equipo acaba ignorándolas.

**Dónde se ejecuta cada tipo en el pipeline.** Las pruebas se ordenan de más rápidas a más lentas para que un fallo se detecte cuanto antes y no se malgaste tiempo:

```
flowchart LR
  A[Commit] --> B[Build]
  B --> C[Unitarias]
  C --> D[Despliegue<br/>en pruebas]
  D --> E[Funcionales]
  E --> F[No funcionales]
  F --> G[Producción]
```

Cualquier etapa con código de salida distinto de 0 detiene el flujo. Las unitarias se ejecutan antes de desplegar porque no necesitan la app arrancada. Las funcionales y no funcionales de esta sesión necesitan la aplicación levantada, por eso van después de desplegar en un entorno de pruebas.

### 1.3 Pruebas funcionales

Una prueba funcional comprueba **qué hace** el software: dada una entrada, ¿produce la salida que exige el requisito? No le importa cómo está programado por dentro, solo el comportamiento observable.

**Caja negra y caja blanca.** En las pruebas de caja negra se ignora el código y se prueba a través de la interfaz pública (una URL, un formulario, una API). En las de caja blanca se diseñan las pruebas conociendo el código, para recorrer sus ramas y condiciones. Las funcionales de un pipeline de CD suelen ser de caja negra: se lanzan contra la aplicación desplegada, igual que lo haría un usuario o un cliente de la API.

**Variantes que se usan en un pipeline:**

- **Smoke test** (prueba de humo): comprobación mínima justo después de desplegar para saber si la aplicación «arranca y responde». El nombre viene de la electrónica: enchufar el aparato y ver si echa humo. Nuestro test de `/version` es un smoke test.
- **Sanity test**: comprobación rápida y concreta tras un cambio pequeño, por ejemplo verificar que la corrección de un bug funciona.
- **Regresión**: volver a ejecutar las pruebas existentes para asegurar que un cambio nuevo no ha roto algo que ya funcionaba. En CD, toda la batería se ejecuta en cada commit, así que todo el pipeline es una prueba de regresión continua.
- **Aceptación**: verifican que se cumple lo acordado con el cliente, a menudo escritas como escenarios «Dado… cuando… entonces…» (formato Gherkin).
- **Extremo a extremo (E2E)**: recorren un flujo completo de usuario, por ejemplo registrarse, iniciar sesión y hacer un pedido, normalmente controlando un navegador.

**Anatomía de una prueba.** Toda prueba, por sencilla que sea, sigue el esquema Preparar–Actuar–Verificar (*Arrange–Act–Assert*):

| Fase      | Qué se hace                                                     | En `test-funcional.sh`                                     |
|-----------|-----------------------------------------------------------------|------------------------------------------------------------|
| Preparar  | Fijar el estado inicial y el resultado esperado                 | Definir `URL` y `VERSION_ESPERADA`                         |
| Actuar    | Ejecutar la acción que se prueba                                | `curl` a `/version`                                        |
| Verificar | Comparar el resultado obtenido con el esperado (el «oráculo»)   | Comparar código HTTP y versión; `exit 1` si no coinciden   |

El **oráculo** es lo que dice cuál es la respuesta correcta. El error del script original del guion es precisamente que no tenía oráculo: comprobaba que hubiera una respuesta, no que fuera la correcta.

**Qué conviene verificar en una API HTTP:** el código de estado (200, 404, 500…), el tipo de contenido (`Content-Type: application/json`), el cuerpo de la respuesta (campos y valores) y, cuando importe, las cabeceras de seguridad o caché.

**Herramientas habituales:**

| Herramienta                         | Uso típico                                                                                  |
|-------------------------------------|---------------------------------------------------------------------------------------------|
| curl + bash                         | Pruebas sencillas de API, ideales para entender el mecanismo (las de esta sesión)           |
| Postman / Newman                    | Colecciones de peticiones a una API; Newman las ejecuta desde la línea de comandos          |
| Jest + Supertest, pytest + requests | Pruebas de API escritas en el lenguaje de la aplicación                                     |
| Selenium, Cypress, Playwright       | Pruebas E2E controlando un navegador real                                                   |
| Cucumber                            | Pruebas de aceptación escritas en lenguaje natural (Gherkin)                                |

### 1.4 Pruebas no funcionales

Una prueba no funcional comprueba **cómo se comporta** el software: lo rápido que responde, cuánto tráfico aguanta, lo seguro que es o cuánto tiempo está disponible. Una aplicación puede devolver la versión correcta (pasa la funcional) y aun así tardar 5 segundos en hacerlo (falla la no funcional).

**Tipos principales:**

| Tipo                  | Pregunta que responde                     | Cómo se plantea                                                     |
|-----------------------|-------------------------------------------|---------------------------------------------------------------------|
| Rendimiento           | ¿Cuánto tarda en responder?               | Pocas peticiones, se mide la latencia                               |
| Carga                 | ¿Aguanta el tráfico esperado?             | Se simula el número de usuarios previsto                            |
| Estrés                | ¿Dónde está el límite y cómo falla?       | Se sube la carga hasta que el sistema se degrada o cae              |
| Picos (*spike*)       | ¿Resiste un aumento brusco?               | Se pasa de poca carga a mucha de golpe (rebajas, un enlace viral)   |
| Resistencia (*soak*)  | ¿Se degrada con el tiempo?                | Carga moderada durante horas; detecta fugas de memoria              |
| Escalabilidad         | ¿Mejora al añadir recursos?               | Se repite la carga con más réplicas (enlaza con Kubernetes)         |
| Seguridad             | ¿Tiene vulnerabilidades conocidas?        | Análisis de dependencias, imágenes y endpoints                      |
| Disponibilidad        | ¿Sigue funcionando si cae un componente?  | Se detienen contenedores o nodos a propósito                        |

En esta sesión harás una **prueba de carga** sencilla. Las demás siguen la misma idea: generar condiciones, medir y comparar con un umbral.

**Métricas que hay que saber interpretar:**

- **Latencia o tiempo de respuesta**: lo que tarda una petición desde que se envía hasta que llega la respuesta completa, en milisegundos.
- **Throughput**: peticiones atendidas por segundo (req/s). Mide capacidad, no rapidez.
- **Concurrencia**: cuántas peticiones están en curso a la vez. No es lo mismo que el número total de peticiones.
- **Tasa de errores**: porcentaje de peticiones fallidas (errores de conexión, códigos 5xx, respuestas incompletas).
- **Uso de recursos**: CPU, memoria y red del servidor durante la prueba; explica por qué empeoran las otras métricas.

**Por qué los percentiles importan más que la media.** Supón 10 peticiones con estos tiempos en milisegundos: 20, 21, 22, 22, 23, 24, 25, 26, 28 y 900.

- La **media** es 111 ms. No describe a nadie: nueve usuarios tardaron unos 23 ms y uno casi un segundo.
- La **mediana (p50)** es 23,5 ms: la mitad de las peticiones tardaron menos que eso. Describe la experiencia típica.
- El **p90** es 28 ms: el 90 % de las peticiones tardaron 28 ms o menos.
- El **p99** o el máximo (900 ms) muestran la «cola»: lo que sufren los peores casos.

Un solo valor extremo distorsiona la media. Por eso los objetivos de rendimiento profesionales se escriben con percentiles, por ejemplo: «el p95 de `/version` por debajo de 200 ms».

**Relación entre las métricas.** Con concurrencia baja, al aumentar la concurrencia sube el throughput y la latencia apenas cambia. Llega un punto en que el servidor se satura: el throughput deja de crecer y la latencia se dispara porque las peticiones esperan en cola. Encontrar ese punto es el objetivo de la tabla de concurrencias de la práctica.

**Herramientas habituales:**

| Herramienta         | Características                                                       |
|---------------------|-----------------------------------------------------------------------|
| Apache Bench (`ab`) | Muy simple, una sola URL, ideal para empezar (la de esta sesión)      |
| hey, wrk            | Similares a `ab`, más modernos y eficientes                           |
| k6                  | Escenarios en JavaScript, umbrales integrados, muy usado en CI/CD     |
| JMeter              | Interfaz gráfica, escenarios complejos, muy extendido en empresa      |
| Gatling, Locust     | Escenarios en código (Scala/Java y Python)                            |
| OWASP ZAP           | Escaneo de seguridad de aplicaciones web                              |
| Trivy               | Escaneo de vulnerabilidades en imágenes Docker y dependencias         |

### 1.5 Cómo leer la salida de Apache Bench

`ab -n 100 -c 10 http://localhost:3001/` lanza 100 peticiones en total (`-n`) manteniendo 10 en curso a la vez (`-c`). Al terminar imprime un informe; estas son las líneas que hay que saber interpretar:

| Línea del informe                                         | Qué significa                                                                         |
|-----------------------------------------------------------|---------------------------------------------------------------------------------------|
| `Complete requests`                                       | Peticiones que han terminado; debe coincidir con `-n`                                 |
| `Failed requests`                                         | Peticiones con error de conexión o con una respuesta de longitud distinta a la primera |
| `Non-2xx responses`                                       | Respuestas con código distinto de 2xx (solo aparece si las hay)                       |
| `Requests per second`                                     | Throughput medio de toda la prueba                                                    |
| `Time per request` (primera)                              | Latencia media vista por cada usuario concurrente                                     |
| `Time per request` (*across all concurrent requests*)     | Tiempo total dividido entre el número de peticiones; es el inverso del throughput      |
| `Connection Times`                                        | Desglose de cada petición: conexión, procesamiento y espera                           |
| `Percentage of the requests served within a certain time` | Percentiles 50, 66, 75, 80, 90, 95, 98, 99 y 100 (máximo)                             |

**Dos detalles que suelen confundir:**

- `Failed requests` cuenta como fallo una respuesta cuya longitud cambia respecto a la primera. Si la app devuelve contenido dinámico (una fecha, un contador), aparecerán «fallos» aunque todo funcione. Hay que mirar el desglose (`Length`, `Exceptions`…) antes de concluir nada.
- Las dos líneas `Time per request` no dan lo mismo. Con `-c 10`, la primera es unas 10 veces la segunda.

**Limitaciones de `ab` que conviene conocer:**

- Solo prueba una URL con un único tipo de petición; no simula usuarios que navegan.
- Usa HTTP/1.0 y no reutiliza conexiones salvo con `-k`.
- Si `ab` y la aplicación corren en el mismo ordenador, compiten por la CPU y los resultados son peores que en un entorno real.
- Las primeras peticiones pueden ser más lentas (arranque en frío, cachés vacías). Conviene descartar una primera ejecución de calentamiento.

Por todo esto, los números de `ab` en tu equipo sirven para **comparar** entre versiones o configuraciones en el mismo equipo, no como dato absoluto de capacidad.

### 1.6 Criterios de aceptación y puertas de calidad

Una medición sin umbral no es una prueba: es un informe. Para que una prueba no funcional pueda parar el pipeline necesita un **criterio de aceptación** explícito que el script convierta en `exit 0` o `exit 1`.

**Cómo se escribe un buen criterio:** medible, con unidad y con condiciones.

| Criterio mal planteado      | Criterio bien planteado                                                      |
|-----------------------------|------------------------------------------------------------------------------|
| «La app debe ser rápida»    | «Con 10 peticiones concurrentes, el p95 de `/version` es menor de 200 ms»    |
| «No debe fallar»            | «Con 100 peticiones, `Failed requests` es 0 y no hay respuestas no 2xx»      |
| «Debe aguantar carga»       | «Con `-c 50` se mantienen al menos 300 req/s en el equipo de referencia»     |

En la industria estos objetivos se llaman **SLO** (*Service Level Objectives*): metas internas de latencia, disponibilidad o tasa de error. Los **SLA** son los compromisos contractuales con el cliente, normalmente más laxos que los SLO para dejar margen.

**Puertas de calidad (*quality gates*).** Una puerta de calidad es una etapa del pipeline que solo deja pasar la versión si se cumplen ciertos criterios: pruebas en verde, cobertura mínima, ninguna vulnerabilidad crítica, rendimiento dentro del umbral. En Jenkins, cada `sh` que devuelve un código distinto de 0 marca la etapa como fallida y detiene el resto.

**Guardar evidencias.** Además del resultado, conviene guardar el informe completo (`test-results/carga.txt`) como artefacto del build. Permite comparar una versión con la anterior y justificar por qué se paró un despliegue.

**Problemas típicos de las pruebas automáticas:**

- **Pruebas inestables (*flaky*)**: a veces pasan y a veces fallan sin cambios en el código, por ejemplo por un umbral de rendimiento demasiado ajustado o porque la app aún no había arrancado. Son peligrosas porque el equipo se acostumbra a ignorar el rojo.
- **Dependencia del entorno**: una prueba que solo funciona en el portátil del autor (rutas fijas, `localhost`, puertos) falla en el agente de Jenkins. De ahí que los scripts de la práctica usen variables de entorno.
- **Falsos positivos**: la prueba pasa aunque el software esté mal, como el script original que daba PASS con cualquier versión. Por eso hay que provocar el fallo a propósito y comprobar que la prueba lo detecta.
- **Umbrales arbitrarios**: un umbral sin justificar o bien no detecta nada o bien falla siempre. Se fija a partir de mediciones reales y del requisito.

### 1.7 Debate y preguntas de comprobación

**Debate.** «Si el test de carga da 800 peticiones/s en mi portátil, ¿en producción irá igual?» Piensa en el hardware, la red, que `ab` y la app compartan máquina y los datos reales. ¿Qué sentido tiene entonces medir en tu equipo?

**Comprueba que lo has entendido** antes de pasar a la práctica:

1. Un script imprime «FAIL» y termina con `exit 0`. ¿Qué hace Jenkins con esa etapa?
2. ¿Por qué las pruebas unitarias se ejecutan antes de desplegar y las funcionales después?
3. ¿Es un smoke test una prueba funcional o no funcional? ¿Por qué?
4. Diez peticiones tardan 20, 21, 22, 22, 23, 24, 25, 26, 28 y 900 ms. ¿Qué describe mejor la experiencia del usuario típico, la media o la mediana?
5. ¿Qué diferencia hay entre `-n 500` y `-c 50` en Apache Bench?
6. Reescribe como criterio medible: «la web tiene que ir bien con mucha gente».
7. Una prueba de rendimiento falla una de cada cinco ejecuciones sin cambios en el código. ¿Cómo se llama ese problema y qué harías?

## 2. Práctica

Terminarás con dos scripts que fallan con exit 1 cuando la prueba no se cumple.

### Paso 0 · Arrancar la aplicación

Levantar la app de sesiones anteriores y comprobar a mano. El contenedor se llama app y está en la red del laboratorio, para que la etapa de Jenkins de la ampliación lo encuentre por su nombre; se publica en el 3001 porque el 3000 del equipo es Gitea:

```
docker rm -f test-app app 2>/dev/null
docker run -d --name app --network lab5168 -p 3001:3000 modulo5168-app:v1.3.0
curl http://localhost:3001/version
```

### Paso 1 · Prueba funcional con puerta de calidad

El script del guion original tiene dos fallos que conviene que descubran: da PASS con cualquier versión (solo comprueba que la respuesta no esté vacía) y siempre termina con exit 0, así que nunca pararía un pipeline.

```
#!/bin/bash
# test-funcional.sh
URL="${URL:-http://localhost:3001}"
ESPERADA="${VERSION_ESPERADA:-1.3.0}"

CODIGO=$(curl -s -o /tmp/resp.json -w '%{http_code}' "$URL/version")
if [ "$CODIGO" != "200" ]; then
  echo "FAIL: /version devolvió HTTP $CODIGO"
  exit 1
fi

VERSION=$(grep -o '"version": *"[^"]*"' /tmp/resp.json | cut -d'"' -f4)
echo "Versión detectada: $VERSION (esperada: $ESPERADA)"

if [ "$VERSION" = "$ESPERADA" ]; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi
```

- `-w '%{http_code}'` comprueba también el código HTTP.
- El  `*` del grep tolera JSON con espacio tras los dos puntos; el original fallaba con `"version": "1.3.0"`.
- Las variables de entorno permiten reutilizar el script en Jenkins.
- Alternativa más robusta si hay `jq`: `jq -r .version /tmp/resp.json`.

### Paso 2 · Prueba de carga con Apache Bench

Si no tienen `ab` instalado (paquete `apache2-utils` en Debian/Ubuntu), la imagen oficial de httpd ya lo incluye:

```
# Linux
docker run --rm --network host httpd:2.4 ab -n 100 -c 10 http://localhost:3001/
# Docker Desktop (Windows/Mac)
docker run --rm httpd:2.4 ab -n 100 -c 10 http://host.docker.internal:3001/
```

`ab` exige la barra final en la URL; sin ella da «invalid URL».

```
#!/bin/bash
# test-carga.sh
URL="${URL:-http://localhost:3001/}"
mkdir -p test-results
ab -n 100 -c 10 "$URL" > test-results/carga.txt || { echo "FAIL: ab no pudo ejecutarse"; exit 1; }

FALLOS=$(grep "Failed requests" test-results/carga.txt | awk '{print $3}')
RPS=$(grep "Requests per second" test-results/carga.txt | awk '{print $4}')
echo "Peticiones/s: $RPS  Fallos: $FALLOS"

[ "$FALLOS" -eq 0 ] || { echo "FAIL"; exit 1; }
echo "PASS"
```

Mientras se ejecuta, rellenan esta tabla con `-n 500` y distintas concurrencias. El p95 sale en la sección «Percentage of the requests served within a certain time».

| Concurrencia (-c) | Peticiones/s | Tiempo medio (ms) | p95 (ms) | Fallos |
|-------------------|--------------|-------------------|----------|--------|
| 1                 |              |                   |          |        |
| 10                |              |                   |          |        |
| 50                |              |                   |          |        |

### Paso 3 · Provocar fallos

Deben ver fallar sus pruebas, no solo pasar.

1. Ejecutar `VERSION_ESPERADA=9.9.9 ./test-funcional.sh; echo $?`: debe mostrar FAIL y 1.
2. Parar la app y lanzar los dos scripts: ambos deben fallar.

### Ampliación · Etapa en Jenkins

Para quien termine antes.

```
stage('Pruebas') {
  steps {
    sh 'chmod +x test-funcional.sh test-carga.sh'
    sh 'URL=http://app:3000 ./test-funcional.sh'
    sh 'URL=http://app:3000/ ./test-carga.sh'
  }
  post {
    always { archiveArtifacts artifacts: 'test-results/*.txt', allowEmptyArchive: true }
  }
}
```

Jenkins corre en su propio contenedor, así que dentro de él `localhost` es Jenkins, no la app. La app y Jenkins deben compartir red Docker y usar el nombre del contenedor (aquí `app`). El contenedor de Jenkins necesita `ab` instalado. La imagen jenkins-lab de la guía de instalación ya lo incluye, y Jenkins debe estar en la red lab5168.

## 3. Cierre

Compara tu tabla de concurrencia con las del resto y deja escrita tu reflexión en el README.

1. Puesta en común: ¿a partir de qué concurrencia sube el p95? ¿Por qué cambian los resultados entre ordenadores?
2. Reflexión individual en el README (preguntas abajo).
3. Subida de la entrega.

Preguntas de reflexión:

1. ¿Qué pasaría en el pipeline si el script no devolviera exit 1 al fallar?
2. ¿Qué umbral pondrías como criterio de aceptación de rendimiento y por qué?

## 4. Entregable y evaluación (RA1.e)

Se entrega un paquete con `test-funcional.sh`, `test-carga.sh`, `test-results/carga.txt` y un README con la tabla de concurrencia y las respuestas de reflexión.

| Aspecto evaluado                                                                   | Peso |
|------------------------------------------------------------------------------------|------|
| Prueba funcional: compara versión, comprueba HTTP y devuelve el exit code correcto | 35 % |
| Prueba de carga ejecutada con criterio de aceptación y resultado guardado          | 30 % |
| Evidencia de fallo provocado (captura o salida con exit 1)                         | 15 % |
| Tabla de concurrencia y reflexión                                                  | 20 % |

---

[← Sesión 5](sesion5.md) · [Índice de la UT01](./) · [Sesión 7 →](sesion7.md)
