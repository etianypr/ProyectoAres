# Agregar o cambiar un store (v6)

Léelo entero antes de subir `VERSION` en `src/lib/encomiendas/local/idb.ts`. El patrón es el
que ya usan las v2 a v5 de ese archivo; no inventes otro.

## 0. Antes de escribir código
- **Preguntar al dueño.** Un store, un índice o un campo guardado es un cambio de formato de
  datos (`AGENTS.md`, «Límites»). La propuesta va con la estructura de datos (stores, claves,
  índices, qué se borra y cuándo) y el diagrama (`AGENTS.md`, «Forma de trabajar»).
- **¿Hace falta un store?** Un dato de un pedido va como campo de `Pedido`, con su valor por
  defecto en `alDia` (`almacen/migrar.ts`), sin subir la versión. Así se hicieron la OF, la foto
  (`fotoId`), los bultos y el POR PAGAR (specs 003 y 005). Un store nuevo se justifica si el dato
  no es de un pedido o necesita su propio índice.
- **Reservar la versión.** En `main`, en la fila de la feature de `specs/README.md`: «usa idb
  v6». La siguiente rama toma la v7.
- **Lo que manda es el orden de llegada a `main`.** La subida corre solo si la versión pedida es
  mayor que la del teléfono. Si la v7 de otra rama llegó antes que tu v6, al hacer `git merge main`
  tu rama sube a la v8. Si no, tu store nunca se crea en los teléfonos que ya abrieron la v7.

## 1. `idb.ts`
```ts
// v5: store "fotos" (spec 003), con índice por fecha para borrarlas con el día.
// v6: store "<nombre>" (spec NNN), <para qué>.
const VERSION = 6;

export const STORES = {
  // …los cinco de hoy…
  /** <Qué guarda>. Clave: <id o fecha>. */
  <nombre>: "<nombre>",
} as const satisfies { [S in Store]: S };

export type FilaDe = {
  // …
  <nombre>: <Forma>; // la forma va en almacen/tipos.ts
};
```
`satisfies` obliga a que `STORES` y `FilaDe` nombren los mismos stores: si falta uno, no compila.

Dentro de `solicitud.onupgradeneeded`, junto a los demás:
```ts
if (!base.objectStoreNames.contains(STORES.<nombre>)) {
  base
    .createObjectStore(STORES.<nombre>, { keyPath: "id" })
    .createIndex(INDICE_<NOMBRE>_POR_FECHA, "fecha"); // si guarda algo de un día
}
```
- Es idempotente a propósito: el mismo bloque corre al instalar (`oldVersion === 0`) y en cada
  subida. Un teléfono puede saltar varias versiones en una sola apertura.
- Si los datos son de un día, ponle `fecha` y un índice por fecha, como `fotos` (`por_fecha`,
  `clavesFotosDe`). Es lo que permite borrar un día sin leer todo el store.

## 2. Mover datos (solo si cambian de store o de forma)
Igual que `migrarAV3`:
```ts
const tx = solicitud.transaction;
if (tx && evento.oldVersion > 0 && evento.oldVersion < 3) migrarAV3(tx);
if (tx && evento.oldVersion > 0 && evento.oldVersion < 6) migrarAV6(tx);
```
- La conversión es una función **pura** en `almacen/migrar.ts` (como `migrarV2`): recibe todo lo
  leído y devuelve qué escribir. Así se prueba sin IndexedDB.
- La glue en `idb.ts` usa solicitudes y `onsuccess`, nunca `await` ni promesas: la transacción de
  versión se cierra sola en cuanto no le quedan solicitudes. Las solicitudes se resuelven en
  orden, así que basta con esperar la última.
- Si algo lanza, la subida se cancela y la base queda en la versión anterior con todo adentro.
  El teléfono no pierde nada, pero la app no abre el día hasta publicar el arreglo.
- Cambiar el `keyPath` o un índice de un store existente obliga a borrarlo y crearlo de nuevo,
  copiando sus filas en la misma transacción. Se evita.
- Un store se borra solo dentro de la transacción de versión y después de mover lo que tenía
  (así salió `whatsapp` en la v3). La `cola` nunca.
- Dato útil: `dashund-encomiendas` nació en v5 el 2026-10-30 (el renombrado borró la base vieja
  sin migrarla). Ningún teléfono real tiene esta base en v2–v4: la subida real es v5 → v6.

## 3. Datos de destinatarios → borrado (spec 007)
Si el store guarda nombre, teléfono, dirección, OF, coordenadas o fotos:
- Súmalo a `STORES_DEL_DIA`. Con eso lo vacían `borrarDatosDestinatarios` (cierre de sesión y
  cuenta inactiva) y `salirDelModoPrueba`.
