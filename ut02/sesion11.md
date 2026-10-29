[← Sesión 10](sesion10.md) · [Índice de la UT02](./)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 11 — Destrucción de objetos intermedios

Jueves 7 de enero · Criterio RA2.d (parte 2, práctica) · Primera sesión tras las vacaciones de Navidad

En la sesión 10 aprendiste a detener un pipeline cuando una etapa falla y a recoger qué error se ha producido. Hoy das el paso siguiente: cuando el pipeline se detiene, **no puede dejar el clúster lleno de restos**. Esta sesión es práctica: provocarás un fallo intencionado en un despliegue de Kubernetes y harás que el pipeline deshaga lo que ya había creado.

## Objetivos de la sesión

Al terminar la sesión sabrás:

- Explicar qué son los **objetos intermedios** de un despliegue y por qué pueden quedar a medio crear cuando un pipeline falla.
- Provocar un fallo controlado en un despliegue de Kubernetes con una plantilla inválida.
- Ampliar el manejo de errores de la sesión 10 para que el pipeline **destruya los objetos ya creados** en esa ejecución.
- Usar `kubectl delete -f ... --ignore-not-found` y entender por qué esa opción hace la limpieza segura.
- Comprobar con `kubectl` que no queda ningún recurso huérfano, sabiendo qué muestra y qué no muestra cada comando de consulta.
- Reconocer los riesgos de una limpieza mal diseñada: borrar lo que ya existía antes o fallar durante la propia limpieza.

## Cómo se organiza la sesión

1. **Recordatorio (apartado 13.1):** repaso de la teoría de la sesión 10 y los conceptos nuevos que necesitas para la práctica.
2. **Práctica (apartado 13.2):** se construye el pipeline paso a paso. Los pasos 1 a 3 son el núcleo y producen el entregable. Los pasos 4 y 5 son una ampliación para quien termine antes.
3. **Entregable y cierre (apartado 13.3):** qué hay que entregar, cómo se revisa, problemas frecuentes y preguntas de repaso.

## Antes de empezar

Necesitas lo mismo que en la sesión 10:

- Tu Jenkins del laboratorio en marcha y con sesión iniciada.
- `kubectl` accesible desde Jenkins y tu clúster Minikube activo. Comprueba desde la terminal del laboratorio que `kubectl get nodes` muestra el nodo en estado `Ready`.
- Tener a mano el pipeline de la sesión 10 (patrón completo con `try/catch`, `error()` y `apply.log`), porque hoy se amplía.

## 13.1 Recordatorio

### Lo que ya sabes de la sesión 10

| Concepto | Qué hay que recordar | Herramienta |
| --- | --- | --- |
| Jenkins se detiene solo | Un `sh` con código de salida distinto de 0 lanza una excepción, la etapa falla y las siguientes no se ejecutan | Comportamiento por defecto |
| Capturar un fallo | Solo se puede dentro de un bloque `script {}`; el `try` se interrumpe en la primera excepción | `try/catch/finally` |
| Detener y marcar como fallido | Escribe el mensaje con `ERROR:`, detiene el pipeline y deja el resultado en `FAILURE` | `error(mensaje)` |
| No ocultar el fallo | Un `catch` que solo hace `echo` deja el pipeline en verde con un fallo escondido | Terminar siempre con `error()` |
| Recopilar qué ha pasado | El motivo real lo escribe el comando; hay que guardarlo y mostrarlo | `> apply.log 2>&1` y `readFile` |
| Orden dentro del `catch` | Primero registrar la información, `error()` al final, porque interrumpe el bloque | Orden de las instrucciones |
| Las tuberías ocultan errores | El código de salida de `a \| b` es el de `b` | Redirigir a un fichero |

El patrón completo de la sesión 10 era este:

```groovy
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
```

### El problema que quedaba sin resolver

En la sesión 10 desplegabas **un solo objeto** (un `Deployment`). Si fallaba, no había nada que limpiar: el fallo ocurría antes de crear nada. Pero un despliegue real casi nunca es un solo objeto. Una aplicación necesita, como mínimo, un `ConfigMap` con su configuración, un `Deployment` con los pods y, normalmente, un `Service`. Esos objetos se aplican **uno detrás de otro**, y el fallo puede llegar a mitad de camino:

1. `kubectl apply` del `ConfigMap`: **correcto**, el objeto ya existe en el clúster.
2. `kubectl apply` del `Deployment`: **falla**, la plantilla es inválida.
3. El pipeline se detiene y se marca como fallido, tal como aprendiste.

El resultado es un pipeline en rojo, correcto desde el punto de vista de la sesión 10, pero con un `ConfigMap` suelto en el clúster que pertenece a un despliegue que nunca llegó a existir. Ese ConfigMap es un **objeto intermedio huérfano**. Hoy aprendes a evitarlo.

### Preguntas de arranque

Responde sin mirar los apuntes. Sirven para comprobar qué recuerdas antes de ampliar el patrón.

1. Un `catch` contiene solo `echo "Ha habido un error"`. ¿Cómo termina la ejecución y por qué es un problema?
2. ¿Por qué `err.getMessage()` no basta para saber por qué falló `kubectl`?
3. ¿Por qué `error()` va siempre en último lugar dentro del `catch`?
4. ¿Qué hace la redirección `> apply.log 2>&1`?
5. Si aplicas dos ficheros seguidos y falla el segundo, ¿qué ha pasado ya con el primero?

**Respuestas.**

1. Termina en `SUCCESS`, porque al capturar la excepción Jenkins considera el problema tratado. Las etapas siguientes se ejecutan y el fallo queda oculto.
2. Porque solo contiene el mensaje de Jenkins (`script returned exit code 1`). El motivo real lo escribe `kubectl` por su salida de error.
3. Porque `error()` interrumpe el bloque: lo que se escriba después no se ejecuta.
4. Envía la salida normal y la salida de error del comando al fichero `apply.log`.
5. Ya se ha aplicado y existe en el clúster. Kubernetes no deshace nada por sí solo. Esta es la pregunta que responde toda la sesión de hoy.

### Conceptos nuevos para la práctica

#### 1. Qué es un objeto intermedio

Un **objeto intermedio** es cualquier recurso que el pipeline crea en el clúster mientras el despliegue todavía no está completo. Se llama "intermedio" porque solo tiene sentido como parte de un conjunto: un `ConfigMap` sin el `Deployment` que lo usa no sirve para nada, y un `Service` sin pods detrás tampoco.

Un despliegue típico crea varios tipos de objetos, y cada uno tiene su papel:

