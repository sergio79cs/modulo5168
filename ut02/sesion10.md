[← Sesión 9](sesion9.md) · [Índice de la UT02](./) · [Sesión 11 →](sesion11.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 10 — Manejo de errores: detener el pipeline

Criterio RA2.d (parte 1)

Esta sesión es solo de teoría, con una demostración en pantalla que sigue el docente. No hay práctica individual: así no queda ningún ejercicio a medias durante las vacaciones.

## Objetivos de la sesión

Al terminar la sesión sabrás:

- Explicar qué es un error en un pipeline de Jenkins y cómo lo detecta la herramienta.
- Capturar el fallo de una etapa concreta con `try/catch` dentro de un bloque `script {}`.
- Detener el pipeline y marcarlo como fallido con `error(mensaje)`.
- Recopilar **qué error se ha producido** (mensaje, código de salida y salida del comando) en lugar de fallar de forma genérica.
- Reconocer los errores de diseño más frecuentes al gestionar fallos: tragarse el error, perder el motivo o dejar un pipeline en verde cuando algo ha salido mal.

## Cómo se organiza la sesión

1. Teoría (apartado 12.1): qué es un error, qué hace Jenkins por defecto, `try/catch`, `error()`, cómo recopilar el motivo y qué herramientas relacionadas existen.
2. Demostración en pantalla (apartado 12.2): se construye un pipeline paso a paso, primero sin gestión de errores, después con ella, y se provoca un fallo real al desplegar en Kubernetes.
3. Cierre (apartado 12.3): preguntas de comprensión para repasar lo visto.

## 12.1 Teoría

### 1. Por qué hay que gestionar los errores

Un pipeline de despliegue continuo no es un simple script: es software que construye imágenes, las publica y modifica entornos reales como un clúster de Kubernetes. Cuando una de esas operaciones falla, lo peor que puede ocurrir es que el pipeline siga adelante como si nada. Imagina que la construcción de la imagen falla y, aun así, la etapa siguiente intenta desplegar "la última imagen" que había: se despliega una versión que nadie ha revisado y el equipo cree que se ha desplegado la nueva.

Por eso, ante un fallo, un pipeline bien diseñado persigue dos objetivos:

- **Detenerse.** Las etapas posteriores dependen de las anteriores; si una falla, las siguientes no deben ejecutarse. Es el principio de *fallar rápido* (*fail fast*): cuanto antes se detecta el problema, menos daño hace y más barato es corregirlo.
- **Informar.** Debe quedar constancia de qué etapa ha fallado, con qué comando y por qué. Un pipeline que solo dice "ha fallado" obliga a repetir la ejecución y a adivinar. Un pipeline que dice "el despliegue ha fallado porque el espacio de nombres `produccion` no existe" permite corregirlo en un minuto.

Este segundo objetivo es el que pide el criterio RA2.d: no basta con detenerse, hay que **recopilar qué error se ha producido**.

Hay otros dos principios que acompañan a los anteriores y que veremos más adelante:

- **Un fallo nunca debe quedar oculto.** Si un pipeline termina en verde habiendo tenido un error, el equipo deja de fiarse de él.
- **El entorno no debe quedar a medias.** Si se ha creado algo temporal (un contenedor, un fichero, un recurso en Kubernetes) y la etapa falla, hay que poder limpiarlo.

### 2. Cómo detecta Jenkins que algo ha fallado

Jenkins no "entiende" los comandos que ejecutas: se limita a observar cómo terminan. Hay cuatro orígenes habituales de fallo.

**a) Código de salida de un comando de shell.** Todo programa de Linux, al terminar, devuelve un número llamado *código de salida* (*exit code*). La convención es sencilla: **0 significa éxito y cualquier otro número significa error**. El significado concreto del número depende de cada programa.

| Código | Significado habitual | Ejemplo |
| --- | --- | --- |
| 0 | Éxito | `kubectl apply` termina bien |
| 1 | Error general | `kubectl apply` con un manifiesto incorrecto; `grep` que no encuentra nada |
| 2 | Uso incorrecto o fichero inexistente | `ls /ruta/que/no/existe` |
| 126 | El comando existe pero no se puede ejecutar | Script sin permiso de ejecución |
| 127 | Comando no encontrado | Escribir `kubctl` en lugar de `kubectl` |

El código de la última orden ejecutada se puede consultar en una terminal con `echo $?`. Es muy útil para entender qué recibe Jenkins.

**b) El paso `sh`.** Cuando Jenkins ejecuta un comando con `sh`, comprueba el código de salida. Si es distinto de 0, el paso lanza una excepción del tipo `hudson.AbortException` con el mensaje `script returned exit code N`. Esa excepción es la que `try/catch` puede capturar. Ten en cuenta que Jenkins ejecuta los scripts de `sh` con las opciones `-xe`: la opción `-x` imprime cada comando precedido de `+` (por eso ves esas líneas en el log) y la opción `-e` detiene el script en el primer comando que falla.

