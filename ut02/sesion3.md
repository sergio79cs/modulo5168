[← Sesión 2](sesion2.md) · [Índice de la UT02](./) · [Sesión 4 →](sesion4.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 3 — Integración con Git

**Módulo 5168 · Definición de flujos de procesos de despliegue continuo**

| Dato | Detalle |
|---|---|
| Fecha y duración | Jueves 19 de noviembre de 2026 · 2 horas |
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
docker compose ps
```

Deben aparecer Jenkins y Gitea en estado *running*. Por defecto se accede a Jenkins en `http://localhost:8080` y a Gitea en `http://localhost:3000` (los puertos pueden variar según el `docker-compose`).

### Paso 2. Crear el repositorio en Gitea

1. En Gitea, pulsa **+** → **Nuevo repositorio**.
2. Nombre: `laboratorio-cicd`. Marca **Inicializar repositorio** y comprueba que la rama por defecto es `main`.
3. Crea el repositorio. Puedes dejarlo público o privado; si es privado, necesitarás el paso 4.

### Paso 3. Añadir el Jenkinsfile

Clona el repositorio en tu ordenador, crea el fichero en la raíz y súbelo:

```bash
git clone http://localhost:3000/<usuario>/laboratorio-cicd.git
cd laboratorio-cicd
# crea aquí el fichero Jenkinsfile (sección 3.3)
git add Jenkinsfile
git commit -m "Añade Jenkinsfile inicial"
git push origin main
```

Comprueba en la web de Gitea que el fichero aparece en la raíz del repositorio.

### Paso 4. Crear la credencial (solo si el repositorio es privado)

1. En Gitea: **Configuración de usuario → Aplicaciones → Generar nuevo token**, con permiso de solo lectura sobre repositorios. Copia el token, porque no se vuelve a mostrar.
2. En Jenkins: **Manage Jenkins → Credentials → System → Global credentials → Add Credentials**.
3. Tipo **Username with password**: tu usuario de Gitea y, como contraseña, el token. ID: `gitea-token`.

### Paso 5. Reconfigurar el Job

1. Abre el Job del laboratorio y pulsa **Configure**.
2. En la sección **Pipeline**, cambia **Definition** a **Pipeline script from SCM**.
3. **SCM:** Git. **Repository URL:** `http://gitea:3000/<usuario>/laboratorio-cicd.git` (nombre del servicio de Gitea en el `docker-compose`, no `localhost`).
4. **Credentials:** `gitea-token` si el repositorio es privado; en caso contrario, *none*.
5. **Branch Specifier:** `*/main`. **Script Path:** `Jenkinsfile`.
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

- **URL de destino:** la de Jenkins. Depende del plugin, por ejemplo `/generic-webhook-trigger/invoke` (Generic Webhook Trigger), `/gitea-webhook/post` (plugin Gitea) o `/github-webhook/` (plugin GitHub).
- **Evento:** en esta sesión, *push*. También existen pull request, creación de etiquetas, etc.
- **Content type:** normalmente `application/json`.
- **Payload:** cuerpo JSON con los datos del evento.
- **Secret:** cadena compartida con la que el servidor firma el mensaje (HMAC) para que el receptor compruebe su origen.
- **Respuesta y reintentos:** Jenkins responde con un código HTTP (200 = recibido, 403 = permisos o CSRF, 404 = URL incorrecta). El servidor Git conserva el historial de entregas, muy útil para depurar.

Payload simplificado de un evento *push*:

```json
{
  "ref": "refs/heads/main",
  "after": "3f2a9c1...",
  "repository": { "full_name": "alumno/laboratorio-cicd" },
  "pusher": { "login": "alumno" },
  "commits": [ { "message": "Añade etapa de test" } ]
}
```

> **Idea importante:** el webhook no transporta el código, solo **avisa**. Después, Jenkins descarga del repositorio lo que necesite.

### 5.3 Red y seguridad

- **Quién llama a quién:** Gitea llama a Jenkins (webhook) y Jenkins llama a Gitea (descarga del código). Ambos sentidos deben funcionar. Con los dos servicios en el mismo `docker-compose` se resuelven por nombre de servicio y no hay que exponer nada.
- **Gitea bloquea por defecto los webhooks hacia IPs privadas.** Hay que permitirlo con `ALLOWED_HOST_LIST` en la sección `[webhook]` de `app.ini`.
- **Exponer Jenkins a internet** (por ejemplo, con un túnel para usar GitHub) amplía la superficie de ataque. Si se hace, hay que usar secret, autenticación y mínimos privilegios.
- **Credenciales:** nunca dentro del Jenkinsfile ni del repositorio. Se guardan en el almacén de credenciales de Jenkins y se referencian por su ID.
- **Mínimo privilegio:** el token que usa Jenkins solo necesita lectura sobre el repositorio.

---

## 6. Práctica 2: webhook y disparo automático

**Objetivo:** comprobar que un `push` al repositorio dispara el build sin pulsar *Build Now*.

### Paso 1. Permitir webhooks hacia la red interna en Gitea

Gitea rechaza por defecto los webhooks dirigidos a direcciones privadas, y el nombre `jenkins` se resuelve a una IP privada de la red de Docker. Edita el `app.ini` de Gitea (en la imagen oficial, `/data/gitea/conf/app.ini`) y añade:

```ini
[webhook]
ALLOWED_HOST_LIST = private
```

Otra opción es definir la variable de entorno `GITEA__webhook__ALLOWED_HOST_LIST=private` en el `docker-compose`. En ambos casos, reinicia Gitea:

```bash
docker compose restart gitea
```

### Paso 2. Instalar el plugin en Jenkins

1. En Jenkins: **Manage Jenkins → Plugins → Available plugins**.
2. Busca **Generic Webhook Trigger** e instálalo. Reinicia Jenkins si lo pide.

### Paso 3. Activar el trigger en el Job

1. Abre el Job y pulsa **Configure**.
2. En **Build Triggers**, marca **Generic Webhook Trigger**.
3. En el campo **Token**, escribe `laboratorio` (o el que prefieras, pero debe coincidir con la URL del paso 4).
4. Guarda con **Save**.

### Paso 4. Crear el webhook en Gitea

1. En el repositorio: **Configuración → Webhooks → Añadir webhook → Gitea**.
2. **URL de destino:** `http://jenkins:8080/generic-webhook-trigger/invoke?token=laboratorio` (usa el nombre del servicio de Jenkins en tu `docker-compose`).
3. **Método:** POST. **Content type:** `application/json`.
4. **Eventos que lo activan:** solo *Push events*. Filtro de rama: `main`.
5. Marca **Activo** y guarda.
6. Pulsa **Probar entrega** (*Test Delivery*) y abre la entrega: debe mostrar una respuesta con código 200.

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
git add Jenkinsfile
git commit -m "Añade etapa de test"
git push origin main
```

### Paso 6. Comprobar el resultado sin tocar Jenkins

1. Sin pulsar *Build Now*, observa el Job: debe aparecer un build nuevo unos segundos después del push.
2. Abre el build y comprueba en **Console Output** que existe la etapa *Test*, lo que confirma que Jenkins ha leído el Jenkinsfile modificado.
3. Anota la causa del disparo que muestra el build (*Generic Webhook Trigger*) y el hash del commit.
4. Haz una segunda modificación pequeña y repite el ciclo para comprobar que no ha sido casualidad.

### Alternativa A. Plugin de Gitea

Instala **Gitea** en Jenkins y usa como URL de destino `http://jenkins:8080/gitea-webhook/post`. Este plugin está pensado para *Multibranch Pipeline* y organizaciones, así que con un Job de Pipeline simple hay que verificar antes que el trigger funciona en la versión instalada.

### Alternativa B (plan B). Poll SCM

Si la red o los permisos impiden el webhook, se puede demostrar el flujo desde SCM con polling. En el Job: **Build Triggers → Poll SCM**, con la expresión `H/2 * * * *`. No demuestra el webhook, pero sí que Jenkins reacciona a los cambios del repositorio.

---

## 7. Errores frecuentes y cómo depurarlos

| Síntoma | Causa probable | Solución |
|---|---|---|
| El build falla al descargar el repositorio | URL con `localhost` desde el contenedor de Jenkins | Usar el nombre del servicio (`http://gitea:3000/...`) |
| «Couldn't find any revision to build» | Rama `master` frente a `main` en el Branch Specifier | Ajustar a `*/main` (o la rama real) |
| «Unable to find Jenkinsfile» | Fichero mal escrito, con otra extensión o fuera de la raíz | Revisar nombre, mayúsculas y **Script Path** |
| Error de autenticación al clonar | Repo privado sin credencial o token sin permisos | Crear la credencial y comprobar el permiso de lectura |
| La entrega del webhook falla con «host not allowed» | Gitea bloquea IPs privadas | Configurar `ALLOWED_HOST_LIST` y reiniciar Gitea |
| La entrega devuelve 404 | URL o nombre de servicio incorrectos | Revisar la ruta del plugin y el nombre del servicio |
| La entrega devuelve 403 | Protección CSRF o permisos anónimos | Usar el endpoint del plugin con su token |
| La entrega devuelve 200 pero no hay build | Trigger sin marcar o token distinto | Revisar **Build Triggers** y que el token coincida |
| Content type incorrecto | El webhook no usa JSON | Configurar `application/json` |

Herramientas de depuración: **Recent Deliveries** en el webhook de Gitea (petición y respuesta completas), **Console Output** del build y el log del contenedor (`docker compose logs jenkins`).

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
