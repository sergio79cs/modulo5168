# UT01 · Del código al artefacto: construcción del paquete de software

En despliegue continuo, lo que llega a la rama principal acaba en producción sin
que nadie lo revise a mano. Para que eso sea posible, todo lo que ocurre entre que
se escribe el código y se publica la versión tiene que estar automatizado y ser
fiable: cómo se integra el código, cómo se comprueba su calidad, cómo se empaqueta,
cómo se prueba y cómo se le pone número de versión.

En esta unidad construiremos esa cadena pieza a pieza. Cada sesión añade un
eslabón y, en la última, los encadenaremos todos en un único pipeline de Jenkins.
Al terminar, tendrás un paquete de software completo, probado y publicado en un
registro, listo para que las siguientes unidades lo desplieguen.

## Resultado de aprendizaje

**RA1** · Crea el paquete de software que se va a desplegar, utilizando la versión
estable del código fuente, según las necesidades de uso, directivas de calidad y
seguridad digital, facilitando su despliegue y permitiendo la trazabilidad del sistema.

Cada sesión trabaja uno de sus criterios de evaluación:

| Criterio | En resumen | Sesión |
|:---:|---|:---:|
| a | Obtener el código de la rama de trabajo con procesos de acceso y trazabilidad definidos | 1 |
| b | Validar la calidad y la seguridad del código con herramientas de análisis | 2 |
| c | Crear el paquete de software con herramientas de versionado y entornos | 3 y 4 |
| d | Comprobar que el paquete incluye la versión anterior y los scripts de instalación y de ajuste de datos | 5 |
| e | Comprobar que el paquete incluye pruebas funcionales y no funcionales | 6 |
| f | Almacenar los resultados de las pruebas para reutilizarlos y compararlos | 7 |
| g | Almacenar el paquete en un repositorio para su reutilización y seguimiento | 8 |

## El laboratorio y la aplicación

La [guía de instalación del laboratorio](../laboratorio/) explica cómo montar todo el entorno
y trae el proyecto de ejemplo para descargar. Consúltala si algo no arranca.

Todo el trabajo se hace **en tu propio ordenador**, sin servidor compartido.
Iremos añadiendo contenedores a una misma red de Docker (`lab5168`) para que
se encuentren entre sí por su nombre:

| Herramienta | Para qué la usamos | Desde |
|---|---|:---:|
| Docker | Ejecutar todo el laboratorio y construir las imágenes de la aplicación | Sesión 1 |
| Gitea | Servidor Git local y, más adelante, registro de imágenes | Sesión 1 |
| SonarQube | Análisis estático de la calidad del código | Sesión 2 |
| Apache Bench | Pruebas de carga | Sesión 6 |
| Jenkins | Automatizar todo el proceso en un pipeline | Sesión 8 |

A lo largo de la unidad trabajaremos siempre con **la misma aplicación**, una API
sencilla en Node.js con Express. La irás versionando (v1.0.0, v1.1.0, v1.1.1…),
así que al final tendrás un historial real con varias versiones que comparar.

## Sesiones

### Sesión 1 · Git avanzado · RA1.a
Git es la pieza central del despliegue continuo: todo el pipeline se dispara a
partir de lo que ocurre en el repositorio. Veremos estrategias de ramas (Git Flow,
GitHub Flow y trunk-based), la diferencia entre merge y rebase, cómo resolver
conflictos y cómo etiquetar versiones. También aprenderás a escribir commits
convencionales, que permiten calcular automáticamente la siguiente versión.
Se hacen tres prácticas: ramas y etiquetas, un conflicto real en pareja resuelto
con rebase y un ejercicio de commits convencionales.

📄 [Ir a la sesión 1](sesion1.md)

### Sesión 2 · Calidad de código · RA1.b
Si nadie revisa el código antes de publicarlo, las comprobaciones de calidad
también tienen que ser automáticas. Instalarás SonarQube, analizarás la aplicación
e interpretarás lo que detecta: bugs, vulnerabilidades, code smells y security
hotspots. Aprenderás a decidir con criterio qué se corrige y qué se acepta, y
crearás un Quality Gate propio: la puerta que más adelante detendrá el pipeline
si el código no cumple unos mínimos.

📄 [Ir a la sesión 2](sesion2.md)

