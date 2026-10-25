// Doble de la Cloud API de Meta. Mismo patrón que ./supabase-client.mjs: un
// espía con las llamadas y una respuesta configurable.
//
// La diferencia es DÓNDE se engancha. El de Supabase reemplaza el módulo entero
// (ver el mapa DOBLES en ../loader.mjs) porque ese cliente arma consultas. Acá
// el adaptador (src/lib/whatsapp/meta.ts) hace un `fetch` y nada más, así que se
// sustituye el fetch global y el adaptador REAL corre completo: la URL que
// forma, los headers, el cuerpo de la plantilla y cómo interpreta un 429. Un
// doble a nivel de módulo no probaría nada de eso — justo lo que se rompe
// cuando Meta cambia algo.
//
// No hay red en ningún caso: si el adaptador pidiera un host que no es el de
// Meta, el doble lanza en vez de dejar salir la consulta.

import fixtures from "../fixtures/whatsapp.json" with { type: "json" };

export { fixtures };

const HOST_META = "graph.facebook.com";

export const meta = {
  /** Una entrada por consulta: { url, metodo, headers, cuerpo }. `cuerpo` ya
   *  viene parseado, que es como se quiere revisar en una aserción. */
  llamadas: [],

  /** Qué contesta Meta. Se puede reemplazar por una función para responder
   *  distinto en cada intento — así se prueba el backoff sin esperar de verdad:
   *  429 en el primero, 200 en el segundo. */
  responder: () => ({ estado: 200, cuerpo: fixtures.envio_ok }),

  /** La última respuesta útil, para no repetir el wamid a mano en cada prueba. */
  ultimoWamid() {
    const ok = this.llamadas.length;
    return ok ? `wamid.TEST${String(ok).padStart(4, "0")}` : null;
  },

  reset() {
    this.llamadas = [];
    this.responder = () => ({ estado: 200, cuerpo: fixtures.envio_ok });
  },
};

/** Contesta con esta secuencia, un elemento por intento; el último se repite.
 *  Es el atajo para probar reintentos: `respuestasEnOrden(429, 200)`. */
export function respuestasEnOrden(...respuestas) {
  let i = 0;
  meta.responder = () => {
    const r = respuestas[Math.min(i, respuestas.length - 1)];
    i++;
    return r;
  };
}

/** Atajo legible para armar una respuesta de error de Meta. */
export function errorMeta(estado, cuerpo = fixtures.envio_error_plantilla) {
  return { estado, cuerpo };
}

let fetchOriginal = null;

/** Sustituye el fetch global. Devuelve la función para restaurarlo, así una
 *  prueba puede usar t.after(instalarMeta()) y no dejar el doble puesto para
 *  las que siguen. */
export function instalarMeta() {
  if (!fetchOriginal) fetchOriginal = globalThis.fetch;

  globalThis.fetch = async (entrada, opciones = {}) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;

    // Cualquier otro host es un error de la prueba, no algo que haya que
    // tolerar: el adaptador no debería hablar con nadie más.
    if (!url.includes(HOST_META)) {
      throw new Error(`El doble de Meta recibió una consulta a otro host: ${url}`);
    }

    let cuerpo = null;
    try {
      cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
    } catch {
      // Cuerpo no-JSON: se guarda crudo. Que el adaptador manda JSON es
      // justamente una de las cosas que una prueba puede querer afirmar.
      cuerpo = opciones.body ?? null;
    }

    const llamada = {
      url,
      metodo: opciones.method ?? "GET",
      headers: opciones.headers ?? {},
      cuerpo,
    };
    meta.llamadas.push(llamada);

    const { estado = 200, cuerpo: respuesta = fixtures.envio_ok } =
      meta.responder(llamada) ?? {};

    return new Response(JSON.stringify(respuesta), {
      status: estado,
      headers: { "content-type": "application/json" },
    });
  };

  return desinstalarMeta;
}

export function desinstalarMeta() {
  if (fetchOriginal) globalThis.fetch = fetchOriginal;
  meta.reset();
}
