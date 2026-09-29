[← Sesión 8](sesion8.md) · [Índice de la UT01](./)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 9 - Práctica integradora (enunciado)

## Objetivo

En esta sesión vas a construir, sobre tu propio repositorio de Gitea, un pipeline de Jenkins que recorra el flujo completo de integración y entrega continua visto hasta ahora (criterios a–g). No hay contenido nuevo: se trata de encadenar todo lo aprendido en un único `Jenkinsfile` que funcione de principio a fin.

- Trabajo individual, en el laboratorio de tu ordenador (Docker, Gitea, Jenkins y herramienta de calidad).

- El pipeline debe tener una *stage* por criterio, nombrada con su letra (por ejemplo `a · Checkout`).

## Antes de empezar

Comprueba que tu laboratorio está listo. Si algo falla, avisa al profesor antes de seguir.

- [ ] Gitea, Jenkins y la herramienta de análisis de calidad están arrancados y accesibles.

- [ ] Jenkins puede ejecutar comandos `docker` (acceso al socket de Docker).

- [ ] Existe una red de Docker común para Jenkins, Gitea y los contenedores de prueba.

- [ ] El registry de paquetes de Gitea está activo y Docker puede iniciar sesión en él.

- [ ] En Jenkins hay una credencial de Gitea guardada (usuario y token).

## Tareas

```
flowchart LR
  A[a · Checkout] --> B[b · Calidad]
  B --> C[c · Imagen multi-stage]
  C --> D[d · Versión anterior<br/>y scripts]
  D --> E[e · Pruebas]
  E --> F[f · Resultados]
  F --> G[g · Publicar]
```

Cada caja es una *stage* de tu `Jenkinsfile`. Si una se bloquea, el pipeline no debe continuar.

### a) Obtener el código de una rama

- El job es parametrizado: recibe la rama a construir (`develop` por defecto) y la versión a publicar.

- El checkout usa la credencial guardada en Jenkins. No escribas usuarios ni contraseñas en el `Jenkinsfile`.

### b) Pasar el análisis de calidad

- Lanza el análisis de código con la herramienta vista en clase.

- Espera al resultado del *quality gate*. Si no se supera, el pipeline se detiene.

### c) Construir la imagen multi-stage

- Tu `Dockerfile` tiene al menos tres etapas: `build`, `test` y `runtime`.

- La imagen final (`runtime`) no contiene herramientas de compilación, dependencias de desarrollo ni código de pruebas.

- La imagen lleva la versión como etiqueta y como `LABEL`.

### d) Incluir la versión anterior y los scripts

- Antes de publicar, recupera del registry la imagen que está ahora en `latest` y etiquétala como `previous`.

- Tu repositorio incluye `scripts/deploy.sh` y `scripts/rollback.sh`, y el build los guarda como artefactos.

- La primera ejecución no tendrá versión anterior: el pipeline no debe fallar por eso.

### e) Pruebas funcionales y no funcionales

- Funcionales: pruebas unitarias y/o de integración que generen un informe en formato JUnit.

- No funcionales: una prueba de carga contra el contenedor levantado y un escaneo de vulnerabilidades de la imagen.

- Se valora que se ejecuten en paralelo.

### f) Guardar los resultados

- Los resultados de las pruebas se publican en Jenkins (gráfica de tests).

- Los informes de carga y de seguridad se archivan como artefactos del build y se pueden descargar.

### g) Publicar con versión semántica

- El pipeline comprueba que la versión cumple SemVer (`MAYOR.MENOR.PARCHE`) y falla si no.

- Sube la imagen al registry de Gitea con tres etiquetas: `X.Y.Z`, `X.Y` y `latest`.

- Crea el tag `vX.Y.Z` en tu repositorio de Gitea.

## Hitos orientativos

| Minuto | Deberías tener terminado                         |
|--------|--------------------------------------------------|
| 10'    | Laboratorio comprobado                           |
| 30'    | a · Checkout de la rama por parámetro            |
| 55'    | b · Análisis de calidad con *quality gate*       |
| 80'    | c · Imagen multi-stage construida                |
| 100'   | d · Imagen `previous` y scripts archivados       |
| 135'   | e · Pruebas funcionales, de carga y de seguridad |
| 150'   | f · Resultados publicados y archivados           |
| 170'   | g · Imagen publicada y tag creado                |
| 180'   | Puesta en común                                  |

Si te atascas en un criterio, desactívalo con `when { expression { false } }` y sigue con el siguiente. Vuelve a él al final.

---

[← Sesión 8](sesion8.md) · [Índice de la UT01](./)