**c) Excepciones de Groovy.** Un error en el propio Jenkinsfile (usar una variable que no existe, llamar a un método inexistente, un tipo de dato incorrecto) también produce una excepción y detiene el pipeline.

**d) Pasos propios de Jenkins.** Otros pasos fallan por su cuenta: `checkout` si no encuentra el repositorio, `readFile` si el fichero no existe, `timeout` si se supera el tiempo límite, o `waitForQualityGate` si el análisis de calidad no se supera.

La ejecución completa termina con uno de estos **resultados**:

| Resultado | Significado | Color en la interfaz |
| --- | --- | --- |
| `SUCCESS` | Todo ha ido bien | Verde |
| `UNSTABLE` | Ha terminado, pero algo no es del todo correcto (por ejemplo, fallan algunas pruebas) | Amarillo |
| `FAILURE` | Ha fallado una etapa y el pipeline se ha detenido | Rojo |
| `ABORTED` | Alguien lo ha cancelado a mano o se ha agotado un tiempo límite | Gris |
| `NOT_BUILT` | La ejecución no ha llegado a realizarse | Gris |

Los resultados tienen un orden de gravedad: Jenkins permite empeorar el resultado de una ejecución, pero no mejorarlo. Por eso, si una etapa pone el resultado en `FAILURE`, ninguna etapa posterior puede dejarlo en `SUCCESS`.

### 3. Qué hace Jenkins por defecto cuando no gestionas nada

Antes de añadir nada conviene saber que Jenkins ya se detiene por sí solo. Si dentro de una etapa un comando `sh` devuelve un código distinto de 0 y no hay ningún `try/catch`:

1. El paso `sh` lanza la excepción.
2. La etapa se marca como fallida y **las etapas siguientes no se ejecutan**.
3. Se ejecuta el bloque `post` si existe (se verá al final de la teoría).
4. La ejecución termina con el resultado `FAILURE`.

En el log de la consola se ve así:

```
+ ls /ruta/que/no/existe
ls: cannot access '/ruta/que/no/existe': No such file or directory
ERROR: script returned exit code 2
Finished: FAILURE
```

Entonces, si Jenkins ya se detiene, **¿para qué sirve gestionar el error?** Para cuatro cosas que Jenkins no hace por ti:

- **Añadir información.** El mensaje por defecto (`script returned exit code 2`) dice que algo falló, pero no qué etapa, qué objetivo ni cuál fue el motivo.
- **Actuar sobre ese fallo concreto.** Por ejemplo, guardar la salida del comando como evidencia o limpiar un recurso temporal.
- **Decidir según el tipo de error.** No es lo mismo un fallo al construir que un fallo al desplegar.
- **Traducir el error técnico** a un mensaje que entienda quien lee el log sin ser quien escribió el pipeline.

En resumen: detenerse lo hace Jenkins; **explicar qué ha pasado lo tienes que programar tú**.

### 4. `try/catch/finally` en un bloque `script {}`

En un pipeline declarativo, dentro de `steps {}` solo se pueden usar pasos de Jenkins (`sh`, `echo`, `checkout`…). Las estructuras de programación de Groovy, como `try/catch` o `if`, necesitan un bloque `script {}`, que es la zona donde se puede escribir código Groovy libre.

La estructura es siempre la misma:

```groovy
script {
    try {
        // Lo que puede fallar
    } catch (err) {
        // Qué hacer si falla
    } finally {
        // Lo que se ejecuta siempre, haya fallo o no
    }
}
```

Funciona así:

1. Se ejecuta el código del `try`, línea a línea.
2. Si todo va bien, el `catch` se ignora.
3. Si algún paso lanza una excepción, **el `try` se interrumpe en ese punto** (no se ejecutan las líneas siguientes) y se salta al `catch`.
4. El `finally`, si existe, se ejecuta en ambos casos.

La variable `err` (puede llamarse como quieras, `e`, `ex`, `error`…) contiene la excepción capturada. Hay dos formas de convertirla en texto, y no son equivalentes:

| Expresión | Qué devuelve | Ejemplo para un `sh` que ha fallado |
| --- | --- | --- |
| `${err}` | Tipo de excepción y mensaje | `hudson.AbortException: script returned exit code 1` |
| `${err.getMessage()}` | Solo el mensaje | `script returned exit code 1` |

Para los mensajes del log suele ser más legible `getMessage()`; el tipo de excepción es útil cuando se quiere distinguir un tipo de fallo de otro.

**Buenas prácticas con `try`:**

- Pon dentro del `try` solo lo que puede fallar y que quieres tratar. Si metes toda la etapa, el `catch` captura fallos que no esperabas y el mensaje deja de ser fiable.
- Usa `finally` para la limpieza de recursos temporales (ficheros, contenedores de prueba, espacios de nombres creados para una prueba). Es el único bloque que se ejecuta con seguridad en los dos casos.

