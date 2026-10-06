[Índice de la UT01](./) · [Sesión 2 →](sesion2.md)

# Módulo 5168 Definición de flujos de procesos de despliegue continuo · Sesión 1 — Git avanzado

**Objetivo.** Al terminar, sabrás trabajar con ramas siguiendo una estrategia definida, integrar cambios con merge y rebase, resolver conflictos y etiquetar versiones. También sabrás escribir commits que permitan calcular automáticamente la siguiente versión del software. Es la base sobre la que se construirá el pipeline de integración y despliegue continuo del módulo.

**Entorno de trabajo.** Todo el laboratorio del módulo se monta en local, en tu ordenador: Docker, Gitea, Jenkins y Kubernetes. En esta sesión solo se usa Gitea como servidor Git.

### Preparación previa: Gitea en local

Debe estar hecha antes de la sesión. Requisitos: Git, Node.js y Docker instalados.

**1. Arrancar Gitea en un contenedor.**

```
docker network create lab5168   # solo la primera vez

docker run -d --name gitea \
  -p 3000:3000 -p 2222:22 \
  -v gitea_data:/data \
  --network lab5168 \
  -e GITEA__webhook__ALLOWED_HOST_LIST=private,loopback \
  --restart unless-stopped \
  gitea/gitea:latest
```

Son los mismos comandos del paso 1bis de la guía de instalación del laboratorio. El volumen `gitea_data` conserva los repositorios, aunque se borre el contenedor, y la red `lab5168` permitirá más adelante que Jenkins encuentre a Gitea por su nombre. La variable `ALLOWED_HOST_LIST` no se usa hoy: deja preparado el envío de webhooks a Jenkins, que Gitea bloquea por defecto hacia direcciones locales y privadas.

**2. Completar el asistente inicial.**

Abre `http://localhost:3000`. Elige **SQLite3** como base de datos, deja el resto de los valores por defecto y crea la cuenta de administrador en el apartado final. Comprueba que la rama por defecto de los repositorios nuevos es `main`.

**3. Configurar la identidad en Git**, si no está hecha:

```
git config --global user.name "Nombre Apellido"
git config --global user.email "correo@ejemplo.com"
git config --global init.defaultBranch main
```

## 3.1 Teoría

### Por qué Git es la pieza central del despliegue continuo

En un flujo de despliegue continuo, casi todo empieza en el repositorio. Cuando alguien hace `push` o se fusiona una Pull Request, el servidor de integración continua (en nuestro caso, Jenkins) detecta el cambio. Descarga el código, lo compila, ejecuta las pruebas y, si todo va bien, lo despliega.

Por eso el repositorio es la **única fuente de verdad**: lo que hay en la rama principal es lo que acabará en producción. No basta con saber hacer `add`, `commit` y `push`. Hay que decidir cómo se organiza el trabajo en ramas, cómo se integran los cambios sin romper nada, cómo se marca qué versión está desplegada y cómo se describen los cambios para que una máquina pueda interpretarlos.

### Qué es realmente una rama

Una rama en Git no es una copia del código: es un **puntero móvil a un commit**. Al crear una rama, Git solo crea una pequeña etiqueta que apunta al commit actual. Cada nuevo commit en esa rama hace avanzar el puntero, por eso crear ramas es instantáneo y barato.

El puntero especial `HEAD` indica en qué rama (o commit) estás situado. Con `git checkout feature/x` (o su equivalente moderno `git switch feature/x`) cambias a dónde apunta `HEAD`. Git actualiza entonces los ficheros de tu directorio de trabajo para que coincidan con ese commit.

### Tipos de rama habituales

