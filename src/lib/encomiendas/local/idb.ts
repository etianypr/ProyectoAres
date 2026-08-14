"use client";

// Base local del módulo de encomiendas. Los pedidos (con nombre, teléfono y
// dirección del destinatario), la ruta del día y la cola de actividad
// pendiente de enviar viven en el TELÉFONO del chofer, no en el servidor —
// ver el comentario de cabecera de la migración 0026 para el por qué.
//
// IndexedDB y no localStorage: localStorage es sincrónico (traba la pantalla
// mientras el chofer maneja), guarda solo texto y tiene ~5 MB. Acá se guardan
// objetos con el trazado de la ruta, que en una jornada de 30 paradas son
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

const NOMBRE_BASE = "pucarani-encomiendas";

// Subir la versión SOLO al agregar o quitar un store (o un índice). Cambiar la
// forma de los objetos guardados dentro de un store no la necesita —IndexedDB
// no valida campos—, pero sí obliga a tolerar objetos viejos al leer.
const VERSION = 1;

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
} as const;

export type Store = (typeof STORES)[keyof typeof STORES];

/** Índice para listar los pendientes sin recorrer el historial completo. */
export const INDICE_PEDIDO_ESTADO = "por_estado";

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

    solicitud.onupgradeneeded = () => {
      const base = solicitud.result;
      if (!base.objectStoreNames.contains(STORES.pedidos)) {
        const pedidos = base.createObjectStore(STORES.pedidos, { keyPath: "id" });
        pedidos.createIndex(INDICE_PEDIDO_ESTADO, "estado");
      }
      if (!base.objectStoreNames.contains(STORES.rutas)) {
        base.createObjectStore(STORES.rutas, { keyPath: "fecha" });
      }
      if (!base.objectStoreNames.contains(STORES.cola)) {
        base.createObjectStore(STORES.cola, { keyPath: "id" });
      }
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

function pedir<T>(solicitud: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () =>
      reject(new ErrorAlmacenLocal(solicitud.error?.message ?? "Falló la lectura local."));
  });
}

export async function leerTodos<T>(store: Store): Promise<T[]> {
  const base = await abrir();
  const tx = base.transaction(store, "readonly");
  return pedir(tx.objectStore(store).getAll() as IDBRequest<T[]>);
}

/** Cuenta por índice sin traer las filas. Con cientos de pedidos entregados
 *  guardados como historial, contar los pendientes no debería leer todo. */
export async function contarPorIndice(
  store: Store,
  indice: string,
  valor: IDBValidKey,
): Promise<number> {
  const base = await abrir();
  const tx = base.transaction(store, "readonly");
  return pedir(tx.objectStore(store).index(indice).count(IDBKeyRange.only(valor)));
}

export async function leerUno<T>(store: Store, clave: string): Promise<T | null> {
  const base = await abrir();
  const tx = base.transaction(store, "readonly");
  const valor = await pedir(tx.objectStore(store).get(clave) as IDBRequest<T | undefined>);
  return valor ?? null;
}

export type Escritor = {
  guardar: (store: Store, valor: unknown) => void;
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
