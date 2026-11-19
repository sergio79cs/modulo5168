[← Sesión 8](sesion8.md) · [Índice de la UT01](./)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 9 - Práctica integradora (enunciado)

## Qué vas a hacer

En las sesiones anteriores construiste las piezas por separado: Git, Docker, la calidad del código, las pruebas, el registro de imágenes y el versionado. En esta sesión las juntas en **un único pipeline de Jenkins** que, con solo pulsar un botón, hace todo el recorrido: coge el código, lo analiza, construye la imagen, la prueba y la publica con su versión.

No hay contenido nuevo. Todo lo que necesitas ya lo has hecho en alguna sesión; el reto es encadenarlo y que funcione de principio a fin.

**Qué tendrás al terminar**

- Un fichero `Jenkinsfile.integradora` en tu repositorio de Gitea, con siete *stages*, una por criterio (`a · Checkout`, `b · Calidad`… `g · Publicar`).
- Un job de Jenkins que lo ejecuta y te pide dos datos: la **rama** y la **versión** (por ejemplo `2.0.0`).
- Una ejecución en verde que deja la imagen publicada en Gitea, el tag creado en tu repositorio y los informes descargables.

Trabajo individual, en el laboratorio de tu ordenador.

## Punto de partida

No empiezas de cero. Ya tienes en tu repositorio de Gitea:

- La aplicación, con su `Dockerfile` (sesiones 3 y 4).
- Los scripts de pruebas y de comparación (sesiones 6 y 7).
- El `Jenkinsfile` de la sesión 8, con la comprobación de versión y la publicación.
- Un job multibranch (`modulo5168-versiones`) que usa ese `Jenkinsfile`. **No lo toques**: el job de hoy es otro.

Tu trabajo es crear un **fichero nuevo** y un **job nuevo**, reutilizando trozos de lo que ya has hecho.

## Preparación del laboratorio

Comprueba que tu laboratorio está listo. Si algo falla, revisa la [guía del laboratorio](../laboratorio/) antes de seguir.

- ☐ Gitea, Jenkins y SonarQube están arrancados y accesibles.
- ☐ Jenkins puede ejecutar comandos `docker` (acceso al socket de Docker).
- ☐ El registry de paquetes de Gitea está activo y Docker puede iniciar sesión en él.
- ☐ En Jenkins existe la credencial `gitea-cred` (usuario y token de Gitea).
- ☐ En Jenkins hay un servidor de calidad llamado `sonarqube` (Manage Jenkins → System).

### Preparación de la VM para esta sesión

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

## Cómo empezar

1. **Crea el fichero.** En tu repositorio, junto al `Jenkinsfile` de la sesión 8, crea `Jenkinsfile.integradora` con esta estructura vacía. Rellenarás las *stages* una a una:

   ```
   pipeline {
     agent any
     parameters {
       string(name: 'RAMA', defaultValue: 'develop', description: 'Rama a construir')
       string(name: 'VERSION', defaultValue: '1.0.0', description: 'Versión MAYOR.MENOR.PARCHE')
     }
     stages {
       stage('a · Checkout') {
         steps { echo 'pendiente' }
       }
     }
   }
   ```

   En la VM del laboratorio, el repositorio guarda la aplicación en `lab/app`, así que el fichero va en `lab/app/Jenkinsfile.integradora`.

2. **Crea el job.** En Jenkins: **New Item** → nombre `sesion9-integradora` → tipo **Pipeline**. En *Pipeline* elige **Pipeline script from SCM** y rellena:

   - **SCM:** Git.
   - **Repository URL:** `http://gitea:3000/aula/<tu-repo>.git` (con `gitea`, no `localhost`).
   - **Credentials:** `gitea-cred`.
   - **Branch Specifier:** `*/develop`.
   - **Script Path:** la ruta de tu fichero (en la VM, `lab/app/Jenkinsfile.integradora`).

