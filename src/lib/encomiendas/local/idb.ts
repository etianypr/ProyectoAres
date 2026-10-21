"use client";

// Base local del módulo de encomiendas. Los pedidos (con nombre, teléfono y
// dirección del destinatario), la ruta del día y la cola de actividad
// pendiente de enviar viven en el TELÉFONO del chofer, no en el servidor —
// ver el comentario de cabecera de la migración 0026 para el por qué.
//
// IndexedDB y no localStorage: localStorage es sincrónico (traba la pantalla
// mientras el chofer maneja), guarda solo texto y tiene ~5 MB. Acá se guardan
// objetos con el trazado de la ruta, que en un día de 30 paradas son
// miles de coordenadas.
//
// IMPORTANTE — la app TIENE que estar instalada ("Agregar a pantalla de
// inicio"). En iOS, un sitio abierto suelto desde el navegador pierde todo lo
// guardado después de 7 días sin usarse; una PWA instalada está exenta. Con
// los pedidos pendientes viviendo acá, instalarla dejó de ser una
// recomendación y pasó a ser requisito.
//
// Este módulo no se puede importar desde un componente de servidor:
// IndexedDB no existe ahí. De ahí el "use client".

import { hoyChile } from "@/lib/format";
import { migrarV2, type AvisoV2, type PedidoV2, type RutaV2 } from "./almacen/migrar";
import type { ActividadPorEnviar, Pedido, Ruta } from "./almacen/tipos";

const NOMBRE_BASE = "pucarani-encomiendas";

// Subir la versión al agregar o quitar un store o un índice, o al mover datos
// entre stores. Un campo nuevo dentro de un objeto no la necesita —IndexedDB no
// valida campos—: se completa al leer (ver almacen/migrar.ts).
//
// v2: store "whatsapp" (coordinación del aviso de disponibilidad).
// v3: la parada y el aviso se funden en el pedido (specs 009 y 011): migrarV2
//     mueve llamada, entrega y fecha de rutas.paradas, y el aviso del store
//     "whatsapp", a cada pedido. Se borran el store "whatsapp" y el índice por
//     estado, que ya no existen.
const VERSION = 3;

export const STORES = {
  /** Pedidos cargados por el chofer. Clave: id (UUIDv7 del teléfono). Los ya
   *  entregados se conservan como historial local del propio chofer. */
  pedidos: "pedidos",
  /** Una fila por día trabajado. Clave: fecha "YYYY-MM-DD" en hora de Chile. */
  rutas: "rutas",
  /** Eventos de actividad esperando salir al servidor. Clave: id (UUIDv7) — el
   *  MISMO id que va a encomienda_actividad, que es lo que hace que reenviar
   *  no duplique el conteo. */
  cola: "cola",
} as const satisfies { [S in Store]: S };

/** Qué forma guarda cada store. Leer y escribir quedan tipados por store. */
export type FilaDe = {
  pedidos: Pedido;
  rutas: Ruta;
  cola: ActividadPorEnviar;
};

export type Store = keyof FilaDe;

/** Índice de la v1–v2 sobre `estado`, campo que ya no existe. La v3 lo borra. */
const INDICE_VIEJO_POR_ESTADO = "por_estado";

/** Store de la v2 con el aviso de cada pedido. La v3 lo funde en el pedido. */
const STORE_VIEJO_WHATSAPP = "whatsapp";

export class ErrorAlmacenLocal extends Error {}

const SIN_SOPORTE =
  "Este navegador no puede guardar la ruta en el teléfono. Abre la app instalada desde la pantalla de inicio (y no en una ventana privada).";

let basePromesa: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (basePromesa) return basePromesa;

  const promesa = new Promise<IDBDatabase>((resolve, reject) => {
    // En navegación privada de iOS y en algunos WebView, indexedDB existe pero
    // open() falla; y en otros no existe del todo. Los dos casos terminan acá
    // con un mensaje que el chofer puede accionar.
    if (typeof indexedDB === "undefined") {
      reject(new ErrorAlmacenLocal(SIN_SOPORTE));
      return;
    }

    let solicitud: IDBOpenDBRequest;
    try {
      solicitud = indexedDB.open(NOMBRE_BASE, VERSION);
    } catch {
      reject(new ErrorAlmacenLocal(SIN_SOPORTE));
      return;
    }

    solicitud.onupgradeneeded = (evento) => {
      const base = solicitud.result;
      if (!base.objectStoreNames.contains(STORES.pedidos)) {
        base.createObjectStore(STORES.pedidos, { keyPath: "id" });
      }
      if (!base.objectStoreNames.contains(STORES.rutas)) {
        base.createObjectStore(STORES.rutas, { keyPath: "fecha" });
      }
      if (!base.objectStoreNames.contains(STORES.cola)) {
        base.createObjectStore(STORES.cola, { keyPath: "id" });
      }

      // La transacción de versión es atómica: si la migración falla, la base
      // queda en la versión anterior con todo como estaba.
      const tx = solicitud.transaction;
      if (tx && evento.oldVersion > 0 && evento.oldVersion < 3) migrarAV3(tx);
    };

    solicitud.onsuccess = () => {
      const base = solicitud.result;
      // Si otra pestaña abre una versión más nueva, esta conexión la bloquearía
      // para siempre. Se cierra sola y la próxima operación vuelve a abrir.
      base.onversionchange = () => {
        base.close();
        basePromesa = null;
      };
      resolve(base);
    };

    solicitud.onerror = () =>
      reject(new ErrorAlmacenLocal(solicitud.error?.message ?? SIN_SOPORTE));

    // Otra pestaña tiene abierta una versión anterior y no la suelta.
    solicitud.onblocked = () =>
      reject(
        new ErrorAlmacenLocal(
          "La app quedó abierta en otra pestaña con una versión anterior. Ciérrala y vuelve a entrar.",
        ),
      );
  });

  basePromesa = promesa;
  // Un fallo no se cachea para siempre: si fue transitorio, el próximo intento
  // vuelve a abrir en vez de arrastrar el error toda la sesión. El catch
  // también evita que la rechazada quede sin manejar.
  promesa.catch(() => {
    if (basePromesa === promesa) basePromesa = null;
  });
  return promesa;
}

