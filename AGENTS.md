# AGENTS.md — ARES, reparto de encomiendas de Dashund
App que suple al pioneta: ayuda a un conductor de Arica a ubicar direcciones, armar la mejor ruta,
contactar al receptor y registrar cada entrega, y le deja al jefe los conteos para calcular el pago.
La prioridad es entregar más en menos tiempo, con pocos toques.

## Ahora: dejar la app lista para un día real (dueño, 2026-11-09)
**La tarea fundamental de ahora es dejar la aplicación lista para probarla en un día real, sin que
ninguna feature deje tirado al conductor.**
- Se pule lo que el conductor usa en los seis pasos del flujo (abajo): que cada paso funcione de
  punta a punta en la APK, sin señal, sin cupo de un proveedor y con guías y etiquetas reales.
- Lo que no tiene que ver con el día real está postergado (`specs/README.md`, «Después del día
  real»). No se empieza ni se retoma sin que el dueño lo pida; un detalle que aparece y no afecta el
  día real se anota ahí y no se hace.
- Una feature que no alcanza a quedar firme no va a medias: se le muestra al dueño para decidir si
  se apaga ese día.
- Lo que falta, incluido lo que le toca al dueño, está en `specs/README.md`, «Preparar el día real».

## El flujo del conductor
Es lo más importante del proyecto: todo cambio en la app del conductor se mide contra este flujo.

1. **Cargar la guía.** El conductor saca 3 o 4 fotos de su guía de despacho, según cuántos
   paquetes traiga. Con eso la app sabe la OF y la dirección de cada pedido, y los ubica.
2. **Intentar resolver los ⚠ de la guía.** Una OF que no se puede identificar o una dirección en
   duda (sin ubicar, o una calle que existe en dos o más lugares) se intenta resolver **antes** de
   armar la ruta: el conductor elige el lugar o llama al receptor (el teléfono se consulta en
   Infologistic). Si no se resuelve, por ejemplo porque no contesta, la ruta se arma igual y el
   pedido sigue con ⚠ (ver "Pedidos con problemas").
3. **Armar la ruta,** con los criterios de "Rutas" (bultos, km, tiempo, éxito por parada y
   ganancia).
4. **Cargar el auto.** Para ordenar los paquetes en el auto según la ruta, el conductor pasa por
   todas las etiquetas, así que ahí se escanea cada paquete. El código de barras dice en qué parada
   va («PARADA n de N»), y la etiqueta completa el nombre, el teléfono y el POR PAGAR. Los ⚠ del
   escaneo se resuelven ahí mismo. La ruta es la misma con la que se carga el auto.
5. **Recorrer.** Con el auto cargado, cada pedido tiene todos sus datos para subir el éxito por
   parada. Google Maps guía con la burbuja de ARES encima; al acercarse a un pendiente, se llama
   con un toque, y cada parada se cierra como entregada o no entregada.
6. **Cerrar el día.** Se muestra la lista de no entregados, se borran los datos del día y al jefe
   le llegan los conteos.

## Stack y estructura
Next.js 16.4 (App Router) + Supabase, publicado en Vercel. Node.js 24. Dos experiencias que no
comparten layout: el panel del jefe (escritorio) y la app del conductor (APK Android o PWA).

- **Este Next.js no es el de tu entrenamiento**: lee la guía en `node_modules/next/dist/docs/`
  antes de escribir código. El middleware se llama Proxy (`src/proxy.ts`).
- TypeScript estricto, React 19, Tailwind 4 (`cn()` de `lib/comun/utils`), íconos `lucide-react`.
- Supabase: Postgres + RLS + `pg_cron`, un solo proyecto (gratis; se pausa si queda inactivo).
  Migraciones `supabase/migrations/0001–0008` (la 0008, de la spec 004, todavía no corre en
  Supabase); la siguiente es la 0009.
- Teléfono: IndexedDB `dashund-encomiendas` v6 (la siguiente versión libre es la v7). Mapa:
  MapLibre + OpenFreeMap.
- APK: Capacitor 8, paquete `cl.dashund.ares`. Abre `https://proyecto-ares-five.vercel.app/conductor`,
  así que cada deploy le llega solo. Lo nativo está en `android/` (plugins `Telefono`, `Burbuja` y
  `EscanerVivo`, ML Kit) y la web lo usa solo a través de `src/lib/nativo/`.
- Proveedores: OpenRouteService (matriz y trazado), Google Geocoding (número de casa) y OSM/Nominatim
  (calles y lugares),
  ML Kit en el teléfono (la etiqueta) y Google Cloud Vision (texto de la guía), Anthropic (guía y
  direcciones sin ubicar) y Meta WhatsApp (en pausa). Mapbox salió en la spec 019. Las variables
  están en `.env.example`.
