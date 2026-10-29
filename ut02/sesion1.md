[Índice de la UT02](./) · [Sesión 2 →](sesion2.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 1 — Arquitectura de Jenkins

**Objetivo.** Al terminar, el alumnado sabrá explicar cómo se reparten el trabajo el *controller* y los agentes de Jenkins, distinguirá *job*, *build* y *executor* en la interfaz y entenderá por qué el módulo usa pipelines declarativos. Además, tendrá su propio Jenkins funcionando en local, con acceso a Docker y a la red del laboratorio, y habrá ejecutado con él su primer pipeline. Es la base del criterio a de la unidad.

**Entorno de trabajo.** Como en la UT01, todo el laboratorio se monta en local, en el ordenador de cada alumno. Hoy se añade **Jenkins** a la red Docker `lab5168`, junto a Gitea, y se usa desde el navegador en `http://localhost:8080`.

### Preparación previa: imágenes descargadas

Es opcional pero muy recomendable. Con todo el aula descargando a la vez, la red puede tardar varios minutos. Requisitos: Docker funcionando (`docker version` responde con cliente y servidor) y la red `lab5168` creada en la UT01 (`docker network ls` debe mostrarla; si no existe, `docker network create lab5168`).

```
docker pull jenkins/jenkins:lts-jdk21
docker pull docker:cli
```

Jenkins necesita en torno a 1-2 GB de memoria. Si SonarQube sigue arrancado de la UT01 y el equipo va justo, páralo con `docker stop sonarqube`. Se puede volver a arrancar con `docker start sonarqube`.

## 3.1 Teoría

### 1. Por qué existe un servidor de integración continua

En la UT01 construiste a mano cada eslabón: `git`, análisis de calidad, `docker build`, pruebas, etiquetas. Funciona, pero depende de que **una persona se acuerde de ejecutarlo todo, en el orden correcto y en su ordenador**. Es justo el problema de "en mi máquina funciona".

Un servidor de integración continua (CI) resuelve esto: ejecuta esos mismos pasos **de forma automática, siempre igual y en un entorno controlado**, cada vez que hay un cambio en el repositorio. Los resultados quedan registrados y visibles para todo el equipo.

**Jenkins** es el servidor de automatización de código abierto más extendido. Está escrito en Java, nació hace casi dos décadas (con el nombre de Hudson, hasta que en 2011 la comunidad lo renombró Jenkins) y su punto fuerte es el ecosistema de **plugins**: hay más de mil, y casi cualquier herramienta (Git, Docker, Kubernetes, SonarQube…) tiene el suyo. Su principal inconveniente es que hay que instalarlo, mantenerlo y actualizarlo tú mismo. Es la contrapartida de tener el control total, y es lo que vamos a hacer hoy.

### 2. Arquitectura: controller y agentes

Jenkins separa **quién decide** de **quién trabaja**:

```
                    +-----------------------------------+
   navegador -----> |  CONTROLLER                       |
   webhook Git ---> |  - interfaz web y API             |
                    |  - configuración de los jobs      |
                    |  - cola de trabajos pendientes    |
                    |  - JENKINS_HOME (datos en disco)  |
                    +-----------+---------------+-------+
                                |               |
                     +----------v-----+   +-----v----------+
                     |  AGENTE 1      |   |  AGENTE 2      |
                     |  2 executors   |   |  4 executors   |
                     |  workspace/    |   |  workspace/    |
                     +----------------+   +----------------+
```

**El controller** (antes llamado *master*) es el cerebro. Muestra la interfaz web, guarda la configuración de todos los jobs y su historial, recibe los avisos del repositorio, mantiene la **cola** de trabajos pendientes y decide en qué agente se ejecuta cada uno. **No debería ejecutar el trabajo pesado.**

**Los agentes** (*agents*, antes *slaves*) son las máquinas, máquinas virtuales o contenedores que **ejecutan realmente** los pasos del pipeline: descargan el código, compilan, prueban, construyen imágenes. Se conectan al controller por SSH o por un protocolo propio de Jenkins (conexión entrante por el puerto 50000). Un mismo controller puede gobernar muchos agentes con sistemas operativos y herramientas distintas: uno Linux con Node, otro Windows con .NET, etc.

¿Por qué separarlos en un entorno real?

- **Escala:** más agentes permiten ejecutar más builds a la vez, sin que se acumulen en la cola.
- **Entornos distintos:** cada proyecto necesita sus propias herramientas y versiones. Se asignan mediante **etiquetas** (`linux`, `windows`, `gpu`…).
- **Seguridad y estabilidad:** un pipeline ejecuta código arbitrario. Si corre en el controller, puede leer sus credenciales y sus ficheros, o tumbarlo con un build que consuma toda la memoria. Por eso la recomendación en producción es dejar el controller con **0 ejecutores**.

**Nuestro laboratorio** es la versión mínima: no hay servidor compartido, así que el controller ejecuta él mismo los builds a través de su **nodo integrado** (*Built-In Node*). Por eso `agent any` ("cualquier agente disponible") acaba siempre en el mismo sitio. Existen otras formas de elegir dónde se ejecuta un pipeline (por etiqueta o dentro de un contenedor Docker), pero hoy solo necesitamos `agent any`.

Un último concepto: **`JENKINS_HOME`** es la carpeta donde el controller guarda todo lo que le importa. En nuestro contenedor es `/var/jenkins_home`.

| Contenido de `JENKINS_HOME` | Qué guarda                                              |
|-----------------------------|---------------------------------------------------------|
| `config.xml`                | Configuración global de Jenkins                          |
| `jobs/`                     | Definición de cada job y el historial de sus builds      |
| `plugins/`                  | Plugins instalados                                       |
| `secrets/`                  | Claves para cifrar las credenciales y la clave inicial   |
| `users/`                    | Usuarios creados                                         |
| `workspace/`                | Copia de trabajo de cada job (el código descargado)      |

Si este directorio se pierde, se pierde Jenkins entero. Es el mismo razonamiento que con Gitea en la UT01: por eso se monta como **volumen** (`jenkins_home`) y sobrevive aunque se borre el contenedor.

### 3. Job, build y executor

Estos tres términos aparecen en toda la interfaz y se confunden con facilidad. Una analogía útil: **una cocina**. El *job* es la receta, el *build* es cada vez que se cocina el plato, el *executor* es el cocinero que lo prepara y el *agente* es la cocina donde trabaja.

| Concepto      | Qué es                                                                          | Dónde se ve                                      |
|---------------|---------------------------------------------------------------------------------|--------------------------------------------------|
| **Job** (tarea) | La definición de qué hay que ejecutar. Se crea una vez y se reutiliza.          | Panel de control: cada fila es un job            |
| **Build**       | Una ejecución concreta de un job. Se numera: `#1`, `#2`, `#3`…                  | Historial de construcciones del job              |
| **Executor**    | Un "hueco" de un agente capaz de ejecutar un build. Con 2 executors, 2 builds a la vez. | Estado del ejecutor de construcciones            |
| **Workspace**   | Carpeta del agente donde el build descarga el código y trabaja.                 | Dentro del job: *Workspace*                      |
| **Cola**        | Builds pendientes que esperan a que quede libre un executor.                    | Cola de ejecución (menú lateral)                 |

**Tipos de job** que verás al crear uno nuevo (*Nueva Tarea*):

- **Freestyle:** se configura marcando opciones en formularios. Es cómodo al principio, pero la configuración vive dentro de Jenkins, no se versiona y es difícil de reproducir.
- **Pipeline:** el proceso se describe **como código** en un texto. Es el que usaremos en todo el módulo.
- **Multibranch Pipeline:** crea un pipeline por cada rama o etiqueta del repositorio (lo usaste en la sesión 8 de la UT01).
- **Folder:** solo organiza otros jobs en carpetas.

**Ciclo de vida de un build:**

1. Algo lo **dispara**: una persona con *Construir ahora*, un `push`, un webhook o una programación.
2. El build entra en la **cola**.
3. Cuando hay un **executor libre**, el controller le asigna el build.
4. Se prepara el **workspace** y se ejecutan los pasos.
5. Al terminar se guarda el resultado, con su **Console Output**.

**Resultado de un build:**

| Estado      | Significado                                                                    | Color habitual |
|-------------|--------------------------------------------------------------------------------|----------------|
| `SUCCESS`   | Todos los pasos terminaron bien                                                | Azul o verde   |
| `FAILURE`   | Algún paso falló (un comando devolvió un código distinto de 0)                 | Rojo           |
| `UNSTABLE`  | Se ejecutó todo, pero hay algo a medias (por ejemplo, pruebas con fallos)      | Amarillo       |
| `ABORTED`   | Alguien lo detuvo a mano                                                       | Gris           |
| `NOT_BUILT` | No se ejecutó (una etapa anterior falló o no se cumplió su condición)          | Gris claro     |

Recuerda la sesión 6 de la UT01: para el pipeline, una prueba es un proceso que termina con código de salida 0 (pasa) o distinto de 0 (falla). Jenkins hace lo mismo con **cada paso**: si un comando devuelve un código distinto de 0, el build se marca como `FAILURE` y el pipeline se detiene.

### 4. Pipeline declarativo frente a scripted

**Pipeline as code.** En lugar de configurar el proceso con formularios, se describe en un texto. Ese texto puede guardarse en el repositorio junto al código, revisarse en una Pull Request, versionarse y reproducirse en otro Jenkins. Se acostumbra a llamar **`Jenkinsfile`**. Es la misma idea de la UT01: lo que importa está en el repositorio.

Jenkins admite **dos sintaxis**, ambas basadas en Groovy:

**Declarativa** (`pipeline { ... }`): tiene una estructura fija y sencilla. Jenkins **valida la sintaxis antes de ejecutar** y da mensajes de error claros. Es la que usaremos en todo el módulo.

**Scripted** (`node { ... }`): es Groovy casi puro. Ofrece total libertad (bucles, condiciones, funciones), pero a cambio es más fácil equivocarse y más difícil de leer. Se usa cuando hace falta una lógica muy especial.

```
// Declarativa
pipeline {
    agent any
    stages {
        stage('Saludo') {
            steps { echo 'Hola' }
        }
    }
}

// Scripted (hace lo mismo)
node {
    stage('Saludo') {
        echo 'Hola'
    }
}
```

| Característica             | Declarativa                                 | Scripted                                |
|----------------------------|---------------------------------------------|-----------------------------------------|
| Estructura                 | Fija: secciones con nombre                   | Libre                                   |
| Validación previa          | Sí, antes de ejecutar                        | No, los errores salen durante la ejecución |
| Curva de aprendizaje       | Baja                                        | Alta (hay que saber Groovy)             |
| Flexibilidad               | Media (bloque `script { }` si hace falta)    | Total                                   |
| Uso habitual               | La mayoría de proyectos                     | Casos complejos                         |

Con la declarativa, cuando hace falta una lógica que la estructura no permite, se puede insertar un bloque `script { ... }` con Groovy libre. Esa "salida de emergencia" nos deja empezar por la sintaxis sencilla sin quedarnos cortos.

**Anatomía del pipeline de hoy:**

```
pipeline {                                    // 1
    agent any                                 // 2
    stages {                                  // 3
        stage('Saludo') {                     // 4
            steps { echo 'Hola desde mi primer pipeline' }   // 5
        }
    }
}
```

| Nº | Elemento   | Qué hace                                                                                     |
|----|------------|----------------------------------------------------------------------------------------------|
| 1  | `pipeline` | Bloque raíz. Todo pipeline declarativo está dentro de él.                                     |
| 2  | `agent`    | Dónde se ejecuta. `any` = en cualquier agente disponible (en nuestro laboratorio, el nodo integrado). |
| 3  | `stages`   | Contenedor de las etapas. Se ejecutan **en orden**, de arriba abajo.                          |
| 4  | `stage`    | Una etapa con nombre. Ese nombre es el que aparece en la vista del pipeline.                  |
| 5  | `steps`    | Los pasos concretos dentro de la etapa. Aquí, `echo` escribe un mensaje en el Console Output. |

Los **steps** son los "verbos" del pipeline: `echo` (escribir), `sh` (ejecutar un comando de shell), `git` o `checkout` (descargar código), `archiveArtifacts` (guardar ficheros)… Hay que tener en cuenta que `sh` ejecuta comandos de shell **en Linux**. Como nuestro Jenkins corre en un contenedor Linux, usaremos siempre `sh`, incluso si tu ordenador es Windows. El equivalente para agentes Windows es `bat`.

Una sección que veremos más adelante es **`post`**, que define qué hacer al final según el resultado (`always`, `success`, `failure`…), por ejemplo, avisar si falla.

### Comprobación rápida

Preguntas para hacer en voz alta antes de pasar a la práctica:

1.  Tu Jenkins tiene 2 executors y se lanzan 5 builds a la vez. ¿Qué ocurre? *(Se ejecutan 2 y los otros 3 esperan en la cola.)*

2.  ¿Qué diferencia hay entre un job y un build? *(El job es la definición y el build cada ejecución numerada.)*

3.  ¿Por qué en producción no se ejecutan los builds en el controller? *(Ejecutan código arbitrario: riesgo para las credenciales y para la estabilidad de Jenkins.)*

4.  ¿Qué ventaja tiene guardar el pipeline como código frente a configurarlo con formularios? *(Se versiona, se revisa y se reproduce.)*

## 3.2 Práctica

### Parte A — Instalar y verificar Jenkins

**Objetivo:** tener un Jenkins propio funcionando en un contenedor, con datos persistentes, capaz de ejecutar comandos `docker` y de encontrar a Gitea por su nombre.

#### Paso 1. Preparar el Dockerfile

La imagen oficial de Jenkins **no incluye el cliente de Docker**, y en sesiones posteriores los pipelines ejecutarán `docker build`. Vamos a crear una imagen propia que lo añada.

```
mkdir jenkins-lab5168
cd jenkins-lab5168
```

Crea dentro un fichero llamado `Dockerfile` (con esa mayúscula y **sin extensión**) con este contenido:

```
FROM jenkins/jenkins:lts-jdk21
USER root
COPY --from=docker:cli /usr/local/bin/docker /usr/local/bin/docker
```

- `FROM jenkins/jenkins:lts-jdk21`: la imagen oficial de Jenkins con soporte a largo plazo (LTS) y Java 21.
- `USER root`: ejecuta Jenkins como administrador dentro del contenedor. Evita problemas de permisos con el socket de Docker. **Solo es aceptable en un laboratorio**, no en producción.
- `COPY --from=docker:cli ...`: copia únicamente el programa `docker` (el cliente) desde la imagen `docker:cli`. No instala el servicio de Docker: Jenkins se comunica con el Docker de tu ordenador.

#### Paso 2. Construir la imagen

```
docker build -t jenkins-lab5168 .
```

No olvides el punto final: indica que el Dockerfile está en la carpeta actual. La primera vez tarda un poco, porque descarga las capas de Jenkins.

#### Paso 3. Arrancar el contenedor

```
docker run -d --name jenkins \
  -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --network lab5168 \
  --restart unless-stopped \
  jenkins-lab5168
```

| Opción                                      | Para qué sirve                                                                 |
|---------------------------------------------|--------------------------------------------------------------------------------|
| `-p 8080:8080`                              | Publica la interfaz web: la abrirás en `http://localhost:8080`                 |
| `-p 50000:50000`                            | Puerto para agentes remotos. Hoy no se usa, pero es el que verías en un entorno real |
| `-v jenkins_home:/var/jenkins_home`         | Volumen con todos los datos de Jenkins: sobreviven si se borra el contenedor   |
| `-v /var/run/docker.sock:/var/run/docker.sock` | Comparte con Jenkins el "enchufe" del Docker de tu ordenador. Así podrá lanzar `docker build` y `docker run` |
| `--network lab5168`                         | Lo conecta a la red donde está Gitea, para encontrarlo por su nombre           |
| `--restart unless-stopped`                  | Se vuelve a arrancar solo al reiniciar Docker o el equipo                      |

**Advertencia sobre el socket.** Compartir `docker.sock` da a Jenkins control total sobre el Docker de tu ordenador, y por tanto prácticamente sobre el equipo. En el laboratorio es lo que necesitamos y es aceptable, pero en un entorno real se evita con agentes dedicados.

**Consejos por sistema.** Los comandos con `\` al final de línea son para Linux, macOS y Git Bash o WSL en Windows. En PowerShell, o escribe el comando en una sola línea, o sustituye cada `\` por un acento grave (`` ` ``). Con Docker Desktop, la ruta `/var/run/docker.sock` funciona tal cual, aunque estés en Windows o macOS.

