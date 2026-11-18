// Spec 038, Diagnóstico «Tiempos» (lib/comun/cronometro.ts): cuánto espera el conductor en
// cada tramo, en localStorage. Fija lo que protege: solo etiquetas fijas y cifras (nunca un
// texto del pedido), un tope de anotaciones, y que medir nunca rompa el flujo (sin
// localStorage, lleno o con basura de otra versión).
import test from "node:test";
import assert from "node:assert/strict";

const crono = await import("@/lib/comun/cronometro");

/** Un localStorage de juguete; `lleno` hace fallar setItem como un almacenamiento sin espacio. */
function almacenFalso({ lleno = false } = {}) {
  const datos = new Map();
  return {
    datos,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => {
      if (lleno) throw new Error("QuotaExceededError");
      datos.set(k, String(v));
    },
    removeItem: (k) => datos.delete(k),
  };
}

/** Corre `fn` con ese localStorage y lo devuelve a como estaba al terminar (también si es async). */
function conAlmacen(almacen, fn) {
  const antes = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: almacen, configurable: true, writable: true });
  const devolver = () => {
    if (antes) Object.defineProperty(globalThis, "localStorage", antes);
    else delete globalThis.localStorage;
  };
  let r;
  try {
    r = fn();
  } catch (e) {
    devolver();
    throw e;
  }
  if (r && typeof r.then === "function") return r.finally(devolver);
  devolver();
  return r;
}

test("anota cifras por tramo y el resumen da n, mediana, p90 y la última", () => {
  conAlmacen(almacenFalso(), () => {
    for (const ms of [100, 300, 200, 400, 500]) crono.anotarTiempo("ruta.total", ms);
    crono.anotarTiempo("ia.idas", 2);
    const resumen = crono.resumenTiempos();
    const total = resumen.find((r) => r.tramo === "ruta.total");
    assert.deepEqual(
      { n: total.n, mediana: total.mediana, p90: total.p90, ultimo: total.ultimo, unidad: total.unidad },
      { n: 5, mediana: 300, p90: 500, ultimo: 500, unidad: "ms" },
    );
    // En el orden de TRAMOS, no en el de llegada.
    assert.deepEqual(
      resumen.map((r) => r.tramo),
      ["ruta.total", "ia.idas"],
    );
  });
});

test("solo guarda etiquetas conocidas y números: un texto no entra", () => {
  const almacen = almacenFalso();
  conAlmacen(almacen, () => {
    crono.anotarTiempo("Avenida Siempre Viva 742", 10);
    crono.anotarTiempo("osm.turno", Number.NaN);
    crono.anotarTiempo("osm.turno", 1200.6);
    const guardado = [...almacen.datos.values()].join("");
    assert.doesNotMatch(guardado, /Avenida|Viva/);
    const lista = crono.leerTiempos();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].tramo, "osm.turno");
    assert.equal(lista[0].valor, 1201);
    // Lo que se copia: tramos y cifras.
    assert.match(crono.tiemposEnTexto(), /^osm\.turno\tn=1\tmediana=1201/);
  });
});

test("guarda las últimas MAX_ANOTACIONES y bota las más viejas", () => {
  conAlmacen(almacenFalso(), () => {
    for (let i = 0; i < crono.MAX_ANOTACIONES + 25; i++) crono.anotarTiempo("google.consulta", i);
    const lista = crono.leerTiempos();
    assert.equal(lista.length, crono.MAX_ANOTACIONES);
    assert.equal(lista[0].valor, 25);
  });
});

test("sin localStorage, lleno o con basura no lanza y el trabajo medido devuelve lo mismo", async () => {
  // Sin localStorage (Node, modo privado).
  await conAlmacen(undefined, async () => {
    assert.equal(await crono.cronometrar("ruta.red", async () => 7), 7);
    assert.deepEqual(crono.leerTiempos(), []);
    assert.doesNotThrow(() => crono.borrarTiempos());
  });
  // Lleno: no anota, no lanza.
  conAlmacen(almacenFalso({ lleno: true }), () => {
    assert.doesNotThrow(() => crono.anotarTiempo("ruta.red", 5));
  });
  // Basura de otra versión: se ignora lo que no es una anotación válida.
  const almacen = almacenFalso();
  almacen.setItem("ares-tiempos", JSON.stringify([{ tramo: "ruta.red", valor: 9, cuando: 1 }, { tramo: "x", valor: 1 }, "hola"]));
  conAlmacen(almacen, () => assert.deepEqual(crono.leerTiempos().map((a) => a.valor), [9]));
  almacen.setItem("ares-tiempos", "{no es json");
  conAlmacen(almacen, () => assert.deepEqual(crono.leerTiempos(), []));
});

test("cronometrar mide aunque el trabajo lance, y el error sigue saliendo", async () => {
  await conAlmacen(almacenFalso(), async () => {
    await assert.rejects(
      crono.cronometrar("ruta.busqueda", async () => {
        throw new Error("cancelado");
      }),
      /cancelado/,
    );
    assert.equal(crono.leerTiempos().filter((a) => a.tramo === "ruta.busqueda").length, 1);
  });
});