- Pruebas con `node:test`, sin framework (`pruebas/`). Servidor MCP de datos geo en `mcp/`
  (registrado en `.mcp.json`).
- **Todo lo que falta desarrollar** está en `specs/`, una carpeta por feature. El
  índice, el próximo número y cómo se trabaja por ramas están en su `README.md`. Spec Kit: la
  constitución está en `.specify/memory/constitution.md` (v1.4.0). Prioridad: el día real (arriba);
  el panel y los pagos van después.

```text
src/
├── proxy.ts                    # sesión de Supabase por request
├── app/(app)/                  # panel: encomiendas, conductores, configuración
├── app/(conductor)/            # app del conductor: conductor/encomiendas (pantalla.tsx + _componentes, _hooks, _mapa) · diagnostico · tema-dashund
├── app/api/                    # whatsapp · lectura (IA) · texto (Vision) · geocodificar (Google) · direccion-ia
├── components/                 # ui (sin dominio) · direccion · panel · marca (logo Dashund)
├── lib/                        # una carpeta por dominio, sin archivos sueltos
│   ├── encomiendas/            # catálogos, estados, pago, paquete, lectura/ · local/ = el teléfono (almacen/, idb, generar-ruta/, planificar…)
│   ├── geo/                    # coordenada, trazado, matriz (ORS), ors/, geocoding/, direccion-ia/, plus-code
│   ├── rutas/orden-paradas/    # optimizador del orden de paradas
│   ├── nativo/                 # única puerta a la APK, con respaldo web
│   └── auth/ · supabase/ · comun/ · whatsapp/ · conductores/
└── types/db.ts                 # esquema Postgres (`Database`)
android/ · capacitor/ · capacitor.config.ts   # la APK
supabase/migrations/            # SQL re-ejecutable; cada una termina en un select de verificación
pruebas/ · mcp/ · scripts/ · specs/ · docs/
```

## Documentos: cuándo leer cada uno
Este archivo alcanza para la mayoría de las tareas. Los demás no se leen siempre: solo cuando la
tarea toca lo que cubren, y solo la parte que hace falta. La excepción es `MEMORY.md`, que se lee al
empezar.

| Documento | Leerlo cuando la tarea… |
|---|---|
| `MEMORY.md` | empieza (estado del proyecto y decisiones recientes) |
| `docs/ARQUITECTURA.md` | cambia un límite del sistema, una tabla, un store, una ruta de API, un proveedor o una carpeta; o necesita saber cómo viaja un dato (teléfono ↔ servidor ↔ proveedores) o quién accede a qué |
| `docs/CLASES.md` | crea o cambia un tipo, un estado, un módulo o un nombre del dominio; necesita el glosario (§0), los estados (§2), el armado de rutas (§2) o en qué archivo está algo (§4) |
| `docs/HOJA-DE-RUTA.md` | decide qué hacer después, empieza una spec nueva o propone cambiar el algoritmo de rutas (ahí está lo que ya se midió y se descartó) |
| `docs/PRIVACIDAD.md` | agrega o cambia un proveedor, manda datos de destinatarios fuera del teléfono o toca el borrado (el proveedor se registra ahí; A10 lo verifica) |
| `docs/WHATSAPP.md` | toca los avisos, la plantilla de Meta o `api/whatsapp`, o va a activar WhatsApp |
| `specs/README.md` y la carpeta de la feature | trabaja en una feature o anota una nueva: su `spec.md`, `plan.md` y `tasks.md`, y `quickstart.md` para verificar a mano |
| `.specify/memory/constitution.md` | crea o revisa una spec o un plan (los comandos `/speckit-*` la leen solos) |
| `pruebas/README.md` | escribe o arregla pruebas, o una prueba pasa y el comportamiento real falla (fixtures viejos) |
| `mcp/README.md` | toca el servidor MCP |
| `node_modules/next/dist/docs/` | escribe código de Next.js: solo la guía de lo que se toca (rutas, server actions, Proxy, caché) |

`README.md` es para quien llega al repo en GitHub; el agente no lo necesita.

## Comandos
PowerShell, desde la raíz.

```powershell
npm install
npm run dev              # http://localhost:3000 (antes copia el worker de MapLibre a public/)
npm run build
npm run lint
npm test                 # sin red ni base de datos (~40 s)
npm run test:base        # esquema de encomiendas y cuenta del pago contra la base real (solo lectura)
npm run test:esquema     # cada campo de src/types/db.ts existe en la base
npm run mcp              # servidor MCP geo (stdio)
npm run calles           # regenera el catálogo de calles de Arica desde OSM
npm run sondear          # mide los buscadores de direcciones (gasta 27 consultas de Google y 27 de ORS)
```

