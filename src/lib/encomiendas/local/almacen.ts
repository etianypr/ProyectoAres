"use client";

// Operaciones sobre el guardado local del chofer (ver ./idb.ts para el dónde y
// el por qué). Este módulo es el ÚNICO que debería tocar los stores: mantiene
// dos invariantes que si se rompen cuestan plata o confunden al chofer.
//
//  1. Cerrar una parada (entrega u omisión) guarda el estado Y encola el evento
//     para el servidor en la MISMA transacción. Si quedara el estado sin el
//     evento, el chofer perdería esa entrega en su liquidación; si quedara el
//     evento sin el estado, la parada volvería a aparecer como pendiente y se
//     contaría dos veces.
//  2. Regenerar la ruta nunca pierde lo ya cerrado en el día. Es el mismo
//     cuidado que hoy vive en generarRuta (unas 90 líneas de reconciliación en
//     el servidor, ver el comentario de la 0025); acá son diez líneas, porque
//     no hay secuencias ni claves únicas contra las que chocar.

import { uuidv7 } from "@/lib/uuid";
import {
  esReintentable,
  type Disponibilidad,
  type MotivoNoEntrega,
} from "@/lib/encomiendas/config";
import {
  STORES,
  INDICE_PEDIDO_ESTADO,
  contarPorIndice,
  escribir,
  leerTodos,
  leerUno,
} from "./idb";

// ----------------------------------------------------------------------------
// Una operación a la vez
// ----------------------------------------------------------------------------
//
// Casi todo lo de este módulo es LEER, DECIDIR Y RECIÉN DESPUÉS ESCRIBIR, y
// entre esas tres cosas hay un await. La transacción de escribir() es atómica,
// pero la DECISIÓN se tomó afuera, con una foto que ya puede estar vieja.
//
// El caso que costaba plata: dos toques casi simultáneos en "Pedido finalizado"
// (un doble tap, o la pantalla táctil que reporta el toque dos veces). Las dos
// llamadas leen la parada, las dos la ven "pendiente", las dos pasan el guardia
// de marcarEntrega y las dos encolan un evento con id distinto — así que la
// idempotencia del servidor tampoco las frena y la entrega se cuenta y se paga
// dos veces. Reproducido con tres llamadas en paralelo: tres eventos.
//
// La otra cara del mismo problema: fijarCoordenadas y marcarEntrega escriben
// las dos el pedido entero, cada una sobre la foto que leyó antes, así que la
// última en guardar pisa a la otra. Según cuál llegue segunda se pierde el
// "entregado" (el paquete reaparece mañana como no entregado) o se pierden las
// coordenadas recién encontradas (el pedido queda "Sin ubicar" y se cae de la
// ruta). Medido contra el código anterior: se perdían las coordenadas.
//
// La fila serializa esas operaciones. No hace falta nada más fino: son
// escrituras de milisegundos disparadas por una sola pantalla, y el orden entre
// dos toques del chofer es justamente el que él hizo.
let fila: Promise<unknown> = Promise.resolve();

function enFila<T>(trabajo: () => Promise<T>): Promise<T> {
  // then(trabajo, trabajo): que la anterior haya fallado no puede dejar la fila
  // trabada para el resto de la jornada.
  const proximo = fila.then(trabajo, trabajo);
  // La fila espera el turno, no el resultado: sin este catch, una operación que
  // lanza deja un rechazo sin manejar colgado del encadenamiento.
  fila = proximo.catch(() => {});
  return proximo;
}

// ----------------------------------------------------------------------------
// Formas guardadas
// ----------------------------------------------------------------------------

/** No encontrar a la persona NO cierra el pedido: lo deja pendiente para
 *  reintentarlo otro día, y es lo que hace que los pendientes se arrastren de
 *  una jornada a la siguiente.
 *
 *  "rechazado" es el tercero y el único que se agregó en esta feature. Es un
 *  cierre, igual que "entregado", pero por el motivo opuesto: el receptor dijo
 *  que no lo recibe. Existe como ESTADO DEL PEDIDO —y no solo como resultado de
 *  una parada— porque lo que la constitución exige (principio II, FR-012) es que
 *  no vuelva a proponerse en una ruta futura, y de eso ya se encarga el filtro
 *  de pendientes que existía. Deducirlo recorriendo las paradas de todas las
 *  rutas anteriores sería caro y se rompería el día que alguien olvidara mirar. */
export type EstadoPedidoLocal = "pendiente" | "entregado" | "rechazado";

export type PedidoLocal = {
  /** UUIDv7 generado en el teléfono. */
  id: string;
  nombre: string;
  telefono: string;
  direccion: string;
  /** null cuando la dirección no se pudo ubicar en el mapa: el pedido igual se
   *  guarda (el chofer puede corregirla), pero no puede entrar en una ruta. */
  lat: number | null;
  lng: number | null;
  notas: string | null;
  estado: EstadoPedidoLocal;
  /** Qué contestó el receptor al aviso de WhatsApp. Es una dimensión APARTE del
   *  resultado del reparto: confirmar por WhatsApp y después no estar en la casa
   *  son dos hechos distintos, y mezclarlos es justo lo que el principio II de
   *  la constitución prohibe. */
  disponibilidad: Disponibilidad;
  /** El bloque que eligió el receptor, si eligió uno. Solo tiene valor cuando
   *  `disponibilidad` es "horario_indicado". */
  bloqueHorarioId: string | null;
  /** ISO. Sirve para ordenar la lista y para ver cuánto lleva sin entregarse. */
  cargadoEn: string;
};

export type EstadoLlamadaLocal = "pendiente" | "contesto" | "no_contesto";

/** Cómo terminó el intento de entrega. Los cuatro resultados que el producto
 *  pide distinguir (FR-018) más el heredado.
 *
 *  "omitido" es de la versión anterior, cuando la app tenía un solo botón de
 *  "no se pudo entregar" y no preguntaba por qué. Sigue en el tipo porque hay
 *  jornadas guardadas en teléfonos con ese valor y leerlas no puede reventar;
 *  ningún código nuevo lo escribe. En el panel aparece como no entregado sin
 *  motivo registrado, que es exactamente lo que se sabe de él. */
export type EstadoEntregaLocal =
  | "pendiente"
  | "entregado"
  | "persona_no_encontrada"
  | "entrega_sin_respuesta"
  | "rechazo"
  | "omitido";

/** Los resultados que el chofer puede elegir hoy. Excluye "pendiente" (no es un
 *  resultado) y el heredado "omitido". */
export type ResultadoEntrega = Exclude<EstadoEntregaLocal, "pendiente" | "omitido">;

