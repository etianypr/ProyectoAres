// La propuesta de ruta sobrevive a cerrar la app (dueño, 2026-11-09): se guarda sin
// copiar los pedidos, vuelve igual que como estaba a la vista, deja de valer si un
// pendiente cambió y se borra con el día. Sobre el almacén real (fake-indexeddb).
// Datos inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { guardarPropuestaVista, olvidarPropuesta, propuestaGuardada } = await import(
  "@/lib/encomiendas/local/generar-ruta/propuesta-guardada"
);

const HOY = "2026-11-09";

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
});

async function tresPedidos() {
  const { creados } = await almacen.crearDesdeGuia(
    [
      { of: "300000001", destino: "CALLE UNO 100" },
      { of: "300000002", destino: "CALLE DOS 200" },
      { of: "300000003", destino: "CALLE TRES 300" },
    ],
    HOY,
    { folio: null, origen: "guia_ia" },
  );
  await almacen.fijarCoordenadas(creados.map((p, i) => ({ id: p.id, lat: -18.47 - i / 1000, lng: -70.29 })));
  return almacen.leerPedidos(HOY);
}

/** Una propuesta como la que arma ARES, invertida (con la de ARES adentro). */
function propuesta(pedidos) {
  // La tercera, corrida a su calle de acceso: ese punto tiene que volver tal cual.
  const ubicados = pedidos.map((p, i) => ({ ...p, lat: p.lat + (i === 2 ? 0.0003 : 0), lng: p.lng }));
  const base = {
    fecha: HOY,
    partida: { lat: -18.4659, lng: -70.3025 },
    llegada: { lat: -18.4659, lng: -70.3025 },
    trazado: [
      [-70.3025, -18.4659],
      [-70.29, -18.47],
    ],
    tramos: null,
    distanciaM: 12_300,
    duracionS: 1_800,
    sinUbicar: [],
    sinTrazado: false,
    motivoSinTrazado: null,
    cerradas: 0,
    advertencias: ["Un aviso cualquiera."],
    elegida: "corta",
    lejanas: [{ pedidoId: ubicados[2].id, direccion: ubicados[2].direccion, metrosAlResto: 4_000, metrosQueSuma: 6_000 }],
  };
  const deAres = {
    ...base,
    paradas: ubicados,
    alternativas: [{ estrategia: "corta", titulo: "La más económica", motivo: "", paradas: ubicados, metros: 12_000 }],
  };
  const alReves = [...ubicados].reverse();
  return {
    ...base,
    distanciaM: 13_100,
    paradas: alReves,
    alternativas: [{ ...deAres.alternativas[0], paradas: alReves }],
    deAres,
  };
}

test("se guarda sin copiar los pedidos y vuelve igual que como estaba a la vista", async () => {
  const pedidos = await tresPedidos();
  const vista = propuesta(pedidos);
  await guardarPropuestaVista(HOY, vista);

  const guardada = await idb.leerUno(idb.STORES.propuestas, HOY);
  assert.deepEqual(Object.keys(guardada.datos.paradas[0]).sort(), ["id", "lat", "lng"], "la parada va como id y punto");
  assert.equal(/CALLE (UNO|DOS|TRES)/.test(JSON.stringify(guardada.datos)), false, "la dirección no se copia");

  const vuelta = await propuestaGuardada(HOY, await almacen.leerPedidos(HOY));
  assert.deepEqual(vuelta.paradas.map((p) => p.id), vista.paradas.map((p) => p.id), "el orden invertido");
  assert.equal(vuelta.paradas[0].lat, vista.paradas[0].lat, "el punto corrido a su acceso");
  const direccionDe = (id) => pedidos.find((p) => p.id === id).direccion;
  assert.equal(vuelta.paradas[0].direccion, direccionDe(vista.paradas[0].id), "el resto del pedido sale de `pedidos`");
  assert.deepEqual(vuelta.deAres.paradas.map((p) => p.id), vista.deAres.paradas.map((p) => p.id), "la de ARES, para volver sin consultar");
  assert.equal(vuelta.distanciaM, 13_100);
  assert.deepEqual(vuelta.trazado, vista.trazado);
  assert.equal(vuelta.lejanas[0].direccion, direccionDe(vista.lejanas[0].pedidoId));
  assert.deepEqual(vuelta.advertencias, ["Un aviso cualquiera."]);
});

test("si un pendiente cambió, no vale y se borra", async () => {
  const pedidos = await tresPedidos();
  await guardarPropuestaVista(HOY, propuesta(pedidos));
  await almacen.fijarCoordenadas([{ id: pedidos[1].id, lat: -18.48, lng: -70.3 }]);
  assert.equal(await propuestaGuardada(HOY, await almacen.leerPedidos(HOY)), null);
  assert.equal(await idb.leerUno(idb.STORES.propuestas, HOY), null);
});

test("vale al reabrir aunque el armado haya corrido una parada sin recargar la pantalla", async () => {
  // Auditoría del día real (2026-11-10): la pantalla todavía tiene los pedidos de
  // antes de armar, y el armado corrió uno a su calle de acceso en el teléfono.
  const pantalla = await tresPedidos();
  await almacen.fijarCoordenadas([{ id: pantalla[2].id, lat: pantalla[2].lat + 0.0003, lng: pantalla[2].lng }]);
  await guardarPropuestaVista(HOY, propuesta(pantalla));
  const vuelta = await propuestaGuardada(HOY, await almacen.leerPedidos(HOY));
  assert.ok(vuelta, "al reabrir, la propuesta sigue ahí");
});

test("usada o descartada se olvida, y el cierre del día la borra", async () => {
  const pedidos = await tresPedidos();
  await guardarPropuestaVista(HOY, propuesta(pedidos));
  await olvidarPropuesta(HOY);
  assert.equal(await idb.leerUno(idb.STORES.propuestas, HOY), null);

  await guardarPropuestaVista(HOY, propuesta(pedidos));
  await almacen.cerrarYBorrarDia(HOY);
  assert.equal(await idb.leerUno(idb.STORES.propuestas, HOY), null);
});

test("una que espera su trazado no se guarda", async () => {
  const pedidos = await tresPedidos();
  await guardarPropuestaVista(HOY, { ...propuesta(pedidos), esperaTrazado: true });
  assert.equal(await idb.leerUno(idb.STORES.propuestas, HOY), null);
});