Para probar en el teléfono hace falta HTTPS: `npx ngrok http 3000`.

APK en GitHub: tag `apk-v1.2.3` (o Actions → APK → Run workflow); la firma y sus secretos están en
`specs/015-app-android/quickstart.md`. El build local contra el PC (JDK 21, adb, `CAP_SERVER_URL`)
y la depuración están en la skill `apk-local`. Sin `CAP_SERVER_URL`, la APK apunta a producción.

## Skills y hooks
Las skills viven en `.agents/skills/` (las usan Cursor, Copilot y OpenCode) y están enlazadas en
`.claude/skills/`. Claude Code carga cada una sola cuando la tarea lo pide. Git no guarda los
enlaces: en un clon nuevo, `node scripts/enlazar-skills.mjs` los crea.

- Propias, una por tema; cada una trae el porqué de sus reglas, los archivos, las pruebas, lo
  pendiente y los docs que no calzan con el código:
  - `rutas-ares`: armar la ruta y ordenar las paradas.
  - `direcciones-arica`: ubicar las direcciones (Plus Code, buscadores, IA, calles repetidas).
  - `lectura-starken`: la guía de despacho y la etiqueta (código de barras, OF, POR PAGAR).
  - `base-local-idb`: la base del teléfono (stores, versiones, cola, borrado del día).
  - `privacidad-destinatarios`: qué dato va a dónde, y checklists por tipo de cambio.
  - `recorrer-conductor`: verificar una pantalla como el conductor.
  - `apk-local`: compilar e instalar la APK contra el PC.
- De terceros (`skills-lock.json`): `debugging-capacitor`, `capacitor-best-practices`,
  `capacitor-security`, `capacitor-plugin-development`, `safe-area-handling`,
  `property-based-testing`, `verification-before-completion`, `web-design-guidelines`,
  `systematic-debugging`, `grill-me` y `find-skills`. Si una contradice este archivo, manda este
  archivo. Lo que recomiendan y en ARES **no** se hace sin preguntar:
  - Quitar `server.url` de la APK, pasar los datos del día de IndexedDB a SQLite, un CSP estricto
    de `index.html` (ARES es Next.js) o `CapacitorHttp` global (cambia el `fetch` de toda la app).
  - Correr `npx @capgo/...@latest`, instalar plugins `@capgo/*` o usar Capgo Live Updates: es
    código y dependencia de terceros.
  - Agregar `fast-check` u otra dependencia de pruebas: las pruebas son `node:test` sin framework.
  - De `capacitor-plugin-development`, solo sirve la parte de Android: los plugins viven en
    `android/app/src/main/java/cl/dashund/ares/`, el respaldo web en `src/lib/nativo/`, no hay iOS
    ni paquete npm (nunca `npm publish`), y los datos de una llamada no se escriben en el log.
  - Borrar código de `MainActivity` o tocar `capacitor.config.ts`/`android/` por las barras del
    sistema (`safe-area-handling`): primero medir en el teléfono.
- Hook `.claude/hooks/revisar-commit.mjs` (en `.claude/settings.json`): antes de cada `git commit`
  busca teléfonos, RUT, correos, `.env`, claves y fotos, y pide confirmación si encuentra algo. Las
  direcciones no las detecta: hay que mirarlas en el diff.

## Ramas y publicación
- `main` es producción: Vercel publica cada push (proyecto `proyecto-ares`) y la APK lo carga.
  Solo entra lo terminado y verificado.
- Cada feature se desarrolla en su propia rama, creada desde `main` y con el nombre de su carpeta
  en `specs/` (`021-lector-etiquetas`). Vuelve a `main` cuando pasa la verificación
  y el dueño lo aprueba. La feature se anota en `main` antes de empezar, y el índice se edita solo
  ahí. Los pasos están en `specs/README.md`.
- Cada rama genera un preview en Vercel (detrás del login de Vercel), para probar antes de pasar a
  `main`.
- `respaldo-mapbox` guarda la última versión con Mapbox. En ella no se trabaja.
- Publicar con el día del conductor cerrado y la cola enviada: un cambio en la base del teléfono
  puede borrar lo que tenga guardado.
- CLI de Vercel: `npx --yes vercel@latest …`, sobre una copia hecha con `git archive HEAD` para que
  `.env.local` no se suba.

## Convenciones
- Idioma: español de Chile. Textos visibles, comentarios, identificadores y nombres de archivo en
  español (`tarjeta-parada.tsx`, `ubicarDireccion`, `STORES_DEL_DIA`).
