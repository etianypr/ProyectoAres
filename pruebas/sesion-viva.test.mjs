// El escáner en vivo de etiquetas cuadro a cuadro (spec 028; fotos del dueño 2026-11-25):
// «al volver a abrir lee al instante, pero al seguir con la siguiente no funciona». Se
// prueban secuencias de cuadros inventadas como las que manda la cámara al cargar el auto:
// una caja tras otra, el bulto 2 de la misma OF, dos cajas en el cuadro, la etiqueta que
// sale de la cámara, POR PAGAR sin monto impreso y la etiqueta al revés. Datos inventados.
import test from "node:test";
import assert from "node:assert/strict";

const sesionViva = await import("@/lib/encomiendas/lectura/etiqueta/sesion-viva");
const votos = await import("@/lib/encomiendas/lectura/etiqueta/votos");
const { CONTINUIDAD_MS, CUADROS_PARA_GIRAR, GIRO_INICIAL, RELOJ_INICIAL, SALIDA_MS, TOPE_HUECO_MS, avanzarReloj, mismaEtiqueta, pasoDelCuadro, siguienteGiro } = sesionViva;

const codigo = (of, bulto = 1) => `92000022561467${of}${String(bulto).padStart(3, "0")}`;
const A = "200000101";
const B = "200000102";
const C = "200000103";
const TEXTO_A = "DESTINATARIO: ANA ROJAS\nTel. 912345678\nCONTADO\nR15 ARICA DOMICILIO";
const TEXTO_B = "DESTINATARIO: JUAN SOTO\nTel. 987654321\nPOR PAGAR\nTotal Monto O.F. $ 9.260\nR15 ARICA DOMICILIO";

/** Lo que hace el hook con cada paso, sin pantalla: cuenta bultos y etiquetas leídas. Una
 *  completa no se vuelve a leer; una cerrada a medias, sí. `cuadro` recibe el reloj de la
 *  cámara; `real`, la hora de verdad (con las trabas). */
function sesion() {
  const s = { actual: null, bultos: [], leidas: [], aMedias: [], completas: new Set(), reloj: RELOJ_INICIAL };
  const clave = (c) => `${c.of}-${c.bulto}`;
  s.cuadro = (codigos, texto, ahora) => {
    const { paso } = pasoDelCuadro(s.actual, { codigos, texto }, ahora);
    if (paso.tipo === "salio") {
      s.aMedias.push(s.actual.codigo.of);
      s.actual.aMedias = true;
    } else if (paso.tipo === "nueva") {
      if (s.actual && !s.actual.leida && !s.actual.aMedias) s.aMedias.push(s.actual.codigo.of);
      s.actual = { codigo: paso.codigo, votos: paso.votos, ultimoCodigo: ahora, leida: s.completas.has(clave(paso.codigo)) };
      // El mismo bulto no se cuenta dos veces (el código trae su número).
      if (!s.bultos.includes(clave(paso.codigo))) s.bultos.push(clave(paso.codigo));
    } else if (paso.tipo === "sumar") {
      s.actual.votos = paso.votos;
      if (paso.conCodigo) {
        s.actual.ultimoCodigo = ahora;
        s.actual.aMedias = false;
      }
      if (paso.listo) {
        s.actual.leida = true;
        s.completas.add(clave(s.actual.codigo));
        s.leidas.push(s.actual.codigo.of);
      }
    }
    return paso;
  };
  s.real = (codigos, texto, real) => {
    s.reloj = avanzarReloj(s.reloj, real);
    return s.cuadro(codigos, texto, s.reloj.camara);
  };
  return s;
}

test("una caja tras otra: cada una queda leída, sin cerrar el escáner", () => {
  const s = sesion();
  let t = 0;
  for (const [of, texto] of [[A, TEXTO_A], [B, TEXTO_B], [C, TEXTO_A.replace("ANA ROJAS", "PEDRO DIAZ")]]) {
    s.cuadro([codigo(of)], texto, (t += 200));
    s.cuadro([codigo(of)], texto, (t += 200));
    s.cuadro([], "", (t += 200)); // pasando a la siguiente, sin código
  }
  assert.deepEqual(s.leidas, [A, B, C]);
  assert.deepEqual(s.aMedias, []);
});

test("el bulto 2 de la misma OF es otra caja: se cuenta (antes nunca sumaba)", () => {
  const s = sesion();
  s.cuadro([codigo(A, 1)], TEXTO_A, 0);
  s.cuadro([codigo(A, 1)], TEXTO_A, 200);
  s.cuadro([codigo(A, 2)], TEXTO_A, 600);
  s.cuadro([codigo(A, 2)], TEXTO_A, 800);
  assert.deepEqual(s.bultos, [`${A}-1`, `${A}-2`]);
  assert.deepEqual(s.leidas, [A, A]);
});

