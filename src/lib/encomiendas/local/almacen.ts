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

/** Un pedido tiene solo dos estados, igual que en el servidor (ver 0018 y
 *  ENCOMIENDA_ESTADOS): omitir NO lo cierra, lo deja pendiente para
 *  reintentarlo otro día. Es lo que hace que los pendientes se arrastren de una
 *  jornada a la siguiente. */
export type EstadoPedidoLocal = "pendiente" | "entregado";

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
  /** ISO. Sirve para ordenar la lista y para ver cuánto lleva sin entregarse. */
  cargadoEn: string;
};

export type EstadoLlamadaLocal = "pendiente" | "contesto" | "no_contesto";
export type EstadoEntregaLocal = "pendiente" | "entregado" | "omitido";

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
};

/** Evento esperando salir a encomienda_actividad. Los nombres son los del
 *  dominio local; la traducción a columnas se hace al enviarlo. */
export type EventoCola = {
  /** UUIDv7: el MISMO id que va a la base, para que reenviar no duplique. */
  id: string;
  choferId: string;
  fecha: string;
  tipo: "entrega" | "omision" | "llamada";
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
// Pedidos
// ----------------------------------------------------------------------------

export async function leerPedidos(): Promise<PedidoLocal[]> {
  const pedidos = await leerTodos<PedidoLocal>(STORES.pedidos);
  return pedidos.sort((a, b) => b.cargadoEn.localeCompare(a.cargadoEn));
}

/** Los que todavía hay que entregar, incluidos los arrastrados de días
 *  anteriores. Es la entrada para armar la ruta. */
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
    const anterior = id ? await leerUno<PedidoLocal>(STORES.pedidos, id) : null;

    const pedido: PedidoLocal = {
      ...datos,
      id: anterior?.id ?? id ?? uuidv7(),
      // Editar un pedido no lo reabre ni lo cierra: el estado solo cambia al
      // marcar la entrega.
      estado: anterior?.estado ?? "pendiente",
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
    const actuales = await Promise.all(
      coordenadas.map((c) => leerUno<PedidoLocal>(STORES.pedidos, c.id)),
    );

    await escribir([STORES.pedidos], ({ guardar }) => {
      actuales.forEach((pedido, i) => {
        if (!pedido) return;
        guardar(STORES.pedidos, { ...pedido, lat: coordenadas[i].lat, lng: coordenadas[i].lng });
      });
    });
  });
}

/** Borra un pedido y lo saca de la ruta del día si estaba ahí. No toca eventos
 *  ya enviados: si se entregó, esa entrega ya está contada y así debe quedar. */
export function borrarPedido(id: string, fecha: string): Promise<void> {
  return enFila(async () => {
    const ruta = await leerUno<RutaLocal>(STORES.rutas, fecha);
    const rutaSinPedido = ruta
      ? { ...ruta, paradas: ruta.paradas.filter((p) => p.pedidoId !== id) }
      : null;

    await escribir([STORES.pedidos, STORES.rutas], ({ guardar, borrar }) => {
      borrar(STORES.pedidos, id);
      if (rutaSinPedido) guardar(STORES.rutas, rutaSinPedido);
    });
  });
}

// ----------------------------------------------------------------------------
// Ruta del día
// ----------------------------------------------------------------------------

export function leerRuta(fecha: string): Promise<RutaLocal | null> {
  return leerUno<RutaLocal>(STORES.rutas, fecha);
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
): EventoCola {
  return { id: uuidv7(), choferId, fecha, tipo, hora };
}

export type Marca = {
  fecha: string;
  pedidoId: string;
  choferId: string;
};

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

/** Cierra una parada. "entregado" cierra también el pedido; "omitido" lo deja
 *  pendiente para reintentarlo otro día (igual que el trigger del servidor en
 *  la 0018). El evento para el servidor sale en la misma transacción. */
export function marcarEntrega(
  { fecha, pedidoId, choferId }: Marca,
  resultado: Exclude<EstadoEntregaLocal, "pendiente">,
  /** Milisegundos que el evento queda retenido en la cola antes de poder
   *  salir: la ventana en la que el chofer puede deshacer (ver leerCola). 0 lo
   *  deja listo para el próximo envío. */
  retenerMs = 0,
): Promise<string | null> {
  return enFila(async () => {
    const [ruta, pedido] = await Promise.all([
      leerRuta(fecha),
      leerUno<PedidoLocal>(STORES.pedidos, pedidoId),
    ]);
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
    const pedidoActualizado: PedidoLocal =
      resultado === "entregado" ? { ...pedido, estado: "entregado" } : pedido;

    const registro: EventoCola = {
      ...evento(choferId, fecha, resultado === "entregado" ? "entrega" : "omision", hora),
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
      leerUno<PedidoLocal>(STORES.pedidos, pedidoId),
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
