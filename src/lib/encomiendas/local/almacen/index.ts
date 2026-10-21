"use client";

// Operaciones sobre el guardado local del conductor (ver ../idb.ts para el
// dónde y el por qué). Este módulo es el ÚNICO que debería tocar los stores:
// mantiene dos invariantes que si se rompen cuestan plata o confunden al
// conductor.
//
//  1. Cerrar la visita de un pedido (entrega u omisión) guarda el resultado Y
//     encola el evento para el servidor en la MISMA transacción. Si quedara el
//     resultado sin el evento, el conductor perdería esa entrega en su
//     liquidación; si quedara el evento sin el resultado, el pedido volvería a
//     aparecer como pendiente y se contaría dos veces.
//  2. Regenerar la ruta nunca pierde lo ya cerrado en el día: lo cerrado queda
//     primero en el orden, y su resultado vive en el pedido, no en la ruta.
//
// Un pedido es de UN día (spec 009): lo no entregado no pasa al siguiente.
//
// Partido por tema (cada archivo ≤ 400 líneas); este barril es la única puerta.

export type {
  Aviso,
  ActividadPorEnviar,
  Pedido,
  Ruta,
} from "./tipos";
export { leerPedidos, leerRuta, pedidosEnOrden } from "./lecturas";
export {
  borrarPedido,
  fijarCoordenadas,
  guardarPedido,
  pedidosPendientes,
  restaurarPedido,
  type DatosPedido,
  type PedidoEliminado,
} from "./pedidos";
export {
  cerrarDia,
  fijarTrazado,
  guardarRuta,
  leerDias,
  ordenarRuta,
  resumirDia,
  rutaTerminada,
  type ResumenDia,
  type EntradaRuta,
} from "./ruta";
export {
  deshacerResultado,
  marcarResultado,
  marcarLlamada,
  moverAlFinal,
  type MarcaPedido,
} from "./terreno";
export {
  marcarHorariosEnviados,
  registrarAvisoEnviado,
  registrarAvisoFallido,
  registrarDisponibilidad,
  reiniciarDisponibilidad,
} from "./disponibilidad";
export { leerCola, quitarDeCola } from "./cola";

// Para distinguir "el teléfono no puede guardar" (accionable: instalar la app,
// salir del modo privado) de cualquier otro error.
export { ErrorAlmacenLocal } from "../idb";
