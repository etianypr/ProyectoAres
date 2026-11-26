// El escáner en vivo (spec 028): la puerta web al plugin nativo `EscanerVivo`,
// dentro de una APK simulada (el puente de Capacitor contesta como Android). Se
// prueba que solo se ofrece con una APK que lo trae, que cada cuadro llega a
// quien escucha, que apagarlo suelta la escucha y la cámara, y que nada sale a la
// red. La cámara y ML Kit se prueban en el teléfono (Diagnóstico → «Probar
// escáner en vivo»).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const llamadas = [];
const escuchas = new Map();
let rechazoIniciar = null;
/** Lo que contesta Android a cada método (spec 036: `iniciar` y `marcar` traen datos). */
const respuestas = {};
const CABECERA = {
  name: "EscanerVivo",
  methods: [
    { name: "iniciar", rtype: "promise" },
    { name: "detener", rtype: "promise" },
    { name: "marcar", rtype: "promise" },
    { name: "capturar", rtype: "promise" },
    { name: "girarTexto", rtype: "promise" },
    { name: "addListener", rtype: "callback" },
    { name: "removeListener", rtype: "promise" },
  ],
};
globalThis.window = globalThis;
globalThis.androidBridge = {};
globalThis.Capacitor = {
  PluginHeaders: [CABECERA],
  nativePromise: async (plugin, metodo, opciones) => {
    llamadas.push({ plugin, metodo, opciones });
    if (metodo === "iniciar" && rechazoIniciar) throw new Error(rechazoIniciar);
    if (metodo === "removeListener") escuchas.delete(opciones.callbackId);
    return respuestas[metodo];
  },
  nativeCallback: (plugin, metodo, opciones, alEvento) => {
    llamadas.push({ plugin, metodo, opciones });
    const id = `escucha-${escuchas.size + 1}`;
    escuchas.set(id, { evento: opciones.eventName, alEvento });
    return id;
  },
};
const salidas = [];
globalThis.fetch = async (url) => {
  salidas.push(String(url));
  throw new Error("el escáner no sale a la red");
};

// El localStorage del teléfono, en memoria (lo elegido en Diagnóstico).
const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => guardado.get(k) ?? null,
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k),
};

const {
  capturarViva,
  cuadrosALaVez,
  elegirCuadrosALaVez,
  elegirEscanerClasico,
  escanerVivoDisponible,
  girarTextoVivo,
  iniciarEscanerVivo,
  marcarEscanerVivo,
  pantallaDelCuadro,
  usarEscanerVivo,
} = await import("@/lib/nativo/escaner-vivo");

const CUADRO = {
  codigos: ["92000022560000200000002001"],
  renglones: [{ texto: "DESTINATARIO: ANA ROJAS", x: 10, y: 20, ancho: 300, alto: 24 }],
  ancho: 1080,
  alto: 1920,
  ms: 180,
};

test.beforeEach(() => {
  llamadas.length = 0;
  rechazoIniciar = null;
  globalThis.Capacitor.PluginHeaders = [CABECERA];
});

test("se ofrece con una APK que trae el plugin (1.6.0); sin él, ver escaner-vivo-sin-plugin", () => {
  assert.equal(escanerVivoDisponible(), true);
});

test("cargar el auto usa la cámara en vivo hasta que se elige el escáner de Google en Diagnóstico", () => {
  // Auditoría del día real (2026-11-10): si la cámara en vivo se traba ese día,
  // el conductor tiene una salida sin reinstalar nada.
  guardado.clear();
  assert.equal(usarEscanerVivo(), true, "por defecto, en vivo (como lo dejó el dueño)");
  elegirEscanerClasico(true);
  assert.equal(usarEscanerVivo(), false);
  elegirEscanerClasico(false);
  assert.equal(usarEscanerVivo(), true);

  elegirEscanerClasico(true);
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => {
      throw new Error("bloqueado");
    },
  };
  assert.equal(usarEscanerVivo(), true, "sin localStorage, en vivo");
  globalThis.localStorage = original;
  guardado.clear();
});