test("la misma caja leída otra vez no se cuenta de nuevo", () => {
  const s = sesion();
  for (let t = 0; t < 2000; t += 200) s.cuadro([codigo(A, 1)], TEXTO_A, t);
  assert.deepEqual(s.bultos, [`${A}-1`]);
  assert.deepEqual(s.leidas, [A]);
});

test("dos cajas en el cuadro: se sigue con la que se estaba leyendo, sin mezclar su texto", () => {
  const s = sesion();
  s.cuadro([codigo(A)], TEXTO_A, 0);
  // ML Kit cambia el orden de los códigos de un cuadro a otro.
  const p1 = s.cuadro([codigo(B), codigo(A)], `${TEXTO_B}\n${TEXTO_A}`, 200);
  const p2 = s.cuadro([codigo(A), codigo(B)], `${TEXTO_A}\n${TEXTO_B}`, 400);
  assert.deepEqual([p1.tipo, p2.tipo], ["sumar", "sumar"]);
  assert.deepEqual(s.bultos, [`${A}-1`], "no salta a la otra caja ni vuelve");
  assert.equal(s.actual.votos.cuadros, 3);
  assert.deepEqual(s.leidas, [], "el texto con dos OF no cuenta: falta un cuadro solo");
  s.cuadro([codigo(A)], TEXTO_A, 600);
  assert.deepEqual(s.leidas, [A]);
});

test("dos cajas de la misma OF en el cuadro: sigue con la suya", () => {
  const s = sesion();
  s.cuadro([codigo(A, 1)], TEXTO_A, 0);
  s.cuadro([codigo(A, 2), codigo(A, 1)], TEXTO_A, 200);
  assert.deepEqual(s.bultos, [`${A}-1`]);
});

test("un cuadro sin código cuenta si el código se vio recién; sin verlo un rato, salió", () => {
  const s = sesion();
  s.cuadro([codigo(A)], "DESTINATARIO: ANA ROJAS", 0);
  const recien = s.cuadro([], TEXTO_A, CONTINUIDAD_MS - 100);
  assert.equal(recien.tipo, "sumar");
  assert.equal(s.actual.votos.cuadros, 2);
  assert.equal(s.cuadro([], "", CONTINUIDAD_MS + 100).tipo, "nada", "entre la continuidad y la salida, espera");
  assert.equal(s.cuadro([], "", SALIDA_MS + 100).tipo, "salio");
  assert.deepEqual(s.aMedias, [A]);
  assert.equal(s.cuadro([], "", SALIDA_MS + 300).tipo, "nada", "ya cerrada, no se cierra dos veces");
});

test("el reloj de la cámara no cuenta las trabas: un hueco entre cuadros vale a lo más TOPE_HUECO_MS", () => {
  let r = avanzarReloj(RELOJ_INICIAL, 10_000);
  assert.equal(r.camara, 0, "el primer cuadro no avanza");
  r = avanzarReloj(r, 10_200);
  assert.equal(r.camara, 200);
  r = avanzarReloj(r, 13_200); // la cámara trabada 3 s
  assert.equal(r.camara, 200 + TOPE_HUECO_MS);
  r = avanzarReloj({ ...r, real: 0 }, 60_000); // tras una pausa (un ⚠) o al volver a prender
  assert.equal(r.camara, 200 + TOPE_HUECO_MS);
});

test("una traba de la cámara no da por salida la etiqueta que sigue en la mano (antes quedaba en «Solo el código»)", () => {
  const s = sesion();
  s.real([codigo(A)], "", 1000);
  s.real([codigo(A)], "", 1200);
  // 2,5 s sin cuadros y el primero de vuelta sin código: con el reloj de verdad, «salió».
  assert.notEqual(s.real([], "", 3700).tipo, "salio");
  s.real([codigo(A)], TEXTO_A, 3900);
  s.real([codigo(A)], TEXTO_A, 4100);
  assert.deepEqual(s.aMedias, []);
  assert.deepEqual(s.leidas, [A]);
});

test("la etiqueta que sale de verdad (cuadros llegando, sin su código) se cierra igual", () => {
  const s = sesion();
  s.real([codigo(A)], "", 1000);
  let t = 1000;
  while (s.aMedias.length === 0 && t < 10_000) s.real([], "", (t += 200));
  assert.deepEqual(s.aMedias, [A]);
  assert.ok(t - 1000 <= SALIDA_MS + 200, `se cerró a los ${t - 1000} ms`);
});