Comprueba que el contenedor está en marcha:

```
docker ps --filter name=jenkins
```

#### Paso 4. Desbloquear Jenkins

Jenkins arranca con una contraseña temporal para evitar que cualquiera de la red termine la instalación. Espera **1 o 2 minutos** y obtenla con:

```
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Si no aparece o da error, Jenkins aún no ha terminado de arrancar. Puedes seguir el arranque con `docker logs -f jenkins` (se sale con `Ctrl+C`); la contraseña también aparece allí, entre dos líneas de asteriscos.

Abre `http://localhost:8080`, pega la contraseña en **Unlock Jenkins** y pulsa **Continue**.

#### Paso 5. Plugins y primer usuario

1.  En **Customize Jenkins**, elige **Install suggested plugins**. Es el conjunto básico: Git, Pipeline, Credentials, etc. Tarda entre 3 y 8 minutos según la red. Si algún plugin falla, aparece un botón **Retry**.

2.  En **Create First Admin User**, crea tu usuario administrador (nombre de usuario, contraseña, nombre completo y correo). **Apunta la contraseña**: es tu acceso a partir de ahora, y la temporal deja de valer.

3.  En **Instance Configuration**, deja la URL `http://localhost:8080/` y pulsa **Save and Finish**, y después **Start using Jenkins**.

