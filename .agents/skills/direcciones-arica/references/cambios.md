# Cambios típicos, paso a paso

Leer la sección del cambio que toca. Cada uno termina con la verificación de `AGENTS.md`
(`npm test`, `npm run lint`, `npm run build`), `MEMORY.md` al día y, si se ve en pantalla, la
skill `recorrer-conductor`.

## Referencias en la dirección (spec 025, borrador)
1. Antes de escribir código, se le pregunta al dueño lo que la 025 deja «por definir»:
   - dónde queda la referencia: `referencia` ya es la **descripción del paquete** (spec 003) y no
     se reusa; `notas` existe; un campo nuevo cambia el formato y sube a idb v6 (skill
     `base-local-idb`);
   - qué formas se reconocen;
   - qué pasa con «calle X con calle Y» **sin número** y con «X con Y 50» (¿el 50 es de X o de Y?).
2. Limpieza en `geocoding/consulta.ts`: hoy quedan «con …» y «al lado de…» después del número, y
   todo lo que va antes (tabla en `cadena.md`). Agrega el patrón con `\b` antes del punto opcional
   y sin comerse nombres reales. Al 2026-11-05 ninguna calle del catálogo lleva « con » en el
   nombre; vuelve a mirarlo con `grep -i " con " src/lib/geo/geocoding/calles-arica.ts`.
3. La IA: agrega la regla a `SISTEMA` en `geo/direccion-ia/servidor.ts` (buscar solo calle y
   número; la referencia no se busca). Hoy solo dice «datos de más (… referencias)».
4. El pedido conserva el texto entero: la limpieza es solo de la **consulta**.
5. Pruebas en `pruebas/ubicar-direcciones.test.mjs`: `normalizarConsulta` con ejemplos inventados
   y un `ubicarDireccion` que compruebe que la consulta que sale (`consultas[].q`) no trae la
   referencia.
6. Medir antes y después con `npm run sondear` **solo con permiso** (ver «Plata» en el SKILL).

## ⚠ en el pedido y calle repetida (spec 022, borrador)
1. Preguntar primero: dónde vive el ⚠ (¿campo nuevo en `pedidos` o derivado?), cuándo queda
   resuelto y qué es «la primera dirección que encontró la búsqueda» (¿`candidatos[0]`?).
2. Ojo con `solo_calle` de una calle larga: su punto puede estar a kilómetros de la puerta. Que
   entre a la ruta con ⚠ cambia el km de la ruta (skill `rutas-ares`): mídelo.
3. Hoy la duda deja el pedido sin punto en tres lugares: `cargar-guia.tsx`, `reintentarUbicar` y
   `resultado-escaneo.tsx`. Los tres tienen que dar el mismo trato.
4. «Antes de armar la ruta» es el paso 2 del flujo del conductor: el conductor elige el lugar
   (`ResolverDireccion`) o llama al receptor. El aviso dos paradas antes depende de la 020.
5. Pruebas: el almacén con `fake-indexeddb` (como `3-almacen`) y, si sube la versión,
   `idb-version.test.mjs`.

## Sacar Mapbox de las direcciones (spec 019, T008 y T011–T013)
1. Inventario: `grep -rln -i mapbox src pruebas scripts docs .env.example`. En direcciones:
   `conMapbox`, `sugerirDirecciones`, `urlMapbox`, `aSugerencia`, `FeatureV6`, `puertaEnCalle`
   (completar número), `geo/mapbox/{acceso,token}.ts`, la `Fuente` `"mapbox"` y `NOMBRE_FUENTE`,
   `buscarEnTodos` y la descripción de `buscar_direccion` en la IA, `ubicarConMapboxYOsm`,
   `fixtures/geocoding-mapbox.json`, `PROVEEDORES` de A10 y la fila de `docs/PRIVACIDAD.md`.
2. Lo que se pierde: Mapbox es el que tiene los números de casa en Arica (OSM casi no). Sin él,
   `completarNumeroEnCalles` no encuentra nada y casi toda dirección con número pasa a Google.
   Por eso **T012 (tope diario de Google) va antes que T013**. Qué reemplaza a «nombre oficial +
   número» lo decide el dueño (la 019 menciona ORS; su geocodificación gratis es de 1.000 al día).
3. Medir antes y después sobre las mismas direcciones: puertas exactas, ambiguas detectadas
   («Los Aromos» con número, ver `cadena.md`), sin ubicar y consultas a Google por guía. Pedir permiso
   diciendo cuántas consultas son.