| Objeto | Para qué sirve | Depende de |
| --- | --- | --- |
| `ConfigMap` | Guarda la configuración de la aplicación (variables, ficheros) | Nada |
| `Secret` | Guarda datos sensibles (contraseñas, tokens) | Nada |
| `PersistentVolumeClaim` | Reserva almacenamiento persistente | Nada |
| `Deployment` | Crea y mantiene los pods de la aplicación | El `ConfigMap` o el `Secret` que monte o lea |
| `Service` | Da una dirección estable para llegar a los pods | Los pods del `Deployment` |

La columna de dependencias marca el **orden de creación**: primero lo que no depende de nada, después lo que lo necesita. Ese mismo orden, al revés, es el **orden de destrucción**: se borra primero lo que depende de otros y al final aquello de lo que dependen. Por eso, al limpiar, el `Deployment` se elimina antes que el `ConfigMap`.

#### 2. Por qué Kubernetes no deshace nada por sí solo

En una base de datos, una transacción es **atómica**: o se aplican todos los cambios o no se aplica ninguno. Si algo falla a mitad, el sistema deshace lo hecho. Kubernetes no funciona así con `kubectl apply`:

- Cada objeto se envía al servidor de la API **por separado** y se acepta o se rechaza de forma independiente.
- No existe una operación de "deshacer todo lo de este `apply`".
- Aunque apliques una carpeta entera, o un fichero con varios objetos separados por `---`, se procesan **uno a uno**. Si falla el tercero, los dos primeros ya existen.
- `kubectl apply` devuelve un código de salida distinto de 0 si algún objeto falla, pero **no revierte los que sí se aplicaron**.

La consecuencia es directa: **la limpieza es responsabilidad del pipeline**. Si quieres que un despliegue fallido no deje restos, tienes que programarlo tú.

#### 3. Qué problemas causan los objetos huérfanos

Un objeto huérfano parece inofensivo, pero acumula problemas:

- **Recursos desperdiciados.** Pods atascados en `ImagePullBackOff` o `CrashLoopBackOff` consumen cuota del espacio de nombres; un volumen reservado ocupa almacenamiento.
- **Estado ambiguo.** Cuando alguien mira el clúster ya no sabe si el entorno está bien, a medias o roto. Hay que investigar para saberlo.
- **Interferencia con la siguiente ejecución.** Al repetir el despliegue, el objeto que sobró aparece como `unchanged` o `configured` en lugar de `created`. Eso confunde el diagnóstico y puede esconder que la configuración antigua sigue activa.
- **Tráfico a ninguna parte.** Un `Service` que apunta a pods que no existen provoca errores a quien intenta usar la aplicación.
- **Seguridad y coste.** Un `Secret` olvidado sigue guardando credenciales; en un clúster de nube, un recurso externo olvidado puede generar gasto.

#### 4. Estrategias para limpiar

Hay varias formas de evitar los restos. Cada una resuelve un caso distinto:

| Estrategia | Cómo funciona | Cuándo conviene | Riesgo o límite |
| --- | --- | --- | --- |
| **A. Borrar por fichero** | `kubectl delete -f fichero.yaml --ignore-not-found` para cada fichero aplicado | Despliegues sencillos con pocos ficheros. **Es la técnica de hoy** | Borra también lo que ya existía antes de la ejecución, si coincide el nombre |
| **B. Borrar por etiqueta** | Los objetos llevan una etiqueta con el identificador de la ejecución y se borran con `kubectl delete all,configmap -l etiqueta=valor` | Cuando se necesita precisión sobre qué se creó en cada ejecución | Hay que etiquetar todos los objetos y nombrar todos los tipos a borrar |
| **C. Espacio de nombres temporal** | Se crea un `namespace` propio de la ejecución y, si falla, se borra el `namespace` entero | Entornos de prueba o vistas previas | No sirve para un entorno con nombre fijo como `production`; borrar el namespace equivocado es destructivo |
| **D. Volver a la versión anterior** | `kubectl rollout undo deployment/nombre` | Cuando el `Deployment` ya existía y se ha actualizado | Solo cubre `Deployments`; un `ConfigMap` no guarda versiones |
| **E. Validar antes de aplicar** | `kubectl apply --dry-run=server -f fichero.yaml` comprueba el objeto contra el servidor sin guardarlo | Para detectar plantillas inválidas antes de tocar nada | Previene muchos fallos, pero no todos: un fallo puede llegar después |

La elección depende de tres preguntas:

- ¿El objeto **existía antes** de esta ejecución? Si sí, borrarlo destruye algo que funcionaba; lo adecuado es restaurar (D) o no tocarlo.
- ¿El nombre del objeto es **fijo** o cambia en cada ejecución? Con nombres fijos, el riesgo de A es mayor.
- ¿El entorno es de **pruebas** o estable? En pruebas, C es la opción más limpia.

Hoy se practica la estrategia A con un entorno de pruebas propio, que es lo que pide el criterio. En la ampliación se verá cómo reducir su principal riesgo.

### Anatomía del patrón de limpieza

El patrón de la práctica amplía el `catch` de la sesión 10 con la destrucción de los objetos. Su estructura base es esta:

```groovy
script {
    try {
        sh "kubectl apply -f configmap-resolved.yaml"
        sh "kubectl apply -f deployment-resolved.yaml"
    } catch (err) {
        echo "Fallo detectado, destruyendo objetos intermedios creados en esta ejecución..."
        sh "kubectl delete -f configmap-resolved.yaml --ignore-not-found"
        sh "kubectl delete -f deployment-resolved.yaml --ignore-not-found"
        error("Pipeline detenido y objetos intermedios eliminados: ${err}")
    }
}
```

Los elementos importantes son:

| Elemento | Qué hace | Por qué es importante |
| --- | --- | --- |
| Dos `kubectl apply` seguidos en el `try` | Crean primero el `ConfigMap` y después el `Deployment` | Si el segundo falla, el primero ya existe: es el objeto intermedio |
| `catch (err)` | Recibe el control cuando cualquiera de los dos falla | Es el único punto donde se sabe que el despliegue ha fallado |
| `kubectl delete -f fichero` | Borra los objetos que describe el fichero, identificándolos por tipo, nombre y espacio de nombres | Reutiliza los mismos ficheros que se aplicaron: no hay que listar los objetos a mano |
| `--ignore-not-found` | No da error si el objeto no existe | Cuando el fallo ocurre en el primer objeto, el segundo nunca se creó. Sin esta opción, borrar algo inexistente devolvería un error y la limpieza fallaría |
| `error(...)` al final | Detiene el pipeline y lo marca como `FAILURE` | Igual que en la sesión 10: capturar sin detener dejaría el pipeline en verde |