Mientras se instalan los plugins es buen momento para adelantar el bloque siguiente.

#### Paso 6. Recorrido guiado por la interfaz

Los nombres pueden variar un poco según la versión y el idioma del navegador; entre paréntesis aparece el original en inglés. Localiza y **responde en tu cuaderno**:

| Dónde                                                               | Qué buscar                                          | Conecta con la teoría   |
|---------------------------------------------------------------------|-----------------------------------------------------|--------------------------|
| Panel de control (*Dashboard*), menú lateral                        | *Nueva Tarea*, *Historial de construcciones*, *Administrar Jenkins* | Job y build              |
| Panel de control, parte inferior del menú lateral                   | *Cola de ejecución* y *Estado del ejecutor de construcciones*     | Cola y executor          |
| *Administrar Jenkins → Nodos* (*Manage Jenkins → Nodes*)             | El **nodo integrado** y su número de ejecutores      | Controller que ejecuta builds |
| *Administrar Jenkins → Información del sistema* (*System Information*) | La variable `JENKINS_HOME`                           | Datos en disco           |
| *Administrar Jenkins → Plugins* → *Instalados*                      | Busca "Pipeline" y "Git"                            | Ecosistema de plugins    |
| Esquina inferior derecha de cualquier pantalla                      | La versión de Jenkins                               | —                        |

