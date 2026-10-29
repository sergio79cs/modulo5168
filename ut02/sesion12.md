{% raw %}
[← Sesión 11](sesion11.md) · [Índice de la UT02](./)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 12 — Práctica integradora y cierre

Martes 12 de enero · Criterio RA2.a–d

**Módulo 5168 · Definición de flujos de procesos de despliegue continuo · UT2**

Repaso de los 4 criterios a-d.

Cada alumno/a ejecuta el flujo completo de la UT2 sobre su propio pipeline: validación de parámetros (a), recopilación por entorno con Ansible (b), verificación del despliegue sin errores (c) y manejo de errores con limpieza de objetos intermedios provocando un fallo real (d).

Entrega y revisión en el momento contra la rúbrica del [índice de la UT02](./). Cierre de la UT2 y enlace con la UT3 (RA3: despliegue de la nueva versión), que parte de este mismo entorno ya preparado.

---

## 0. Cómo usar este documento

Este documento contiene todo lo necesario para dar la sesión sin improvisar:

- **Apartados 1 a 4:** lo que se proyecta y se cuenta (objetivos, preparación, estructura y repaso de los criterios).
- **Apartado 5:** la práctica paso a paso para el alumnado, con la salida que debe aparecer en cada punto de control.
- **Apartados 6 a 9:** variantes de fallo, entrega y revisión, errores frecuentes y cierre.
- **Apartado 10 y anexos:** notas del profesor, cómo se ha probado y el código completo del laboratorio.

Junto a este documento se entrega la carpeta `lab/` ([descargar `lab.zip`](sesion12/lab.zip)) (Jenkinsfile, playbook de Ansible, inventarios y manifiesto) lista para copiar al repositorio de cada alumno/a, y la carpeta `profesor/` con el simulador y la batería de pruebas usados para comprobar que todo funciona.

> **Nota sobre las salidas de ejemplo.** Las salidas que aparecen en el documento proceden de la ejecución de prueba descrita en el apartado 10. Jenkins mostrará además sus propios prefijos y marcas de tiempo, y los nombres de los pods tendrán otros sufijos. Lo importante es reconocer las líneas señaladas.

---

## 1. Objetivos de la sesión

Al terminar, cada alumno/a habrá ejecutado de principio a fin, sobre su propio pipeline de Jenkins, el flujo completo de la UT2 recorriendo los cuatro criterios.

| Criterio | Qué demuestra | Evidencia que debe quedar |
|---|---|---|
| **a)** Validación de parámetros | El pipeline rechaza entradas incorrectas antes de tocar nada | Ejecuciones rechazadas con mensaje claro y una ejecución aceptada |
| **b)** Recopilación por entorno con Ansible | La información de cada entorno se obtiene con inventarios y variables propias, no a mano | Fichero JSON de cada entorno y `PLAY RECAP` con `failed=0` en el log |
| **c)** Verificación del despliegue sin errores | Se comprueba con datos que el despliegue ha funcionado, y la comprobación puede fallar | Etapa de verificación en verde y comprobación manual con `kubectl` y `curl` |
| **d)** Manejo de errores y limpieza | Ante un fallo real, el pipeline se detiene de forma controlada y no deja restos | Ejecución en rojo, log del bloque `post` y comparación antes/después del clúster |

Esta sesión no incorpora contenido nuevo. Es una sesión de integración: el alumnado reutiliza lo visto en las sesiones anteriores y lo ensambla en un único flujo.

### Lo que el alumnado sabrá hacer al salir

1. Escribir una etapa de validación que rechace parámetros vacíos, mal formados o incoherentes con el entorno.
2. Usar un único playbook de Ansible para varios entornos cambiando solo el inventario.
3. Hacer que los datos recopilados alimenten las etapas siguientes del pipeline.
4. Verificar un despliegue con el estado real del clúster y con una petición HTTP.
5. Colocar la limpieza en `post` para que se ejecute siempre, y demostrar con una comparación antes/después que no quedan restos.

---

## 2. Preparación

### 2.1 Para el profesor/a, antes de la sesión

1. **Hacer un ensayo completo en una `.ova` limpia** siguiendo el apartado 5. La prueba de este documento se hizo con un simulador (apartado 10); el ensayo en la `.ova` es lo que confirma el comportamiento con el Jenkins y el clúster reales.
2. **Precargar las imágenes** en el clúster de la `.ova` para que la sesión no dependa de la red del aula: `nginx:1.26.0`, `nginx:1.26.1` y `nginx:1.27.0`. Con `kind` se cargan con `kind load docker-image`, con `minikube` con `minikube image load`.
3. **Comprobar que `jenkins` puede ejecutar todo** (apartado 2.2). Es el fallo más frecuente.
4. Tener a mano la rúbrica del [índice de la UT02](./) (apartado «Cómo se evalúa»), proyectada o impresa.
5. Subir a Aules los ficheros de `lab/` o dejarlos en el repositorio de la web del módulo para que el alumnado los copie.

### 2.2 En la VM de cada alumno/a

Herramientas necesarias y comprobación como el usuario que ejecuta Jenkins:

```bash
sudo apt-get install -y ansible jq gettext-base curl
sudo -u jenkins bash -c 'ansible --version | head -1; jq --version; envsubst --version | head -1; curl --version | head -1; kubectl get nodes'
```

Los cinco comandos deben responder sin error. La versión de Ansible debe ser la 2.10 o posterior. Si `kubectl get nodes` falla para `jenkins`, falta su `kubeconfig` (apartado 8).

Además, cada alumno/a necesita:

- Su repositorio en Gitea y un job de Jenkins de tipo *Pipeline script from SCM* que apunte a él (ruta del script: `Jenkinsfile`).
- Los ficheros de `lab/` copiados en la raíz de su repositorio, o adaptados a lo que construyó en sesiones anteriores.

### 2.3 Valores de referencia del laboratorio

| Entorno | Namespace | Puerto (NodePort) | Réplicas |
|---|---|---|---|
| `dev` | `app-dev` | 30081 | 1 |
| `pre` | `app-pre` | 30082 | 2 |
| `pro` | `app-pro` | 30083 | 3 |

Versiones de la imagen que se usarán: `1.26.0`, `1.26.1`, `1.27.0`. La versión `9.9.9` **no existe** y se usa para provocar el fallo de la variante A.

> **Dependencia del clúster.** La comprobación HTTP del Jenkinsfile llama a `http://$HOST_ACCESO:$PUERTO_APP/`. Eso funciona si los NodePort son accesibles desde la VM en `localhost`. Si el clúster de la `.ova` los expone en otra dirección (por ejemplo la IP de `minikube ip`), se cambia `host_acceso` en los tres ficheros `group_vars/all.yml`. No hay que tocar el Jenkinsfile.

---

## 3. Estructura de la sesión

La sesión se organiza en cuatro bloques consecutivos. El ritmo lo marca el avance del alumnado.