La opción `--ignore-not-found` hace la limpieza **idempotente**: se puede ejecutar varias veces, o sobre objetos que nunca se crearon, y el resultado siempre es el mismo (esos objetos no existen). Es una propiedad muy valiosa en un `catch`, donde no sabes con exactitud hasta dónde llegó la ejecución.

Fijándote en el orden: la versión de partida borra el `ConfigMap` antes que el `Deployment`. Es correcto para este ejercicio, pero la regla general es borrar en **orden inverso al de creación**: si el `Deployment` usa el `ConfigMap`, lo adecuado es eliminar primero el `Deployment` y después el `ConfigMap`. En la práctica lo harás en ese orden.

En la práctica también integrarás lo de la sesión 10, porque este fragmento de partida tiene dos carencias: no guarda la salida de `kubectl` (se pierde el motivo real del fallo) y escribe `${err}` en el mensaje final, que incluye el nombre de la excepción. Se corregirán con `> apply.log 2>&1` y `err.getMessage()`.

### Cuatro trampas que conviene conocer

#### Trampa 1. La limpieza puede borrar lo que ya existía

`kubectl delete -f deployment-resolved.yaml` borra **el objeto con ese nombre**, sea quien sea quien lo haya creado y cuándo. Imagina que la aplicación ya está desplegada y funcionando con el `Deployment` `miapp`. Lanzas una nueva versión con una plantilla errónea: `kubectl apply` falla, el `catch` se activa y `kubectl delete -f` **elimina el `Deployment` `miapp` que estaba funcionando**. El pipeline fallido ha tumbado la aplicación.

Por eso el mensaje "objetos creados **en esta ejecución**" es importante. La técnica de hoy es segura cuando el entorno parte vacío, como en esta práctica. En un entorno real habría que distinguir lo creado de lo que ya existía (ampliación, pasos 4 y 5).

#### Trampa 2. El fallo ocurre en el primer objeto

Si el `ConfigMap` es el que falla, el `Deployment` nunca llega a aplicarse y no se ha creado nada. El `catch` se activa igualmente y ejecuta los dos `delete`. Gracias a `--ignore-not-found`, no pasa nada: ambos terminan sin error. Es un buen caso de prueba, porque la limpieza debe ser correcta también cuando no hay nada que limpiar.

#### Trampa 3. La propia limpieza puede fallar

Los comandos `kubectl delete` del `catch` son comandos como cualquier otro: si el clúster deja de responder, devuelven un código distinto de 0. Y un `sh` que falla **dentro del `catch`** lanza una excepción nueva, con dos efectos: el `error(...)` final no llega a ejecutarse y se pierde el mensaje que explicaba el fallo original. Dos defensas:

- Registrar el error original **antes** de limpiar, como ya se hace con el patrón de la sesión 10.
- En una versión más robusta, ejecutar cada `delete` con `returnStatus: true` y comprobar el código, de forma que un fallo al limpiar se avise sin ocultar el error original (se verá en la ampliación).

#### Trampa 4. El despliegue "se aplica" pero no funciona

No todos los fallos hacen que `kubectl apply` devuelva un error. Si el manifiesto es válido pero la imagen no existe, `apply` termina bien (`deployment.apps/... created`) y después los pods quedan en `ImagePullBackOff`. El `try` no detecta nada y el pipeline sigue en verde. Para detectarlo hay que esperar a que el despliegue esté listo:

```
$ kubectl rollout status deployment/demo-limpieza -n demo-limpieza --timeout=60s
```

Este comando espera a que los pods estén disponibles y devuelve un código distinto de 0 si no lo consiguen en el plazo indicado. Si se incluye dentro del `try`, un despliegue que no arranca activa el `catch` y la limpieza. En la práctica de hoy el fallo es de plantilla, que `apply` sí detecta, pero conviene saber que existe esta segunda categoría de fallos.

### Dónde poner la limpieza: `catch` o `post`

Hay dos lugares razonables para ejecutar la limpieza, con ventajas distintas:

| Lugar | Ventaja | Inconveniente |
| --- | --- | --- |
| Dentro del `catch` de la etapa | Sabe qué se estaba haciendo y qué objetos podían haberse creado | Solo cubre esa etapa |
| En `post { failure { ... } }` | Cubre un fallo de cualquier etapa del pipeline | No sabe hasta dónde llegó la ejecución; hay que limpiar de forma genérica |

En la práctica se usa el `catch`, que es lo que pide el criterio. En pipelines con muchas etapas, `post` suele usarse como red de seguridad adicional.

### Cómo comprobar que no queda nada

Limpiar no basta: hay que **demostrar** que se ha limpiado. Y aquí hay un detalle que engaña con facilidad. El comando que se suele usar es:

```
$ kubectl get all -n demo-limpieza
```

Pero `all` **no significa "todos los objetos"**. Es una categoría que agrupa los tipos más habituales de cargas de trabajo (pods, servicios, `Deployments`, `ReplicaSets`, `StatefulSets`, `Jobs`…) y **no incluye** `ConfigMaps`, `Secrets`, volúmenes persistentes ni `Ingress`. Si el objeto huérfano de tu práctica es un `ConfigMap`, `kubectl get all` lo da por inexistente aunque siga ahí. Hay que consultar los tipos explícitamente:

```
$ kubectl get all,configmap -n demo-limpieza
```

Cada espacio de nombres tiene además un `ConfigMap` llamado `kube-root-ca.crt`, que crea Kubernetes automáticamente. No es de tu despliegue y no hay que borrarlo: es normal verlo en el resultado.

Para que la comprobación sea inequívoca, los objetos de la práctica llevan una etiqueta (`app: demo-limpieza`) y se puede filtrar por ella:

```
$ kubectl get all,configmap -n demo-limpieza -l app=demo-limpieza
No resources found in demo-limpieza namespace.
```

Si esa consulta no devuelve nada, no queda ningún objeto de la práctica.

| Comando | Qué muestra | Qué no muestra |
| --- | --- | --- |
| `kubectl get all -n ns` | Pods, servicios, `Deployments`, `ReplicaSets`, `Jobs`… | `ConfigMaps`, `Secrets`, volúmenes, `Ingress` |
| `kubectl get all,configmap -n ns` | Lo anterior más los `ConfigMaps` (incluido `kube-root-ca.crt`) | `Secrets`, volúmenes, `Ingress` |
| `kubectl get all,configmap -n ns -l app=...` | Solo los objetos con esa etiqueta | Lo que no lleve la etiqueta |