**Preguntas:**

1.  ¿Cuántos executors tiene el nodo integrado? Lo habitual es 2, pero puede variar.

2.  ¿Cuál es la ruta de `JENKINS_HOME`? ¿Coincide con lo que vimos en la teoría?

3.  ¿Qué versión de Jenkins tienes?

4.  Si hoy lanzaras 5 builds a la vez, ¿cuántos esperarían en la cola?

#### Paso 7. Verificar el laboratorio

Antes de crear ningún pipeline, hay que comprobar que la instalación cumple lo que las próximas sesiones necesitan. Ejecuta cada comprobación y anota el resultado.

| Comprobación                          | Comando o acción                                                                    | Resultado esperado                                                   |
|---------------------------------------|--------------------------------------------------------------------------------------|----------------------------------------------------------------------|
| Jenkins responde                      | Abrir `http://localhost:8080` e iniciar sesión con tu usuario                        | Aparece el Panel de control                                           |
| Git disponible en Jenkins             | `docker exec jenkins git --version`                                                  | Muestra una versión de Git                                            |
| Docker disponible en Jenkins          | `docker exec jenkins docker version`                                                 | Muestra **Client** y también **Server**                              |
| Jenkins ve los contenedores del host  | `docker exec jenkins docker ps`                                                      | Lista los contenedores en marcha, incluido `jenkins`                 |
| Jenkins encuentra a Gitea por su nombre | `docker exec jenkins curl -s -o /dev/null -w "%{http_code}\n" http://gitea:3000`    | `200`. Requiere que el contenedor `gitea` esté arrancado (`docker start gitea`) |