- `main` (en repositorios antiguos, `master`): contiene el código que está, o puede estar en cualquier momento, en producción. Debe estar siempre en estado desplegable: compila, pasa las pruebas y funciona. Nadie trabaja directamente sobre ella; los cambios llegan mediante fusiones revisadas.
- `feature/<nombre>`: desarrollo aislado de una funcionalidad concreta, por ejemplo `feature/login-google`. Se crea desde la rama principal y, al terminar, se propone su integración mediante una **Pull Request** (GitHub) o **Merge Request** (GitLab). Así otra persona revisa el código y el CI ejecuta las pruebas antes de fusionar.
- `release/<versión>`: estabilización de una versión antes de publicarla, por ejemplo, `release/2.3.0`. En ella solo se corrigen errores menores y se ajusta documentación, mientras el resto del equipo sigue desarrollando.
- `hotfix/<nombre>`: corrección urgente sobre lo que ya está en producción, por ejemplo, `hotfix/error-pago-nulo`. Se crea desde `main` (o desde la etiqueta desplegada), se publica una versión de parche y el arreglo se lleva también a las ramas de desarrollo.

Los prefijos con barra (`feature/`, `hotfix/`…) no son obligatorios para Git, pero son una convención muy extendida. Permiten ver de un vistazo el propósito de cada rama. Además, muchos sistemas de CI aplican comportamientos distintos según el prefijo, por ejemplo, desplegar automáticamente solo las ramas `release/*`.

### Estrategias de branching

Una estrategia de branching es el acuerdo del equipo sobre qué ramas existen, cuánto duran y cómo fluyen los cambios entre ellas. No hay una correcta en abstracto: depende del proyecto y de la frecuencia de despliegue.

**Git Flow** es la más estructurada. Además de `main`, mantiene una rama permanente `develop` donde se integra el trabajo diario. Las `feature` salen de `develop` y vuelven a ella. Para publicar, se crea una `release` desde `develop`, se estabiliza y se fusiona tanto en `main` (etiquetando la versión) como de vuelta en `develop`. Los `hotfix` salen de `main` y se fusionan en ambas.

Git Flow encaja con software de versiones planificadas: aplicaciones de escritorio, apps móviles que pasan revisión de la tienda o productos con varias versiones mantenidas. Su inconveniente es que las ramas viven mucho, las fusiones se vuelven grandes y conflictivas, y el código tarda en llegar a producción. Es justo lo contrario de lo que busca el despliegue continuo.

**GitHub Flow** simplifica lo anterior. Solo existe `main` y ramas de funcionalidad de vida corta. Cada cambio va en una rama, se abre una Pull Request, se revisa, el CI valida y, tras fusionar a `main`, se despliega. Funciona muy bien para aplicaciones web con un único entorno de producción.

**Trunk-based development** lleva la idea al extremo. Todo el equipo integra en `main` (el "tronco") con mucha frecuencia, al menos una vez al día, y las ramas duran horas o uno o dos días. Para integrar código aún no terminado sin que el usuario lo vea se usan **feature flags**: interruptores de configuración que activan o desactivan una funcionalidad. Es la estrategia que mejor encaja con el despliegue continuo, pero exige disciplina y una batería de pruebas automáticas fiable.

|                              | Git Flow                   | GitHub Flow      | Trunk-based                                 |
|------------------------------|----------------------------|------------------|---------------------------------------------|
| Ramas permanentes            | `main` y `develop`         | `main`           | `main`                                      |
| Vida de las ramas de trabajo | Semanas                    | Días             | Horas o 1-2 días                            |
| Frecuencia de despliegue     | Por versiones planificadas | Tras cada fusión | Varias veces al día                         |
| Complejidad                  | Alta                       | Baja             | Baja en ramas, alta en disciplina y pruebas |
| Encaje con CD                | Bajo                       | Bueno            | Muy bueno                                   |

### Merge frente a rebase

Cuando una rama de funcionalidad está lista, hay que incorporar sus cambios a `main`. Hay dos formas de hacerlo. Supongamos que creamos `feature` desde el commit B y hicimos D y E, mientras alguien añadía C a `main`:

```
          D---E   feature
         /
    A---B---C     main
```

`git merge` une las dos historias con un nuevo **commit de fusión** (M) que tiene dos padres. El historial conserva exactamente lo que pasó: hubo trabajo en paralelo y en un momento se juntó.

```
          D---E
         /     \
    A---B---C---M   main
```

