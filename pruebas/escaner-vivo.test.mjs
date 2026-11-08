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
const CABECERA = {
  name: "EscanerVivo",
  methods: [
    { name: "iniciar", rtype: "promise" },
    { name: "detener", rtype: "promise" },
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

const { escanerVivoDisponible, iniciarEscanerVivo } = await import("@/lib/nativo/escaner-vivo");

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

test("ni la puerta ni las pantallas del escáner mandan nada a la red", () => {
  for (const ruta of [
    "../src/lib/nativo/escaner-vivo.ts",
    "../src/app/(conductor)/conductor/diagnostico/_componentes/probar-escaner-vivo.tsx",
    "../src/app/(conductor)/conductor/encomiendas/_hooks/use-escaner-vivo.ts",
    "../src/app/(conductor)/conductor/encomiendas/_componentes/escaner-vivo.tsx",
  ]) {
    const fuente = readFileSync(new URL(ruta, import.meta.url), "utf8");
    assert.doesNotMatch(fuente, /fetch\(|\/api\//, ruta);
  }
});
