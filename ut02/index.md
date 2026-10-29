# UT02 · Preparación del entorno: parámetros, configuración y control de errores

Tener el paquete de software publicado en un registro no es suficiente para desplegarlo. La misma imagen tiene que funcionar en entornos distintos (pruebas y producción), y cada uno necesita sus propios valores: cuántas réplicas, qué nivel de log, qué versión, qué credenciales. Si esos valores se escriben a mano en cada despliegue, tarde o temprano alguien se equivoca, se olvida de uno o despliega la configuración de un entorno en otro.

En esta unidad aprenderás a preparar el entorno de forma automática y fiable. El pipeline comprobará antes de empezar que no falta ningún parámetro, obtendrá los valores correspondientes a cada entorno, verificará que han llegado a la aplicación desplegada y, si algo falla, se detendrá, dirá qué ha pasado y dejará el clúster limpio, sin objetos a medio crear. Al terminar, tendrás un pipeline de Jenkins que prepara el entorno de principio a fin, listo para que la UT03 despliegue sobre él la nueva versión.

## Resultado de aprendizaje

**RA2** · Prepara el entorno, validando, creando o modificando las variables de entorno requeridas en el despliegue del paquete creado para cada aplicativo o servicio.

La unidad tiene 12 sesiones y cada bloque de sesiones trabaja uno de sus criterios de evaluación:

| Criterio | En resumen                                                                                                                                    | Sesiones |
|----------|-----------------------------------------------------------------------------------------------------------------------------------------------|----------|
| a        | Configurar el pipeline para validar automáticamente que existen los parámetros necesarios para desplegar en cada entorno                      | 1 a 4    |
| b        | Recopilar los valores de los parámetros de cada entorno, obteniéndolos durante la creación de la infraestructura                              | 5 a 7    |
| c        | Verificar que los parámetros recopilados se han incluido en el software desplegado, ejecutando el despliegue y comprobando que no hay errores | 8 y 9    |
| d        | Recopilar los errores detectados, detener el pipeline y destruir los objetos intermedios creados hasta ese instante                           | 10 y 11  |
| a–d      | Práctica integradora: los cuatro criterios en un único pipeline                                                                               | 12       |

Las cuatro letras forman una cadena que se lee de izquierda a derecha, y cada eslabón depende del anterior:

`a · Validar parámetros → b · Configurar cada entorno (Ansible) → c · Verificar el despliegue → d · Si falla: detener y limpiar`

## El laboratorio y la aplicación

Seguimos con **el mismo laboratorio y la misma aplicación** de la UT01: la API de Node.js con Express y su imagen ya publicada en el registro. Todo se hace en tu propio ordenador y los ficheros de esta unidad están en el proyecto `modulo5168-lab` que ya tienes en Gitea (consulta la [guía de instalación del laboratorio](../laboratorio/), en especial el apartado 11bis, si algo no arranca):

| Ruta del proyecto | Qué contiene                                                                  |
|-------------------|-------------------------------------------------------------------------------|
| `lab/Jenkinsfile` | El pipeline de referencia, que iremos construyendo por etapas                 |
| `lab/ansible/`    | Inventario, playbook, plantilla del ConfigMap y las variables de cada entorno |
| `lab/k8s/`        | Los manifiestos de Kubernetes y el script `render.sh` que los completa        |

Las herramientas nuevas, o que ahora veremos por dentro, son estas:

| Herramienta          | Para qué la usamos                                                               | Desde    |
|----------------------|----------------------------------------------------------------------------------|----------|
| Jenkins              | Ejecutar el pipeline: lo estudiamos por dentro (controller, agente, Jenkinsfile) | Sesión 1 |
| Gitea                | Guardar el `Jenkinsfile` en el repositorio y avisar a Jenkins con un webhook     | Sesión 3 |
| Ansible              | Generar la configuración de cada entorno a partir de una única plantilla         | Sesión 5 |
| Minikube y `kubectl` | El clúster de Kubernetes donde se aplica la configuración y se despliega         | Sesión 6 |
| Job multibranch      | Elegir el entorno según la rama (`main` o cualquier otra)                        | Sesión 7 |

Trabajaremos con **dos entornos**, `staging` (pruebas) y `production` (producción), que comparten el mismo playbook y se diferencian solo en sus variables:

| Parámetro                  | `staging` | `production` |
|----------------------------|-----------|--------------|
| Nivel de log (`LOG_LEVEL`) | `DEBUG`   | `WARN`       |
| Réplicas (`REPLICAS`)      | 1         | 2            |