Si la rama destino no ha avanzado (no existe C), Git hace un *fast-forward*: mueve el puntero de `main` hacia delante sin crear commit de fusión, y la rama "desaparece" del historial. Con `--no-ff` obligamos a crear siempre el commit de fusión. Así queda constancia de que esos commits formaron parte de una funcionalidad concreta; es la opción de la práctica 1.

`git rebase` toma los commits de tu rama y los vuelve a aplicar uno a uno encima del último commit de la rama destino. Es como si hubieras empezado a trabajar a partir de ahí:

```
              D'--E'   feature
             /
    A---B---C          main
```

El historial queda lineal y es más fácil de leer. Pero D' y E' **no son** los commits originales: tienen el mismo contenido, pero distinto padre y distinto identificador (hash). Rebase **reescribe la historia**.

**Regla de oro:** nunca hagas rebase de commits que ya has compartido y sobre los que otras personas pueden estar trabajando. Si otra persona tiene D y E y tú los sustituyes por D' y E', los historiales divergen. El uso seguro es hacer rebase de tu propia rama sobre `main` para ponerla al día antes de abrir la Pull Request.

Si la rama ya estaba subida al remoto, tras un rebase Git rechazará un `push` normal porque el historial no coincide. Hay que forzarlo con `git push --force-with-lease`, la versión segura de `--force`. Solo sobrescribe si nadie más ha subido cambios a esa rama desde tu última descarga.

### Resolución de conflictos

Git combina automáticamente cambios de dos ramas siempre que afecten a partes distintas de los ficheros. El conflicto aparece cuando **ambas ramas modifican las mismas líneas de forma diferente**, o una borra un fichero que la otra modifica. Git no puede saber qué versión es la buena, así que se detiene y pide que decida una persona. Marca el fichero así:

```
<<<<<<< HEAD
  res.end(`Bienvenido, ${nombre}\n`);
=======
  res.end(`Buenos días, ${nombre}\n`);
>>>>>>> feat: saludo con buenos días
```

Entre `<<<<<<<` y `=======` está una versión; entre `=======` y `>>>>>>>`, la otra. Atención: en un **merge**, `HEAD` es tu rama actual. En un **rebase**, `HEAD` es la rama sobre la que rebasas (por ejemplo `origin/main`) y la parte inferior son tus commits.

Para resolverlo, edita el fichero, deja el código como debe quedar (una versión, la otra o una combinación) y **borra todas las marcas**. Después indica que está resuelto con `git add` y continúa con `git merge --continue` o `git rebase --continue`. Si se complica, `git merge --abort` o `git rebase --abort` devuelven al estado anterior.

Los conflictos no se eliminan, pero se reducen mucho con ramas cortas, integraciones frecuentes y comunicación en el equipo. Es uno de los argumentos a favor del trunk-based development.

### Etiquetas (tags) y versionado semántico

Una **etiqueta** es un nombre fijo asociado a un commit concreto, normalmente para marcar una versión publicada (`v1.0.0`, `v1.1.0`…). A diferencia de una rama, no se mueve. Las etiquetas ligeras son solo un nombre; las **anotadas** (`git tag -a`) guardan además autor, fecha y mensaje, y son las que se usan para versiones. Muchos pipelines de despliegue se disparan al crear una etiqueta.

El formato de versión más extendido es el **versionado semántico (SemVer)**: `MAYOR.MENOR.PARCHE`, por ejemplo `2.4.1`.

- **PARCHE**: se corrigen errores sin cambiar el comportamiento esperado.
- **MENOR**: se añade funcionalidad nueva que no rompe nada existente.
- **MAYOR**: cambio incompatible, que obliga a quien use el software a modificar su código o su forma de usarlo.

Al subir un número, los de su derecha vuelven a cero: de `1.4.7` con una funcionalidad nueva se pasa a `1.5.0`.

### Commits convencionales

La especificación **Conventional Commits** define un formato de mensaje legible para personas y herramientas:

```
<tipo>(<ámbito opcional>): <descripción breve>

<cuerpo opcional>

<pie opcional>
```