### Comandos de apoyo

| Comando | Para qué sirve |
| --- | --- |
| `kubectl create namespace nombre` | Crea el espacio de nombres de la práctica |
| `kubectl get all,configmap -n nombre` | Lista lo que hay (incluye `ConfigMaps`) |
| `kubectl delete -f fichero.yaml --ignore-not-found` | Borra los objetos de un fichero; no falla si no existen |
| `kubectl delete configmap nombre -n ns` | Borra un objeto concreto a mano |
| `kubectl apply --dry-run=server -f fichero.yaml` | Valida el fichero contra el servidor sin crear nada |
| `kubectl rollout status deployment/nombre -n ns --timeout=60s` | Espera a que el despliegue esté listo; falla si no lo está |
| `kubectl describe pod nombre -n ns` | Explica por qué un pod no arranca |
| `kubectl get events -n ns --sort-by=.lastTimestamp` | Lista los sucesos recientes del espacio de nombres |
| `kubectl delete namespace nombre` | Borra el espacio de nombres y todo lo que contiene (limpieza final) |

## 13.2 Práctica

**Objetivo:** provocar un fallo intencionado en un despliegue de dos objetos y ampliar el manejo de errores para que el pipeline elimine los objetos ya creados en esa ejecución. Se trabaja siempre en un espacio de nombres propio, `demo-limpieza`, para no tocar nada del resto del laboratorio.

Los pasos 1 a 3 son el núcleo de la práctica. Los pasos 4 y 5 son una ampliación.

### Paso 0. Preparar el espacio de nombres y el trabajo

**0.1** Desde la terminal del laboratorio, crea el espacio de nombres y comprueba que está vacío:

```
$ kubectl create namespace demo-limpieza
namespace/demo-limpieza created

$ kubectl get all,configmap -n demo-limpieza
NAME                         DATA   AGE
configmap/kube-root-ca.crt   1      5s
```

Ese único `ConfigMap`, `kube-root-ca.crt`, lo crea Kubernetes de forma automática. Es el punto de partida limpio: **al final de la práctica el resultado debe ser el mismo**.

**0.2** En Jenkins, crea un trabajo de tipo **Pipeline** llamado `ut02-s11-limpieza`. En el apartado **Pipeline** elige **Pipeline script**, como en la sesión 10. En cada paso sustituyes el contenido del campo **Script**, guardas y pulsas **Construir ahora**.

### Paso 1. Provocar el fallo y ver el problema

Primero hay que ver el problema con tus propios ojos. Este pipeline despliega dos objetos con el patrón de la sesión 10, **sin limpieza**:

1. Un `ConfigMap` válido (`demo-limpieza-config`).
2. Un `Deployment` con una **plantilla inválida**: el número de réplicas contiene el marcador sin sustituir `${REPLICAS}`. En el laboratorio, un script de renderizado sustituye esos marcadores por valores reales; aquí simulamos que no lo hizo. Kubernetes espera un número entero y recibe un texto, así que rechazará el objeto.

El `Deployment` usa el `ConfigMap` mediante `envFrom`: es la dependencia que obliga a crear primero uno y después el otro.

