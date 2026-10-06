{% raw %}
[← Sesión 7](sesion7.md) · [Índice de la UT01](./) · [Sesión 9 →](sesion9.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 8 - Versionado semántico y registro

## Objetivos y requisitos previos

Al terminar, cada alumno sabe elegir el número de versión de un cambio y publica esa versión en el registry sin intervención manual.

Objetivos:

- Aplicar MAYOR.MENOR.PARCHE a cambios reales y justificar la elección.
- Distinguir etiquetas fijas (`1.1.0`) de etiquetas móviles (`1.1`, `1`, `latest`) y del digest.
- Publicar y recuperar imágenes del registry de contenedores de Gitea.
- Automatizar la publicación con un stage de Jenkins que solo se ejecuta al empujar un tag `vX.Y.Z`.

Requisitos en el ordenador de cada alumno:

- Imagen `modulo5168-app:v1.1.0` construida en sesiones anteriores.
- Gitea en `localhost:3000` con el apartado Packages activo y `ROOT_URL = http://localhost:3000/` en `app.ini`.
- Jenkins en contenedor con el socket de Docker montado y un pipeline multibranch sobre el repositorio de la app (imagen jenkins-lab de la guía de instalación, que ya incluye el cliente de Docker).
- Plugin *Basic Branch Build Strategies* instalado en Jenkins (Manage Jenkins \> Plugins \> Available plugins). El Pipeline normal no sirve: hace falta un Job Multibranch Pipeline.

## Teoría

La versión la decide una persona al crear el tag de Git; todo lo demás lo hace el pipeline.

### 1. Versionado semántico

El formato es `MAYOR.MENOR.PARCHE`:

- **MAYOR** sube con cambios incompatibles, por ejemplo cuando se rompe la API o cambia un contrato.
- **MENOR** sube con funcionalidad nueva compatible con lo anterior.
- **PARCHE** sube con correcciones que no cambian el comportamiento esperado.

Conviene nombrar también las pre-releases (`1.2.0-rc.1`), los metadatos de build (`1.2.0+build.45`, no afectan a la precedencia) y la serie `0.x.y`, en la que no se garantiza compatibilidad.

Ejercicio rápido. Partiendo de `1.1.0`, ¿qué versión sale en cada caso?

| Cambio                                                     | Versión |
|------------------------------------------------------------|---------|
| Se corrige un bug en el login                              | `1.1.1` |
| Se añade un endpoint `/health`                             | `1.2.0` |
| Se renombra un campo del JSON que consumen otros servicios | `2.0.0` |

### 2. Tags de Git y tags de imagen

- La versión nace en Git (`git tag v1.1.0`) y la imagen la hereda.
- Un tag de imagen es una etiqueta; lo que identifica el contenido de forma inmutable es el **digest** (`sha256:...`).
- Convención habitual: `1.1.0` como etiqueta fija y `1.1`, `1` y `latest` como etiquetas que se mueven.
- `latest` es peligroso en despliegue: no se sabe qué versión corre y el rollback no es fiable.
- Un tag publicado no se reescribe. Si hay que corregir, se publica `1.1.1`.
- Convención del módulo: `v` en el tag de Git (`v1.1.0`) y sin `v` en la imagen (`1.1.0`).

### 3. El registry y el tag como disparador

Un registry almacena imágenes con nombre `host[:puerto]/namespace/imagen:tag`. Ejemplos: Docker Hub, GHCR, Harbor y, en nuestro laboratorio, el registry integrado de Gitea.

```
flowchart LR
  A[git push tag v1.2.0] --> B[Webhook Gitea]
  B --> C[Jenkins: build + test]
  C --> D[Stage Publicar versión]
  D --> E[Registry Gitea<br/>1.2.0 · 1.2 · 1 · latest]
```

El ciclo manual es `build → tag → login → push → pull`; Jenkins repite exactamente esos pasos cuando detecta un tag SemVer.

## Práctica

Se hace primero el ciclo a mano y después se automatiza. Los ejemplos usan el usuario `alumno`; cada uno pone el suyo.

### Paso 1 · Ciclo manual

Token en Gitea: *Configuración → Aplicaciones → Generar token*, con permiso de escritura sobre **package**.

```
git tag -a v1.1.0 -m "Versión 1.1.0"
git push origin v1.1.0

docker tag modulo5168-app:v1.1.0 localhost:3000/alumno/modulo5168-app:1.1.0
docker login localhost:3000        # usuario de Gitea + token
docker push localhost:3000/alumno/modulo5168-app:1.1.0

docker rmi localhost:3000/alumno/modulo5168-app:1.1.0
docker pull localhost:3000/alumno/modulo5168-app:1.1.0
```

Anotad el digest que muestra el push: debe coincidir con el del pull.

### Paso 2 · Preparar Jenkins

1. **Credencial.** *Administrar Jenkins → Credentials*, tipo *Username with password*, ID `gitea-registry`, usuario de Gitea y el token como contraseña.
2. **Construcción de tags.** En el job multibranch, activar *Discover tags* y añadir las estrategias de construcción *Regular branches* y *Tags* (plugin *Basic Branch Build Strategies*). Sin la estrategia *Tags*, Jenkins descubre los tags pero no los construye.
3. **Webhook.** Gitea bloquea por defecto los webhooks a direcciones locales. Añadir en `app.ini` y reiniciar Gitea:

```
[webhook]
ALLOWED_HOST_LIST = private,loopback
```

Si el job usa una fuente Git normal (no la de Gitea), el webhook no dispara el escaneo del job multibranch. Se puede marcar en el job Scan Multibranch Pipeline Triggers \> Periodically if not otherwise run con un intervalo de 1 minuto, o lanzar *Scan Multibranch Pipeline Now* a mano tras crear el tag. Con el valor ALLOWED_HOST_LIST que ya lleva el contenedor de Gitea (guía de instalación, paso 1bis) no hace falta tocar app.ini.

### Paso 3 · Publicación automática (15')

Copiar el stage *Publicar versión* del Jenkinsfile (apartado siguiente) al repositorio. Hacer un cambio pequeño, decidir si es PARCHE o MENOR y empujar el tag:

```
git tag -a v1.1.1 -m "Corrige ..."
git push origin v1.1.1
```

Resultado esperado: en Jenkins aparece un build bajo la pestaña *Tags* con el stage en verde. En Gitea Packages se ven `1.1.1`, `1.1`, `1` y `latest` con el nuevo digest, y `1.1.0` sigue intacto.

### Paso 4 · Errores provocados (15')

| Prueba             | Qué hacer                                            | Resultado esperado                                        |
|--------------------|------------------------------------------------------|-----------------------------------------------------------|
| Pre-release        | Empujar `v1.2.0-rc.1`                                | Se publica solo `1.2.0-rc.1`; `latest` no se mueve        |
| Reescribir versión | Borrar el tag `v1.1.1` y empujarlo sobre otro commit | El stage falla: la versión ya existe                      |
| Tag no SemVer      | Empujar `version-2`                                  | El build se ejecuta pero el stage de publicación se salta |

Para borrar y reescribir un tag: `git tag -d v1.1.1 && git push origin :refs/tags/v1.1.1`, nuevo commit, `git tag -a v1.1.1 -m "..." && git push origin v1.1.1`.

### Paso 5 · Margen

Para quien se atasque con webhooks o credenciales. El registry temporal usa el puerto 5001 porque el 5000 es el del laboratorio (guía de instalación, paso 6).

### Plan B sin Gitea

```
docker run -d -p 5001:5000 --name registry-temp registry:2
docker tag modulo5168-app:v1.1.0 localhost:5001/modulo5168-app:1.1.0
docker push localhost:5001/modulo5168-app:1.1.0
curl http://localhost:5001/v2/modulo5168-app/tags/list
```

## Jenkinsfile

Las ramas construyen y prueban; los tags `vX.Y.Z` además publican. Si el pipeline de sesiones anteriores ya tiene stages de build y test, basta con añadir *Publicar versión*, el bloque `environment` y el `post`.

```
pipeline {
  agent any

  environment {
    // El push lo hace el daemon Docker del host (socket montado en Jenkins),
    // por eso el registry se nombra como lo ve el host: localhost:3000.
    REGISTRY = 'localhost:3000'
    IMAGE    = 'localhost:3000/alumno/modulo5168-app'   // cambiar "alumno"
  }

  stages {

    stage('Build') {
      steps {
        sh 'docker build -t modulo5168-app:ci-${BUILD_NUMBER} .'
      }
    }

    stage('Test') {
      steps {
        echo 'Tests de la aplicación'
      }
    }

    stage('Publicar versión') {
      // Solo al construir un tag SemVer: v1.2.3 o v1.2.3-rc.1
      when {
        tag pattern: '^v\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.-]+)?$', comparator: 'REGEXP'
      }
      steps {
        withCredentials([usernamePassword(credentialsId: 'gitea-registry',
                                          usernameVariable: 'REG_USER',
                                          passwordVariable: 'REG_PASS')]) {
          // Comillas simples: el secreto lo expande la shell, no Groovy
          sh '''
            set -eu
            VERSION="${TAG_NAME#v}"
            echo "Versión a publicar: $VERSION"

            echo "$REG_PASS" | docker login "$REGISTRY" -u "$REG_USER" --password-stdin

            # Inmutabilidad: una versión publicada no se reescribe
            if docker manifest inspect --insecure "$IMAGE:$VERSION" > /dev/null 2>&1; then
              echo "ERROR: $IMAGE:$VERSION ya existe en el registry. Publica una versión nueva."
              exit 1
            fi

            docker tag "modulo5168-app:ci-$BUILD_NUMBER" "$IMAGE:$VERSION"
            docker push "$IMAGE:$VERSION"

            case "$VERSION" in
              *-*)
                echo "Pre-release: no se mueven MAYOR.MENOR, MAYOR ni latest"
                ;;
              *)
                MINOR="${VERSION%.*}"     # 1.2.3 -> 1.2
                MAJOR="${VERSION%%.*}"    # 1.2.3 -> 1
                for T in "$MINOR" "$MAJOR" latest; do
                  docker tag "$IMAGE:$VERSION" "$IMAGE:$T"
                  docker push "$IMAGE:$T"
                done
                ;;
            esac

            docker image inspect --format '{{index .RepoDigests 0}}' "$IMAGE:$VERSION"
          '''
        }
      }
    }
  }

  post {
    always {
      sh 'docker logout "$REGISTRY" || true'
    }
  }
}
```

## Cierre

- **Puesta en común (10').** ¿Quién eligió PARCHE y quién MENOR? ¿Estaba bien elegido? ¿Qué habría pasado si el pipeline hubiera dejado reescribir `1.1.1`?
- **Debate (5').** Si después de publicar `1.2.0` alguien publica un parche de mantenimiento `1.1.2`, con este Jenkinsfile `latest` y `1` retroceden a `1.1.2`. La solución real compara con la versión más alta publicada antes de mover etiquetas. Reto opcional para quien acabe antes.
- **Entrega (5')** en Aules.

### Notas:

- `localhost:3000` **en la imagen y** `gitea:3000` **en el checkout.** Con el socket de Docker montado, el `docker push` lo ejecuta el daemon del host, que ve Gitea en `localhost`. El checkout de Git sale del contenedor de Jenkins, que ve Gitea por su nombre en la red Docker. Con Docker-in-Docker habría que ajustarlo.
- **Docker y HTTP.** Docker acepta registries sin TLS en `localhost`, así que no hace falta tocar `insecure-registries`.
- **Login fallido.** Casi siempre es un `ROOT_URL` de Gitea que no coincide con `http://localhost:3000/`.
- **Adelanto para Kubernetes.** Con kind o minikube, `localhost` dentro del clúster no es el del alumno: habrá que cargar la imagen en el clúster o apuntar a la IP del host.

## Entregable y rúbrica

Cada alumno sube a Aules cuatro capturas y una justificación:

1. Gitea Packages con `modulo5168-app` y sus etiquetas (`1.1.0`, `1.1.1`, `1.1`, `1`, `latest`).
2. Jenkins con el build del tag y el stage *Publicar versión* en verde.
3. El build fallido al intentar reescribir una versión ya publicada.
4. El tag de Git en Gitea (`v1.1.0` y la versión nueva).
5. Una línea que justifique el número elegido para la segunda versión.

| Criterio                                        | Puntos |
|-------------------------------------------------|--------|
| Imagen publicada con versión semántica correcta | 3      |
| Stage de Jenkins que publica al empujar un tag  | 3      |
| Tag de Git coherente con el de la imagen        | 1      |
| Segunda versión bien clasificada y justificada  | 2      |
| Fallo de inmutabilidad demostrado               | 1      |
| **Total**                                       | **10** |

---

[← Sesión 7](sesion7.md) · [Índice de la UT01](./) · [Sesión 9 →](sesion9.md)
{% endraw %}
