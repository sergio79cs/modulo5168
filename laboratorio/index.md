{% raw %}
[← Inicio del módulo](../) · [UT01](../ut01/)

# Guía de instalación del laboratorio — Módulo 5168 (v3)

📦 **Descarga el proyecto del laboratorio:** [modulo5168-lab.zip](modulo5168-lab.zip)

## Antes de empezar

Cada alumno monta el laboratorio completo en su ordenador: Docker, Gitea, Jenkins, Minikube y un registry de imágenes, sin ningún servidor compartido. Los contenedores se encuentran por nombre (`gitea`, `jenkins`) dentro de la red de Docker `lab5168`, nunca por `localhost`.

**Requisitos**

- Ubuntu o Debian con acceso `sudo`. Es la opción probada y recomendada para el aula; con Windows o Mac habría que adaptar el paso del socket de Docker.
- 8 GB de RAM como mínimo (16 GB recomendados), porque Jenkins, Gitea y Minikube funcionan a la vez.
- Conexión a internet. En redes de centro puede hacer falta fijar el DNS de Docker (paso 1).

**Reglas para copiar y pegar**

1. Pega los bloques de uno en uno y comprueba el resultado antes de seguir.
2. No pegues un comando partido en dos líneas. Los comandos largos de esta guía llevan `\` al final de línea o se dan en varios pasos a propósito.
3. Escribe los nombres de contenedor exactamente: `jenkins`, `gitea`, `minikube`.
4. No uses `docker exec -u root` para crear ni modificar archivos dentro de `/var/jenkins_home`: deja el volumen con propietario root y Jenkins deja de arrancar.

**Cómo crear los ficheros del laboratorio**

Usa **Visual Studio Code**: abre la carpeta del proyecto (**File \> Open Folder**), pulsa **New File** en el panel lateral y escribe el nombre completo (`server.js`, `package.json`, `Dockerfile` sin extensión). En Linux también puedes usar `nano server.js` (guardar con Ctrl+O y Enter, salir con Ctrl+X).

No uses el Bloc de notas ni Word: el Bloc de notas añade `.txt` al nombre y Word cambia las comillas rectas por tipográficas, lo que rompe el `package.json` y los comandos. Al pegar código desde un documento, comprueba que las comillas son rectas (`"`) y que no se han partido líneas.

Los scripts `.sh` deben guardarse con finales de línea **LF**, no CRLF: en VS Code se cambia en la barra de abajo, donde pone CRLF. Con `ls` (o `dir` en Windows) comprueba que el fichero se llama exactamente como debe.

## 1. Instalar Docker, crear la red y fijar el DNS

Docker es la base de todo: Jenkins, Gitea y la propia aplicación se ejecutan en contenedores.

**Instalar Docker (Ubuntu/Debian)**

```
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

Cierra la sesión y vuelve a entrar para que el grupo `docker` tenga efecto. Después verifica:

```
docker --version
docker run hello-world
```

Si aparece "Hello from Docker!", puedes continuar.

**Crear la red del laboratorio**

```
docker network create lab5168
```

Dentro de un contenedor, `localhost` es el propio contenedor. Si Jenkins intentara llegar a Gitea por `http://localhost:3000` se buscaría a sí mismo y fallaría. En la red `lab5168` se encuentran por su nombre: `http://gitea:3000`.

**Comprobar y fijar el DNS de Docker**

Por defecto, los contenedores usan un DNS público (8.8.8.8). Muchas redes de centro lo bloquean, y entonces `npm install`, `apt-get` o las descargas dentro de un build fallan con `EAI_AGAIN` o `Temporary failure resolving`. Aunque `docker pull` funcione, porque lo hace el propio Docker del equipo. Compruébalo antes de seguir:

```
docker run --rm alpine nslookup registry.npmjs.org
```

Si responde con una dirección IP, no hay que hacer nada. Si falla o se queda esperando, averigua el DNS que usa tu equipo y pruébalo:

```
resolvectl status | grep -i -A2 "DNS Server"
docker run --rm --dns IP_DEL_DNS alpine nslookup registry.npmjs.org
```

Cuando la prueba con `--dns` funcione, déjalo fijado para todos los contenedores:

```
cat /etc/docker/daemon.json
```

Si el fichero no existe o está vacío:

```
echo '{ "dns": ["IP_DEL_DNS"] }' | sudo tee /etc/docker/daemon.json
```

Si ya tenía contenido, añade solo la clave `"dns"` sin borrar lo demás. Reinicia Docker y repite la prueba sin `--dns`:

```
sudo systemctl restart docker
docker run --rm alpine nslookup registry.npmjs.org
```

Reiniciar Docker detiene los contenedores que ya existan. Si ya tienes alguno creado, sigue la rutina de la sección 12.

## 1bis. Instalar Gitea (servidor Git local)

Gitea es el servidor Git del laboratorio, un GitHub en miniatura en tu propio equipo. Todas las prácticas lo usan como remoto; no se usa GitHub ni GitLab.

```
docker run -d --name gitea \
 -p 3000:3000 -p 2222:22 \
 -v gitea_data:/data \
 --network lab5168 \
 -e GITEA__webhook__ALLOWED_HOST_LIST=private,loopback \
 --restart unless-stopped \
 gitea/gitea:latest
```

- El puerto 3000 es la web y el 2222 el SSH (no se usa el 22 para no chocar con el del equipo).
- `--network lab5168` permite que Jenkins lo encuentre como `gitea`.
- `ALLOWED_HOST_LIST` deja que Gitea envíe webhooks a Jenkins; sin ella los bloquea hacia direcciones privadas.
- `--restart unless-stopped` hace que vuelva a arrancar solo al encender el equipo.

