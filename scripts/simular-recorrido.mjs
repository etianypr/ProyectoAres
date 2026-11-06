// Mueve la ubicación del emulador o de un teléfono real por la línea del día de
// ARES, parada por parada, para probar la burbuja sobre Google Maps sin manejar
// (spec 020, T017): Google Maps navega con esa ubicación y ARES también la ve (con
// el GPS simulado del modo prueba APAGADO, que solo mueve a ARES).
//
// Llega a la parada activa por su tramo de la línea del día (o en línea recta si
// no tiene) y espera ahí hasta que se cierre en ARES o en la burbuja; entonces
// sigue a la siguiente. Si la parada activa cambia en el camino ("Deshacer",
// "Dejar como pendiente"), cambia de rumbo.
//
// Uso, con la APK de depuración, el emulador abierto o el teléfono por USB, y un día
// con ruta:
//   node scripts/simular-recorrido.mjs [--kmh 40] [--desde-partida]
//
// En un teléfono el auto sale de donde está el teléfono (para manejar por calles hasta
// la parada 1, arma la ruta "Desde: Mi ubicación"); con --desde-partida, y siempre en
// el emulador, sale de la partida de la ruta.
//
// Lee la ruta de la base del teléfono por las DevTools de la WebView (solo ids,
// coordenadas y resultado: nada de nombres ni direcciones, y nada sale del PC). En el
// emulador mueve el GPS con `adb emu geo fix`; en un teléfono, con el receptor
// `MoverGps` que solo trae la APK de depuración (ARES queda como "app de ubicación de
// prueba"), y al terminar o con Ctrl+C devuelve el GPS real. No consulta ningún
// servicio: US$0.
import { execFileSync } from "node:child_process";
import path from "node:path";

const ADB = process.env.ADB ?? path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk", "platform-tools", "adb.exe");
const PAQUETE = "cl.dashund.ares";
const PUERTO = 9333;
const kmh = Number(process.argv[process.argv.indexOf("--kmh") + 1]) || 40;
const METROS_POR_SEGUNDO = kmh / 3.6;
/** Cada cuántos pasos se vuelve a mirar si la parada activa cambió. */
const PASOS_ENTRE_LECTURAS = 3;

const adbSinSerie = (...args) => execFileSync(ADB, args, { encoding: "utf8" }).trim();

/** El dispositivo en línea. adb puede listar emuladores que quedaron "offline" de
 *  un arranque fallido, y sin elegir uno contesta "more than one device". */
function serieDelDispositivo() {
  if (process.env.ANDROID_SERIAL) return process.env.ANDROID_SERIAL;
  const enLinea = adbSinSerie("devices")
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter(([, estado]) => estado === "device")
    .map(([serie]) => serie);
  if (enLinea.length !== 1) {
    throw new Error(`Hay ${enLinea.length} dispositivos en línea: elige uno con ANDROID_SERIAL.`);
  }
  return enLinea[0];
}

const SERIE = serieDelDispositivo();
const ES_EMULADOR = SERIE.startsWith("emulator-");
const adb = (...args) => adbSinSerie("-s", SERIE, ...args);
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

