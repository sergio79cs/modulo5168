[← Sesión 2](sesion2.md) · [Índice de la UT02](./) · [Sesión 4 →](sesion4.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 3 — Integración con Git

**Módulo 5168 · Definición de flujos de procesos de despliegue continuo**

| Dato | Detalle |
|---|---|
| Finalidad | Base para el criterio a |
| Herramientas | Jenkins y Gitea, en Docker, en el ordenador de cada alumno |
| Requisito previo | Laboratorio levantado (Jenkins y Gitea) y un Job de tipo Pipeline creado en sesiones anteriores |

## 1. Objetivos de la sesión

- Explicar por qué el pipeline se versiona junto al código (Pipeline as Code).
- Configurar un Job como **Pipeline script from SCM** apuntando a un repositorio de Gitea.
- Distinguir entre **polling** y **webhook** y elegir según el contexto.
- Configurar un webhook en Gitea para que un `push` dispare el build sin pulsar *Build Now*.
- Diagnosticar los fallos más frecuentes de conectividad, credenciales y configuración.

## 2. Estructura de la sesión

La teoría se reparte en dos bloques que se alternan con la práctica, de modo que cada concepto se aplica justo después de explicarlo.

| Orden | Bloque | Contenido |
|---|---|---|
| 1 | Teoría A | Pipeline as Code, repaso de Git y Pipeline script from SCM |
| 2 | Práctica 1 | Repositorio, Jenkinsfile, reconfiguración del Job y Build Now |
| 3 | Teoría B | Polling frente a webhook, anatomía del webhook, red y seguridad |
| 4 | Práctica 2 | Webhook, trigger y comprobación con un push |
| 5 | Cierre | Evidencias, preguntas de comprobación y puesta en común |

---

## 3. Teoría A: del script en la interfaz al pipeline como código

### 3.1 El problema del script pegado en Jenkins

Hasta ahora el script del pipeline estaba pegado en la configuración del Job. Tres preguntas para pensar:

- ¿Quién cambió el script, cuándo y por qué? ¿Cómo vuelvo a la versión de ayer?
- Si se pierde el volumen de Jenkins, ¿dónde queda mi pipeline?
- ¿Cómo revisa un compañero el cambio antes de que se ejecute?

Con el script en la interfaz la respuesta a las tres es «no se puede». La idea que hay que fijar es **Pipeline as Code**: si el pipeline es código, se trata como código, con versionado, revisión y recuperación.

| Aspecto | Script en la interfaz | Jenkinsfile en el repositorio |
|---|---|---|
| Historial de cambios | No | Sí (`git log`, `git blame`) |
| Revisión por terceros | No | Sí (pull request o merge request) |
| Recuperación ante desastre | Se pierde con Jenkins | Se recupera clonando el repositorio |
| Versión del pipeline = versión del código | No | Sí, viajan en el mismo commit |
| Reproducibilidad en otro Jenkins | Manual | Automática |

> **Ejemplo:** si en la versión 2.0 de la aplicación se añadió una etapa de tests y hay que reconstruir la 1.0, el Jenkinsfile de la 1.0 es el que no tenía esa etapa. Con el script en la interfaz solo existe «la última versión».

### 3.2 Repaso de Git desde el lado del servidor

- **Repositorio remoto** (`origin`): la copia central del proyecto; en nuestro laboratorio es Gitea.
- Comandos `clone`, `commit`, `push`, `fetch` y `pull`: qué hace cada uno y quién lo ejecuta. Jenkins también hace `clone` y `fetch`, como un usuario más.
- **Rama y commit**: un build siempre se hace sobre un commit concreto. El hash aparece en el log de Jenkins y da trazabilidad.
- **Hooks de Git**: scripts que Git ejecuta ante ciertos eventos. Los del lado servidor (por ejemplo `post-receive`) se ejecutan al recibir un push. Los webhooks nacen de esta idea y se retoman en la teoría B.

### 3.3 Cómo funciona Pipeline script from SCM

```
Job en Jenkins ──(1) clona / consulta──> Repositorio Git (Gitea)
       │                                        │
       │<──(2) devuelve el Jenkinsfile──────────┘
       │
       └─(3) ejecuta las etapas en un agente
```

Campos de la configuración:

| Campo | Qué es | Aviso |
|---|---|---|
| Definition | *Pipeline script* (el script vive en Jenkins) o *Pipeline script from SCM* (vive en el repositorio). | Es lo que hay que cambiar. |
| SCM y Repository URL | Tipo de control de versiones (Git) y dirección del repositorio. | En un contenedor, `localhost` es el propio contenedor. Se usa el nombre del servicio, por ejemplo `http://gitea:3000/usuario/repo.git`. |
| Credentials | Credencial almacenada en Jenkins para acceder al repositorio. | Solo hace falta si el repo es privado. |
| Branch Specifier | Rama que se construye, por ejemplo `*/main`. | Error muy común: usar `master` cuando la rama es `main`. |
| Script Path | Ruta del Jenkinsfile dentro del repo. Por defecto, `Jenkinsfile`. | Distingue mayúsculas de minúsculas. |
| Lightweight checkout | Jenkins descarga solo el Jenkinsfile para leerlo. | El código completo se descarga después, dentro del pipeline. |

Ideas importantes:

- Jenkins lee el Jenkinsfile **del commit que va a construir**. Si no hay cambios en el repositorio, no hay nada nuevo que ejecutar.
- En un pipeline declarativo, el código del repositorio se descarga con `checkout scm`: el propio Job ya sabe de qué repositorio viene.
- La **configuración del Job** (URL, rama, credenciales) sigue viviendo en Jenkins. Lo que se versiona es *qué hace* el pipeline, no *de dónde se lee*.
- Como referencia para más adelante existen *Multibranch Pipeline* (un pipeline por rama, descubierto automáticamente) y *Jenkins Configuration as Code*. No se estudian en esta sesión.

Jenkinsfile mínimo que se usará en la práctica:

```groovy
pipeline {
    agent any
    stages {
        stage('Checkout') {
            steps { echo 'Código descargado desde Gitea' }
        }
        stage('Build') {
            steps { sh 'echo "Construyendo commit $GIT_COMMIT"' }
        }
    }
}
```

### 3.4 El ciclo de trabajo resultante

1. El desarrollador edita el Jenkinsfile o el código en local.
2. Hace `git commit` y `git push` a Gitea.
3. Jenkins obtiene esa versión del repositorio y la ejecuta.

> **Pregunta puente:** ¿cómo se entera Jenkins de que hay un push? Ahora mismo, porque alguien pulsa *Build Now*, y eso no es integración continua. La teoría B responde a esta pregunta.

---

## 4. Práctica 1: Pipeline script from SCM

**Objetivo:** que el Job lea el Jenkinsfile del repositorio del laboratorio y que un *Build Now* manual lo ejecute correctamente.

### Paso 1. Comprobar que el laboratorio está levantado

```bash
docker ps --filter name=jenkins --filter name=gitea
```

Deben aparecer los contenedores `jenkins` y `gitea` en estado *Up*. Jenkins está en `http://localhost:8080` y Gitea en `http://localhost:3000` (usuario `aula` / `aula1234` en la .ova). Si alguno está parado: `docker start gitea jenkins`.

### Paso 2. Localizar el repositorio del laboratorio

No se crea ningún repositorio nuevo: se usa `modulo5168-lab`, que ya tienes en Gitea desde la UT01. Ábrelo en `http://localhost:3000/aula/modulo5168-lab` y comprueba que la rama es `main` y que existe la carpeta `lab/` con sus Jenkinsfile.

Para esta sesión añadirás un Jenkinsfile propio en una carpeta aparte, `ut02-s3/`, de modo que no interfiere con el pipeline del laboratorio (`lab/Jenkinsfile`).

### Paso 3. Añadir el Jenkinsfile

Clona el repositorio en la máquina virtual, crea la carpeta y el fichero y súbelo:

```bash
git clone http://localhost:3000/aula/modulo5168-lab.git
cd modulo5168-lab
mkdir ut02-s3
# crea aquí el fichero ut02-s3/Jenkinsfile (sección 3.3)
git add ut02-s3/Jenkinsfile
git commit -m "Añade Jenkinsfile de la sesión 3"
git push origin main
```

Si Git pide usuario y contraseña, son los de Gitea (`aula` / `aula1234`). Comprueba en la web de Gitea que el fichero aparece en `ut02-s3/`.

### Paso 4. Credenciales

El repositorio del laboratorio ya tiene su credencial en Jenkins (`gitea-cred`, creada en la UT01). Úsala en el paso siguiente; no hay que generar ningún token nuevo.

### Paso 5. Crear el Job desde SCM

1. **Nuevo Item → Pipeline** con el nombre `ut02-s3-tunombre`. No modifiques el job `modulo5168-demo`.
2. En la sección **Pipeline**, cambia **Definition** a **Pipeline script from SCM**.
3. **SCM:** Git. **Repository URL:** `http://gitea:3000/aula/modulo5168-lab.git` (nombre del contenedor de Gitea, no `localhost`).
4. **Credentials:** `gitea-cred`.
5. **Branch Specifier:** `*/main`. **Script Path:** `ut02-s3/Jenkinsfile`.
6. Guarda con **Save**.

### Paso 6. Lanzar un build manual y validar

1. Pulsa **Build Now**.
2. Abre el build y entra en **Console Output**.
3. Comprueba que aparecen las líneas de clonado del repositorio y que las etapas *Checkout* y *Build* terminan en verde.
4. Compara el hash del commit que muestra el log con el último commit de Gitea. Deben coincidir.

> **Punto de control:** no pases a la práctica 2 hasta que el build manual funcione. Si falla, revisa la sección de errores frecuentes al final del documento.

---

## 5. Teoría B: cómo se entera Jenkins de un cambio

### 5.1 Dos formas de enterarse: polling y webhook

Analogía: el **polling** es abrir el móvil cada cinco minutos por si hay mensajes; el **webhook** es que el móvil te avise cuando llega uno.

| Aspecto | Poll SCM | Webhook |
|---|---|---|
| Quién inicia | Jenkins pregunta al servidor Git | El servidor Git avisa a Jenkins |
| Latencia | Hasta el intervalo configurado | Casi inmediata |
| Carga | Consultas constantes aunque no haya cambios | Solo cuando hay evento |
| Requisitos de red | Jenkins debe llegar al servidor Git | El servidor Git debe llegar a Jenkins, y Jenkins debe llegar al Git para descargar el código |
| Complejidad | Muy baja | Media |

Sintaxis del planificador de **Poll SCM** (cron de Jenkins), útil como plan B:

| Expresión | Significado |
|---|---|
| `H/2 * * * *` | Cada 2 minutos, en un minuto «hasheado» |
| `H/5 * * * *` | Cada 5 minutos |
| `H * * * *` | Una vez por hora |

La `H` reparte la carga entre Jobs, para que no consulten todos el repositorio en el mismo minuto exacto.

### 5.2 Anatomía de un webhook

Un webhook es, en esencia, **una petición HTTP POST que el servidor Git envía a una URL cuando ocurre un evento**. Sus elementos son:

- **URL de destino:** la de Jenkins. Depende del plugin; en nuestro laboratorio se usa el endpoint que trae Jenkins con el plugin Git, `/git/notifyCommit?url=<repositorio>&token=<token>`. El token es un permiso de acceso que Jenkins exige para aceptar el aviso. Otros plugins usan `/generic-webhook-trigger/invoke`, `/gitea-webhook/post` o `/github-webhook/`.
- **Evento:** en esta sesión, *push*. También existen pull request, creación de etiquetas, etc.
- **Content type:** normalmente `application/json`.
- **Payload:** cuerpo JSON con los datos del evento.
- **Secret:** cadena compartida con la que el servidor firma el mensaje (HMAC) para que el receptor compruebe su origen.
- **Respuesta y reintentos:** Jenkins responde con un código HTTP (200 = recibido, 401 = falta el token, 403 = permisos o CSRF, 404 = URL incorrecta). El servidor Git conserva el historial de entregas, muy útil para depurar.

Payload simplificado de un evento *push*:

```json
{
  "ref": "refs/heads/main",
  "after": "3f2a9c1...",
  "repository": { "full_name": "aula/modulo5168-lab" },
  "pusher": { "login": "aula" },
  "commits": [ { "message": "Añade etapa de test" } ]
}
```

> **Idea importante:** el webhook no transporta el código, solo **avisa**. Después, Jenkins descarga del repositorio lo que necesite.

### 5.3 Red y seguridad

- **Quién llama a quién:** Gitea llama a Jenkins (webhook) y Jenkins llama a Gitea (descarga del código). Ambos sentidos deben funcionar. Con los dos contenedores en la red Docker `lab5168` se resuelven por nombre (`jenkins`, `gitea`) y no hay que exponer nada.
- **Gitea bloquea por defecto los webhooks hacia IPs privadas.** Hay que permitirlo con `ALLOWED_HOST_LIST`; en el laboratorio ya está configurado (`private,loopback`), así que no tendrás que tocarlo.
- **Exponer Jenkins a internet** (por ejemplo, con un túnel para usar GitHub) amplía la superficie de ataque. Si se hace, hay que usar secret, autenticación y mínimos privilegios.
- **Credenciales:** nunca dentro del Jenkinsfile ni del repositorio. Se guardan en el almacén de credenciales de Jenkins y se referencian por su ID.
- **Mínimo privilegio:** el token que usa Jenkins solo necesita lectura sobre el repositorio.

---

## 6. Práctica 2: webhook y disparo automático

**Objetivo:** comprobar que un `push` al repositorio dispara el build sin pulsar *Build Now*.

### Paso 1. Comprobar que Gitea permite webhooks hacia Jenkins

Gitea rechaza por defecto los webhooks dirigidos a direcciones privadas, y `jenkins` se resuelve a una IP privada de la red Docker. En el laboratorio esto ya está resuelto con la variable `GITEA__webhook__ALLOWED_HOST_LIST`. Compruébalo sin cambiar nada:

```bash
docker exec gitea env | grep ALLOWED_HOST
```

Debe aparecer `GITEA__webhook__ALLOWED_HOST_LIST=private,loopback`. Si no aparece, avisa al profesor.

### Paso 2. Crear el token de acceso de Jenkins

No hace falta instalar ningún plugin: el endpoint `/git/notifyCommit` viene con el plugin Git, que Jenkins ya tiene. Pero Jenkins solo acepta el aviso si trae un **token de acceso**, y la máquina del laboratorio no trae ninguno creado. Lo creas tú una vez:

1. En Jenkins: **Administrar Jenkins → Security** (*Configure Global Security*) y baja hasta **Git plugin notifyCommit access tokens**.
2. Pulsa **Add new access token**, ponle de nombre `gitea` y pulsa **Generate**.
3. Copia el valor que aparece (solo se muestra una vez) y guárdalo en un lugar a mano. Pulsa **Guardar** al final de la página.

Ese valor irá en la URL del webhook (paso 4). Es un secreto del laboratorio: no lo subas al repositorio.

### Paso 3. Activar el trigger en el Job

1. Abre el Job `ut02-s3-tunombre` y pulsa **Configure**.
2. En **Build Triggers**, marca **Poll SCM** y deja el campo **Schedule** **vacío**. Así Jenkins no consulta por su cuenta: solo reacciona cuando Gitea le avisa.
3. Guarda con **Save**.

### Paso 4. Revisar o crear el webhook en Gitea

**Qué es lo que vas a crear.** Un webhook es una regla guardada en Gitea que dice: «cuando ocurra este evento en este repositorio, haz esta petición HTTP a esta dirección». Aquí el evento es un *push* y la petición es una llamada a Jenkins. Jenkins recibe el aviso, mira si algún Job usa ese repositorio con **Poll SCM** activado y, si lo encuentra, lanza un build. El webhook no envía el código: solo avisa de que hay algo nuevo.

**Dónde se crea.** En Gitea, dentro del repositorio `modulo5168-lab`: **Configuración → Webhooks**. Si ya hay uno que apunta a Jenkins, comprueba que su URL coincide con la del campo siguiente y pasa al punto 6. Si no, pulsa **Añadir webhook → Gitea** y rellena los campos así:

| Campo | Valor | Para qué sirve |
|---|---|---|
| URL de destino | `http://jenkins:8080/git/notifyCommit?url=http://gitea:3000/aula/modulo5168-lab.git&token=<tu-token>` | A quién se avisa. `jenkins` es el nombre del contenedor en la red Docker. `/git/notifyCommit` es el punto de entrada del plugin Git de Jenkins, el parámetro `url` indica de qué repositorio es el aviso y `token` es el que creaste en el paso 2. **La parte `url` tiene que ser idéntica a la Repository URL del Job**, carácter por carácter. |
| Método HTTP | `POST` | Con `GET`, Gitea añade todo el contenido del evento a la URL y Jenkins la rechaza por demasiado larga (error 414). Con `POST` el contenido va en el cuerpo y la URL queda corta. Deja el tipo de contenido en `application/json`. |
| Evento | Solo *Push events* | Qué hace saltar el aviso. Con «Eventos personalizados» se puede afinar, pero no hace falta. |
| Filtro de rama | `main` | Solo los push a esa rama disparan el aviso. |
| Secret | Vacío | En producción se usaría para firmar el mensaje. En el laboratorio no hace falta, porque la red Docker es privada. |
| Activo | Marcado | Un webhook desmarcado existe pero no envía nada. |

Después de guardar:

1. Entra en el webhook que acabas de crear y pulsa **Probar entrega** (*Test Delivery*). Gitea envía una petición de prueba.
2. Baja a **Recent Deliveries** y abre la entrega. Verás la petición que salió y la respuesta de Jenkins. Debe ser **código 200**.
3. Un 200 significa que Jenkins recibió el aviso, no que haya lanzado un build: eso depende de que el Job tenga **Poll SCM** marcado y la misma URL de repositorio. Es el primer sitio donde mirar si luego no se dispara nada.

### Paso 5. Provocar el disparo con un push

Añade una etapa de tests al Jenkinsfile:

```groovy
pipeline {
    agent any
    stages {
        stage('Checkout') {
            steps { echo 'Código descargado desde Gitea' }
        }
        stage('Build') {
            steps { sh 'echo "Construyendo commit $GIT_COMMIT"' }
        }
        stage('Test') {
            steps { echo 'Ejecutando tests...' }
        }
    }
}
```

Súbelo a Gitea:

```bash
git add ut02-s3/Jenkinsfile
git commit -m "Añade etapa de test"
git push origin main
```

### Paso 6. Comprobar el resultado sin tocar Jenkins

1. Sin pulsar *Build Now*, observa el Job: debe aparecer un build nuevo unos segundos después del push.
2. Abre el build y comprueba en **Console Output** que existe la etapa *Test*, lo que confirma que Jenkins ha leído el Jenkinsfile modificado.
3. Anota la causa del disparo que muestra el build (*Started by an SCM change*, o similar) y el hash del commit.
4. Haz una segunda modificación pequeña y repite el ciclo para comprobar que no ha sido casualidad.

### Alternativa A. Otros plugins de webhook

Existen el plugin *Generic Webhook Trigger* (URL `/generic-webhook-trigger/invoke?token=...`) y el plugin *Gitea* (`/gitea-webhook/post`, pensado para *Multibranch*). No se instalan en esta sesión: el endpoint `notifyCommit` cubre lo que necesitamos y evita tocar el Jenkins del laboratorio.

### Alternativa B (plan B). Poll SCM con planificación

Si el webhook no llega, se puede demostrar el flujo con sondeo. En el Job: **Build Triggers → Poll SCM**, con la expresión `H/2 * * * *`. No demuestra el webhook, pero sí que Jenkins reacciona a los cambios del repositorio.

---

## 7. Errores frecuentes y cómo depurarlos

| Síntoma | Causa probable | Solución |
|---|---|---|
| El build falla al descargar el repositorio | URL con `localhost` desde el contenedor de Jenkins | Usar el nombre del servicio (`http://gitea:3000/...`) |
| «Couldn't find any revision to build» | Rama `master` frente a `main` en el Branch Specifier | Ajustar a `*/main` (o la rama real) |
| «Unable to find Jenkinsfile» | Fichero mal escrito, con otra extensión o fuera de la raíz | Revisar nombre, mayúsculas y **Script Path** |
| Error de autenticación al clonar | Repo privado sin credencial o token sin permisos | Crear la credencial y comprobar el permiso de lectura |
| La entrega del webhook falla con «host not allowed» | Gitea bloquea IPs privadas | Comprobar `ALLOWED_HOST_LIST` (paso 1) y avisar al profesor |
| La entrega devuelve 404 | URL o nombre de contenedor incorrectos | Revisar la ruta `/git/notifyCommit` y el nombre `jenkins` |
| La entrega devuelve 401 («An access token is required») | Falta el token en la URL o es incorrecto | Crear el token (paso 2) y añadir `&token=...` a la URL |
| La entrega devuelve 414 | El método del webhook es `GET` | Cambiarlo a `POST` |
| La entrega devuelve 200 pero no hay build | **Poll SCM** sin marcar o URL del repositorio distinta a la del Job | Marcar **Poll SCM** (vacío) y que `url=` coincida con la Repository URL del Job |

Herramientas de depuración: **Recent Deliveries** en el webhook de Gitea (petición y respuesta completas), **Console Output** del build y el log del contenedor (`docker logs jenkins`).

---

## 8. Cierre

### 8.1 Evidencias para el criterio a

- Captura del Job configurado como *Pipeline script from SCM* (URL, rama y Script Path visibles).
- Captura de la entrega del webhook en Gitea con respuesta 200.
- Captura del build disparado automáticamente, con su causa y el commit que lo provocó.
- Captura del cambio del Jenkinsfile (etapa *Test*) reflejado en el build sin haber tocado la interfaz de Jenkins.

### 8.2 Preguntas de comprobación (en parejas)

1. ¿Qué diferencia hay entre polling y webhook? ¿Quién inicia la comunicación en cada caso?
2. ¿Qué pasa si llega un push mientras hay un build en curso?
3. ¿Por qué `localhost` no sirve como URL de Gitea dentro del contenedor de Jenkins?
4. ¿Qué se gana y qué se pierde al versionar el Jenkinsfile?
5. ¿Qué riesgos tiene exponer Jenkins a internet para recibir webhooks?

### 8.3 Puesta en común

Cada pareja comparte una dificultad que haya encontrado y cómo la resolvió.

---

[← Sesión 2](sesion2.md) · [Índice de la UT02](./) · [Sesión 4 →](sesion4.md)