Ejemplos: `feat(api): añade endpoint de búsqueda por nombre` o `fix: evita error cuando el parámetro nombre está vacío`.

| Tipo       | Significado                                 | Efecto en la versión |
|------------|---------------------------------------------|----------------------|
| `feat`     | Nueva funcionalidad                         | Sube MENOR           |
| `fix`      | Corrección de un error                      | Sube PARCHE          |
| `docs`     | Solo documentación                          | Ninguno              |
| `style`    | Formato, espacios… sin cambiar lógica       | Ninguno              |
| `refactor` | Reestructura sin cambiar comportamiento     | Ninguno              |
| `test`     | Añade o corrige pruebas                     | Ninguno              |
| `chore`    | Mantenimiento (dependencias, configuración) | Ninguno              |
| `ci`       | Cambios en la configuración del pipeline    | Ninguno              |

Un **cambio incompatible** se indica con `!` tras el tipo (`feat!: elimina el endpoint /v1/saludo`) o con `BREAKING CHANGE: <explicación>` en el pie. Cualquiera de las dos formas sube la versión MAYOR, sea cual sea el tipo.

¿Por qué importa en despliegue continuo? Si los mensajes siguen el formato, herramientas como *semantic-release* leen los commits desde la última etiqueta y calculan la siguiente versión. También generan el `CHANGELOG` y crean la etiqueta, todo dentro del pipeline. Con varios commits manda el de mayor impacto: un `fix` y un `feat` suben la MENOR.

## 3.2 Práctica 1 — Ramas, merge y tags

**Objetivo:** crear una rama de funcionalidad, fusionarla en `main` conservando la traza de la rama, etiquetar la nueva versión y subir todo al repositorio remoto.

### Preparación

En tu Gitea local (`http://localhost:3000`), crea un repositorio nuevo con el botón **+ → Nuevo repositorio**, por ejemplo `saludo-app`. Déjalo vacío: sin README, sin .gitignore ni licencia. Después, clónalo:

```
git clone http://localhost:3000/<tu-usuario>/saludo-app.git
cd saludo-app
```

Git avisará de que el repositorio está vacío; es normal. Al hacer el primer `push` pedirá tu usuario y contraseña de Gitea.

**Cómo crear los ficheros del laboratorio.** Usa Visual Studio Code: abre la carpeta del proyecto (File \> Open Folder), pulsa New File en el panel lateral y escribe el nombre completo (server.js, package.json, Dockerfile sin extensión). En Linux también puedes usar nano server.js (guardar con Ctrl+O y Enter, salir con Ctrl+X).

