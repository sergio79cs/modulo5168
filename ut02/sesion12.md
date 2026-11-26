{% raw %}
[← Sesión 11](sesion11.md) · [Índice de la UT02](./)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 12 — Práctica integradora y cierre

Criterio RA2.a–d

**Módulo 5168 · Definición de flujos de procesos de despliegue continuo · UT2**

Repaso de los 4 criterios a-d.

Cada alumno/a recorre el flujo completo de la UT2 sobre el `lab/Jenkinsfile` de su propio laboratorio: validación de parámetros (a), recopilación por entorno con Ansible (b), verificación del despliegue sin errores (c) y manejo de errores con limpieza de objetos intermedios provocando un fallo real (d).

Entrega y revisión en el momento contra la rúbrica del [índice de la UT02](./). Cierre de la UT2 y enlace con la UT3 (RA3: despliegue de la nueva versión), que parte de este mismo entorno.

---

## 0. Cómo usar este documento

- **Apartados 1 a 4:** lo que se proyecta y se cuenta (objetivos, preparación, estructura y repaso de los criterios).
- **Apartado 5:** la práctica paso a paso para el alumnado, con el resultado que debe verse en cada punto de control.
- **Apartados 6 a 8:** entrega y revisión, errores frecuentes y cierre.

No hay ningún material que instalar ni copiar: todo lo que se usa está ya en el laboratorio de la UT01 y en el repositorio `modulo5168-lab` de cada alumno/a. La práctica consiste en leer ese pipeline, entender dónde se resuelve cada criterio y provocar fallos para comprobar que se comporta como debe.

---

## 1. Objetivos de la sesión

Al terminar, cada alumno/a habrá recorrido, sobre el pipeline real del laboratorio, los cuatro criterios de la UT2.

| Criterio | Qué demuestra | Dónde está en `lab/Jenkinsfile` | Evidencia que debe quedar |
|---|---|---|---|
| **a)** Validación de parámetros | El pipeline rechaza entradas incorrectas antes de tocar nada | Etapa *Validar parámetros requeridos* | Ejecución rechazada con mensaje claro y ejecución aceptada |
| **b)** Recopilación por entorno con Ansible | La configuración de cada entorno sale de ficheros de variables, no del Jenkinsfile | Etapas *Seleccionar entorno* y *Configurar entorno (Ansible)* | `PLAY RECAP` con `failed=0` y ConfigMap distinto en staging y en production |
| **c)** Verificación del despliegue sin errores | Se comprueba con datos que el despliegue ha funcionado, y la comprobación puede fallar | Etapa *Verificar despliegue sin errores* | Etapa en verde y comprobación manual con `kubectl` |
| **d)** Manejo de errores y limpieza | Ante un fallo real, el pipeline se detiene y no deja restos | Funciones `limpiarSiPrimeraInstalacion`, `revertirOLimpiar` y `conRollback` | Ejecución en rojo, mensaje de limpieza en el log y comparación antes/después del clúster |

Esta sesión no incorpora contenido nuevo. Es una sesión de integración: el alumnado reutiliza lo visto y lo ensambla en un único flujo.

### Lo que el alumnado sabrá hacer al salir

1. Localizar en un Jenkinsfile real dónde se valida, dónde se configura el entorno, dónde se verifica y dónde se limpia.
2. Explicar cómo un único playbook de Ansible sirve a varios entornos cambiando solo el fichero de variables.
3. Verificar un despliegue con el estado real del clúster y demostrar que la verificación puede fallar.
4. Provocar un fallo y demostrar con una comparación antes/después que no quedan objetos a medias.

---

## 2. Preparación

### 2.1 Para el profesor/a, antes de la sesión

1. **Hacer un ensayo completo en una `.ova` limpia** siguiendo el apartado 5.
2. Comprobar que el job `modulo5168-multibranch` (sesión 7) existe y detecta ramas, con al menos un build completo correcto (así existen el Deployment, Redis y la imagen `stable`).
3. Tener a mano la rúbrica del [índice de la UT02](./) (apartado «Cómo se evalúa»), proyectada o impresa.

### 2.2 En la VM de cada alumno/a

No hay que instalar nada. Comprueba solo que el laboratorio está en marcha:

```bash
docker ps --filter name=jenkins --filter name=gitea
minikube status
kubectl get nodes
curl -s http://192.168.49.2:30080/health
```

Los contenedores deben estar *Up*, Minikube en *Running* y el nodo en *Ready*. El `curl` responde si ya hay un despliegue del `lab/Jenkinsfile` completo (sesión 7).

Además, cada alumno/a necesita su repositorio `modulo5168-lab` en Gitea con la rama `main` y el job `modulo5168-multibranch` creado en la sesión 7.

### 2.3 Valores de referencia del laboratorio

| Entorno | Rama | Réplicas | Nivel de log | Origen |
|---|---|---|---|---|
| `staging` | cualquiera distinta de `main` | 1 | DEBUG | `lab/ansible/vars/staging.yml` |
| `production` | `main` | 2 | WARN | `lab/ansible/vars/production.yml` |

La aplicación se alcanza en `http://192.168.49.2:30080`. Staging y production comparten clúster y Deployment (`modulo5168-app`): el último despliegue sustituye al anterior. Es una limitación del laboratorio que se aprovecha en el apartado 5.

---

## 3. Estructura de la sesión

1. **Arranque y repaso guiado** (apartado 4): se repasan los criterios a-d sobre el Jenkinsfile real y se responde a una pregunta de comprobación cada uno.
2. **Práctica integradora** (apartado 5): fases encadenadas (de la 0 a la 6) con un punto de control al final de cada una. Es el núcleo de la sesión.
3. **Entrega y revisión** (apartado 6): se revisa a cada alumno/a contra la rúbrica del [índice de la UT02](./), en el momento.
4. **Cierre de la UT2 y enlace con la UT3** (apartado 8).

---

## 4. Bloque 1 · Repaso guiado de los criterios a-d

Se proyecta cada criterio con el fragmento real de `lab/Jenkinsfile`. Después de cada uno, el alumnado responde en voz alta o en un papel. Las respuestas modelo están en el apartado 6.4.

### a) Validación de parámetros

```groovy
stage('Validar parámetros requeridos') {
    steps {
        script {
            def faltantes = []
            if (!env.TARGET_ENV) { faltantes << 'TARGET_ENV' }
            if (!env.IMAGE_TAG)  { faltantes << 'IMAGE_TAG' }
            if (!env.REGISTRY)   { faltantes << 'REGISTRY' }
            if (!env.APP_URL)    { faltantes << 'APP_URL' }
            if (faltantes) {
                error("Faltan parámetros requeridos: ${faltantes}")
            }
        }
    }
}
```

Está antes de construir y de desplegar: si algo falta, el pipeline se detiene sin haber tocado nada. Pregunta: *¿por qué conviene validar antes de la etapa de build y no justo antes de desplegar?*

### b) Recopilación por entorno con Ansible

```groovy
sh 'ansible-playbook -i inventory.ini playbook.yml -e "target_env=$TARGET_ENV app_version=$IMAGE_TAG"'
```

El playbook es único. Carga `vars/<target_env>.yml` y genera el ConfigMap `modulo5168-config` a partir de una plantilla. Para añadir un entorno nuevo se crea un fichero de variables; el playbook no cambia. Pregunta: *¿qué cambia entre staging y production sin tocar el playbook?*

### c) Verificación del despliegue sin errores

```groovy
conRollback {
    sh 'kubectl rollout status deployment/modulo5168-app --timeout=120s'
}
```

`rollout status` espera a que los Pods nuevos estén listos y devuelve un código distinto de 0 si no lo consiguen. Pregunta: *¿por qué no basta con que `kubectl apply` termine bien?*

### d) Manejo de errores y limpieza

```groovy
def limpiarSiPrimeraInstalacion() {
    if (env.HABIA_VERSION_PREVIA == 'false') {
        sh 'kubectl delete -f deployment-resolved.yaml --ignore-not-found || true'
        sh 'kubectl delete -f lab/ansible/rendered/configmap-resolved.yaml --ignore-not-found || true'
    } else {
        echo 'Había una versión previa: el entorno no se ha modificado'
    }
}
```