1. **Arranque y repaso guiado** (apartado 4): se repasan los criterios a-d con ejemplos mínimos de código y una pregunta de comprobación cada uno.
2. **Práctica integradora** (apartado 5): siete fases encadenadas (de la 0 a la 6) con un punto de control al final de cada una. Es el núcleo de la sesión.
3. **Entrega y revisión** (apartado 7): se revisa a cada alumno/a contra la rúbrica del [índice de la UT02](./), en el momento.
4. **Cierre de la UT2 y enlace con la UT3** (apartado 9).

---

## 4. Bloque 1 · Repaso guiado de los criterios a-d

Se proyecta cada criterio con su ejemplo. Después de cada uno, el alumnado responde en voz alta o en un papel a la pregunta de comprobación. Las respuestas modelo están en el apartado 7.4.

### a) Validación de parámetros

Un pipeline parametrizado no debe fiarse de lo que recibe. La validación se hace en la **primera etapa**, antes de crear ningún objeto, para que un parámetro erróneo no deje restos que limpiar.

```groovy
parameters {
    choice(name: 'ENTORNO', choices: ['dev', 'pre', 'pro'], description: 'Entorno de destino')
    string(name: 'VERSION', defaultValue: '', description: 'Versión a desplegar (formato X.Y.Z)')
    booleanParam(name: 'CONFIRMAR_PRO', defaultValue: false, description: 'Obligatorio para desplegar en pro')
}

stage('Validar parámetros') {
    steps {
        script {
            if (!params.VERSION?.trim()) {
                error('VERSION está vacío. Indica una versión con formato X.Y.Z')
            }
            if (!(params.VERSION ==~ /^\d+\.\d+\.\d+$/)) {
                error("VERSION '${params.VERSION}' no cumple el formato X.Y.Z")
            }
            if (params.ENTORNO == 'pro' && !params.CONFIRMAR_PRO) {
                error('Para desplegar en pro hay que marcar CONFIRMAR_PRO')
            }
        }
    }
}
```

**Ideas clave**

- `choice` limita las opciones en la interfaz, pero no basta: quien lance el job por API puede enviar otro valor. Por eso el Jenkinsfile completo también comprueba `ENTORNO` contra la lista.
- `error()` aborta el pipeline con un mensaje claro. Un buen mensaje dice qué parámetro falla y qué se esperaba.
- La expresión `==~` exige que **toda** la cadena cumpla el patrón. Por eso `1.2.3-rc1` y ` 1.26.0` (con un espacio delante) se rechazan.
- Validar en la primera etapa evita trabajo inútil y evita ensuciar el entorno.

**Pregunta de comprobación:** ¿por qué no basta con el desplegable `choice` para garantizar que el entorno es válido?

### b) Recopilación por entorno con Ansible

La información que cambia entre entornos (hosts, puertos, réplicas, namespace) no va dentro del Jenkinsfile. Va en **inventarios y variables por entorno**, y Ansible la recopila.

```
ansible/
├── ansible.cfg
├── inventories/
│   ├── dev/  ├── hosts.ini
│   │         └── group_vars/all.yml
│   ├── pre/  ├── hosts.ini
│   │         └── group_vars/all.yml
│   └── pro/  ├── hosts.ini
│             └── group_vars/all.yml
└── playbooks/
    └── recopilar.yml
```

Variables del entorno `dev` (`group_vars/all.yml`):

```yaml
entorno_inventario: dev
k8s_namespace: app-dev
puerto_app: 30081
replicas: 1
host_acceso: localhost
```

Fragmento esencial del playbook (el completo está en el anexo A):

```yaml
- name: Comprobar que el inventario corresponde al entorno pedido
  ansible.builtin.assert:
    that:
      - entorno == entorno_inventario

- name: Guardar el resumen del entorno
  ansible.builtin.copy:
    dest: "{{ salida }}/{{ entorno }}.json"
    content: "{{ resumen | to_nice_json }}\n"
  delegate_to: localhost
  run_once: true
```

**Ideas clave**

- Un mismo playbook sirve para todos los entornos. Lo único que cambia es el inventario que se le pasa con `-i`.
- El `assert` protege de un error típico: pedir `pre` y apuntar al inventario de `dev`.
- El resultado se guarda como JSON en el directorio temporal de la ejecución. Esos ficheros **alimentan las etapas siguientes** (el Jenkinsfile lee con `jq` el namespace, el puerto y las réplicas) y son **objetos intermedios** que el criterio d) obliga a limpiar.
- Como cada alumno/a tiene una sola VM, los tres entornos son tres namespaces del mismo clúster. El mecanismo es idéntico al de entornos en máquinas distintas.

**Pregunta de comprobación:** si mañana se añade un entorno `test`, ¿qué hay que crear y qué no hay que tocar?

### c) Verificación del despliegue sin errores

Que un comando termine sin error no significa que el servicio funcione. La verificación comprueba el **estado real** después de desplegar.

```bash
kubectl -n "$NAMESPACE" rollout status deployment/app --timeout="$TIMEOUT_VERIF"
kubectl -n "$NAMESPACE" get pods -l app=app
LISTOS=$(kubectl -n "$NAMESPACE" get deployment app -o jsonpath='{.status.readyReplicas}')
[ "$LISTOS" = "$REPLICAS" ] || { echo "ERROR: réplicas listas distinto de esperadas"; exit 1; }
curl --fail --silent --show-error --max-time 10 -o /dev/null \
     -w "Respuesta HTTP %{http_code}\n" "http://$HOST_ACCESO:$PUERTO_APP/"
```

**Ideas clave**

- `kubectl apply` termina en cuanto el clúster **acepta** el manifiesto, no cuando la aplicación funciona. Por eso hace falta esperar con `rollout status`.
- Se compara el número de réplicas listas con el que Ansible recopiló para ese entorno.
- `curl --fail` devuelve error si la respuesta HTTP es 4xx o 5xx. Sin `--fail`, un error 500 pasaría como éxito.
- Un pipeline en verde solo es fiable si la etapa de verificación **puede fallar de verdad**.

**Pregunta de comprobación:** ¿qué diferencia hay entre «`kubectl apply` ha terminado» y «el despliegue está bien»?

### d) Manejo de errores y limpieza de objetos intermedios

El pipeline debe prever que algo falle y dejar el sistema limpio en cualquier caso. En Jenkins declarativo esto se hace con `post`.

```groovy
post {
    always {
        // borra el directorio temporal de ESTA ejecución
        sh '''
            case "$WORKDIR" in
                */tmp-*) rm -rf "$WORKDIR" ;;
            esac
        '''
    }
    failure {
        // diagnóstico y borrado de lo que creó ESTA ejecución
        sh '''
            if [ -n "$NAMESPACE" ]; then
                kubectl -n "$NAMESPACE" get pods -l build="$BUILD_NUMBER" || true
                kubectl -n "$NAMESPACE" delete deployment,service -l build="$BUILD_NUMBER" --ignore-not-found
            else
                echo "No se había llegado a desplegar nada: no hay recursos que limpiar"
            fi
        '''
    }
}
```

**Ideas clave**