test("cada cuadro llega a quien escucha; apagarlo suelta la escucha y la cámara", async () => {
  const recibidos = [];
  const { apagar } = await iniciarEscanerVivo((c) => recibidos.push(c));
  assert.deepEqual(
    llamadas.map((l) => l.metodo),
    ["addListener", "iniciar"],
    "primero la escucha, después la cámara: no se pierde el primer cuadro",
  );
  const [escucha] = [...escuchas.values()];
  assert.equal(escucha.evento, "cuadro");
  escucha.alEvento(CUADRO);
  assert.deepEqual(recibidos, [CUADRO]);

  await apagar();
  assert.deepEqual(llamadas.slice(2).map((l) => l.metodo), ["removeListener", "detener"]);
  assert.equal(escuchas.size, 0);
  assert.deepEqual(salidas, []);
});

test("sin permiso de cámara falla y no deja la escucha colgando", async () => {
  rechazoIniciar = "permiso_denegado";
  await assert.rejects(() => iniciarEscanerVivo(() => {}), /permiso_denegado/);
  assert.equal(escuchas.size, 0);
});

// ------------------------------------------------------- spec 036: flechas y cuadros a la vez

const CAJA = { x: 10, y: 20, ancho: 300, alto: 200, tipo: "confirmada", etiqueta: "✓ 270 000 101" };
const esperar = () => new Promise((listo) => setImmediate(listo));

test("sin flechas, marcar manda lo de siempre (una APK anterior no recibe nada que no conozca)", async () => {
  marcarEscanerVivo([CAJA]);
  await esperar();
  assert.deepEqual(llamadas.at(-1).opciones, { cajas: [CAJA] });
});

test("con flechas, marcar manda la zona libre y guarda dónde cae el cuadro en la pantalla", async () => {
  respuestas.iniciar = { linterna: true, captura: false, cuadrosFijos: 30, visor: false, flechas: true, enVuelo: 2 };
  const { camara, apagar } = await iniciarEscanerVivo(() => {}, { captura: false, codigos: false, enVuelo: 2 });
  assert.deepEqual(llamadas.find((l) => l.metodo === "iniciar").opciones, { captura: false, codigos: false, enVuelo: 2 });
  assert.deepEqual([camara.flechas, camara.enVuelo], [true, 2]);
  assert.equal(pantallaDelCuadro(), null, "al prender, todavía no se sabe");
  const zona = { x: 0.04, y: 0.2, ancho: 0.92, alto: 0.5 };
  const flechas = [{ sentido: "arriba", tipo: "falta", etiqueta: "270 000 202 · 3" }];
  respuestas.marcar = { pantalla: { x: -0.1, y: 0, ancho: 1.2, alto: 1 } };
  marcarEscanerVivo([CAJA], { zona, flechas });
  await esperar();
  assert.deepEqual(llamadas.at(-1).opciones, { cajas: [CAJA], flechas, zona });
  assert.deepEqual(pantallaDelCuadro(), { x: -0.1, y: 0, ancho: 1.2, alto: 1 });
  // Sin zona medida, van las flechas solas (Android usa la pantalla entera).
  marcarEscanerVivo([CAJA], { zona: null, flechas });
  await esperar();
  assert.deepEqual(llamadas.at(-1).opciones, { cajas: [CAJA], flechas });
  await apagar();
  delete respuestas.iniciar;
  delete respuestas.marcar;
});

test("una APK anterior no dice que trae flechas: queda en un cuadro a la vez y sin flechas", async () => {
  respuestas.iniciar = { linterna: false, captura: true, cuadrosFijos: 0, visor: false };
  const { camara, apagar } = await iniciarEscanerVivo(() => {});
  assert.deepEqual([camara.flechas, camara.enVuelo], [false, 1]);
  await apagar();
  delete respuestas.iniciar;
});