/** El motivo no personal que viaja al servidor con el evento de omisión, para
 *  que el jefe pueda distinguir los tres casos (FR-021). Una entrega no tiene
 *  motivo, y el heredado "omitido" tampoco: nadie lo preguntó en su momento e
 *  inventarlo ahora sería peor que dejarlo en blanco. */
export function motivoDeEntrega(resultado: EstadoEntregaLocal): MotivoNoEntrega | null {
  switch (resultado) {
    case "persona_no_encontrada":
      return "persona_no_encontrada";
    case "entrega_sin_respuesta":
      return "sin_respuesta";
    case "rechazo":
      return "rechazo";
    default:
      return null;
  }
}

/** ¿Se puede volver a intentar otro día? Derivado, nunca guardado: guardarlo
 *  sería un segundo lugar donde la regla puede quedar desactualizada. */
export function paradaReintentable(entrega: EstadoEntregaLocal): boolean {
  if (entrega === "entregado" || entrega === "pendiente") return false;
  const motivo = motivoDeEntrega(entrega);
  // El heredado "omitido" no tiene motivo y siempre fue reintentable.
  return motivo ? esReintentable(motivo) : true;
}

/** Cómo le fue a un pedido DENTRO de un día concreto. Vive en la ruta y no en
 *  el pedido porque el mismo pedido puede pasar por varios días (omitido hoy,
 *  entregado mañana). */
export type ParadaLocal = {
  pedidoId: string;
  llamada: EstadoLlamadaLocal;
  entrega: EstadoEntregaLocal;
  horaLlamada: string | null;
  horaEntrega: string | null;
};

export type RutaLocal = {
  /** "YYYY-MM-DD" en hora de Chile. Es la clave del store. */
  fecha: string;
  /** En orden de visita. */
  paradas: ParadaLocal[];
  /** Trazado por calles, [lng, lat] por punto (formato GeoJSON). null si el
   *  servicio de rutas no respondió: el mapa queda con los puntos y sin línea. */
  geometria: [number, number][] | null;
  distanciaM: number | null;
  duracionS: number | null;
  /** Cuándo se generó la ruta por PRIMERA vez ese día: el comienzo de la
   *  jornada. Rehacer la ruta —porque entraron pedidos nuevos— no lo mueve, o
   *  el inicio del día iría corriéndose cada vez que el chofer agrega algo. */
  generadaEn: string;
  /** Cuándo se cerró la última parada. null = la ruta sigue en curso.
   *
   *  Es lo que hace que el servidor valore el día (ver 0032): mientras sea null
   *  la jornada está abierta y no se calcula plata. Se guarda acá y no solo en
   *  el servidor porque el cierre puede ocurrir sin señal, igual que todo lo
   *  demás en esta app. */
  cerradaEn: string | null;
  /** Qué quedó fuera o dudoso al armar esta ruta: pedidos sin ubicar, sin
   *  trazado, con un bloque horario que no se pudo respetar. Se guarda con la
   *  ruta —y no solo se muestra en la previsualización— porque el chofer las
   *  necesita en terreno, horas después de haber confirmado. */
  advertencias: string[];
  /** Cuántas propuestas se compararon para llegar a esta (1 a 3). Es lo que
   *  distingue "no había alternativa útil" de "el chofer eligió entre tres"
   *  cuando después hay que entender por qué salió este orden. */
  propuestasComparadas: number;
  /** Huella de la disponibilidad con la que se calculó. Si llegan respuestas
   *  nuevas después, cambia, y la pantalla puede ofrecer rehacer la ruta en vez
   *  de dejar al chofer con un orden que ignora lo que el receptor contestó. */
  versionDisponibilidad: string | null;
};

/** Evento esperando salir a encomienda_actividad. Los nombres son los del
 *  dominio local; la traducción a columnas se hace al enviarlo. */
export type EventoCola = {
  /** UUIDv7: el MISMO id que va a la base, para que reenviar no duplique. */
  id: string;
  choferId: string;
  fecha: string;
  tipo: "entrega" | "omision" | "llamada";
  /** Por qué no se entregó. Solo en los eventos de omisión, y solo en los que
   *  la app genera desde esta versión: es una etiqueta de tres valores, sin
   *  ningún dato del receptor (ver MOTIVOS_NO_ENTREGA). Es lo único nuevo que
   *  esta feature le agrega a lo que sale del teléfono. */
  motivo?: MotivoNoEntrega | null;
  /** ISO. Cuándo ocurrió de verdad, que puede ser mucho antes de poder
   *  enviarlo. */
  hora: string;
  /** ISO. Hasta esa hora el evento NO sale, aunque haya señal: es la ventana en
   *  la que el chofer puede deshacer lo que acaba de marcar (ver
   *  deshacerEntrega).
   *
   *  Se retiene en la cola y no en la pantalla porque un evento que solo existe
   *  en memoria se pierde si el teléfono se bloquea o se cierra la app en esos
   *  segundos: la parada quedaría cerrada en el teléfono y el servidor no se
   *  enteraría nunca. Acá, en cambio, la próxima apertura lo encuentra vencido y
   *  lo manda. */
  retenidoHasta?: string;
};

// ----------------------------------------------------------------------------
// Leer lo guardado por una versión anterior
// ----------------------------------------------------------------------------
//
// IndexedDB no valida campos: un pedido guardado por la versión anterior de la
// app sigue ahí tal como se escribió, sin `disponibilidad` ni `bloqueHorarioId`,
// y una ruta anterior no tiene `advertencias`. Leer eso y usarlo directo deja
// `undefined` corriendo por la pantalla hasta que algo explota lejos de acá.
//
// Se normaliza EN LA LECTURA y no con una migración que reescriba todo al abrir
// la base: una migración así corre en el arranque, con el chofer esperando la
// pantalla, y puede fallar a mitad. Estas dos funciones son baratas y no pueden
// fallar.

function alDia(pedido: PedidoLocal): PedidoLocal {
  return {
    ...pedido,
    disponibilidad: pedido.disponibilidad ?? "pendiente_respuesta",
    bloqueHorarioId: pedido.bloqueHorarioId ?? null,
  };
}

function rutaAlDia(ruta: RutaLocal): RutaLocal {
  return {
    ...ruta,
    advertencias: ruta.advertencias ?? [],
    propuestasComparadas: ruta.propuestasComparadas ?? 1,
    versionDisponibilidad: ruta.versionDisponibilidad ?? null,
  };
}

// ----------------------------------------------------------------------------
// Pedidos
// ----------------------------------------------------------------------------

export async function leerPedidos(): Promise<PedidoLocal[]> {
  const pedidos = await leerTodos<PedidoLocal>(STORES.pedidos);
  return pedidos.map(alDia).sort((a, b) => b.cargadoEn.localeCompare(a.cargadoEn));
}

