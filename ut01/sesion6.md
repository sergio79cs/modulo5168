[← Sesión 5](sesion5.md) · [Índice de la UT01](./) · [Sesión 7 →](sesion7.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 6 - Pruebas funcionales y no funcionales

## 1. Teoría

Idea clave: para el pipeline, una prueba es un proceso que termina con código de salida 0 (pasa) o distinto de 0 (falla). Jenkins no lee el texto «PASS», lee el exit code.

### Dónde encajan las pruebas

Pirámide de pruebas: muchas unitarias en la base, menos de integración y, arriba, las funcionales o extremo a extremo, más lentas y costosas. En despliegue continuo cada nivel actúa como puerta de calidad: si falla, la versión no avanza.

```
flowchart LR
  A[Commit] --> B[Build]
  B --> C[Pruebas unitarias]
  C --> D[Despliegue en pruebas]
  D --> E[Pruebas funcionales]
  E --> F[Pruebas no funcionales]
  F --> G[Producción]
```

Cualquier etapa con exit code distinto de 0 detiene el flujo.

### Pruebas funcionales

Verifican qué hace el software, normalmente como caja negra y contra un requisito. Responden a «¿hace lo que debe?».

- Smoke test tras desplegar

- Comprobar que `/version` devuelve la versión esperada

- Flujo de login completo (extremo a extremo)

### Pruebas no funcionales

Verifican cómo se comporta el software: rendimiento, carga, estrés, seguridad y disponibilidad. Carga es el tráfico esperado; estrés es llevarlo al límite hasta que rompa.

| Métrica                   | Qué indica                                                   |
|---------------------------|--------------------------------------------------------------|
| Peticiones por segundo    | Throughput que soporta el servicio                           |
| Tiempo medio de respuesta | Latencia típica                                              |
| Percentil 95 (p95)        | Latencia que sufre el 5 % más lento; más fiable que la media |
| Tasa de errores           | Peticiones fallidas bajo carga                               |

### Mini-debate

«Si el test de carga da 800 peticiones/s en mi portátil, ¿en producción irá igual?»

Conclusión: los resultados dependen del entorno; lo útil es comparar entre versiones, no el número absoluto.

## 2. Práctica

Cada alumno termina con dos scripts que fallan con exit 1 cuando la prueba no se cumple.

### Paso 0 · Arrancar la aplicación

Levantar la app de sesiones anteriores y comprobar a mano:

```
curl http://localhost:3000/version
```

### Paso 1 · Prueba funcional con puerta de calidad

El script del guion original tiene dos fallos que conviene que descubran: da PASS con cualquier versión (solo comprueba que la respuesta no esté vacía) y siempre termina con exit 0, así que nunca pararía un pipeline.

```
#!/bin/bash
# test-funcional.sh
URL="${URL:-http://localhost:3000}"
ESPERADA="${VERSION_ESPERADA:-1.0.0}"

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

- El `*` del grep tolera JSON con espacio tras los dos puntos; el original fallaba con `"version": "1.0.0"`.

- Las variables de entorno permiten reutilizar el script en Jenkins.

- Alternativa más robusta si hay `jq`: `jq -r .version /tmp/resp.json`.

### Paso 2 · Prueba de carga con Apache Bench

Si no tienen `ab` instalado (paquete `apache2-utils` en Debian/Ubuntu), la imagen oficial de httpd ya lo incluye:

```
# Linux
docker run --rm --network host httpd:2.4 ab -n 100 -c 10 http://localhost:3000/
# Docker Desktop (Windows/Mac)
docker run --rm httpd:2.4 ab -n 100 -c 10 http://host.docker.internal:3000/
```

`ab` exige la barra final en la URL; sin ella da «invalid URL».

```
#!/bin/bash
# test-carga.sh
URL="${URL:-http://localhost:3000/}"
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

1.  Ejecutar `VERSION_ESPERADA=9.9.9 ./test-funcional.sh; echo $?`: debe mostrar FAIL y 1.

2.  Parar la app y lanzar los dos scripts: ambos deben fallar.

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

Jenkins corre en su propio contenedor, así que dentro de él `localhost` es Jenkins, no la app. La app y Jenkins deben compartir red Docker y usar el nombre del contenedor (aquí `app`). El contenedor de Jenkins necesita `ab` instalado.

## 3. Cierre

Se comparan las tablas de concurrencia y cada alumno deja escrita su reflexión en el README.

| Tiempo | Actividad                                                                                                      |
|--------|----------------------------------------------------------------------------------------------------------------|
| 10'    | Puesta en común: ¿a partir de qué concurrencia sube el p95? ¿Por qué cambian los resultados entre ordenadores? |
| 5'     | Reflexión individual en el README (preguntas abajo)                                                            |
| 5'     | Subida de la entrega                                                                                           |

Preguntas de reflexión:

1.  ¿Qué pasaría en el pipeline si el script no devolviera exit 1 al fallar?

2.  ¿Qué umbral pondrías como criterio de aceptación de rendimiento y por qué?

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