- Glosario único para código, pantalla y docs (`docs/CLASES.md` §0): `Pedido`, `Ruta`, `Parada`
  (solo en pantalla), `DiaTrabajo`, `ActividadPorEnviar`/`Actividad`, `PagoDelDia`. Se dice
  **conductor** y **día de trabajo**. No se usa "hub". Las tablas de la base tienen sus propios
  nombres (`encomienda_jornadas` = `DiaTrabajo`…); la equivalencia está en `docs/ARQUITECTURA.md` §2.
- No hay Prettier; ESLint de Next (`npm run lint`). Sangría de 2 espacios, comillas dobles, punto y
  coma y el alias `@/`.
- Archivos en kebab-case, componentes exportados en PascalCase (`export function TarjetaParada`) y
  hooks en `use-*.ts`. Las carpetas privadas de una ruta son `_componentes/`, `_hooks/` y `_mapa/`.
  `pantalla.tsx` solo une piezas.
- Los comentarios explican el porqué y citan la spec que lo pidió ("spec 017, N4"), no el qué.
- Capas (`pruebas/arquitectura.test.mjs`, A1–A10):
  - `app → components → lib`: `lib` no importa de `app` ni de `components`, y `components/ui` no
    lleva lógica de dominio.
  - Solo `almacen/` toca `idb`, y solo `lib/nativo/` importa `@capacitor/*`.
  - Un módulo que lee un secreto lleva `import "server-only"`. `lib/encomiendas/local/` no se
    importa desde el servidor.
  - Toda consulta a Supabase va tipada con `Database`, sin casts.
  - Un archivo de más de ~400 líneas se divide al tocarlo.
- Diseño del conductor, «Plano» (`tema-dashund.css`; solo lo carga el layout del conductor):
  - Colores: naranja Dashund `#d4531a` en el mapa y `#c4491a` en los botones con texto blanco
    (para cumplir AA), con neutros cálidos.
  - Tipografía: Manrope, más IBM Plex Mono solo para OF, km y horas.
  - Ningún estado depende solo del color.
  - Nada de degradados, neón, Inter/Roboto ni tarjetas con franja lateral.
- Las pantallas no llevan instrucciones: solo estados, datos y botones. El cómo se usa va en una o
  dos líneas de `_componentes/ayuda.tsx`. Si cambia el nombre de un botón, se cambia también la
  Ayuda.
- Docs y specs concisos: viñetas, y lo que vive en otro documento se enlaza en vez de repetirse.

## Reglas de dominio / trampas conocidas
Los principios están en `.specify/memory/constitution.md`. Esta lista es lo que el código ya decidió
y un agente no debe "corregir".

- **Contexto.** La empresa es **Dashund**: 1 conductor y 1 mandante (Starken, con envíos de Mercado
  Libre), en Arica, con unos 100 destinos al día. Los pedidos llegan en la guía de despacho de
  Infologistic, que no tiene API (no volver a preguntarlo). El nombre, el teléfono y el POR PAGAR
  vienen en la etiqueta; el teléfono también se puede consultar a mano en Infologistic.
- **Datos de destinatarios.** Nombre, teléfono, dirección, OF y fotos viven solo en el teléfono y
  se borran al cerrar el día. Al servidor sube solo el hecho (`encomienda_actividad`).
  - Nunca van al servidor, a los logs ni al repo (comentarios, commits, docs o pruebas). Las
    pruebas usan calles reales con números y nombres inventados.
  - **Lo que identifica a la persona no sale del teléfono** (dueño, 2026-11-07): el nombre, el
    teléfono y la foto de la etiqueta se leen con ML Kit, sin IA ni Cloud Vision (spec 021). La
    guía sí va a la IA, porque no trae datos personales: solo la OF y el destino, sin nombre ni
    teléfono. No se le suman campos de la etiqueta a nada que salga del teléfono.
  - **Excepción, el aviso de WhatsApp** (dueño, 2026-11-09; spec 004): con WhatsApp activo, el
    nombre, el teléfono y la dirección van a Meta para pedirle al receptor que confirme su
    dirección, y lo que contesta pasa por el servidor hasta que el teléfono lo baja. No se amplía
    a otros datos ni a otros proveedores.
  - Un store nuevo con esos datos se registra en `STORES_DEL_DIA`.
  - Un error de red nunca borra, y la `cola` no se toca.
- **Proveedores y ley.** Todo proveedor que reciba datos de destinatarios figura en
  `docs/PRIVACIDAD.md` (lo verifica A10). Dashund es encargado de Starken (Ley 21.719). Lo legal se
  cierra antes del lanzamiento oficial y no frena el desarrollo.
