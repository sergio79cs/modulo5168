[← Sesión 8](sesion8.md) · [Índice de la UT02](./) · [Sesión 10 →](sesion10.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 9 — Ejecución y comprobación del despliegue

Martes 15 de diciembre de 2026. Criterio RA2.c (continuación).

## Contexto y objetivos

En la sesión 8 se verificó a mano que los parámetros llegan al Pod. En esta sesión esa comprobación pasa al pipeline: Jenkins ejecuta Ansible y, a continuación, comprueba automáticamente que el despliegue termina sin errores. Si algo falla, el pipeline se pone en rojo y no hace falta que nadie lo mire para saberlo.

**Objetivos de aprendizaje**

1. Describir la estructura de un pipeline declarativo (`pipeline`, `parameters`, `stages`, `steps`, `post`).
2. Integrar una etapa que lanza `ansible-playbook` con variables de extra (`-e`) tomadas de parámetros de Jenkins.
3. Explicar qué comprueba `kubectl rollout status`, cómo devuelve su resultado a Jenkins y qué hace `--timeout`.
4. Entender que un pipeline falla cuando un comando termina con código de salida distinto de 0.
5. Provocar un fallo de despliegue, leer el diagnóstico en la consola de Jenkins y corregirlo hasta ver ambas etapas en verde.

**Requisitos previos**

- Jenkins operativo con acceso a Gitea y un pipeline (job) creado en las sesiones anteriores de la UT02.
- El agente de Jenkins tiene `ansible-playbook` y `kubectl` instalados y un `kubeconfig` que apunta al clúster del laboratorio.
- Directorio `lab/ansible` con `inventory.ini` y `playbook.yml` que reciben `target_env` y `app_version`.
- Deployment `modulo5168-app` y ConfigMap generado por Ansible, como en la sesión 8.

**Etapas que se integran**

```groovy
stage('Configurar entorno (Ansible)') {
    steps {
        dir('lab/ansible') {
            sh "ansible-playbook -i inventory.ini playbook.yml -e 'target_env=${TARGET_ENV} app_version=${IMAGE_TAG}'"
        }
    }
}
stage('Verificar despliegue sin errores') {
    steps {
        sh "kubectl rollout status deployment/modulo5168-app --timeout=120s"
    }
}
```

> Nota: los nombres `TARGET_ENV`, `IMAGE_TAG`, `modulo5168-app`, `inventory.ini` y `playbook.yml` son los del guion; si en tu laboratorio se llaman distinto, adáptalos.

## Teoría

### 1. De la verificación manual a la automática

La sesión 8 dejó claro que desplegar no es aplicar un YAML, sino comprobar el resultado. Hacerlo a mano no escala ni es repetible: depende de quién lo haga y de si se acuerda. Un pipeline de despliegue continuo convierte esa comprobación en una etapa más, que se ejecuta siempre y siempre en el mismo orden.

Idea central: **el pipeline decide si el despliegue es correcto, no la persona**. Para eso necesita un criterio objetivo que se pueda evaluar con un código de salida: 0 es éxito, cualquier otro valor es fallo.

### 2. Anatomía de un pipeline declarativo

| Bloque | Función |
| --- | --- |
| `pipeline { }` | Envuelve todo el flujo |
| `agent` | Dónde se ejecuta (`any`, un nodo concreto, un contenedor) |
| `parameters { }` | Valores que se piden al lanzar el build (entorno, versión de la imagen) |
| `environment { }` | Variables disponibles en todo el pipeline o en una etapa |
| `stages { stage(...) { steps { } } }` | Secuencia de etapas; cada una agrupa pasos |
| `post { }` | Qué hacer al terminar (`always`, `success`, `failure`) |

Las etapas se ejecutan en orden. Si una falla, las siguientes **no se ejecutan** (salvo en `post`). Por eso el orden tiene sentido: primero se configura y despliega, después se verifica.

Esqueleto completo que se usará en la práctica:

```groovy
pipeline {
    agent any
    parameters {
        choice(name: 'TARGET_ENV', choices: ['dev', 'pre'], description: 'Entorno destino')
        string(name: 'IMAGE_TAG', defaultValue: '1.0.0', description: 'Versión de la imagen')
    }
    stages {
        stage('Configurar entorno (Ansible)') { /* ... */ }
        stage('Verificar despliegue sin errores') { /* ... */ }
    }
    post {
        failure {
            sh 'kubectl get pods -l app=modulo5168-app || true'
            sh 'kubectl describe deployment modulo5168-app || true'
        }
    }
}
```

### 3. El paso `sh` y los códigos de salida

El paso `sh` ejecuta un comando en el agente. Jenkins mira el código de salida: si es 0 marca el paso como correcto; si no, lanza un error, marca la etapa en rojo y aborta el pipeline. Es el mecanismo que hace posible la verificación automática: basta con que el comando de comprobación devuelva distinto de 0 cuando algo va mal.

- En un `sh` con varias líneas, Jenkins arranca la shell con `-xe`: se muestra cada comando y se aborta en el primer error.
- El operador `|| true` fuerza código 0 aunque el comando falle. Se usa solo en diagnósticos (como en `post`), nunca en el comando que verifica.
- Un `grep` sin coincidencias devuelve 1: bien para verificar, mal si solo se quería mostrar información.

### 4. Comillas simples y dobles en `sh`

En Groovy, `sh "..."` (comillas dobles) interpola `${VARIABLE}` **antes** de enviar el comando a la shell; `sh '...'` (simples) envía el texto tal cual y la shell resuelve las variables de entorno.

| Forma | Quién sustituye la variable | Cuándo |
| --- | --- | --- |
| `sh "... ${TARGET_ENV} ..."` | Groovy (Jenkins) | Cuando se mezclan parámetros y texto fijo, como en el guion |
| `sh '... $TARGET_ENV ...'` | La shell del agente | Más segura si el valor viene de una fuente no confiable |

En el guion se usan comillas dobles porque `TARGET_ENV` e `IMAGE_TAG` son parámetros controlados por el equipo. Si el valor lo pudiera escribir cualquiera (por ejemplo, un nombre de rama), conviene la forma de comillas simples para evitar inyección de comandos.

Dentro del `-e` de Ansible, las comillas simples (`'target_env=... app_version=...'`) evitan que la shell parta los argumentos por los espacios: sin ellas, `app_version=...` se interpretaría como otro argumento de `ansible-playbook`.

### 5. La etapa de Ansible

Comando de la etapa:

```bash
ansible-playbook -i inventory.ini playbook.yml -e 'target_env=dev app_version=1.0.0'
```

- `-i inventory.ini`: inventario de máquinas o destinos.
- `playbook.yml`: el playbook que se ejecuta.
- `-e`: variables extra, con la máxima precedencia en Ansible (sobrescriben `group_vars` y `host_vars`). Es el puente entre los parámetros de Jenkins y el playbook.
- `dir('lab/ansible')`: cambia el directorio de trabajo solo dentro del bloque, para que las rutas relativas (`inventory.ini`, `playbook.yml`) se resuelvan bien.

Qué devuelve Ansible a Jenkins:

| Código de salida | Significado |
| --- | --- |
| 0 | Todas las tareas terminaron bien |
| 2 | Alguna tarea falló en algún host |
| 4 | Algún host no era alcanzable |
| 1, 3, 5 y otros | Error general, de sintaxis o de configuración |

Para el pipeline basta saber que cualquier valor distinto de 0 detiene la ejecución.

**Idempotencia.** Un playbook bien escrito se puede ejecutar varias veces y deja el sistema en el mismo estado final. El resumen `PLAY RECAP` distingue `ok` (ya estaba así) de `changed` (se modificó algo). En una segunda ejecución sin cambios en los parámetros, `changed` debe ser 0. Esto es importante en CI, porque el mismo pipeline se lanzará muchas veces.

Opciones útiles al depurar:

- `--check`: simula sin cambiar nada.
- `--diff`: muestra qué cambia en ficheros y plantillas.
- `-v`, `-vv`, `-vvv`: más detalle en la salida.
- `--syntax-check`: valida el playbook sin ejecutarlo; buena etapa previa barata.

### 6. La etapa de verificación: `kubectl rollout status`

Un Deployment no se actualiza de golpe: Kubernetes crea Pods nuevos y retira los antiguos de forma gradual (*rolling update*). Aplicar el YAML solo registra la intención; el despliegue real puede tardar y puede fallar después de que `kubectl apply` ya haya devuelto 0.

`kubectl rollout status deployment/modulo5168-app` bloquea hasta que el despliegue termina y devuelve:

| Situación | Resultado |
| --- | --- |
| Todas las réplicas nuevas disponibles y las antiguas retiradas | Mensaje `successfully rolled out`, código 0 |
| El despliegue sigue en curso | Va mostrando `Waiting for deployment ... rollout to finish: 1 old replicas are pending termination...` |
| Se supera `--timeout=120s` | Termina con error y código distinto de 0 |
| Se supera `progressDeadlineSeconds` del Deployment (600 s por defecto) | Informa de `exceeded its progress deadline` y falla |

Por eso `--timeout=120s` es esencial. Sin él, si el Pod se queda en `ImagePullBackOff` o nunca pasa a *Ready*, el comando esperaría indefinidamente y el build se quedaría colgado ocupando el ejecutor de Jenkins.

**Qué significa "disponible".** Una réplica cuenta como disponible cuando está *Ready*. Si el contenedor define `readinessProbe`, Kubernetes espera a que la sonda responda bien; si no hay sonda, basta con que el proceso arranque. Cuanto mejor sea la sonda, más fiable es la verificación.

**Limitación importante, enlazada con la sesión 8.** `rollout status` solo espera a un despliegue **que ya está en marcha**. Si Ansible actualiza el ConfigMap pero el Deployment no cambia, Kubernetes no crea Pods nuevos: `rollout status` devuelve 0 de inmediato y los Pods siguen con los valores antiguos. La etapa estaría en verde sin que los parámetros hayan llegado. Hay dos soluciones habituales:

- Que el playbook ejecute un reinicio explícito cuando cambie el ConfigMap (`kubectl rollout restart`), antes de la verificación.
- Poner en la plantilla del Pod una anotación con el hash del ConfigMap; al cambiar el contenido cambia la plantilla y Kubernetes crea Pods nuevos por sí solo.

En esta sesión, el cambio de `app_version` modifica la imagen del Deployment, así que sí provoca un rollout. Conviene que el alumnado entienda la diferencia.

### 7. Acceso a Kubernetes desde Jenkins

Para que `kubectl` funcione dentro del pipeline, el proceso de Jenkins necesita credenciales del clúster:

- En el laboratorio basta con que el usuario que ejecuta Jenkins tenga un `~/.kube/config` válido o que la variable `KUBECONFIG` apunte a él.
- En un entorno real, el `kubeconfig` se guarda como credencial de Jenkins (tipo *Secret file*) y se carga solo durante la etapa con `withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG')]) { ... }`.
- Nunca se escriben tokens ni contraseñas en el `Jenkinsfile`: queda en el repositorio y en su historial.

El mismo razonamiento se aplica a Ansible si necesita claves SSH o contraseñas: se inyectan como credenciales, no como texto.

### 8. Qué hacer cuando falla: diagnóstico y marcha atrás

Un pipeline en rojo debe dar información suficiente para actuar. Dos mecanismos:

- **Bloque `post { failure { ... } }`**: ejecuta comandos de diagnóstico solo cuando el build falla (estado de los Pods, eventos, `describe`, últimas líneas de log). Así la causa queda en la consola de Jenkins sin entrar al clúster.
- **Marcha atrás (*rollback*)**: `kubectl rollout undo deployment/modulo5168-app` vuelve a la revisión anterior. Se puede automatizar en el `post { failure }`; en esta unidad se hace a mano para entender qué ocurre. `kubectl rollout history` lista las revisiones.

Causas típicas de que `rollout status` falle:

| Estado del Pod | Causa habitual |
| --- | --- |
| `ImagePullBackOff` / `ErrImagePull` | La imagen o la etiqueta no existe, o no hay acceso al registro |
| `CrashLoopBackOff` | La aplicación arranca y se cae (configuración errónea, variable ausente) |
| `CreateContainerConfigError` | ConfigMap o Secret referenciado que no existe |
| `Pending` | No hay recursos o no se puede planificar el Pod |
| Running pero no *Ready* | La `readinessProbe` falla |

La regla práctica: **el diagnóstico está en los eventos del Pod** (`kubectl describe pod`, sección *Events*).

### 9. Lectura de un build en Jenkins

- **Stage View**: una columna por etapa; verde correcto, rojo fallo, azul en curso, gris no ejecutada.
- **Console Output**: registro completo; cada `sh` aparece con `+ comando`. Es donde se busca el error.
- **Parámetros**: *Build with Parameters* permite lanzar el mismo pipeline con otro entorno o versión; el historial guarda con qué valores se ejecutó cada build, lo que da trazabilidad.
- **Replay y re-run**: un build fallido se corrige en el `Jenkinsfile`, se sube al repositorio y se lanza otro; el build antiguo permanece como evidencia.

### 10. Enlace con RA2.c

El criterio RA2.c pide asegurar que los parámetros recopilados llegan al software desplegado. Con esta sesión el flujo queda definido de extremo a extremo: **parámetros de Jenkins → Ansible → ConfigMap y Deployment → comprobación automática → resultado visible en el pipeline**. La etapa de verificación es la evidencia de que el despliegue se completó sin errores.

## Práctica

Trabajo individual en la VM del laboratorio. Cada paso indica qué debe verse; si no coincide, se consulta la sección de errores frecuentes. Los pasos 1 a 3 preparan el terreno, el 4 y el 5 son el núcleo, y el 6 a 8 consolidan lo aprendido.

### Paso 0 · Comprobar el entorno de Jenkins

Antes de tocar el `Jenkinsfile`, comprobar que el agente de Jenkins dispone de las herramientas. Si Jenkins corre en un contenedor, entrar en él (`docker exec -it <contenedor> bash`) y ejecutar:

```bash
ansible-playbook --version
kubectl version --client
kubectl get nodes
```

Debe mostrar las dos versiones y los nodos del clúster en `Ready`. Si `kubectl get nodes` falla con un error de conexión, el `kubeconfig` no está disponible para el usuario de Jenkins (ver errores frecuentes).

### Paso 1 · Probar a mano lo que hará el pipeline

Primero se ejecutan los dos comandos fuera de Jenkins, desde la carpeta del repositorio. Así, si luego falla el pipeline, se sabe que el problema es de Jenkins y no del playbook.

```bash
cd lab/ansible
ansible-playbook -i inventory.ini playbook.yml -e 'target_env=dev app_version=1.0.0'
cd ../..
kubectl rollout status deployment/modulo5168-app --timeout=120s
echo "Código de salida: $?"
```

Salida esperada: `PLAY RECAP` con `failed=0`, el mensaje `deployment "modulo5168-app" successfully rolled out` y `Código de salida: 0`. Repetir el `ansible-playbook` una segunda vez y observar que `changed` baja a 0 (idempotencia).

### Paso 2 · Revisar el Jenkinsfile de partida

Abrir el `Jenkinsfile` en el repositorio de Gitea (o en la copia local) y localizar las etapas anteriores de la unidad. Comprobar que existen los parámetros `TARGET_ENV` e `IMAGE_TAG`; si no, añadirlos:

```groovy
parameters {
    choice(name: 'TARGET_ENV', choices: ['dev', 'pre'], description: 'Entorno destino')
    string(name: 'IMAGE_TAG', defaultValue: '1.0.0', description: 'Versión de la imagen')
}
```

Si `IMAGE_TAG` ya se calcula en otra etapa (por ejemplo, a partir de `BUILD_NUMBER`), se mantiene esa definición y no se duplica.

### Paso 3 · Añadir la etapa de Ansible

Insertar tras las etapas existentes:

```groovy
stage('Configurar entorno (Ansible)') {
    steps {
        dir('lab/ansible') {
            sh "ansible-playbook -i inventory.ini playbook.yml -e 'target_env=${TARGET_ENV} app_version=${IMAGE_TAG}'"
        }
    }
}
```

Preguntas guiadas para el alumnado, antes de continuar:

1. ¿Por qué el comando va entre comillas dobles y el `-e` entre simples?
2. ¿Qué ocurriría si se quitara `dir('lab/ansible')`?
3. ¿Qué etapa se ejecutará si esta falla?

### Paso 4 · Añadir la etapa de verificación

Después de la anterior:

```groovy
stage('Verificar despliegue sin errores') {
    steps {
        sh "kubectl rollout status deployment/modulo5168-app --timeout=120s"
    }
}
```

Añadir también el bloque `post` al final del `pipeline`, con el diagnóstico en caso de fallo:

```groovy
post {
    success {
        echo "Despliegue ${IMAGE_TAG} correcto en ${TARGET_ENV}"
    }
    failure {
        sh 'kubectl get pods -l app=modulo5168-app || true'
        sh 'kubectl describe deployment modulo5168-app || true'
        sh 'kubectl get events --sort-by=.lastTimestamp | tail -n 15 || true'
    }
}
```

Guardar el fichero y subirlo a Gitea:

```bash
git add Jenkinsfile
git commit -m "UT02: etapas de Ansible y verificación del despliegue"
git push
```

### Paso 5 · Ejecutar el pipeline en verde

1. En Jenkins, abrir el pipeline y pulsar *Build with Parameters*.
2. Elegir `TARGET_ENV=dev` e `IMAGE_TAG=1.0.0` y lanzar el build.
3. Abrir *Stage View* y esperar a que ambas etapas pasen a verde.
4. Abrir *Console Output* y localizar: la línea `+ ansible-playbook ...`, el `PLAY RECAP` y la línea `successfully rolled out`.
5. Comprobar en el clúster, como en la sesión 8: `kubectl get pods` y `kubectl exec deploy/modulo5168-app -- env | grep APP_VERSION`.

Este es el estado que se entrega. Antes de capturar, comprobar que se ven los nombres de las dos etapas y el número del build.

### Paso 6 · Provocar un fallo de despliegue

Un pipeline que nunca ha fallado no demuestra que verifique algo. Se fuerza un error con una versión de imagen que no existe:

1. Lanzar *Build with Parameters* con `IMAGE_TAG=9.9.9`.
2. Observar que la etapa de Ansible puede pasar a verde (el playbook solo actualiza el Deployment) y que **la de verificación se queda esperando hasta el timeout** y se pone en rojo.
3. En *Console Output*, localizar la línea de error de `rollout status` y la salida del bloque `post { failure }`.
4. En el clúster, ver el estado del Pod nuevo: `kubectl get pods`. Aparecerá `ErrImagePull` o `ImagePullBackOff`.
5. Ver la causa exacta: `kubectl describe pod <nombre-del-pod-nuevo>` y leer *Events*.
6. Comprobar que la aplicación antigua sigue atendiendo: durante un *rolling update* fallido, Kubernetes no retira los Pods antiguos hasta que los nuevos estén listos.

Conclusión para comentar en voz alta: la verificación no la hace Ansible; la hace Kubernetes, y es `rollout status` quien traslada ese resultado a Jenkins como código de salida.

### Paso 7 · Diagnosticar, corregir y volver al verde

1. Anotar el motivo del fallo (imagen o etiqueta inexistente).
2. Dejar el clúster limpio: `kubectl rollout undo deployment/modulo5168-app` y esperar con `kubectl rollout status`.
3. Lanzar de nuevo el pipeline con `IMAGE_TAG=1.0.0` y comprobar que vuelve a verde.
4. Revisar el historial: `kubectl rollout history deployment/modulo5168-app` muestra las revisiones creadas.

En Jenkins, el build rojo permanece en el historial junto al verde: es la evidencia del fallo detectado y de la corrección.

### Paso 8 · Captura del entregable

La captura debe mostrar la vista del pipeline con las dos etapas, *Configurar entorno (Ansible)* y *Verificar despliegue sin errores*, en verde, y el número de build visible. Guardarla como `s09_pipeline_<apellido>.png`.

### Ampliación opcional

- Añadir una tercera etapa que repita la verificación de la sesión 8 de forma automática, fallando si el valor no coincide: `sh "kubectl exec deploy/modulo5168-app -- env | grep APP_VERSION=${IMAGE_TAG}"`.
- Añadir `ansible-playbook ... --syntax-check` como etapa previa barata, para detectar errores de sintaxis antes de tocar el clúster.
- Hacer que el bloque `post { failure }` ejecute `kubectl rollout undo` automáticamente y comentar ventajas e inconvenientes.
- Cambiar `TARGET_ENV` a `pre` y comprobar qué parámetros del playbook cambian.

## Errores frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `ansible-playbook: command not found` | Ansible no está instalado en el agente de Jenkins | Instalarlo en la imagen o máquina del agente y reiniciar Jenkins |
| `kubectl: command not found` | `kubectl` no está en el `PATH` del agente | Instalarlo o usar la ruta completa en el `sh` |
| `The connection to the server localhost:8080 was refused` | Jenkins no encuentra el `kubeconfig` | Copiar el `kubeconfig` al usuario de Jenkins o definir `KUBECONFIG` |
| `Could not match supplied host pattern` o `inventory ... not found` | El `sh` no se ejecuta en `lab/ansible` o el inventario no existe | Revisar `dir('lab/ansible')` y el nombre de `inventory.ini` |
| `target_env` o `app_version` aparecen vacías | El parámetro no existe o se llama distinto | Revisar el bloque `parameters` y los nombres en `-e` |
| `-e` interpretado como varios argumentos | Faltan las comillas simples alrededor de las variables | `-e 'target_env=... app_version=...'` |
| Etapa de verificación en verde con una imagen errónea | El Deployment no cambió (no hubo rollout) o falta el `--timeout` | Comprobar que el playbook actualiza el Deployment y que se usa `rollout status` |
| `rollout status` espera sin terminar | Pods en `Pending`, `ImagePullBackOff` o sin *Ready*, y sin `--timeout` | Añadir `--timeout=120s` y revisar los eventos del Pod |
| `error: timed out waiting for the condition` | Se alcanzó el timeout porque el Pod no llega a *Ready* | `kubectl describe pod` y corregir la causa; después `rollout undo` si es necesario |
| `Permission denied` al ejecutar `kubectl` o `ansible` | El usuario de Jenkins no tiene permisos sobre el `kubeconfig` o las claves | Ajustar permisos del fichero y propietario |
| El pipeline no arranca tras el `git push` | El job no está enlazado al repositorio de Gitea o no se ha configurado el disparador | Revisar el origen del `Jenkinsfile` en el job y lanzar el build manualmente |
| `groovy.lang.MissingPropertyException: No such property: IMAGE_TAG` | El parámetro no está definido en `parameters` ni en `environment` | Definirlo y volver a lanzar; la primera ejecución tras cambiar `parameters` puede requerir un build previo para registrarlos |

## Entregable y evaluación

**Entregable:** una captura del pipeline en Jenkins con las etapas *Configurar entorno (Ansible)* y *Verificar despliegue sin errores* en verde, subida a Aules.

| Criterio | Qué se observa | Peso |
| --- | --- | --- |
| Etapas en verde | Las dos etapas aparecen completadas correctamente en la misma ejecución | 50 % |
| Identificación | Se ven los nombres de las etapas y el número de build; el nombre del archivo sigue el formato indicado | 15 % |
| Parámetros | Se puede ver con qué `TARGET_ENV` e `IMAGE_TAG` se lanzó (en la consola o en el detalle del build) | 15 % |
| Fallo diagnosticado | Describe en pocas líneas qué falló en el paso 6 y cómo lo identificó | 20 % |

Pesos orientativos; ajustables a la rúbrica de la UT02.

### Preguntas de repaso

1. ¿Cómo sabe Jenkins que un paso `sh` ha fallado?
2. ¿Por qué es necesario `--timeout` en `kubectl rollout status` dentro de un pipeline?
3. ¿Qué diferencia hay entre que `kubectl apply` termine bien y que el despliegue sea correcto?
4. ¿Por qué `rollout status` podría dar verde aunque los parámetros no hayan llegado al Pod? ¿Cómo se evita?
5. ¿Qué papel tiene el bloque `post { failure }` y por qué sus comandos llevan `|| true`?
6. ¿Qué precedencia tiene `-e` en Ansible y por qué se usa para recibir parámetros de Jenkins?
7. ¿Por qué un pipeline que nunca falla no demuestra que verifique algo?

**Soluciones breves:** (1) por el código de salida: distinto de 0 es fallo. (2) sin él, si el Pod no llega a estar listo el comando espera y el build se queda colgado. (3) `apply` solo registra el cambio; el despliegue puede fallar después, y lo detecta `rollout status`. (4) si el Deployment no cambia no hay rollout y el comando devuelve 0 enseguida; se evita con `rollout restart` o con una anotación con el hash del ConfigMap. (5) muestra el estado del clúster cuando falla; `|| true` evita que un fallo en el propio diagnóstico oculte el error original. (6) es la de mayor prioridad y sobrescribe cualquier otra variable, así el valor lanzado desde Jenkins manda. (7) porque nadie ha comprobado que el rojo aparece cuando debe; hay que provocar el fallo para validarlo.

---

[← Sesión 8](sesion8.md) · [Índice de la UT02](./) · [Sesión 10 →](sesion10.md)