**La trampa más habitual: capturar y no detener.** Observa este código:

```groovy
script {
    try {
        sh 'kubectl apply -f deployment-resolved.yaml'
    } catch (err) {
        echo "Ha habido un error: ${err}"
    }
}
```

Parece correcto, pero tiene un fallo grave. Al capturar la excepción, Jenkins considera que el problema ya está tratado. El `echo` se ejecuta, la etapa termina sin problemas, **las etapas siguientes se ejecutan y la ejecución termina en `SUCCESS`**. El resultado es un pipeline en verde que oculta un despliegue fallido. Es peor que no tener `try/catch`, porque antes al menos Jenkins se paraba solo.

Regla de oro: **si capturas un error para añadir información, tienes que volver a detener el pipeline**. Hay dos formas de hacerlo:

- `error("mensaje")`, que crea un error nuevo con el mensaje que tú decidas (la opción de esta sesión).
- `throw err`, que vuelve a lanzar la excepción original sin cambiarla. Es útil cuando solo quieres dejar un rastro y no te importa el mensaje.

Hay un motivo adicional para relanzar. Un aborto manual (alguien pulsa el botón de cancelar) o un `timeout` también llegan al `catch` como excepciones. Si se tragan, el pipeline sigue cuando alguien ha pedido que se detenga.

### 5. `error(mensaje)`: detener el pipeline y marcarlo como fallido

`error` es un paso de Jenkins que hace tres cosas a la vez:

1. **Detiene la ejecución** de la etapa y del pipeline.
2. **Marca la ejecución como fallida** (`FAILURE`).
3. **Escribe el mensaje en el log** con el prefijo `ERROR:`, de forma que sea fácil de localizar.

En la consola se ve así:

```
ERROR: Pipeline detenido por error de despliegue: script returned exit code 1
Finished: FAILURE
```

Conviene distinguirlo de otras formas de "hacer ruido" o de parar:

| Instrucción | ¿Escribe en el log? | ¿Detiene el pipeline? | ¿Marca `FAILURE`? |
| --- | --- | --- | --- |
| `echo "mensaje"` | Sí | No | No |
| `error("mensaje")` | Sí, con `ERROR:` | Sí | Sí |
| `throw new Exception("mensaje")` | Sí, con una traza larga | Sí | Sí |
| `currentBuild.result = 'FAILURE'` | No | No | Sí, pero el pipeline sigue |

De la tabla salen dos conclusiones. La primera es que `echo` solo informa: sirve para dejar el detalle en el log, pero por sí solo no detiene nada. La segunda es que `currentBuild.result = 'FAILURE'` **no detiene el pipeline**, solo cambia la etiqueta final, y por tanto las etapas siguientes se ejecutarían. Si después se llama a `error()`, esa asignación es redundante, porque `error()` ya deja el resultado en `FAILURE`.

`error()` también es útil **sin `try/catch`**, para validar condiciones antes de empezar a trabajar. Es otra aplicación de *fail fast*:

```groovy
script {
    if (!fileExists('deployment-resolved.yaml')) {
        error('No se encuentra deployment-resolved.yaml: la etapa de render no se ha ejecutado')
    }
}
```

Así el fallo ocurre con un mensaje que dice exactamente qué falta, en lugar de un `kubectl` que protesta más adelante con un mensaje más difícil de interpretar.

Una última precisión: al llamar a `error()` dentro de un `catch` se **sustituye** la excepción original por una nueva. El detalle de la excepción original se pierde si no lo has registrado antes. Por eso el orden correcto dentro del `catch` es: primero recopilar y escribir la información, y al final llamar a `error()`.

### 6. Recopilar qué error se ha producido

El criterio RA2.d pide algo más que detener el pipeline: pide **saber y dejar registrado qué ha ocurrido**. Un buen registro de error responde a seis preguntas, y cada una se obtiene de un lugar distinto:

| Pregunta | Ejemplo de respuesta | Cómo se obtiene |
| --- | --- | --- |
| ¿En qué etapa ha fallado? | `Aplicar despliegue` | `env.STAGE_NAME` |
| ¿Qué dice Jenkins del fallo? | `script returned exit code 1` | `err.getMessage()` |
| ¿Qué código de salida ha devuelto el comando? | `1` | `sh(script: '...', returnStatus: true)` |
| ¿Qué dijo el propio comando? | `namespaces "produccion" not found` | Redirigir la salida a un fichero y leerlo con `readFile` |
| ¿De qué ejecución se trata? | Número de ejecución, trabajo, enlace | `env.BUILD_NUMBER`, `env.JOB_NAME`, `env.BUILD_URL` |
| ¿Qué evidencia queda guardada? | El fichero `apply.log` descargable | `archiveArtifacts` |

