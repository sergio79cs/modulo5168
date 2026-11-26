[Índice de la UT02](./) · [Sesión 2 →](sesion2.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 1 — Arquitectura de Jenkins

**Objetivo.** Al terminar, el alumnado sabrá explicar cómo se reparten el trabajo el *controller* y los agentes de Jenkins, distinguirá *job*, *build* y *executor* en la interfaz y entenderá por qué el módulo usa pipelines declarativos. Además, habrá recorrido por dentro el Jenkins que ya tiene en su laboratorio y habrá ejecutado con él un primer pipeline escrito por él mismo. Es la base del criterio a de la unidad.

**Entorno de trabajo.** Seguimos con el laboratorio de la UT01: Docker, Gitea y **Jenkins** ya están montados en la red Docker `lab5168`. Jenkins se usa desde el navegador en `http://localhost:8080`. Hoy no se instala nada: se estudia cómo funciona lo que ya tienes.

## 3.1 Teoría

### 1. Por qué existe un servidor de integración continua

En la UT01 construiste a mano cada eslabón: `git`, análisis de calidad, `docker build`, pruebas, etiquetas. Funciona, pero depende de que **una persona se acuerde de ejecutarlo todo, en el orden correcto y en su ordenador**. Es justo el problema de "en mi máquina funciona".

Un servidor de integración continua (CI) resuelve esto: ejecuta esos mismos pasos **de forma automática, siempre igual y en un entorno controlado**, cada vez que hay un cambio en el repositorio. Los resultados quedan registrados y visibles para todo el equipo.

**Jenkins** es el servidor de automatización de código abierto más extendido. Está escrito en Java, nació hace casi dos décadas (con el nombre de Hudson, hasta que en 2011 la comunidad lo renombró Jenkins) y su punto fuerte es el ecosistema de **plugins**: hay más de mil, y casi cualquier herramienta (Git, Docker, Kubernetes, SonarQube…) tiene el suyo. Su principal inconveniente es que hay que instalarlo, mantenerlo y actualizarlo tú mismo. Es la contrapartida de tener el control total, y es lo que hiciste al montar el laboratorio y usar Jenkins en la UT01.

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

### Parte A — Explorar el Jenkins del laboratorio

**Objetivo:** reconocer en tu propio Jenkins, que ya funciona desde la UT01, las piezas que acabamos de ver en la teoría: controller, nodo integrado, executors, `JENKINS_HOME`, jobs y cola.

#### Paso 1. Comprobar que el laboratorio está en marcha

Jenkins y Gitea deben estar arrancados. Comprueba los contenedores:

```
docker ps --filter name=jenkins --filter name=gitea
```

Si falta alguno, arráncalo con `docker start jenkins` o `docker start gitea` y espera a que termine de arrancar. Después abre `http://localhost:8080` e inicia sesión con tu usuario.

Si estás usando la máquina virtual (.ova), el usuario es `aula` y la contraseña `aula1234`. Si te aparece el asistente de instalación inicial, algo no es como debería: avisa al profesor antes de seguir.

#### Paso 2. Recorrido guiado por la interfaz

Los nombres pueden variar un poco según la versión y el idioma del navegador; entre paréntesis aparece el original en inglés. Localiza y **responde en tu cuaderno**:

| Dónde                                                               | Qué buscar                                          | Conecta con la teoría   |
|---------------------------------------------------------------------|-----------------------------------------------------|--------------------------|
| Panel de control (*Dashboard*), lista central                       | Los jobs que ya existen de la UT01: nombre y tipo   | Job                      |
| Panel de control, menú lateral                                      | *Nueva Tarea*, *Historial de construcciones*, *Administrar Jenkins* | Job y build              |
| Panel de control, parte inferior del menú lateral                   | *Cola de ejecución* y *Estado del ejecutor de construcciones*      | Cola y executor          |
| *Administrar Jenkins → Nodos* (*Manage Jenkins → Nodes*)             | El **nodo integrado** y su número de ejecutores      | Controller que ejecuta builds |
| *Administrar Jenkins → Información del sistema* (*System Information*) | La variable `JENKINS_HOME`                           | Datos en disco           |
| *Administrar Jenkins → Plugins* → *Instalados*                      | Busca "Pipeline", "Git" y "SonarQube"               | Ecosistema de plugins    |
| Esquina inferior derecha de cualquier pantalla                      | La versión de Jenkins                               | —                        |

**Preguntas:**

1.  ¿Cuántos executors tiene el nodo integrado? Lo habitual es 2, pero puede variar.

2.  ¿Cuál es la ruta de `JENKINS_HOME`? ¿Coincide con lo que vimos en la teoría?

3.  ¿Qué versión de Jenkins tienes?

4.  Abre uno de los jobs de la UT01 y mira su historial. ¿Cuántos builds tiene? ¿Cuál fue el resultado del último?

5.  Si hoy lanzaras 5 builds a la vez, ¿cuántos esperarían en la cola?

#### Paso 3. Mirar `JENKINS_HOME` desde dentro

La interfaz es solo la fachada. Los datos están en el disco del controller. Entra a verlos desde la terminal:

```
docker exec jenkins ls /var/jenkins_home
docker exec jenkins ls /var/jenkins_home/jobs
docker volume ls
```

Compara con la tabla de la teoría:

1.  ¿Qué carpetas de las que describe la tabla aparecen? ¿Hay alguna más?

2.  En `jobs/`, ¿reconoces los nombres de los jobs que viste en el panel de control?

3.  En `docker volume ls`, localiza el volumen `jenkins_home`. ¿Qué pasaría con tus jobs y usuarios si borraras el contenedor `jenkins`? ¿Y si borraras el volumen?

#### Paso 4. Comprobar que Jenkins llega a Docker y a Gitea

Los pipelines de las próximas sesiones necesitan que Jenkins pueda ejecutar `docker` y encontrar a Gitea por su nombre. Una comprobación rápida, que ya sabes cómo se hace:

| Comprobación                          | Comando                                                                              | Resultado esperado                                                   |
|---------------------------------------|--------------------------------------------------------------------------------------|----------------------------------------------------------------------|
| Docker disponible en Jenkins          | `docker exec jenkins docker version`                                                 | Muestra **Client** y también **Server**                              |
| Jenkins encuentra a Gitea por su nombre | `docker exec jenkins curl -s -o /dev/null -w "%{http_code}\n" http://gitea:3000`    | `200`. Requiere que el contenedor `gitea` esté arrancado             |

Si alguna falla, no sigas: avisa al profesor, porque las sesiones siguientes dependen de esto.

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

Ejecuta `Construir ahora` y responde: ¿qué usuario aparece? ¿qué muestra `pwd`? ¿por qué `docker ps` funciona **dentro** del pipeline? *(Porque el contenedor de Jenkins comparte el socket del Docker de tu ordenador: el `docker` del pipeline habla con ese Docker.)*

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
| El equipo o la máquina virtual se reinició y Jenkins no responde          | `ERR_CONNECTION_REFUSED` en el navegador                            | `docker start jenkins`. Con `--restart unless-stopped` arranca solo si Docker está en marcha |
| El contenedor `gitea` está parado                                         | La comprobación con `curl` no devuelve `200`                        | `docker start gitea`                                                                  |
| Crear el job como *Freestyle* en lugar de *Pipeline*                      | No aparece la sección *Pipeline* con el cuadro *Script*             | Crear un job nuevo y elegir **Pipeline**                                              |
| Pegar el script con comillas tipográficas (`‘ ’`) o con espacios extraños   | Errores `unexpected char` o de sintaxis al ejecutar                  | Copiar de un editor de texto plano y comprobar que las comillas son rectas (`'`)      |
| `docker: not found` o `Cannot connect to the Docker daemon` dentro de Jenkins | `docker version` o un `sh 'docker ...'` falla                    | Tu Jenkins no se creó como indica la guía del laboratorio: avisa al profesor          |
| Ejecutar `docker volume rm jenkins_home` sin querer                       | Se borran usuarios, jobs y plugins                                    | Borrar solo el contenedor, nunca el volumen: los datos viven en él                    |
| El build queda en "Waiting for next available executor"                   | El build no arranca                                                 | Comprobar en *Nodos* que el nodo integrado tiene al menos 1 ejecutor                  |

---

[Índice de la UT02](./) · [Sesión 2 →](sesion2.md)