3. **Ejecútalo.** Sube el fichero a la rama `develop` (`git add`, `git commit`, `git push`). En el job pulsa **Build with Parameters**. La primera vez Jenkins solo conoce el job, no sus parámetros: si no te los ofrece, ejecuta una vez y vuelve a pulsar.

4. **Avanza de una en una.** Rellena la *stage* `a`, súbela, ejecuta y comprueba que está en verde. Después añade la `b`, y así hasta la `g`. No escribas las siete de golpe: si falla, no sabrás dónde.

Cada vez que cambies el `Jenkinsfile.integradora` tienes que hacer `commit` y `push`, porque Jenkins lo lee del repositorio, no de tu carpeta local.

## Las siete etapas

```
flowchart LR
  A[a · Checkout] --> B[b · Calidad]
  B --> C[c · Imagen multi-stage]
  C --> D[d · Versión anterior<br/>y scripts]
  D --> E[e · Pruebas]
  E --> F[f · Resultados]
  F --> G[g · Publicar]
```

Cada caja es una *stage* de tu `Jenkinsfile.integradora`. Si una falla, el pipeline se detiene y no ejecuta las siguientes.

| Etapa | Qué tiene que hacer | Cómo sabes que funciona | Dónde lo viste |
|---|---|---|---|
| a · Checkout | Descargar el código de la rama que se indica al lanzar el job | El log muestra el commit de la rama elegida | Sesión 1 y sesión 8 |
| b · Calidad | Analizar el código con SonarQube y esperar el *quality gate* | El proyecto aparece en SonarQube; con un gate en rojo, el pipeline se detiene | Sesión 5 |
| c · Imagen | Construir la imagen con un `Dockerfile` multi-stage y la versión como etiqueta | `docker images` muestra la imagen con la versión elegida | Sesiones 3 y 4 |
| d · Anterior y scripts | Guardar la imagen que hay en `latest` como `previous` y archivar los scripts | En la primera ejecución no falla; los scripts aparecen como artefactos | Sesión 8 |
| e · Pruebas | Ejecutar pruebas unitarias, prueba de carga y escaneo de vulnerabilidades | Se generan el informe JUnit, el de k6 y el de Trivy | Sesiones 6 y 7 |
| f · Resultados | Publicar los tests en Jenkins y archivar los informes | Hay gráfica de tests y los informes se descargan del build | Sesión 7 |
| g · Publicar | Validar la versión, subir la imagen y crear el tag | La imagen está en Gitea con tres etiquetas y existe el tag `vX.Y.Z` | Sesión 8 |

### a) Obtener el código de una rama

- Usa el parámetro `RAMA` que ya está en el esqueleto: así puedes construir otra rama sin tocar el fichero.
- El checkout usa la credencial `gitea-cred`. No escribas usuarios ni contraseñas en el `Jenkinsfile`.
- Pista: el paso `git` admite `branch`, `credentialsId` y `url`.

### b) Pasar el análisis de calidad

- Lanza el análisis con `sonar-scanner` dentro de `withSonarQubeEnv('sonarqube')`.
- Después, `waitForQualityGate` espera el veredicto. Si el gate no se supera, el pipeline se detiene.
- Pista: `waitForQualityGate` solo termina si SonarQube avisa a Jenkins con un webhook a `http://jenkins:8080/sonarqube-webhook/`.

### c) Construir la imagen multi-stage

- Tu `Dockerfile` tiene al menos tres etapas: `build`, `test` y `runtime`.
- La imagen final (`runtime`) no contiene herramientas de compilación, dependencias de desarrollo ni código de pruebas.
- La imagen lleva la versión como etiqueta y como `LABEL`.
- Pista: `docker build --target runtime --build-arg VERSION=... -t ...` construye solo hasta la etapa que indiques. Usa el parámetro `VERSION`.

### d) Incluir la versión anterior y los scripts