La fila más importante es la cuarta. El mensaje de la excepción (`err.getMessage()`) solo cuenta que el comando devolvió un código distinto de 0. **El motivo real lo escribe el propio comando** (`kubectl`, `docker`, `npm`…) por su salida de error, y esa información no llega a la variable `err`. Si no se guarda, el "qué" se pierde, o queda enterrado entre cientos de líneas del log.

Hay tres técnicas para capturar esa salida:

| Técnica | Cómo se escribe | Ventajas | Inconvenientes |
| --- | --- | --- | --- |
| A. Redirigir a un fichero | `sh 'comando > salida.log 2>&1'` y después `readFile('salida.log')` | Captura mensajes normales y de error juntos; el fichero se puede archivar | Hay que volver a imprimir el fichero si se quiere ver en el log |
| B. Obtener el código de salida | `def codigo = sh(script: 'comando', returnStatus: true)` | `sh` no lanza excepción: decides tú qué hacer según el número | Hay que comprobar `codigo != 0` a mano; no da el motivo por sí solo |
| C. Obtener la salida estándar | `def texto = sh(script: 'comando', returnStdout: true)` | Devuelve el texto como variable | Solo recoge la salida estándar; los errores de `kubectl` salen por la salida de error y no se capturan |

En esta sesión usaremos la **técnica A**, que es la única de las tres que recoge el mensaje de error del comando, y la **B** como alternativa cuando se quiere actuar según el código.

La redirección `> fichero 2>&1` se lee así: `> fichero` envía la salida normal (flujo 1) al fichero, y `2>&1` envía la salida de error (flujo 2) al mismo sitio que el flujo 1. El orden importa: debe escribirse `> fichero 2>&1`, no al revés.

La técnica B tiene este aspecto:

```groovy
script {
    def codigo = sh(script: 'kubectl apply -f deployment-resolved.yaml > apply.log 2>&1',
                    returnStatus: true)
    if (codigo != 0) {
        echo "kubectl ha devuelto el código ${codigo}"
        echo readFile('apply.log')
        error("Despliegue detenido (código de salida ${codigo})")
    }
}
```

Aquí no hay `try/catch`, porque con `returnStatus: true` el paso `sh` nunca lanza la excepción. Es otra forma válida de conseguir lo mismo, y tiene la ventaja de que se ve el número exacto.

### 7. Trampa frecuente: las tuberías (`|`) ocultan los errores

Mucha gente intenta guardar la salida de un comando y a la vez verla en pantalla con `tee`:

```groovy
sh 'kubectl apply -f deployment-resolved.yaml 2>&1 | tee apply.log'
```

Es una mala idea en Jenkins. En una tubería de shell, **el código de salida es el del último comando**, es decir, el de `tee`, que casi siempre termina bien. Aunque `kubectl` falle, el paso `sh` verá un 0, no lanzará excepción y el pipeline continuará en verde. Puedes comprobarlo en cualquier terminal:

```
$ ls /no-existe 2>&1 | tee salida.txt
ls: cannot access '/no-existe': No such file or directory
$ echo $?
0
```

La solución en Bash es la opción `pipefail`, que hace que la tubería devuelva el primer código distinto de 0:

```
$ bash -c 'set -o pipefail; ls /no-existe 2>&1 | tee salida.txt; echo $?'
ls: cannot access '/no-existe': No such file or directory
2
```

Pero en Jenkins, `sh` usa por defecto `/bin/sh`, que según el sistema puede no ser Bash y no admitir `pipefail`. Para evitar problemas, en esta unidad **se redirige a un fichero en lugar de usar tuberías** y se muestra el fichero después con `readFile`/`echo`.

### 8. Patrón completo recomendado

Juntando todo lo anterior, así queda la etapa de despliegue con gestión de errores:

```groovy
stage('Aplicar despliegue') {
    steps {
        script {
            try {
                sh 'kubectl apply -f deployment-resolved.yaml > apply.log 2>&1'
                echo readFile('apply.log')
            } catch (err) {
                def salida = fileExists('apply.log') ? readFile('apply.log').trim() : '(no hay salida registrada)'
                echo "ERROR en la etapa '${env.STAGE_NAME}' (ejecución nº ${env.BUILD_NUMBER})"
                echo "Motivo según Jenkins: ${err.getMessage()}"
                echo "Salida de kubectl:\n${salida}"
                error("Despliegue detenido: ${err.getMessage()}. Detalle en apply.log")
            } finally {
                archiveArtifacts artifacts: 'apply.log', allowEmptyArchive: true
            }
        }
    }
}
```

Análisis línea a línea:

