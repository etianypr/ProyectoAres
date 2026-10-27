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
// Un pedido es de UN día (spec 009): lo no entregado no pasa al siguiente, y
// al cerrar el día sus datos se borran y queda solo el resumen (spec 007).
//
// Partido por tema (cada archivo ≤ 400 líneas); este barril es la única puerta.

export type {
  Aviso,
  ActividadPorEnviar,
  Foto,
  OrigenCarga,
  Pedido,
  ReferenciaPaquete,
  ResumenDia,
  Ruta,
} from "./tipos";
export { leerDiaGuardado, leerPedidos, leerRuta, pedidosEnOrden } from "./lecturas";
export {
  borrarPedido,
  cambiarDireccion,
  fijarCoordenadas,
  guardarPedido,
  pedidosPendientes,
  restaurarPedido,
  type DatosPedido,
  type PedidoEliminado,
} from "./pedidos";
export {
  cerrarDia,
  cifrasDelDia,
  fijarTrazado,
  guardarRuta,
  leerDias,
  leerResumenDia,
  ordenarRuta,
  resumirDia,
  rutaTerminada,
  sumarResumenes,
  type EntradaRuta,
} from "./ruta";
export {
  borrarDatosDestinatarios,
  cerrarYBorrarDia,
  diasPorBorrar,
  noEntregadosDelDia,
} from "./borrado";
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
export { leerCola, quitarDeCola, retenerEvento } from "./cola";
export {
  aplicarLecturaEtiqueta,
  crearDesdeGuia,
  avanceCarga,
  sinEtiquetaEscaneada,
  type LecturaParaAplicar,
  type LineaParaCrear,
  type ResultadoEscaneo,
} from "./carga";
export {
  borrarFoto,
  guardarFoto,
  guardarPaquete,
  leerFoto,
  ofRepetida,
  purgarFotosCerradas,
} from "./paquete";

// Para distinguir "el teléfono no puede guardar" (accionable: instalar la app,
// salir del modo privado) de cualquier otro error.
export { ErrorAlmacenLocal } from "../idb";