function distancia([lng1, lat1], [lng2, lat2]) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/** Hacia dónde apunta el auto, en grados desde el norte. */
function rumbo([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

function fijarGps([lng, lat], grados = -1, velocidad = 0) {
  if (ES_EMULADOR) {
    // El emulador recibe primero la longitud.
    adb("emu", "geo", "fix", String(lng), String(lat));
    return;
  }
  const r = adb("shell", "am", "broadcast", "-n", `${PAQUETE}/.MoverGps`, "-a", "cl.dashund.ares.MOVER_GPS",
    "--es", "lat", String(lat), "--es", "lng", String(lng), "--es", "rumbo", String(grados), "--es", "velocidad", String(velocidad));
  if (/result=2/.test(r)) throw new Error("ARES no es la app de ubicación de prueba del teléfono.");
  if (!/result=0/.test(r)) throw new Error("La APK instalada no trae MoverGps: instala la de depuración.");
}

/** Devuelve el GPS real del teléfono (en el emulador no hace falta). */
function devolverGps() {
  if (ES_EMULADOR) return;
  try {
    adb("shell", "am", "broadcast", "-n", `${PAQUETE}/.MoverGps`, "-a", "cl.dashund.ares.PARAR_GPS");
    console.log("GPS real devuelto.");
  } catch {
    console.error("No se pudo devolver el GPS real: reinicia el teléfono o desinstala la APK de depuración.");
  }
}

// ── La base del teléfono, por DevTools ──────────────────────────────────────

let socket;
let siguienteId = 1;
const pendientes = new Map();

async function conectar() {
  const pid = adb("shell", "pidof", PAQUETE).split(/\s+/)[0];
  if (!pid) throw new Error("ARES no está abierto en el teléfono.");
  adb("forward", `tcp:${PUERTO}`, `localabstract:webview_devtools_remote_${pid}`);
  const paginas = await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json();
  const pagina = paginas.find((p) => p.type === "page" && p.url.includes("/conductor"));
  if (!pagina) throw new Error("La WebView de ARES no está en /conductor (¿falta iniciar sesión?).");
  socket = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((listo, error) => {
    socket.onopen = listo;
    socket.onerror = () => error(new Error("No se pudo conectar a la WebView."));
  });
  socket.onmessage = (m) => {
    const datos = JSON.parse(m.data);
    const espera = pendientes.get(datos.id);
    if (!espera) return;
    pendientes.delete(datos.id);
    if (datos.result?.exceptionDetails) espera.error(new Error(datos.result.exceptionDetails.text));
    else espera.listo(datos.result?.result?.value);
  };
  socket.onclose = () => {
    socket = null;
    // Lo que esperaba respuesta no va a tenerla: sin esto el script se quedaba
    // esperando y Node terminaba sin avisar.
    for (const espera of pendientes.values()) espera.error(new Error("se cortó la conexión con ARES"));
    pendientes.clear();
  };
}

function evaluar(expresion) {
  const id = siguienteId++;
  return new Promise((listo, error) => {
    const vence = setTimeout(() => {
      pendientes.delete(id);
      error(new Error("ARES no contestó"));
      // Con Google Maps adelante la página de ARES va más lenta: 10 s se quedaban cortos.
    }, 20000);
    pendientes.set(id, {
      listo: (v) => (clearTimeout(vence), listo(v)),
      error: (e) => (clearTimeout(vence), error(e)),
    });
    socket.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression: expresion, awaitPromise: true, returnByValue: true },
    }));
  });
}

/** La ruta abierta y sus pedidos (solo lo que hace falta para moverse). */
const LEER_DIA = `(async () => {
  const base = await new Promise((ok, mal) => {
    const s = indexedDB.open("dashund-encomiendas");
    s.onsuccess = () => ok(s.result);
    s.onerror = () => mal(s.error);
  });
  const todos = (store) => new Promise((ok, mal) => {
    const s = base.transaction(store).objectStore(store).getAll();
    s.onsuccess = () => ok(s.result);
    s.onerror = () => mal(s.error);
  });
  const rutas = await todos("rutas");
  const pedidos = await todos("pedidos");
  base.close();
  const ruta = rutas.filter((r) => !r.cierre).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0] ?? null;
  return JSON.stringify({
    ruta: ruta && { orden: ruta.orden, trazado: ruta.trazado, tramos: ruta.tramos ?? null, partida: ruta.partida ?? null },
    pedidos: pedidos.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, resultado: p.resultado })),
  });
})()`;

/** Dónde está el teléfono de verdad, antes de simular nada. null si no se pudo. */
async function ubicacionReal() {
  try {
    if (!socket) await conectar();
    // Una lectura de hasta un minuto sirve: pedir una nueva puede tardar más de lo
    // que ARES contesta, sobre todo bajo techo.
    const valor = await evaluar(`new Promise((ok) => navigator.geolocation.getCurrentPosition(
      (p) => ok(JSON.stringify([p.coords.longitude, p.coords.latitude])),
      () => ok("null"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }))`);
    return JSON.parse(valor);
  } catch {
    return null;
  }
}

/** Reintenta un minuto: ARES puede estar recargando la página o volviendo de
 *  otra app. */
async function leerDia() {
  for (let intento = 1; ; intento++) {
    try {
      if (!socket) await conectar();
      return JSON.parse(await evaluar(LEER_DIA));
    } catch (e) {
      if (intento >= 20) throw e;
      console.log(`  Sin conexión con ARES (${e.message}); reintento en 3 s…`);
      socket?.close();
      socket = null;
      await esperar(3000);
    }
  }
}