- **Un pedido es de un solo día**, sin arrastre. Lo no entregado se tacha y, si vuelve a salir, se
  escanea de nuevo. No se diseña nada en torno a arrastrar pedidos.
- **Resultado.** Es entregado o no entregado, **sin motivo** (spec 012), y no se reintroducen
  motivos sin preguntar.
  - Dejar el paquete con un vecino o el conserje cuenta como entregado.
  - "Dejar como pendiente" manda la parada al final de la ruta.
  - La disponibilidad (lo que dice el receptor) y el resultado son dimensiones separadas.
- **OF.** Se acepta cualquiera que tenga dígitos, del largo que sea: hay OF de distintos largos y
  valen si están en el paquete o en la orden de flete, así que no llevan ⚠ (dueño, 2026-11-06). Se
  quitan los ceros a la izquierda, para que la del código de barras (9 posiciones, con ceros) calce
  con la de la guía. En el paquete no se escribe nada; la parada muestra la OF y su descripción.
- **Pedidos con problemas (⚠).** Se marcan con ⚠ desde el momento en que aparecen, y se resuelven
  en ese mismo paso del flujo:
  - **Al leer la guía, antes de armar la ruta:** una línea sin OF (ilegible), y una dirección sin ubicar o con una calle que existe en dos o más
    lugares (ver "Direcciones en Arica"). Si no se resuelve, el pedido entra igual a la ruta, con
    la primera dirección que encontró la búsqueda y con ⚠. La app avisa **dos paradas antes** de
    llegar a él, para confirmar antes de gastar combustible y tiempo en ir.
  - **Al armar la ruta:** una parada muy lejos de las demás, o que no alcanza su horario.
  - **Al escanear:** una dirección de la etiqueta distinta de la de la guía; un paquete que no
    está en la guía (se agrega como pedido); y bultos o paquetes de la guía sin escanear (si no
    vienen en el auto, quedan en «No entregados» al cerrar el día y vuelven a Starken).
  - Los ⚠ quedan en el pedido (`Pedido.problemas`, spec 022) y se resuelven arriba de su
    formulario: elegir el lugar entre las opciones guardadas (sin volver a buscar), «Va igual»
    (lejana, horario), «Es así» (fuera de la guía) o qué dirección vale. El aviso dos paradas antes
    va en la cabecera de ARES y en la línea de aviso de la burbuja (solo se ve abierta).
  - Una dirección sin ninguna opción de lugar sigue fuera de la ruta: no hay punto adonde ir.
- **Escaneo de la etiqueta de Starken (spec 005).** Tiene dos partes que no se mezclan: el código
  de barras dice *qué paquete es* y la foto de la etiqueta dice *a quién va*. Se escanea al cargar
  el auto y también desde la parada, cuando le falta el teléfono.
  - **Escáner en vivo (spec 028, APK 1.6.0).** Al cargar el auto, la cámara de ARES queda abierta
    debajo de la pantalla y lee el código y el texto de cada etiqueta con ML Kit, sin toques ni red.
    Un dato vale cuando sale igual en ≥ 2 cuadros (`votos.ts`) y al pedido va solo lo firme. Suena
    un tic que sube por cada dato firme, el de pedido leído al quedar completa y dos notas que bajan
    con un ⚠, que pausa la lectura ahí mismo (sonidos «Marimba», elegidos por el dueño). Desde la
    parada sigue la foto.
  - **Código de barras.** Con una APK anterior, o sin permiso de cámara, lo lee el escáner de
    Google, que se abre solo al entrar; fuera de la APK se escribe la OF. Es un Code 128 de 26 dígitos que empieza con 92: los dígitos 15 a
    23 son la OF y los 24 a 26, el bulto. Cualquier otro número se toma como una OF escrita a mano.
  - La OF sale solo del código o de lo que escribe el conductor, nunca del texto ni de la IA: es la
    llave que une la etiqueta, el pedido y la parada, y un dígito mal leído enlazaría otro paquete.
  - Si la OF está en el día, se muestra «PARADA n de N» (o «SIN RUTA TODAVÍA») y la descripción
    del paquete en lo más grande, y se suma el bulto («Bultos: 1 de 2»). Funciona sin señal.
    Escanear dos veces el mismo bulto no lo duplica: el código trae su número y es la misma caja.
  - **La OF escrita a mano** (código dañado) suma un bulto cada vez que se escribe, con el primer
    número libre, y cuenta para «Cargar el auto». Si después se lee la etiqueta de esa caja (foto o
    texto) con su número, ese número reemplaza al provisorio. Más bultos escaneados que los que se
    sabían suben el total del envío (dueño, spec 027).
  - Si la OF no está en el día: «Este paquete no está en los pedidos de hoy» y el botón «Agregarlo
    como pedido».
  - Al cargar el auto, un contador muestra los escaneados sobre el total. Los de la guía que quedan
    sin escanear son los que faltan, y hay que avisarle a Starken.
  - **Foto de la etiqueta.** Completa el destinatario, el teléfono (+569), el POR PAGAR con su monto
    (nunca se supone $0; un «$0» impreso sin POR PAGAR sí es «no se cobra», dueño 2026-11-08). La lee ML Kit en el teléfono, sin IA ni red (spec 021), así que el botón
    está solo en la APK; fuera de ella se pega el texto. **Manda la precisión sobre la rapidez**
    (dueño, 2026-11-08): se lee dos veces, a 2400 y 1600 px; lo que no coincide queda por revisar, y
    la dirección se compara con la guía solo si se lee clara («DIRECCIÓN: …» en su renglón). La descripción del paquete se elige con
    tres toques (tipo, tamaño y color).
    El lector (`lectura/etiqueta/`) separa la zona del destinatario de la del remitente y no cruza
    renglones; un formato nuevo se suma en `formatos.ts` con su caso de prueba, sacado con
    Diagnóstico → «Probar etiqueta» → «Copiar anonimizado».
    *Pendiente:* ~50 etiquetas reales en terreno (spec 005, T030).
  - Si la foto trae una OF distinta de la del código, no se usa: es la etiqueta de otro paquete. Lo
    ya cargado no se pisa, salvo con una foto cuya OF coincide con la del código.
  - Si la dirección de la etiqueta no coincide con la de la guía, no se cambia sola: se avisa y el
    conductor elige cuál vale.
  - No se extrae RUT, remitente, correo ni cuenta corriente. La foto queda como foto del paquete,
    solo en el teléfono.