// ------------------------------------------------------- fotos del dueño (2026-11-25): APK 1.13.0

test("la foto del paquete se pide del cuadro; la APK 1.13.0 lo dice y una anterior no", async () => {
  respuestas.iniciar = { linterna: true, captura: true, cuadrosFijos: 0, visor: false, flechas: true, enVuelo: 1, fotoDelCuadro: true, giro: true };
  const nueva = await iniciarEscanerVivo(() => {}, { foto: "cuadro" });
  assert.deepEqual(llamadas.find((l) => l.metodo === "iniciar").opciones, { foto: "cuadro" });
  assert.deepEqual([nueva.camara.captura, nueva.camara.fotoDelCuadro, nueva.camara.giro], [true, true, true]);
  await nueva.apagar();
  // Una anterior ignora `foto` y saca la foto en alta como siempre.
  respuestas.iniciar = { linterna: true, captura: true, cuadrosFijos: 0, visor: false, flechas: true, enVuelo: 1 };
  const anterior = await iniciarEscanerVivo(() => {}, { foto: "cuadro" });
  assert.deepEqual([anterior.camara.captura, anterior.camara.fotoDelCuadro, anterior.camara.giro], [true, false, false]);
  await anterior.apagar();
  delete respuestas.iniciar;
});

test("girar el texto llega a la APK; si falla (una anterior no lo trae), no pasa nada", async () => {
  girarTextoVivo(180);
  await esperar();
  assert.deepEqual(llamadas.at(-1), { plugin: "EscanerVivo", metodo: "girarTexto", opciones: { grados: 180 } });
  const original = globalThis.Capacitor.nativePromise;
  globalThis.Capacitor.nativePromise = async () => {
    throw Object.assign(new Error("no implementado"), { code: "UNIMPLEMENTED" });
  };
  assert.doesNotThrow(() => girarTextoVivo(90));
  await esperar();
  globalThis.Capacitor.nativePromise = original;
});

test("la foto llega entera (base64 → JPEG) con sus códigos y su texto", async () => {
  const bytes = [0xff, 0xd8, 0xff, 0x00, 0x7f, 0x80, 0xd9];
  respuestas.capturar = { imagen: Buffer.from(bytes).toString("base64"), codigos: ["92000022560000200000002001"], texto: "O.F. 200000002" };
  const foto = await capturarViva();
  assert.deepEqual([...new Uint8Array(await foto.imagen.arrayBuffer())], bytes);
  assert.equal(foto.imagen.type, "image/jpeg");
  assert.deepEqual([foto.codigos, foto.texto], [["92000022560000200000002001"], "O.F. 200000002"]);
  delete respuestas.capturar;
});

test("cuántos cuadros a la vez se elige en Diagnóstico: por defecto uno", () => {
  guardado.clear();
  assert.equal(cuadrosALaVez(), 1);
  elegirCuadrosALaVez(2);
  assert.equal(cuadrosALaVez(), 2);
  elegirCuadrosALaVez(1);
  assert.equal(cuadrosALaVez(), 1);
  guardado.clear();
});

test("ni la puerta ni las pantallas del escáner mandan nada a la red", () => {
  for (const ruta of [
    "../src/lib/nativo/escaner-vivo.ts",
    "../src/app/(conductor)/conductor/diagnostico/_componentes/probar-escaner-vivo.tsx",
    "../src/app/(conductor)/conductor/encomiendas/_hooks/use-escaner-vivo.ts",
    "../src/app/(conductor)/conductor/encomiendas/_hooks/use-camara-viva.ts",
    "../src/app/(conductor)/conductor/encomiendas/_hooks/guardar-etiqueta-viva.ts",
    "../src/app/(conductor)/conductor/encomiendas/_componentes/escaner-vivo.tsx",
  ]) {
    const fuente = readFileSync(new URL(ruta, import.meta.url), "utf8");
    assert.doesNotMatch(fuente, /fetch\(|\/api\//, ruta);
  }
});