- `always` se ejecuta tanto si el pipeline va bien como si falla. El directorio temporal se borra siempre.
- `failure` solo se ejecuta si algo falla. Ahí se hace el diagnóstico y se borra lo que desplegó esa ejecución.
- Todos los recursos llevan la etiqueta `build=<número>`. Así se limpia solo lo de la ejecución que ha fallado.
- La limpieza es **idempotente**: si el objeto no existe, no da error (`--ignore-not-found`, `|| true`).
- La limpieza **no pisa lo que no ha creado**: si el fallo ocurre antes de desplegar, `NAMESPACE` está vacío y no se toca nada.
- El `case` que protege el `rm -rf` evita borrar una ruta inesperada si `WORKDIR` llegara vacío.

**Pregunta de comprobación:** ¿qué pasaría si la limpieza de recursos estuviera en `success` en lugar de en `failure`?

---

## 5. Bloque 2 · Práctica integradora paso a paso

Cada alumno/a trabaja sobre su pipeline. Las fases se hacen en orden y cada una acaba con un **punto de control** antes de pasar a la siguiente.

### Fase 0 · Preparar el repositorio y el job

1. Copia a la raíz de tu repositorio de Gitea las carpetas y ficheros de `lab/`: `Jenkinsfile`, `ansible/` y `k8s/`.
2. Haz el *commit* y el *push*:
   ```bash
   git add Jenkinsfile ansible k8s
   git commit -m "UT2 sesión 12: flujo integrador"
   git push
   ```
3. En Jenkins, en tu job de tipo *Pipeline script from SCM*, comprueba que la URL del repositorio y la ruta del script (`Jenkinsfile`) son correctas.
4. Pulsa **Construir ahora** una vez. Esta primera ejecución sirve para que Jenkins registre los parámetros; puede fallar en la validación porque aún no hay valores, y es normal. Recarga la página; ahora aparece **Build with Parameters**.

**Punto de control:** el job muestra *Build with Parameters* con los tres parámetros `ENTORNO`, `VERSION` y `CONFIRMAR_PRO`.

### Fase 1 · Leer y entender el flujo

Antes de ejecutar nada, abre el `Jenkinsfile` y localiza, **anotando el número de línea**, estos cinco elementos:

1. El bloque `parameters`.
2. La etapa que valida (criterio a).
3. La etapa que llama a Ansible (criterio b).
4. La etapa que verifica (criterio c).
5. El bloque `post` con `always` y `failure` (criterio d).

Responde por escrito en tu documento de evidencias:

- ¿Qué variable guarda el directorio temporal y por qué incluye `BUILD_NUMBER`?
- ¿De dónde sale el valor de `NAMESPACE` que usa la etapa de despliegue?

**Punto de control:** tienes los cinco números de línea y las dos respuestas. (Respuestas: `WORKDIR`, incluye `BUILD_NUMBER` para que cada ejecución tenga el suyo y no se pisen; `NAMESPACE` sale del JSON que genera Ansible, leído con `jq`.)

### Fase 2 · Criterio a): validación de parámetros

Lanza **Build with Parameters** cuatro veces, con estos valores:

| Intento | `ENTORNO` | `VERSION` | `CONFIRMAR_PRO` | Resultado esperado |
|---|---|---|---|---|
| 1 | `dev` | *(vacío)* | no | Falla: `VERSION está vacío` |
| 2 | `dev` | `1.2` | no | Falla: `no cumple el formato X.Y.Z` |
| 3 | `pro` | `1.26.0` | no | Falla: `hay que marcar CONFIRMAR_PRO` |
| 4 | `dev` | `1.26.0` | no | Supera la validación |

En los tres primeros intentos, el log debe tener este aspecto (ejemplo del intento 2):

```
[Pipeline] { (Validar parámetros)
ERROR: VERSION '1.2' no cumple el formato X.Y.Z
[Pipeline] Stage 'Recopilar por entorno' skipped due to earlier failure(s)
[Pipeline] Stage 'Desplegar' skipped due to earlier failure(s)
[Pipeline] Stage 'Verificar despliegue' skipped due to earlier failure(s)
```

Fíjate en que **las etapas siguientes se saltan**: Ansible ni se ejecuta, y no se crea nada. En el bloque `post` verás además:

```
No se había llegado a desplegar nada: no hay recursos que limpiar
```

El intento 4 sí avanza y despliega en `dev`. Déjalo terminar: lo necesitas en la fase 3.

**Prueba extra (recomendada):** lanza `VERSION = 1.2.3-rc1` y después una `VERSION` con un espacio delante del número (` 1.26.0`). Las dos se rechazan. Explica por qué.

**Punto de control:** tienes capturas de la vista de etapas de los tres rechazos, cada uno con un mensaje distinto, y de la ejecución aceptada.

### Fase 3 · Criterio b): recopilación por entorno con Ansible

1. Abre el log de la ejecución del intento 4 (`dev`) y localiza la etapa **Recopilar por entorno**. Debes ver:

   ```
   TASK [Comprobar que el inventario corresponde al entorno pedido] ***************
   ok: [localhost] => {
       "msg": "Inventario correcto para el entorno dev"
   }
   TASK [Guardar el resumen del entorno] ******************************************
   changed: [localhost]
   PLAY RECAP *********************************************************************
   localhost : ok=3    changed=1    unreachable=0    failed=0    skipped=0 ...
   ```

   y a continuación el JSON que ha generado:

   ```
   {
       "entorno": "dev",
       "host": "localhost",
       "host_acceso": "localhost",
       "namespace": "app-dev",
       "puerto_app": 30081,
       "replicas": 1,
       "sistema": "Ubuntu 24.04"
   }
   ```

2. Lanza ahora `ENTORNO = pre`, `VERSION = 1.27.0`. El **mismo playbook** produce otro resultado:

   ```
   {
       "entorno": "pre",
       "host": "localhost",
       "host_acceso": "localhost",
       "namespace": "app-pre",
       "puerto_app": 30082,
       "replicas": 2,
       "sistema": "Ubuntu 24.04"
   }
   ```

3. **Comprueba la protección del `assert`.** En `ansible/inventories/pre/group_vars/all.yml` cambia `entorno_inventario: pre` por `entorno_inventario: dev`, haz *commit* y *push*, y lanza `pre` otra vez. Debe fallar en la recopilación con:

   ```
   Se pidió 'pre' pero el inventario es de 'dev'
   ```

   Después **deshaz el cambio** con `git revert HEAD` y `git push`.

**Punto de control:** tienes el JSON de dos entornos con valores distintos obtenidos con el mismo playbook, y la captura del `assert` rechazando el inventario cruzado. El repositorio vuelve a estar como al principio.

### Fase 4 · Criterio c): despliegue y verificación

1. Lanza `ENTORNO = dev`, `VERSION = 1.26.0`. Debe terminar en **verde**. En la etapa **Verificar despliegue** localiza:

   ```
   deployment "app" successfully rolled out
   NAME           READY   STATUS    RESTARTS
   app-xxxxx-00   1/1     Running   0
   Respuesta HTTP 200
   ```

2. **Comprueba fuera de Jenkins** que el resultado es real. En la terminal de la VM:

   ```bash
   kubectl -n app-dev get all
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:30081/
   ```

   Debe aparecer el *deployment*, el *service* y el pod en `Running`, y el `curl` debe devolver `200`.

