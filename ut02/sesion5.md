{% raw %}
[← Sesión 4](sesion4.md) · [Índice de la UT02](./) · [Sesión 6 →](sesion6.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 5 — Introducción a Ansible

**Objetivo.** Al terminar, el alumnado sabrá explicar qué problema resuelve Ansible y cómo trabaja (nodo de control, inventario, playbook y módulos), leerá y escribirá playbooks sencillos en YAML, generará configuración distinta para *staging* y *producción* a partir de una misma plantilla y de ficheros de variables, y comprobará por sí mismo qué significa que un playbook sea idempotente. Es la base del criterio b de la unidad.

**Entorno de trabajo.** Como en el resto del módulo, todo se hace en local, en el equipo del laboratorio de cada alumno. Hoy se usan tres piezas que ya están instaladas: **Ansible** (en el entorno virtual `~/venv-ansible`), **kubectl** y el clúster **Minikube**. El trabajo se hace en `~/modulo5168-lab/lab/ansible/`, dentro del proyecto del laboratorio. Hoy no hace falta Jenkins ni Gitea.

**Cómo se organiza.** La sesión es práctica a partes iguales: primero se explica el modelo completo y después el alumnado lo practica con sus propias manos. No hay demostración larga del docente; la estructura del laboratorio se descubre en la parte B, leyendo y ejecutando cada fichero.

### Preparación previa: comprobar el entorno

Antes de empezar, conviene comprobar que el clúster está arrancado y que Ansible responde. Requisito: el proyecto del laboratorio descomprimido en `~/modulo5168-lab`.

```
minikube start
kubectl get nodes          # debe aparecer minikube en estado Ready
source ~/venv-ansible/bin/activate
ansible --version
```

Si falta Ansible, se instala en un entorno virtual de Python (nunca con `sudo pip`):

```
sudo apt-get install -y python3-venv
python3 -m venv ~/venv-ansible
source ~/venv-ansible/bin/activate
pip install ansible
```

En la máquina virtual del laboratorio, el entorno virtual **se activa solo** al abrir un terminal (está en `~/.bashrc`) y Minikube arranca con la máquina. Si el prompt no empieza por `(venv-ansible)`, actívalo a mano con `source ~/venv-ansible/bin/activate`; en un equipo que no sea la máquina virtual hay que hacerlo en cada terminal nuevo.

## 7.1 Teoría

### 1. Por qué automatizar la configuración

Hasta ahora has automatizado cómo se construye y se prueba el software. Pero un despliegue no termina ahí: cada entorno tiene que quedar *configurado*. Y *staging* y *producción* casi nunca son idénticos: cambia la dirección de la base de datos, el nivel de registro (*log*), el número de réplicas, los límites de memoria…

Si esa configuración se edita a mano en cada entorno, ocurren siempre las mismas tres cosas:

- **Errores de copia:** se olvida un valor, se pega el de otro entorno, se escribe mal un nombre.
- **Deriva de configuración** (*configuration drift*): con el tiempo, cada entorno acumula cambios manuales y deja de parecerse a los demás. Es la versión de infraestructura del "en mi máquina funciona".
- **Falta de trazabilidad:** nadie sabe qué cambió, quién lo cambió ni cuándo, y no hay forma de volver atrás.

La solución es la misma idea que ya has usado con el `Dockerfile` y el `Jenkinsfile`: **describir el estado deseado en ficheros de texto**, guardarlos en el repositorio y dejar que una herramienta los aplique siempre igual. Se conoce como *infraestructura como código* (IaC, *Infrastructure as Code*). Los ficheros se revisan en una Pull Request, se versionan y se pueden volver a ejecutar en otro entorno.

En el pipeline del módulo, el reparto de papeles es este: **Jenkins decide *cuándo* se despliega; Ansible define *cómo* se despliega.** Jenkins ya construye y publica la imagen; falta el paso que deja cada entorno configurado, y ese paso tiene que ser repetible, parametrizable (staging no es producción), auditable (queda en Git quién cambió qué) y automático.

**Ansible** es una herramienta de automatización de código abierto, creada en 2012 y hoy mantenida por Red Hat. Sirve para configurar sistemas, desplegar aplicaciones y orquestar tareas, y se caracteriza por tres cosas: sus ficheros son YAML legible incluso para quien no programa, no necesita instalar ningún agente en las máquinas que gestiona y está diseñada para que repetir una ejecución sea seguro.

### 2. Cómo funciona Ansible

Ansible separa quién da las órdenes de quién las recibe:

```
   NODO DE CONTROL (donde ejecutas ansible-playbook)
   +-----------------------------------------------+
   |  playbook.yml     ->  QUÉ hay que hacer       |
   |  inventory.ini    ->  SOBRE QUIÉN             |
   |  vars/ templates/ ->  CON QUÉ DATOS           |
   +----------------------+------------------------+
                          |  SSH (o conexión local)
              +-----------v----------+  +---------------------+
              |  NODO GESTIONADO 1   |  |  NODO GESTIONADO 2  |
              |  (sin agente)        |  |  (sin agente)       |
              +----------------------+  +---------------------+
```

El **nodo de control** es la máquina donde está instalado Ansible y desde donde lanzas los playbooks. Los **nodos gestionados** son las máquinas sobre las que se actúa. Para cada tarea, Ansible se conecta al nodo (normalmente por SSH), le envía un pequeño programa llamado **módulo**, lo ejecuta, recoge el resultado y lo borra. Por eso se dice que es *agentless* (sin agente): en los nodos no hay que instalar nada, solo necesitan Python y acceso SSH.

Es un modelo de tipo **push**: el nodo de control empuja los cambios cuando tú se lo ordenas. Herramientas como Puppet o Chef funcionan al revés (*pull*): un agente instalado en cada nodo consulta periódicamente a un servidor central.

**En nuestro laboratorio**, el nodo de control y el nodo gestionado son la misma máquina: `localhost`. No configuramos servidores remotos. Lo que Ansible hace es generar, a partir de una plantilla, el fichero de configuración de Kubernetes (un *ConfigMap*) de cada entorno y ordenar a `kubectl` que lo aplique al clúster. Ansible es el director de orquesta; `kubectl` es quien toca el clúster:

```ini
 [Alumno] --ansible-playbook--> [Ansible en localhost]
                                     |  1. lee las variables del entorno
                                     |  2. rellena la plantilla -> YAML
                                     v
                               [kubectl apply] --> [Clúster Minikube]
```

¿Cuándo usar Ansible y cuándo otra herramienta?

| Herramienta | Para qué se usa | Diferencia con Ansible |
|---|---|---|
| Script de shell (`bash`) | Automatizar pasos concretos | Es imperativo: ejecuta órdenes sin comprobar el estado. Repetirlo puede duplicar o romper cosas |
| **Ansible** | Configurar sistemas y orquestar tareas | Declarativo, idempotente, sin agente, YAML legible |
| Terraform | Crear infraestructura (redes, máquinas, servicios en la nube) | Se centra en crear y destruir recursos y en guardar su estado. Ansible se centra en configurarlos |
| Helm / Kustomize | Plantillas y variantes de manifiestos de Kubernetes | Específicos de Kubernetes. Ansible es general y sirve también fuera de él |
| Puppet / Chef | Gestión de configuración | Necesitan un agente instalado en cada nodo |

### 3. Inventario y ansible.cfg: sobre quién se actúa

El inventario es la lista de nodos que Ansible conoce. El formato más sencillo es un fichero INI, con grupos entre corchetes:

```ini
[web]
web1.ejemplo.com
web2.ejemplo.com

[bd]
bd1.ejemplo.com ansible_user=admin
```

En el playbook, `hosts:` puede apuntar a un nodo (`hosts: web1.ejemplo.com`) o a un grupo entero (`hosts: web`). Junto a cada nodo se pueden poner variables de conexión: `ansible_host` (la dirección real), `ansible_user` (el usuario SSH) o `ansible_connection` (cómo conectarse).

El inventario del laboratorio es el más pequeño posible:

```ini
[local]
localhost ansible_connection=local
```

- `[local]`: el **grupo** al que pertenece. El playbook dirá `hosts: local`.
- `ansible_connection=local`: no uses SSH, ejecuta las tareas en esta misma máquina.

Junto al inventario hay un fichero `ansible.cfg`, que Ansible lee automáticamente **si lo encuentra en la carpeta desde la que lanzas el comando**:

```ini
[defaults]
inventory = inventory.ini
interpreter_python = auto_silent
retry_files_enabled = False
```

- `inventory = inventory.ini`: el inventario por defecto. Por eso en los comandos de hoy **no hace falta `-i`**.
- `interpreter_python = auto_silent`: que Ansible elija el Python disponible sin mostrar avisos innecesarios.
- `retry_files_enabled = False`: no deja ficheros `.retry` cuando un playbook falla.

Prueba rápida de que todo está conectado: `ansible local -m ping` ejecuta el módulo `ping` sobre el grupo `local` y debe responder `"ping": "pong"` con `"changed": false`.

### 4. YAML en cinco minutos

Todo en Ansible (playbooks, variables, inventarios en formato YAML) está escrito en YAML. Es un formato de datos basado en la **indentación**, y casi todos los errores de la sesión de hoy serán de indentación o de comillas.

```
nombre: app-config           # clave: valor (un mapa)
replicas: 3                  # número
activo: true                 # booleano
mensaje: "Hola: mundo"       # entre comillas porque contiene ": "
entornos:                    # una lista: un guion por elemento
  - staging
  - production
base_datos:                  # un mapa dentro de otro mapa
  host: db.ejemplo.com
  puerto: 5432
```

- **Se indenta con espacios**, nunca con tabuladores. En este módulo, siempre 2 espacios por nivel.
- **Mapa:** `clave: valor` (con un espacio después de los dos puntos). **Lista:** `- elemento`.
- **Comillas obligatorias** cuando el valor empieza por `{{` o contiene `: `. Por ejemplo, `"{{ env }}"`, nunca `{{ env }}` a secas.
- Los comentarios empiezan por `#`.
- Un playbook es, en realidad, **una lista** (empieza por `- name:`) cuyos elementos son mapas.

### 5. El playbook: anatomía

Un *playbook* es un fichero YAML que dice qué tareas hay que ejecutar, en qué nodos y con qué datos. Este es un extracto del playbook del laboratorio:

```yaml
---                                                           # 1
- name: Configurar el entorno de despliegue del módulo 5168   # 2
  hosts: local                                                # 3
  gather_facts: false                                         # 4
  vars_files:                                                 # 5
    - "vars/{{ target_env }}.yml"
  vars:                                                       # 6
    app_version: "dev"
  tasks:                                                      # 7
    - name: Generar el ConfigMap a partir de la plantilla     # 8
      ansible.builtin.template:                               # 9
        src: templates/configmap.yaml.j2                      # 10
        dest: "{{ playbook_dir }}/rendered/configmap-resolved.yaml"
```

| Nº | Elemento | Qué hace |
|---|---|---|
| 1 | `---` | Marca el inicio del documento YAML. Es una convención: los ficheros de Ansible suelen empezar así |
| 2 | `- name` (del play) | Un **play** enlaza un grupo de nodos con una lista de tareas. Un playbook es una lista de plays; en este módulo usaremos uno solo |
| 3 | `hosts` | A quién se aplica: un nodo o un grupo del inventario. Aquí, el grupo `local` |
| 4 | `gather_facts` | Si Ansible recoge información del nodo (sistema operativo, IP…) antes de empezar. Aquí no hace falta y desactivarlo ahorra tiempo |
| 5 | `vars_files` | Ficheros de variables que se cargan antes de las tareas. El nombre del fichero depende de la variable `target_env` |
| 6 | `vars` | Variables definidas en el propio playbook. `app_version` tiene un valor por defecto (`dev`) que se puede sustituir con `-e` |
| 7 | `tasks` | La lista de tareas. Se ejecutan **en orden, de arriba abajo**, y si una falla, el playbook se detiene |
| 8 | `name` (de la tarea) | Descripción legible. Es lo que aparece en la salida. Hay que ponerlo siempre |
| 9 | Módulo | Lo que realmente se hace (`template`, `file`, `command`…). Cada tarea usa **un** módulo |
| 10 | Argumentos | Los parámetros del módulo: de qué plantilla partir (`src`) y dónde escribir el resultado (`dest`) |

El prefijo `ansible.builtin.` es el nombre completo del módulo (*FQCN*, *Fully Qualified Collection Name*). Significa "módulo incluido en el propio Ansible". Se puede escribir solo `template`, pero el nombre completo evita confusiones entre módulos con el mismo nombre de distintas colecciones, y es la forma recomendada.

### 6. Módulos: los verbos de Ansible

Si el playbook es la receta, los módulos son los verbos: crear, copiar, rellenar, comprobar, ejecutar. Hay miles; hoy usamos solo los básicos:

| Módulo | Qué hace | Idempotente |
|---|---|---|
| `ansible.builtin.file` | Crea o borra directorios y ficheros, y cambia permisos (`state: directory`) | Sí |
| `ansible.builtin.copy` | Copia un fichero o escribe un texto (`content:`) en un destino | Sí |
| `ansible.builtin.template` | Rellena una plantilla Jinja2 con variables y escribe el resultado | Sí |
| `ansible.builtin.lineinfile` | Asegura que una línea esté (o no) presente en un fichero | Sí |
| `ansible.builtin.debug` | Muestra un mensaje o el valor de una variable | No cambia nada: siempre `ok` |
| `ansible.builtin.assert` | Comprueba condiciones y falla con un mensaje si no se cumplen | No cambia nada: `ok` o `failed` |
| `ansible.builtin.command` | Ejecuta un comando, sin pasar por la shell | **No**: siempre `changed` |
| `ansible.builtin.shell` | Como `command`, pero con shell (tuberías, redirecciones…) | **No**: siempre `changed` |

**`command` y `shell` son el último recurso.** Ansible no sabe qué hace un comando por dentro, así que siempre asume que ha cambiado algo. Si existe un módulo específico para lo que quieres hacer, úsalo. Para ejecutar `kubectl` no hay otra opción en los módulos básicos (existe una colección específica para Kubernetes, `kubernetes.core`, que hoy no usamos), así que veremos cómo "domar" a `command` con `changed_when`.

Cada módulo se documenta con el comando `ansible-doc`. Por ejemplo, para ver todos los parámetros de `template`:

```
ansible-doc ansible.builtin.template
```

### 7. Variables y plantillas Jinja2

Una **variable** es un valor con nombre que se usa en el playbook o en las plantillas con la sintaxis `{{ nombre }}`. Pueden venir de varios sitios:

- **`vars:`** dentro del playbook (por ejemplo, `app_version` con valor por defecto `dev`).
- **`vars_files:`** ficheros externos, como `vars/staging.yml`. Es lo que usamos para los valores propios de cada entorno.
- **El inventario**, para valores propios de cada nodo.
- **`-e "clave=valor"`** en la línea de comandos (*extra vars*). Son las de máxima prioridad: **siempre ganan** a todas las demás.

En el laboratorio, cada valor tiene su sitio:

| Variable | De dónde sale | Ejemplo |
|---|---|---|
| `target_env` | Línea de comandos (`-e`). No tiene valor por defecto: hay que indicarla siempre | `staging` o `production` |
| `app_version` | `vars:` del playbook (por defecto `dev`). Se sustituye con `-e` | `1.0.0` |
| `log_level`, `replicas` | Fichero `vars/<entorno>.yml` | `DEBUG` y `1` en staging; `WARN` y `2` en production |
| `rendered_dir` | `vars:` del playbook | Carpeta `rendered/` junto al playbook |

Una **plantilla** es un fichero con huecos que se rellenan al ejecutar. Ansible usa el motor **Jinja2** (el mismo de Python), y el módulo `template` es el que sustituye los huecos y escribe el resultado. Estas son las construcciones que necesitas:

| Sintaxis | Qué hace | Ejemplo |
|---|---|---|
| `{{ variable }}` | Inserta el valor de la variable | `puerto: {{ puerto }}` |
| `{{ variable \| default('x') }}` | Usa un valor por defecto si la variable no existe | `nivel: {{ nivel \| default('info') }}` |
| `{% if variable is defined %}` | Incluye un bloque solo si se cumple la condición | Una línea que solo aparece en producción |
| `{% for k, v in dic.items() %}` | Repite un bloque por cada elemento | Una línea por cada clave de un diccionario |

Ejemplo mínimo, con datos que no son los del laboratorio:

```
# plantilla: servidor.j2
Servidor: {{ nombre }} (puerto {{ puerto }})

# variables: vars/web1.yml
nombre: web1
puerto: 8080

# resultado generado
Servidor: web1 (puerto 8080)
```

La idea clave de la sesión es **separar lo que cambia de lo que no cambia**:

```
 vars/staging.yml ------+
                        +--> [ módulo template ] --> rendered/configmap-resolved.yaml
 configmap.yaml.j2 -----+      (target_env=staging)

 vars/production.yml ---+
                        +--> [ módulo template ] --> rendered/configmap-resolved.yaml
 configmap.yaml.j2 -----+      (target_env=production)
```

La plantilla y el playbook son los mismos para todos los entornos. Lo único que cambia es el fichero de variables que se carga. Para añadir un entorno nuevo basta con crear **un fichero de variables**; nadie toca ni la plantilla ni el playbook. Y la elección del entorno se hace al ejecutar, con `-e target_env=production`, que es justo lo que hará Jenkins.

**Los secretos no van en estos ficheros.** Contraseñas, tokens y claves no se escriben en `vars/` ni se suben al repositorio. Ansible tiene una herramienta para cifrarlos (*Ansible Vault*), y en un pipeline se suelen pasar desde el gestor de credenciales de Jenkins.

### 8. Idempotencia: el concepto central

Una operación es **idempotente** cuando ejecutarla una vez o diez deja el sistema exactamente en el mismo estado. Compara estas dos formas de asegurar que un fichero de configuración tiene una línea:

```
# Imperativo (shell): cada ejecución AÑADE otra línea
echo "LOG_LEVEL=debug" >> app.conf

# Declarativo (Ansible): describe CÓMO DEBE QUEDAR el fichero
- name: Asegurar el nivel de log
  ansible.builtin.lineinfile:
    path: app.conf
    line: "LOG_LEVEL=debug"
```

Con el script, ejecutarlo cinco veces produce cinco líneas repetidas. Con Ansible, la segunda vez el módulo comprueba el fichero, ve que la línea ya está y **no hace nada**. Esa es la diferencia entre decir *cómo hacerlo* (imperativo) y decir *cómo debe quedar* (declarativo).

**Los estados de una tarea.** Al terminar cada tarea, Ansible informa de lo que ha pasado:

| Estado | Significado | Color habitual |
|---|---|---|
| `ok` | El nodo ya estaba en el estado deseado. No se ha tocado nada | Verde |
| `changed` | El nodo no estaba como se pedía y Ansible lo ha cambiado | Amarillo o naranja |
| `failed` | La tarea ha fallado y el playbook se detiene | Rojo |
| `skipped` | La tarea no se ha ejecutado (no se cumplía su condición) | Cian |
| `unreachable` | No se ha podido conectar con el nodo | Rojo |

Al final de cada ejecución aparece el resumen **PLAY RECAP**. Es lo primero que hay que mirar:

```
PLAY RECAP *********************************************************************
localhost : ok=3    changed=2    unreachable=0    failed=0    skipped=0 ...
```

Primera ejecución: `changed=2` (se han hecho dos cambios). Si se repite sin tocar nada, tiene que salir `changed=0`: el sistema ya está como se pidió. Esa es la prueba práctica de idempotencia, y la que vais a hacer hoy. Además, si alguien modifica un fichero a mano, la siguiente ejecución lo detecta y lo corrige: Ansible elimina la deriva de configuración.

**Por qué importa en un despliegue continuo.** Un pipeline se ejecuta cientos de veces, en cada cambio del repositorio. Si sus pasos no fueran idempotentes, cada ejecución podría romper algo. Además, `changed=0` es información útil: no cambió nada, así que no hace falta reiniciar ni redesplegar.

**Cómo domar a `command`.** Como `command` siempre da `changed`, se le dice a Ansible cuándo cuenta realmente como cambio. Para ello se guarda su resultado con `register` y se condiciona con `changed_when`. Esta es la tarea real del playbook del laboratorio:

```
- name: Aplicar el ConfigMap en el clúster
  ansible.builtin.command: kubectl apply -f "{{ rendered_dir }}/configmap-resolved.yaml"
  register: resultado
  changed_when: "'unchanged' not in resultado.stdout"
```

`kubectl apply` imprime una de tres cosas: `configmap/modulo5168-config created` (no existía), `... configured` (existía y ha cambiado) o `... unchanged` (ya estaba igual). La condición dice: *es un cambio siempre que la salida **no** contenga `unchanged`*. Así, la tarea sale `changed` en `created` y `configured`, y `ok` en `unchanged`. Cuando el comando solo consulta (como `date` o `kubectl get`), se escribe directamente `changed_when: false`.

Con el playbook del laboratorio, la **primera ejecución** da `ok=4 changed=3` (carpeta, fichero y ConfigMap creados) y las siguientes, sin tocar nada, `ok=4 changed=0`.

### 9. Ejecutar con seguridad: --check, --diff y -e

El comando que lanza un playbook es `ansible-playbook`. Sus opciones más útiles:

| Opción | Para qué sirve |
|---|---|
| `-i inventory.ini` | Indica qué inventario usar. En el laboratorio no hace falta: lo indica `ansible.cfg` |
| `-e "target_env=production"` | Pasa una o varias variables extra, entre comillas si son varias. Tienen prioridad sobre todas las demás |
| `--syntax-check` | Revisa la sintaxis del playbook sin ejecutar nada |
| `--check` | Modo simulacro (*dry run*): informa de qué cambiaría, sin cambiar nada |
| `--diff` | Muestra, línea a línea, las diferencias en los ficheros que cambiarían o cambian |
| `-v`, `-vv`, `-vvv` | Más detalle en la salida. Útil para depurar |

`--check --diff` es la combinación estrella: te enseña exactamente qué va a cambiar antes de que cambie. En un pipeline de despliegue es una etapa natural antes de aplicar nada. Un límite: en modo simulacro, `command` y `shell` no se ejecutan (salen `skipping`), porque Ansible no puede saber qué harían. En nuestro playbook, eso significa que `--check` muestra qué cambiaría en el fichero generado, pero **no** llega a tocar el clúster.

### 10. Ansible dentro del pipeline de despliegue

Para ver dónde encaja todo esto, así se invoca el mismo playbook desde la etapa de Jenkins del laboratorio. No lo ejecutaremos hoy; sirve para ver el conjunto:

```
stage('Configurar entorno (Ansible)') {
    steps {
        dir('lab/ansible') {
            sh 'ansible-playbook -i inventory.ini playbook.yml -e "target_env=$TARGET_ENV app_version=$IMAGE_TAG"'
        }
    }
}
```

Fíjate en lo importante: **el playbook es uno solo**. Lo único que cambia entre un despliegue en *staging* y uno en *producción* es el valor de `TARGET_ENV`, y la versión de la imagen se pasa en `app_version`. Esa separación entre definición común y datos por entorno es la base del criterio b. (El contenedor de Jenkins del laboratorio ya incluye Ansible, y necesita el kubeconfig para que `kubectl` vea el clúster.)

### Comprobación rápida

Preguntas para hacer en voz alta antes de pasar a la práctica:

1. Ejecutas un playbook y el resumen dice `changed=2`. Lo vuelves a ejecutar sin tocar nada. ¿Qué esperas ver? *(changed=0: todo ya estaba como se pidió.)*
2. ¿Por qué `echo "x" >> fichero` no es idempotente y `lineinfile` sí? *(El primero añade siempre; el segundo comprueba el estado y solo actúa si hace falta.)*
3. ¿Por qué no hace falta instalar nada en los nodos gestionados? *(Ansible no usa agente: envía un módulo temporal por SSH, lo ejecuta y lo borra.)*
4. Una variable está definida en `vars/staging.yml` y también se pasa con `-e`. ¿Cuál se usa? *(La de `-e`, que gana siempre.)*
5. En el playbook del laboratorio, ¿de dónde sale el valor de `target_env`? ¿Y el de `log_level`? *(`target_env` de la línea de comandos; `log_level` del fichero `vars/<entorno>.yml` que se carga.)*
6. Queremos un tercer entorno, `preprod`. ¿Qué ficheros hay que crear o tocar? *(Solo un `vars/preprod.yml`; la plantilla y el playbook no cambian.)*
7. ¿Por qué `command: date` sale siempre `changed` y cómo se corrige? *(Ansible no sabe qué hace el comando; se corrige con `changed_when: false`, o con una condición sobre su salida, como en `kubectl apply`.)*
8. ¿Para qué sirve `--check --diff` antes de un despliegue? *(Para ver qué cambiaría exactamente sin tocar nada.)*

## 7.2 Práctica

### Parte A — Tu primer playbook

**Objetivo:** escribir un playbook propio desde cero, ejecutarlo y comprobar con tus propios ojos qué es la idempotencia, antes de pasar al laboratorio real. Esta parte se hace en una carpeta aparte, para no tocar los ficheros del laboratorio.

#### Paso 1. Preparar el terminal y la carpeta de pruebas

Activa el entorno virtual de Ansible (si no lo está ya) y comprueba la versión:

```
source ~/venv-ansible/bin/activate
ansible --version
```

Debe aparecer una primera línea parecida a `ansible [core 2.xx.x]`. Anota la versión en tu cuaderno. Después, crea la carpeta de pruebas:

```
mkdir ~/ansible-prueba
cd ~/ansible-prueba
```

**A partir de aquí, todos los comandos de la parte A se lanzan desde `~/ansible-prueba`.** Ansible busca el `ansible.cfg` en la carpeta actual.

#### Paso 2. Configuración e inventario

Crea los mismos dos ficheros que tiene el laboratorio. `ansible.cfg`:

```ini
[defaults]
inventory = inventory.ini
interpreter_python = auto_silent
retry_files_enabled = False
```

`inventory.ini`:

```ini
[local]
localhost ansible_connection=local
```

Comprueba que todo está conectado con el módulo `ping`:

```
ansible local -m ping
```

Debe responder `SUCCESS`, con `"changed": false` y `"ping": "pong"`. Es tu primera ejecución de un módulo. Responde en el cuaderno: ¿por qué no ha hecho falta indicar el inventario con `-i`? ¿Qué significa `local` en el comando?

#### Paso 3. Primer playbook

Crea el fichero `hola.yml`. **Cambia "Ana" por tu nombre.** Cuida la indentación: 2 espacios por nivel, sin tabuladores.

```yaml
- name: Mi primer playbook
  hosts: local
  gather_facts: false
  vars:
    alumno: "Ana"
  tasks:
    - name: Crear directorio de trabajo
      ansible.builtin.file:
        path: "{{ playbook_dir }}/salida"
        state: directory

    - name: Crear fichero de saludo
      ansible.builtin.copy:
        dest: "{{ playbook_dir }}/salida/saludo.txt"
        content: "Hola {{ alumno }}, esto lo ha creado Ansible\n"

    - name: Mostrar la ruta del fichero
      ansible.builtin.debug:
        msg: "El fichero está en {{ playbook_dir }}/salida/saludo.txt"
```

`playbook_dir` es una variable que Ansible rellena sola con la carpeta del playbook. Revisa la sintaxis y ejecútalo:

```
ansible-playbook hola.yml --syntax-check
ansible-playbook hola.yml
```

Debes ver algo parecido a esto (los detalles cambian un poco según la versión):

```
PLAY [Mi primer playbook] ******************************************************

TASK [Crear directorio de trabajo] *********************************************
changed: [localhost]

TASK [Crear fichero de saludo] *************************************************
changed: [localhost]

TASK [Mostrar la ruta del fichero] *********************************************
ok: [localhost] => {
    "msg": "El fichero está en /home/usuario/ansible-prueba/salida/saludo.txt"
}

PLAY RECAP *********************************************************************
localhost : ok=3    changed=2    unreachable=0    failed=0    skipped=0 ...
```

Abre `salida/saludo.txt` con `cat` y responde:

1. ¿Qué estado tiene cada una de las tres tareas? ¿Por qué la tercera no es `changed`?
2. ¿Qué significa `changed=2` en el PLAY RECAP?
3. ¿Qué línea del playbook enlaza este play con el inventario?

#### Paso 4. Comprobar la idempotencia

Vuelve a lanzar **exactamente el mismo comando**, sin tocar nada:

```
ansible-playbook hola.yml
```

Ahora el resumen debe decir `changed=0`. Las dos primeras tareas salen `ok`: el directorio y el fichero ya estaban como se pedía, así que Ansible no ha hecho nada.

**Provoca una deriva.** Imagina que alguien edita el fichero a mano. Haz lo mismo y vuelve a ejecutar:

```
echo "otra cosa" > salida/saludo.txt
ansible-playbook hola.yml
cat salida/saludo.txt
```

Responde: ¿qué tarea sale ahora `changed`? ¿Qué contiene el fichero después? ¿Qué habría hecho un script de shell con `echo "..." >> fichero`?

#### Paso 5. Simular antes de cambiar: --check y --diff

Edita `hola.yml` y cambia el texto de `content` (por ejemplo, "esto lo ha creado Ansible" por "este fichero lo gestiona Ansible"). Antes de ejecutar de verdad, **simula**:

```
ansible-playbook hola.yml --check --diff
```

Verás las líneas con el contenido antiguo (precedidas de `-`) y el nuevo (precedidas de `+`), y la tarea marcada como `changed`. Pero **no se ha cambiado nada**: comprueba con `cat salida/saludo.txt` que el fichero sigue igual. Ahora ejecútalo sin `--check` y verifica que el fichero sí cambia.

#### Paso 6. Cuando un módulo no es idempotente

Crea el fichero `fecha.yml`:

```yaml
- name: command no es idempotente
  hosts: local
  gather_facts: false
  tasks:
    - name: Leer la fecha
      ansible.builtin.command: date

    - name: Leer la fecha sin marcar cambio
      ansible.builtin.command: date
      changed_when: false
```

Ejecútalo **dos veces** y observa el estado de cada tarea. La primera sale siempre `changed` aunque solo lea la hora; la segunda, `ok`. Ansible no puede saber qué hace `date`, y `changed_when: false` es la forma de decirle que no modifica nada. Es el mismo mecanismo que usa el laboratorio con `kubectl apply`.

**Entregable de la parte A:** captura del segundo `PLAY RECAP` de `hola.yml` con `changed=0`.

### Parte B — El laboratorio real: una plantilla, dos entornos

**Objetivo:** usar el playbook del laboratorio para configurar *staging* y *producción* en el clúster Minikube, partiendo siempre de la misma plantilla, y comprobar cada resultado desde fuera de Ansible, con `kubectl`.

#### Paso 1. Recorrido por el laboratorio

Cambia a la carpeta del laboratorio y mira qué hay. **A partir de aquí, los comandos de la parte B se lanzan desde `~/modulo5168-lab/lab/ansible`.**

```
cd ~/modulo5168-lab/lab/ansible
ls -R
```

Debe aparecer esta estructura:

```
.
├── ansible.cfg
├── inventory.ini
├── playbook.yml
├── templates
│   └── configmap.yaml.j2
└── vars
    ├── production.yml
    └── staging.yml
```

Abre cada fichero con `cat` y relaciónalo con lo visto en la teoría:

| Fichero | Qué contiene | Conecta con la teoría |
|---|---|---|
| `ansible.cfg` | Inventario por defecto y opciones de Ansible | Inventario y ansible.cfg |
| `inventory.ini` | Grupo `local` con `localhost`, sin SSH | Inventario |
| `vars/staging.yml` | Valores de *staging*: `log_level: DEBUG`, `replicas: 1` | Variables por entorno |
| `vars/production.yml` | Valores de *producción*: `log_level: WARN`, `replicas: 2` | Variables por entorno |
| `templates/configmap.yaml.j2` | El ConfigMap de Kubernetes con huecos `{{ }}` | Plantilla Jinja2 |
| `playbook.yml` | Las tareas: crear carpeta, rellenar plantilla, aplicar con `kubectl`, mostrar resultado | Playbook y módulos |
| `rendered/` | El resultado generado. No existe todavía: lo creará Ansible | Fichero generado |

Responde en tu cuaderno, mirando los ficheros:

1. ¿Qué claves tienen valores distintos entre `staging.yml` y `production.yml`? ¿Y cuáles aparecen en la plantilla pero no en `vars/`?
2. ¿De dónde saldrán `target_env` y `app_version`? ¿Cuál de las dos tiene valor por defecto?
3. El playbook tiene cuatro tareas. ¿Cuál de ellas no es idempotente por sí sola y cómo lo soluciona el playbook?

#### Paso 2. Comprobar el clúster y la sintaxis

```
kubectl get nodes
ansible-playbook playbook.yml -e "target_env=staging" --syntax-check
```

El primer comando debe mostrar el nodo `minikube` en estado `Ready` (si no, `minikube start`). El segundo solo imprime `playbook: playbook.yml`. Si falla, revisa los ficheros antes de seguir.

#### Paso 3. Simular antes de aplicar

```
ansible-playbook playbook.yml -e "target_env=staging app_version=1.0.0" --check --diff
```

Fíjate en tres cosas: la plantilla se muestra **ya rellena** (todo con `+`, porque el fichero aún no existe), la tarea de `kubectl` sale `skipping` (el simulacro no ejecuta comandos) y, con `ls`, comprobarás que la carpeta `rendered/` **todavía no existe**. No se ha tocado nada.

#### Paso 4. Configurar staging

```
ansible-playbook playbook.yml -e "target_env=staging app_version=1.0.0"
```

Las comillas son importantes: sin ellas, `app_version=1.0.0` se interpreta como otro argumento. La salida debe terminar así:

```
TASK [Aplicar el ConfigMap en el clúster] **************************************
changed: [localhost]

TASK [Mostrar el resultado de kubectl] *****************************************
ok: [localhost] => {
    "resultado.stdout": "configmap/modulo5168-config created"
}

PLAY RECAP *********************************************************************
localhost : ok=4    changed=3    unreachable=0    failed=0    skipped=0 ...
```

Ahora comprueba el resultado **fuera de Ansible**: el fichero generado y el ConfigMap en el clúster.

```
cat rendered/configmap-resolved.yaml
kubectl get configmap modulo5168-config -o yaml
```

Debes ver `TARGET_ENV: "staging"`, `APP_VERSION: "1.0.0"`, `LOG_LEVEL: "DEBUG"` y `REPLICAS: "1"` en los dos sitios.

#### Paso 5. Idempotencia en el laboratorio

Ejecuta el **mismo comando** otra vez, sin tocar nada:

```
ansible-playbook playbook.yml -e "target_env=staging app_version=1.0.0"
```

Ahora `kubectl` dice `configmap/modulo5168-config unchanged` y el resumen es `ok=4 changed=0`. Responde: ¿por qué `kubectl apply` sale `ok` esta vez, si la tarea usa `command`? ¿Qué condición del playbook lo decide?

#### Paso 6. Un cambio de configuración

1. Edita `vars/staging.yml` y cambia `log_level: DEBUG` por `log_level: INFO`.
2. Simula primero, con el mismo comando del paso 4 más `--check --diff`. Debe mostrar solo la línea `LOG_LEVEL`, con un `-` y un `+`. (La ruta "after" que aparece es un fichero temporal: es normal.)
3. Ejecuta sin `--check`. Esta vez el resumen dice `ok=4 changed=2`: la plantilla y `kubectl apply` (`configured`).
4. Comprueba en el clúster: `kubectl get configmap modulo5168-config -o jsonpath='{.data.LOG_LEVEL}'` debe devolver `INFO`.
5. **Restaura `log_level: DEBUG` en `vars/staging.yml`** (las sesiones siguientes cuentan con este valor) y vuelve a ejecutar para dejar el clúster como estaba.

#### Paso 7. El mismo playbook, otro entorno

El fichero `rendered/configmap-resolved.yaml` se sobrescribe en cada ejecución. Guarda antes una copia del de staging para poder compararlos:

```
cp rendered/configmap-resolved.yaml /tmp/staging.yaml
ansible-playbook playbook.yml -e "target_env=production app_version=1.0.0"
diff /tmp/staging.yaml rendered/configmap-resolved.yaml
```

Responde en tu cuaderno: ¿qué líneas son distintas? ¿Has tocado la plantilla o el playbook? ¿Por qué `kubectl` dice ahora `configured` y no `created`? Mira también el ConfigMap del clúster: ¿qué valores tiene?

**Atención al diseño del laboratorio.** Los dos entornos usan el mismo ConfigMap (`modulo5168-config`) en el mismo namespace, así que la segunda ejecución **sustituye** a la primera. Es una simplificación del aula; lo comentaremos en el cierre.

#### Paso 8. Un entorno nuevo sin tocar el código

Crea el fichero `vars/preprod.yml` con estos valores y ejecuta el playbook para el entorno `preprod`:

```
---
log_level: INFO
replicas: 1
```

```
ansible-playbook playbook.yml -e "target_env=preprod app_version=1.0.0"
```

Revisa `rendered/configmap-resolved.yaml`: `TARGET_ENV` vale `preprod`. Has añadido un entorno completo creando **un solo fichero**. Anota qué has tenido que cambiar en la plantilla y en el playbook.

#### Paso 9. Provocar errores a propósito

Prueba, uno por uno, estos casos y observa el resultado. Después, deshaz el cambio.

| Prueba | Qué debe ocurrir | Qué te enseña |
|---|---|---|
| Ejecutar sin `-e` (`ansible-playbook playbook.yml`) | Falla con `'target_env' is undefined` | No hay valor por defecto para `target_env`: hay que indicarlo siempre |
| Ejecutar con `-e target_env=dev` (no existe `vars/dev.yml`) | Falla en la plantilla con `'log_level' is undefined`. Según la versión de Ansible, antes puede aparecer un aviso por no encontrar el fichero | El error aparece lejos de la causa: hay que buscar **por qué** falta la variable |
| Borrar la línea `replicas` de `vars/staging.yml` y ejecutar | Falla con `'replicas' is undefined` | Ansible no rellena en silencio una variable que no existe |
| Parar el clúster (`minikube stop`) y ejecutar staging | La tarea de `kubectl apply` falla con un error de conexión. Ansible lo muestra como `failed` | Un fallo del comando detiene el playbook, igual que un código de salida distinto de 0 detiene un pipeline |

Aprende a leer el error: lo importante está en las primeras líneas, donde Ansible indica el fichero, la línea y la tarea que ha fallado. Si has parado Minikube, vuelve a arrancarlo con `minikube start` antes de seguir.

#### Paso 10. Limpiar y restaurar

Deja el laboratorio como lo encontraste, porque las sesiones siguientes parten de él:

```
rm vars/preprod.yml
kubectl delete configmap modulo5168-config
rm -rf rendered
git status        # solo si el proyecto es un repositorio: no debe haber cambios en vars/
```

Comprueba que `vars/staging.yml` y `vars/production.yml` tienen los valores originales (`DEBUG`/`1` y `WARN`/`2`).

#### Paso 11. Entregable

**Entregable:** (1) captura del `PLAY RECAP` de la segunda ejecución de staging, con `changed=0`; (2) la salida del `diff` entre los ConfigMaps de staging y producción; (3) la salida de `kubectl get configmap modulo5168-config -o yaml` tras ejecutar un entorno; (4) las respuestas del cuaderno de los pasos 1, 5, 7 y 8.

### Ampliación (para quien acabe antes)

Haz estos ejercicios **antes** del paso 10 y restaura los ficheros al terminar cada uno.

**1. Validar el entorno.** Añade este bloque al playbook, justo antes de `tasks:`, con la misma indentación que `vars:`:

```yaml
  pre_tasks:
    - name: Comprobar que el entorno es válido
      ansible.builtin.assert:
        that:
          - target_env in ['staging', 'production']
        fail_msg: "target_env debe ser staging o production, y has pasado '{{ target_env }}'"
```

Ejecuta con `-e target_env=dev` y con `-e target_env=staging`. ¿Qué cambia respecto al paso 9? *(Falla enseguida y con un mensaje claro, antes de hacer nada.)* Y si ahora quieres usar `preprod`, ¿qué hay que cambiar? *(Añadir `preprod` a la lista del `assert`.)*

**2. Consultar el clúster.** Añade al final de las tareas una que lea el valor aplicado, sin marcarla como cambio:

```
    - name: Consultar el nivel de log aplicado
      ansible.builtin.command: kubectl get configmap modulo5168-config -o jsonpath='{.data.LOG_LEVEL}'
      register: nivel
      changed_when: false

    - name: Mostrar el nivel de log
      ansible.builtin.debug:
        msg: "El clúster tiene LOG_LEVEL={{ nivel.stdout }}"
```

Ejecútalo dos veces. ¿Por qué esta tarea sale siempre `ok` aunque use `command`? *(Por `changed_when: false`: solo lee, no modifica nada.)*

**3. Permisos con un parámetro.** En la tarea de la plantilla, cambia `mode: "0644"` por `mode: "0600"` y ejecuta staging. ¿Qué tarea sale `changed`? ¿Y `kubectl apply`? ¿Por qué? *(Cambia la plantilla, porque los permisos del fichero son distintos; `kubectl apply` sale `ok` porque el contenido es idéntico: el clúster no ve ningún cambio.)* Restaura `0644`.

**4. Una variable solo en producción.** Añade `feature_x: true` a `vars/production.yml` y este bloque al final de la plantilla:

```
{% if feature_x is defined %}
  FEATURE_X: "{{ feature_x | lower }}"
{% endif %}
```

Genera los dos entornos y comprueba que solo el de producción tiene la línea `FEATURE_X`. ¿Para qué sirve `| lower`? *(Convierte `True` de Python en `true`.)* Restaura la plantilla y `vars/production.yml`.

## 7.3 Cierre y para pensar (parte final de la sesión)

Con los entornos configurados, comentad en voz alta:

1. Un compañero dice: "Copio `staging.yml`, cambio los valores a mano y lo aplico: es lo mismo". ¿Qué se pierde? ¿Qué pasa si hay veinte entornos?
2. En el laboratorio, staging y producción comparten el mismo ConfigMap en el mismo namespace, y la segunda ejecución sustituye a la primera. ¿Qué problema tendría esto en un clúster real? ¿Cómo lo resolverías? *(Namespaces distintos, o nombres distintos por entorno.)*
3. Las contraseñas de la base de datos son distintas en cada entorno. ¿Las pondrías en `vars/production.yml`? ¿Dónde irían?
4. El playbook y las plantillas están en ficheros de texto. ¿Qué ventajas tiene guardarlos en el repositorio junto al código de la aplicación?
5. Si alguien cambia a mano el ConfigMap de producción, ¿qué ocurre la próxima vez que se ejecute el playbook? ¿Es bueno o malo? *(`kubectl apply` lo devuelve al estado definido: `configured`. Es bueno: elimina la deriva.)*

## Errores frecuentes

| Error | Consecuencia | Cómo evitarlo |
|---|---|---|
| Indentar con tabuladores o con niveles incoherentes | `YAML parsing failed` o errores raros de "mapping values" | Usar 2 espacios por nivel. Configurar el editor para convertir tabuladores en espacios y usar `--syntax-check` |
| Escribir un valor que empieza por `{{` sin comillas | Error de sintaxis YAML | Entrecomillar siempre: `"{{ variable }}"` |
| Entorno virtual sin activar (en la VM no suele pasar; sí en otros equipos) | `ansible-playbook: command not found` | `source ~/venv-ansible/bin/activate`. El prompt debe empezar por `(venv-ansible)` |
| Ejecutar desde una carpeta que no es `lab/ansible/` | `the playbook: playbook.yml could not be found`, o Ansible no encuentra `ansible.cfg` ni `vars/` | Hacer `cd ~/modulo5168-lab/lab/ansible` antes de lanzar el playbook |
| Pasar varias variables sin comillas: `-e target_env=staging app_version=1.0.0` | Ansible muestra un mensaje de uso (`usage:`) y no ejecuta nada | Entrecomillar todas juntas: `-e "target_env=staging app_version=1.0.0"` |
| Olvidar `-e target_env=...` | `'target_env' is undefined` | Indicar siempre el entorno. No tiene valor por defecto a propósito |
| Usar un `target_env` sin fichero `vars/<entorno>.yml` | Falla en la plantilla con `'log_level' is undefined`, lejos de la causa real | Comprobar que existe `vars/<entorno>.yml` o validar el entorno con un `assert` |
| Escribir mal el nombre de un módulo (`ansible.builtin.copi`) | `couldn't resolve module/action` | Copiar el nombre completo de la teoría o consultarlo con `ansible-doc` |
| Escribir mal el nombre de una variable | `'alumo' is undefined` | Revisar la ortografía. Usar `default()` solo cuando la variable sea realmente opcional |
| El clúster está apagado | La tarea `kubectl apply` falla con un error de conexión | `minikube start` y `kubectl get nodes` antes de ejecutar |
| Esperar que `--check` aplique algo en el clúster | La tarea de `kubectl` sale `skipping` y el clúster no cambia | Es el comportamiento normal: el simulacro no ejecuta comandos |
| Usar `command` o `shell` para todo | Todas las tareas salen siempre `changed` y se pierde la idempotencia | Preferir un módulo específico; si no existe, añadir `changed_when` |
| Editar a mano `rendered/configmap-resolved.yaml` | La siguiente ejecución lo sobrescribe y el cambio se pierde | Cambiar siempre `vars/` o la plantilla, nunca el fichero generado |
| Dejar modificados `vars/staging.yml` o `vars/production.yml` tras las pruebas | Las sesiones siguientes parten de valores distintos a los esperados | Restaurar `DEBUG`/`1` y `WARN`/`2` (paso 10) y revisar con `git status` |
| Pegar el playbook desde Word o un PDF con comillas tipográficas | Errores de sintaxis incomprensibles | Copiar desde un editor de texto plano y comprobar que las comillas son rectas (`"` y `'`) |
| Poner contraseñas o tokens en `vars/` y subirlos al repositorio | Los secretos quedan expuestos en el historial de Git | No guardar secretos en estos ficheros. Usar *Ansible Vault* o las credenciales de Jenkins |

---

[← Sesión 4](sesion4.md) · [Índice de la UT02](./) · [Sesión 6 →](sesion6.md)
{% endraw %}
