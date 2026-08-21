// Reloj controlable. Hace falta porque tres reglas de esta feature son PLAZOS,
// y probarlas con el reloj de verdad significa o esperar de verdad o no
// probarlas:
//
//   · la ventana de deshacer una entrega (MS_DESHACER, 8 s);
//   · la retención de un evento en la cola hasta que esa ventana vence;
//   · la expiración de la correlación de WhatsApp (72 h como máximo).
//
// Se reemplazan Date.now() y `new Date()` sin argumentos, que es lo único que
// el código de la app usa para preguntar la hora. `new Date(x)` con argumento
// sigue siendo el real: parsear un ISO guardado no tiene nada que ver con qué
// hora es ahora.
//
// No se tocan los timers (setTimeout y compañía). El código que importa acá no
// espera: compara marcas ISO contra "ahora" (ver leerCola en almacen.ts). Fingir
// timers además rompería el `await` de las transacciones de IndexedDB.

const DateReal = globalThis.Date;

let ahora = null;

/** Congela el reloj en `inicio` (ISO o ms). Devuelve la función para
 *  restaurarlo, para usar con t.after(). */
export function congelar(inicio) {
  ahora = typeof inicio === "number" ? inicio : DateReal.parse(inicio);
  if (!Number.isFinite(ahora)) {
    throw new Error(`congelar() recibió una fecha que no se puede parsear: ${inicio}`);
  }

  class DateFalso extends DateReal {
    constructor(...args) {
      // Solo el constructor SIN argumentos es "ahora". Con argumentos es
      // parsear o construir una fecha concreta, y eso no se toca.
      if (args.length === 0) super(ahora);
      else super(...args);
    }
    static now() {
      return ahora;
    }
  }

  globalThis.Date = DateFalso;
  return descongelar;
}

/** Adelanta el reloj. Acepta ms o un atajo legible: "8s", "30m", "72h". */
export function avanzar(cuanto) {
  if (ahora == null) throw new Error("avanzar() sin congelar() antes.");
  ahora += aMilisegundos(cuanto);
  return ahora;
}

/** La hora congelada, en ISO. Útil para armar la aserción esperada. */
export function ahoraISO() {
  if (ahora == null) throw new Error("ahoraISO() sin congelar() antes.");
  return new DateReal(ahora).toISOString();
}

export function descongelar() {
  globalThis.Date = DateReal;
  ahora = null;
}

const UNIDADES = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

function aMilisegundos(cuanto) {
  if (typeof cuanto === "number") return cuanto;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(String(cuanto).trim());
  if (!m) throw new Error(`No entiendo la duración "${cuanto}". Usa 500, "8s", "72h".`);
  return Number(m[1]) * UNIDADES[m[2]];
}