**Asistente inicial**

1. Abre `http://localhost:3000` y deja los valores por defecto (base de datos SQLite integrada).
2. Pulsa instalar y, al final, crea el usuario administrador. Apunta el **nombre de usuario** y la contraseña: los pedirá `git push` desde la terminal, sin ventana emergente.

**Crear el repositorio del laboratorio**

En Gitea pulsa `+` arriba a la derecha, luego **New Repository**. Llámalo `modulo5168-lab` y déjalo vacío, sin README. Si lo creas público, Jenkins lo clona sin credenciales; si es privado, tendrás que dar usuario y contraseña de Gitea en el Job (paso 10).

**Disparo automático con webhook (UT2, sesión 3)**

Se configura cuando Jenkins ya funciona, en el Job (paso 10) y en el repositorio. No hace falta ningún plugin adicional: se usa el aviso `notifyCommit` del plugin Git.

1. En el Job, en **Build Triggers**, marca **Poll SCM** y deja la programación vacía: así Jenkins solo consulta el repositorio cuando recibe el aviso.
2. En el repositorio de Gitea: **Settings \> Webhooks \> Add Webhook \> Gitea**. En **Target URL** pon `http://jenkins:8080/git/notifyCommit?url=http://gitea:3000/<tu-usuario>/modulo5168-lab.git`, con el nombre del contenedor y no `localhost`. **HTTP Method**: `GET`. Evento: **Push events**.
3. Haz un cambio y un push: debe aparecer un build nuevo sin pulsar Build Now. Si no aparece, revisa **Recent Deliveries** en el webhook.

Alternativa si el aviso no llega: en **Poll SCM** escribe `* * * * *`, que consulta el repositorio cada minuto. El disparo ya no es inmediato, pero el flujo es el mismo.

## 2. Instalar y arrancar Jenkins con imagen propia

El Jenkinsfile del laboratorio ejecuta `docker build`, `docker push` y `kubectl`, y la imagen oficial de Jenkins no trae ninguno de los dos clientes. Instalarlos a mano con `docker exec` funciona, pero se pierde cada vez que se recrea el contenedor. Por eso se construye una imagen propia, una sola vez.

**Construir la imagen** `jenkins-lab`

Pega el bloque entero, empieza en `mkdir` y termina en `docker build`:

```
mkdir -p ~/jenkins-lab && cd ~/jenkins-lab
cat > Dockerfile <<'EOF'
FROM jenkins/jenkins:lts
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
USER root
RUN apt-get update && apt-get install -y docker.io ansible-core apache2-utils nodejs npm && rm -rf /var/lib/apt/lists/*
RUN KVER=$(curl -fsSL https://dl.k8s.io/release/stable.txt) \
 && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KVER}/bin/linux/amd64/kubectl" \
 && chmod +x /usr/local/bin/kubectl
USER jenkins
EOF
docker build -t jenkins-lab .
```

Si el build falla con `Temporary failure resolving`, es el DNS: vuelve al paso 1.

Las líneas `ENV LANG` y `LC_ALL` evitan el error de Ansible "requires the locale encoding to be UTF-8", porque la imagen base no define el idioma. Ansible, Apache Bench (`ab`) y npm los usan las UT 2 a 4.

**Arrancar Jenkins**

```
docker run -d --name jenkins \
  -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --group-add $(stat -c '%g' /var/run/docker.sock) \
  --network lab5168 \
  --restart unless-stopped \
  jenkins-lab
```

- `-p 8080:8080` publica la web; `-p 50000:50000` es para agentes remotos (no se usa, pero Jenkins lo espera).
- `-v jenkins_home:/var/jenkins_home` guarda toda la configuración en un volumen: sobrevive aunque borres y recrees el contenedor.
- `-v /var/run/docker.sock:...` deja que Jenkins use el Docker del equipo ("Docker outside of Docker").
- `--group-add` añade el grupo propietario del socket **en el equipo**. Es lo que da el permiso de verdad: `usermod -aG docker jenkins` dentro del contenedor no sirve, porque ese grupo recibe un número (GID) distinto al del equipo.
- `--network lab5168` lo conecta a la red del laboratorio.
- `--restart unless-stopped` lo arranca solo al encender el equipo.

**Contraseña inicial y asistente**

```
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

1. Abre `http://localhost:8080` (tarda uno o dos minutos la primera vez).
2. Pega la contraseña obtenida.
3. Elige **Install suggested plugins** y espera a que termine.
4. Crea el usuario administrador cuando lo pida.

Entregable: pantalla de bienvenida de Jenkins con tu usuario creado.

## 3. Comprobar que Jenkins usa Docker y kubectl

```
docker exec jenkins docker ps
docker exec jenkins kubectl version --client
docker exec jenkins id
```

El primer comando debe mostrar una tabla de contenedores (aunque sea con pocas filas), el segundo la versión del cliente, y el tercero debe incluir en `groups=` el número de grupo del socket. Ese número lo ves con:

```
stat -c '%g' /var/run/docker.sock
```

Si `docker ps` da `permission denied ... docker.sock`, el contenedor se creó sin `--group-add`. Recréalo con el comando del paso 2: no pierdes nada, porque los datos están en el volumen `jenkins_home`. Como apaño temporal para una sesión, `sudo chmod 666 /var/run/docker.sock` también funciona, pero se pierde al reiniciar el equipo y solo es aceptable en un laboratorio.