- **No alcanza para el cierre del día.** `cerrarYBorrarDia` (`almacen/borrado.ts`) borra la fecha
  store por store (`pedidos` por id, `fotos` con `clavesFotosDe`, la ruta por fecha). Agrega ahí
  el borrado del store nuevo para esa fecha, y cuéntalo en la salida temprana (`if (!ruta &&
  pedidos.length === 0 && fotos.length === 0)`).
- `diasPorBorrar` busca fechas solo en `rutas` y `pedidos`. Si el store puede tener filas de un
  día sin pedidos, súmalo ahí.
- Regístralo en `docs/PRIVACIDAD.md` (dónde vive y cuándo se borra). Si un proveedor nuevo recibe
  esos datos, va también ahí (A10). Skill `privacidad-destinatarios`.

## 4. Operaciones
- En `almacen/<tema>.ts` (menos de ~400 líneas, A7), exportadas por `almacen/index.ts`.
- Leer, decidir y escribir: dentro de `enFila(async () => …)`. Escribir: `escribir([stores],
  ({ guardar, borrar, vaciar, actualizar }) => …)` con callback sincrónico.
- Si una operación toca un pedido y la cola, van en la **misma** llamada a `escribir`.
- Lo que se lee pasa por una normalización (`alDia`, `rutaAlDia`, `diaAlDia`), como en
  `almacen/lecturas.ts`: lo guardado por versiones anteriores no trae los campos nuevos.

## 5. Prueba de versión
Que un teléfono con la v5 y un día a medias abra la v6 sin perder nada. La base se arma a mano,
con los stores exactos de la v5, **antes** del primer import del almacén:

```js
// IndexedDB v5 → v6 (spec NNN): aparece «<nombre>» y no se pierde nada. Datos inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const HOY = "2026-11-05";

async function crearBaseV5() {
  await new Promise((resolve, reject) => {
    const s = indexedDB.open("dashund-encomiendas", 5);
    s.onupgradeneeded = () => {
      const base = s.result;
      base.createObjectStore("pedidos", { keyPath: "id" });
      base.createObjectStore("rutas", { keyPath: "fecha" });
      base.createObjectStore("cola", { keyPath: "id" });
      base.createObjectStore("dias", { keyPath: "fecha" });
      base.createObjectStore("fotos", { keyPath: "id" }).createIndex("por_fecha", "fecha");
    };
    s.onsuccess = () => {
      const base = s.result;
      const tx = base.transaction(["pedidos", "rutas", "cola", "dias", "fotos"], "readwrite");
      // Un pedido entregado y uno pendiente, su ruta, un evento sin enviar, un día ya
      // resumido y una foto (ver pedido() en pruebas/idb-version.test.mjs).
      // …tx.objectStore("…").put(…)…
      tx.oncomplete = () => {
        base.close(); // sin esto, la subida a v6 queda bloqueada
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    s.onerror = () => reject(s.error);
  });
}

await crearBaseV5();
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

test("la v6 conserva pedidos, ruta, cola, días y fotos, y agrega «<nombre>» vacío", async () => {
  // leer con el almacén real: leerPedidos, leerRuta, idb.leerTodos(idb.STORES.cola)…
});
```
- Cada archivo de prueba tiene una sola base (y un proceso propio). `idb-version.test.mjs` arma
  hoy una base v3: o la cambias a v5, que es la que tienen los teléfonos, o pones la v5 → v6 en
  un archivo aparte.
- Actualiza la prueba «STORES_DEL_DIA nombra los stores con datos de destinatarios» si el store
  va ahí.
- En `privacidad.test.mjs`, llena el store nuevo en el día de prueba: la prueba recorre
  `STORES_DEL_DIA` y exige que quede vacío después de `cerrarYBorrarDia`.
- Si el modo prueba debe vaciarlo, súmalo en `modo-prueba.test.mjs`.
- Correr: `node --import ./pruebas/registrar.mjs --test pruebas/idb-version.test.mjs
  pruebas/privacidad.test.mjs` y después `npm test`, `npm run lint`, `npm run build`.

## 6. Docs en el mismo cambio
- `docs/ARQUITECTURA.md` §2: título «IndexedDB `dashund-encomiendas` v5», la tabla de stores, y
  el borrado si cambia. Diagrama de §1 (lista de stores).
- `docs/CLASES.md` §1 (clase con `<<store …>>` y la tabla «Dónde vive») y §4.
- `AGENTS.md` («Teléfono: IndexedDB … v5 (la siguiente versión libre es la v6)») y
  `specs/README.md`, «Reglas compartidas» (hoy v5, libre v6).
- `pruebas/README.md`, fila de la prueba de versión. `MEMORY.md` al terminar.