3. Escribe en tu documento de evidencias qué comprueba exactamente cada una de las tres comprobaciones de la etapa (`rollout status`, réplicas listas y `curl --fail`) y qué fallo detectaría cada una que las otras no.

4. **Reto: demuestra que la verificación puede fallar.** En el `Jenkinsfile`, cambia temporalmente la dirección del `curl` por `http://$HOST_ACCESO:$((PUERTO_APP+1))/` (un puerto donde no escucha nadie), haz *commit* y *push*, y lanza `dev` otra vez. Debe terminar en **rojo** con:

   ```
   curl: (7) Failed to connect to localhost port 30082 ...
   ERROR: script returned exit code 7
   ```

   Después **deshaz el cambio** con `git revert HEAD` y `git push`. Ten en cuenta que esta ejecución fallida limpia también el despliegue de `dev` (ver el aviso del apartado 6); vuelve a lanzar `dev` con éxito para dejarlo como estaba.

**Punto de control:** un despliegue en verde comprobado con tus propios comandos y, si has hecho el reto, un rojo provocado por la verificación.

### Fase 5 · Criterio d): fallo real y limpieza

Esta fase es la más importante de la sesión. El fallo tiene que ser **real**, no un `error('prueba')` escrito a mano, y tiene que producirse **después** de que existan objetos intermedios, para que la limpieza tenga algo que limpiar. El profesor/a asigna una variante (apartado 6) o la elige cada equipo. Todos siguen estos pasos:

1. **Foto del estado de partida.** Antes de lanzar, guarda la salida de:
   ```bash
   kubectl -n app-pro get all
   ls /var/lib/jenkins/workspace/<nombre-de-tu-job>/
   ```
   Para la variante A debe aparecer `No resources found in app-pro namespace.` y ningún directorio `tmp-*` en el *workspace*.
2. **Provoca el fallo** siguiendo la variante (apartado 6) y lanza el job.
3. **Observa el rojo.** Localiza en el log, por este orden: la etapa que falla, el mensaje de error, el bloque `post` de `always` (borra el directorio temporal) y el de `failure` (diagnóstico y borrado de recursos).
4. **Foto del estado final.** Repite los dos comandos del paso 1. Compara.
5. **Corrige** el origen del fallo y lanza de nuevo: debe terminar en verde.

La salida del bloque `post` en la variante A es esta:

```
=== Limpieza tras el fallo de la ejecución 20 ===
+ kubectl -n app-pro get pods -l build=20
NAME           READY   STATUS             RESTARTS
app-xxxxx-00   0/1     ImagePullBackOff   0
app-xxxxx-01   0/1     ImagePullBackOff   0
app-xxxxx-02   0/1     ImagePullBackOff   0
+ kubectl -n app-pro delete deployment,service -l build=20 --ignore-not-found
deployment.apps "app" deleted
service "app" deleted
El despliegue de 9.9.9 en pro ha fallado. Revisa la etapa que está en rojo.
```

**Punto de control:** tienes un *build* en rojo con la limpieza ejecutada, la comparación antes/después sin diferencias en recursos ni directorios, y un *build* posterior en verde.

### Fase 6 · Documento de evidencias

Reúne en un único documento las capturas y respuestas de las fases 1 a 5 siguiendo la plantilla del apartado 7.1. Súbelo a Aules o enséñalo en pantalla en la revisión.

---

## 6. Variantes de fallo real para la fase 5

Cada variante falla en un punto distinto, y eso permite comparar qué hay que limpiar en cada caso.

| Variante | Cómo provocarla | Dónde falla | Qué se observa |
|---|---|---|---|
| **A. Imagen inexistente** | Lanzar `pro`, `VERSION = 9.9.9`, marcando `CONFIRMAR_PRO` | Verificar despliegue | Los pods quedan en `ImagePullBackOff` y `rollout status` termina con `timed out waiting for the condition` |
| **B. Host inaccesible** | Cambiar `ansible/inventories/pre/hosts.ini` (ver más abajo), *commit* y *push*, lanzar `pre` | Recopilar por entorno | Ansible informa `UNREACHABLE` |
| **C. Puerto ocupado** | Crear un Service que use el puerto de `pro` y lanzar `pro` | Desplegar | `provided port is already allocated` |

### Variante A · Imagen inexistente (recomendada para empezar)

Es la más didáctica: el fallo aparece en la última etapa, cuando ya existen el directorio temporal, el JSON de Ansible y los recursos desplegados. No requiere tocar el repositorio.

Parámetros: `ENTORNO = pro`, `VERSION = 9.9.9`, `CONFIRMAR_PRO` marcado. Se usa `pro` porque su *namespace* está vacío y la comparación antes/después es limpia.

Salida clave:

```
+ kubectl -n app-pro rollout status deployment/app --timeout=60s
Waiting for deployment "app" rollout to finish: 0 of 3 updated replicas are available...
error: timed out waiting for the condition
ERROR: script returned exit code 1
```

> En un clúster real, `rollout status` espera hasta agotar `TIMEOUT_VERIF` antes de fallar, así que la etapa de verificación tarda en ponerse en rojo. Es normal. Aprovecha esa espera para que el alumnado ejecute en otra terminal `kubectl -n app-pro get pods -w` y vea el pod pasar a `ErrImagePull` y `ImagePullBackOff`.

### Variante B · Host inaccesible

Sustituye el contenido de `ansible/inventories/pre/hosts.ini` por:

```ini
[servidores]
servidor-roto ansible_host=192.0.2.10 ansible_connection=ssh ansible_user=nadie
```

(La dirección `192.0.2.10` pertenece a un rango reservado para documentación: no responde nunca.) Haz *commit* y *push*, y lanza `ENTORNO = pre`, `VERSION = 1.27.0`.

Salida clave:

```
TASK [Gathering Facts] *********************************************************
fatal: [servidor-roto]: UNREACHABLE! => {... "msg": "Task failed: Failed to connect to the host via ssh: ... No route to host" ...}
ERROR: script returned exit code 4
[Pipeline] Stage 'Desplegar' skipped due to earlier failure(s)
...
No se había llegado a desplegar nada: no hay recursos que limpiar
```

Aquí lo interesante es que **no existen** recursos en el clúster, y aun así `always` borra el directorio temporal que sí se creó. Después, `git revert HEAD` y `git push`.

### Variante C · Puerto ocupado

Antes de lanzar, crea un Service ajeno que ocupe el NodePort de `pro`:

```bash
kubectl -n default create service nodeport otro --node-port=30083 --tcp=80
```

Lanza `ENTORNO = pro`, `VERSION = 1.26.0`, marcando `CONFIRMAR_PRO`.

Salida clave:

```
namespace/app-pro created
deployment.apps/app created
The Service "app" is invalid: spec.ports[0].nodePort: Invalid value: 30083: provided port is already allocated
ERROR: script returned exit code 1
```

Es el caso ideal para ver un **despliegue a medias**: el *Deployment* se creó y el *Service* no. El bloque `failure` borra el *Deployment*. Al terminar, retira el Service ajeno:

```bash
kubectl -n default delete service otro
```