/** La parada activa: la primera de la ruta que sigue pendiente y tiene punto. */
function activaDe({ ruta, pedidos }) {
  if (!ruta) return null;
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const orden = ruta.orden.filter((id) => porId.get(id)?.resultado === "pendiente");
  const id = orden.find((i) => porId.get(i).lat != null);
  return id ? { ...porId.get(id), numero: ruta.orden.indexOf(id) + 1 } : null;
}

/** Por el tramo de la línea del día, desde el punto más cercano a donde va el
 *  auto; sin tramo (o muy lejos de él), en línea recta. */
function caminoHacia({ ruta }, activa, desde) {
  const destino = [activa.lng, activa.lat];
  const tramo = ruta.tramos?.find((t) => t.pedidoId === activa.id);
  const trazado = ruta.trazado ?? [];
  if (!tramo || tramo.desde < 0 || tramo.hasta >= trazado.length || tramo.desde >= tramo.hasta) {
    return [desde, destino];
  }
  const linea = trazado.slice(tramo.desde, tramo.hasta + 1);
  let cerca = 0;
  linea.forEach((p, i) => {
    if (distancia(p, desde) < distancia(linea[cerca], desde)) cerca = i;
  });
  if (distancia(linea[cerca], desde) > 150) return [desde, destino];
  return [desde, ...linea.slice(cerca), destino];
}

/** Avanza por el camino a la velocidad elegida, un punto por segundo. false si
 *  la parada activa cambió en el camino. */
async function recorrer(camino, activaId, alMoverse) {
  let actual = camino[0];
  let paso = 0;
  for (let i = 1; i < camino.length; i++) {
    const hasta = camino[i];
    let falta = distancia(actual, hasta);
    while (falta > 0.5) {
      const avance = Math.min(METROS_POR_SEGUNDO, falta);
      const t = avance / falta;
      actual = [actual[0] + (hasta[0] - actual[0]) * t, actual[1] + (hasta[1] - actual[1]) * t];
      falta -= avance;
      fijarGps(actual, rumbo(actual, hasta), METROS_POR_SEGUNDO);
      alMoverse(actual);
      await esperar(1000);
      if (++paso % PASOS_ENTRE_LECTURAS === 0 && activaDe(await leerDia())?.id !== activaId) return false;
    }
    actual = hasta;
  }
  return true;
}

async function main() {
  let dia = await leerDia();
  if (!dia.ruta) throw new Error("No hay una ruta abierta: arma la ruta del día en ARES primero.");
  let posicion = dia.ruta.partida ? [dia.ruta.partida.lng, dia.ruta.partida.lat] : dia.ruta.trazado?.[0];
  let desde = "la partida de la ruta";
  if (!ES_EMULADOR && !process.argv.includes("--desde-partida")) {
    const aqui = await ubicacionReal();
    if (aqui) {
      posicion = aqui;
      desde = "la ubicación actual del teléfono";
    } else {
      console.log("No se pudo leer la ubicación del teléfono: sale de la partida de la ruta.");
    }
  }
  if (!posicion) throw new Error("La ruta no tiene partida ni trazado.");
  // En un teléfono, ARES pasa a ser la app de ubicación de prueba (opciones de desarrollador).
  if (!ES_EMULADOR) adb("shell", "appops", "set", PAQUETE, "android:mock_location", "allow");
  fijarGps(posicion);
  console.log(`Auto en ${desde}, a ${kmh} km/h. Ctrl+C para parar.`);

  for (;;) {
    dia = await leerDia();
    const activa = activaDe(dia);
    if (!activa) {
      console.log("No quedan paradas pendientes con punto: fin del recorrido.");
      return;
    }
    const camino = caminoHacia(dia, activa, posicion);
    const metros = camino.slice(1).reduce((s, p, i) => s + distancia(camino[i], p), 0);
    console.log(`→ Parada ${activa.numero}: ${Math.round(metros)} m`);
    const llego = await recorrer(camino, activa.id, (p) => (posicion = p));
    if (!llego) {
      console.log("  La parada activa cambió: cambio de rumbo.");
      continue;
    }
    posicion = [activa.lng, activa.lat];
    console.log("  En la parada. Ciérrala en ARES o en la burbuja para seguir.");
    // Detenido, la ubicación se repite: sin lecturas nuevas Google Maps cree que
    // se perdió la señal.
    while (activaDe(await leerDia())?.id === activa.id) {
      fijarGps(posicion);
      await esperar(2000);
    }
  }
}

process.on("SIGINT", () => {
  devolverGps();
  process.exit(130);
});

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => {
    devolverGps();
    socket?.close();
  });