Para las UT2 a UT4, comprueba también las herramientas que lleva la imagen (Ansible, Apache Bench y npm):

```
docker exec jenkins ansible-playbook --version
docker exec jenkins ab -V
docker exec jenkins npm --version
```

## 4. Instalar los plugins necesarios

El asistente solo instala los plugins sugeridos. El pipeline necesita tres: **Docker Pipeline**, **Kubernetes CLI Plugin** y **Credentials Binding Plugin**. Este último suele venir ya instalado con los sugeridos, y por eso no aparece en el buscador de plugins disponibles, que solo muestra los que faltan. Empieza comprobando qué hay.

1. Entra en `http://localhost:8080` y ve a **Manage Jenkins \> Plugins \> Installed plugins**. Busca los tres nombres. Los que ya estén, no hay que instalarlos.
2. Para instalar los que falten, abre la pestaña **Available plugins**.
3. Busca `Docker Pipeline` (autor CloudBees) y marca su casilla, sin instalar todavía.
4. Borra el buscador, escribe `Kubernetes CLI` y marca **Kubernetes CLI Plugin**. La selección anterior se mantiene.
5. Si falta Credentials Binding, búscalo como `Credentials Binding` y márcalo también.
6. Baja al final y pulsa **Install**. Verás una línea por plugin que pasa de amarillo a verde.
7. En esa pantalla marca **Restart Jenkins when installation is complete and no jobs are running**. Tarda uno o dos minutos y tendrás que volver a iniciar sesión.

Si **Available plugins** aparece completamente vacío, el catálogo no se ha descargado: pulsa **Check now** y revisa que el contenedor sale a internet con `docker exec jenkins curl -sI https://updates.jenkins.io`. Si ese comando falla, es el DNS o el proxy de la red (paso 1).

El Kubernetes CLI Plugin aporta `withKubeConfig`, pero no el programa `kubectl`: ese ya está dentro de la imagen `jenkins-lab`.

Los plugins **JUnit** y **Pipeline: Multibranch** suelen venir ya con los sugeridos: compruébalo en Installed plugins. El webhook de Gitea no necesita un plugin propio (apartado 1bis).

Entregable: los tres plugins aparecen en **Installed plugins** con la casilla de habilitado marcada.

## 5. Preparar Kubernetes con Minikube

Minikube es un clúster de un solo nodo que corre en tu propio equipo, dentro de un contenedor Docker.

**Instalar Minikube**

```
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
minikube start --driver=docker
```

**Instalar kubectl en el equipo**

Este comando se hace en dos pasos. En una sola línea, con el `$(...)` partido al copiar, la versión sale vacía y se descarga un fichero de error en lugar del programa.

```
VERSION=$(curl -L -s https://dl.k8s.io/release/stable.txt)
echo $VERSION
```

Debe aparecer algo como `v1.xx.x`. Si sale vacío, hay un problema de red o proxy. Si sale bien:

```
curl -LO "https://dl.k8s.io/release/${VERSION}/bin/linux/amd64/kubectl"
file kubectl
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
kubectl get nodes
```

`file kubectl` debe decir `ELF 64-bit`. Si dice `XML` o `ASCII text`, la descarga ha fallado: borra el fichero y repite. Si `kubectl get nodes` muestra el nodo `minikube` en estado `Ready`, el clúster está operativo.

**Conectar Jenkins a la red de Minikube**

Con el driver `docker`, Minikube crea su propia red de Docker llamada `minikube`, y Jenkins no llega al clúster hasta que lo conectas a ella. Hazlo con una IP fija:

```
minikube ip
docker network connect --ip 192.168.49.10 minikube jenkins
docker network inspect minikube --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
```

La primera orden debe devolver `192.168.49.2`. Si devuelve otra subred, usa en la segunda una IP de esa subred terminada en `.10`. La última debe listar `minikube` con la `.2` y `jenkins` con la `.10`.

La IP fija evita un bloqueo: Minikube necesita siempre la `.2`, y si Jenkins arranca antes que él al encender el equipo y la ocupa, `minikube start` falla con `Address already in use`.

Hazlo después de `minikube start`. Si borras y recreas el contenedor de Jenkins, repite el `docker network connect`. No uses `minikube delete` para arreglar problemas: borra el clúster y el kubeconfig que subirás a Jenkins dejaría de servir.

**Clúster real del centro**

Si más adelante el centro dispone de un clúster de varios nodos, el pipeline no cambia: solo se sustituye el kubeconfig de Minikube por el del clúster real en el paso 7.

## 6. Preparar un registry para las imágenes

Jenkins necesita un sitio donde publicar la imagen construida. La opción recomendada para el aula es el registry que incluye Minikube, sin autenticación. La alternativa más realista es una cuenta gratuita de Docker Hub.

Un registry corriendo en tu equipo no basta: Minikube descarga las imágenes desde dentro de su nodo, donde `localhost:5000` es el propio nodo y no tu ordenador, y el resultado sería `ImagePullBackOff`. La solución es usar el registry de Minikube y reenviarle el puerto 5000 de tu equipo, de modo que el mismo nombre (`localhost:5000`) funcione en los dos lados.

**1. Activar el registry en el clúster**

```
minikube addons enable registry
kubectl get pods -n kube-system | grep registry
```

Espera a que los pods `registry` y `registry-proxy` estén en `Running`. El `registry-proxy` hace que, dentro del nodo, `localhost:5000` apunte al registry.

**2. Reenviar el puerto 5000 del equipo al registry**