- **Pago.** Se calcula en Postgres (`private.encomienda_congelar_dia()`), y `lib/encomiendas/pago.ts`
  es una copia para la vista previa. Las dos se tocan juntas y se corre `npm run test:base`. Cada
  día guarda su tarifa, así que cambiar la regla no mueve los días anteriores.
- **Rutas.** Se evalúan por cinco criterios: sacar los bultos del móvil lo más rápido posible,
  kilómetros recorridos, tiempo de ruta, porcentaje de éxito por parada y ganancia en la logística.
  - Manda el costo en plata, con zonas y horarios (dueño, 2026-11-08; `generar-ruta/pesos.ts`): el
    km a $130 (bencina) y la hora al volante a $6.000. El tiempo viene en la misma matriz de ORS.
    Medido en 3 días simulados de 80 paradas: −1,5 % de tiempo y −1 % de plata, sin km de más.
  - Encima, los bultos salen antes solo si cuesta ≤ 1 % de km (y de costo) y cada metro de más los
    saca, en promedio, al menos un metro antes (dueño, 2026-11-07; `orden-paradas/descarga.ts`).
    Medido: la más corta ya descarga casi lo más rápido posible, y sin tope de km se gana ≤ 10–15 %
    por +10–15 % de km. Los bultos salen del código de barras (o se van contando por OF); sin
    escanear, cada pedido vale uno.
  - El éxito por parada no entra al costo (dueño, 2026-11-08): los horarios y los confirmados van
    en su propia propuesta, como antes.
  - La ruta es cerrada: vuelve a la central.
  - Cada zona se recorre una sola vez (`generar-ruta/zonas.ts`, zonas de 900 m).
  - No se da la vuelta en pasajes ni en calles residenciales.
  - Con un solo conductor, sectorizar (k-means, HSAC) alarga la ruta entre 4 % y 20 %, y el orden
    ya está en el óptimo práctico: no proponer ALNS, Tabu ni colonias de hormigas. Lo que mejora la
    ruta es ubicar bien las direcciones.
  - Se muestra una propuesta por defecto, y hasta tres solo si difieren de verdad.
  - El conductor puede hacer la propuesta al revés («Invertir orden de ruta», spec 024). Al revés
    suele medir más (sentidos únicos): la pantalla dice cuánto, y no se vuelve a optimizar.
  - Antes de tocar la ruta: skill `rutas-ares` (qué se midió, dónde está cada cosa, cómo medir).