Antes de desplegar, el pipeline averigua si ya había una versión (`Comprobar estado previo`). Si no la había y el despliegue falla, se destruye lo que esta ejecución ha creado. Si la había, se deja como estaba. Pregunta: *¿qué ocurriría si se borrara siempre, también cuando había una versión previa?*

---

## 5. Bloque 2 · Práctica integradora paso a paso

Se trabaja en una rama propia, `feature/integradora`, del repositorio `modulo5168-lab`. Cada fallo se provoca con un cambio pequeño en esa rama, que se deshace al terminar.

### Fase 0 · Preparar la rama y el build de partida

```bash
cd modulo5168-lab
git switch main && git pull
git switch -c feature/integradora
git push -u origin feature/integradora
```

En el job `modulo5168-multibranch`, *Scan Repository Now*. La rama `feature/integradora` se construye sola. Debe terminar en verde y desplegar en staging.

**Punto de control:** build en verde y `kubectl get deployment modulo5168-app` muestra el Deployment con una réplica.

**Ajuste previo del umbral de rendimiento.** La etapa *Decidir con los resultados* compara la prueba de carga de cada build con la del último build validado y falla si empeora más de un 20 %. En una VM pequeña la medida varía mucho de un build a otro, y puede fallar sin que hayas cambiado nada importante (`FALLO: rendimiento degradado más de un 20 %`). Para que eso no tape lo que vas a practicar, en `lab/Jenkinsfile` busca la llamada a `comparar-rendimiento.sh` (termina en `test-results/carga-anterior.txt 20`), cambia el `20` por `100`, súbelo y espera de nuevo el build en verde. Es el único cambio que se mantiene durante toda la práctica.

### Fase 1 · Leer y entender el flujo

Abre `lab/Jenkinsfile` y rellena en el documento de evidencias: el nombre de la etapa de validación, de la de Ansible, de la de verificación y de las tres funciones de limpieza. Responde: ¿de dónde sale el valor de `TARGET_ENV` en esta rama y qué lo cambiaría?

### Fase 2 · Criterio a): validación de parámetros

1. En `lab/Jenkinsfile`, vacía temporalmente el registro: `REGISTRY = ""`.
2. Súbelo y deja que Jenkins construya la rama. Debe fallar en *Validar parámetros requeridos* con el mensaje `Faltan parámetros requeridos: [REGISTRY]`.
3. Comprueba que no se ha construido ninguna imagen ni se ha tocado el clúster: las etapas siguientes aparecen sin ejecutar.
4. Revierte el cambio (`git revert HEAD`), súbelo y comprueba que el build vuelve a verde.

**Punto de control:** captura del rechazo con el mensaje y captura del build aceptado.

### Fase 3 · Criterio b): recopilación por entorno con Ansible

1. En el log del último build en verde, localiza la línea `ansible-playbook` y el `PLAY RECAP` con `failed=0`.
2. Mira lo que ha dejado Ansible en el clúster:

```bash
kubectl get configmap modulo5168-config -o jsonpath='{.data}'
```

3. Sin tocar el playbook ni el Jenkinsfile, cambia en `lab/ansible/vars/staging.yml` el valor de `log_level` a `INFO`. Súbelo, deja que Jenkins construya y vuelve a ejecutar el comando anterior: el ConfigMap refleja el cambio.
4. Compara con production: `cat lab/ansible/vars/production.yml`.

**Punto de control:** `PLAY RECAP` con `failed=0` y el ConfigMap antes y después del cambio.

### Fase 4 · Criterio c): despliegue y verificación

1. En el build en verde, localiza la etapa *Verificar despliegue sin errores* y la línea `successfully rolled out`.
2. Comprueba a mano lo mismo que comprueba el pipeline:

```bash
kubectl rollout status deployment/modulo5168-app --timeout=120s
kubectl get pods -l app=modulo5168-app
curl -s http://192.168.49.2:30080/health
```

3. Haz que la verificación falle: en `lab/k8s/deployment.yaml` cambia el `path` de la `readinessProbe` de `/health` a `/noexiste`. Súbelo y deja construir. Los Pods nuevos no llegan a estar listos, `rollout status` agota el tiempo y la etapa se pone en rojo.
4. Observa que el pipeline revierte solo: en el log aparece `Rollback automático: vuelvo a la versión estable anterior`, y el Deployment vuelve a la imagen anterior (`kubectl get deployment modulo5168-app -o wide`).
5. Revierte el cambio en Git (`git revert HEAD`) y comprueba que el build vuelve a verde.