### Aviso importante: el fallo sobre un entorno ya desplegado

La limpieza borra los recursos con la etiqueta de **la ejecución que falla**. Si el entorno ya tenía un despliegue anterior en verde, el *Deployment* se llama igual (`app`), `kubectl apply` lo actualiza con la etiqueta de la nueva ejecución, y la limpieza lo borra: **el fallo se lleva también la versión anterior que funcionaba**. Salida de la prueba, con `dev` ya desplegado con `1.26.0` y un fallo con `9.9.9`:

```
+ kubectl -n app-dev delete deployment,service -l build=31 --ignore-not-found
deployment.apps "app" deleted
service "app" deleted
```

Por eso en la sesión los fallos se provocan sobre un entorno vacío (`pro`). Este límite no es un descuido: **es el punto de partida de la UT3**. Desplegar una nueva versión sobre otra en producción exige conservar la anterior y volver a ella con `kubectl rollout undo`. Se menciona en el cierre (apartado 9).

---

## 7. Bloque 3 · Entrega y revisión en el momento

La revisión se hace durante la propia sesión, mesa por mesa, contra la rúbrica del [índice de la UT02](./). No hay corrección posterior.

### 7.1 Qué entrega cada alumno/a

1. **El repositorio de Gitea** con el `Jenkinsfile` final y los ficheros de `ansible/` y `k8s/` (el profesor/a lo ve en su pantalla).
2. **Un documento de evidencias** con esta estructura:

   | Apartado | Contenido |
   |---|---|
   | Criterio a) | Capturas de tres rechazos con mensajes distintos y de una ejecución aceptada |
   | Criterio b) | `PLAY RECAP` con `failed=0` y JSON de `dev` y de `pre` con valores distintos; captura del `assert` con el inventario cruzado |
   | Criterio c) | Etapa de verificación en verde, salida de `kubectl -n app-dev get all` y del `curl` hechos a mano; respuesta a la pregunta de la fase 4 |
   | Criterio d) | Variante elegida; captura del rojo; salida del bloque `post`; estado del clúster y del *workspace* antes y después |
   | Pregunta final | Respuesta por escrito a la pregunta de cierre (apartado 7.4) |

### 7.2 Cómo se revisa

1. El profesor/a se sienta junto al alumno/a y le pide que **ejecute el pipeline en directo** con parámetros que decide en ese momento (por ejemplo, una `VERSION` mal formada y después un `pro` sin confirmar).
2. Se recorren los cuatro criterios con la tabla del apartado 1 como lista de verificación.
3. Se hacen dos o tres preguntas orales de comprobación, de las del apartado 7.4. Sirven para distinguir quien entiende el flujo de quien lo ha copiado.
4. Se anota el resultado en la rúbrica y se comenta con el alumno/a qué mejorar.
5. Quien no llega, termina la fase pendiente y se revisa de nuevo al empezar la UT3.

### 7.3 Qué se mira en cada criterio

| Criterio | Se da por logrado si… | Señales de que falta |
|---|---|---|
| **a)** | Valida en la primera etapa, cubre vacío, formato y la regla de `pro`, y los mensajes dicen qué falla | Valida tarde, solo confía en el desplegable, mensajes genéricos |
| **b)** | Un único playbook para todos los entornos y datos en el inventario; los datos recopilados se usan después | Valores de entorno escritos en el Jenkinsfile, un playbook por entorno |
| **c)** | La verificación comprueba estado real (rollout, réplicas, HTTP) y puede fallar; lo ha comprobado a mano | Solo mira que `apply` terminó; `curl` sin `--fail` |
| **d)** | Fallo real, limpieza en `post` con `always` y `failure`, y comparación antes/después sin restos | Fallo escrito a mano, limpieza solo en el caso de éxito, sin comparación |

> Este cuadro es una guía de observación. Los niveles y la puntuación de cada criterio son los de la rúbrica del [índice de la UT02](./).

### 7.4 Preguntas orales y respuestas modelo

| Pregunta | Respuesta modelo |
|---|---|
| ¿Por qué no basta el desplegable `choice`? (a) | Porque el job puede lanzarse por API o desde otra herramienta con un valor que no está en la lista. La validación en código es la que protege de verdad |
| Si se añade un entorno `test`, ¿qué se crea y qué no se toca? (b) | Se crea `inventories/test/` con su `hosts.ini` y `group_vars`, y se añade `test` a las opciones del parámetro. No se toca el playbook |
| ¿Diferencia entre «`apply` ha terminado» y «el despliegue está bien»? (c) | `apply` termina cuando el clúster acepta el manifiesto. Que los pods arranquen y respondan hay que comprobarlo con `rollout status`, las réplicas listas y una petición HTTP |
| ¿Qué pasaría si la limpieza de recursos estuviera en `success`? (d) | No se ejecutaría justo cuando hace falta (en un fallo) y los recursos a medias quedarían en el clúster |
| ¿Por qué el directorio temporal se borra en `always` y los recursos en `failure`? (d) | El directorio temporal sobra siempre. Los recursos, si todo va bien, son el resultado que se quiere conservar |
| Si el fallo ocurre en la recopilación, ¿qué hay que limpiar y qué no existe aún? (d) | Solo el directorio temporal. Aún no existen recursos en el clúster ni `NAMESPACE`, y por eso el bloque `failure` lo detecta y no toca nada |
| ¿Por qué la limpieza usa la etiqueta `build`? (d) | Para borrar solo lo creado por esa ejecución y no tocar lo de otras |

**Pregunta final por escrito:** *«Si el fallo hubiera ocurrido en la etapa de recopilación en lugar de en la de verificación, ¿qué objetos habría que limpiar y cuáles no existirían todavía?»*

### 7.5 Atención a distintos ritmos

- **Si alguien va justo:** que consiga el mínimo de cada criterio (una validación de formato, una recopilación de un entorno, una verificación con `rollout status` y `curl`, y la limpieza en `always`) y complete el resto después.
- **Si alguien termina pronto:** retos de ampliación.
  - Hacer la variante A y la C y comparar qué se limpió en cada una.
  - Añadir una validación que compruebe que la imagen existe antes de desplegar.
  - Hacer que el pipeline conserve la versión anterior si falla el despliegue (anticipo de la UT3).
  - Parametrizar el tiempo máximo de espera de la verificación.

---

## 8. Errores frecuentes y cómo resolverlos

Los tres primeros aparecieron al probar el material; el resto son los habituales con esta combinación de herramientas.

