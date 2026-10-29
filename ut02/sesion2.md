[← Sesión 1](sesion1.md) · [Índice de la UT02](./) · [Sesión 3 →](sesion3.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 2 — Estructura del Jenkinsfile

Base para el criterio a.

| Parte | Contenido |
|---|---|
| **Teoría** | Contexto CI/CD, sintaxis declarativa, anatomía del Jenkinsfile, ejecución y errores típicos |
| **Práctica** | Ampliar el pipeline: checkout del repositorio del laboratorio y etapas encadenadas (checkout, listar ficheros, simular build) |
| **Cierre** | Puesta en común, entregable y autoevaluación |

## Índice

- [Parte I. Teoría](#parte-i-teoría)
- [Parte II. Práctica](#parte-ii-práctica)
- [Parte III. Cierre](#parte-iii-cierre)

---

# Parte I. Teoría

Se explica todo desde cero, sobre el esqueleto del Jenkinsfile:

```groovy
pipeline {
    agent any
    environment { /* variables globales */ }
    stages {
        stage('Nombre') { steps { /* comandos */ } }
    }
    post {
        success { /* ... */ }
        failure { /* ... */ }
    }
}
```

## Bloque 1. Contexto: ¿para qué existe un Jenkinsfile?

### 1.1 El problema de partida

Imagina un equipo de 5 personas que trabajan sobre el mismo proyecto. Cada una programa en su ordenador. Para entregar el software hay que:

1. Juntar el código de todos.
2. Compilarlo.
3. Ejecutar las pruebas.
4. Empaquetarlo.
5. Subirlo a un servidor.

Si esto se hace **a mano**, aparecen los problemas de siempre: "en mi máquina funciona", pasos que alguien olvida, errores que se descubren tarde y entregas lentas y estresantes.

### 1.2 CI/CD

- **Integración Continua (CI)**: cada vez que alguien sube código al repositorio, un sistema automático lo descarga, lo compila y lanza las pruebas. Si algo se rompe, se sabe en minutos, no en semanas.
- **Entrega Continua (CD, Delivery)**: además, el resultado queda empaquetado y listo para desplegar, pero una persona decide cuándo pulsar el botón.
- **Despliegue Continuo (CD, Deployment)**: igual, pero el despliegue a producción también es automático si todo pasa.

### 1.3 Jenkins

**Jenkins** es un servidor de automatización (programa Java) que ejecuta esos pasos automáticamente. Conceptos básicos de su arquitectura:

- **Controller** (antes "master"): el cerebro. Guarda la configuración, planifica y muestra la interfaz web.
- **Agent** (o node): la máquina que ejecuta realmente el trabajo. Puede ser el propio controller, otro servidor, una VM o un contenedor.
- **Executor**: cada "hueco" de un agente para ejecutar un trabajo a la vez. Un agente con 2 executors puede correr 2 builds en paralelo.
- **Job**: una tarea configurada en Jenkins. Cada ejecución de un job es un **build** (numerado: #1, #2, #3...).
- **Workspace**: la carpeta del agente donde se descarga el código y se trabaja durante un build.

### 1.4 Pipeline y Jenkinsfile

Un **pipeline** es la secuencia de pasos automáticos que llevan el código desde el repositorio hasta el resultado final (build, test, despliegue...). Se puede ver como una **cadena de montaje**: cada estación hace una cosa y, si una falla, la pieza no sigue.

Un **Jenkinsfile** es un **fichero de texto** que describe ese pipeline. Se guarda en la raíz del repositorio, junto al código. Esto se conoce como **Pipeline as Code**. Ventajas:

| Ventaja | Explicación |
|---|---|
| Versionado | El pipeline tiene historial en Git: se ve quién cambió qué y cuándo |
| Revisable | Se puede revisar en un pull request como cualquier código |
| Reproducible | Si se pierde el servidor Jenkins, el pipeline sigue en el repo |
| Evoluciona con el código | Si la app cambia y necesita un paso nuevo, se modifica en el mismo commit |

La alternativa antigua son los **freestyle jobs**: se configuran haciendo clic en formularios de la web. No se versionan, no se copian fácilmente y nadie sabe qué cambió cuando deja de funcionar.

## Bloque 2. Dos sintaxis y un poco de Groovy

El Jenkinsfile está escrito en **Groovy**, un lenguaje que corre sobre la máquina virtual de Java. No hace falta dominarlo: en la parte declarativa basta con entender que es una **estructura de bloques con llaves** `{ }` y que las cadenas de texto tienen un comportamiento especial (se ve en el bloque 5).

| | Declarativa | Scripted |
|---|---|---|
| Empieza por | `pipeline { ... }` | `node { ... }` |
| Estructura | Fija y con secciones predefinidas | Libre, Groovy casi completo |
| Ventaja | Legible; se valida antes de ejecutar | Muy flexible (bucles, condiciones complejas) |
| Inconveniente | Menos flexible | Más difícil de leer y mantener |

Analogía: la declarativa es **rellenar un formulario con campos fijos**; la scripted es **escribir un programa libre**. En el curso usamos la declarativa. Ventaja práctica: Jenkins revisa **todo el fichero antes de arrancar**, y si hay un error de estructura falla inmediatamente con un mensaje claro.

## Bloque 3. Anatomía del Jenkinsfile, pieza a pieza

Vamos construyendo el fichero de fuera hacia dentro.

### 3.1 `pipeline { }`: el contenedor raíz

Todo pipeline declarativo empieza con este bloque. Lo que quede fuera de él no es válido. Es el "marco" que le dice a Jenkins: "esto es un pipeline declarativo".

### 3.2 `agent`: ¿dónde se ejecuta?

Indica **en qué máquina o entorno** se van a ejecutar los comandos.

```groovy
agent any                       // cualquier agente disponible
agent none                      // sin agente global; cada stage define el suyo
agent { label 'linux' }         // solo agentes con la etiqueta "linux"
agent { docker { image 'maven:3.9-eclipse-temurin-17' } }  // dentro de un contenedor
```

- Una **etiqueta (label)** es un nombre que se pone a los agentes para agruparlos ("linux", "windows", "gpu"...).
- Con `docker { image ... }`, Jenkins arranca un contenedor con esa imagen, ejecuta dentro y luego lo elimina. Es muy útil porque **el entorno de build queda definido en el propio Jenkinsfile** (versión de Java, de Node, etc.).
- `agent` puede ponerse a nivel de pipeline (para todos los stages) o dentro de un `stage` concreto.

### 3.3 `environment`: variables de entorno

Una **variable de entorno** es un par nombre=valor que los programas pueden leer mientras se ejecutan. Se usan para configurar cosas sin escribirlas "a fuego" en cada comando.

```groovy
environment {
    APP_NAME = 'laboratorio'
    VERSION  = '1.0.0'
}
```

- Si se define a nivel de `pipeline`, es visible en todos los stages. Si se define dentro de un `stage`, solo en ese.
- Jenkins proporciona **variables predefinidas**: `BUILD_NUMBER` (número del build), `JOB_NAME` (nombre del job), `WORKSPACE` (ruta de la carpeta de trabajo) y `BUILD_URL` (enlace al build en la web).
- **Credenciales**: para contraseñas, tokens o claves existe `credentials('id')`. La credencial se guarda cifrada en Jenkins (Manage Jenkins → Credentials) y el Jenkinsfile solo la referencia por su ID. Jenkins además **enmascara** el valor en los logs (aparece como `****`).

```groovy
environment {
    TOKEN = credentials('mi-token')   // el valor real no está en el fichero
}
```

### 3.4 `stages` y `stage`: las etapas

- `stages` es el contenedor de todas las etapas, que se ejecutan **de arriba abajo, en orden**.
- Cada `stage('Nombre')` es una **fase lógica** del proceso: descargar código, compilar, probar, desplegar...
- El nombre es importante: Jenkins dibuja cada stage como una **columna** en la vista del pipeline, así que conviene que sea corto y descriptivo (`Checkout`, `Build`, `Test`, no `Paso 1`).

### 3.5 `steps`: las instrucciones concretas

Dentro de cada stage, `steps` contiene los **comandos que se ejecutan de verdad**. Los más habituales:

| Step | Qué hace |
|---|---|
| `echo 'texto'` | Escribe un mensaje en el log |
| `sh 'comando'` | Ejecuta un comando en la shell de **Linux/macOS** |
| `bat 'comando'` | Ejecuta un comando en **Windows** (cmd) |
| `checkout scm` | Descarga el repositorio del que viene el Jenkinsfile |
| `dir('carpeta') { ... }` | Ejecuta lo de dentro situado en esa subcarpeta |
| `sleep 5` | Espera 5 segundos |
| `sh '''...'''` | Varios comandos en un solo `sh` (comillas triples) |

**Sobre `checkout scm`**: SCM significa Source Control Management, o sea, el sistema de control de versiones (Git). `scm` es una variable especial que representa "el repositorio y la rama de los que Jenkins ha sacado este Jenkinsfile". Descarga el código al **workspace**. Si el laboratorio está en **otro** repositorio distinto al del Jenkinsfile, se usa en su lugar:

```groovy
git url: 'https://github.com/usuario/laboratorio.git', branch: 'main'
```

> **Nota:** cuando el job es "Pipeline script from SCM", Jenkins ya hace un checkout automático del repo al empezar (aparece como "Declarative: Checkout SCM" en la vista). Aun así, ponerlo explícito es una buena práctica didáctica.

### 3.6 `post`: qué hacer al terminar

Se ejecuta **después de los stages**, tanto si todo fue bien como si no. Sirve para notificar, limpiar y archivar resultados.

| Condición | Se ejecuta cuando... |
|---|---|
| `always` | Siempre, pase lo que pase |
| `success` | El pipeline terminó bien |
| `failure` | El pipeline falló |
| `unstable` | Terminó, pero con avisos (por ejemplo, algún test falló) |
| `aborted` | Alguien lo canceló a mano |
| `changed` | El estado es distinto al del build anterior |
| `fixed` | Falló antes y ahora va bien |
| `cleanup` | Al final de todo, después del resto de condiciones |

Ejemplo típico: `always { cleanWs() }` para limpiar el workspace, o `failure { echo 'Avisar al equipo' }`.

## Bloque 4. Cómo se ejecuta y cómo se lee el resultado

### 4.1 Código de salida (exit code)

Todo comando en Linux/Windows termina devolviendo un número: **0** significa "todo bien" y **cualquier otro número** significa "algo falló". Jenkins mira ese número en cada `sh`/`bat`. Si no es 0, **el step falla, el stage falla y el pipeline se detiene**. Por eso un `sh 'ls carpeta-que-no-existe'` rompe el pipeline: `ls` devuelve un código distinto de 0.

### 4.2 Qué pasa cuando algo falla

1. El step falla.
2. Ese stage se marca en rojo.
3. **Los stages siguientes se saltan** (aparecen en gris).
4. El bloque `post` **sí se ejecuta** (`failure` y `always`).

Es la lógica de la cadena de montaje: si una estación rechaza la pieza, no tiene sentido que pase a la siguiente.

### 4.3 Estados finales de un build

| Estado | Color | Significado |
|---|---|---|
| SUCCESS | Azul/verde | Todo correcto |
| FAILURE | Rojo | Algo falló |
| UNSTABLE | Amarillo | Terminó, pero con problemas (típico: tests fallidos) |
| ABORTED | Gris | Cancelado manualmente |

### 4.4 Dónde mirar el resultado

- **Console Output**: el log completo, línea a línea. Es lo primero que hay que mirar cuando algo falla.
- **Stage View**: tabla con una columna por stage y el tiempo de cada uno.
- **Blue Ocean**: interfaz gráfica moderna (si está instalado el plugin).
- **Replay**: permite reejecutar un build modificando el Jenkinsfile sin hacer commit; útil para probar.

## Bloque 5. Trampas típicas y buenas prácticas

### 5.1 Comillas simples vs. dobles

En Groovy, las comillas **dobles** permiten insertar variables con `${...}` (esto se llama **interpolación**). Las **simples** son texto literal.

```groovy
echo 'Compilando ${APP_NAME}'   // imprime literalmente: Compilando ${APP_NAME}
echo "Compilando ${APP_NAME}"   // imprime: Compilando laboratorio
```

Es el error nº 1 del alumnado. Además, con **secretos** conviene usar comillas simples en `sh`, para que sea la shell (y no Groovy) quien lea la variable y Jenkins pueda enmascararla:

```groovy
sh 'curl -H "Authorization: $TOKEN" https://...'
```

### 5.2 Otros errores frecuentes

- **Llaves mal cerradas**: el Jenkinsfile falla antes de empezar con un error de sintaxis.
- **Olvidar `steps`** dentro del `stage`: el declarativo lo exige.
- **`sh` en un agente Windows** (o `bat` en Linux): el comando no existe.
- **Poner `checkout` después de usar los ficheros**: el orden de los stages importa.
- **Nombre incorrecto del fichero**: debe llamarse exactamente `Jenkinsfile` (con J mayúscula, sin extensión).

### 5.3 Buenas prácticas

- **Un stage = una responsabilidad** (checkout, build, test...).
- **Nombres descriptivos** en los stages.
- **Nunca escribir secretos** en el fichero: usar `credentials()`.
- **Mantener el Jenkinsfile corto y legible**; si crece mucho, se separa la lógica en scripts del repo.
- **Limpiar en `post`** para no acumular basura en el workspace.

## Ejemplo completo comentado

```groovy
pipeline {
    agent any                      // cualquier agente libre

    environment {
        APP_NAME = 'laboratorio'   // variable global
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm               // descarga el repo
            }
        }
        stage('Listar ficheros') {
            steps {
                sh 'ls -la'                // shell (Linux)
            }
        }
        stage('Build') {
            steps {
                echo "Compilando ${APP_NAME} (build #${BUILD_NUMBER})"
            }
        }
    }

    post {
        always  { echo 'Fin' }     // pase lo que pase
        success { echo 'Pipeline OK' }
        failure { echo 'Pipeline con errores' }
    }
}
```

> **Actividad de predicción:** antes de ejecutarlo, pregunta al alumnado qué saldrá por pantalla y en qué orden. Luego cambia `ls -la` por `ls no-existe` y vuelve a preguntar: ¿qué stages se ejecutan? ¿Qué `post` salta?

## Comprobación final de la teoría

1. ¿Qué diferencia hay entre `stages` y `steps`?
2. ¿Qué es un agente y en qué se diferencia del controller?
3. Si falla el segundo stage, ¿se ejecuta el tercero? ¿Y el bloque `post`?
4. ¿Qué imprime `echo 'Hola ${APP_NAME}'`? ¿Y con comillas dobles?
5. ¿Por qué es mejor un Jenkinsfile en el repo que un job configurado en la interfaz?
6. ¿Dónde guardarías una contraseña que necesita el pipeline?

---

# Parte II. Práctica

**Enunciado (4.2):** ampliar el pipeline con checkout del repositorio del laboratorio y varias etapas encadenadas (checkout, listar ficheros, simular build).

El núcleo del enunciado son los ejercicios 2 y 3. Los ejercicios 1, 4, 5 y 6 son ampliación para afianzar la lectura de resultados y el bloque `post`; pueden eliminarse sin afectar al enunciado.

> **Supuestos:** el alumnado ya tiene Jenkins funcionando y un pipeline básico de la sesión 1; el agente es Linux (`sh`; en Windows, cambiar `sh` por `bat`); el repositorio del laboratorio es un repo Git accesible desde Jenkins (`URL_DEL_LABORATORIO` es un marcador que hay que sustituir).

| Ejercicio | Contenido |
|---|---|
| 0 | Preparación y punto de partida |
| 1 | Ejecutar el pipeline base y leer el resultado |
| 2 | Checkout del repositorio y listar ficheros |
| 3 | Simular el build con variables |
| 4 | Bloque `post` |
| 5 | Provocar y diagnosticar fallos |
| 6 | Reto de ampliación |

## Ejercicio 0. Preparación

**Objetivo:** que todo el mundo parta del mismo punto.

1. Comprobar que Jenkins está accesible y se puede iniciar sesión.
2. Crear un job nuevo: **Nuevo Item → Pipeline** con el nombre `ut02-s2-tunombre`.
3. Elegir cómo se define el pipeline:
   - **Opción A, Pipeline script**: se escribe en la propia web de Jenkins; es más rápida para empezar.
   - **Opción B, Pipeline script from SCM**: el Jenkinsfile está en el repo; es lo correcto para Pipeline as Code y la que mejor cuadra con la teoría.

> **Aviso importante:** `checkout scm` **solo funciona con la opción B**. Con la opción A da error porque no hay ningún SCM asociado al job; en ese caso hay que usar `git url: '...'`. Conviene decidir antes qué opción usa la clase para no perder tiempo depurando esto.

4. Pegar este pipeline base (el de la sesión 1 o uno equivalente):

```groovy
pipeline {
    agent any
    stages {
        stage('Hola') {
            steps { echo 'Hola Jenkins' }
        }
    }
}
```

## Ejercicio 1. Ejecutar y leer el resultado

**Objetivo:** reconocer las partes de la interfaz antes de tocar el código.

1. Pulsar **Construir ahora** y esperar a que termine.
2. Localizar y anotar en el cuaderno: el número de build (#1), el estado y su color, la **Stage View** y el **Console Output** (encontrar la línea donde aparece "Hola Jenkins").
3. Responder por escrito:
   - ¿Cuántos stages aparecen en la vista? Si solo hay uno en el código, ¿por qué se ve alguno más? *(Pista: "Declarative: Checkout SCM" o "Declarative: Post Actions", que añade Jenkins automáticamente.)*
   - ¿En qué carpeta se ha ejecutado? *(Añadir temporalmente `sh 'pwd'`.)*

> **Comprobación del docente:** todos han visto el Console Output y saben localizar el workspace.

## Ejercicio 2. Checkout y listar ficheros

**Objetivo:** encadenar stages y comprobar que el código llega al workspace. Sustituir el pipeline por:

```groovy
pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Listar ficheros') {
            steps {
                sh 'pwd'
                sh 'ls -la'
            }
        }
    }
}
```

Si el repo del laboratorio es distinto al del Jenkinsfile (o se usa la opción A), cambiar el stage Checkout por:

```groovy
stage('Checkout') {
    steps {
        git url: 'URL_DEL_LABORATORIO', branch: 'main'
    }
}
```

### Tareas

1. Ejecutar y comprobar en el Console Output que aparecen los ficheros del repositorio.
2. Añadir un tercer stage `Contar ficheros` con `sh 'ls -1 | wc -l'` y anotar el resultado.
3. **Experimento de orden:** intercambiar los stages `Checkout` y `Listar ficheros`, ejecutar y observar qué ocurre. Explicar por qué (el workspace puede estar vacío la primera vez, o contener restos de la ejecución anterior).
4. Volver al orden correcto.

### Preguntas de reflexión

- ¿De dónde salen los ficheros que lista `ls -la`?
- ¿Qué diferencia hay entre `checkout scm` y `git url: ...`?

## Ejercicio 3. Simular el build con variables

**Objetivo:** usar `environment`, variables predefinidas y comillas dobles, y generar un resultado real dentro del workspace. Ampliar el pipeline:

```groovy
pipeline {
    agent any

    environment {
        APP_NAME    = 'laboratorio'
        APP_VERSION = '1.0.0'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Listar ficheros') {
            steps {
                sh 'ls -la'
            }
        }
        stage('Build') {
            steps {
                echo "Compilando ${APP_NAME} versión ${APP_VERSION}"
                echo "Build número ${BUILD_NUMBER} del job ${JOB_NAME}"
                sh 'mkdir -p build'
                sh 'sleep 3'
                sh 'echo "${APP_NAME}-${APP_VERSION} build ${BUILD_NUMBER}" > build/resultado.txt'
            }
        }
        stage('Verificar') {
            steps {
                sh 'ls -lh build'
                sh 'cat build/resultado.txt'
            }
        }
    }
}
```

### Tareas

1. Ejecutar y comprobar que el fichero `resultado.txt` contiene el número de build correcto.
2. Ejecutar **dos veces más** y verificar que el número cambia.
3. Fijarse en la duración del stage `Build` en la Stage View (por el `sleep 3`).
4. **Experimento de comillas:** cambiar la primera línea de `echo` a comillas simples (`echo 'Compilando ${APP_NAME} versión ${APP_VERSION}'`). Ejecutar, ver qué imprime y explicar por qué. Volver a comillas dobles.
5. Cambiar `APP_VERSION` a `1.1.0` y comprobar que cambia en todos los sitios donde se usa. Comentar la ventaja de definirla una sola vez.

> **Nota para el docente:** el `sh` con comillas simples que usa `${APP_NAME}` funciona porque es la **shell** quien lee la variable de entorno, no Groovy. Es un buen momento para conectar con el error de comillas visto en teoría.

## Ejercicio 4. Bloque `post`

**Objetivo:** ver que `post` se ejecuta al final y según el resultado. Añadir al final del pipeline, dentro de `pipeline { }` y después de `stages { }`:

```groovy
    post {
        always {
            echo "Fin del build #${BUILD_NUMBER}"
        }
        success {
            echo 'Todo correcto'
        }
        failure {
            echo 'Ha fallado alguna etapa'
        }
    }
```

### Tareas

1. Ejecutar con todo correcto. Anotar qué mensajes de `post` aparecen y en qué orden.
2. Añadir `unstable` y `cleanup` con un `echo` cada uno y ver cuáles se ejecutan.
3. Dibujar en el cuaderno una tabla con las condiciones probadas (`always`, `success`, `failure`, `unstable`, `cleanup`) y marcar cuáles se ejecutaron.

Dejar `always` y `failure` para el siguiente ejercicio.

## Ejercicio 5. Provocar y diagnosticar fallos

**Objetivo:** aprender a leer errores, que es la habilidad más útil de la sesión. Por parejas: una persona rompe el pipeline y la otra lo diagnostica sin haber visto el cambio (solo con el Console Output). Después se intercambian. Averías para provocar, una cada vez:

| Avería | Cambio |
|---|---|
| 1. Comando que falla | `sh 'ls carpeta-que-no-existe'` en `Listar ficheros` |
| 2. Llave sin cerrar | Borrar una `}` |
| 3. Falta `steps` | Quitar el bloque `steps` de un stage |
| 4. Comando inexistente | `sh 'compilar-todo'` |
| 5. Variable mal escrita | Usar `${APP_NAM}` en un `echo` con comillas dobles |

**Para cada avería, la pareja debe responder:**

- ¿Falló antes de empezar o durante la ejecución?
- ¿Qué stage se puso en rojo? ¿Cuáles se saltaron?
- ¿Se ejecutó el bloque `post`? ¿Qué condiciones?
- ¿Qué línea del Console Output da la pista?

**Puntos que deberían descubrir:**

- Las averías 2 y 3 (estructura) fallan **antes de ejecutar ningún stage**, sin abrir el workspace.
- La avería 1 devuelve un código de salida distinto de 0 y detiene el pipeline.
- En la avería 5, Jenkins puede dar error de variable no definida en lugar de imprimir vacío.

Terminar restaurando el pipeline correcto.

## Ejercicio 6. Reto de ampliación

Para quien termine antes, o para hacer todos si sobra tiempo. Elegir uno:

- **Reto A, `archiveArtifacts`:** añadir en `post { success { ... } }` la línea `archiveArtifacts artifacts: 'build/*.txt'` y localizar el fichero descargable en la página del build.
- **Reto B, limpieza:** añadir `cleanWs()` en `post { cleanup { ... } }` y comprobar que el workspace queda vacío al terminar.
- **Reto C, más stages:** simular `Test` y `Empaquetar` (con `echo` y `sleep`), y hacer que `Test` falle solo si `BUILD_NUMBER` es impar (pista: `sh 'exit $((BUILD_NUMBER % 2))'`).

## Pipeline final de referencia (solución)

```groovy
pipeline {
    agent any

    environment {
        APP_NAME    = 'laboratorio'
        APP_VERSION = '1.0.0'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Listar ficheros') {
            steps {
                sh 'pwd'
                sh 'ls -la'
            }
        }
        stage('Build') {
            steps {
                echo "Compilando ${APP_NAME} versión ${APP_VERSION}"
                echo "Build número ${BUILD_NUMBER} del job ${JOB_NAME}"
                sh 'mkdir -p build'
                sh 'sleep 3'
                sh 'echo "${APP_NAME}-${APP_VERSION} build ${BUILD_NUMBER}" > build/resultado.txt'
            }
        }
        stage('Verificar') {
            steps {
                sh 'ls -lh build'
                sh 'cat build/resultado.txt'
            }
        }
    }

    post {
        always {
            echo "Fin del build #${BUILD_NUMBER}"
        }
        success {
            echo 'Todo correcto'
        }
        failure {
            echo 'Ha fallado alguna etapa'
        }
    }
}
```

---

# Parte III. Cierre

## 1. Puesta en común

Cada pareja cuenta qué avería le costó más diagnosticar y cómo la resolvió.

## 2. Entregable

Cada alumno entrega:

- El `Jenkinsfile` final (copia del texto o enlace al repo).
- Una captura de la Stage View con un build correcto y otra con un build fallido.
- Respuesta breve a: ¿qué ocurre con los stages siguientes y con el bloque `post` cuando un stage falla?

## 3. Autoevaluación

- [ ] Mi pipeline tiene al menos 4 stages encadenados.
- [ ] Uso `environment` y al menos dos variables predefinidas.
- [ ] Tengo un bloque `post` con al menos dos condiciones.
- [ ] He provocado un fallo y sé explicar qué pasó.

## Rúbrica orientativa para el criterio a

| Nivel | Descripción |
|---|---|
| **Insuficiente** | El pipeline no llega a ejecutarse o no incluye checkout |
| **Suficiente** | Pipeline con checkout y al menos 3 stages que se ejecuta correctamente |
| **Bien** | Además usa `environment` y `post`, y explica el resultado en el Console Output |
| **Excelente** | Además provoca y diagnostica fallos, y entiende el orden de ejecución y el flujo ante errores |

---

[← Sesión 1](sesion1.md) · [Índice de la UT02](./) · [Sesión 3 →](sesion3.md)