**Punto de control:** etapa en verde y comprobación manual; después, captura de la etapa en rojo y del mensaje de rollback.

Pregunta: ¿qué detecta `rollout status` que no detecta `curl`, y al revés?

### Fase 5 · Criterio d): fallo real y limpieza

Se comprueba qué ocurre cuando el fallo llega en la **primera instalación**, donde no hay versión anterior a la que volver.

1. Deja el clúster sin versión previa y guarda el estado de partida (el ConfigMap y el Deployment del laboratorio, sin tocar Redis):

```bash
kubectl delete deployment modulo5168-app --ignore-not-found
kubectl delete configmap modulo5168-config --ignore-not-found
kubectl get all,configmap > antes.txt
```

2. En `lab/k8s/deployment.yaml`, dentro de `spec.strategy`, cambia `strategy:` (con dos espacios de sangría) por `estrategia:`, sin tocar la línea de debajo. Es un campo que Kubernetes no conoce, así que `kubectl apply` rechaza el manifiesto. No sirve cambiar el valor de `type` por uno inventado: Kubernetes lo acepta y el fallo aparece más tarde, en la verificación.
3. Súbelo y deja que Jenkins construya la rama. Debe fallar en *Desplegar nueva versión*, después de que Ansible haya creado el ConfigMap.
4. En el log, localiza `Fallo en la primera instalación: destruyo los objetos creados en esta ejecución`.
5. Compara con el estado de partida:

```bash
kubectl get all,configmap > despues.txt
diff antes.txt despues.txt && echo "No queda nada de esta ejecución"
```

6. Revierte el cambio (`git revert HEAD`), súbelo y comprueba que el build vuelve a verde.

**Punto de control:** captura del rojo, del mensaje de limpieza y del `diff` vacío.

> **Aviso importante: el fallo sobre un entorno ya desplegado.** Haz la prueba anterior sin el paso 1, es decir, con una versión ya en marcha. En el log aparece `Había una versión previa: el entorno no se ha modificado`, y el Deployment que funcionaba sigue funcionando. Limpiar borrando todo habría roto lo que estaba bien. Este es el enlace con la UT3.

### Fase 6 · Documento de evidencias

Rellena el documento de evidencias (anexo) con las capturas y salidas pedidas. Antes de cerrar, deja la rama como estaba (los `revert` deben verse en `git log`) y comprueba que el último build es verde.

---

## 6. Bloque 3 · Entrega y revisión en el momento

La revisión se hace durante la propia sesión, mesa por mesa, contra la rúbrica del [índice de la UT02](./). No hay corrección posterior.

### 6.1 Qué entrega cada alumno/a

1. **El repositorio de Gitea** con la rama `feature/integradora` y su historial de cambios y `revert` (el profesor/a lo ve en su pantalla).
2. **Un documento de evidencias** con esta estructura:

   | Apartado | Contenido |
   |---|---|
   | Fase 1 | Nombres de las etapas y funciones; origen de `TARGET_ENV` |
   | Criterio a) | Captura del rechazo y de la ejecución aceptada |
   | Criterio b) | `PLAY RECAP` con `failed=0`; ConfigMap antes y después del cambio en `staging.yml` |
   | Criterio c) | Etapa en verde y comprobación manual; captura de la etapa en rojo con el rollback |
   | Criterio d) | Captura del rojo, mensaje de limpieza y `diff` antes/después vacío |
   | Pregunta final | Respuesta por escrito (apartado 6.4) |

### 6.2 Cómo se revisa

1. El profesor/a se sienta junto al alumno/a y le pide que **provoque en directo** uno de los fallos (por ejemplo, el de validación o el de la sonda de readiness).
2. Se recorren los cuatro criterios con la tabla del apartado 1 como lista de verificación.
3. Se hacen dos o tres preguntas orales de comprobación, de las del apartado 6.4. Sirven para distinguir quien entiende el flujo de quien lo ha seguido sin pensar.
4. Se anota el resultado en la rúbrica y se comenta con el alumno/a qué mejorar.
5. Quien no llega, termina la fase pendiente y se revisa de nuevo al empezar la UT3.