| Síntoma | Causa | Solución |
|---|---|---|
| `YAML parsing failed: Values starting with a quote must end with the same quote` en el playbook | Comillas dobles dentro de una cadena entre comillas dobles, como `"{{ ansible_facts["distribution"] }}"` | Usar comillas simples dentro: `"{{ ansible_facts['distribution'] }}"` |
| `Found variable using reserved name 'namespace'` | `namespace` es un nombre reservado en Ansible | Llamar a la variable de otra forma (`k8s_namespace`) |
| Aviso de `INJECT_FACTS_AS_VARS` al usar `ansible_distribution` | En versiones recientes de Ansible los datos de `gather_facts` ya no se inyectan como variables sueltas | Leerlos con `ansible_facts['distribution']`, que funciona en todas las versiones |
| `ansible: command not found` en Jenkins | `jenkins` tiene otro `PATH` o falta el paquete | Comprobar con `sudo -u jenkins which ansible` e instalar el paquete |
| `kubectl` sin permisos o sin clúster para `jenkins` | El usuario `jenkins` no tiene `kubeconfig` | Copiar el `kubeconfig` a `~jenkins/.kube/config` o definir `KUBECONFIG` en el job |
| Los parámetros no aparecen la primera vez | Jenkins los registra al ejecutar el pipeline una vez | Ejecutar una vez, fallar, y recargar la página |
| Ansible ignora `ansible.cfg` | Ansible no lee el `ansible.cfg` de un directorio con permisos de escritura para todos | El Jenkinsfile define `ANSIBLE_CONFIG` con la ruta explícita; no hay que hacer nada |
| `[[: not found` o `Bad substitution` en un `sh` | Jenkins ejecuta `sh` con `/bin/sh`, que en Ubuntu es `dash`, no `bash` | Escribir los scripts en sintaxis POSIX (`[ ]`, sin `[[ ]]` ni `pipefail`) |
| `envsubst` deja `${...}` sin sustituir o sustituye de más | No se indicó la lista de variables o se indicó mal | Pasar la lista exacta a `envsubst`, como hace el Jenkinsfile |
| El pipeline termina en verde cuando la verificación debería fallar | Falta `--fail` en `curl`, o se ha silenciado un error con un `true` al final del comando | Revisar la etapa de verificación |
| La limpieza da error y tapa el fallo original | El objeto ya no existe | Usar `--ignore-not-found` en el borrado y no dejar que un fallo de diagnóstico corte la limpieza |
| `ImagePullBackOff` en una versión que sí existe | La VM no tiene salida a internet y la imagen no está precargada | Cargar la imagen en el clúster (apartado 2.1) |
| El `curl` falla aunque el despliegue está bien | Los NodePort no son accesibles en `localhost` | Cambiar `host_acceso` en los `group_vars` (apartado 2.3) |

---

## 9. Bloque 4 · Cierre de la UT2 y enlace con la UT3

### 9.1 Puesta en común

Se hace a viva voz, con tres preguntas:

- ¿Qué criterio os ha costado más y por qué?
- ¿Qué habría pasado en un entorno real si el pipeline no validara parámetros, no verificara el despliegue o no limpiara tras un fallo?
- ¿Qué os ha enseñado el aviso del apartado 6 sobre fallar encima de un entorno que ya funcionaba?

Idea para fijar: **un pipeline fiable no es el que nunca falla, sino el que falla pronto, avisa con claridad y no deja basura.**

### 9.2 Resumen de la UT2

| Criterio | Qué se ha construido | Dónde está |
|---|---|---|
| a) | Validación en la primera etapa con mensajes claros | Etapa `Validar parámetros` |
| b) | Un playbook, varios inventarios, datos que alimentan el despliegue | `ansible/` y etapa `Recopilar por entorno` |
| c) | Verificación con estado real y petición HTTP | Etapa `Verificar despliegue` |
| d) | Limpieza en `post`, con etiquetas por ejecución | Bloque `post` |

### 9.3 Enlace con la UT3 (RA3: despliegue de la nueva versión)

La UT3 parte de **este mismo entorno ya preparado**: el pipeline parametrizado, los inventarios por entorno y la verificación funcionando. El salto es el siguiente:

- Hasta ahora el pipeline desplegaba «una versión» sobre un entorno vacío. En la UT3 desplegará **la nueva versión sobre una que ya funciona**.
- Entonces la limpieza del apartado 6 deja de servir tal cual: borrar el despliegue fallido borraría también el que estaba en marcha. Habrá que **conservar la versión anterior** y **volver a ella** si la nueva falla (`kubectl rollout undo`), en lugar de borrarlo todo.
- La verificación pasará a ser el criterio que decide si una versión se queda o se retira.

### 9.4 Antes de salir

Cada alumno/a deja su laboratorio en este estado, porque la siguiente sesión parte de él:

- [ ] El pipeline termina en verde con `dev` y una versión válida.
- [ ] Los cambios provocados para los fallos están revertidos en Gitea (`git log` muestra los `revert`).
- [ ] No quedan Services ajenos de las pruebas (`kubectl -n default get svc`).
- [ ] El `Jenkinsfile` final está subido a Gitea.

---

## 10. Notas para el profesor/a

### 10.1 Cómo se ha probado este material

El flujo se ha ejecutado de principio a fin con una batería de **44 comprobaciones automáticas**, todas correctas. El material (Jenkinsfile, playbook, inventarios y manifiesto) está en `lab/`, y la batería, en `profesor/prueba_sesion12.sh`.

**Qué se ha ejecutado de verdad**

- El **Ansible real** (ansible-core 2.21): inventarios, `assert`, `gather_facts`, generación del JSON y error `UNREACHABLE` con un host inalcanzable.
- La **lógica real del Jenkinsfile**: validación con `==~`, lectura del JSON con `jq`, `envsubst` sobre el manifiesto, `post` con `always` y `failure`. Los `sh` se ejecutaron con `/bin/sh -xe`, como hace Jenkins, y se comprobó que los scripts son POSIX.
- El **`curl` real** contra un servidor HTTP local, incluido el caso en que no hay servicio y el `curl` falla.

**Qué se ha simulado**

- **Jenkins:** un ejecutor mínimo (`profesor/simulador/jenkins_simulado.groovy`) interpreta el Jenkinsfile declarativo y respeta el orden `always` → `failure`/`success`. No es Jenkins: no comprueba plugins, permisos ni la interfaz.
- **Kubernetes:** un `kubectl` simulado (`profesor/simulador/bin/kubectl`) guarda el estado en un fichero. Reproduce `ImagePullBackOff` para imágenes inexistentes y el error de NodePort ocupado, con mensajes equivalentes a los del clúster real.
- **Docker** no interviene en este flujo.

**Qué hay que comprobar en el ensayo con la `.ova`**

1. Que `sudo -u jenkins` puede ejecutar `ansible`, `jq`, `envsubst`, `curl` y `kubectl` (apartado 2.2).
2. Que los NodePort `30081`, `30082` y `30083` responden en `localhost` desde la VM.
3. Que las imágenes de `nginx` precargadas se descargan o existen en el clúster.
4. Que el formato de la salida de `kubectl` y de Jenkins coincide con lo mostrado (puede haber diferencias de columnas y prefijos).
5. Que la variante A tarda lo que marca `TIMEOUT_VERIF` en ponerse en rojo.

**Pruebas realizadas**