No uses el Bloc de notas ni Word: el Bloc de notas añade .txt al nombre y Word cambia las comillas rectas por tipográficas, lo que rompe el package.json y los comandos. Al pegar código desde un documento, comprueba que las comillas son rectas (") y que no se han partido líneas.

Los scripts .sh deben guardarse con finales de línea LF, no CRLF: en VS Code se cambia en la barra de abajo, donde pone CRLF. Con ls (o dir en Windows) comprueba que el fichero se llama exactamente como debe.

Dentro de la carpeta, crea el fichero `server.js`: un servidor web mínimo en Node.js, sin dependencias externas.

```
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Hola, mundo\n');
});

server.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
```

Comprueba que funciona con `PORT=3001 node server.js` y abriendo `http://localhost:3001` en el navegador (en PowerShell: $env:PORT=3001; node server.js). El puerto 3000 ya lo usa Gitea, por eso la aplicación se ejecuta en el 3001. Para pararla, Ctrl+C. Después, haz el commit inicial y marca la primera versión:

```
git add server.js
git commit -m "feat: servidor HTTP básico"
git tag -a v1.0.0 -m "Primera versión"
git push origin main --tags
```

### Paso 1. Crear la rama de funcionalidad

```
git checkout -b feature/saludo-personalizado
```

La opción `-b` crea la rama y te sitúa en ella en un solo paso (equivale a `git switch -c`). Compruébalo con `git branch`: la rama activa aparece marcada con un asterisco.

### Paso 2. Implementar la funcionalidad

Modifica el servidor para que salude por el nombre recibido en la URL, por ejemplo `http://localhost:3001/?nombre=Ana`:

```
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const nombre = url.searchParams.get('nombre') || 'mundo';
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Hola, ${nombre}\n`);
});
```

Prueba que funciona con y sin el parámetro antes de hacer commit. Es un buen hábito: no se sube lo que no se ha probado.

### Paso 3. Hacer commit en la rama

```
git add server.js
git commit -m "feat: saludo personalizado por query param"
```

El mensaje ya sigue el formato de commits convencionales.

### Paso 4. Volver a main y fusionar

```
git checkout main
git merge --no-ff feature/saludo-personalizado
```

Como `main` no ha avanzado, Git podría hacer un *fast-forward*. Con `--no-ff` le obligamos a crear un commit de fusión, de modo que el historial muestra que el cambio vino de una rama de funcionalidad. Git abrirá el editor para el mensaje de fusión; puedes dejar el que propone.

### Paso 5. Etiquetar y publicar

```
git tag -a v1.1.0 -m "Añade saludo personalizado"
git push origin main --tags
```

Hemos añadido funcionalidad sin romper nada, así que según SemVer se pasa de `1.0.0` a `1.1.0`. Ojo: `git push` por defecto **no sube las etiquetas**, por eso se añade `--tags`.

### Paso 6. Visualizar el resultado

```
git log --oneline --graph --all
```

Deberías ver algo parecido a esto (los identificadores cambiarán):

```
*   8c1f2e3 (HEAD -> main, tag: v1.1.0, origin/main) Merge branch 'feature/saludo-personalizado'
|\
| * 4b7a9d0 (feature/saludo-personalizado) feat: saludo personalizado por query param
|/
* 1e5c3a2 (tag: v1.0.0) feat: servidor HTTP básico
```

**Entregable:** captura de la salida de `git log --oneline --graph --all` donde se vean la rama, el commit de fusión y las dos etiquetas.

**Para pensar:** ¿qué habría mostrado el log sin `--no-ff`? Si hay tiempo, repítelo en otra rama sin esa opción y compara.

## 3.3 Práctica 2 — Conflictos y rebase

**Objetivo:** provocar un conflicto real entre dos personas, resolverlo durante un rebase y entender cómo queda el historial.

### Preparación: dos variantes

Cada persona tiene su propio Gitea en local, así que la pareja necesita un remoto común para que el conflicto sea real. Hay dos variantes: usa la A si la red del aula permite conectar los equipos entre sí y, si no, la B.

**Variante A — En parejas, con el Gitea de uno de los dos.** La persona A comparte su Gitea y la persona B trabaja contra él por la red del aula.

1. A averigua la IP de su ordenador (`hostname -I` en Linux, `ipconfig` en Windows).
2. B abre `http://<IP-de-A>:3000` en su navegador y se registra en ese Gitea.
3. A añade a B como colaboradora con permiso de escritura: repositorio → *Configuración → Colaboradores*.
4. B clona escribiendo la IP a mano: `git clone http://<IP-de-A>:3000/<usuario-A>/saludo-app.git`. Los enlaces de clonado que muestra la web dirán `localhost`, porque así está configurado el Gitea de A; a B no le sirven.

Requisitos: la red del aula debe permitir conexiones entre equipos y el cortafuegos del ordenador de A debe dejar pasar el puerto 3000.

**Variante B — Individual, simulando a dos personas.** Clona tu propio repositorio dos veces, en carpetas distintas, y da a cada copia una identidad diferente:

```
git clone http://localhost:3000/<tu-usuario>/saludo-app.git persona-a
git clone http://localhost:3000/<tu-usuario>/saludo-app.git persona-b
git -C persona-a config user.name "Persona A"
git -C persona-b config user.name "Persona B"
```

En los pasos siguientes, "persona A" y "persona B" son esas dos carpetas: se cambia de carpeta en lugar de cambiar de compañero. El conflicto y el rebase son idénticos; solo se pierde la coordinación con otra persona.