| Parte | Qué hace | Por qué está ahí |
| --- | --- | --- |
| `sh '... > apply.log 2>&1'` | Ejecuta `kubectl` y guarda todo en `apply.log` | Para tener el mensaje de error del comando |
| `echo readFile('apply.log')` | Muestra el fichero en el log si todo ha ido bien | Al redirigir, la salida ya no aparece sola en la consola |
| `fileExists(...) ? ... : ...` | Lee el fichero solo si existe | Si el fallo ocurre antes de crearlo, `readFile` daría un segundo error |
| `env.STAGE_NAME`, `env.BUILD_NUMBER` | Indican etapa y ejecución | Para localizar el fallo sin ambigüedad |
| `err.getMessage()` | El motivo según Jenkins | Deja constancia del código de salida |
| `echo "Salida de kubectl..."` | Escribe el motivo real | Es el "qué" que exige el criterio |
| `error(...)` | Detiene y marca `FAILURE` | **Va la última dentro del `catch`**, después de registrar todo |
| `finally { archiveArtifacts ... }` | Guarda `apply.log` como evidencia | Se ejecuta con éxito o con fallo |

Un buen mensaje de error cumple esta lista: indica **qué etapa** falló, **qué se intentaba hacer**, **qué respuesta dio el comando** y **dónde se puede ver más detalle**. Si alguien que no ha escrito el pipeline puede entender el fallo solo con leer el log, el mensaje es bueno.

### 9. Otras herramientas de Jenkins relacionadas con los errores

`try/catch` y `error()` no son las únicas piezas de Jenkins para tratar fallos. Se mencionan aquí para que sepas que existen y para que no las confundas; hoy no se practican.

| Herramienta | Para qué sirve | Diferencia con `try/catch` + `error()` |
| --- | --- | --- |
| `post { failure { ... } }` | Ejecutar acciones al final de una etapa o del pipeline según su resultado (`always`, `success`, `failure`, `unstable`…) | `post` reacciona al resultado final, sin saber en qué línea ocurrió el fallo. `try/catch` actúa en un punto concreto y puede recoger datos de ese momento |
| `catchError { ... }` | Capturar el fallo de un bloque, marcar el resultado que elijas y **continuar** con las etapas siguientes | `error()` detiene el pipeline; `catchError` permite seguir adelante |
| `unstable("mensaje")` | Marcar la ejecución como `UNSTABLE` sin detenerla | Para fallos que no justifican parar, como algunas pruebas que no son críticas |
| `retry(n) { ... }` | Repetir un bloque hasta n veces si falla | Adecuado para fallos pasajeros, como una red inestable |
| `timeout(time: n, unit: 'MINUTES') { ... }` | Abortar un bloque si tarda más del límite | Evita pipelines colgados indefinidamente |

Un ejemplo de `post`, que se suele combinar con lo visto hoy:

```groovy
post {
    failure {
        echo "El trabajo ${env.JOB_NAME} ha fallado en la ejecución nº ${env.BUILD_NUMBER}"
    }
}
```

El bloque `post` va al final del pipeline, al mismo nivel que `stages`. Se ejecuta siempre al terminar, y el bloque `failure` solo lo hace si el resultado es `FAILURE`. Por eso sigue ejecutándose aunque `error()` haya detenido las etapas.

La elección entre estas herramientas depende de la pregunta que te hagas:

- ¿Este fallo debe parar todo? Usa `error()`.
- ¿Este fallo es tolerable pero quiero que quede registrado? Usa `catchError` o `unstable`.
- ¿Puede ser un fallo pasajero? Usa `retry`.
- ¿Quiero actuar al final sea cual sea el resultado? Usa `post`.

### 10. Errores frecuentes al gestionar fallos

| Error | Qué ocurre | Cómo evitarlo |
| --- | --- | --- |
| `catch` que solo hace `echo` | El pipeline sigue y termina en `SUCCESS` con un fallo oculto | Terminar siempre el `catch` con `error()` o `throw err` |
| Usar solo `currentBuild.result = 'FAILURE'` | Las etapas siguientes se ejecutan igualmente | Usar `error()`, que ya deja el resultado en `FAILURE` |
| Llamar a `error()` y escribir código debajo | Ese código nunca se ejecuta, porque `error()` interrumpe el bloque | Registrar primero y llamar a `error()` en último lugar |
| Redirigir con `\| tee` sin `pipefail` | El código de salida es el de `tee` y el fallo pasa desapercibido | Redirigir a un fichero con `> fichero 2>&1` |
| Mensaje genérico ("Error", "Algo ha fallado") | No se sabe qué etapa ni por qué | Incluir etapa, comando y salida del comando |
| Meter toda la etapa dentro del `try` | El `catch` captura fallos no previstos y el mensaje engaña | Limitar el `try` al comando que puede fallar |
| `try/catch` fuera de `script {}` en un pipeline declarativo | Error de sintaxis en el Jenkinsfile antes de empezar | Escribirlo siempre dentro de `script {}` |
| Mensaje con comillas simples (`'Error: ${err}'`) | Groovy no interpola la variable y se imprime el texto literal `${err}` | Usar comillas dobles cuando haya variables |
| Leer un fichero que puede no existir | `readFile` lanza un segundo error que tapa el original | Comprobar antes con `fileExists` |
| Volcar variables o ficheros completos al log | Pueden aparecer contraseñas o tokens en un log visible para todos | Escribir solo lo necesario y no imprimir credenciales |