```
docker run -d --name registry-fwd \
 --network host \
 --restart unless-stopped \
 alpine/socat \
 TCP-LISTEN:5000,reuseaddr,fork TCP:$(minikube ip):5000
```

Este contenedor escucha en el puerto 5000 del equipo y reenvía todo al registry del clúster. Jenkins usa el Docker del equipo, así que `docker push localhost:5000/...` llega al registry a través de este reenvío.

**3. Comprobar que funciona**

```
curl http://localhost:5000/v2/_catalog
```

Debe responder `{"repositories":[]}`, o la lista de imágenes cuando ya hayas publicado alguna.

Con esta opción, `REGISTRY` es `localhost:5000` en el Jenkinsfile, y de ahí sale la imagen del `deployment.yaml`, donde `render.sh` sustituye el marcador. Si cambia la IP de Minikube (`minikube ip`), borra el contenedor con `docker rm -f registry-fwd` y créalo de nuevo.

## 7. Configurar las credenciales en Jenkins

El pipeline necesita dos credenciales, y las busca por su ID exacto.

**Generar el kubeconfig del clúster**

```
kubectl config view --raw --flatten --minify > kubeconfig-aula
grep server kubeconfig-aula
```

El `--raw` es imprescindible: sin él, los certificados salen como `DATA+OMITTED` y el fichero no sirve. No subas `~/.kube/config` tal cual, porque apunta a certificados que Jenkins no puede leer.

La línea `server:` debe ser `https://192.168.49.2:8443`. Si sale `127.0.0.1` con otro puerto, cámbiala:

```
sed -i "s|server: .*|server: https://$(minikube ip):8443|" kubeconfig-aula
```

**Probarlo desde dentro de Jenkins antes de subirlo**

```
docker cp kubeconfig-aula jenkins:/tmp/kubeconfig-aula
docker exec -u root jenkins chown jenkins:jenkins /tmp/kubeconfig-aula
docker exec -e KUBECONFIG=/tmp/kubeconfig-aula jenkins kubectl get nodes
docker exec jenkins rm /tmp/kubeconfig-aula
```

Debe aparecer el nodo `minikube` en `Ready`. El `chown` es necesario porque `docker cp` deja el fichero con propietario root y `kubectl` falla con `permission denied`. Si hay un timeout hacia `192.168.49.2:8443`, Jenkins no está en la red `minikube` (paso 5).

**Crear las credenciales**

En Jenkins: **Manage Jenkins \> Credentials \> System \> Global credentials (unrestricted) \> Add Credentials**.

| Credencial | Kind                   | ID                     | Contenido                                          |
|------------|------------------------|------------------------|----------------------------------------------------|
| Clúster    | Secret file            | `kubeconfig-aula`      | El fichero `kubeconfig-aula` que acabas de generar |
| Registry   | Username with password | `registry-credentials` | Usuario `aula` y contraseña `aula`                 |

Los IDs deben escribirse exactamente así, porque el Jenkinsfile los busca por nombre.

Las UT añaden otras dos credenciales de tipo *Username with password*: `gitea-registry` (UT01, sesión 8), con tu usuario de Gitea y un **token** como contraseña, y `gitea-cred` para el checkout y la publicación (UT01, sesión 9; ver el apartado 11bis.6). El token se crea en Gitea, en tu avatar, **Settings \> Applications \> Generate New Token**, con permisos de lectura y escritura sobre `package` y `repository`.

Docker no tiene usuario ni contraseña propios: esa credencial es el login de un registry. El registry de Minikube no tiene autenticación, así que vale cualquier texto, pero Jenkins no deja la contraseña vacía. Solo harían falta datos reales si publicaras en Docker Hub, con los de tu cuenta de hub.docker.com.

El fichero `kubeconfig-aula` contiene los certificados de acceso al clúster: no lo subas a Git ni lo compartas.

## 8. Preparar el proyecto del laboratorio

El zip `modulo5168-lab.zip` ya trae la estructura que esperan el Jenkinsfile y el Job: todo el código está dentro de la carpeta `lab/` (`Jenkinsfile`, `Jenkinsfile.warmup`, `app/`, `k8s/`, `ansible/` y `scripts/`). Lleva puestos el registry `localhost:5000` y la dirección de la aplicación, así que no hay que editar nada.

**Descomprimir y comprobar**

Ajusta `Descargas` o `Downloads` según el idioma del sistema y hazlo en tu carpeta personal, fuera de cualquier otro repositorio Git:

```
cd ~
unzip ~/Descargas/modulo5168-lab.zip
cd ~/modulo5168-lab
ls lab
grep -n "REGISTRY *=" lab/Jenkinsfile lab/Jenkinsfile.warmup
```

`ls lab` debe mostrar `Jenkinsfile`, `Jenkinsfile.warmup`, `ansible`, `app`, `k8s` y `scripts`, y el `grep` dos líneas con `REGISTRY = "localhost:5000"`.

**Valores que usa el proyecto**

- Registry: `localhost:5000`, con las credenciales `registry-credentials` y `kubeconfig-aula` del paso 7.
- Aplicación: `http://192.168.49.2:30080` (Service NodePort), en la variable `APP_URL` del Jenkinsfile y de los scripts. Si `minikube ip` devuelve otra dirección, cámbiala en `lab/Jenkinsfile` y en los scripts de `lab/scripts`.
- Entorno: staging, salvo en la rama `main` de un Job multibranch, que va a production.
- `lab/k8s/deployment.yaml` lleva marcadores (`REGISTRY/modulo5168-app:IMAGE_TAG` y `REPLICAS`) que sustituye `lab/k8s/render.sh` en cada despliegue, así que no se aplica directamente con `kubectl apply -f`.
- Los comandos del Jenkinsfile necesitan Docker, kubectl, Ansible, `ab` y npm dentro de Jenkins: los trae la imagen `jenkins-lab` (paso 2).