### Paso 1. Cada persona crea su rama desde el mismo main

```
# Persona A
git checkout -b feature/saludo-bienvenida

# Persona B
git checkout -b feature/saludo-buenos-dias
```

### Paso 2. Ambas modifican la misma línea

Las dos editan la línea del `res.end(...)` en `server.js`. La persona A cambia "Hola" por "Bienvenido"; la persona B, por "Buenos días". Cada una hace su commit:

```
# Persona A
git commit -am "feat: saludo de bienvenida"

# Persona B
git commit -am "feat: saludo con buenos días"
```

### Paso 3. La persona A integra primero

Sube su rama, abre una Pull Request y la fusiona en `main`. Para ir más rápido en clase, también puede fusionar en local y subir `main`. Desde ese momento, `main` en el remoto contiene "Bienvenido".

### Paso 4. La persona B se pone al día con rebase

```
git fetch origin
git rebase origin/main
```

`git fetch` descarga los cambios del remoto sin tocar tu trabajo. `git rebase origin/main` intenta reaplicar tu commit encima del `main` actualizado. Como ambas modificaron la misma línea, Git se detendrá con un mensaje como `CONFLICT (content): Merge conflict in server.js`. Con `git status` verás el fichero marcado como *both modified*.

### Paso 5. Resolver el conflicto

Abre `server.js` y localiza las marcas `<<<<<<<`, `=======` y `>>>>>>>`. En un rebase, la parte de arriba (`HEAD`) es lo que ya está en `main` (el cambio de tu compañero) y la de abajo es tu commit.

La pareja debe **decidir juntos** cómo queda: una versión, la otra o una combinación (por ejemplo, "Buenos días" por la mañana y "Bienvenido" el resto del día). Edita el fichero, elimina todas las marcas y comprueba que el servidor arranca.

### Paso 6. Marcar como resuelto y continuar

```
git add server.js
git rebase --continue
```

Si os perdéis, `git rebase --abort` devuelve la rama al estado anterior al rebase y podéis empezar de nuevo.

### Paso 7. Subir la rama

Si la persona B no había subido antes su rama, basta con `git push origin feature/saludo-buenos-dias`. Si ya la había subido, el push será rechazado porque el rebase ha reescrito el commit. En ese caso:

```
git push --force-with-lease origin feature/saludo-buenos-dias
```

Después, abrir la Pull Request y fusionarla.

**Entregable:** captura del fichero con las marcas de conflicto antes de resolverlo, captura de `git log --oneline --graph --all` al terminar y dos o tres líneas explicando qué decidisteis y por qué.

**Para pensar:** comparad el historial con el de la práctica 1. ¿Por qué aquí no aparece ninguna bifurcación? ¿Qué habría pasado si la persona B hubiera hecho rebase sobre una rama en la que también trabajaba la persona A?

## 3.4 Práctica 3 — Commits convencionales

**Objetivo:** escribir commits siguiendo la especificación y razonar qué versión semántica resultaría.

Partiendo del estado actual (última etiqueta `v1.1.0`), haz cuatro cambios pequeños, cada uno en su propio commit con el tipo adecuado. Propuesta:

```
git commit -am "feat: añade endpoint /hora que devuelve la hora del servidor"
git commit -am "fix: codifica correctamente nombres con tildes en el saludo"
git commit -am "chore: añade .gitignore para node_modules"
git commit -am "docs: añade README con instrucciones de arranque"
```

Cada commit debe ir precedido del cambio real en el código. Para `chore` y `docs` recuerda hacer `git add` del fichero nuevo: `-a` solo incluye ficheros que Git ya conoce.

Después, revisad en grupo qué ha pasado desde la última versión:

```
git log v1.1.0..HEAD --oneline
```

### Cuestiones para discutir

