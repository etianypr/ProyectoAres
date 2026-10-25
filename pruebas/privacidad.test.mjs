// Privacidad (spec 007, Ley 21.719): al cerrar el día o la sesión no queda en el
// teléfono ningún dato de destinatarios; la cola de eventos sí queda (sin ella el
// conductor no cobra). Y el servidor no guarda ni registra esos datos.
//
// Corre el almacén real sobre IndexedDB (fake-indexeddb) y lee las migraciones
// y las rutas de API tal como están en el repositorio.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const {
  guardarPedido,
  guardarRuta,
  marcarResultado,
  cerrarDia,
  cerrarYBorrarDia,
  noEntregadosDelDia,
  diasPorBorrar,
  borrarDatosDestinatarios,
  leerDias,
  leerResumenDia,
  leerPedidos,
  leerRuta,
} = almacen;

const HOY = "2026-10-24";
const AYER = "2026-10-23";
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";

/** Lo que identifica a una persona: nada de esto puede quedar después del borrado. */
const CAMPOS_DE_PERSONA = ["nombre", "telefono", "direccion", "lat", "lng", "notas", "of", "referencia"];

async function limpiar() {
  for (const store of Object.values(idb.STORES)) {
    await idb.escribir([store], ({ vaciar }) => vaciar(store));
  }
}
test.beforeEach(limpiar);

const datos = (n) => ({
  nombre: `Destinatario ${n}`,
  telefono: `+5691234000${n}`,
  direccion: `Calle ${n} 100, Arica`,
  lat: -18.47 - n / 1000,
  lng: -70.29 - n / 1000,
  notas: null,
});

/** 5 pedidos en ruta: 3 entregados y 2 no entregados (el escenario de la spec). */
async function diaDeCinco(fecha = HOY) {
  const ids = [];
  for (let i = 1; i <= 5; i++) ids.push((await guardarPedido(datos(i), fecha)).id);
  await guardarRuta({ fecha, pedidoIdsEnOrden: ids, trazado: null, distanciaM: null, duracionS: null });
  for (const [i, resultado] of ["entregado", "entregado", "entregado", "no_entregado", "no_entregado"].entries()) {
    await marcarResultado({ fecha, pedidoId: ids[i], conductorId: CONDUCTOR }, resultado);
  }
  await cerrarDia(fecha);
  return ids;
}

/** Todo lo que guarda el teléfono, como texto, para buscar datos de personas. */
async function todoElTelefono() {
  const filas = {};
  for (const store of Object.values(idb.STORES)) filas[store] = await idb.leerTodos(store);
  return filas;
}

// ---------------------------------------------------------------- US1: cierre

test("al cerrar el día no queda ningún dato de destinatarios, solo el resumen", async () => {
  await diaDeCinco();
  const resumen = await cerrarYBorrarDia(HOY);

  const t = await todoElTelefono();
  for (const store of idb.STORES_DEL_DIA) assert.deepEqual(t[store], [], `${store} tiene que quedar vacío`);
  assert.equal(await leerRuta(HOY), null);
  assert.deepEqual(await leerPedidos(HOY), []);

  assert.equal(resumen.asignados, 5);
  assert.equal(resumen.entregadas, 3);
  assert.equal(resumen.noEntregadas, 2);
  assert.ok(resumen.cierre, "el resumen guarda la hora del cierre");
  assert.deepEqual(t.dias, [resumen]);

  // Ningún campo ni valor de persona en lo que sobrevive.
  const texto = JSON.stringify({ dias: t.dias, cola: t.cola });
  for (const campo of CAMPOS_DE_PERSONA) assert.equal(texto.includes(`"${campo}"`), false, campo);
  assert.equal(/Destinatario|\+569|Calle \d/.test(texto), false, "quedó un dato de persona");
});

test("la cola de eventos se conserva hasta enviarse", async () => {
  await diaDeCinco();
  const antes = await idb.leerTodos(idb.STORES.cola);
  assert.equal(antes.length, 5, "una entrega o no entrega = un evento");
  await cerrarYBorrarDia(HOY);
  assert.deepEqual(await idb.leerTodos(idb.STORES.cola), antes);
});

test("la lista de no entregados trae lo no entregado y lo que no se visitó", async () => {
  const ids = await diaDeCinco();
  const fuera = await guardarPedido(datos(9), HOY); // cargado tarde, nunca entró en la ruta
  const lista = await noEntregadosDelDia(HOY);
  assert.deepEqual(
    lista.map((p) => p.id),
    [ids[3], ids[4], fuera.id],
    "primero en el orden de la ruta, después lo de fuera",
  );
  assert.equal((await cerrarYBorrarDia(HOY)).noEntregadas, 3, "lo pendiente al cerrar también vuelve");
});

test("los días anteriores se ven solo en cifras", async () => {
  await diaDeCinco(AYER);
  await cerrarYBorrarDia(AYER);
  const [dia] = await leerDias();
  assert.deepEqual(
    { fecha: dia.fecha, asignados: dia.asignados, entregadas: dia.entregadas, noEntregadas: dia.noEntregadas },
    { fecha: AYER, asignados: 5, entregadas: 3, noEntregadas: 2 },
  );
  assert.equal("nombre" in dia, false);
  assert.deepEqual(await leerResumenDia(AYER), dia);
});

