[← Sesión 3](sesion3.md) · [Índice de la UT02](./) · [Sesión 5 →](sesion5.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 4 — Validación automática de parámetros

**Criterio RA2.a: el núcleo de la unidad**

| Dato | Detalle |
|---|---|
| **Criterio** | RA2.a: el pipeline comprueba las condiciones necesarias antes de iniciar el despliegue |
| **Herramienta** | Jenkins (pipeline declarativo). Los despliegues se simulan con `echo`; no hace falta infraestructura real |
| **Entregable** | Captura del pipeline detenido por falta de un parámetro y captura de la ejecución correcta |

---

# Parte 1. Teoría

## 1. Contexto: dónde encaja la validación en el despliegue continuo

Un pipeline de despliegue continuo automatiza el camino desde el código hasta el entorno. Cuanto más automático es, **menos personas revisan cada paso**, así que las comprobaciones que antes hacía una persona (¿estoy desplegando en el entorno correcto?) tienen que pasar a ser código.

Un pipeline maduro suele tener tres capas de control:

1. **Validación de entrada** (esta sesión): ¿tengo los datos necesarios y son correctos?
2. **Comprobaciones previas del entorno** (*pre-flight checks*): ¿responde el registry, es accesible el clúster, existe la imagen?
3. **Verificación posterior** (*post-deploy*): ¿arrancó el servicio y responde? Si no, *rollback*.

La sesión 4 trabaja la primera capa, la más barata y la que más problemas evita.

## 2. Principio de diseño: fail fast y shift left

- **Fail fast:** un sistema debe fallar lo antes posible y de forma ruidosa. Un error detectado en el segundo 2 se corrige en un minuto; el mismo error detectado en el minuto 15 puede haber dejado recursos a medias.
- **Shift left:** mover las comprobaciones hacia la izquierda de la línea temporal del pipeline, es decir, hacia el principio. Cuanto antes se detecta un defecto, menos cuesta arreglarlo.

> **Analogía para clase:** la lista de comprobación previa de un piloto. El combustible no se revisa con el avión ya en pista de despegue, se revisa antes de arrancar motores.

### Coste de un fallo a medias

| Momento del fallo | Estado del entorno | Coste de recuperación |
|---|---|---|
| Etapa 1 (validación) | Intacto | Corregir el parámetro y relanzar |
| Tras construir y subir la imagen | Registry con una imagen huérfana | Limpieza manual o política de retención |
| Tras parar el servicio antiguo | **Servicio caído** | Incidente, intervención urgente |
| Tras migrar la base de datos | Datos en versión nueva, código en la antigua | Rollback complejo, posible pérdida de datos |

| Fallo tardío (mal) | Fallo temprano (bien) |
|---|---|
| Se construye la imagen, se sube al registry y en el despliegue falta `TARGET_ENV` | El pipeline se detiene en la primera etapa con un mensaje claro |
| Se para el servicio antiguo y no hay versión que arrancar | No se ha modificado nada en el entorno |
| El error aparece como un fallo críptico de `kubectl` o `docker` | El error dice literalmente qué parámetro falta |

Además de proteger el entorno, la validación temprana ahorra tiempo de ejecución, gasta menos recursos del agente y hace que el diagnóstico sea inmediato.

## 3. ¿Qué es un parámetro requerido?

Cualquier dato de entrada sin el cual el despliegue no tiene sentido:

- **Identificación del destino:** `TARGET_ENV` (dev, staging, prod), clúster, namespace.
- **Identificación de lo que se despliega:** `IMAGE_TAG` o versión, `REGISTRY`, nombre de la aplicación.
- **Acceso:** credenciales, tokens, claves SSH (su *existencia*, nunca su valor en el log).
- **Dimensionado:** número de réplicas, recursos.

## 4. Tipos de validación

No todas las validaciones son iguales, y cada una se implementa de forma distinta:

| Tipo | Pregunta que responde | Ejemplo |
|---|---|---|
| **Presencia** | ¿Existe y no está vacío? | `IMAGE_TAG` informado |
| **Valor permitido** (lista blanca) | ¿Es uno de los valores aceptados? | `TARGET_ENV` ∈ {dev, staging, prod} |
| **Formato** | ¿Cumple un patrón? | `v1.0.3` con expresión regular |
| **Rango** | ¿Está dentro de límites razonables? | Réplicas entre 1 y 10 |
| **Coherencia entre parámetros** | ¿Son compatibles entre sí? | En `prod` no se permite `latest`; en `prod` se exige aprobación |
| **Existencia externa** | ¿Existe realmente el recurso al que apunta? | La credencial o la imagen existen |

Esta sesión cubre los cuatro primeros tipos y apunta a los dos últimos como ampliación.

> **Lista blanca frente a lista negra:** es preferible definir qué **se permite** (dev, staging, prod) que qué se prohíbe (no latest, no test...). La lista negra siempre deja algún caso sin prever; la lista blanca no.

## 5. Origen de los parámetros en Jenkins

1. **Bloque `parameters {}`:** el usuario los introduce al lanzar el build. Jenkins los expone como `params.NOMBRE` y **también como variable de entorno** `env.NOMBRE`.
2. **Bloque `environment {}`:** valores fijos definidos en el Jenkinsfile.
3. **Variables globales o del nodo:** configuradas en *Manage Jenkins → System*.
4. **Credenciales:** almacenadas en el *Credentials Store* y referenciadas por ID.

Por eso el código de la práctica usa `env[it]`: funciona para cualquiera de los tres primeros orígenes.

### 5.1 Tipos de parámetro declarativo

| Tipo | Uso | Notas |
|---|---|---|
| `string` | Texto libre (versión, nombre) | Requiere validar formato |
| `choice` | Lista cerrada de opciones | Primera línea de validación: desde la interfaz no se puede escribir otra cosa |
| `booleanParam` | Verdadero/falso | Ver la trampa de más abajo |
| `password` | Secreto introducido a mano | Enmascarado en la interfaz |
| `text` | Texto multilínea | Menos habitual en despliegues |

Con `choice`, parte de la validación de valor la hace ya la interfaz:

```groovy
choice(name: 'TARGET_ENV', choices: ['dev', 'staging', 'prod'], description: 'Entorno de destino')
```

> **Pero no basta:** un build lanzado por API, por un *trigger* o por otro job puede saltarse la interfaz. La validación en código sigue siendo necesaria (**defensa en profundidad**).

### 5.2 `params` frente a `env`

- `params.NOMBRE` conserva el **tipo** original (un `booleanParam` es un booleano real).
- `env.NOMBRE` convierte **todo a cadena de texto**.

Trampa clásica con booleanos:

```groovy
booleanParam(name: 'DRY_RUN', defaultValue: false)

// En env llega como el TEXTO 'false'
if (env.DRY_RUN) { ... }     // ¡SIEMPRE verdadero! 'false' es una cadena no vacía
if (params.DRY_RUN) { ... }  // Correcto: es un booleano real
```

Para validar la presencia de textos, `env[it]` funciona bien; para booleanos hay que usar `params`.

## 6. Cómo funciona el código de la práctica

```groovy
def requeridos = ['TARGET_ENV', 'IMAGE_TAG', 'REGISTRY']
def faltantes = requeridos.findAll { !env[it] }
if (faltantes) {
    error("Faltan parámetros requeridos: ${faltantes}")
}
```

- `requeridos` es una lista con los nombres de las variables obligatorias.
- `findAll { ... }` recorre la lista y **devuelve solo los elementos que cumplen la condición**: aquí, los nombres cuya variable no existe o está vacía.
- `env[it]` accede dinámicamente a la variable cuyo nombre está en `it`. Si no existe, devuelve `null`.
- `!env[it]` es cierto para `null` y para la cadena vacía. Es la **verdad de Groovy** (*Groovy truth*).
- `if (faltantes)` es cierto si la lista no está vacía.
- `error(...)` es el paso de Jenkins que **aborta el build**: lo marca como `FAILURE`, muestra el mensaje y las etapas siguientes no se ejecutan.

### 6.1 Verdad de Groovy (Groovy truth)

Groovy evalúa como **falso**: `null`, `''` (cadena vacía), `0` y las colecciones vacías. Todo lo demás es verdadero, incluida la cadena `'false'`.

Consecuencia práctica: `!env[it]` detecta a la vez «no definida» y «definida pero vacía», que es justo lo que se busca. Un parámetro de tipo `string` sin rellenar llega como `''`, no como `null`.

### 6.2 Valores con solo espacios

Una cadena formada solo por espacios **es verdadera** en Groovy (no está vacía), así que un usuario que teclea espacios engaña a la validación básica. Solución: normalizar con `trim()`.

```groovy
def faltantes = requeridos.findAll { !(env[it]?.trim()) }
```

`?.` es el operador de navegación segura: si `env[it]` es `null`, devuelve `null` en lugar de lanzar una excepción.

## 7. Cómo se detiene realmente el pipeline

`error('mensaje')` lanza internamente una excepción (`AbortException`). Jenkins la captura, marca el build como `FAILURE` y **salta las etapas restantes**, salvo las del bloque `post`.

| Mecanismo | Efecto | Cuándo usarlo |
|---|---|---|
| `error('msg')` | Build en **FAILURE**, se detiene | Falta algo imprescindible (nuestro caso) |
| `unstable('msg')` | Build en **UNSTABLE**, continúa | Algo va mal pero no es bloqueante |
| `currentBuild.result = 'ABORTED'` + `return` | Marca el build como abortado | Cancelaciones deliberadas |
| `sh 'exit 1'` | Falla el comando | Fallo de un comando externo, no de una validación |

### El bloque post

`post` se ejecuta aunque falle la validación: sirve para notificar (correo, Slack) o limpiar.

```groovy
post {
    failure { echo "El despliegue no se ha realizado. Revisar el mensaje de validación." }
    always  { echo "Fin de la ejecución" }
}
```

> **Error típico:** un `try/catch` dentro del `script` que capture la excepción **anula la parada** si no se relanza. El pipeline sigue adelante sin que nadie se dé cuenta.

### Alternativa declarativa: when

No todo control es un fallo. `when` permite **omitir** una etapa según una condición:

```groovy
stage('Aprobación manual') {
    when { expression { env.TARGET_ENV == 'prod' } }
    steps { input message: '¿Confirmar despliegue en producción?' }
}
```

Diferencia conceptual: `error` significa «esto es inválido, detente»; `when` significa «esta etapa no aplica en este caso».

## 8. Dimensión de seguridad

### 8.1 Los parámetros son entrada de usuario

Un parámetro que se interpola en un comando de shell abre la puerta a la **inyección de comandos**:

```groovy
// PELIGROSO: si TARGET_ENV = "dev; rm -rf /"
sh "kubectl config use-context ${params.TARGET_ENV}"
```

La validación por **lista blanca** de la sesión es también una medida de seguridad: si `TARGET_ENV` solo puede valer `dev`, `staging` o `prod`, esa inyección es imposible. La validación de formato con expresión regular cumple la misma función para `IMAGE_TAG`.

### 8.2 Secretos

- Se valida la **existencia** de una credencial; nunca se imprime su valor.
- `withCredentials` enmascara el valor en el log (`****`), pero el enmascarado no es infalible: si el secreto se transforma (base64, troceado), puede aparecer en claro. Regla: no manipular ni imprimir secretos.
- No pasar secretos como parámetros de texto normal: quedan visibles en el historial del build.

### 8.3 Mínimo privilegio

Las credenciales de `prod` no deberían estar disponibles en un build que apunta a `dev`. La coherencia entre parámetros (sección 4) también protege esto.

## 9. Reproducibilidad: por qué importa el formato de la versión

- **`latest` es un puntero móvil:** hoy apunta a una imagen y mañana a otra. Dos despliegues con el mismo parámetro pueden producir resultados distintos.
- Una **etiqueta inmutable** (`v1.0.3`, o el hash del commit) permite saber exactamente qué hay desplegado, reproducirlo y hacer *rollback* a una versión concreta.
- Es el fundamento de la **infraestructura como código**: el mismo input debe dar el mismo output.

## 10. Buenas prácticas de diseño

1. **Validar primero, en una etapa propia y con nombre claro.** Así, en la vista de etapas, se ve de inmediato dónde falló.
2. **Acumular errores y reportarlos juntos:** menos idas y venidas para el usuario.
3. **Mensajes accionables:** qué falta, qué se esperaba y un ejemplo. Mal: `Error de validación`. Bien: `IMAGE_TAG='latest' no cumple el formato vX.Y.Z (ejemplo: v1.0.3)`.
4. **Una única fuente de verdad** para la lista de requeridos, idealmente en una *Shared Library* reutilizable por todos los pipelines.
5. **Validar antes de cualquier efecto secundario**, incluido el `checkout` si depende de un parámetro (por ejemplo, la rama).
6. **Documentar los parámetros** con `description`: es la primera documentación que ve el usuario.
7. **Probar la propia validación:** una validación que nunca se ha visto fallar no está probada. Por eso la práctica pide provocar el fallo.
8. **No duplicar validaciones contradictorias** entre el pipeline y los scripts que este invoque.

## 11. Limitación de la primera ejecución

Cuando los parámetros se declaran en el `Jenkinsfile` del repositorio, Jenkins los registra **después** de leer el fichero. La primera ejecución los desconoce y, por tanto, `env[it]` devuelve `null` aunque el código sea correcto.

- Lanzar el job una vez para que se registren (lo más habitual).
- En modo *scripted*, `properties([parameters([...])])` tiene el mismo comportamiento: los parámetros aparecen tras la primera ejecución.
- En pipelines de producción, tratar esa primera ejecución como una «de registro» y no como un despliegue real.

## 12. Relación con el criterio RA2.a

Lo que se evalúa es la capacidad de definir flujos que garanticen que el despliegue solo se inicia con las condiciones correctas. El alumnado debe demostrar que:

- Sabe **qué** validar (presencia, valor, formato).
- Sabe **dónde** situarlo (antes de cualquier efecto secundario).
- Sabe **cómo** hacer que el pipeline se detenga con un mensaje claro.
- Comprende **por qué** (evitar estados intermedios, reproducibilidad, seguridad).

## 13. Ideas clave para la pizarra

1. Un despliegue tiene efectos secundarios; un fallo a medias es caro.
2. Validar todo lo validable **antes** de tocar nada (*fail fast / shift left*).
3. Presencia, valor, formato y coherencia son validaciones distintas.
4. En Groovy, `null` y `''` son falsos, pero una cadena de solo espacios y `'false'` no lo son.
5. La lista blanca protege de errores y de inyección de comandos.
6. `error` detiene el build; `post` permite notificar; nunca capturar el error sin relanzarlo.

---

# Parte 2. Práctica

## Bloque 0. Preparación

- Jenkins operativo y accesible.
- Crear un job de tipo **Pipeline** (o *Multibranch* si se usa repositorio).
- Repositorio con un `Jenkinsfile` en la raíz, o bien pegar el script directamente en la configuración del job.

## Bloque 1. Pipeline base con validación

Crear este Jenkinsfile. Todos los despliegues son simulados con `echo`, así que no se necesita infraestructura real:

```groovy
pipeline {
    agent any

    environment {
        TARGET_ENV = 'staging'
        IMAGE_TAG  = 'v1.0.3'
        REGISTRY   = 'registry.miempresa.local'
    }

    stages {
        stage('Validar parámetros requeridos') {
            steps {
                script {
                    def requeridos = ['TARGET_ENV', 'IMAGE_TAG', 'REGISTRY']
                    def faltantes = requeridos.findAll { !env[it] }
                    if (faltantes) {
                        error("Faltan parámetros requeridos: ${faltantes}")
                    }
                    echo "Todos los parámetros requeridos están presentes."
                }
            }
        }

        stage('Construir imagen') {
            steps {
                echo "Construyendo ${env.REGISTRY}/miapp:${env.IMAGE_TAG}"
            }
        }

        stage('Desplegar') {
            steps {
                echo "Desplegando ${env.IMAGE_TAG} en ${env.TARGET_ENV}"
            }
        }
    }
}
```

**Tareas:**

1. Ejecutar y comprobar que las tres etapas pasan en verde.
2. **Captura 1 (entregable):** ejecución correcta, con la vista de etapas y el log de la etapa de validación.

## Bloque 2. Provocar el fallo

1. Comentar o borrar la línea `IMAGE_TAG = 'v1.0.3'` del bloque `environment`.
2. Guardar y ejecutar.
3. Comprobar tres cosas: la etapa de validación aparece en **rojo**; el log muestra `Faltan parámetros requeridos: [IMAGE_TAG]`; las etapas *Construir imagen* y *Desplegar* **no se ejecutan** (aparecen en gris u omitidas).
4. **Captura 2 (entregable):** pipeline detenido, mostrando el mensaje y las etapas posteriores sin ejecutar.

**Variantes para el alumnado más rápido:**

- Quitar dos variables a la vez y comprobar que el mensaje las lista ambas.
- Dejar una variable con cadena vacía (`TARGET_ENV = ''`) y comprobar que también se detecta.

## Bloque 3. Parámetros reales de usuario

Sustituir `environment` por un bloque `parameters`, que es como se lanza un despliegue en la vida real:

```groovy
pipeline {
    agent any

    parameters {
        string(name: 'TARGET_ENV', defaultValue: '', description: 'Entorno: dev, staging o prod')
        string(name: 'IMAGE_TAG',  defaultValue: '', description: 'Versión de la imagen, p. ej. v1.0.3')
        string(name: 'REGISTRY',   defaultValue: 'registry.miempresa.local', description: 'Registro de imágenes')
    }

    stages {
        // misma etapa de validación
    }
}
```

**Tareas:**

1. Ejecutar una primera vez para que Jenkins registre los parámetros (recordar la limitación de la sección 11 de la teoría).
2. Usar **Build with Parameters** y dejar `TARGET_ENV` vacío: debe detenerse.
3. Rellenar todos: debe pasar.

> **Pregunta para la clase:** ¿por qué `env[it]` funciona con parámetros? Porque Jenkins los inyecta también como variables de entorno.

## Bloque 4. Validar el valor, no solo la presencia

Ampliar la etapa para acumular varios tipos de error y reportarlos juntos:

```groovy
stage('Validar parámetros requeridos') {
    steps {
        script {
            def errores = []

            // 1. Presencia
            def requeridos = ['TARGET_ENV', 'IMAGE_TAG', 'REGISTRY']
            def faltantes = requeridos.findAll { !env[it] }
            if (faltantes) {
                errores << "Faltan parámetros requeridos: ${faltantes}"
            }

            // 2. Valor permitido para el entorno
            def entornosValidos = ['dev', 'staging', 'prod']
            if (env.TARGET_ENV && !(env.TARGET_ENV in entornosValidos)) {
                errores << "TARGET_ENV='${env.TARGET_ENV}' no es válido. Permitidos: ${entornosValidos}"
            }

            // 3. Formato de la versión (vX.Y.Z) y prohibición de 'latest'
            if (env.IMAGE_TAG && !(env.IMAGE_TAG ==~ /^v\d+\.\d+\.\d+$/)) {
                errores << "IMAGE_TAG='${env.IMAGE_TAG}' no cumple el formato vX.Y.Z"
            }

            if (errores) {
                error("Validación fallida:\n - " + errores.join("\n - "))
            }
            echo "Validación correcta: ${env.TARGET_ENV} / ${env.IMAGE_TAG}"
        }
    }
}
```

**Pruebas a realizar** (rellenar esta tabla en el cuaderno de prácticas):

| TARGET_ENV | IMAGE_TAG | REGISTRY | Resultado esperado | Resultado obtenido |
|---|---|---|---|---|
| staging | v1.0.3 | registry.x | ✅ Pasa | |
| *(vacío)* | v1.0.3 | registry.x | ❌ Falta TARGET_ENV | |
| produccion | v1.0.3 | registry.x | ❌ Entorno no válido | |
| staging | latest | registry.x | ❌ Formato de versión | |
| *(vacío)* | *(vacío)* | registry.x | ❌ Dos faltantes en un solo mensaje | |

> **Discusión guiada:** ¿por qué se prohíbe `latest` en producción? Porque no es reproducible: no se sabe qué versión hay desplegada y el *rollback* no se puede garantizar.

## Bloque 5. Credenciales (ampliación opcional)

Crear en *Manage Jenkins → Credentials* una credencial de tipo *Secret text* con ID `registry-token`. Comprobar su uso sin exponer el valor:

```groovy
stage('Comprobar credenciales') {
    steps {
        withCredentials([string(credentialsId: 'registry-token', variable: 'REGISTRY_TOKEN')]) {
            echo "Credencial registry-token disponible (no se muestra su valor)."
        }
    }
}
```

Si el ID no existe, Jenkins falla con un error de credencial no encontrada, **antes de que se ejecute ningún paso de despliegue**. Comprobar también que, si se intenta hacer `echo "${REGISTRY_TOKEN}"`, Jenkins lo enmascara como `****`.

## Bloque 6. Documentación y entregable

**Entregable de la sesión:**

1. Captura del pipeline **detenido** en la validación por parámetro ausente (con el mensaje visible y las etapas posteriores sin ejecutar).
2. Captura de la ejecución **correcta** con todos los parámetros.
3. *(Opcional, para nota superior)* Tabla de pruebas del Bloque 4 y Jenkinsfile final.

---

# Parte 3. Cierre

## Preguntas para la puesta en común

1. ¿Qué habría pasado si la validación estuviera después de la etapa de despliegue?
2. ¿Qué diferencia hay entre `error` y `unstable`, y cuál usarías aquí?
3. ¿Por qué se acumulan los errores en una lista en lugar de fallar en el primero?
4. ¿Qué parámetros validarías además de estos para un despliegue en producción? (Réplicas, credenciales, aprobación manual...)

## Errores frecuentes del alumnado

- Poner la validación *después* de construir o desplegar.
- Olvidar que una cadena vacía cuenta como parámetro ausente.
- Usar `params[it]` y luego definir las variables en `environment` (no coinciden).
- No ejecutar la primera vez para registrar los parámetros y creer que el pipeline está roto.
- Imprimir el valor de una credencial en el log.
- Capturar el error con `try/catch` y no relanzarlo.

## Indicadores de logro para RA2.a (orientativos)

| Nivel | Criterio |
|---|---|
| **Básico** | El pipeline se detiene si falta un parámetro y continúa si están todos |
| **Notable** | Mensaje claro con todos los faltantes y validación antes de cualquier etapa de despliegue |
| **Sobresaliente** | Valida además valores y formato, gestiona credenciales sin exponerlas y documenta las pruebas |

---

# Anexo (uso docente). Jenkinsfile final de referencia

Solución de referencia que reúne los bloques 3 y 4, con `trim()` para detectar valores con solo espacios y un bloque `post` de notificación. Está pensada para que el profesorado la compare con las entregas; no conviene repartirla antes de la sesión.

```groovy
pipeline {
    agent any

    parameters {
        string(name: 'TARGET_ENV', defaultValue: '', description: 'Entorno: dev, staging o prod')
        string(name: 'IMAGE_TAG',  defaultValue: '', description: 'Versión de la imagen, p. ej. v1.0.3')
        string(name: 'REGISTRY',   defaultValue: 'registry.miempresa.local', description: 'Registro de imágenes')
    }

    stages {
        stage('Validar parámetros requeridos') {
            steps {
                script {
                    def errores = []

                    // 1. Presencia (trim() detecta valores con solo espacios)
                    def requeridos = ['TARGET_ENV', 'IMAGE_TAG', 'REGISTRY']
                    def faltantes = requeridos.findAll { !(env[it]?.trim()) }
                    if (faltantes) {
                        errores << "Faltan parámetros requeridos: ${faltantes}"
                    }

                    // 2. Valor permitido (lista blanca)
                    def entornosValidos = ['dev', 'staging', 'prod']
                    if (env.TARGET_ENV?.trim() && !(env.TARGET_ENV in entornosValidos)) {
                        errores << "TARGET_ENV='${env.TARGET_ENV}' no es válido. Permitidos: ${entornosValidos}"
                    }

                    // 3. Formato de versión vX.Y.Z (esto también excluye 'latest')
                    if (env.IMAGE_TAG?.trim() && !(env.IMAGE_TAG ==~ /^v\d+\.\d+\.\d+$/)) {
                        errores << "IMAGE_TAG='${env.IMAGE_TAG}' no cumple el formato vX.Y.Z (ejemplo: v1.0.3)"
                    }

                    if (errores) {
                        error("Validación fallida:\n - " + errores.join("\n - "))
                    }
                    echo "Validación correcta: ${env.TARGET_ENV} / ${env.IMAGE_TAG}"
                }
            }
        }

        stage('Construir imagen') {
            steps {
                echo "Construyendo ${env.REGISTRY}/miapp:${env.IMAGE_TAG}"
            }
        }

        stage('Desplegar') {
            steps {
                echo "Desplegando ${env.IMAGE_TAG} en ${env.TARGET_ENV}"
            }
        }
    }

    post {
        failure { echo "El despliegue no se ha realizado. Revisar el mensaje de validación." }
        always  { echo "Fin de la ejecución" }
    }
}
```

---

[← Sesión 3](sesion3.md) · [Índice de la UT02](./) · [Sesión 5 →](sesion5.md)
