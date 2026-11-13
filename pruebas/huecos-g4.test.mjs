// Spec 033, G4 (marco, login y Diagnóstico): los mensajes de Auth en español y sin
// confundir «sin señal» con «clave mala», el orden de cerrar sesión (primero la
// sesión, después el borrado; dueño 2026-11-13), el aviso de la APK que la ✕
// esconde hasta volver a abrir la app, y «Tus días» sin la alarma de un día que ya
// no tiene datos. Nada inicia ni cierra sesión de verdad: la server action es un
// doble. IndexedDB real (fake-indexeddb); sin datos de nadie.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const { mensajeLogin, mensajeClave, mensajeOlvido, tipoErrorAuth, esSinSenal } = await import("@/lib/auth/errores");
const { salirYBorrar, terminarBorradoPendiente } = await import("@/lib/encomiendas/local/salida");
const { mostrarAvisoApk } = await import("@/lib/nativo/version");
const { lineaDelDia, sinEnviarPorFecha } = await import("@/lib/encomiendas/local/dias-del-menu");
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

// Errores con la forma que devuelve supabase-js.
const RED = { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" };
const CAIDO = { name: "AuthRetryableFetchError", status: 503 };
const CLAVE_MALA = { name: "AuthApiError", status: 400, code: "invalid_credentials", message: "Invalid login credentials" };
const LIMITE = { name: "AuthApiError", status: 429, code: "over_request_rate_limit" };

test("login: clave mala, sin señal, Supabase caído y demasiados intentos dicen cosas distintas", () => {
  assert.equal(mensajeLogin(CLAVE_MALA), "Correo o contraseña incorrectos.");
  assert.equal(mensajeLogin(RED), "Sin señal. Intenta de nuevo.");
  assert.equal(mensajeLogin(CAIDO), "Sin señal. Intenta de nuevo.");
  assert.equal(mensajeLogin({ name: "TypeError", message: "fetch failed" }), "Sin señal. Intenta de nuevo.");
  assert.match(mensajeLogin(LIMITE), /^Demasiados intentos/);
  assert.equal(tipoErrorAuth({ status: 500 }), "red");
});

test("contraseña nueva: nunca el mensaje en inglés de Supabase", () => {
  const ingles = [
    { status: 422, code: "same_password", message: "New password should be different from the old password." },
    { name: "AuthWeakPasswordError", status: 422, code: "weak_password", message: "Password should be at least 8 characters." },
    RED,
    { name: "AuthSessionMissingError", status: 400, message: "Auth session missing!" },
    { status: 418, message: "Something else" },
  ];
  const textos = ingles.map(mensajeClave);
  assert.deepEqual(textos, [
    "Es la misma contraseña de antes.",
    "Contraseña muy débil.",
    "Sin señal. Intenta de nuevo.",
    "El enlace venció.",
    "No se pudo guardar la contraseña.",
  ]);
  for (const t of textos) assert.doesNotMatch(t, /password|session|missing/i);
});

test("enlace de /set-password: sin señal no es «venció»", () => {
  assert.equal(esSinSenal(RED), true);
  assert.equal(esSinSenal({ name: "AuthApiError", status: 403, code: "otp_expired" }), false);
  assert.equal(esSinSenal({ name: "AuthSessionMissingError", status: 400 }), false);
});

test("olvido: la misma respuesta exista o no el correo; sin señal y límite lo dicen", () => {
  const neutra = mensajeOlvido(null);
  assert.equal(neutra.ok, true);
  assert.match(neutra.texto, /^Si el correo está registrado/);
  // Un error que no es red ni límite (p. ej. un correo raro) no cambia la respuesta.
  assert.deepEqual(mensajeOlvido({ name: "AuthApiError", status: 400, code: "email_address_invalid" }), neutra);
  assert.deepEqual(mensajeOlvido(RED), { ok: false, texto: "Sin señal. Intenta de nuevo." });
  assert.equal(mensajeOlvido({ status: 429, code: "over_email_send_rate_limit" }).ok, false);
});

// ---- Cerrar sesión: primero la sesión, después el borrado ----

function registro() {
  const pasos = [];
  let marca = false;
  return {
    pasos,
    get marca() {
      return marca;
    },
    marcaDoble: {
      poner: () => {
        marca = true;
        pasos.push("marca");
      },
      quitar: () => {
        marca = false;
        pasos.push("sin-marca");
      },
      hay: () => marca,
    },
  };
}

test("cerrar sesión: primero la sesión, y solo con ok se borra", async () => {
  const r = registro();
  const resultado = await salirYBorrar({
    cerrarSesion: async () => {
      r.pasos.push("sesion");
      return { ok: true };
    },
    borrar: async () => {
      r.pasos.push("borrar");
    },
    marca: r.marcaDoble,
  });
  assert.deepEqual(resultado, { estado: "listo", borrado: true });
  assert.deepEqual(r.pasos, ["sesion", "marca", "borrar", "sin-marca"]);
});

test("cerrar sesión sin señal: no se borra nada", async () => {
  for (const cerrarSesion of [
    async () => {
      throw new TypeError("Failed to fetch");
    },
    async () => ({ error: "sin-senal" }),
  ]) {
    const r = registro();
    const resultado = await salirYBorrar({
      cerrarSesion,
      borrar: async () => r.pasos.push("borrar"),
      marca: r.marcaDoble,
    });
    assert.deepEqual(resultado, { estado: "sin-senal" });
    assert.deepEqual(r.pasos, [], "ni marca ni borrado");
  }
  const r = registro();
  const noCerro = await salirYBorrar({
    cerrarSesion: async () => ({ error: "no-cerro" }),
    borrar: async () => r.pasos.push("borrar"),
    marca: r.marcaDoble,
  });
  assert.deepEqual(noCerro, { estado: "no-cerro" });
  assert.deepEqual(r.pasos, []);
});

test("si el borrado falla tras cerrar la sesión, la marca queda y /login lo termina", async () => {
  const r = registro();
  const resultado = await salirYBorrar({
    cerrarSesion: async () => ({ ok: true }),
    borrar: async () => {
      throw new Error("IndexedDB trabada");
    },
    marca: r.marcaDoble,
  });
  assert.deepEqual(resultado, { estado: "listo", borrado: false });
  assert.equal(r.marca, true);

  let borrados = 0;
  assert.equal(await terminarBorradoPendiente(async () => void borrados++, r.marcaDoble), true);
  assert.equal(borrados, 1);
  assert.equal(r.marca, false);
  // Sin marca (sesión vencida en plena ruta) /login no borra nada.
  assert.equal(await terminarBorradoPendiente(async () => void borrados++, r.marcaDoble), false);
  assert.equal(borrados, 1);
});

test("de punta a punta: con la sesión cerrada se borran los pedidos y la cola queda", async () => {
  await idb.escribir([idb.STORES.pedidos, idb.STORES.cola], ({ guardar }) => {
    guardar(idb.STORES.pedidos, pedidoDePrueba("p-salida", "2026-11-13"));
    guardar(idb.STORES.cola, eventoDePrueba("e-salida", "2026-11-13"));
  });
  const resultado = await salirYBorrar({ cerrarSesion: async () => ({ ok: true }) });
  assert.deepEqual(resultado, { estado: "listo", borrado: true });
  assert.equal((await idb.leerTodos(idb.STORES.pedidos)).length, 0);
  assert.equal((await almacen.leerCola()).length, 1, "la cola no se toca");
  await idb.escribir([idb.STORES.cola], ({ borrar }) => borrar(idb.STORES.cola, "e-salida"));
});

// ---- Aviso de la APK ----

test("aviso de la APK: sale si es más vieja que la publicada, y la ✕ lo esconde para esa versión", () => {
  assert.equal(mostrarAvisoApk("1.7.0", "1.8.0", null), true);
  assert.equal(mostrarAvisoApk("1.8.0", "1.8.0", null), false, "al día");
  assert.equal(mostrarAvisoApk(null, "1.8.0", null), false, "fuera de la APK");
  assert.equal(mostrarAvisoApk("1.7.0", null, null), false, "sin APK_VERSION_MINIMA");
  assert.equal(mostrarAvisoApk("1.7.0", "1.8.0", "1.8.0"), false, "escondida en esta apertura");
  assert.equal(mostrarAvisoApk("1.7.0", "1.9.0", "1.8.0"), true, "una versión más nueva vuelve a avisar");
});

// ---- «Tus días» ----

const DIA = (fecha, extra = {}) => ({ fecha, cierre: null, paradas: 12, ...extra });

test("«Quedó sin cerrar» solo si el día todavía tiene datos en el teléfono", () => {
  const sinEnviar = new Map();
  const conDatos = new Set(["2026-11-11"]);
  const opciones = { fechaActiva: "2026-11-13", conDatos, sinEnviar };
  assert.deepEqual(lineaDelDia(DIA("2026-11-13"), opciones), { texto: "Hoy", alarma: false, sinEnviar: 0 });
  assert.deepEqual(lineaDelDia(DIA("2026-11-11"), opciones), { texto: "Quedó sin cerrar", alarma: true, sinEnviar: 0 });
  assert.deepEqual(lineaDelDia(DIA("2026-11-10"), opciones), { texto: "12 paradas", alarma: false, sinEnviar: 0 });
  assert.equal(lineaDelDia(DIA("2026-11-09", { cierre: "2026-11-09T22:00:00Z", paradas: 1 }), opciones).texto, "1 parada");
});

test("un día pasado con registros en la cola dice cuántos", () => {
  const cola = [{ fecha: "2026-11-10" }, { fecha: "2026-11-10" }, { fecha: "2026-11-13" }];
  const sinEnviar = sinEnviarPorFecha(cola);
  assert.equal(sinEnviar.get("2026-11-10"), 2);
  const linea = lineaDelDia(DIA("2026-11-10"), { fechaActiva: "2026-11-13", conDatos: new Set(), sinEnviar });
  assert.deepEqual(linea, { texto: "12 paradas", alarma: false, sinEnviar: 2 });
});

test("fechasConDatos: un día borrado (solo su resumen) no cuenta", async () => {
  await idb.escribir([idb.STORES.pedidos, idb.STORES.dias], ({ guardar }) => {
    guardar(idb.STORES.pedidos, pedidoDePrueba("p-vivo", "2026-11-12"));
    guardar(idb.STORES.dias, { fecha: "2026-11-08", asignados: 3, paradas: 3, entregadas: 3, noEntregadas: 0, contactados: null, porPagar: 0, cobrado: 0, aCobrar: 0, inicio: null, cierre: null });
  });
  const fechas = await almacen.fechasConDatos();
  assert.equal(fechas.has("2026-11-12"), true);
  assert.equal(fechas.has("2026-11-08"), false);
  await idb.escribir([idb.STORES.pedidos, idb.STORES.dias], ({ borrar }) => {
    borrar(idb.STORES.pedidos, "p-vivo");
    borrar(idb.STORES.dias, "2026-11-08");
  });
});

function pedidoDePrueba(id, fecha) {
  return {
    id,
    fecha,
    of: "900100",
    nombre: "Destinatario 1",
    telefono: null,
    direccion: "Avenida Diego Portales 1111",
    lat: null,
    lng: null,
    resultado: "pendiente",
    cargadoEn: `${fecha}T08:00:00.000Z`,
  };
}

function eventoDePrueba(id, fecha) {
  return { id, conductorId: "c-prueba", fecha, tipo: "entregado", hora: `${fecha}T12:00:00.000Z`, retenerHasta: null };
}