4. T008, calle cercana: `elegirAcceso` es pura y se queda. Cambia la fuente de `puntoDeAcceso`
   (la 019 la pone en `lib/geo/acceso.ts`, con OSM/Overpass). Las clases de vía de OSM
   (`motorway`, `trunk`, `primary`, `residential`…) no son las de Mapbox Streets (`street`,
   `street_limited`): rehacer `MANEJABLES`. El Overpass público limita consultas simultáneas: mejor
   pocas consultas que una por parada. Su host va a A10 y a PRIVACIDAD (recibe la zona alrededor de
   una parada).
5. T013: dependencia, `NEXT_PUBLIC_MAPBOX_TOKEN`, `.env.example`, README, PRIVACIDAD, A10 sin
   `api.mapbox.com` (019 SC-002) y la base de comparación de `scripts/sondear-proveedores.mjs`. El
   token en Vercel lo anula el dueño.

## Regenerar el catálogo de calles
1. Preguntar antes: consulta Overpass (gratis, solo el recuadro). Sin red se puede usar una
   descarga ya hecha: `node scripts/generar-calles.mjs calles-osm.json`.
2. Revisar el diff de `calles-arica.ts` (cuántas calles entran, salen o cambian de largo); no se
   edita a mano.
3. Correr `ubicar-direcciones`: fija nombres reales del catálogo («Braulio Muñoz», «Santiago Arata
   Gandolfo», «Avenida Diputado Humberto Arellano Figueroa», «Alejandro Azolas», «Carlos Witting»
   ≤ 300 m). Si OSM cambió un nombre, la prueba lo dice.

## Tocar la IA de direcciones (spec 018)
- `SISTEMA` y `HERRAMIENTAS` en `servidor.ts`; contrato y topes en `contrato.ts`; el bucle y
  `interpretar` en `cliente.ts`. Las reglas de «Lo que ya está decidido» no se aflojan.
- Pruebas en `direccion-ia.test.mjs` con dependencias inyectadas (no gasta). Una prueba con la API
  real solo con permiso, con direcciones inventadas y diciendo cuántas (la 018 usó 3).
- Si cambia lo que sale a Anthropic: `docs/PRIVACIDAD.md` (skill `privacidad-destinatarios`).

## Un proveedor de direcciones nuevo
1. Medirlo antes con permiso: entra solo si aporta puertas que los actuales no tienen (criterio de
   `mcp/README.md`; así se descartaron Photon e IDE Chile).
2. Preguntar costo y tope: cuota que lo deje en US$0. Si recibe direcciones: fila en
   `docs/PRIVACIDAD.md` y host en `PROVEEDORES` (A10). Con clave secreta: módulo `server-only` y
   ruta de API, como `api/geocodificar`.
3. Sumarlo a la unión `Fuente` y a `NOMBRE_FUENTE` (sin nombre no compila) y validar su respuesta
   con `esLaCalleEscrita` y `RECUADRO_ARICA`.

## Molde de prueba con proveedores simulados
```js
// pruebas/<nombre>.test.mjs — calles reales, números inventados.
import test from "node:test";
import assert from "node:assert/strict";
const { ubicarDireccion } = await import("@/lib/geo/geocoding");
const { googleDirecto } = await import("@/lib/geo/geocoding/google");

const fetchOriginal = globalThis.fetch;
let mapbox = () => ({ features: [] }), osm = () => [], google = () => ({ status: "ZERO_RESULTS", results: [] });
const json = (c) => new Response(JSON.stringify(c), { status: 200, headers: { "content-type": "application/json" } });

test.before(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.prueba"; // sin token no se pregunta a Mapbox
  globalThis.fetch = async (entrada, opciones) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    if (url === "/api/geocodificar") {
      const { direccion } = JSON.parse(opciones.body);
      return json({ sugerencias: await googleDirecto(direccion, "clave-prueba") });
    }
    const q = new URL(url).searchParams;
    if (url.includes("nominatim")) return json(osm(q.get("q")));
    if (url.includes("googleapis")) return json(google(q.get("address")));
    return json(mapbox(q.get("q")));
  };
});
test.after(() => { globalThis.fetch = fetchOriginal; delete globalThis.window; });

test("calle corta sin el número: entra aproximada con aviso", async () => {
  globalThis.window = {}; // desde el teléfono: habilita Google
  osm = () => [{ osm_type: "way", osm_id: 1, lat: "-18.47", lon: "-70.30", category: "highway",
    name: "Lebu", address: { road: "Lebu", city: "Arica" } }];
  const r = await ubicarDireccion("LEBU 0950"); // Lebu mide 191 m en el catálogo
  assert.equal(r.tipo, "aproximada");
  assert.match(r.advertencia, /corta/);
});
```
Los ayudantes `puerta`, `calleSola`, `tramoOsm` y `resultadoGoogle` de
`ubicar-direcciones.test.mjs` arman las respuestas; cópialos en vez de inventar otra forma.
