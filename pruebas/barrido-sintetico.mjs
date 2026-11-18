// Una nómina inventada y su barrido con la cámara, cuadro por cuadro, como los entrega ML
// Kit (spec 036): calles reales de Arica con números, nombres y OF inventados. Lo usan
// las pruebas del barrido de la nómina (nomina-*.test.mjs). Determinista: la misma
// semilla da los mismos cuadros.
//
// La hoja va renglón por renglón con su altura (px de un cuadro de 1080×1920, la letra a
// ~32 px de alto). La cámara baja por la hoja con algo de vaivén y en cada cuadro lee lo
// que entra entero, con los errores que se vieron en terreno: dígitos cambiados (con
// poca confianza, casi siempre), el TOTAL pegado a la OF, los números chicos perdidos,
// letras de la dirección cambiadas y renglones que no se leen.

/** mulberry32: números al azar repetibles. */
export function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CALLES = [
  "21 DE MAYO",
  "AV SANTA MARIA",
  "PATRICIO LYNCH",
  "BOLOGNESI",
  "AV DIEGO PORTALES",
  "18 DE SEPTIEMBRE",
  "SOTOMAYOR",
  "MAIPU",
  "BAQUEDANO",
  "COLON",
  "AV CHILE",
  "AV TUCAPEL",
  "CAPITAN AVALOS",
  "AV ALEJANDRO AZOLAS",
  "GENERAL VELASQUEZ",
];
const NOMBRES = ["JUAN PEREZ", "MARIA ROJAS", "PEDRO TAPIA", "ANA SOTO", "LUIS MUNOZ", "CARLA DIAZ"];

/** Los encargos de la nómina: OF de la misma serie (muchas a 1 o 2 dígitos de otra, como
 *  en un día real), una dirección y sus bultos (casi siempre 1). */
export function nominaInventada(n = 100, semilla = 36, { desde = null } = {}) {
  const r = azar(semilla);
  const encargos = [];
  // `desde` (spec 039): la serie del día, p. ej. 281 000 000 (dos «8» que el lector lee «0»).
  let base = desde ?? 270000000 + Math.floor(r() * 9000000);
  if (desde != null) r();
  for (let i = 0; i < n; i++) {
    base += 1 + Math.floor(r() * (r() < 0.6 ? 40 : 4000));
    const bultos = r() < 0.15 ? 2 : r() < 0.04 ? 3 : 1;
    encargos.push({
      of: String(base),
      destino: `${CALLES[Math.floor(r() * CALLES.length)]} ${100 + Math.floor(r() * 3800)}`,
      bultos,
      nombre: NOMBRES[Math.floor(r() * NOMBRES.length)],
    });
  }
  return encargos;
}

/** Separación entre renglones de la hoja (px del cuadro). */
export const PASO = 70;
const ALTO_LETRA = 32;

/** La hoja entera: los renglones de cada encargo (con el índice del encargo) y, al final,
 *  el total de bultos impreso. */
export function hojaDe(encargos) {
  const renglones = [];
  let y = 0;
  const poner = (texto, encargo, extra = {}) => {
    renglones.push({ texto, x: 10, y, ancho: Math.max(60, texto.length * 18), alto: ALTO_LETRA, encargo, ...extra });
  };
  poner("DETALLE DE LOS ENCARGOS", -1);
  y += PASO;
  encargos.forEach((e, i) => {
    poner("NUMERO ENCARGOS", i);
    y += PASO;
    poner("OF TOTAL DOCTOS BULTOS DESTINATARIO COMUNA", i);
    y += PASO;
    poner(`${e.of} ${e.bultos} 0 ${e.bultos}`, i, { fila: "of" });
    renglones.push({ texto: `${e.nombre} ARICA`, x: 360, y, ancho: 330, alto: ALTO_LETRA, encargo: i });
    y += PASO;
    poner("DIRECCION", i);
    y += PASO;
    poner(`${e.destino} .`, i, { fila: "direccion" });
    y += PASO;
    poner("VALOR $ FORMA PAGO DD", i);
    y += PASO;
    poner("0 CTAC 0", i);
    y += PASO;
    poner("==============================", i);
    y += PASO;
  });
  poner(`TOTAL BULTOS: ${encargos.reduce((s, e) => s + e.bultos, 0)}`, -1, { fila: "total" });
  y += PASO;
  return { renglones, alto: y };
}

