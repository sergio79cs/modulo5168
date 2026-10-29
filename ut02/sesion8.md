[← Sesión 7](sesion7.md) · [Índice de la UT02](./) · [Sesión 9 →](sesion9.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 8 — Verificación de parámetros en el despliegue

Criterio RA2.c.

## Contexto y objetivos

Al terminar la sesión, el alumnado demuestra que los parámetros recopilados por Ansible (RA2.c) llegan realmente al contenedor en ejecución, no solo que están definidos en un fichero.

| Parte | Contenido |
| --- | --- |
| Teoría | Cadena parámetro → ConfigMap → Pod; envFrom; límites y trampas |
| Práctica | Aplicar, verificar con kubectl exec, provocar y corregir un fallo |
| Entrega | Captura del entregable y puesta en común |

**Objetivos de aprendizaje**

1. Explicar la ruta que sigue un parámetro desde el inventario de Ansible hasta una variable de entorno dentro del Pod.
2. Conectar un ConfigMap a un Deployment con `envFrom` y distinguirlo de `env` + `valueFrom`.
3. Verificar el resultado con `kubectl exec`, `kubectl describe` y `kubectl get configmap`.
4. Diagnosticar por qué un cambio en el ConfigMap no se refleja en un Pod ya creado.

**Requisitos previos (de sesiones anteriores)**

- Ansible genera el ConfigMap con `LOG_LEVEL` y `APP_VERSION` (sesión 7).
- Clúster Kubernetes del laboratorio operativo y `kubectl` apuntando a él.
- Existe `lab/k8s/deployment.yaml` con el Deployment `modulo5168-app`.

> Nota: los nombres `modulo5168-app` y `modulo5168-config` (ConfigMap) son los del guion; ajusta el segundo si en tu laboratorio se llama distinto.

## Teoría

### 1. Recopilar no es verificar

Tener un parámetro en el inventario de Ansible o en un ConfigMap solo prueba que existe como dato. Verificar es comprobar que el software desplegado lo recibe. Entre ambos hay varios puntos donde se puede perder: nombre mal escrito, ConfigMap en otro namespace, Deployment sin referencia al ConfigMap o Pod anterior que nunca se reinició.

El principio que guía la sesión: **lo que no se ha comprobado dentro del contenedor, no está desplegado**.

### 2. La cadena completa

1. **Ansible** define el parámetro (`group_vars`, inventario o `-e`) y renderiza el ConfigMap (plantilla Jinja2 o módulo `kubernetes.core.k8s`).
2. **ConfigMap**: objeto de Kubernetes con pares clave/valor (`data:`), por ejemplo `LOG_LEVEL: info`.
3. **Deployment**: la plantilla del Pod referencia el ConfigMap.
4. **Pod / contenedor**: Kubernetes inyecta las claves como variables de entorno al crearlo.
5. **Aplicación**: lee la variable de entorno al arrancar.

Cada eslabón es un punto de verificación distinto; en esta sesión se comprueban los eslabones 2 a 4 desde fuera y desde dentro.

### 3. Tres formas de conectar un ConfigMap

| Forma | Qué hace | Cuándo usarla |
| --- | --- | --- |
| `envFrom` + `configMapRef` | Inyecta todas las claves del ConfigMap como variables | Configuración completa de la app (caso de esta sesión) |
| `env` + `valueFrom.configMapKeyRef` | Inyecta una clave concreta, con nombre elegido | Cuando se quiere renombrar o seleccionar pocas claves |
| Volumen (`configMap` montado) | Cada clave pasa a ser un fichero | Ficheros de configuración completos (`.conf`, `.yaml`) |

Fragmento del Deployment con `envFrom`:

```yaml
spec:
  template:
    spec:
      containers:
        - name: app
          image: modulo5168-app:1.0.0
          envFrom:
            - configMapRef:
                name: modulo5168-config
```

### 4. Trampas que conviene conocer

- **Las variables se fijan al crear el Pod.** Si el ConfigMap cambia después, los Pods en marcha conservan los valores antiguos. Hay que reiniciar: `kubectl rollout restart deployment/modulo5168-app`.
- **Un ConfigMap inexistente bloquea el arranque.** El Pod queda en `CreateContainerConfigError` y `kubectl describe pod` lo explica en *Events*.
- **Precedencia:** si una misma variable aparece en `env` y en `envFrom`, gana `env`.
- **Nombres válidos:** las claves usadas con `envFrom` deben ser nombres válidos de variable de entorno; las que no lo son se omiten con un evento de aviso.
- **ConfigMap no es para secretos.** Contraseñas y tokens van en `Secret` (se verá en otra sesión); un ConfigMap es texto plano.

### 5. Herramientas de verificación

| Comando | Qué comprueba |
| --- | --- |
| `kubectl get configmap modulo5168-config -o yaml` | El ConfigMap existe y contiene los valores esperados |
| `kubectl describe deployment modulo5168-app` | El Deployment referencia el ConfigMap |
| `kubectl rollout status deployment/modulo5168-app` | El despliegue ha terminado correctamente |
| `kubectl exec deploy/modulo5168-app -- env` | Qué ve realmente el proceso dentro del contenedor |

El último es la prueba definitiva, porque observa el resultado final y no la intención declarada en los YAML.

### 6. Enlace con RA2.c

Verificar los parámetros desplegados es parte de la definición de un flujo de despliegue continuo: un pipeline correcto no termina en `kubectl apply`, sino en una comprobación automática o documentada de que la configuración efectiva es la prevista. Esta idea se reutilizará cuando el paso de verificación pase a una etapa de Jenkins.

## Práctica

Trabajo individual en la VM del laboratorio, desde la carpeta del repositorio. Cada paso indica qué debe verse; si no coincide, se pasa a la sección de errores frecuentes.

### Paso 0 · Punto de partida

```bash
kubectl cluster-info
kubectl get nodes
kubectl get configmap modulo5168-config -o yaml
```

Debe verse el clúster operativo (`Ready`) y el ConfigMap generado por Ansible con `LOG_LEVEL` y `APP_VERSION` dentro de `data:`. Anotar los valores: son la referencia para comparar luego.

### Paso 1 · Revisar el Deployment

Abrir `lab/k8s/deployment.yaml` y localizar el bloque `envFrom`. Si falta, añadirlo dentro del contenedor:

```yaml
envFrom:
  - configMapRef:
      name: modulo5168-config
```

Pregunta guiada: ¿el nombre del ConfigMap coincide exactamente con el que muestra `kubectl get configmap`?

### Paso 2 · Aplicar el despliegue

```bash
kubectl apply -f lab/k8s/deployment.yaml
kubectl rollout status deployment/modulo5168-app
kubectl get pods -l app=modulo5168-app
```

Salida esperada: `deployment "modulo5168-app" successfully rolled out` y un Pod en `Running` con `1/1` en READY. Si el Pod no llega a `Running`, usar `kubectl describe pod <nombre>` y leer la sección *Events*.

### Paso 3 · Verificar dentro del contenedor

```bash
kubectl exec -it deploy/modulo5168-app -- env | grep LOG_LEVEL
kubectl exec -it deploy/modulo5168-app -- env | grep APP_VERSION
```

Salida esperada, con los valores definidos por Ansible:

```text
LOG_LEVEL=info
APP_VERSION=1.0.0
```

Si la imagen no incluye `env` o `grep` en el contenedor, ejecutar `kubectl exec deploy/modulo5168-app -- env` y filtrar en la máquina local con `| grep`. Con `-it` y una tubería local puede aparecer un carácter `\r` al final; `kubectl exec` sin `-t` lo evita.

### Paso 4 · Contrastar tres puntos

El alumnado rellena una tabla con el mismo valor visto en tres sitios:

| Variable | Valor en el inventario de Ansible | Valor en el ConfigMap | Valor en el Pod |
| --- | --- | --- | --- |
| `LOG_LEVEL` |  |  |  |
| `APP_VERSION` |  |  |  |

Si los tres coinciden, la cadena está verificada de principio a fin.

### Paso 5 · Provocar el caso clásico: cambio sin reinicio

1. Cambiar `LOG_LEVEL` a `debug` en el inventario de Ansible y relanzar el playbook que genera el ConfigMap.
2. Comprobar que el ConfigMap ya dice `debug`: `kubectl get configmap modulo5168-config -o jsonpath='{.data.LOG_LEVEL}'`.
3. Comprobar el Pod sin reiniciar: `kubectl exec deploy/modulo5168-app -- env | grep LOG_LEVEL`. **Sigue mostrando `info`.**
4. Reiniciar: `kubectl rollout restart deployment/modulo5168-app` y esperar con `kubectl rollout status`.
5. Repetir la verificación: ahora aparece `LOG_LEVEL=debug`.

Conclusión para comentar en voz alta: el ConfigMap actualizado no basta; el despliegue debe recrear los Pods, y eso también es parte de verificar.

### Paso 6 · Captura del entregable

La captura debe mostrar en una sola imagen: el comando `kubectl exec ... env | grep` para ambas variables, la salida con los valores y el nombre del Pod o Deployment. Guardarla como `s08_verificacion_<apellido>.png`.

### Ampliación opcional

- Verificar también `kubectl describe deployment modulo5168-app` y localizar la referencia al ConfigMap en `Environment Variables from`.
- Escribir un pequeño script `verificar.sh` que compare `LOG_LEVEL` y `APP_VERSION` del Pod con los esperados y devuelva código de salida distinto de 0 si no coinciden; es la base de una etapa de verificación en Jenkins.

## Errores frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| Pod en `CreateContainerConfigError` | El ConfigMap referenciado no existe o está en otro namespace | `kubectl get configmap -A`; corregir nombre o namespace y reaplicar |
| `grep` no devuelve nada | El Deployment no tiene `envFrom` o la clave no existe en el ConfigMap | `kubectl describe deployment` y revisar `data:` del ConfigMap |
| Valor antiguo tras cambiar el ConfigMap | Los Pods no se recrearon | `kubectl rollout restart deployment/modulo5168-app` |
| `kubectl exec` devuelve `unable to upgrade connection` o error de contexto | `kubectl` apunta a otro clúster o el Pod no está `Running` | `kubectl config current-context` y `kubectl get pods` |
| `executable file not found` al ejecutar `env` | Imagen mínima sin utilidades | Ejecutar `printenv` o usar otra imagen de depuración |
| Dos Pods y valores distintos | Convive un Pod antiguo con uno nuevo durante el rollout | Esperar a `rollout status` y consultar con `deploy/...` o comprobar el Pod concreto |
| Variable con valor distinto al esperado | La misma clave definida en `env` del Deployment (tiene prioridad sobre `envFrom`) | Eliminar la duplicidad en `deployment.yaml` |

## Entregable y evaluación

**Entregable:** una captura que muestre las variables de entorno configuradas por Ansible (`LOG_LEVEL` y `APP_VERSION`) presentes dentro del contenedor en ejecución, subida a Aules al terminar la sesión.

| Criterio | Qué se observa | Peso |
| --- | --- | --- |
| Verificación en el contenedor | Aparece `kubectl exec ... env \| grep` con ambas variables y sus valores | 50 % |
| Coherencia con Ansible | Los valores coinciden con los definidos en el inventario/ConfigMap (tabla del paso 4) | 25 % |
| Identificación | Se ve el Deployment o Pod, y el nombre del archivo sigue el formato indicado | 10 % |
| Caso de cambio sin reinicio | Explica en dos líneas por qué hizo falta `rollout restart` | 15 % |

Pesos orientativos; ajustables a la rúbrica de la UT02.

### Preguntas de repaso

1. ¿Qué diferencia hay entre que un parámetro esté en el ConfigMap y que esté en el Pod?
2. ¿Qué hace `envFrom` y en qué se diferencia de `valueFrom.configMapKeyRef`?
3. Cambias el ConfigMap y el Pod sigue mostrando el valor antiguo. ¿Por qué y cómo lo resuelves?
4. ¿Qué estado muestra un Pod que referencia un ConfigMap inexistente y dónde se ve la causa?
5. ¿Por qué no es adecuado guardar una contraseña en un ConfigMap?

**Soluciones breves:** (1) el ConfigMap es el dato; el Pod solo lo recibe si el Deployment lo referencia y se creó después del cambio. (2) `envFrom` inyecta todas las claves; `configMapKeyRef` una sola y con nombre elegible. (3) las variables se fijan al crear el Pod; `rollout restart`. (4) `CreateContainerConfigError`; `kubectl describe pod`, sección *Events*. (5) es texto plano visible para quien tenga acceso de lectura; para eso existe `Secret`.

---

[← Sesión 7](sesion7.md) · [Índice de la UT02](./) · [Sesión 9 →](sesion9.md)
