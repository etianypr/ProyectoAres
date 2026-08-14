// El id lo genera el TELÉFONO, no la base (migración 0026). De eso depende que
// reenviar un evento de la cola offline no cuente la entrega dos veces: el
// mismo id choca contra la primary key y el servidor lo ignora. Si estos ids
// estuvieran mal formados o se repitieran, se rompe esa garantía.
import test from "node:test";
import assert from "node:assert/strict";
import { uuidv7 } from "@/lib/uuid";
import { cn } from "@/lib/utils";

const FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("tiene el formato de un UUID", () => {
  for (let i = 0; i < 200; i++) assert.match(uuidv7(), FORMATO);
});

test("declara versión 7 y variante RFC", () => {
  // Sin esto Postgres igual lo acepta (es un uuid), pero deja de ser v7 y se
  // pierde el orden temporal que evita fragmentar el índice.
  for (let i = 0; i < 200; i++) {
    const id = uuidv7();
    assert.equal(id[14], "7", `versión incorrecta en ${id}`);
    assert.ok("89ab".includes(id[19]), `variante incorrecta en ${id}`);
  }
});

test("no se repite ni generando miles seguidos", () => {
  // Es LA garantía de la idempotencia: dos eventos con el mismo id serían uno
  // solo para el servidor, y se perdería una entrega del sueldo del chofer.
  const ids = new Set();
  for (let i = 0; i < 20_000; i++) ids.add(uuidv7());
  assert.equal(ids.size, 20_000, "hubo ids repetidos");
});

test("los generados después ordenan después (v7 lleva la hora adelante)", async () => {
  const antes = uuidv7();
  await new Promise((r) => setTimeout(r, 5));
  const despues = uuidv7();
  assert.ok(antes < despues, `${antes} debería ordenar antes que ${despues}`);
});

test("los primeros 48 bits son la hora Unix en milisegundos", () => {
  const antes = Date.now();
  const id = uuidv7();
  const despues = Date.now();
  const ms = parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
  assert.ok(ms >= antes && ms <= despues, `la hora del id (${ms}) no cae entre ${antes} y ${despues}`);
});

test("cn junta clases y deja ganar a la última de Tailwind", () => {
  assert.equal(cn("px-2", "py-1"), "px-2 py-1");
  assert.equal(cn("px-2", "px-4"), "px-4", "tailwind-merge tiene que resolver el conflicto");
  assert.equal(cn("a", false && "b", null, undefined, "c"), "a c");
  assert.equal(cn(), "");
});
