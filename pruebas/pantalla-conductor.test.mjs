// La pantalla del conductor, partida en piezas (spec 002, T035–T037): lo puro
// que salió de pantalla.tsx. En qué paso está la parada activa decide qué botón
// ve el conductor manejando, así que cada rama tiene su caso.
import test from "node:test";
import assert from "node:assert/strict";

const { faseDeParada, SALIDAS } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/fase-parada");
const { cifrasPantalla, cierreDelDia } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/cifras-pantalla");

const parada = (pedido = {}, hayQueContactar = true) => ({
  pedido: { id: "p1", llamada: null, ...pedido },
  hayQueContactar,
});
const sin = { dandoResultadoDe: null };

test("faseDeParada: en la parada, salvo que se esté eligiendo una salida", () => {
  assert.equal(faseDeParada(null, sin), "en_parada");
  assert.equal(faseDeParada(parada(), sin), "en_parada");
  assert.equal(faseDeParada(parada({ llamada: "no_contesto" }), sin), "en_parada", "ya no hay paso de \"¿contestó?\"");
  assert.equal(faseDeParada(parada(), { dandoResultadoDe: "p1" }), "salidas");
  // De OTRA parada no cuenta.
  assert.equal(faseDeParada(parada(), { dandoResultadoDe: "p2" }), "en_parada");
});

test("SALIDAS: dejar como pendiente y no entregado, en ese orden", () => {
  assert.deepEqual(
    SALIDAS.map((s) => s.clave),
    ["pendiente", "no_entregado"],
  );
});

test("cifrasPantalla: fuera de la ruta, sin ubicar y avance de la ruta", () => {
  const p = (id, resultado = "pendiente", punto = true) => ({ id, resultado, lat: punto ? -18.47 : null, lng: punto ? -70.3 : null });
  const enRuta = [p("a", "entregado"), p("b", "no_entregado"), p("c"), p("d", "entregado")];
  const paradas = enRuta.map((pedido, i) => ({ secuencia: i + 1, pedido, hayQueContactar: false }));
  const pedidos = [...enRuta, p("x"), p("y", "pendiente", false), p("z", "entregado")];
  const c = cifrasPantalla(paradas, pedidos);
  assert.deepEqual(c.sinRutear.map((x) => x.id), ["x", "y"], "lo cerrado fuera de la ruta no cuenta");
  assert.equal(c.sinUbicar, 1);
  assert.equal(c.entregadas, 2);
  assert.equal(c.noEntregadas, 1);
  assert.equal(c.porcentaje, 50);
  assert.equal(cifrasPantalla([], []).porcentaje, 0);
});

// ------------------------------------------------- spec 027: el paso del día
const { pasoDelDia, cargaTerminada } = await import(
  "@/app/(conductor)/conductor/encomiendas/_hooks/paso-del-dia"
);

const dia = (extra = {}) => ({
  hayRuta: false,
  hayActiva: false,
  pendientesFuera: 0,
  conProblema: 0,
  cargaTerminada: false,
  ...extra,
});

test("pasoDelDia: sin ruta, guía → resolver ⚠ → armar la ruta", () => {
  assert.equal(pasoDelDia(dia()), "guia", "el día parte vacío");
  assert.equal(pasoDelDia(dia({ pendientesFuera: 42, conProblema: 4 })), "resolver");
  assert.equal(pasoDelDia(dia({ pendientesFuera: 42 })), "ruta", "todo ubicado y sin ⚠");
});

test("pasoDelDia: con ruta, cargar el auto → recorrer → cerrar el día", () => {
  assert.equal(pasoDelDia(dia({ hayRuta: true, hayActiva: true })), "carga", "la parada 1 no aparece en la central");
  assert.equal(pasoDelDia(dia({ hayRuta: true, hayActiva: true, cargaTerminada: true })), "reparto");
  assert.equal(pasoDelDia(dia({ hayRuta: true, hayActiva: false })), "cierre", "todas las paradas cerradas");
  // Un pedido que llega tarde (fuera de la ruta, con ⚠) no saca al conductor del reparto.
  assert.equal(
    pasoDelDia(dia({ hayRuta: true, hayActiva: true, cargaTerminada: true, pendientesFuera: 1, conProblema: 1 })),
    "reparto",
  );
});

test("cargaTerminada: salió, cerró una parada o no queda nada de la guía por escanear", () => {
  const p = (extra = {}) => ({ origenCarga: "guia_foto", bultosEscaneados: [], resultado: "pendiente", ...extra });
  const sinEscanear = [p(), p({ bultosEscaneados: [1] })];
  assert.equal(cargaTerminada({ inicioReparto: null }, sinEscanear), false, "recién armada, falta uno");
  assert.equal(cargaTerminada(null, sinEscanear), false);
  assert.equal(cargaTerminada({}, sinEscanear), false, "una ruta guardada antes de la 027 no tiene el campo");
  assert.equal(cargaTerminada({ inicioReparto: "2026-11-06T12:00:00.000Z" }, sinEscanear), true, "tocó «Salir a repartir»");
  assert.equal(cargaTerminada({ inicioReparto: null }, [...sinEscanear, p({ resultado: "entregado" })]), true, "ya entregó uno");
  assert.equal(cargaTerminada({ inicioReparto: null }, [p({ bultosEscaneados: [1] })]), true, "todo escaneado");
  assert.equal(cargaTerminada({ inicioReparto: null }, [p({ origenCarga: "manual" })]), true, "lo cargado a mano no se escanea");
});

test("cierreDelDia: cuenta todo el día, como la pantalla de cierre (spec 027)", () => {
  const p = (resultado) => ({ resultado });
  // 3 entregados, 1 no entregado en la ruta y 1 que nunca entró (sin ubicar).
  const pedidos = [p("entregado"), p("entregado"), p("entregado"), p("no_entregado"), p("pendiente")];
  assert.deepEqual(cierreDelDia(pedidos), { entregadas: 3, noEntregadas: 2 });
});