```groovy
pipeline {
    agent any
    stages {
        stage('Preparar manifiestos') {
            steps {
                writeFile file: 'configmap-resolved.yaml', text: '''apiVersion: v1
kind: ConfigMap
metadata:
  name: demo-limpieza-config
  namespace: demo-limpieza
  labels:
    app: demo-limpieza
data:
  APP_MODE: "demo"
'''
                writeFile file: 'deployment-resolved.yaml', text: '''apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-limpieza
  namespace: demo-limpieza
  labels:
    app: demo-limpieza
spec:
  replicas: ${REPLICAS}
  selector:
    matchLabels:
      app: demo-limpieza
  template:
    metadata:
      labels:
        app: demo-limpieza
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          envFrom:
            - configMapRef:
                name: demo-limpieza-config
'''
            }
        }
        stage('Aplicar objetos') {
            steps {
                script {
                    try {
                        sh 'kubectl apply -f configmap-resolved.yaml > apply.log 2>&1'
                        sh 'kubectl apply -f deployment-resolved.yaml >> apply.log 2>&1'
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

Dos detalles del script:

- Las cadenas de varias líneas usan comillas simples triples (`'''`). En ellas Groovy **no interpola variables**, por lo que `${REPLICAS}` llega tal cual al fichero.
- El segundo `kubectl apply` redirige con `>>`, que **añade** al final de `apply.log`. Con un solo `>` sobrescribiría lo que escribió el primero.

Lanza la ejecución. Salida esperada (el texto exacto del error puede variar según la versión de `kubectl`):

```
ERROR en la etapa 'Aplicar objetos' (ejecución nº 1)
Motivo según Jenkins: script returned exit code 1
Salida de kubectl:
configmap/demo-limpieza-config created
Error from server (BadRequest): error when creating "deployment-resolved.yaml": Deployment in version "v1" cannot be handled as a Deployment: json: cannot unmarshal string into Go struct field DeploymentSpec.spec.replicas of type int32
ERROR: Despliegue detenido: script returned exit code 1. Detalle en apply.log
Finished: FAILURE
```

Fijándote en la salida de `kubectl`: la primera línea dice `configmap/demo-limpieza-config created` y la segunda es el error del `Deployment`. **El `ConfigMap` ya se creó.** Compruébalo desde la terminal:

```
$ kubectl get all -n demo-limpieza
No resources found in demo-limpieza namespace.

$ kubectl get all,configmap -n demo-limpieza
NAME                             DATA   AGE
configmap/demo-limpieza-config   1      40s
configmap/kube-root-ca.crt       1      3m
```

Qué observar:

- El pipeline está en rojo y se ha detenido correctamente, como enseñó la sesión 10.
- `kubectl get all` dice que **no hay nada**, pero hay un objeto huérfano: `demo-limpieza-config`. Solo aparece al añadir `configmap` a la consulta. Esto confirma que `get all` por sí solo no basta para comprobar la limpieza.
- El `ConfigMap` pertenece a un despliegue que nunca existió.

Antes de seguir, vuelve al estado limpio a mano:

```
$ kubectl delete configmap demo-limpieza-config -n demo-limpieza
configmap "demo-limpieza-config" deleted
```

### Paso 2. Añadir la destrucción de objetos intermedios

Ahora se resuelve el problema. Sustituye **solo la etapa `Aplicar objetos`** (la etapa `Preparar manifiestos` y `Etapa posterior` no cambian). El `catch` mantiene el registro del error de la sesión 10 y añade la limpieza **después de registrar y antes de `error()`**:

```groovy
        stage('Aplicar objetos') {
            steps {
                script {
                    try {
                        sh 'kubectl apply -f configmap-resolved.yaml > apply.log 2>&1'
                        sh 'kubectl apply -f deployment-resolved.yaml >> apply.log 2>&1'
                        echo readFile('apply.log')
                    } catch (err) {
                        def salida = fileExists('apply.log') ? readFile('apply.log').trim() : '(no hay salida registrada)'
                        echo "ERROR en la etapa '${env.STAGE_NAME}' (ejecución nº ${env.BUILD_NUMBER})"
                        echo "Motivo según Jenkins: ${err.getMessage()}"
                        echo "Salida de kubectl:\n${salida}"
                        echo 'Fallo detectado, destruyendo objetos intermedios creados en esta ejecución...'
                        sh 'kubectl delete -f deployment-resolved.yaml --ignore-not-found'
                        sh 'kubectl delete -f configmap-resolved.yaml --ignore-not-found'
                        error("Pipeline detenido y objetos intermedios eliminados: ${err.getMessage()}")
                    } finally {
                        archiveArtifacts artifacts: 'apply.log', allowEmptyArchive: true
                    }
                }
            }
        }
```

Cambios respecto al paso 1:

| Cambio | Para qué |
| --- | --- |
| `echo 'Fallo detectado, destruyendo...'` | Deja constancia en el log de que se inicia la limpieza |
| `kubectl delete -f deployment-resolved.yaml --ignore-not-found` | Borra el `Deployment` si existe. Como no llegó a crearse, no hace nada y no da error |
| `kubectl delete -f configmap-resolved.yaml --ignore-not-found` | Borra el `ConfigMap`, que sí existe |
| Orden: primero `Deployment`, después `ConfigMap` | Orden inverso al de creación |
| `error(...)` después de limpiar | Detiene el pipeline con un mensaje que indica que se ha limpiado |

Lanza la ejecución. Salida esperada:

```
ERROR en la etapa 'Aplicar objetos' (ejecución nº 2)
Motivo según Jenkins: script returned exit code 1
Salida de kubectl:
configmap/demo-limpieza-config created
Error from server (BadRequest): error when creating "deployment-resolved.yaml": Deployment in version "v1" cannot be handled as a Deployment: json: cannot unmarshal string into Go struct field DeploymentSpec.spec.replicas of type int32
Fallo detectado, destruyendo objetos intermedios creados en esta ejecución...
+ kubectl delete -f deployment-resolved.yaml --ignore-not-found
+ kubectl delete -f configmap-resolved.yaml --ignore-not-found
configmap "demo-limpieza-config" deleted
ERROR: Pipeline detenido y objetos intermedios eliminados: script returned exit code 1
Finished: FAILURE
```

Qué observar en el log:

- El orden de los mensajes: primero se registra qué falló, después se avisa de la limpieza, después se ejecutan los `delete` y por último `error()`.
- El primer `delete` (el del `Deployment`) **no imprime nada**: el objeto no existía y `--ignore-not-found` lo silencia.
- El segundo `delete` imprime `configmap "demo-limpieza-config" deleted`: es la limpieza del objeto intermedio.
- La ejecución sigue terminando en `FAILURE`. Limpiar **no** convierte el fallo en éxito.

Ahora **comprueba el clúster**:

```
$ kubectl get all,configmap -n demo-limpieza
NAME                         DATA   AGE
configmap/kube-root-ca.crt   1      6m

$ kubectl get all,configmap -n demo-limpieza -l app=demo-limpieza
No resources found in demo-limpieza namespace.
```

El espacio de nombres ha quedado exactamente como estaba antes de la ejecución: solo el `ConfigMap` automático de Kubernetes. La segunda consulta, filtrada por la etiqueta de la práctica, no devuelve nada. **Esta es la comprobación que demuestra que no hay objetos huérfanos** y de aquí salen las capturas del entregable.

### Paso 3. El fallo en el primer objeto: limpiar cuando no hay nada que limpiar

En este paso el fallo ocurre en el **primer** objeto. Es la situación que describe la trampa 2: el `catch` se activa, pero no se creó nada. La limpieza debe seguir comportándose bien.

Modifica la etapa `Preparar manifiestos` de dos formas:

- En el `ConfigMap`, añade una línea `immutable: ${INMUTABLE}` justo antes de `data:`. Es otro marcador sin sustituir: `immutable` debe ser un valor lógico (`true` o `false`) y recibe un texto.
- En el `Deployment`, cambia `replicas: ${REPLICAS}` por `replicas: 1`, para que esta vez sea válido.

El fichero del `ConfigMap` queda así:

```groovy
                writeFile file: 'configmap-resolved.yaml', text: '''apiVersion: v1
kind: ConfigMap
metadata:
  name: demo-limpieza-config
  namespace: demo-limpieza
  labels:
    app: demo-limpieza
immutable: ${INMUTABLE}
data:
  APP_MODE: "demo"