test("la cerrada a medias se sigue leyendo si su código vuelve", () => {
  const s = sesion();
  s.cuadro([codigo(A)], "", 0);
  assert.equal(s.cuadro([], "", SALIDA_MS + 100).tipo, "salio");
  s.cuadro([codigo(A)], TEXTO_A, SALIDA_MS + 300);
  s.cuadro([codigo(A)], TEXTO_A, SALIDA_MS + 500);
  assert.deepEqual(s.leidas, [A]);
  assert.deepEqual(s.bultos, [`${A}-1`]);
});

test("otra caja en medio: la primera, a medias, se sigue leyendo al volver; una completa no", () => {
  const s = sesion();
  s.cuadro([codigo(A)], "", 0);
  s.cuadro([codigo(B)], TEXTO_B, 200);
  s.cuadro([codigo(B)], TEXTO_B, 400);
  s.cuadro([codigo(A)], TEXTO_A, 600);
  s.cuadro([codigo(A)], TEXTO_A, 800);
  assert.deepEqual(s.aMedias, [A]);
  assert.deepEqual(s.leidas, [B, A]);
  s.cuadro([codigo(B)], TEXTO_B, 1000);
  s.cuadro([codigo(B)], TEXTO_B, 1200);
  assert.deepEqual(s.leidas, [B, A], "B ya estaba completa: no se lee otra vez");
  assert.deepEqual(s.bultos, [`${A}-1`, `${B}-1`]);
});

test("otra caja antes de terminar la anterior: la anterior se cierra a medias y la nueva empieza de cero", () => {
  const s = sesion();
  s.cuadro([codigo(A)], TEXTO_A, 0);
  s.cuadro([codigo(B)], TEXTO_B, 200);
  assert.deepEqual(s.aMedias, [A]);
  assert.equal(s.actual.votos.cuadros, 1);
});

test("POR PAGAR sin monto impreso queda leída con el monto por revisar, sin esperar", () => {
  const texto = "DESTINATARIO: ANA SOTO\nRUT: 11111111-1 TELEFONO: 912345678\nPOR PAGAR\nTotal Monto O.F.\nFECHA NORMAL ENTREGA";
  const s = sesion();
  s.cuadro([codigo(A)], texto, 0);
  const p = s.cuadro([codigo(A)], texto, 200);
  assert.equal(p.listo, true);
  assert.deepEqual(s.leidas, [A]);
});

test("POR PAGAR con el monto leído en algún cuadro: espera que el monto quede firme", () => {
  const sinMonto = "DESTINATARIO: ANA SOTO\nTel. 912345678\nPOR PAGAR\nTotal Monto O.F.\nFECHA NORMAL ENTREGA";
  const s = sesion();
  s.cuadro([codigo(A)], sinMonto.replace("Total Monto O.F.", "Total Monto O.F. $9.260"), 0);
  s.cuadro([codigo(A)], sinMonto, 200);
  s.cuadro([codigo(A)], sinMonto, 400);
  assert.deepEqual(s.leidas, [], "un cuadro vio $9.260: no se da por «sin monto»");
});

test("la OF escrita a mano vale por cualquier bulto de esa OF", () => {
  assert.equal(mismaEtiqueta({ of: "101", bulto: null }, { of: "101", bulto: 2 }), true);
  assert.equal(mismaEtiqueta({ of: "101", bulto: 1 }, { of: "101", bulto: 2 }), false);
  assert.equal(mismaEtiqueta({ of: "101", bulto: 1 }, { of: "102", bulto: 1 }), false);
});

test("el texto de una etiqueta con la OF escrita cuenta aunque el código no se lea", () => {
  const { paso } = pasoDelCuadro(null, { codigos: [], texto: `O.F. ${A}\n${TEXTO_A}` }, 0, A);
  assert.equal(paso.tipo, "nueva");
  assert.deepEqual(paso.codigo, { of: A, bulto: null });
});

test("la foto se guarda solo si es de esta etiqueta (antes, la de la caja siguiente quedaba en el pedido)", () => {
  const { fotoEsDe } = sesionViva;
  assert.equal(fotoEsDe({ codigos: [codigo(A)], texto: "" }, A), true);
  assert.equal(fotoEsDe({ codigos: [codigo(B)], texto: TEXTO_B }, A), false, "el conductor ya pasó a otra caja");
  assert.equal(fotoEsDe({ codigos: [codigo(A), codigo(B)], texto: "" }, A), false, "dos etiquetas en la foto");
  assert.equal(fotoEsDe({ codigos: [], texto: `O.F. ${A}\n${TEXTO_A}` }, A), true, "sin código, por su OF impresa");
  assert.equal(fotoEsDe({ codigos: [], texto: TEXTO_A }, A), false, "sin código ni OF: no se sabe de quién es");
});