- **Navegación (spec 020).** ARES muestra la ruta y maneja las paradas, pero **no guía**. En cada
  parada muestra las que quedan cerca, por si hay un pedido pendiente o una entrega agendada que la
  app no sabe (spec 023): «N cerca», al lado de «Centrar», con las pendientes a ≤ 300 m en
  línea recta, sin las 2 que siguen y hasta 3, marcadas en el mapa; «Ahora» deja una como la próxima. Guía la
  app Google Maps, con la burbuja de ARES encima, ligada al pedido abierto y siempre con el botón
  "Navegar". El Navigation SDK y la navegación propia de ARES (cartel y voz) se fueron.
  - Al cerrar una parada, Google Maps arranca derecho a la siguiente: se abre limpiando su tarea,
    porque si no pregunta «¿Salir de la navegación?» y, sin respuesta, sigue a la parada cerrada
    (`GoogleMaps.java`, APK 1.6.1).
  - **Llamadas.** Se marcan solas (con el permiso de llamadas; sin él, el marcador) y quedan de
    fondo: con la llamada en curso vuelve adelante ARES o, desde la burbuja, Google Maps
    (`TrasLlamar.java`, dueño 2026-11-09).
- **Plata.** El dueño no puede pagar sorpresas.
  - Mapbox sale entero y no se vuelve a proponer.
  - Todo servicio de pago lleva una cuota que lo deje en US$0. Google Geocoding tiene tope diario,
    y Cloud Vision está apagada en la clave (se usa ML Kit).
  - ORS es gratis: 500 consultas de matriz al día. Sin cupo contesta 429, o un 403 que el navegador
    ve como un corte: si ARES contesta, la app lo toma como cupo y no como «Sin señal» (spec 024).
    La ruta sigue en línea recta con aviso. Diagnóstico cuenta las consultas del día.
- **WhatsApp.** Queda en pausa hasta que el dueño tenga el chip y el token de Meta
  (`WHATSAPP_EN_PAUSA`). Sin las variables, la app funciona sin avisos (spec 013); no se empuja
  trabajo de WhatsApp. En Meta, el orden de los botones (Sí, estaré · Mañana · Otro horario) es el
  del payload y no se cambia. Desde la spec 004 el aviso pide confirmar la dirección con un
  formulario (Flow, `docs/WHATSAPP.md`); el de disponibilidad queda en el código, sin pedirse.
- **Direcciones en Arica.** Muchas casas no tienen numeración confiable, y hay calles que se llaman
  igual en distintos sectores de la ciudad.
  - **Plus Code primero.** Es la "dirección" que Google Maps saca de las coordenadas
    (`XXXX+XX Arica`, un cuadrado de ~14 m). Se resuelve sin red ni proveedor
    (`lib/geo/plus-code.ts`), y se guarda el código completo, que no depende de la ciudad.
  - Una dirección que calza en más de un lugar se marca con ⚠ y se intenta resolver antes de armar
    la ruta. Si no se resuelve, entra con la primera dirección encontrada, sin perder el ⚠ (ver
    "Pedidos con problemas").
  - **Referencias.** Muchos pedidos traen, además de la dirección, una referencia para encontrar la
    casa: «calle X con calle Y», «frente a…», «al lado de…». La dirección real es la que lleva la
    numeración; lo demás es referencia. Para ubicar el pedido se usa solo la calle con su número
    (los buscadores y también la IA de la spec 018), y la referencia queda en el pedido para el
    conductor. *Pendiente:* la limpieza de la consulta (`geocoding/consulta.ts`) no quita las
    referencias con «con», y a la IA no se le dice esta regla (spec 025).
- **Proveedores de direcciones.** Cambian sin avisar, y un fixture viejo pasa en verde igual. Si las
  direcciones fallan, primero se mide con `npm run sondear` (avisando lo que gasta) y después se
  toca código.
- **APK.** Solo hace falta reinstalarla si cambia `android/`; en ese caso se sube
  `APK_VERSION_MINIMA` en Vercel. La clave de firma (`*.keystore`) no va al repo: una APK firmada
  con otra clave no se instala encima.
  - El `server.url` de producción en `capacitor.config.ts` y el service worker son a propósito: la
    app es Next.js con servidor y no se puede empaquetar. Las skills de Capacitor los marcan como
    error; no se quitan.
- **Base.** No se cambian nombres de tablas o columnas, ni se borran columnas, sin aprobación: el
  teléfono puede estar corriendo código anterior. El nombre de la base IndexedDB tampoco se
  cambia, porque dejaría huérfanos los datos.
- **MCP.** En stdio, stdout es el canal del protocolo; para depurar se usa `console.error`.
- **`npm audit`.** Las 5 altas de `braces` están aceptadas (solo afectan al lint). No se corre
  `npm audit fix --force`, porque baja a Next 14.

## Forma de trabajar
- Cada propuesta o cambio de estructura va con la estructura de datos (tablas de Postgres y stores
  de IndexedDB) y el diagrama del sistema, marcando dónde los docs no coinciden con el código: el
  dueño valida la arquitectura antes de aprobar.