1. ¿Qué versión corresponde al conjunto de los cuatro commits? *(Respuesta esperada:* `v1.2.0`*. El* `feat` *sube la MENOR y pone el PARCHE a cero; el* `fix` *queda incluido;* `chore` *y* `docs` *no afectan.)*
2. ¿Y si solo hubiera habido el `fix`, el `chore` y el `docs`? *(*`v1.1.1`*.)*
3. ¿Y si el `feat` hubiera sido `feat!: el saludo pasa a devolver JSON en lugar de texto`? *(*`v2.0.0`*: cualquier cliente que leyera texto plano dejaría de funcionar.)*
4. ¿Qué ventaja tiene que el pipeline pueda calcular esto solo, sin que nadie lo decida?

Para terminar, etiquetad la versión acordada y subidla con `git push origin main --tags`.

## 3.5 Debate final

**Planteamiento:** durante el curso construiremos un pipeline de despliegue continuo con Jenkins, Docker y Kubernetes, sobre una aplicación desarrollada en pequeños equipos. ¿Qué estrategia de branching elegiríais para ese proyecto y por qué?

**Dinámica propuesta:** tres grupos; cada uno defiende una estrategia y, después, todos intentan llegar a un acuerdo común.

### Preguntas guía

1. ¿Cuántas personas trabajarán en el mismo repositorio y con qué frecuencia queremos desplegar?
2. ¿Necesitamos mantener varias versiones en producción a la vez, o solo existe "la versión actual"?
3. ¿Qué pasa con una rama de funcionalidad que vive dos semanas mientras `main` sigue avanzando? Relacionadlo con la práctica 2.
4. Si integramos a `main` varias veces al día, ¿qué necesitamos para que eso no rompa producción?
5. ¿Cómo encaja cada estrategia con un pipeline que despliega automáticamente cada vez que cambia `main`?

### Conclusión orientativa

Para un equipo pequeño, con un único entorno de producción y un pipeline que despliega tras cada fusión, lo razonable es **GitHub Flow**: ramas cortas y Pull Requests validadas por el CI. A medida que la batería de pruebas sea fiable, se puede evolucionar hacia **trunk-based**. Git Flow aporta estructura, pero sus ramas largas van en contra del objetivo del módulo.

Lo importante no es que todos lleguen a la misma respuesta, sino que la justifiquen con criterios: tamaño del equipo, frecuencia de despliegue, necesidad de mantener versiones y madurez de las pruebas.

## Errores frecuentes

| Error                                                                | Consecuencia                                                 | Cómo evitarlo                                                                    |
|----------------------------------------------------------------------|--------------------------------------------------------------|----------------------------------------------------------------------------------|
| Hacer commits directamente en `main` sin darse cuenta                | Cambios sin revisar en la rama desplegable                   | Comprobar la rama con `git branch` o `git status` antes de empezar               |
| Olvidar `--tags` al hacer push                                       | Las etiquetas quedan en local y el pipeline no las ve        | `git push origin main --tags`                                                    |
| Dejar marcas `<<<<<<<` en el código tras resolver                    | Se sube un fichero roto                                      | Buscar las marcas antes del `git add` y arrancar la aplicación                   |
| Usar `git push --force` en lugar de `--force-with-lease`             | Se pueden borrar commits de un compañero                     | Usar siempre `--force-with-lease`                                                |
| Mensajes como "cambios" o "arreglo"                                  | Imposible automatizar el versionado ni entender el historial | Seguir Conventional Commits                                                      |
| Clonar el Gitea del compañero con la URL de `localhost` (variante A) | `Connection refused`: se busca Gitea en el propio equipo     | Escribir la IP del compañero: `http://<IP-de-A>:3000/...`                        |
| No poder abrir `http://<IP-de-A>:3000` (variante A)                  | La pareja no puede compartir remoto                          | Revisar el cortafuegos de A; si la red del aula lo impide, pasar a la variante B |
| Usar el usuario del Gitea propio al hacer push contra el de A        | `Authentication failed`                                      | B debe registrarse en el Gitea de A y usar esas credenciales                     |
| El contenedor de Gitea parado tras reiniciar el equipo               | `Failed to connect to localhost port 3000`                   | `docker start gitea` (o arrancarlo con `--restart unless-stopped`)               |

---

[Índice de la UT01](./) · [Sesión 2 →](sesion2.md)
