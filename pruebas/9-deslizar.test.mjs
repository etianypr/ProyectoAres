// El gesto de deslizar una fila hacia la izquierda para eliminarla
// (`lib/comun/deslizar.ts`), que es la parte del gesto que no necesita un teléfono.
//
// Se prueba acá porque las tres cosas que lo pueden arruinar no se ven leyendo
// el componente, y en el teléfono se sienten como "la lista está rara":
//
//   1. QUE LA LISTA SE ABRA SOLA. Estas filas viven dentro de una lista que se
//      desplaza a lo alto. Si el eje del gesto se recalcula en cada movimiento,
//      un dedo que sube en diagonal va abriendo filas por el camino.
//   2. QUE ELIMINE SIN QUERER. El atajo (arrastrar largo y soltar) tiene que
//      pedir bastante más que abrir el panel, o desplazar la lista con el pulgar
//      termina borrando pedidos.
//   3. QUE UNA FILA ABIERTA SALTE. Empezar a deslizar una fila que ya está
//      abierta parte de donde está, no de cero.
import test from "node:test";
import assert from "node:assert/strict";

const { ANCHO_ACCION, UMBRAL_EJE, alSoltar, decidirEje, desplazamiento, umbralEliminar } =
  await import("@/lib/comun/deslizar");

// Un ancho de fila realista: la hoja del conductor en un teléfono común.
const ANCHO_FILA = 340;

// ------------------------------------------------------------------ el eje
test("por debajo del umbral el gesto todavía no es nada", () => {
  assert.equal(decidirEje(0, 0), "sin-decidir");
  assert.equal(decidirEje(-(UMBRAL_EJE - 1), 0), "sin-decidir");
  assert.equal(decidirEje(0, UMBRAL_EJE - 1), "sin-decidir");
});

test("manda el eje en el que el dedo se movió más", () => {
  assert.equal(decidirEje(-40, 8), "horizontal");
  assert.equal(decidirEje(-8, 40), "vertical");
  assert.equal(decidirEje(-8, -40), "vertical");
});

test("el empate se va a vertical: desplazar la lista es lo que se hace cien veces al día", () => {
  assert.equal(decidirEje(-30, 30), "vertical");
  assert.equal(decidirEje(-30, -30), "vertical");
});

// ------------------------------------------------------- cuánto se corre
test("hacia la derecha la fila cerrada no se despega del borde", () => {
  assert.equal(desplazamiento(50, 0), 0);
  assert.equal(desplazamiento(0, 0), 0);
});

test("hasta el ancho del panel, la fila sigue al dedo píxel a píxel", () => {
  assert.equal(desplazamiento(-30, 0), 30);
  assert.equal(desplazamiento(-ANCHO_ACCION, 0), ANCHO_ACCION);
});

test("pasado el panel hay resistencia: el dedo avanza más que la fila", () => {
  const extra = 100;
  const x = desplazamiento(-(ANCHO_ACCION + extra), 0);
  assert.ok(x > ANCHO_ACCION, "no se puede pasar del panel abierto");
  assert.ok(x < ANCHO_ACCION + extra, "sin resistencia no se siente que soltar ahí borra");
});

test("una fila abierta parte de donde está y no de cero", () => {
  // Sin el parámetro `desde`, apoyar el dedo en una fila abierta la haría
  // saltar al borde antes de moverse.
  assert.equal(desplazamiento(0, ANCHO_ACCION), ANCHO_ACCION);
  // Y arrastrarla hacia la derecha la cierra.
  assert.equal(desplazamiento(30, ANCHO_ACCION), ANCHO_ACCION - 30);
  assert.equal(desplazamiento(ANCHO_ACCION + 20, ANCHO_ACCION), 0);
});

// --------------------------------------------------------- al soltar
test("un arrastre corto se cierra solo", () => {
  assert.equal(alSoltar(0, ANCHO_FILA), "cerrar");
  assert.equal(alSoltar(ANCHO_ACCION / 2 - 1, ANCHO_FILA), "cerrar");
});

test("media apertura ya cuenta como intención de abrir", () => {
  assert.equal(alSoltar(ANCHO_ACCION / 2, ANCHO_FILA), "abrir");
  assert.equal(alSoltar(ANCHO_ACCION, ANCHO_FILA), "abrir");
});

test("eliminar pide bastante más que abrir: es un atajo, no un accidente", () => {
  const umbral = umbralEliminar(ANCHO_FILA);
  assert.ok(umbral > ANCHO_ACCION * 1.4, "el atajo queda demasiado cerca de abrir");
  assert.equal(alSoltar(umbral - 1, ANCHO_FILA), "abrir");
  assert.equal(alSoltar(umbral, ANCHO_FILA), "eliminar");
});

test("una fila angosta no se vuelve un gatillo fácil", () => {
  // Con el umbral puesto solo como fracción del ancho, en una fila de 150 px
  // bastaría con abrir el panel para que soltar borrara.
  assert.equal(alSoltar(ANCHO_ACCION, 150), "abrir");
  assert.ok(umbralEliminar(150) > ANCHO_ACCION);
});

test("sin poder medir la fila manda el piso, nunca una fracción de cero", () => {
  // El primer gesto puede llegar antes de que el nodo tenga ancho. Ahí lo que
  // no puede pasar es que cualquier movimiento cuente como eliminar.
  assert.equal(alSoltar(ANCHO_ACCION, 0), "abrir");
  assert.equal(umbralEliminar(0), umbralEliminar(1));
});

// ------------------------------------------------- el gesto completo
test("desplazar la lista con el pulgar no elimina nada", () => {
  // Lo que hace un conductor cien veces por día: el dedo sube 120 px y deriva 25 a
  // la izquierda. Ni abre la fila ni la borra: la lista se lo lleva entero.
  assert.equal(decidirEje(-25, -120), "vertical");
});

test("el atajo completo: arrastrar más de media fila y soltar", () => {
  const dx = -260;
  assert.equal(decidirEje(dx, 12), "horizontal");
  assert.equal(alSoltar(desplazamiento(dx, 0), ANCHO_FILA), "eliminar");
});

test("abrir, soltar, y volver a soltar sin mover deja la fila abierta", () => {
  const x = desplazamiento(-100, 0);
  assert.equal(alSoltar(x, ANCHO_FILA), "abrir");
  // El toque siguiente sobre la fila abierta no la mueve, así que no cambia nada.
  assert.equal(alSoltar(desplazamiento(0, ANCHO_ACCION), ANCHO_FILA), "abrir");
});