### Sesión 3 · Docker I: imágenes, contenedores y caché de capas · RA1.c
Un contenedor empaqueta la aplicación con todo lo que necesita, de modo que lo que
se prueba es exactamente lo que se despliega. Aprenderás qué son las imágenes, los
contenedores, las capas y los registros. Escribirás un Dockerfile y medirás cómo
el orden de las instrucciones cambia el tiempo de construcción gracias a la caché.
Terminarás con una imagen que no se ejecuta como root y que comprueba su propia
salud con HEALTHCHECK.

📄 [Ir a la sesión 3](sesion3.md)

### Sesión 4 · Docker II: builds multietapa · RA1.c
Para construir y probar una aplicación hacen falta muchas herramientas, pero para
ejecutarla solo el runtime y las dependencias de producción. Con los builds
multietapa separarás las dos cosas. Compararás una imagen de una sola etapa con
una multietapa midiendo tamaño, capas y tiempo, y comprobarás por qué una imagen
más pequeña se sube antes, se despliega antes y es más segura.

📄 [Ir a la sesión 4](sesion4.md)

### Sesión 5 · Comprobación del paquete · RA1.d
Desplegar no es solo publicar una imagen nueva. Un paquete completo debe permitir
instalar la versión nueva, adaptar los datos existentes y volver atrás si algo
falla. Montarás un registro local, escribirás `install.sh` y `migrate-data.sh`, y
harás un ensayo completo: actualizar a la versión nueva y revertir a la anterior
sin perder datos.

📄 [Ir a la sesión 5](sesion5.md)

### Sesión 6 · Pruebas funcionales y no funcionales · RA1.e
Para el pipeline, una prueba es un proceso que termina bien (código de salida 0)
o mal (cualquier otro). Escribirás una prueba funcional que comprueba que la
aplicación hace lo que debe y una prueba de carga con Apache Bench que mide cómo
se comporta con muchas peticiones. Después provocarás fallos a propósito para ver
cómo cada prueba actúa como puerta de calidad.

📄 [Ir a la sesión 6](sesion6.md)

### Sesión 7 · Almacenamiento de resultados de pruebas · RA1.f
Un resultado que no se guarda solo dice si algo funciona hoy; uno guardado permite
comparar versiones y detectar empeoramientos. Guardarás los resultados de las
pruebas de carga junto con su contexto (versión, commit, fecha y parámetros),
los compararás entre versiones con un umbral de tolerancia y tomarás una decisión
justificada: ¿se publica esta versión o no? Incluye una versión con una regresión
de rendimiento introducida a propósito para que la detectes.

📄 [Ir a la sesión 7](sesion7.md)

### Sesión 8 · Versionado semántico y registro · RA1.g
La versión la decide una persona al crear la etiqueta de Git; todo lo demás lo hace
el pipeline. Aplicarás MAYOR.MENOR.PARCHE a cambios reales, distinguirás las
etiquetas fijas de las móviles (`1.1.0` frente a `1.1`, `1` o `latest`) y
publicarás la imagen en el registro de Gitea. Terminarás automatizando la
publicación con un pipeline de Jenkins que solo publica cuando se sube una
etiqueta con formato `vX.Y.Z`.

📄 [Ir a la sesión 8](sesion8.md) · [Jenkinsfile de la sesión](sesion8/Jenkinsfile)

### Sesión 9 · Práctica integradora · RA1.a–g
No hay contenido nuevo: se trata de encadenar todo lo aprendido. Construirás, sobre
tu propio repositorio, un pipeline de Jenkins con una etapa por criterio, desde
obtener el código hasta publicar la versión en el registro:

`a · Checkout → b · Calidad → c · Imagen multietapa → d · Versión anterior y scripts → e · Pruebas → f · Resultados → g · Publicar`

📄 [Ir a la sesión 9](sesion9.md)

## Cómo se evalúa

Cada sesión termina con un **entregable** (capturas, scripts, tablas de resultados
o ficheros en el repositorio) asociado a su criterio del RA1. Se valora que
funcione, pero también la justificación de las decisiones: por qué se acepta un
issue, qué versión corresponde a un cambio o si una versión es apta para
publicarse. La práctica integradora de la sesión 9 recoge todos los criterios en
un único pipeline.

## Antes de empezar

- Git y Node.js instalados.
- Docker instalado y funcionando (`docker version` responde con cliente y servidor).
- Al menos 4 GB de RAM asignados a Docker, porque SonarQube los necesita a partir de la sesión 2.
- En Linux, `vm.max_map_count` ajustado para SonarQube (se explica en la sesión 2).
- Jenkins no hace falta hasta la sesión 8; se monta en ese momento.