### Ideas clave de la teoría

- Jenkins se detiene por sí solo cuando un comando falla; el trabajo del programador es **explicar qué ha pasado**.
- `try/catch` captura el fallo de una etapa concreta y necesita un bloque `script {}`.
- Capturar un error **sin volver a detener el pipeline** lo deja en verde y oculta el problema.
- `error(mensaje)` detiene el pipeline, lo marca como fallido y escribe el mensaje en el log.
- El motivo real del fallo está en la salida del comando, no en la excepción: hay que guardarla (`> fichero 2>&1`) y mostrarla.
- Dentro del `catch`, primero se registra la información y al final se llama a `error()`.

## 12.2 Demostración en pantalla

Esta demostración la realiza el docente en su Jenkins del laboratorio y el alumnado la sigue en pantalla. No hay que reproducirla en el ordenador de cada uno. Se construye un mismo pipeline en cuatro versiones, cada una corrige un problema de la anterior, y al final se provoca un fallo real al desplegar en Kubernetes.

### Preparación

- Jenkins del laboratorio en marcha y con sesión iniciada.
- Un trabajo nuevo de tipo **Pipeline** llamado `ut02-s10-errores`. En su configuración, en el apartado **Pipeline**, se elige **Pipeline script** (el script se escribe directamente en la interfaz, sin repositorio).
- Para la parte B, `kubectl` accesible desde Jenkins y un clúster Minikube en marcha. La parte A no necesita Kubernetes.

En cada versión se sustituye todo el contenido del campo **Script**, se pulsa **Guardar** y después **Construir ahora**. El resultado se estudia en **Console Output** (el log completo) y en la vista de etapas del trabajo.

### Parte A. El mecanismo, con un fallo sencillo

#### Paso 1. Pipeline sin gestión de errores

Pega este script. La segunda etapa intenta listar una carpeta que no existe:

```groovy
pipeline {
    agent any
    stages {
        stage('Preparar') {
            steps { echo 'Preparando...' }
        }
        stage('Etapa que falla') {
            steps { sh 'ls /ruta/que/no/existe' }
        }
        stage('Etapa posterior') {
            steps { echo 'Esta etapa no debería ejecutarse' }
        }
    }
}
```

Lanza la ejecución. Salida esperada en **Console Output**, al final:

```
+ ls /ruta/que/no/existe
ls: cannot access '/ruta/que/no/existe': No such file or directory
ERROR: script returned exit code 2
Finished: FAILURE
```

Qué observar:

- La etapa `Preparar` aparece en verde, `Etapa que falla` en rojo y `Etapa posterior` no se ha ejecutado.
- Jenkins se ha detenido por sí solo y ha marcado `FAILURE`, sin que hayamos programado nada.
- El mensaje `script returned exit code 2` solo dice que hubo un fallo; no dice qué intentaba hacer la etapa ni por qué falló.

#### Paso 2. La trampa: capturar sin detener

Cambia únicamente la etapa `Etapa que falla` por esta:

```groovy
        stage('Etapa que falla') {
            steps {
                script {
                    try {
                        sh 'ls /ruta/que/no/existe'
                    } catch (err) {
                        echo "Ha habido un error: ${err}"
                    }
                }
            }
        }
```

Salida esperada:

```
+ ls /ruta/que/no/existe
ls: cannot access '/ruta/que/no/existe': No such file or directory
Ha habido un error: hudson.AbortException: script returned exit code 2
...
Esta etapa no debería ejecutarse
Finished: SUCCESS
```

Qué observar:

- **Todas las etapas salen en verde y el resultado es `SUCCESS`**, a pesar de que un comando ha fallado.
- La etapa que decíamos que no debía ejecutarse sí se ha ejecutado.
- Pregunta para el grupo: ¿es aceptable este resultado en un pipeline de despliegue? ¿Qué pasaría si esa etapa fuese `Desplegar`?

#### Paso 3. Capturar, informar y detener

Cambia el bloque `catch` para que llame a `error()`:

```groovy
                    } catch (err) {
                        echo "ERROR en la etapa '${env.STAGE_NAME}': ${err.getMessage()}"
                        error("Pipeline detenido: ${err.getMessage()}")
                    }
```

Salida esperada:

```
ls: cannot access '/ruta/que/no/existe': No such file or directory
ERROR en la etapa 'Etapa que falla': script returned exit code 2
ERROR: Pipeline detenido: script returned exit code 2
Finished: FAILURE
```

Qué observar:

- Vuelve a haber una etapa roja y una etapa posterior sin ejecutar: el pipeline se ha detenido.
- Ahora el log dice en qué etapa ha ocurrido.
- Queda un problema: el motivo real (`No such file or directory`) solo está en una línea de la salida del comando, no en nuestro mensaje. Con un log largo sería difícil de encontrar. La parte B lo resuelve.

### Parte B. Un fallo real: desplegar en un espacio de nombres que no existe

#### Paso 4. Comprobar que Kubernetes responde

Antes de seguir, desde la terminal del laboratorio comprueba que el clúster está activo:

```
$ kubectl get nodes
```

El nodo debe aparecer en estado `Ready`. Si este comando falla, la parte B no se puede hacer y se pasa directamente al cierre.

#### Paso 5. Pipeline que despliega, con el patrón completo

Sustituye todo el script por este. La primera etapa genera un manifiesto que apunta a un espacio de nombres (`namespace`) que todavía no hemos creado, y la segunda lo aplica con el patrón de la teoría:

```groovy
pipeline {
    agent any
    stages {
        stage('Preparar manifiesto') {
            steps {
                writeFile file: 'deployment-resolved.yaml', text: '''apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-errores
  namespace: demo-errores
spec:
  replicas: 1
  selector:
    matchLabels:
      app: demo-errores
  template:
    metadata:
      labels:
        app: demo-errores
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
'''
            }
        }
        stage('Aplicar despliegue') {
            steps {
                script {
                    try {
                        sh 'kubectl apply -f deployment-resolved.yaml > apply.log 2>&1'
                        echo readFile('apply.log')
                    } catch (err) {
                        def salida = fileExists('apply.log') ? readFile('apply.log').trim() : '(no hay salida registrada)'
                        echo "ERROR en la etapa '${env.STAGE_NAME}' (ejecución nº ${env.BUILD_NUMBER})"
                        echo "Motivo según Jenkins: ${err.getMessage()}"
                        echo "Salida de kubectl:\n${salida}"
                        error("Despliegue detenido: ${err.getMessage()}. Detalle en apply.log")
                    } finally {
                        archiveArtifacts artifacts: 'apply.log', allowEmptyArchive: true
                    }
                }
            }
        }
        stage('Etapa posterior') {
            steps { echo 'Despliegue aplicado correctamente' }
        }
    }
}
```

Lanza la ejecución. Salida esperada (el texto exacto de `kubectl` puede variar ligeramente según su versión):

```
ERROR en la etapa 'Aplicar despliegue' (ejecución nº 4)
Motivo según Jenkins: script returned exit code 1
Salida de kubectl:
Error from server (NotFound): error when creating "deployment-resolved.yaml": namespaces "demo-errores" not found
ERROR: Despliegue detenido: script returned exit code 1. Detalle en apply.log
Finished: FAILURE
```

Qué observar:

- Ahora el log contiene el **qué**: etapa, ejecución, motivo según Jenkins y, sobre todo, la frase de `kubectl` que explica la causa (`namespaces "demo-errores" not found`).
- La etapa `Etapa posterior` no se ha ejecutado.
- En la página de la ejecución aparece el fichero `apply.log` como artefacto archivado: queda como evidencia descargable.
- Compara con el paso 1: la información es la misma que Jenkins tenía, pero ordenada y completa.

#### Paso 6. Corregir la causa y repetir

El mensaje indica qué falta. Crea el espacio de nombres desde la terminal del laboratorio, sin tocar el pipeline:

```
$ kubectl create namespace demo-errores
namespace/demo-errores created
```

Vuelve a pulsar **Construir ahora**. Esta vez el log mostrará:

```
deployment.apps/demo-errores created
Despliegue aplicado correctamente
Finished: SUCCESS
```

Si se quiere comprobar en el clúster:

```
$ kubectl get pods -n demo-errores
```

El pod puede tardar unos instantes en pasar a `Running`, ya que debe descargar la imagen.

#### Paso 7. Validar antes de actuar con `error()`

Para terminar, se muestra la validación rápida de la teoría. Añade, entre las etapas `Preparar manifiesto` y `Aplicar despliegue`, esta etapa nueva:

```groovy
        stage('Validar manifiesto') {
            steps {
                script {
                    if (!fileExists('deployment-resolved.yaml')) {
                        error('No se encuentra deployment-resolved.yaml: la etapa de preparación no lo ha generado')
                    }
                }
            }
        }
```

Con el fichero presente, la etapa pasa en verde. Para ver el fallo, cambia temporalmente en la primera etapa `file: 'deployment-resolved.yaml'` por `file: 'otro-nombre.yaml'` y lanza de nuevo:

```
ERROR: No se encuentra deployment-resolved.yaml: la etapa de preparación no lo ha generado
Finished: FAILURE
```

El pipeline se detiene antes de llegar a `kubectl`, con un mensaje que señala exactamente la causa.