### 6.3 Qué se mira en cada criterio

| Criterio | Se da por logrado si… | Señales de que falta |
|---|---|---|
| **a)** | Sabe dónde se valida, provoca el rechazo y explica por qué está antes de desplegar | Valida tarde, mensajes que no dicen qué falta |
| **b)** | Explica que un único playbook sirve a todos los entornos y demuestra que cambiar un fichero de variables cambia el ConfigMap | Piensa que hay un playbook por entorno o que los valores están en el Jenkinsfile |
| **c)** | La verificación comprueba estado real y la ha visto fallar | Cree que basta con que `apply` termine |
| **d)** | Fallo real, mensaje de limpieza y comparación antes/después sin restos; distingue primera instalación de versión previa | Fallo escrito a mano, sin comparación |

> Este cuadro es una guía de observación. Los niveles y la puntuación de cada criterio son los de la rúbrica del [índice de la UT02](./).

### 6.4 Preguntas orales y respuestas modelo

| Pregunta | Respuesta modelo |
|---|---|
| ¿Por qué se valida antes de construir? (a) | Si falta algo, no se gasta tiempo en construir ni se toca el clúster. Cuanto antes falla, más barato es |
| Si se añade un entorno `test`, ¿qué se crea y qué no se toca? (b) | Se crea `lab/ansible/vars/test.yml` y una forma de seleccionarlo en el Jenkinsfile. No se toca el playbook |
| ¿Diferencia entre «`apply` ha terminado» y «el despliegue está bien»? (c) | `apply` termina cuando el clúster acepta el manifiesto. Que los Pods arranquen y respondan hay que comprobarlo con `rollout status` y una petición HTTP |
| ¿Por qué no se borra siempre al fallar? (d) | Si ya había una versión funcionando, borrar rompería lo que estaba bien. Solo se destruye lo creado si era la primera instalación |
| ¿Qué función se llama si falla la verificación con una versión previa? (d) | `revertirOLimpiar`, que hace `rollout undo` y devuelve el entorno a la versión estable anterior |

**Pregunta final por escrito:** *«Si el fallo hubiera ocurrido en la etapa de Ansible en lugar de en la de despliegue, ¿qué objetos habría que limpiar y cuáles no existirían todavía?»*

### 6.5 Atención a distintos ritmos

- **Si alguien va justo:** que consiga el mínimo de cada criterio (un rechazo de validación, el ConfigMap por entorno, la verificación en verde y el fallo de la fase 5) y complete el resto después.
- **Si alguien termina pronto:** retos de ampliación.
  - Añadir una validación que compruebe que `APP_URL` tiene formato de URL.
  - Crear `vars/test.yml` y una rama que lo seleccione.
  - Comparar el log de un fallo con versión previa y sin ella.

---

## 7. Errores frecuentes y cómo resolverlos

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El build no aparece tras el `push` | Falta el escaneo del job multibranch | *Scan Repository Now* o esperar el escaneo periódico |
| `kubectl: connection refused` | Minikube parado | `minikube status` y `minikube start` |
| La etapa de aprobación se queda esperando | Estás en la rama `main` | En la rama `feature/integradora` no se pide; en `main` hay que pulsar **Desplegar** |
| El build falla antes de lo esperado | Se ha escrito mal el cambio provocado | Mira la etapa roja en *Console Output*; revierte con `git revert HEAD` |
| Tras la fase 5, el pipeline falla al comprobar Redis | Se ha borrado Redis sin querer | Vuelve a lanzar un build de la rama en `modulo5168-multibranch`: el pipeline lo instala |
| `diff antes.txt despues.txt` muestra diferencias de edad (`AGE`) | La columna de antigüedad cambia con el tiempo | Compara solo los nombres de objeto, no la edad |
| `FALLO: rendimiento degradado más de un 20 %` en *Decidir con los resultados* | La prueba de carga varía entre builds en una VM pequeña | Sube el umbral a `100` como se indica en la fase 0 y relanza el build |
| `error: timed out waiting for the condition` | Los Pods nuevos no están listos (es lo esperado en la fase 4) | Lee los eventos con `kubectl describe pod` |

---

## 8. Bloque 4 · Cierre de la UT2 y enlace con la UT3