El entorno se elige por la rama del repositorio: la rama `main` despliega en `production` y cualquier otra en `staging`. Ansible convierte estos valores en un ConfigMap de Kubernetes (`modulo5168-config`), que el Deployment lee como variables de entorno dentro del contenedor.

## Sesiones

### Sesión 1 · Arquitectura de Jenkins y primer pipeline · RA2.a

Ya has usado Jenkins en la UT01; ahora toca entender cómo funciona por dentro. Verás la diferencia entre el controller, que gestiona la interfaz y la cola de trabajos, y los agentes, que ejecutan los pipelines. Aprenderás qué son un job, un build y un executor, y por qué en el módulo usamos siempre la sintaxis declarativa (`pipeline { ... }`) y no la scripted en Groovy. Terminarás escribiendo tu primer pipeline y comprobando que termina en SUCCESS.

📄 [Ir a la sesión 1](sesion1.md)

### Sesión 2 · Estructura del Jenkinsfile declarativo · RA2.a

Un Jenkinsfile siempre tiene la misma forma: agente, variables de entorno, etapas y un bloque final que reacciona al resultado. Conocerla te permitirá leer cualquier pipeline sin perderte. Ampliarás el pipeline de la sesión anterior con el `checkout` del repositorio del laboratorio y varias etapas encadenadas, y verás cómo declarar variables globales en el bloque `environment`.

📄 [Ir a la sesión 2](sesion2.md)

### Sesión 3 · Integración con Git: webhooks · RA2.a

Hasta ahora has lanzado los builds a mano con Build Now. En esta sesión el pipeline pasa a leerse directamente del repositorio (*Pipeline script from SCM*), de modo que el `Jenkinsfile` se versiona igual que el resto del código. Configurarás un webhook en Gitea para que cada `push` avise a Jenkins y dispare el build automáticamente.

📄 [Ir a la sesión 3](sesion3.md)

### Sesión 4 · Validación automática de parámetros · RA2.a

Es el núcleo de la unidad. Antes de desplegar en cualquier entorno, el pipeline debe comprobar que existen todos los parámetros necesarios (entorno de destino, versión de la imagen, registro…). Si falta alguno, tiene que detenerse **antes** de intentar el despliegue, y no fallar a medias cuando ya se ha tocado el clúster. Escribirás la etapa de validación, quitarás una variable a propósito y comprobarás que el pipeline se para con un mensaje claro.

📄 [Ir a la sesión 4](sesion4.md)

### Sesión 5 · Introducción a Ansible · RA2.b

Para no escribir a mano la configuración de cada entorno, la generaremos con Ansible. Aprenderás qué es un playbook, qué es un inventario (en nuestro caso, `localhost`, porque Ansible orquesta `kubectl` contra el clúster y no configura servidores remotos), cómo cambian las variables de un entorno a otro con ficheros `vars` distintos y qué significa que una ejecución sea idempotente. Verás la estructura del laboratorio (`lab/ansible/`) fichero por fichero antes de usarla en la sesión siguiente.

📄 [Ir a la sesión 5](sesion5.md)

### Sesión 6 · Recopilación de parámetros por entorno · RA2.b

Ejecutarás el mismo playbook contra `staging` y contra `production` y compararás los ConfigMaps resultantes. Comprobarás que el número de réplicas y el nivel de log no se escriben en cada despliegue, sino que salen de las variables propias de cada entorno. Este es el significado práctico de «obtener los valores durante la creación de la infraestructura».

📄 [Ir a la sesión 6](sesion6.md)

### Sesión 7 · Múltiples entornos y credenciales · RA2.b

Cada entorno puede necesitar credenciales distintas, por ejemplo un `kubeconfig` diferente si `staging` y `production` fueran clústeres separados. Verás cómo guarda Jenkins varias credenciales y cómo elegir la adecuada según el entorno. Crearás un Job **multibranch** y programarás el pipeline para que una rama de trabajo recopile los parámetros de `staging` y la rama `main` los de `production`.

📄 [Ir a la sesión 7](sesion7.md)

### Sesión 8 · Verificación de parámetros en el despliegue · RA2.c

Recopilar los parámetros no basta: hay que comprobar que han llegado de verdad al software desplegado. Conectarás el ConfigMap generado por Ansible con el Deployment mediante `envFrom`, desplegarás la aplicación y entrarás en el Pod con `kubectl exec` para ver con tus propios ojos que `LOG_LEVEL` y `APP_VERSION` tienen los valores del entorno.

📄 [Ir a la sesión 8](sesion8.md)

