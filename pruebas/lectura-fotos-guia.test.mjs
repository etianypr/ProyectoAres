// Spec 038: cada foto de la guía se achica al tomarla (adelantarCompresionGuia) en vez de todas
// al tocar «Leer direcciones». Lo que se fija: a /api/lectura van los MISMOS bytes que sin
// adelantar, se achica de a una (spec 017, E10: un teléfono barato se queda sin memoria), la
// reducción a 1400 px se sigue decidiendo al leer y una compresión fallida se reintenta al leer.
//
// La compresión del navegador (createImageBitmap y el canvas) va en un doble que deja en los
// bytes de salida de dónde salió cada foto y a qué tamaño; el `fetch` global contesta como
// /api/texto (apagada) y /api/lectura. Sin red.
import test from "node:test";
import assert from "node:assert/strict";

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));
const doble = { compresiones: 0, activas: 0, maxActivas: 0, fallarUna: false };

globalThis.createImageBitmap = async (blob) => {
  doble.compresiones++;
  doble.activas++;
  doble.maxActivas = Math.max(doble.maxActivas, doble.activas);
  await esperar(3);
  if (doble.fallarUna) {
    doble.fallarUna = false;
    doble.activas--;
    throw new Error("sin memoria");
  }
  return { width: 4000, height: 3000, fuente: blob, close() {} };
};
globalThis.document = {
  createElement: () => {
    const lienzo = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (imagen) => (lienzo.imagen = imagen) }),
      toBlob: (listo) => {
        void lienzo.imagen.fuente.arrayBuffer().then(async (b) => {
          await esperar(2);
          doble.activas--;
          // Lo mismo que entra más el tamaño: dos compresiones iguales dan bytes iguales.
          listo(new Blob([new Uint8Array(b), `|${lienzo.width}x${lienzo.height}`], { type: "image/jpeg" }));
        });
      },
    };
    return lienzo;
  },
};

let enviadas = [];
globalThis.fetch = async (url, init) => {
  if (url === "/api/texto") return new Response(JSON.stringify({ error: "apagada" }), { status: 503 });
  assert.equal(url, "/api/lectura");
  enviadas = await Promise.all(init.body.getAll("imagen").map(async (f) => Buffer.from(await f.arrayBuffer()).toString("base64")));
  const guia = { folio: null, totalDeclarado: null, lineas: [{ of: "900101", destino: "Pasaje Inventado 901" }] };
  return new Response(JSON.stringify({ tipo: "guia", guia }), { status: 200, headers: { "content-type": "application/json" } });
};

const { leerFotosGuia, adelantarCompresionGuia } = await import("@/lib/encomiendas/local/lectura-cliente");

const foto = (n, bytes = 3) => new Blob([new Uint8Array(bytes).fill(n)], { type: "image/jpeg" });
test.beforeEach(() => {
  Object.assign(doble, { compresiones: 0, activas: 0, maxActivas: 0, fallarUna: false });
  enviadas = [];
});

async function sinAdelantar(fotos) {
  await leerFotosGuia(fotos, { ia: true });
  return { enviadas, compresiones: doble.compresiones };
}

test("adelantada al tomarla: los mismos bytes a /api/lectura y ninguna compresión de más al leer", async () => {
  const antes = await sinAdelantar([foto(1), foto(2), foto(3)]);
  assert.equal(antes.compresiones, 3);

  doble.compresiones = 0;
  const fotos = [foto(1), foto(2), foto(3)];
  // Las 3 de la galería de una vez: se achican de a una.
  for (const f of fotos) adelantarCompresionGuia(f);
  await esperar(60);
  assert.equal(doble.compresiones, 3);
  assert.equal(doble.maxActivas, 1, "se achicaron varias a la vez");
  const r = await leerFotosGuia(fotos, { ia: true });
  assert.equal(doble.compresiones, 3, "al leer se volvió a achicar");
  assert.deepEqual(enviadas, antes.enviadas);
  assert.equal(r.fuente, "ia");
  assert.equal(r.guia.lineas.length, 1);
});

test("«Leer direcciones» antes de que termine de achicar: espera a la misma compresión, no hace otra", async () => {
  const antes = await sinAdelantar([foto(4), foto(5)]);
  doble.compresiones = 0;
  doble.maxActivas = 0;
  const fotos = [foto(4), foto(5)];
  for (const f of fotos) adelantarCompresionGuia(f);
  await leerFotosGuia(fotos, { ia: true });
  assert.equal(doble.compresiones, 2);
  assert.equal(doble.maxActivas, 1);
  assert.deepEqual(enviadas, antes.enviadas);
});

test("la reducción a 1400 px se sigue decidiendo al leer, con todas a la vista", async () => {
  const grandes = () => [foto(6, 1_300_000), foto(7, 1_300_000), foto(8, 1_300_000)];
  const antes = await sinAdelantar(grandes());
  assert.equal(antes.compresiones, 6, "3 a 2000 px y 3 a 1400 px");
  doble.compresiones = 0;
  const fotos = grandes();
  for (const f of fotos) adelantarCompresionGuia(f);
  await leerFotosGuia(fotos, { ia: true });
  assert.equal(doble.compresiones, 6);
  assert.deepEqual(enviadas, antes.enviadas);
  assert.ok(enviadas.every((b) => Buffer.from(b, "base64").toString("latin1").endsWith("|1400x1050")));
});

test("si la compresión adelantada falla, se vuelve a intentar al leer", async () => {
  const antes = await sinAdelantar([foto(9)]);
  doble.compresiones = 0;
  doble.fallarUna = true;
  const f = foto(9);
  adelantarCompresionGuia(f);
  await esperar(20);
  await leerFotosGuia([f], { ia: true });
  assert.equal(doble.compresiones, 2);
  assert.deepEqual(enviadas, antes.enviadas);
});