| Grupo | Comprobaciones | Resultado |
|---|---|---|
| a) Parámetros | Vacío, formato `1.2`, `1.2.3-rc1`, espacio inicial, `pro` sin confirmar, entorno fuera de lista; ningún rechazo crea recursos ni deja directorio temporal | Correcto |
| b) Ansible | `dev`, `pre` y `pro` con el mismo playbook y valores distintos; inventario cruzado rechazado por el `assert` | Correcto |
| c) Verificación | Camino feliz en los tres entornos; `curl` sin servicio falla y deja el job en rojo | Correcto |
| d) Variante A | Imagen inexistente: rojo, `ImagePullBackOff`, limpieza, antes = después, y nuevo build en verde | Correcto |
| d) Variante B | Host inaccesible: `UNREACHABLE`, sin recursos que limpiar, directorio temporal borrado | Correcto |
| d) Variante C | NodePort ocupado: despliegue a medias, limpieza, sin recursos | Correcto |
| Límite conocido | Fallo sobre entorno ya desplegado: se lleva también la versión anterior | Documentado (apartado 6) |
| Limpieza segura | `rm -rf` sobre ruta inexistente no falla; `WORKDIR` vacío no borra nada | Correcto |

**Prueba de sabotaje.** Para asegurar que la batería detecta problemas de verdad, se eliminó del Jenkinsfile la línea que borra los recursos y se repitió: **5 comprobaciones fallaron**, las de las variantes A y C y la del límite conocido. Con el fichero restaurado, vuelven a pasar las 44.

**Qué corrigió la prueba.** Al ejecutar el material salieron tres problemas que se han corregido y que aparecen en el apartado 8: el nombre reservado `namespace` en Ansible, el uso de `ansible_distribution` (deprecado en versiones nuevas) y las comillas anidadas del playbook.

### 10.2 Cómo repetir la batería

Desde la carpeta que contiene `lab/` y `profesor/`:

```bash
bash profesor/prueba_sesion12.sh
```

Necesita `ansible-playbook`, `groovy`, `jq`, `envsubst`, `curl`, `python3` con `PyYAML`, y los puertos 30081 a 30083 libres. Muestra una línea por comprobación y termina con `RESULTADO: 44 correctas de 44`. Los logs completos de cada caso quedan en `/tmp/s12-logs/`.

### 10.3 Recomendaciones de aula

- Conviene que el primer fallo real lo vea todo el grupo en la pantalla del aula (variante A) antes de que cada equipo provoque el suyo.
- Dejar el criterio d) para cuando a) a c) estén en verde: sin un pipeline que funcione no se aprecia qué cambia con el fallo.
- Si la VM de algún alumno/a se estropea, se restaura desde la `.ova` y se retoma con el repositorio de Gitea, que no se pierde.
- Reparte las variantes por mesas (A, B y C) y deja que comparen en la puesta en común qué se limpió en cada una.

---

## Anexo A · Código completo del laboratorio

### A.1 `Jenkinsfile`

```groovy
// Jenkinsfile · UT2 · Sesión 12 · Flujo integrador (criterios a-d)
//
// Etapas: Validar parámetros (a) -> Recopilar por entorno (b) -> Desplegar
//         -> Verificar despliegue (c) -> post: limpieza y manejo de errores (d)
//
// Requisitos en la máquina donde corre Jenkins: ansible, jq, envsubst (gettext-base),
// kubectl y curl, accesibles para el usuario "jenkins".

pipeline {
    agent any

    parameters {
        choice(name: 'ENTORNO', choices: ['dev', 'pre', 'pro'], description: 'Entorno de destino')
        string(name: 'VERSION', defaultValue: '', description: 'Versión a desplegar (formato X.Y.Z)')
        booleanParam(name: 'CONFIRMAR_PRO', defaultValue: false, description: 'Obligatorio para desplegar en pro')
    }

    environment {
        // Imagen de la aplicación: cámbiala por la de tu práctica si usas otra.
        IMAGE_REPO     = 'nginx'
        // Directorio temporal propio de cada ejecución (objeto intermedio).
        WORKDIR        = "${WORKSPACE}/tmp-${BUILD_NUMBER}"
        ANSIBLE_CONFIG = "${WORKSPACE}/ansible/ansible.cfg"
        TIMEOUT_VERIF  = '60s'
    }

    stages {

        // ---------- a) Validación de parámetros ----------
        stage('Validar parámetros') {
            steps {
                script {
                    def entornos = ['dev', 'pre', 'pro']
                    if (!(params.ENTORNO in entornos)) {
                        error("ENTORNO '${params.ENTORNO}' no es válido. Valores permitidos: ${entornos.join(', ')}")
                    }
                    if (!params.VERSION?.trim()) {
                        error('VERSION está vacío. Indica una versión con formato X.Y.Z')
                    }
                    if (!(params.VERSION ==~ /^\d+\.\d+\.\d+$/)) {
                        error("VERSION '${params.VERSION}' no cumple el formato X.Y.Z")
                    }
                    if (params.ENTORNO == 'pro' && !params.CONFIRMAR_PRO) {
                        error('Para desplegar en pro hay que marcar CONFIRMAR_PRO')
                    }
                    echo "Parámetros correctos: ENTORNO=${params.ENTORNO} VERSION=${params.VERSION}"
                }
            }
        }

        // ---------- b) Recopilación por entorno con Ansible ----------
        stage('Recopilar por entorno') {
            steps {
                sh '''
                    mkdir -p "$WORKDIR"
                    ansible-playbook \
                        -i "ansible/inventories/$ENTORNO/hosts.ini" \
                        ansible/playbooks/recopilar.yml \
                        -e "entorno=$ENTORNO" -e "salida=$WORKDIR"
                    echo "--- $WORKDIR/$ENTORNO.json ---"
                    cat "$WORKDIR/$ENTORNO.json"
                '''
                script {
                    // Los datos recopilados alimentan las etapas siguientes.
                    env.NAMESPACE   = sh(script: 'jq -r .namespace   "$WORKDIR/$ENTORNO.json"', returnStdout: true).trim()
                    env.PUERTO_APP  = sh(script: 'jq -r .puerto_app  "$WORKDIR/$ENTORNO.json"', returnStdout: true).trim()
                    env.REPLICAS    = sh(script: 'jq -r .replicas    "$WORKDIR/$ENTORNO.json"', returnStdout: true).trim()
                    env.HOST_ACCESO = sh(script: 'jq -r .host_acceso "$WORKDIR/$ENTORNO.json"', returnStdout: true).trim()
                    echo "Entorno ${params.ENTORNO}: namespace=${env.NAMESPACE} puerto=${env.PUERTO_APP} réplicas=${env.REPLICAS}"
                }
            }
        }

        // ---------- Despliegue ----------
        stage('Desplegar') {
            steps {
                sh '''
                    export IMAGE="$IMAGE_REPO:$VERSION"
                    envsubst '${NAMESPACE} ${ENTORNO} ${BUILD_NUMBER} ${REPLICAS} ${IMAGE} ${PUERTO_APP}' \
                        < k8s/app.yaml > "$WORKDIR/app.yaml"
                    kubectl apply -f "$WORKDIR/app.yaml"
                '''
            }
        }

        // ---------- c) Verificación del despliegue ----------
        stage('Verificar despliegue') {
            steps {
                sh '''
                    kubectl -n "$NAMESPACE" rollout status deployment/app --timeout="$TIMEOUT_VERIF"
                    kubectl -n "$NAMESPACE" get pods -l app=app
                    LISTOS=$(kubectl -n "$NAMESPACE" get deployment app -o jsonpath='{.status.readyReplicas}')
                    if [ "$LISTOS" != "$REPLICAS" ]; then
                        echo "ERROR: réplicas listas ($LISTOS) distinto de las esperadas ($REPLICAS)"
                        exit 1
                    fi
                    curl --fail --silent --show-error --max-time 10 -o /dev/null \
                        -w "Respuesta HTTP %{http_code}\n" "http://$HOST_ACCESO:$PUERTO_APP/"
                '''
            }
        }
    }

    // ---------- d) Manejo de errores y limpieza ----------
    post {
        always {
            // Se ejecuta siempre: borra el directorio temporal de ESTA ejecución.
            sh '''
                case "$WORKDIR" in
                    */tmp-*) rm -rf "$WORKDIR" ;;
                esac
            '''
        }
        failure {
            // Solo si algo falla: diagnóstico y borrado de lo que creó ESTA ejecución.
            sh '''
                echo "=== Limpieza tras el fallo de la ejecución $BUILD_NUMBER ==="
                if [ -n "$NAMESPACE" ]; then
                    kubectl -n "$NAMESPACE" get pods -l build="$BUILD_NUMBER" || true
                    kubectl -n "$NAMESPACE" delete deployment,service -l build="$BUILD_NUMBER" --ignore-not-found
                else
                    echo "No se había llegado a desplegar nada: no hay recursos que limpiar"
                fi
            '''
            echo "El despliegue de ${params.VERSION ?: '(sin versión)'} en ${params.ENTORNO} ha fallado. Revisa la etapa que está en rojo."
        }
        success {
            echo "Despliegue de ${params.VERSION} en ${params.ENTORNO} verificado."
        }
    }
}
```