test("al abrir otro día, los anteriores con datos quedan por borrar", async () => {
  await diaDeCinco(AYER);
  await guardarPedido(datos(1), HOY);
  assert.deepEqual(await diasPorBorrar(HOY), [AYER], "hoy no se borra solo");
  await cerrarYBorrarDia(AYER);
  assert.deepEqual(await diasPorBorrar(HOY), []);
  assert.equal((await leerPedidos(HOY)).length, 1, "lo de hoy no se toca");
});

test("lo no entregado no pasa al día siguiente", async () => {
  await diaDeCinco(AYER);
  await cerrarYBorrarDia(AYER);
  assert.deepEqual(await leerPedidos(HOY), []);
  assert.deepEqual(await idb.leerTodos(idb.STORES.pedidos), []);
});

test("un día sin cerrar en el servidor se da por cerrado al borrarlo", async () => {
  // Quedó una parada pendiente: la ruta nunca se cerró.
  const a = await guardarPedido(datos(1), AYER);
  const b = await guardarPedido(datos(2), AYER);
  await guardarRuta({ fecha: AYER, pedidoIdsEnOrden: [a.id, b.id], trazado: null, distanciaM: null, duracionS: null });
  await marcarResultado({ fecha: AYER, pedidoId: a.id, conductorId: CONDUCTOR }, "entregado");
  const resumen = await cerrarYBorrarDia(AYER);
  assert.equal(resumen.noEntregadas, 1);
  assert.ok(resumen.cierre);
  assert.ok(resumen.inicio, "el inicio queda para sincronizar el día con el servidor");
});

test("un día que se reabre después del borrado suma sus cifras", async () => {
  await diaDeCinco();
  await cerrarYBorrarDia(HOY);
  const tarde = await guardarPedido(datos(7), HOY);
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: [tarde.id], trazado: null, distanciaM: null, duracionS: null });
  const [antes] = await leerDias();
  assert.equal(antes.asignados, 6);
  assert.equal(antes.cierre, null, "reabierto: el día vuelve a estar en curso");
  assert.equal((await leerRuta(HOY)).inicio, (await idb.leerUno(idb.STORES.dias, HOY)).inicio, "conserva el inicio");

  await marcarResultado({ fecha: HOY, pedidoId: tarde.id, conductorId: CONDUCTOR }, "entregado");
  await cerrarDia(HOY);
  const final = await cerrarYBorrarDia(HOY);
  assert.deepEqual({ asignados: final.asignados, entregadas: final.entregadas }, { asignados: 6, entregadas: 4 });
});

test("borrar un día que no tiene datos no escribe nada", async () => {
  assert.equal(await cerrarYBorrarDia(HOY), null);
  assert.deepEqual(await idb.leerTodos(idb.STORES.dias), []);
});

// ------------------------------------------------------- US2: sesión y acceso

test("al cerrar sesión se borran todos los días; quedan la cola y los resúmenes", async () => {
  await diaDeCinco(AYER);
  await guardarPedido(datos(1), HOY);
  const cola = await idb.leerTodos(idb.STORES.cola);

  await borrarDatosDestinatarios();

  const t = await todoElTelefono();
  for (const store of idb.STORES_DEL_DIA) assert.deepEqual(t[store], [], store);
  assert.deepEqual(t.cola, cola);
  assert.deepEqual(t.dias.map((d) => d.fecha).sort(), [AYER, HOY]);
  assert.equal(/Destinatario|\+569|Calle \d/.test(JSON.stringify(t)), false);
});

test("cerrar sesión sin datos no falla", async () => {
  await borrarDatosDestinatarios();
  assert.deepEqual(await idb.leerTodos(idb.STORES.dias), []);
});

// --------------------------------------------- US5: el servidor no los guarda

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

test("ninguna tabla encomienda_* tiene columnas de destinatarios", () => {
  const dir = join(RAIZ, "supabase", "migrations");
  const sql = readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .map((n) => readFileSync(join(dir, n), "utf8"))
    .join("\n")
    .replace(/--.*$/gm, "");
  const columnasProhibidas = /^\s*"?(nombre|telefono|direccion|of|destinatario\w*)"?\s+\w+/i;
  const malas = [];
  for (const m of sql.matchAll(/create table(?: if not exists)?\s+(?:public\.)?(encomienda_\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    for (const linea of m[2].split("\n")) if (columnasProhibidas.test(linea)) malas.push(`${m[1]}: ${linea.trim()}`);
  }
  for (const m of sql.matchAll(/alter table\s+(?:public\.)?(encomienda_\w+)[^;]*?add column(?: if not exists)?\s+"?(\w+)/gi)) {
    if (/^(nombre|telefono|direccion|of|destinatario\w*)$/i.test(m[2])) malas.push(`${m[1]}: ${m[2]}`);
  }
  assert.deepEqual(malas, []);
});

test("las rutas de API no escriben en el log", () => {
  const archivos = (d) =>
    readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? archivos(join(d, n)) : [join(d, n)]));
  const conLog = archivos(join(RAIZ, "src", "app", "api"))
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => /console\.(log|info|warn|error|debug)\s*\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(conLog, [], "un console.* en una ruta puede terminar registrando el cuerpo con datos de personas");
});