test("OF fuera del día: al pedido nuevo va solo lo firme, y la foto solo si es de esa etiqueta (dueño, 2026-11-25)", async () => {
  const { etiquetaParaPedido, soloLaOf } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/guardar-etiqueta-viva");
  const foto = (codigos) => ({ imagen: new Blob(["x"]), codigos, texto: "" });
  const s = sesion();
  s.cuadro([codigo(B)], TEXTO_B, 0);
  const uno = etiquetaParaPedido(s.actual.codigo, s.actual.votos, null);
  assert.deepEqual([uno.of, uno.nombre, uno.telefono, uno.porPagar, uno.montoPorPagar], [B, null, null, null, null], "visto en un cuadro: nada");
  s.cuadro([codigo(B)], TEXTO_B, 200);
  const dos = etiquetaParaPedido(s.actual.codigo, s.actual.votos, foto([codigo(B)]));
  assert.deepEqual([dos.bulto, dos.nombre, dos.telefono, dos.porPagar, dos.montoPorPagar], [1, "JUAN SOTO", "+56987654321", true, 9260]);
  assert.ok(dos.foto, "la foto de su etiqueta va");
  assert.equal(etiquetaParaPedido(s.actual.codigo, s.actual.votos, foto([codigo(A)])).foto, null, "la de otra caja, no");
  assert.deepEqual(soloLaOf(A), { of: A, bulto: null, nombre: null, telefono: null, direccion: null, porPagar: null, montoPorPagar: null, bultos: null, foto: null });
});

// ------------------------------------------------------------------ etiqueta girada

const AL_REVES = "VDIqqI ∀Ɔ∩ꓤ OIƆI∩ꓤ qo ɐuɐ sɐɟoɹ ɹǝʇ ʇǝl ɯnpʇo ɐɹɯɐ ɐɯʇpu ɐɹǝ ɔɐɹ";

test("la etiqueta al revés: tras unos cuadros con código y texto ilegible se prueba girada", () => {
  let e = GIRO_INICIAL;
  for (let i = 0; i < CUADROS_PARA_GIRAR - 1; i++) e = siguienteGiro(e, true, AL_REVES);
  assert.equal(e.giro, 0, "todavía no");
  e = siguienteGiro(e, true, AL_REVES);
  assert.equal(e.giro, 180, "primero al revés: lo más común en el auto");
  for (let i = 0; i < CUADROS_PARA_GIRAR; i++) e = siguienteGiro(e, true, AL_REVES);
  assert.equal(e.giro, 90);
  for (let i = 0; i < CUADROS_PARA_GIRAR; i++) e = siguienteGiro(e, true, AL_REVES);
  assert.equal(e.giro, 270);
  for (let i = 0; i < CUADROS_PARA_GIRAR; i++) e = siguienteGiro(e, true, AL_REVES);
  assert.equal(e.giro, 0, "vuelve a empezar");
});

test("el giro que sirvió se queda para la siguiente caja", () => {
  let e = { giro: 180, sinAncla: 2 };
  e = siguienteGiro(e, true, TEXTO_A);
  assert.deepEqual(e, { giro: 180, sinAncla: 0 });
});

test("sin código, o con poco texto (lejos o movida), no se gira", () => {
  let e = GIRO_INICIAL;
  for (let i = 0; i < 10; i++) e = siguienteGiro(e, false, AL_REVES);
  for (let i = 0; i < 10; i++) e = siguienteGiro(e, true, "xq wz");
  assert.deepEqual(e, GIRO_INICIAL);
});

test("al pedido va solo lo firme: lo visto en un cuadro queda sin leer", () => {
  const { soloLoFirme } = sesionViva;
  const s = sesion();
  s.cuadro([codigo(B)], TEXTO_B, 0);
  const { resultadoVotos } = votos;
  const firme = soloLoFirme(resultadoVotos(s.actual.votos));
  assert.deepEqual([firme.destinatario, firme.telefono, firme.porPagar, firme.montoPorPagar], [null, null, null, null]);
  s.cuadro([codigo(B)], TEXTO_B, 200);
  const dos = soloLoFirme(resultadoVotos(s.actual.votos));
  assert.deepEqual([dos.destinatario, dos.telefono, dos.porPagar, dos.montoPorPagar], ["JUAN SOTO", "+56987654321", true, 9260]);
});