- En cambios de diseño, mostrar primero la forma más barata en tokens que represente la idea (una
  maqueta o una comparación lado a lado), para que la confirme o la descarte.
- En cambios de código, explicar por qué se hizo lo que se hizo.
- Se implementa el gesto real del conductor en terreno (cámara en mano, de a una foto), no un atajo
  equivalente. Antes de cerrar, recorrerlo como él: qué botón, en qué orden, con la cámara o con la
  galería.
- Spec Kit: no se generan checklists. Una feature terminada se borra de `specs/` y
  su resumen pasa a `docs/HOJA-DE-RUTA.md`. El próximo número está en
  `specs/README.md`.

## Límites
- ✅ Siempre: correr la verificación que corresponde.
- ✅ Siempre: actualizar `docs/ARQUITECTURA.md` o `docs/CLASES.md` en el mismo cambio, si cambia un
  límite, una tabla, un store, un tipo o una carpeta.
- ✅ Siempre: actualizar `MEMORY.md` al terminar cada tarea.
- ⚠ Pregunta antes: commits y push. Un push a `main` publica en producción y la APK lo carga.
- ⚠ Pregunta antes: cualquier consulta a una API de pago o con cuota. Decir cuántas consultas son y
  cuánto cuestan, pedir una vez y reutilizar dentro de la corrida, y nunca usar `Infinity` como cupo.
- ⚠ Pregunta antes: dependencias o proveedores nuevos (con su costo y su tope) y cambios en el
  formato de datos.
- ⚠ Pregunta antes: migraciones contra Supabase. Hay un solo proyecto: es producción.
- ⚠ Pregunta antes: cambios en `android/`, porque obligan a recompilar y reinstalar la APK.
- ⚠ Pregunta antes: borrar archivos.
- ⚠ Pregunta antes: instalar skills de terceros. Se leen enteras antes, y se descartan si
  contradicen este archivo (`route-optimization` proponía las metaheurísticas que «Rutas» descarta).
- 🚫 Nunca: datos reales de destinatarios en el repo, ni secretos en el código o en el chat.
- 🚫 Nunca: tocar otro proyecto de la cuenta de Vercel que no sea `proyecto-ares`.
- 🚫 Nunca: crear cuentas, claves o cuotas de Google, ni cargar secretos en Vercel. Eso lo hace el
  dueño.

## Verificación
Un cambio no está terminado hasta que sus comandos salen en 0 y, si se ve en la app, se recorre.

Siempre: `npm test`, `npm run lint` y `npm run build`.

Según lo que cambió:

- **Rutas, direcciones, WhatsApp, estados de entrega, pago o privacidad:** pruebas enfocadas nuevas
  (constitución III). Las pruebas importan el `src/` real; un proveedor se sustituye reemplazando el
  `fetch` global, no el módulo, así que no gastan cuota.
- **Migración:** que sea re-ejecutable y termine en un `select` que dé todo `true`. Después,
  `npm run test:esquema` y `npm run test:base`, y actualizar `src/types/db.ts`.
- **Pago (SQL o `pago.ts`):** cambiar las dos copias y correr `npm run test:base`.
- **Store de IndexedDB:** usar la siguiente versión libre de `idb.ts`, con migración al abrir y una
  prueba de que no se pierde nada (`idb-version.test.mjs`).
- **Pantalla del conductor:** no hay pruebas de componentes de React. Se recorre a mano en el
  teléfono o a 360 px, con los escenarios del `quickstart.md` de la spec, en modo prueba (nada va a
  la base ni por WhatsApp; hay GPS simulado). En la APK: `chrome://inspect` y Menú → Diagnóstico.
  El paso a paso está en la skill `recorrer-conductor`.
- **`android/`:** build local de la APK e instalación con adb (skill `apk-local`).
- **MCP:** `pruebas/16-mcp.test.mjs`, que ya corre en `npm test`.

## Memoria
- Al empezar, lee `MEMORY.md` (raíz del repo) para conocer el estado del proyecto y las decisiones
  tomadas. Es la única memoria: no se guardan notas aparte en la memoria automática de Claude Code.
- Al terminar una tarea, actualízalo con el estado actual, las decisiones importantes (con su
  porqué) y los errores a evitar.
- Mantenlo breve (máximo ~50 líneas): resume o elimina lo que ya no aporte.
- Si algo se convierte en una regla permanente, propón moverlo a `AGENTS.md` en vez de dejarlo en
  la memoria.
- No guardes nunca datos sensibles (claves, tokens, datos de destinatarios).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