## 9. Subir el proyecto a Gitea

Ejecuta esto desde la carpeta `modulo5168-lab` (la que contiene `lab/`), con el repositorio vacío ya creado en Gitea. Cambia `<tu-usuario>` por tu nombre de usuario de Gitea:

```
cd ~/modulo5168-lab
git init
git config user.name "<tu-usuario>"
git config user.email "<tu-usuario>@aula.local"
git add .
git commit -m "laboratorio modulo 5168"
git remote add origin http://localhost:3000/<tu-usuario>/modulo5168-lab.git
git branch -M main
git push -u origin main
```

Los dos `git config` son necesarios: sin ellos, el commit falla con "Identidad de autor desconocida", no se crea la rama `main` y el push da `src refspec main does not match any`. Vale cualquier correo, es un laboratorio local.

El push pide el **nombre de usuario** de Gitea (no el correo) y su contraseña. Al teclear la contraseña no se ve nada en pantalla, es normal.

**Comprobar**

```
git rev-parse --show-toplevel
git ls-files
```

La primera orden debe devolver la carpeta `modulo5168-lab`, y la segunda debe listar rutas que empiecen por `lab/`. Después recarga la página del repositorio en `http://localhost:3000` y comprueba que aparece la carpeta `lab`.

Si el push da `Failed to authenticate user`, el usuario o la contraseña no son los de Gitea. Prueba a entrar con ellos en la web. Si no recuerdas la contraseña, la tabla de problemas explica cómo restablecerla.

## 10. Crear el Pipeline Job en Jenkins

Se hace desde la web de Jenkins, en `http://localhost:8080`. Empieza con el pipeline reducido (`Jenkinsfile.warmup`), que valida Docker y el registry sin tocar Kubernetes.

1. En el dashboard pulsa **New Item**, escribe el nombre `modulo5168-demo`, elige el tipo **Pipeline** (no Freestyle) y pulsa **OK**.
2. Baja hasta la sección **Pipeline** y rellena los campos de la tabla.
3. Pulsa **Save**.

| Campo            | Valor                                                                                                                                                           |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Definition       | `Pipeline script from SCM`                                                                                                                                      |
| SCM              | `Git`                                                                                                                                                           |
| Repository URL   | `http://gitea:3000/<tu-usuario>/modulo5168-lab.git`                                                                                                             |
| Credentials      | `- none -` si el repositorio es público. Si es privado: **Add \> Jenkins**, tipo *Username with password*, con tu usuario y contraseña de Gitea, y selecciónala |
| Branch Specifier | `*/main` (por defecto viene `*/master`)                                                                                                                         |
| Script Path      | `lab/Jenkinsfile.warmup`                                                                                                                                        |

La URL lleva `gitea` y no `localhost`, porque Jenkins está dentro de un contenedor. El Branch Specifier es el fallo más habitual: si lo dejas en `*/master`, Jenkins no encuentra la rama.

## 11. Ejecutar y verificar

**Primero, el warmup**

1. En la página del Job pulsa **Build Now**.
2. Pulsa el número del build (`#1`) y luego **Console Output** para seguir el progreso.
3. El warmup tiene cuatro etapas: Checkout, Build imagen Docker, Comprobar que la imagen arranca y Push a registry. Debe terminar con `Imagen publicada correctamente` y `Finished: SUCCESS`.

Comprueba que la imagen llegó al registry:

```
curl http://localhost:5000/v2/_catalog
```

Debe responder `{"repositories":["modulo5168-app"]}`.

**Después, el pipeline completo**

1. En el Job pulsa **Configure**, cambia **Script Path** a `lab/Jenkinsfile` y pulsa **Save**.
2. Pulsa **Build Now** y sigue el Console Output.

Al terminar, comprueba el despliegue:

```
kubectl get pods
kubectl get svc modulo5168-app
```

Los pods deben estar en `Running` (los de `modulo5168-app` y los de `redis`). El Service es de tipo NodePort: la aplicación se alcanza por la IP de Minikube, tanto desde el equipo como desde Jenkins.

```
curl http://$(minikube ip):30080/version
docker exec jenkins curl -s http://192.168.49.2:30080/version
```

Debe devolver `{"version":"<número del build>"}`: confirma qué imagen está desplegada.

**Mensajes que parecen errores y no lo son**

- En la etapa de seguridad aparece `trivy: not found`, porque Trivy no está instalado. No rompe el pipeline.
- La etapa de aprobación manual se salta, porque su condición `when { branch 'main' }` solo funciona en pipelines multibranch. En este Job el despliegue sigue directo.

## 11bis. Preparar el laboratorio para las UT2 a UT4

Las UT usan herramientas y rutas que van más allá de los pasos anteriores. El proyecto del paso 8 ya trae la aplicación con `/counter` y `/metrics`, los manifiestos de Redis, el playbook de Ansible, los scripts de validación y un `Jenkinsfile` con las etapas de las cuatro unidades. Aquí quedan las piezas del equipo y de Jenkins.

