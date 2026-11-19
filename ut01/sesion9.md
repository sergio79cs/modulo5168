[← Sesión 8](sesion8.md) · [Índice de la UT01](./)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 9 - Práctica integradora (enunciado)

## Objetivo

En esta sesión vas a construir, sobre tu propio repositorio de Gitea, un pipeline de Jenkins que recorra el flujo completo de integración y entrega continua visto hasta ahora (criterios a–g). No hay contenido nuevo: se trata de encadenar todo lo aprendido en un único `Jenkinsfile` que funcione de principio a fin.

- Trabajo individual, en el laboratorio de tu ordenador (Docker, Gitea, Jenkins y herramienta de calidad).
- El pipeline debe tener una *stage* por criterio, nombrada con su letra (por ejemplo `a · Checkout`).

## Antes de empezar

Comprueba que tu laboratorio está listo. Si algo falla, revisa la [guía del laboratorio](../laboratorio/) antes de seguir.

- ☐ Gitea, Jenkins y la herramienta de análisis de calidad están arrancados y accesibles.
- ☐ Jenkins puede ejecutar comandos `docker` (acceso al socket de Docker).
- ☐ Existe una red de Docker común para Jenkins, Gitea y los contenedores de prueba.
- ☐ El registry de paquetes de Gitea está activo y Docker puede iniciar sesión en él.
- ☐ En Jenkins hay una credencial de Gitea guardada (usuario y token).

## Preparación de la VM para esta sesión

Si trabajas con la máquina virtual del laboratorio, haz esto antes de empezar.

1. **Red de los contenedores del pipeline.** Los pasos del Jenkinsfile que lanzan contenedores con `docker run` (por ejemplo k6 o Trivy) deben conectarse a la red donde ya están Gitea, Jenkins y SonarQube. En la VM del laboratorio se llama `lab5168`; si usas otro laboratorio, comprueba el nombre con `docker network ls`. Añade `--network lab5168` a esos `docker run`. Dentro de esa red los contenedores se encuentran por su nombre (`gitea:3000`, `sonarqube:9000`), no por `localhost`.

2. **Comprueba que la VM tiene internet.** La construcción de la imagen (`npm ci`) y el análisis de seguridad con Trivy descargan datos de internet. Este comando debe responder `HTTP/2 200`; si no responde, revisa el DNS de la VM en la [guía del laboratorio](../laboratorio/):

   ```
   curl -sI https://registry.npmjs.org | head -1
   ```

3. **Sustituye los marcadores por tus datos.** Tu usuario de Gitea en la VM es `aula`. En las URLs (`http://gitea:3000/aula/<tu-repo>.git`) y en el nombre de la imagen (`localhost:3000/aula/<tu-imagen>`) pon tu usuario y el nombre de tu repositorio.

4. **Herramientas que usa el pipeline.** Con la VM nueva del laboratorio ya está todo preparado: `sonar-scanner` dentro de Jenkins, el servidor de calidad `sonarqube`, la credencial `gitea-cred` y las imágenes `grafana/k6`, `aquasec/trivy`, `sonarsource/sonar-scanner-cli` y `node:20-alpine`. No tienes que hacer nada más.

   Si usas la VM anterior o tu propio laboratorio, haz esto una vez en la terminal de la VM. Primero descarga las imágenes (necesitan internet):

   ```
   docker pull grafana/k6
   docker pull aquasec/trivy
   docker pull sonarsource/sonar-scanner-cli
   docker pull node:20-alpine
   ```

   Después deja disponible `sonar-scanner` dentro de Jenkins y haz que la ruta de los volúmenes de Jenkins exista también en la VM (así los informes de las pruebas llegan a tu espacio de trabajo):

   ```
   sudo ln -sfn /var/lib/docker/volumes/jenkins_home/_data /var/jenkins_home

   docker exec -i -u root jenkins sh -c 'cat > /usr/local/bin/sonar-scanner && chmod +x /usr/local/bin/sonar-scanner' <<'EOF'
   #!/bin/sh
   exec docker run --rm --network lab5168 -e SONAR_HOST_URL -e SONAR_TOKEN="${SONAR_TOKEN:-$SONAR_AUTH_TOKEN}" -v "$PWD:/usr/src" sonarsource/sonar-scanner-cli "$@"
   EOF
   ```

   Comprueba que funciona: `docker exec jenkins which sonar-scanner` debe mostrar `/usr/local/bin/sonar-scanner`. Si tu red común no se llama `lab5168`, cambia ese nombre en el script. Comprueba también en Jenkins (Manage Jenkins → System) que el servidor de calidad se llama `sonarqube`, y en Credentials que existe `gitea-cred`.

5. **Pruebas de carga.** El contenedor de tu aplicación necesita un momento para arrancar. Si k6 falla con `connection refused`, añade una espera o un reintento antes de lanzarlo.

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

## Orden de trabajo

1. Laboratorio comprobado.
2. a · Checkout de la rama por parámetro.
3. b · Análisis de calidad con *quality gate*.
4. c · Imagen multi-stage construida.
5. d · Imagen `previous` y scripts archivados.
6. e · Pruebas funcionales, de carga y de seguridad.
7. f · Resultados publicados y archivados.
8. g · Imagen publicada y tag creado.
9. Puesta en común.

Si te atascas en un criterio, desactívalo con `when { expression { false } }` y sigue con el siguiente. Vuelve a él al final.

---

[← Sesión 8](sesion8.md) · [Índice de la UT01](./)