Si en `docker version` solo aparece el bloque *Client* y el servidor da error, o `docker ps` dice *permission denied*, revisa que has montado el socket y que la imagen lleva `USER root`.

**Prueba de persistencia (para quien vaya bien de tiempo).** Comprobamos que los datos viven en el volumen y no en el contenedor:

```
docker rm -f jenkins
docker run -d --name jenkins \
  -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --network lab5168 \
  --restart unless-stopped \
  jenkins-lab5168
```

Tras 1 o 2 minutos, entra de nuevo en `http://localhost:8080`. Debe pedirte **tu usuario y contraseña**, sin repetir el asistente inicial ni reinstalar plugins. El contenedor era nuevo, pero los datos eran los de siempre.

### Parte B — Primer pipeline de prueba

**Objetivo:** crear un job de tipo Pipeline, ejecutarlo y leer el resultado en el Console Output.

#### Paso 1. Crear el job

1.  En el Panel de control, pulsa **Nueva Tarea** (*New Item*).

2.  En **Enter an item name**, escribe `saludo`. Sin espacios ni tildes, porque el nombre forma parte de la ruta del workspace.

3.  Elige el tipo **Pipeline** (no *Freestyle*) y pulsa **OK**.

#### Paso 2. Pegar el pipeline

Baja hasta la sección **Pipeline** y comprueba que *Definition* es **Pipeline script**. En el cuadro *Script*, pega:

```
pipeline {
    agent any
    stages {
        stage('Saludo') {
            steps { echo 'Hola desde mi primer pipeline' }
        }
    }
}
```

**Cuidado al copiar.** Si lo copias de un PDF o de un documento de Word, las comillas pueden convertirse en comillas "tipográficas" (`‘ ’`) y Groovy da errores del tipo `unexpected char`. Las comillas del script deben ser las rectas (`'`). Pulsa **Guardar** (*Save*).

#### Paso 3. Ejecutar

Ya estás en la página del job. Pulsa **Construir ahora** (*Build Now*). En **Historial de construcciones** aparece el build `#1`, primero en gris o parpadeando (en cola o en marcha) y, a los pocos segundos, con su color final. Según la versión, verás también una vista con las etapas (*stages*) del pipeline: una sola, `Saludo`.

#### Paso 4. Leer el Console Output

Pulsa sobre `#1` y después en **Salida de consola** (*Console Output*). Debes ver algo parecido a esto (los detalles cambian un poco según la versión):

```
Started by user tu-usuario
[Pipeline] Start of Pipeline
[Pipeline] node
Running on Built-In Node in /var/jenkins_home/workspace/saludo
[Pipeline] {
[Pipeline] stage
[Pipeline] { (Saludo)
[Pipeline] echo
Hola desde mi primer pipeline
[Pipeline] }
[Pipeline] // stage
[Pipeline] }
[Pipeline] // node
[Pipeline] End of Pipeline
Finished: SUCCESS
```

Relaciona cada parte con lo aprendido en la teoría:

| Línea                                        | Qué significa                                                                   |
|----------------------------------------------|---------------------------------------------------------------------------------|
| `Started by user ...`                        | Quién o qué **disparó** el build (aquí, tú a mano)                              |
| `Running on Built-In Node in ...`            | El **agente** elegido por `agent any` y la ruta del **workspace** en `JENKINS_HOME` |
| `{ (Saludo)`                                 | Empieza la **etapa** con ese nombre                                              |
| `Hola desde mi primer pipeline`              | La salida del **step** `echo`                                                    |
| `Finished: SUCCESS`                          | El **resultado** del build                                                       |

#### Paso 5. Entregable

**Entregable:** captura del **Console Output** con el build en **SUCCESS**. Deben verse el mensaje `Hola desde mi primer pipeline` y la línea `Finished: SUCCESS`.

### Ampliación (para quien acabe antes)

**1. Segunda etapa con un comando de shell.** Edita el job (*Configurar*, *Configure*) y añade una etapa después de `Saludo`:

```
pipeline {
    agent any
    stages {
        stage('Saludo') {
            steps { echo 'Hola desde mi primer pipeline' }
        }
        stage('Entorno') {
            steps {
                sh 'whoami && hostname && pwd'
                sh 'docker ps'
            }
        }
    }
}
```