/** v2 → v3 dentro de la transacción de versión (ver almacen/migrar.ts). */
function migrarAV3(tx: IDBTransaction): void {
  const pedidos = tx.objectStore(STORES.pedidos);
  const rutas = tx.objectStore(STORES.rutas);
  if (pedidos.indexNames.contains(INDICE_VIEJO_POR_ESTADO)) {
    pedidos.deleteIndex(INDICE_VIEJO_POR_ESTADO);
  }

  const conAvisos = tx.objectStoreNames.contains(STORE_VIEJO_WHATSAPP);
  const pidePedidos = pedidos.getAll();
  const pideRutas = rutas.getAll();
  const pideAvisos = conAvisos ? tx.objectStore(STORE_VIEJO_WHATSAPP).getAll() : null;
  // Las solicitudes de una transacción se resuelven en orden: cuando llega la
  // última, las anteriores ya están.
  const ultima = pideAvisos ?? pideRutas;
  ultima.onsuccess = () => {
    const migrado = migrarV2(
      pidePedidos.result as PedidoV2[],
      pideRutas.result as RutaV2[],
      (pideAvisos?.result ?? []) as AvisoV2[],
      hoyChile(),
    );
    for (const p of migrado.pedidos) pedidos.put(p);
    for (const r of migrado.rutas) rutas.put(r);
    if (conAvisos) tx.db.deleteObjectStore(STORE_VIEJO_WHATSAPP);
  };
}

function pedir<T>(solicitud: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () =>
      reject(new ErrorAlmacenLocal(solicitud.error?.message ?? "Falló la lectura local."));
  });
}

export async function leerTodos<S extends Store>(store: S): Promise<FilaDe[S][]> {
  const base = await abrir();
  const tx = base.transaction(store, "readonly");
  return pedir(tx.objectStore(store).getAll() as IDBRequest<FilaDe[S][]>);
}

export async function leerUno<S extends Store>(store: S, clave: string): Promise<FilaDe[S] | null> {
  const base = await abrir();
  const tx = base.transaction(store, "readonly");
  const valor = await pedir(tx.objectStore(store).get(clave) as IDBRequest<FilaDe[S] | undefined>);
  return valor ?? null;
}

export type Escritor = {
  guardar: <S extends Store>(store: S, valor: FilaDe[S]) => void;
  borrar: (store: Store, clave: string) => void;
};

// Escribe en uno o varios stores dentro de UNA transacción: o queda todo, o no
// queda nada. Es lo que hace que marcar una entrega no pueda dejar el pedido
// cerrado sin su evento en la cola (perdería plata del chofer) ni el evento sin
// el pedido cerrado (lo mostraría dos veces).
//
// El callback es SINCRÓNICO a propósito y no puede usar await: una transacción
// de IndexedDB se cierra sola en cuanto la cola de microtareas se vacía sin
// operaciones pendientes, así que un await en el medio la haría fallar con
// TransactionInactiveError de forma intermitente y dificilísima de reproducir.
// Recibiendo solo `guardar`/`borrar` no hay manera de escribir ese bug.
export async function escribir(
  stores: Store[],
  trabajo: (op: Escritor) => void,
): Promise<void> {
  const base = await abrir();
  return new Promise((resolve, reject) => {
    const tx = base.transaction(stores, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new ErrorAlmacenLocal(tx.error?.message ?? "Falló el guardado local."));
    tx.onabort = () =>
      reject(new ErrorAlmacenLocal(tx.error?.message ?? "El guardado local se canceló."));

    try {
      trabajo({
        guardar: (store, valor) => void tx.objectStore(store).put(valor),
        borrar: (store, clave) => void tx.objectStore(store).delete(clave),
      });
    } catch (e) {
      tx.abort();
      reject(e);
    }
  });
}