| UT   | Qué necesita                                                                                                                                                                                                        | Dónde está                                                       |
|------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| UT01 | SonarQube (S2), Apache Bench en el equipo (S6 y S7), registry de Gitea y credencial `gitea-registry` (S8), y en la S9 el plugin SonarQube Scanner, el servidor `sonarqube`, su webhook y la credencial `gitea-cred` | Paso 7 y apartados 1 y 5 de esta sección                         |
| UT2  | Ansible en el equipo (S5 y S6) y en Jenkins (S9), webhook (S3) y Job multibranch (S7)                                                                                                                               | Apartados 1 y 4, apartado 1bis e imagen `jenkins-lab`            |
| UT3  | Redis en el clúster y scripts de validación                                                                                                                                                                         | `lab/k8s/redis-*.yaml` y `lab/scripts/`                          |
| UT4  | `ab` y npm en Jenkins, acceso a la aplicación, rollback y métricas                                                                                                                                                  | Imagen `jenkins-lab`, `lab/k8s/service.yaml` y `lab/Jenkinsfile` |

**1. Herramientas en el equipo del alumno**

Ansible se usa desde el equipo en las sesiones 5 y 6 de la UT2, y Apache Bench en la UT01:

```
sudo apt-get install -y apache2-utils python3-venv
python3 -m venv ~/venv-ansible
~/venv-ansible/bin/pip install ansible
source ~/venv-ansible/bin/activate
ansible --version
```

**2. Cómo se llega a la aplicación**

Los scripts de `lab/scripts` y el Jenkinsfile no usan `localhost:3000`: en el equipo ese puerto es **Gitea**, y dentro de Jenkins `localhost` es el propio Jenkins. La aplicación se publica con un Service NodePort (`lab/k8s/service.yaml`, puerto 30080), accesible por la IP de Minikube desde el equipo y desde Jenkins, que está en la red `minikube`. La dirección se pasa en la variable `APP_URL`. Una vez desplegada la aplicación:

```
export APP_URL=http://$(minikube ip):30080
curl $APP_URL/health
docker exec jenkins curl -s http://192.168.49.2:30080/health
bash lab/scripts/test-funcional.sh
```

En la UT01 las pruebas se hacen contra un contenedor de prueba en tu equipo, publicado en el puerto 3001 (`APP_URL=http://localhost:3001`).

**3. Redis (UT3)**

El nodo de Minikube descarga `redis:7-alpine` de Docker Hub. Si el pod se queda en `ImagePullBackOff` por problemas de red, carga la imagen desde el equipo:

```
docker pull redis:7-alpine
minikube image load redis:7-alpine
```

**4. Job multibranch (UT2, sesión 7)**

La condición `when { branch 'main' }` y la elección entre staging y production según la rama solo funcionan en un Job **multibranch**, no en el Pipeline simple del paso 10.

1. **New Item**, nombre `modulo5168-multibranch`, tipo **Multibranch Pipeline**.
2. En **Branch Sources** elige **Git** y pon la URL `http://gitea:3000/<tu-usuario>/modulo5168-lab.git`, con la credencial de Gitea si el repositorio es privado.
3. En **Build Configuration**, **Script Path**: `lab/Jenkinsfile`.
4. En **Scan Multibranch Pipeline Triggers** marca **Periodically if not otherwise run**, con un intervalo de 1 minuto.
5. **Save**. Jenkins crea un job por cada rama del repositorio. Para la sesión 8 de la UT01, que publica al empujar un tag \`vX.Y.Z\`, instala además el plugin \*\*Basic Branch Build Strategies\*\* y, en el job, añade el comportamiento \*\*Discover tags\*\* y las estrategias de construcción \*\*Regular branches\*\* y \*\*Tags\*\*: sin ellas, Jenkins descubre los tags pero no los construye.

El webhook del apartado 1bis no dispara este tipo de Job: el escaneo periódico es la opción segura.

**5. Dos registries**

La UT01 (sesión 8) publica las versiones en el registry de Gitea (`localhost:3000/<usuario>/modulo5168-app`, credencial `gitea-registry`). El despliegue en Minikube de las UT2 a UT4 usa el registry del paso 6 (`localhost:5000`, credencial `registry-credentials`). Son dos registries independientes: conviene explicarlo al alumnado. Las sesiones 5 y 8 de la UT01, si el alumno todavía no tiene Minikube, usan un registry temporal en el puerto 5001: el 5000 está reservado para el del laboratorio y no debe ocuparse con otro `registry:2`.

**6. SonarQube dentro de Jenkins (UT01, sesión 9)**

La práctica integradora lanza el análisis con `withSonarQubeEnv('sonarqube')` y espera el resultado con `waitForQualityGate`. El servidor SonarQube se levanta en la sesión 2, en la red `lab5168`. En Jenkins hay que preparar tres cosas, y no se instala `sonar-scanner` en la imagen, porque el Jenkinsfile de la solución lo ejecuta como contenedor con `--volumes-from jenkins`:

1. **Plugin.** En **Manage Jenkins \> Plugins \> Available plugins** instala **SonarQube Scanner**.
2. **Servidor.** En SonarQube, **My Account \> Security**, genera un token. En Jenkins, crea una credencial de tipo **Secret text** con ese token (ID `sonar-token`). Después, en **Manage Jenkins \> System \> SonarQube servers**, añade un servidor con **Name** `sonarqube`, **Server URL** `http://sonarqube:9000` y esa credencial. El nombre tiene que ser exactamente `sonarqube`, porque el Jenkinsfile lo busca así.
3. **Webhook de vuelta.** En SonarQube, **Administration \> Configuration \> Webhooks \> Create**, con URL `http://jenkins:8080/sonarqube-webhook/`. Sin él, `waitForQualityGate` se queda esperando.