### 8.1 Puesta en común

Se hace a viva voz, con tres preguntas:

- ¿Qué criterio os ha costado más y por qué?
- ¿Qué habría pasado en un entorno real si el pipeline no validara parámetros, no verificara el despliegue o no limpiara tras un fallo?
- ¿Qué os ha enseñado el aviso de la fase 5 sobre fallar encima de un entorno que ya funcionaba?

Idea para fijar: **un pipeline fiable no es el que nunca falla, sino el que falla pronto, avisa con claridad y no deja basura.**

### 8.2 Resumen de la UT2

| Criterio | Qué se ha visto | Dónde está |
|---|---|---|
| a) | Validación en una etapa temprana con mensajes claros | Etapa *Validar parámetros requeridos* |
| b) | Un playbook, un fichero de variables por entorno | `lab/ansible/` y etapa *Configurar entorno (Ansible)* |
| c) | Verificación con estado real del clúster | Etapa *Verificar despliegue sin errores* |
| d) | Limpieza de objetos intermedios y rollback | Funciones `limpiarSiPrimeraInstalacion`, `revertirOLimpiar` y `conRollback` |

### 8.3 Enlace con la UT3 (RA3: despliegue de la nueva versión)

La UT3 parte de **este mismo entorno**: el pipeline con selección de entorno, Ansible y verificación funcionando. El salto es el siguiente:

- Hasta ahora el foco estaba en limpiar lo creado cuando falla una primera instalación. En la UT3 se despliega **la nueva versión sobre una que ya funciona**.
- Entonces la limpieza deja de servir tal cual: borrar el despliegue fallido borraría también el que estaba en marcha. Habrá que **conservar la versión anterior** y **volver a ella** si la nueva falla (`kubectl rollout undo`), que es lo que ya hace `revertirOLimpiar` en el caso de versión previa.
- La verificación pasa a ser el criterio que decide si una versión se queda o se retira.

### 8.4 Antes de salir

Cada alumno/a deja su laboratorio en este estado, porque la siguiente sesión parte de él:

- [ ] El pipeline termina en verde en `main` y en `feature/integradora`.
- [ ] Los cambios provocados para los fallos están revertidos en Gitea (`git log` muestra los `revert`).
- [ ] `kubectl get deployment modulo5168-app` y `kubectl get deployment redis` muestran ambos Deployments.

---

## Anexo · Plantilla del documento de evidencias

```text
SESIÓN 12 · UT2 · DOCUMENTO DE EVIDENCIAS
Alumno/a: ______________________   Fecha: ______________

FASE 1 · Lectura del flujo
- Etapa de validación: ___   Etapa de Ansible: ___   Etapa de verificación: ___
- Funciones de limpieza: ___
- ¿De dónde sale TARGET_ENV en esta rama?  ______________________________

CRITERIO a) VALIDACIÓN
- [captura] rechazo con REGISTRY vacío y su mensaje
- [captura] ejecución aceptada tras revertir

CRITERIO b) ANSIBLE
- [captura] PLAY RECAP con failed=0
- ConfigMap antes: [pegar]    ConfigMap tras cambiar staging.yml: [pegar]
- ¿Qué cambia entre staging y production sin tocar el playbook?  ______________

CRITERIO c) VERIFICACIÓN
- [captura] etapa Verificar despliegue en verde
- Salida de kubectl rollout status y de curl manual: [pegar]
- [captura] etapa en rojo con la sonda /noexiste y mensaje de rollback
- ¿Qué detecta cada comprobación que la otra no?  ______________________________

CRITERIO d) FALLO Y LIMPIEZA
- [captura] ejecución en rojo y etapa que falla
- [captura] mensaje "Fallo en la primera instalación..."
- ANTES: [pegar antes.txt]    DESPUÉS: [pegar despues.txt]    diff: [pegar]
- [captura] nuevo build en verde tras revertir

PREGUNTA FINAL
Si el fallo hubiera ocurrido en la etapa de Ansible en lugar de en la de despliegue,
¿qué objetos habría que limpiar y cuáles no existirían todavía?
______________________________________________________________________
```

---

[← Sesión 11](sesion11.md) · [Índice de la UT02](./)
{% endraw %}