async function leerPedido(id: string): Promise<PedidoLocal | null> {
  const pedido = await leerUno<PedidoLocal>(STORES.pedidos, id);
  return pedido ? alDia(pedido) : null;
}

/** Los que todavía hay que entregar, incluidos los arrastrados de días
 *  anteriores. Es la entrada para armar la ruta.
 *
 *  Un pedido rechazado NO está acá, y eso es el cumplimiento de FR-012: el
 *  filtro es el mismo de siempre —solo los "pendiente"— y "rechazado" es un
 *  cierre, así que queda fuera sin que haya que acordarse de excluirlo en cada
 *  lugar que arma una ruta. */
export async function pedidosPendientes(): Promise<PedidoLocal[]> {
  const pedidos = await leerPedidos();
  return pedidos.filter((p) => p.estado === "pendiente");
}

export type DatosPedido = {
  nombre: string;
  telefono: string;
  direccion: string;
  lat: number | null;
  lng: number | null;
  notas: string | null;
};

/** Crea (sin id) o actualiza (con id) un pedido. Devuelve el guardado. */
export function guardarPedido(datos: DatosPedido, id?: string): Promise<PedidoLocal> {
  return enFila(async () => {
    const anterior = id ? await leerPedido(id) : null;

    const pedido: PedidoLocal = {
      ...datos,
      id: anterior?.id ?? id ?? uuidv7(),
      // Editar un pedido no lo reabre ni lo cierra: el estado solo cambia al
      // marcar la entrega.
      estado: anterior?.estado ?? "pendiente",
      // Corregir un teléfono o una dirección tampoco borra lo que el receptor
      // ya contestó. Si el chofer cambia el número porque el anterior estaba
      // mal, esa respuesta era de otra persona y hay que descartarla — pero eso
      // lo decide reiniciarDisponibilidad(), no un guardado cualquiera.
      disponibilidad: anterior?.disponibilidad ?? "pendiente_respuesta",
      bloqueHorarioId: anterior?.bloqueHorarioId ?? null,
      cargadoEn: anterior?.cargadoEn ?? new Date().toISOString(),
    };

    await escribir([STORES.pedidos], ({ guardar }) => guardar(STORES.pedidos, pedido));
    return pedido;
  });
}

/** Ids de todos los pedidos que ya están en el teléfono, entregados incluidos.
 *  Lo usa el traspaso desde la base para no volver a traer lo que ya está (ver
 *  ./importar.ts). */
export async function idsGuardados(): Promise<Set<string>> {
  const pedidos = await leerTodos<PedidoLocal>(STORES.pedidos);
  return new Set(pedidos.map((p) => p.id));
}

/** Inserta pedidos ya armados sin pisar los que ya existan, conservando su id y
 *  su fecha de carga original. Es la entrada del traspaso único desde la base
 *  (ver ./importar.ts); para lo que carga el chofer está guardarPedido.
 *  Devuelve cuántos se agregaron de verdad. */
export function agregarFaltantes(pedidos: PedidoLocal[]): Promise<number> {
  return enFila(async () => {
    const existentes = await idsGuardados();
    const faltantes = pedidos.filter((p) => !existentes.has(p.id));
    if (faltantes.length === 0) return 0;

    await escribir([STORES.pedidos], ({ guardar }) => {
      for (const pedido of faltantes) guardar(STORES.pedidos, pedido);
    });
    return faltantes.length;
  });
}

/** Fija las coordenadas de varios pedidos de una vez, sin tocar el resto de sus
 *  datos: se usa al reintentar ubicar direcciones que habían fallado (ver
 *  ./generar-ruta.ts). Los que ya no existan se ignoran en silencio — el chofer
 *  pudo borrarlos mientras corría la geocodificación. */
export function fijarCoordenadas(
  coordenadas: { id: string; lat: number; lng: number }[],
): Promise<void> {
  if (coordenadas.length === 0) return Promise.resolve();
  return enFila(async () => {
    const actuales = await Promise.all(coordenadas.map((c) => leerPedido(c.id)));

    await escribir([STORES.pedidos], ({ guardar }) => {
      actuales.forEach((pedido, i) => {
        if (!pedido) return;
        guardar(STORES.pedidos, { ...pedido, lat: coordenadas[i].lat, lng: coordenadas[i].lng });
      });
    });
  });
}

/** Todo lo que se le quitó al teléfono al eliminar un pedido, en una sola pieza.
 *  Es lo que hace que "Deshacer" pueda existir: sin esto, eliminar es definitivo
 *  y el chofer perdería la dirección y el teléfono del receptor —que escribió a
 *  mano— por un roce en la pantalla.
 *
 *  Se guarda en memoria y no en la base: si la app se cierra durante la ventana
 *  para deshacer, el recibo se pierde y la eliminación queda firme. Es el fallo
 *  que corresponde — lo contrario, un pedido que reaparece solo al día siguiente,
 *  es el que no se puede explicar. */
export type PedidoEliminado = {
  pedido: PedidoLocal;
  /** La parada que tenía en la ruta del día, o null si estaba fuera de ella. */
  parada: ParadaLocal | null;
  /** En qué lugar de la ruta estaba. Restaurar la pone de vuelta AHÍ y no al
   *  final: el chofer eliminó por error, no reordenó. */
  posicion: number;
  /** La coordinación de WhatsApp, para no volver a avisarle a alguien que ya fue
   *  avisado si el pedido se restaura. */
  whatsapp: CoordinacionWhatsApp | null;
};

/** Elimina un pedido del teléfono y lo saca de la ruta del día si estaba ahí.
 *  Devuelve el recibo para restaurarlo (ver restaurarPedido), o null si ya no
 *  existía — dos toques en el mismo botón no son un error.
 *
 *  No toca la cola de eventos: lo que ya se marcó de este pedido está contado y
 *  así debe quedar. Los eventos no llevan el id del pedido (ver EventoCola), así
 *  que no queda nada apuntando a un pedido que no existe. */
export function borrarPedido(id: string, fecha: string): Promise<PedidoEliminado | null> {
  return enFila(async () => {
    const pedido = await leerUno<PedidoLocal>(STORES.pedidos, id);
    if (!pedido) return null;

    const ruta = await leerUno<RutaLocal>(STORES.rutas, fecha);
    const posicion = ruta ? ruta.paradas.findIndex((p) => p.pedidoId === id) : -1;
    const parada = ruta && posicion >= 0 ? ruta.paradas[posicion] : null;
    const rutaSinPedido =
      ruta && parada ? { ...ruta, paradas: ruta.paradas.filter((p) => p.pedidoId !== id) } : null;

    const whatsapp = await leerUno<CoordinacionWhatsApp>(STORES.whatsapp, id);

    await escribir([STORES.pedidos, STORES.rutas, STORES.whatsapp], ({ guardar, borrar }) => {
      borrar(STORES.pedidos, id);
      // La coordinación se va con el pedido: si se quedara, el store de WhatsApp
      // acumularía filas de pedidos que ya no existen, día tras día.
      if (whatsapp) borrar(STORES.whatsapp, id);
      if (rutaSinPedido) guardar(STORES.rutas, rutaSinPedido);
    });

    return { pedido: alDia(pedido), parada, posicion: Math.max(posicion, 0), whatsapp };
  });
}

