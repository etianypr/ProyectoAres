// Política del service worker de la app del conductor (spec 015, R2): qué guarda
// y qué deja pasar. Lo que se protege: que nunca intercepte /api, Supabase ni
// Mapbox (ahí viajan datos), y que la app del conductor pueda abrir sin señal.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ORIGEN = "https://proyecto-ares-five.vercel.app";
const contexto = {
  self: { location: { origin: ORIGEN }, addEventListener() {} },
  URL,
};
vm.runInNewContext(readFileSync("public/sw.js", "utf8"), contexto);
const estrategia = (ruta, modo = "navigate", metodo = "GET") =>
  contexto.estrategiaPara(new URL(ruta, ORIGEN), modo, metodo);

test("la navegación del conductor va con red primero y copia de respaldo", () => {
  assert.equal(estrategia("/conductor"), "red-primero");
  assert.equal(estrategia("/conductor/encomiendas"), "red-primero");
  assert.equal(estrategia("/conductor/encomiendas?x=1"), "red-primero");
});

test("los estáticos de Next van de la caché", () => {
  assert.equal(estrategia("/_next/static/chunks/app.js", "no-cors"), "cache-primero");
});

test("nunca intercepta lo que lleva datos", () => {
  assert.equal(estrategia("/api/whatsapp/status", "cors"), "red");
  assert.equal(estrategia("/conductor/encomiendas", "navigate", "POST"), "red");
  assert.equal(estrategia("https://abc.supabase.co/rest/v1/encomienda_actividad", "cors"), "red");
  assert.equal(estrategia("https://api.mapbox.com/directions/v5/x", "cors"), "red");
});

test("el panel del jefe y el login no se guardan", () => {
  assert.equal(estrategia("/encomiendas"), "red");
  assert.equal(estrategia("/login"), "red");
  assert.equal(estrategia("/conductorx"), "red");
});