La sesión 9 también necesita la credencial `gitea-cred` (Username with password: tu usuario de Gitea y un token). Sirve para el checkout y para subir la imagen y el tag.

Este apartado está escrito a partir de la solución docente de la sesión 9 y no se ha probado en un laboratorio completo.

## 12. Después de reiniciar el equipo

Tras apagar y encender el ordenador, Docker, Gitea, Jenkins y el reenvío del registry vuelven a arrancar solos, porque se crearon con `--restart unless-stopped`. Minikube no: hay que arrancarlo a mano.

1. Espera a que Docker esté listo y arranca el clúster:

```
minikube start
```

1. Comprueba que el clúster responde y que Jenkins ocupa su IP fija, no la de Minikube:

```
kubectl get nodes
docker network inspect minikube --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
```

Debe salir `minikube 192.168.49.2/24` y `jenkins 192.168.49.10/24`.

1. Comprueba el registry y Jenkins. Jenkins tarda uno o dos minutos en responder:

```
curl http://localhost:5000/v2/_catalog
curl -sI http://localhost:8080 | head -1
```

Un `403` o un `302` en Jenkins es correcto: significa que responde y te pide iniciar sesión.

**Si** `minikube start` **falla con** `Address already in use`

Jenkins se ha quedado con la IP `192.168.49.2`. Libérala, arranca Minikube y vuelve a conectar Jenkins con su IP fija:

```
docker network disconnect minikube jenkins
minikube start
docker network connect --ip 192.168.49.10 minikube jenkins
```

**Si Jenkins o Gitea no han arrancado**

```
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker start jenkins
```

Si un contenedor se creó sin reinicio automático, actívalo sin recrearlo con `docker update --restart unless-stopped jenkins` (o `gitea`, o `registry-fwd`).

## 13. Solución de problemas comunes

| Síntoma                                                                            | Causa probable                                                                                     | Solución                                                                                                                                                                                       |
|------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `permission denied ... docker.sock` en Jenkins                                     | El contenedor se creó sin `--group-add`, o el GID del grupo `docker` no coincide con el del equipo | Recrear Jenkins con el comando del paso 2. Apaño temporal: `sudo chmod 666 /var/run/docker.sock`                                                                                               |
| Jenkins en estado `Exited (5)` y la web no carga                                   | Permisos del volumen `jenkins_home` alterados (por ejemplo, por un `docker exec -u root`)          | `docker run --rm -u root -v jenkins_home:/var/jenkins_home jenkins/jenkins:lts chown -R 1000:1000 /var/jenkins_home` y después `docker start jenkins`                                          |
| Gitea abre tras reiniciar el equipo pero Jenkins no                                | Jenkins se creó sin reinicio automático                                                            | `docker update --restart unless-stopped jenkins` y `docker start jenkins`                                                                                                                      |
| `minikube start` falla con `Address already in use`                                | Jenkins ocupa la IP 192.168.49.2 de Minikube                                                       | Rutina de la sección 12: desconectar Jenkins, arrancar Minikube y reconectar con `--ip 192.168.49.10`                                                                                          |
| `EAI_AGAIN` o `Temporary failure resolving` en `npm install`, `apt-get` o un build | La red bloquea el DNS público que Docker usa por defecto                                           | Fijar el DNS en `/etc/docker/daemon.json` (paso 1)                                                                                                                                             |
| `kubectl` da error de sintaxis con `<?xml`                                         | La descarga usó una URL sin versión (comando partido en dos líneas) y guardó un fichero de error   | Borrar `kubectl` y repetir en dos pasos con la variable `VERSION` (paso 5). Verificar con `file kubectl`                                                                                       |
| `kubectl: executable file not found` dentro de Jenkins                             | Se usa la imagen oficial, que no incluye `kubectl`                                                 | Usar la imagen `jenkins-lab` (paso 2)                                                                                                                                                          |
| Credentials Binding no sale en Available plugins                                   | Ya está instalado, y ese buscador solo muestra los que faltan                                      | Buscarlo en Installed plugins (paso 4)                                                                                                                                                         |
| `No such container: jenkin`                                                        | Errata en el nombre                                                                                | El contenedor se llama `jenkins`, con la `s` final                                                                                                                                             |
| `error loading config file ... permission denied` al probar el kubeconfig          | `docker cp` deja el fichero con propietario root                                                   | `docker exec -u root jenkins chown jenkins:jenkins /tmp/kubeconfig-aula`                                                                                                                       |
| El kubeconfig tiene `DATA+OMITTED` o falla con certificados                        | Se generó sin `--raw`                                                                              | Regenerarlo con `kubectl config view --raw --flatten --minify` (paso 7)                                                                                                                        |
| Timeout hacia `192.168.49.2:8443`                                                  | Jenkins no está en la red de Minikube                                                              | `docker network connect --ip 192.168.49.10 minikube jenkins` (paso 5)                                                                                                                          |
| `No such file or directory` en el kubeconfig del pipeline                          | La credencial `kubeconfig-aula` no apunta a un fichero válido                                      | Revisar en Manage Jenkins \> Credentials que el fichero subido es el correcto y no está vacío                                                                                                  |
| `Failed to connect to localhost port 3000` al clonar                               | En la URL del Job se puso `localhost`                                                              | Usar `http://gitea:3000/<usuario>/<repo>.git`                                                                                                                                                  |
| `Could not resolve host: gitea`                                                    | Jenkins o Gitea no están en la red `lab5168`                                                       | `docker network connect lab5168 jenkins` (o `gitea`)                                                                                                                                           |
| `couldn't find remote ref refs/heads/master`                                       | El Branch Specifier del Job es `*/master`                                                          | Cambiarlo a `*/main`                                                                                                                                                                           |
| El build no encuentra `lab/app` o el Script Path                                   | El proyecto se subió sin la carpeta `lab/`                                                         | Usar el proyecto del zip, que ya trae todo dentro de `lab/` (paso 8), y volver a hacer push                                                                                                    |
| `git commit` dice "Identidad de autor desconocida"                                 | Falta `user.name` y `user.email`                                                                   | Los dos `git config` del paso 9, después `git commit` y `git push`                                                                                                                             |
| `Failed to authenticate user` en `git push`                                        | Usuario o contraseña de Gitea incorrectos                                                          | Probar el acceso en la web. Para restablecer la contraseña: `docker exec -u git gitea gitea admin user change-password --username <usuario> --password '<nueva>' --must-change-password=false` |
| El warmup falla en "Comprobar que la imagen arranca"                               | El `curl` a `localhost:3001` se hacía desde dentro de Jenkins                                      | Usar el zip actual del laboratorio (paso 8): ya lleva la comprobación corregida                                                                                                                |
| `port is already allocated`                                                        | El puerto 8080, 3000 o 5000 ya está en uso en el equipo                                            | Cambiar el mapeo, por ejemplo `-p 8081:8080`, y acceder por ese puerto                                                                                                                         |
| `ImagePullBackOff` en Kubernetes                                                   | El clúster no descarga la imagen del registry                                                      | Comprobar `curl http://localhost:5000/v2/_catalog`, que el addon está activo (`minikube addons list`) y que `registry-fwd` está en marcha                                                      |
| El webhook no llega a Jenkins (error en Recent Deliveries de Gitea)                | Gitea bloquea webhooks hacia direcciones privadas, o la URL usa `localhost`                        | Arrancar Gitea con `GITEA__webhook__ALLOWED_HOST_LIST=private,loopback` y usar la URL `notifyCommit` del apartado 1bis, con método GET y Poll SCM activado en el Job                           |
| Jenkins pide una contraseña que no recuerdas                                       | No se guardó la contraseña inicial                                                                 | `docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword`                                                                                                                       |

