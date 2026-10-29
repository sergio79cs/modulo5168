{% raw %}
[← Sesión 5](sesion5.md) · [Índice de la UT02](./) · [Sesión 7 →](sesion7.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 6 — Recopilación de parámetros por entorno

*Martes 1 de diciembre · 3 horas · Criterio RA2.b*

| Bloque | Duración |
|---|---|
| Teoría (recordatorio + conceptos) | 40' |
| Práctica guiada | 100' |
| Cierre y entrega | 30' |
| Margen / descanso | 10' |

## Objetivos de aprendizaje

Al acabar la sesión, serás capaz de:

1. Explicar qué es un parámetro de entorno y por qué no se escribe a mano en cada despliegue.
2. Identificar de dónde sale cada valor que Ansible recopila (fichero del entorno, valor por defecto, línea de comandos) y cuál prevalece si coinciden.
3. Ejecutar el mismo playbook contra dos entornos y localizar en el ConfigMap qué valores cambian y cuáles no.
4. Razonar qué parámetros son de configuración (van en un ConfigMap) y cuáles son secretos (no).
5. Añadir un entorno nuevo sin tocar el playbook.

## Requisitos previos

Laboratorio arrancado: `kubectl get nodes` muestra el nodo de Minikube en `Ready` y `ansible --version` responde. Carpeta `lab/ansible` del laboratorio con `playbook.yml`, `inventory.ini`, `templates/configmap.yaml.j2` y `vars/` (con `staging.yml` y `production.yml`).

## 1. Teoría

### Bloque 1 — Recordatorio de la sesión 5 (10')

En la sesión anterior montamos las cuatro piezas con las que trabaja Ansible en nuestro laboratorio. Hoy las usamos para algo concreto, así que conviene tenerlas claras:

| Pieza | Fichero | Qué hace en nuestro laboratorio |
|---|---|---|
| Inventario | `inventory.ini` | Dice *dónde* se ejecuta: `localhost`. Ansible no configura servidores remotos, lanza `kubectl` contra el clúster. |
| Playbook | `playbook.yml` | Lista ordenada de tareas: crear carpeta, generar el ConfigMap, aplicarlo, mostrar el resultado. |
| Variables por entorno | `vars/staging.yml`, `vars/production.yml` | Mismos nombres de variable, valores distintos según el entorno. |
| Plantilla | `templates/configmap.yaml.j2` | Un ConfigMap con huecos `{{ ... }}` que Ansible rellena con las variables. |

Y una idea que hoy vamos a comprobar con datos: **idempotencia** significa que ejecutar el mismo playbook varias veces con las mismas entradas deja el sistema igual que tras la primera vez. En el resumen final (`PLAY RECAP`) se ve como `changed=0`.

Preguntas rápidas para arrancar (respuesta oral, 2 minutos):

1. ¿Qué diferencia hay entre el inventario y el playbook?
2. ¿Qué dos cosas necesita Ansible para generar un fichero a partir de una plantilla?
3. Si ejecuto el playbook dos veces seguidas sin cambiar nada, ¿qué debería decir `changed`?

### Bloque 2 — Qué es un parámetro de entorno (10')

Una misma aplicación se despliega en sitios distintos: el entorno de **pruebas previas** (*staging*), donde se comprueba que todo funciona antes de publicar, y el de **producción**, donde la usa el público. El código y la imagen son **idénticos**; lo que cambia es la configuración que los rodea. A cada dato de esa configuración que varía de un entorno a otro lo llamamos **parámetro de entorno**.

En nuestro laboratorio hay cuatro:

| Parámetro | Para qué sirve | ¿Varía por entorno? |
|---|---|---|
| `TARGET_ENV` | Nombre del entorno (`staging`, `production`). La aplicación y los logs saben dónde están. | Sí |
| `LOG_LEVEL` | Cuánto cuenta la aplicación de lo que hace (`DEBUG` mucho, `WARN` solo avisos y errores). | Sí |
| `REPLICAS` | Cuántas copias de la aplicación se ejecutan a la vez. | Sí |
| `APP_VERSION` | Versión de la aplicación que se despliega. | No: lo decide quien lanza el despliegue |

¿Por qué esos valores son distintos?

- **Nivel de log.** En *staging* queremos verlo todo para depurar (`DEBUG`). En producción, registrar cada detalle ralentiza, llena el disco y esconde los avisos importantes, así que solo se registra lo relevante (`WARN`).
- **Réplicas.** En *staging* basta una copia. En producción hay varias para repartir carga y para que, si una cae, las demás sigan atendiendo.

Hay tres formas de gestionar esto, y solo una escala:

| Enfoque | Problema |
|---|---|
| Editar la configuración a mano en cada despliegue | Errores de teclado, nadie sabe quién cambió qué, dos despliegues del «mismo» entorno acaban distintos (*deriva de configuración*, o *configuration drift*). |
| Un playbook distinto por entorno | Se duplica el código; al corregir uno se olvida el otro. |
| **Un solo playbook + un fichero de valores por entorno** | Un único proceso, los valores son datos versionados en Git. Es lo que hacemos. |

> **Idea clave:** el *cómo* se despliega es el mismo en todos los entornos (playbook y plantilla). El *con qué valores* es lo único que cambia (fichero `vars/<entorno>.yml`).

Este principio se conoce como *separar la configuración del código*, y aparece en cualquier metodología moderna de despliegue (por ejemplo, el manifiesto «The Twelve-Factor App»).

### Bloque 3 — «Recopilar» los parámetros (10')

La consigna dice que los parámetros se obtienen *durante la creación de la infraestructura*. Qué significa «recopilar»: antes de crear el ConfigMap, Ansible **reúne** los valores desde varias fuentes y los consolida en un único resultado.

```
  vars/<entorno>.yml ──┐   (log_level, replicas)
  vars: en el playbook ─┼──▶  Ansible  ──▶  plantilla Jinja2  ──▶  rendered/configmap-resolved.yaml
  -e "..." (terminal) ──┘   (reúne y        (rellena los          (el ConfigMap ya con
                             resuelve)        huecos)               valores concretos)
```

En nuestro playbook hay tres fuentes:

| Fuente | Dónde está | Qué aporta en el laboratorio |
|---|---|---|
| Línea de comandos (`-e`) | `-e "target_env=staging app_version=1.0.0"` | Qué entorno y qué versión. Es la elección del que despliega (o de Jenkins). |
| Fichero del entorno | `vars_files: vars/{{ target_env }}.yml` | `log_level` y `replicas`. El nombre del fichero se **construye** con el valor de `target_env`. |
| Valores por defecto | `vars:` dentro del playbook | `app_version: "dev"` por si no se indica versión. |

**Precedencia.** Si una variable aparece en dos sitios, gana uno. Ansible tiene muchos niveles; para nosotros basta este orden, de más fuerte a más débil:

1. `-e` (variables extra de la línea de comandos): **siempre ganan**.
2. `vars_files` (ficheros de variables del entorno).
3. `vars` del playbook (valores por defecto).

Por eso `app_version=1.0.0` en la terminal sustituye al `"dev"` por defecto, y por eso, si no lo pones, aparece `dev` en el ConfigMap.

**El truco de `vars_files`.** La ruta `vars/{{ target_env }}.yml` contiene una variable. Con `target_env=staging` Ansible carga `vars/staging.yml`; con `target_env=production`, `vars/production.yml`. Si el fichero no existe (por ejemplo `target_env=preproduccion`), o falta una de sus claves, el playbook **falla antes de tocar el clúster**: es un fallo seguro y barato.

**Regla de oro:** todos los ficheros de entorno deben tener **las mismas claves**; solo cambian los valores. Si falta una clave en uno, la plantilla no tendrá de dónde sacar el dato.

> **Nota sobre «durante la creación de la infraestructura».** En una empresa, parte de esos valores nacerían al crear la infraestructura (por ejemplo, la dirección de una base de datos que se acaba de crear, que otra herramienta entregaría a Ansible). En nuestro laboratorio no creamos infraestructura nueva: los valores se derivan de los ficheros de cada entorno en el momento de preparar el despliegue. El mecanismo es el mismo: **nadie los teclea a mano en cada despliegue**.

### Bloque 4 — Del ConfigMap a la aplicación (10')

Ansible genera un **ConfigMap**, el objeto de Kubernetes pensado para guardar configuración no secreta como pares clave–valor. Mira cómo queda la plantilla:

```
data:
  TARGET_ENV: "{{ target_env }}"
  APP_VERSION: "{{ app_version }}"
  LOG_LEVEL: "{{ log_level }}"
  REPLICAS: "{{ replicas }}"
```

¿Cómo llegan esos valores a la aplicación? De dos maneras en nuestro laboratorio:

1. **Variables de entorno del contenedor.** El `deployment.yaml` incluye `envFrom: configMapRef: modulo5168-config`. Cada clave del ConfigMap se convierte en una variable de entorno del contenedor (`LOG_LEVEL`, `TARGET_ENV`...), que la aplicación lee al arrancar.
2. **El pipeline.** En el Jenkinsfile, tras ejecutar Ansible, la etapa de despliegue lee `REPLICAS` del ConfigMap (`kubectl get configmap ... -o jsonpath`) y se lo pasa a `render.sh`, que escribe ese número en el Deployment.

Es decir, `REPLICAS` **no escala nada por sí solo**: es un dato guardado que el pipeline consulta. Por eso se dice que el ConfigMap es la *fuente única de verdad* de los parámetros del entorno.

Tres cosas que conviene saber:

- **Un ConfigMap no es para secretos.** Contraseñas, tokens y claves van en un objeto `Secret` (o en un gestor de secretos). Que un Secret esté en base64 no lo cifra. Regla simple: si te daría miedo ponerlo en un repositorio público, no va en un ConfigMap ni en un `vars/*.yml`.
- **Cambiar el ConfigMap no reinicia los pods.** Las variables de entorno se leen al arrancar el contenedor. Para que una aplicación ya desplegada vea un valor nuevo hay que volver a desplegar (o reiniciar con `kubectl rollout restart`).
- **En nuestro laboratorio, staging y producción comparten clúster.** El ConfigMap tiene el mismo nombre (`modulo5168-config`) en ambos casos y vive en el mismo espacio de nombres, así que cada ejecución **sobrescribe** la anterior. En una empresa serían clústeres o namespaces distintos y convivirían a la vez. Por eso en la práctica hay que capturar el ConfigMap *entre* una ejecución y la siguiente.

Resumen del bloque en una frase: **vars → plantilla → ConfigMap → aplicación y pipeline**.

## 2. Práctica

Ejecutarás el mismo playbook contra dos entornos y demostrarás con datos qué cambia. Trabaja siempre desde `lab/ansible`.

### Paso 0 · Comprobar el laboratorio (5')

```
cd lab/ansible
ansible --version
kubectl get nodes
```

`kubectl` debe mostrar el nodo en estado `Ready`. Si responde `connection refused`, el clúster no está arrancado: `minikube start`.

### Paso 1 · Leer las piezas antes de ejecutar (15')

```
cat vars/staging.yml
cat vars/production.yml
cat templates/configmap.yaml.j2
cat playbook.yml
```

Responde en tu cuaderno **antes** de ejecutar nada:

1. ¿Qué claves tienen los dos ficheros de `vars/`? ¿Cuáles son sus valores en cada uno?
2. ¿Qué variables de la plantilla **no** salen de `vars/`? ¿De dónde salen?
3. Escribe en una tabla, de memoria, qué valores esperas ver en el ConfigMap con `target_env=staging app_version=1.0.0`.

Mira en el playbook la línea `vars_files` y comprueba que la ruta incluye `{{ target_env }}`. Eso es lo que hace que un único playbook sirva para todos los entornos.

### Paso 2 · Validar la sintaxis (3')

```
ansible-playbook -i inventory.ini playbook.yml --syntax-check -e "target_env=staging app_version=1.0.0"
```

Esperado: `playbook: playbook.yml`. Comprueba la sintaxis, no el contenido de las variables.

### Paso 3 · Recopilar y aplicar para *staging* (10')

```
ansible-playbook -i inventory.ini playbook.yml -e "target_env=staging app_version=1.0.0"
```

Salida esperada (resumida):

```
TASK [Crear la carpeta de ficheros generados] ***
changed: [localhost]

TASK [Generar el ConfigMap a partir de la plantilla] ***
changed: [localhost]

TASK [Aplicar el ConfigMap en el clúster] ***
changed: [localhost]

TASK [Mostrar el resultado de kubectl] ***
ok: [localhost] => {
    "resultado.stdout": "configmap/modulo5168-config created"
}

PLAY RECAP ***
localhost : ok=4  changed=3  unreachable=0  failed=0
```

Fíjate en `created`: es la primera vez que existe el ConfigMap.

### Paso 4 · Ver qué parámetros se han recopilado (10')

Primero el fichero que Ansible ha generado a partir de la plantilla:

```
cat rendered/configmap-resolved.yaml
```

Compara con la tabla que escribiste en el Paso 1. Después, lo que hay realmente en el clúster:

```
kubectl get configmap modulo5168-config -o yaml
```

La salida tendrá este aspecto (los datos que nos interesan están en `data` y en `labels`; `uid`, `resourceVersion` y fechas serán distintos en tu equipo):

```
apiVersion: v1
data:
  APP_VERSION: 1.0.0
  LOG_LEVEL: DEBUG
  REPLICAS: "1"
  TARGET_ENV: staging
kind: ConfigMap
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      ...
  labels:
    app: modulo5168-app
    entorno: staging
  name: modulo5168-config
  namespace: default
```

Observa que Kubernetes ordena las claves alfabéticamente y que `"1"` aparece entre comillas: en un ConfigMap **todos los valores son texto**, también las réplicas.

**📸 Captura 1:** terminal con el comando `kubectl get configmap modulo5168-config -o yaml` y su salida (que se vean `data` y `labels`).

Guarda también la evidencia en un fichero, porque el siguiente paso sobrescribirá el ConfigMap:

```
kubectl get configmap modulo5168-config -o yaml > evidencia-staging.yaml
kubectl get configmap modulo5168-config -o jsonpath='{.data}' | python3 -m json.tool > datos-staging.json
```

### Paso 5 · Repetir para *production* (10')

El **mismo playbook**, solo cambia el valor de `target_env`:

```
ansible-playbook -i inventory.ini playbook.yml -e "target_env=production app_version=1.0.0"
```

Esta vez la carpeta ya existe, así que la primera tarea sale `ok`, y `kubectl` informa de que el ConfigMap existente ha cambiado:

```
TASK [Crear la carpeta de ficheros generados] ***
ok: [localhost]
...
ok: [localhost] => {
    "resultado.stdout": "configmap/modulo5168-config configured"
}

PLAY RECAP ***
localhost : ok=4  changed=2  unreachable=0  failed=0
```

`configured` significa «existía y lo he modificado». Ahora el segundo ConfigMap:

```
kubectl get configmap modulo5168-config -o yaml
kubectl get configmap modulo5168-config -o yaml > evidencia-production.yaml
kubectl get configmap modulo5168-config -o jsonpath='{.data}' | python3 -m json.tool > datos-production.json
```

**📸 Captura 2:** el mismo comando con la salida de *production*.

### Paso 6 · Comparar ambos entornos (15')

```
diff datos-staging.json datos-production.json
```

Salida esperada:

```
3,5c3,5
<     "LOG_LEVEL": "DEBUG",
<     "REPLICAS": "1",
<     "TARGET_ENV": "staging"
---
>     "LOG_LEVEL": "WARN",
>     "REPLICAS": "2",
>     "TARGET_ENV": "production"
```

Completa esta tabla (es parte del entregable):

| Parámetro | staging | production | ¿Cambia? | ¿De dónde sale? |
|---|---|---|---|---|
| `APP_VERSION` | 1.0.0 | 1.0.0 | No | `-e` |
| `LOG_LEVEL` | DEBUG | WARN | Sí | `vars/<entorno>.yml` |
| `REPLICAS` | 1 | 2 | Sí | `vars/<entorno>.yml` |
| `TARGET_ENV` | staging | production | Sí | `-e` |

Además cambia la etiqueta `entorno` del ConfigMap (`staging` → `production`), porque la plantilla también la rellena con `target_env`.

Pregunta de reflexión: `APP_VERSION` es igual en los dos y `TARGET_ENV` cambia. Ninguno de los dos viene de `vars/`, ¿por qué? ¿Qué ventaja tiene que sea Jenkins quien los pase con `-e`?

### Paso 7 · Idempotencia: ejecutar dos veces lo mismo (7')

Lanza otra vez exactamente el mismo comando de *production*:

```
ansible-playbook -i inventory.ini playbook.yml -e "target_env=production app_version=1.0.0"
```

Esperado:

```
ok: [localhost] => {
    "resultado.stdout": "configmap/modulo5168-config unchanged"
}

PLAY RECAP ***
localhost : ok=4  changed=0  unreachable=0  failed=0
```

`unchanged` y `changed=0`: el sistema ya estaba como se pedía. Esto funciona porque el playbook decide si «hubo cambio» mirando lo que responde `kubectl` (`changed_when: "'unchanged' not in resultado.stdout"`). Sin esa línea, Ansible marcaría `changed` siempre que se ejecuta un comando.

### Paso 8 · Cambiar solo un parámetro (8')

Cambia únicamente la versión:

```
ansible-playbook -i inventory.ini playbook.yml -e "target_env=production app_version=1.0.1"
kubectl get configmap modulo5168-config -o jsonpath='{.data.APP_VERSION}{"\n"}'
```

Solo cambia `APP_VERSION`; `LOG_LEVEL`, `REPLICAS` y `TARGET_ENV` se quedan como estaban. Ahora ejecuta **sin** `app_version`:

```
ansible-playbook -i inventory.ini playbook.yml -e "target_env=production"
kubectl get configmap modulo5168-config -o jsonpath='{.data.APP_VERSION}{"\n"}'
```

Aparece `dev`: es el valor por defecto del playbook. Ahí ves la precedencia: sin `-e`, manda el valor por defecto.

### Paso 9 · Vista previa antes de aplicar (7')

Para comprobar qué cambiaría **sin tocar el clúster**:

```
ansible-playbook -i inventory.ini playbook.yml -e "target_env=staging app_version=1.0.0" --check --diff
```

Verás las líneas que cambiarían en el fichero generado (`LOG_LEVEL`, `REPLICAS`, `TARGET_ENV`...) y la tarea de `kubectl` aparece como `skipping`. Es el hábito recomendable antes de tocar producción. Limitación: las tareas `command` no se ejecutan en este modo, así que la simulación solo cubre la plantilla.

### Paso 10 · Provocar fallos (5')

Mejor verlos ahora que en el pipeline:

```
ansible-playbook -i inventory.ini playbook.yml
ansible-playbook -i inventory.ini playbook.yml -e "target_env=preproduccion"
```

El primero falla porque `target_env` no está definido; el segundo, porque no existe `vars/preproduccion.yml`. Según la versión de Ansible, el mensaje habla de variable no definida o de fichero no encontrado. En ambos casos el playbook se detiene **antes de aplicar nada en el clúster**.

### Paso 11 · Reto: un tercer entorno sin tocar el playbook (10')

Crea `vars/preproduccion.yml` con las **mismas claves** y valores que consideres razonables (por ejemplo `log_level: INFO` y `replicas: 2`) y ejecuta:

```
ansible-playbook -i inventory.ini playbook.yml -e "target_env=preproduccion app_version=1.0.0"
kubectl get configmap modulo5168-config -o jsonpath='{.data}' | python3 -m json.tool
```

No has modificado ni el playbook ni la plantilla. Anota qué ficheros has tocado y por qué solo ha hecho falta uno.

### Errores típicos

| Síntoma | Causa probable |
|---|---|
| `... is undefined` | Falta `-e target_env=...` o falta esa clave en el `vars/` cargado |
| Error al cargar `vars/xxx.yml` | El valor de `target_env` no coincide con el nombre del fichero (mayúsculas, tilde, errata) |
| `mapping values are not allowed here` | Falta un espacio tras `:` o mala indentación en el YAML |
| `kubectl: command not found` | El entorno donde corre Ansible no tiene `kubectl` en el `PATH` |
| `connection ... refused` | El clúster no está arrancado: `minikube start` |
| El ConfigMap sigue con los valores antiguos | Estás mirando otro contexto/namespace, o el playbook falló antes de `kubectl apply` |

## 3. Cierre

**Puesta en común (15').** Cada equipo muestra su tabla del Paso 6 y su reto del Paso 11. Se comparan tres cosas: ¿coinciden todos los valores?, ¿qué entorno nuevo ha inventado cada uno y con qué valores?, ¿alguien ha tenido un fallo distinto a los de la tabla de errores?

**Preguntas de comprobación (10')**, en parejas, para responder por escrito:

1. ¿Por qué `LOG_LEVEL` y `REPLICAS` están en `vars/` y `APP_VERSION` se pasa con `-e`?
2. Si en `vars/production.yml` ponemos `replicas: 3`, ¿qué pasa con los pods ya en marcha? ¿Qué hay que hacer para que lo apliquen?
3. ¿Por qué no es buena idea poner la contraseña de la base de datos en `vars/production.yml`?
4. ¿Qué ventaja tiene que `vars/*.yml` esté en Git frente a editarlo a mano en el servidor?
5. Si dos personas ejecutan el playbook a la vez con entornos distintos en nuestro laboratorio, ¿qué ocurre? ¿Por qué no pasaría en una empresa?

**Lo que te llevas.** Un proceso (playbook + plantilla), datos por entorno (`vars/`) y una elección en el momento de desplegar (`-e`). Esa es la base de la sesión 7, donde Jenkins invocará el playbook por nosotros.

## 4. Entregable y evaluación (RA2.b)

Se entrega un documento (PDF o Word) con:

1. **Captura 1** y **Captura 2** del ConfigMap (`kubectl get configmap modulo5168-config -o yaml`) de *staging* y *production*, con el comando visible.
2. La **tabla del Paso 6** completa, con los valores que cambian marcados.
3. Una captura del `PLAY RECAP` de la segunda ejecución idéntica (`changed=0`, Paso 7).
4. Las respuestas a las preguntas de comprobación y la descripción del Paso 11.

| Aspecto evaluado | Peso |
|---|---|
| Capturas completas de ambos entornos, con comando y salida legibles | 30 % |
| Tabla comparativa correcta, señalando qué cambia y de dónde sale cada valor | 30 % |
| Evidencia de idempotencia (`changed=0` / `unchanged`) | 15 % |
| Reto del tercer entorno sin modificar el playbook | 10 % |
| Respuestas a las preguntas de comprobación | 15 % |

---

[← Sesión 5](sesion5.md) · [Índice de la UT02](./) · [Sesión 7 →](sesion7.md)
{% endraw %}