Ejecuta `Construir ahora` y responde: ¿qué usuario aparece? ¿qué muestra `pwd`? ¿por qué `docker ps` funciona **dentro** del pipeline? *(Por el socket montado: el `docker` del pipeline habla con el Docker de tu ordenador.)*

**2. Provocar fallos a propósito.** Prueba, uno por uno, estos cambios y observa el resultado de cada build:

- Cambia `echo` por `ech`. *(Falla con `No such DSL method 'ech' found`: el step no existe.)*
- Sustituye el contenido de `steps` por `sh 'exit 1'`. *(Falla con `script returned exit code 1`: un código distinto de 0 detiene el pipeline, igual que las pruebas de la UT01.)*
- Quita una llave de cierre. *(Falla antes de ejecutar nada: es la validación de la sintaxis declarativa.)*

Anota en cada caso en qué estado termina el build y qué línea del Console Output indica la causa. Saber **leer el error** es una destreza que vas a necesitar en todo el módulo.

## 3.3 Cierre y para pensar (parte final de la sesión)

Con el pipeline funcionando, comentad en voz alta:

1.  En nuestro laboratorio el controller ejecuta los builds él mismo. ¿Qué riesgos tiene eso? ¿Qué habría que cambiar en un entorno de equipo real?

2.  El script de hoy está escrito **dentro** de Jenkins. Si el disco de Jenkins se pierde, ¿qué se pierde con él? ¿Dónde sería más seguro guardar el pipeline?

3.  Un compañero dice: "Creo el proceso con formularios de Freestyle, es más fácil". ¿Qué argumentos tienes para defender el pipeline como código?

## Errores frecuentes

| Error                                                                     | Consecuencia                                                        | Cómo evitarlo                                                                         |
|---------------------------------------------------------------------------|---------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| Otro servicio ya usa el puerto 8080                                       | `port is already allocated` al arrancar el contenedor               | Usar otro puerto: `-p 8081:8080` y abrir `http://localhost:8081`                       |
| Pedir la contraseña inicial antes de que Jenkins arranque del todo        | El fichero no existe o el comando no devuelve nada                  | Esperar 1-2 minutos o mirar `docker logs -f jenkins`                                   |
| Perder la contraseña del usuario administrador creado en el asistente     | No se puede entrar en Jenkins                                       | Anotarla al crearla. Si se pierde, el laboratorio se recrea con `docker rm -f jenkins` y `docker volume rm jenkins_home` (se pierde toda la configuración) |
| Fallan plugins durante la instalación (red saturada)                      | Instalación incompleta, faltan Pipeline o Git                        | Pulsar **Retry**, o instalarlos después en *Administrar Jenkins → Plugins*             |
| Olvidar el punto final en `docker build -t jenkins-lab5168 .`              | `requires exactly 1 argument`                                       | Comprobar que el comando termina en `.`                                               |
| Usar la imagen oficial sin el Dockerfile propio                           | `docker: not found` dentro de un pipeline                           | Construir `jenkins-lab5168` y arrancar con esa imagen                                 |
| No montar el socket de Docker (`-v /var/run/docker.sock:...`)              | `Cannot connect to the Docker daemon` al usar `docker`               | Recrear el contenedor con las opciones del paso 3                                     |
| Crear el job como *Freestyle* en lugar de *Pipeline*                      | No aparece la sección *Pipeline* con el cuadro *Script*             | Crear un job nuevo y elegir **Pipeline**                                              |
| Pegar el script con comillas tipográficas (`‘ ’`) o con espacios extraños   | Errores `unexpected char` o de sintaxis al ejecutar                  | Copiar de un editor de texto plano y comprobar que las comillas son rectas (`'`)      |
| Ejecutar `docker rm -f jenkins` y `docker volume rm jenkins_home` sin querer | Se borran usuario, jobs y plugins                                    | Borrar solo el contenedor: los datos viven en el volumen                              |
| El equipo se reinició y Jenkins no responde                               | `ERR_CONNECTION_REFUSED` en el navegador                            | `docker start jenkins` (con `--restart unless-stopped` arranca solo si Docker está en marcha) |
| El build queda en "Waiting for next available executor"                   | El build no arranca                                                 | Comprobar en *Nodos* que el nodo integrado tiene al menos 1 ejecutor                  |

---

[Índice de la UT02](./) · [Sesión 2 →](sesion2.md)
