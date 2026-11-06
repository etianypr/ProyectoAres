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

## Mapbox ya salió (spec 019, 2026-11-06)
Google da el número de casa (`preguntarAGoogle`, con memoria por pantalla), OSM las calles y los
lugares, y la calle cercana sale de las teselas de OpenFreeMap (`geo/teselas.ts`). No se vuelve a
proponer Mapbox: la prueba de arquitectura falla si aparece su API, su token o `mapbox-gl`. Lo que
queda es del dueño: el tope diario de Google (T012), borrar el token en Vercel y anularlo (T013).

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
const { googleDirecto, olvidarConsultasGoogle } = await import("@/lib/geo/geocoding/google");

const fetchOriginal = globalThis.fetch;
let osm = () => [], google = () => ({ status: "ZERO_RESULTS", results: [] });
const json = (c) => new Response(JSON.stringify(c), { status: 200, headers: { "content-type": "application/json" } });

test.before(() => {
  globalThis.fetch = async (entrada, opciones) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    if (url === "/api/geocodificar") {
      const { direccion } = JSON.parse(opciones.body);
      return json({ sugerencias: await googleDirecto(direccion, "clave-prueba") });
    }
    const q = new URL(url).searchParams;
    if (url.includes("nominatim")) return json(osm(q.get("q")));
    return json(google(q.get("address")));
  };
});
test.after(() => { globalThis.fetch = fetchOriginal; delete globalThis.window; });
// Lo ya preguntado a Google se recuerda: sin esto, una prueba contesta con la anterior.
test.beforeEach(() => olvidarConsultasGoogle());

test("calle corta sin el número: entra aproximada con aviso", async () => {
  globalThis.window = {}; // desde el teléfono: habilita Google
  osm = () => [{ osm_type: "way", osm_id: 1, lat: "-18.47", lon: "-70.30", category: "highway",
    name: "Lebu", address: { road: "Lebu", city: "Arica" } }];
  const r = await ubicarDireccion("LEBU 0950"); // Lebu mide 191 m en el catálogo
  assert.equal(r.tipo, "aproximada");
  assert.match(r.advertencia, /corta/);
});
```
Los ayudantes `tramoOsm` y `resultadoGoogle` de
`ubicar-direcciones.test.mjs` arman las respuestas; cópialos en vez de inventar otra forma.