/** Vuelve a poner un pedido eliminado tal como estaba, parada incluida.
 *
 *  Idempotente: restaurar dos veces el mismo recibo deja una sola parada. Hace
 *  falta porque el aviso de "Deshacer" vive sobre el mapa y se puede tocar dos
 *  veces antes de que la pantalla se rehaga. */
export function restaurarPedido(eliminado: PedidoEliminado, fecha: string): Promise<void> {
  const { pedido, parada, posicion, whatsapp } = eliminado;
  return enFila(async () => {
    const ruta = await leerUno<RutaLocal>(STORES.rutas, fecha);
    let rutaConPedido: RutaLocal | null = null;
    if (ruta && parada && !ruta.paradas.some((p) => p.pedidoId === pedido.id)) {
      const paradas = [...ruta.paradas];
      // Acotado al largo actual: mientras el aviso estaba a la vista pudieron
      // eliminarse otras paradas, y en ese caso el lugar que le toca es el final.
      paradas.splice(Math.min(posicion, paradas.length), 0, parada);
      rutaConPedido = { ...ruta, paradas };
    }

    await escribir([STORES.pedidos, STORES.rutas, STORES.whatsapp], ({ guardar }) => {
      guardar(STORES.pedidos, pedido);
      if (whatsapp) guardar(STORES.whatsapp, whatsapp);
      if (rutaConPedido) guardar(STORES.rutas, rutaConPedido);
    });
  });
}

// ----------------------------------------------------------------------------
// Ruta del día
// ----------------------------------------------------------------------------

export async function leerRuta(fecha: string): Promise<RutaLocal | null> {
  const ruta = await leerUno<RutaLocal>(STORES.rutas, fecha);
  return ruta ? rutaAlDia(ruta) : null;
}

/** Un día ya trabajado, resumido en las tres cifras que se leen de un vistazo.
 *
 *  Es lo que llena la lista de días del menú lateral. Solo cifras: los pedidos
 *  de un día pasado —nombres, teléfonos, direcciones— no hacen falta para
 *  decir cómo salió, y no tenerlos a mano es también no poder mostrarlos por
 *  error en una pantalla que se abre con el teléfono desbloqueado. */
export type DiaJornada = {
  fecha: string;
  paradas: number;
  entregadas: number;
  /** Cerradas sin entregar: no estaba, sin respuesta, rechazo, y la omisión
   *  heredada. Por descarte y no enumerando los valores, por lo mismo que en la
   *  pantalla: enumerarlos deja el contador en cero el día que aparece uno
   *  nuevo. */
  omitidas: number;
  /** null = ese día quedó abierto. Pasa cuando el chofer cerró la app sin
   *  marcar la última parada, y es justamente lo que hay que poder ver. */
  cerradaEn: string | null;
};

/** Los días que este teléfono tiene guardados, del más nuevo al más viejo.
 *
 *  Sale del store de rutas, que es lo único con una fila por día. Un día sin
 *  ruta armada no aparece: no hubo jornada que resumir. */