#### Paso 8. Limpieza

Para dejar el laboratorio como estaba:

```
$ kubectl delete namespace demo-errores
namespace "demo-errores" deleted
```

### Qué se ha demostrado

| Versión | Resultado | Lección |
| --- | --- | --- |
| Paso 1: sin gestión | `FAILURE` con mensaje pobre | Jenkins se detiene solo, pero informa poco |
| Paso 2: `catch` sin `error()` | `SUCCESS` con un fallo oculto | Capturar sin detener es peor que no capturar |
| Paso 3: `catch` con `error()` | `FAILURE` con la etapa indicada | Detener y marcar como fallido |
| Paso 5: patrón completo | `FAILURE` con la causa real y evidencia | Se recopila **qué** ha ocurrido |
| Paso 7: validación previa | `FAILURE` antes de ejecutar nada | `fail fast` con mensaje claro |

### Problemas que pueden aparecer durante la demostración

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `kubectl: not found` (código 127) | Jenkins no tiene `kubectl` instalado | Es un fallo real: el patrón lo recoge y sirve de ejemplo. Para la parte B hace falta el Jenkins del laboratorio con `kubectl` |
| `The connection to the server ... was refused` | Jenkins no tiene configurado el acceso al clúster | Revisar el `kubeconfig` que usa Jenkins en el laboratorio |
| `Scripts not permitted to use method ...` | La sandbox de Groovy bloquea algo del script | No es un error del pipeline: quitar esa instrucción o usar solo las del ejemplo |
| La etapa `Etapa posterior` también falla | Quedó un `catch` que no detiene el pipeline o un error al copiar | Revisar que `error(...)` es la última instrucción del `catch` |
| El paso 6 sigue dando error | El espacio de nombres no se ha creado en el clúster que usa Jenkins | Comprobar con `kubectl get namespaces` |

## 12.3 Cierre y preguntas de comprensión

Responde a estas preguntas, primero por tu cuenta y después en común. Sirven para repasar los conceptos antes de las vacaciones.

1. Un comando `sh` devuelve el código de salida 2 y no hay ningún `try/catch`. ¿Qué ocurre con la etapa, con las etapas siguientes y con el resultado final?
2. Un `catch` contiene solo `echo "Ha habido un error: ${err}"`. ¿Por qué es peor que no escribir `try/catch`?
3. ¿En qué se diferencian `echo`, `error()` y `currentBuild.result = 'FAILURE'`?
4. ¿Por qué `err.getMessage()` no basta para saber por qué ha fallado `kubectl apply`? ¿Cómo se consigue el motivo real?
5. ¿Qué problema tiene `kubectl apply -f x.yaml 2>&1 | tee apply.log` dentro de un `sh`, y cómo se evita?
6. ¿Por qué `error()` debe ser la última instrucción de un `catch`?
7. Elige la herramienta más adecuada (`error`, `catchError`, `unstable`, `retry`, `post`) para cada caso:
    - a) Una descarga falla de vez en cuando por problemas de red.
    - b) Fallan unas pruebas no críticas, pero el despliegue puede continuar.
    - c) Quieres escribir un aviso al terminar solo si el pipeline ha fallado.
    - d) Falta un fichero imprescindible y no tiene sentido continuar.

### Respuestas

1. El paso `sh` lanza una excepción y la etapa queda en rojo. Las etapas siguientes no se ejecutan (se ejecuta el bloque `post`, si existe). El resultado final es `FAILURE`.
2. Porque al capturar la excepción Jenkins considera el problema tratado: las etapas siguientes se ejecutan y el resultado es `SUCCESS`. Se pierde la parada y el fallo queda oculto.
3. `echo` solo escribe en el log. `error()` escribe el mensaje con `ERROR:`, detiene el pipeline y lo marca como `FAILURE`. `currentBuild.result = 'FAILURE'` solo cambia el resultado final, pero no detiene nada: las etapas siguientes se ejecutan.
4. Porque solo contiene el mensaje de Jenkins (`script returned exit code 1`). El motivo real lo escribe `kubectl` en su salida. Se obtiene redirigiendo la salida a un fichero (`> apply.log 2>&1`) y leyendo ese fichero con `readFile` dentro del `catch`.
5. El código de salida de una tubería es el del último comando (`tee`), que suele ser 0, por lo que el fallo de `kubectl` pasa desapercibido. Se evita redirigiendo a un fichero en lugar de usar tuberías, o usando Bash con `pipefail`.
6. Porque `error()` interrumpe el bloque: cualquier instrucción escrita después no se ejecuta. Hay que registrar toda la información antes.
7. a) `retry`. b) `unstable` (o `catchError` con resultado `UNSTABLE`). c) `post { failure { ... } }`. d) `error()`.

---

[← Sesión 9](sesion9.md) · [Índice de la UT02](./) · [Sesión 11 →](sesion11.md)