const PARECIDO = { 0: "86", 1: "7", 2: "7", 3: "8", 4: "1", 5: "6", 6: "58", 7: "1", 8: "603", 9: "8" };
const LETRA = { I: "1", O: "0", S: "5", B: "8", A: "4", E: "F" };

/** La OF como la lee ML Kit en un cuadro: a veces con un dígito cambiado, que casi
 *  siempre sale con poca confianza. `ochoACero` (spec 039, terreno 2026-11-17): la
 *  probabilidad de que un «8» salga «0» con confianza suficiente para votar (lo que el
 *  dueño ve en casi todos los escaneos); con 0, nada cambia. */
function leerOf(of, r, error, ochoACero = 0) {
  let texto = "";
  const confianzas = [];
  for (const d of of) {
    if (ochoACero > 0 && d === "8" && r() < ochoACero) {
      texto += "0";
      confianzas.push(0.52 + r() * 0.16);
    } else if (r() < error) {
      const otros = PARECIDO[d];
      texto += otros[Math.floor(r() * otros.length)];
      confianzas.push(r() < 0.8 ? 0.35 + r() * 0.2 : 0.6 + r() * 0.3);
    } else {
      texto += d;
      confianzas.push(0.7 + r() * 0.27);
    }
  }
  return { texto, confianzas };
}

/** El barrido de la hoja: cada cuadro con sus renglones ya derechos, en el orden en que
 *  los entrega ML Kit (primero la columna de la izquierda y después la del nombre), y
 *  el reloj (ms) en que llegó.
 *  - `paso`: cuántos px baja la cámara por cuadro, en promedio.
 *  - `saltos`: índices de encargos que la cámara se salta (pasa rápido sin leerlos).
 *  - `error`: probabilidad de que ML Kit cambie un dígito de la OF.
 *  - `ochoACero`: probabilidad de que lea «0» un «8» de la OF (spec 039). */
export function barrer(hoja, { semilla = 7, paso = 80, error = 0.05, saltos = [], altoCuadro = 1920, msPorCuadro = 280, ochoACero = 0 } = {}) {
  const r = azar(semilla);
  const cuadros = [];
  const saltados = new Set(saltos);
  let arriba = -altoCuadro / 2;
  let ms = 0;
  while (arriba < hoja.alto) {
    const leidos = [];
    for (const renglon of hoja.renglones) {
      const y = renglon.y - arriba;
      if (y < 0 || y + renglon.alto > altoCuadro) continue;
      if (saltados.has(renglon.encargo)) continue;
      if (r() < 0.03) continue; // ML Kit no lo leyó
      const temblor = Math.round((r() - 0.5) * 6);
      const caja = { x: renglon.x + temblor, y: y + temblor, ancho: renglon.ancho, alto: renglon.alto };
      if (renglon.fila === "of") {
        const [of, ...resto] = renglon.texto.split(" ");
        const leida = leerOf(of, r, error, ochoACero);
        const pegado = r() < 0.1;
        const chicos = r() < 0.08 ? [] : pegado ? resto.slice(1) : resto;
        const palabra = pegado ? `${leida.texto}${resto[0]}` : leida.texto;
        const confianzas = pegado ? [...leida.confianzas, 0.9] : leida.confianzas;
        leidos.push({ ...caja, texto: [palabra, ...chicos].join(" "), numeros: [{ texto: palabra, confianzas }] });
      } else if (renglon.fila === "direccion") {
        const texto = [...renglon.texto].map((c) => (LETRA[c] && r() < 0.04 ? LETRA[c] : c)).join("");
        leidos.push({ ...caja, texto });
      } else {
        leidos.push({ ...caja, texto: renglon.texto });
      }
    }
    // Como los entrega ML Kit: la columna de la izquierda y después la del nombre.
    leidos.sort((a, b) => (a.x >= 300) - (b.x >= 300) || a.y - b.y);
    ms += msPorCuadro + Math.round((r() - 0.5) * 60);
    cuadros.push({ renglones: leidos, ancho: 1080, alto: altoCuadro, ms });
    // La cámara baja con vaivén: a veces vuelve un poco.
    arriba += r() < 0.08 ? -paso : paso * (0.5 + r());
  }
  return cuadros;
}