- Antes de publicar, recupera del registry la imagen que está ahora en `latest` y etiquétala como `previous`.
- Tu repositorio incluye `scripts/deploy.sh` y `scripts/rollback.sh`, y el build los guarda como artefactos (`archiveArtifacts`).
- La primera ejecución no tendrá versión anterior: el pipeline no debe fallar por eso. Pista: `docker pull ... || echo '...'`.

### e) Pruebas funcionales y no funcionales

- Funcionales: pruebas unitarias y/o de integración que generen un informe en formato JUnit.
- No funcionales: una prueba de carga con k6 contra el contenedor levantado y un escaneo de vulnerabilidades de la imagen con Trivy.
- Se valora que se ejecuten en paralelo (bloque `parallel`).
- Pista: para la prueba de carga, arranca tu imagen con `docker run -d --name ... --network lab5168` y apunta k6 a ese nombre, no a `localhost`. Borra ese contenedor al final, falle o no el pipeline (`post { always { ... } }`).

### f) Guardar los resultados

- Los resultados de las pruebas se publican en Jenkins con `junit` (gráfica de tests).
- Los informes de carga y de seguridad se archivan como artefactos del build y se pueden descargar.

### g) Publicar con versión semántica

- El pipeline comprueba que `VERSION` cumple SemVer (`MAYOR.MENOR.PARCHE`) y falla si no. Es la comprobación de la sesión 8.
- Sube la imagen al registry de Gitea con tres etiquetas: `X.Y.Z`, `X.Y` y `latest`.
- Crea el tag `vX.Y.Z` en tu repositorio de Gitea.
- Usa `gitea-cred` con `withCredentials` para iniciar sesión en el registry y para empujar el tag.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `permission denied` en `/var/run/docker.sock` | Jenkins no tiene acceso al socket de Docker | Revisa la guía de instalación (paso 2) |
| El checkout o un `curl` no encuentra `localhost:3000` | Jenkins corre en un contenedor | Usa `gitea:3000` |
| `waitForQualityGate` se queda colgado | Falta el webhook de SonarQube hacia Jenkins | Webhook a `http://jenkins:8080/sonarqube-webhook/` (con la barra final) y SonarQube en la red `lab5168` |
| `server gave HTTP response to HTTPS client` al hacer push | El registry no usa HTTPS | Añade `localhost:3000` a `insecure-registries` del daemon de Docker |
| El workspace o `reports/` aparecen vacíos dentro de un contenedor auxiliar | El `docker run` monta una ruta que no existe donde crees | Monta el espacio de trabajo con `--volumes-from jenkins` |
| `junit` no encuentra el informe | La ruta de salida del reporter no es la que le indicas | Comprueba dónde escribe el informe y ajusta la ruta de `junit` |
| `EAI_AGAIN` o `Temporary failure resolving` | La red bloquea el DNS | Fija el DNS en `/etc/docker/daemon.json` (guía de instalación, paso 1) |

## Orden de trabajo

1. Laboratorio comprobado.
2. Esqueleto del `Jenkinsfile.integradora` subido y job creado.
3. a · Checkout de la rama por parámetro.
4. b · Análisis de calidad con *quality gate*.
5. c · Imagen multi-stage construida.
6. d · Imagen `previous` y scripts archivados.
7. e · Pruebas funcionales, de carga y de seguridad.
8. f · Resultados publicados y archivados.
9. g · Imagen publicada y tag creado.
10. Puesta en común.

Si te atascas en un criterio, desactívalo con `when { expression { false } }` y sigue con el siguiente. Vuelve a él al final.

## Qué debes poder enseñar al terminar

- ☐ El job `sesion9-integradora` con las siete *stages* en verde.
- ☐ Una ejecución con una versión no válida (por ejemplo `1.2`) que falla en la etapa `g`.
- ☐ En Gitea → Packages, tu imagen con las etiquetas `X.Y.Z`, `X.Y` y `latest`.
- ☐ En tu repositorio, el tag `vX.Y.Z`.
- ☐ En el build, la gráfica de tests y los informes de carga y de seguridad para descargar.

---

[← Sesión 8](sesion8.md) · [Índice de la UT01](./)