export async function leerDias(): Promise<DiaJornada[]> {
  const rutas = await leerTodos<RutaLocal>(STORES.rutas);
  return rutas
    .map((ruta) => ({
      fecha: ruta.fecha,
      paradas: ruta.paradas.length,
      entregadas: ruta.paradas.filter((p) => p.entrega === "entregado").length,
      omitidas: ruta.paradas.filter(
        (p) => p.entrega !== "pendiente" && p.entrega !== "entregado",
      ).length,
      cerradaEn: ruta.cerradaEn,
    }))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

/** Cuántos quedan por entregar. Pasa por el índice: la pantalla de inicio lo
 *  consulta para decidir si ofrece armar la ruta, y no necesita las filas. */
export function contarPendientes(): Promise<number> {
  return contarPorIndice(STORES.pedidos, INDICE_PEDIDO_ESTADO, "pendiente");
}

export type EntradaRuta = {
  fecha: string;
  /** Ids de pedido en orden de visita, tal como los calculó el ordenamiento. */
  pedidoIdsEnOrden: string[];
  geometria: [number, number][] | null;
  distanciaM: number | null;
  duracionS: number | null;
  /** Lo que quedó fuera o dudoso. Ver RutaLocal.advertencias. */
  advertencias?: string[];
  /** Entre 1 y 3. Ver RutaLocal.propuestasComparadas. */
  propuestasComparadas?: number;
  /** Ver RutaLocal.versionDisponibilidad. */
  versionDisponibilidad?: string | null;
};

// Guarda la ruta del día conservando SIEMPRE lo que ya se cerró en la jornada:
// las paradas entregadas u omitidas quedan primero, en su orden original, y
// detrás va el orden nuevo con lo que falta. Sin esto, regenerar a media mañana
// para meter dos pedidos nuevos borraría el registro de lo repartido antes.
//
// El estado de LLAMADA de una parada que sigue pendiente también se conserva:
// el chofer ya llamó, no tiene por qué volver a llamar solo porque rehizo la
// ruta.
export function guardarRuta(entrada: EntradaRuta): Promise<RutaLocal> {
  return enFila(async () => {
    const anterior = await leerRuta(entrada.fecha);
    const cerradas = (anterior?.paradas ?? []).filter((p) => p.entrega !== "pendiente");
    const yaCerrado = new Set(cerradas.map((p) => p.pedidoId));
    const llamadaPrevia = new Map(
      (anterior?.paradas ?? []).map((p) => [p.pedidoId, p] as const),
    );

    const nuevas: ParadaLocal[] = entrada.pedidoIdsEnOrden
      .filter((pedidoId) => !yaCerrado.has(pedidoId))
      .map((pedidoId) => {
        const previa = llamadaPrevia.get(pedidoId);
        return {
          pedidoId,
          llamada: previa?.llamada ?? "pendiente",
          entrega: "pendiente",
          horaLlamada: previa?.horaLlamada ?? null,
          horaEntrega: null,
        };
      });

    const ruta: RutaLocal = {
      fecha: entrada.fecha,
      paradas: [...cerradas, ...nuevas],
      // Si el servicio de rutas no respondió, conservar el trazado anterior le
      // sirve más al chofer que un mapa en blanco (mismo criterio que hoy tiene
      // generarRuta en el servidor).
      geometria: entrada.geometria ?? anterior?.geometria ?? null,
      distanciaM: entrada.distanciaM ?? anterior?.distanciaM ?? null,
      duracionS: entrada.duracionS ?? anterior?.duracionS ?? null,
      // La primera generación del día manda: es el comienzo de la jornada. Si
      // se pisara en cada rehacer, agregar un pedido a media tarde diría que el
      // conductor empezó a esa hora.
      generadaEn: anterior?.generadaEn ?? new Date().toISOString(),
      // Rehacer la ruta REABRE el día: si entraron paradas nuevas, la jornada
      // no estaba terminada. El servidor la vuelve a valorar cuando se cierre
      // otra vez (0032).
      cerradaEn: null,
      // Las advertencias son de ESTE cálculo y reemplazan a las anteriores: una
      // dirección que el chofer ya corrigió no puede seguir avisando.
      advertencias: entrada.advertencias ?? [],
      propuestasComparadas: entrada.propuestasComparadas ?? 1,
      versionDisponibilidad: entrada.versionDisponibilidad ?? null,
    };

    await escribir([STORES.rutas], ({ guardar }) => guardar(STORES.rutas, ruta));
    return ruta;
  });
}

/** Marca la ruta del día como terminada. Es lo que le dice al servidor que ya
 *  puede valorar la jornada (0032).
 *
 *  Idempotente: si ya estaba cerrada no mueve la hora. Volver a cerrar por un
 *  reintento no puede correr el fin de la jornada. */
export function cerrarRuta(fecha: string): Promise<RutaLocal | null> {
  return enFila(async () => {
    const ruta = await leerRuta(fecha);
    if (!ruta || ruta.cerradaEn) return ruta;

    const cerrada: RutaLocal = { ...ruta, cerradaEn: new Date().toISOString() };
    await escribir([STORES.rutas], ({ guardar }) => guardar(STORES.rutas, cerrada));
    return cerrada;
  });
}

/** Si no queda ninguna parada por cerrar. Con cero paradas da false: una ruta
 *  vacía no es una ruta terminada. */
export function rutaTerminada(ruta: RutaLocal | null): boolean {
  if (!ruta || ruta.paradas.length === 0) return false;
  return ruta.paradas.every((p) => p.entrega !== "pendiente");
}

// ----------------------------------------------------------------------------
// Marcar en terreno — las dos operaciones que mueven plata
// ----------------------------------------------------------------------------

/** Si en todo el día no se cerró ni se llamó nada todavía, este es el primer
 *  acto en terreno: hay que dejar constancia en el servidor de que el chofer
 *  salió, aunque después no logre entregar nada (de eso depende el fijo
 *  diario). Después del primero ya no hace falta: cualquier evento del día
 *  prueba lo mismo. */
function esPrimeraAccion(ruta: RutaLocal): boolean {
  return ruta.paradas.every((p) => p.llamada === "pendiente" && p.entrega === "pendiente");
}

function evento(
  choferId: string,
  fecha: string,
  tipo: EventoCola["tipo"],
  hora: string,
  motivo: MotivoNoEntrega | null = null,
): EventoCola {
  // El motivo se omite en vez de guardarse como null cuando no hay: así una
  // entrega y una llamada quedan con la misma forma exacta que tenían antes de
  // esta feature, y un evento viejo que sigue en la cola de un teléfono no se
  // distingue de uno nuevo.
  return { id: uuidv7(), choferId, fecha, tipo, hora, ...(motivo ? { motivo } : {}) };
}

export type Marca = {
  fecha: string;
  pedidoId: string;
  choferId: string;
};

/** A qué estado deja al PEDIDO un resultado de entrega. Está en una función y
 *  no escrito dos veces porque hay dos puertas que cierran un pedido
 *  —marcarEntrega y registrarRechazo— y si discreparan, un rechazo entrado por
 *  una de las dos volvería a aparecer mañana. */
function conEstadoDeResultado(
  pedido: PedidoLocal,
  resultado: Exclude<EstadoEntregaLocal, "pendiente">,
): PedidoLocal {
  if (resultado === "entregado") return { ...pedido, estado: "entregado" };
  if (resultado === "rechazo") return { ...pedido, estado: "rechazado" };
  // No encontrada, sin respuesta y la omisión heredada: sigue pendiente.
  return pedido;
}

/** Registra el resultado de llamar al destinatario. No suma ni resta entregas:
 *  solo prueba que el chofer está trabajando (ver esPrimeraAccion). */
export function marcarLlamada(
  { fecha, pedidoId, choferId }: Marca,
  resultado: Exclude<EstadoLlamadaLocal, "pendiente">,
): Promise<void> {
  return enFila(async () => {
    const ruta = await leerRuta(fecha);
    if (!ruta) throw new Error("No hay una ruta para ese día.");
    if (!ruta.paradas.some((p) => p.pedidoId === pedidoId)) {
      throw new Error("Ese pedido no está en la ruta del día.");
    }

    const hora = new Date().toISOString();
    const primera = esPrimeraAccion(ruta);
    const actualizada: RutaLocal = {
      ...ruta,
      paradas: ruta.paradas.map((p) =>
        p.pedidoId === pedidoId ? { ...p, llamada: resultado, horaLlamada: hora } : p,
      ),
    };

    await escribir([STORES.rutas, STORES.cola], ({ guardar }) => {
      guardar(STORES.rutas, actualizada);
      if (primera) guardar(STORES.cola, evento(choferId, fecha, "llamada", hora));
    });
  });
}

/** Cierra una parada.
 *
 *  Qué le pasa al PEDIDO depende del resultado, y son tres caminos distintos:
 *
 *   · "entregado"             → el pedido se cierra. No vuelve.
 *   · "rechazo"               → el pedido se cierra también, pero como rechazado.
 *                               Es la mitad local de FR-012: al no quedar
 *                               "pendiente", ninguna ruta futura lo puede volver
 *                               a proponer, y no hay que acordarse de excluirlo.
 *   · no encontrada / sin respuesta → el pedido SIGUE pendiente y se arrastra al
 *                               día siguiente, igual que la omisión de antes.
 *
 *  El evento para el servidor sale en la misma transacción, con el motivo no
 *  personal que necesita el panel del jefe. */
export function marcarEntrega(
  { fecha, pedidoId, choferId }: Marca,
  resultado: Exclude<EstadoEntregaLocal, "pendiente">,
  /** Milisegundos que el evento queda retenido en la cola antes de poder
   *  salir: la ventana en la que el chofer puede deshacer (ver leerCola). 0 lo
   *  deja listo para el próximo envío. */
  retenerMs = 0,
): Promise<string | null> {
  return enFila(async () => {
    const [ruta, pedido] = await Promise.all([leerRuta(fecha), leerPedido(pedidoId)]);
    if (!ruta) throw new Error("No hay una ruta para ese día.");
    if (!pedido) throw new Error("Ese pedido ya no existe en este teléfono.");
    const parada = ruta.paradas.find((p) => p.pedidoId === pedidoId);
    if (!parada) throw new Error("Ese pedido no está en la ruta del día.");
    // Marcar dos veces la misma parada duplicaría el evento y por lo tanto el
    // conteo: el id del evento sería nuevo, así que la idempotencia del servidor
    // no lo frenaría. Se corta acá.
    //
    // Este guardia solo vale porque la lectura de arriba y la escritura de abajo
    // corren sin que se meta otra marca en el medio; eso lo garantiza enFila
    // (ver su comentario). Sin la fila, dos toques simultáneos leían los dos
    // "pendiente" y pasaban los dos.
    if (parada.entrega !== "pendiente") return null;

    const hora = new Date().toISOString();
    const actualizada: RutaLocal = {
      ...ruta,
      paradas: ruta.paradas.map((p) =>
        p.pedidoId === pedidoId ? { ...p, entrega: resultado, horaEntrega: hora } : p,
      ),
    };
    const pedidoActualizado = conEstadoDeResultado(pedido, resultado);

    const registro: EventoCola = {
      ...evento(
        choferId,
        fecha,
        resultado === "entregado" ? "entrega" : "omision",
        hora,
        motivoDeEntrega(resultado),
      ),
      ...(retenerMs > 0
        ? { retenidoHasta: new Date(Date.now() + retenerMs).toISOString() }
        : {}),
    };

    await escribir([STORES.rutas, STORES.pedidos, STORES.cola], ({ guardar }) => {
      guardar(STORES.rutas, actualizada);
      guardar(STORES.pedidos, pedidoActualizado);
      guardar(STORES.cola, registro);
    });

    return registro.id;
  });
}

/** Reabre una parada que se acaba de cerrar: la devuelve a pendiente, borra su
 *  evento de la cola y reabre la jornada si ese cierre había sido el último.
 *
 *  Solo tiene sentido dentro de la ventana de retención (ver marcarEntrega):
 *  pasada esa ventana el evento ya salió al servidor, y ahí borrarlo del
 *  teléfono dejaría las dos partes contando cosas distintas. Por eso se comprueba
 *  que el evento SIGA en la cola; si no está, no se toca nada. */
export function deshacerEntrega(
  { fecha, pedidoId }: { fecha: string; pedidoId: string },
  eventoId: string,
): Promise<boolean> {
  return enFila(async () => {
    const [ruta, pedido, enCola] = await Promise.all([
      leerRuta(fecha),
      leerPedido(pedidoId),
      leerUno<EventoCola>(STORES.cola, eventoId),
    ]);
    if (!ruta || !pedido || !enCola) return false;

    const reabierta: RutaLocal = {
      ...ruta,
      paradas: ruta.paradas.map((p) =>
        p.pedidoId === pedidoId ? { ...p, entrega: "pendiente", horaEntrega: null } : p,
      ),
      // Si esta era la última parada, marcarla cerró la jornada (ver la pantalla
      // del chofer). Al reabrirla, el día vuelve a estar en curso: sin esto el
      // servidor valoraría una jornada que todavía tiene una entrega por hacer.
      cerradaEn: null,
    };

    await escribir([STORES.rutas, STORES.pedidos, STORES.cola], ({ guardar, borrar }) => {
      guardar(STORES.rutas, reabierta);
      guardar(STORES.pedidos, { ...pedido, estado: "pendiente" });
      borrar(STORES.cola, eventoId);
    });

    return true;
  });
}

/** Manda una parada al final del recorrido, sin cerrarla. Es lo que pasa cuando
 *  el destinatario no contesta y el chofer decide reintentar al terminar: la
 *  parada sigue pendiente, solo cambia de lugar en la fila.
 *
 *  No toca el trazado: la línea gris del día queda dibujada en el orden viejo
 *  hasta que se rehaga la ruta. La que importa manejando —la azul, hasta la
 *  parada activa— se recalcula sola contra la posición del chofer. */
export function moverAlFinal({
  fecha,
  pedidoId,
}: {
  fecha: string;
  pedidoId: string;
}): Promise<void> {
  return enFila(async () => {
    const ruta = await leerRuta(fecha);
    if (!ruta) throw new Error("No hay una ruta para ese día.");
    const parada = ruta.paradas.find((p) => p.pedidoId === pedidoId);
    if (!parada) throw new Error("Ese pedido no está en la ruta del día.");

    const actualizada: RutaLocal = {
      ...ruta,
      paradas: [...ruta.paradas.filter((p) => p.pedidoId !== pedidoId), parada],
    };

    await escribir([STORES.rutas], ({ guardar }) => guardar(STORES.rutas, actualizada));
  });
}

// ----------------------------------------------------------------------------
// Disponibilidad del receptor
// ----------------------------------------------------------------------------
//
// Lo que el receptor contesta por WhatsApp entra por acá, y entra desde AFUERA:
// la respuesta llega al servidor y el teléfono la baja después (ver
// ./whatsapp.ts y la Decisión 7 de research.md). Eso hace que estas escrituras
// tengan un problema que las demás no tienen: pueden llegar dos veces, tarde, o
// en distinto orden del que el receptor las tocó.
//
// Las tres reglas que sostienen eso:
//
//  1. IDEMPOTENCIA POR MENSAJE. Cada respuesta trae el id del mensaje de
//     WhatsApp que la originó, y ese id queda anotado en el store `whatsapp`.
//     Volver a bajar la misma respuesta —porque la confirmación al servidor se
//     cortó— no la aplica de nuevo.
//  2. UN RECHAZO NO SE REABRE SOLO. Es la regla del producto (FR-012) llevada al
//     dominio: si el receptor dijo que no, ninguna respuesta posterior que llegue
//     por el mismo canal lo vuelve a poner disponible. Solo una acción explícita
//     del chofer puede.
//  3. "NO RESPONDIÓ" NO PISA UNA RESPUESTA. La marca de sin respuesta la pone el
//     teléfono al aproximarse a la parada; si mientras tanto había llegado un
//     "sí", el "sí" gana. Al revés, el chofer llamaría a alguien que ya contestó.

/** Coordinación del aviso de WhatsApp de UN pedido. Vive en su propio store
 *  porque la escribe la sincronización, no el chofer (ver STORES.whatsapp). */
export type CoordinacionWhatsApp = {
  /** Clave del store. */
  pedidoId: string;
  /** El identificador opaco que viaja a Meta y vuelve en la respuesta. null
   *  hasta que el aviso se manda por primera vez. */
  correlationId: string | null;
  /** wamid del aviso saliente, para empatar los estados del mensaje. */
  mensajeId: string | null;
  /** Del MENSAJE, no de la entrega: "fallido" quiere decir que WhatsApp no lo
   *  pudo dejar, no que el receptor haya rechazado nada (ver el contrato). */
  estado: "pendiente" | "enviado" | "entregado" | "leido" | "respondido" | "fallido";
  /** ISO del último envío. */
  enviadoEn: string | null;
  /** Mostrable al chofer, con el botón de reintentar al lado. */
  ultimoError: string | null;
  /** Cuántas veces se intentó mandar el aviso. Frena el reintento automático
   *  eterno cuando el número simplemente no tiene WhatsApp. */
  intentos: number;
  /** Si ya se le mandó la lista de bloques horarios. Es un segundo mensaje
   *  saliente, distinto del aviso, y puede fallar por su cuenta (ver la
   *  Decisión 8 de research.md). */
  horariosEnviados: boolean;
  /** Ids de mensaje de respuesta ya aplicados. La clave de la regla 1. */
  respuestasAplicadas: string[];
};

function coordinacionVacia(pedidoId: string): CoordinacionWhatsApp {
  return {
    pedidoId,
    correlationId: null,
    mensajeId: null,
    estado: "pendiente",
    enviadoEn: null,
    ultimoError: null,
    intentos: 0,
    horariosEnviados: false,
    respuestasAplicadas: [],
  };
}

async function leerCoordinacion(pedidoId: string): Promise<CoordinacionWhatsApp> {
  const guardada = await leerUno<CoordinacionWhatsApp>(STORES.whatsapp, pedidoId);
  // Se completa contra la vacía y no se devuelve tal cual: una fila escrita por
  // una versión anterior puede no tener los campos nuevos.
  return guardada ? { ...coordinacionVacia(pedidoId), ...guardada } : coordinacionVacia(pedidoId);
}

export async function leerCoordinaciones(): Promise<CoordinacionWhatsApp[]> {
  const filas = await leerTodos<CoordinacionWhatsApp>(STORES.whatsapp);
  return filas.map((f) => ({ ...coordinacionVacia(f.pedidoId), ...f }));
}

/** Lo que el receptor puede contestar. Es exactamente el contrato de
 *  contracts/local-domain.md: una de cuatro, y el bloque solo viene con la que
 *  lo necesita. */
export type RespuestaDisponibilidad =
  | { tipo: "confirmado" }
  | { tipo: "horario_indicado"; bloqueHorarioId: string }
  | { tipo: "rechazado" }
  | { tipo: "disponibilidad_sin_respuesta" };

/** Anota que el aviso salió. `correlationId` y `mensajeId` los devuelve el
 *  servidor; se guardan para poder empatar después el estado del mensaje y para
 *  no volver a mandar el aviso del mismo pedido. */
export function registrarEnvioWhatsapp({
  pedidoId,
  correlationId,
  mensajeId,
}: {
  pedidoId: string;
  correlationId: string;
  mensajeId: string | null;
}): Promise<CoordinacionWhatsApp> {
  return enFila(async () => {
    const previa = await leerCoordinacion(pedidoId);
    const coordinacion: CoordinacionWhatsApp = {
      ...previa,
      correlationId,
      mensajeId,
      estado: "enviado",
      enviadoEn: new Date().toISOString(),
      ultimoError: null,
      intentos: previa.intentos + 1,
    };
    await escribir([STORES.whatsapp], ({ guardar }) => guardar(STORES.whatsapp, coordinacion));
    return coordinacion;
  });
}

/** Anota que el aviso NO se pudo mandar. Cuenta el intento igual: es lo que
 *  frena el reintento eterno de un número que no tiene WhatsApp. */
export function registrarFalloWhatsapp(pedidoId: string, error: string): Promise<void> {
  return enFila(async () => {
    const previa = await leerCoordinacion(pedidoId);
    await escribir([STORES.whatsapp], ({ guardar }) =>
      guardar(STORES.whatsapp, {
        ...previa,
        estado: "fallido",
        ultimoError: error,
        intentos: previa.intentos + 1,
      }),
    );
  });
}

/** Anota que ya se le mandó la lista de bloques horarios, para no repetirla. */
export function marcarHorariosEnviados(pedidoId: string): Promise<void> {
  return enFila(async () => {
    const previa = await leerCoordinacion(pedidoId);
    await escribir([STORES.whatsapp], ({ guardar }) =>
      guardar(STORES.whatsapp, { ...previa, horariosEnviados: true }),
    );
  });
}

const ORDEN_ESTADO_MENSAJE: CoordinacionWhatsApp["estado"][] = [
  "pendiente",
  "enviado",
  "entregado",
  "leido",
  "respondido",
];

/** Anota un estado del MENSAJE (enviado, entregado, leído, fallido). Nunca toca
 *  la disponibilidad: un mensaje que no se pudo entregar deja al pedido
 *  pendiente de contacto, no rechazado ni sin respuesta — es una regla explícita
 *  del contrato de WhatsApp. */
export function registrarEstadoMensaje(
  pedidoId: string,
  estado: CoordinacionWhatsApp["estado"],
  error: string | null = null,
): Promise<void> {
  return enFila(async () => {
    const previa = await leerCoordinacion(pedidoId);
    // Meta no garantiza el orden de los webhooks: un "sent" que llega después
    // del "delivered" no puede hacer retroceder el estado.
    const retrocede =
      estado !== "fallido" &&
      previa.estado !== "fallido" &&
      ORDEN_ESTADO_MENSAJE.indexOf(estado) < ORDEN_ESTADO_MENSAJE.indexOf(previa.estado);

    await escribir([STORES.whatsapp], ({ guardar }) =>
      guardar(STORES.whatsapp, {
        ...previa,
        estado: retrocede ? previa.estado : estado,
        ultimoError: error,
      }),
    );
  });
}

/** Aplica una respuesta del receptor. Devuelve si CAMBIÓ algo: false significa
 *  que ya estaba aplicada o que una de las tres reglas de arriba la descartó, y
 *  en los dos casos el llamador puede confirmarla al servidor igual (ya está
 *  resuelta).
 *
 *  El pedido y la coordinación se escriben en la MISMA transacción: si quedara
 *  la respuesta anotada como aplicada sin el pedido actualizado, esa respuesta
 *  no volvería a bajar nunca y el receptor habría contestado al vacío. */
export function registrarDisponibilidad(
  pedidoId: string,
  respuesta: RespuestaDisponibilidad,
  /** Id del mensaje de WhatsApp que trajo la respuesta. null cuando el origen es
   *  local (el chofer marcando "no respondió" al aproximarse): no hay nada que
   *  deduplicar porque no puede llegar dos veces desde afuera. */
  mensajeId: string | null = null,
): Promise<boolean> {
  return enFila(async () => {
    const [pedido, coordinacion] = await Promise.all([
      leerPedido(pedidoId),
      leerCoordinacion(pedidoId),
    ]);
    // El chofer pudo borrar el pedido mientras la respuesta viajaba.
    if (!pedido) return false;

    // Regla 1: idempotencia por mensaje.
    if (mensajeId && coordinacion.respuestasAplicadas.includes(mensajeId)) return false;

    const yaAplicadas = mensajeId
      ? [...coordinacion.respuestasAplicadas, mensajeId]
      : coordinacion.respuestasAplicadas;

    // Regla 2: un rechazo no se reabre por una respuesta que llega después.
    // Regla 3: "no respondió" no pisa una respuesta de verdad.
    const bloqueado =
      (pedido.disponibilidad === "rechazado" && respuesta.tipo !== "rechazado") ||
      (respuesta.tipo === "disponibilidad_sin_respuesta" &&
        pedido.disponibilidad !== "pendiente_respuesta");

    if (bloqueado) {
      // Se anota el mensaje como visto de todos modos: si no, cada consulta al
      // servidor lo volvería a bajar y a descartar, para siempre.
      if (mensajeId) {
        await escribir([STORES.whatsapp], ({ guardar }) =>
          guardar(STORES.whatsapp, { ...coordinacion, respuestasAplicadas: yaAplicadas }),
        );
      }
      return false;
    }

    const actualizado: PedidoLocal = {
      ...pedido,
      disponibilidad: respuesta.tipo,
      // El bloque se limpia con cualquier otra respuesta: si el receptor había
      // elegido 18:00-20:00 y después contesta que no lo recibe, dejar el bloque
      // puesto haría que la ruta siguiera ordenando por una ventana que ya no
      // significa nada.
      bloqueHorarioId: respuesta.tipo === "horario_indicado" ? respuesta.bloqueHorarioId : null,
    };

    await escribir([STORES.pedidos, STORES.whatsapp], ({ guardar }) => {
      guardar(STORES.pedidos, actualizado);
      guardar(STORES.whatsapp, {
        ...coordinacion,
        estado: "respondido",
        respuestasAplicadas: yaAplicadas,
      });
    });
    return true;
  });
}

/** Vuelve la disponibilidad a cero y borra la coordinación. Es la única forma de
 *  reabrir un rechazo, y existe para un caso concreto: el chofer se dio cuenta de
 *  que el teléfono estaba mal escrito. Esa respuesta era de otra persona, así que
 *  no puede quedar pegada al pedido ni el pedido puede quedar cerrado por ella. */
export function reiniciarDisponibilidad(pedidoId: string): Promise<void> {
  return enFila(async () => {
    const pedido = await leerPedido(pedidoId);
    if (!pedido) return;

    await escribir([STORES.pedidos, STORES.whatsapp], ({ guardar, borrar }) => {
      guardar(STORES.pedidos, {
        ...pedido,
        disponibilidad: "pendiente_respuesta",
        bloqueHorarioId: null,
        // Un pedido que se había cerrado por rechazo vuelve a la ruta. Uno ya
        // entregado NO se reabre: la entrega ocurrió y está contada.
        estado: pedido.estado === "rechazado" ? "pendiente" : pedido.estado,
      });
      borrar(STORES.whatsapp, pedidoId);
    });
  });
}

/** Cierra un pedido como rechazado SIN que tenga una parada en la ruta del día.
 *
 *  Hace falta porque un rechazo puede llegar por WhatsApp antes de que el pedido
 *  entre en una ruta: ahí no hay parada que marcar, pero el jefe igual tiene que
 *  contarlo (FR-021) y el pedido tiene que dejar de proponerse (FR-012). El
 *  evento y el cierre salen en la misma transacción, igual que en marcarEntrega.
 *
 *  Idempotente: si el pedido ya está cerrado devuelve null y no encola nada. */
export function registrarRechazo({ fecha, pedidoId, choferId }: Marca): Promise<string | null> {
  return enFila(async () => {
    const pedido = await leerPedido(pedidoId);
    if (!pedido) throw new Error("Ese pedido ya no existe en este teléfono.");
    if (pedido.estado !== "pendiente") return null;

    const hora = new Date().toISOString();
    const registro = evento(choferId, fecha, "omision", hora, "rechazo");

    await escribir([STORES.pedidos, STORES.cola], ({ guardar }) => {
      guardar(STORES.pedidos, { ...pedido, estado: "rechazado" });
      guardar(STORES.cola, registro);
    });
    return registro.id;
  });
}

/** Los pedidos que el receptor rechazó por WhatsApp y que todavía nadie
 *  registró. Son los que hay que sacar de la ruta y mostrarle al chofer para que
 *  los cierre antes de terminar la jornada. */
export async function rechazadosSinRegistrar(): Promise<PedidoLocal[]> {
  const pedidos = await leerPedidos();
  return pedidos.filter((p) => p.estado === "pendiente" && p.disponibilidad === "rechazado");
}

// ----------------------------------------------------------------------------
// Cola de envío (el vaciado vive en el enviador, ver tarea de cola offline)
// ----------------------------------------------------------------------------

export async function leerCola(): Promise<EventoCola[]> {
  const eventos = await leerTodos<EventoCola>(STORES.cola);
  const ahora = new Date().toISOString();
  return (
    eventos
      // Lo retenido no está listo para salir: es lo que el chofer todavía puede
      // deshacer. Se filtra acá, en la única puerta de la cola, para que ni el
      // envío ni el contador de "sin enviar" tengan que saber que existe una
      // ventana de arrepentimiento.
      .filter((e) => !e.retenidoHasta || e.retenidoHasta <= ahora)
      // Más viejos primero: si algo se cae a mitad de un envío grande, lo que se
      // fue es lo más antiguo y la cola queda coherente.
      .sort((a, b) => a.hora.localeCompare(b.hora))
  );
}

/** Se llama SOLO después de que el servidor confirmó el insert. */
export function quitarDeCola(ids: string[]): Promise<void> {
  return escribir([STORES.cola], ({ borrar }) => {
    for (const id of ids) borrar(STORES.cola, id);
  });
}

// Reexportado para que las pantallas puedan distinguir "el teléfono no puede
// guardar" (accionable: instalar la app, salir del modo privado) de cualquier
// otro error.
export { ErrorAlmacenLocal } from "./idb";