### A.2 `ansible/playbooks/recopilar.yml`

```yaml
---
# Recopila la información de un entorno y la guarda en {{ salida }}/{{ entorno }}.json
# Uso: ansible-playbook -i ansible/inventories/<entorno>/hosts.ini \
#        ansible/playbooks/recopilar.yml -e entorno=<entorno> -e salida=<directorio>
- name: Recopilar información del entorno
  hosts: all
  gather_facts: true
  tasks:
    - name: Comprobar que el inventario corresponde al entorno pedido
      ansible.builtin.assert:
        that:
          - entorno == entorno_inventario
        fail_msg: "Se pidió '{{ entorno }}' pero el inventario es de '{{ entorno_inventario }}'"
        success_msg: "Inventario correcto para el entorno {{ entorno }}"

    - name: Guardar el resumen del entorno
      ansible.builtin.copy:
        dest: "{{ salida }}/{{ entorno }}.json"
        content: "{{ resumen | to_nice_json }}\n"
        mode: "0644"
      vars:
        resumen:
          entorno: "{{ entorno }}"
          host: "{{ inventory_hostname }}"
          sistema: "{{ ansible_facts['distribution'] }} {{ ansible_facts['distribution_version'] }}"
          namespace: "{{ k8s_namespace }}"
          puerto_app: "{{ puerto_app }}"
          replicas: "{{ replicas }}"
          host_acceso: "{{ host_acceso }}"
      delegate_to: localhost
      run_once: true
```

### A.3 `ansible/ansible.cfg`

```ini
[defaults]
host_key_checking = False
retry_files_enabled = False
nocows = 1
timeout = 5
interpreter_python = auto_silent

[ssh_connection]
ssh_args = -o ConnectTimeout=5 -o BatchMode=yes
```

### A.4 `ansible/inventories/dev/hosts.ini`

```ini
[servidores]
localhost ansible_connection=local
```

### A.5 `ansible/inventories/dev/group_vars/all.yml`

```yaml
---
# Variables propias del entorno dev
entorno_inventario: dev
k8s_namespace: app-dev
puerto_app: 30081
replicas: 1
host_acceso: localhost
```

Los de `pre` y `pro` son iguales cambiando estos cuatro valores:

| Fichero | `entorno_inventario` | `k8s_namespace` | `puerto_app` | `replicas` |
|---|---|---|---|---|
| `pre/group_vars/all.yml` | `pre` | `app-pre` | 30082 | 2 |
| `pro/group_vars/all.yml` | `pro` | `app-pro` | 30083 | 3 |

### A.6 `k8s/app.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ${NAMESPACE}
  labels:
    entorno: ${ENTORNO}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: ${NAMESPACE}
  labels:
    app: app
    build: "${BUILD_NUMBER}"
spec:
  replicas: ${REPLICAS}
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
        build: "${BUILD_NUMBER}"
    spec:
      containers:
        - name: app
          image: ${IMAGE}
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80
---
apiVersion: v1
kind: Service
metadata:
  name: app
  namespace: ${NAMESPACE}
  labels:
    app: app
    build: "${BUILD_NUMBER}"
spec:
  type: NodePort
  selector:
    app: app
  ports:
    - port: 80
      targetPort: 80
      nodePort: ${PUERTO_APP}
```

---

## Anexo B · Plantilla del documento de evidencias

```text
SESIÓN 12 · UT2 · DOCUMENTO DE EVIDENCIAS
Alumno/a: ______________________   Fecha: ______________

FASE 1 · Lectura del flujo
- Línea del bloque parameters: ___   Etapa de validación: ___   Etapa de Ansible: ___
- Etapa de verificación: ___         Bloque post: ___
- ¿Por qué WORKDIR incluye BUILD_NUMBER?  ______________________________
- ¿De dónde sale NAMESPACE?  ______________________________

CRITERIO a) VALIDACIÓN
- [captura] rechazo por VERSION vacío
- [captura] rechazo por formato
- [captura] rechazo por pro sin confirmar
- [captura] ejecución aceptada
- ¿Por qué 1.2.3-rc1 se rechaza?  ______________________________

CRITERIO b) ANSIBLE
- [captura] PLAY RECAP de dev con failed=0
- [captura] JSON de dev          [captura] JSON de pre
- [captura] assert con inventario cruzado
- ¿Qué cambia entre dev y pre sin tocar el playbook?  ______________________________

CRITERIO c) VERIFICACIÓN
- [captura] etapa Verificar despliegue en verde
- Salida de kubectl -n app-dev get all: [pegar]
- Salida del curl manual: [pegar]
- ¿Qué detecta cada comprobación que las otras no?  ______________________________

CRITERIO d) FALLO Y LIMPIEZA
- Variante elegida: A / B / C
- [captura] ejecución en rojo y etapa que falla
- [captura] bloque post (always y failure)
- ANTES:   kubectl get all: [pegar]    ls workspace: [pegar]
- DESPUÉS: kubectl get all: [pegar]    ls workspace: [pegar]
- [captura] nuevo build en verde tras corregir

PREGUNTA FINAL
Si el fallo hubiera ocurrido en la etapa de recopilación en lugar de en la de verificación,
¿qué objetos habría que limpiar y cuáles no existirían todavía?
______________________________________________________________________
```

---

[← Sesión 11](sesion11.md) · [Índice de la UT02](./)
{% endraw %}