'''
```

La etapa `Aplicar objetos` se queda como en el paso 2. Lanza la ejecución. Salida esperada:

```
ERROR en la etapa 'Aplicar objetos' (ejecución nº 3)
Motivo según Jenkins: script returned exit code 1
Salida de kubectl:
Error from server (BadRequest): error when creating "configmap-resolved.yaml": ConfigMap in version "v1" cannot be handled as a ConfigMap: json: cannot unmarshal string into Go struct field ConfigMap.immutable of type bool
Fallo detectado, destruyendo objetos intermedios creados en esta ejecución...
+ kubectl delete -f deployment-resolved.yaml --ignore-not-found
+ kubectl delete -f configmap-resolved.yaml --ignore-not-found
ERROR: Pipeline detenido y objetos intermedios eliminados: script returned exit code 1
Finished: FAILURE
```

Qué observar:

- Ahora la salida de `kubectl` **no tiene ninguna línea `created`**: el primer objeto falló y el segundo ni se intentó.
- Los dos `delete` no imprimen nada y terminan sin error, porque ningún objeto existía. Esto es exactamente lo que garantiza `--ignore-not-found`.
- El mensaje final dice "objetos intermedios eliminados" aunque no había ninguno. Es correcto en el sentido de que el resultado final es el esperado, pero en una versión más fina el mensaje debería reflejar lo que realmente se ha borrado (ampliación, paso 5).

**Prueba de contraste (opcional).** Quita `--ignore-not-found` de las dos líneas `delete` y vuelve a lanzar. El primer `delete` intenta borrar un `Deployment` que no existe y `kubectl` falla:

```
Error from server (NotFound): error when deleting "deployment-resolved.yaml": deployments.apps "demo-limpieza" not found
ERROR: script returned exit code 1
Finished: FAILURE
```

Fíjate en lo que ha pasado: el `sh` del `delete` ha lanzado una excepción **dentro del `catch`**, por lo que `error("Pipeline detenido...")` no se ha ejecutado y el mensaje con el motivo original se ha perdido. Es la trampa 3 en acción. Vuelve a poner `--ignore-not-found` antes de continuar.

### Ampliación (opcional): no borrar lo que ya existía

Los pasos 4 y 5 son para quien haya terminado el núcleo. Sirven para comprobar con un caso real la trampa 1: la limpieza del paso 2 es segura solo si el entorno parte vacío.

#### Paso 4. Comprobar el peligro

**4.1 Dejar una aplicación funcionando.** Modifica la etapa `Preparar manifiestos` para que ambos ficheros sean válidos: en el `ConfigMap` elimina la línea `immutable: ${INMUTABLE}` y en el `Deployment` pon `replicas: 1`. Con la etapa `Aplicar objetos` del paso 2, lanza la ejecución. Debe terminar en `SUCCESS`:

```
configmap/demo-limpieza-config created
deployment.apps/demo-limpieza created
Despliegue aplicado correctamente
Finished: SUCCESS
```

Desde la terminal, comprueba que la aplicación existe (los nombres de los pods y `ReplicaSet` llevan un sufijo aleatorio, así que verás valores distintos):

```
$ kubectl get all,configmap -n demo-limpieza
NAME                                READY   STATUS    RESTARTS   AGE
pod/demo-limpieza-5d8f7c6b9-x2k4p   1/1     Running   0          20s

NAME                            READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/demo-limpieza   1/1     1            1           20s

NAME                                      DESIRED   CURRENT   READY   AGE
replicaset.apps/demo-limpieza-5d8f7c6b9   1         1         1       20s

NAME                             DATA   AGE
configmap/demo-limpieza-config   1      20s
configmap/kube-root-ca.crt       1      9m
```

Esta es la "versión en producción": una aplicación sana que no debe tocarse.

**4.2 Lanzar una versión defectuosa.** Vuelve a poner `replicas: ${REPLICAS}` en el `Deployment` (el `ConfigMap` se queda válido) y lanza otra vez, con la misma etapa del paso 2. Salida esperada:

```
ERROR en la etapa 'Aplicar objetos' (ejecución nº 5)
Motivo según Jenkins: script returned exit code 1
Salida de kubectl:
configmap/demo-limpieza-config unchanged
Error from server (BadRequest): error when creating "deployment-resolved.yaml": ...
Fallo detectado, destruyendo objetos intermedios creados en esta ejecución...
+ kubectl delete -f deployment-resolved.yaml --ignore-not-found
deployment.apps "demo-limpieza" deleted
+ kubectl delete -f configmap-resolved.yaml --ignore-not-found
configmap "demo-limpieza-config" deleted
ERROR: Pipeline detenido y objetos intermedios eliminados: script returned exit code 1
Finished: FAILURE
```

Fijándote en el log:

- `configmap/demo-limpieza-config unchanged` significa que el `ConfigMap` **ya existía y no ha cambiado**. Esta ejecución no creó nada.
- Aun así, el `catch` ha borrado el `Deployment` y el `ConfigMap`, porque `kubectl delete -f` borra por nombre, sin preguntar quién los creó.

```
$ kubectl get all,configmap -n demo-limpieza
NAME                         DATA   AGE
configmap/kube-root-ca.crt   1      11m
```

**La aplicación que funcionaba ha desaparecido por culpa de una ejecución fallida.** Para reflexionar en grupo:

- ¿Qué objetos creó realmente la ejecución que falló? ¿Y cuáles borró?
- ¿Qué consecuencias tendría esto en un entorno real?
- ¿Qué información necesita el pipeline para decidir qué es seguro borrar?

#### Paso 5. Borrar solo lo que se ha creado en esta ejecución

La idea es que el pipeline **recuerde qué objetos no existían** antes de aplicarlos y borre solo esos. Para cada fichero, antes de aplicarlo, pregunta al clúster si el objeto ya está: `kubectl get -f fichero` devuelve 0 si existe y distinto de 0 si no. Tras aplicar con éxito un objeto que no existía, se anota en una lista. En el `catch` solo se borra lo que está en la lista, en orden inverso, y cada `delete` se ejecuta con `returnStatus: true` para que un fallo al limpiar no oculte el error original (trampa 3).

Sustituye la etapa `Aplicar objetos` por esta:

```groovy
        stage('Aplicar objetos') {
            steps {
                script {
                    def ficheros = ['configmap-resolved.yaml', 'deployment-resolved.yaml']
                    def creados = []
                    sh 'rm -f apply.log'
                    try {
                        for (fichero in ficheros) {
                            def existia = sh(script: "kubectl get -f ${fichero} > /dev/null 2>&1",
                                             returnStatus: true) == 0
                            sh "kubectl apply -f ${fichero} >> apply.log 2>&1"
                            if (!existia) {
                                creados.add(fichero)
                            }
                        }
                        echo readFile('apply.log')
                    } catch (err) {
                        def salida = fileExists('apply.log') ? readFile('apply.log').trim() : '(no hay salida registrada)'
                        echo "ERROR en la etapa '${env.STAGE_NAME}' (ejecución nº ${env.BUILD_NUMBER})"
                        echo "Motivo según Jenkins: ${err.getMessage()}"
                        echo "Salida de kubectl:\n${salida}"
                        echo "Objetos creados en esta ejecución: ${creados}"
                        def pendientes = []
                        for (int i = creados.size() - 1; i >= 0; i--) {
                            def rc = sh(script: "kubectl delete -f ${creados[i]} --ignore-not-found",
                                        returnStatus: true)
                            if (rc != 0) {
                                pendientes.add(creados[i])
                            }
                        }
                        if (pendientes.size() > 0) {
                            error("Pipeline detenido, pero NO se han podido eliminar: ${pendientes}. Revisar a mano. Causa: ${err.getMessage()}")
                        }
                        if (creados.size() == 0) {
                            error("Pipeline detenido. No se ha eliminado nada: esta ejecución no creó objetos. Causa: ${err.getMessage()}")
                        }
                        error("Pipeline detenido y eliminados los objetos creados en esta ejecución: ${creados}. Causa: ${err.getMessage()}")
                    } finally {
                        archiveArtifacts artifacts: 'apply.log', allowEmptyArchive: true
                    }
                }
            }
        }
```

Análisis de las partes nuevas:

| Parte | Qué hace |
| --- | --- |
| `def creados = []` | Lista vacía donde se anotan los ficheros cuyos objetos ha creado esta ejecución |
| `kubectl get -f fichero` con `returnStatus: true` | Pregunta si el objeto ya existe sin lanzar excepción; `== 0` significa que existe |
| `if (!existia) { creados.add(fichero) }` | Anota el fichero solo si el objeto no existía antes. Si el `apply` falla, esta línea no se alcanza y el fichero no se anota |
| `for (int i = creados.size() - 1; i >= 0; i--)` | Recorre la lista de atrás hacia delante: orden inverso al de creación |
| `returnStatus: true` en el `delete` | Si la limpieza falla, no lanza excepción; se anota el fichero en `pendientes` |
| Tres `error(...)` distintos | El mensaje final dice la verdad en cada caso: limpieza incompleta, nada que limpiar, o limpieza completa |

**Prueba A: entorno vacío.** Si el espacio de nombres tiene aún la aplicación del paso 4, límpialo antes: `kubectl delete all,configmap -l app=demo-limpieza -n demo-limpieza`. Después lanza el pipeline con el `Deployment` inválido (`replicas: ${REPLICAS}`). Salida esperada:

```
Salida de kubectl:
configmap/demo-limpieza-config created
Error from server (BadRequest): error when creating "deployment-resolved.yaml": ...
Objetos creados en esta ejecución: [configmap-resolved.yaml]
+ kubectl delete -f configmap-resolved.yaml --ignore-not-found
configmap "demo-limpieza-config" deleted
ERROR: Pipeline detenido y eliminados los objetos creados en esta ejecución: [configmap-resolved.yaml]. Causa: script returned exit code 1
Finished: FAILURE
```

La lista de creados contiene solo el `ConfigMap`: es lo único que esta ejecución creó, y es lo único que se borra.

**Prueba B: aplicación ya desplegada.** Repite el paso 4.1 (ficheros válidos, `replicas: 1`) con esta nueva etapa para dejar la aplicación funcionando, y después el paso 4.2 (`replicas: ${REPLICAS}`). Salida esperada de la última ejecución:

```
Salida de kubectl:
configmap/demo-limpieza-config unchanged
Error from server (BadRequest): error when creating "deployment-resolved.yaml": ...
Objetos creados en esta ejecución: []
ERROR: Pipeline detenido. No se ha eliminado nada: esta ejecución no creó objetos. Causa: script returned exit code 1
Finished: FAILURE
```

Y ahora, en el clúster, la aplicación sana **sigue ahí**:

```
$ kubectl get all,configmap -n demo-limpieza -l app=demo-limpieza
NAME                                READY   STATUS    RESTARTS   AGE
pod/demo-limpieza-5d8f7c6b9-x2k4p   1/1     Running   0          4m
...
```

La ejecución fallida ha dejado el pipeline en rojo, pero no ha destruido nada de lo que funcionaba.

**Límite que sigue existiendo.** Esta versión protege los objetos que ya existían, pero no deshace las modificaciones. Si un `kubectl apply` modifica con éxito un objeto existente (`configured`) y un fichero posterior falla, el objeto modificado se queda con la versión nueva. Para ese caso la herramienta adecuada es volver a la versión anterior (estrategia D, `kubectl rollout undo`), no borrar. Es un tema más avanzado que conviene conocer aunque hoy no se practique.

#### Paso 6. Limpieza final

Al terminar la práctica, deja el laboratorio como estaba:

```
$ kubectl delete namespace demo-limpieza
namespace "demo-limpieza" deleted
```

Borrar el espacio de nombres elimina todo lo que contiene, incluidos los restos que hayan podido quedar de las pruebas.

## 13.3 Entregable y cierre

### Entregable

Se entregan **dos capturas de pantalla**, que salen del paso 2 de la práctica:

1. **El pipeline fallido, con el log mostrando la limpieza.** Captura de **Console Output** de la ejecución del paso 2. Debe verse, de arriba abajo: la salida de `kubectl` con el error del `Deployment`, el mensaje `Fallo detectado, destruyendo objetos intermedios...`, los dos `kubectl delete`, la línea `ERROR: Pipeline detenido y objetos intermedios eliminados...` y `Finished: FAILURE`.
2. **El clúster sin objetos huérfanos.** Captura de la terminal con estos tres comandos y su salida, ejecutados justo después del pipeline fallido:

```
$ kubectl get all -n demo-limpieza
$ kubectl get all,configmap -n demo-limpieza
$ kubectl get all,configmap -n demo-limpieza -l app=demo-limpieza
```

Se incluyen los tres por una razón: `kubectl get all` por sí solo no muestra los `ConfigMaps`, así que no demuestra que el objeto intermedio se haya borrado. La segunda consulta lo demuestra (solo debe quedar `kube-root-ca.crt`) y la tercera lo confirma por etiqueta (`No resources found`).

**Requisitos de las capturas:**

- Se debe leer el texto con claridad, sin recortar líneas importantes del log.
- Tiene que verse el comando escrito y no solo su salida.
- La captura del log y la del clúster deben corresponder a la **misma ejecución**: comprueba que el número de ejecución del log coincide con el momento en que consultaste el clúster.

Las capturas se suben a la tarea de la sesión en Aules.

### Criterios de revisión

| Criterio | Qué se comprueba | Dónde se ve |
| --- | --- | --- |
| El fallo es intencionado y controlado | La plantilla inválida provoca el error del `Deployment` y la ejecución termina en `FAILURE` | Log: línea `Finished: FAILURE` |
| Se recoge qué error se ha producido | El log incluye la salida real de `kubectl`, no solo `exit code 1` | Log: bloque `Salida de kubectl` |
| Hay un objeto intermedio antes de limpiar | La salida de `kubectl` muestra `configmap/... created` antes del error | Log: primera línea de la salida de `kubectl` |
| Se ejecuta la limpieza | Aparecen el aviso y los `kubectl delete`, y el `ConfigMap` figura como `deleted` | Log: bloque tras `Fallo detectado` |
| El pipeline se detiene tras limpiar | `error()` es lo último del `catch` y la ejecución termina en rojo | Log: línea `ERROR: Pipeline detenido...` |
| No quedan objetos huérfanos | Solo queda `kube-root-ca.crt` y el filtro por etiqueta no devuelve recursos | Captura del clúster |
| (Ampliación) No se borra lo que existía | Con la aplicación desplegada, un fallo no la destruye | Prueba B del paso 5 |

### Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `namespaces "demo-limpieza" not found` en el log | No se creó el espacio de nombres | Ejecutar el paso 0.1 |
| Tras el pipeline, el `ConfigMap` sigue en el clúster | Se está usando la etapa del paso 1 (sin limpieza), o el fichero del `delete` no coincide | Revisar que el script es el del paso 2 y comprobar los nombres de fichero |
| `kubectl get all` sale vacío, pero el `ConfigMap` existe | `all` no incluye `ConfigMaps` | Consultar `kubectl get all,configmap -n demo-limpieza` |
| El pipeline termina en `SUCCESS` aunque el despliegue falla | Falta `error()` al final del `catch`, o se ha usado solo `currentBuild.result` | Poner `error(...)` como última instrucción del `catch` |
| En el log no aparece `created` para el `ConfigMap` | El fallo se produjo en el primer objeto (es lo esperado en el paso 3) o hay un problema de espacio de nombres | Comparar con el paso en que estés |
| `Error from server (NotFound)` durante el `delete` | Falta `--ignore-not-found` | Añadir la opción a los dos `delete` |
| El `ConfigMap` sale como `unchanged` en lugar de `created` | Quedó de una ejecución anterior | Limpiar a mano con `kubectl delete configmap demo-limpieza-config -n demo-limpieza` |
| `error parsing ... yaml` | El YAML se ha copiado con sangría incorrecta; en este script las líneas dentro de `'''` deben empezar en la primera columna | Volver a copiar el bloque sin que el editor añada espacios |
| El pod del paso 4 no llega a `Running` (`ImagePullBackOff`) | La red no permite descargar la imagen `nginx` | No afecta a la práctica: el `Deployment` existe y la comprobación sigue siendo válida |
| `Scripts not permitted to use method ...` | La sandbox de Groovy bloquea una instrucción | Usar solo las instrucciones del ejemplo; avisar al docente si aparece |

### Ideas clave de la sesión

- Un despliegue casi nunca es un solo objeto; los objetos se aplican **uno a uno** y Kubernetes **no deshace** los que ya se han aplicado si uno posterior falla.
- Un objeto creado cuyo despliegue no se completa es un **objeto intermedio huérfano**: consume recursos, confunde el diagnóstico y puede interferir en la siguiente ejecución.
- La limpieza se programa en el `catch`: primero se registra el error, después se destruyen los objetos y **al final** se llama a `error()`.
- `kubectl delete -f fichero --ignore-not-found` hace la limpieza segura aunque el objeto no llegara a crearse. Se borra en **orden inverso** al de creación.
- Limpiar no convierte el fallo en éxito: la ejecución sigue terminando en `FAILURE`.
- `kubectl get all` **no muestra** `ConfigMaps`, `Secrets`, volúmenes ni `Ingress`. Para comprobar la limpieza hay que pedirlos explícitamente.
- Borrar por fichero destruye también lo que ya existía con ese nombre. En entornos con aplicación ya desplegada hay que borrar **solo lo creado en esta ejecución**.
- La propia limpieza puede fallar: no debe ocultar el error original.

### Preguntas de cierre

1. ¿Qué es un objeto intermedio y por qué puede quedar huérfano?
2. ¿Por qué un `kubectl apply` que falla en el segundo objeto deja el primero en el clúster?
3. ¿Qué hace `--ignore-not-found` y qué pasaría en el paso 3 si no estuviera?
4. ¿Por qué se borra el `Deployment` antes que el `ConfigMap`?
5. ¿Por qué `kubectl get all` no basta para demostrar que no quedan restos?
6. La aplicación `miapp` ya está desplegada y el pipeline usa la limpieza del paso 2 con los mismos nombres. Una versión defectuosa falla al aplicarse. ¿Qué ocurre con `miapp` y cómo se evita?
7. Un `kubectl apply` termina correctamente, pero los pods quedan en `ImagePullBackOff`. ¿Se activa el `catch`? ¿Cómo conseguir que el pipeline detecte este fallo?
8. Si un `kubectl delete` dentro del `catch` falla, ¿qué se puede perder y cómo se evita?

### Respuestas

1. Es un recurso creado durante un despliegue que aún no está completo, como un `ConfigMap` sin su `Deployment`. Queda huérfano si el pipeline falla y nadie lo elimina.
2. Porque `kubectl apply` envía cada objeto al servidor por separado y no existe una operación atómica que deshaga el conjunto: el primer objeto ya se aceptó y permanece.
3. Hace que `kubectl delete` no devuelva error si el objeto no existe. Sin ella, el primer `delete` intentaría borrar un `Deployment` inexistente, `kubectl` fallaría dentro del `catch`, el `error(...)` final no se ejecutaría y se perdería el mensaje del fallo original.
4. Porque el `Deployment` depende del `ConfigMap`. Se elimina primero lo que depende de otros y al final aquello de lo que dependen; es el orden inverso al de creación.
5. Porque `all` agrupa solo ciertos tipos de objetos (pods, servicios, `Deployments`…) y no incluye los `ConfigMaps`. Hay que consultar `all,configmap` y, para ser inequívocos, filtrar por etiqueta.
6. Los `delete -f` borran por nombre y eliminarían el `Deployment` y el `ConfigMap` de `miapp`, que estaban funcionando: el pipeline fallido tumba la aplicación. Se evita registrando antes de aplicar qué objetos no existían y borrando solo esos (paso 5), o usando un espacio de nombres temporal en pruebas.
7. No: `apply` terminó sin error, así que el `catch` no se activa. Se consigue añadiendo dentro del `try` un `kubectl rollout status deployment/nombre --timeout=...`, que devuelve un código distinto de 0 si el despliegue no llega a estar listo.
8. Si el `sh` lanza una excepción dentro del `catch`, el `error(...)` final no se ejecuta y se pierde el motivo original. Se evita registrando el error antes de limpiar y ejecutando los `delete` con `returnStatus: true`, avisando si alguno falla.

---

[← Sesión 10](sesion10.md) · [Índice de la UT02](./)