**Problemas específicos de las UT 2 a 4**

| Síntoma                                                                 | Causa probable                                                                                     | Solución                                                                                 |
|-------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| `Ansible requires the locale encoding to be UTF-8`                      | La imagen de Jenkins no define el idioma                                                           | Reconstruir `jenkins-lab` con el Dockerfile actual (paso 2) y recrear el contenedor      |
| `ansible-playbook`, `ab` o `npm`: `command not found` dentro de Jenkins | La imagen de Jenkins es anterior a las UT                                                          | Reconstruir `jenkins-lab` y recrear el contenedor; los datos siguen en `jenkins_home`    |
| Pod de la aplicación en `CreateContainerConfigError`                    | Falta el ConfigMap `modulo5168-config`                                                             | Ejecutar antes el playbook de Ansible (etapa «Configurar entorno»)                       |
| `port is already allocated` al publicar la app de prueba en el 3000     | El puerto 3000 del equipo es el de Gitea                                                           | Publicarla en el 3001: `-p 3001:3000`                                                    |
| `curl: (7) Failed to connect to 192.168.49.2 port 30080`                | La aplicación no está desplegada, el Service no es NodePort o Jenkins no está en la red `minikube` | `kubectl get svc modulo5168-app` debe mostrar el puerto 30080; revisar la red del paso 5 |
| Pod de Redis en `ImagePullBackOff`                                      | El nodo no puede descargar de Docker Hub                                                           | `minikube image load redis:7-alpine` (apartado 11bis.3)                                  |
| La etapa «Validar instalación» falla con «no se puede conectar a Redis» | Redis parado o todavía no listo                                                                    | `kubectl get pods -l app=redis` y esperar a `Ready`                                      |
| El build de la imagen falla en `npm ci`                                 | Falta `package-lock.json` en `lab/app`                                                             | Usar el zip del laboratorio, que lo incluye                                              |

## Checklist rápido del orden de instalación

1. Docker, red `lab5168` y DNS de Docker comprobado.
2. 1bis. Gitea con `--restart unless-stopped`, usuario administrador y repositorio `modulo5168-lab` vacío.
3. Jenkins con imagen propia `jenkins-lab`, `--group-add` y `--restart unless-stopped`.
4. Comprobación de `docker ps` y `kubectl` dentro de Jenkins.
5. Plugins: Docker Pipeline, Kubernetes CLI y Credentials Binding.
6. Minikube, `kubectl` en el equipo y Jenkins en la red `minikube` con IP fija `192.168.49.10`.
7. Registry de Minikube y reenvío del puerto 5000 con `registry-fwd`.
8. Credenciales en Jenkins: `kubeconfig-aula` (con `--raw`) y `registry-credentials`.
9. Proyecto con la carpeta `lab/`, `REGISTRY` en `localhost:5000` y warmup corregido (todo viene ya en el zip).
10. Push a Gitea con identidad de Git configurada.
11. Job `modulo5168-demo` con rama `*/main`, primero con `lab/Jenkinsfile.warmup`.
12. **Build Now**, después con `lab/Jenkinsfile`, y comprobación con `kubectl get pods`.

---

[← Inicio del módulo](../) · [UT01](../ut01/)
{% endraw %}