### Sesión 9 · Ejecución y comprobación del despliegue · RA2.c

Pasarás de comprobar a mano a comprobar de forma automática. Integrarás en el `Jenkinsfile` la etapa de Ansible y una etapa de verificación que espera a que el despliegue termine (`kubectl rollout status`) y falla si no lo consigue. Al final, el pipeline despliega y confirma por sí mismo que todo ha ido bien, sin que nadie mire el clúster.

📄 [Ir a la sesión 9](sesion9.md)

### Sesión 10 · Manejo de errores: detener el pipeline · RA2.d

Un pipeline profesional no solo falla: explica **qué** ha fallado. Estudiarás cómo capturar un error en una etapa concreta con `try/catch`, cómo detener el pipeline con `error()` y cómo dejar en el log un mensaje útil para quien tenga que arreglarlo. Es una sesión de teoría y demostraciones, sin práctica individual.

📄 [Ir a la sesión 10](sesion10.md)

### Sesión 11 · Destrucción de objetos intermedios · RA2.d

Si el pipeline falla a mitad de camino, puede dejar en el clúster recursos huérfanos: un ConfigMap sin Deployment, un Deployment a medias… Provocarás un fallo real (por ejemplo, una plantilla inválida) y ampliarás el manejo de errores para que se eliminen los objetos creados en esa ejecución. Comprobarás con `kubectl get all` que no queda nada suelto. Verás también un matiz importante: si ya había una versión desplegada, el entorno no se ha tocado y no hay nada que destruir; solo en una primera instalación hay que limpiar.

📄 [Ir a la sesión 11](sesion11.md)

### Sesión 12 · Práctica integradora y cierre · RA2.a–d

No hay contenido nuevo: se trata de recorrer el flujo completo sobre tu propio pipeline. Validarás los parámetros (a), recopilarás la configuración de cada entorno con Ansible (b), verificarás el despliegue sin errores (c) y provocarás un fallo real para comprobar que el pipeline se detiene y limpia lo que había creado (d). Se revisa en el momento contra la rúbrica de esta página.

📄 [Ir a la sesión 12](sesion12.md)

## Cómo se evalúa

Cada sesión práctica termina con un **entregable** (capturas del Console Output, del ConfigMap o del clúster) asociado a su criterio del RA2. Se valora que funcione, pero también que sepas explicar qué hace cada etapa y por qué está ahí. La práctica integradora de la sesión 12 recoge los cuatro criterios y se evalúa con esta rúbrica:

| Criterio                                   | Insuficiente                                 | Suficiente                                    | Notable                                                         |
|--------------------------------------------|----------------------------------------------|-----------------------------------------------|-----------------------------------------------------------------|
| **a) Validación automática de parámetros** | No valida, asume que existen                 | Valida, pero no detiene el pipeline si faltan | Valida y detiene el pipeline con un mensaje claro               |
| **b) Recopilación por entorno**            | Un solo entorno, a mano                      | Varios entornos, configurados manualmente     | Ansible genera la configuración de cada entorno automáticamente |
| **c) Verificación sin errores**            | No comprueba tras desplegar                  | Comprueba visualmente, sin automatizar        | `kubectl rollout status` automatizado en el pipeline            |
| **d) Manejo de errores y limpieza**        | El pipeline deja recursos huérfanos si falla | Detiene el pipeline, pero no limpia           | Detiene el pipeline y destruye los objetos intermedios creados  |

## Antes de empezar

- La UT01 terminada: tienes la aplicación empaquetada y publicada en el registro.
- El laboratorio funcionando: Docker, Gitea y Jenkins arrancados, y Jenkins con la imagen `jenkins-lab` de la guía, que ya incluye `docker`, `kubectl` y `ansible-playbook`.
- Minikube arrancado (`minikube status`). No se inicia solo al reiniciar el equipo: si está parado, arráncalo con `minikube start`.
- El registry del laboratorio en `localhost:5000`. No es el mismo que usaste para publicar las versiones en la UT01 (el de Gitea): el despliegue en Minikube usa este.
- Las credenciales `registry-credentials` y `kubeconfig-aula` creadas en Jenkins.
- Ansible instalado en tu equipo, dentro de un entorno virtual. Comprueba que responde:

    source ~/venv-ansible/bin/activate
    ansible --version

- El proyecto `modulo5168-lab` subido a tu repositorio de Gitea, para poder trabajar con el `Jenkinsfile` y los ficheros de `lab/ansible/` y `lab/k8s/`.
- Al menos 8 GB de RAM libres, porque Jenkins, Gitea y Minikube funcionan a la vez.
